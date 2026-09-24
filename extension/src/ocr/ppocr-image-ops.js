// =====================================================================
// 折立印名片套版助手 - PP-OCR 图像预处理与裁切（Stage 12 M3-1：image ops）
// ---------------------------------------------------------------------
// 职责（单一职责）：OCR 张量前的纯图像运算（无 canvas / 无 DOM / 无网络）：
//   1. resizeRgbaBilinear   RGBA 源图 → 双线性缩放（输出 RGB float 0..255）
//   2. toChwTensor          归一化 + NCHW 排布（det / rec 两套 mean/std 预设）
//   3. rectFromPolygon      4 点多边形 → {center,u,n,width,height}（det 输出 → rec 裁切输入）
//   4. cropRectBilinear     旋转感知裁切（rec 3x48xW / cls 3x48x192），支持 180° 翻转
// 通道顺序（重要）：PaddleOCR 训练/推理按 **BGR** 顺序喂入（cv2 读图惯例），
//   本模块默认 channelOrder="bgr"；如实测需 RGB 可切换（不硬编码猜测）。
// 归一化（与 PaddleOCR 一致）：
//   det: (px/255 - mean[0.485,0.456,0.406]) / std[0.229,0.224,0.225]
//   rec/cls: (px/255 - 0.5) / 0.5
// 纯函数、自包含（无 require）；node 可单测。
// =====================================================================
"use strict";

var PPOCR_DET_MEAN = [0.485, 0.456, 0.406];
var PPOCR_DET_STD = [0.229, 0.224, 0.225];
var PPOCR_REC_MEAN = [0.5, 0.5, 0.5];
var PPOCR_REC_STD = [0.5, 0.5, 0.5];
var PPOCR_REC_HEIGHT = 48;
var PPOCR_REC_MAX_WIDTH = 320;
var PPOCR_CLS_HEIGHT = 80;   // 真实 cls 模型输入高（ORT 报错实证：Expected 80）
var PPOCR_CLS_WIDTH = 160;   // 真实 cls 模型输入宽（固定，不按长宽比）
var PPOCR_DEFAULT_CHANNEL_ORDER = "bgr";

function zyImgIsNum(v) { return typeof v === "number" && isFinite(v); }
function zyImgClamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

// ---- 1. RGBA 源图 → 双线性缩放（输出 RGB，0..255） ----
// image: { data: Uint8ClampedArray|Uint8Array, width, height, channels?:3|4 }
function resizeRgbaBilinear(image, dstW, dstH) {
  if (!image || !image.data || !image.width || !image.height || !dstW || !dstH) {
    return { ok: false, errorCode: "IMAGE_INVALID", data: null, width: 0, height: 0 };
  }
  var sw = image.width, sh = image.height;
  var ch = image.channels || 4;
  var src = image.data;
  var out = new Float32Array(dstW * dstH * 3);
  var xRatio = sw / dstW, yRatio = sh / dstH;
  for (var dy = 0; dy < dstH; dy += 1) {
    var sy = (dy + 0.5) * yRatio - 0.5;
    var y0 = Math.floor(sy);
    var fy = sy - y0;
    var y0c = zyImgClamp(y0, 0, sh - 1), y1c = zyImgClamp(y0 + 1, 0, sh - 1);
    for (var dx = 0; dx < dstW; dx += 1) {
      var sx = (dx + 0.5) * xRatio - 0.5;
      var x0 = Math.floor(sx);
      var fx = sx - x0;
      var x0c = zyImgClamp(x0, 0, sw - 1), x1c = zyImgClamp(x0 + 1, 0, sw - 1);
      var i00 = (y0c * sw + x0c) * ch, i01 = (y0c * sw + x1c) * ch;
      var i10 = (y1c * sw + x0c) * ch, i11 = (y1c * sw + x1c) * ch;
      var o = (dy * dstW + dx) * 3;
      for (var c = 0; c < 3; c += 1) {
        var v00 = src[i00 + c], v01 = src[i01 + c], v10 = src[i10 + c], v11 = src[i11 + c];
        var top = v00 + (v01 - v00) * fx;
        var bot = v10 + (v11 - v10) * fx;
        out[o + c] = top + (bot - top) * fy;
      }
    }
  }
  return { ok: true, data: out, width: dstW, height: dstH, channels: 3 };
}

// ---- 2. 归一化 + NCHW ----
// rgbImage: { data: Float32Array(RGB 0..255), width, height }
// opts: { mean, std, channelOrder: "bgr"|"rgb", scale?: 1 }
function toChwTensor(rgbImage, opts) {
  var o = opts || {};
  if (!rgbImage || !rgbImage.data || !rgbImage.width || !rgbImage.height) {
    return { ok: false, errorCode: "IMAGE_INVALID", data: null, dims: null };
  }
  var mean = Array.isArray(o.mean) && o.mean.length === 3 ? o.mean : PPOCR_REC_MEAN;
  var std = Array.isArray(o.std) && o.std.length === 3 ? o.std : PPOCR_REC_STD;
  var scale = zyImgIsNum(o.scale) ? o.scale : 1 / 255;
  var order = o.channelOrder === "rgb" ? "rgb" : PPOCR_DEFAULT_CHANNEL_ORDER;
  var w = rgbImage.width, h = rgbImage.height;
  var plane = w * h;
  var out = new Float32Array(3 * plane);
  var src = rgbImage.data;
  // BGR：模型看到的 0/1/2 通道依次是 B/G/R（源数据是 RGB）
  var map = order === "bgr" ? [2, 1, 0] : [0, 1, 2];
  for (var y = 0; y < h; y += 1) {
    for (var x = 0; x < w; x += 1) {
      var si = (y * w + x) * 3;
      var pi = y * w + x;
      for (var c = 0; c < 3; c += 1) {
        out[c * plane + pi] = (src[si + map[c]] * scale - mean[c]) / std[c];
      }
    }
  }
  return { ok: true, data: out, dims: { channels: 3, width: w, height: h }, normalization: { mean: mean, std: std, scale: scale, channelOrder: order } };
}

// ---- 3. 4 点多边形 → 旋转矩形基（u 为长轴方向） ----
function rectFromPolygon(polygon) {
  var pts = (polygon || []).filter(function (p) { return p && zyImgIsNum(p.x) && zyImgIsNum(p.y); });
  if (pts.length < 4) return null;
  // 边 0→1 为主方向 u，边 1→2 为 n；取较长边为长轴保证宽>高
  var d01 = { x: pts[1].x - pts[0].x, y: pts[1].y - pts[0].y };
  var d12 = { x: pts[2].x - pts[1].x, y: pts[2].y - pts[1].y };
  var l01 = Math.sqrt(d01.x * d01.x + d01.y * d01.y);
  var l12 = Math.sqrt(d12.x * d12.x + d12.y * d12.y);
  var u = l01 >= l12 ? { x: d01.x / l01, y: d01.y / l01 } : { x: d12.x / l12, y: d12.y / l12 };
  var n = { x: -u.y, y: u.x };
  var minU = Infinity, maxU = -Infinity, minN = Infinity, maxN = -Infinity;
  pts.forEach(function (p) {
    var pu = p.x * u.x + p.y * u.y, pn = p.x * n.x + p.y * n.y;
    if (pu < minU) minU = pu;
    if (pu > maxU) maxU = pu;
    if (pn < minN) minN = pn;
    if (pn > maxN) maxN = pn;
  });
  var cU = (minU + maxU) / 2, cN = (minN + maxN) / 2;
  return {
    center: { x: cU * u.x + cN * n.x, y: cU * u.y + cN * n.y },
    u: u, n: n,
    width: maxU - minU, height: maxN - minN,
    angle: Math.atan2(u.y, u.x)
  };
}

// ---- 4. 旋转感知裁切（源：原图像素；rec/cls 输入） ----
// opts: { outHeight=48, outWidth=null（给定则固定宽度，用于 cls 的 160）, minWidth=16, maxWidth=320, flip180=false }
function cropRectBilinear(image, rect, opts) {
  var o = opts || {};
  if (!image || !image.data || !rect) return { ok: false, errorCode: "IMAGE_INVALID", data: null, width: 0, height: 0 };
  var outH = zyImgIsNum(o.outHeight) && o.outHeight > 0 ? o.outHeight : PPOCR_REC_HEIGHT;
  var minW = zyImgIsNum(o.minWidth) ? o.minWidth : 16;
  var maxW = zyImgIsNum(o.maxWidth) ? o.maxWidth : PPOCR_REC_MAX_WIDTH;
  var outW;
  if (zyImgIsNum(o.outWidth) && o.outWidth > 0) {
    outW = Math.round(o.outWidth); // 固定宽度（cls：与长宽比无关）
  } else {
    var aspect = rect.height > 0 ? rect.width / rect.height : 1;
    outW = Math.round(zyImgClamp(outH * aspect, minW, maxW));
  }
  var flip = !!o.flip180;
  var sw = image.width, sh = image.height, ch = image.channels || 4, src = image.data;
  var u = flip ? { x: -rect.u.x, y: -rect.u.y } : rect.u;
  var n = flip ? { x: -rect.n.x, y: -rect.n.y } : rect.n;
  var out = new Float32Array(outW * outH * 3);
  for (var j = 0; j < outH; j += 1) {
    var v = ((j + 0.5) / outH - 0.5) * rect.height;
    for (var i = 0; i < outW; i += 1) {
      var t = ((i + 0.5) / outW - 0.5) * rect.width;
      var sx = rect.center.x + u.x * t + n.x * v;
      var sy = rect.center.y + u.y * t + n.y * v;
      var x0 = Math.floor(sx), y0 = Math.floor(sy);
      var fx = sx - x0, fy = sy - y0;
      var x0c = zyImgClamp(x0, 0, sw - 1), x1c = zyImgClamp(x0 + 1, 0, sw - 1);
      var y0c = zyImgClamp(y0, 0, sh - 1), y1c = zyImgClamp(y0 + 1, 0, sh - 1);
      var i00 = (y0c * sw + x0c) * ch, i01 = (y0c * sw + x1c) * ch;
      var i10 = (y1c * sw + x0c) * ch, i11 = (y1c * sw + x1c) * ch;
      var oo = (j * outW + i) * 3;
      for (var c = 0; c < 3; c += 1) {
        var v00 = src[i00 + c], v01 = src[i01 + c], v10 = src[i10 + c], v11 = src[i11 + c];
        var top = v00 + (v01 - v00) * fx;
        var bot = v10 + (v11 - v10) * fx;
        out[oo + c] = top + (bot - top) * fy;
      }
    }
  }
  return { ok: true, data: out, width: outW, height: outH, channels: 3 };
}

// ---- 便捷：det 输入张量（尺寸规划 + 缩放 + 归一化一步到位） ----
function buildDetTensor(image, resize, opts) {
  var o = opts || {};
  var rs = resize || { width: image && image.width, height: image && image.height, scale: 1 };
  var scaled = resizeRgbaBilinear(image, rs.width, rs.height);
  if (!scaled.ok) return scaled;
  var t = toChwTensor(scaled, { mean: PPOCR_DET_MEAN, std: PPOCR_DET_STD, channelOrder: o.channelOrder });
  if (!t.ok) return t;
  return { ok: true, data: t.data, dims: t.dims, resize: rs, normalization: t.normalization };
}

// ---- 便捷：rec 输入张量 ----
function buildRecTensor(image, rect, opts) {
  var o = opts || {};
  var crop = cropRectBilinear(image, rect, { outHeight: o.outHeight || PPOCR_REC_HEIGHT, outWidth: o.outWidth, maxWidth: o.maxWidth || PPOCR_REC_MAX_WIDTH, flip180: o.flip180 });
  if (!crop.ok) return crop;
  var t = toChwTensor(crop, { mean: PPOCR_REC_MEAN, std: PPOCR_REC_STD, channelOrder: o.channelOrder });
  if (!t.ok) return t;
  return { ok: true, data: t.data, dims: t.dims, crop: { width: crop.width, height: crop.height }, normalization: t.normalization };
}

// ---- 便捷：cls 输入张量（3x80x160，固定尺寸，不按长宽比） ----
function buildClsTensor(image, rect, opts) {
  var o = opts || {};
  return buildRecTensor(image, rect, {
    outHeight: o.outHeight || PPOCR_CLS_HEIGHT,
    outWidth: o.outWidth || PPOCR_CLS_WIDTH,
    maxWidth: o.outWidth || PPOCR_CLS_WIDTH,
    channelOrder: o.channelOrder
  });
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  PPOCR_DET_MEAN: PPOCR_DET_MEAN, PPOCR_DET_STD: PPOCR_DET_STD,
  PPOCR_REC_MEAN: PPOCR_REC_MEAN, PPOCR_REC_STD: PPOCR_REC_STD,
  PPOCR_REC_HEIGHT: PPOCR_REC_HEIGHT, PPOCR_REC_MAX_WIDTH: PPOCR_REC_MAX_WIDTH,
  PPOCR_CLS_HEIGHT: PPOCR_CLS_HEIGHT, PPOCR_CLS_WIDTH: PPOCR_CLS_WIDTH,
  PPOCR_DEFAULT_CHANNEL_ORDER: PPOCR_DEFAULT_CHANNEL_ORDER,
  resizeRgbaBilinear: resizeRgbaBilinear,
  toChwTensor: toChwTensor,
  rectFromPolygon: rectFromPolygon,
  cropRectBilinear: cropRectBilinear,
  buildDetTensor: buildDetTensor,
  buildRecTensor: buildRecTensor,
  buildClsTensor: buildClsTensor
};