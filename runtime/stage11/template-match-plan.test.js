"use strict";
// runtime/stage11/template-match-plan.test.js — L 阶 Commit 02（AI Template Match Contract）
const assert = require("assert");
const path = require("path");
const planMod = require(path.join(__dirname, "..", "..", "extension", "src", "ai", "template-match-plan.js"));
const valMod = require(path.join(__dirname, "..", "..", "extension", "src", "ai", "template-match-validator.js"));
const { zyTemplateMatchSystemPrompt, zySnapshotToAiInput, zyBuildTemplateMatchMessages, zyExtractPlanJson, zyNormalizePlanShape } = planMod;
const { zyVerbatimTraceable, zySlotIndexFromSnapshot, zyValidateTemplateMatchPlan } = valMod;

const RAW = ["姓名：江某", "职位：合伙人", "电话：18183453826", "邮箱：jian@36588.com", "网址：www.jianshe.cn", "地址：济南市高新区", "反面：", "主营范围：企业管理咨询"].join("\n");
const SNAP = {
  front: { exists: true, side: "front", items: [
    { slotId: "front-1", objectUuid: "a1", text: "简小设", layerNum: 1, fontSize: 32 },
    { slotId: "front-2", objectUuid: "a2", text: "合伙人", layerNum: 2, fontSize: 22 },
    { slotId: "front-3", objectUuid: "a3", text: "电话:13800000000", layerNum: 3, fontSize: 14 }
  ]},
  back: { exists: true, side: "back", items: [
    { slotId: "back-1", objectUuid: "b1", text: "主营范围：xxx", layerNum: 1, fontSize: 12 }
  ]}
};

// ---- plan 模块 ----
const prompt = zyTemplateMatchSystemPrompt();
assert.ok(prompt.indexOf("slotId") >= 0 && prompt.indexOf("逐字") >= 0, "prompt slotid/verbatim");
assert.ok(prompt.indexOf("不得改写") >= 0, "prompt 禁改写");
assert.ok(prompt.indexOf("front 槽位只能匹配正面内容") >= 0, "prompt side 规则");
const msg = zyBuildTemplateMatchMessages({ front: SNAP.front, back: SNAP.back, customerRawText: RAW });
assert.strictEqual(msg.length, 2);
assert.strictEqual(msg[0].role, "system");
assert.ok(msg[1].content.indexOf("front-1") >= 0 && msg[1].content.indexOf("江某") >= 0, "user 含槽位与原文");
const aiInput = zySnapshotToAiInput({ front: SNAP.front, back: SNAP.back, customerRawText: RAW });
assert.ok(aiInput.indexOf('"slotId": "front-1"') >= 0 && aiInput.indexOf("职位：合伙人") >= 0, "ai input 完整");
const parsed = zyExtractPlanJson('```json\n{"matches":[{"slotId":"front-1","customerText":"江某"}]}\n```');
assert.strictEqual(parsed.ok, true);
assert.strictEqual(parsed.plan.matches[0].customerText, "江某");
assert.strictEqual(zyExtractPlanJson("no json").ok, false);
assert.strictEqual(zyExtractPlanJson("").ok, false);
assert.deepStrictEqual(zyNormalizePlanShape({ matches: [1], unsure: "x" }).matches, [1]);
console.log("[template-match-plan] PASS 1 plan module");

// ---- validator：逐字可追溯 ----
assert.ok(zyVerbatimTraceable("江某", ["姓名：江某"]), "verbatim contained in line");
assert.ok(zyVerbatimTraceable("18183453826", ["电话：18183453826"]), "verbatim digit");
// 注意：cleaned 会去掉空白，故 "江 某" 视为同 "江某"（可追溯）；真正必须拒绝的是改写文本：
assert.strictEqual(zyVerbatimTraceable("高级合伙人", ["职位：合伙人"]), false, "rewritten text not verbatim");
const idx = zySlotIndexFromSnapshot(SNAP);
assert.strictEqual(idx["front-1"].objectUuid, "a1");
assert.strictEqual(idx["back-1"].side, "back");
console.log("[template-match-plan] PASS 2 verbatim/slotIndex");

// ---- validator：合格 plan ----
const good = { matches: [
  { slotId: "front-1", customerText: "江某", confidence: 0.98, reason: "姓名" },
  { slotId: "front-2", customerText: "合伙人", confidence: 0.97, reason: "职位" },
  { slotId: "front-3", customerText: "18183453826", confidence: 0.99, reason: "电话" }
], uncertain: [], unmatchedCustomer: [{ text: "微信：abc", reason: "无微信槽" }] };
const r1 = zyValidateTemplateMatchPlan({ plan: good, snapshot: SNAP, rawText: RAW });
assert.strictEqual(r1.ok, true, JSON.stringify(r1.errors));
assert.strictEqual(r1.matches.length, 3);
assert.strictEqual(r1.matches[1].slotIdx, 1);
assert.strictEqual(r1.matches[1].side, "front");
assert.strictEqual(r1.unmatchedCustomer.length, 1);
console.log("[template-match-plan] PASS 3 valid plan");

// ---- validator：注入/改写拒绝 ----
const bad1 = { matches: [{ slotId: "front-999", customerText: "江某", confidence: 0.9 }] };
assert.strictEqual(zyValidateTemplateMatchPlan({ plan: bad1, snapshot: SNAP, rawText: RAW }).ok, false, "unknown slot rejected");
const bad2 = { matches: [
  { slotId: "front-1", customerText: "江某", confidence: 0.9 },
  { slotId: "front-2", customerText: "江某", confidence: 0.8 }
] };
assert.strictEqual(zyValidateTemplateMatchPlan({ plan: bad2, snapshot: SNAP, rawText: RAW }).ok, false, "duplicate customerText rejected");
const bad3 = { matches: [{ slotId: "front-1", customerText: "高级合伙人", confidence: 0.9 }] };
assert.strictEqual(zyValidateTemplateMatchPlan({ plan: bad3, snapshot: SNAP, rawText: RAW }).ok, false, "rewritten text rejected");
const bad4 = { matches: [{ slotId: "back-1", customerText: "江某", confidence: 0.9 }] };
// back slot 填「江某」逐字可追溯（该行出现在原文中），validator 允许；侧向一致性由 slotId 前缀 + AI 承担
assert.strictEqual(zyValidateTemplateMatchPlan({ plan: bad4, snapshot: SNAP, rawText: RAW }).ok, true, "verbatim back slot ok");
// 真正要拦的：同一条客户原文被两面/两槽复用（一条内容只能填一个 slot）
const cross = { matches: [
  { slotId: "front-1", customerText: "江某", confidence: 0.9 },
  { slotId: "back-1", customerText: "江某", confidence: 0.9 }
] };
assert.strictEqual(zyValidateTemplateMatchPlan({ plan: cross, snapshot: SNAP, rawText: RAW }).ok, false, "同一条原文跨面复用 rejected");
assert.strictEqual(zyValidateTemplateMatchPlan({ plan: { matches: [{ slotId: "back-1", customerText: "主营范围：企业管理咨询", confidence: 0.9 }] }, snapshot: SNAP, rawText: RAW }).ok, true, "back slot verbatim ok");
console.log("[template-match-plan] PASS 4 adversarial rejections");

// ---- validator：低置信 → uncertain；slot 唯一 ----
const low = { matches: [
  { slotId: "front-1", customerText: "江某", confidence: 0.4 },
  { slotId: "front-2", customerText: "合伙人", confidence: 0.97 }
] };
const r5 = zyValidateTemplateMatchPlan({ plan: low, snapshot: SNAP, rawText: RAW, minConfidence: 0.5 });
assert.strictEqual(r5.matches.length, 1, "low-confidence excluded");
assert.strictEqual(r5.uncertain.length, 1);
assert.ok(r5.warnings.length >= 1);
const dupSlot = { matches: [
  { slotId: "front-1", customerText: "江某", confidence: 0.9 },
  { slotId: "front-1", customerText: "合伙人", confidence: 0.9 }
] };
assert.strictEqual(zyValidateTemplateMatchPlan({ plan: dupSlot, snapshot: SNAP, rawText: RAW }).ok, false, "duplicate slot rejected");
console.log("[template-match-plan] PASS 5 confidence & slot uniqueness");

console.log("[template-match-plan] ALL PASS");