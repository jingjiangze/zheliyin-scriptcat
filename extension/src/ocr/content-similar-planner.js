// =====================================================================
// 折立印名片套版助手 - Content Similar Planner（Stage 10-G Commit I-1）
// ---------------------------------------------------------------------
// 定位：「一键智能填充（内容相似智能套版）」的纯逻辑模块 —— 把客户粘贴文本的
// 原文行（rows）与画布既有文字图层快照（slots，来自 getTextInventory）按
// 「内容相似」匹配，产出 { matches, unmatched, unusedSlots } 规划。
// 硬约束：
//   * 只读：绝不写画布；匹配用的规范化（normText）只作用于比对副本，
//     替换值 text 必须是原文行逐字（不做 trim/剥前缀等任何内容变换）。
//   * 不依赖 OCR / 字段键：靠文本相似（textScore）+ 长度 + 空间顺序，
//     不是「字段键→槽位」填充。
//   * 唯一绑定：一值至多一槽、一槽至多一值（无覆盖/无重复）。
// 匹配打分与门禁为可校准常量（TEXT_MIN/TOTAL_MIN/MARGIN），真机验证后收敛。
// 可测试性：纯函数，无 DOM / HTTP / GM 依赖；node 单测 runtime/stage10/。
// =====================================================================
"use strict";

function isNum(v) { return typeof v === "number" && isFinite(v); }

// —— 以下 normText/textScore/lengthScore/rankScore 与
//    extension/src/ocr/native-anchor-recovery.js 逐字一致（页面 world 内联镜像同源）——

function normText(s) {
  if (s == null) return "";
  return String(s).toLowerCase()
    .replace(/[\s\u3000\u00a0]+/g, "")
    .replace(/[·•．。，，、；》＇“”‘’（）【】［］《》：：-]/g, "");
}

// normalized 文本相似度（0..1）：1=完全一致；0.8=一方包含（长侧>=3）；否则字符重叠率。
function textScore(a, b) {
  var ka = normText(a), kb = normText(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  var longer = ka.length >= kb.length ? ka : kb;
  var shorter = ka.length >= kb.length ? kb : ka;
  if (shorter.length >= 3 && longer.indexOf(shorter) >= 0) return 0.8;
  var set = {}, hit = 0, i;
  for (i = 0; i < longer.length; i += 1) set[longer[i]] = 1;
  for (i = 0; i < shorter.length; i += 1) if (set[shorter[i]]) hit += 1;
  return hit / longer.length;
}

// 长度兼容（0..1）：|Δlen|<=1 → 1；≤4 → 0.6；≤8 → 0.3；else 0。
function lengthScore(a, b) {
  var la = String(a == null ? "" : a).length, lb = String(b == null ? "" : b).length;
  var d = Math.abs(la - lb);
  if (d <= 1) return 1;
  if (d <= 4) return 0.6;
  if (d <= 8) return 0.3;
  return 0;
}

// 归一（0..1）：两个 rank 的距离（0=同 rank；≥3 视为远）。
function rankScore(x, y) {
  var d = Math.abs((x == null ? 0 : x) - (y == null ? 0 : y));
  if (d === 0) return 1;
  if (d <= 1) return 0.6;
  if (d <= 2) return 0.3;
  return 0;
}

// —— 门禁常量（真机校准点）——
const TEXT_MIN_DEFAULT = 0.50; // textScore 硬门槛：仅相似才替换
const TOTAL_MIN_DEFAULT = 0.55; // 总分门槛
const MARGIN_DEFAULT = 0.10; // 亚军过近 → AMBIGUOUS（宁丢不硬绑）
const W_TEXT = 0.62; // 总分权重：文本相似
const W_LEN = 0.18; // 总分权重：长度
const W_RANK = 0.20; // 总分权重：空间顺序

// 槽位 rank：按自上而下 y 排序后的下标（画布阅读序）；行 rank = 原文行序。
function slotRankOf(item, ySortedSlots) {
  return ySortedSlots.indexOf(item);
}

// 主入口：planContentSimilar({ slots, rows, side, opts })
//   slots: getTextInventory/getTextInventoryAll 某侧 items（含 text/center.y 或 top/height）
//   rows:  客户原文行数组（已滤纯空行；内容未做任何变换）
//   side:  "front" | "back"
//   opts:  { textMin, totalMin, margin }
// 返回: { side, slotsCount, matches, unmatched, unusedSlots, diagnostics }
function planContentSimilar(input) {
  const o = input || {};
  const slots = Array.isArray(o.slots) ? o.slots : [];
  const rowsInit = Array.isArray(o.rows) ? o.rows : [];
  const side = o.side || "front";
  const opts = o.opts || {};
  const TEXT_MIN = isNum(opts.textMin) ? opts.textMin : TEXT_MIN_DEFAULT;
  const TOTAL_MIN = isNum(opts.totalMin) ? opts.totalMin : TOTAL_MIN_DEFAULT;
  const MARGIN = isNum(opts.margin) ? opts.margin : MARGIN_DEFAULT;
  const diag = {};

  // 行预处理：跳过纯空行（EMPTY_ROW 不上报为 unmatched，仅跳过）
  const rows = [];
  rowsInit.forEach((r, i) => {
    const text = String(r == null ? "" : r);
    if (!normText(text)) return; // EMPTY_ROW：忽略
    rows.push({ rawIdx: i, text: text, norm: normText(text) });
  });

  // 槽位排序（自上而下阅读序）+ rank
  const ySlots = slots
    .map((s, i) => ({ s: s, i: i, y: isNum(s && s.center && s.center.y) ? s.center.y : (isNum(s && s.top) ? s.top + (isNum(s && s.height) ? s.height / 2 : 0) : i) }))
    .sort((a, b) => (a.y - b.y) || (a.i - b.i));
  const rankByIdx = {};
  ySlots.forEach((ys, rk) => { rankByIdx[ys.i] = rk; });

  const N = rows.length, M = slots.length;
  const score = []; // [rowIdx][slotIdx] -> {ts, ls, rs, total}
  const anyCandidate = [];
  for (let r = 0; r < N; r += 1) {
    score.push([]);
    let best = null;
    for (let s = 0; s < M; s += 1) {
      const ts = textScore(rows[r].text, slots[s].text);
      const ls = lengthScore(rows[r].text, slots[s].text);
      const rs = rankScore(r, rankByIdx[s]);
      const total = W_TEXT * ts + W_LEN * ls + W_RANK * rs;
      score[r][s] = { ts: ts, ls: ls, rs: rs, total: total };
      if (!best || total > best.total) best = score[r][s];
    }
    anyCandidate.push(best ? (best.total > 0) : false);
  }

  // 贪心唯一绑定：按行 bestTotal 降序处理（行内取最高分未用槽）
  const rowUsed = [], slotUsed = [];
  const binds = []; // {rowIdx, slotIdx, score}
  const order = [];
  for (let r = 0; r < N; r += 1) order.push(r);
  order.sort((a, b) => {
    const ba = bestTotalOf(a), bb = bestTotalOf(b);
    return (bb - ba) || (a - b);
  });
  function bestTotalOf(r) {
    let b = 0;
    for (let s = 0; s < M; s += 1) if (!slotUsed[s] && score[r][s].total > b) b = score[r][s].total;
    return b;
  }
  for (let k = 0; k < order.length; k += 1) {
    const r = order[k];
    if (rowUsed[r]) continue;
    let bestS = -1, bestTot = -1, bestTs = 0, secondTot = 0;
    for (let s = 0; s < M; s += 1) {
      if (slotUsed[s]) continue;
      const sc = score[r][s];
      if (sc.total > bestTot) { secondTot = bestTot; bestTot = sc.total; bestS = s; bestTs = sc.ts; }
      else if (sc.total > secondTot) secondTot = sc.total;
    }
    if (bestS < 0) break;
    if (bestTs < TEXT_MIN || bestTot < TOTAL_MIN) continue; // 该行本轮不绑（BELOW_THRESHOLD）
    // 门禁：亚军在阈值之上且 margin 不足 → 宁丢不硬绑（AMBIGUOUS）
    if (secondTot >= TOTAL_MIN && (bestTot - secondTot) < MARGIN) continue;
    rowUsed[r] = 1; slotUsed[bestS] = 1;
    binds.push({ rowIdx: r, slotIdx: bestS, total: bestTot, ts: bestTs });
  }

  // 已绑 → matches（text=原文行逐字）
  const matches = binds.slice().sort((a, b) => (a.rowIdx - b.rowIdx)).map((bd) => {
    const r = rows[bd.rowIdx], s = slots[bd.slotIdx];
    return {
      rowIdx: r.rawIdx, slotIdx: bd.slotIdx,
      text: r.text, objectUuid: (s && s.objectUuid) || null,
      score: Math.round(bd.total * 100) / 100,
      factors: { textScore: Math.round(bd.ts * 100) / 100, lengthScore: Math.round(score[bd.rowIdx][bd.slotIdx].ls * 100) / 100, rankScore: Math.round(score[bd.rowIdx][bd.slotIdx].rs * 100) / 100 },
      reason: "MATCH"
    };
  });

  // 未绑行 classify
  const unmatched = [];
  for (let r = 0; r < N; r += 1) {
    if (rowUsed[r]) continue;
    const rr = rows[r];
    let bestTs = 0, bestTot = 0, bestS = -1, secondTot = 0;
    for (let s = 0; s < M; s += 1) {
      const sc = score[r][s];
      if (sc.total > bestTot) { secondTot = bestTot; bestTot = sc.total; bestS = s; bestTs = sc.ts; }
      else if (sc.total > secondTot) secondTot = sc.total;
    }
    if (!anyCandidate[r] || M === 0) { unmatched.push({ rowIdx: rr.rawIdx, text: rr.text, reason: "NO_SLOT" }); continue; }
    if (bestTs < TEXT_MIN || bestTot < TOTAL_MIN) { unmatched.push({ rowIdx: rr.rawIdx, text: rr.text, reason: "BELOW_THRESHOLD" }); continue; }
    if (bestS >= 0 && slotUsed[bestS]) { unmatched.push({ rowIdx: rr.rawIdx, text: rr.text, reason: "DUPLICATE" }); continue; }
    const margin = bestTot - secondTot;
    if (secondTot >= TOTAL_MIN && margin < MARGIN) { unmatched.push({ rowIdx: rr.rawIdx, text: rr.text, reason: "AMBIGUOUS" }); continue; }
    unmatched.push({ rowIdx: rr.rawIdx, text: rr.text, reason: "NO_SLOT" });
  }
  unmatched.sort((a, b) => (a.rowIdx - b.rowIdx));

  // 未用槽
  const unusedSlots = [];
  for (let s = 0; s < M; s += 1) if (!slotUsed[s]) unusedSlots.push(s);

  diag.slotYOrder = ySlots.map((ys) => ys.i);
  diag.thresholds = { TEXT_MIN: TEXT_MIN, TOTAL_MIN: TOTAL_MIN, MARGIN: MARGIN };
  return { side: side, slotsCount: M, matches: matches, unmatched: unmatched, unusedSlots: unusedSlots, diagnostics: diag };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    planContentSimilar: planContentSimilar,
    normText: normText,
    textScore: textScore,
    lengthScore: lengthScore,
    rankScore: rankScore,
    TEXT_MIN_DEFAULT: TEXT_MIN_DEFAULT,
    TOTAL_MIN_DEFAULT: TOTAL_MIN_DEFAULT,
    MARGIN_DEFAULT: MARGIN_DEFAULT
  };
}