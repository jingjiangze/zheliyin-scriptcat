// tests/editor-object-model/native-anchor-matcher.test.js — Stage 9 方案 Commit 5：Native Anchor Matcher 纯逻辑单测
"use strict";
const assert = require("assert");
const path = require("path");
const M = require(path.join(__dirname, "..", "..", "extension", "src", "editor", "native-anchor-matcher.js"));

let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); } }

const anchor = (over) => Object.assign({
  pageId: "canvas:c0", side: "FRONT",
  sourceText: { rawText: "客户经理" },
  style: { fontSize: 20, fontFamily: "思源黑体 Regular" },
  geometry: { center: { x: 200, y: 100 }, visualWidth: 120, visualHeight: 34 },
  actualInk: { lineCount: 1 },
  layerNum: 3
}, over || {});

const block = (over) => Object.assign({
  pageId: "canvas:c0", side: "FRONT", sourceText: "客户经理",
  center: { x: 200, y: 100 }, width: 120, height: 34, fontSize: 20, fontFamily: "思源黑体 Regular", layerNum: 3
}, over || {});

t("scriptTypeOf：cjk/latin/digit/mixed/empty", () => {
  assert.strictEqual(M.scriptTypeOf("客户"), "cjk");
  assert.strictEqual(M.scriptTypeOf("ABC"), "latin");
  assert.strictEqual(M.scriptTypeOf("123"), "digit");
  assert.strictEqual(M.scriptTypeOf("客户ABC123"), "mixed");
  assert.strictEqual(M.scriptTypeOf(""), "empty");
});

t("lineCountEstimate：cjk 约为 1 字/字号", () => {
  assert.strictEqual(M.lineCountEstimate("客户经理", 20, 120), 1);  // 4字×20px=80 <120 → 1 行
  assert.ok(M.lineCountEstimate("客户经理很长的文字", 20, 60) >= 2);
});

t("spatialProximity：中心越近分越高", () => {
  const a = M.spatialProximity({ x: 0, y: 0 }, { x: 10, y: 0 }, 100);
  const b = M.spatialProximity({ x: 0, y: 0 }, { x: 100, y: 0 }, 100);
  assert.ok(a > b);
});

t("sizeSimilarity：比例交叠", () => {
  assert.ok(M.sizeSimilarity({ width: 100, height: 40 }, { width: 100, height: 40 }) > 0.99);
  assert.ok(M.sizeSimilarity({ width: 100, height: 40 }, { width: 50, height: 20 }) < M.sizeSimilarity({ width: 100, height: 40 }, { width: 95, height: 38 }));
});

t("fontSizeSimilarity：log 邻近", () => {
  assert.ok(M.fontSizeSimilarity(20, 20) > M.fontSizeSimilarity(20, 40));
});

t("textShapeSimilarity：长度近 + script 同 → 高", () => {
  const same = M.textShapeSimilarity("客户经理", "客户经理");
  const diff = M.textShapeSimilarity("客户经理", "ABC");
  assert.ok(same > diff);
  assert.ok(same > 0.9);
});

t("layerSimilarity：层距近 → 高", () => {
  assert.ok(M.layerSimilarity({ layerNum: 3 }, { layerNum: 3 }) > M.layerSimilarity({ layerNum: 3 }, { layerNum: 8 }));
});

t("MATCH：理想 block 命中自身锚点", () => {
  const r = M.matchAnchorBlock({ anchors: [anchor()], block: block() });
  assert.strictEqual(r.verdict, "MATCH");
  assert.strictEqual(r.matchedIndex, 0);
  assert.ok(r.matchScore >= M.MATCH_THRESHOLD);
});

t("NO_MATCH：page 门控不通过", () => {
  const r = M.matchAnchorBlock({ anchors: [anchor()], block: block({ pageId: "canvas:c9" }) });
  assert.strictEqual(r.verdict, "NO_MATCH");
  assert.strictEqual(r.reason, "page-gate: no candidate");
});

t("NO_MATCH：side 门控不通过", () => {
  const r = M.matchAnchorBlock({ anchors: [anchor()], block: block({ side: "BACK" }) });
  assert.strictEqual(r.verdict, "NO_MATCH");
});

t("MATCH：多锚点中空间最近者胜出", () => {
  const anchors = [anchor({ sourceText: { rawText: "A" }, geometry: { center: { x: 50, y: 50 }, visualWidth: 100, visualHeight: 30 }, style: { fontSize: 14, fontFamily: "F1" }, layerNum: 2 }), anchor({ sourceText: { rawText: "B" }, geometry: { center: { x: 300, y: 250 }, visualWidth: 100, visualHeight: 30 }, style: { fontSize: 14, fontFamily: "F1" }, layerNum: 4 })];
  const r = M.matchAnchorBlock({ anchors, block: block({ center: { x: 310, y: 255 }, width: 100, height: 30 }) });
  assert.strictEqual(r.verdict, "MATCH");
  assert.strictEqual(r.matchedIndex, 1);
});

t("NO_MATCH：中心远且尺寸差异大 → 低于阈值", () => {
  const r = M.matchAnchorBlock({ anchors: [anchor()], block: block({ center: { x: 900, y: 900 }, width: 40, height: 40 }) });
  assert.strictEqual(r.verdict, "NO_MATCH");
  assert.strictEqual(r.reason, "below-threshold");
});

t("NATIVE_ANCHOR_UNCERTAIN：两候选相近（同位置同形态）", () => {
  const anchors = [anchor({ pageId: "canvas:c0", side: "FRONT", sourceText: { rawText: "客户经理" }, geometry: { center: { x: 100, y: 100 }, visualWidth: 120, visualHeight: 30 }, layerNum: 2 }), anchor({ pageId: "canvas:c0", side: "FRONT", sourceText: { rawText: "客户经理" }, geometry: { center: { x: 108, y: 104 }, visualWidth: 118, visualHeight: 30 }, layerNum: 3 })];
  const r = M.matchAnchorBlock({ anchors, block: block({ center: { x: 103, y: 102 }, width: 120, height: 30 }) });
  assert.strictEqual(r.verdict, "NATIVE_ANCHOR_UNCERTAIN");
});

t("层因子影响：block layerNum 对齐胜者", () => {
  const anchors = [anchor({ sourceText: { rawText: "A" }, geometry: { center: { x: 150, y: 80 }, visualWidth: 100, visualHeight: 30 }, style: { fontSize: 20, fontFamily: "X" }, layerNum: 9 }), anchor({ sourceText: { rawText: "B" }, geometry: { center: { x: 170, y: 84 }, visualWidth: 100, visualHeight: 30 }, style: { fontSize: 20, fontFamily: "X" }, layerNum: 3 })];
  const r = M.matchAnchorBlock({ anchors, block: block({ center: { x: 160, y: 82 }, width: 100, height: 30, layerNum: 3 }) });
  assert.strictEqual(r.matchedIndex, 1);
});

t("空输入安全", () => {
  const r0 = M.matchAnchorBlock({ anchors: [], block: block() });
  assert.strictEqual(r0.verdict, "NO_MATCH");
  const r1 = M.matchAnchorBlock(null);
  assert.strictEqual(r1.verdict, "NO_MATCH");
});

t("primitive-only 可 JSON", () => {
  const r = M.matchAnchorBlock({ anchors: [anchor()], block: block() });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r)), r);
});

t("scoreCandidate 因子齐全", () => {
  const s = M.scoreCandidate(block(), anchor(), 100);
  for (const k of ["spatial", "size", "shape", "style", "lines", "layer"]) { assert.ok(k in s.factors, k); assert.ok(typeof s.factors[k] === "number"); }
  assert.ok(s.total > 0 && s.total <= 1);
});

t("scriptTypeOf 混合含标点权重（Tel: 判定 latin-ish → mixed）", () => {
  assert.notStrictEqual(M.scriptTypeOf("Tel:0757-88809856"), "empty");
});

console.log("native-anchor-matcher.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);