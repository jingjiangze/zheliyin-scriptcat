// =====================================================================
// 折立印名片套版助手 - ImageInk Geometry Recovery（OCR-P1 Commit 4.3, §六）
// ---------------------------------------------------------------------
// ImageInk 只提供视觉几何证据（ink bbox / ink width / ink height / ink center /
// confidence），绝不提供 text —— TEXT TRUTH 恒为 Native OCR。
// 输入：已经确认的 Native text + Native anchor（区域提示） + 图片像素（gray）。
// 流程：anchor(或 caller 给定 region) → measureImageInk(gray, region) →
//       输出 IMAGE_NATURAL 系 geometry evidence（任务书 §七 schema）。
// 铁律：
//   - 无可靠区域（anchor 缺失 / NO_MATCH）→ { ok:false, reason:"NO_ANCHOR_REGION" }，
//     不猜测、不居中、不偏移（任务书 §四/§八）；
//   - 复用 image-ink-target.js 的局部 Otsu 少数类前景测量（既有真机算法）；
//   - 输出 geometry 必须带 coordinateSpace=IMAGE_NATURAL。
// 纯函数、自包含（无 require；本文件内嵌 measure 实现以保持沙箱自包含，
// 与 image-ink-target 同语义，二者二选一注入由调用方决定）。
// =====================================================================
"use strict";

function isNum(v) { return typeof v === "number" && isFinite(v); }

// 区域灰度 Otsu + 少数类前景 bbox（与 image-ink-target.measureImageInk 同内核）
function measureRegionInk(gray, width, height, region) {
  var r = region || {};
  var x0 = Math.max(0, Math.floor(r.x || 0));
  var y0 = Math.max(0, Math.floor(r.y || 0));
  var x1 = Math.min(width - 1, Math.ceil((r.x || 0) + (r.width || 0)));
  var y1 = Math.min(height - 1, Math.ceil((r.y || 0) + (r.height || 0)));
  var ws = x1 - x0, hs = y1 - y0;
  if (!gray || !isNum(width) || !isNum(height) || ws < 2 || hs < 2) return { ok: false, reason: "NO_REGION" };
  var hist = new Array(256).fill(0);
  var total = 0, sum = 0;
  var y, x;
  for (y = y0; y < y1; y += 1) for (x = x0; x < x1; x += 1) { var g = gray[y * width + x]; hist[g] += 1; total += 1; sum += g; }
  if (total < 16) return { ok: false, reason: "NO_INK" };
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
  if (!found) return { ok: false, reason: "NO_INK" };
  var dark = 0;
  for (y = y0; y < y1; y += 1) for (x = x0; x < x1; x += 1) if (gray[y * width + x] <= th) dark += 1;
  var takeDark = dark <= total - dark;
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, cnt = 0;
  for (y = y0; y < y1; y += 1) {
    for (x = x0; x < x1; x += 1) {
      var gv = gray[y * width + x];
      var fg = takeDark ? (gv <= th) : (gv > th);
      if (!fg) continue;
      cnt += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!(cnt >= 6 && maxX >= minX && maxY >= minY) || !isFinite(minX)) return { ok: false, reason: "NO_INK" };
  var inkW = maxX - minX + 1, inkH = maxY - minY + 1;
  return {
    ok: true,
    inkWidth: inkW,
    inkHeight: inkH,
    inkBox: { x: minX, y: minY, width: inkW, height: inkH },
    coverage: Math.round((cnt / total) * 10000) / 10000,
    threshold: th,
    method: "LOCAL_OTSU_MINORITY_FOREGROUND",
    confidence: Math.round((cnt / total) * 100) / 100
  };
}

// resolveInkGeometry({ native, region, gray, imageWidth, imageHeight })
//   native：{ nativeText, ... }（仅上下文；本模块不输出 text）
//   region：ImageInk 测量区域（IMAGE_NATURAL 系）；anchor 命中时由调用方从 anchor.geometry 提供
// out: {
//   ok, source:"IMAGE_INK", reason,
//   geometry: { x, y, width, height, angle:0, coordinateSpace:"IMAGE_NATURAL",
//               inkWidth, inkHeight, inkCenter:{x,y}, confidence } | null
// }
function resolveInkGeometry(input) {
  if (!input) return { ok: false, source: "IMAGE_INK", reason: "NO_INPUT" };
  if (!input.region || !(isNum(input.region.x) && isNum(input.region.width) && isNum(input.region.height))) {
    return { ok: false, source: "IMAGE_INK", reason: "NO_ANCHOR_REGION" }; // 不猜位置
  }
  var m = measureRegionInk(input.gray, input.imageWidth, input.imageHeight, input.region);
  if (!m.ok) return { ok: false, source: "IMAGE_INK", reason: m.reason };
  return {
    ok: true,
    source: "IMAGE_INK",
    reason: "OK",
    geometry: {
      x: m.inkBox.x, y: m.inkBox.y, width: m.inkWidth, height: m.inkHeight,
      angle: 0, coordinateSpace: "IMAGE_NATURAL",
      inkWidth: m.inkWidth, inkHeight: m.inkHeight,
      inkCenter: { x: m.inkBox.x + m.inkWidth / 2, y: m.inkBox.y + m.inkHeight / 2 },
      confidence: m.confidence,
      method: m.method
    }
  };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  resolveInkGeometry: resolveInkGeometry,
  measureRegionInk: measureRegionInk
};
