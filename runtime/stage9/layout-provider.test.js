// runtime/stage9/layout-provider.test.js — Stage 9 P2：Layout Provider 契约单测
"use strict";
const assert = require("assert");
const L = require("../../extension/src/ocr/layout-provider.js");

let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); } }

const BAIDU_CAND = { id: "bf0", text: "佛山盛盈包装制品有限公司", sourceProvider: "BAIDU", confidence: 0.99, bbox: { x: 10, y: 20, width: 300, height: 40 }, rawMeta: { words: "佛山盛盈包装制品有限公司", location: { left: 10, top: 20, width: 300, height: 40 } } };

// §十五：映射契约（hintText + bbox + geometry.center + rawMeta）
t("toLayoutCandidate: 契约完整", () => {
  const c = L.toLayoutCandidate(BAIDU_CAND, { pageId: "canvas:c0" });
  assert.strictEqual(c.hintText, "佛山盛盈包装制品有限公司");
  assert.strictEqual(c.pageId, "canvas:c0");
  assert.deepStrictEqual(c.geometry.center, { x: 160, y: 40 });
  assert.strictEqual(c.geometry.width, 300);
  assert.strictEqual(c.confidence, 0.99);
  assert.strictEqual(c.provider, "BAIDU");
  assert.ok(c.rawMeta.location);
});
t("toLayoutCandidate: 非法 bbox → null", () => {
  assert.strictEqual(L.toLayoutCandidate({ id: "x", text: "t", bbox: { x: 0, y: 0, width: 0, height: 10 } }), null);
  assert.strictEqual(L.toLayoutCandidate({ id: "x", text: "t", bbox: { x: NaN, y: 0, width: 5, height: 5 } }), null);
  assert.strictEqual(L.toLayoutCandidate(null), null);
  assert.strictEqual(L.toLayoutCandidate({ id: "x", text: "", bbox: { x: 0, y: 0, width: 5, height: 5 } }), null);
});
// §四/§十四：批量映射 + pageId 透传
t("buildLayoutCandidates: 批量 + count + pageId", () => {
  const r = L.buildLayoutCandidates([BAIDU_CAND, { id: "b1", text: "tel", bbox: { x: 0, y: 0, width: 40, height: 40 } }], { pageId: "p1", provider: "BAIDU" });
  assert.strictEqual(r.count, 2);
  assert.strictEqual(r.candidates[1].hintText, "tel");
  assert.strictEqual(r.candidates[1].pageId, "p1");
  assert.strictEqual(r.provider, "BAIDU");
});
// Rule 2：hintText 永远不能成为最终 text
t("Rule2: canUseAsFinalText 恒 false", () => {
  const c = L.toLayoutCandidate(BAIDU_CAND);
  assert.strictEqual(L.canUseAsFinalText(c), false);
  assert.strictEqual(L.canUseAsFinalText(null), false);
});
// 空输入稳健
t("buildLayoutCandidates: 空/非法输入", () => {
  const r = L.buildLayoutCandidates(null, {});
  assert.strictEqual(r.count, 0);
  assert.deepStrictEqual(r.candidates, []);
  const r2 = L.buildLayoutCandidates([null, {}, BAIDU_CAND]);
  assert.strictEqual(r2.count, 1);
});
// 几何保障标记
t("assertGeometryOnly: 给候选打 __geometryOnly 标记", () => {
  const arr = [{}];
  assert.strictEqual(L.assertGeometryOnly(arr), 1);
  assert.strictEqual(arr[0].__geometryOnly, true);
});

console.log("layout-provider.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);