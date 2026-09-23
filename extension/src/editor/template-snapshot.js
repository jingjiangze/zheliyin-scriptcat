// =====================================================================
// 折立印名片套版助手 - Template Snapshot（Stage 10-G L 阶 Commit 01）
// ---------------------------------------------------------------------
// 定位：把「画布文字层清单」升级为「严格正反隔离的模板快照」——
//   front → front canvas；back → back canvas；back 缺失 = null；
//   绝不把 front 冒充 back（曾经 findCanvasForSide 回退导致 46g real 中
//   backAbsent=true 却拿到 front 内容）。
// 契约（与 page-bridge 内联镜像逐字一致，页面 world 无法 require）：
//   - buildTemplateSnapshot({ frontItems, backItems, page })
//       → { ok, page, front:{exists,side,items}, back:{exists,side,items}, snapshotHash }
//   - snapshotHashOf(items)  → FNV-1a 32bit 确定性 hash（仅状态比对，非安全用途）
//   - withSlotId(item, side, index) → item + slotId（"front-N"/"back-N"，N 从 1 起）
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

// 构建严格正反快照（front/back 各自独立；back 缺失 → exists:false, items:null）
function zyBuildTemplateSnapshot(input) {
  const o = input || {};
  const frontRaw = Array.isArray(o.frontItems) ? o.frontItems : null;
  const backRaw = Array.isArray(o.backItems) ? o.backItems : null;
  const frontItems = frontRaw ? frontRaw.map((it, i) => zySnapshotItemWithSlot(it, "front", i)) : null;
  const backItems = backRaw ? backRaw.map((it, i) => zySnapshotItemWithSlot(it, "back", i)) : null;
  const page = o.page || null;
  const snapshotHash = zySnapshotHashOf((frontItems || []).concat(backItems || []));
  return {
    ok: true,
    page: page,
    front: { exists: !!frontItems, side: "front", items: frontItems },
    back: { exists: !!backItems, side: "back", items: backItems },
    snapshotHash: snapshotHash,
    count: { front: frontItems ? frontItems.length : 0, back: backItems ? backItems.length : 0 }
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { zySnapshotHashOf: zySnapshotHashOf, zySnapshotItemWithSlot: zySnapshotItemWithSlot, zyBuildTemplateSnapshot: zyBuildTemplateSnapshot };
}