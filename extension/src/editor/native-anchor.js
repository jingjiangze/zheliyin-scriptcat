// =====================================================================
// 折立印名片套版助手 - Native Canvas Anchor（Stage 9 方案 Commit 1）
// ---------------------------------------------------------------------
// 职责：纯数据/纯逻辑 —— 把页面世界采集到的「原生 Canvas textbox 原始字段」
// 归一化成 plain-object snapshot（§四数据结构）。本模块：
//   禁止 DOM / Fabric 运行时 / OCR / AI / 业务字段逻辑；
//   页面 world 只负责采集真实对象字段，交给 buildAnchorSnapshot 归一化。
// 位置优先级（§五）：P0=aCoords（视觉终态真值）> P1=fabric transform > P2=editor location*。
// 若 P0 与 P2 不一致：只记录 NATIVE_ANCHOR_GEOMETRY_CONSISTENCY 标志，禁止拿 P2 覆盖 P0。
// node 可单测（tests/editor-object-model/native-anchor.test.js）。
// =====================================================================
"use strict";

function NUM(v) { return (typeof v === "number" && isFinite(v)) ? v : null; }
function STR(v) { return (typeof v === "string" && v !== "") ? v : null; }
function BOOL(v) { return (v === true || v === false) ? v : null; }

// ---- P0：aCoords 归一化（四角 + center + 视觉宽高 + 角度）----
// 输入必须已 setCoords（四角为最终视觉几何）；非四角结构返回 null。
function normalizeACoords(raw) {
  var ac = (raw && typeof raw === "object") ? raw : {};
  var tl = ac.tl, tr = ac.tr, br = ac.br, bl = ac.bl;
  var pts = [tl, tr, br, bl];
  if (!pts.every(function (p) { return p && typeof p.x === "number" && typeof p.y === "number"; })) return null;
  var cx = (tl.x + tr.x + br.x + bl.x) / 4;
  var cy = (tl.y + tr.y + br.y + bl.y) / 4;
  var wTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  var wBot = Math.hypot(br.x - bl.x, br.y - bl.y);
  var hLef = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  var hRig = Math.hypot(br.x - tr.x, br.y - tr.y);
  var angle = Math.atan2(tr.y - tl.y, tr.x - tl.x) * 180 / Math.PI;
  return {
    tl: { x: tl.x, y: tl.y }, tr: { x: tr.x, y: tr.y },
    br: { x: br.x, y: br.y }, bl: { x: bl.x, y: bl.y },
    center: { x: cx, y: cy },
    visualWidth: (wTop + wBot) / 2,
    visualHeight: (hLef + hRig) / 2,
    angle: angle
  };
}

// ---- 采集原始字段 → Native Anchor Snapshot（§四结构；primitive only）----
function buildAnchorSnapshot(input) {
  var o = input || {};
  var ac = normalizeACoords(o.aCoords);
  var text = STR(o.text);
  var gConsistency = null;
  if (ac && o.locationX != null && o.locationWidth != null) {
    // P0 center vs P2 中心（location 中心换算：假定 location 系与 canvas 同原点）
    var p0cx = ac.center.x, p0cy = ac.center.y;
    var p2cx = (NUM(o.locationX) + (NUM(o.locationWidth) || 0) / 2) * (NUM(o.scaleX) != null ? NUM(o.scaleX) : 1);
    var p2cy = (NUM(o.locationY) + (NUM(o.locationHeight) || 0) / 2) * (NUM(o.scaleY) != null ? NUM(o.scaleY) : 1);
    if (Math.abs(p0cx - p2cx) > 1 || Math.abs(p0cy - p2cy) > 1) gConsistency = "NATIVE_ANCHOR_GEOMETRY_CONSISTENCY";
  }
  var isTextBox = o.type === "textbox" || o.type === "i-text" || o.type === "text";
  return {
    pageId: o.pageId != null ? String(o.pageId) : null,
    side: STR(o.side) || null,
    objectType: STR(o.type) || null,
    isTextBox: !!isTextBox,
    identity: {
      uuid: STR(o.uuid) || null,
      markuuid: STR(o.markuuid) || null,
      layerNum: NUM(o.layerNum),
      objectIndex: NUM(o.objectIndex)
    },
    sourceText: {
      rawText: text,
      textLength: text ? text.length : 0,
      type: isTextBox ? "TEXT" : (o.sourceTextType || null)
    },
    geometry: {
      left: NUM(o.left), top: NUM(o.top),
      width: NUM(o.width), height: NUM(o.height),
      scaleX: NUM(o.scaleX), scaleY: NUM(o.scaleY),
      angle: ac ? ac.angle : NUM(o.angle), // P0-first: aCoords-derived visual rotation; fallback P1 raw
      originX: STR(o.originX) || null, originY: STR(o.originY) || null,
      aCoords: ac,
      center: ac ? ac.center : null,
      visualWidth: ac ? ac.visualWidth : null,
      visualHeight: ac ? ac.visualHeight : null
    },
    editorGeometry: {
      locationX: NUM(o.locationX), locationY: NUM(o.locationY),
      locationWidth: NUM(o.locationWidth), locationHeight: NUM(o.locationHeight),
      locationRotation: NUM(o.locationRotation)
    },
    style: {
      fontFamily: STR(o.fontFamily) || null,
      fontSize: NUM(o.fontSize),
      fontWeight: STR(o.fontWeight) || null,
      fontStyle: STR(o.fontStyle) || null,
      lineHeight: NUM(o.lineHeight),
      charSpacing: NUM(o.charSpacing),
      textAlign: STR(o.textAlign) || null,
      fill: STR(o.fill) || null,
      stroke: STR(o.stroke) || null,
      strokeWidth: NUM(o.strokeWidth)
    },
    actualInk: {
      width: NUM(o.inkWidth), height: NUM(o.inkHeight), lineCount: NUM(o.inkLineCount)
    },
    flags: {
      visible: BOOL(o.visible), selectable: BOOL(o.selectable), evented: BOOL(o.evented),
      isDesign: BOOL(o.isDesign), isEdit: BOOL(o.isEdit),
      isLineText: BOOL(o.isLineText), isPreview: BOOL(o.isPreview)
    },
    consistency: gConsistency
  };
}

// ---- 汇总统计（纯函数）----
function summarizeAnchors(anchors) {
  var a = Array.isArray(anchors) ? anchors : [];
  var withACoords = 0, withLocation = 0, emptyText = 0, consistency = 0;
  a.forEach(function (x) {
    if (x.geometry && x.geometry.aCoords) withACoords += 1;
    if (x.editorGeometry && x.editorGeometry.locationX != null) withLocation += 1;
    if (!x.sourceText || !x.sourceText.rawText) emptyText += 1;
    if (x.consistency === "NATIVE_ANCHOR_GEOMETRY_CONSISTENCY") consistency += 1;
  });
  return {
    total: a.length,
    textbox: a.filter(function (x) { return x.isTextBox; }).length,
    withACoords: withACoords,
    withLocation: withLocation,
    emptyText: emptyText,
    consistency: consistency
  };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  normalizeACoords, buildAnchorSnapshot, summarizeAnchors
};