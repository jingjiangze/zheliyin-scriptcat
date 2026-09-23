// runtime/stage9/native-gate-every-path.test.js — OCR-P1 Commit 1：Native Truth Gate（every creation path）
// 覆盖 docs/OCR_P1_GATE_AUDIT.md A/C/D 三修复的纯函数层验证：
//   resolveGate(tb)：blocked(unavailable/dependency-missing) / INCOMPLETE / COMPLETE / 无真值
"use strict";
const G = require("../../extension/src/ocr/native-completeness-gate.js");

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed += 1; console.log("PASS " + name); }
  catch (e) { failed += 1; console.error("FAIL: " + name + "\n  " + (e && e.message)); }
}

// ---- tb 构造 helper ----
function tbUnavailable(code) {
  return { blocks: [], mode: "OFF", skipped: true, reason: "unavailable", blocked: true, nativeFailCode: code || "NATIVE_HTTP_FAILED" };
}
function tbDepMissing() {
  return { blocks: [], mode: "OFF", skipped: true, reason: "dependency-missing", blocked: true };
}
function tbCompleteNative(n) {
  const native = { ok: true, texts: Array.from({ length: n }, (_, i) => ({ id: "n" + i, rawText: "行" + (i + 1), order: i })) };
  const geo = Array.from({ length: n }, (_, i) => ({ id: "g" + i, bbox: { x: 10, y: 20 + i * 30, width: 200, height: 20 }, text: "行" + (i + 1) }));
  const ar = { matchedNative: native.texts.map((x, i) => ({ native: x, geometry: geo[i], match: { score: 1, method: "EXACT_TEXT" } })), unmatchedNative: [], matchedGeometry: geo, unusedGeometry: [], gate: { totalNative: n, matched: n, unmatchedNative: 0, matchedGeometry: n, unusedGeometry: 0 } };
  return { blocks: [], mode: "NATIVE_TRUTH", native, matched: ar, gate: ar.gate };
}
function tbIncomplete(n, m) {
  const native = { ok: true, texts: Array.from({ length: n }, (_, i) => ({ id: "n" + i, rawText: "行" + (i + 1), order: i })) };
  const matchedNative = [], unmatchedNative = [], matchedGeometry = [];
  for (let i = 0; i < m; i += 1) {
    const geo = { id: "g" + i, bbox: { x: 10, y: 20 + i * 30, width: 200, height: 20 }, text: "行" + (i + 1) };
    matchedNative.push({ native: native.texts[i], geometry: geo, match: { score: 1, method: "EXACT_TEXT" } });
    matchedGeometry.push(geo);
  }
  for (let i = m; i < n; i += 1) unmatchedNative.push(native.texts[i]);
  const ar = { matchedNative, unmatchedNative, matchedGeometry, unusedGeometry: [], gate: { totalNative: n, matched: m, unmatchedNative: n - m, matchedGeometry: m, unusedGeometry: 0 } };
  return { blocks: [], mode: "NATIVE_TRUTH", native, matched: ar, gate: ar.gate };
}
function tbNull() { return null; }

// ---- A：Native unavailable → STOP（Baidu text 不得进 creation）----
t("A1: unavailable NATIVE_HTTP_FAILED → resolveGate ok=false code=NATIVE_UNAVAILABLE", () => {
  const r = G.resolveGate(tbUnavailable("NATIVE_HTTP_FAILED"));
  if (r.ok) throw new Error("expected ok=false");
  if (r.code !== "NATIVE_UNAVAILABLE") throw new Error("code=" + r.code);
  if ((r.message || "").indexOf("本批不创建") < 0) throw new Error("no STOP message");
});
t("A2: unavailable 即使携带 Baidu blocks（tombstone 语义：必须 STOP）", () => {
  const tb = Object.assign(tbUnavailable("NATIVE_SESSION_EXPIRED"), { blocks: [{ text: "Baidu泄漏", sourceProvider: "BAIDU" }] });
  const r = G.resolveGate(tb);
  if (r.ok) throw new Error("must stop");
  if (r.code !== "NATIVE_UNAVAILABLE") throw new Error("code=" + r.code);
});
t("A3: unavailable 时 message 含泄漏禁语", () => {
  const r = G.resolveGate(tbUnavailable());
  if ((r.message || "").indexOf("禁止用其它 OCR 文本进入画布") < 0) throw new Error("msg missing leak guard");
});

// ---- C：Local path 同门禁（Local 仅几何）----
t("C1: local path 传 unavailable tb → STOP code=NATIVE_UNAVAILABLE", () => {
  const r = G.resolveGate(tbUnavailable());
  if (r.ok) throw new Error("must stop");
  if (r.code !== "NATIVE_UNAVAILABLE") throw new Error("code=" + r.code);
});

// ---- D：依赖缺失 / 无结果 ----
t("D1: dependency-missing → code=NATIVE_DEPENDENCY_MISSING STOP", () => {
  const r = G.resolveGate(tbDepMissing());
  if (r.ok) throw new Error("must stop");
  if (r.code !== "NATIVE_DEPENDENCY_MISSING") throw new Error("code=" + r.code);
});
t("D2: tb=null → NATIVE_TRUTH_BLOCKED STOP", () => {
  const r = G.resolveGate(tbNull());
  if (r.ok) throw new Error("must stop");
  if (r.code !== "NATIVE_TRUTH_BLOCKED") throw new Error("code=" + r.code);
});

// ---- COMPLETE（正常创建路径不受影响）----
t("E1: Native 10/10 COMPLETE → ok=true（正常创建保持）", () => {
  const r = G.resolveGate(tbCompleteNative(10));
  if (!r.ok) throw new Error("expected ok=true code=" + r.code);
  if (r.totalNative !== 10) throw new Error("totalNative=" + r.totalNative);
});
t("E2: Native 1/1 COMPLETE → ok=true", () => {
  const r = G.resolveGate(tbCompleteNative(1));
  if (!r.ok) throw new Error("expected ok=true");
});

// ---- INCOMPLETE（14→13 场景保持 STOP）----
t("F1: Native 14 only 13 matched → INCOMPLETE STOP（不可放宽）", () => {
  const r = G.resolveGate(tbIncomplete(14, 13));
  if (r.ok) throw new Error("must stop");
  if (r.code !== "NATIVE_GEOMETRY_INCOMPLETE") throw new Error("code=" + r.code);
  if (r.matched !== 13 || r.unresolved !== 1) throw new Error("matched/unresolved wrong: " + r.matched + "/" + r.unresolved);
});
t("F2: Native 3 only 0 matched → UNRESOLVED STOP", () => {
  const r = G.resolveGate(tbIncomplete(3, 0));
  if (r.ok) throw new Error("must stop");
  if (r.code !== "NATIVE_GEOMETRY_UNRESOLVED") throw new Error("code=" + r.code);
});

// ---- 无 Native 真值行（totalNative=0）----
t("G1: gate 存在但 totalNative=0 → NATIVE_NO_TRUTH STOP", () => {
  const tb = { blocks: [], mode: "NATIVE_TRUTH", gate: { totalNative: 0, matched: 0, unmatchedNative: 0, matchedGeometry: 0, unusedGeometry: 0 }, matched: { matchedNative: [], unmatchedNative: [], matchedGeometry: [], unusedGeometry: [] } };
  const r = G.resolveGate(tb);
  if (r.ok) throw new Error("must stop");
  if (r.code !== "NATIVE_NO_TRUTH") throw new Error("code=" + r.code);
});
t("G2: tb 无 gate 无 blocked → NATIVE_NO_TRUTH STOP（防漏）", () => {
  const r = G.resolveGate({ blocks: [], mode: "OFF" });
  if (r.ok) throw new Error("must stop");
  if (r.code !== "NATIVE_NO_TRUTH") throw new Error("code=" + r.code);
});

console.log("native-gate-every-path: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);
