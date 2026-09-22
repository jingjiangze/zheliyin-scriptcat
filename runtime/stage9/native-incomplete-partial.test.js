// runtime/stage9/native-incomplete-partial.test.js — OCR-P1 Commit 4.5：
// NATIVE_GEOMETRY_INCOMPLETE（unmatched>0 且 matched>0）→ 可靠行进入创建（dual-path 语义固化）
"use strict";
const assert = require("assert");
const G = require("../../extension/src/ocr/native-completeness-gate.js");

let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); } }

function mkTb(totalNative, matchedCount, unmatchedTexts) {
  const matchedNative = [];
  for (let i = 0; i < matchedCount; i += 1) matchedNative.push({ native: { id: "m" + i, rawText: "可靠行" + i }, geometry: { bbox: { x: 10, y: i * 30, width: 200, height: 24 } } });
  const unmatchedNative = unmatchedTexts.map((rawText, i) => ({ id: "u" + i, rawText: rawText, order: i }));
  const ar = { matchedNative: matchedNative, unmatchedNative: unmatchedNative, gate: { totalNative: totalNative, matched: matchedCount, unmatchedNative: unmatchedNative.length } };
  const tb = { matched: ar, gate: ar.gate };
  return tb;
}

// 与 userscript fallback 分支逻辑一致的模拟（nativeTruthGatePassed 兜底部分）
function fallbackPassed(tb) {
  if (!tb || tb.blocked) return false;
  if (tb.gate && tb.gate.totalNative > 0) {
    const cg = G.evaluateCompleteness(tb.matched);
    if (cg && cg.ok) return true;
    if (cg && cg.code === "NATIVE_GEOMETRY_INCOMPLETE" && (cg.matched || 0) > 0) return true; // 可靠行放行
    return false;
  }
  return false;
}
// 与 userscript fallback `nativeTruthGateFail` 兜底部分一致的模拟
function fallbackFail(tb) {
  if (tb.gate && tb.gate.totalNative > 0) {
    const cg = G.evaluateCompleteness(tb.matched);
    if (cg && cg.code === "NATIVE_GEOMETRY_INCOMPLETE" && (cg.matched || 0) > 0) {
      const miss = (tb.matched && Array.isArray(tb.matched.unmatchedNative)) ? tb.matched.unmatchedNative.map(function (n) { return n && n.rawText != null ? String(n.rawText) : ""; }).filter(Boolean) : [];
      return { code: "NATIVE_PARTIAL_OK", message: "Native 识别 " + (cg.totalNative || 0) + " 行，可定位 " + (cg.matched || 0) + " 行即将创建；缺失 " + (cg.unresolved || 0) + " 行文字不创建：" + (miss.join("、") || "（无）"), missingTexts: miss };
    }
    return { code: (cg && cg.code) || "NATIVE_GEOMETRY_INCOMPLETE", message: (cg && cg.message) || "几何不完整，本批不创建", missingTexts: [] };
  }
  return { code: "NATIVE_TRUTH_BLOCKED", message: "无 Native 真值，本批不创建", missingTexts: [] };
}

t("10 行 native/9 行 geometry：resolveGate allowPartial → NATIVE_PARTIAL_OK（可靠行创建）", () => {
  const tb = mkTb(10, 9, ["夏祝莲"]);
  const rg = G.resolveGate(tb, { allowPartial: true });
  assert.strictEqual(rg.ok, true);
  assert.strictEqual(rg.code, "NATIVE_PARTIAL_OK");
  assert.strictEqual(rg.matched, 9);
  assert.strictEqual(rg.unresolved, 1);
  assert.deepStrictEqual(rg.missingTexts, ["夏祝莲"]);
});

t("10 行/9 行：fallback 兜底 passed → true（不再整批拒绝）", () => {
  const tb = mkTb(10, 9, ["夏祝莲"]);
  assert.strictEqual(fallbackPassed(tb), true);
  const fg = fallbackFail(tb);
  assert.strictEqual(fg.code, "NATIVE_PARTIAL_OK");
  assert.deepStrictEqual(fg.missingTexts, ["夏祝莲"]);
  assert.ok(fg.message.indexOf("可定位 9 行即将创建") >= 0);
});

t("全部 matched（COMPLETE）→ 主/兜底均放行，无 missing", () => {
  const tb = mkTb(10, 10, []);
  const rg = G.resolveGate(tb, { allowPartial: true });
  assert.strictEqual(rg.code, "COMPLETE");
  assert.strictEqual(fallbackPassed(tb), true);
  assert.deepStrictEqual(fallbackFail(tb).missingTexts, []);
});

t("matched==0（UNRESOLVED）→ 仍整批不创建（主/兜底一致 STOP）", () => {
  const tb = mkTb(10, 0, ["行一", "行二"]);
  const rg = G.resolveGate(tb, { allowPartial: true });
  assert.strictEqual(rg.ok, false);
  assert.strictEqual(rg.code, "NATIVE_GEOMETRY_UNRESOLVED");
  assert.strictEqual(fallbackPassed(tb), false);
});

t("无 allowPartial（历史默认）→ 仍 NATIVE_GEOMETRY_INCOMPLETE（整批不创建保底）", () => {
  const tb = mkTb(10, 9, ["夏祝莲"]);
  const rg = G.resolveGate(tb);
  assert.strictEqual(rg.ok, false);
  assert.strictEqual(rg.code, "NATIVE_GEOMETRY_INCOMPLETE");
});

console.log("native-incomplete-partial.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);