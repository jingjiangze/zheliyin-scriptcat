// runtime/stage10/smart-plan.test.js — Stage 10-E Commit G-1：一键智能填充 纯逻辑单测
"use strict";
const { buildSmartPrompt, normalizeSmartPlan, normalizePlanFields, cleanText, SIDE_TEXT_MAX } = require("../../extension/src/fields/smart-plan.js");
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) { pass += 1; console.log("  ok  " + name); } else { fail += 1; console.log("  FAIL " + name); } };

const RAW = "山东启诚信息技术有限公司\n王小明\n销售总监\n电话：13800138000\n主营：芯片设计";

// 1. 正常全字段：AI 返回 front/back/fields 全部保留
{
  const ai = {
    front: "山东启诚信息技术有限公司\n王小明\n销售总监\n电话：13800138000",
    back: "主营：芯片设计",
    fields: { company_cn: "山东启诚信息技术有限公司", name: "王小明", title: "销售总监", phones: ["13800138000"], business: ["芯片设计"] },
    notes: ["无"]
  };
  const r = normalizeSmartPlan(ai, RAW, {});
  t("正常: front 保留", r.front.indexOf("王小明") >= 0);
  t("正常: back 保留", r.back.indexOf("芯片设计") >= 0);
  t("正常: fields 规范化", r.fields.company_cn === "山东启诚信息技术有限公司" && r.fields.phones[0] === "13800138000");
  t("正常: notes 透传", r.notes.length === 1 && r.notes[0] === "无");
}

// 2. fields 缺失 → 用 fallback 补齐（AI 只给 sides）
{
  const ai = { front: "王小明", back: "", fields: {}, notes: [] };
  const fb = { fields: { company_cn: "山东启诚", name: "王小明", phones: ["13800138000"], business: ["芯片设计"] } };
  const r = normalizeSmartPlan(ai, RAW, fb);
  t("缺 fields: 规则补公司/电话", r.fields.company_cn === "山东启诚" && r.fields.phones.length === 1);
}

// 3. AI 彻底坏（非对象）→ 全文回退 front + 规则字段
{
  const r = normalizeSmartPlan(null, RAW, { fields: { name: "王小明" } });
  t("坏 AI: 全文进 front", r.front.indexOf("主营：芯片设计") >= 0 && r.front.indexOf("13800138000") >= 0);
  t("坏 AI: 规则字段兜底", r.fields.name === "王小明");
  const r2 = normalizeSmartPlan("not an object", RAW, { fields: { name: "李四" } });
  t("坏 AI(字符串): 同兜底", r2.fields.name === "李四");
}

// 4. ai.front 缺失 → 用 fallback.front 补（若提供）
{
  const ai = { back: "主营：芯片", fields: { company_cn: "A公司" } };
  const fb = { front: "李四\n13800138000", back: "", fields: {} };
  const r = normalizeSmartPlan(ai, RAW, fb);
  t("front 缺省: fallback.front 生效", r.front.indexOf("李四") >= 0);
  t("front 缺省: AI 字段保留", r.fields.company_cn === "A公司");
}

// 5. 两侧都空且 AI 无侧 → 原文兜底进 front
{
  const r = normalizeSmartPlan({}, RAW, { fields: { name: "王小明" } });
  t("空对象: 原文兜底 front", r.front.indexOf("13800138000") >= 0);
  t("空对象: fields 规则兜底", r.fields.name === "王小明");
}

// 6. 多电话数组不合并（去重但保持多值）
{
  const ai = { front: "a", back: "", fields: { phones: ["13800138000", "13900139000", "13800138000"], wechats: ["wx1", "wx2"] } };
  const r = normalizeSmartPlan(ai, RAW, {});
  t("多电话: 数组保 2 值且去重", r.fields.phones.length === 2 && r.fields.phones[1] === "13900139000");
  t("多微信: 数组保 2 值", r.fields.wechats.length === 2);
  t("多值不合并: 无分隔符拼接", r.fields.phones.every((p) => p.indexOf("；") < 0 && p.indexOf(";") < 0));
}

// 7. 数组与 fallback 并集（AI 有 phone1，规则有 phone2 → 并集不丢）
{
  const ai = { front: "a", back: "", fields: { phones: ["13800138000"] } };
  const fb = { fields: { phones: ["13900139000"] } };
  const r = normalizeSmartPlan(ai, RAW, fb);
  t("数组并集: AI+规则不互踩", r.fields.phones.length === 2);
}

// 8. Markdown 围栏 / \r 归一 / 空行清理
{
  const ai = { front: "```json\n王小明\r\n\r\n电话：13800138000```", back: "", fields: {} };
  const r = normalizeSmartPlan(ai, RAW, {});
  t("清理: 围栏与\\r、空行去除", r.front === "王小明\n电话：13800138000");
}

// 9. 文本长度上限截断
{
  const long = new Array(SIDE_TEXT_MAX + 500).fill("字").join("");
  const ai = { front: long, back: "", fields: {} };
  const r = normalizeSmartPlan(ai, RAW, {});
  t("超长: front 截断至上限", r.front.length <= SIDE_TEXT_MAX);
}

// 10. 单值字段 AI 为空串 → fallback 补
{
  const ai = { front: "a", back: "", fields: { company_cn: "", name: "", phones: [] } };
  const fb = { fields: { company_cn: "山东启诚信息", name: "王小明" } };
  const r = normalizeSmartPlan(ai, RAW, fb);
  t("空串单值: fallback 补齐公司/姓名", r.fields.company_cn === "山东启诚信息" && r.fields.name === "王小明");
}

// 11. 数组字段结构错（非数组）→ 容错为空/字符串单值
{
  const ai = { front: "a", back: "", fields: { phones: "13800138000" } };
  const r = normalizeSmartPlan(ai, RAW, { fields: {} });
  t("结构错: 字符串 phones 归一为数组", Array.isArray(r.fields.phones) && r.fields.phones[0] === "13800138000");
}

// 12. normalizePlanFields 白名单 + 去空
{
  const f = normalizePlanFields({ company_cn: "  A公司  ", phones: ["", "13800138000", "   "], evilKey: "x", name: "" });
  t("白名单: 非法 key 丢弃", f.evilKey === undefined);
  t("归一: 去空白/空项", f.company_cn === "A公司" && f.phones.length === 1);
  t("归一: 空单值不入", f.name === undefined);
}

// 13. buildSmartPrompt 覆盖关键约束词
{
  const p = buildSmartPrompt();
  t("prompt: 含数组约束", p.indexOf("数组") >= 0 && p.indexOf("禁止拼接") >= 0);
  t("prompt: 含不虚构约束", p.indexOf("禁止虚构") >= 0);
  t("prompt: 含 JSON-only", p.indexOf("只返回一个 JSON") >= 0);
}

const res = { pass: pass, fail: fail };
console.log("smart-plan.test: pass=" + res.pass + " fail=" + res.fail);
process.exit(res.fail > 0 ? 1 : 0);