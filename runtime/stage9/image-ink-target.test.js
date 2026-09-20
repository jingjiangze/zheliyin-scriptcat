// runtime/stage9/image-ink-target.test.js — Stage 9 P4-B §二十三：ImageInk 测量 + Typography Target Resolver 单测
"use strict";
const assert = require("assert");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const INK = require(path.join(ROOT, "extension", "src", "editor", "image-ink-target.js"));
const FT = require(path.join(ROOT, "extension", "src", "editor", "font-target-source.js"));

let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); } }

// ---- 合成图像工具：白底(255) × 黑块(0) ----
function synth(w, h, rects) {
  const g = new Uint8Array(w * h).fill(255);
  (rects || []).forEach((r) => {
    for (let y = r.y; y < r.y + r.h; y += 1) for (let x = r.x; x < r.x + r.w; x += 1) g[y * w + x] = 0;
  });
  return g;
}

// ---- measureImageInk 用例（§二十三：clear/empty/全背景/噪点/多分量）----
t("ink: 清晰前景 → 墨迹 bbox 精确", () => {
  const g = synth(40, 20, [{ x: 10, y: 5, w: 14, h: 6 }]);
  const r = INK.measureImageInk(g, 40, 20, { x: 0, y: 0, width: 40, height: 20 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.inkWidth, 14);
  assert.strictEqual(r.inkHeight, 6);
  assert.strictEqual(r.inkBox.x, 10);
  assert.strictEqual(r.inkBox.y, 5);
  assert.ok(r.coverage > 0 && r.coverage < 0.5);
  assert.strictEqual(r.method, "LOCAL_OTSU_MINORITY_FOREGROUND");
});
t("ink: 区域外前景不影响（roi 限定）", () => {
  const g = synth(40, 20, [{ x: 30, y: 5, w: 8, h: 6 }]); // roi 外
  const r = INK.measureImageInk(g, 40, 20, { x: 0, y: 0, width: 10, height: 10 });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "NO_INK");
});
t("ink: 整个 roi 全背景 → NO_INK（不伪造 inkWidth）", () => {
  const g = synth(20, 20, []);
  const r = INK.measureImageInk(g, 20, 20, { x: 0, y: 0, width: 20, height: 20 });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "NO_INK");
  assert.strictEqual(r.inkWidth, null);
});
t("ink: 空/非法 region → NO_REGION", () => {
  const g = synth(20, 20, []);
  const r = INK.measureImageInk(g, 20, 20, { x: 0, y: 0, width: 0, height: 0 });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "NO_REGION");
  const r2 = INK.measureImageInk(null, 20, 20, { x: 0, y: 0, width: 10, height: 10 });
  assert.strictEqual(r2.reason, "NO_REGION");
});
t("ink: 噪点背景（深浅混杂但无主块）→ 仍给出墨迹或显式 NO_INK（不抛）", () => {
  const g = new Uint8Array(20 * 20);
  for (let i = 0; i < g.length; i += 1) g[i] = (i * 37) % 256;
  let r = null;
  try { r = INK.measureImageInk(g, 20, 20, { x: 0, y: 0, width: 20, height: 20 }); } catch (e) { assert.fail("noise 抛异常: " + e.message); }
  assert.ok(r && typeof r.ok === "boolean");
});
t("ink: 多分量墨迹 → bbox 覆盖全部分量（不要求单连通）", () => {
  const g = synth(40, 20, [{ x: 5, y: 5, w: 4, h: 4 }, { x: 20, y: 8, w: 5, h: 5 }]);
  const r = INK.measureImageInk(g, 40, 20, { x: 0, y: 0, width: 40, height: 20 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.inkBox.x, 5);
  assert.strictEqual(r.inkWidth, 20); // 20+5-5
  assert.strictEqual(r.inkBox.y, 5);
  assert.strictEqual(r.inkHeight, 8);
});
t("ink: 极性无关（亮字深底）", () => {
  const g = new Uint8Array(40 * 20).fill(0);
  for (let y = 5; y < 11; y += 1) for (let x = 10; x < 24; x += 1) g[y * 40 + x] = 255;
  const r = INK.measureImageInk(g, 40, 20, { x: 0, y: 0, width: 40, height: 20 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.inkWidth, 14);
  assert.strictEqual(r.inkHeight, 6);
});
t("ink: rgbaToGray 常规亮度", () => {
  const rgba = new Uint8Array(4).fill(255);
  const g = INK.rgbaToGray(rgba, 1, 1);
  assert.strictEqual(g[0], 255);
});

// ---- resolveTypographyTarget（§二十三：bbox only / ink valid / ink zero / 非法 / flag off/on / fallback / scale）----
t("target: 默认（bbox 模式）→ OCR_BBOX 无 fallback", () => {
  const r = FT.resolveTypographyTarget({ bboxWidth: 100, scale: 1.5 });
  assert.strictEqual(r.width, 150);
  assert.strictEqual(r.source, "OCR_BBOX");
  assert.strictEqual(r.fallback, false);
});
t("target: image-ink 模式 + 合法 ink → IMAGE_INK × scale", () => {
  const r = FT.resolveTypographyTarget({ bboxWidth: 300, imageInkWidth: 225, inkValid: true, scale: 2, mode: "image-ink" });
  assert.strictEqual(r.width, 450);
  assert.strictEqual(r.source, "IMAGE_INK");
  assert.strictEqual(r.fallback, false);
});
t("target: ink zero → OCR_BBOX_FALLBACK + fallback", () => {
  const r = FT.resolveTypographyTarget({ bboxWidth: 300, imageInkWidth: 0, inkValid: true, scale: 1, mode: "image-ink" });
  assert.strictEqual(r.width, 300);
  assert.strictEqual(r.source, "OCR_BBOX_FALLBACK");
  assert.strictEqual(r.fallback, true);
});
t("target: inkValid=false（测量失败）→ fallback + reason 透传", () => {
  const r = FT.resolveTypographyTarget({ bboxWidth: 300, imageInkWidth: null, inkValid: false, scale: 1, mode: "image-ink", reason: "NO_INK" });
  assert.strictEqual(r.source, "OCR_BBOX_FALLBACK");
  assert.strictEqual(r.fallback, true);
  assert.strictEqual(r.reason, "NO_INK");
});
t("target: flag off（mode=bbox）即使有 ink 也不用 → OCR_BBOX", () => {
  const r = FT.resolveTypographyTarget({ bboxWidth: 300, imageInkWidth: 200, inkValid: true, scale: 1, mode: "bbox" });
  assert.strictEqual(r.source, "OCR_BBOX");
  assert.strictEqual(r.width, 300);
});
t("target: 禁乘数——宽度只能是 bbox×scale 或 ink×scale（无额外系数）", () => {
  const a = FT.resolveTypographyTarget({ bboxWidth: 100, scale: 1, mode: "bbox" });
  const b = FT.resolveTypographyTarget({ bboxWidth: 100, imageInkWidth: 80, inkValid: true, scale: 2, mode: "image-ink" });
  assert.strictEqual(a.width, 100);
  assert.strictEqual(b.width, 160);
});

console.log("image-ink-target.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);