// tests/editor-object-model/native-create-measure.test.js — Stage 9 方案 Commit 3：Native Create → Measure 纯逻辑单测
"use strict";
const assert = require("assert");
const path = require("path");
const M = require(path.join(__dirname, "..", "..", "extension", "src", "editor", "native-create-measure.js"));

let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); } }

const mk = (over) => Object.assign({ key: "k1", uuid: "u1", multiUuid: "m1", layerNum: 1, text: "旧文字" }, over || {});

t("canonId 优先级 multiUuid>uuid>id>null", () => {
  assert.strictEqual(M.canonId({ multiUuid: "m", uuid: "u", id: "i" }), "m");
  assert.strictEqual(M.canonId({ uuid: "u" }), "u");
  assert.strictEqual(M.canonId({ id: "i" }), "i");
  assert.strictEqual(M.canonId({}), null);
});

t("objectDelta 增删差集", () => {
  const d = M.objectDelta(["a", "b"], ["a", "b", "c"]);
  assert.strictEqual(d.delta, 1);
  assert.deepStrictEqual(d.addedIds, ["c"]);
});

t("identifyNewlyCreated: NATIVE_RETURN 最高优先", () => {
  const before = [mk()];
  const after = [mk(), mk({ key: "k2", uuid: "u2", multiUuid: "m2", layerNum: 2, text: "ZY_NATIVE_PROBE_X" })];
  const r = M.identifyNewlyCreated({ before, after, nativeReturnId: "m2", sentinelText: "ZY_NATIVE_PROBE_X" });
  assert.strictEqual(r.recoverySource, "NATIVE_RETURN");
  assert.strictEqual(r.index, 1);
});

t("identifyNewlyCreated: REGISTRY_DELTA 链接成功", () => {
  const before = [mk()];
  const after = [mk(), mk({ key: "k2", uuid: "u2", multiUuid: "m2", layerNum: 2, text: "X" })];
  const r = M.identifyNewlyCreated({ before, after, beforeRegistry: ["m1"], afterRegistry: ["m1", "m2"], sentinelText: "X" });
  assert.strictEqual(r.recoverySource, "REGISTRY_DELTA");
});

t("identifyNewlyCreated: OBJECT_DELTA", () => {
  const before = [mk({ key: "k1" })];
  const after = [mk({ key: "k1" }), mk({ key: "k9", uuid: "u9", multiUuid: null, layerNum: 2, text: "X" })];
  const r = M.identifyNewlyCreated({ before, after });
  assert.strictEqual(r.recoverySource, "OBJECT_DELTA");
  assert.strictEqual(r.index, 1);
});

t("identifyNewlyCreated: MULTIUUID 唯一新增", () => {
  // 两个同 key 新对象 → OBJECT_DELTA 因 addedIds.length=2 跳过，落到 MULTIUUID
  const before = [mk({ multiUuid: "m1" })];
  const after = [mk({ key: "kA", multiUuid: "m1" }), mk({ key: "kA", multiUuid: "mA", uuid: null, layerNum: 2, text: "X" }), mk({ key: "kA", multiUuid: null, uuid: "uB", text: "Y" })];
  const r = M.identifyNewlyCreated({ before, after });
  assert.strictEqual(r.recoverySource, "MULTIUUID");
});

t("identifyNewlyCreated: LAYERNUM 唯一新增", () => {
  const before = [mk({ layerNum: 1, uuid: "u1", multiUuid: null })];
  const after = [mk({ key: "k1", layerNum: 1, uuid: "u1", multiUuid: null }), mk({ key: "k2", layerNum: null, uuid: null, multiUuid: null, text: "X" })];
  // 无 uuid/multiUuid/layerNum → 走 CREATION_ORDER
  let r = M.identifyNewlyCreated({ before, after });
  assert.strictEqual(r.recoverySource, "CREATION_ORDER");
  // 有唯一 layerNum → LAYERNUM 优先于 CREATION_ORDER
  const after2 = [mk({ layerNum: 1, uuid: "u1", multiUuid: null }), mk({ layerNum: 8, uuid: null, multiUuid: null, text: "X" })];
  r = M.identifyNewlyCreated({ before, after: after2 });
  assert.strictEqual(r.recoverySource, "LAYERNUM");
});

t("identifyNewlyCreated: TEXT_FALLBACK 仅最后且要求唯一", () => {
  // 数量不变时前置分支全跳过 → TEXT_FALLBACK 才触发；同文本多条 → 歧义拒绝
  // 数量均为 3 且相等 → OBJECT_DELTA/MULTIUUID/LAYERNUM/CREATION_ORDER 全部跳过，TEXT 歧义被拒
  const amb = [mk(), mk({ key: "b", text: "S", layerNum: 2, uuid: null, multiUuid: null }), mk({ key: "c", text: "S", layerNum: 3, uuid: null, multiUuid: null })];
  const r = M.identifyNewlyCreated({ before: amb, after: amb, sentinelText: "S" });
  assert.strictEqual(r.index, null); // 歧义拒绝，不取最后一个
  const before3 = [mk(), mk({ key: "b", text: "SL1", layerNum: 2, uuid: null, multiUuid: null }), mk({ key: "c", text: "SL2", layerNum: 3, uuid: null, multiUuid: null })];
  const r2 = M.identifyNewlyCreated({ before: before3, after: before3, sentinelText: "SL1" });
  assert.strictEqual(r2.recoverySource, "TEXT_FALLBACK");
});

t("geometryDiff 横版 0°：centerError/widthError/leftError", () => {
  const d = M.geometryDiff({ left: 50, top: 50, width: 100, height: 30, angle: 0, fontSize: 24 }, { left: 50, top: 50, width: 100, height: 30, scaleX: 1, scaleY: 1, angle: 0, fontSize: 24, center: { x: 100, y: 65 }, visualWidth: 100, visualHeight: 30 });
  assert.strictEqual(d.centerError, 0);
  assert.strictEqual(d.widthError, 0);
  assert.strictEqual(d.heightError, 0);
  assert.strictEqual(d.angleError, 0);
  assert.strictEqual(d.fontSizeError, 0);
});

t("geometryDiff 旋转 90°：angleError 归一与 center 基准", () => {
  // 旋转保持中心：requested center (150,65) == actual center，宽高互换只影响 visual 箱
  const d = M.geometryDiff({ left: 50, top: 50, width: 200, height: 30, angle: 90 }, { left: 65, top: 150, width: 30, height: 200, scaleX: 1, scaleY: 1, angle: 90, center: { x: 150, y: 65 }, visualWidth: 200, visualHeight: 30 });
  assert.strictEqual(Math.round(d.angleError), 0);
  assert.ok(Math.abs(d.centerError - 0) < 1e-6, "centerError=" + d.centerError);
});

t("geometryDiff placementError = center 偏差", () => {
  const d = M.geometryDiff({ left: 0, top: 0, width: 100, height: 30 }, { left: 10, top: 5, width: 100, height: 30, scaleX: 1, scaleY: 1, angle: 0, center: { x: 60, y: 20 }, visualWidth: 100, visualHeight: 30 });
  assert.ok(Math.abs(d.placementError - Math.hypot(10, 5)) < 1e-6);
});

t("checkRegistryMismatch：canvas+1 registry+0 → NATIVE_CREATE_REGISTRY_MISMATCH", () => {
  assert.strictEqual(M.checkRegistryMismatch({ canvasDelta: 1, registryDelta: 0 }).code, "NATIVE_CREATE_REGISTRY_MISMATCH");
  assert.strictEqual(M.checkRegistryMismatch({ canvasDelta: 1, registryDelta: 1 }).code, "OK");
});

t("consistencyChecks：三层一致/不一致", () => {
  const fabric = { left: 50, top: 50, width: 100, height: 30, scaleX: 1, scaleY: 1 };
  const ac = { center: { x: 100, y: 65 } };
  const loc = { locationX: 100 - 50, locationY: 65 - 15, locationWidth: 100, locationHeight: 30 };
  assert.strictEqual(M.consistencyChecks({ fabric, aCoords: ac, location: loc }).consistent, true);
  // location 中心对齐 aCoords(200,200)，只保留 Fabric↔aCoords 一处失配
  const bad = M.consistencyChecks({ fabric, aCoords: { center: { x: 200, y: 200 } }, location: { locationX: 150, locationY: 185, locationWidth: 100, locationHeight: 30 } });
  assert.strictEqual(bad.issues.length, 1);
  assert.strictEqual(bad.issues[0].code, "NATIVE_GEOMETRY_INCONSISTENT");
});

t("verifyCleanup 全等恢复", () => {
  const r = M.verifyCleanup({ objectCount: 10, registryCount: 12, textAnchorCount: 7 }, { objectCount: 10, registryCount: 12, textAnchorCount: 7 });
  assert.strictEqual(r.restored, true);
  const r2 = M.verifyCleanup({ objectCount: 10, registryCount: 12 }, { objectCount: 11, registryCount: 12 });
  assert.strictEqual(r2.restored, false);
  assert.strictEqual(r2.diffs.objectCount, 1);
});

t("classifyMutation：left/top 保持 → PositionStable；位移 → Repositions", () => {
  const stable = M.classifyMutation([{ label: "a", left: 50, top: 50, width: 100, height: 30 }, { label: "b", left: 50, top: 50, width: 100, height: 30 }], "setText");
  assert.strictEqual(stable.positionVerdict, "Native_FontMutation_PositionStable");
  const moved = M.classifyMutation([{ label: "a", left: 50, top: 50, width: 100, height: 30 }, { label: "b", left: 60, top: 55, width: 100, height: 30 }], "fontSize");
  assert.strictEqual(moved.positionVerdict, "Native_FontMutation_Repositions");
});

t("classifyMutation：fontSize 改高 → heightAutoChanged 判定", () => {
  const r = M.classifyMutation([{ left: 50, top: 50, width: 100, height: 30, fontSize: 24 }, { left: 50, top: 50, width: 100, height: 40, fontSize: 36 }], "fontSize");
  assert.strictEqual(r.sizeVerdict, "heightAutoChanged");
  assert.strictEqual(r.heightDelta, 10);
});

t("dimensionRoundTrip 误差 <0.5mm → ok", () => {
  const ok = M.dimensionRoundTrip({ widthMm: 92, heightMm: 56, widthPx: 507.5, heightPx: 308.729, recoveredWidthMm: 92.01, recoveredHeightMm: 55.99 });
  assert.strictEqual(ok.roundTripOk, true);
  assert.ok(Math.abs(ok.widthErrorMm) < 0.5);
  const bad = M.dimensionRoundTrip({ widthMm: 92, heightMm: 56, widthPx: 507.5, heightPx: 308.729, recoveredWidthMm: 95, recoveredHeightMm: 60 });
  assert.strictEqual(bad.roundTripOk, false);
});

t("primitive-only 可 JSON 序列化", () => {
  const d = M.geometryDiff({ left: 1, top: 2, width: 3, height: 4, angle: 0 }, { left: 1, top: 2, width: 3, height: 4, angle: 0, scaleX: 1, scaleY: 1, center: { x: 2.5, y: 4 }, visualWidth: 3, visualHeight: 4 });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(d)), d);
});

t("空输入安全", () => {
  assert.strictEqual(M.identifyNewlyCreated({}).recoverySource, "NONE");
  assert.ok(M.geometryDiff(null, null).centerError === null);
  assert.strictEqual(M.consistencyChecks({}).consistent, true);
  assert.strictEqual(M.verifyCleanup(null, null).restored, true);
});

console.log("native-create-measure.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);