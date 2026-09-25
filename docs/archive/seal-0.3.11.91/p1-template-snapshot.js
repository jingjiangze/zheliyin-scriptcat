// =====================================================================
// 折立印名片套版助手 - Template Snapshot（Stage 10-G L 阶 Commit 01 + P1 多版版维）
// ---------------------------------------------------------------------
// 定位：把「画布文字层清单」升级为「严格正反隔离的模板快照」——
//   front → front canvas；back → back canvas；back 缺失 = null；
//   绝不把 front 冒充 back（曾经 findCanvasForSide 回退导致 46g real 中
//   backAbsent=true 却拿到 front 内容）。
//
// P1 多版版维（真机探测结论，见 runtime/reports/stage-11/multiversion-probe.json）：
//   - 站点 totalCanvasArray 为扁平数组，每版占 2 个连续条目：
//       [v1正面c0, v1背面c1, v2正面c2, v2背面c3, ...]
//     第 vIdx 版第 side 面 → canvasIdx = 2*vIdx + (side==='back' ? 1 : 0)
//   - 快照声明自己属于哪一版（version），并携带版本总数/是否多版/版切换诊断。
//   - snapshotHash 口径统一为「按 canvasIdx 顺序拼接全部版的正反 items」：
//       单版 → [v0front, v0back]（与 P1 前逐字一致，hash 值不变，向后兼容）；
//       多版 → [v0front, v0back, v1front, v1back, ...]（任一版变化都会改变 hash →
//       planHash 并发防护自动覆盖全部版）。
//
// 契约（与 page-bridge 内联镜像逐字一致，页面 world 无法 require）：
//   - buildTemplateSnapshot({ frontItems, backItems, page, version, versionCount, multi,
//                             current, layout, allSidesItems })
//       → { ok, page, version, versionCount, multi, current, layout,
//           front:{exists,side,items}, back:{exists,side,items}, snapshotHash, count }
//   - snapshotHashOf(items)  → FNV-1a 32bit 确定性 hash（仅状态比对，非安全用途）
//   - withSlotId(item, side, index) → item + slotId（"front-N"/"back-N"，N 从 1 起；
//     面内相对，不跨版；版由快照 version 字段标识）
//   - 每条 item 保留平铺字段（text/left/top/fontSize/...，兼容既有调用方与 runner
//     断言）并新增 geometry/typography/style/identity 分组 + slotId。
// 纯函数、自包含（无 require）；node 单测以本模块为真源。
// =====================================================================
"use strict";

function zyIsNum(v) { return typeof v === "number" && isFinite(v); }

// FNV-1a 32bit（确定性、轻量；仅用于快照一致性比对）
function zySnapshotHashOf(items) {
  let h = 0x811c9dc5;
  const push = (s) => {
    const str = String(s == null ? "" : s);
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
  };
  (Array.isArray(items) ? items : []).forEach((it) => {
    push("|" + String(it && it.objectUuid != null ? it.objectUuid : ""));
    push("|" + String(it && it.text != null ? it.text : ""));
    push("|" + (it && zyIsNum(it.left) ? it.left : ""));
    push("|" + (it && zyIsNum(it.top) ? it.top : ""));
    push("|" + (it && zyIsNum(it.width) ? it.width : ""));
    push("|" + (it && zyIsNum(it.height) ? it.height : ""));
    push("|" + (it && zyIsNum(it.angle) ? it.angle : ""));
    push("|" + (it && zyIsNum(it.layerNum) ? it.layerNum : ""));
  });
  return ("00000000" + h.toString(16)).slice(-8);
}

// 给单条清单项附加 slotId（N 从 1 起：front-1 / back-2 …）与分组字段
function zySnapshotItemWithSlot(item, side, index) {
  const it = item || {};
  const id = String(side || "front") + "-" + (Number(index) + 1);
  it.slotId = id;
  it.slotIdx = Number(index);
  it.geometry = {
    left: zyIsNum(it.left) ? it.left : null,
    top: zyIsNum(it.top) ? it.top : null,
    width: zyIsNum(it.width) ? it.width : null,
    height: zyIsNum(it.height) ? it.height : null,
    angle: zyIsNum(it.angle) ? it.angle : 0
  };
  it.typography = {
    fontId: it.fontId != null ? String(it.fontId) : null,
    fontFamily: it.fontFamily != null ? String(it.fontFamily) : null,
    fontSize: zyIsNum(it.fontSize) ? it.fontSize : null,
    fontWeight: it.fontWeight != null ? String(it.fontWeight) : null,
    fontStyle: it.fontStyle != null ? String(it.fontStyle) : null,
    lineHeight: zyIsNum(it.lineHeight) ? it.lineHeight : null,
    charSpacing: zyIsNum(it.charSpacing) ? it.charSpacing : null
  };
  it.style = { fill: it.fill != null ? String(it.fill) : null };
  it.identity = {
    objectUuid: it.objectUuid != null ? String(it.objectUuid) : null,
    markuuid: it.markuuid != null ? String(it.markuuid) : null,
    layerNum: zyIsNum(it.layerNum) ? it.layerNum : null
  };
  return it;
}

// 全版 hash 口径：allSidesItems = [{version, side, items}] 按 canvasIdx 顺序传入
// 未提供时退化为「本版 front + 本版 back」（P1 前口径；单版下两者等价 → hash 值不变）
function zySnapshotHashItems(input) {
  const o = input || {};
  const all = Array.isArray(o.allSidesItems) ? o.allSidesItems : null;
  if (all) {
    const flat = [];
    all.forEach((g) => { (g && Array.isArray(g.items) ? g.items : []).forEach((it) => flat.push(it)); });
    return flat;
  }
  return (Array.isArray(o.frontItems) ? o.frontItems : []).concat(Array.isArray(o.backItems) ? o.backItems : []);
}

// 构建严格正反快照（front/back 各自独立；back 缺失 → exists:false, items:null）
// version：本快照所属版索引（默认 0）；versionCount/multi/current/layout：多版诊断
function zyBuildTemplateSnapshot(input) {
  const o = input || {};
  const frontRaw = Array.isArray(o.frontItems) ? o.frontItems : null;
  const backRaw = Array.isArray(o.backItems) ? o.backItems : null;
  const frontItems = frontRaw ? frontRaw.map((it, i) => zySnapshotItemWithSlot(it, "front", i)) : null;
  const backItems = backRaw ? backRaw.map((it, i) => zySnapshotItemWithSlot(it, "back", i)) : null;
  const page = o.page || null;
  const version = zyIsNum(o.version) ? o.version : 0;
  const versionCount = zyIsNum(o.versionCount) ? o.versionCount : 1;
  const snapshotHash = zySnapshotHashOf(zySnapshotHashItems(o));
  return {
    ok: true,
    page: page,
    version: version,
    versionCount: versionCount,
    multi: (o.multi != null) ? !!o.multi : (versionCount > 1),
    current: o.current || null,
    layout: o.layout || null,
    front: { exists: !!frontItems, side: "front", items: frontItems },
    back: { exists: !!backItems, side: "back", items: backItems },
    snapshotHash: snapshotHash,
    count: { front: frontItems ? frontItems.length : 0, back: backItems ? backItems.length : 0 }
  };
}

// ===== P1 多版布局纯函数（真源；page-bridge 内联逐字镜像）=====
// 版索引 ↔ canvas 索引映射（站点 totalCanvasArray 扁平布局，每版 2 个连续条目）
function zyCanvasIndexOf(version, side) {
  return Math.max(0, Math.floor(Number(version) || 0)) * 2 + (side === "back" ? 1 : 0);
}
function zyVersionOfCanvasIndex(canvasIdx) {
  return Math.max(0, Math.floor((Number(canvasIdx) || 0) / 2));
}
function zySideOfCanvasIndex(canvasIdx) {
  return ((Number(canvasIdx) || 0) % 2 === 1) ? "back" : "front";
}
// 版数推算：数组长度 → 版数（每版 2 条；len=1（仅正面未 materialize 背面）→ 1）
function zyVersionCountOf(totalLen) {
  return Math.max(1, Math.ceil((Number(totalLen) || 0) / 2));
}

// 布局判定（纯函数）：输入均为已采集的原始值，输出判定结果 + 冲突清单。
//   totalLen             totalCanvasArray.length
//   currentCanvasNum     CanvasObjVO.currentCanvasNum（1 基；未知传 null）
//   domLiCount           .pageWrapMulti li 数量（未知传 null）
//   domCurrentLiIdx      .pageWrapMulti li.currentLi 索引（未知传 null）
//   domCurrentGroupIdx   .pageWrapMulti .page-group.current 全局索引（未知传 null）
// 判定规则（真机探测结论）：
//   - 版数：DOM li 数优先（站点 UI 真源），缺失时用数组推算；
//   - 当前 canvasIdx：currentCanvasNum（权威）> DOM 当前 page-group 索引 > 0；
//   - 硬冲突（ok=false）：currentCanvasNum 与 DOM 当前页不一致；当前版未 materialize；
//   - 软冲突（记录不阻断读取）：li.currentLi 与 vIdx 不一致；DOM 版数与数组推算不一致（懒 materialize）。
function zyDecideLayout(input) {
  const o = input || {};
  const out = {
    ok: true, code: "OK", multi: false, versionCount: 1, totalLen: 0,
    current: { vIdx: 0, side: "front", canvasIdx: 0, source: null, materialized: false },
    dom: { liCount: null, currentLiIdx: null, currentGroupIdx: null },
    conflicts: [], hardConflicts: []
  };
  const totalLen = (zyIsNum(o.totalLen) && o.totalLen >= 0) ? o.totalLen : 0;
  out.totalLen = totalLen;
  const liCount = zyIsNum(o.domLiCount) && o.domLiCount > 0 ? o.domLiCount : null;
  const curLiIdx = zyIsNum(o.domCurrentLiIdx) && o.domCurrentLiIdx >= 0 ? o.domCurrentLiIdx : null;
  const curGroupIdx = zyIsNum(o.domCurrentGroupIdx) && o.domCurrentGroupIdx >= 0 ? o.domCurrentGroupIdx : null;
  out.dom.liCount = liCount;
  out.dom.currentLiIdx = curLiIdx;
  out.dom.currentGroupIdx = curGroupIdx;
  const arrVersionCount = zyVersionCountOf(totalLen);
  const versionCount = liCount != null ? liCount : arrVersionCount;
  out.versionCount = versionCount;
  out.multi = versionCount > 1;
  const cc = (zyIsNum(o.currentCanvasNum) && o.currentCanvasNum >= 1) ? (o.currentCanvasNum - 1) : null;
  let canvasIdx = cc;
  let cs = cc != null ? "canvasObjVO.currentCanvasNum" : null;
  if (canvasIdx == null && curGroupIdx != null) { canvasIdx = curGroupIdx; cs = "domCurrentGroup"; }
  if (canvasIdx == null) { canvasIdx = 0; cs = "default0"; }
  out.current.canvasIdx = canvasIdx;
  out.current.vIdx = zyVersionOfCanvasIndex(canvasIdx);
  out.current.side = zySideOfCanvasIndex(canvasIdx);
  out.current.source = cs;
  out.current.materialized = (canvasIdx >= 0 && canvasIdx < totalLen);
  if (cc != null && curGroupIdx != null && cc !== curGroupIdx) out.hardConflicts.push("currentCanvasNum(" + cc + ")!=domCurrentGroup(" + curGroupIdx + ")");
  if (!out.current.materialized) out.hardConflicts.push("CURRENT_VERSION_NOT_MATERIALIZED(idx=" + canvasIdx + ",len=" + totalLen + ")");
  if (curLiIdx != null && curLiIdx !== out.current.vIdx) out.conflicts.push("liCurrent(" + curLiIdx + ")!=vIdx(" + out.current.vIdx + ")");
  if (liCount != null && arrVersionCount !== liCount) out.conflicts.push("domLiCount(" + liCount + ")!=arrVersionCount(" + arrVersionCount + ")");
  if (out.hardConflicts.length) { out.ok = false; out.code = "MULTI_LAYOUT_CONFLICT:" + out.hardConflicts.join("|"); }
  return out;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    zySnapshotHashOf: zySnapshotHashOf,
    zySnapshotHashItems: zySnapshotHashItems,
    zySnapshotItemWithSlot: zySnapshotItemWithSlot,
    zyBuildTemplateSnapshot: zyBuildTemplateSnapshot,
    zyCanvasIndexOf: zyCanvasIndexOf,
    zyVersionOfCanvasIndex: zyVersionOfCanvasIndex,
    zySideOfCanvasIndex: zySideOfCanvasIndex,
    zyVersionCountOf: zyVersionCountOf,
    zyDecideLayout: zyDecideLayout
  };
}