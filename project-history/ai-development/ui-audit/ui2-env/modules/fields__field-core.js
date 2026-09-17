// =====================================================================
// 折立印名片套版助手 - Fields 核心纯函数模块（Stage 1）
// ---------------------------------------------------------------------
// 单一事实来源：本文件同时服务三种运行形态（通过拼接/加载顺序引入，作用域共享）：
//   1) ScriptCat/Tampermonkey：userscript 通过
//      // @require https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/main/extension/src/fields/field-core.js
//      在脚本主体之前加载；
//   2) 浏览器扩展：manifest content_scripts js 数组按序加载；
//   3) exe 安装器：GitHub Actions 把 extension/ 目录 base64 内嵌后解包。
// 约束：本文件只允许存在【纯函数】——禁止 DOM / window / GM_* / AI / 页面对象。
// 约定：内部函数与字段业务规则保持与 Golden Master（main 6c19b46，v0.3.0.0）完全一致，
//      除非经独立测试证明问题，否则不得改动任何判定行为。
// =====================================================================
"use strict";

function emptyFields() {
  return {
    company_cn: "",
    company_en: "",
    name: "",
    title: "",
    phones: [],
    wechats: [],
    emails: [],
    websites: [],
    addresses: [],
    business: [],
    back_extra: []
  };
}

function clean(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").replace(/^[：:，,；;\-\s]+|[：:，,；;\-\s]+$/g, "").trim();
}

function unique(items) {
  const seen = {};
  return (items || []).map(clean).filter((item) => {
    const key = item.toLowerCase();
    if (!item || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function stripLabel(value) {
  return clean(String(value || "").replace(/^(地址|电话|手机|微信|邮箱|网址|网站|Tel|Phone|Mobile|Email|Web)[:：]?\s*/i, ""));
}

// B5：剥掉公司名行尾的部门/分支机构说明，如“XX有限公司营销部” → “XX有限公司”。
function stripTrailingDept(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(.*(?:公司|集团|实业|贸易|厂|科技|电子|五金|塑胶|模具|包装|印刷|服装|鞋帽|建材|进出口|玩具|家具|设备|机械|制品))\s*[，,、:]?\s*(?:[\u4e00-\u9fa5]{1,8}?(?:部|中心|办事处|分公司|子公司|分部)(?:[（(][^）)]*[)）])?)?$/);
  return match ? clean(match[1]) : clean(text);
}

function stripBusinessLabel(value) {
  return clean(String(value || "").replace(/^(主营业务|主营范围|经营范围|业务范围|主营|经营|产品|服务)[:：]?\s*/i, ""));
}

function stripBackExtraLabel(value) {
  return clean(String(value || "").replace(/^(反面内容|反面|补充说明|说明|备注|简介|口号|标语|优势|承诺)[:：]?\s*/i, ""));
}

// 常见会被误当成姓名的短中文行（正面区块的区块名/文案等）。
const NAME_EXCLUDED_RE = /(中心|范围|热线|联系|产品|主营|简介|合作|服务|保障|诚信|品质|优惠|电话|地址|微信|邮箱|订购|批发|零售|招聘|售后|网络|企业|商务|管理|代表|欢迎|期待)/;

function isNameExcluded(value) {
  return NAME_EXCLUDED_RE.test(clean(value));
}

function isAddressLine(value) {
  const text = clean(value);
  if (!text || text.length < 6) return false;
  if (isBusinessLine(text)) return false;
  return /地址|(?:[\u4e00-\u9fa5]{2,}(省|市|区|县|镇|街道|路|大道|大街|巷|弄|村|号|大厦|广场|楼|室|座|工业园|园区|写字楼))/.test(text);
}

function isBusinessLine(value) {
  const text = clean(value);
  if (!text) return false;
  if (/主营业务|主营范围|经营范围|业务范围|主营|生产|销售|批发|零售|加工|定制|维修|回收|研发|服务|产品/.test(text)) return true;
  if (/服务器|内存|DDR|芯片|电子元器件|五金|塑胶|模具|包装|印刷|服装|鞋帽|建材|进出口/.test(text)) return true;
  return false;
}

function isBackExtraLine(value) {
  const text = clean(value);
  if (!text) return false;
  if (/反面内容|补充说明|公司简介|简介|优势|承诺|宗旨|理念|口号|标语|二维码|扫码|关注|欢迎咨询|诚信|品质|专业/.test(text)) return true;
  return false;
}

function normalizeFields(input) {
  const source = input || {};
  const out = emptyFields();
  ["company_cn", "company_en", "name", "title"].forEach((key) => {
    out[key] = clean(source[key]);
  });
  ["phones", "wechats", "emails", "websites", "addresses", "business", "back_extra"].forEach((key) => {
    out[key] = normalizeArrayField(source[key] || source[key.replace(/s$/, "")]);
  });
  out.business = out.business.filter((item) => {
    return item && item !== out.company_cn && item !== out.company_en && item !== out.name &&
      !out.phones.includes(item) && !out.websites.includes(item) && !out.addresses.includes(item);
  });
  out.back_extra = out.back_extra.filter((item) => {
    return item && item !== out.company_cn && item !== out.company_en && !out.addresses.includes(item) && !out.business.includes(item);
  });
  return out;
}

function normalizeArrayField(value) {
  if (Array.isArray(value)) return unique(value.map(stripLabel).filter(Boolean));
  return splitList(value);
}

function splitList(value) {
  return unique(String(value || "")
    .split(/\n|；|;/)
    .map(stripLabel)
    .filter(Boolean));
}

function mergeFields(ruleResult, aiResult, rawText) {
  const rule = normalizeFields(ruleResult || {});
  const ai = normalizeFields(aiResult || {});
  const raw = String(rawText || "");
  const out = normalizeFields(rule);
  ["company_cn", "company_en", "name", "title"].forEach((key) => {
    if (!ai[key]) return;
    if (!out[key] || (rawIncludes(raw, ai[key]) && !rawIncludes(raw, out[key]))) out[key] = ai[key];
  });
  ["phones", "wechats", "emails", "websites"].forEach((key) => {
    out[key] = unique([].concat(out[key] || [], (ai[key] || []).filter((item) => rawIncludes(raw, item))));
  });
  out.addresses = unique([].concat(out.addresses || [], (ai.addresses || []).filter((item) => rawIncludes(raw, item) && isAddressLine(item))));
  const business = [].concat(out.business || []);
  (ai.business || []).forEach((item) => {
    if (rawIncludes(raw, item) && isBusinessLine(item) && !isAddressLine(item)) business.push(stripBusinessLabel(item));
  });
  out.business = unique(business);
  const extra = [].concat(out.back_extra || []);
  (ai.back_extra || []).forEach((item) => {
    if (rawIncludes(raw, item) && isBackExtraLine(item) && !isAddressLine(item) && !isBusinessLine(item)) extra.push(stripBackExtraLabel(item));
  });
  out.back_extra = unique(extra);
  return normalizeFields(out);
}

function mergeTwoFields(base, extra) {
  const out = normalizeFields(base || {});
  const next = normalizeFields(extra || {});
  ["company_cn", "company_en", "name", "title"].forEach((key) => {
    if (next[key] && !out[key]) out[key] = next[key];
  });
  ["phones", "wechats", "emails", "websites", "addresses", "business", "back_extra"].forEach((key) => {
    out[key] = unique([].concat(out[key] || [], next[key] || []));
  });
  return normalizeFields(out);
}

function rawIncludes(raw, value) {
  const needle = clean(value).replace(/\s+/g, "");
  const haystack = String(raw || "").replace(/\s+/g, "");
  return needle && haystack.includes(needle);
}

function cleanMultiline(value) {
  return String(value || "").replace(/\r/g, "\n").split(/\n+/).map(clean).filter(Boolean).join("\n");
}

// AI 输出容错解析：剥离 markdown 代码块标记后 JSON.parse，失败则抓取首个 {...} 区块。
function parseJsonFromText(text) {
  const raw = String(text || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(raw);
  } catch (_error) {
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : {};
  }
}