// =====================================================================
// 折立印名片套版助手 - Image Coordinate Mapper（Stage 5.3 §十五/§十六/§三十）
// ---------------------------------------------------------------------
// 纯函数：把「图片局部坐标」（OCR bbox，相对图片逻辑尺寸）映射为 Canvas 全局坐标。
// 采用真实 Fabric transform 语义（§十六 禁止简单 offset）：
//   - 对象逻辑尺寸 = width × height（fabric 显示尺寸，非自然像素）
//   - 旋转围绕对象中心；缩放 pre-multiply；坐标系 origin = left/top
// 归一化：imageLocal 支持 0..1（相对逻辑尺寸）或像素（自动换算）。
// 约束：无 DOM/fabric 依赖，可单测；不能替代真实 getBoundingRect（旋转时 AABB 用本模块计算）。
// =====================================================================
"use strict";

function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }

// imgObj 需包含：left, top, width, height, scaleX, scaleY, angle(deg)
// localRect：{x, y, width, height}，单位 = 图片逻辑像素（0..image.width）
// 返回：{left, top, width, height（Canvas 全局 AABB）, centerX, centerY, angle}
function imageLocalRectToCanvas(imgObj, localRect) {
  const o = imgObj || {};
  const lr = localRect || {};
  const w = num(o.width) || 0;
  const h = num(o.height) || 0;
  if (!w || !h) return null;
  const sx = num(o.scaleX); const sy = num(o.scaleY);
  const sxf = sx == null ? 1 : sx;
  const syf = sy == null ? 1 : sy;
  const angDeg = num(o.angle) || 0;
  const ang = (angDeg * Math.PI) / 180;
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);

  // 候选四角（图片局部坐标 → 相对图片显示的偏移；中心旋转）
  const cx = o.left + (w * sxf) / 2;
  const cy = o.top + (h * syf) / 2;
  const x = num(lr.x) || 0;
  const y = num(lr.y) || 0;
  const lw = num(lr.width) || 0;
  const lh = num(lr.height) || 0;
  const corners = [[x, y], [x + lw, y], [x, y + lh], [x + lw, y + lh]]
    .map(function (p) {
      // 相对图片逻辑左上 → 相对中心缩放偏移
      const dx = (p[0] - w / 2) * sxf;
      const dy = (p[1] - h / 2) * syf;
      const rx = dx * cos - dy * sin;
      const ry = dx * sin + dy * cos;
      return [cx + rx, cy + ry];
    });
  const xs = corners.map(function (c) { return c[0]; });
  const ys = corners.map(function (c) { return c[1]; });
  const minX = Math.min.apply(null, xs);
  const maxX = Math.max.apply(null, xs);
  const minY = Math.min.apply(null, ys);
  const maxY = Math.max.apply(null, ys);
  return {
    left: minX,
    top: minY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: cx,
    centerY: cy,
    angle: angDeg
  };
}

// 归一化 0..1（相对图片逻辑尺寸）
function imageLocalNormalized(imgObj, rect01) {
  const o = imgObj || {};
  const w = num(o.width) || 1;
  const h = num(o.height) || 1;
  const r = rect01 || {};
  return {
    x: (r.x || 0) * w,
    y: (r.y || 0) * h,
    width: (r.width || 0) * w,
    height: (r.height || 0) * h
  };
}

if (typeof module !== "undefined" && module.exports) module.exports = { imageLocalRectToCanvas, imageLocalNormalized, num };