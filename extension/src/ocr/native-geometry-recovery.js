// =====================================================================
// 折立印名片套版助手 - Native Geometry Recovery（OCR-P1, §Recovery 顺序）
// ---------------------------------------------------------------------
// 定位：Native Truth OK、但 Completeness Gate 仍有 unmatchedNative 时，
//   本模块沿搜索链为「有 Native 文本、暂无可靠 geometry」的行恢复 geometry：
//      BAIDU LINE → BAIDU WORD → LOCAL → NATIVE ANCHOR → IMAGE INK
//   （Commit 2 实现 BAIDU_LINE / BAIDU_WORD；Commit 3b 实现 LOCAL sidecar；
//    NATIVE_ANCHOR / IMAGE_INK 为 Commit 4 预留插槽，未实现前一律记入
//    unresolved，绝不猜测）。
// 硬规则（任务书 §Recovery + OCR-P0.3 既有约束）：
//   - Geometry Provider 只提供 position/bbox/rotation/line grouping；
//     text 仅用于匹配因子，绝不成为 textbox.text（最终 text 恒来自 Native）。
//   - 禁止固定间距 / 固定 offset / 居中 / 随机 / global multiplier 猜测。
//   - 每条恢复必须通过硬门：bbox 有效、image-space 合法（给定 imageBounds
//     时）、不与已占用几何异常重叠、高宽合理、行结构可解释、evidence score
//     达标、有明确 source、诊断可解释；任一不过 → rejected（带原因，可审计）。
// 输出 { recovered, unresolved, rejected, diagnostics }：
//   recovered[i] = { native, geometry, source, method, score, evidence[] }
//   其中 geometry = { bbox, source, parts?, synthetic? }；永不写 text。
// 纯函数，node 可测；本文件自包含（不 require 其它模块，避免 userscript
//   注入环境缺失 require 导致崩溃；底层文本/几何工具内嵌最小实现）。
// =====================================================================
"use strict";

// ---- 内部最小工具（与 native-geometry-aligner 同语义，自包含）----
function normKey(s) {
  if (s == null) return "";
  return String(s).toLowerCase()
    .replace(/[\s\u3000\u00a0]+/g, "")
    .replace(/[·•．。，,、；;'"“”‘’（）()【】\[\]《》<>:：-]/g, "");
}

function scriptType(s) {
  var t = String(s == null ? "" : s);
  var cjk = 0, latin = 0, digit = 0, i, c;
  for (i = 0; i < t.length; i += 1) {
    c = t.charCodeAt(i);
    if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3040 && c <= 0x30ff)) cjk += 1;
    else if (c >= 0x30 && c <= 0x39) digit += 1;
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) latin += 1;
    else if (c > 0x20 && c !== 0x2e && c !== 0x3a && c !== 0x2d && c !== 0x40 && c !== 0x2f) latin += 1;
  }
  if (!t.trim()) return "empty";
  if (cjk && !latin && !digit) return "cjk";
  if (latin && !cjk && !digit) return "latin";
  if (digit && !cjk && !latin) return "digit";
  return "mixed";
}

// 0..1：1.0 规范化完全一致；0.8 一方包含另一方（长侧>=3）；否则字符重叠率。
function textSimilarity(a, b) {
  var ka = normKey(a), kb = normKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  var longer = ka.length >= kb.length ? ka : kb;
  var shorter = ka.length >= kb.length ? kb : ka;
  if (shorter.length >= 3 && longer.indexOf(shorter) >= 0) return 0.8;
  var set = {}, hit = 0, i;
  for (i = 0; i < longer.length; i += 1) set[longer[i]] = 1;
  for (i = 0; i < shorter.length; i += 1) if (set[shorter[i]]) hit += 1;
  return hit / longer.length;
}

function boxCenter(b) {
  if (!b) return { x: 0, y: 0 };
  var x = typeof b.x === "number" ? b.x : (typeof b.x0 === "number" ? b.x0 : 0);
  var y = typeof b.y === "number" ? b.y : (typeof b.y0 === "number" ? b.y0 : 0);
  var w = typeof b.width === "number" ? b.width : ((typeof b.x1 === "number" && typeof b.x0 === "number") ? Math.abs(b.x1 - b.x0) : 0);
  var h = typeof b.height === "number" ? b.height : ((typeof b.y1 === "number" && typeof b.y0 === "number") ? Math.abs(b.y1 - b.y0) : 0);
  return { x: x + w / 2, y: y + h / 2 };
}

function unionBox(boxes) {
  var xs = [], ys = [], i, b;
  for (i = 0; i < (boxes || []).length; i += 1) {
    b = boxes[i];
    if (!b) continue;
    var x = typeof b.x === "number" ? b.x : b.x0;
    var y = typeof b.y === "number" ? b.y : b.y0;
    var x2 = typeof b.width === "number" ? x + b.width : (typeof b.x1 === "number" ? b.x1 : x);
    var y2 = typeof b.height === "number" ? y + b.height : (typeof b.y1 === "number" ? b.y1 : y);
    if (typeof x === "number") xs.push(x, x2);
    if (typeof y === "number") ys.push(y, y2);
  }
  if (!xs.length || !ys.length) return null;
  return {
    x: Math.min.apply(null, xs), y: Math.min.apply(null, ys),
    width: Math.max.apply(null, xs) - Math.min.apply(null, xs),
    height: Math.max.apply(null, ys) - Math.min.apply(null, ys),
    union: true
  };
}

// 任意 bbox（x/y/width/height 或 x0/y0/x1/y1）→ 统一 rect；无效返回 null。
function bboxToRect(b) {
  if (!b) return null;
  var x = typeof b.x === "number" ? b.x : b.x0;
  var y = typeof b.y === "number" ? b.y : b.y0;
  var x2 = typeof b.width === "number" ? x + b.width : (typeof b.x1 === "number" ? b.x1 : x);
  var y2 = typeof b.height === "number" ? y + b.height : (typeof b.y1 === "number" ? b.y1 : y);
  if (!(x2 > x && y2 > y)) return null;
  return { x: x, y: y, width: x2 - x, height: y2 - y };
}

function isBboxValid(b) { return !!bboxToRect(b); }

function rectsIntersectArea(a, b) {
  var ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  var iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return ix * iy;
}

// 交集 / 较小面积 —— 用于「与已占用几何异常重叠」判定。
function overlapAreaRatio(a, b) {
  var ia = rectsIntersectArea(a, b);
  if (!ia) return 0;
  var minArea = Math.min(a.width * a.height, b.width * b.height);
  return minArea > 0 ? ia / minArea : 0;
}

// bbox 主体被 imageBounds 覆盖的比例（image-space 合法性，静态近似检查；
// 生产仍以 image-containment.isQuadInsideImage 做最终 containment 门禁）。
function containmentIn(r, bounds) {
  if (!bounds) return 1;
  var ix = Math.max(0, Math.min(r.x + r.width, bounds.x + bounds.width) - Math.max(r.x, bounds.x));
  var iy = Math.max(0, Math.min(r.y + r.height, bounds.y + bounds.height) - Math.max(r.y, bounds.y));
  var area = (r.width * r.height) || 0;
  return area > 0 ? (ix * iy) / area : 0;
}

// ---- 从 line 候选展开 word 子候选（wordBoxes / words）----
// 只取几何 + 匹配用 text；lineIndex 透传（行结构可解释的依据之一）。
function extractWords(lines) {
  var out = [];
  (Array.isArray(lines) ? lines : []).forEach(function (lc) {
    if (!lc || !lc.bbox) return;
    var ws = lc.wordBoxes || lc.words || null;
    if (!Array.isArray(ws)) return;
    ws.forEach(function (w) {
      if (!w || !w.bbox || (w.text == null && lc.text == null)) return;
      out.push({
        text: w.text != null ? String(w.text) : String(lc.text || ""),
        bbox: w.bbox,
        lineIndex: lc.lineIndex != null ? lc.lineIndex : null,
        sourceProvider: lc.sourceProvider || "BAIDU"
      });
    });
  });
  return out;
}

// 词文本与 native 规范化文本有实质字符重叠才纳入匹配（抗噪声词）。
function isCandidateWord(nk, wk) {
  if (!nk || !wk) return false;
  if (wk.length > nk.length) return false;
  if (nk.indexOf(wk) >= 0) return true;
  var hit = 0, i;
  for (i = 0; i < wk.length; i += 1) if (nk.indexOf(wk[i]) >= 0) hit += 1;
  return hit / wk.length >= 0.6;
}

// 沿 reading order（x 非递减）找最小连续窗口，其规范化拼接 === nk。
function orderedCover(sortedWords, nk) {
  var i, j, acc;
  for (i = 0; i < sortedWords.length; i += 1) {
    acc = "";
    for (j = i; j < sortedWords.length; j += 1) {
      var wk = normKey(sortedWords[j].text);
      if (!wk) continue;
      acc += wk;
      if (acc === nk) return sortedWords.slice(i, j + 1);
      if (nk.indexOf(acc) < 0) break;
    }
  }
  return null;
}

// 词候选按行分组：优先 lineIndex；无主键时按 y 容差聚类（行结构可解释）。
function groupRows(cands, rowTol) {
  var byLine = {}, noLine = [], rows = [];
  cands.forEach(function (w) {
    if (w.lineIndex != null) { (byLine[w.lineIndex] = byLine[w.lineIndex] || []).push(w); }
    else noLine.push(w);
  });
  Object.keys(byLine).forEach(function (k) { rows.push(byLine[k]); });
  var sorted = noLine.slice().sort(function (a, b) { return boxCenter(a.bbox).y - boxCenter(b.bbox).y; });
  sorted.forEach(function (w) {
    var cy = boxCenter(w.bbox).y;
    for (var ri = 0; ri < rows.length; ri += 1) {
      var near = rows[ri].some(function (r) { return Math.abs(boxCenter(r.bbox).y - cy) <= rowTol; });
      if (near) { rows[ri].push(w); return; }
    }
    rows.push([w]);
  });
  return rows;
}

// ---- Recovery 源标识 ----
var SOURCE_BAIDU_LINE = "BAIDU_LINE";
var SOURCE_BAIDU_WORD = "BAIDU_WORD";
// 后续 Commit 预留（未实现前不会产出，仅作审计分类符号）
var SOURCE_LOCAL = "LOCAL";
var SOURCE_NATIVE_ANCHOR = "NATIVE_ANCHOR";
var SOURCE_IMAGE_INK = "IMAGE_INK";

// ---- 主入口 ----
// unmatchedNative: [{ id?, rawText, order? }]（aligner 一轮后仍未匹配的 Native 行）
// ctx: {
//   lineCandidates:   [{ text?, bbox, words?/wordBoxes?, lineIndex?, sourceProvider? }]  剩余 line 级候选
//   wordCandidates:   [{ text, bbox, lineIndex?, sourceProvider? }]                       额外 word 级候选（可选）
//   occupiedGeometries:[ { bbox } ]                                                       已被消费的 geometry（禁重复占用）
//   imageBounds:      { x, y, width, height } | null                                      image-pixel 系
//   thresholds:       { minSim, overlapMax, containmentMin, rowTol, ... } | null
// }
// out: { recovered, unresolved, rejected, diagnostics }
function recoverNativeGeometry(unmatchedNative, ctx) {
  ctx = ctx || {};
  var ns = (Array.isArray(unmatchedNative) ? unmatchedNative : []).slice();
  var lineCands = (Array.isArray(ctx.lineCandidates) ? ctx.lineCandidates : []).slice();
  var wordCands = extractWords(lineCands).concat(Array.isArray(ctx.wordCandidates) ? ctx.wordCandidates : []);
  var localCands = (Array.isArray(ctx.localCandidates) ? ctx.localCandidates : []).slice();
  var occupied = (Array.isArray(ctx.occupiedGeometries) ? ctx.occupiedGeometries : []).slice();
  var imageBounds = ctx.imageBounds || null;
  var th = ctx.thresholds || {};
  var T = {
    minSim: th.minSim != null ? th.minSim : 0.8,          // evidence score 达标门槛（与 aligner Phase4 一致）
    overlapMax: th.overlapMax != null ? th.overlapMax : 0.5,
    containmentMin: th.containmentMin != null ? th.containmentMin : 0.8,
    rowTol: th.rowTol != null ? th.rowTol : 8,
    minWidth: th.minWidth != null ? th.minWidth : 1.5,
    minHeight: th.minHeight != null ? th.minHeight : 1.5,
    maxAspect: th.maxAspect != null ? th.maxAspect : 60
  };

  var recovered = [];
  var rejected = [];
  var diag = {
    attempted: 0,
    lineCandidates: lineCands.length,
    wordCandidates: wordCands.length,
    localCandidates: localCands.length,
    lineRecovered: 0,
    wordRecovered: 0,
    localRecovered: 0,
    unresolved: 0,
    rejections: {}
  };

  function reject(native, reason, detail) {
    rejected.push({ native: native, reason: reason, detail: detail || null });
    diag.rejections[reason] = (diag.rejections[reason] || 0) + 1;
    diag.unresolved += 1;
  }

  // 硬门检查（纯判定，不写 rejected —— 最终 unresolved 时统一归档，保证
  // rejected 与 unresolved 一一对应、可审计）。
  function gateCheck(bbox, source) {
    var r = bboxToRect(bbox);
    if (!r) return { ok: false, reason: "GEOMETRY_INVALID", detail: { source: source, bbox: bbox } };
    var w = r.width, h = r.height;
    if (w < T.minWidth || h < T.minHeight) return { ok: false, reason: "GEOMETRY_TOO_SMALL", detail: { source: source, w: w, h: h } };
    var asp = w / Math.max(h, 0.001);
    if (asp > T.maxAspect || asp < 1 / T.maxAspect) return { ok: false, reason: "GEOMETRY_ASPECT_ABNORMAL", detail: { source: source, aspect: asp } };
    for (var i = 0; i < occupied.length; i += 1) {
      var or = bboxToRect(occupied[i] && occupied[i].bbox);
      if (!or) continue;
      if (overlapAreaRatio(r, or) > T.overlapMax) return { ok: false, reason: "OVERLAP_OCCUPIED", detail: { source: source, overlapWith: occupied[i].bbox } };
    }
    var cont = imageBounds ? containmentIn(r, imageBounds) : 1;
    if (cont < T.containmentMin) return { ok: false, reason: "OUTSIDE_IMAGE", detail: { source: source, containment: cont } };
    return { ok: true, rect: r };
  }

  // 已恢复 native 跟踪（行 identity）
  var recoveredSet = {};

  ns.forEach(function (n) {
    if (!n || n.rawText == null) { reject(n || {}, "NO_WORD_MATCH", { reason: "empty-native-text" }); return; }
    diag.attempted += 1;
    var made = null;
    var method = null;
    var score = 0;
    var evidence = [];
    var lastFail = null; // { reason, detail } —— 最终 unresolved 时的归档原因

    // ---- 阶段 1：BAIDU LINE（多因素；多候选按 score 降序依次过几何硬门）----
    var candPicks = [];
    for (var gi = 0; gi < lineCands.length; gi += 1) {
      var g = lineCands[gi];
      if (!g || !g.bbox || g.text == null) continue;
      var sim = textSimilarity(n.rawText, g.text);
      if (sim < T.minSim) continue;
      var sLen = Math.abs(String(n.rawText).length - String(g.text).length) <= 2 ? 1 : 0;
      var sType = scriptType(n.rawText) === scriptType(g.text) ? 1 : 0;
      candPicks.push({ g: g, s: sim * 2 + sLen * 0.4 + sType * 0.4, sim: sim, sLen: sLen, sType: sType });
    }
    if (candPicks.length) {
      candPicks.sort(function (a, b) { return b.s - a.s; });
      for (var pi = 0; pi < candPicks.length && !made; pi += 1) {
        var pick = candPicks[pi];
        var gR = gateCheck(pick.g.bbox, SOURCE_BAIDU_LINE);
        if (gR.ok) {
          made = { bbox: gR.rect, source: SOURCE_BAIDU_LINE, _geo: pick.g };
          method = "LINE_MULTI_FACTOR";
          score = pick.s;
          evidence = ["text-sim=" + pick.sim.toFixed(2), "len=" + pick.sLen, "type=" + pick.sType];
          occupied.push({ bbox: gR.rect });
        } else {
          lastFail = { reason: gR.reason, detail: gR.detail };
        }
      }
    } else {
      lastFail = { reason: "NO_LINE_CANDIDATE", detail: { candidates: lineCands.length } };
    }

    // ---- 阶段 2：BAIDU WORD（一行 native ↔ 多个 word box：合并 bbox + reading order）----
    if (!made) {
      var nk = normKey(n.rawText);
      var cands = [];
      for (var wi = 0; wi < wordCands.length; wi += 1) {
        var w = wordCands[wi];
        if (!w || !w.bbox || w.text == null) continue;
        var wk = normKey(w.text);
        if (!isCandidateWord(nk, wk)) continue;
        cands.push(w);
      }
      var rows = groupRows(cands, T.rowTol);
      var chosen = null, chosenScore = 0, chosenSim = 0;
      rows.forEach(function (row) {
        if (!row.length) return;
        var sorted = row.slice().sort(function (a, b) {
          return boxCenter(a.bbox).x - boxCenter(b.bbox).x || boxCenter(a.bbox).y - boxCenter(b.bbox).y;
        });
        var yc = sorted.map(function (w2) { return boxCenter(w2.bbox).y; });
        var ySpread = Math.max.apply(null, yc) - Math.min.apply(null, yc);
        if (sorted.length > 1 && ySpread > T.rowTol * 2) return; // 行内 y 差过大 → 行结构不可解释
        var cover = orderedCover(sorted, nk);
        if (!cover || !cover.length) return;
        var joined = normKey(cover.map(function (w2) { return w2.text; }).join(""));
        var sim = textSimilarity(n.rawText, joined);
        if (sim < T.minSim) return;
        var s = sim * 2 + (cover.length >= 2 ? 1 : 0.5) + (ySpread <= T.rowTol ? 0.5 : 0);
        if (s > chosenScore) { chosenScore = s; chosen = cover; chosenSim = sim; }
      });
      if (chosen && chosen.length) {
        var merged = unionBox(chosen.map(function (w2) { return w2.bbox; }));
        var wR = gateCheck(merged, SOURCE_BAIDU_WORD);
        if (wR.ok) {
          var xs = chosen.map(function (w2) { return boxCenter(w2.bbox).x; });
          var monotonic = true;
          for (var xi = 1; xi < xs.length; xi += 1) if (xs[xi] < xs[xi - 1]) monotonic = false;
          made = {
            bbox: wR.rect,
            source: SOURCE_BAIDU_WORD,
            parts: chosen.map(function (w2) { return { text: w2.text, bbox: w2.bbox }; }),
            synthetic: true
          };
          method = "WORD_ORDER_COVER";
          score = chosenScore;
          evidence = ["words=" + chosen.length, "text-sim=" + chosenSim.toFixed(2), "reading-order=" + (monotonic ? "x-monotonic" : "x-reset")];
          occupied.push({ bbox: wR.rect });
        } else {
          lastFail = { reason: wR.reason, detail: wR.detail };
        }
      } else {
        // word 是最后尝试途径，其失败原因更贴切（覆盖 line 层 NO_LINE_CANDIDATE 噪声）；
        // 但 line 已产生几何类失败（gate 拒，如 OVERLAP/OUTSIDE）时保留更早更深的可审计原因。
        var isGeoLineFail = !!(lastFail && lastFail.reason && lastFail.reason !== "NO_LINE_CANDIDATE");
        if (!isGeoLineFail) {
          if (cands.length) lastFail = { reason: "WORD_ROW_NOT_EXPLAINABLE", detail: { candidates: cands.length } };
          else lastFail = { reason: (lineCands.length === 0 && wordCands.length === 0) ? "NO_LINE_CANDIDATE" : "NO_WORD_MATCH", detail: { candidates: wordCands.length } };
        }
      }
    }

    // ---- 阶段 3：LOCAL（line 级，Commit 3b sidecar；仅当 BAIDU 两级未恢复且给了 localCandidates）----
    // LOCAL 引擎（Tesseract chi_sim）文本精度低于 Baidu/native，匹配同门槛，
    // 且保持「text 仅用于匹配、最终 text 恒来自 Native」；只提供 line 级 geometry。
    if (!made && localCands.length) {
      var lBest = null, lBestScore = 0, lEv = [];
      for (var li = 0; li < localCands.length; li += 1) {
        var lg = localCands[li];
        if (!lg || !lg.bbox || lg.text == null) continue;
        var lsim = textSimilarity(n.rawText, lg.text);
        if (lsim < T.minSim) continue;
        var lLen = Math.abs(String(n.rawText).length - String(lg.text).length) <= 2 ? 1 : 0;
        var lType = scriptType(n.rawText) === scriptType(lg.text) ? 1 : 0;
        var ls = lsim * 2 + lLen * 0.4 + lType * 0.4;
        if (ls > lBestScore) { lBestScore = ls; lBest = lg; lEv = ["text-sim=" + lsim.toFixed(2), "len=" + lLen, "type=" + lType]; }
      }
      if (lBest) {
        var lR = gateCheck(lBest.bbox, SOURCE_LOCAL);
        if (lR.ok) {
          made = { bbox: lR.rect, source: SOURCE_LOCAL, _geo: lBest };
          method = "LOCAL_LINE_MULTI_FACTOR";
          score = lBestScore;
          evidence = lEv;
          occupied.push({ bbox: lR.rect });
        } else {
          lastFail = { reason: lR.reason, detail: lR.detail };
        }
      } else if (!(lastFail && lastFail.reason && lastFail.reason !== "NO_LINE_CANDIDATE")) {
        lastFail = { reason: "NO_LOCAL_CANDIDATE", detail: { candidates: localCands.length } };
      }
    }

    var key = n.id != null ? n.id : n.rawText;
    if (made) {
      recoveredSet[key] = 1;
      recovered.push({ native: n, geometry: made, source: made.source, method: method, score: score, evidence: evidence });
      if (made.source === SOURCE_BAIDU_LINE) diag.lineRecovered += 1;
      else if (made.source === SOURCE_BAIDU_WORD) diag.wordRecovered += 1;
      else if (made.source === SOURCE_LOCAL) diag.localRecovered += 1;
    } else {
      reject(n, (lastFail && lastFail.reason) || "NO_WORD_MATCH", (lastFail && lastFail.detail) || { candidates: wordCands.length });
    }
  });

  var unresolved = ns.filter(function (n) { return !recoveredSet[n.id != null ? n.id : n.rawText]; });

  return {
    recovered: recovered,
    unresolved: unresolved,
    rejected: rejected,
    diagnostics: diag
  };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  recoverNativeGeometry, extractWords, isBboxValid, overlapAreaRatio, containmentIn,
  orderedCover, groupRows, textSimilarity, normKey, unionBox, boxCenter,
  SOURCE_BAIDU_LINE, SOURCE_BAIDU_WORD, SOURCE_LOCAL, SOURCE_NATIVE_ANCHOR, SOURCE_IMAGE_INK
};