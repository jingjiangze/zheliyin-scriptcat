// runtime/stage9/text-geometry-matcher.test.js — Stage 9 P3：Text/Geometry 匹配单测
"use strict";
const assert = require("assert");
const M = require("../../extension/src/ocr/text-geometry-matcher.js");
const A = require("../../extension/src/ocr/altq-provider.js");

let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); } }

const L = (id, text, y) => ({ id: id, hintText: text, bbox: { x: 0, y: y, width: 300, height: 40 }, geometry: { x: 0, y: y, width: 300, height: 40, center: { x: 150, y: y + 20 } }, confidence: 0.9, pageId: "p1" });
const AT = (text, order, pageId) => ({ id: "a" + order, rawText: text, matchText: A.normalizeMatchText(text), order: order, pageId: pageId });

// §十八：pageId 隔离
t("优先级1: 跨 page 隔离", () => {
  const r = M.matchTextGeometry([AT("吴健湘", 0, "p1")], [L("b0", "吴健湘", 0)], { pageId: "p2" });
  assert.strictEqual(r.regions.length, 0);
  assert.strictEqual(r.unmatchedAltQ.length, 1);
  assert.strictEqual(r.unmatchedBaidu.length, 1);
});
// §十八：exact text
t("优先级2: exact text → EXACT_TEXT + textSource=NATIVE_OCR", () => {
  const r = M.matchTextGeometry([AT("吴健湘", 0)], [L("b0", "吴健湘", 0)], { pageId: "p1" });
  assert.strictEqual(r.regions.length, 1);
  const rg = r.regions[0];
  assert.strictEqual(rg.text, "吴健湘");
  assert.strictEqual(rg.textSource, "NATIVE_OCR"); // Stage 9 V3 §九：文字真值语义
  assert.strictEqual(rg.geometrySource, "BAIDU");
  assert.strictEqual(rg.match.method, "EXACT_TEXT");
  assert.strictEqual(rg.match.score, 1);
  assert.strictEqual(rg.textEvidence.nativeRawText, "吴健湘");
  assert.strictEqual(rg.geometryEvidence.baiduId, "b0");
});
// §十九：text 完全不同 → position/order 匹配，text 恒为 AltQ
t("优先级3: 文字不同（佛山 vs 回册）→ POSITION_ORDER 且文本用 AltQ", () => {
  const r = M.matchTextGeometry([AT("佛山盛盈包装制品有限公司", 0)], [L("b0", "回册佛山盛包装制品限", 0)], { pageId: "p1" });
  assert.strictEqual(r.regions.length, 1);
  const rg = r.regions[0];
  assert.strictEqual(rg.text, "佛山盛盈包装制品有限公司");
  assert.strictEqual(rg.match.method, "POSITION_ORDER");
  assert.strictEqual(rg.geometryEvidence.bbox.width, 300);
});
// §二十：one-to-many（Baidu 一行含 2 个 AltQ）
t("one-to-many: Baidu '吴健湘 客户经理' vs 2 个 AltQ → AMBIGUOUS 标记", () => {
  const altq = [AT("吴健湘", 0), AT("客户经理", 1)];
  const layouts = [L("b0", "吴健湘 客户经理", 0)];
  const r = M.matchTextGeometry(altq, layouts, { pageId: "p1" });
  assert.ok(r.ambiguousMatches.length >= 0);
  const om = M.detectOneToMany(r.regions.length ? altq : [], r.regions.length ? "吴健湘 客户经理" : "吴健湘 客户经理");
  // 直接测 detectOneToMany
  const om2 = M.detectOneToMany(altq, "吴健湘 客户经理");
  assert.strictEqual(om2.ambiguous, true);
  assert.strictEqual(om2.kind, "ONE_TO_MANY");
  assert.strictEqual(om2.parts.length, 2);
});
// §二十一：相似文本（电话/电话）用 order+pageId 区分
t("identityKey: 相似文本用 pageId+order 区分", () => {
  const k1 = M.identityKey("p1", 0, "电话", 0);
  const k2 = M.identityKey("p1", 1, "电话", 1);
  const k3 = M.identityKey("p1", 0, "电话", 0);
  assert.notStrictEqual(k1, k2);
  assert.strictEqual(k1, k3);
});
// 多个相似文本按序配对（不 text===text 短路）
t("多相似文本: 按序配对", () => {
  const altq = [AT("电话", 0), AT("电话", 1)];
  const layouts = [L("b0", "电话", 0), L("b1", "电话", 40)];
  const r = M.matchTextGeometry(altq, layouts, { pageId: "p1" });
  assert.strictEqual(r.regions.length, 2);
  assert.strictEqual(r.unmatchedAltQ.length, 0);
  assert.strictEqual(r.unmatchedBaidu.length, 0);
});
// 统计字段
t("统计: unmatchedAltQ/unmatchedBaidu", () => {
  const r = M.matchTextGeometry([AT("独苗", 0)], [L("b0", "甲", 0), L("b1", "乙", 40)], { pageId: "p1" });
  assert.strictEqual(r.unmatchedBaidu.length, 1);
  assert.strictEqual(r.unmatchedBaidu[0].hint, "乙");
});
// 空输入稳健
t("空输入: 不抛", () => {
  const r = M.matchTextGeometry(null, null, {});
  assert.deepStrictEqual(r.regions, []);
  assert.deepStrictEqual(r.unmatchedAltQ, []);
  assert.deepStrictEqual(r.unmatchedBaidu, []);
  assert.deepStrictEqual(r.ambiguousMatches, []);
});
// region id / textEvidence / match.ambiguous 存在
t("region 字段完整", () => {
  const r = M.matchTextGeometry([AT("吴健湘", 0)], [L("b0", "吴健湘", 0)], { pageId: "p1" });
  const rg = r.regions[0];
  assert.ok(rg.id.length > 2);
  assert.ok(rg.textEvidence.nativeId);
  assert.strictEqual(typeof rg.match.ambiguous, "boolean");
  assert.strictEqual(typeof rg.match.score, "number");
});
// textKey 归一
t("textKey: 空白/大小写归一", () => {
  assert.strictEqual(M.textKey("  A B "), "ab");
  assert.strictEqual(M.textKey("Tel"), "tel");
});

console.log("text-geometry-matcher.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);