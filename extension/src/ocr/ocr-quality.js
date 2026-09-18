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

if (typeof module !== "undefined" && module.exports) module.exports = { assessOcrCandidates, normQBox, LOW_CONFIDENCE, MAX_TEXT_LENGTH, MAX_LINES, KEEP_RATIO };