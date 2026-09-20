// tests/editor-object-model/native-anchor.test.js — Stage 9 方案 Commit 1：Native Anchor Snapshot 纯逻辑单测
"use strict";
const assert = require("assert");
const path = require("path");
const A = require(path.join(__dirname, "..", "..", "extension", "src", "editor", "native-anchor.js"));

let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); } }

const rawTextBox = {
  pageId: "canvas:c0", side: "FRONT", type: "textbox",
  text: "客户经理", uuid: "u-111", markuuid: "m-111", layerNum: 3, objectIndex: 1,
  left: 200, top: 100, width: 120, height: 34, scaleX: 1, scaleY: 1, angle: 0,
  originX: "left", originY: "top",
  aCoords: { tl: { x: 200, y: 100 }, tr: { x: 320, y: 100 }, br: { x: 320, y: 134 }, bl: { x: 200, y: 134 } },
  locationX: 190, locationY: 95, locationWidth: 120, locationHeight: 34, locationRotation: 0,
  fontFamily: "思源黑体", fontSize: 20, fontWeight: "bold", fontStyle: "normal",
  lineHeight: 1.2, charSpacing: 0, textAlign: "left", fill: "#000000", stroke: null, strokeWidth: 0,
  inkWidth: 90, inkHeight: 18, inkLineCount: 1,
  visible: true, selectable: true, evented: true, isDesign: false, isEdit: false, isLineText: false, isPreview: false
};

t("snapshot 基本字段 + primitive only", () => {
  const s = A.buildAnchorSnapshot(rawTextBox);
  assert.strictEqual(s.isTextBox, true);
  assert.strictEqual(s.identity.uuid, "u-111");
  assert.strictEqual(s.sourceText.rawText, "客户经理");
  assert.strictEqual(s.sourceText.textLength, 4);
  // 必须是可 JSON 序列化 plain object（禁止塞 Fabric 对象）
  const round = JSON.parse(JSON.stringify(s));
  assert.deepStrictEqual(round, s);
  assert.strictEqual(round.geometry.aCoords.tl.x, 200);
});

t("aCoords 归一化：center / visualWidth / angle", () => {
  const s = A.buildAnchorSnapshot(rawTextBox);
  const g = s.geometry;
  assert.strictEqual(g.center.x, 260);
  assert.strictEqual(g.center.y, 117);
  assert.strictEqual(g.visualWidth, 120);
  assert.strictEqual(g.visualHeight, 34);
  assert.strictEqual(g.angle, 0);
});

t("旋转 aCoords 的角度与视觉尺寸", () => {
  const s = A.buildAnchorSnapshot(Object.assign({}, rawTextBox, {
    aCoords: { tl: { x: 100, y: 10 }, tr: { x: 110, y: 0 }, br: { x: 120, y: 40 }, bl: { x: 110, y: 50 } }
  }));
  const ang = s.geometry.angle;
  assert.ok(Math.abs(ang - (-45)) < 1e-6 || Math.abs(ang - 45) < 1e-6, "angle=" + ang);
  assert.strictEqual(s.geometry.visualHeight > 30, true);
});

t("缺失 aCoords → geometry.aCoords = null（不崩溃）", () => {
  const s = A.buildAnchorSnapshot(Object.assign({}, rawTextBox, { aCoords: undefined }));
  assert.strictEqual(s.geometry.aCoords, null);
  assert.strictEqual(s.geometry.center, null);
  assert.strictEqual(s.consistency, null);
});

t("非文本对象（image/rect）不被当 textbox", () => {
  const img = A.buildAnchorSnapshot(Object.assign({}, rawTextBox, { type: "image" }));
  assert.strictEqual(img.isTextBox, false);
  assert.strictEqual(img.sourceText.type, null);
});

t("P0/P2 一致性标志：中心差 >1px → NATIVE_ANCHOR_GEOMETRY_CONSISTENCY", () => {
  const s = A.buildAnchorSnapshot(rawTextBox); // 260,117 vs location 190+60=250, 95+17=112 → diff 10,5 → 标志
  assert.strictEqual(s.consistency, "NATIVE_ANCHOR_GEOMETRY_CONSISTENCY");
  const s2 = A.buildAnchorSnapshot(Object.assign({}, rawTextBox, { locationX: 200, locationY: 100, aCoords: { tl: { x: 200, y: 100 }, tr: { x: 320, y: 100 }, br: { x: 320, y: 134 }, bl: { x: 200, y: 134 } } }));
  assert.strictEqual(s2.consistency, null);
});

t("summarizeAnchors 统计", () => {
  const list = [A.buildAnchorSnapshot(rawTextBox), A.buildAnchorSnapshot(Object.assign({}, rawTextBox, { type: "image" })), A.buildAnchorSnapshot(Object.assign({}, rawTextBox, { text: null, aCoords: undefined }))];
  const sum = A.summarizeAnchors(list);
  assert.strictEqual(sum.total, 3);
  assert.strictEqual(sum.textbox, 2); // 第三条 type 仍为 textbox(仅 text:null)，按类型计数 -> 2
  assert.strictEqual(sum.withACoords, 2);
  assert.strictEqual(sum.emptyText, 1);
  assert.strictEqual(sum.withLocation, 3);
});

t("类型强制：非法值置 null 不抛", () => {
  const s = A.buildAnchorSnapshot(Object.assign({}, rawTextBox, { left: null, fontSize: "20", locationX: NaN, aCoords: { tl: { x: 1 }, tr: null, br: { x: 2, y: 3 }, bl: { x: 4, y: 5 } } }));
  assert.strictEqual(s.geometry.left, null);
  assert.strictEqual(s.style.fontSize, null);
  assert.strictEqual(s.editorGeometry.locationX, null);
  assert.strictEqual(s.geometry.aCoords, null);
});

console.log("native-anchor.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);