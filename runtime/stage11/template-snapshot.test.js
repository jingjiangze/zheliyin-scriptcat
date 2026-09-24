"use strict";
// runtime/stage11/template-snapshot.test.js — L 阶 Commit 01（Strict Template Snapshot）
const assert = require("assert");
const path = require("path");
const mod = require(path.join(__dirname, "..", "..", "extension", "src", "editor", "template-snapshot.js"));
const { zySnapshotHashOf, zySnapshotItemWithSlot, zyBuildTemplateSnapshot } = mod;

const ITEM_A = { objectUuid: "obj-1", text: "简小设", left: 120, top: 160, width: 180, height: 40, fontSize: 32, fontFamily: "方正黑体简体", angle: 0, layerNum: 1, fill: "#111111", fontId: "248" };
const ITEM_B = { objectUuid: "obj-2", text: "合伙人", left: 130, top: 215, width: 160, height: 30, fontSize: 22, fontFamily: "方正黑体简体", angle: 0, layerNum: 2, fill: "#222222" };

// 1) hash 确定性 & 内容敏感
assert.strictEqual(zySnapshotHashOf([ITEM_A]), zySnapshotHashOf([ITEM_A]), "hash deterministic");
assert.notStrictEqual(zySnapshotHashOf([ITEM_A]), zySnapshotHashOf([ITEM_B]), "hash differs by content");
assert.notStrictEqual(zySnapshotHashOf([ITEM_A]), zySnapshotHashOf([Object.assign({}, ITEM_A, { text: "江某" })]), "hash differs by text");
assert.notStrictEqual(zySnapshotHashOf([ITEM_A]), zySnapshotHashOf([Object.assign({}, ITEM_A, { left: 121 })]), "hash differs by geometry");
assert.notStrictEqual(zySnapshotHashOf([ITEM_A]), zySnapshotHashOf([ITEM_A, ITEM_B]), "hash differs by count");
console.log("[template-snapshot] PASS 1 hash");

// 2) slotId 与分组字段
const s = zySnapshotItemWithSlot(Object.assign({}, ITEM_A), "front", 0);
assert.strictEqual(s.slotId, "front-1");
assert.strictEqual(s.slotIdx, 0);
assert.strictEqual(s.text, "简小设");
assert.deepStrictEqual(s.geometry, { left: 120, top: 160, width: 180, height: 40, angle: 0 });
assert.strictEqual(s.typography.fontId, "248");
assert.strictEqual(s.typography.fontFamily, "方正黑体简体");
assert.strictEqual(s.typography.fontSize, 32);
assert.strictEqual(s.style.fill, "#111111");
assert.strictEqual(s.identity.objectUuid, "obj-1");
assert.strictEqual(s.identity.layerNum, 1);
console.log("[template-snapshot] PASS 2 slot/分组");

// 3) 严格正反（front/back 独立；back 缺失 = null，绝不串面）
const snapBoth = zyBuildTemplateSnapshot({ frontItems: [ITEM_A], backItems: [ITEM_B], page: { pageId: "p1" } });
assert.strictEqual(snapBoth.front.exists, true);
assert.strictEqual(snapBoth.back.exists, true);
assert.strictEqual(snapBoth.front.items[0].objectUuid, "obj-1");
assert.strictEqual(snapBoth.back.items[0].slotId, "back-1");
assert.strictEqual(snapBoth.count.front, 1);
assert.strictEqual(snapBoth.count.back, 1);
assert.ok(snapBoth.snapshotHash && /^[0-9a-f]{8}$/.test(snapBoth.snapshotHash), "hash format");

const snapBackAbsent = zyBuildTemplateSnapshot({ frontItems: [ITEM_A], backItems: null, page: null });
assert.strictEqual(snapBackAbsent.front.exists, true);
assert.strictEqual(snapBackAbsent.back.exists, false);
assert.strictEqual(snapBackAbsent.back.items, null);
assert.strictEqual(snapBackAbsent.back.side, "back");
assert.strictEqual(snapBackAbsent.count.back, 0);
// 绝对不可出现 back 继承了 front 内容（46g 曾 bug：backAbsent=true 却拿到 front 内容）
assert.notStrictEqual(snapBackAbsent.back.items, snapBackAbsent.front.items);
console.log("[template-snapshot] PASS 3 strict sides");

// 4) 空输入
const snapEmpty = zyBuildTemplateSnapshot({});
assert.strictEqual(snapEmpty.front.exists, false);
assert.strictEqual(snapEmpty.back.exists, false);
assert.deepStrictEqual(snapEmpty.count, { front: 0, back: 0 });
console.log("[template-snapshot] PASS 4 empty");

console.log("[template-snapshot] ALL PASS (10 assertions)");