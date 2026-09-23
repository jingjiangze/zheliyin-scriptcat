// =====================================================================
// 折立印名片套版助手 - Geometry Space（OCR-P1 Commit 4.1）
// ---------------------------------------------------------------------
// 统一 geometry schema：
//   { x, y, width, height, angle, coordinateSpace }
// 坐标空间枚举（任务书 §七）：
//   IMAGE_NATURAL  —— 源图片自然像素（dataUrl 完整像素；OCR bbox / ImageInk 所在系）
//   IMAGE_VIEWPORT —— 图片在页面的 CSS 视口呈现（本项目生产 dataUrl 1:1，== IMAGE_NATURAL）
//   CANVAS         —— 画布逻辑坐标（fabric aCoords，不含 viewportTransform；对象位置所在系）
//   EDITOR_OBJECT  —— 单个编辑器对象局部系（left/top 原点，旋转/缩放前）
// 铁律：
//   - 任何 geometry recovery 必须显式携带 coordinateSpace，禁止默认猜测；
//   - 禁止 b.bbox.x / geo.width 等跨坐标系直接换算（本模块是唯一换算入口）；
//   - source→canvas 唯一仿射仍以 buildImageTransform(aCoords)（image-transform /
//     image-space.js）为生产真值；本模块提供 schema / 坐标簿记 / 通用 2D 仿射转换 /
//     canvas↔editor-object 仿射，不重造 aCoords 推断（防止双套几何）。
// 2D 仿射约定：m = [a, b, c, d, e, f] ⇔ x' = a·x + c·y + e；y' = b·x + d·y + f。
// 纯函数、自包含（无 require），node 可测（@require 沙箱同 scope）。
// =====================================================================
"use strict";

var SPACE_IMAGE_NATURAL = "IMAGE_NATURAL";
var SPACE_IMAGE_VIEWPORT = "IMAGE_VIEWPORT";
var SPACE_CANVAS = "CANVAS";
var SPACE_EDITOR_OBJECT = "EDITOR_OBJECT";
var SPACE_UNKNOWN = "UNKNOWN";

function isNum(v) { return typeof v === "number" && isFinite(v); }
// 角度归一到 [-180, 180)
function normAngle(deg) { return isNum(deg) ? (((deg % 360) + 540) % 360) - 180 : 0; }

// ---- normalizeGeometry：吸收 {x,y,width,height} 与 {x0,y0,x1,y1} —— ----
// 输出统一 { x, y, width, height, angle, coordinateSpace }（angle 缺省 0；space 缺省 UNKNOWN，
// 调用方负责显式指定，禁止隐式假设）。非法返回 null。
function normalizeGeometry(g) {
  if (!g) return null;
  var x, y, x2, y2;
  if (isNum(g.x) && isNum(g.width) && isNum(g.y) && isNum(g.height)) {
    x = g.x; y = g.y; x2 = x + g.width; y2 = y + g.height;
  } else if (isNum(g.x0) && isNum(g.y0) && isNum(g.x1) && isNum(g.y1)) {
    x = g.x0; y = g.y0; x2 = g.x1; y2 = g.y1;
  } else {
    return null;
  }
  if (!(x2 > x && y2 > y)) return null;
  return {
    x: x, y: y,
    width: x2 - x, height: y2 - y,
    angle: normAngle(g.angle),
    coordinateSpace: g.coordinateSpace || SPACE_UNKNOWN
  };
}

// ---- 2D affine 工具 ----
function composeAffine(m1, m2) {
  // m1∘m2：先 m2 后 m1
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
  ];
}
function invertAffine(m) {
  var det = m[0] * m[3] - m[1] * m[2];
  if (!(isNum(det) && Math.abs(det) > 1e-12)) return null;
  var a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}
function transformPoint(m, p) {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}
function transformQuad(m, q) {
  return { tl: transformPoint(m, q.tl), tr: transformPoint(m, q.tr), br: transformPoint(m, q.br), bl: transformPoint(m, q.bl) };
}
function rectToQuad(r) {
  var x = r.x, y = r.y, w = r.width, h = r.height;
  return { tl: { x: x, y: y }, tr: { x: x + w, y: y }, br: { x: x + w, y: y + h }, bl: { x: x, y: y + h } };
}
function quadToRect(q) {
  if (!q || !q.tl || !q.tr || !q.br || !q.bl) return null;
  var xs = [q.tl.x, q.tr.x, q.br.x, q.bl.x], ys = [q.tl.y, q.tr.y, q.br.y, q.bl.y];
  var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
  var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
  if (!(maxX > minX && maxY > minY)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY, angle: 0, coordinateSpace: (q && q.coordinateSpace) || SPACE_UNKNOWN };
}
// 绕中心（无缩放）旋转矩形四角 → 旋转后 quad（保持旋转语义，angle 由调用方记录）
function rotateRectAroundCenter(r, angleDeg) {
  var n = normalizeGeometry(r);
  if (!n) return null;
  var rad = (normAngle(angleDeg) * Math.PI) / 180;
  var cx = n.x + n.width / 2, cy = n.y + n.height / 2;
  var cos = Math.cos(rad), sin = Math.sin(rad);
  var q = rectToQuad(n);
  var rot = function (p) {
    var dx = p.x - cx, dy = p.y - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  };
  return { tl: rot(q.tl), tr: rot(q.tr), br: rot(q.br), bl: rot(q.bl) };
}

// ---- imageSpace 坐标簿记（生产 dataUrl 1:1；系数可注入以便测试与未来 viewport 迁移）----
// imageNaturalToViewport(geo, { scaleX, scaleY, offsetX, offsetY })
//   生产默认 = 恒等（IMAGE_NATURAL == IMAGE_VIEWPORT）。
function imageNaturalToViewport(geo, opts) {
  var n = normalizeGeometry(geo);
  if (!n) return null;
  var o = opts || {};
  var sx = isNum(o.scaleX) ? o.scaleX : 1;
  var sy = isNum(o.scaleY) ? o.scaleY : 1;
  var ox = isNum(o.offsetX) ? o.offsetX : 0;
  var oy = isNum(o.offsetY) ? o.offsetY : 0;
  return { x: n.x * sx + ox, y: n.y * sy + oy, width: n.width * sx, height: n.height * sy, angle: n.angle, coordinateSpace: SPACE_IMAGE_VIEWPORT };
}
// viewportToCanvas(geo, { scaleX, scaleY, offsetX, offsetY })
//   生产默认 = 恒等（本项目 fabric 逻辑坐标 == CSS viewport，无 zoom/dpr 折算；系数可注入）。
function viewportToCanvas(geo, opts) {
  var n = normalizeGeometry(geo);
  if (!n) return null;
  var o = opts || {};
  var sx = isNum(o.scaleX) ? o.scaleX : 1;
  var sy = isNum(o.scaleY) ? o.scaleY : 1;
  var ox = isNum(o.offsetX) ? o.offsetX : 0;
  var oy = isNum(o.offsetY) ? o.offsetY : 0;
  return { x: n.x * sx + ox, y: n.y * sy + oy, width: n.width * sx, height: n.height * sy, angle: n.angle, coordinateSpace: SPACE_CANVAS };
}

// ---- editor object 仿射（CANVAS ↔ EDITOR_OBJECT）----
// objectToCanvasAffine(obj)：对象局部系 → CANVAS。
//   obj { left, top, width, height, scaleX, scaleY, angle }
//   语义（fabric 一致）：对象局部以 left/top 为原点；缩放与旋转均绕对象中心 (width/2, height/2)。
//   顺序 T(center) ∘ R(angle) ∘ S(scaleX, scaleY)（相对中心，与 fabric calcTransformMatrix 同构）。
function objectToCanvasAffine(obj) {
  if (!obj) return null;
  var w = isNum(obj.width) ? obj.width : 0;
  var h = isNum(obj.height) ? obj.height : 0;
  var sx = isNum(obj.scaleX) ? obj.scaleX : 1;
  var sy = isNum(obj.scaleY) ? obj.scaleY : 1;
  var a = normAngle(obj.angle || 0);
  var rad = (a * Math.PI) / 180;
  var cos = Math.cos(rad), sin = Math.sin(rad);
  var hw = (w * sx) / 2, hh = (h * sy) / 2;
  var cx = isNum(obj.left) ? obj.left + hw : hw;
  var cy = isNum(obj.top) ? obj.top + hh : hh;
  // x' = cos·sx·u − sin·sy·v + (cx − (cos·hw − sin·hh))
  // y' = sin·sx·u + cos·sy·v + (cy − (sin·hw + cos·hh))
  return [cos * sx, sin * sx, -sin * sy, cos * sy, cx - (cos * hw - sin * hh), cy - (sin * hw + cos * hh)];
}
function canvasToEditorObject(quadOrRect, obj) {
  var inv = invertAffine(objectToCanvasAffine(obj));
  if (!inv) return null;
  var q = quadOrRect && quadOrRect.tl ? transformQuad(inv, quadOrRect) : (function () { var n = normalizeGeometry(quadOrRect); var r = n ? rectToQuad(n) : null; return r ? transformQuad(inv, r) : null; })();
  if (!q) return null;
  var local = quadToRect(q);
  if (!local) return null;
  local.coordinateSpace = SPACE_EDITOR_OBJECT;
  return local;
}

// 仿射列向量有效缩放（与 image-transform effectiveScaleOf 同语义；禁止把对象 scale 当自然缩放真值）
function effectiveScaleOf(m) {
  if (!m) return null;
  return { effectiveScaleX: Math.hypot(m[0], m[1]), effectiveScaleY: Math.hypot(m[2], m[3]) };
}

var API = {
  SPACE_IMAGE_NATURAL: SPACE_IMAGE_NATURAL,
  SPACE_IMAGE_VIEWPORT: SPACE_IMAGE_VIEWPORT,
  SPACE_CANVAS: SPACE_CANVAS,
  SPACE_EDITOR_OBJECT: SPACE_EDITOR_OBJECT,
  SPACE_UNKNOWN: SPACE_UNKNOWN,
  normAngle: normAngle,
  normalizeGeometry: normalizeGeometry,
  composeAffine: composeAffine,
  invertAffine: invertAffine,
  transformPoint: transformPoint,
  transformQuad: transformQuad,
  rectToQuad: rectToQuad,
  quadToRect: quadToRect,
  rotateRectAroundCenter: rotateRectAroundCenter,
  imageNaturalToViewport: imageNaturalToViewport,
  viewportToCanvas: viewportToCanvas,
  objectToCanvasAffine: objectToCanvasAffine,
  canvasToEditorObject: canvasToEditorObject,
  effectiveScaleOf: effectiveScaleOf
};
if (typeof module !== "undefined" && module.exports) { module.exports = API; }
