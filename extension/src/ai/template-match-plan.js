// =====================================================================
// 折立印名片套版助手 - AI Template Match Plan（Stage 10-G L 阶 Commit 02）
// ---------------------------------------------------------------------
// 定位：把「Template Snapshot + 客户原始文本」翻译成 AI 槽位匹配请求，
//   并把 AI 回答解析成结构化的 Match Plan。
// 协议（与 validator 配合，Commit 03 接线一键智能填充）：
//   输入 templateSnapshot(from getTextInventoryAll L 阶协议) + customerRawText，
//   输出 AI messages（system=槽位匹配器, user=序列化输入）；
//   AI 严格返回 JSON：{ matches:[{slotId,customerText,confidence,reason}],
//     unmatchedCustomer:[{text,reason}], uncertain:[{slotId,candidates,reason}],
//     unusedSlots, warnings }。
// 铁律（写进 system prompt，validator 再本地硬校验）：
//   - customerText 必须从客户原文逐字复制，禁止改写/纠错/格式化/翻译/补全；
//   - 只填真实存在的 slotId；front 只匹配 front、back 只匹配 back；
//   - 一个 slot 一条、一条客户内容一个 slot；不确定 → unmatched/uncertain，绝不硬猜。
// 纯函数、自包含（无 require）。
// =====================================================================
"use strict";

function zyTemplateMatchSystemPrompt() {
  return [
    "你是名片设计模板匹配器，只负责把客户原文中的信息匹配到当前模板已有的文字图层（槽位）。",
    "",
    "输入：",
    "1. template.front：设计画布正面全部文字图层（含 slotId/text/layerNum 等信息）",
    "2. template.back：设计画布反面全部文字图层（可能有，可能缺省）",
    "3. customer.rawText：客户原始资料文本",
    "",
    "任务：把客户原文中的信息匹配到模板槽位，返回每个槽位应替换成哪一条客户原文。",
    "",
    "规则（必须全部遵守）：",
    "1. 只允许选择真实存在的 slotId。",
    "2. customerText 必须从客户原文逐字复制，不得改写、纠错、格式化、翻译、补全、拼接客户文字。",
    "3. 不得创建新内容；不得凭空造一条客户文本。",
    "4. 不得修改模板图层的字体、字号、颜色、位置或样式——你不输出任何样式字段。",
    "5. front 槽位只能匹配正面内容，back 槽位只能匹配反面内容。",
    "6. 一个 slot 只能对应一条客户内容。",
    "7. 一条客户内容只能对应一个 slot。",
    "8. 优先按语义和内容类型匹配（如 手机/电话/Tel/Mobile 是同类；合伙人/Partner 相关），其次文本相似度。",
    "9. 对明显不确定的匹配返回到 uncertain（给出候选），绝不强行猜测；模板没有对应内容的返回 unmatchedCustomer。",
    "10. 返回严格 JSON，不要输出 JSON 以外的任何文字。",
    "",
    "返回 JSON 结构：",
    '{ "matches": [ { "slotId": "front-1", "customerText": "客户原文中的某一行内容", "confidence": 0.95, "reason": "简短理由" } ],',
    '  "unmatchedCustomer": [ { "text": "客户原文中无法匹配的行", "reason": "原因" } ],',
    '  "uncertain": [ { "slotId": "front-3", "candidates": ["候选1", "候选2"], "reason": "原因" } ],',
    '  "unusedSlots": [ "front-5" ],',
    '  "warnings": [] }'
  ].join("\n");
}

// 把快照与客户原文序列化为 AI user 输入（只含判断所需的字段，节token）
function zySnapshotToAiInput(snapshot) {
  const s = snapshot || {};
  const sideObj = (sd, items) => {
    return {
      exists: !!(sd === "front" ? (s.front && s.front.exists) : (s.back && s.back.exists)),
      items: (items || []).map((it) => ({
        slotId: it && it.slotId != null ? it.slotId : null,
        text: it && it.text != null ? String(it.text) : "",
        layerNum: it && it.layerNum != null ? it.layerNum : null,
        fontSize: it && it.fontSize != null ? it.fontSize : null
      }))
    };
  };
  return JSON.stringify({
    template: {
      front: sideObj("front", s.front && s.front.items),
      back: sideObj("back", s.back && s.back.items)
    },
    customer: { rawText: String((s.customerRawText) != null ? s.customerRawText : "") }
  }, null, 1);
}

// 构建 OpenAI 兼容 messages（system + user）；供 Commit 03 aiRequest 使用
function zyBuildTemplateMatchMessages(input) {
  const o = input || {};
  return [
    { role: "system", content: zyTemplateMatchSystemPrompt() },
    { role: "user", content: zySnapshotToAiInput({ front: o.front, back: o.back, customerRawText: o.customerRawText }) }
  ];
}

// 从 AI 回复文本中提取 JSON 对象（容忍 markdown 代码块与前后杂讯）
function zyExtractPlanJson(text) {
  const t = String(text == null ? "" : text);
  if (!t.trim()) return { ok: false, error: "EMPTY_AI_RESPONSE" };
  let candidate = null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
  if (fenced) candidate = fenced[1];
  else {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) candidate = t.slice(start, end + 1);
  }
  if (!candidate) return { ok: false, error: "NO_JSON_FOUND" };
  try {
    const obj = JSON.parse(candidate);
    return { ok: true, plan: obj };
  } catch (e) {
    return { ok: false, error: "INVALID_JSON: " + String(e && e.message ? e.message : e) };
  }
}

// 归一化 Match Plan 顶层结构（matches/unmatchedCustomer/uncertain/unusedSlots/warnings 一律数组）
function zyNormalizePlanShape(plan) {
  const p = plan || {};
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    matches: arr(p.matches),
    unmatchedCustomer: arr(p.unmatchedCustomer),
    uncertain: arr(p.uncertain),
    unusedSlots: arr(p.unusedSlots),
    warnings: arr(p.warnings)
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    zyTemplateMatchSystemPrompt: zyTemplateMatchSystemPrompt,
    zySnapshotToAiInput: zySnapshotToAiInput,
    zyBuildTemplateMatchMessages: zyBuildTemplateMatchMessages,
    zyExtractPlanJson: zyExtractPlanJson,
    zyNormalizePlanShape: zyNormalizePlanShape
  };
}