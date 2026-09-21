// =====================================================================
// 折立印名片套版助手 - Image Containment（Stage 9 Commit 7）
// ---------------------------------------------------------------------
// 纯模块，不接 DOM/Fabric。职责：文字目标几何 ↔ 图片边界的 containment 判定。
//   effectiveScaleOf(T)        从 2D 仿射派生真实有效缩放（列向量长度，不读 geo.scaleX/scaleY）
//   mapQuadToImage(q, T)       canvas text quad → inverse(imageTransform) → IMAGE_PIXEL 四角
//   classifyContainment(pts)   四角 + AABB 判定 → CONTAINED / OUT_OF_IMAGE / NEEDS_REPAIR
//   isQuadInsideImage(q, T, nw, nh, opts) 上述三者的组合入口
//   repairQuadCentered(q, T, nw, nh, opts) 几何修复：整体平移 quad 使 AABB 回到图片内（尺寸/角度不变）
//   quadTextGeometry(q)        从 targetQuad 派生 textbox 目标几何 {left,top,width,height,angle,center}
// 旋转图片必须按 inverse transform 检查，不能只用 Canvas AABB（本模块全部在 IMAGE_PIXEL 系判定）。
// 禁止：硬编码模板尺寸 / magic -4 / 以 geo.scaleX/scaleY 充当 natural scaling truth。
// =====================================================================
"use strict";

function icTransformPoint(p, m) {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}
function icInvertTransform(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det) return null;
  const inv = 1 / det;
  return [m[3] * inv, -m[1] * inv, -m[2] * inv, m[0] * inv, (m[2] * m[5] - m[3] * m[4]) * inv, (m[1] * m[4] - m[0] * m[5]) * inv];
}

// 真实有效缩放：affine 两列列向量长度（旋转/非均匀缩放均正确；禁止用 geo.scaleX/scaleY 充当 truth）
function effectiveScaleOf(T) {
  if (!T || T.length < 4) return null;
  const fx = Math.hypot(T[0], T[1]);
  const fy = Math.hypot(T[2], T[3]);
  if (!(fx > 0) || !(fy > 0)) return null;
  return { effectiveScaleX: Math.round(fx * 1e6) / 1e6, effectiveScaleY: Math.round(fy * 1e6) / 1e6 };
}

// canvas text quad（[tl,tr,br,bl]）→ image-pixel 四角（T 奇异返回 null）
function mapQuadToImage(textQuad, T) {
  if (!textQuad || !T) return null;
  const iT = icInvertTransform(T);
  if (!iT) return null;
  return textQuad.map(function (p) { return icTransformPoint(p, iT); });
}

function icAABB(pts) {
  if (!pts || !pts.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  pts.forEach(function (p) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  });
  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
}

// 纯判定：四角 + AABB 均在图片 margin 内缘（[m, natural-m]）→ CONTAINED；
// AABB 与图片（margin 内缘）无交集或四角全部在外 → OUT_OF_IMAGE；其余（部分在外）→ NEEDS_REPAIR。
// marginPx 语义 = 距图片边缘的最小安全距离（文字不贴边/不出血；0 = 允许贴边）。
function classifyContainment(imagePts, naturalWidth, naturalHeight, opts) {
  const o = opts || {};
  const m = (typeof o.marginPx === "number" && isFinite(o.marginPx)) ? o.marginPx : 0;
  if (!imagePts || imagePts.length !== 4 || !(naturalWidth > 0) || !(naturalHeight > 0)) {
    return { verdict: "GEOMETRY_INVALID", reason: "no-quad-or-natural-size" };
  }
  const inward = Math.min(m, Math.min(naturalWidth, naturalHeight) / 2 - 1e-6);
  const lim = { x0: inward, y0: inward, x1: naturalWidth - inward, y1: naturalHeight - inward };
  // EPS：仅吸收 image-pixel 往返浮点误差（repair→canvas→inverse 边界贴线时不误判越界；不改变判定语义）
  const EPS = 1e-6;
  let outCount = 0;
  const outside = [];
  imagePts.forEach(function (p) {
    const inside = p.x >= lim.x0 - EPS && p.x <= lim.x1 + EPS && p.y >= lim.y0 - EPS && p.y <= lim.y1 + EPS;
    if (!inside) { outCount += 1; outside.push({ x: Math.round(p.x * 1e3) / 1e3, y: Math.round(p.y * 1e3) / 1e3 }); }
  });
  const bb = icAABB(imagePts);
  // AABB 与图片内侧矩形重叠检查；overlapW/H ≥ 0 即接触
  const overlapW = Math.max(0, Math.min(bb.left + bb.width, lim.x1) - Math.max(bb.left, lim.x0));
  const overlapH = Math.max(0, Math.min(bb.top + bb.height, lim.y1) - Math.max(bb.top, lim.y0));
  const touches = overlapW > 0 && overlapH > 0;
  const aabbInside = bb.left >= lim.x0 - EPS && bb.top >= lim.y0 - EPS && bb.left + bb.width <= lim.x1 + EPS && bb.top + bb.height <= lim.y1 + EPS;
  const evidence = {
    cornersImage: imagePts.map(function (p) { return { x: Math.round(p.x * 1e3) / 1e3, y: Math.round(p.y * 1e3) / 1e3 }; }),
    aabbImage: { left: Math.round(bb.left * 1e3) / 1e3, top: Math.round(bb.top * 1e3) / 1e3, width: Math.round(bb.width * 1e3) / 1e3, height: Math.round(bb.height * 1e3) / 1e3 },
    naturalWidth: naturalWidth, naturalHeight: naturalHeight,
    marginPx: Math.round(inward * 1e3) / 1e3,
    insideCount: 4 - outCount, outsideCount: outCount, outside: outside,
    touches: touches, aabbInside: aabbInside
  };
  if (outCount === 0 && aabbInside) return { verdict: "CONTAINED", reason: "all-corners-and-aabb-inside", evidence: evidence };
  if (outCount === 4 || (!touches && outCount > 0)) return { verdict: "OUT_OF_IMAGE", reason: "no-overlap", evidence: evidence };
  return { verdict: "NEEDS_REPAIR", reason: "partial-outside", evidence: evidence };
}

// 组合入口：canvas text quad → 逆变换 → IMAGE_PIXEL → 判定
function isQuadInsideImage(textQuad, T, naturalWidth, naturalHeight, opts) {
  const imagePts = mapQuadToImage(textQuad, T);
  if (!imagePts) return { verdict: "GEOMETRY_INVALID", reason: "singular-transform" };
  return classifyContainment(imagePts, naturalWidth, naturalHeight, opts);
}

// 几何修复：IMAGE_PIXEL 中 clamp AABB 到图片内（保持尺寸/角度，纯平移）。
// 返回修复后的 canvas quad + 修复证据；quad 本身放不进图片（宽/高超过 natural) → null。
function repairQuadCentered(textQuad, T, naturalWidth, naturalHeight, opts) {
  const o = opts || {};
  const m = (typeof o.marginPx === "number" && isFinite(o.marginPx)) ? o.marginPx : 0;
  if (!textQuad || !T) return null;
  const iT = icInvertTransform(T);
  if (!iT) return null;
  const imgPts = textQuad.map(function (p) { return icTransformPoint(p, iT); });
  const bb = icAABB(imgPts);
  if (!bb) return null;
  const roomW = naturalWidth - bb.width, roomH = naturalHeight - bb.height;
  if (roomW < 0 || roomH < 0) return null; // 几何尺寸超图片，无法平移修复
  const inward = Math.min(m, Math.min(naturalWidth, naturalHeight) / 2 - 1e-6);
  const clampL = Math.max(inward, Math.min(naturalWidth - inward - bb.width, bb.left));
  const clampT = Math.max(inward, Math.min(naturalHeight - inward - bb.height, bb.top));
  const shiftX = clampL - bb.left, shiftY = clampT - bb.top;
  const repairedImg = imgPts.map(function (p) { return { x: p.x + shiftX, y: p.y + shiftY }; });
  const canvasQuad = repairedImg.map(function (p) { return icTransformPoint(p, T); });
  const after = classifyContainment(repairedImg, naturalWidth, naturalHeight, o);
  return {
    quad: canvasQuad,
    evidence: {
      imageAABBBefore: { left: Math.round(bb.left * 1e3) / 1e3, top: Math.round(bb.top * 1e3) / 1e3, width: Math.round(bb.width * 1e3) / 1e3, height: Math.round(bb.height * 1e3) / 1e3 },
      imageShift: { x: Math.round(shiftX * 1e3) / 1e3, y: Math.round(shiftY * 1e3) / 1e3 },
      canvasShift: { x: Math.round((canvasQuad[0].x - textQuad[0].x) * 1e3) / 1e3, y: Math.round((canvasQuad[0].y - textQuad[0].y) * 1e3) / 1e3 },
      afterVerdict: after.verdict,
      afterEvidence: after.evidence
    }
  };
}

// targetQuad → textbox 目标几何（originX='left'；angle 取 quad 顶边方向；宽度/高度取 AABB）
function quadTextGeometry(quad) {
  if (!quad || quad.length !== 4) return null;
  const bb = icAABB(quad);
  if (!bb) return null;
  const edge = { x: quad[1].x - quad[0].x, y: quad[1].y - quad[0].y };
  const angle = (edge.x === 0 && edge.y === 0) ? 0 : Math.round((Math.atan2(edge.y, edge.x) * 180 / Math.PI) * 1e6) / 1e6;
  return {
    left: Math.round(bb.left * 1e6) / 1e6,
    top: Math.round(bb.top * 1e6) / 1e6,
    width: Math.round(bb.width * 1e6) / 1e6,
    height: Math.round(bb.height * 1e6) / 1e6,
    angle: angle,
    center: { x: Math.round((bb.left + bb.width / 2) * 1e6) / 1e6, y: Math.round((bb.top + bb.height / 2) * 1e6) / 1e6 }
  };
}

if (typeof module !== "undefined" && module.exports) module.exports = { effectiveScaleOf, mapQuadToImage, classifyContainment, isQuadInsideImage, repairQuadCentered, quadTextGeometry };