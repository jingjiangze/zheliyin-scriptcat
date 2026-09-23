// runtime/stage9/color-confidence.test.js — Commit 4.6-D：颜色 Confidence 门禁
"use strict";
const assert = require("assert");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const NC = require(path.join(ROOT, "extension", "src", "editor", "native-color.js"));

let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); } }

// ---- 合成 RGBA 图像工具 ----
function synthImg(w, h, bg, fgRects) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) { d[i * 4] = bg[0]; d[i * 4 + 1] = bg[1]; d[i * 4 + 2] = bg[2]; d[i * 4 + 3] = 255; }
  (fgRects || []).forEach((r) => { for (let y = r.y; y < r.y + r.h; y += 1) for (let x = r.x; x < r.x + r.w; x += 1) { const i = (y * w + x) * 4; d[i] = r.rgb[0]; d[i + 1] = r.rgb[1]; d[i + 2] = r.rgb[2]; } });
  return d;
}
// 便利构造：同一前景多块同色 / 多色噪点
function multiColorNoise(w, h, bg) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) { d[i * 4] = bg[0]; d[i * 4 + 1] = bg[1]; d[i * 4 + 2] = bg[2]; d[i * 4 + 3] = 255; }
  const put = (x, y, rgb) => { const p = (y * w + x) * 4; d[p] = rgb[0]; d[p + 1] = rgb[1]; d[p + 2] = rgb[2]; };
  return { d, put };
}
const img = (d, w, h, bb) => ({ data: d, width: w, height: h, bbox: bb });

// ---- extractForegroundColor 字段完整性 ----
t("color: 单色文字 → 高 dominance / 低 ambiguity / 非多峰 → apply", () => {
  const d = synthImg(40, 20, [255, 255, 255], [{ x: 10, y: 5, w: 14, h: 6, rgb: [10, 10, 10] }]);
  const r = NC.extractForegroundColor(img(d, 40, 20, { x: 0, y: 0, width: 40, height: 20 }));
  assert.strictEqual(r.ok, true);
  assert.ok(typeof r.dominance === "number", "dominance 存在");
  assert.ok(typeof r.ambiguity === "number", "ambiguity 存在");
  assert.strictEqual(r.multiModal, false);
  assert.ok(r.dominance >= 0.35, "单色浓度高（got " + r.dominance + "）");
  const g = NC.shouldApplyFill(r);
  assert.strictEqual(g.apply, true);
  assert.strictEqual(g.reason, "FOREGROUND_RELIABLE");
});
t("color: 双色前景污染（黑字+红字同区域）→ 多峰拒绝（保留 Native 色）", () => {
  const d = synthImg(60, 20, [255, 255, 255], [
    { x: 5, y: 6, w: 20, h: 5, rgb: [10, 10, 10] },
    { x: 30, y: 6, w: 20, h: 5, rgb: [200, 0, 0] }
  ]);
  const r = NC.extractForegroundColor(img(d, 60, 20, { x: 0, y: 0, width: 60, height: 20 }));
  assert.strictEqual(r.ok, true);
  assert.ok(r.ambiguity >= 0.6, "第二主簇显著（got " + r.ambiguity + "）");
  const g = NC.shouldApplyFill(r);
  assert.strictEqual(g.apply, false, "双色污染不得强制设色");
});
t("color: 多文字同色 → 仍主色集中 → apply", () => {
  const d = synthImg(60, 20, [255, 255, 255], [
    { x: 5, y: 6, w: 20, h: 4, rgb: [80, 80, 80] },
    { x: 30, y: 6, w: 20, h: 4, rgb: [80, 80, 80] }
  ]);
  const r = NC.extractForegroundColor(img(d, 60, 20, { x: 0, y: 0, width: 60, height: 20 }));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.multiModal, false);
  assert.ok(r.dominance >= 0.3);
  assert.strictEqual(NC.shouldApplyFill(r).apply, true);
});
t("color: 多色噪点（低集中度）→ 拒绝且原因可解释", () => {
  const noise = multiColorNoise(60, 20, [255, 255, 255]);
  for (let n = 0; n < 2; n += 1) {
    for (let k = 0; k < 10; k += 1) {
      noise.put(2 + k * 3, 2 + n * 10, [10, 10, 10]);
      noise.put(2 + k * 3, 4 + n * 10, [200, 0, 0]);
      noise.put(2 + k * 3, 6 + n * 10, [0, 150, 0]);
      noise.put(2 + k * 3, 8 + n * 10, [0, 0, 200]);
    }
  }
  const r = NC.extractForegroundColor(img(noise.d, 60, 20, { x: 0, y: 0, width: 60, height: 20 }));
  assert.strictEqual(r.ok, true);
  const g = NC.shouldApplyFill(r);
  assert.strictEqual(g.apply, false);
  assert.ok(["MULTI_MODAL", "DOMINANCE_LOW", "AMBIGUITY_HIGH", "NO_EVIDENCE"].indexOf(g.reason) >= 0);
  assert.ok(typeof g.dominance === "number", "拒绝时带 dominance");
});
t("color: 空/非法输入 → 门禁拒绝 NO_EVIDENCE", () => {
  const g1 = NC.shouldApplyFill({ ok: false, reason: "NO_PIXELS" });
  assert.strictEqual(g1.apply, false); assert.strictEqual(g1.reason, "NO_EVIDENCE");
  const g2 = NC.shouldApplyFill(null);
  assert.strictEqual(g2.apply, false);
});
t("color: 阈值可调（minDominance 提高 → DOMINANCE_LOW）", () => {
  const noise = multiColorNoise(60, 20, [255, 255, 255]);
  for (let n = 0; n < 1; n += 1) {
    for (let k = 0; k < 10; k += 1) {
      noise.put(2 + k * 3, 2 + n * 10, [10, 10, 10]);
      noise.put(2 + k * 3, 4 + n * 10, [200, 0, 0]);
      noise.put(2 + k * 3, 6 + n * 10, [0, 150, 0]);
      noise.put(2 + k * 3, 8 + n * 10, [0, 0, 200]);
    }
  }
  const r = NC.extractForegroundColor(img(noise.d, 60, 20, { x: 0, y: 0, width: 60, height: 20 }));
  const loose = NC.shouldApplyFill(r, { minDominance: 0.05, maxAmbiguity: 1.0 });
  const strict = NC.shouldApplyFill(r, { minDominance: 0.9 });
  // 只要 dominance 真实可导出即可：loose 可能因多峰仍拒，但 minDominance 必须能导致 DOMINANCE_LOW
  assert.ok(typeof r.dominance === "number");
  const strict2 = NC.shouldApplyFill({ ok: true, color: "#101010", dominance: 0.2, ambiguity: 0.1 }, { minDominance: 0.5 });
  assert.strictEqual(strict2.apply, false);
  assert.strictEqual(strict2.reason, "DOMINANCE_LOW");
});
t("color: multiModal 显式拒绝", () => {
  const g = NC.shouldApplyFill({ ok: true, color: "#111111", dominance: 0.8, ambiguity: 0.7, multiModal: true });
  assert.strictEqual(g.apply, false);
  assert.strictEqual(g.reason, "MULTI_MODAL");
});

console.log("color-confidence.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);
