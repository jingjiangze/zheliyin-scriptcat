// =====================================================================
// 折立印名片套版助手 - Editor Object Identity（OCR-P1 Commit 4.2 / 任务书 §五）
// ---------------------------------------------------------------------
// 目标：Native Anchor 命中的对象必须复用「同一 identity」而非再造 textbox：
//     native OCR row → native anchor → same object identity → 几何校准 → 落位
// 能力（纯函数，node 可测）：
//   snapshotIdentity(obj)            —— 提取真实 identity 键集（原生 uuid/multiUuid
//                                       优先；退化用 zyOcrKey/zyOcrObjectId 弱比较）
//   sameIdentity(a, b)               —— 前后 snapshot 是否同一对象（uuid/multiUuid 为准）
//   assertSingleIdentityPerBlock(objs)—— 同一 block 不得产生多个 object identity
//   neverFabricateIdentity(obj)      —— anchor 失败时不得伪造 identity（无真实身份 → 拒绝）
// 铁律：
//   - uuid / multiUuid = 编辑器原生真实身份字段（page-bridge 读取来源）；
//   - 两者皆无时允许 zyOcrKey / zyOcrObjectId{txId,pageId,blockId} 退化比较，
//     但绝不把「位置相近」当作身份；
//   - 确无身份字段的对象：退回「按 block 新建」语义，不能伪装成已有 identity。
// =====================================================================
"use strict";

function str(v) { return (v == null ? null : String(v)); }

// 提取对象可比较身份。返回 { strong: {uuid, multiUuid}, weak: {...}, ok: boolean }
function snapshotIdentity(o) {
  if (!o) return { ok: false, reasons: ["no-object"] };
  var uuid = str(o.uuid) || null;
  var multiUuid = str(o.multiUuid) || null;
  var markuuid = str(o.markuuid) || null;
  var oid = o.zyOcrObjectId || null;
  var zyOcrKey = str(o.zyOcrKey) || null;
  var strong = { uuid: uuid, multiUuid: multiUuid };
  var weak = {
    zyOcrKey: zyOcrKey,
    txId: oid && str(oid.transactionId) != null ? String(oid.transactionId) : null,
    pageId: oid && str(oid.pageId) != null ? String(oid.pageId) : null,
    blockId: oid && oid.blockId != null ? String(oid.blockId) : null,
    objectUuid: oid && str(oid.objectUuid) != null ? String(oid.objectUuid) : null,
    markuuid: markuuid
  };
  var hasStrong = !!(strong.uuid || strong.multiUuid);
  var hasWeak = !!(weak.zyOcrKey || weak.txId || (weak.objectUuid) || weak.markuuid);
  return { ok: hasStrong || hasWeak, strong: strong, weak: weak, hasStrong: hasStrong, hasWeak: hasWeak, reasons: hasStrong || hasWeak ? [] : ["no-identity-field"] };
}

// 前后 snapshot 是否同一对象（强身份优先；退化用 zyOcrKey 或 txId+blockId）
function sameIdentity(a, b) {
  var sa = a && typeof a.uuid !== "undefined" ? a : snapshotIdentity(a);
  var sb = b && typeof b.uuid !== "undefined" ? b : snapshotIdentity(b);
  var A = snapshotIdentity(a), B = snapshotIdentity(b);
  if (!A.ok || !B.ok) return false;
  if (A.hasStrong && B.hasStrong) {
    if (A.strong.uuid && B.strong.uuid) return A.strong.uuid === B.strong.uuid;
    if (A.strong.multiUuid && B.strong.multiUuid) return A.strong.multiUuid === B.strong.multiUuid;
  }
  if (A.weak.zyOcrKey && B.weak.zyOcrKey) return A.weak.zyOcrKey === B.weak.zyOcrKey;
  if (A.weak.txId && B.weak.txId && A.weak.blockId != null && B.weak.blockId != null) {
    return A.weak.txId === B.weak.txId && A.weak.blockId === B.weak.blockId;
  }
  if (A.weak.objectUuid && B.weak.objectUuid) return A.weak.objectUuid === B.weak.objectUuid;
  return false;
}

// 同一 block（blockId 相同）不得产生多个 object identity。返回 { ok, violations: [{blockId, identities, ids}] }
function assertSingleIdentityPerBlock(objects) {
  var objs = Array.isArray(objects) ? objects : [];
  var byBlock = {};
  objs.forEach(function (o) {
    if (!o) return;
    var varid = (o.zyOcrObjectId && o.zyOcrObjectId.blockId != null) ? String(o.zyOcrObjectId.blockId) : Math.random().toString(16).slice(2);
    var s = snapshotIdentity(o);
    if (!byBlock[varid]) byBlock[varid] = { rawId: o.zyOcrObjectId && o.zyOcrObjectId.blockId, identities: [] };
    byBlock[varid].identities.push({ uuid: s.strong.uuid, multiUuid: s.strong.multiUuid, zyOcrKey: s.weak.zyOcrKey });
  });
  var violations = [];
  Object.keys(byBlock).forEach(function (k) {
    var b = byBlock[k];
    var ids = b.identities.map(function (x) { return JSON.stringify(x); });
    var uniq = ids.filter(function (v, i) { return ids.indexOf(v) === i; });
    if (uniq.length > 1) violations.push({ blockId: b.rawId, identities: b.identities, ids: ids });
  });
  return { ok: violations.length === 0, violations: violations };
}

// anchor 失败时不得伪造 identity：无任何真实身份字段 → 明确拒绝。
function neverFabricateIdentity(o) {
  var s = snapshotIdentity(o);
  if (!s.ok) return { ok: false, code: "NO_IDENTITY", reasons: s.reasons };
  return { ok: true, source: s.hasStrong ? (s.strong.uuid ? "uuid" : "multiUuid") : "weak" };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  snapshotIdentity: snapshotIdentity,
  sameIdentity: sameIdentity,
  assertSingleIdentityPerBlock: assertSingleIdentityPerBlock,
  neverFabricateIdentity: neverFabricateIdentity
};
