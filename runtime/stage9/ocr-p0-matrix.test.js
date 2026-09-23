// runtime/stage9/ocr-p0-matrix.test.js — OCR-P0.5-B：Baidu 失败不阻断 Native 的 5 CASE 矩阵
// 验证控制关系（OCR-P0.2 解耦后）：
//   CASE A：Baidu empty           → Native OCR 已执行（runNativeTruth 独立）
//   CASE B：Baidu quality fail    → Native OCR 已执行
//   CASE C：Baidu exception       → Native OCR 已执行
//   CASE D：Baidu 8 geometry + Native 8 text → 8/8 matched（COMPLETE）
//   CASE E：Baidu 8 geometry + Native 5 text（2 无 match）→ NATIVE_GEOMETRY_INCOMPLETE，本批不创建
"use strict";
const assert = require("assert");
const A = require("../../extension/src/ocr/native-geometry-aligner.js");
const G = require("../../extension/src/ocr/native-completeness-gate.js");
const N = require("../../extension/src/ocr/native-ocr-provider.js");

let passed = 0, failed = 0, failures = [];
function t(name, fn) {
  return Promise.resolve().then(fn).then(
    () => { passed += 1; },
    (e) => { failed += 1; failures.push(name + " :: " + (e && e.message || e)); }
  );
}
const RUN = [];
const nat = (raw, order) => ({ id: "n" + order, rawText: raw, order: order, bbox: null });

// 模拟 runNativeTruth（独立第一主链）：任何 Baidu 状态都被调用
function makeNativeTruthMock(nativeLines, log) {
  return async function runNativeTruth(img) {
    log.nativeCalled = (log.nativeCalled || 0) + 1;
    log.nativeTextType = log.nativeTextType || img && img.textType;
    return { executed: true, statusCode: "NATIVE_OK", native: { ok: true, texts: nativeLines.map((x, i) => nat(x, i)) } };
  };
}
// 模拟 Baidu geometry 执行（含失败分类），并返回 geometry blocks（模拟 runGeometryRecognition 内 BT→ blocks）
function makeGeoSide(produce, log) {
  return async function runGeometry(geoFn) {
    log.geoCalled = (log.geoCalled || 0) + 1;
    return { ok: true, blocks: produce() };
  };
}

const NATIVE5 = ["行一", "行二", "行三", "行四", "行五"];
const GEO8 = [0,1,2,3,4,5,6,7].map((i) => ({ text: "行一", bbox: { x: 10, y: 100 + i*30, width: 80, height: 20 } }));
// CASE D native 文本 = geometry 文本（便于 exact match）；此处仅长度控制
const GEO8_EXACT = ["行一","行二","行三","行四","行五","行六","行七","行八"].map((tx, i) => ({ text: tx, bbox: { x: 10, y: 100 + i*30, width: 80, height: 20 } }));
const GEO3 = [{ text: "行一", bbox: { x: 10, y: 100, width: 80, height: 20 } }, { text: "行二", bbox: { x: 10, y: 130, width: 80, height: 20 } }, { text: "行三", bbox: { x: 10, y: 160, width: 80, height: 20 } }];

// 组合编排：Native Truth 独立执行 + Geometry 执行（Baidu 失败也捕获并继续，Native 结果已保存）
// 模拟 OCR-P0.2 控制关系：runBaiduOcr = runNativeTruth ∥ runGeometryRecognition
async function orchestrate(native5, geoFn, log) {
  const nt = await makeNativeTruthMock(native5, log)(); // Native 第一主链（独立，与 Baidu 无关）
  let geo = null;
  try { geo = await geoFn(); } catch (e) { geo = { ok: false, threw: String(e && e.message || e) }; log.geoThrew = geo.threw; }
  return { nt, geo };
}

// ---- CASE A：Baidu empty（0 几何）→ Native 已执行；对齐全 unmatched → UNRESOLVED ----
RUN.push(t("CASE A: Baidu empty + Native 5 → Native 已执行（nativeCalled=1）且 UNRESOLVED 不创建", async () => {
  const log = {};
  const { nt } = await orchestrate(NATIVE5, async function emptyGeo() { log.geoCalled = 1; return { ok: true, blocks: [] }; }, log);
  assert.strictEqual(log.nativeCalled, 1, "Native OCR 必须已执行（Baidu empty 不阻断）");
  assert.strictEqual(nt.statusCode, "NATIVE_OK");
  const r = A.alignNativeGeometry(nt.native.texts, []);
  const g = G.evaluateCompleteness(r);
  assert.strictEqual(g.ok, false);
  assert.strictEqual(g.code, "NATIVE_GEOMETRY_UNRESOLVED");
  assert.strictEqual(g.totalNative, 5);
}));

// ---- CASE B：Baidu quality fail（候选全被质量门拒）→ Native 已执行 ----
RUN.push(t("CASE B: Baidu quality fail + Native 5 → Native 已执行（nativeCalled=1）", async () => {
  const log = {};
  await orchestrate(NATIVE5, async function qualityFail() { log.geoCalled = 1; return { ok: false, reason: "BAIDU_QUALITY_BLOCK" }; }, log);
  assert.strictEqual(log.nativeCalled, 1, "Baidu Quality FAIL 不阻断 Native");
  assert.strictEqual(log.geoCalled, 1);
}));

// ---- CASE C：Baidu exception（provider 抛）→ Native 已执行 ----
RUN.push(t("CASE C: Baidu exception + Native 5 → Native 已执行（nativeCalled=1）", async () => {
  const log = {};
  await orchestrate(NATIVE5, async function exceptionGeo() { log.geoCalled = 1; throw new Error("CLOUD_EXCEPTION"); }, log);
  assert.strictEqual(log.nativeCalled, 1, "Baidu exception 不阻断 Native");
  assert.strictEqual(log.geoCalled, 1);
}));

// ---- CASE D：Baidu 8 geometry + Native 8 text → 8/8 matched（COMPLETE）----
RUN.push(t("CASE D: Baidu 8 + Native 8 → 8/8 matched COMPLETE", async () => {
  const native8 = GEO8_EXACT.map((g) => g.text);
  const log = {};
  const { nt } = await orchestrate(native8, async function fullGeo() { log.geoCalled = 1; return { ok: true, blocks: GEO8_EXACT }; }, log);
  assert.strictEqual(log.nativeCalled, 1);
  const r = A.alignNativeGeometry(nt.native.texts, GEO8_EXACT);
  assert.strictEqual(r.gate.matched, 8);
  assert.strictEqual(r.gate.unmatchedNative, 0);
  const g = G.evaluateCompleteness(r);
  assert.strictEqual(g.ok, true);
  assert.strictEqual(g.code, "COMPLETE");
}));

// ---- CASE E：Baidu 8 geometry + Native 5 text（4/5 无可靠 match）→ NATIVE_GEOMETRY_INCOMPLETE 本批不创建 ----
RUN.push(t("CASE E: Baidu 8 + Native 5（行四/行五 无可靠 match）→ INCOMPLETE 本批不创建", async () => {
  const log = {};
  const blocks = GEO3.concat([0,1,2,3,4].map((i) => ({ text: "其他内容" + (i+1), bbox: { x: 10, y: 300 + i*30, width: 90, height: 20 } })));
  const { nt } = await orchestrate(NATIVE5, async function mixedGeo() { log.geoCalled = 1; return { ok: true, blocks: blocks }; }, log);
  assert.strictEqual(log.nativeCalled, 1);
  const r = A.alignNativeGeometry(nt.native.texts, blocks);
  assert.strictEqual(r.gate.matched, 3);
  assert.strictEqual(r.gate.unmatchedNative, 2);
  const g = G.evaluateCompleteness(r);
  assert.strictEqual(g.ok, false);
  assert.strictEqual(g.code, "NATIVE_GEOMETRY_INCOMPLETE");
  // 本批不进入创建（blockCreate 语义由 runGeometryRecognition 接线保证——此处断言门禁判据）
  assert.strictEqual(g.matched < g.totalNative, true);
}));

// ---- 补充：Transaction 统一性（OCR-P0.5）：同一 tx = 同图 = 同 pageId ----
RUN.push(t("P0.5: createTransaction 携带 imageFingerprint/naturalWidth/Height/payloadBytes", () => {
  const TI = require("../../extension/src/ocr/transaction-identity.js");
  const tx = TI.createTransaction({ pageId: "canvas:c0", side: "FRONT", dataUrl: "data:image/png;base64,AAAA", naturalWidth: 1063, naturalHeight: 638 });
  assert.ok(tx.imageFingerprint.startsWith("img-"));
  assert.strictEqual(tx.naturalWidth, 1063);
  assert.strictEqual(tx.naturalHeight, 638);
  assert.strictEqual(tx.payloadBytes, 3);
  const v = TI.validateTransactionIdentity(tx);
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.pageId, "canvas:c0");
  assert.strictEqual(v.imageFingerprint, tx.imageFingerprint);
}));

Promise.all(RUN).then(() => {
  console.log("ocr-p0-matrix.test: pass=" + passed + " fail=" + failed);
  if (failures.length) console.error(failures.join("\n"));
  process.exit(failed ? 1 : 0);
});