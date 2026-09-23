// =====================================================================
// 折立印名片套版助手 - OCR Transaction Identity（Stage 9 V4 §三~§八）
// ---------------------------------------------------------------------
// 职责（单一职责）：为每次 OCR 生成不可变事务身份，并校验事务完整性。
//   1. fingerprintImage(dataUrl) —— 图片指纹（FNV-1a over 归一化 dataUrl），
//      同一图片内容 → 同一 fingerprint；不同图片 → 极大概率不同（GATE-9-TRANSACTION-ID）。
//   2. createTransaction(opts) —— 生成一次 OCR 事务的身份快照：
//       { transactionId, pageId, side, canvasId, imageFingerprint,
//         imageWidth, imageHeight, createdAt }
//   3. validateTransactionIdentity(tx) —— 事务必需字段门禁（TX_* 硬失败码）。
// 使用场景（§四~§八）：Create / Adjust / Calibrate / Native 结果 / 对象身份，
//   全部以 transactionId + pageId 定位；正反面分别拥有独立 Session，禁跨页共享。
// 纯函数（无 DOM / 无网络 / 无 GM_*），node 可测；@require 沙箱同 scope 声明（同 native-ocr-provider 模式）。
// =====================================================================
"use strict";

// OCR-P0.5：dataUrl 解码后的 payload 字节数（base64 → bytes）
function decodedBytes(dataUrl) {
  var s = String(dataUrl == null ? "" : dataUrl);
  var i = s.indexOf(",");
  var b64 = i >= 0 ? s.slice(i + 1) : "";
  if (!b64) return -1;
  var pad = 0;
  if (b64.charAt(b64.length - 1) === "=") pad += 1;
  if (b64.charAt(b64.length - 2) === "=") pad += 1;
  return Math.floor(b64.length * 3 / 4) - pad;
}
// §三：图片指纹 —— dataUrl 是唯一种子（同图同字符串 → 同指纹）。仅做身份防串，不用于内容安全。
function fingerprintImage(dataUrl) {
  var s = String(dataUrl == null ? "" : dataUrl);
  var h = 0x811c9dc5;
  for (var i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return "img-" + h.toString(16) + "-" + s.length;
}

// §三：生成 OCR Transaction Identity。
// opts: { pageId, side(FRONT|BACK|UNKNOWN), canvasId, dataUrl?, imageFingerprint?,
//         imageWidth?, imageHeight?, now? }
// dataUrl 与 imageFingerprint 二者必取其一生成指纹（优先显式传入值）。
function createTransaction(o) {
  var opts = o || {};
  var now = typeof opts.now === "number" ? opts.now : Date.now();
  var txId = "tx-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  var side = opts.side;
  if (side !== "FRONT" && side !== "BACK") side = "UNKNOWN";
  return {
    transactionId: txId,
    pageId: opts.pageId || null,
    side: side,
    canvasId: opts.canvasId || null,
    imageFingerprint: opts.imageFingerprint || (opts.dataUrl != null ? fingerprintImage(opts.dataUrl) : null),
    naturalWidth: typeof opts.naturalWidth === "number" ? opts.naturalWidth : (typeof opts.imageWidth === "number" ? opts.imageWidth : null),
    naturalHeight: typeof opts.naturalHeight === "number" ? opts.naturalHeight : (typeof opts.imageHeight === "number" ? opts.imageHeight : null),
    imageWidth: typeof opts.imageWidth === "number" ? opts.imageWidth : null,
    imageHeight: typeof opts.imageHeight === "number" ? opts.imageHeight : null,
    payloadBytes: typeof opts.payloadBytes === "number" ? opts.payloadBytes : (opts.dataUrl != null ? decodedBytes(opts.dataUrl) : null),
    createdAt: now
  };
}

// §四：事务完整性门禁（Create/Adjust/Native 结果共用）。
// 硬失败码：TX_MISSING / TX_NO_ID / TX_NO_PAGE / TX_NO_FINGERPRINT。
function validateTransactionIdentity(tx) {
  if (!tx || typeof tx !== "object") return { ok: false, code: "TX_MISSING", message: "事务身份缺失" };
  if (!tx.transactionId) return { ok: false, code: "TX_NO_ID", message: "缺少 transactionId" };
  if (!tx.pageId) return { ok: false, code: "TX_NO_PAGE", message: "缺少 pageId" };
  if (!tx.imageFingerprint) return { ok: false, code: "TX_NO_FINGERPRINT", message: "缺少 imageFingerprint" };
  return { ok: true, code: "OK", transactionId: tx.transactionId, pageId: tx.pageId, imageFingerprint: tx.imageFingerprint };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  fingerprintImage: fingerprintImage,
  decodedBytes: decodedBytes,
  createTransaction: createTransaction,
  validateTransactionIdentity: validateTransactionIdentity
};