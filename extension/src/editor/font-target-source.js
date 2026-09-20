// =====================================================================
// extension/src/editor/font-target-source.js — Stage 9 P4-B §六 typography target 统一解析
// ---------------------------------------------------------------------
// 职责：把「字号求解 / layoutWidth 的 visual target」收敛到同一来源（bbox 或 image-ink），
//   杜绝 §二.2 的“字号按 ImageInk、布局宽度仍按 OCR bbox”双重标准。
// 语义（§六/§二十五）：
//   mode="bbox"        → width = bboxWidth × scale，source=OCR_BBOX（默认，flag OFF 行为）
//   mode="image-ink"   → inkValid 且 imageInkWidth>0 → width = imageInkWidth × scale，source=IMAGE_INK
//                        否则 → width = bboxWidth × scale，source=OCR_BBOX_FALLBACK，fallback=true
// 绝对禁止：任何固定校准系数（×0.96 / ×1.04 / ×K2 等）在此处出现。
// 纯函数（node 可测）。
// =====================================================================
"use strict";

function resolveTypographyTarget(o) {
  var opts = o || {};
  var bboxW = Number(opts.bboxWidth);
  if (!isFinite(bboxW) || bboxW <= 0) bboxW = 0;
  var scale = (typeof opts.scale === "number" && isFinite(opts.scale) && opts.scale > 0) ? opts.scale : 1;
  var mode = opts.mode === "image-ink" ? "image-ink" : "bbox";
  var inkW = Number(opts.imageInkWidth);
  var inkValid = !!(opts.inkValid) && isFinite(inkW) && inkW > 0;
  if (mode === "image-ink") {
    if (inkValid) {
      return { width: inkW * scale, source: "IMAGE_INK", fallback: false, reason: "OK" };
    }
    return {
      width: bboxW * scale,
      source: "OCR_BBOX_FALLBACK",
      fallback: true,
      reason: opts.reason || (isFinite(inkW) && inkW > 0 ? "INK_VALIDITY_REJECTED" : "NO_INK")
    };
  }
  return { width: bboxW * scale, source: "OCR_BBOX", fallback: false, reason: "OK" };
}

if (typeof module !== "undefined" && module.exports) module.exports = { resolveTypographyTarget: resolveTypographyTarget };