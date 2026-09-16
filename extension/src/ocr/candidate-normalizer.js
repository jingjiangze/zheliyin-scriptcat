// =====================================================================
// 折立印名片套版助手 - OCR 候选统一归一化（Stage 5.5B P3，§六/§七）
// ---------------------------------------------------------------------
// 数据边界收口：无论 OCR 来自哪个 Provider/executor，都归一为统一 OCRCandidate：
//   {text, bbox{x,y,width,height}, confidence, rotation, coordinateSpace:"image-pixel", imageSize}
// 输入两种形态（自动识别）：
//   1) executor（页面世界传输层）私有 lines：{text, bbox{x0,y0,x1,y1}}
//   2) 统一候选（Baidu Provider 等）：{text, bbox{x,y,width,height}}
// 后续 Mapper（buildItemsFromOcr）只消费统一字段，不再感知来源（§P3 第 2 项）。
// 本模块为 @require 注入（与 config-core/field-core/ocr-provider 同模式），纯函数可单测。
// =====================================================================
"use strict";

function unifyCandidates(raw, imageSize) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  list.forEach(function (it) {
    if (!it || !it.bbox || !it.text) return;
    let bb = null;
    if (typeof it.bbox.x0 === "number" && typeof it.bbox.x1 === "number") {
      bb = {
        x: Math.min(it.bbox.x0, it.bbox.x1),
        y: Math.min(it.bbox.y0, it.bbox.y1),
        width: Math.abs(it.bbox.x1 - it.bbox.x0),
        height: Math.abs(it.bbox.y1 - it.bbox.y0)
      };
    } else if (typeof it.bbox.x === "number" && typeof it.bbox.width === "number") {
      bb = { x: it.bbox.x, y: it.bbox.y, width: it.bbox.width, height: it.bbox.height };
    }
    if (!bb || bb.width <= 0 || bb.height <= 0) return;
    const text = String(it.text).trim();
    if (!text) return;
    out.push({
      text: text,
      bbox: bb,
      confidence: typeof it.confidence === "number" ? it.confidence : null,
      rotation: typeof it.rotation === "number" ? it.rotation : null,
      coordinateSpace: "image-pixel",
      imageSize: imageSize || null
    });
  });
  return out;
}

if (typeof module !== "undefined" && module.exports) module.exports = { unifyCandidates };