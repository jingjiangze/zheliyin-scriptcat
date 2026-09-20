// =====================================================================
// 折立印名片套版助手 - OCR Candidate Quality Gate（Stage 8D §四~§八/§十六/§十七）
// ---------------------------------------------------------------------
// 目标：把「OCR 有结果」与「可以重建文字」解耦 —— 每个 candidate/block 在进入
// TextBlock/Reconstruction 之前必须通过逐块硬门；block-set 级聚合怀疑直接阻止
// reconstruction（禁止把 OCR 产生的碎片/超大块/异常合并直接创建成文字）。
//
// 职责边界（与 ocr-quality.js 互补）：
//   ocr-quality.js   = 整批质量 → fallback 决策（cloud 失败换 local、empty 报错）
//   ocr-candidate-gate.js = 逐块硬门 + block-set 怀疑 → 允许「不创建」
//
// API：
//   validateCandidate(cand, imageSize, context) -> {ok, blockReasons, warnReasons, score, detail}
//   validateBlock(block, imageSize, context)    -> 同上（block 层：多行/合并后几何）
//   validateBlockSet(list, imageSize, context)  -> {ok, total, validated, blocked, warns,
//                                                   suspect, setSuspectReasons, aggregate, status}
//   classifyTextAngle(blockAngle, imageAngle)   -> HORIZONTAL|IMAGE_ROTATION|TEXT_ROTATION|
//                                                  PHOTO_PERSPECTIVE|OCR_NOISE|UNKNOWN
//   STATUS_CHAIN / READINESS（8D §十六/§十七）
// 本模块纯函数，无网络/画布依赖，node 可单测。
// =====================================================================
"use strict";

// ---- 8D §五：异常类型枚举 ----
var R = {
  EMPTY_TEXT: "EMPTY_TEXT",
  INVALID_BBOX: "INVALID_BBOX",
  OUT_OF_IMAGE: "OUT_OF_IMAGE",
  TINY_BOX: "TINY_BOX",
  GIANT_BOX: "GIANT_BOX",
  SUSPICIOUS_ASPECT: "SUSPICIOUS_ASPECT",
  SINGLE_CHAR_NOISE: "SINGLE_CHAR_NOISE",
  LOW_CONFIDENCE: "LOW_CONFIDENCE",
  OCR_BLOCK_SET_SUSPECT: "OCR_BLOCK_SET_SUSPECT",
  // WARN 级（不阻断，进 readiness）
  W_TOO_MANY_LINES: "W_TOO_MANY_LINES",
  W_LEAN_SINGLE_CHAR: "W_LEAN_SINGLE_CHAR",
  W_SHORT_FRAGMENT_RATIO: "W_SHORT_FRAGMENT_RATIO",
  W_OVERLAP_OBSERVED: "W_OVERLAP_OBSERVED",
  W_EDGE_CLIPPED: "W_EDGE_CLIPPED"
};

// ---- 8D §六：尺寸异常硬门 ----
var GIANT_WIDTH_RATIO = 0.95;  // block width > imageWidth * 0.95 → GIANT_BOX
var GIANT_HEIGHT_RATIO = 0.8;  // block height > imageHeight * 0.8 → GIANT_BOX
var TINY_WIDTH = 4;            // block width < 4px → TINY_BOX
var TINY_HEIGHT = 3;           // block height < 3px → TINY_BOX
var BOUND_TOL = 0.05;          // 越界容差（相对图片宽/高）
var LOW_CONF = 0.5;            // confidence < 0.5 → LOW_CONFIDENCE（provider 有 confidence 时）
var ASPECT_MAX = 20;           // w/h 超过 → SUSPICIOUS_ASPECT（warn）
var ASPECT_MIN = 0.3;          // w/h 低于 → SUSPICIOUS_ASPECT（warn）
var SINGLE_CHAR_AREA_RATIO = 0.0006; // 单字符面积极小判据（相对图片面积）
var NEARBY_DIST_RATIO = 0.15;  // 单字符与最近文字块中心距阈值（相对图片高）
var FRAGMENT_RATIO_SUSPECT = 0.5;  // len<=2 碎片占比 ≥ 50% → block-set suspect
var OVERLAP_PAIR_SUSPECT = 0.5;    // 强重叠 pair 占比 ≥ 50%（增强版；quality 0.2 为整批 FAIL 门）
var SINGLE_COVER_RATIO = 0.6;      // 仅 1 块且覆盖 ≥60% → suspect（8D §十八 超大块）

// ---- 8D §十六：状态链 ----
var STATUS = {
  OCR_DETECTED: "OCR_DETECTED",
  OCR_VALIDATED: "OCR_VALIDATED",
  RECONSTRUCTION_READY: "RECONSTRUCTION_READY",
  RECONSTRUCTION_CREATED: "RECONSTRUCTION_CREATED",
  RECONSTRUCTION_VERIFIED: "RECONSTRUCTION_VERIFIED"
};

// ---- 8D §十七：Readiness Score ----
// score ∈ [0,1]；由六个分项合成，但只作诊断/排序 —— 最终放行仍是硬门 reasons。

function isFiniteNum(v) {
  return typeof v === "number" && isFinite(v);
}

// bbox 归一化（兼容 {x0,y0,x1,y1} 与 {x,y,width,height}）；非法返回 null
function normBox(b) {
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

function rectArea(b) { return (b && b.width > 0 && b.height > 0) ? b.width * b.height : 0; }

function centerOf(b) { return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }

// ---- 单块检查（candidate 与 block 共用核心；block 层追加多行/合并检查）----
// 返回 {ok, blockReasons[], warnReasons[], numScore, dims}
function inspectUnit(item, imageSize, context) {
  var o = context || {};
  var img = imageSize || o.imageSize || null;
  var imgW = img && isFiniteNum(img.width) && img.width > 0 ? img.width : null;
  var imgH = img && isFiniteNum(img.height) && img.height > 0 ? img.height : null;
  var blockReasons = [], warnReasons = [];
  var text = String((item && item.text) != null ? item.text : "").trim();
  if (!text) { return { ok: false, blockReasons: [R.EMPTY_TEXT], warnReasons: [], numScore: 0, dims: {} }; }
  var b = (item && item.bbox) ? normBox(item.bbox) : null;
  if (!b) { return { ok: false, blockReasons: [R.INVALID_BBOX], warnReasons: [], numScore: 0, dims: {} }; }
  var w = b.width, h = b.height;
  var dims = { x: b.x, y: b.y, width: w, height: h, aspect: w / h, area: rectArea(b), textLen: text.length };
  // 越界（8D §五 OUT_OF_IMAGE；5% 容差）
  if (imgW && imgH) {
    if (b.x + w < -imgW * BOUND_TOL || b.x > imgW * (1 + BOUND_TOL) ||
        b.y + h < -imgH * BOUND_TOL || b.y > imgH * (1 + BOUND_TOL)) {
      blockReasons.push(R.OUT_OF_IMAGE);
    } else if (b.x < imgW * BOUND_TOL || (b.x + w) > imgW * (1 - BOUND_TOL) ||
               b.y < imgH * BOUND_TOL || (b.y + h) > imgH * (1 - BOUND_TOL)) {
      warnReasons.push(R.W_EDGE_CLIPPED);
    }
  }
  // 尺寸门（8D §六：先于其它判定 —— 异常尺寸直接不创建）
  if (w < TINY_WIDTH || h < TINY_HEIGHT) {
    blockReasons.push(R.TINY_BOX);
  } else if (imgW && (w > imgW * GIANT_WIDTH_RATIO)) {
    blockReasons.push(R.GIANT_BOX);
  } else if (imgH && (h > imgH * GIANT_HEIGHT_RATIO)) {
    blockReasons.push(R.GIANT_BOX);
  }
  // 宽高比警示（8D §五 SUSPICIOUS_ASPECT；仅 warn —— 单字符/竖排文本可能合法）
  if (blockReasons.length === 0 || true) {
    if (dims.aspect > ASPECT_MAX || dims.aspect < ASPECT_MIN) warnReasons.push(R.SUSPICIOUS_ASPECT);
  }
  // 置信度（8D §五 LOW_CONFIDENCE；仅 provider 提供时判定）
  var conf = isFiniteNum(item.confidence) ? item.confidence : (isFiniteNum(item.avgConfidence) ? item.avgConfidence : null);
  if (conf != null && conf < LOW_CONF && blockReasons.length === 0) blockReasons.push(R.LOW_CONFIDENCE);
  // 8D §七：单字符上下文判定（不得机械全删；仅在非尺寸硬门上时判定，可与低置信并存归因）
  var sizeBlocked = blockReasons.some(function (r) { return r === R.TINY_BOX || r === R.GIANT_BOX || r === R.OUT_OF_IMAGE; });
  if (text.length === 1 && !sizeBlocked) {
    var area = rectArea(b);
    var areaTiny = imgW && imgH ? area < Math.max(24, imgW * imgH * SINGLE_CHAR_AREA_RATIO) : area < 60;
    var neighbors = Array.isArray(o.neighbors) ? o.neighbors : null;
    var hasNearby = false, nearbyInfo = null;
    if (neighbors) {
      var c0 = centerOf(b);
      var nearTol = imgH ? imgH * NEARBY_DIST_RATIO : Math.max(w, h) * 3;
      for (var i = 0; i < neighbors.length; i += 1) {
        var nb = normBox(neighbors[i] && (neighbors[i].bbox || neighbors[i]));
        if (!nb) continue;
        var nc = centerOf(nb);
        var d = Math.hypot(nc.x - c0.x, nc.y - c0.y);
        if (d <= nearTol) { hasNearby = true; nearbyInfo = { dist: Math.round(d), text: String(neighbors[i].text || "").slice(0, 8) }; break; }
      }
    }
    var confLow = conf == null || conf < 0.6;
    if (areaTiny && confLow && !hasNearby) {
      blockReasons.push(R.SINGLE_CHAR_NOISE);
    } else {
      // 缺失邻近上下文时保守：仅 warn，不阻断（姓名单字等合法场景）
      warnReasons.push(R.W_LEAN_SINGLE_CHAR);
      if (nearbyInfo) dims.nearby = nearbyInfo;
    }
  }
  // block 层：多行超长警示（8D §五 textLength / 异常 block）
  var lineCount = (item && isFiniteNum(item.lineCount)) ? item.lineCount
    : (Array.isArray(item.lines) ? item.lines.length : (Array.isArray(item.lineBoxes) ? item.lineBoxes.length : null));
  if (lineCount != null && lineCount > 8) warnReasons.push(R.W_TOO_MANY_LINES);
  var ok = blockReasons.length === 0;
  // 诊断 score（不决定放行）
  var numScore = 1;
  blockReasons.forEach(function (r) { numScore -= r === R.TINY_BOX || r === R.GIANT_BOX || r === R.OUT_OF_IMAGE ? 0.55 : 0.45; });
  warnReasons.forEach(function () { numScore -= 0.12; });
  return { ok: ok, blockReasons: blockReasons, warnReasons: warnReasons, numScore: Math.max(0, numScore), dims: dims, text: text.slice(0, 10) };
}

// ---- 8D §四：单候选校验 ----
function validateCandidate(cand, imageSize, context) {
  var r = inspectUnit(cand, imageSize, Object.assign({}, context || {}, { neighbors: (context && context.neighbors) || (context && context.blocks) || null }));
  return Object.assign({ ok: r.ok, candidate: cand }, r);
}

// ---- 8D §四：单 block 校验（block 为 TextBlock 形态：{text,bbox,confidence,lineCount,lines}）----
function validateBlock(block, imageSize, context) {
  var r = inspectUnit(block, imageSize, context);
  var dims = r.dims || {};
  dims.lineCount = (Array.isArray(block && block.lines) ? block.lines.length : (block && block.lineCount) || null);
  return Object.assign({ ok: r.ok, block: block }, r);
}

// ---- 8D §八/§十七：block-set 级检测 ----
// 逐块硬门 + 聚合怀疑。return {ok, total, validated, blocked, warns, blockSetReason, aggregate, status}
function validateBlockSet(list, imageSize, context) {
  var o = context || {};
  var arr = Array.isArray(list) ? list : [];
  var img = imageSize || o.imageSize || null;
  var imgW = img && isFiniteNum(img.width) && img.width > 0 ? img.width : null;
  var imgH = img && isFiniteNum(img.height) && img.height > 0 ? img.height : null;
  var validated = [], blocked = [], warns = [];
  var aggregate = { total: arr.length, blockReasons: {}, warnReasons: {}, fragments: 0, heavyOverlapPairs: 0, totalPairs: 0, maxCoverRatio: 0, maxCoverIndex: -1, blockMode: "candidate" };
  var keptList = [];
  arr.forEach(function (it, i) {
    if (!it) { blocked.push({ index: i, reasons: [R.EMPTY_TEXT] }); return; }
    var isBlock = !!(Array.isArray(it.lines) || isFiniteNum(it.lineCount));
    var r = isBlock
      ? validateBlock(it, img, { imageSize: img, neighbors: arr })
      : validateCandidate(it, img, { imageSize: img, neighbors: arr });
    (r.blockReasons || []).forEach(function (k) { aggregate.blockReasons[k] = (aggregate.blockReasons[k] || 0) + 1; });
    (r.warnReasons || []).forEach(function (k) { aggregate.warnReasons[k] = (aggregate.warnReasons[k] || 0) + 1; });
    if (r.ok) {
      validated.push(it);
      keptList.push(it);
      if ((r.dims && r.dims.textLen) != null && r.dims.textLen <= 2) aggregate.fragments += 1;
    } else {
      blocked.push({ index: i, reasons: r.blockReasons || [], text: String(it.text || "").slice(0, 10) });
    }
  });
  // 8D §八：块间重叠/覆盖聚合
  if (imgW && imgH) {
    var maxArea = 0;
    keptList.forEach(function (it, ii) {
      var b = normBox(it && it.bbox);
      if (!b) return;
      var a = rectArea(b);
      if (a > maxArea) { maxArea = a; aggregate.maxCoverIndex = ii; }
      aggregate.maxCoverRatio = Math.max(aggregate.maxCoverRatio, a / (imgW * imgH));
    });
    for (var p = 0; p < keptList.length; p += 1) {
      for (var q = p + 1; q < keptList.length; q += 1) {
        var bp = normBox(keptList[p] && keptList[p].bbox), bq = normBox(keptList[q] && keptList[q].bbox);
        if (!bp || !bq) continue;
        aggregate.totalPairs += 1;
        var x0 = Math.max(bp.x, bq.x), y0 = Math.max(bp.y, bq.y);
        var x1 = Math.min(bp.x + bp.width, bq.x + bq.width), y1 = Math.min(bp.y + bp.height, bq.y + bq.height);
        var inter = (x1 > x0 && y1 > y0) ? (x1 - x0) * (y1 - y0) : 0;
        var minA = Math.min(rectArea(bp), rectArea(bq));
        if (minA > 0 && inter / minA > 0.5) aggregate.heavyOverlapPairs += 1;
      }
    }
  }
  // block-set 怀疑判定（8D §八：任何一条 → OCR_BLOCK_SET_SUSPECT，整体禁止 reconstruction）
  var setSuspectReasons = [];
  if (arr.length > 0) {
    var fragRatio = aggregate.fragments / arr.length;
    if (fragRatio > FRAGMENT_RATIO_SUSPECT) setSuspectReasons.push(R.OCR_BLOCK_SET_SUSPECT + ":fragment-ratio=" + (Math.round(fragRatio * 100) / 100));
    else if (fragRatio > 0.3) warns.push(R.W_SHORT_FRAGMENT_RATIO);
    if (aggregate.totalPairs > 0 && aggregate.heavyOverlapPairs / aggregate.totalPairs >= OVERLAP_PAIR_SUSPECT) {
      setSuspectReasons.push(R.OCR_BLOCK_SET_SUSPECT + ":heavy-overlap=" + aggregate.heavyOverlapPairs + "/" + aggregate.totalPairs);
    } else if (aggregate.heavyOverlapPairs > 0) {
      warns.push(R.W_OVERLAP_OBSERVED);
    }
    if (keptList.length === 1 && aggregate.maxCoverRatio > SINGLE_COVER_RATIO) {
      setSuspectReasons.push(R.OCR_BLOCK_SET_SUSPECT + ":single-cover=" + (Math.round(aggregate.maxCoverRatio * 100) / 100));
    }
    if (aggregate.maxCoverRatio > SINGLE_COVER_RATIO && keptList.length > 1) {
      // 某块覆盖图面积过半（8D §十八 超大块防御；即使门内也应 WARN）
      warns.push(R.W_GIANT_COVER);
    }
  }
  var suspect = setSuspectReasons.length > 0;
  var ok = !suspect && blocked.length === 0;
  // 8D §十七 Readiness Score（诊断用；放行仍由硬门决定）
  var dims = {
    textQuality: blocked.length ? 0.3 : 1,
    bboxQuality: blocked.length ? 0 / Math.max(1, arr.length) : 1,
    blockQuality: suspect ? 0.2 : (keptList.length / Math.max(1, arr.length)),
    geometryQuality: 1,
    fontQuality: 0.5 // 无字体证据时中性；由 text-fit-fusion 取代
  };
  dims.textQuality = 1 - (blocked.length / Math.max(1, arr.length));
  dims.bboxQuality = dims.textQuality;
  var score = Math.max(0, dims.textQuality * 0.35 + dims.blockQuality * 0.35 + dims.bboxQuality * 0.15 + dims.geometryQuality * 0.05 + dims.fontQuality * 0.10);
  return {
    ok: ok,
    reason: suspect ? R.OCR_BLOCK_SET_SUSPECT : null,
    status: !ok ? STATUS.OCR_DETECTED : STATUS.OCR_VALIDATED, // suspect/blocked → 未过验证
    total: arr.length,
    validated: validated,
    blocked: blocked,
    warns: warns,
    suspect: suspect,
    setSuspectReasons: setSuspectReasons,
    aggregate: aggregate,
    score: { score: Math.round(score * 100) / 100, textQuality: Math.round(dims.textQuality * 100) / 100, bboxQuality: Math.round(dims.bboxQuality * 100) / 100, blockQuality: Math.round(dims.blockQuality * 100) / 100, geometryQuality: dims.geometryQuality, fontQuality: dims.fontQuality }
  };
}

// ---- 8D §十六：状态链推进（硬判）----
// valid=false 时保持当前状态（或回退到 OCR_DETECTED）；readyGate 由调用方决定
function nextStatus(prev, valid, extra) {
  var e = extra || {};
  if (!valid) return { status: STATUS.OCR_DETECTED, progressed: false, reason: e.reason || "invalid" };
  if (prev === STATUS.OCR_DETECTED) return { status: STATUS.OCR_VALIDATED, progressed: true };
  if (prev === STATUS.OCR_VALIDATED) return { status: STATUS.RECONSTRUCTION_READY, progressed: true };
  if (prev === STATUS.RECONSTRUCTION_READY) return { status: STATUS.RECONSTRUCTION_CREATED, progressed: true };
  if (prev === STATUS.RECONSTRUCTION_CREATED) return { status: STATUS.RECONSTRUCTION_VERIFIED, progressed: true };
  return { status: prev, progressed: false, reason: e.reason || "no-op" };
}

// ---- 8D §十一：文本方向分类 ----
// blockAngle：block 估计旋转（度，±180）；imageAngle：整图/背景旋转（度，可 null）
// 返回 {unit:"deg", angle, classification, confidence}
function classifyTextAngle(blockAngle, imageAngle) {
  var a = isFiniteNum(blockAngle) ? ((blockAngle % 360) + 360) % 360 : null;
  var ia = isFiniteNum(imageAngle) ? ((imageAngle % 360) + 360) % 360 : null;
  function norm180(x) { return Math.abs(((x + 180) % 360 + 360) % 360 - 180); }
  var conf = 0.5;
  if (a == null) return { angle: null, classification: "UNKNOWN", confidence: 0 };
  if (norm180(a) <= 2) { return { angle: a, classification: "HORIZONTAL", confidence: 0.9 }; }
  if (ia != null && Math.abs(norm180(a) - norm180(ia)) <= 3) {
    return { angle: a, classification: "IMAGE_ROTATION", confidence: 0.85 };
  }
  // 垂直（竖排名片）明确归类
  if (Math.abs(norm180(a) - 90) <= 3) return { angle: a, classification: "PHOTO_PERSPECTIVE", confidence: 0.55 };
  if (norm180(a) >= 45) return { angle: a, classification: "PHOTO_PERSPECTIVE", confidence: 0.5 };
  if (norm180(a) >= 5) return { angle: a, classification: "TEXT_ROTATION", confidence: 0.6 };
  return { angle: a, classification: "OCR_NOISE", confidence: 0.4 };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  validateCandidate, validateBlock, validateBlockSet, classifyTextAngle, nextStatus,
  normBox, R, STATUS, GIANT_WIDTH_RATIO, GIANT_HEIGHT_RATIO, TINY_WIDTH, TINY_HEIGHT
};