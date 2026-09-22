// runtime/stage9/image-ink-visual.test.js — OCR-P1 Commit 4.6-A：
// 防污染视觉墨迹（measureVisualInk）—— 近邻文字/纹理/离散噪点不得污染 bbox
"use strict";
const assert = require("assert");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const V = require(path.join(ROOT, "extension", "src", "editor", "image-ink-visual.js"));

let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); } }

// 合成：白底(255) × 深色矩形(0)
function synth(w, h, rects) {
  const g = new Uint8Array(w * h).fill(255);
  (rects || []).forEach((r) => { for (let y = r.y; y < r.y + r.h; y += 1) for (let x = r.x; x < r.x + r.w; x += 1) g[y * w + x] = 0; });
  return g;
}

t("visual: 清晰单块 → 精确视觉 bbox（不受 OCR padding 影响）", () => {
  const g = synth(60, 24, [{ x: 8, y: 6, w: 20, h: 8 }]);
  const r = V.measureVisualInk(g, 60, 24, { x: 0, y: 0, width: 60, height: 24 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.inkBox.x, 8);
  assert.strictEqual(r.inkBox.y, 6);
  assert.strictEqual(r.inkWidth, 20);
  assert.strictEqual(r.inkHeight, 8);
  assert.strictEqual(r.method, "VISUAL_MORPH_PROJECTION");
  assert.ok(r.confidence > 0 && r.confidence <= 1);
});

t("visual: OCR bbox 左侧 padding → 视觉 bbox 收敛到真实墨迹（防左移根因）", () => {
  // OCR bbox 从 x=0 开始，但真实文字只在 x=8..28
  const g = synth(60, 24, [{ x: 8, y: 6, w: 20, h: 8 }]);
  const r = V.measureVisualInk(g, 60, 24, { x: 0, y: 0, width: 60, height: 24 });
  assert.strictEqual(r.inkBox.x, 8);
  assert.ok(r.inkBox.x > 0, "不应从 padding 左边缘起算");
});

t("visual: 右侧邻近其它文字 → 不扩大到邻近块", () => {
  // 主块 x=6..16；右侧远处块 x=48..54（同行）→ 视觉 bbox 应只含主块
  const g = synth(80, 20, [{ x: 6, y: 5, w: 10, h: 8 }, { x: 48, y: 5, w: 8, h: 8 }]);
  const r = V.measureVisualInk(g, 80, 20, { x: 0, y: 0, width: 30, height: 20 }); // region 只覆盖主块附近
  assert.strictEqual(r.ok, true);
  assert.ok(r.inkWidth <= 16, "inkWidth=" + r.inkWidth + " 不得跨越邻近块");
  assert.ok(r.inkBox.x >= 5 && r.inkBox.x <= 7);
});

t("visual: 上下其它文字 → 行投影取主带（count 最大的带），带外行不参与", () => {
  const g = synth(40, 50, [{ x: 5, y: 4, w: 20, h: 6 }, { x: 5, y: 24, w: 22, h: 6 }, { x: 5, y: 44, w: 20, h: 4 }]);
  const r = V.measureVisualInk(g, 40, 50, { x: 0, y: 0, width: 40, height: 50 });
  assert.strictEqual(r.ok, true);
  // 三个独立带（gap 6）→ 主带 = count 最大的中间行（22*6=132）
  assert.strictEqual(r.inkHeight, 6, "仅主带高度，不含其它行");
  assert.ok(r.inkBox.y >= 22 && r.inkBox.y <= 26, "y=" + r.inkBox.y + " 应为中部主带");
  assert.ok(r.rowBandConfidence >= 0.35 && r.rowBandConfidence <= 1, "rowBandConfidence=" + r.rowBandConfidence);
});

t("visual: 离散噪点 → morphology 后不撑大 bbox", () => {
  const g = synth(40, 20, [{ x: 10, y: 5, w: 14, h: 6 }]);
  g[2 * 40 + 38] = 0; g[3 * 40 + 39] = 0; g[4 * 40 + 38] = 0; // 左下角离散噪点
  const r = V.measureVisualInk(g, 40, 20, { x: 0, y: 0, width: 40, height: 20 });
  assert.strictEqual(r.ok, true);
  assert.ok(r.inkWidth <= 16, "噪点不应把 bbox 扩到右侧");
  assert.ok(r.inkHeight <= 10);
});

t("visual: 全背景 → NO_INK（不伪造）", () => {
  const g = synth(20, 20, []);
  const r = V.measureVisualInk(g, 20, 20, { x: 0, y: 0, width: 20, height: 20 });
  assert.strictEqual(r.ok, false);
  assert.ok(r.reason === "NO_INK" || r.reason === "NO_INK_OTSU" || r.reason === "NO_BAND");
  assert.strictEqual(r.inkBox, null);
});

t("visual: 非法 region → NO_REGION", () => {
  const g = synth(20, 20, []);
  const r = V.measureVisualInk(g, 20, 20, { x: 0, y: 0, width: 0, height: 0 });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "NO_REGION");
});

t("visual: 亮字深底（极性无关）", () => {
  const g = new Uint8Array(40 * 20).fill(0);
  for (let y = 5; y < 11; y += 1) for (let x = 10; x < 24; x += 1) g[y * 40 + x] = 255;
  const r = V.measureVisualInk(g, 40, 20, { x: 0, y: 0, width: 40, height: 20 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.inkBox.x, 10);
  assert.strictEqual(r.inkWidth, 14);
  assert.strictEqual(r.inkHeight, 6);
});

console.log("image-ink-visual.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);
