// =====================================================================
// 折立印名片套版助手 - Template Match Workbench（M4 可编辑匹配工作台）
// ---------------------------------------------------------------------
// 职责：把 validator 输出（matches / uncertain / unmatchedCustomer / blocks）+ 快照槽位
//   组装为「可编辑工作台状态 mw」，并提供纯函数编辑操作：
//   分配（zyWbAssign）/ 行内编辑（zyWbAssignText）/ 解绑（zyWbUnbind）/ 交换（zyWbSwap）/
//   重建执行指令（zyWbRebuildMatches → 交给 template-apply-v2 的 zyBuildApplyCommandPlan）。
// 硬规则（与用户定稿一致）：
//   1. 只改「槽位 ↔ 客户文本」绑定关系；绝不携带 geometry/font/style/identity/layer；
//   2. 槽位 ↔ 客户块 一对一：重复分配自动从旧槽解绑（防一稿多写）；
//   3. 手动编辑（zyWbAssignText）断开逐字来源链接（blockId=null）并标记 edited=MANUAL_EDIT；
//   4. 重建指令仍走 zyBuildApplyCommandPlan（slotId/slotIdx/objectUuid 双因子 + 不串面 + 同一版）；
//   5. 不新建 / 不删除画布对象；空客户值 = 该槽不填。
// 本模块纯函数、自包含（无 require）；真源 runtime/stage11/template-match-workbench.test.js。
// =====================================================================
"use strict";

function zyWbStr(v) { return String(v == null ? "" : v); }
// slotId 前缀 → 面（front-* / back-*）；非法返回 null
function zyWbSideOf(slotId) {
  const s = zyWbStr(slotId);
  if (/^front-/i.test(s)) return "front";
  if (/^back-/i.test(s)) return "back";
  return null;
}

// 组装工作台状态。input = { slots:{front,back}(快照段，items 含 slotId/objectUuid/text),
//   version, versionCount, multi, sideCounts, pageId, planHash, snapshot,
//   matches:[{slotId,side,slotIdx,objectUuid,customerText,blockId,...}], blocks:[{blockId,text,side}],
//   uncertain:[{slotId,candidates,reason}], unmatched:[{blockId,text,reason}] }
function zyBuildWorkbench(input) {
  const o = input || {};
  const slotsSrc = o.slots || {};
  const slots = [];
  ["front", "back"].forEach(function (side) {
    const sec = slotsSrc[side];
    const items = (sec && Array.isArray(sec.items)) ? sec.items : [];
    items.forEach(function (it, i) {
      const sid = (it && it.slotId != null) ? zyWbStr(it.slotId) : (side + "-" + (i + 1));
      slots.push({
        slotId: sid, side: side, slotIdx: i,
        objectUuid: (it && it.objectUuid != null) ? zyWbStr(it.objectUuid) : null,
        templateText: (it && it.text != null) ? zyWbStr(it.text) : "",
        customerText: "", blockId: null, status: "empty", edited: false
      });
    });
  });
  const byId = {}; slots.forEach(function (s) { byId[s.slotId] = s; });

  // 客户块 = validator.blocks ∪ unmatchedCustomer（按 blockId 去重，保持首见顺序）
  const blocks = []; const bIdx = {};
  (o.blocks || []).forEach(function (b) {
    const id = zyWbStr(b && b.blockId); if (!id || bIdx[id]) return;
    bIdx[id] = { blockId: id, text: zyWbStr(b && b.text), side: (b && b.side) || null, boundSlotId: null };
    blocks.push(bIdx[id]);
  });
  (o.unmatched || []).forEach(function (u) {
    const id = zyWbStr(u && u.blockId); if (!id || bIdx[id]) return;
    bIdx[id] = { blockId: id, text: zyWbStr(u && u.text), side: null, boundSlotId: null, unmatchedReason: zyWbStr(u && u.reason) };
    blocks.push(bIdx[id]);
  });

  // AI 匹配 → 落到槽位
  (o.matches || []).forEach(function (m) {
    const sid = zyWbStr(m && m.slotId); const s = byId[sid]; if (!s) return;
    const bid = (m && m.blockId != null) ? zyWbStr(m.blockId) : null;
    s.customerText = zyWbStr(m && m.customerText);
    s.blockId = (bid && bIdx[bid]) ? bid : null;
    s.status = "matched";
    if (s.blockId) bIdx[s.blockId].boundSlotId = sid;
  });

  const mw = {
    version: (typeof o.version === "number") ? o.version : 0,
    versionCount: (typeof o.versionCount === "number") ? o.versionCount : 1,
    multi: !!o.multi,
    sideCounts: o.sideCounts || null,
    pageId: o.pageId || null,
    planHash: o.planHash || null,
    snapshot: o.snapshot || null,
    slots: slots,
    blocks: blocks,
    uncertain: (o.uncertain || []).slice(),
    selectedBlockId: null
  };
  // uncertain 槽位：未绑定时标 unclear（保留候选，不自动填）
  mw.uncertain.forEach(function (u) {
    const s = byId[zyWbStr(u && u.slotId)];
    if (s && !zyWbStr(s.customerText).trim()) s.status = "unclear";
  });
  return mw;
}

function zyWbSlotMap(mw) { const m = {}; ((mw && mw.slots) || []).forEach(function (s) { m[s.slotId] = s; }); return m; }
function zyWbBlockMap(mw) { const m = {}; ((mw && mw.blocks) || []).forEach(function (b) { m[b.blockId] = b; }); return m; }
// uncertain 槽位集合（槽位级属性：即使曾被分配/编辑，清空后仍应回到「不确定」）
function zyWbUncertainSet(mw) { const s = {}; ((mw && mw.uncertain) || []).forEach(function (u) { s[zyWbStr(u && u.slotId)] = true; }); return s; }

// 点选分配：把客户块绑定到槽位（一对一；块若已绑定别的槽，先从旧槽解绑）
function zyWbAssign(mw, slotId, blockId) {
  if (!mw) return { ok: false, code: "NO_WB" };
  const sid = zyWbStr(slotId), bid = zyWbStr(blockId);
  const sm = zyWbSlotMap(mw), bm = zyWbBlockMap(mw);
  const s = sm[sid], b = bm[bid];
  if (!s) return { ok: false, code: "UNKNOWN_SLOT" };
  if (!b) return { ok: false, code: "UNKNOWN_BLOCK" };
  if (b.boundSlotId && b.boundSlotId !== sid) {
    const old = sm[b.boundSlotId];
    if (old) { old.customerText = ""; old.blockId = null; old.status = "empty"; old.edited = false; }
  }
  s.customerText = zyWbStr(b.text); s.blockId = bid; s.status = "manual"; s.edited = false;
  b.boundSlotId = sid;
  return { ok: true, code: "ASSIGNED" };
}

// 行内编辑：设置槽位客户值（断开来历链接 → edited/MANUAL_EDIT；空串 = 清空该槽）
function zyWbAssignText(mw, slotId, text) {
  if (!mw) return { ok: false, code: "NO_WB" };
  const sid = zyWbStr(slotId); const sm = zyWbSlotMap(mw); const s = sm[sid];
  if (!s) return { ok: false, code: "UNKNOWN_SLOT" };
  const t = zyWbStr(text);
  if (s.blockId) { const b = zyWbBlockMap(mw)[s.blockId]; if (b && b.boundSlotId === sid) b.boundSlotId = null; }
  s.blockId = null; s.customerText = t;
  if (!t.trim()) { s.status = zyWbUncertainSet(mw)[sid] ? "unclear" : "empty"; s.edited = false; }
  else { s.status = "edited"; s.edited = true; }
  return { ok: true, code: t.trim() ? "EDITED" : "CLEARED" };
}

// 解绑：清空槽位客户值；若该槽原属 uncertain 则回到 unclear
function zyWbUnbind(mw, slotId) {
  if (!mw) return { ok: false, code: "NO_WB" };
  const sid = zyWbStr(slotId); const sm = zyWbSlotMap(mw); const s = sm[sid];
  if (!s) return { ok: false, code: "UNKNOWN_SLOT" };
  if (s.blockId) { const b = zyWbBlockMap(mw)[s.blockId]; if (b && b.boundSlotId === sid) b.boundSlotId = null; }
  s.customerText = ""; s.blockId = null; s.edited = false;
  s.status = zyWbUncertainSet(mw)[sid] ? "unclear" : "empty";
  return { ok: true, code: "UNBOUND" };
}

// 交换两槽的客户绑定（含块链接 / 状态 / 编辑标记）
function zyWbSwap(mw, slotIdA, slotIdB) {
  if (!mw) return { ok: false, code: "NO_WB" };
  const sm = zyWbSlotMap(mw);
  const a = sm[zyWbStr(slotIdA)], b = sm[zyWbStr(slotIdB)];
  if (!a || !b) return { ok: false, code: "UNKNOWN_SLOT" };
  if (a === b) return { ok: false, code: "SAME_SLOT" };
  const tA = a.customerText, bA = a.blockId, sA = a.status, eA = a.edited;
  a.customerText = b.customerText; a.blockId = b.blockId; a.status = b.status; a.edited = b.edited;
  b.customerText = tA; b.blockId = bA; b.status = sA; b.edited = eA;
  const bm = zyWbBlockMap(mw);
  if (a.blockId && bm[a.blockId]) bm[a.blockId].boundSlotId = a.slotId;
  if (b.blockId && bm[b.blockId]) bm[b.blockId].boundSlotId = b.slotId;
  return { ok: true, code: "SWAPPED" };
}

// 从工作台重建 matches（供 zyBuildApplyCommandPlan 消费）——仅含非空客户值的槽
function zyWbRebuildMatches(mw) {
  const out = [];
  (((mw && mw.slots) || [])).forEach(function (s) {
    const t = zyWbStr(s.customerText);
    if (!t.trim()) return;
    out.push({
      slotId: s.slotId, side: s.side, slotIdx: s.slotIdx, objectUuid: s.objectUuid,
      customerText: t, version: (mw && typeof mw.version === "number") ? mw.version : 0, confidence: 1
    });
  });
  return out;
}

function zyWbSummary(mw) {
  const slots = ((mw && mw.slots) || []);
  const blocks = ((mw && mw.blocks) || []);
  const matched = slots.filter(function (s) { return zyWbStr(s.customerText).trim(); }).length;
  const edited = slots.filter(function (s) { return s.edited === true; }).length;
  const unclear = slots.filter(function (s) { return s.status === "unclear"; }).length;
  const unmatched = blocks.filter(function (b) { return !b.boundSlotId; }).length;
  return { slots: slots.length, matched: matched, edited: edited, unclear: unclear, blocks: blocks.length, unmatched: unmatched };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    zyWbSideOf: zyWbSideOf,
    zyBuildWorkbench: zyBuildWorkbench,
    zyWbAssign: zyWbAssign,
    zyWbAssignText: zyWbAssignText,
    zyWbUnbind: zyWbUnbind,
    zyWbSwap: zyWbSwap,
    zyWbRebuildMatches: zyWbRebuildMatches,
    zyWbSummary: zyWbSummary
  };
}
