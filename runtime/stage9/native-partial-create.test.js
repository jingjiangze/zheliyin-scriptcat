// runtime/stage9/native-partial-create.test.js — OCR-P1 Commit 3a：可靠行部分创建 + 缺失文字告知
"use strict";
const assert = require("assert");
const G = require("../../extension/src/ocr/native-completeness-gate.js");

let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); } }

// 构造 alignResult 语义 helper：matched/failed native 行集合
function mkTb(totalNative, matchedCount, unmatchedTexts) {
  const matchedNative = [];
  for (let i = 0; i < matchedCount; i += 1) matchedNative.push({ native: { id: "m" + i, rawText: "行" + i }, geometry: { bbox: { x: 10, y: i * 30, width: 200, height: 24 } } });
  const unmatchedNative = unmatchedTexts.map((rawText, i) => ({ id: "u" + i, rawText: rawText, order: i }));
  const ar = { matchedNative: matchedNative, unmatchedNative: unmatchedNative, gate: { totalNative: totalNative, matched: matchedCount, unmatchedNative: unmatchedNative.length } };
  const tb = { matched: ar, gate: ar.gate };
  return tb;
}

t("COMPLETE + allowPartial → ok=true code=COMPLETE missingTexts=[]", () => {
  const tb = mkTb(3, 3, []);
  const rg = G.resolveGate(tb, { allowPartial: true });
  assert.strictEqual(rg.ok, true);
  assert.strictEqual(rg.code, "COMPLETE");
  assert.deepStrictEqual(rg.missingTexts, []);
});

t("INCOMPLETE + allowPartial → NATIVE_PARTIAL_OK ok=true（可靠行创建）", () => {
  const tb = mkTb(4, 3, ["缺失的手写行一", "缺失的手写行二"]);
  const rg = G.resolveGate(tb, { allowPartial: true });
  assert.strictEqual(rg.ok, true);
  assert.strictEqual(rg.code, "NATIVE_PARTIAL_OK");
  assert.strictEqual(rg.matched, 3);
  assert.strictEqual(rg.unresolved, 2);
  assert.deepStrictEqual(rg.missingTexts, ["缺失的手写行一", "缺失的手写行二"]);
  assert.ok(rg.message.indexOf("缺失 2 行文字不创建") >= 0);
  assert.ok(rg.message.indexOf("缺失的手写行一") >= 0); // 缺失文字在告知文案中
});

t("INCOMPLETE 默认（无 allowPartial）→ 仍 ok=false code=INCOMPLETE（整批不创建保持）", () => {
  const tb = mkTb(4, 3, ["缺失行"]);
  const rg = G.resolveGate(tb);
  assert.strictEqual(rg.ok, false);
  assert.strictEqual(rg.code, "NATIVE_GEOMETRY_INCOMPLETE");
});

t("UNRESOLVED + allowPartial → 无可靠行仍 ok=false + missingTexts 全量", () => {
  const tb = mkTb(2, 0, ["全部无法定位一", "全部无法定位二"]);
  const rg = G.resolveGate(tb, { allowPartial: true });
  assert.strictEqual(rg.ok, false);
  assert.strictEqual(rg.code, "NATIVE_GEOMETRY_UNRESOLVED");
  assert.deepStrictEqual(rg.missingTexts, ["全部无法定位一", "全部无法定位二"]);
});

t("unavailable tombstone + allowPartial → 仍 STOP NATIVE_UNAVAILABLE", () => {
  const tb = { blocked: true, reason: "unavailable", nativeFailCode: "NATIVE_HTTP_FAILED", gate: {}, matched: { matcdNative: [], unmatchedNative: [] } };
  const rg = G.resolveGate(tb, { allowPartial: true });
  assert.strictEqual(rg.ok, false);
  assert.strictEqual(rg.code, "NATIVE_UNAVAILABLE");
});

t("tb=null → NATIVE_TRUTH_BLOCKED 且 missingTexts 兜底 []", () => {
  const rg = G.resolveGate(null, { allowPartial: true });
  assert.strictEqual(rg.ok, false);
  assert.strictEqual(rg.code, "NATIVE_TRUTH_BLOCKED");
  assert.deepStrictEqual(rg.missingTexts, []);
});

console.log("native-partial-create.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);