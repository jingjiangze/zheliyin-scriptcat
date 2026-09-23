// extension/src/editor/template-slot-matcher.js — Stage 10-D Commit B：OCR 行 → 模板槽位 匹配纯模块
// ---------------------------------------------------------------------
// 定位：双模式架构「模板套版模式（Template First）」的唯一行↔槽配对器。
// 输入：
//   slots —— 模板已有文字槽位快照（来自 getTextInventory 扩展字段）：{slotId, left, top, width, height, fontSize, text}
//   rows  —— OCR/Native 识别的客户文字行：{text, left, top, width, height, fontSize}
// 输出：
//   { matches:[{rowIdx, slotIdx, confidence, factors}], unmatched:[{rowIdx, reason}], unusedSlots:[slotIdx] }
// 特征（与 page-bridge zyAnchorMatch 同语义纯函数化）：
//   spatial —— 行中心距 / 槽宽归一（1/(1+d/scale)）
//   size   —— 字号对数差（1/(1+|ln a - ln b|*4)）+ 宽高比
//   order  —— 阅读序（rows y 序与 slots y 序差）惩罚
//   len    —— 文本长度类接近度（1/(1+Δlen/8)）
// 指派：按 cost 升序贪心 + 冲突回退（row 已绑/slot 已占用则跳过），稳定排序确定性；
//   置信 < 门槛（默认 0.45）的行不硬绑，标记 unmatched（模板套版宁可不动，不误伤槽位）。
// 硬规则：未匹配行不绑定；同一 slot 至多 1 行；同一行至多 1 槽；rows/slots 均按 y 序预读。
"use strict";

function nz(v) { return (typeof v === "number" && isFinite(v)) ? v : null; }
function cx(b) { return nz(b.left) != null ? nz(b.left) + (nz(b.width) || 0) / 2 : null; }
function cy(b) { return nz(b.top) != null ? nz(b.top) + (nz(b.height) || 0) / 2 : null; }
function lenSim(a, b) { return 1 / (1 + Math.abs(String(a || "").length - String(b || "").length) / 8); }
function fsSim(x, y) { const fx = nz(x), fy = nz(y); if (fx == null || fy == null || fx <= 0 || fy <= 0) return 0.5; return 1 / (1 + Math.abs(Math.log(fx) - Math.log(fy)) * 4); }
function spatialScore(row, slot, scale) {
  const rx = cx(row), ry = cy(row), sx = cx(slot), sy = cy(slot);
  if (rx == null || ry == null || sx == null || sy == null) return 0.5;
  const d = Math.hypot(rx - sx, ry - sy);
  const sc = (nz(scale) != null && nz(scale) > 0) ? nz(scale) : ((nz(slot.width) || nz(row.width)) || 100);
  return 1 / (1 + d / sc);
}

const DEFAULT_WEIGHTS = { spatial: 0.45, size: 0.25, order: 0.15, len: 0.15 };
const DEFAULT_MIN_CONF = 0.45;

function yRank(list) {
  // 返回每个 index 的 y 序 rank（稳定，相同 y 按 x）
  const idx = list.map(function (_, i) { return i; });
  idx.sort(function (a, b) {
    const ya = nz(list[a].top) != null ? nz(list[a].top) : 0, yb = nz(list[b].top) != null ? nz(list[b].top) : 0;
    if (ya !== yb) return ya - yb;
    const xa = nz(list[a].left) != null ? nz(list[a].left) : 0, xb = nz(list[b].left) != null ? nz(list[b].left) : 0;
    return xa - xb;
  });
  const rank = new Array(list.length);
  idx.forEach(function (i, r) { rank[i] = r; });
  return rank;
}

function matchSlots(input) {
  const o = input || {};
  const slots = Array.isArray(o.slots) ? o.slots.slice() : [];
  const rows = Array.isArray(o.rows) ? o.rows.slice() : [];
  if (!slots.length) return { matches: [], unmatched: rows.map(function (_, i) { return { rowIdx: i, reason: "NO_SLOT" }; }), unusedSlots: [] };
  if (!rows.length) return { matches: [], unmatched: [], unusedSlots: slots.map(function (_, i) { return i; }) };
  const opts = Object.assign({}, DEFAULT_WEIGHTS, o.opts || {});
  const minConf = typeof opts.minConfidence === "number" ? opts.minConfidence : DEFAULT_MIN_CONF;
  const rowRank = yRank(rows);
  const slotRank = yRank(slots);

  // 候选构建
  const cands = [];
  for (let ri = 0; ri < rows.length; ri += 1) {
    const row = rows[ri];
    if (row == null || !String(row.text || "").trim()) continue;
    for (let si = 0; si < slots.length; si += 1) {
      const slot = slots[si];
      if (slot == null) continue;
      const spatial = spatialScore(row, slot, slot.width);
      if (spatial <= 0.05) continue; // 明显跨区（左右栏/上下块）直接不连
      const size = fsSim(row.fontSize, slot.fontSize);
      const len = lenSim(row.text, slot.text);
      const order = (Math.abs(rowRank[ri] - slotRank[si]) <= 1) ? 1 : (Math.abs(rowRank[ri] - slotRank[si]) <= 2 ? 0.6 : 0.25);
      const score = opts.spatial * spatial + opts.size * size + opts.order * order + opts.len * len;
      cands.push({ ri: ri, si: si, score: score, spatial: Math.round(spatial * 1000) / 1000, size: Math.round(size * 1000) / 1000, order: Math.round(order * 1000) / 1000, len: Math.round(len * 1000) / 1000 });
    }
  }
  // cost 升序（score 降序）→ 稳定排序（先 row 后 score）
  cands.sort(function (a, b) { return (b.score - a.score) || (a.ri - b.ri) || (a.si - b.si); });

  const boundRow = {}, boundSlot = {};
  const matches = [];
  cands.forEach(function (c) {
    if (boundRow[c.ri] || boundSlot[c.si]) return; // 冲突回退
    if (c.score < minConf) return;
    boundRow[c.ri] = 1; boundSlot[c.si] = 1;
    matches.push({ rowIdx: c.ri, slotIdx: c.si, confidence: Math.round(c.score * 10000) / 10000, factors: ["spatial=" + c.spatial, "size=" + c.size, "order=" + c.order, "len=" + c.len] });
  });

  const unmatched = [];
  rows.forEach(function (row, ri) {
    if (row == null || !String(row.text || "").trim()) { unmatched.push({ rowIdx: ri, reason: "EMPTY_TEXT" }); return; }
    if (boundRow[ri]) return;
    unmatched.push({ rowIdx: ri, reason: "NO_SLOT" });
  });
  const unusedSlots = [];
  slots.forEach(function (_, si) { if (!boundSlot[si]) unusedSlots.push(si); });
  return { matches: matches, unmatched: unmatched, unusedSlots: unusedSlots };
}

if (typeof module !== "undefined" && module.exports) module.exports= { matchSlots: matchSlots, spatialScore: spatialScore, fsSim: fsSim, lenSim: lenSim, DEFAULT_MIN_CONF: DEFAULT_MIN_CONF };