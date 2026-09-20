// runtime/stage8d/text-fit-fusion.test.js — Stage 8D P2 单测
// 覆盖 §十二~§十五：advance 主求解、ink 交叉、双证据一致、低质不创建、OCR 高度仅 sanity
"use strict";
const assert = require("assert");
const F = require("../../extension/src/editor/text-fit-fusion.js");

let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); } }

// 确定性测字器：advanceWidth = fs * 0.5 * text.length（近似 CJK 全角）；inkHeight ≈ fs*1.2
const measurer = {
  measureText(text, fontString) {
    const fs = parseFloat(fontString);
    const w = fs * 0.5 * String(text).length;
    return { width: w, actualBoundingBoxAscent: fs * 0.9, actualBoundingBoxDescent: fs * 0.2, actualBoundingBoxLeft: 0, actualBoundingBoxRight: w };
  }
};
// 给定真实 fs，构造与 solveByAdvance 匹配的 targetVisualWidth
const advWidthFor = (fs, text) => fs * 0.5 * text.length;

// §十五 advance 主求解命中
t("advance-primary 命中源字号", () => {
  const text = "佛山盛盈包装制品有限公司"; // 12 字
  const fs0 = 20;
  const r = F.solveFontSizeFusion({ text: text, targetVisualWidth: advWidthFor(fs0, text), fontFamily: "sans-serif", measurer: measurer, quality: 0.9 });
  assert.ok(r.ok && r.fontSize === fs0, JSON.stringify(r));
  assert.strictEqual(r.reason, "advance-width-primary");
});
// §十五 ink 与 advance 一致 → advance 采用
t("advance-ink-consistent", () => {
  const text = "客户经理"; // 4 字
  const fs0 = 18;
  const r = F.solveFontSizeFusion({ text: text, targetVisualWidth: advWidthFor(fs0, text), inkHeight: fs0 * 1.2, fontFamily: "sans-serif", measurer: measurer, quality: 0.9 });
  assert.ok(r.ok && r.fontSize === fs0, JSON.stringify(r));
});
// §十五 仅 ink 时 ink-height-primary
t("ink-height-primary (无 advance)", () => {
  const r = F.solveFontSizeFusion({ text: "电话", inkHeight: 36, fontFamily: "simhei", measurer: null, quality: 0.9 });
  assert.ok(r.ok && r.fontSize === Math.round(36 / 1.425), JSON.stringify(r));
});
// §十五 低质不创建
t("low-quality 不创建", () => {
  const r = F.solveFontSizeFusion({ text: "ABC", targetVisualWidth: 100, fontFamily: "sans-serif", measurer: measurer, quality: 0.3 });
  assert.ok(!r.ok && r.reason.indexOf("low-quality") >= 0);
});
// 无任何证据 → no-evidence
t("no-evidence", () => {
  const r = F.solveFontSizeFusion({ text: "x", quality: 0.9 });
  assert.ok(!r.ok && r.reason === "no-evidence");
});
// OCR height 仅在不一致时 sanity 干预（quality 低时）
t("ocr-height sanity clamp", () => {
  // adv 解出 100，但 ocrHeight=12 → 超出 [12*0.4, 12*2.4]=[4.8,28.8] → clamp 到 ~8
  const r = F.solveFontSizeFusion({ text: "abcde", targetVisualWidth: 250, ocrHeight: 12, fontFamily: "sans-serif", measurer: measurer, quality: 0.6 });
  assert.ok(r.ok && r.fontSize <= 28, JSON.stringify(r));
});
// §十二 bboxSeparation 三层分离
t("bboxSeparation 三层", () => {
  const s = F.bboxSeparation({ x: 10, y: 20, width: 100, height: 30 }, 2, { inkHeight: 40 });
  assert.strictEqual(s.ocrBBox.width, 100);
  assert.strictEqual(s.textVisualTarget.width, 200);
  assert.strictEqual(s.textVisualTarget.inkHeight, 40);
});
// 双证据冲突 → advance 主 + warning
t("advance-primary-ink-conflict warning", () => {
  const r = F.solveFontSizeFusion({ text: "TestWang", targetVisualWidth: 120, inkHeight: 90, fontFamily: "sans-serif", measurer: measurer, quality: 0.9 });
  assert.ok(r.ok && r.reason.indexOf("conflict") >= 0);
});

console.log("text-fit-fusion.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);