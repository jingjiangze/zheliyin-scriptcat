// =====================================================================
// 折立印名片套版助手 - Smart Fill Planner（Stage 10-E Commit G-1）
// ---------------------------------------------------------------------
// 定位：「一键智能填充」的纯逻辑模块 —— AI 单次调用「拆正反面 + 提字段」的
// Prompt 与返回归一化，不带任何 HTTP / DOM / 面板世界副作用，可 node 单测、
// 可 @require 注入 userscript（加 module 守卫，页面 world 安全）。
// 输入：
//   rawText        —— 用户粘贴的客户名片原文
//   aiResult       —— AI 返回（已 JSON.parse）{front, back, fields, notes}
//   fallback       —— {front?, back?, fields?} 本地规则结果（某侧缺 AI 时补 / AI 坏时全兜底）
// 输出：
//   { front, back, fields, notes[] } —— fields 与 emptyFields 同构（多值数组，不合并）
// 硬规则：
//   1. 每句内容必须归入 front/back/fields 至少一处；不可虚构；
//   2. 电话/微信/邮箱/网址/地址/主营/反面补充 = 数组，多个值不拼接（不合并）；
//   3. AI 无效/缺字段 → fallback 补齐；AI 彻底坏（非对象）→ 全文回退到 front + fallback.fields；
//   4. 文本清理：\r 归一、去围栏标记、去空行、按侧长度上限截断（防 API 负载爆炸）。
// =====================================================================
"use strict";

var FIELD_SINGLE_KEYS = ["company_cn", "company_en", "name", "title"];
var FIELD_ARRAY_KEYS = ["phones", "wechats", "emails", "websites", "addresses", "business", "back_extra"];
var SIDE_TEXT_MAX = 2000; // 每侧文本上限（字符），超长截断保 API 稳定
var NOTES_MAX = 8;

function cleanText(value) {
  var raw = String(value == null ? "" : value)
    .replace(/\r/g, "\n")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .split("\n")
    .map(function (line) { return String(line || "").trim(); })
    .filter(Boolean)
    .join("\n")
    .trim();
  if (raw.length > SIDE_TEXT_MAX) raw = raw.slice(0, SIDE_TEXT_MAX);
  return raw;
}

function unique(arr) {
  var seen = {}, out = [];
  (Array.isArray(arr) ? arr : []).forEach(function (v) {
    var t = String(v == null ? "" : v).trim();
    if (!t || seen[t]) return;
    seen[t] = 1;
    out.push(t);
  });
  return out;
}

function normalizePlanFields(fields) {
  var src = fields && typeof fields === "object" ? fields : {};
  var out = {};
  FIELD_SINGLE_KEYS.forEach(function (k) {
    var v = String(src[k] == null ? "" : src[k]).trim();
    if (v) out[k] = v;
  });
  FIELD_ARRAY_KEYS.forEach(function (k) {
    var raw = src[k];
    var arr = Array.isArray(raw) ? raw : (raw == null ? [] : [raw]); // 兼容 AI 返回裸字符串
    var uniq = unique(arr);
    if (uniq.length) out[k] = uniq;
  });
  return out;
}

function mergeFields(primary, fallback) {
  var p = normalizePlanFields(primary);
  var fb = normalizePlanFields(fallback);
  var out = normalizePlanFields(p);
  FIELD_SINGLE_KEYS.forEach(function (k) { if (!out[k] && fb[k]) out[k] = fb[k]; });
  FIELD_ARRAY_KEYS.forEach(function (k) {
    var merged = unique([].concat(p[k] || [], fb[k] || []));
    if (merged.length) out[k] = merged;
  });
  return out;
}

// —— AI 单次调用 Prompt（拆正反面 + 提字段一手完成）——
function buildSmartPrompt() {
  return [
    "你是名片信息整理助手。用户会粘贴一段客户名片/微信资料文字（可能同时含正面与反面内容）。",
    "请一次性完成两件事并只返回一个 JSON 对象（禁止 Markdown、禁止解释）：",
    "{",
    "  \"front\": \"正面文本一段（中文公司/英文公司/姓名/职位/电话/微信/邮箱/网址/地址等）\",",
    "  \"back\": \"反面文本一段（主营范围/公司简介/产品优势/二维码提示/备注等）\",",
    "  \"fields\": {",
    "    \"company_cn\": \"中文公司\", \"company_en\": \"英文公司\", \"name\": \"姓名\", \"title\": \"职位\",",
    "    \"phones\": [\"电话1\",\"电话2\"], \"wechats\": [\"微信\"], \"emails\": [\"邮箱\"], \"websites\": [\"网址\"],",
    "    \"addresses\": [\"地址\"], \"business\": [\"主营项\"], \"back_extra\": [\"反面补充\"]",
    "  },",
    "  \"notes\": [\"需要说明的点（可空数组）\"]",
    "}",
    "规则：",
    "1. 原文每一句内容必须归入 front/back/fields 至少一处，禁止丢失；",
    "2. 同一字段多个值（如两个电话、两个微信）放进数组，禁止拼接或用分隔符合并；",
    "3. 看不出属于正反哪一侧的结构化信息放进 fields 相应字段；说明性/行业文本放 back；",
    "4. 只可整理用户提供的信息，禁止虚构、禁止补全缺失内容；",
    "5. fields 里 phone/wechat/email/website/address/business/back_extra 必须是数组。"
  ].join("\n");
}

// —— AI 返回归一化 → {front, back, fields, notes} ——
function normalizeSmartPlan(aiResult, rawText, fallbackFields) {
  var fb = fallbackFields && typeof fallbackFields === "object" ? fallbackFields : {};
  var fbSides = {
    front: fb.front != null ? fb.front : "",
    back: fb.back != null ? fb.back : ""
  };
  var fbFields = fb.fields || fb;
  var ai = aiResult && typeof aiResult === "object" ? aiResult : null;
  if (!ai) {
    // AI 彻底坏 → 全文回退正面 + 规则字段
    return {
      front: cleanText(rawText),
      back: cleanText(fbSides.back),
      fields: normalizePlanFields(fbFields),
      notes: []
    };
  }
  var front = cleanText(ai.front != null ? ai.front : (fbSides.front));
  var back = cleanText(ai.back != null ? ai.back : (fbSides.back));
  var notes = [];
  if (Array.isArray(ai.notes)) {
    ai.notes.slice(0, NOTES_MAX).forEach(function (n) { var t = String(n == null ? "" : n).trim(); if (t) notes.push(t); });
  }
  // fields：AI 优先，缺失项用规则补（数组取并集、不合并单值）
  var fields = mergeFields(ai.fields, fbFields);
  if (!front && !back && (ai.front == null && ai.back == null)) front = cleanText(rawText);
  return { front: front, back: back, fields: fields, notes: notes };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  buildSmartPrompt: buildSmartPrompt,
  normalizeSmartPlan: normalizeSmartPlan,
  normalizePlanFields: normalizePlanFields,
  mergeFields: mergeFields,
  cleanText: cleanText,
  FIELD_SINGLE_KEYS: FIELD_SINGLE_KEYS,
  FIELD_ARRAY_KEYS: FIELD_ARRAY_KEYS,
  SIDE_TEXT_MAX: SIDE_TEXT_MAX
};