// =====================================================================
// 折立印名片套版助手 - Native Anchor Style Apply（Stage 9 Commit 4.6-C）
// ---------------------------------------------------------------------
// 单一事实来源：Anchor MATCH 命中后，「完整同步目标样式/几何」的纯函数。
// page-bridge.js 中 zyAnchorMatch MATCH 分支为其页面世界镜像（逐逻辑一致）。
//
// 规则（任务书 §10/§11）：
//   identity = 原生对象（uuid/multiUuid/markuuid/zyOcrObjectId 保持不变，本模块绝不触碰）
//   geometry = 当前 OCR/Visual Target（left/top/width/height/angle）
//   typography = 当前 OCR visual evidence（fontSize）
//   style = 当前可靠 style evidence（fontFamily/fontWeight/fontStyle）
//   fill 仅在可靠颜色证据（it.fill 存在）时更新，否则保留原生 fill
//   绝对禁止：Anchor MATCH → 删除 → 新建
//
// 对象接口抽象（兼容 fabric object / plain object）：
//   obj.set(props) / obj.setText(text) / obj.setCoords() 可选；
//   无 set 时回退属性直写（obj.key = value）。
//
// API：
//   buildAnchorStyleProps(it) -> { props, numKeys, strKeys }
//   applyAnchorStyleToObject(obj, it, opts) -> { applied, textUpdated, fillUpdated,
//                                                identityPreserved, numKeys, strKeys }
// 本模块为 @require 注入 + node 单测。
// =====================================================================
"use strict";

var NUM_KEYS = ["left", "top", "width", "height", "angle", "fontSize"];
var STR_KEYS = ["fontFamily", "fontWeight", "fontStyle"];

// 从 OCR/Visual Target item 提取合法样式/几何属性（过滤 null / 非法数值 / 空串）。
// width/height/fontSize 必须 > 0（0 → 拒绝，保留原生）；left/top/angle 允许任意有限数。
function buildAnchorStyleProps(it) {
  var o = it || {};
  var props = {}, numKeys = [], strKeys = [];
  for (var i = 0; i < NUM_KEYS.length; i += 1) {
    var k = NUM_KEYS[i];
    var v = o[k];
    if (v == null || typeof v !== "number" || !isFinite(v)) continue;
    if (k === "left" || k === "top" || k === "angle") { props[k] = v; numKeys.push(k); }
    else if (v > 0) { props[k] = v; numKeys.push(k); }
  }
  for (var j = 0; j < STR_KEYS.length; j += 1) {
    var s = STR_KEYS[j];
    var sv = o[s];
    if (sv != null && String(sv).length) { props[s] = String(sv); strKeys.push(s); }
  }
  return { props: props, numKeys: numKeys, strKeys: strKeys };
}

// 应用样式/几何到对象（identity 不动）。
// opts = { syncBusiness: Function|null, markTarget: String|null }
function applyAnchorStyleToObject(obj, it, opts) {
  var o = opts || {};
  var target = obj;
  if (!target) return { applied: false, reason: "no-object", textUpdated: false, fillUpdated: false, identityPreserved: true, numKeys: [], strKeys: [] };
  var b = buildAnchorStyleProps(it);
  var props = b.props, numKeys = b.numKeys, strKeys = b.strKeys;
  var textUpdated = false, fillUpdated = false;
  try {
    var newText = (it != null && typeof it.text === "string") ? it.text : null;
    if (newText != null && String(target.text || "") !== String(newText)) {
      if (typeof target.setText === "function") target.setText(newText);
      else target.text = newText;
      textUpdated = true;
    }
  } catch (eText) {}
  var appliedKeys = [];
  try {
    if (Object.keys(props).length) {
      if (typeof target.set === "function") { target.set(props); appliedKeys = Object.keys(props); }
      else { Object.keys(props).forEach(function (k) { target[k] = props[k]; }); appliedKeys = Object.keys(props); }
    }
  } catch (eStyle) {}
  try {
    if (it != null && it.fill) {
      if (typeof target.set === "function") target.set({ fill: it.fill });
      else target.fill = it.fill;
      fillUpdated = true;
    }
  } catch (eFill) {}
  try { if (typeof target.setCoords === "function") target.setCoords(); } catch (eCoords) {}
  if (typeof o.syncBusiness === "function") { try { o.syncBusiness(target); } catch (eBiz) {} }
  var markTarget = o.markTarget || "zyAnchorStyleApplied";
  try {
    target[markTarget] = { geometry: numKeys.slice(), style: strKeys.slice(), fillUpdated: fillUpdated, textUpdated: textUpdated, identity: "native-preserved" };
  } catch (eMark) {}
  return { applied: appliedKeys.length > 0, appliedKeys: appliedKeys, textUpdated: textUpdated, fillUpdated: fillUpdated, identityPreserved: true, numKeys: numKeys, strKeys: strKeys };
}

module.exports = {
  NUM_KEYS: NUM_KEYS,
  STR_KEYS: STR_KEYS,
  buildAnchorStyleProps: buildAnchorStyleProps,
  applyAnchorStyleToObject: applyAnchorStyleToObject
};
