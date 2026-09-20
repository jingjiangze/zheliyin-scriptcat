// =====================================================================
// extension/src/editor/image-ink-target.js — Stage 9 P4-B §四/§五/§二十三
// ---------------------------------------------------------------------
// 单一职责：从源图像素提取 OCR block 区域内的「真实前景墨迹 bbox」。
//   输入：gray（Uint8Array 灰度，length=width*height）＋ region（{x,y,width,height}）
//   输出：{ ok, inkWidth, inkHeight, inkBox, coverage, threshold, method, confidence, reason }
// 算法：局部 Otsu ＋ 少数类前景 bbox（极性无关：深字亮底 / 亮字深底）。
//   —— 与 baidu-geometry-benchmark 的局部墨水法同一内核（复用既有真机算法，不重造）。
// 铁律（§四/§五）：
//   - 不依赖 Native/任何 OCR 文本；不修改 text/pageId/transactionId/targetQuad/OCR bbox
//   - 全背景 / 空区域 / 前景过少 → 显式 reason（NO_INK / NO_REGION），禁止静默伪造 inkWidth
//   - 不做 Math.max(inkWidth, bboxWidth) 之类的“安全修复”
// 纯函数（node 可测；@require 沙箱同 scope 声明）。
// =====================================================================
"use strict";

// RGBA → 灰度（与浏览器 getImageData 解耦，便于 node 单测）
function rgbaToGray(imageData, width, height) {
  var out = new Uint8Array(width * height);
  var d = imageData && imageData.data ? imageData.data : imageData;
  if (!d) return out;
  for (var i = 0; i < width * height; i += 1) {
    var j = i * 4;
    var r = +d[j], g = +d[j + 1], b = +d[j + 2];
    out[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return out;
}

// 区域内局部 Otsu 阈值（双类方差最大）
function otsuThreshold(gray, width, height, x0, y0, x1, y1) {
  var hist = new Array(256).fill(0);
  var sum = 0, total = 0;
  for (var y = y0; y < y1; y += 1) {
    for (var x = x0; x < x1; x += 1) {
      var g = gray[y * width + x];
      hist[g] += 1; total += 1; sum += g;
    }
  }
  if (total < 16) return null; // 区域过小无法统计
  var sumB = 0, wB = 0, maxVar = 0, th = 128, found = false;
  for (var t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (wB === 0) continue;
    var wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    var mB = sumB / wB, mF = (sum - sumB) / wF;
    var v = wB * wF * (mB - mF) * (mB - mF);
    if (v > maxVar) { maxVar = v; th = t; found = true; }
  }
  return found ? th : null;
}

// 主入口：测量区域墨迹
// region: {x, y, width, height}（图片像素坐标系，整型钳制）
function measureImageInk(gray, width, height, region) {
  var r = region || {};
  var x0 = Math.max(0, Math.floor(r.x || 0));
  var y0 = Math.max(0, Math.floor(r.y || 0));
  var x1 = Math.min(width - 1, Math.ceil((r.x || 0) + (r.width || 0)));
  var y1 = Math.min(height - 1, Math.ceil((r.y || 0) + (r.height || 0)));
  var ws = x1 - x0, hs = y1 - y0;
  if (!gray || ws < 2 || hs < 2 || x1 < x0 || y1 < y0) {
    return { ok: false, reason: "NO_REGION", inkWidth: null, inkHeight: null, inkBox: null, coverage: null, threshold: null, method: "LOCAL_OTSU_MINORITY_FOREGROUND", confidence: null };
  }
  var th = otsuThreshold(gray, width, height, x0, y0, x1, y1);
  if (th == null) {
    return { ok: false, reason: "NO_INK", inkWidth: null, inkHeight: null, inkBox: null, coverage: null, threshold: null, method: "LOCAL_OTSU_MINORITY_FOREGROUND", confidence: null };
  }
  // 前景 = 少数类（极性无关）
  var dark = 0, total = ws * hs;
  for (var y = y0; y < y1; y += 1) for (var x = x0; x < x1; x += 1) if (gray[y * width + x] <= th) dark += 1;
  var takeDark = dark <= total - dark;
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, cnt = 0;
  for (var yy = y0; yy < y1; yy += 1) {
    for (var xx = x0; xx < x1; xx += 1) {
      var g = gray[yy * width + xx];
      var fg = takeDark ? (g <= th) : (g > th);
      if (!fg) continue;
      cnt += 1;
      if (xx < minX) minX = xx;
      if (xx > maxX) maxX = xx;
      if (yy < minY) minY = yy;
      if (yy > maxY) maxY = yy;
    }
  }
  if (!(cnt >= 6 && maxX >= minX && maxY >= minY) || !isFinite(minX)) {
    return { ok: false, reason: "NO_INK", inkWidth: null, inkHeight: null, inkBox: null, coverage: null, threshold: th, method: "LOCAL_OTSU_MINORITY_FOREGROUND", confidence: null };
  }
  var inkW = maxX - minX + 1, inkH = maxY - minY + 1;
  return {
    ok: true,
    inkWidth: inkW,
    inkHeight: inkH,
    inkBox: { x: minX, y: minY, width: inkW, height: inkH },
    coverage: Math.round((cnt / total) * 10000) / 10000,
    threshold: th,
    method: "LOCAL_OTSU_MINORITY_FOREGROUND",
    confidence: Math.round((cnt / total) * 100) / 100, // 前景占比（0..1）
    reason: "OK"
  };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  rgbaToGray: rgbaToGray,
  otsuThreshold: otsuThreshold,
  measureImageInk: measureImageInk
};