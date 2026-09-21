// =====================================================================
// 折立印名片套版助手 - Native Layer Contract（Stage 10-C）
// ---------------------------------------------------------------------
// 职责：纯数据/纯逻辑 —— 定义「Native Create Success」四层证据判定：
//   A canvasObject（canvas.getObjects 含新对象）
//   B nativeLayerRegistered（canvasObjInfo.canvasToProductObjArr 含同一对象或其可证明对应）
//   C nativeIdentity（uuid / multiUuid / layerNum 至少其一；字段存在 ≠ 已注册，单独成层）
//   D productRegistered（新对象已进入原生产品数据链 / serializer 可见）
// 提供 verifyNativeLayer / verifyNativeIdentity / verifyNativeProductRegistration /
//   buildLayerEvidence（页面世界采集 → 本模块判定 → {ok,code,failed,checks}）
// 以及 CREATE_NATIVE_UNAVAILABLE / CREATE_NATIVE_LAYER_FAILED 语义与整批回滚契约。
// 复用 native-create-measure.js 的 registry mismatch / objectDelta / verifyCleanup 判定。
// 本模块：禁止 DOM / 禁止 Fabric 运行时 / 禁止网络 / 禁止业务写操作；node 可单测。
// 页面世界只负责采集原始字段（对象存在性/数组包含/身份字段/序列化可见性），交给本模块判定。
// =====================================================================
"use strict";

function NUM(v) { return (typeof v === "number" && isFinite(v)) ? v : null; }
function STR(v) { return (v == null ? null : String(v)); }

// ---- 身份字段非空判定（C 层：字段存在性；不等于已注册）----
function identityFields(obj) {
  if (!obj) return null;
  const uuid = STR(obj.uuid) || null;
  const multiUuid = STR(obj.multiUuid) || null;
  const markuuid = STR(obj.markuuid) || null;
  const layerNum = NUM(obj.layerNum);
  const present = { uuid: !!uuid, multiUuid: !!multiUuid, markuuid: (markuuid || "") !== "", layerNum: layerNum != null };
  const any = present.uuid || present.multiUuid || present.layerNum;
  return {
    ok: any,
    present: present,
    fields: { uuid: uuid, multiUuid: multiUuid, markuuid: markuuid, layerNum: layerNum },
    reason: any ? "identity-field-present" : "NO_IDENTITY_FIELD"
  };
}

// ---- A+B 层：Canvas 对象 + Native Layer 数组包含 ----
// canvasObject: obj 是否在 canvas.getObjects()
// layerArrayHas: canvasToProductObjArr 中是否包含同一对象（=== 或可证明对应）
function layerRegistrationEvidence(o) {
  const canvasObject = !!(o && o.canvasObject);
  const layerArrayHas = !!(o && o.layerArrayHas);
  const registryDeltaOk = (o && o.registryDelta != null) ? o.registryDelta === 1 : null;
  const mismatch = canvasObject && (layerArrayHas !== true) && (registryDeltaOk !== true);
  return {
    ok: canvasObject && (layerArrayHas === true || registryDeltaOk === true),
    canvasObject: canvasObject,
    nativeLayerRegistered: layerArrayHas === true,
    registryDelta: registryDeltaOk,
    mismatch: mismatch,
    code: mismatch ? "CANVAS_WITHOUT_LAYER" : (canvasObject && (layerArrayHas === true || registryDeltaOk === true) ? "LAYER_REGISTERED" : "NOT_REGISTERED")
  };
}

// ---- D 层：Product JSON / serializer 注册（页面世界采集可序列化证据后判定）----
// 输入允许为空（未知），未知不等同于失败（§契约：无证据必须真机补测；判定层不猜）
function productRegistrationEvidence(o) {
  const d = o || {};
  const serializerSees = (typeof d.serializerSees === "boolean") ? d.serializerSees : null;
  const productJsonSees = (typeof d.productJsonSees === "boolean") ? d.productJsonSees : null;
  const seen = (serializerSees === true) || (productJsonSees === true);
  const explicitlyMissing = (serializerSees === false) || (productJsonSees === false);
  return {
    ok: seen,
    productRegistered: seen,
    serializerSees: serializerSees,
    productJsonSees: productJsonSees,
    unknown: serializerSees == null && productJsonSees == null,
    explicitlyMissing: explicitlyMissing,
    code: seen ? "PRODUCT_REGISTERED" : (explicitlyMissing ? "PRODUCT_NOT_REGISTERED" : "PRODUCT_UNKNOWN")
  };
}

// ---- 汇总：Native Create Success（§3 契约 A→D）----
// evidence: { canvasObject, layerArrayHas, registryDelta, uuid, multiUuid, markuuid, layerNum,
//            serializerSees, productJsonSees, beforeCount, afterCount }
function verifyNativeLayer(evidence) {
  const e = evidence || {};
  const ident = identityFields({ uuid: e.uuid, multiUuid: e.multiUuid, markuuid: e.markuuid, layerNum: e.layerNum });
  const layer = layerRegistrationEvidence({ canvasObject: e.canvasObject, layerArrayHas: e.layerArrayHas, registryDelta: e.registryDelta });
  const product = productRegistrationEvidence({ serializerSees: e.serializerSees, productJsonSees: e.productJsonSees });
  const checks = { layer: layer, identity: ident, product: product };
  const failed = [];
  if (!layer.ok) failed.push("LAYER:" + layer.code);
  if (!ident.ok) failed.push("IDENTITY:" + (ident.reason || "NO_IDENTITY"));
  if (product.explicitlyMissing) failed.push("PRODUCT:" + product.code);
  if (!layer.ok || !ident.ok || product.explicitlyMissing) {
    return { ok: false, code: "CREATE_NATIVE_LAYER_FAILED", failed: failed, checks: checks, evidence: e };
  }
  // product UNKNOWN（未采集）不判失败，但显式标记需真机补测（契约 §3 D/E）
  return { ok: true, code: "OK", productUnknown: product.unknown, failed: [], checks: checks, evidence: e };
}

// ---- 创建前/后 inventory 差（E 层：创建前 N → 创建后 N+1）----
function inventoryDeltaEvidence(o) {
  const d = o || {};
  const before = NUM(d.beforeCount);
  const after = NUM(d.afterCount);
  const layerBefore = NUM(d.layerBeforeCount);
  const layerAfter = NUM(d.layerAfterCount);
  const canvasDelta = (before != null && after != null) ? after - before : null;
  const layerDelta = (layerBefore != null && layerAfter != null) ? layerAfter - layerBefore : null;
  return {
    canvasDelta: canvasDelta,
    layerDelta: layerDelta,
    canvasOk: canvasDelta === 1,
    layerOk: layerDelta === 1,
    ok: (canvasDelta === null && layerDelta === null) ? null : (canvasDelta === 1 && layerDelta === 1),
    code: (canvasDelta === 1 && layerDelta === 1) ? "INVENTORY_PLUS_ONE" : ((canvasDelta != null && layerDelta != null) ? "INVENTORY_MISMATCH" : "INVENTORY_UNKNOWN")
  };
}

// ---- CREATE_NATIVE_UNAVAILABLE 语义（§4：diy 不可用 → 立即停止，禁止 mirror fallback 假成功）----
function nativeUnavailable(reason) {
  return { ok: false, code: "CREATE_NATIVE_UNAVAILABLE", reason: reason || "diy-unavailable", mirrorFallbackForbidden: true };
}

// ---- 整批回滚契约（§5）：返回回滚所需目标状态 ----
function rollbackContract(o) {
  const d = o || {};
  return {
    ok: true,
    createdZero: true,
    removeObjects: (d.createdObjects || []).length,
    restoreLayerArray: !!(d.restoreLayerArray),
    restoreProductArray: !!(d.restoreProductArray),
    restoreUndo: !!(d.restoreUndo),
    reply: { ok: false, code: "CREATE_NATIVE_LAYER_FAILED", created: [], createdCount: 0, detectedBlocks: d.detectedBlocks != null ? d.detectedBlocks : 0 }
  };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  identityFields, layerRegistrationEvidence, productRegistrationEvidence,
  verifyNativeLayer, inventoryDeltaEvidence, nativeUnavailable, rollbackContract
};
