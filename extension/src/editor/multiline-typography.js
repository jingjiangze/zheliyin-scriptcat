// =====================================================================
// 折立印名片套版助手 - Multiline Typography（Stage 9 Commit 8）
// ---------------------------------------------------------------------
// 纯模块，不接 DOM/Fabric。目标（Commit 8 A/C）：
//   A 多行字号必须 per-line：line bbox → ImageInk → lineInkHeight → median → 字号求解。
//      禁止 whole-block inkHeight（2 行总高直接当单行字号是错误来源）。
//   C 多行 textbox geometry：canvasLineQuad[] → common rotation / max line width /
//      actual line spacing / total text visual height → 一个最终 textbox（1 TextBlock = 1 textbox）。
// API：
//   medianLineInk(lineInkHeights)     容忍 null → 中位数（null/空 → null）
//   solveMedianInkFontSize(medianPx)   fs = medianPx / FONT_HEIGHT_RATIO（默认 0.969）
//   describeLineQuads(lineQuads)       union AABB / commonAngle / maxLineWidth / gaps
//   synthesizeTextLayout(input)        lineQuads + fontSize → {left,top,width,height,angle,...evidence}
// 禁止：硬编码模板尺寸 / 用 whole-block inkHeight 推字号 / 放宽阈值掩盖几何错误。
// =====================================================================
"use strict";

var IC_FS_MIN = 10, IC_FS_MAX = 160;
var IC_FONT_HEIGHT_RATIO = 0.969; // P4-D：视觉 ink 高 / fontSize（真机验证，Stage 8B F2；与 text-fit-fusion 同源）

function icIsFiniteNum(v) { return typeof v === "number" && isFinite(v); }
function icRound(v, n) { var p = Math.pow(10, n == null ? 3 : n); return Math.round(v * p) / p; }

// A：中位数（容忍 null / 非数值；数量不足 1 → null）
function medianLineInk(lineInkHeights) {
  if (!Array.isArray(lineInkHeights)) return null;
  var vals = lineInkHeights.filter(icIsFiniteNum);
  if (!vals.length) return null;
  vals.sort(function (a, b) { return a - b; });
  var m = Math.floor(vals.length / 2);
  return vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2;
}

// A：median source-ink height（任意坐标系的像素值）→ fontSize
function solveMedianInkFontSize(medianInkPx, opts) {
  var o = opts || {};
  var ratio = icIsFiniteNum(o.ratio) && o.ratio > 0 ? o.ratio : IC_FONT_HEIGHT_RATIO;
  var minF = icIsFiniteNum(o.min) ? o.min : IC_FS_MIN;
  var maxF = icIsFiniteNum(o.max) ? o.max : IC_FS_MAX;
  if (!icIsFiniteNum(medianInkPx) || medianInkPx <= 0) return null;
  return Math.max(minF, Math.min(maxF, Math.round(medianInkPx / ratio)));
}

function icAABB(pts) {
  if (!pts || !pts.length) return null;
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  pts.forEach(function (p) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });
  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
}
function quadAABB(quad) {
  return quad && quad.length ? icAABB(quad) : null;
}

// C：逐行 quad 描述（union AABB / common rotation / max line width / 行间距 gaps / 总视觉高）
function describeLineQuads(lineQuads) {
  if (!Array.isArray(lineQuads) || !lineQuads.length) return null;
  var boxes = lineQuads.map(quadAABB).filter(Boolean);
  if (!boxes.length) return null;
  var union = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  boxes.forEach(function (bb) { union.left = Math.min(union.left, bb.left); union.top = Math.min(union.top, bb.top); union.right = Math.max(union.right, bb.left + bb.width); union.bottom = Math.max(union.bottom, bb.top + bb.height); });
  var angles = [];
  lineQuads.forEach(function (q) {
    if (!q || q.length < 2) return;
    var dx = q[1].x - q[0].x, dy = q[1].y - q[0].y;
    if (dx === 0 && dy === 0) return;
    var a = Math.atan2(dy, dx) * 180 / Math.PI;
    // 归一到 [-90, 90]（行文本角度，避免四边形 180° 翻转歧义）
    while (a > 90) a -= 180;
    while (a < -90) a += 180;
    angles.push(Math.round(a * 1e6) / 1e6);
  });
  var commonAngle = null;
  if (angles.length) {
    var sum = angles.reduce(function (s, a) { return s + a; }, 0);
    var avg = sum / angles.length;
    var dev = angles.map(function (a) { return Math.abs(a - avg); });
    var maxDev = Math.max.apply(null, dev);
    commonAngle = { angle: Math.round(avg * 1e6) / 1e6, maxDeviation: Math.round(maxDev * 1e6) / 1e6 };
  }
  var gaps = [];
  for (var i = 1; i < boxes.length; i += 1) {
    gaps.push(Math.round((boxes[i].top - (boxes[i - 1].top + boxes[i - 1].height)) * 1e6) / 1e6);
  }
  var maxLineWidth = 0;
  boxes.forEach(function (bb) { maxLineWidth = Math.max(maxLineWidth, bb.width); });
  return {
    count: boxes.length,
    union: { left: Math.round(union.left * 1e6) / 1e6, top: Math.round(union.top * 1e6) / 1e6, width: Math.round((union.right - union.left) * 1e6) / 1e6, height: Math.round((union.bottom - union.top) * 1e6) / 1e6 },
    commonAngle: commonAngle,
    maxLineWidth: Math.round(maxLineWidth * 1e6) / 1e6,
    lineGaps: gaps,
    totalVisualHeight: Math.round((union.bottom - union.top) * 1e6) / 1e6
  };
}

// C：多行合成 → 唯一 textbox 目标几何。
// input: { lineQuads, lineCount, fontSize, lineHeightRatio, layoutWidth, angle, minWidth }
// 返回 { left, top, width, height, angle, maxLineWidth, evidence }
function synthesizeTextLayout(input) {
  var o = input || {};
  if (!Array.isArray(o.lineQuads) || !o.lineQuads.length) return null;
  var dq = describeLineQuads(o.lineQuads);
  if (!dq) return null;
  var fontSize = icIsFiniteNum(o.fontSize) ? o.fontSize : 14;
  var ratio = icIsFiniteNum(o.lineHeightRatio) && o.lineHeightRatio > 0 ? o.lineHeightRatio : 1.3;
  var layoutW = icIsFiniteNum(o.layoutWidth) && o.layoutWidth > 0 ? o.layoutWidth : dq.maxLineWidth;
  var minW = icIsFiniteNum(o.minWidth) ? o.minWidth : 60;
  var lines = icIsFiniteNum(o.lineCount) ? o.lineCount : dq.count;
  var unionH = dq.union.height;
  var textH = Math.round(lines * fontSize * ratio);
  var height = Math.max(unionH, textH, 12);
  var width = Math.max(minW, layoutW, dq.maxLineWidth);
  var angle = (o.angle != null && icIsFiniteNum(o.angle)) ? Math.round(o.angle * 1e6) / 1e6
    : (dq.commonAngle ? dq.commonAngle.angle : 0);
  return {
    left: Math.round(dq.union.left * 1e6) / 1e6,
    top: Math.round(dq.union.top * 1e6) / 1e6,
    width: Math.round((width + 4) * 1e6) / 1e6,
    height: Math.round((height + 4) * 1e6) / 1e6,
    angle: angle,
    maxLineWidth: dq.maxLineWidth,
    lineSpacingEstimate: dq.lineGaps.length ? dq.lineGaps.reduce(function (s, g) { return s + g; }, 0) / dq.lineGaps.length : null,
    evidence: { lineQuads: dq.count, union: dq.union, commonAngle: dq.commonAngle, lineGaps: dq.lineGaps, sourceLineCount: lines, fontSize: fontSize, lineHeightRatio: ratio, basis: "canvas-line-quads" }
  };
}

if (typeof module !== "undefined" && module.exports) module.exports = { medianLineInk, solveMedianInkFontSize, describeLineQuads, synthesizeTextLayout };