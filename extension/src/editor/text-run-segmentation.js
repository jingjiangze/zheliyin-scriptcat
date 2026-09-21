// =====================================================================
// 折立印名片套版助手 - Text Run Segmentation（Stage 10-B）
// ---------------------------------------------------------------------
// 纯数据/纯逻辑模块，不持有 DOM / Fabric / OCR 网络。职责：
//   1. detectMixedTypography(evidence)   Mixed vs Single vs Unknown（§八/§九）
//   2. detectRunCandidates(input)        从视觉 evidence 产生候选 Run 边界（§十/§十二/§十三）
//   3. scoreRunBoundary(candidate)       HIGH/MEDIUM/LOW 置信（§十五 conservative）
//   4. mergeStableRuns(runs)             相邻相同样式合并（§三十三）
//   5. planRuns(input)                   顶层编排：candidate → score → merge → conservation
// 铁律（Stage 10-B §七/§九/§十四/§十五/§三十四）：
//   - 禁止按字符数量/语言/语义直接切分（只能弱先验）；真实边界必须来自视觉 evidence；
//   - 阈值不拍脑袋：第一版使用 candidate threshold（conservative），不是 hard production split；
//   - 宁可不拆，不要错拆（MEDIUM/LOW → 保持 Single）；
//   - boundary 必须同时满足：局部字号差异 + 几何连续 + 文本顺序连续 + evidence confidence。
// 纯函数 node 可测；页面世界负责取 ImageInk 视觉证据后调用本模块。
// =====================================================================
"use strict";

function isFiniteNumber(v) { return typeof v === "number" && isFinite(v); }

// 保守候选阈值（第一版 candidate-only；可由 opts 覆盖用于真机标定）
var DEFAULTS = {
  mixedRatio: 0.65,        // 小/大 inkHeight 比值 ≤ 此值时视为 mixed candidate（与 boundary 同源）
  boundaryGap: 0.65,       // 相邻 span 高度比 ≤ 此值才构成边界候选（与 mixedRatio 一致，避免检测/拆分层阈值漂移）
  geometryTolX: 0.45,      // 几何连续：相邻 span 中心 x 位移 ≤ 跨度比例（保守放宽）
  minEvidence: 2,          // 至少 span 数
  highConfidence: 0.8,     // HIGH_CONFIDENCE 阈值（→ Split）
  mediumConfidence: 0.5,   // MEDIUM（→ 不拆）
  mergeTolerance: 0.08     // 相邻 run fontSize 相对差 ≤ 此值 → merge
};

// ---- 1. detectMixedTypography：Mixed / Single / Unknown ----
// input: { lineSpans: [{spanInkHeight, spanInkWidth?, start?, end?}], opts? }
// 输出: { status: "MIXED_OR_SINGLE"|"UNKNOWN", mixedCandidate, confidence, reason, minH, maxH, ratio }
function detectMixedTypography(input) {
  var o = input || {};
  var opts = Object.assign({}, DEFAULTS, o.opts || {});
  var spans = (o.lineSpans || []).filter(function (s) { return isFiniteNumber(s.spanInkHeight) && s.spanInkHeight > 0; });
  if (spans.length < opts.minEvidence) {
    return { status: "UNKNOWN", mixedCandidate: false, confidence: 0, reason: "insufficient-evidence", minH: null, maxH: null, ratio: null, spanCount: spans.length };
  }
  var hs = spans.map(function (s) { return s.spanInkHeight; });
  var minH = Math.min.apply(null, hs);
  var maxH = Math.max.apply(null, hs);
  var ratio = minH / maxH;
  var mixedCandidate = ratio <= opts.mixedRatio;
  // 双峰检测：若高度分布明显分离（低/高两簇均值差大），提升 confidence
  var sorted = hs.slice().sort(function (a, b) { return a - b; });
  var medianV = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  var lowCluster = sorted.filter(function (v) { return v <= medianV; });
  var highCluster = sorted.filter(function (v) { return v > medianV; });
  var lowMean = lowCluster.length ? lowCluster.reduce(function (a, b) { return a + b; }, 0) / lowCluster.length : 0;
  var highMean = highCluster.length ? highCluster.reduce(function (a, b) { return a + b; }, 0) / highCluster.length : 0;
  var clusterRatio = highMean > 0 ? lowMean / highMean : 1;
  var conf = 0;
  var reason = (mixedCandidate ? "mixed-candidate-" : "single") + (clusterRatio <= opts.mixedRatio ? "-bimodal" : "-unimodal");
  if (mixedCandidate) {
    conf = Math.round(Math.max(0, Math.min(1, (opts.mixedRatio - ratio) / opts.mixedRatio * 0.6 + 0.4 * (clusterRatio <= opts.mixedRatio ? 1 : 0.3))) * 100) / 100;
  } else {
    conf = Math.round(Math.max(0, Math.min(1, 1 - (opts.mixedRatio - ratio) / (1 - opts.mixedRatio) * 0.5)) * 100) / 100;
  }
  return {
    status: "MIXED_OR_SINGLE", mixedCandidate: mixedCandidate, confidence: conf, reason: reason,
    minH: minH, maxH: maxH, ratio: Math.round(ratio * 1000) / 1000,
    lowMean: Math.round(lowMean * 100) / 100, highMean: Math.round(highMean * 100) / 100,
    clusterRatio: Math.round(clusterRatio * 1000) / 1000, spanCount: spans.length
  };
}

// ---- 2. detectRunCandidates：从 span 级视觉 evidence 产生候选边界 ----
// input: {
//   nativeText,                                   // Native OCR final text（charStart/charEnd 的坐标系）
//   spans: [{ start, end, spanInkHeight,        // span 为连续字符段（行级 or 局部投影）
//             spanInkWidth, x, y }],              // x/y = span 视觉中心（image-space 或 canvas 均可，保持一致）
//   opts?
// }
// 输出: { runs: [{charStart,charEnd,spanInkHeight,...}], boundaryIndexes: [spanIdx], reason }
// 注意：这是 candidate（保守）；最终 Split 与否由 scoreRunBoundary 决定的 HIGH 决定。
function detectRunCandidates(input) {
  var o = input || {};
  var opts = Object.assign({}, DEFAULTS, o.opts || {});
  var nativeText = o.nativeText == null ? "" : String(o.nativeText);
  var spans = (o.spans || []).filter(function (s) {
    return s && isFiniteNumber(s.spanInkHeight) && s.spanInkHeight > 0 && isFiniteNumber(s.start) && isFiniteNumber(s.end);
  });
  if (spans.length < opts.minEvidence) {
    return { runs: [], boundaryIndexes: [], reason: "insufficient-evidence", candidate: false, spanCount: spans.length };
  }
  // 依据视觉证据识别"跳变"边界（允许局部小段微小波动，全局需 bimodal）
  var sorted = spans.slice().sort(function (a, b) { return a.start - b.start; });
  var boundaries = [];
  for (var i = 1; i < sorted.length; i += 1) {
    var prev = sorted[i - 1], cur = sorted[i];
    var hRatio = Math.min(prev.spanInkHeight, cur.spanInkHeight) / Math.max(prev.spanInkHeight, cur.spanInkHeight);
    var geomCont = true;
    if (isFiniteNumber(prev.x) && isFiniteNumber(cur.x) && isFiniteNumber(cur.spanInkWidth)) {
      var spanWRef = Math.max(cur.spanInkWidth, prev.spanInkWidth || cur.spanInkWidth);
      geomCont = Math.abs(cur.x - prev.x) <= spanWRef * (1 + opts.geometryTolX) + 40;
    }
    var orderCont = cur.start >= prev.end;
    if (hRatio <= opts.boundaryGap && geomCont && orderCont) boundaries.push({ idx: i, ratio: hRatio });
  }
  // 重建 runs（按边界把 spans 合并为 run 段 — 先按边界切分，段内连续 span 为一个 run 候选）
  var runs = [];
  var segStart = 0;
  var boundaryIndexes = boundaries.map(function (b) { return b.idx; });
  for (var k = 1; k <= sorted.length; k += 1) {
    var isBoundary = boundaries.some(function (b) { return b.idx === k; });
    if (k === sorted.length || isBoundary) {
      var seg = sorted.slice(segStart, k);
      if (seg.length) {
        var hs2 = seg.map(function (s) { return s.spanInkHeight; });
        var med = hs2.slice().sort(function (a, b) { return a - b; })[Math.floor(hs2.length / 2)];
        runs.push({
          charStart: seg[0].start,
          charEnd: seg[seg.length - 1].end,
          spanCount: seg.length,
          spanInkHeights: hs2,
          medianSpanInkHeight: med,
          x: seg.reduce(function (a, s) { return a + (isFiniteNumber(s.x) ? s.x : 0); }, 0) / seg.length,
          y: seg.reduce(function (a, s) { return a + (isFiniteNumber(s.y) ? s.y : 0); }, 0) / seg.length,
          spanInkWidth: seg.reduce(function (a, s) { return a + (isFiniteNumber(s.spanInkWidth) ? s.spanInkWidth : 0); }, 0)
        });
      }
      segStart = k;
    }
  }
  // text 切片（charStart/charEnd 直接来自 nativeText 坐标）
  runs.forEach(function (r) {
    r.charStart = Math.max(0, Math.min(nativeText.length, r.charStart));
    r.charEnd = Math.max(r.charStart, Math.min(nativeText.length, r.charEnd));
    r.text = nativeText.slice(r.charStart, r.charEnd);
  });
  var candidate = runs.length > 1;
  return {
    runs: runs, boundaryIndexes: boundaryIndexes, reason: candidate ? "visual-boundary" : "no-boundary",
    candidate: candidate, spanCount: sorted.length, nativeText: nativeText
  };
}

// ---- 3. scoreRunBoundary：候选 run 置信评分（conservative） ----
// input: { runs: [candidateRuns], nativeText, opts?, lineSpans? }
// 输出: { verdict: "SPLIT"|"SINGLE", confidence, level: "HIGH"/"MEDIUM"/"LOW", reasons[] }
function scoreRunBoundary(input) {
  var o = input || {};
  var opts = Object.assign({}, DEFAULTS, o.opts || {});
  var runs = (o.runs || []).filter(function (r) { return r && r.text != null; });
  if (!runs.length) return { verdict: "SINGLE", confidence: 0, level: "LOW", reasons: ["no-runs"] };
  if (runs.length === 1) return { verdict: "SINGLE", confidence: 1, level: "HIGH", reasons: ["single-run"] };
  var reasons = [];
  var total = 0.0;
  // 1) 字号差异（主证据，权重高）
  var hs = runs.map(function (r) { return r.medianSpanInkHeight || 0; }).filter(function (v) { return v > 0; });
  if (hs.length < 2) { return { verdict: "SINGLE", confidence: 0, level: "LOW", reasons: ["insufficient-height-evidence"] }; }
  var small = Math.min.apply(null, hs), large = Math.max.apply(null, hs);
  var ratio = small / large;
  var sizeScore = Math.max(0, Math.min(1, (1 - ratio) / (1 - opts.mixedRatio)));
  total += sizeScore * 0.5;
  reasons.push("size-ratio=" + Math.round(ratio * 1000) / 1000);
  // 2) 顺序连续（文本顺序必须连续；跨行 run 之间允许夹换行分隔符，见 applyOrderGapCheck）
  var sortedRuns = runs.slice().sort(function (a, b) { return a.charStart - b.charStart; });
  var nativeLen = (o.nativeText || "").length;
  var orderScore = 1;
  for (var i = 1; i < sortedRuns.length; i += 1) {
    var prevEnd = sortedRuns[i - 1].charEnd;
    if (sortedRuns[i].charStart !== prevEnd) {
      // 中间间隔必须全部是换行/行分隔符（跨行 run），才视为顺序连续；禁止有字符缝隙被静默吞掉
      var gapOk = false;
      if (prevEnd >= 0 && sortedRuns[i].charStart <= nativeLen && prevEnd < sortedRuns[i].charStart) {
        var gapText = String(o.nativeText || "").slice(prevEnd, sortedRuns[i].charStart);
        gapOk = gapText !== "" && /^[\n\r]+$/.test(gapText);
      }
      if (!gapOk) { orderScore = 0; reasons.push("order-gap"); break; }
    }
  }
  total += orderScore * 0.2;
  // 3) 几何连续（相邻 run 中心距 vs run 尺寸合理）
  var geomScore = 1;
  for (var j = 1; j < sortedRuns.length; j += 1) {
    var p = sortedRuns[j - 1], c = sortedRuns[j];
    if (isFiniteNumber(p.x) && isFiniteNumber(c.x) && isFiniteNumber(c.spanInkWidth)) {
      var ref = Math.max(c.spanInkWidth, p.spanInkWidth || c.spanInkWidth);
      if (ref > 0 && Math.abs(c.x - p.x) > ref * (2 + opts.geometryTolX)) { geomScore = Math.min(geomScore, 0.5); reasons.push("geometry-far"); }
    }
  }
  total += geomScore * 0.15;
  // 4) mixed 先验（detectMixedTypography 输出若提供）
  if (isFiniteNumber(o.mixedConfidence)) total += o.mixedConfidence * 0.15;
  else total += (sizeScore > 0.5 ? 0.15 : 0);
  var confidence = Math.round(total * 100) / 100;
  var ver = confidence >= opts.highConfidence ? "SPLIT" : "SINGLE";
  var level = confidence >= opts.highConfidence ? "HIGH" : (confidence >= opts.mediumConfidence ? "MEDIUM" : "LOW");
  reasons.push("score=" + confidence + " level=" + level);
  return { verdict: ver, confidence: confidence, level: level, reasons: reasons };
}

// ---- 4. mergeStableRuns：相邻相同样式合并（§三十三） ----
// input: { runs: [{charStart,charEnd,text,fontSize?,medianSpanInkHeight?}], opts? }
// 输出: merged runs（charStart/charEnd/text 重排；不可跨"不同 style"合并）
function mergeStableRuns(input) {
  var o = input || {};
  var opts = Object.assign({}, DEFAULTS, o.opts || {});
  var runs = (o.runs || []).slice().sort(function (a, b) { return a.charStart - b.charStart; });
  if (!runs.length) return runs;
  var styleKey = function (r) { return String((r.textStyleKey != null) ? r.textStyleKey : (r.fontSize != null ? "fs:" + r.fontSize : "ink:" + (r.medianSpanInkHeight != null ? Math.round(r.medianSpanInkHeight) : "?"))); };
  var out = [Object.assign({}, runs[0])];
  for (var i = 1; i < runs.length; i += 1) {
    var last = out[out.length - 1];
    var cur = runs[i];
    var same = styleKey(last) === styleKey(cur);
    if (same && cur.charStart === last.charEnd) {
      last.charEnd = cur.charEnd;
      last.text = String(last.text) + String(cur.text);
      last.spanInkHeights = (last.spanInkHeights || []).concat(cur.spanInkHeights || []);
      if (isFiniteNumber(cur.medianSpanInkHeight)) last.medianSpanInkHeight = cur.medianSpanInkHeight;
    } else {
      out.push(Object.assign({}, cur));
    }
  }
  return out;
}

// ---- 5. planRuns：顶层编排（detect → score → merge → conservation 检查） ----
// input: { nativeText, spans, geometry?, opts? }  （geometry = 父 block 几何，供 union 对比）
// 输出: { result: "FULL_RUN_SPLIT" | "SINGLE_BLOCK_FALLBACK", runs, textConservation, detection, score }
function planRuns(input) {
  var o = input || {};
  var opts = Object.assign({}, DEFAULTS, o.opts || {});
  var nativeText = o.nativeText == null ? "" : String(o.nativeText);
  var detect = detectMixedTypography({ lineSpans: (o.spans || []), opts: opts });
  var cand = detectRunCandidates({ nativeText: nativeText, spans: o.spans || [], opts: opts });
  var score = scoreRunBoundary({ runs: cand.runs, nativeText: nativeText, mixedConfidence: detect.confidence, opts: opts });
  var result = "SINGLE_BLOCK_FALLBACK";
  var runs = [];
  if (score.verdict === "SPLIT" && cand.runs.length > 1) {
    var merged = mergeStableRuns({ runs: cand.runs, opts: opts });
    var cons = textConservationLocal(merged, nativeText);
    if (cons.ok && merged.length > 1) {
      result = "FULL_RUN_SPLIT";
      runs = merged;
    }
  }
  return {
    result: result, detection: detect, candidate: cand.runs, score: score,
    runs: runs, nativeText: nativeText, fallbackReason: result === "SINGLE_BLOCK_FALLBACK" ? "conservative-gate" : null
  };
}
function textConservationLocal(runs, nativeText) {
  var sorted = runs.slice().sort(function (a, b) { return a.charStart - b.charStart; });
  var parts = [];
  var gapOk = true;
  var cursor = 0;
  var len = String(nativeText).length;
  sorted.forEach(function (r, i) {
    if (i === 0) {
      if (r.charStart > 0) {
        var lead = String(nativeText).slice(0, r.charStart);
        if (lead !== "" && !/^[\n\r]+$/.test(lead)) gapOk = false;
        else parts.push(lead);
      }
      parts.push(r.text);
      cursor = r.charEnd;
      return;
    }
    if (r.charStart > cursor) {
      var mid = String(nativeText).slice(cursor, r.charStart);
      parts.push(mid); // mid 应为纯换行；非换行则 conservation 失败（由 joined 对比兜底）
      if (mid !== "" && !/^[\n\r]+$/.test(mid)) gapOk = false;
    }
    parts.push(r.text);
    cursor = r.charEnd;
  });
  if (cursor < len) {
    var tail = String(nativeText).slice(cursor);
    parts.push(tail);
    if (tail !== "" && !/^[\n\r]+$/.test(tail)) gapOk = false;
  }
  var joined = parts.join("");
  var ok = joined === String(nativeText) && gapOk;
  return { ok: ok, joined: joined, expected: String(nativeText) };
}

// ---- 导出（node + page-world 双端兼容）----
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DEFAULTS: DEFAULTS,
    detectMixedTypography: detectMixedTypography,
    detectRunCandidates: detectRunCandidates,
    scoreRunBoundary: scoreRunBoundary,
    mergeStableRuns: mergeStableRuns,
    planRuns: planRuns
  };
}