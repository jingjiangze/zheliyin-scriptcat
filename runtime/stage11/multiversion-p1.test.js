"use strict";
// runtime/stage11/multiversion-p1.test.js — P1 多版地基：版索引映射 / 布局判定 / 版维快照 / 命令 version
// 真源：extension/src/editor/template-snapshot.js、template-apply-v2.js、extension/src/ai/template-match-validator.js
const assert = require("assert");
const path = require("path");
const S = require(path.join(__dirname, "..", "..", "extension", "src", "editor", "template-snapshot.js"));
const A = require(path.join(__dirname, "..", "..", "extension", "src", "editor", "template-apply-v2.js"));
const V = require(path.join(__dirname, "..", "..", "extension", "src", "ai", "template-match-validator.js"));

// ============ 1) 版索引 ↔ canvas 索引映射 ============
assert.strictEqual(S.zyCanvasIndexOf(0, "front"), 0);
assert.strictEqual(S.zyCanvasIndexOf(0, "back"), 1);
assert.strictEqual(S.zyCanvasIndexOf(1, "front"), 2);
assert.strictEqual(S.zyCanvasIndexOf(1, "back"), 3);
assert.strictEqual(S.zyCanvasIndexOf(3, "back"), 7);
assert.strictEqual(S.zyCanvasIndexOf(-5, "front"), 0, "负版号归零");
assert.strictEqual(S.zyVersionOfCanvasIndex(0), 0);
assert.strictEqual(S.zyVersionOfCanvasIndex(1), 0);
assert.strictEqual(S.zyVersionOfCanvasIndex(2), 1);
assert.strictEqual(S.zyVersionOfCanvasIndex(3), 1);
assert.strictEqual(S.zyVersionOfCanvasIndex(7), 3);
assert.strictEqual(S.zySideOfCanvasIndex(0), "front");
assert.strictEqual(S.zySideOfCanvasIndex(1), "back");
assert.strictEqual(S.zySideOfCanvasIndex(2), "front");
assert.strictEqual(S.zySideOfCanvasIndex(3), "back");
assert.strictEqual(S.zyVersionCountOf(0), 1);
assert.strictEqual(S.zyVersionCountOf(1), 1, "仅正面（未点背面）→ 1 版");
assert.strictEqual(S.zyVersionCountOf(2), 1);
assert.strictEqual(S.zyVersionCountOf(3), 2);
assert.strictEqual(S.zyVersionCountOf(4), 2);
assert.strictEqual(S.zyVersionCountOf(6), 3);
console.log("[multiversion-p1] PASS 1 index mapping");

// ============ 2) zyDecideLayout：单版（真机实测两态） ============
// 2a) 单版未点背面：totalLen=1, currentCanvasNum=1, liCount=1
const L0 = S.zyDecideLayout({ totalLen: 1, currentCanvasNum: 1, domLiCount: 1, domCurrentLiIdx: 0, domCurrentGroupIdx: 0 });
assert.strictEqual(L0.ok, true, JSON.stringify(L0.hardConflicts));
assert.strictEqual(L0.multi, false);
assert.strictEqual(L0.versionCount, 1);
assert.strictEqual(L0.current.canvasIdx, 0);
assert.strictEqual(L0.current.vIdx, 0);
assert.strictEqual(L0.current.side, "front");
assert.strictEqual(L0.current.source, "canvasObjVO.currentCanvasNum");
assert.strictEqual(L0.current.materialized, true);
// 2b) 单版点背面：totalLen=2, currentCanvasNum=2
const L0b = S.zyDecideLayout({ totalLen: 2, currentCanvasNum: 2, domLiCount: 1, domCurrentLiIdx: 0, domCurrentGroupIdx: 1 });
assert.strictEqual(L0b.ok, true);
assert.strictEqual(L0b.multi, false);
assert.strictEqual(L0b.current.vIdx, 0);
assert.strictEqual(L0b.current.side, "back");
assert.strictEqual(L0b.conflicts.length, 0, "单版两态不得有软冲突");
console.log("[multiversion-p1] PASS 2 single-version layout");

// ============ 3) zyDecideLayout：多版 2 版（真机实测四态） ============
// 3a) 第1版背面（开多版后 currentCanvasNum 保持 2）
const M1 = S.zyDecideLayout({ totalLen: 4, currentCanvasNum: 2, domLiCount: 2, domCurrentLiIdx: 0, domCurrentGroupIdx: 1 });
assert.strictEqual(M1.ok, true, JSON.stringify(M1.hardConflicts));
assert.strictEqual(M1.multi, true);
assert.strictEqual(M1.versionCount, 2);
assert.strictEqual(M1.current.vIdx, 0);
assert.strictEqual(M1.current.side, "back");
assert.strictEqual(M1.current.canvasIdx, 1);
// 3b) 切到第2版正面（真机实测 currentCanvasNum=3, currentLiIdx=1, currentGroupIdx=2）
const M2 = S.zyDecideLayout({ totalLen: 4, currentCanvasNum: 3, domLiCount: 2, domCurrentLiIdx: 1, domCurrentGroupIdx: 2 });
assert.strictEqual(M2.ok, true, JSON.stringify(M2.hardConflicts));
assert.strictEqual(M2.current.vIdx, 1);
assert.strictEqual(M2.current.side, "front");
assert.strictEqual(M2.current.canvasIdx, 2);
assert.strictEqual(M2.conflicts.length, 0);
// 3c) 第2版背面（currentCanvasNum=4）
const M3 = S.zyDecideLayout({ totalLen: 4, currentCanvasNum: 4, domLiCount: 2, domCurrentLiIdx: 1, domCurrentGroupIdx: 3 });
assert.strictEqual(M3.ok, true);
assert.strictEqual(M3.current.vIdx, 1);
assert.strictEqual(M3.current.side, "back");
assert.strictEqual(M3.current.canvasIdx, 3);
// 3d) 第1版正面（currentCanvasNum=1）
const M4 = S.zyDecideLayout({ totalLen: 4, currentCanvasNum: 1, domLiCount: 2, domCurrentLiIdx: 0, domCurrentGroupIdx: 0 });
assert.strictEqual(M4.ok, true);
assert.strictEqual(M4.current.vIdx, 0);
assert.strictEqual(M4.current.side, "front");
console.log("[multiversion-p1] PASS 3 multi-version layout (4 states)");

// ============ 4) zyDecideLayout：冲突判定（硬/软分离） ============
// 4a) 硬冲突：currentCanvasNum 与 DOM 当前页不一致
const H1 = S.zyDecideLayout({ totalLen: 4, currentCanvasNum: 2, domLiCount: 2, domCurrentLiIdx: 0, domCurrentGroupIdx: 2 });
assert.strictEqual(H1.ok, false, "两源不一致必须 ok=false");
assert.ok(H1.code.indexOf("MULTI_LAYOUT_CONFLICT") >= 0);
assert.ok(H1.hardConflicts.join("|").indexOf("currentCanvasNum(1)!=domCurrentGroup(2)") >= 0, JSON.stringify(H1.hardConflicts));
// 4b) 硬冲突：当前版未 materialize（cc 越界）
const H2 = S.zyDecideLayout({ totalLen: 2, currentCanvasNum: 3, domLiCount: 2, domCurrentLiIdx: 1, domCurrentGroupIdx: 2 });
assert.strictEqual(H2.ok, false);
assert.strictEqual(H2.current.materialized, false);
assert.ok(H2.hardConflicts.join("|").indexOf("CURRENT_VERSION_NOT_MATERIALIZED") >= 0);
// 4c) 软冲突：li.currentLi 与 vIdx 不一致（不阻断读取）
const S1 = S.zyDecideLayout({ totalLen: 4, currentCanvasNum: 3, domLiCount: 2, domCurrentLiIdx: 0, domCurrentGroupIdx: 2 });
assert.strictEqual(S1.ok, true, "软冲突不阻断");
assert.ok(S1.conflicts.join("|").indexOf("liCurrent(0)!=vIdx(1)") >= 0, JSON.stringify(S1.conflicts));
// 4d) 软冲突：幽灵 li（DOM 报 2 版但 totalCanvasArray 只 2 条 = 单版）
//     修复 G：版数唯一真源 = totalCanvasArray；DOM liCount 仅软告警（曾因 DOM 优先把单版误判为多版）
const S2 = S.zyDecideLayout({ totalLen: 2, currentCanvasNum: 1, domLiCount: 2, domCurrentLiIdx: 0, domCurrentGroupIdx: 0 });
assert.strictEqual(S2.ok, true);
assert.ok(S2.conflicts.join("|").indexOf("domLiCount(2)!=arrVersionCount(1)") >= 0);
assert.strictEqual(S2.versionCount, 1, "版数以 totalCanvasArray 为真源（DOM li 仅软告警）");
assert.strictEqual(S2.multi, false, "幽灵 li 不得把单版判成多版");
// 4e) 无 currentCanvasNum → 退 DOM currentGroup
const F1 = S.zyDecideLayout({ totalLen: 4, currentCanvasNum: null, domLiCount: 2, domCurrentLiIdx: 1, domCurrentGroupIdx: 2 });
assert.strictEqual(F1.ok, true);
assert.strictEqual(F1.current.source, "domCurrentGroup");
assert.strictEqual(F1.current.vIdx, 1);
// 4f) 全无 DOM → 默认 0（不炸）
const F2 = S.zyDecideLayout({ totalLen: 2, currentCanvasNum: null, domLiCount: null, domCurrentLiIdx: null, domCurrentGroupIdx: null });
assert.strictEqual(F2.current.source, "default0");
assert.strictEqual(F2.current.vIdx, 0);
console.log("[multiversion-p1] PASS 4 conflict separation");

// ============ 5) 版维快照 + hash 口径 ============
const mkItems = (side, n) => Array.from({ length: n }, (_, i) => ({ objectUuid: side + "-u" + i, text: side + "-t" + i, left: 10 + i, top: 20 + i, width: 100, height: 20, angle: 0, layerNum: i, fontSize: 12 }));
// 5a) 单版：allSidesItems 与旧口径（front+back）hash 逐字一致
const f0 = mkItems("f", 2), b0 = mkItems("b", 1);
const legacyHash = S.zySnapshotHashOf(f0.concat(b0));
const snapLegacy = S.zyBuildTemplateSnapshot({ frontItems: f0.map((x) => Object.assign({}, x)), backItems: b0.map((x) => Object.assign({}, x)), page: null });
assert.strictEqual(snapLegacy.snapshotHash, legacyHash, "未提供 allSidesItems 时口径不变");
const snapOne = S.zyBuildTemplateSnapshot({
  frontItems: f0.map((x) => Object.assign({}, x)), backItems: b0.map((x) => Object.assign({}, x)), page: null,
  version: 0, versionCount: 1, multi: false,
  allSidesItems: [{ version: 0, side: "front", items: f0.map((x) => Object.assign({}, x)) }, { version: 0, side: "back", items: b0.map((x) => Object.assign({}, x)) }]
});
assert.strictEqual(snapOne.snapshotHash, legacyHash, "单版 allSidesItems 展开顺序 == 旧口径 → hash 不变（向后兼容）");
assert.strictEqual(snapOne.version, 0);
assert.strictEqual(snapOne.versionCount, 1);
assert.strictEqual(snapOne.multi, false);
console.log("[multiversion-p1] PASS 5a single-version hash backward compatible");

// 5b) 多版：hash 覆盖全部版（第 2 版变化 → hash 变化）
const v2f = mkItems("v2f", 1), v2b = mkItems("v2b", 1);
const allSides = [
  { version: 0, side: "front", items: f0.map((x) => Object.assign({}, x)) },
  { version: 0, side: "back", items: b0.map((x) => Object.assign({}, x)) },
  { version: 1, side: "front", items: v2f.map((x) => Object.assign({}, x)) },
  { version: 1, side: "back", items: v2b.map((x) => Object.assign({}, x)) }
];
const snapMulti = S.zyBuildTemplateSnapshot({ frontItems: f0.map((x) => Object.assign({}, x)), backItems: b0.map((x) => Object.assign({}, x)), page: null, version: 0, versionCount: 2, multi: true, allSidesItems: allSides });
assert.strictEqual(snapMulti.multi, true);
assert.strictEqual(snapMulti.versionCount, 2);
assert.notStrictEqual(snapMulti.snapshotHash, legacyHash, "多版 hash 必须纳入第 2 版");
const allSides2 = JSON.parse(JSON.stringify(allSides));
allSides2[2].items[0].text = "v2f-CHANGED";
const snapMulti2 = S.zyBuildTemplateSnapshot({ frontItems: f0.map((x) => Object.assign({}, x)), backItems: b0.map((x) => Object.assign({}, x)), page: null, version: 0, versionCount: 2, multi: true, allSidesItems: allSides2 });
assert.notStrictEqual(snapMulti2.snapshotHash, snapMulti.snapshotHash, "第 2 版内容变化 → hash 变化（planHash 覆盖全版）");
// 5c) zySnapshotHashItems 展开顺序
const flat = S.zySnapshotHashItems({ allSidesItems: allSides });
assert.strictEqual(flat.length, f0.length + b0.length + v2f.length + v2b.length);
assert.strictEqual(flat[0].objectUuid, "f-u0", "顺序 = 各版按 canvasIdx 展开");
assert.strictEqual(flat[flat.length - 1].objectUuid, "v2b-u0");
// 5d) slotId 面内相对（不跨版前缀）
const snapSlot = S.zyBuildTemplateSnapshot({ frontItems: mkItems("f", 2), backItems: mkItems("b", 1), page: null, version: 1, versionCount: 2, multi: true });
assert.deepStrictEqual(snapSlot.front.items.map((x) => x.slotId), ["front-1", "front-2"], "slotId 面内相对，版由 version 字段标识");
assert.deepStrictEqual(snapSlot.back.items.map((x) => x.slotId), ["back-1"]);
assert.strictEqual(snapSlot.version, 1);
console.log("[multiversion-p1] PASS 5b-d multi-version hash + slotId");

// ============ 6) 命令 version（template-apply-v2） ============
const snapSingle = { front: { exists: true, items: [{ slotId: "front-1", objectUuid: "u1", text: "A" }] }, back: { exists: false, items: null }, version: 0 };
const snapV1 = { front: { exists: true, items: [{ slotId: "front-1", objectUuid: "u1", text: "A" }] }, back: { exists: false, items: null }, version: 1 };
const m1 = [{ slotId: "front-1", side: "front", slotIdx: 0, objectUuid: "u1", customerText: "X", confidence: 0.9 }];
// 6a) 单版：commands.version = 0（match 无 version → snapshot.version 兜底）
const p0 = A.zyBuildApplyCommandPlan({ snapshot: snapSingle, matches: m1 });
assert.strictEqual(p0.ok, true, JSON.stringify(p0.errors));
assert.strictEqual(p0.commands[0].version, 0);
assert.strictEqual(p0.version, 0);
// 6b) match.version 优先
const p1 = A.zyBuildApplyCommandPlan({ snapshot: snapSingle, matches: [Object.assign({ version: 1 }, m1[0])] });
assert.strictEqual(p1.commands[0].version, 1, "match.version 优先于 snapshot.version");
// 6c) 混版 → VERSION_MIXED 拒绝
const pMix = A.zyBuildApplyCommandPlan({ snapshot: { front: { exists: true, items: [{ slotId: "front-1", objectUuid: "u1" }, { slotId: "front-2", objectUuid: "u2" }] }, back: { exists: false, items: null }, version: 0 }, matches: [
  { slotId: "front-1", side: "front", slotIdx: 0, objectUuid: "u1", customerText: "X", version: 0 },
  { slotId: "front-2", side: "front", slotIdx: 1, objectUuid: "u2", customerText: "Y", version: 1 }
] });
assert.strictEqual(pMix.ok, false, "混版必须拒绝");
assert.ok(pMix.errors.join("|").indexOf("VERSION_MIXED") >= 0, JSON.stringify(pMix.errors));
assert.strictEqual(pMix.commands.length, 1, "同版指令保留");
// 6d) 多版：全同版 → 通过且版本一致
const pV1 = A.zyBuildApplyCommandPlan({ snapshot: snapV1, matches: [Object.assign({ version: 1 }, m1[0])] });
assert.strictEqual(pV1.ok, true);
assert.strictEqual(pV1.commands[0].version, 1);
assert.strictEqual(pV1.version, 1);
console.log("[multiversion-p1] PASS 6 command version");

// ============ 7) validator expectVersion 透传 ============
const vsnap = JSON.parse(JSON.stringify(snapV1));
const vplan = { customerBlocks: [], matches: [], unmatchedBlockIds: [], uncertain: [], unusedSlots: [], warnings: [] };
const rV1 = V.zyValidateTemplateMatchPlan({ plan: vplan, snapshot: vsnap, rawText: "X", expectVersion: 1 });
assert.strictEqual(rV1.ok, true);
// 用真实匹配验证 version 落到 refined
const vsnap2 = { version: 2, front: { exists: true, items: [{ slotId: "front-1", objectUuid: "u1", text: "电话：138" }] } };
const vplan2 = { customerBlocks: [{ blockId: "c-1", lineNo: 1, text: "13800138000", type: "phone" }], matches: [{ slotId: "front-1", blockId: "c-1", confidence: 0.9, reason: "ok" }], unmatchedBlockIds: [], uncertain: [], unusedSlots: [], warnings: [] };
const rV2 = V.zyValidateTemplateMatchPlan({ plan: vplan2, snapshot: vsnap2, rawText: "电话：13800138000" });
assert.strictEqual(rV2.ok, true, JSON.stringify(rV2.errors));
assert.strictEqual(rV2.matches.length, 1);
assert.strictEqual(rV2.matches[0].version, 2, "未显式传 expectVersion 时取 snapshot.version");
const rV3 = V.zyValidateTemplateMatchPlan({ plan: vplan2, snapshot: vsnap2, rawText: "电话：13800138000", expectVersion: 5 });
assert.strictEqual(rV3.matches[0].version, 5, "显式 expectVersion 优先");
console.log("[multiversion-p1] PASS 7 validator version");

console.log("[multiversion-p1] ALL PASS");