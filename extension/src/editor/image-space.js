// =====================================================================
// 折立印名片套版助手 - 图片运行时几何（IMAGE_PIXEL/IMAGE_LOCAL → CANVAS_LOGICAL 唯一映射）
// ---------------------------------------------------------------------
// Stage 8B STEP 2（坐标合同 docs/STAGE_8B_COORDINATE_CONTRACT.md §1/§3/§5 F5）：
//   废弃「从 left/top/width/height/scaleX/scaleY/angle 反推显示四角」的猜测；
//   以 fabric setCoords() 之后的 aCoords（tl/tr/br/bl）为唯一真值，
//   建立源图（natural px）→ 对象局部 → 画布逻辑的单一仿射合同：
//       P_canvas = imageTransform · P_natural
// 职责边界（§二十八 硬规则同 image-transform.js）：只做几何；禁止掺入 OCR /
//   Typography / Style / Native drawText / Page Ownership。
// 本模块为 @require 注入 + node 单测（tests/editor-object-model/image-space.test.js）。
//   页面世界与隔离世界均可按 descriptor 形态消费（不要求 fabric 对象在作用域内）；
//   getImageRuntimeGeometry 提供 fabric 对象直读变体（须在能触达画布的环境调用）。
// 依赖：无（2D 仿射基础内嵌，与 image-transform.js 同构，避免 @require 顺序耦合；
//       若两者同时加载，本模块自带实现保持一致结果，可安全共存）。
// =====================================================================
"use strict";

// ---- 2D 仿射基础（同构 image-transform.transformPoint/invertTransform/composeTransform）----
// m = [a, b, c, d, tx, ty]；x' = a·x + c·y + tx；y' = b·x + d·y + ty
function tp(p, m) {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}
function inv(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det) return null;
  const k = 1 / det;
  return [m[3] * k, -m[1] * k, -m[2] * k, m[0] * k, (m[2] * m[5] - m[3] * m[4]) * k, (m[1] * m[4] - m[0] * m[5]) * k];
}
// comp(m1, m2) = m1 ∘ m2：先应用 m2，再应用 m1
function comp(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
  ];
}

// ---- 最小二乘 2D 仿射（≥3 点，非共线；4 点时残差最小化）----
// src[i] → dst[i]；返回 [a,b,c,d,tx,ty]。退化（det≈0）返回 null。
function solveAffine2D(src, dst) {
  const n = Math.min(src.length, dst.length);
  if (!Array.isArray(src) || !Array.isArray(dst) || n < 3) return null;
  let N00 = 0, N01 = 0, N02 = 0, N11 = 0, N12 = 0, N22 = 0;
  let RX0 = 0, RX1 = 0, RX2 = 0;
  let RY0 = 0, RY1 = 0, RY2 = 0;
  for (let i = 0; i < n; i += 1) {
    const p = src[i], q = dst[i];
    const x = p.x, y = p.y, txv = q.x, tyv = q.y;
    N00 += x * x; N01 += x * y; N02 += x;
    N11 += y * y; N12 += y;
    N22 += 1;
    RX0 += x * txv; RX1 += y * txv; RX2 += txv;
    RY0 += x * tyv; RY1 += y * tyv; RY2 += tyv;
  }
  // 高斯消元（部分主元）解 3x3：N·v = R
  const solve3 = function (r) {
    const a = [
      [N00, N01, N02, r[0]],
      [N01, N11, N12, r[1]],
      [N02, N12, N22, r[2]]
    ];
    for (let col = 0; col < 3; col += 1) {
      let piv = col;
      for (let row = col + 1; row < 3; row += 1) if (Math.abs(a[row][col]) > Math.abs(a[piv][col])) piv = row;
      if (piv !== col) { const tmp = a[col]; a[col] = a[piv]; a[piv] = tmp; }
      if (Math.abs(a[col][col]) < 1e-12) return null;
      for (let row = 0; row < 3; row += 1) {
        if (row === col) continue;
        const f = a[row][col] / a[col][col];
        for (let k = col; k < 4; k += 1) a[row][k] -= f * a[col][k];
      }
    }
    return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
  };
  const vx = solve3([RX0, RX1, RX2]);
  const vy = solve3([RY0, RY1, RY2]);
  if (!vx || !vy) return null;
  // vx = [a, c, tx]；vy = [b, d, ty]
  return [vx[0], vy[0], vx[1], vy[1], vx[2], vy[2]];
}

// ---- aCoords 四角归一化 ----
// 输入 {tl,tr,br,bl}（每个取值 {x,y}）→ 输出 [tl,tr,br,bl]；缺角/无数字 → null
function aCoordsQuad(ac) {
  if (!ac || !ac.tl || !ac.tr || !ac.br || !ac.bl) return null;
  const p = function (v) { return (v && typeof v.x === "number" && typeof v.y === "number") ? { x: v.x, y: v.y } : null; };
  const q = [p(ac.tl), p(ac.tr), p(ac.br), p(ac.bl)];
  return q.every(Boolean) ? q : null;
}
function quadToAcoords(quad) {
  return quad ? { tl: quad[0], tr: quad[1], br: quad[2], bl: quad[3] } : null;
}

// ---- 对象局部仿射：把 fabric 对象 box 的 4 角 [0,width]×[0,height] 映射到 aCoords 4 角 ----
function affineFromAcoordsQuad(width, height, quad) {
  if (!(width > 0) || !(height > 0) || !quad) return null;
  const local = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
  return solveAffine2D(local, quad);
}

// ---- 完整仿射：P_canvas = T_obj · S_img · P_natural ----
// S_img：natural px → 对象局部（对象 box 拉伸，fabric 把整图塞进 [0,width]×[0,height]）；
// T_obj：对象局部 → 画布逻辑（aCoords 实测真值）。
function buildImageTransform(o) {
  const naturalWidth = o && o.naturalWidth, naturalHeight = o && o.naturalHeight;
  const width = o && o.width, height = o && o.height;
  const quad = o && o.quad ? o.quad : (o && o.aCoords ? aCoordsQuad(o.aCoords) : null);
  if (!(naturalWidth > 0) || !(naturalHeight > 0) || !(width > 0) || !(height > 0) || !quad) return null;
  const tObj = affineFromAcoordsQuad(width, height, quad);
  if (!tObj) return null;
  const sImg = [width / naturalWidth, 0, 0, height / naturalHeight, 0, 0];
  return comp(tObj, sImg);
}

// 源图 4 角（natural）→ 画布 quad（[tl,tr,br,bl]）
function imageQuadOf(naturalWidth, naturalHeight, T) {
  if (!(naturalWidth > 0) || !(naturalHeight > 0) || !T) return null;
  const src = [{ x: 0, y: 0 }, { x: naturalWidth, y: 0 }, { x: naturalWidth, y: naturalHeight }, { x: 0, y: naturalHeight }];
  return src.map(function (p) { return tp(p, T); });
}
function quadToAABB(quad) {
  if (!quad || !quad.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  quad.forEach(function (p) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });
  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
}
function quadArea(quad) {
  if (!quad || quad.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < quad.length; i += 1) {
    const a = quad[i], b = quad[(i + 1) % quad.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

// ---- 映射 API ----
// natural rect {x,y,width,height} → 画布 AABB（4 角变换后取 AABB；旋转不丢角）
function mapRectToCanvas(rect, T) {
  if (!rect || !T) return null;
  const cs = [{ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y }, { x: rect.x + rect.width, y: rect.y + rect.height }, { x: rect.x, y: rect.y + rect.height }].map(function (p) { return tp(p, T); });
  const bb = quadToAABB(cs);
  return bb ? { left: bb.left, top: bb.top, width: bb.width, height: bb.height, corners: cs } : null;
}
// 画布点 → 源图 natural 点（T 奇异返回 null）
function mapCanvasPointToImage(p, T) {
  if (!p || !T) return null;
  const iT = inv(T);
  return iT ? tp(p, iT) : null;
}

// ---- 路由（镜像 buildOcrPrepare 优先级 active→背景图→首图，§2.1）----
// ctx = { active, backgroundImage, objects }；对象可为 fabric 对象或 plain descriptor（含 type）
function resolveImageRoute(ctx) {
  const c = ctx || {};
  const isImage = function (o) { return !!o && String(o.type) === "image"; };
  if (c.active && isImage(c.active)) return { kind: "active-image", target: c.active };
  if (c.backgroundImage && isImage(c.backgroundImage)) return { kind: "background-image", target: c.backgroundImage };
  const first = (Array.isArray(c.objects) ? c.objects : []).find(isImage);
  if (first) return { kind: "first-image", target: first };
  return { kind: null, target: null };
}

// ---- descriptor 归一化：fabric 对象或页面世界已序列化的 plain descriptor → 统一形状 ----
// opts 支持 {naturalWidth, naturalHeight, width, height, aCoords, left, top, scaleX, scaleY, angle}（显式覆盖）
function normalizeImageDescriptor(target, opts) {
  const o = opts || {};
  const t = target || {};
  const el = t._element || (typeof t.getElement === "function" ? t.getElement() : null) || null;
  let quad = null;
  if (t.aCoords) quad = aCoordsQuad(t.aCoords);
  if (!quad && o.aCoords) quad = aCoordsQuad(o.aCoords);
  const pick = function (a, b, fb) { return (typeof a === "number" && isFinite(a)) ? a : (typeof b === "number" && isFinite(b) ? b : fb); };
  const width = pick(t.width, o.width, 0);
  const height = pick(t.height, o.height, 0);
  const nw = pick(el && el.naturalWidth, o.naturalWidth, 0);
  const nh = pick(el && el.naturalHeight, o.naturalHeight, 0);
  return {
    width: width, height: height,
    naturalWidth: nw, naturalHeight: nh,
    quad: quad,
    left: pick(t.left, o.left, null),
    top: pick(t.top, o.top, null),
    scaleX: pick(t.scaleX, o.scaleX, 1),
    scaleY: pick(t.scaleY, o.scaleY, 1),
    angle: pick(t.angle, o.angle, 0),
    kind: o.kind || null
  };
}

// ---- 统一输出：{kind, element, naturalWidth, naturalHeight, sourceWidth, sourceHeight,
//       objectWidth, objectHeight, imageQuad, imageTransform, uniformSourceScale, coordinateContract} ----
function buildImageRuntimeGeometry(target, opts) {
  const n = normalizeImageDescriptor(target, opts);
  const base = { kind: n.kind, naturalWidth: n.naturalWidth, naturalHeight: n.naturalHeight };
  if (!(n.naturalWidth > 0) || !(n.naturalHeight > 0)) {
    return { status: "NEEDS_NATURAL_SIZE", message: "缺少源图 natural 尺寸（element.naturalWidth/Height 或 opts 显式提供）", normalize: n };
  }
  if (!n.quad) {
    return { status: "NEEDS_ACOORDS", message: "缺少 aCoords 四角（须经 setCoords() 后读取，禁止用 left/top/width/height/angle 猜测）", normalize: n };
  }
  const T = buildImageTransform({ naturalWidth: n.naturalWidth, naturalHeight: n.naturalHeight, width: n.width, height: n.height, quad: n.quad });
  if (!T) {
    return { status: "AFFINE_SINGULAR", message: "四角退化（det≈0，三点共线或零尺寸）", normalize: n };
  }
  const imgQuad = imageQuadOf(n.naturalWidth, n.naturalHeight, T);
  const sxFactor = n.naturalWidth > 0 ? n.width / n.naturalWidth : 0;
  const syFactor = n.naturalHeight > 0 ? n.height / n.naturalHeight : 0;
  const uniformSourceScale = Math.abs(sxFactor - syFactor) < 1e-9;
  return Object.assign(base, {
    status: "OK",
    sourceWidth: n.naturalWidth, sourceHeight: n.naturalHeight,
    objectWidth: n.width, objectHeight: n.height,
    imageQuad: imgQuad,
    imageTransform: T,
    uniformSourceScale: uniformSourceScale,
    coordinateContract: {
      naturalWidth: n.naturalWidth, naturalHeight: n.naturalHeight,
      objectWidth: n.width, objectHeight: n.height,
      scaleX: n.scaleX, scaleY: n.scaleY,
      left: n.left, top: n.top, angle: Math.round(n.angle * 1000) / 1000,
      affine: T,
      basis: "aCoords",
      aCoords: quadToAcoords(n.quad),
      contract: "P_canvas = imageTransform · P_natural（CANVAS_LOGICAL；viewport/zoom/retina 属显示系不入数学）",
      sourceStretch: { sx: Math.round(sxFactor * 1e6) / 1e6, sy: Math.round(syFactor * 1e6) / 1e6 } // 源图→对象 box 拉伸比（F5 修正）
    }
  });
}

// ---- fabric 对象直读变体：setCoords() 后读 aCoords（须在能触达画布的环境调用）----
function getImageRuntimeGeometry(imageObject, canvas, opts) {
  const o = opts || {};
  const obj = imageObject || null;
  if (!obj || typeof obj.setCoords !== "function") {
    return { status: "INVALID_TARGET", message: "imageObject 不可用或缺少 setCoords()" };
  }
  try {
    if (canvas && typeof canvas.setCoords === "function") canvas.setCoords();
    else obj.setCoords();
  } catch (e) {
    return { status: "SETCOORDS_ERROR", message: String(e && e.message || e) };
  }
  return buildImageRuntimeGeometry(obj, {
    kind: o.kind || String(obj.type || "image"),
    aCoords: obj.aCoords || null,
    naturalWidth: o.naturalWidth, naturalHeight: o.naturalHeight,
    width: o.width, height: o.height, left: o.left, top: o.top,
    scaleX: o.scaleX, scaleY: o.scaleY, angle: o.angle
  });
}

// ---- 越界校验（保存前一致性门禁的几何底座；tolerance 默认 20%）----
// 规则（合同 §8）：center 出界 → 必 INVALID；AABB 估计的越界面积占比 > tolerance → INVALID。
function validateQuadInsideCanvas(quad, canvasWidth, canvasHeight, opts) {
  const o = opts || {};
  const tol = o.tolerance != null ? o.tolerance : 0.2;
  const bb = quadToAABB(quad);
  if (!bb || !(canvasWidth > 0) || !(canvasHeight > 0)) {
    return { status: "GEOMETRY_INVALID", reason: "no-quad-or-canvas", valid: false };
  }
  const area = quadArea(quad) || Math.max(bb.width * bb.height, 1e-9);
  const cx = bb.left + bb.width / 2, cy = bb.top + bb.height / 2;
  const centerInside = cx >= 0 && cx <= canvasWidth && cy >= 0 && cy <= canvasHeight;
  const ovW = Math.max(0, Math.min(bb.left + bb.width, canvasWidth) - Math.max(bb.left, 0));
  const ovH = Math.max(0, Math.min(bb.top + bb.height, canvasHeight) - Math.max(bb.top, 0));
  const inside = ovW * ovH;
  const outOfBoundsPct = Math.max(0, 1 - inside / area);
  let maxCornerOutsidePx = 0;
  quad.forEach(function (p) {
    const d = Math.max(0 - p.x, p.x - canvasWidth, 0 - p.y, p.y - canvasHeight, 0);
    if (d > maxCornerOutsidePx) maxCornerOutsidePx = d;
  });
  const reason = (!centerInside ? "center-outside"
    : outOfBoundsPct > tol ? "out-of-bounds-pct-" + outOfBoundsPct.toFixed(3)
    : null);
  return {
    status: reason ? "GEOMETRY_INVALID" : "GEOMETRY_VALID",
    valid: !reason,
    reason: reason,
    centerInside: centerInside,
    bounds: bb,
    canvasWidth: canvasWidth, canvasHeight: canvasHeight,
    area: area,
    insideArea: inside,
    outOfBoundsPct: outOfBoundsPct,
    maxCornerOutsidePx: maxCornerOutsidePx
  };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  tp, inv, comp, solveAffine2D, aCoordsQuad, quadToAcoords,
  affineFromAcoordsQuad, buildImageTransform, imageQuadOf, quadToAABB, quadArea,
  mapRectToCanvas, mapCanvasPointToImage, resolveImageRoute,
  normalizeImageDescriptor, buildImageRuntimeGeometry, getImageRuntimeGeometry,
  validateQuadInsideCanvas
};