// =====================================================================
// 折立印名片套版助手 - Template Apply Planner（Stage 10-D Commit F）
// ---------------------------------------------------------------------
// 定位：双模式架构「模式 A 模板套版」的手动字段 → 模板槽位 规划纯模块。
// 输入（来自 getTextInventory 快照 + normalizeFields）：
//   slots  —— 模板已有文字槽位：{objectUuid, left, top, width, height, center:{x,y}, text, ...}
//   fields —— 面板字段（normalizeFields 后）：{company_cn, company_en, name, title,
//             phones[], wechats[], emails[], websites[], addresses[], business[], back_extra[]}
// 输出：
//   { slots(slotIdentities), slotsCount, matches[], unmatchedFields[], unusedSlots[], diagnostics }
// 硬规则（用户定稿）：
//   1. 字段只落已存在槽位，只 setText（几何/字号/字体/样式/身份/层序全部冻结），绝不新建；
//   2. 多电话/多微信不合并，超出槽位 → unmatchedFields（NO_SLOT）；
//   3. 跨 key 绑定禁止（防错槽）：字段项 key 只能绑「typeGate 通过」的槽位；
//   4. 无覆盖（一槽至多 1 字段）/ 无重复（一字段至多 1 槽）；
//   5. 置信 < minConfidence 或相对边际 < minMargin → LOW_CONFIDENT 不硬绑。
// 匹配特征（type 主导：手动字段无几何，语义即主证据）：
//   score = W.exact*exact + W.label*label + W.type*typeVal + W.len*len
//   exact —— 槽位当前文本 === 字段值（决定性，conf 下限 0.9）
//   label —— 槽位文本含该 key 的标签词（电话/微信/邮箱/…）
//   type  —— typeVal：1.0（槽位文本命中该 key 类型语义正则）/ 0.8（placeholder 兜底，仅当该 key 无强型槽时启用）
//   len   —— 文本长度类接近度（1/(1+Δlen/8)）
// 阈值参数集中于模块顶部，真机第一轮后按实测校准（匹配启发式，非字号经验常数）。
// =====================================================================
"use strict";

// ---------- 阈值参数（真机校准点） ----------
var W = { exact: 0.30, label: 0.25, type: 0.35, len: 0.10 }; // 特征权重（和为 1）
var MIN_CONFIDENCE = 0.40;   // 置信下限（type 为≥0.35 主证据时纯类型槽应可通过）
var MIN_MARGIN = 0.08;       // 最优 vs 次优相对边际，不足 → 不硬绑（防通用槽错配）
var PLACEHOLDER_TYPE_VAL = 1.0; // placeholder 兜底槽的类型证据（仅当该 key 无强型槽启用；等价「填空槽」，受相对边际保护）
var EXACT_CONF_FLOOR = 0.9;  // exact 命中时的置信下限（决定性证据）

var FIELD_LABELS = {
  company_cn: "中文公司", company_en: "英文公司", name: "姓名", title: "职位",
  phones: "电话", wechats: "微信", emails: "邮箱", websites: "网址", addresses: "地址",
  business: "主营业务", back_extra: "反面补充"
};

// 强语义类型规则（说明：type 为正则命中槽位当前文本 → 该槽属于该字段类型）
var TYPE_RULES = {
  company_cn: { label: ["公司", "集团", "科技", "贸易", "有限", "股份", "厂址"], type: /公司|集团|科技|贸易|有限|股份|厂/ },
  company_en: { label: ["company", "ltd", "limited", "co.", "trading", "technology", "group"], type: /\b(co\.?|ltd|limited|company|trading|technology|group)\b/i },
  name:       { label: ["姓名", "名字", "name"], type: /^[\u4e00-\u9fa5]{1,4}$/ },
  title:      { label: ["职位", "职务", "岗位", "title"], type: /经理|总监|工程师|销售|主管|负责人|顾问|designer|manager|director|engineer|consultant/i },
  phones:     { label: ["电话", "手机", "tel", "phone", "mobile", "座机"], type: /1[3-9]\d{9}|电话|手机|Tel|Phone/i },
  wechats:    { label: ["微信", "wechat", "wx"], type: /微信|wechat|wx/i },
  emails:     { label: ["邮箱", "mail", "email", "e-mail"], type: /@|mail|email/i },
  websites:   { label: ["网址", "网站", "web", "www", "homepage"], type: /www\.|https?:\/\/|网址|网站/i },
  addresses:  { label: ["地址", "address", "add."], type: /省|市|区|街道|路|大厦|楼|室|工业园/i },
  business:   { label: ["主营", "业务", "产品", "服务", "范围", "biz"], type: /主营|业务|产品|服务|范围|简介/i },
  // back_extra：弱语义，只有标签词；无 type 正则 → typeGate 只见 label / placeholder
  back_extra: { label: ["备注", "补充", "优势", "简介", "介绍", "note", "remark"] }
};

var PLACEHOLDER_RE = /示例|样稿|请输入|点击|双击|xxx|××|＿＿|__|（.*填写.*）/i;
var LABEL_CONF_FLOOR = 0.5; // label 命中（强标签证据）下的置信下限

function nz(v) { return (typeof v === "number" && isFinite(v)) ? v : null; }
function lenSim(a, b) { return 1 / (1 + Math.abs(String(a || "").length - String(b || "").length) / 8); }
function isBlank(v) { return !String(v == null ? "" : v).trim(); }
function isPlaceholderText(T) { return !String(T || "").trim() || PLACEHOLDER_RE.test(String(T || "")); }
function lowerWordPattern(token) {
  // 纯 ASCII 标签 → 词边界；中文/混合 → 直接子串
  return /^[a-z0-9.]+$/i.test(token) ? new RegExp("(^|[^a-z0-9])" + token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)", "i") : null;
}
function matchesLabel(labelTokens, T) {
  const lower = String(T || "").toLowerCase();
  return (labelTokens || []).some(function (tok) {
    const lp = lowerWordPattern(tok);
    return lp ? lp.test(lower) : lower.indexOf(String(tok).toLowerCase()) >= 0;
  });
}

// 槽位中心 x
function slotCX(s) { return nz(s.center && s.center.x) != null ? nz(s.center.x) : ((nz(s.left) != null) ? nz(s.left) + (nz(s.width) || 0) / 2 : null); }
function slotCY(s) { return nz(s.center && s.center.y) != null ? nz(s.center.y) : ((nz(s.top) != null) ? nz(s.top) + (nz(s.height) || 0) / 2 : null); }

// 阅读序 rank：columnBucket（左栏 0 / 右栏 1，需画布宽；无宽则全 0）→ y → x
function readingOrderRank(slots, canvasWidth) {
  const cw = nz(canvasWidth) != null ? nz(canvasWidth) : null;
  const idx = slots.map(function (_, i) { return i; });
  idx.sort(function (a, b) {
    const ba = colBucket(slots[a], cw), bb = colBucket(slots[b], cw);
    if (ba !== bb) return ba - bb;
    const ya = nz(slotCY(slots[a])) != null ? nz(slotCY(slots[a])) : 0;
    const yb = nz(slotCY(slots[b])) != null ? nz(slotCY(slots[b])) : 0;
    if (ya !== yb) return ya - yb;
    const xa = nz(slotCX(slots[a])) != null ? nz(slotCX(slots[a])) : 0;
    const xb = nz(slotCX(slots[b])) != null ? nz(slotCX(slots[b])) : 0;
    return xa - xb;
  });
  const rank = new Array(slots.length);
  idx.forEach(function (i, r) { rank[i] = r; });
  return rank;
}
function colBucket(s, cw) {
  if (cw == null || cw <= 0) return 0;
  const x = slotCX(s);
  if (x == null) return 0;
  return x / cw < 0.5 ? 0 : 1;
}

// ---------- 字段项构建（弃用旧 addMultiItems：多值不合并） ----------
function buildFieldItems(fields, side) {
  const out = [];
  const f = fields || {};
  const push = function (key, v) {
    const text = isBlank(v) ? "" : String(v).trim();
    if (text) out.push({ key: key, label: FIELD_LABELS[key] || key, text: text });
  };
  if (side === "back") {
    (Array.isArray(f.business) ? f.business : []).forEach(function (v) { push("business", v); });
    (Array.isArray(f.back_extra) ? f.back_extra : []).forEach(function (v) { push("back_extra", v); });
    return out;
  }
  ["company_cn", "company_en", "name", "title"].forEach(function (k) { push(k, f[k]); });
  ["phones", "wechats", "emails", "websites", "addresses"].forEach(function (k) {
    (Array.isArray(f[k]) ? f[k] : []).forEach(function (v) { push(k, v); });
  });
  return out;
}

// ---------- 单候选打分 ----------
function scoreCandidate(slot, fieldItem, readRank) {
  const T = String(slot.text != null ? slot.text : "").trim();
  const value = fieldItem.text;
  const rule = TYPE_RULES[fieldItem.key] || null;
  const exact = (T === value) ? 1 : 0;
  let label = 0, typeVal = 0, placeholder = false;
  if (rule) {
    if (matchesLabel(rule.label, T)) label = 1;
    if (rule.type) {
      if (rule.type.test(T)) typeVal = 1;
      else if (isPlaceholderText(T)) { placeholder = true; typeVal = PLACEHOLDER_TYPE_VAL; } // 强 key 的填空槽兜底
    } else {
      // 弱门 key（back_extra）：label 即强语义证据；placeholder 兜底；无证据 → 0
      if (label === 1) typeVal = 1;
      else if (isPlaceholderText(T)) { placeholder = true; typeVal = PLACEHOLDER_TYPE_VAL; }
    }
  }
  // placeholder 槽（空/示例文本）不承载长度信息 → len 中性 0.9（外部仍受相对边际保护）
  const len = placeholder ? 0.9 : lenSim(value, T);
  let conf = W.exact * exact + W.label * label + W.type * typeVal + W.len * len;
  if (exact === 1 && conf < EXACT_CONF_FLOOR) conf = EXACT_CONF_FLOOR;
  else if (label === 1 && rule && rule.type && conf < LABEL_CONF_FLOOR) conf = LABEL_CONF_FLOOR; // 强标签证据下限
  return {
    si: -1, exact: exact, label: label, typeVal: typeVal, placeholder: placeholder, len: Math.round(len * 1000) / 1000,
    conf: exact === 1 ? Math.min(0.97, conf) : conf, readRank: readRank
  };
}

// ---------- 主入口 ----------
function planTemplateApply(input) {
  const o = input || {};
  const slots = Array.isArray(o.slots) ? o.slots.slice() : [];
  const fields = o.fields || {};
  const side = (o.side === "back") ? "back" : "front";
  const opts = o.opts || {};
  const canvasWidth = nz(opts.canvas && opts.canvas.width);
  const minConf = nz(opts.minConfidence) != null ? nz(opts.minConfidence) : MIN_CONFIDENCE;
  const margin = nz(opts.minMargin) != null ? nz(opts.minMargin) : MIN_MARGIN;

  const items = buildFieldItems(fields, side);
  const slotIdentities = { slots: slots.map(function (s, i) { return { slotIdx: i, objectUuid: (s && (s.objectUuid || s.uuid || null)) || null }; }), slotsCount: slots.length };
  if (!slots.length) {
    return {
      slots: slotIdentities.slots, slotsCount: 0,
      matches: [],
      unmatchedFields: items.map(function (it) { return { fieldKey: it.key, label: it.label, text: it.text, reason: "NO_SLOT" }; }),
      unusedSlots: [], diagnostics: { candCount: 0, placeholderFallbackKeys: [] }
    };
  }
  if (!items.length) {
    return { slots: slotIdentities.slots, slotsCount: slots.length, matches: [], unmatchedFields: [], unusedSlots: slots.map(function (_, i) { return i; }), diagnostics: { candCount: 0, placeholderFallbackKeys: [] } };
  }

  const readRank = readingOrderRank(slots, canvasWidth);

  // 1) 强型候选判定：每 key 是否存在「非 placeholder」强型槽（label/type/exact）
  const strongByKey = {};
  items.forEach(function (it, fi) {
    if (strongByKey[it.key] !== undefined) return;
    let strong = false;
    for (let si = 0; si < slots.length; si += 1) {
      const sc = scoreCandidate(slots[si], it, readRank[si]);
      if ((sc.typeVal >= 1 && !sc.placeholder) || sc.label === 1 || sc.exact === 1) { strong = true; break; }
    }
    strongByKey[it.key] = strong;
  });

  // 2) 候选构建（typeGate 门禁）
  const cands = [];
  items.forEach(function (it, fi) {
    if (isBlank(it.text)) return;
    for (let si = 0; si < slots.length; si += 1) {
      const sc = scoreCandidate(slots[si], it, readRank[si]);
      // 门禁：exact / label / type 任一生效即进；placeholder 仅当该 key 无强型槽时兜底
      if (sc.exact === 1 || sc.label === 1 || sc.typeVal >= 1 || (sc.placeholder && strongByKey[it.key] !== true)) {
        // 无画布宽时双栏 colBucket 退化为阅读序，placeholder 兜底仍受 margin 保护
        cands.push({ fi: fi, si: si, key: it.key, conf: sc.conf, exact: sc.exact, label: sc.label, typeVal: sc.typeVal, placeholder: sc.placeholder, len: sc.len, readRank: readRank[si] });
      }
    }
  });

  // 3) 排序：conf 降序 → 字段序 → 槽位阅读序（稳定）
  cands.sort(function (a, b) {
    return (b.conf - a.conf) || (a.fi - b.fi) || (a.readRank - b.readRank) || (a.si - b.si);
  });

  // 4) 贪心唯一指派 + 相对边际（仅弱候选 —— placeholder/弱门槽 —— 防多字段竞争歧义；
  //    强类型（type/label/exact）候选按阅读序直接配对，同 key 兄弟槽属容量问题不触发边际）
  const boundField = {}, boundSlot = {};
  const assign = [];
  cands.forEach(function (c) {
    if (boundField[c.fi] || boundSlot[c.si]) return;
    if (c.conf < minConf) return;
    if (c.exact !== 1 && c.placeholder === true) {
      // 共享/空槽常被多字段竞争：若另一字段对该槽置信相近（< margin）→ 语义歧义 → 不硬绑
      let contested = false;
      for (let j = 0; j < cands.length; j += 1) {
        const d = cands[j];
        if (d === c || d.si !== c.si || d.fi === c.fi) continue;
        if (boundField[d.fi] || boundSlot[d.si]) continue;
        if (d.conf >= c.conf - margin) { contested = true; break; }
      }
      if (contested) return;
    }
    boundField[c.fi] = 1; boundSlot[c.si] = 1;
    assign.push(c);
  });

  // 5) 输出
  const matches = assign.map(function (c) {
    const it = items[c.fi], slot = slots[c.si];
    return {
      slotIdx: c.si, objectUuid: (slot && (slot.objectUuid || slot.uuid)) || null,
      fieldKey: it.key, label: it.label, text: it.text,
      confidence: Math.round(c.conf * 10000) / 10000,
      factors: ["exact=" + c.exact, "label=" + c.label, "type=" + c.typeVal, "len=" + c.len]
    };
  }).sort(function (a, b) { return a.slotIdx - b.slotIdx; });

  const unmatchedFields = [];
  items.forEach(function (it, fi) {
    if (boundField[fi]) return;
    if (isBlank(it.text)) { unmatchedFields.push({ fieldKey: it.key, label: it.label, text: it.text, reason: "EMPTY" }); return; }
    // 超出容量：候选槽（已过 typeGate）全部被占用 → NO_SLOT（超出未匹配）；
    // 仍有未绑定候选但置信不足/边际歧义 → LOW_CONFIDENT
    const remaining = cands.some(function (c) { return c.fi === fi && !boundSlot[c.si]; });
    unmatchedFields.push({ fieldKey: it.key, label: it.label, text: it.text, reason: remaining ? "LOW_CONFIDENT" : "NO_SLOT" });
  });
  const unusedSlots = [];
  slots.forEach(function (_, si) { if (!boundSlot[si]) unusedSlots.push(si); });

  return {
    slots: slotIdentities.slots, slotsCount: slots.length,
    matches: matches, unmatchedFields: unmatchedFields, unusedSlots: unusedSlots,
    diagnostics: { candCount: cands.length, strongByKey: strongByKey, placeholderFallbackKeys: ObjectsKeys(strongByKey).filter(function (k) { return strongByKey[k] === false; }) }
  };
}

function ObjectsKeys(obj) { return Object.keys ? Object.keys(obj) : (function () { const k = []; for (const x in obj) { if (Object.prototype.hasOwnProperty.call(obj, x)) k.push(x); } return k; })(); }

if (typeof module !== "undefined" && module.exports) module.exports = {
  planTemplateApply: planTemplateApply,
  buildFieldItems: buildFieldItems,
  scoreCandidate: scoreCandidate,
  typeRules: TYPE_RULES,
  MIN_CONFIDENCE: MIN_CONFIDENCE,
  MIN_MARGIN: MIN_MARGIN,
  FIELD_LABELS: FIELD_LABELS
};