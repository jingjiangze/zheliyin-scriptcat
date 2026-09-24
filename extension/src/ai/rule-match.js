// =====================================================================
// 折立印名片套版助手 - Local Rule Match（Stage 10-G Commit 08 增强）
// ---------------------------------------------------------------------
// 定位：AI 槽位匹配的本地规则匹配库 —— 无 API Key / AI 失败时回退，
//   也用于对 AI 结果做确定性二次证据（类型规则优先于文本相似）。
// 输入（与 AI 路径同源，TemplateSnapshot 契约）：
//   slotData: { side, items:[{slotId,text,left,top,width,height,fontSize,objectUuid,...}] }
//   rows:     客户原文行数组（原始行，不做任何内容变换）
// 输出（与 zyNormalizePlanShape / zyValidateTemplateMatchPlan 兼容）：
//   {
//     matches: [{ slotId, slotIdx, side, objectUuid, customerText, confidence, reason, factors }],
//     uncertain: [], unmatchedCustomer: [{text, reason}], unusedSlots: [], summary:{matched,...}, source:"LOCAL_RULE"
//   }
// 核心规则：
//   - 内容类型识别（phone-mobile/phone-landline/email/url/address/wechat/name/title/company/business/blank）：
//     槽位文本与客户行各推导 type + label；同类型为最强证据（typeScore=1），近似类型 0.7（mobile↔landline 不视为同型）。
//   - 客户行「标签：值」→ 值逐字保留（去标签仅用于分类，替换值 = 值原文）。
//   - 空槽（text 空白）不参与匹配；无对应槽的内容进 unmatched，绝不硬绑。
//   - 唯一绑定：一行至多一槽、一槽至多一行；冲突按 typeScore>textScore 顺序择优。
// 纯函数、自包含（无 require）；node 单测为真源；userscript/@require 以本文件为准。
// =====================================================================
"use strict";

function zyIsNum(v) { return typeof v === "number" && isFinite(v); }
function zyRTrim(s) { return String(s == null ? "" : s).replace(/[\s\u3000]+$/, ""); }
function zyClean(s) {
  return String(s == null ? "" : s).toLowerCase()
    .replace(/[\s\u3000\u00a0]+/g, "")
    .replace(/[·•．。，，、；》＇“”‘’（）【】［］《》：：-]/g, "");
}
function zyRawRows(rawText) {
  return String(rawText == null ? "" : rawText).split(/\r?\n/).map((x) => String(x).trim()).filter(Boolean);
}
// 剥离「标签：值」：取第一处冒号（中英文冒号均可）之前 ≤12 字符作 label；value=冒号后（逐字保留）
function zySplitLabel(text) {
  const t = String(text == null ? "" : text).trim();
  const m = /^(\S{0,12}?)[:：]/.exec(t);
  if (!m) return { label: null, value: t };
  const rest = t.slice(m[0].length).trim();
  if (!rest) return { label: null, value: t };
  return { label: m[1].trim(), value: rest };
}
// 内容类型识别（正则证据，顺序敏感）
function zyDetectType(text) {
  const raw = String(text == null ? "" : text).trim();
  const spl = zySplitLabel(raw);
  const value = spl.value;
  const label = spl.label || "";
  const hasAt = value.indexOf("@") >= 0;
  if (!value.trim()) return { type: "blank", label: label || null };
  // 微信：微信/wechat/weixin/wxid 词，且非邮箱
  if (/微信|wechat|weixin|wxid/i.test(raw) && !hasAt) return { type: "wechat", label: label || null };
  // 邮箱：@ 或 邮箱/mail/email 标签
  if (hasAt || /邮箱|mail|email/i.test(raw)) return { type: "email", label: label || null };
  // 手机号：连续数字串以 1[3-9] 开头且 11 位
  const nums = String(value).replace(/\D/g, "");
  if (/^1[3-9]\d{9}$/.test(nums)) return { type: "phone-mobile", label: label || null };
  // 座机：0 区号-号码 或 座机/固话/landline 标签
  if (/0\d{2,3}[- ]?\d{7,8}/.test(value) || /座机|固话|landline/i.test(raw)) return { type: "phone-landline", label: label || null };
  // 网址
  if (/www\./.test(value) || /https?:\/\//.test(value) || /网址|网站|web|url|homepage/i.test(raw)) return { type: "url", label: label || null };
  // 地址
  if (/省|市|区|县|街道|路|巷|大厦|楼|栋|室|工业园|产业园|开发区|门牌|号/.test(value) || /地址|add(ress)?/i.test(raw)) return { type: "address", label: label || null };
  // 公司
  if (/公司|集团|有限|股份|厂|贸易|科技|实业|有限公司/i.test(value) || /\b(co\.?|ltd|limited|company|trading|technology|group|inc)\b/i.test(value)) return { type: "company", label: label || null };
  // 职位
  if (/经理|总监|主管|负责人|顾问|设计师|工程师|合伙人|律师|主任|部长|销售|业务/i.test(value) || /\b(manager|director|engineer|consultant|designer|partner|boss)\b/i.test(value)) return { type: "title", label: label || null };
  // 姓名：1-4 个汉字纯文本
  if (/^[\u4e00-\u9fa5]{1,4}$/.test(value.trim())) return { type: "name", label: label || null };
  return { type: "other", label: label || null };
}
// 同类型判定：同型 1.0；「other」与任何型不匹配只有文本分
function zyTypeScore(typeA, typeB) {
  if (!typeA || !typeB) return 0;
  if (typeA === typeB) return 1;
  return 0;
}
// 客户行文本相似（供 tiebreak）：1=clean 相等；0.8=一方包含（长侧≥3）；否则重叠率
function zyTextScore(a, b) {
  const ka = zyClean(a), kb = zyClean(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  const longer = ka.length >= kb.length ? ka : kb;
  const shorter = ka.length >= kb.length ? kb : ka;
  if (shorter.length >= 3 && longer.indexOf(shorter) >= 0) return 0.8;
  const set = {}, hit = {};
  for (let i = 0; i < longer.length; i += 1) set[longer[i]] = 1;
  let hits = 0;
  for (let i = 0; i < shorter.length; i += 1) { if (set[shorter[i]]) hits += 1; }
  return hits / longer.length;
}
function zyLenScore(a, b) {
  const la = String(a == null ? "" : a).length, lb = String(b == null ? "" : b).length;
  const d = Math.abs(la - lb);
  if (d <= 1) return 1;
  if (d <= 4) return 0.6;
  if (d <= 8) return 0.3;
  return 0;
}
// 归一槽位 rank（自上而下 y 排序下标 0..M-1）
function zySlotRanks(slots) {
  const idx = slots.map((_, i) => i);
  idx.sort((a, b) => {
    const ya = zyIsNum(slots[a] && slots[a].top) ? slots[a].top : 9999;
    const yb = zyIsNum(slots[b] && slots[b].top) ? slots[b].top : 9999;
    return (ya - yb) || (a - b);
  });
  const rank = new Array(slots.length);
  idx.forEach((si, r) => { rank[si] = r; });
  return rank;
}
// 主入口：zyBuildLocalRuleMatch({ slotData, rows, side, opts })
function zyBuildLocalRuleMatch(input) {
  const o = input || {};
  const slotData = o.slotData || {};
  const items = (Array.isArray(o.slotData && o.slotData.items) && o.slotData.items) || [];
  const side = slotData.side || "front";
  const rawRows = Array.isArray(o.rows) ? o.rows.map((r) => String(r == null ? "" : r).trim()).filter(Boolean) : [];
  // 空槽（text 空白）不参与匹配
  const liveSlots = [];
  items.forEach((it, i) => {
    if (!String(it && it.text != null ? it.text : "").trim()) { liveSlots.push(null); return; }
    const det = zyDetectType(it.text);
    liveSlots.push({ it: it, idx: i, type: det.type });
  });
  const active = liveSlots.filter(Boolean);
  const ranks = zySlotRanks(items);
  const matches = [];
  const usedSlot = {};
  const usedText = {};
  const unmatched = [];
  // 客户行（value 保留逐字；label 参与类型）
  const rowsInfo = rawRows.map((r, i) => {
    const spl = zySplitLabel(r);
    const det = zyDetectType(spl.value);
    const typeV = det.type;
    const typeL = spl.label ? zyDetectType(spl.label).type : null;
    // 类型证据加权：强类型（phone/email/url/wechat）类型即证据；
    // 弱类型（address/company/name/title）需要文本佐证，避免仅凭类型硬绑（如 地址88号 vs 89号）
    const typeW = (typeV === "phone-mobile" || typeV === "phone-landline" || typeV === "email" || typeV === "url" || typeV === "wechat") ? 0.9
      : (typeV === "address") ? 0.45
      : (typeV === "company" || typeV === "name" || typeV === "title") ? 0.55
      : 0;
    return { i: i, raw: r, value: spl.value, typeV: typeV, typeL: typeL, typeW: typeW, isBlank: typeV === "blank" && typeL === "blank" };
  });
  // 候选评分：typeScore>0 → W_type*typeScore + W_appeasement；无类型 → 纯文本证据
  const cand = [];
  rowsInfo.forEach((r) => {
    if (r.isBlank) { unmatched.push({ rowIdx: r.i, text: r.raw, reason: "EMPTY_ROW" }); return; }
    let best = null;
    active.forEach((a) => {
      const ts = zyTypeScore(a.type, r.typeV);
      const xs = zyTextScore(r.value, a.it.text);
      const ls = zyLenScore(r.value, a.it.text);
      let total = 0;
      if (r.typeW > 0 && ts > 0) total = r.typeW * ts + 0.35 * xs + 0.03 * ls;
      else total = (ts > 0 ? 0.2 : 0) + 0.7 * xs + 0.05 * ls;
      if (!best || total > best.total) best = { slot: a, typeScore: ts, textScore: xs, lenScore: ls, total: total };
    });
    if (best && best.total >= 0.35) cand.push({ r: r, best: best });
    else unmatched.push({ rowIdx: r.i, text: r.raw, reason: best && best.total > 0 ? "BELOW_THRESHOLD(" + Math.round(best.total * 100) + ")" : "NO_MATCH" });
  });
  // 唯一绑定（按 total 降序贪心；已绑定跳过）
  cand.sort((x, y) => (y.best.total - x.best.total) || (x.r.i - y.r.i));
  const bind = [];
  cand.forEach((c) => {
    if (usedSlot[c.best.slot.idx] || usedText[zyClean(c.r.value)]) return;
    usedSlot[c.best.slot.idx] = 1;
    usedText[zyClean(c.r.value)] = 1;
    bind.push(c);
  });
  bind.forEach((b) => {
    const slotId = b.best.slot.it.slotId != null ? String(b.best.slot.it.slotId) : (side + "-" + (b.best.slot.idx + 1));
    matches.push({
      slotId: slotId, slotIdx: b.best.slot.idx, side: side, objectUuid: (b.best.slot.it && b.best.slot.it.objectUuid) || null,
      customerText: b.r.value, confidence: Math.round(b.best.total * 100) / 100,
      reason: "LOCAL_RULE typeScore=" + Math.round(b.best.typeScore * 100) + " textScore=" + Math.round(b.best.textScore * 100),
      factors: { typeScore: b.best.typeScore, textScore: b.best.textScore, lenScore: b.best.lenScore }
    });
  });
  const unusedSlots = [];
  items.forEach((_, i) => { if (usedSlot[i]) return; unusedSlots.push(i); });
  return {
    side: side, slotCount: items.length, source: "LOCAL_RULE",
    matches: matches, uncertain: [], unmatchedCustomer: unmatched,
    unusedSlots: unusedSlots,
    summary: { matched: matches.length, uncertain: 0, unmatched: unmatched.length, errors: 0 },
    diagnostics: { ranks: ranks, slotTypes: active.map((a) => ({ idx: a.idx, type: a.type, text: String(a.it.text).slice(0, 24) })) }
  };
}
// 推断模板槽位类型（供本地规则库对 AI 结果的二次证据）
function zySlotTypeOf(text) {
  return zyDetectType(text);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    zyDetectType: zyDetectType,
    zyTypeScore: zyTypeScore,
    zyTextScore: zyTextScore,
    zyLenScore: zyLenScore,
    zySplitLabel: zySplitLabel,
    zyBuildLocalRuleMatch: zyBuildLocalRuleMatch,
    zySlotTypeOf: zySlotTypeOf
  };
}