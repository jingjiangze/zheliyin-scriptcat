"use strict";
// runtime/stage11/template-match-workbench.test.js — M4 可编辑匹配工作台：纯函数编辑操作
// 真源：extension/src/ai/template-match-workbench.js（+ 与 template-apply-v2 的重建联动）
const assert = require("assert");
const path = require("path");
const W = require(path.join(__dirname, "..", "..", "extension", "src", "ai", "template-match-workbench.js"));
const A = require(path.join(__dirname, "..", "..", "extension", "src", "editor", "template-apply-v2.js"));

const slots = {
  front: { exists: true, items: [
    { slotId: "front-1", objectUuid: "u-f1", text: "旧公司" },
    { slotId: "front-2", objectUuid: "u-f2", text: "旧姓名" }
  ] },
  back: { exists: true, items: [{ slotId: "back-1", objectUuid: "u-b1", text: "旧标语" }] }
};
const input = {
  slots: slots, snapshot: slots, version: 0, versionCount: 1, multi: false,
  matches: [{ slotId: "front-2", side: "front", slotIdx: 1, objectUuid: "u-f2", customerText: "张三", blockId: "c-2", confidence: 0.9 }],
  blocks: [
    { blockId: "c-1", text: "新公司", side: "front" },
    { blockId: "c-2", text: "张三", side: "front" },
    { blockId: "c-3", text: "13800138000", side: "front" }
  ],
  uncertain: [{ slotId: "front-1", candidates: ["x"], reason: "LOW_CONFIDENCE" }],
  unmatched: [{ blockId: "c-4", text: "未匹配项", reason: "AI 判定无对应槽" }]
};

// 1) 组装
const mw = W.zyBuildWorkbench(input);
assert.strictEqual(mw.slots.length, 3);
assert.strictEqual(mw.blocks.length, 4, "blocks ∪ unmatched 去重");
const f2 = mw.slots.find((s) => s.slotId === "front-2");
assert.strictEqual(f2.customerText, "张三");
assert.strictEqual(f2.status, "matched");
assert.strictEqual(f2.blockId, "c-2");
assert.strictEqual(mw.blocks.find((b) => b.blockId === "c-2").boundSlotId, "front-2");
assert.strictEqual(mw.slots.find((s) => s.slotId === "front-1").status, "unclear", "uncertain 未绑定槽 → unclear");
const s0 = W.zyWbSummary(mw);
assert.strictEqual(s0.matched, 1);
assert.strictEqual(s0.unclear, 1);
assert.strictEqual(s0.unmatched, 3, "c-1/c-3/c-4 未绑定");
console.log("[workbench] PASS 1 build + summary");

// 2) 点选分配 + 一对一（重复分配自动从旧槽解绑）
assert.strictEqual(W.zyWbAssign(mw, "front-1", "c-1").ok, true);
assert.strictEqual(mw.slots.find((s) => s.slotId === "front-1").customerText, "新公司");
assert.strictEqual(mw.slots.find((s) => s.slotId === "front-1").status, "manual");
W.zyWbAssign(mw, "back-1", "c-2");
assert.strictEqual(mw.slots.find((s) => s.slotId === "back-1").customerText, "张三");
assert.strictEqual(mw.slots.find((s) => s.slotId === "front-2").customerText, "", "c-2 改绑后 front-2 自动解绑");
assert.strictEqual(mw.slots.find((s) => s.slotId === "front-2").blockId, null);
console.log("[workbench] PASS 2 assign + one-to-one");

// 3) 手动编辑 → MANUAL_EDIT + 断开来历链接
W.zyWbAssignText(mw, "back-1", "张三丰");
const b1 = mw.slots.find((s) => s.slotId === "back-1");
assert.strictEqual(b1.customerText, "张三丰");
assert.strictEqual(b1.edited, true);
assert.strictEqual(b1.status, "edited");
assert.strictEqual(b1.blockId, null);
assert.strictEqual(mw.blocks.find((b) => b.blockId === "c-2").boundSlotId, null, "编辑后断开来历链接");
console.log("[workbench] PASS 3 manual edit (MANUAL_EDIT)");

// 4) 解绑：清空 + 块回到未绑定；uncertain 槽回到 unclear
W.zyWbAssign(mw, "front-1", "c-1");
W.zyWbUnbind(mw, "front-1");
assert.strictEqual(mw.slots.find((s) => s.slotId === "front-1").customerText, "");
assert.strictEqual(mw.slots.find((s) => s.slotId === "front-1").status, "unclear", "front-1 原属 uncertain → 回到 unclear");
assert.strictEqual(mw.blocks.find((b) => b.blockId === "c-1").boundSlotId, null);
console.log("[workbench] PASS 4 unbind");

// 5) 交换（客户值 + 块链接一起换）
W.zyWbAssign(mw, "front-1", "c-1");
W.zyWbAssign(mw, "back-1", "c-3");
const beforeF1 = mw.slots.find((s) => s.slotId === "front-1").customerText;
const beforeB1 = mw.slots.find((s) => s.slotId === "back-1").customerText;
assert.strictEqual(beforeF1, "新公司");
assert.strictEqual(beforeB1, "13800138000");
assert.strictEqual(W.zyWbSwap(mw, "front-1", "back-1").ok, true);
assert.strictEqual(mw.slots.find((s) => s.slotId === "front-1").customerText, beforeB1);
assert.strictEqual(mw.slots.find((s) => s.slotId === "back-1").customerText, beforeF1);
assert.strictEqual(mw.blocks.find((b) => b.blockId === "c-3").boundSlotId, "front-1");
assert.strictEqual(mw.blocks.find((b) => b.blockId === "c-1").boundSlotId, "back-1");
assert.strictEqual(W.zyWbSwap(mw, "front-1", "front-1").ok, false, "同槽交换拒绝");
console.log("[workbench] PASS 5 swap");

// 6) 重建 matches → zyBuildApplyCommandPlan 通过（同版 / 不串面 / 冻结承诺）
const matches = W.zyWbRebuildMatches(mw);
assert.strictEqual(matches.length, 2, "仅非空客户值的槽进入指令");
const plan = A.zyBuildApplyCommandPlan({ snapshot: mw.snapshot, matches: matches });
assert.strictEqual(plan.ok, true, JSON.stringify(plan.errors));
assert.ok(plan.commands.every((c) => c.version === 0), "同一版");
assert.ok(plan.commands.every((c) => (c.side === "front") === c.slotId.startsWith("front-")), "不串面");
assert.ok(plan.commands.every((c) => c.frozen && c.frozen.geometry === true && c.frozen.identity === true), "冻结承诺");
console.log("[workbench] PASS 6 rebuild -> command plan");

// 7) 空值槽不进指令：解绑全部 → 0 指令
W.zyWbUnbind(mw, "front-1"); W.zyWbUnbind(mw, "back-1");
assert.strictEqual(W.zyWbRebuildMatches(mw).length, 0);
console.log("[workbench] PASS 7 empty -> no commands");

// 8) 非法输入防御
assert.strictEqual(W.zyWbAssign(mw, "front-9", "c-1").ok, false);
assert.strictEqual(W.zyWbAssign(mw, "front-1", "c-9").ok, false);
assert.strictEqual(W.zyWbUnbind(mw, "back-9").ok, false);
assert.strictEqual(W.zyWbAssignText(mw, "back-9", "x").ok, false);
const e = W.zyBuildWorkbench({});
assert.strictEqual(e.slots.length, 0);
assert.strictEqual(W.zyWbSummary(e).matched, 0);
assert.strictEqual(W.zyWbSideOf("back-3"), "back");
assert.strictEqual(W.zyWbSideOf("xx-3"), null);
console.log("[workbench] PASS 8 defensive");

console.log("[workbench] ALL PASS");
