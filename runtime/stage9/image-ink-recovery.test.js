// runtime/stage9/image-ink-recovery.test.js — OCR-P1 Commit 4.3（§六）
const path = require("path");
const assert = require("assert");
const IR = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "image-ink-recovery.js"));

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass += 1; } catch (e) { fail += 1; console.error("FAIL " + name + ": " + String(e && e.message || e)); } }
// 合成图：w=96,h=24，背景 255，深色文字块（画一个小字形 8x12 @ (30,6)）
function makeGrayWithInk(inkRect) {
  const W = 96, H = 24;
  const g = new Uint8Array(W * H).fill(255);
  for (let y = inkRect.y; y < inkRect.y + inkRect.height; y += 1) {
    for (let x = inkRect.x; x < inkRect.x + inkRect.width; x += 1) {
      g[y * W + x] = 30;
    }
  }
  return { gray: g, width: W, height: H };
}

t("ink resolves region geometry", () => {
  const { gray, width, height } = makeGrayWithInk({ x: 30, y: 6, width: 8, height: 12 });
  const r = IR.resolveInkGeometry({ native: { nativeText: "T" }, region: { x: 26, y: 4, width: 16, height: 16 }, gray, imageWidth: width, imageHeight: height });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.source, "IMAGE_INK");
  assert.strictEqual(r.geometry.coordinateSpace, "IMAGE_NATURAL");
  assert.ok(r.geometry.inkWidth >= 8 && r.geometry.inkHeight >= 12, "inkBox " + JSON.stringify(r.geometry));
  assert.ok(r.geometry.inkWidth <= 12, "clamped to region " + r.geometry.inkWidth);
});
t("no region -> NO_ANCHOR_REGION (no guess)", () => {
  const { gray, width, height } = makeGrayWithInk({ x: 30, y: 6, width: 8, height: 12 });
  const r = IR.resolveInkGeometry({ native: { nativeText: "T" }, region: null, gray, imageWidth: width, imageHeight: height });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "NO_ANCHOR_REGION");
});
t("blank region -> NO_INK", () => {
  const g = new Uint8Array(96 * 24).fill(255);
  const r = IR.resolveInkGeometry({ native: { nativeText: "T" }, region: { x: 0, y: 0, width: 96, height: 24 }, gray: g, imageWidth: 96, imageHeight: 24 });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "NO_INK");
});
t("ink center computed", () => {
  const { gray, width, height } = makeGrayWithInk({ x: 30, y: 6, width: 8, height: 12 });
  const r = IR.resolveInkGeometry({ native: { nativeText: "T" }, region: { x: 26, y: 4, width: 16, height: 16 }, gray, imageWidth: width, imageHeight: height });
  const c = r.geometry.inkCenter;
  assert.ok(c.x > 30 && c.x < 40 && c.y > 6 && c.y < 18, JSON.stringify(c));
});
t("confidence in [0,1]", () => {
  const { gray, width, height } = makeGrayWithInk({ x: 30, y: 6, width: 8, height: 12 });
  const r = IR.resolveInkGeometry({ native: { nativeText: "T" }, region: { x: 26, y: 4, width: 16, height: 16 }, gray, imageWidth: width, imageHeight: height });
  assert.ok(r.geometry.confidence >= 0 && r.geometry.confidence <= 1);
});
console.log("image-ink-recovery.test: pass=" + pass + " fail=" + fail);
if (fail > 0) process.exit(1);
