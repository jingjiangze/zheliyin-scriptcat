// =====================================================================
// 折立印名片套版助手 - AI Template Match Plan（Stage 10-G L 阶 M2：AI Match Prompt V2）
// ---------------------------------------------------------------------
// 定位：把「Template Snapshot + 客户原始文本」翻译成 AI 槽位匹配请求，
//   并把 AI 回答解析成结构化的两层 Match Plan。
//
// V2 协议（两层，取代 V1 的「AI 直接返回 customerText」）：
//   AI 先拆块、再按 blockId 匹配；最终 customerText 由本地从 blockId 回填，
//   模型不直接决定写入画布的文字来源。
//
//   输入（user，单面）：{ template: { side, slots:[{slotId,templateText,fontSize,layerNum}] },
//                        customer: { side, lines:[{lineNo,text}] } }
//   AI 输出（严格 JSON）：
//     { customerBlocks: [{ blockId, lineNo, text, type }],
//       matches:        [{ slotId, blockId, confidence, reason }],
//       unmatchedBlockIds: [], uncertain: [{ slotId, blockIds, reason }],
//       unusedSlots: [], warnings: [] }
//
// 为什么分面调用（真机 46q 定位结论，2026-09-24）：
//   V1 单次调用同时给「正面槽+反面槽」与整段客户原文，并把「正/反面分段判定」交给模型。
//   真机 3/3 轮 back 槽 0 匹配、AI 原始返回 unmatchedCustomer 为空 → 反面内容被静默丢弃。
//   随后逐项排除：极简 prompt 可 7/7（模型看得见 back）；但
//     - 补规则 / 置顶分步指令 / 改 back 输入说明 / JSON 示例加 back → 仍 4/7
//     - payload 瘦身（1183→1127 prompt tokens）→ 仍 4/7
//     - max_tokens 4096 → 仍 356 completion tokens、finish=stop（非截断）
//   即：Qwen2.5-7B 在「单次调用处理两面 + 两层输出」下确定性只处理第一面。
//   → V2 改为「按面调用」：每次只给该面的槽位与该面的客户行（side 由本地确定性判定），
//     结构上不存在「整面跳过」与「串面」的空间；实测 front 4/4 + back 3/3 = 7/7 全中。
//
// 铁律（写进 system prompt，validator 再本地硬校验）：
//   - block.text 必须逐字来自其 lineNo 对应客户行，禁止改写/纠错/格式化/翻译/补全/拼接；
//   - 一槽至多一块、一块至多一槽；
//   - 所有块都必须交代（matches / unmatchedBlockIds / uncertain 之一），严禁漏块；
//   - 空文字层（templateText 为空白）不得匹配；模板无对应槽的内容不得硬塞；
//   - 标签约定随模板：模板槽位带「标签：」则替换值保留同标签，模板无标签则只填值部分。
//
// 纯函数、自包含（无 require）；node 单测为真源。
// =====================================================================
"use strict";

// 正/反面标记行（单独成行；可选中文冒号）
const ZY_SIDE_MARKER_FRONT = /^正面[:：]?$/;
const ZY_SIDE_MARKER_BACK = /^(反面|背面)[:：]?$/;

// 本地确定性分段：把客户原文切成带 side 的行（side 是本地真值，不交给模型判断）
// 返回 [{ lineNo, text, side, marker }]；lineNo 为 1 基序号（含标记行，便于与 AI 的 lineNo 对齐）
// 无任何标记时全部视为 front。
function zySplitCustomerLines(rawText) {
  const out = [];
  let side = "front";
  let no = 0;
  String(rawText == null ? "" : rawText).split(/\r?\n/).forEach((ln) => {
    const t = String(ln == null ? "" : ln).trim();
    if (!t) return;
    no += 1;
    if (ZY_SIDE_MARKER_FRONT.test(t)) { side = "front"; out.push({ lineNo: no, text: t, side: side, marker: true }); return; }
    if (ZY_SIDE_MARKER_BACK.test(t)) { side = "back"; out.push({ lineNo: no, text: t, side: side, marker: true }); return; }
    out.push({ lineNo: no, text: t, side: side, marker: false });
  });
  return out;
}

// 仅内容行（标记行不交给 AI，避免模型为标记行造块）
function zyCustomerContentLines(rawText) {
  return zySplitCustomerLines(rawText).filter((l) => !l.marker);
}

// 某一面的内容行（分面调用的输入）
function zySideLines(rawText, side) {
  return zyCustomerContentLines(rawText).filter((l) => l.side === side);
}

function zyNumOrNull(v) { return (typeof v === "number" && isFinite(v)) ? v : null; }
function zyRound2(v) { return typeof v === "number" && isFinite(v) ? Math.round(v * 100) / 100 : null; }

// 槽位上下文（AI 判断语义角色所需：模板原文字 + 字号 + 层序 + 位置/尺寸）
function zySlotContextOf(item, i, side) {
  const it = item || {};
  return {
    slotId: it.slotId != null ? String(it.slotId) : (side + "-" + (i + 1)),
    templateText: it.text != null ? String(it.text) : "",
    fontSize: zyNumOrNull(it.fontSize),
    layerNum: zyNumOrNull(it.layerNum),
    x: zyRound2(zyNumOrNull(it.left)),
    y: zyRound2(zyNumOrNull(it.top)),
    w: zyRound2(zyNumOrNull(it.width)),
    h: zyRound2(zyNumOrNull(it.height))
  };
}

// 某一面的槽位上下文数组
function zySideSlots(section, side) {
  const items = (section && Array.isArray(section.items)) ? section.items : [];
  return items.map((it, i) => zySlotContextOf(it, i, side));
}

// 单面 system prompt（含标签约定与完整性铁律）
function zyTemplateMatchSidePrompt(side) {
  const isFront = side !== "back";
  const self = isFront ? "正面" : "反面";
  const other = isFront ? "反面" : "正面";
  return [
    "你是名片设计模板匹配器。本次任务只处理【" + self + "】，三步都要做完。",
    "",
    "输入：",
    "1. template.slots：本面模板已有的文字图层。字段 slotId（形如 " + side + "-N）、",
    "   templateText（模板原文字）、fontSize、layerNum、x/y（左上坐标）、w/h（尺寸）。",
    "2. customer.lines：本面客户资料行。字段 lineNo、text。",
    "   其它面（" + other + "）的内容不在本次输入中，不要臆测、不要输出。",
    "",
    "第一步 · 拆块：把 customer.lines 拆成原子信息块（一行通常一块；一行含多条信息才拆多块）。",
    "  每块输出 { blockId, lineNo, text, type }。text 必须逐字来自该 lineNo 的行，",
    "  不得改写、纠错、格式化、翻译、补全、拼接；不得凭空造块。",
    "",
    "第二步 · 匹配：把块匹配到 template.slots 的槽位，输出 { slotId, blockId, confidence, reason }。",
    "  一槽至多一块，一块至多一槽。优先按语义与内容类型匹配，其次文本相似度。",
    "  模板文字可能没有标签（裸人名/裸电话），按内容类型判断。",
    "  标签约定随模板：模板槽位 templateText 带「标签：」（如「电话：」）时，替换值也带上同样的标签；",
    "  模板槽位没有标签时，只填值部分（如「13800138000」而不是「电话：13800138000」）。",
    "",
    "第三步 · 交代：所有块都必须出现在 matches 或 unmatchedBlockIds 或 uncertain 中。",
    "  严禁漏掉任何一块（漏块视为错误输出）。",
    "",
    "类型（type 取值）：name/title/company/phone/landline/email/url/address/wechat/business/other。",
    "手机 = 1[3-9] 开头 11 位；座机 = 0 开头区号-号码。",
    "",
    "其他硬规则：",
    "1. templateText 为空白/空格的槽位是占位/装饰，不得匹配。",
    "2. 模板没有对应槽的客户内容 → 放进 unmatchedBlockIds，绝不塞进其它槽。",
    "3. 明显不确定 → 放进 uncertain（给出 blockIds），绝不硬猜。",
    "4. 不输出任何样式字段；不得修改模板字体、字号、颜色、位置、层序。",
    "5. 只返回严格 JSON，不要输出 JSON 以外的任何文字。",
    "",
    "返回 JSON 结构：",
    '{"customerBlocks":[{"blockId":"c-1","lineNo":1,"text":"客户原文逐字","type":"name"}],',
    ' "matches":[{"slotId":"' + side + '-1","blockId":"c-1","confidence":0.95,"reason":"简短理由"}],',
    ' "unmatchedBlockIds":["c-5"],',
    ' "uncertain":[{"slotId":"' + side + '-2","blockIds":["c-6"],"reason":"理由"}],',
    ' "unusedSlots":["' + side + '-4"],',
    ' "warnings":[]}'
  ].join("\n");
}

// 单面 user 输入（槽位上下文 + 该面客户行）
function zySnapshotToAiInput(input) {
  const o = input || {};
  const side = o.side === "back" ? "back" : "front";
  return JSON.stringify({
    template: { side: side, slots: zySideSlots(o.section, side) },
    customer: { side: side, lines: zySideLines(o.customerRawText, side).map((l) => ({ lineNo: l.lineNo, text: l.text })) }
  }, null, 1);
}

// 单面 messages（system + user）
function zyBuildTemplateMatchMessages(input) {
  const o = input || {};
  const side = o.side === "back" ? "back" : "front";
  return [
    { role: "system", content: zyTemplateMatchSidePrompt(side) },
    { role: "user", content: zySnapshotToAiInput({ side: side, section: o.section, customerRawText: o.customerRawText }) }
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

// 归一化 V2 Match Plan 顶层结构（一律数组）
function zyNormalizePlanShape(plan) {
  const p = plan || {};
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    customerBlocks: arr(p.customerBlocks),
    matches: arr(p.matches),
    unmatchedBlockIds: arr(p.unmatchedBlockIds),
    uncertain: arr(p.uncertain),
    unusedSlots: arr(p.unusedSlots),
    warnings: arr(p.warnings)
  };
}

// 合并多面 refined matches（front 组在前、组内 slotIdx 升序；确定性输出）
function zyMergeSideMatches(groups) {
  const out = [];
  (Array.isArray(groups) ? groups : []).forEach((g) => {
    (Array.isArray(g) ? g : []).forEach((m) => out.push(m));
  });
  out.sort(function (a, b) {
    if (a.side === b.side) return (a.slotIdx || 0) - (b.slotIdx || 0);
    return a.side === "front" ? -1 : 1;
  });
  return out;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    zySplitCustomerLines: zySplitCustomerLines,
    zyCustomerContentLines: zyCustomerContentLines,
    zySideLines: zySideLines,
    zySlotContextOf: zySlotContextOf,
    zySideSlots: zySideSlots,
    zyTemplateMatchSidePrompt: zyTemplateMatchSidePrompt,
    zySnapshotToAiInput: zySnapshotToAiInput,
    zyBuildTemplateMatchMessages: zyBuildTemplateMatchMessages,
    zyExtractPlanJson: zyExtractPlanJson,
    zyNormalizePlanShape: zyNormalizePlanShape,
    zyMergeSideMatches: zyMergeSideMatches
  };
}
