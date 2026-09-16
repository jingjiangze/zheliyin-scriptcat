// =====================================================================
// 折立印名片套版助手 - Editor Object Model（Stage 5.0）
// ---------------------------------------------------------------------
// 真实折立印编辑器对象的数据模型（纯数据，无 fabric/DOM 依赖，无 AI 依赖）。
// 来源：Stage 5.0 真实对象审计（runtime/reports/stage5-object-snapshot.json）
//   — 对象类型实测 6 种：textbox / image / path / group / rect / line（文字层全部为 textbox）
//   — identity 实测：markuuid（跨 reload 稳定、SVG 组内共享）；uuid（会话级实例 id，reload 重新生成）
//   — setText 仅改变 text + height（textbox 自动换行），width/scale/font 稳定（object-mutation 实测）
// 约束：本模块禁止持有 raw Fabric object 引用（§二十六），禁止业务逻辑/AI。
// 加载方式与 field-core/config-core 同模式（userscript @require / 扩展 manifest / node 测试三形态共享）。
// =====================================================================
"use strict";

// 数值归一：非有限数值返回 null
function zyNum(v) {
  return typeof v === "number" && isFinite(v) ? v : null;
}
function zyStr(v) {
  return v == null ? null : String(v);
}
function zyBool(v) {
  return v === true;
}

// 对象类型分组（实测：type=textbox 为唯一文字层载体；line 为辅助参考线）
function zyObjectKind(raw) {
  const type = zyStr(raw && raw.type) || "";
  const lower = type.toLowerCase();
  if (["textbox", "i-text", "text", "curvedtext"].indexOf(lower) >= 0) return "text";
  if (lower === "image") return "image";
  if (lower === "line") return "line"; // 参考线（无业务字段）
  if (lower === "group") return "group";
  if (lower === "path" || lower === "rect") return "graphic";
  return "unknown";
}

// 模型归一（原始对象 → 纯数据 EditorObject；未知字段置 null，绝不含 raw 引用）
function parseEditorObject(raw, side, index) {
  const o = raw || {};
  const mediaType = zyStr(o.mediaMediaType);
  const type = zyStr(o.type) || mediaType || "unknown";
  const subType = zyStr(o.subType) || mediaType || null;
  const isTextKind = zyObjectKind(o) === "text" || typeof o.text === "string";
  const text = isTextKind ? zyStr(o.text) || "" : null;
  return {
    identity: {
      side: zyStr(side) || "front",
      index: typeof index === "number" ? index : null,
      markuuid: zyStr(o.markuuid),
      uuid: zyStr(o.uuid),
      type: type,
      subType: subType,
      kind: zyObjectKind(o),
      isText: isTextKind
    },
    geometry: {
      left: zyNum(o.left), top: zyNum(o.top),
      width: zyNum(o.width), height: zyNum(o.height),
      scaleX: zyNum(o.scaleX), scaleY: zyNum(o.scaleY),
      angle: zyNum(o.angle), skewX: zyNum(o.skewX), skewY: zyNum(o.skewY),
      originX: zyStr(o.originX), originY: zyStr(o.originY)
    },
    style: {
      fontFamily: zyStr(o.fontFamily), fontSize: zyNum(o.fontSize),
      fontWeight: zyStr(o.fontWeight), fontStyle: zyStr(o.fontStyle),
      lineHeight: zyNum(o.lineHeight), charSpacing: zyNum(o.charSpacing),
      textAlign: zyStr(o.textAlign), fill: zyStr(o.fill),
      stroke: zyStr(o.stroke), strokeWidth: zyNum(o.strokeWidth)
    },
    content: isTextKind ? { text: text, textLen: text.length } : null,
    transform: {
      visible: zyBool(o.visible), opacity: zyNum(o.opacity),
      flipX: zyBool(o.flipX), flipY: zyBool(o.flipY)
    },
    interaction: {
      selectable: zyBool(o.selectable), evented: zyBool(o.evented)
    },
    editor: {
      layerNum: zyNum(o.layerNum),
      locationX: zyNum(o.locationX), locationY: zyNum(o.locationY),
      locationWidth: zyNum(o.locationWidth), locationHeight: zyNum(o.locationHeight),
      locationRotation: zyNum(o.locationRotation),
      mediaMediaType: mediaType
    },
    runtimeFlags: {
      isDesign: zyBool(o.isDesign), isEdit: zyBool(o.isEdit),
      isLineText: zyBool(o.isLineText), isComposite: zyBool(o.isComposite),
      isPreview: zyBool(o.isPreview), isDisplay: zyBool(o.isDisplay),
      lastSafeText: zyStr(o.lastSafeText)
    }
  };
}

// 序列化合规校验：返回的模型不得包含对象引用（用于测试断言）
function assertPureData(model) {
  JSON.stringify(model); // throw on circular
  return true;
}

// 导出：node require 与浏览器全局
if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseEditorObject, zyObjectKind, zyNum, zyStr, zyBool, assertPureData };
}