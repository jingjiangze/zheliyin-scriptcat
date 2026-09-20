// runtime/stage9/recognition-mode.test.js — Stage 9 V4 §十七~§二十八：Recognition Mode（NEW/CALIBRATION/RETRY）单测
// 覆盖：
//   1) recognition-mode.js 纯函数路由规则（空画布→NEW / 同图重识别→RETRY / 已有文字不同图→CAL）
//   2) page-bridge getTextInventory 只读清单（不改画布）
//   3) page-bridge ocrCalibrate：所有权门禁（切页→PAGE_IDENTITY_CHANGED STOP）+ 更新现有对象（不复制）
//      + 池外补齐新建 + 正反隔离（back 对象不被 front 校准触碰）
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const RM = require(path.join(ROOT, "extension", "src", "ocr", "recognition-mode.js"));

let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); } }

// ---------------- 1) 纯函数路由 ----------------
t("resolve: 空画布 → NEW_RECOGNITION", () => {
  const r = RM.resolveRecognitionMode({ pageId: "canvas:c0", imageFingerprint: "img-a", existingTextObjects: [], previousTransactions: [] });
  assert.strictEqual(r.mode, RM.MODE_NEW);
  assert.strictEqual(r.existingCount, 0);
});
t("resolve: 已有文字 + 不同图 → CALIBRATION_RECOGNITION + sourceImageChanged", () => {
  const r = RM.resolveRecognitionMode({ pageId: "canvas:c0", imageFingerprint: "img-b", existingTextObjects: [{ text: "旧" }], previousTransactions: [{ pageId: "canvas:c0", imageFingerprint: "img-a" }] });
  assert.strictEqual(r.mode, RM.MODE_CAL);
  assert.strictEqual(r.existingCount, 1);
  assert.strictEqual(r.sourceImageChanged, true);
});
t("resolve: 已有文字 + 同图 + 最近事务 → RECOGNITION_RETRY", () => {
  const r = RM.resolveRecognitionMode({ pageId: "canvas:c0", imageFingerprint: "img-a", existingTextObjects: [{ text: "旧" }], previousTransactions: [{ pageId: "canvas:c0", imageFingerprint: "img-a" }] });
  assert.strictEqual(r.mode, RM.MODE_RETRY);
  assert.strictEqual(r.sameImage, true);
});
t("resolve: 已有文字 + 无最近事务 → CALIBRATION（不误判 RETRY）", () => {
  const r = RM.resolveRecognitionMode({ pageId: "canvas:c0", imageFingerprint: "img-c", existingTextObjects: [{}], previousTransactions: [] });
  assert.strictEqual(r.mode, RM.MODE_CAL);
});
t("resolve: 他页事务不影响本页判定（正反各自独立）", () => {
  const r = RM.resolveRecognitionMode({ pageId: "canvas:c1", imageFingerprint: "img-a", existingTextObjects: [{}], previousTransactions: [{ pageId: "canvas:c0", imageFingerprint: "img-a" }] });
  assert.strictEqual(r.mode, RM.MODE_CAL);
});

// ---------------- 2)+3) page-bridge 行为 ----------------
const pbSrc = fs.readFileSync(path.join(ROOT, "extension", "src", "editor", "page-bridge.js"), "utf8");
function loadBridge(win, doc, loc) {
  const fn = new Function("window", "document", "location", "console", pbSrc + "\n;return typeof pageBridge === 'function' ? pageBridge : null;");
  const pb = fn(win, doc, loc, console);
  assert.ok(typeof pb === "function");
  return pb;
}
function makeObj(over) {
  const o = Object.assign({ text: "x", fontSize: 12, width: 120, height: 24, left: 10, top: 10, angle: 0, type: "text", uuid: "u" + Math.random().toString(36).slice(2, 8), fontFamily: "Arial", fontWeight: "normal", fontStyle: "normal" }, over || {});
  o.set = function (cfg) { Object.keys(cfg || {}).forEach(function (k) { o[k] = cfg[k]; }); };
  o.setText = function (v) { this.text = String(v || ""); };
  o.initDimensions = function () {};
  o.setCoords = function () {};
  o.aCoords = { tl: { x: o.left, y: o.top }, tr: { x: o.left + (o.width || 100), y: o.top }, br: { x: o.left + (o.width || 100), y: o.top + (o.height || 20) }, bl: { x: o.left, y: o.top + (o.height || 20) } };
  return o;
}
function makeCanvas(objects) {
  const c = { _objs: objects || [], _setCoords: 0, width: 400, height: 300, _renders: 0 };
  c.getObjects = function () { return c._objs; };
  c.add = function (o) { c._objs.push(o); };
  c.remove = function (o) { const i = c._objs.indexOf(o); if (i >= 0) c._objs.splice(i, 1); };
  c.requestRenderAll = function () { c._renders += 1; };
  c.setCoords = function () { c._setCoords += 1; };
  return c;
}
function freshCal() {
  const frontCanvas = makeCanvas([]);
  const backCanvas = makeCanvas([]);
  const frontA = makeObj({ text: "旧公司", top: 20, left: 10, fontSize: 16, uuid: "FA-1", multiUuid: "mv-front-a" });
  const frontB = makeObj({ text: "旧电话", top: 60, left: 10, fontSize: 12, uuid: "FB-2", multiUuid: "mv-front-b" });
  const backA = makeObj({ text: "反面旧", top: 20, left: 10, fontSize: 14, uuid: "BA-1", multiUuid: "mv-back-a" });
  frontCanvas._objs.push(frontA, frontB);
  backCanvas._objs.push(backA);
  const win = {
    CanvasObjVO: { totalCanvasArray: [{ idName: "c0", canvas: frontCanvas }, { idName: "c1", canvas: backCanvas }], currentCanvasNum: 1, frontImgPathStr: "/f.png", backImgPathStr: "/b.png" },
    addEventListener: function (type, fn) { win._h = fn; }, postMessage: function () {}
  };
  // fabric for createTextObject（校准补齐路径）
  class MockTextC { constructor(text, opts) { this.text = text || ""; this.type = "text"; Object.assign(this, opts || {}); this.uuid = "c" + Math.random().toString(36).slice(2, 8); } set(o) { Object.assign(this, o); } setText(v) { this.text = String(v || ""); } initDimensions() {} setCoords() {} }
  win.fabric = { Textbox: MockTextC, IText: MockTextC, Text: MockTextC };
  const doc = { querySelector: function () { return null; } };
  const loc = { origin: "https://diy.zheliyin.com" };
  const pb = loadBridge(win, doc, loc);
  pb();
  const dispatch = function (type, payload) { win._h({ source: win, data: Object.assign({ source: "zy-card-assistant", type: type }, payload || {}) }); };
  return { win, frontCanvas, backCanvas, frontA, frontB, backA, dispatch, post: () => win._posted };
}

t("getTextInventory: 只读清单（上排/下排/反面各一）", () => {
  const F = freshCal();
  F.win.postMessage = function (d) { F.win._posted = d; };
  F.dispatch("getTextInventory");
  const r = F.post();
  assert.ok(r && r.type === "getTextInventoryResult" && r.ok === true);
  assert.strictEqual(r.pageId, "canvas:c0");
  assert.strictEqual(r.items.length, 2, "只枚举当前页(c0)文字");
  assert.strictEqual(r.items[0].text, "旧公司");
  assert.ok(r.items[0].objectUuid && r.items[0].fontSize === 16 && typeof r.items[0].center.x === "number");
  assert.strictEqual(F.frontCanvas.getObjects().length, 2, "只读：对象数不变");
});

t("ocrCalibrate: 更新现有对象（不复制）+ 缺行补齐 + 正反隔离", () => {
  const F = freshCal();
  F.win.postMessage = function (d) { F.win._posted = d; };
  // 3 行校准：2 行更新 + 1 行池外补齐。front 为当前页（c0），items 带 tx 标识。
  F.dispatch("ocrCalibrate", { pageId: "canvas:c0", transactionId: "txcal1", imageFingerprint: "img-b", items: [
    { blockIndex: 0, text: "佛山盛盈包装制品有限公司", top: 15, left: 8, fontSize: 18, fontFamily: "SimHei" },
    { blockIndex: 1, text: "Tel.:0757-88809856", top: 58, left: 10, fontSize: 13 },
    { blockIndex: 2, text: "新增地址行", top: 120, left: 10, fontSize: 11 }
  ] });
  const r = F.post();
  assert.ok(r && r.type === "ocrCalibrateResult" && r.ok === true);
  assert.strictEqual(r.calibrated.length, 2, "两行更新现有");
  assert.strictEqual(r.created.length, 1, "一行补齐新建");
  assert.strictEqual(F.frontA.text, "佛山盛盈包装制品有限公司");
  assert.strictEqual(F.frontA.fontSize, 18);
  assert.strictEqual(F.frontA.fontFamily, "SimHei");
  assert.strictEqual(F.frontB.text, "Tel.:0757-88809856");
  // object identity 保持（不删除重建）
  assert.ok(F.frontCanvas.getObjects().indexOf(F.frontA) >= 0 && F.frontCanvas.getObjects().indexOf(F.frontB) >= 0);
  assert.strictEqual(F.frontCanvas.getObjects().length, 3, "2 旧更新 + 1 补齐新建 = 3（无复制）");
  // 反面对象零触碰
  assert.strictEqual(F.backA.text, "反面旧");
  // 新建对象带事务 key/身份
  const newObj = F.frontCanvas.getObjects().find(function (o) { return o.zyOcrObjectId && o.zyOcrObjectId.transactionId === "txcal1" && o.text === "新增地址行"; });
  assert.ok(newObj, "补齐行挂事务身份");
  assert.strictEqual(newObj.zyOcrKey, "zy-ocr-txcal1-2");
});

t("ocrCalibrate: 校准期间切页 → PAGE_IDENTITY_CHANGED 整批 STOP，两侧零修改", () => {
  const F = freshCal();
  F.win.CanvasObjVO.currentCanvasNum = 2; // 用户已切到反面
  F.win.postMessage = function (d) { F.win._posted = d; };
  F.dispatch("ocrCalibrate", { pageId: "canvas:c0", transactionId: "txcal2", items: [{ blockIndex: 0, text: "不应写入", top: 15, left: 8, fontSize: 22 }] });
  const r = F.post();
  assert.ok(r && r.type === "ocrCalibrateResult" && r.ok === false);
  assert.strictEqual(r.code, "PAGE_IDENTITY_CHANGED");
  assert.strictEqual(F.frontA.text, "旧公司", "正面未被修改");
  assert.strictEqual(F.backA.text, "反面旧", "反面未被修改");
});

console.log("recognition-mode.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);