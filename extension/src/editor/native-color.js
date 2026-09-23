// =====================================================================
// 折立印名片套版助手 - Native Color（Stage 10-A）
// ---------------------------------------------------------------------
// 纯数据/纯逻辑模块，不持有 DOM / Fabric / 网络。职责：
//   1. normalizeColor(input)        任意常见颜色写法 → "#rrggbb"（小写）
//   2. isValidColor(input)          是否可解析
//   3. extractFill(descriptor)      从对象/媒体描述提取 {fill,stroke,strokeWidth,opacity}
//   4. compareColor(req, act, opts) EXACT / NEAR / MISMATCH / UNKNOWN
//   5. extractForegroundColor()     源图 OCR bbox 内前景（Otsu 少数类）主色提取
// 铁律（Stage 10-A §六/§九/§二十）：
//   - 颜色必须来自 Source Image 前景像素，禁止 OCR/AI 决定颜色；
//   - 禁止 bbox 平均 RGB（背景/纹理/阴影污染）；必须依赖 foreground mask；
//   - 请看黑色/白色文字：dark-pixel / light-pixel 浓度优先稳定主色，不取平均；
//   - 像素坐标一律 IMAGE_PIXEL（调用方负责 image-space 映射），禁止 Canvas CSS/viewport。
// 纯函数 node 可测；页面世界只负责读像素并调用本模块。
// =====================================================================
"use strict";

// ---- 颜色归一化（hex3/hex6/rgb()/rgba()/常见 named）----
var NAMED = { black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", blue: "#0000ff", gold: "#ffd700", gray: "#808080", grey: "#808080", silver: "#c0c0c0", darkgray: "#a9a9a9", darkgrey: "#a9a9a9", dimgray: "#696969", dimgrey: "#696969", lightgray: "#d3d3d3", lightgrey: "#d3d3d3", orange: "#ffa500", yellow: "#ffff00", purple: "#800080", pink: "#ffc0cb", brown: "#a52a2a", navy: "#000080", teal: "#008080", cyan: "#00ffff", magenta: "#ff00ff", maroon: "#800000", olive: "#808000", lime: "#00ff00", aqua: "#00ffff", fuchsia: "#ff00ff", transparent: null };
function normalizeColor(input) {
  if (input == null) return null;
  var s = String(input).trim().toLowerCase();
  if (NAMED.hasOwnProperty(s)) return NAMED[s] === null ? null : NAMED[s];
  // #rgb / #rrggbb / #rrggbbaa
  var hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (hex) {
    var h = hex[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length === 8) h = h.slice(0, 6); // 忽略 alpha 位（本轮只控制 fill；alpha 单独字段）
    return "#" + h;
  }
  // rgb(r,g,b) / rgba(r,g,b,a)（支持 0-255 或 0-100%）
  var m = /^rgba?\(\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*(?:,\s*[\d.]+%?\s*)?\)$/.exec(s);
  if (m) {
    var conv = function (v) { return String(v).indexOf("%") >= 0 ? Math.round(255 * parseFloat(v) / 100) : Math.round(parseFloat(v)); };
    var r = conv(m[1]), g = conv(m[2]), b = conv(m[3]);
    if ([r, g, b].every(function (x) { return isFinite(x) && x >= 0 && x <= 255; })) {
      return "#" + [r, g, b].map(function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
    }
  }
  var hsv = /^hsl?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*[\d.]+%?\s*)?\)$/.exec(s);
  if (hsv) {
    try {
      var hh = ((parseFloat(hsv[1]) % 360) + 360) % 360, ss = parseFloat(hsv[2]) / 100, ll = parseFloat(hsv[3]) / 100;
      var rgb = hslToRgb(hh, ss, ll);
      return "#" + rgb.map(function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
    } catch (e) { return null; }
  }
  return null;
}
function hslToRgb(h, s, l) {
  var c = (1 - Math.abs(2 * l - 1)) * s;
  var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  var m = l - c / 2;
  var r0 = 0, g0 = 0, b0 = 0;
  if (h < 60) { r0 = c; g0 = x; } else if (h < 120) { r0 = x; g0 = c; } else if (h < 180) { g0 = c; b0 = x; } else if (h < 240) { g0 = x; b0 = c; } else if (h < 300) { r0 = x; b0 = c; } else { r0 = c; b0 = x; }
  return [Math.round((r0 + m) * 255), Math.round((g0 + m) * 255), Math.round((b0 + m) * 255)];
}
function isValidColor(input) { return normalizeColor(input) != null; }
function hexToRgb(hex) {
  var n = normalizeColor(hex);
  if (!n) return null;
  return { r: parseInt(n.slice(1, 3), 16), g: parseInt(n.slice(3, 5), 16), b: parseInt(n.slice(5, 7), 16) };
}

// ---- extractFill：从对象/媒体描述提取颜色字段（不持 Fabric 引用）----
function extractFill(descriptor) {
  var o = descriptor || {};
  var fill = void 0, stroke = void 0, strokeWidth = void 0, opacity = void 0;
  if (typeof o.fill !== "undefined") fill = o.fill;
  else if (o.font && typeof o.font.fontColor !== "undefined") fill = o.font.fontColor;
  if (typeof o.stroke !== "undefined") stroke = o.stroke;
  else if (o.font && typeof o.font.strokeColor !== "undefined") stroke = o.font.strokeColor;
  if (typeof o.strokeWidth !== "undefined") strokeWidth = o.strokeWidth;
  if (typeof o.opacity !== "undefined") opacity = o.opacity;
  else if (o.layer && typeof o.layer.alpha !== "undefined") opacity = o.layer.alpha;
  return { fill: normalizeColor(fill), stroke: normalizeColor(stroke), strokeWidth: (typeof strokeWidth === "number") ? strokeWidth : null, opacity: (typeof opacity === "number") ? opacity : null, source: "DESCRIPTOR" };
}

// ---- compareColor：requested vs actual ----
// level: EXACT（归一化后完全一致）| NEAR（欧氏差 ≤ nearTol 且同亮度带）| MISMATCH | UNKNOWN（任一侧无可靠色）
function compareColor(requested, actual, opts) {
  var o = opts || {};
  var nearTol = (typeof o.nearTol === "number") ? o.nearTol : 32; // RGB 欧氏距离（第一版诊断阈值）
  var rq = normalizeColor(requested);
  var ac = normalizeColor(actual);
  var out = { normalizedRequest: rq, normalizedActual: ac };
  if (!rq || !ac) { out.level = "UNKNOWN"; out.deltaRgb = null; return out; }
  var a = hexToRgb(rq), b = hexToRgb(ac);
  var dR = a.r - b.r, dG = a.g - b.g, dB = a.b - b.b;
  var delta = Math.round(Math.sqrt(dR * dR + dG * dG + dB * dB) * 100) / 100;
  out.deltaRgb = delta;
  out.level = (rq === ac) ? "EXACT" : (delta <= nearTol ? "NEAR" : "MISMATCH");
  return out;
}

// ---- 前景主色提取（纯像素）----
// input: { data: Uint8ClampedArray(RGBA), width, height, bbox: {x,y,width,height} }
// 输出: { ok, color, confidence, source, sampleCount, coverage, method, threshold }
function extractForegroundColor(input) {
  var o = input || {};
  var d = o.data, w = o.width, h = o.height, bb = o.bbox || { x: 0, y: 0, width: w, height: h };
  if (!d || !(w > 0) || !(h > 0)) return { ok: false, reason: "NO_PIXELS", color: null, confidence: 0, source: "IMAGE_INK_FOREGROUND", sampleCount: 0, coverage: 0 };
  var x0 = Math.max(0, Math.floor(bb.x)), y0 = Math.max(0, Math.floor(bb.y));
  var x1 = Math.min(w - 1, Math.ceil(bb.x + bb.width)), y1 = Math.min(h - 1, Math.ceil(bb.y + bb.height));
  if (x1 <= x0 || y1 <= y0) return { ok: false, reason: "NO_REGION", color: null, confidence: 0, source: "IMAGE_INK_FOREGROUND", sampleCount: 0, coverage: 0 };
  // 灰度 + 局部 Otsu（与 image-ink-target 同一内核）
  var hist = new Array(256).fill(0);
  var total = 0, sum = 0, th = 128, found = false;
  for (var y = y0; y < y1; y += 1) {
    for (var x = x0; x < x1; x += 1) {
      var i = (y * w + x) * 4;
      var a = d[i + 3];
      if (a < 32) continue; // 排除极低 alpha
      var g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      hist[g] += 1; total += 1; sum += g;
    }
  }
  if (total < 16) return { ok: false, reason: "NO_INK", color: null, confidence: 0, source: "IMAGE_INK_FOREGROUND", sampleCount: total, coverage: 0 };
  var sumB = 0, wB = 0, maxVar = 0;
  for (var t = 0; t < 256; t += 1) {
    wB += hist[t]; if (wB === 0) continue;
    var wF = total - wB; if (wF === 0) break;
    sumB += t * hist[t];
    var mB = sumB / wB, mF = (sum - sumB) / wF;
    var v = wB * wF * (mB - mF) * (mB - mF);
    if (v > maxVar) { maxVar = v; th = t; found = true; }
  }
  if (!found) return { ok: false, reason: "NO_INK", color: null, confidence: 0, source: "IMAGE_INK_FOREGROUND", sampleCount: total, coverage: 0 };
  // 少数类 = 前景（极性无关）
  var dark = 0;
  for (var y2 = y0; y2 < y1; y2 += 1) for (var x2 = x0; x2 < x1; x2 += 1) {
    var i2 = (y2 * w + x2) * 4; if (d[i2 + 3] < 32) continue;
    if (Math.round(0.299 * d[i2] + 0.587 * d[i2 + 1] + 0.114 * d[i2 + 2]) <= th) dark += 1;
  }
  var takeDark = dark <= total - dark;
  // 颜色分桶（16 级/通道 → 4096 bin）+ 邻域合并求稳定主色
  var BUCKET = 16;
  var bins = {};
  var fg = [];
  for (var y3 = y0; y3 < y1; y3 += 1) {
    for (var x3 = x0; x3 < x1; x3 += 1) {
      var i3 = (y3 * w + x3) * 4;
      var a3 = d[i3 + 3];
      if (a3 < 32) continue;
      var g3 = Math.round(0.299 * d[i3] + 0.587 * d[i3 + 1] + 0.114 * d[i3 + 2]);
      var fg3 = takeDark ? (g3 <= th) : (g3 > th);
      if (!fg3) continue;
      var r3 = d[i3], gv3 = d[i3 + 1], b3 = d[i3 + 2];
      var br = Math.floor(r3 / (256 / BUCKET)), bg2 = Math.floor(gv3 / (256 / BUCKET)), bb2 = Math.floor(b3 / (256 / BUCKET));
      var key = br + "," + bg2 + "," + bb2;
      if (!bins[key]) bins[key] = { key: key, r: 0, g: 0, b: 0, count: 0 };
      bins[key].r += r3; bins[key].g += gv3; bins[key].b += b3; bins[key].count += 1;
      fg.push({ r: r3, g: gv3, b: b3 });
    }
  }
  if (!fg.length) return { ok: false, reason: "NO_INK", color: null, confidence: 0, source: "IMAGE_INK_FOREGROUND", sampleCount: total, coverage: 0 };
  var keys = Object.keys(bins);
  var topKey = keys[0], topCount = bins[topKey].count;
  for (var k = 1; k < keys.length; k += 1) if (bins[keys[k]].count > topCount) { topCount = bins[keys[k]].count; topKey = keys[k]; }
  // 邻域合并（切比雪夫 ≤1）：吸纳 ≥ top*0.25 的相邻桶，加权平均稳定主色
  var accR = 0, accG = 0, accB = 0, accN = 0;
  var topParts = topKey.split(",").map(Number);
  keys.forEach(function (kk) {
    var parts = kk.split(",").map(Number);
    var dR = Math.abs(parts[0] - topParts[0]), dG = Math.abs(parts[1] - topParts[1]), dB = Math.abs(parts[2] - topParts[2]);
    if (dR <= 1 && dG <= 1 && dB <= 1 && bins[kk].count >= topCount * 0.25) {
      accR += bins[kk].r; accG += bins[kk].g; accB += bins[kk].b; accN += bins[kk].count;
    }
  });
  if (!accN) { accR = bins[topKey].r; accG = bins[topKey].g; accB = bins[topKey].b; accN = bins[topKey].count; }
  var color = "#" + [accR, accG, accB].map(function (v) { return ("0" + Math.round(v / accN).toString(16)).slice(-2); }).join("");
  var coverage = Math.round((fg.length / total) * 10000) / 10000;
  var sampleCount = fg.length;
  var confidence = Math.round((accN / sampleCount) * 10000) / 10000;
  // Commit 4.6-D（§12）：第二主桶（多模态检测）—— 邻域合并前的原始桶规模对比
  var secondKey = null, secondCount = 0;
  for (var k2 = 0; k2 < keys.length; k2 += 1) {
    var k2b = bins[keys[k2]];
    if (keys[k2] === topKey) continue;
    if (k2b.count > secondCount) { secondCount = k2b.count; secondKey = keys[k2]; }
  }
  // Commit 4.6-D（§12）：颜色证据可靠性派生值
  var dominance = confidence;
  var ambiguity = (secondCount > 0 && topCount > 0) ? Math.round((secondCount / topCount) * 10000) / 10000 : 0;
  var multiModal = ambiguity >= 0.6;
  // 黑/白紧凑度：主色本身黑/白时置信度按暗/亮浓度强化（不做平均化）
  var maxC = Math.max(accR, accG, accB) / accN, minC = Math.min(accR, accG, accB) / accN;
  var darkish = maxC < 110, whitish = minC > 170;
  return {
    ok: true, color: color, confidence: confidence, source: "IMAGE_INK_FOREGROUND",
    sampleCount: sampleCount, coverage: coverage, method: "LOCAL_OTSU_FG_BUCKET_MERGE", threshold: th,
    takeDark: takeDark, darkish: darkish, whitish: whitish,
    // Commit 4.6-D（§12）：颜色证据可靠性字段 ——
    //   dominance     主色簇（合并后）占全部前景的比例（集中度）
    //   ambiguity     第二主桶规模 / 主桶规模（多峰程度；0=单一, →1=近似双峰）
    //   multiModal    ambiguity 高于阈值时显式标记（不得依赖单一主色）
    dominance: dominance, ambiguity: ambiguity, multiModal: multiModal
  };
}

// Commit 4.6-D（§12）：生产应用门禁 —— 颜色证据弱时「不得设置 fill，保留 Native 默认色」。
// 必须满足：foreground 可靠（ok）＋ 主色充分集中（dominance ≥ 门槛）＋ 非明显多峰（!multiModal）。
// 门槛温和可调（opts.minDominance / opts.maxAmbiguity）；不设极端固定阈值。
function shouldApplyFill(o, opts) {
  var opt = opts || {};
  var minD = typeof opt.minDominance === "number" ? opt.minDominance : 0.35;
  var maxA = typeof opt.maxAmbiguity === "number" ? opt.maxAmbiguity : 0.6;
  if (!o || o.ok !== true || !o.color) return { apply: false, reason: "NO_EVIDENCE" };
  if (o.multiModal === true) return { apply: false, reason: "MULTI_MODAL", dominance: o.dominance, ambiguity: o.ambiguity };
  if (typeof o.dominance === "number" && o.dominance < minD) return { apply: false, reason: "DOMINANCE_LOW", dominance: o.dominance, ambiguity: o.ambiguity };
  if (typeof o.ambiguity === "number" && o.ambiguity > maxA) return { apply: false, reason: "AMBIGUITY_HIGH", dominance: o.dominance, ambiguity: o.ambiguity };
  return { apply: true, reason: "FOREGROUND_RELIABLE", dominance: o.dominance, ambiguity: o.ambiguity };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  shouldApplyFill: shouldApplyFill,
  normalizeColor: normalizeColor, isValidColor: isValidColor, extractFill: extractFill,
  compareColor: compareColor, extractForegroundColor: extractForegroundColor, hexToRgb: hexToRgb
};