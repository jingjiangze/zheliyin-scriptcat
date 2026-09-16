// =====================================================================
// 折立印名片套版助手 - OCR Candidate Model（Stage 5.2 §四十/§四十一）
// ---------------------------------------------------------------------
// 纯数据模型：描绘「一张名片图片经 OCR 输出的一个文字候选」。
// 职责边界：不负责 network / AI / canvas / matcher（§四十一/§四十二）；
//           只做字段归一与合法性校验，OCR 服务商解耦（§四十四）。
// 坐标语义：bbox 使用 OCR 输出坐标系（相对图片像素），配合 sourceImageSize
//           或 normalized 0~1 供上层 Normalizer 转换到 Canvas（§5.1 坐标原则）。
// =====================================================================
"use strict";

// 字段归一：text 必填字符串；bbox 四元组；confidence 0..1；source ∈ manual|ocr|fixture
function createOCRCandidate(input) {
  const src = input || {};
  const bbox = src.bbox && typeof src.bbox === "object" ? {
    x: numOrNull(src.bbox.x),
    y: numOrNull(src.bbox.y),
    width: numOrNull(src.bbox.width),
    height: numOrNull(src.bbox.height)
  } : null;
  const text = String(src.text == null ? "" : src.text);
  const confRaw = typeof src.confidence === "number" ? src.confidence : null;
  return {
    text: text,
    textLen: text.length,
    textHash8: hash8(text),
    bbox: bbox,
    confidence: confRaw == null ? null : Math.min(1, Math.max(0, confRaw)),
    source: ["manual", "ocr", "fixture"].indexOf(src.source) >= 0 ? src.source : "fixture"
  };
}

function numOrNull(v) { return typeof v === "number" && isFinite(v) ? v : null; }
function hash8(s) { let h = 5381, i = String(s == null ? "" : s).length; while (i) h = (h * 33) ^ s.charCodeAt(--i); return (h >>> 0).toString(16); }

// 合法性：OCR Candidate 能否进入 Matcher（§四十；空白文本 / 非法 bbox 不可用）
function isUsable(candidate) {
  return !!(candidate && typeof candidate.text === "string" && candidate.text.trim().length > 0
    && candidate.bbox && [candidate.bbox.x, candidate.bbox.y, candidate.bbox.width, candidate.bbox.height].every((v) => typeof v === "number" && isFinite(v) && v >= 0));
}

if (typeof module !== "undefined" && module.exports) module.exports = { createOCRCandidate, isUsable, hash8 };