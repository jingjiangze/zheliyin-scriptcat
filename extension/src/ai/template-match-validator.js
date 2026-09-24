// =====================================================================
// 折立印名片套版助手 - Template Match Validator（Stage 10-G L 阶 M3：Match Validator V2）
// ---------------------------------------------------------------------
// 职责：AI 返回的两层 Match Plan 绝不能直接执行 —— 先做本地硬校验：
//
//   一、Schema 与逐字
//     1. customerBlocks：blockId 必填唯一；lineNo 必须命中客户原文行且非标记行；
//        block.text 必须逐字来自该行（zyVerbatimTraceable）。
//     2. matches：slotId 必须真实存在；blockId 必须真实存在。
//   二、侧向硬门禁（side isolation）
//     3. block 的 side 来自本地分段真值；必须与槽位 side 一致（front-N 只配 front 块）。
//        串面 → SIDE_MISMATCH 硬错误（V1 仅靠 AI 自守，真机 46q 证明会整面跳过/串面）。
//   三、一对一（Global assignment）
//     4. 一槽至多一块、一块至多一槽（双向去重）。
//   四、语义类型一致性（AI/local agreement）
//     5. 用本地类型检测（typeDetector 注入）对 block.text 判型，与 AI 的 type 比对：
//        强类型（phone/landline/email/url/wechat）冲突 → 移入 uncertain（不填）；
//        弱类型冲突 → warning + semanticVerified=false；本地判型为 other/未知 → 不判。
//   五、完整性（Completeness）
//     6. 每个块都必须交代：matched 一次 / 在 unmatchedBlockIds / 在 uncertain 中；
//        未交代 → 显式进 unmatchedCustomer（reason=NOT_ACCOUNTED_BY_AI）+ warning + 计数，
//        严禁静默丢弃（V1 真机表现为「未匹配 0 项」但实际丢了 3 行）。
//   六、值来源（blockId 回填）
//     7. refined.customerText 一律取 block.text，模型在 match 里给的任何文本一律忽略。
//
// 输出 refined plan（matches 形状与 template-apply-v2 的 zyBuildApplyCommandPlan 完全兼容）：
//   matches: [{ slotId, slotIdx, side, objectUuid, customerText, confidence, reason,
//               blockId, blockType, semanticVerified }]
//   ok = errors.length === 0
//
// 纯函数、自包含（无 require）；typeDetector 由调用方注入（userscript 传 zyDetectType）。
// 内部分段函数与 template-match-plan.js 的 zySplitCustomerLines 同语义（页面/沙箱同 scope 下
// 以 plan 模块为真源；此处内联仅为保持本模块自包含可单测）。
// =====================================================================
"use strict";

function zyIsNum(v) { return typeof v === "number" && isFinite(v); }
function zyCleanLine(s) { return String(s == null ? "" : s).replace(/\s+/g, "").toLowerCase(); }
function zyRawLines(rawText) {
  return String(rawText == null ? "" : rawText).split(/\r?\n/).map((x) => String(x).trim()).filter(Boolean);
}
// 逐字可追溯：customerText 必须被某一原始行包含（cleaned 后），且非空
function zyVerbatimTraceable(customerText, rawLines) {
  const ct = String(customerText == null ? "" : customerText);
  if (!ct.trim()) return false;
  const cclean = zyCleanLine(ct);
  if (!cclean) return false;
  for (let i = 0; i < rawLines.length; i += 1) {
    const lineClean = zyCleanLine(rawLines[i]);
    if (lineClean && lineClean.indexOf(cclean) >= 0) return true;
  }
  return false;
}

// 本地确定性分段（与 template-match-plan.js zySplitCustomerLines 同语义）
function zySplitLinesLocal(rawText) {
  const out = [];
  let side = "front";
  let no = 0;
  String(rawText == null ? "" : rawText).split(/\r?\n/).forEach((ln) => {
    const t = String(ln == null ? "" : ln).trim();
    if (!t) return;
    no += 1;
    if (/^正面[:：]?$/.test(t)) { side = "front"; out.push({ lineNo: no, text: t, side: side, marker: true }); return; }
    if (/^(反面|背面)[:：]?$/.test(t)) { side = "back"; out.push({ lineNo: no, text: t, side: side, marker: true }); return; }
    out.push({ lineNo: no, text: t, side: side, marker: false });
  });
  return out;
}

// 从 TemplateSnapshot 构建 { slotId -> { side, index, objectUuid, text } }
function zySlotIndexFromSnapshot(snapshot) {
  const map = {};
  const s = snapshot || {};
  ["front", "back"].forEach((side) => {
    const sec = s[side];
    const items = (sec && sec.items) || [];
    items.forEach((it, i) => {
      const id = it && it.slotId != null ? it.slotId : (side + "-" + (i + 1));
      map[id] = { side: side, index: i, objectUuid: it && it.objectUuid != null ? it.objectUuid : null, text: it && it.text != null ? String(it.text) : "" };
    });
  });
  return map;
}

// 类型归一（AI 侧与本地侧取值口径对齐）
// 「phone」等泛化写法单独归一为 phone-generic：与 手机/座机 属同一族，不得判为强冲突
function zyTypeCanon(t) {
  const s = String(t == null ? "" : t).trim().toLowerCase();
  if (s === "phone" || s === "tel" || s === "telephone" || s === "电话") return "phone-generic";
  if (s === "phone-mobile" || s === "mobile" || s === "手机") return "phone-mobile";
  if (s === "phone-landline" || s === "landline" || s === "座机" || s === "固话") return "phone-landline";
  if (s === "url" || s === "web" || s === "website" || s === "网址") return "url";
  if (s === "email" || s === "mail" || s === "邮箱") return "email";
  if (s === "wechat" || s === "weixin" || s === "微信") return "wechat";
  return s || "other";
}
// 类型族：强类型按族归并（手机/座机/泛化电话同属 phone 族）
function zyTypeFamily(t) {
  const c = zyTypeCanon(t);
  if (c === "phone-generic" || c === "phone-mobile" || c === "phone-landline") return "phone";
  if (c === "email" || c === "url" || c === "wechat") return c;
  return null;
}
// 语义一致性：同一归一值 或 同族 → 一致
function zyTypeAgreeOf(aiType, localType) {
  if (zyTypeCanon(aiType) === zyTypeCanon(localType)) return true;
  const fa = zyTypeFamily(aiType);
  const fl = zyTypeFamily(localType);
  return !!(fa && fl && fa === fl);
}
// 强冲突：至少一侧为强类型族，且两族不同（同族差异如 手机↔泛化电话 只算弱提示）
function zyIsStrongConflict(aiType, localType) {
  const fa = zyTypeFamily(aiType);
  const fl = zyTypeFamily(localType);
  if (!fa && !fl) return false;
  return fa !== fl;
}
const ZY_STRONG_TYPES = { "phone-generic": 1, "phone-mobile": 1, "phone-landline": 1, email: 1, url: 1, wechat: 1 };

// 「标签：值」拆分（与 rule-match.js zySplitLabel 同语义；本模块自包含内联镜像）
function zyLabelSplit(text) {
  const s = String(text == null ? "" : text).trim();
  const m = /^(\S{0,12}?)[:：]/.exec(s);
  if (!m) return { label: null, value: s };
  const rest = s.slice(m[0].length).trim();
  if (!rest) return { label: null, value: s };
  return { label: m[1].trim(), value: rest };
}
// 标签规范化：最终写入画布的文字必须遵循「模板的标签约定」
//   - 模板槽位带标签：客户自带标签 → 保留客户写法；客户无标签 → 用模板标签补前缀
//   - 模板槽位无标签：客户带标签 → 去标签只留值；客户无标签 → 原样
// 返回 { text, mode }，mode ∈ keep|prepend|strip|none（供审计追溯）
function zyNormalizeLabeledText(templateText, customerText) {
  const tpl = zyLabelSplit(templateText);
  const cus = zyLabelSplit(customerText);
  const tplHas = !!(tpl.label && tpl.label.length);
  const cusHas = !!(cus.label && cus.label.length);
  if (tplHas) {
    if (cusHas) return { text: String(customerText), mode: "keep" };
    return { text: tpl.label + "：" + cus.value, mode: "prepend" };
  }
  if (cusHas) return { text: cus.value, mode: "strip" };
  return { text: String(customerText), mode: "none" };
}

// 主入口：V2 硬校验
// input: { plan, snapshot, rawText, minConfidence?, typeDetector?, lines?, expectSide? }
//   expectSide：分面调用时传入本次请求的面（"front"/"back"）；
//   任何块/槽位越出该面 → SIDE_OUT_OF_SCOPE 硬错误（结构性防串面）。
function zyValidateTemplateMatchPlan(input) {
  const o = input || {};
  const plan = o.plan || {};
  const snapshot = o.snapshot || {};
  const minConfidence = zyIsNum(o.minConfidence) ? o.minConfidence : 0.5;
  const typeDetector = (typeof o.typeDetector === "function") ? o.typeDetector : null;
  const expectSide = (o.expectSide === "back" || o.expectSide === "front") ? o.expectSide : null;
  const allLines = Array.isArray(o.lines) ? o.lines : zySplitLinesLocal(o.rawText);
  const lineMap = {};
  allLines.forEach((l) => { lineMap[Number(l.lineNo)] = l; });

  const slotIndex = zySlotIndexFromSnapshot(snapshot);
  const blocksIn = Array.isArray(plan.customerBlocks) ? plan.customerBlocks : [];
  const matchesIn = Array.isArray(plan.matches) ? plan.matches : [];
  const uncertainIn = Array.isArray(plan.uncertain) ? plan.uncertain : [];
  const unmatchedIdsIn = Array.isArray(plan.unmatchedBlockIds) ? plan.unmatchedBlockIds : [];

  const warnings = [];
  const errors = [];

  // ---- 1) customerBlocks：schema + 逐字 + 本地判型 ----
  const blocks = {};
  const blockOrder = [];
  blocksIn.forEach((b, i) => {
    const blockId = b && b.blockId != null ? String(b.blockId) : null;
    const text = b && b.text != null ? String(b.text) : "";
    const aiType = b && b.type != null ? String(b.type) : null;
    if (!blockId) { errors.push("B[" + i + "] MISSING_BLOCK_ID"); return; }
    if (blocks[blockId]) { errors.push("B[" + i + "] DUPLICATE_BLOCK_ID[" + blockId + "]"); return; }
    const lineNo = b && b.lineNo != null ? Number(b.lineNo) : NaN;
    const line = lineMap[lineNo];
    if (!line) { errors.push("B[" + i + "] UNKNOWN_LINE[" + String(b && b.lineNo) + "]"); return; }
    if (line.marker) { errors.push("B[" + i + "] MARKER_LINE[" + blockId + "]"); return; }
    if (expectSide && line.side !== expectSide) { errors.push("B[" + i + "] SIDE_OUT_OF_SCOPE[" + blockId + "] lineSide=" + line.side + " expect=" + expectSide + "]"); return; }
    if (!text.trim()) { errors.push("B[" + i + "] EMPTY_BLOCK_TEXT[" + blockId + "]"); return; }
    if (!zyVerbatimTraceable(text, [line.text])) { errors.push("B[" + i + "] NOT_VERBATIM[" + blockId + "] " + text.slice(0, 16) + " not in line " + lineNo); return; }
    const localDet = typeDetector ? typeDetector(text) : null;
    const localType = localDet && localDet.type ? String(localDet.type) : null;
    let typeAgree = null;
    if (aiType && localType && localType !== "other") typeAgree = zyTypeAgreeOf(aiType, localType);
    const rec = { blockId: blockId, lineNo: lineNo, side: line.side, text: text, aiType: aiType, localType: localType, typeAgree: typeAgree, matched: false, accounted: false };
    blocks[blockId] = rec;
    blockOrder.push(blockId);
  });

  // ---- 2) matches：存在性 + 一对一 + 侧向硬门禁 + 语义 + 值回填 ----
  const refined = [];
  const uncertain = [];
  const usedSlots = {};
  const usedBlocks = {};
  matchesIn.forEach((m, i) => {
    const slotId = m && m.slotId != null ? String(m.slotId) : null;
    const blockId = m && m.blockId != null ? String(m.blockId) : null;
    const confidence = zyIsNum(m && m.confidence) ? m.confidence : 1;
    const reason = m && m.reason != null ? String(m.reason) : "";
    const slot = slotId ? slotIndex[slotId] : null;
    if (!slot) { errors.push("M[" + i + "] UNKNOWN_SLOT[" + String(slotId || "") + "]"); return; }
    const block = blockId ? blocks[blockId] : null;
    if (!block) { errors.push("M[" + i + "] UNKNOWN_BLOCK[" + String(blockId || "") + "]"); return; }
    if (usedSlots[slotId]) { errors.push("M[" + i + "] SLOT_DUPLICATE[" + slotId + "]"); return; }
    if (usedBlocks[blockId]) { errors.push("M[" + i + "] BLOCK_DUPLICATE[" + blockId + "]"); return; }
    // 侧向硬门禁：本地分段真值 vs 槽位面
    if (block.side !== slot.side) {
      errors.push("M[" + i + "] SIDE_MISMATCH[" + slotId + " slotSide=" + slot.side + " blockSide=" + block.side + " block=" + blockId + "]");
      return;
    }
    // 空槽（占位/装饰）不得匹配
    if (!String(slot.text || "").trim()) { errors.push("M[" + i + "] EMPTY_SLOT[" + slotId + "]"); return; }
    usedSlots[slotId] = true;
    usedBlocks[blockId] = true;
    block.matched = true;
    block.accounted = true;
    // 语义冲突
    let semanticVerified = (block.typeAgree === true);
    if (block.typeAgree === false) {
      // 强冲突：至少一侧为强类型族且两族不同（同族差异如 手机↔泛化电话 只算弱提示，避免误杀）
      const strong = zyIsStrongConflict(block.aiType, block.localType);
      if (strong) {
        uncertain.push({ slotId: slotId, blockIds: [blockId], candidates: [block.text], reason: "SEMANTIC_CONFLICT ai=" + String(block.aiType) + " local=" + String(block.localType) + " (" + reason + ")" });
        warnings.push("M[" + i + "] SEMANTIC_CONFLICT_STRONG[" + slotId + "] moved to uncertain (ai=" + String(block.aiType) + " local=" + String(block.localType) + ")");
        usedSlots[slotId] = false; usedBlocks[blockId] = false;
        block.matched = false; block.accounted = true;
        return;
      }
      warnings.push("M[" + i + "] SEMANTIC_CONFLICT_WEAK[" + slotId + "] ai=" + String(block.aiType) + " local=" + String(block.localType));
    }
    // 置信门禁
    if (confidence < minConfidence) {
      uncertain.push({ slotId: slotId, blockIds: [blockId], candidates: [block.text], reason: "confidence " + confidence + " < " + minConfidence + " (" + reason + ")" });
      warnings.push("M[" + i + "] LOW_CONFIDENCE_SLOT[" + slotId + "] moved to uncertain");
      usedSlots[slotId] = false; usedBlocks[blockId] = false;
      block.matched = false;
      return;
    }
    // 值来源 = blockId 回填（忽略 AI 在 match 里给的任何文本）+ 标签规范化（随模板标签约定）
    const normed = zyNormalizeLabeledText(slot.text, block.text);
    refined.push({
      slotId: slotId, slotIdx: slot.index, side: slot.side, objectUuid: slot.objectUuid,
      customerText: normed.text, confidence: confidence, reason: reason,
      blockId: blockId, blockType: block.aiType || block.localType || null, semanticVerified: semanticVerified,
      labelMode: normed.mode
    });
  });

  // ---- 3) uncertain 透传（slotId 必须存在；blockIds 解析为真实块） ----
  uncertainIn.forEach((u, i) => {
    const slotId = u && u.slotId != null ? String(u.slotId) : null;
    if (!slotIndex[slotId]) { errors.push("U[" + i + "] UNKNOWN_SLOT[" + String(slotId || "") + "]"); return; }
    const ids = Array.isArray(u && u.blockIds) ? u.blockIds.map((x) => String(x)) : [];
    const candidates = [];
    ids.forEach((bid) => {
      const b = blocks[bid];
      if (!b) { warnings.push("U[" + i + "] UNKNOWN_BLOCK[" + bid + "]"); return; }
      b.accounted = true;
      candidates.push(b.text);
    });
    uncertain.push({ slotId: slotId, blockIds: ids, candidates: candidates, reason: (u && u.reason != null ? String(u.reason) : "") || "uncertain" });
  });

  // ---- 4) unmatchedBlockIds 透传 + 完整性（严禁静默丢弃） ----
  const unmatchedCustomer = [];
  unmatchedIdsIn.forEach((rawId) => {
    const bid = String(rawId);
    const b = blocks[bid];
    if (!b) { warnings.push("UNMATCHED UNKNOWN_BLOCK[" + bid + "]"); return; }
    if (b.matched) { warnings.push("UNMATCHED ALREADY_MATCHED[" + bid + "]"); return; }
    b.accounted = true;
    unmatchedCustomer.push({ blockId: bid, text: b.text, reason: "AI 判定无对应槽" });
  });
  let unaccounted = 0;
  blockOrder.forEach((bid) => {
    const b = blocks[bid];
    if (b.accounted) return;
    unaccounted += 1;
    unmatchedCustomer.push({ blockId: bid, text: b.text, reason: "NOT_ACCOUNTED_BY_AI" });
    warnings.push("COMPLETENESS BLOCK_NOT_ACCOUNTED[" + bid + "] lineNo=" + b.lineNo + " → 显式列为未匹配");
  });

  const semanticallyVerified = refined.filter((m) => m.semanticVerified === true).length;
  return {
    ok: errors.length === 0,
    matches: refined,
    uncertain: uncertain,
    unmatchedCustomer: unmatchedCustomer,
    unusedSlots: Array.isArray(plan.unusedSlots) ? plan.unusedSlots.filter((s) => typeof s === "string") : [],
    warnings: warnings,
    errors: errors,
    blocks: blockOrder.map((bid) => {
      const b = blocks[bid];
      return { blockId: b.blockId, lineNo: b.lineNo, side: b.side, text: b.text, aiType: b.aiType, localType: b.localType, typeAgree: b.typeAgree, matched: b.matched, accounted: b.accounted };
    }),
    summary: {
      matched: refined.length,
      semanticallyVerified: semanticallyVerified,
      uncertain: uncertain.length,
      unmatched: unmatchedCustomer.length,
      blocks: blockOrder.length,
      unaccounted: unaccounted,
      errors: errors.length
    }
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    zyCleanLine: zyCleanLine,
    zyRawLines: zyRawLines,
    zyVerbatimTraceable: zyVerbatimTraceable,
    zySplitLinesLocal: zySplitLinesLocal,
    zySlotIndexFromSnapshot: zySlotIndexFromSnapshot,
    zyTypeCanon: zyTypeCanon,
    zyTypeFamily: zyTypeFamily,
    zyTypeAgreeOf: zyTypeAgreeOf,
    zyIsStrongConflict: zyIsStrongConflict,
    zyLabelSplit: zyLabelSplit,
    zyNormalizeLabeledText: zyNormalizeLabeledText,
    zyValidateTemplateMatchPlan: zyValidateTemplateMatchPlan
  };
}
