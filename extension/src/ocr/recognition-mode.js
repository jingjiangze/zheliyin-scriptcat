// =====================================================================
// 折立印名片套版助手 - Recognition Mode Resolver（Stage 9 V4 §十七~§二十八）
// ---------------------------------------------------------------------
// 职责（单一职责）：根据「目标页已有文字清单 + 图片指纹 + 最近事务」决定本次识别模式：
//   NEW_RECOGNITION        目标 Canvas 无文字对象 → OCR → Text Truth → Geometry → Font → Create（§十九）
//   CALIBRATION_RECOGNITION 已有文字 → 匹配现有 textbox → 校准 text/font/width/position（§二十，禁止复制对象）
//   RECOGNITION_RETRY      同 pageId + 同 imageFingerprint + 已有最近事务 → 重新取证 + 校准，禁止重复创建（§二十六）
// 规则（确定性，纯函数）：
//   1) existingTextObjects 为空 → NEW_RECOGNITION（空画布一律新识别）
//   2) 同图（previousTransactions 存在同 pageId 且 fingerprint 相同）且已有文字 → RECOGNITION_RETRY
//   3) 已有文字且不同图 → CALIBRATION_RECOGNITION（记录 sourceImageChanged=true，防旧事务与新图混用 §27）
// 匹配不靠文字相等（§23）：文字只作 hint；身份 = pageId + 空间位置 + 阅读顺序 + bbox overlap + 长度类别。
// 纯函数（node 可测；@require 沙箱同 scope 声明）。
// =====================================================================
"use strict";

var MODE_NEW = "NEW_RECOGNITION";
var MODE_CAL = "CALIBRATION_RECOGNITION";
var MODE_RETRY = "RECOGNITION_RETRY";

function resolveRecognitionMode(input) {
  var o = input || {};
  var existing = Array.isArray(o.existingTextObjects) ? o.existingTextObjects : [];
  var prev = Array.isArray(o.previousTransactions) ? o.previousTransactions : [];
  var pageId = o.pageId || null;
  var fp = o.imageFingerprint || null;
  var existingCount = existing.length;
  // 最近一次同页事务（fingerprint 匹配用）
  var last = null;
  for (var i = 0; i < prev.length; i += 1) {
    if (prev[i] && prev[i].pageId === pageId) last = prev[i];
  }
  var sameImage = !!(last && last.imageFingerprint && fp && last.imageFingerprint === fp);
  var reasons = [];
  if (existingCount === 0) {
    reasons.push("canvas-empty");
    return { mode: MODE_NEW, existingCount: 0, sameImage: sameImage, sourceImageChanged: false, reasons: reasons, pageId: pageId, imageFingerprint: fp };
  }
  if (sameImage) {
    reasons.push("same-image-retry");
    return { mode: MODE_RETRY, existingCount: existingCount, sameImage: true, sourceImageChanged: false, reasons: reasons, pageId: pageId, imageFingerprint: fp };
  }
  reasons.push("canvas-has-text");
  if (!fp || !last) reasons.push("no-prior-transaction");
  else reasons.push("source-image-changed");
  return { mode: MODE_CAL, existingCount: existingCount, sameImage: false, sourceImageChanged: !(last && last.imageFingerprint === fp), reasons: reasons, pageId: pageId, imageFingerprint: fp };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  resolveRecognitionMode: resolveRecognitionMode,
  MODE_NEW: MODE_NEW, MODE_CAL: MODE_CAL, MODE_RETRY: MODE_RETRY
};