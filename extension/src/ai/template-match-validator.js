// =====================================================================
// 折立印名片套版助手 - Template Match Validator（Stage 10-G L 阶 Commit 02）
// ---------------------------------------------------------------------
// 职责：AI 返回的 Match Plan 绝不能直接执行 —— 先做本地硬校验：
//   1. slotId 必须真实存在于 TemplateSnapshot（front/back 各自 id 列表）；
//   2. 一个 slot 只能被占一次；
//   3. 一条 customerText 只能出现一次（防同一内容填多个图层）；
//   4. customerText 必须逐字可追溯（必须来自客户原文，禁止 AI 改写/格式化）；
//   5. front/back 不串面（slotId 前缀对应面；同一条原文不得被两面使用）；
//   6. confidence 低于阈值 → 移入 uncertain（不确定 → 不填）。
// 输出 refined plan：匹配失败项带 errors/warnings，绝不静默丢弃。
// 纯函数、自包含（无 require）；node 单测为真源。
// =====================================================================
"use strict";

function zyIsNum(v) { return typeof v === "number" && isFinite(v); }
function zyCleanLine(s) { return String(s == null ? "" : s).replace(/\s+/g, "").toLowerCase(); }
function zyRawLines(rawText) {
  return String(rawText == null ? "" : rawText).split(/\r?\n/).map((x) => String(x).trim()).filter(Boolean);
}
// 逐字可追溯：customerText 必须是被某一原始行包含（cleaned 后），且 customerText 非空
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

function zyValidateTemplateMatchPlan(input) {
  const o = input || {};
  const plan = o.plan || {};
  const rawLines = zyRawLines(o.rawText);
  const slotIndex = zySlotIndexFromSnapshot(o.snapshot);
  const minConfidence = zyIsNum(o.minConfidence) ? o.minConfidence : 0.5;
  const matches = Array.isArray(plan.matches) ? plan.matches : [];
  const uncertainIn = Array.isArray(plan.uncertain) ? plan.uncertain : [];
  const unmatchedIn = Array.isArray(plan.unmatchedCustomer) ? plan.unmatchedCustomer : [];
  const warnings = [];
  const errors = [];
  const refined = [];
  const uncertain = [];
  const usedSlots = {};
  const usedTexts = {};

  matches.forEach((m, i) => {
    const slotId = m && m.slotId != null ? String(m.slotId) : null;
    const customerText = m && m.customerText != null ? String(m.customerText) : "";
    const confidence = zyIsNum(m && m.confidence) ? m.confidence : 1;
    const reason = m && m.reason != null ? String(m.reason) : "";
    // 1) slotId 存在
    const slot = slotId ? slotIndex[slotId] : null;
    if (!slot) { errors.push("M[" + i + "] UNKNOWN_SLOT[" + String(slotId || "") + "]"); return; }
    // 2) slot 唯一
    if (usedSlots[slotId]) { errors.push("M[" + i + "] SLOT_DUPLICATE[" + slotId + "]"); return; }
    // 3) customerText 唯一（cleaned 去噪比对）
    const tKey = zyCleanLine(customerText);
    if (!tKey) { errors.push("M[" + i + "] EMPTY_CUSTOMER_TEXT[" + slotId + "]"); return; }
    if (usedTexts[tKey]) { errors.push("M[" + i + "] CUSTOMER_TEXT_DUPLICATE[" + String(customerText).slice(0, 16) + "]"); return; }
    // 4) 逐字可追溯
    if (!zyVerbatimTraceable(customerText, rawLines)) { errors.push("M[" + i + "] NOT_VERBATIM[" + String(customerText).slice(0, 20) + "] (text not from customer raw)"); return; }
    // 5) confidence 门禁
    if (confidence < minConfidence) {
      uncertain.push({ slotId: slotId, candidates: [customerText], reason: "confidence " + confidence + " < " + minConfidence + " (" + reason + ")" });
      warnings.push("M[" + i + "] LOW_CONFIDENCE_SLOT[" + slotId + "] moved to uncertain");
      return;
    }
    usedSlots[slotId] = true;
    usedTexts[tKey] = true;
    refined.push({ slotId: slotId, slotIdx: slot.index, side: slot.side, objectUuid: slot.objectUuid, customerText: customerText, confidence: confidence, reason: reason });
  });

  // 6) uncertain 透传（保证 slotId 存在；candidates 数组化）
  uncertainIn.forEach((u, i) => {
    const slotId = u && u.slotId != null ? String(u.slotId) : null;
    if (!slotIndex[slotId]) { errors.push("U[" + i + "] UNKNOWN_SLOT[" + String(slotId || "") + "]"); return; }
    uncertain.push({ slotId: slotId, candidates: Array.isArray(u.candidates) ? u.candidates.slice(0, 6) : [], reason: (u && u.reason != null ? String(u.reason) : "") || "uncertain" });
  });

  // 7) unmatchedCustomer 透传（只记文本），合并进 errors?不 —— unmatched 不算 error，单独返回
  const unmatched = unmatchedIn.map((u, i) => ({ text: u && u.text != null ? String(u.text) : "", reason: (u && u.reason != null ? String(u.reason) : "") || "no matching slot" }));

  return {
    ok: errors.length === 0,
    matches: refined,
    uncertain: uncertain,
    unmatchedCustomer: unmatched,
    unusedSlots: Array.isArray(plan.unusedSlots) ? plan.unusedSlots.filter((s) => typeof s === "string") : [],
    warnings: warnings,
    errors: errors,
    summary: { matched: refined.length, uncertain: uncertain.length, unmatched: unmatched.length, errors: errors.length }
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { zyCleanLine: zyCleanLine, zyRawLines: zyRawLines, zyVerbatimTraceable: zyVerbatimTraceable, zySlotIndexFromSnapshot: zySlotIndexFromSnapshot, zyValidateTemplateMatchPlan: zyValidateTemplateMatchPlan };
}