// runtime/stage9/native-completeness-gate.test.js — OCR-P0.3-C/D/E 完整性门禁
"use strict";
const assert = require("assert");
const A = require("../../extension/src/ocr/native-geometry-aligner.js");
const G = require("../../extension/src/ocr/native-completeness-gate.js");

let passed = 0, failed = 0, failures = [];
function t(name, fn) {
  return Promise.resolve().then(fn).then(
    () => { passed += 1; },
    (e) => { failed += 1; failures.push(name + " :: " + (e && e.message || e)); }
  );
}
const RUN = [];
const nat = (raw, order) => ({ id: "n" + order, rawText: raw, order: order, bbox: null });
const geo = (text, bbox, provider) => ({ text: text, bbox: bbox, sourceProvider: provider || "BAIDU" });

// ---- OCR-P0.5-B CASE A：Baidu=empty, Native=5 → align 全 unmatched → UNRESOLVED（Native 已执行）----
RUN.push(t("CASE A: Baidu empty + Native 5 → NATIVE_GEOMETRY_UNRESOLVED（不伪造位置）", async () => {
  const ns = [0,1,2,3,4].map((i) => nat("行" + (i+1), i));
  const r = A.alignNativeGeometry(ns, []);
  const g = G.evaluateCompleteness(r);
  assert.strictEqual(g.ok, false);
  assert.strictEqual(g.code, "NATIVE_GEOMETRY_UNRESOLVED");
  assert.strictEqual(g.unresolved, 5);
  assert.strictEqual(g.totalNative, 5);
}));

// ---- OCR-P0.5-B CASE B/C：quality fail / exception 时 Native 已执行（上游 runNativeTruth 语义），
//     门禁侧等同 CASE A：无 geometry → UNRESOLVED 不创建 ----
RUN.push(t("CASE A': Native 5 + 无几何 → resolveUnmatchedGeometry 逐行 NONE（不产生 text）", async () => {
  const ns = [0,1,2,3,4].map((i) => nat("行" + (i+1), i));
  const r = A.alignNativeGeometry(ns, []);
  const resolved = G.resolveUnmatchedGeometry(r, []);
  assert.strictEqual(resolved.length, 5);
  assert.ok(resolved.every((x) => x.code === "NONE" && !x.geometry && x.ok === false));
}));

// ---- OCR-P0.5-B CASE D：Baidu 8 geometry + Native 8 text → COMPLETE 8/8 ----
RUN.push(t("CASE D: Baidu 8 + Native 8 → COMPLETE（8/8 matched）", async () => {
  const ns = ["张三","董事长","吴健湘","客户经理","佛山盛盈","Tel.:0757-88","abc123 xyz","000111"].map((x0,i) => nat(x0, i));
  const gs = ns.map((n0, i) => geo(n0.rawText, { x: 10, y: 100 + i*30, width: 90, height: 20 }));
  const r = A.alignNativeGeometry(ns, gs);
  const g = G.evaluateCompleteness(r);
  assert.strictEqual(r.gate.matched, 8);
  assert.strictEqual(r.gate.unmatchedNative, 0);
  assert.strictEqual(g.ok, true);
  assert.strictEqual(g.code, "COMPLETE");
}));

// ---- OCR-P0.5-B CASE E：Baidu 8 geometry + Native 5 text，其中 2 行无可靠 match → INCOMPLETE（不静默创建 N-2）----
RUN.push(t("CASE E: Baidu 8 + Native 5（2 行无法 match）→ NATIVE_GEOMETRY_INCOMPLETE（本批不创建）", async () => {
  const ns = [0,1,2,3,4].map((i) => nat("行" + (i+1), i));
  // 8 个 geometry：前 3 行匹配 native 行1-3；后 5 行是无关候选（模拟 Native 仅 5 行、其中 2 行对不上）
  const gs = [0,1,2].map((i) => geo("行" + (i+1), { x: 10, y: 100 + i*30, width: 80, height: 20 }))
    .concat([0,1,2,3,4].map((i) => geo("其他内容" + (i+1), { x: 10, y: 300 + i*30, width: 90, height: 20 })));
  assert.strictEqual(gs.length, 8);
  const r = A.alignNativeGeometry(ns, gs);
  assert.strictEqual(r.gate.totalNative, 5);
  assert.strictEqual(r.gate.geometryCandidates, 8);
  assert.strictEqual(r.gate.matched, 3);
  assert.strictEqual(r.gate.unmatchedNative, 2);
  assert.ok(r.gate.unusedGeometry >= 1); // 8 候选 - 3 匹配 ≥ 5 未用（审计 §13）
  const g = G.evaluateCompleteness(r);
  assert.strictEqual(g.ok, false);
  assert.strictEqual(g.code, "NATIVE_GEOMETRY_INCOMPLETE");
  assert.strictEqual(g.unresolved, 2);
  assert.strictEqual(g.matched, 3);
}));

// ---- OCR-P0.3-D：Native 有 + geometry 缺 → 逐行 unresolved，无 Baidu text 顶替 ----
RUN.push(t("P0.3-D: Native 2 行仅 1 行有 geometry → INCOMPLETE（N-1 不创建，防止部分成功假象）", async () => {
  const ns = [nat("第一行", 0), nat("第二行", 1)];
  const gs = [geo("第一行", { x: 10, y: 100, width: 90, height: 20 })];
  const r = A.alignNativeGeometry(ns, gs);
  assert.strictEqual(r.gate.totalNative, 2);
  assert.strictEqual(r.gate.matched, 1);
  assert.strictEqual(r.gate.unmatchedNative, 1);
  const g = G.evaluateCompleteness(r);
  assert.strictEqual(g.ok, false);
  assert.strictEqual(g.code, "NATIVE_GEOMETRY_INCOMPLETE");
  assert.strictEqual(g.unresolved, 1);
}));

// ---- OCR-P0.3-C 搜索链：word 级候选可为 unmatchedNative 提供几何（仅位置不写文字）----
RUN.push(t("搜索链: native 行经 Baidu word bbox 获得几何（resolveUnmatchedGeometry）", async () => {
  const ns = [nat("张三", 0), nat("董事长", 1)];
  // Baidu 只给了 word 级 bbox（line 级缺）
  const cands = [
    { sourceProvider: "BAIDU", kind: "word", bbox: { x: 20, y: 60, width: 60, height: 20 }, text: "张三" },
    { sourceProvider: "BAIDU", kind: "word", bbox: { x: 80, y: 60, width: 90, height: 20 }, text: "董事长" }
  ];
  const r = A.alignNativeGeometry(ns, []);
  const resolved = G.resolveUnmatchedGeometry(r, cands);
  assert.strictEqual(resolved.length, 2);
  assert.ok(resolved.every((x) => x.ok && x.geometry && x.geometry.bbox && x.code === "BaiduWord"));
  // Provider 只给位置：text 仍来自 native
  assert.ok(resolved.every((x) => x.geometry.text == null || x.native.rawText));
}));

// ---- OCR-P0.3-C 搜索链：local 行几何（P1 Geometry Recovery 扩展位）----
RUN.push(t("搜索链: local line geometry 兜底 unmatchedNative", async () => {
  const ns = [nat("佛山盛盈包装", 0), nat("Tel.:0757", 1)];
  const cands = [
    { sourceProvider: "LOCAL", kind: "line", bbox: { x: 12, y: 200, width: 200, height: 24 }, text: "佛山盛盈包装" }
  ];
  const r = A.alignNativeGeometry(ns, []);
  const resolved = G.resolveUnmatchedGeometry(r, cands);
  assert.strictEqual(resolved[0].ok, true);
  assert.strictEqual(resolved[0].code, "Local");
  assert.strictEqual(resolved[0].geometry.bbox.x, 12);
  assert.strictEqual(resolved[1].ok, false); // Tel 无候选
}));

// ---- resolveGeometryCandidates：line+word+local 摊平（只读几何，不写最终 text）----
RUN.push(t("候选摊平: Baidu line + wordBoxes + local extras 全部展开", async () => {
  const blocks = [Object.assign(geo("张三 董事长", { x: 20, y: 60, width: 150, height: 20 }), { words: [{ text: "张三", bbox: { x: 20, y: 60, width: 60, height: 20 } }, { text: "董事长", bbox: { x: 80, y: 60, width: 90, height: 20 } }] })];
  const extras = [{ sourceProvider: "LOCAL", kind: "line", bbox: { x: 5, y: 300, width: 100, height: 20 }, text: "x" }];
  const cands = G.resolveGeometryCandidates(blocks, extras);
  assert.strictEqual(cands.length, 4); // 1 line + 2 words + 1 local
  assert.strictEqual(cands.filter((c) => c.kind === "line").length, 2);
  assert.strictEqual(cands.filter((c) => c.kind === "word").length, 2);
  assert.strictEqual(cands[0].sourceProvider, "BAIDU");
  assert.ok(cands.every((c) => c.bbox));
}));

Promise.all(RUN).then(() => {
  console.log("native-completeness-gate.test: pass=" + passed + " fail=" + failed);
  if (failures.length) console.error(failures.join("\n"));
  process.exit(failed ? 1 : 0);
});