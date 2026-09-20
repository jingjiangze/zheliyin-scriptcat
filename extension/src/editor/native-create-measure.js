// =====================================================================
// 折立印名片套版助手 - Native Create → Measure（Stage 9 方案 Commit 3）
// ---------------------------------------------------------------------
// 职责：纯数据/纯逻辑 —— 原生创建前后差异、刚建对象识别（禁止 text-only 优先）、
// 快照归一、requested vs actual 几何差、placement error、identity 提取、三层一致性
// （Fabric transform ↔ aCoords ↔ editor location*）、registry/product 注册核对、
// cleanup 恢复验证、setText/fontSize/rotation 突变行为分类、单位换算 round-trip。
// 本模块：禁止 DOM / Fabric 运行时 / Canvas / OCR / Network；node 可单测。
// 页面世界只负责真实操作（drawText / setCoords / 采集原始字段），本模块负责判断与归一。
// 对象识别优先级（§十一）：NATIVE_RETURN > REGISTRY_DELTA > OBJECT_DELTA > MULTIUUID
// > UUID > LAYERNUM > CREATION_ORDER > TEXT_FALLBACK（text 仅最后兜底）。
// =====================================================================
"use strict";

function NUM(v) { return (typeof v === "number" && isFinite(v)) ? v : null; }
function STR(v) { return (v == null ? null : String(v)); }

// 规范身份键（多源归一；无任何身份则 null）
function canonId(o) {
  if (!o) return null;
  return STR(o.multiUuid) || STR(o.uuid) || STR(o.id) || null;
}

// ---- §八 对象/注册表差集 ----
function objectDelta(beforeIds, afterIds) {
  const b = new Set(beforeIds || []);
  const a = new Set(afterIds || []);
  const added = (afterIds || []).filter((x) => x != null && !b.has(x));
  const removed = (beforeIds || []).filter((x) => x != null && !a.has(x));
  return { before: (beforeIds || []).length, after: (afterIds || []).length, delta: (afterIds || []).length - (beforeIds || []).length, addedIds: added, removedIds: removed };
}

// ---- §十一 刚建对象识别（多级优先级，text 最后）----
// before/after: [{key, uuid, multiUuid, layerNum, text}...]；nativeReturnId: drawText 返回值可序列化身份
function identifyNewlyCreated(opts) {
  const o = opts || {};
  const before = o.before || [], after = o.after || [];
  const matchBy = (fn) => {
    const idxs = [];
    after.forEach((x, i) => { if (fn(x)) idxs.push(i); });
    return idxs.length === 1 ? idxs[0] : null;
  };
  const idMatch = (id) => (id == null ? null : matchBy((x) => canonId(x) === id || x.uuid === id || x.multiUuid === id));
  // 1 NATIVE_RETURN
  if (o.nativeReturnId != null) {
    const i = idMatch(o.nativeReturnId);
    if (i != null) return { index: i, recoverySource: "NATIVE_RETURN", confidence: 8, reason: "native drawText returned identity matched after-object" };
  }
  // 2 REGISTRY_DELTA（注册表新增身份能链接到对象）
  const regDelta = objectDelta(o.beforeRegistry, o.afterRegistry);
  if (regDelta.addedIds.length === 1) {
    const i = idMatch(regDelta.addedIds[0]);
    if (i != null) return { index: i, recoverySource: "REGISTRY_DELTA", confidence: 7, reason: "canvasToProductObjArr +1 identity linked to object" };
  }
  // 3 OBJECT_DELTA（画布对象增一且身份唯一）
  const objDelta = objectDelta(before.map(canonId), after.map(canonId));
  if (objDelta.addedIds.length === 1) {
    const i = idMatch(objDelta.addedIds[0]);
    if (i != null) return { index: i, recoverySource: "OBJECT_DELTA", confidence: 6, reason: "canvas object delta +1 identity linked" };
  }
  // 4 MULTIUUID（新增 multiUuid 唯一）
  const beforeMulti = new Set(before.map((x) => x.multiUuid).filter((x) => x != null));
  const i4 = matchBy((x) => x.multiUuid != null && !beforeMulti.has(x.multiUuid));
  if (i4 != null) return { index: i4, recoverySource: "MULTIUUID", confidence: 5, reason: "unique new multiUuid" };
  // 5 UUID
  const beforeUuid = new Set(before.map((x) => x.uuid).filter((x) => x != null));
  const i5 = matchBy((x) => x.uuid != null && !beforeUuid.has(x.uuid));
  if (i5 != null) return { index: i5, recoverySource: "UUID", confidence: 4, reason: "unique new uuid" };
  // 6 LAYERNUM（新增 layerNum 唯一）
  const beforeLayer = new Set(before.map((x) => x.layerNum).filter((x) => x != null));
  const i6 = matchBy((x) => x.layerNum != null && !beforeLayer.has(x.layerNum));
  if (i6 != null) return { index: i6, recoverySource: "LAYERNUM", confidence: 3, reason: "unique new layerNum" };
  // 7 CREATION_ORDER（追加序：after 尾部新增对象）
  if (after.length > before.length) {
    const i7 = after.length - 1;
    return { index: i7, recoverySource: "CREATION_ORDER", confidence: 2, reason: "object appended at tail after create" };
  }
  // 8 TEXT_FALLBACK（必须唯一；多个同文本 → 歧义拒绝，避免“取最后一个”）
  if (o.sentinelText != null) {
    const i8 = matchBy((x) => String(x.text || "") === String(o.sentinelText));
    if (i8 != null) return { index: i8, recoverySource: "TEXT_FALLBACK", confidence: 1, reason: "sentinel text unique match (fallback only)" };
  }
  return { index: null, recoverySource: "NONE", confidence: 0, reason: "no reliable identity delta" };
}

// ---- §十 requested vs actual 几何差 ----
function geometryDiff(requested, actual) {
  const r = requested || {}, a = actual || {};
  const reqW = NUM(r.width), reqH = NUM(r.height), reqL = NUM(r.left), reqT = NUM(r.top);
  const actW = NUM(a.visualWidth) != null ? a.visualWidth : (NUM(a.width) != null ? NUM(a.width) * (NUM(a.scaleX) != null ? a.scaleX : 1) : null);
  const actH = NUM(a.visualHeight) != null ? a.visualHeight : (NUM(a.height) != null ? NUM(a.height) * (NUM(a.scaleY) != null ? a.scaleY : 1) : null);
  const actC = (a.center && NUM(a.center.x) != null && NUM(a.center.y) != null) ? a.center : (NUM(a.left) != null && actW != null ? { x: a.left + actW / 2, y: NUM(a.top) + actH / 2 } : null);
  const reqC = (reqL != null && reqT != null && reqW != null && reqH != null) ? { x: reqL + reqW / 2, y: reqT + reqH / 2 } : null;
  const centerError = (reqC && actC) ? Math.hypot(actC.x - reqC.x, actC.y - reqC.y) : null;
  const angleDiff = (NUM(a.angle) != null && NUM(r.angle) != null) ? ((a.angle - r.angle + 540) % 360) - 180 : null;
  return {
    requested: r, actual: a,
    requestedCenter: reqC, actualCenter: actC,
    leftError: (reqL != null && NUM(a.left) != null) ? a.left - reqL : null,
    topError: (reqT != null && NUM(a.top) != null) ? a.top - reqT : null,
    centerError: centerError,
    placementError: centerError,
    widthError: (reqW != null && actW != null) ? actW - reqW : null,
    heightError: (reqH != null && actH != null) ? actH - reqH : null,
    angleError: angleDiff,
    fontSizeError: (NUM(r.fontSize) != null && NUM(a.fontSize) != null) ? a.fontSize - r.fontSize : null,
    actualVisualWidth: actW, actualVisualHeight: actH
  };
}

// ---- §十三 registry 失配 ----
function checkRegistryMismatch(d) {
  const o = d || {};
  const canvasDelta = NUM(o.canvasDelta) != null ? o.canvasDelta : 0;
  const registryDelta = NUM(o.registryDelta) != null ? o.registryDelta : 0;
  const mismatch = canvasDelta > 0 && registryDelta === 0;
  return { canvasDelta: canvasDelta, registryDelta: registryDelta, mismatch: mismatch, code: mismatch ? "NATIVE_CREATE_REGISTRY_MISMATCH" : "OK" };
}

// ---- §十八 三层一致性（Fabric ↔ aCoords ↔ location）----
function consistencyChecks(o) {
  const fabric = o.fabric || {}, ac = o.aCoords || {}, loc = o.location || {};
  const issues = [];
  const dist = (p, q) => (p && q && NUM(p.x) != null && NUM(q.x) != null) ? Math.hypot(q.x - p.x, q.y - p.y) : null;
  const centerF = (NUM(fabric.left) != null && NUM(fabric.width) != null) ? { x: fabric.left + fabric.width * (NUM(fabric.scaleX) != null ? fabric.scaleX : 1) / 2, y: NUM(fabric.top) + fabric.height * (NUM(fabric.scaleY) != null ? fabric.scaleY : 1) / 2 } : null;
  const centerAC = ac.center || null;
  if (centerF && centerAC && dist(centerF, centerAC) > 1) issues.push({ pair: "FABRIC_ACOORDS", dx: centerAC.x - centerF.x, dy: centerAC.y - centerF.y, code: "NATIVE_GEOMETRY_INCONSISTENT" });
  const centerL = (NUM(loc.locationX) != null && NUM(loc.locationWidth) != null) ? { x: loc.locationX + loc.locationWidth / 2, y: NUM(loc.locationY) + loc.locationHeight / 2 } : null;
  if (centerAC && centerL && dist(centerAC, centerL) > 1) issues.push({ pair: "ACOORDS_LOCATION", dx: centerL.x - centerAC.x, dy: centerL.y - centerAC.y, code: "NATIVE_GEOMETRY_INCONSISTENT" });
  return { consistent: issues.length === 0, issues: issues };
}

// ---- §二十八 cleanup 恢复验证（允许 render/cache/timestamp 类非业务差异）----
function verifyCleanup(before, after) {
  const b = before || {}, a = after || {};
  const objectRestored = (b.objectCount == null || a.objectCount == null) ? null : (b.objectCount === a.objectCount);
  const registryRestored = (b.registryCount == null || a.registryCount == null) ? null : (b.registryCount === a.registryCount);
  const textAnchorRestored = (b.textAnchorCount == null || a.textAnchorCount == null) ? null : (b.textAnchorCount === a.textAnchorCount);
  return {
    restored: !(objectRestored === false || registryRestored === false || textAnchorRestored === false),
    objectRestored: objectRestored, registryRestored: registryRestored, textAnchorRestored: textAnchorRestored,
    diffs: { objectCount: (b.objectCount != null && a.objectCount != null) ? a.objectCount - b.objectCount : null, registryCount: (b.registryCount != null && a.registryCount != null) ? a.registryCount - b.registryCount : null, textAnchorCount: (b.textAnchorCount != null && a.textAnchorCount != null) ? a.textAnchorCount - b.textAnchorCount : null }
  };
}

// ---- §三十二/§三十三 突变行为分类（文本/字号替换后位置/尺寸是否保持）----
function classifyMutation(rows, label) {
  const arr = Array.isArray(rows) ? rows : [];
  const num = (v) => (typeof v === "number" ? v : null);
  const first = arr[0] || {};
  const last = arr[arr.length - 1] || {};
  const d = (k) => (num(first[k]) != null && num(last[k]) != null) ? last[k] - first[k] : null;
  const deltas = {};
  ["left", "top", "width", "height", "fontSize", "angle"].forEach((k) => { if (d(k) != null) deltas[k] = Math.round(d(k) * 1000) / 1000; });
  const moved = (Math.abs(d("left") || 0) > 0.5) || (Math.abs(d("top") || 0) > 0.5);
  const sizeVerdict = (Math.abs(d("height") || 0) > 0.5) ? "heightAutoChanged" : "heightStable";
  return {
    mutation: label || "mutation",
    steps: arr.length,
    deltas: deltas,
    positionVerdict: moved ? "Native_FontMutation_Repositions" : "Native_FontMutation_PositionStable",
    sizeVerdict: sizeVerdict, widthDelta: d("width"), heightDelta: d("height")
  };
}

// ---- §二十 单位换算 round-trip ----
function dimensionRoundTrip(o) {
  const widthMm = NUM(o.widthMm), heightMm = NUM(o.heightMm);
  const widthPx = NUM(o.widthPx), heightPx = NUM(o.heightPx);
  const rW = NUM(o.recoveredWidthMm), rH = NUM(o.recoveredHeightMm);
  const widthErrorMm = (widthMm != null && rW != null) ? rW - widthMm : null;
  const heightErrorMm = (heightMm != null && rH != null) ? rH - heightMm : null;
  const ok = (widthErrorMm != null && Math.abs(widthErrorMm) < 0.5) && (heightErrorMm != null && Math.abs(heightErrorMm) < 0.5);
  return { widthMm: widthMm, heightMm: heightMm, widthPx: widthPx, heightPx: heightPx, recoveredWidthMm: rW, recoveredHeightMm: rH, widthErrorMm: widthErrorMm, heightErrorMm: heightErrorMm, roundTripOk: ok };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  canonId, objectDelta, identifyNewlyCreated, geometryDiff, checkRegistryMismatch,
  consistencyChecks, verifyCleanup, classifyMutation, dimensionRoundTrip
};