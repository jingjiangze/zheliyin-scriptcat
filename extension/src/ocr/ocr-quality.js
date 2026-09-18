// =====================================================================
// 折立印名片套版助手 - OCR 候选质量门（Stage 7.3，OCR 稳定化 §一/§二）
// ---------------------------------------------------------------------
// 纯决策函数：Provider 返回的候选在进入后续 pipeline（unify → TextBlock →
// Geometry → Native Text）之前必须先通过质量检查。Cloud Primary 的 FAIL
// 结果用于触发 Local FALLBACK（与 fallback-policy 配合）；Local 的 FAIL
// 结果为终态错误（本地已是换路末端）。
// 检查项（除非另有注明，不依赖 provider 能力，谨慎判定）：
//   empty-text       空文本
//   invalid-bbox     bbox 字段非法 / 宽高 <= 0
//   out-of-bounds    bbox 明显越出图片边界（> 5% 容差，仅当有 imageSize）
//   low-confidence   有 confidence 时低于阈值 0.5（Baidu general 无 confidence，不误伤）
//   abnormal-length  单条文本超长（> 200 字符 → 明显异常）
//   abnormal-count   整批条数超限（> 200 → 明显异常）
// 判定：
//   无候选                     → FAIL "empty-result"
//   全部被剔除                 → FAIL（主导剔除原因：low-confidence / invalid-result）
//   有效占比 < 50%             → FAIL "invalid-result"（部分失败也换路，避免垃圾进画布）
//   否则                       → PASS（保留 kept，dropped 作为诊断）
// 输出：{ok, reasonCode, reason, total, kept, dropped:[{index, reason, text}]}
// reasonCode 与 fallback-policy 的 reason 枚举兼容（timeout/http-error 由调用方分类）。
// 约束：不发起网络 / 不读取画布；纯函数可单测（与 fallback-policy 同模式）。
// =====================================================================
"use strict";

var LOW_CONFIDENCE = 0.5;   // 低于此置信度视为不可信（仅 provider 提供 confidence 时生效）
var MAX_TEXT_LENGTH = 200;  // 单条文本超长 → 明显异常
var MAX_LINES = 200;        // 整批条数上限（防垃圾/重复返回）
var KEEP_RATIO = 0.5;       // 有效占比阈值：低于则 FAIL
var BOUND_TOL = 0.05;       // bbox 越界容差（相对图片宽/高）

function isFiniteNum(v) {
  return typeof v === "number" && isFinite(v);
}

// bbox 归一化（兼容 {x0,y0,x1,y1} 与 {x,y,width,height}）
function normQBox(b) {
  if (!b) return null;
  if (isFiniteNum(b.x0) && isFiniteNum(b.y0) && isFiniteNum(b.x1) && isFiniteNum(b.y1)) {
    var x = Math.min(b.x0, b.x1), y = Math.min(b.y0, b.y1);
    var w = Math.abs(b.x1 - b.x0), h = Math.abs(b.y1 - b.y0);
    return (w > 0 && h > 0) ? { x: x, y: y, width: w, height: h } : null;
  }
  if (isFiniteNum(b.x) && isFiniteNum(b.y) && isFiniteNum(b.width) && isFiniteNum(b.height)) {
    return (b.width > 0 && b.height > 0) ? { x: b.x, y: b.y, width: b.width, height: b.height } : null;
  }
  return null;
}

// candidates: OCRCandidate[]（{text, bbox, confidence?, imageSize?}）
// meta:       {imageSize?:{width,height}} 或 {width,height}（可选，容忍缺省）
function assessOcrCandidates(candidates, meta) {
  var list = Array.isArray(candidates) ? candidates : [];
  if (!list.length) return { ok: false, reasonCode: "empty-result", reason: "无识别候选", total: 0, kept: [], dropped: [] };
  if (list.length > MAX_LINES) return { ok: false, reasonCode: "abnormal", reason: "候选条数异常(" + list.length + " > " + MAX_LINES + ")", total: list.length, kept: [], dropped: [] };
  var img = null;
  if (meta) {
    if (meta.imageSize && isFiniteNum(meta.imageSize.width) && isFiniteNum(meta.imageSize.height)) img = meta.imageSize;
    else if (isFiniteNum(meta.width) && isFiniteNum(meta.height)) img = { width: meta.width, height: meta.height };
  }
  if (!img && list[0] && list[0].imageSize && isFiniteNum(list[0].imageSize.width) && isFiniteNum(list[0].imageSize.height)) img = list[0].imageSize;
  var kept = [], dropped = [];
  list.forEach(function (c, i) {
    var text = String((c && c.text) != null ? c.text : "").trim();
    var b = (c && c.bbox) ? normQBox(c.bbox) : null;
    var short = text.slice(0, 16);
    if (!text) { dropped.push({ index: i, reason: "empty-text", text: "" }); return; }
    if (text.length > MAX_TEXT_LENGTH) { dropped.push({ index: i, reason: "abnormal-length", text: short }); return; }
    if (!b) { dropped.push({ index: i, reason: "invalid-bbox", text: short }); return; }
    if (img && (b.x + b.width < -img.width * BOUND_TOL || b.x > img.width * (1 + BOUND_TOL) ||
                b.y + b.height < -img.height * BOUND_TOL || b.y > img.height * (1 + BOUND_TOL))) {
      dropped.push({ index: i, reason: "out-of-bounds", text: short }); return;
    }
    if (typeof c.confidence === "number" && isFinite(c.confidence) && c.confidence < LOW_CONFIDENCE) {
      dropped.push({ index: i, reason: "low-confidence", text: short }); return;
    }
    kept.push(c);
  });
  // 主导剔除原因：低置信度剔除占多数 → "low-confidence"，否则归 "invalid-result"
  function dominantDropReason(dList) {
    var counts = {};
    dList.forEach(function (d) { counts[d.reason] = (counts[d.reason] || 0) + 1; });
    return (counts["low-confidence"] && counts["low-confidence"] > dList.length / 2) ? "low-confidence" : "invalid-result";
  }
  if (!kept.length) {
    return { ok: false, reasonCode: dominantDropReason(dropped), reason: "全部候选被质量门剔除(" + dropped.map(function (d) { return d.reason; }).join("|") + ")", total: list.length, kept: [], dropped: dropped };
  }
  var ratio = kept.length / list.length;
  if (ratio < KEEP_RATIO) {
    return { ok: false, reasonCode: dominantDropReason(dropped), reason: "有效占比不足(" + kept.length + "/" + list.length + ")", total: list.length, kept: [], dropped: dropped };
  }
  return { ok: true, reasonCode: null, reason: null, total: list.length, kept: kept, dropped: dropped };
}

// =====================================================================
// Stage 7.8 §三十二/§三十三：六维质量门（分级输出）
// bundleOcrQuality(candidates, meta, opts) -> {
//   provider, textQuality, blockQuality, bboxQuality, sizeQuality,
//   symbolQuality, mergeQuality, overall, reasonCode, total, imageSize
// }
// 每个维度 {status: "PASS"|"FAIL"|"WARN"|"UNKNOWN", reason?, ...counts}。
// overall = 任一维 FAIL → FAIL（reasonCode=首个失败维原因）；有 WARN 无 FAIL → WARN；否则 PASS。
// UNKNOWN（如缺 imageSize 的 sizeQuality）不判 FAIL（保持诚实不误杀）。
// assessOcrCandidates 保持兼容（运行时仍做第一道门），bundle 为完整分级诊断。
// 约束：纯函数；sanitize 依赖注入（opts.sanitize 或全局 sanitizeOcrText，@require 同作用域）。
// =====================================================================

function medianOf(values) {
  var arr = values.filter(isFiniteNum).sort(function (a, b) { return a - b; });
  var n = arr.length;
  if (!n) return null;
  return n % 2 ? arr[(n - 1) / 2] : (arr[n / 2 - 1] + arr[n / 2]) / 2;
}

function dimPASS(extra) { return Object.assign({ status: "PASS" }, extra || {}); }
function dimFAIL(reason, extra) { return Object.assign({ status: "FAIL", reason: reason }, extra || {}); }
function dimWARN(reason, extra) { return Object.assign({ status: "WARN", reason: reason }, extra || {}); }
function dimUNKNOWN(reason, extra) { return Object.assign({ status: "UNKNOWN", reason: reason }, extra || {}); }

function rectArea(b) {
  return b ? b.width * b.height : 0;
}
function rectInter(a, b) {
  if (!a || !b) return 0;
  var x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
  var x1 = Math.min(a.x + a.width, b.x + b.width), y1 = Math.min(a.y + a.height, b.y + b.height);
  var w = x1 - x0, h = y1 - y0;
  return (w > 0 && h > 0) ? w * h : 0;
}

function bundleOcrQuality(candidates, meta, opts) {
  var o = opts || {};
  var list = Array.isArray(candidates) ? candidates : [];
  var m = meta || {};
  var img = null;
  if (m.imageSize && isFiniteNum(m.imageSize.width) && isFiniteNum(m.imageSize.height)) img = m.imageSize;
  else if (isFiniteNum(m.width) && isFiniteNum(m.height)) img = { width: m.width, height: m.height };
  if (!img && list[0] && list[0].imageSize && isFiniteNum(list[0].imageSize.width) && isFiniteNum(list[0].imageSize.height)) img = list[0].imageSize;
  var sanitize = o.sanitize ? o.sanitize : (typeof sanitizeOcrText === "function" ? sanitizeOcrText : null);
  var provider = m.provider || (list[0] && (list[0].sourceProvider || null)) || null;
  if (!list.length) {
    return { provider: provider, textQuality: dimFAIL("empty-result"), blockQuality: dimFAIL("empty-result"), bboxQuality: dimFAIL("empty-result"), sizeQuality: dimFAIL("empty-result"), symbolQuality: dimFAIL("empty-result"), mergeQuality: dimFAIL("empty-result"), overall: "FAIL", reasonCode: "empty-result", total: 0, imageSize: img };
  }

  // ---- textQuality：空文本 / 超长（§三十三 文字质量）----
  var textEmpty = 0, textLong = 0;
  list.forEach(function (c) {
    var txt = String((c && c.text) != null ? c.text : "").trim();
    if (!txt) textEmpty += 1;
    else if (txt.length > MAX_TEXT_LENGTH) textLong += 1;
  });
  var textQuality = (textEmpty || textLong)
    ? dimFAIL("text-invalid", { invalid: textEmpty + textLong, empty: textEmpty, long: textLong })
    : dimPASS();

  // ---- bboxQuality：非法 / 越界（§三十三 bbox / 页面尺寸）----
  var bboxInvalid = 0, bboxOob = 0;
  list.forEach(function (c) {
    var b = c && c.bbox ? normQBox(c.bbox) : null;
    if (!b) { bboxInvalid += 1; return; }
    if (img && (b.x + b.width < -img.width * BOUND_TOL || b.x > img.width * (1 + BOUND_TOL) ||
                b.y + b.height < -img.height * BOUND_TOL || b.y > img.height * (1 + BOUND_TOL))) bboxOob += 1;
  });
  var bboxQuality = (bboxInvalid || bboxOob)
    ? dimFAIL("bbox-invalid", { invalid: bboxInvalid, outOfBounds: bboxOob })
    : (img ? dimPASS() : dimUNKNOWN("no-image-size"));

  // ---- sizeQuality：字号合理性（§十九 归一化 + 页面中位比值，§三十三 size）----
  var heights = list.map(function (c) { return c && c.bbox ? c.bbox.height : null; }).filter(isFiniteNum);
  var medH = medianOf(heights);
  var sizeQuality;
  if (!img) {
    sizeQuality = dimUNKNOWN("no-image-size");
  } else {
    var maxNorm = heights.reduce(function (mx, h) { return Math.max(mx, h / img.height); }, 0);
    var ratioSpread = (medH != null && medH > 0) ? heights.reduce(function (mx, h) { return Math.max(mx, h / medH); }, 0) : null;
    if (maxNorm > 0.6) sizeQuality = dimFAIL("size-anomaly-huge", { maxNormalizedHeight: Math.round(maxNorm * 100) / 100 });
    else if (ratioSpread != null && heights.length >= 2 && ratioSpread > 4) sizeQuality = dimFAIL("size-anomaly-spread", { maxHeightRatio: Math.round(ratioSpread * 100) / 100 });
    else sizeQuality = dimPASS({ maxNormalizedHeight: Math.round(maxNorm * 100) / 100, maxHeightRatio: ratioSpread != null ? Math.round(ratioSpread * 100) / 100 : null });
  }

  // ---- blockQuality：异常少 / 大规模重叠（§三十三 block）----
  var blockQuality;
  var tooFew = false;
  if (img && list.length === 1) {
    var b0 = normQBox(list[0].bbox);
    if (b0 && rectArea(b0) > 0.6 * img.width * img.height) tooFew = true;
  }
  var heavyPairs = 0, totalPairs = list.length * (list.length - 1) / 2;
  for (var i = 0; i < list.length; i += 1) {
    for (var j = i + 1; j < list.length; j += 1) {
      var ai = normQBox(list[i].bbox), aj = normQBox(list[j].bbox);
      if (!ai || !aj) continue;
      var inter = rectInter(ai, aj);
      var minArea = Math.min(rectArea(ai), rectArea(aj));
      if (minArea > 0 && inter / minArea > 0.5) heavyPairs += 1;
    }
  }
  if (tooFew) blockQuality = dimFAIL("too-few-blocks", { total: list.length });
  else if (totalPairs && heavyPairs / totalPairs >= 0.2) blockQuality = dimFAIL("large-overlap", { heavyPairs: heavyPairs, totalPairs: totalPairs });
  else if (heavyPairs > 0) blockQuality = dimWARN("overlap-observed", { heavyPairs: heavyPairs });
  else blockQuality = dimPASS();

  // ---- symbolQuality：BLOCKED 符号检测（§三十三 special character，复用 sanitizer）----
  var symbolQuality;
  if (!sanitize) {
    symbolQuality = dimUNKNOWN("sanitizer-missing");
  } else {
    var blockedList = [];
    list.forEach(function (c) {
      var txt = String((c && c.text) != null ? c.text : "");
      if (!txt) return;
      var sr = sanitize(txt);
      if (sr && Array.isArray(sr.blocked) && sr.blocked.length) {
        sr.blocked.forEach(function (b) {
          if (blockedList.length >= 8) return;
          var key = b.char + "|" + b.reason;
          if (blockedList.some(function (x) { return x.key === key; })) return;
          blockedList.push({ key: key, char: b.char, reason: b.reason, sample: txt.slice(0, 12) });
        });
      }
    });
    symbolQuality = blockedList.length ? dimFAIL("blocked-symbol", { blockedSymbols: blockedList }) : dimPASS();
  }

  // ---- mergeQuality：潜在 merge 冲突（同排 y 重叠高但字高比大 → normalizer 应拆分，§二十/§二十二）----
  var mergeConflict = 0;
  for (var p = 0; p < list.length; p += 1) {
    for (var q = p + 1; q < list.length; q += 1) {
      var bp = normQBox(list[p].bbox), bq = normQBox(list[q].bbox);
      if (!bp || !bq) continue;
      var minH = Math.min(bp.height, bq.height);
      if (minH <= 0) continue;
      var yInter = Math.min(bp.y + bp.height, bq.y + bq.height) - Math.max(bp.y, bq.y);
      var sizeR = Math.max(bp.height, bq.height) / minH;
      if (yInter > 0.5 * minH && sizeR > 1.5) mergeConflict += 1;
    }
  }
  var mergeQuality = mergeConflict ? dimWARN("merge-conflict-candidates", { conflicts: mergeConflict }) : dimPASS();

  var dims = { textQuality: textQuality, blockQuality: blockQuality, bboxQuality: bboxQuality, sizeQuality: sizeQuality, symbolQuality: symbolQuality, mergeQuality: mergeQuality };
  var fails = Object.keys(dims).filter(function (k) { return dims[k].status === "FAIL"; });
  var warns = Object.keys(dims).filter(function (k) { return dims[k].status === "WARN"; });
  var overall = fails.length ? "FAIL" : (warns.length ? "WARN" : "PASS");
  var reasonCode = null;
  if (fails.length) {
    var first = dims[fails[0]];
    reasonCode = first && first.reason ? String(first.reason) : "invalid-result";
  } else if (warns.length) {
    reasonCode = "WARN";
  }
  return Object.assign({ provider: provider, mergeQuality: mergeQuality, overall: overall, reasonCode: reasonCode, total: list.length, imageSize: img }, dims);
}

if (typeof module !== "undefined" && module.exports) module.exports = { assessOcrCandidates, bundleOcrQuality, normQBox, LOW_CONFIDENCE, MAX_TEXT_LENGTH, MAX_LINES, KEEP_RATIO };