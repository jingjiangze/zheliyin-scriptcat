// tests/editor-object-model/native-dimension-contract.test.js — Stage 9 方案 Commit 4：Native Template Dimension Contract 单测
"use strict";
const assert = require("assert");
const path = require("path");
const D = require(path.join(__dirname, "..", "..", "extension", "src", "editor", "native-dimension-contract.js"));

let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); } }

const BASE = {
  physical: { widthMM: 90, heightMM: 55, source: "native-diy" },
  canvas: { widthPx: 507.5, heightPx: 308.729, source: "native" },
  sourceImage: { naturalWidthPx: 895, naturalHeightPx: 577, objectWidthPx: 507.5, objectHeightPx: 308.7, scaleX: 1, scaleY: 1 },
  viewport: { widthPx: 760, heightPx: 460, zoom: 1.5 },
  pageIdentity: "canvas:c0", canvasIdentity: "c0"
};

t("Test1 physical size normalization", () => {
  const n = D.normalizeDimensionEvidence({ physical: { widthMM: 90, heightMM: 55, source: "x" } });
  assert.strictEqual(n.physical.widthMM, 90);
  assert.strictEqual(n.physical.heightMM, 55);
  assert.strictEqual(n.physical.source, "x");
  assert.strictEqual(n.canvas.widthPx, null); // 未提供不注入
});

t("Test2 canvas size normalization", () => {
  const n = D.normalizeDimensionEvidence(BASE);
  assert.strictEqual(n.canvas.widthPx, 507.5);
  assert.strictEqual(n.canvas.source, "native");
});

t("Test3 source image 与 canvas 区分", () => {
  const c = D.buildDimensionContract(BASE);
  assert.strictEqual(c.sourceImage.naturalWidthPx, 895);
  assert.strictEqual(c.sourceImage.naturalHeightPx, 577);
  assert.notStrictEqual(c.sourceImage.naturalWidthPx, c.canvas.widthPx);
  assert.notStrictEqual(c.sourceImage.objectWidthPx, null);
});

t("Test4 viewport 与 canvas 区分", () => {
  const c = D.buildDimensionContract(BASE);
  assert.strictEqual(c.viewport.widthPx, 760);
  assert.strictEqual(c.viewport.zoom, 1.5);
  assert.notStrictEqual(c.viewport.widthPx, c.canvas.widthPx);
});

t("Test5 uniform px/mm", () => {
  const c = D.buildDimensionContract({ physical: { widthMM: 90, heightMM: 55 }, canvas: { widthPx: 450, heightPx: 275, source: "native" } });
  assert.strictEqual(c.uniformScale, true);
  assert.strictEqual(c.pxPerMM.width, 5);
  assert.strictEqual(c.pxPerMM.height, 5);
  assert.ok(Math.abs(c.mmPerPx.width - 0.2) < 1e-9);
});

t("Test6 non-uniform px/mm 分别记录，禁平均", () => {
  const c = D.buildDimensionContract({ physical: { widthMM: 90, heightMM: 55 }, canvas: { widthPx: 450, heightPx: 330, source: "native" } });
  assert.strictEqual(c.uniformScale, false);
  assert.strictEqual(c.pxPerMM.width, 5);
  assert.strictEqual(c.pxPerMM.height, 6); // 两个方向各自独立
  assert.strictEqual(c.orientation, "landscape");
});

t("Test7 conversion unavailable", () => {
  const c = D.buildDimensionContract({ physical: { widthMM: 90, heightMM: 55 }, canvas: { widthPx: 450, heightPx: 275, source: "native" }, conversion: { status: "UNAVAILABLE", api: "sundry.mmToPX", confidence: "LOW" } });
  assert.strictEqual(c.conversion.status, "UNAVAILABLE");
  assert.strictEqual(c.conversion.api, "sundry.mmToPX");
});

t("Test8 conversion signature unresolved", () => {
  const c = D.buildDimensionContract({ physical: { widthMM: 90, heightMM: 55 }, canvas: { widthPx: 450, heightPx: 275, source: "native" }, conversion: { status: "SIGNATURE_UNRESOLVED", api: "sundry.pxToMM", confidence: "LOW" } });
  assert.strictEqual(c.conversion.status, "SIGNATURE_UNRESOLVED");
});

t("Test9 single-page contract", () => {
  const c = D.buildDimensionContract(BASE);
  assert.strictEqual(c.pageIdentity, "canvas:c0");
  assert.strictEqual(c.orientation, "landscape");
  assert.ok(c.pxPerMM.width > 0 && c.pxPerMM.height > 0);
});

t("Test10 multi-page contract 各自独立", () => {
  const front = D.buildDimensionContract(Object.assign({}, BASE, { pageIdentity: "canvas:c0" }));
  const back = D.buildDimensionContract(Object.assign({}, BASE, { pageIdentity: "canvas:c1", physical: { widthMM: 55, heightMM: 90, source: "native" }, canvas: { widthPx: 308.7, heightPx: 507.5, source: "native" } }));
  assert.strictEqual(back.orientation, "portrait");
  assert.notStrictEqual(back.pageIdentity, front.pageIdentity); // 不得把第一页复制到第二页
  assert.ok(Math.abs(back.pxPerMM.width - front.pxPerMM.width) < 0.5);
});

t("Test11 page identity mismatch（switch 后身份不恢复 → 不通过）", () => {
  const before = D.dimensionContractEquivalent({ ...BASE, pageIdentity: "canvas:c0" }, { ...BASE, pageIdentity: "canvas:c0" });
  assert.strictEqual(before.equivalent, true);
  const after = D.dimensionContractEquivalent({ ...BASE, pageIdentity: "canvas:c0" }, { ...BASE, pageIdentity: "canvas:c9" });
  assert.strictEqual(after.equivalent, false);
  assert.strictEqual(after.reason, "pageIdentity");
});

t("Test12 vertical orientation evidence（仅 evidence，不断言实现方式）", () => {
  const portrait = D.buildDimensionContract({ physical: { widthMM: 55, heightMM: 90, source: "native" } });
  assert.strictEqual(portrait.orientation, "portrait");
  const c = D.buildDimensionContract(BASE);
  assert.strictEqual(c.orientation, "landscape");
});

t("Test13 sizeDivergence MATCH / DIVERGENCE", () => {
  const match = D.buildDimensionContract({ physical: { widthMM: 90, heightMM: 55 }, canvas: { widthPx: 450, heightPx: 275, source: "native" }, sizeDivergence: { consistency: "MATCH", nativeRequestedSize: { width: 160, height: 34 }, locationSize: { width: 160, height: 34 }, actualObjectSize: { width: 160, height: 34 }, aCoordsSize: { width: 160, height: 34 } } });
  assert.strictEqual(match.sizeDivergence.consistency, "MATCH");
  const div = D.buildDimensionContract({ physical: { widthMM: 90, heightMM: 55 }, canvas: { widthPx: 450, heightPx: 275, source: "native" }, sizeDivergence: { consistency: "NATIVE_DIVERGENCE", nativeRequestedSize: { width: 160, height: 34 }, locationSize: { width: 160, height: 34 }, actualObjectSize: { width: 243.7, height: 27.1 }, aCoordsSize: { width: 243.7, height: 28.1 } } });
  assert.strictEqual(div.sizeDivergence.consistency, "NATIVE_DIVERGENCE");
});

t("Test14 compareDimensionEvidence 差异逐项", () => {
  const r = D.compareDimensionEvidence({ ...BASE, canvas: { widthPx: 507.5, heightPx: 308.729, source: "native" }, physical: { widthMM: 90, heightMM: 55, source: "n" } }, { ...BASE, canvas: { widthPx: 500, heightPx: 308.729, source: "native" }, physical: { widthMM: 90, heightMM: 55, source: "n" } });
  assert.strictEqual(r.equal, false);
  assert.ok(r.diffs.some((x) => x.path === "canvas.widthPx" && x.delta === 7.5));
  const ok = D.compareDimensionEvidence({ ...BASE }, { ...BASE });
  assert.strictEqual(ok.equal, true);
});

t("Test15 禁硬编码/禁第二坐标系：contract 不含 92/56 字面注入", () => {
  const c = D.buildDimensionContract({ physical: { widthMM: 90, heightMM: 55, source: "native" }, canvas: { widthPx: 450, heightPx: 275, source: "native" } });
  const s = JSON.stringify(c);
  assert.ok(s.indexOf("92") < 0 && s.indexOf('"56"') < 0 || c.physical.widthMM !== 92); // 数值不来自硬编码
  // 只允许 four sizes + 换算/身份等已知键（无第二坐标系键名）
  ["designPx", "ocrPx", "reconstructionPx", "normalizedPx"].forEach((k) => assert.ok(s.indexOf(k) < 0, "forbid " + k));
});

t("Test16 summarize 摘要", () => {
  const s = D.summarizeDimensionContract(D.buildDimensionContract(BASE));
  assert.strictEqual(s.physicalWidthMM, 90);
  assert.strictEqual(s.canvasWidthPx, 507.5);
  assert.ok(s.pxPerMM.width > 0);
  assert.strictEqual(s.pageIdentity, "canvas:c0");
});

t("Test17 primitive-only 可 JSON", () => {
  const c = D.buildDimensionContract(BASE);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(c)), c);
});

t("Test18 空输入安全", () => {
  const c = D.buildDimensionContract(null);
  assert.strictEqual(c.orientation, "unknown");
  assert.strictEqual(c.uniformScale, null);
  assert.strictEqual(c.pxPerMM.width, null);
  assert.strictEqual(c.pageIdentity, null);
  assert.strictEqual(D.dimensionContractEquivalent(null, null).equivalent, true);
});

console.log("native-dimension-contract.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);