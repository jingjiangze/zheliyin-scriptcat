// runtime/stage12/ppocr-image-ops.test.js — Stage 12 M3-1：图像预处理/裁切单测
"use strict";
const assert = require("assert");
const O = require("../../extension/src/ocr/ppocr-image-ops.js");

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed += 1; }
  catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); }
}
const buf = (pixels, w, h) => ({ data: Uint8ClampedArray.from(pixels.reduce((a, p) => a.concat(p), [])), width: w, height: h, channels: 4 });
const px = (img, x, y) => { const i = (y * img.width + x) * 3; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
const near = (a, b, eps) => Math.abs(a - b) < (eps == null ? 1e-6 : eps);

// ---- T1 双线性缩放：2x2 → 4x4 四角对应 ----
t("T1 resizeRgbaBilinear 2x2→4x4：四角像素与源一致（中心对齐采样）", () => {
  const src = buf([[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [255, 255, 255, 255]], 2, 2);
  const r = O.resizeRgbaBilinear(src, 4, 4);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.width, 4);
  assert.strictEqual(r.height, 4);
  assert.deepStrictEqual(px(r, 0, 0), [255, 0, 0]);
  assert.deepStrictEqual(px(r, 3, 0), [0, 255, 0]);
  assert.deepStrictEqual(px(r, 0, 3), [0, 0, 255]);
  assert.deepStrictEqual(px(r, 3, 3), [255, 255, 255]);
});

// ---- T2 通道顺序（PaddleOCR 默认 BGR / 可切 RGB） ----
t("T2 toChwTensor：channelOrder=bgr → 平面 0 是 B；rgb → 平面 0 是 R", () => {
  const img = { data: Float32Array.from([10, 20, 30]), width: 1, height: 1 };
  const bgr = O.toChwTensor(img, { mean: [0, 0, 0], std: [1, 1, 1], scale: 1, channelOrder: "bgr" });
  assert.deepStrictEqual(Array.from(bgr.data), [30, 20, 10]);
  const rgb = O.toChwTensor(img, { mean: [0, 0, 0], std: [1, 1, 1], scale: 1, channelOrder: "rgb" });
  assert.deepStrictEqual(Array.from(rgb.data), [10, 20, 30]);
  assert.strictEqual(O.PPOCR_DEFAULT_CHANNEL_ORDER, "bgr");
});

// ---- T3 rec 归一化 (px/255 - 0.5)/0.5 ----
t("T3 toChwTensor rec 归一化：0→-1、127.5→0、255→1", () => {
  const img = { data: Float32Array.from([255, 127.5, 0]), width: 1, height: 1 };
  const r = O.toChwTensor(img, { mean: O.PPOCR_REC_MEAN, std: O.PPOCR_REC_STD, channelOrder: "rgb" });
  assert.ok(near(r.data[0], 1) && near(r.data[1], 0) && near(r.data[2], -1), "got " + Array.from(r.data));
  const det = O.toChwTensor({ data: Float32Array.from([255, 255, 255]), width: 1, height: 1 }, { mean: O.PPOCR_DET_MEAN, std: O.PPOCR_DET_STD, channelOrder: "rgb" });
  assert.ok(near(det.data[0], (1 - 0.485) / 0.229), "det norm=" + det.data[0]);
});

// ---- T4 4 点多边形 → 旋转矩形基 ----
t("T4 rectFromPolygon：轴对齐 400x50 → center/宽高正确；45° 线 → 角度≈±45°", () => {
  const r = O.rectFromPolygon([{ x: 100, y: 50 }, { x: 500, y: 50 }, { x: 500, y: 100 }, { x: 100, y: 100 }]);
  assert.deepStrictEqual(r.center, { x: 300, y: 75 });
  assert.ok(near(r.width, 400) && near(r.height, 50));
  assert.ok(near(r.angle, 0));
  const s = O.rectFromPolygon([{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 90, y: 110 }, { x: -10, y: 10 }]);
  assert.ok(Math.abs(Math.abs(s.angle) - Math.PI / 4) < 0.02, "angle=" + s.angle);
});

// ---- T5 旋转感知裁切：尺寸与均匀性 ----
t("T5 cropRectBilinear：200x100 框 → 48x96 且均匀区域取值不变", () => {
  const img = buf(Array.from({ length: 200 * 100 }, () => [128, 64, 32, 255]), 200, 100);
  const rect = { center: { x: 100, y: 50 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, width: 200, height: 100 };
  const c = O.cropRectBilinear(img, rect, {});
  assert.strictEqual(c.ok, true);
  assert.strictEqual(c.height, 48);
  assert.strictEqual(c.width, 96);
  assert.deepStrictEqual(px(c, 0, 0), [128, 64, 32]);
  assert.deepStrictEqual(px(c, 95, 47), [128, 64, 32]);
});

// ---- T6 flip180：左右半色块反转 ----
t("T6 cropRectBilinear flip180：左红右蓝图 → 正常首像素红、翻转后首像素蓝", () => {
  const data = [];
  for (let y = 0; y < 20; y += 1) for (let x = 0; x < 100; x += 1) data.push(x < 50 ? [255, 0, 0, 255] : [0, 0, 255, 255]);
  const img = buf(data, 100, 20);
  const rect = { center: { x: 50, y: 10 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, width: 100, height: 20 };
  const normal = O.cropRectBilinear(img, rect, {});
  const flipped = O.cropRectBilinear(img, rect, { flip180: true });
  assert.deepStrictEqual(px(normal, 0, 0), [255, 0, 0]);
  assert.deepStrictEqual(px(flipped, 0, 0), [0, 0, 255]);
});

// ---- T7 便捷张量构建 ----
t("T7 buildDetTensor / buildRecTensor：dims 与归一化生效", () => {
  const img = buf(Array.from({ length: 4 * 4 }, () => [255, 255, 255, 255]), 4, 4);
  const det = O.buildDetTensor(img, { width: 2, height: 2, scale: 0.5 }, { channelOrder: "rgb" });
  assert.strictEqual(det.ok, true);
  assert.deepStrictEqual(det.dims, { channels: 3, width: 2, height: 2 });
  assert.ok(near(det.data[0], (1 - 0.485) / 0.229), "value=" + det.data[0]);
  const rect = { center: { x: 2, y: 2 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, width: 4, height: 4 };
  const rec = O.buildRecTensor(img, rect, { channelOrder: "rgb" });
  assert.strictEqual(rec.ok, true);
  assert.strictEqual(rec.dims.height, 48);
  assert.strictEqual(rec.dims.width, 48);
  assert.ok(near(rec.data[0], 1), "rec value=" + rec.data[0]);
});

// ---- T8 非法输入 ----
t("T8 非法输入返回 IMAGE_INVALID 且不 throw", () => {
  assert.strictEqual(O.resizeRgbaBilinear(null, 2, 2).errorCode, "IMAGE_INVALID");
  assert.strictEqual(O.toChwTensor({}, {}).errorCode, "IMAGE_INVALID");
  assert.strictEqual(O.cropRectBilinear(null, null, {}).errorCode, "IMAGE_INVALID");
  assert.strictEqual(O.rectFromPolygon([{ x: 1, y: 1 }]), null);
});

console.log("ppocr-image-ops.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);