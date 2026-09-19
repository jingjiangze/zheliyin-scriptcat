// =====================================================================
// 折立印名片套版助手 - 图像变换最小工具（Stage 8A-1 §二十八/§二十九）
// ---------------------------------------------------------------------
// 职责边界（§二十八 硬规则）：只做几何变换；禁止掺入 OCR/Typography/
//   Page Ownership/Style/Native drawText。
//   transformPoint(p, m)            矩阵 × 点
//   transformCorners(bbox, m)       bbox{left,top,width,height} → 4 角变换
//   transformBBox(bbox, m)          4 角 → 变换 → AABB（旋转不丢角，§二十九）
//   invertTransform(m)              2D 仿射求逆
//   composeTransform(m1, m2)        m1 ∘ m2（先 m2 后 m1 应用）
// m = [a, b, c, d, tx, ty]（fabric/DOMMatrix 同构 2D affine）
// 本模块为 @require 注入，纯函数可单测。
// =====================================================================
"use strict";

function transformPoint(p, m) {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

// bbox → 4 角（本地轴对齐）
function cornersOf(b) {
  const x0 = b.left, y0 = b.top, x1 = b.left + b.width, y1 = b.top + b.height;
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
}

// 4 角变换（返回角数组 [tl,tr,br,bl] 顺序同 cornersOf）
function transformCorners(bbox, m) {
  return cornersOf(bbox).map(function (p) { return transformPoint(p, m); });
}

// 4 角变换 → AABB（旋转与缩放不丢角，§二十九）
function transformBBox(bbox, m) {
  const cs = transformCorners(bbox, m);
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  cs.forEach(function (p) {
    x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y);
    x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y);
  });
  return { left: x1, top: y1, width: x2 - x1, height: y2 - y1, corners: cs };
}

// 2D 仿射求逆（det=0 → null）
function invertTransform(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det) return null;
  const inv = 1 / det;
  return [m[3] * inv, -m[1] * inv, -m[2] * inv, m[0] * inv, (m[2] * m[5] - m[3] * m[4]) * inv, (m[1] * m[4] - m[0] * m[5]) * inv];
}

// compose：返回 M = m1 ∘ m2（先应用 m2，再应用 m1）
function composeTransform(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
  ];
}

// 便捷：rotation(deg, {x,y}) 绕中心旋转矩阵
function rotationMatrix(deg, center) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  const cx = center.x, cy = center.y;
  return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
}
// 便捷：scale+translate 矩阵
function affineMatrix(a, d, tx, ty) {
  return [a, 0, 0, d, tx, ty];
}

if (typeof module !== "undefined" && module.exports) module.exports = { transformPoint, transformCorners, transformBBox, invertTransform, composeTransform, rotationMatrix, affineMatrix, cornersOf };