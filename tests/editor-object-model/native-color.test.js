// tests/editor-object-model/native-color.test.js — Stage 10-A：Native Color 纯模块单测
// 覆盖 normalizeColor / isValidColor / extractFill / compareColor / extractForegroundColor（黑/白/彩色/污染/噪声）
"use strict";
const path = require("path");
const NC = require(path.join(__dirname, "..", "..", "extension", "src", "editor", "native-color.js"));
const { normalizeColor, isValidColor, extractFill, compareColor, extractForegroundColor } = NC;

const results = [];
const failures = [];
function t(name, cond, detail, d) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "") + (d ? " :: " + JSON.stringify(d) : "")); }
function near(a, b, eps) { return Math.abs(a - b) < (eps || 1e-6); }

// ================= normalizeColor =================
t("n-hex6", normalizeColor("#FFFFFF") === "#ffffff");
t("n-hex3", normalizeColor("#F00") === "#ff0000");
t("n-hex8-alpha-drop", normalizeColor("#123456ff") === "#123456");
t("n-rgb", normalizeColor("rgb(255, 0, 128)") === "#ff0080");
t("n-rgb-pct", normalizeColor("rgb(100%, 0%, 50%)") === "#ff0080");
t("n-rgba", normalizeColor("rgba(17,34,51,0.5)") === "#112233");
t("n-named", normalizeColor("black") === "#000000" && normalizeColor("White") === "#ffffff" && normalizeColor("GOLD") === "#ffd700");
t("n-hsl", normalizeColor("hsl(0,100%,50%)") === "#ff0000", "", normalizeColor("hsl(0,100%,50%)"));
t("n-invalid-1", normalizeColor("zzz") === null);
t("n-invalid-2", normalizeColor("") === null);
t("n-invalid-3", normalizeColor(undefined) === null);
t("n-transparent", normalizeColor("transparent") === null);
t("n-valid", isValidColor("#abc") && isValidColor("rgb(1,2,3)") && !isValidColor("nope"));

// ================= extractFill =================
const ef1 = extractFill({ fill: "#AABBCC", stroke: "rgb(255,0,0)", strokeWidth: 2, opacity: 0.8 });
t("ef-obj", ef1.fill === "#aabbcc" && ef1.stroke === "#ff0000" && ef1.strokeWidth === 2 && ef1.opacity === 0.8);
const ef2 = extractFill({ font: { fontColor: "#00FF00" }, layer: { alpha: 1 } });
t("ef-media", ef2.fill === "#00ff00" && ef2.opacity === 1);
const ef3 = extractFill({});
t("ef-empty", ef3.fill === null && ef3.stroke === null);

// ================= compareColor =================
const c1 = compareColor("#ff0000", "rgb(255,0,0)");
t("cc-exact", c1.level === "EXACT" && c1.deltaRgb === 0 && c1.normalizedRequest === "#ff0000" && c1.normalizedActual === "#ff0000");
const c2 = compareColor("#ff0000", "#ff0f00");
t("cc-near", c2.level === "NEAR", "", c2);
const c3 = compareColor("#000000", "#ffffff");
t("cc-mismatch", c3.level === "MISMATCH" && c3.deltaRgb > 200, "", c3);
const c4 = compareColor("#000000", null);
t("cc-unknown", c4.level === "UNKNOWN");
const c5 = compareColor(null, null);
t("cc-unknown2", c5.level === "UNKNOWN");

// ================= extractForegroundColor（构造 RGBA 图）================
// 合成图：W=40 H=20，白背景，中间黑字条（x 14..25, y 7..12）→ 应检出近黑
function synth(backRGB, fgRGB, fgRect, opts) {
  const W = 40, H = 20;
  const d = new Uint8ClampedArray(W * H * 4);
  const fill = (x, y, rgb) => { const i = (y * W + x) * 4; d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255; };
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) fill(x, y, backRGB);
  for (let y = fgRect.y; y < fgRect.y + fgRect.height; y += 1) for (let x = fgRect.x; x < fgRect.x + fgRect.width; x += 1) fill(x, y, fgRGB);
  // 可选：抗锯齿边（半强度）
  if (opts && opts.aa) {
    const e = opts.aa;
    for (let k = 0; k < e.length; k += 1) { const p = e[k]; fill(p.x, p.y, p.rgb); }
  }
  return { data: d, width: W, height: H };
}
// F1 黑字白底
{
  const img = synth([255, 255, 255], [20, 20, 20], { x: 14, y: 7, width: 12, height: 6 });
  const o = extractForegroundColor({ data: img.data, width: img.width, height: img.height, bbox: { x: 10, y: 5, width: 20, height: 10 } });
  t("fg-black-white", o.ok && o.color === "#141414" && o.sampleCount === 72 && o.darkish, "", o);
}
// F2 白字深底
{
  const img = synth([30, 40, 50], [250, 250, 250], { x: 14, y: 7, width: 12, height: 6 });
  const o = extractForegroundColor({ data: img.data, width: img.width, height: img.height, bbox: { x: 10, y: 5, width: 20, height: 10 } });
  t("fg-white-dark", o.ok && o.color === "#fafafa" && o.whitish, "", o);
}
// F3 蓝字浅底
{
  const img = synth([245, 245, 245], [0, 90, 200], { x: 14, y: 7, width: 12, height: 6 });
  const o = extractForegroundColor({ data: img.data, width: img.width, height: img.height, bbox: { x: 10, y: 5, width: 20, height: 10 } });
  t("fg-blue-light", o.ok && o.color === "#005ac8", "", o);
}
// F4 红字浅底
{
  const img = synth([248, 248, 248], [200, 20, 20], { x: 14, y: 7, width: 12, height: 6 });
  const o = extractForegroundColor({ data: img.data, width: img.width, height: img.height, bbox: { x: 10, y: 5, width: 20, height: 10 } });
  t("fg-red-light", o.ok && o.color === "#c81414", "", o);
}
// F5 深灰字
{
  const img = synth([255, 255, 255], [70, 70, 70], { x: 14, y: 7, width: 12, height: 6 });
  const o = extractForegroundColor({ data: img.data, width: img.width, height: img.height, bbox: { x: 10, y: 5, width: 20, height: 10 } });
  t("fg-darkgray", o.ok && o.color === "#464646" && o.darkish, "", o);
}
// F6 背景噪声污染：bbox 大部分是明暗棋盘纹理（平均被污染），前景是一小条金条 → 依前景 mask 检出金色
{
  const img = synth([222, 222, 222], [230, 200, 0], { x: 16, y: 8, width: 8, height: 4 });
  // 棋盘明暗纹理（215/229 交替），整体仍是“浅背景”
  for (let y = 0; y < 20; y += 1) for (let x = 0; x < 40; x += 1) {
    if (x >= 16 && x < 24 && y >= 8 && y < 12) continue; // 保留金条
    const i = (y * 40 + x) * 4;
    const v = ((x + y) % 2) === 0 ? 215 : 229;
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v;
  }
  const o = extractForegroundColor({ data: img.data, width: img.width, height: img.height, bbox: { x: 8, y: 4, width: 24, height: 12 } });
  // bbox 平均被棋盘拉向 ~220；前景 mask 应返回金条本
  t("fg-gold-mottled", o.ok && o.color === "#e6c800" && o.whitish === false, "", o);
}
// F7 抗锯齿：白底黑字的半灰边不得把主色拉灰
{
  const img = synth([255, 255, 255], [25, 25, 25], { x: 16, y: 8, width: 8, height: 4 }, { aa: [ { x: 15, y: 8, rgb: [128, 128, 128] }, { x: 24, y: 8, rgb: [128, 128, 128] }, { x: 15, y: 9, rgb: [128, 128, 128] }, { x: 24, y: 12, rgb: [128, 128, 128] } ] });
  const o = extractForegroundColor({ data: img.data, width: img.width, height: img.height, bbox: { x: 12, y: 6, width: 16, height: 8 } });
  t("fg-aa-black-stable", o.ok && o.darkish && o.color !== "#808080", "", o);
}
// F8 无文字区域 → NO_INK
{
  const img = synth([240, 240, 240], [240, 240, 240], { x: 16, y: 8, width: 0, height: 0 });
  const o = extractForegroundColor({ data: img.data, width: img.width, height: img.height, bbox: { x: 12, y: 6, width: 16, height: 8 } });
  t("fg-no-text-noink", o.ok === false && o.reason === "NO_INK", "", o);
}
// F9 bbox 越界裁剪
{
  const img = synth([255, 255, 255], [10, 10, 10], { x: 14, y: 7, width: 12, height: 6 });
  const o = extractForegroundColor({ data: img.data, width: img.width, height: img.height, bbox: { x: -5, y: -5, width: 700, height: 700 } });
  t("fg-clip", o.ok && o.color === "#0a0a0a", "", o);
}

console.log("results " + results.filter((r) => r.endsWith("PASS")).length + "/" + results.length + " pass");
failures.forEach((f) => console.log("FAIL " + f));
process.exit(failures.length ? 1 : 0);