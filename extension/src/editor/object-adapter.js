// =====================================================================
// 折立印名片套版助手 - Editor Object Adapter（Stage 5.0）
// ---------------------------------------------------------------------
// 职责：真实编辑器裸对象 ⇄ 纯数据模型 的适配层（只读 + 最小 text mutation）。
// 第一版只实现 READ + SET TEXT（§二十八）；CREATE/DELETE 待 5.1 依据审计结论再补。
// 约束：本模块不持有 canvas 定位/协议逻辑（那是 page-bridge 的职责，§三十）；
//       不触发保存（§三十九 in-memory only）；不修改 page-bridge.js 现有 apply 链（§三十一）。
// 依赖：object-model.js（parseEditorObject / zy* 工具），必须在其后加载。
// =====================================================================
"use strict";

// model 来源：node require 或浏览器顶层函数（与 field-core/config-core 双形态一致）
var zyModel = (function () {
  if (typeof module !== "undefined" && module.exports) return require("./object-model");
  if (typeof window !== "undefined" && typeof window.parseEditorObject === "function") return window;
  if (typeof globalThis !== "undefined" && typeof globalThis.parseEditorObject === "function") return globalThis;
  return null;
})();
// 本地工具：优先复用 model 暴露的归一函数，Node 隔离作用域时兜底
var zyNum = zyModel && typeof zyModel.zyNum === "function" ? zyModel.zyNum : function (v) { return typeof v === "number" && isFinite(v) ? v : null; };
var zyStr = zyModel && typeof zyModel.zyStr === "function" ? zyModel.zyStr : function (v) { return v == null ? null : String(v); };

// 文字层判据（与 page-bridge isTextObject 保持行为一致：type 在 text/i-text/textbox/curvedtext
// 或对象直接带 string text；叠加编辑器媒体类型 mediaMediaType=text）
function zyIsTextObject(raw) {
  if (!raw) return false;
  const type = String(raw.type || "").toLowerCase();
  if (["text", "textbox", "i-text", "curvedtext"].indexOf(type) >= 0) return true;
  if (typeof raw.text === "string") return true;
  const mediaType = String(raw.mediaMediaType || (raw.media && raw.media.mediaType) || "").toLowerCase();
  return mediaType.indexOf("text") >= 0;
}

// 读对象 → 纯数据模型
function zyReadObject(raw, side, index) {
  return zyModel && typeof zyModel.parseEditorObject === "function" ? zyModel.parseEditorObject(raw, side, index) : null;
}

// 只读工具（直接读裸对象，不依赖 model）
function zyGetIdentity(raw) {
  return { markuuid: zyStr(raw && raw.markuuid), uuid: zyStr(raw && raw.uuid), type: zyStr(raw && raw.type), subType: zyStr(raw && raw.subType) };
}
function zyGetGeometry(raw) {
  const o = raw || {};
  return { left: zyNum(o.left), top: zyNum(o.top), width: zyNum(o.width), height: zyNum(o.height), scaleX: zyNum(o.scaleX), scaleY: zyNum(o.scaleY), angle: zyNum(o.angle) };
}
function zyGetStyle(raw) {
  const o = raw || {};
  return { fontFamily: zyStr(o.fontFamily), fontSize: zyNum(o.fontSize), fontWeight: zyStr(o.fontWeight), fontStyle: zyStr(o.fontStyle), lineHeight: zyNum(o.lineHeight), charSpacing: zyNum(o.charSpacing), textAlign: zyStr(o.textAlign), fill: zyStr(o.fill) };
}

// 最小 text mutation（in-memory）：与 page-bridge setObjectText 一致的安全写入。
// 已知副作用（§三十七/§三十八 实测）：textbox 高度随行数自动换行（width/scale/font 不受影响）。
function zyWriteText(raw, value) {
  if (!raw || typeof value === "undefined" || value === null) return false;
  const text = String(value);
  if (typeof raw.setText === "function") raw.setText(text);
  else if (typeof raw.set === "function") raw.set("text", text);
  else raw.text = text;
  raw.text = text;
  raw.dirty = true;
  if (typeof raw.initDimensions === "function") raw.initDimensions();
  if (typeof raw.setCoords === "function") raw.setCoords();
  return true;
}

// 导出：node require 与浏览器全局
if (typeof module !== "undefined" && module.exports) {
  module.exports = { zyIsTextObject, zyReadObject, zyGetIdentity, zyGetGeometry, zyGetStyle, zyWriteText };
}