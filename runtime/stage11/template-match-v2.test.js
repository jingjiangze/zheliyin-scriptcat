"use strict";
// runtime/stage11/template-match-v2.test.js — L 阶 M2/M3：AI Match Prompt V2（两层协议）+ Match Validator V2
// 真源：extension/src/ai/template-match-plan.js（V2）+ template-match-validator.js（V2）
const assert = require("assert");
const path = require("path");
const planMod = require(path.join(__dirname, "..", "..", "extension", "src", "ai", "template-match-plan.js"));
const valMod = require(path.join(__dirname, "..", "..", "extension", "src", "ai", "template-match-validator.js"));
const ruleMod = require(path.join(__dirname, "..", "..", "extension", "src", "ai", "rule-match.js"));
const {
  zySplitCustomerLines, zyCustomerContentLines, zySideLines, zySideSlots,
  zyTemplateMatchSidePrompt, zySnapshotToAiInput, zyBuildTemplateMatchMessages,
  zyExtractPlanJson, zyNormalizePlanShape, zyMergeSideMatches
} = planMod;
const { zyVerbatimTraceable, zySlotIndexFromSnapshot, zyValidateTemplateMatchPlan, zyTypeCanon, zyTypeAgreeOf, zyIsStrongConflict, zyNormalizeLabeledText, zyLabelSplit } = valMod;
const detectType = ruleMod.zyDetectType;

const RAW = ["正面：", "山东启诚信息技术有限公司", "王小明", "销售总监", "电话：13800138000",
  "反面：", "主营：企业信息化咨询", "服务热线：400-888-6666", "地址：建国路88号"].join("\n");
const SNAP = {
  front: { exists: true, items: [
    { slotId: "front-1", objectUuid: "u-f1", text: "山东启诚信息技术股份", layerNum: 0, fontSize: 14, left: 61, top: 31, width: 160, height: 20 },
    { slotId: "front-2", objectUuid: "u-f2", text: "王晓明", layerNum: 1, fontSize: 18, left: 61, top: 54, width: 160, height: 24 },
    { slotId: "front-3", objectUuid: "u-f3", text: "销售副总监", layerNum: 2, fontSize: 24, left: 61, top: 77, width: 160, height: 30 },
    { slotId: "front-4", objectUuid: "u-f4", text: "1380 0138 000", layerNum: 3, fontSize: 15, left: 61, top: 100, width: 160, height: 20 }
  ]},
  back: { exists: true, items: [
    { slotId: "back-1", objectUuid: "u-b1", text: "主营：企业咨询", layerNum: 500, fontSize: 14 },
    { slotId: "back-2", objectUuid: "u-b2", text: "服务热线：400-100", layerNum: 501, fontSize: 12 },
    { slotId: "back-3", objectUuid: "u-b3", text: "地址：建国路89号", layerNum: 502, fontSize: 11 }
  ]}
};
const V = (plan, extra) => zyValidateTemplateMatchPlan(Object.assign({ plan: plan, snapshot: SNAP, rawText: RAW, minConfidence: 0.5, typeDetector: detectType }, extra || {}));

// ============ 1) plan 模块：本地确定性分段 ============
const lines = zySplitCustomerLines(RAW);
assert.strictEqual(lines.length, 9, "9 行（含 2 个标记行）");
assert.deepStrictEqual(lines.map((l) => l.side), ["front", "front", "front", "front", "front", "back", "back", "back", "back"], "side 由标记确定");
assert.strictEqual(lines[0].marker, true, "正面：是标记行");
assert.strictEqual(lines[5].marker, true, "反面：是标记行");
assert.strictEqual(lines[1].marker, false);
assert.strictEqual(lines[1].lineNo, 2, "lineNo 1 基含标记行");
assert.strictEqual(zyCustomerContentLines(RAW).length, 7, "内容行 7 条");
assert.strictEqual(zySideLines(RAW, "front").length, 4, "正面内容 4 条");
assert.strictEqual(zySideLines(RAW, "back").length, 3, "反面内容 3 条");
// 无标记 → 全部 front
const noMark = zySplitCustomerLines("a\nb");
assert.deepStrictEqual(noMark.map((l) => l.side), ["front", "front"], "无标记全部 front");
// 「背面：」别名
assert.strictEqual(zySplitCustomerLines("背面：\nx")[1].side, "back", "背面：视为 back 标记");
// 空行丢弃
assert.strictEqual(zySplitCustomerLines("a\n\n\nb").length, 2, "空行丢弃");
console.log("[template-match-v2] PASS 1 splitCustomerLines");

// ============ 2) plan 模块：槽位上下文 / 单面输入 ============
const slotsF = zySideSlots(SNAP.front, "front");
assert.strictEqual(slotsF.length, 4);
assert.strictEqual(slotsF[0].slotId, "front-1");
assert.strictEqual(slotsF[0].templateText, "山东启诚信息技术股份");
assert.strictEqual(slotsF[0].x, 61);
assert.strictEqual(slotsF[0].y, 31);
assert.strictEqual(slotsF[0].w, 160);
assert.strictEqual(slotsF[0].h, 20);
const inB = zySnapshotToAiInput({ side: "back", section: SNAP.back, customerRawText: RAW });
assert.ok(inB.indexOf('"side": "back"') >= 0, "user 标注 side");
assert.ok(inB.indexOf("back-1") >= 0 && inB.indexOf("主营：企业咨询") >= 0, "user 含反面槽位");
assert.ok(inB.indexOf("企业信息化咨询") >= 0, "user 含反面客户行");
assert.ok(inB.indexOf("山东启诚信息技术有限公司") < 0, "反面输入不得含正面客户行（结构性防串面）");
const inF = zySnapshotToAiInput({ side: "front", section: SNAP.front, customerRawText: RAW });
assert.ok(inF.indexOf("企业信息化咨询") < 0, "正面输入不得含反面客户行");
assert.ok(inF.indexOf('"lineNo": 2') >= 0, "lineNo 与原文对齐");
console.log("[template-match-v2] PASS 2 side-scoped input");

// ============ 3) plan 模块：单面 prompt 铁律 ============
const pF = zyTemplateMatchSidePrompt("front");
const pB = zyTemplateMatchSidePrompt("back");
assert.ok(pF.indexOf("只处理【正面】") >= 0, "prompt 限定面");
assert.ok(pB.indexOf("只处理【反面】") >= 0, "prompt 限定反面");
assert.ok(pF.indexOf("逐字") >= 0 && pF.indexOf("不得改写") >= 0, "逐字铁律");
assert.ok(pF.indexOf("严禁漏掉任何一块") >= 0, "完整性铁律");
assert.ok(pF.indexOf("标签约定随模板") >= 0, "标签约定");
assert.ok(pF.indexOf("front-1") >= 0 && pF.indexOf("back-1") < 0, "prompt 示例只用本面前缀");
assert.ok(pB.indexOf("back-1") >= 0 && pB.indexOf("front-1") < 0, "反面 prompt 示例只用 back 前缀");
assert.ok(pF.indexOf("空") >= 0 && pF.indexOf("占位") >= 0, "空槽不匹配");
const msg = zyBuildTemplateMatchMessages({ side: "front", section: SNAP.front, customerRawText: RAW });
assert.strictEqual(msg.length, 2);
assert.strictEqual(msg[0].role, "system");
assert.ok(msg[1].content.indexOf("front-1") >= 0, "messages user 含槽位");
console.log("[template-match-v2] PASS 3 side prompt");

// ============ 4) plan 模块：解析 / 归一化 / 合并 ============
assert.strictEqual(zyExtractPlanJson('```json\n{"customerBlocks":[{"blockId":"c-1"}]}\n```').ok, true);
assert.strictEqual(zyExtractPlanJson("no json").ok, false);
assert.strictEqual(zyExtractPlanJson("").ok, false);
const norm = zyNormalizePlanShape({ customerBlocks: [1], unmatchedBlockIds: ["c-9"], nope: 1 });
assert.deepStrictEqual(norm.customerBlocks, [1]);
assert.deepStrictEqual(norm.unmatchedBlockIds, ["c-9"]);
assert.deepStrictEqual(norm.matches, []);
const merged = zyMergeSideMatches([[{ side: "back", slotIdx: 1 }, { side: "front", slotIdx: 3 }], [{ side: "front", slotIdx: 0 }]]);
assert.deepStrictEqual(merged.map((m) => m.side + m.slotIdx), ["front0", "front3", "back1"], "front 组在前、组内 slotIdx 升序");
console.log("[template-match-v2] PASS 4 parse/normalize/merge");

// ============ 5) validator V2：合格计划 + blockId 回填 ============
const good = {
  customerBlocks: [
    { blockId: "c-1", lineNo: 2, text: "山东启诚信息技术有限公司", type: "company" },
    { blockId: "c-2", lineNo: 3, text: "王小明", type: "name" },
    { blockId: "c-3", lineNo: 4, text: "销售总监", type: "title" },
    { blockId: "c-4", lineNo: 5, text: "13800138000", type: "phone" }
  ],
  matches: [
    { slotId: "front-1", blockId: "c-1", confidence: 0.95, reason: "公司" },
    { slotId: "front-2", blockId: "c-2", confidence: 0.95, reason: "姓名" },
    { slotId: "front-3", blockId: "c-3", confidence: 0.95, reason: "职位" },
    { slotId: "front-4", blockId: "c-4", confidence: 0.95, reason: "电话" }
  ],
  unmatchedBlockIds: [], uncertain: [], unusedSlots: [], warnings: []
};
const r1 = V(good);
assert.strictEqual(r1.ok, true, JSON.stringify(r1.errors));
assert.strictEqual(r1.matches.length, 4);
assert.strictEqual(r1.matches[0].side, "front");
assert.strictEqual(r1.matches[0].slotIdx, 0);
assert.strictEqual(r1.matches[0].objectUuid, "u-f1");
assert.strictEqual(r1.matches[0].customerText, "山东启诚信息技术有限公司");
assert.strictEqual(r1.matches[0].blockId, "c-1");
assert.strictEqual(r1.matches[3].customerText, "13800138000");
assert.strictEqual(r1.summary.matched, 4);
assert.strictEqual(r1.summary.semanticallyVerified, 4, "四个匹配语义一致");
assert.strictEqual(r1.summary.unaccounted, 0);
console.log("[template-match-v2] PASS 5 valid plan");

// ============ 6) validator V2：值来源 = blockId 回填（忽略 AI 在 match 里的文本） ============
const forged = JSON.parse(JSON.stringify(good));
forged.matches[0].customerText = "伪造的公司名";
const rForged = V(forged);
assert.strictEqual(rForged.ok, true, JSON.stringify(rForged.errors));
assert.strictEqual(rForged.matches[0].customerText, "山东启诚信息技术有限公司", "customerText 必须来自 blockId 回填");
console.log("[template-match-v2] PASS 6 value from blockId");

// ============ 7) validator V2：结构性拒绝 ============
const t = (label, plan, extra, expectSub) => {
  const r = V(plan, extra);
  assert.strictEqual(r.ok, false, label + " 必须被拒（errors=" + JSON.stringify(r.errors) + "）");
  if (expectSub) assert.ok(r.errors.join("|").indexOf(expectSub) >= 0, label + " 错误码应为 " + expectSub + " 实为 " + JSON.stringify(r.errors));
};
// 未知槽位
t("UNKNOWN_SLOT", { customerBlocks: good.customerBlocks, matches: [{ slotId: "front-999", blockId: "c-1", confidence: 0.9 }] }, null, "UNKNOWN_SLOT");
// 未知块
t("UNKNOWN_BLOCK", { customerBlocks: good.customerBlocks, matches: [{ slotId: "front-1", blockId: "c-999", confidence: 0.9 }] }, null, "UNKNOWN_BLOCK");
// 槽位重复
t("SLOT_DUPLICATE", { customerBlocks: good.customerBlocks, matches: [
  { slotId: "front-1", blockId: "c-1", confidence: 0.9 },
  { slotId: "front-1", blockId: "c-2", confidence: 0.9 }] }, null, "SLOT_DUPLICATE");
// 块重复（一对一）
t("BLOCK_DUPLICATE", { customerBlocks: good.customerBlocks, matches: [
  { slotId: "front-1", blockId: "c-1", confidence: 0.9 },
  { slotId: "front-2", blockId: "c-1", confidence: 0.9 }] }, null, "BLOCK_DUPLICATE");
// 侧向硬门禁：back 槽 配 front 行
t("SIDE_MISMATCH", { customerBlocks: good.customerBlocks, matches: [{ slotId: "back-1", blockId: "c-1", confidence: 0.9 }] }, null, "SIDE_MISMATCH");
// 分面调用越界：front 请求里出现 back 行
t("SIDE_OUT_OF_SCOPE", { customerBlocks: [{ blockId: "c-1", lineNo: 7, text: "企业信息化咨询", type: "business" }], matches: [{ slotId: "front-1", blockId: "c-1", confidence: 0.9 }] }, { expectSide: "front" }, "SIDE_OUT_OF_SCOPE");
// 改写文本（非逐字）
t("NOT_VERBATIM", { customerBlocks: [{ blockId: "c-1", lineNo: 4, text: "高级销售总监", type: "title" }], matches: [{ slotId: "front-3", blockId: "c-1", confidence: 0.9 }] }, null, "NOT_VERBATIM");
// 未知行号
t("UNKNOWN_LINE", { customerBlocks: [{ blockId: "c-1", lineNo: 99, text: "王小明", type: "name" }], matches: [{ slotId: "front-2", blockId: "c-1", confidence: 0.9 }] }, null, "UNKNOWN_LINE");
// 标记行不得造块
t("MARKER_LINE", { customerBlocks: [{ blockId: "c-1", lineNo: 1, text: "正面：", type: "other" }], matches: [{ slotId: "front-1", blockId: "c-1", confidence: 0.9 }] }, null, "MARKER_LINE");
// 空块文本
t("EMPTY_BLOCK_TEXT", { customerBlocks: [{ blockId: "c-1", lineNo: 3, text: "  ", type: "name" }], matches: [{ slotId: "front-2", blockId: "c-1", confidence: 0.9 }] }, null, "EMPTY_BLOCK_TEXT");
// blockId 缺失 / 重复
t("MISSING_BLOCK_ID", { customerBlocks: [{ lineNo: 3, text: "王小明", type: "name" }], matches: [{ slotId: "front-2", blockId: "c-1", confidence: 0.9 }] }, null, "MISSING_BLOCK_ID");
t("DUPLICATE_BLOCK_ID", { customerBlocks: [
  { blockId: "c-1", lineNo: 3, text: "王小明", type: "name" },
  { blockId: "c-1", lineNo: 4, text: "销售总监", type: "title" }], matches: [{ slotId: "front-2", blockId: "c-1", confidence: 0.9 }] }, null, "DUPLICATE_BLOCK_ID");
// 空槽位不得匹配
const snapEmpty = JSON.parse(JSON.stringify(SNAP));
snapEmpty.front.items[3].text = " ";
t("EMPTY_SLOT", { customerBlocks: good.customerBlocks, matches: [{ slotId: "front-4", blockId: "c-4", confidence: 0.9 }] }, { snapshot: snapEmpty }, "EMPTY_SLOT");
console.log("[template-match-v2] PASS 7 structural rejections");

// ============ 8) validator V2：完整性（严禁静默丢弃） ============
const partial = {
  customerBlocks: good.customerBlocks.concat([
    { blockId: "c-5", lineNo: 7, text: "企业信息化咨询", type: "business" },
    { blockId: "c-6", lineNo: 8, text: "400-888-6666", type: "landline" },
    { blockId: "c-7", lineNo: 9, text: "建国路88号", type: "address" }
  ]),
  matches: good.matches.slice(0, 4),
  unmatchedBlockIds: [], uncertain: [], unusedSlots: [], warnings: []
};
const rPart = V(partial);
assert.strictEqual(rPart.ok, true, JSON.stringify(rPart.errors));
assert.strictEqual(rPart.matches.length, 4);
assert.strictEqual(rPart.summary.blocks, 7);
assert.strictEqual(rPart.summary.unaccounted, 3, "3 个未交代的块必须被计数");
assert.strictEqual(rPart.unmatchedCustomer.length, 3, "未交代的块必须显式列为未匹配");
assert.ok(rPart.unmatchedCustomer.every((u) => u.reason === "NOT_ACCOUNTED_BY_AI"), "原因标注 NOT_ACCOUNTED_BY_AI");
assert.ok(rPart.warnings.join("|").indexOf("BLOCK_NOT_ACCOUNTED") >= 0, "必须给出 warning");
assert.ok(rPart.unmatchedCustomer.map((u) => u.text).indexOf("企业信息化咨询") >= 0, "反面被丢弃的内容必须显式暴露（V1 真机缺陷）");
console.log("[template-match-v2] PASS 8 completeness (no silent drop)");

// ============ 9) validator V2：unmatchedBlockIds / uncertain 透传 ============
const withUnmatched = JSON.parse(JSON.stringify(partial));
withUnmatched.unmatchedBlockIds = ["c-5", "c-6", "c-7"];
const rUn = V(withUnmatched);
assert.strictEqual(rUn.summary.unaccounted, 0, "显式 unmatched 后不再计为未交代");
assert.strictEqual(rUn.unmatchedCustomer.length, 3);
assert.ok(rUn.unmatchedCustomer.every((u) => u.blockId), "unmatched 带 blockId");
const withUncertain = JSON.parse(JSON.stringify(good));
withUncertain.uncertain = [{ slotId: "back-2", blockIds: ["c-5"], reason: "模糊" }];
withUncertain.customerBlocks = good.customerBlocks.concat([{ blockId: "c-5", lineNo: 8, text: "400-888-6666", type: "landline" }]);
const rUc = V(withUncertain);
assert.strictEqual(rUc.ok, true, JSON.stringify(rUc.errors));
assert.strictEqual(rUc.uncertain.length, 1);
assert.deepStrictEqual(rUc.uncertain[0].candidates, ["400-888-6666"], "uncertain candidates 由 blockId 解析");
assert.strictEqual(rUc.summary.unaccounted, 0, "uncertain 中的块已交代");
console.log("[template-match-v2] PASS 9 unmatched/uncertain passthrough");

// ============ 10) validator V2：语义类型一致性 + 低置信 ============
// 强类型冲突：本地判 email，AI 判 name → 移入 uncertain
const semStrong = {
  customerBlocks: [
    { blockId: "c-1", lineNo: 2, text: "山东启诚信息技术有限公司", type: "company" },
    { blockId: "c-2", lineNo: 3, text: "王小明", type: "email" }
  ],
  matches: [
    { slotId: "front-1", blockId: "c-1", confidence: 0.95, reason: "公司" },
    { slotId: "front-2", blockId: "c-2", confidence: 0.95, reason: "误判" }
  ],
  unmatchedBlockIds: [], uncertain: [], unusedSlots: [], warnings: []
};
const rSem = V(semStrong);
assert.strictEqual(rSem.ok, true, JSON.stringify(rSem.errors));
assert.strictEqual(rSem.matches.length, 1, "强类型冲突的匹配不得进入 refined");
assert.strictEqual(rSem.uncertain.length, 1, "强类型冲突 → uncertain");
assert.ok(rSem.uncertain[0].reason.indexOf("SEMANTIC_CONFLICT") >= 0);
assert.ok(rSem.warnings.join("|").indexOf("SEMANTIC_CONFLICT_STRONG") >= 0);
// 弱类型冲突：本地判 title，AI 判 name → 仅 warning，semanticVerified=false
const semWeak = {
  customerBlocks: [
    { blockId: "c-1", lineNo: 2, text: "山东启诚信息技术有限公司", type: "company" },
    { blockId: "c-2", lineNo: 4, text: "销售总监", type: "name" }
  ],
  matches: [
    { slotId: "front-1", blockId: "c-1", confidence: 0.95, reason: "公司" },
    { slotId: "front-3", blockId: "c-2", confidence: 0.95, reason: "弱冲突" }
  ],
  unmatchedBlockIds: [], uncertain: [], unusedSlots: [], warnings: []
};
const rWeak = V(semWeak);
assert.strictEqual(rWeak.matches.length, 2, "弱类型冲突仍可执行");
assert.strictEqual(rWeak.matches[1].semanticVerified, false);
assert.ok(rWeak.warnings.join("|").indexOf("SEMANTIC_CONFLICT_WEAK") >= 0);
assert.strictEqual(rWeak.summary.semanticallyVerified, 1);
// 无 typeDetector → 不做语义判定
const rNoDet = zyValidateTemplateMatchPlan({ plan: semStrong, snapshot: SNAP, rawText: RAW, minConfidence: 0.5 });
assert.strictEqual(rNoDet.matches.length, 2, "无 typeDetector 时不判语义");
assert.strictEqual(rNoDet.summary.semanticallyVerified, 0);
// 低置信 → uncertain
const low = JSON.parse(JSON.stringify(good));
low.matches[0].confidence = 0.4;
const rLow = V(low);
assert.strictEqual(rLow.matches.length, 3, "低置信被剔除");
assert.strictEqual(rLow.uncertain.length, 1);
assert.ok(rLow.warnings.join("|").indexOf("LOW_CONFIDENCE_SLOT") >= 0);
console.log("[template-match-v2] PASS 10 semantic & confidence");

// ============ 11) 类型归一/族 + 逐字工具 ============
assert.strictEqual(zyTypeCanon("phone"), "phone-generic");
assert.strictEqual(zyTypeCanon("landline"), "phone-landline");
assert.strictEqual(zyTypeCanon("web"), "url");
assert.strictEqual(zyTypeCanon("mail"), "email");
assert.strictEqual(zyTypeCanon("company"), "company");
// 泛化 phone 与 手机/座机 同族 → 一致，不得判强冲突（真机 46p-E 误杀修复）
assert.strictEqual(zyTypeAgreeOf("phone", "phone-landline"), true);
assert.strictEqual(zyTypeAgreeOf("phone", "phone-mobile"), true);
assert.strictEqual(zyTypeAgreeOf("phone-mobile", "phone-landline"), true);
assert.strictEqual(zyTypeAgreeOf("email", "phone"), false);
assert.strictEqual(zyTypeAgreeOf("email", "name"), false);
assert.strictEqual(zyIsStrongConflict("email", "name"), true, "跨族强冲突");
assert.strictEqual(zyIsStrongConflict("phone", "phone-landline"), false, "同族不算强冲突");
assert.strictEqual(zyIsStrongConflict("name", "title"), false, "弱类型之间不算强冲突");
assert.ok(zyVerbatimTraceable("13800138000", ["电话：13800138000"]));
assert.strictEqual(zyVerbatimTraceable("高级合伙人", ["职位：合伙人"]), false);
const idx = zySlotIndexFromSnapshot(SNAP);
assert.strictEqual(idx["front-1"].objectUuid, "u-f1");
assert.strictEqual(idx["back-1"].side, "back");
assert.strictEqual(idx["back-1"].index, 0);
console.log("[template-match-v2] PASS 11 typeCanon/family & verbatim");

// ============ 12) 标签规范化（随模板标签约定） ============
assert.deepStrictEqual(zyLabelSplit("主营：企业咨询"), { label: "主营", value: "企业咨询" });
assert.deepStrictEqual(zyLabelSplit("王晓明"), { label: null, value: "王晓明" });
assert.deepStrictEqual(zyLabelSplit("1380 0138 000"), { label: null, value: "1380 0138 000" });
// 模板无标签 + 客户带标签 → 去标签（46p A/I 回归修复）
assert.deepStrictEqual(zyNormalizeLabeledText("1380 0138 000", "电话：13800138000"), { text: "13800138000", mode: "strip" });
assert.deepStrictEqual(zyNormalizeLabeledText("王氏印刷包装", "公司名称：王氏印刷包装有限公司"), { text: "王氏印刷包装有限公司", mode: "strip" });
// 模板有标签 + 客户带标签 → 保留客户写法
assert.deepStrictEqual(zyNormalizeLabeledText("主营：企业咨询", "主营：企业信息化咨询"), { text: "主营：企业信息化咨询", mode: "keep" });
// 模板有标签 + 客户无标签 → 用模板标签补前缀
assert.deepStrictEqual(zyNormalizeLabeledText("地址：建国路89号", "建国路88号"), { text: "地址：建国路88号", mode: "prepend" });
// 双方都无标签 → 原样
assert.deepStrictEqual(zyNormalizeLabeledText("王晓明", "王小明"), { text: "王小明", mode: "none" });
// 端到端：validator refined.customerText 必须已按模板标签约定规范化
const labeled = JSON.parse(JSON.stringify(good));
labeled.customerBlocks[3] = { blockId: "c-4", lineNo: 5, text: "电话：13800138000", type: "phone" };
const rLab = V(labeled);
assert.strictEqual(rLab.ok, true, JSON.stringify(rLab.errors));
assert.strictEqual(rLab.matches[3].customerText, "13800138000", "模板无标签 → 必须去标签");
assert.strictEqual(rLab.matches[3].labelMode, "strip");
assert.strictEqual(rLab.matches[0].labelMode, "none");
console.log("[template-match-v2] PASS 12 label normalization");

console.log("[template-match-v2] ALL PASS");
