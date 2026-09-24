// =====================================================================
// 折立印名片套版助手 - Template Apply V2（Stage 10-G L 阶 Commit 04）
// ---------------------------------------------------------------------
// 职责：把「AI 槽位匹配结果（validator 输出 matches）」翻译成最小化执行指令集。
// 硬规则（用户定稿）：
//   1. slotId 精确绑定 —— 每条指令必须命中 snapshot 中真实槽位；
//   2. 只修改 text —— 指令只携带 {side, slotId, slotIdx, objectUuid, customerText}，
//      绝不携带任何 geometry/font/style 字段（冻结承诺可被测试断言）；
//   3. 不新建 / 不删除 —— 指令数 == 被绑定槽数，不引入额外画布操作；
//   4. 不串面 —— slotId 前缀（front-/back-）必须与指令 side 一致；
//   5. 双因子防错槽 —— slotIdx 须在对应面槽范围内，且 objectUuid（若有）必须匹配；
//   6. 一槽至多一条指令（重复 slotId → 拒绝）。
// 本模块纯函数、自包含（无 require）；真源为 runtime/stage11/template-apply-v2.test.js。
// 调用链：Snapshot + validator(ref.matches) → zyBuildApplyCommandPlan → page-bridge templateApplyV2。
// =====================================================================
"use strict";

function zyIsNum(v) { return typeof v === "number" && isFinite(v); }
function zyStr(v) { return String(v == null ? "" : v); }

// slotId 前缀（front-N / back-N）→ 面。非法前缀返回 null。
function zySlotPrefixOf(slotId) {
  const s = zyStr(slotId);
  if (/^front-/i.test(s)) return "front";
  if (/^back-/i.test(s)) return "back";
  return null;
}

// 从 TemplateSnapshot 构建 { slotId -> { side, index, objectUuid, text } }（与 validator 同口径）
function zySnapshotSlotRegistry(snapshot) {
  const reg = {};
  const s = snapshot || {};
  ["front", "back"].forEach((side) => {
    const items = (s[side] && s[side].items) || [];
    items.forEach((it, i) => {
      const id = it && it.slotId != null ? zyStr(it.slotId) : (side + "-" + (i + 1));
      if (!reg[id]) reg[id] = { side: side, index: i, objectUuid: it && it.objectUuid != null ? zyStr(it.objectUuid) : null, text: it && it.text != null ? zyStr(it.text) : "" };
    });
  });
  return reg;
}

// 生成 ApplyCommandPlan。matches = validator 输出 ref.matches（含 slotId/slotIdx/side/objectUuid/customerText/confidence）。
// 返回 { ok, commands[], sideGroups, errors[], summary:{total,toApply} }
function zyBuildApplyCommandPlan(input) {
  const o = input || {};
  const snapshot = o.snapshot || {};
  const matches = Array.isArray(o.matches) ? o.matches : [];
  const reg = zySnapshotSlotRegistry(snapshot);
  const errors = [];
  const commands = [];
  const seen = {};

  matches.forEach((m, i) => {
    const slotId = zyStr(m && m.slotId);
    const side = m && m.side != null ? zyStr(m.side) : null;
    const slotIdx = m && m.slotIdx;
    const objectUuid = m && m.objectUuid != null ? zyStr(m.objectUuid) : null;
    const customerText = zyStr(m && m.customerText);
    const confidence = zyIsNum(m && m.confidence) ? m.confidence : 1;
    const reason = zyStr(m && m.reason);
    // a) slotId 必须真实存在
    const slot = reg[slotId];
    if (!slot) { errors.push("CMD[" + i + "] UNKNOWN_SLOT[" + slotId + "]"); return; }
    // b) side 必须与 slotId 前缀一致（不串面）
    const prefix = zySlotPrefixOf(slotId);
    if (!prefix) { errors.push("CMD[" + i + "] BAD_SLOT_ID[" + slotId + "]"); return; }
    if (side && side !== prefix) { errors.push("CMD[" + i + "] SIDE_MISMATCH[" + slotId + " side=" + side + " prefix=" + prefix + "]"); return; }
    if (side && side !== reg[slotId].side) { errors.push("CMD[" + i + "] SIDE_NOT_IN_SNAPSHOT[" + slotId + " side=" + side + "]"); return; }
    // c) slotIdx 必须落在该面对应槽范围内，双因子与 registry 对齐
    if (!zyIsNum(slotIdx) || slotIdx < 0 || slotIdx !== reg[slotId].index) { errors.push("CMD[" + i + "] SLOT_INDEX_MISMATCH[" + slotId + " idx=" + String(slotIdx) + " expected=" + reg[slotId].index + "]"); return; }
    // d) objectUuid 若提供必须与 snapshot 一致（防置换成别的对象）
    if (objectUuid && reg[slotId].objectUuid && objectUuid !== reg[slotId].objectUuid) { errors.push("CMD[" + i + "] OBJECT_UUID_MISMATCH[" + slotId + " got=" + String(objectUuid).slice(0, 12) + " expected=" + String(reg[slotId].objectUuid).slice(0, 12) + "]"); return; }
    // e) 一槽至多一条指令
    if (seen[slotId]) { errors.push("CMD[" + i + "] SLOT_DUPLICATE[" + slotId + "]"); return; }
    seen[slotId] = true;
    // f) customerText 非空
    if (!customerText.trim()) { errors.push("CMD[" + i + "] EMPTY_CUSTOMER_TEXT[" + slotId + "]"); return; }
    commands.push({
      side: reg[slotId].side,
      slotId: slotId,
      slotIdx: reg[slotId].index,
      objectUuid: reg[slotId].objectUuid,
      customerText: customerText,
      confidence: confidence,
      reason: reason,
      // 冻结承诺：执行侧只改 text，以下维度全部冻结（文档化 + 可断言）
      frozen: { geometry: true, typography: true, style: true, identity: true, layer: true }
    });
  });

  // 全局排序：front 组在前、back 组在后；组内按 slotIdx 升序（确定性输出）
  commands.sort(function (a, b) {
    if (a.side === b.side) return a.slotIdx - b.slotIdx;
    return a.side === "front" ? -1 : 1;
  });

  // 分组（保持 front 在前；每组按 slotIdx 升序）
  const sideGroups = {};
  ["front", "back"].forEach((side) => {
    const group = commands.filter((c) => c.side === side).sort((a, b) => a.slotIdx - b.slotIdx);
    if (group.length) sideGroups[side] = { side: side, count: group.length, commands: group };
  });

  return {
    ok: errors.length === 0,
    commands: commands,
    sideGroups: sideGroups,
    errors: errors,
    summary: { total: matches.length, toApply: commands.length, rejected: matches.length - commands.length, errors: errors.length }
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { zySlotPrefixOf: zySlotPrefixOf, zySnapshotSlotRegistry: zySnapshotSlotRegistry, zyBuildApplyCommandPlan: zyBuildApplyCommandPlan };
}