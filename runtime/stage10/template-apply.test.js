// runtime/stage10/template-apply.test.js — Stage 10-D Commit F：新套版引擎（Template Apply Planner）单测
"use strict";
const { planTemplateApply, buildFieldItems } = require("../../extension/src/editor/template-apply.js");
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) { pass += 1; console.log("  ok  " + name); } else { fail += 1; console.log("  FAIL " + name); } };
const unique = (arr, f) => { const s = new Set(arr.map(f)); return s.size === arr.length; };

const slotsByIdx = (slots) => { const m = {}; (slots || []).forEach((s, i) => { m[s.objectUuid] = i; }); return m; };

// 1. buildFieldItems：多值每值一项，不合并；空值跳过
{
  const items = buildFieldItems({ company_cn: "山东公司", name: "张天天", phones: ["13800138000", "13900139000", "", "   "], wechats: ["wx_a"], emails: [] }, "front");
  t("build front: 单值+多值每值一项", items.length === 5);
  t("build front: 多值不合并", items.filter((i) => i.key === "phones").length === 2);
  t("build front: 空值跳过", items.every((i) => i.text));
}

// 2. buildFieldItems：反面只出 business/back_extra
{
  const items = buildFieldItems({ company_cn: "山东公司", business: ["芯片", "服务器"], back_extra: ["售后" ] }, "back");
  t("build back: 精确两类", items.length === 3);
  t("build back: 正面字段不入项", items.every((i) => i.key === "business" || i.key === "back_extra"));
}

// 3. 单栏标准模板：姓名/职位/中文公司/英文公司/电话/微信/邮箱/网址/地址 9 槽全匹配（无 label，纯样本文本）
{
  const slots = [
    { objectUuid: "u1", left: 100, top: 10, width: 200, height: 40, fontSize: 18, text: "山东启诚信息技术有限公司" },
    { objectUuid: "u2", left: 100, top: 60, width: 200, height: 40, fontSize: 14, text: "Industrial Co., Ltd." },
    { objectUuid: "u3", left: 100, top: 110, width: 200, height: 40, fontSize: 24, text: "张天天" },
    { objectUuid: "u4", left: 100, top: 160, width: 200, height: 40, fontSize: 16, text: "销售总监" },
    { objectUuid: "u5", left: 100, top: 210, width: 200, height: 40, fontSize: 14, text: "13800138000" },
    { objectUuid: "u6", left: 100, top: 260, width: 200, height: 40, fontSize: 14, text: "wechat: zhangtt" },
    { objectUuid: "u7", left: 100, top: 310, width: 200, height: 40, fontSize: 14, text: "zhang@example.com" },
    { objectUuid: "u8", left: 100, top: 360, width: 200, height: 40, fontSize: 14, text: "www.example.com" },
    { objectUuid: "u9", left: 100, top: 410, width: 200, height: 40, fontSize: 12, text: "济南市历下区软件园 3 号楼" }
  ];
  const fields = { company_cn: "深圳某某科技有限公司", company_en: "Shenzhen XX Tech Co., Ltd.", name: "王小二", title: "产品经理", phones: ["13900139000"], wechats: ["wxlisi"], emails: ["lisi@example.com"], websites: ["https://lisicorp.cn"], addresses: ["北京市朝阳区建国路 88 号" ] };
  const r = planTemplateApply({ slots, fields, side: "front", opts: { canvas: { width: 600 } } });
  t("9槽标准: 全部匹配 9 项", r.matches.length === 9);
  t("9槽标准: 无未匹配", r.unmatchedFields.length === 0);
  t("9槽标准: 无未用槽", r.unusedSlots.length === 0);
  t("9槽标准: 槽位唯一（无覆盖）", unique(r.matches, (m) => m.slotIdx));
  t("9槽标准: 字段唯一（无重复）", unique(r.matches, (m) => m.fieldKey));
  t("9槽标准: 置信均 ≥0.40", r.matches.every((m) => m.confidence >= 0.40));
  const byKey = {}; r.matches.forEach((m) => { byKey[m.fieldKey] = m.slotIdx; });
  t("9槽标准: 公司/电话/地址落正确槽", byKey.company_cn === 0 && byKey.phones === 4 && byKey.addresses === 8);
}

// 4. 带标签前缀槽（"电话："）/ type 语义正则命中
{
  const slots = [
    { objectUuid: "p", left: 80, top: 10, width: 200, height: 40, text: "电话：13800138000" },
    { objectUuid: "w", left: 320, top: 10, width: 200, height: 40, text: "微信：wxlisi" }
  ];
  const fields = { phones: ["13800138000"], wechats: ["wx_zhangtt"] };
  const r = planTemplateApply({ slots, fields, side: "front" });
  t("labelPrefix: 电话槽绑 phones", r.matches.length === 2 && r.matches.some((m) => m.fieldKey === "phones" && m.slotIdx === 0));
  t("labelPrefix: 微信槽绑 wechats", r.matches.some((m) => m.fieldKey === "wechats" && m.slotIdx === 1));
}

// 5. 双栏同名槽（2 电话）：按阅读序（左栏→右栏）分配，不触发边际误杀
{
  const slots = [
    { objectUuid: "p1", left: 60, top: 10, width: 200, height: 40, text: "13800138000" },
    { objectUuid: "p2", left: 360, top: 10, width: 200, height: 40, text: "13900139000" },
    { objectUuid: "w1", left: 60, top: 60, width: 200, height: 40, text: "wxlisi" },
    { objectUuid: "w2", left: 360, top: 60, width: 200, height: 40, text: "wxlily" }
  ];
  const fields = { phones: ["13700137000", "13600136000"], wechats: ["wx_a", "wx_b"] };
  const r = planTemplateApply({ slots, fields, side: "front", opts: { canvas: { width: 600 } } });
  const byKey = {}; r.matches.forEach((m) => { (byKey[m.fieldKey] = byKey[m.fieldKey] || []).push(m.slotIdx); });
  t("双栏: phones 各占 1 槽", (byKey.phones || []).length === 2);
  t("双栏: wechats 各占 1 槽", (byKey.wechats || []).length === 2);
  t("双栏: 无未匹配", r.unmatchedFields.length === 0);
  t("双栏: 槽位唯一", unique(r.matches, (m) => m.slotIdx));
  t("双栏: 左栏 v1（第 0 字段）落 p1", byKey.phones[0] === 0 && byKey.phones[1] === 1);
}

// 6. 多电话不合并：3 个电话值 / 2 个电话槽 → 2 匹配 + 1 未匹配 NO_SLOT
{
  const slots = [
    { objectUuid: "p1", left: 80, top: 10, width: 200, height: 40, text: "13800138000" },
    { objectUuid: "p2", left: 80, top: 50, width: 200, height: 40, text: "13900139000" }
  ];
  const fields = { phones: ["13700137000", "13600136000", "13500135000"] };
  const r = planTemplateApply({ slots, fields, side: "front" });
  t("多电话: 2 匹配", r.matches.length === 2);
  t("多电话: 第 3 值未匹配 NO_SLOT（不合并）", r.unmatchedFields.length === 1 && r.unmatchedFields[0].fieldKey === "phones" && r.unmatchedFields[0].reason === "NO_SLOT");
}

// 7. 无槽：整体 unmatched NO_SLOT，slotsCount=0
{
  const r = planTemplateApply({ slots: [], fields: { name: "李四" }, side: "front" });
  t("无槽: 无匹配", r.matches.length === 0);
  t("无槽: 未匹配 NO_SLOT", r.unmatchedFields.length === 1 && r.unmatchedFields[0].reason === "NO_SLOT");
  t("无槽: slotsCount=0", r.slotsCount === 0);
}

// 8. 有候选但置信不足 → LOW_CONFIDENT（minConfidence 覆盖调高）
{
  const slots = [{ objectUuid: "p", left: 80, top: 10, width: 300, height: 40, text: "13800138000 转 9999" }];
  const fields = { phones: ["13855556666"] };
  const r = planTemplateApply({ slots, fields, side: "front", opts: { minConfidence: 0.5 } });
  t("低置信: LOW_CONFIDENT 不硬绑", r.matches.length === 0 && r.unmatchedFields.length === 1 && r.unmatchedFields[0].reason === "LOW_CONFIDENT");
}

// 9. 弱语义无候选 → NO_SLOT（name 值对非中文槽）
{
  const slots = [{ objectUuid: "s", left: 80, top: 10, width: 200, height: 40, text: "Steve Smith M.B.A." }];
  const r = planTemplateApply({ slots, fields: { name: "李四" }, side: "front" });
  t("弱语义: name 无可绑槽 → NO_SLOT", r.matches.length === 0 && r.unmatchedFields[0].reason === "NO_SLOT");
}

// 10. placeholder 兜底：该 key 无强型槽时，空/示例槽可绑（被唯一竞争时受相对边际保护）
{
  const slots = [{ objectUuid: "blank", left: 80, top: 10, width: 200, height: 40, text: "XXX" }];
  const r = planTemplateApply({ slots, fields: { name: "李四" }, side: "front" });
  t("placeholder兜底: 唯一候选可绑", r.matches.length === 1 && r.matches[0].fieldKey === "name" && r.matches[0].confidence >= 0.40);
}
{
  // 共享空槽被两字段竞争 → 歧义 → 双方 LOW_CONFIDENT
  const slots = [{ objectUuid: "blank", left: 80, top: 10, width: 200, height: 40, text: "XXX" }];
  const fields = { phones: ["13800138000"], wechats: ["wx_a"] };
  const r = planTemplateApply({ slots, fields, side: "front" });
  t("placeholder竞争: 无硬绑", r.matches.length === 0);
  t("placeholder竞争: 双方 LOW_CONFIDENT", r.unmatchedFields.length === 2 && r.unmatchedFields.every((u) => u.reason === "LOW_CONFIDENT"));
}

// 11. exact 决定性：字段值与某槽文本完全一致 → 高置信绑定（即使存在其他类型槽）
{
  const slots = [
    { objectUuid: "blank", left: 80, top: 10, width: 200, height: 40, text: "李四" },
    { objectUuid: "other", left: 320, top: 10, width: 200, height: 40, text: "13800138000" }
  ];
  const r = planTemplateApply({ slots, fields: { name: "李四" }, side: "front" });
  t("exact: 绑定同文槽且 conf≥0.9", r.matches.length === 1 && r.matches[0].slotIdx === 0 && r.matches[0].confidence >= 0.9);
}

// 12. 中文公司 / 英文公司 消歧（跨 key 禁止）
{
  const slots = [
    { objectUuid: "cn", left: 60, top: 10, width: 200, height: 40, text: "深圳市某某科技有限公司" },
    { objectUuid: "en", left: 360, top: 10, width: 200, height: 40, text: "Shenzhen XX Tech Co., Ltd." }
  ];
  const fields = { company_cn: "山东启诚信息技术有限公司", company_en: "Shandong Qicheng Info Tech Co., Ltd." };
  const r = planTemplateApply({ slots, fields, side: "front" });
  const byKey = {}; r.matches.forEach((m) => { byKey[m.fieldKey] = m.slotIdx; });
  t("公司消歧: CN→cn 槽, EN→en 槽", byKey.company_cn === 0 && byKey.company_en === 1);
}

// 13. 反面 business：值只写内容（不发明前缀），超出未匹配
{
  const slots = [{ objectUuid: "b1", left: 80, top: 10, width: 300, height: 40, text: "主营：芯片设计" }];
  const fields = { business: ["芯片设计", "服务器"], back_extra: [] };
  const r = planTemplateApply({ slots, fields, side: "back" });
  t("反面主营: 1 匹配", r.matches.length === 1 && r.matches[0].fieldKey === "business");
  t("反面主营: 值无前缀", r.matches[0].text === "芯片设计");
  t("反面主营: 第 2 值未匹配", r.unmatchedFields.length === 1 && r.unmatchedFields[0].text === "服务器" && r.unmatchedFields[0].reason === "NO_SLOT");
}

// 14. 反面 back_extra 弱门：备注/补充 标签槽可绑；语义槽不误绑
{
  const slots = [
    { objectUuid: "n1", left: 80, top: 10, width: 300, height: 40, text: "备注：" },
    { objectUuid: "n2", left: 80, top: 60, width: 300, height: 40, text: "13800138000" }
  ];
  const fields = { business: [], back_extra: ["老客户，优先处理"] };
  const r = planTemplateApply({ slots, fields, side: "back" });
  t("back_extra: 绑备注槽不绑电话槽", r.matches.length === 1 && r.matches[0].slotIdx === 0 && r.matches[0].fieldKey === "back_extra");
}

// 15. unusedSlots：字段远少于槽位 → 报告未用槽
{
  const slots = [1, 2, 3, 4, 5].map((i) => ({ objectUuid: "s" + i, left: 80, top: 10 * i, width: 200, height: 40, text: i === 1 ? "张天天" : "示例" + i }));
  const fields = { name: "李四" };
  const r = planTemplateApply({ slots, fields, side: "front" });
  t("unusedSlots: 仅 names 占 1 槽", r.matches.length === 1);
  const ids = new Set(r.matches.map((m) => m.slotIdx));
  const unused = slots.map((_, i) => i).filter((i) => !ids.has(i));
  t("unusedSlots: 未用槽数与报告一致", r.unusedSlots.length === unused.length && r.unusedSlots.length === 4);
}

// 16. 唯一绑定铁律：被别的字段占用后的槽不被第二个字段复用（同槽禁覆盖）
{
  const slots = [
    { objectUuid: "s1", left: 80, top: 10, width: 200, height: 40, text: "李经理" },
    { objectUuid: "s2", left: 80, top: 60, width: 200, height: 40, text: "王经理" }
  ];
  const fields = { name: "李四", title: "经理" };
  const r = planTemplateApply({ slots, fields, side: "front" });
  // 两项都能匹配到（name→李经理, title→王经理），且槽位唯一
  t("同名槽竞争: 槽位唯一", unique(r.matches, (m) => m.slotIdx));
  t("同名槽竞争: 无覆盖（两字段各占一槽）", r.matches.length === 2 && r.unmatchedFields.length === 0);
}

const res = { pass: pass, fail: fail };
console.log("template-apply.test: pass=" + res.pass + " fail=" + res.fail);
process.exit(res.fail > 0 ? 1 : 0);