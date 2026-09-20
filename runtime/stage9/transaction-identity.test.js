// runtime/stage9/transaction-identity.test.js — Stage 9 V4 P1：OCR Transaction Identity
// 覆盖：
//   1) transaction-identity.js 纯函数（fingerprint / createTransaction / validateTransactionIdentity）
//   2) page-bridge ocrAdjust Page Ownership 硬门禁（§五）：
//        a) 当前页 === source page → 允许校准（key 按 transactionId 限定）
//        b) 校准期间切页 → PAGE_IDENTITY_CHANGED → 整批 STOP（items=[]，禁止自动找另一画布）
//        c) 正反同 blockIndex 对象隔离（只动本事务键对象）
//        d) 旧调用（无 pageId）保留兼容
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const TI = require(path.join(ROOT, "extension", "src", "ocr", "transaction-identity.js"));

let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message, e.stack ? e.stack.split("\n").slice(0, 4).join("\n") : ""); } }

// ---------------- 1) 纯函数 ----------------
t("fingerprintImage: 同图内容 → 同指纹", () => {
  const a = TI.fingerprintImage("data:image/png;base64,AAAABBBB");
  const b = TI.fingerprintImage("data:image/png;base64,AAAABBBB");
  assert.strictEqual(a, b);
  assert.ok(/^img-[0-9a-f]+-\d+$/.test(a));
});
t("fingerprintImage: 不同内容 → 不同指纹", () => {
  const a = TI.fingerprintImage("data:image/png;base64,AAAABBBB");
  const b = TI.fingerprintImage("data:image/png;base64,AAAABBBC");
  assert.notStrictEqual(a, b);
});
t("createTransaction: 字段齐备 + side 归一", () => {
  const tx = TI.createTransaction({ pageId: "canvas:c0", side: "FRONT", canvasId: "c0", dataUrl: "xx", imageWidth: 800, imageHeight: 500, now: 1700000000000 });
  assert.ok(/^tx-[0-9a-z]+-[0-9a-z]+$/.test(tx.transactionId));
  assert.strictEqual(tx.pageId, "canvas:c0");
  assert.strictEqual(tx.side, "FRONT");
  assert.strictEqual(tx.canvasId, "c0");
  assert.ok(tx.imageFingerprint.startsWith("img-"));
  assert.strictEqual(tx.imageWidth, 800);
  assert.strictEqual(tx.imageHeight, 500);
  assert.strictEqual(tx.createdAt, 1700000000000);
});
t("createTransaction: 两次调用 transactionId 唯一", () => {
  const a = TI.createTransaction({ pageId: "p", now: 1700000000000 });
  const b = TI.createTransaction({ pageId: "p", now: 1700000000000 });
  assert.notStrictEqual(a.transactionId, b.transactionId);
});
t("validateTransactionIdentity: 完整事务 → OK", () => {
  const tx = TI.createTransaction({ pageId: "canvas:c0", dataUrl: "x" });
  const r = TI.validateTransactionIdentity(tx);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.code, "OK");
});
t("validateTransactionIdentity: 缺字段 → TX_* 硬失败", () => {
  assert.strictEqual(TI.validateTransactionIdentity(null).code, "TX_MISSING");
  assert.strictEqual(TI.validateTransactionIdentity({ pageId: "p", imageFingerprint: "img" }).code, "TX_NO_ID");
  assert.strictEqual(TI.validateTransactionIdentity({ transactionId: "t" }).code, "TX_NO_PAGE");
  assert.strictEqual(TI.validateTransactionIdentity({ transactionId: "t", pageId: "p" }).code, "TX_NO_FINGERPRINT");
});

// ---------------- 2) page-bridge ocrAdjust 所有权门禁 ----------------
const PB_PATH = path.join(ROOT, "extension", "src", "editor", "page-bridge.js");
const pbSrc = fs.readFileSync(PB_PATH, "utf8");

function loadBridge(win, doc, loc) {
  // page-bridge.js 顶层声明 function pageBridge(){...}（@require 语义：沙箱共享作用域）。
  // node 下借助 new Function 构造作用域取回该函数（不执行其内容以外的全局代码）。
  const fn = new Function("window", "document", "location", "console", pbSrc + "\n;return typeof pageBridge === 'function' ? pageBridge : null;");
  const pb = fn(win, doc, loc, console);
  assert.ok(typeof pb === "function", "page-bridge 应可加载");
  return pb;
}

function makeObj(over) {
  const o = Object.assign({
    text: "x", fontSize: 12, width: 120, height: 24, left: 10, top: 10, angle: 0, type: "text",
    zyOcrKey: null
  }, over || {});
  o.set = function (cfg) { Object.keys(cfg || {}).forEach(function (k) { o[k] = cfg[k]; }); };
  o.setCoords = function () {};
  o.aCoords = { tl: { x: o.left, y: o.top }, tr: { x: o.left + (o.width || 100), y: o.top }, br: { x: o.left + (o.width || 100), y: o.top + (o.height || 20) }, bl: { x: o.left, y: o.top + (o.height || 20) } };
  return o;
}
function makeCanvas(objects) {
  const c = { _objs: objects || [], width: 400, height: 300, _renders: 0 };
  c.getObjects = function () { return c._objs; };
  c.add = function (o) { c._objs.push(o); };
  c.remove = function (o) { const i = c._objs.indexOf(o); if (i >= 0) c._objs.splice(i, 1); };
  c.requestRenderAll = function () { c._renders += 1; };
  return c;
}

function freshBridge() {
  const frontCanvas = makeCanvas([]);
  const backCanvas = makeCanvas([]);
  const frontObj = makeObj({ zyOcrKey: "zy-ocr-tx9-3", fontSize: 12 });
  const backObj = makeObj({ zyOcrKey: "zy-ocr-tx9-3", fontSize: 12 });
  const oldFront = makeObj({ zyOcrKey: "zy-ocr-3", fontSize: 10 }); // 旧（无 tx）key 兼容
  frontCanvas._objs.push(frontObj, oldFront);
  backCanvas._objs.push(backObj);
  const win = {
    CanvasObjVO: { totalCanvasArray: [{ idName: "c0", canvas: frontCanvas }, { idName: "c1", canvas: backCanvas }], currentCanvasNum: 1, frontImgPathStr: "/f.png", backImgPathStr: "/b.png" },
    addEventListener: function (type, fn) { win._h = fn; }, postMessage: function () {}
  };
  const doc = { querySelector: function () { return null; } };
  const loc = { origin: "https://diy.zheliyin.com" };
  const pb = loadBridge(win, doc, loc);
  pb();
  const dispatch = function (payload) { win._h({ source: win, data: Object.assign({ source: "zy-card-assistant", type: "ocrAdjust" }, payload || {}) }); };
  return { win, frontCanvas, backCanvas, frontObj, backObj, oldFront, dispatch, lastPost: () => win._posted };
}

t("ocrAdjust: source page 当前激活 → 校准成功（front tx9 block3 命中，back 同名块不动）", () => {
  const F = freshBridge();
  F.win.postMessage = function (d) { F.win._posted = d; };
  F.dispatch({ pageId: "canvas:c0", transactionId: "tx9", imageFingerprint: "img-f-10", items: [{ blockIndex: 3, corrections: { fontSize: 20 } }] });
  const r = F.lastPost();
  assert.ok(r && r.type === "ocrAdjustResult", "应回 ocrAdjustResult");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.pageId, "canvas:c0");
  assert.strictEqual(r.transactionId, "tx9");
  assert.strictEqual(r.items.length, 1);
  const it = r.items[0];
  assert.strictEqual(it.ok, true, "item 应 ok");
  assert.strictEqual(F.frontObj.fontSize, 20, "正面 tx9 块被校准");
  assert.strictEqual(F.backObj.fontSize, 12, "反面同名块不被触碰（正反隔离）");
});

t("ocrAdjust: 校准期间切页（当前=back，请求=front）→ PAGE_IDENTITY_CHANGED 整批 STOP", () => {
  const F = freshBridge();
  F.win.CanvasObjVO.currentCanvasNum = 2; // 用户已切到反面
  F.win.postMessage = function (d) { F.win._posted = d; };
  F.dispatch({ pageId: "canvas:c0", transactionId: "tx9", imageFingerprint: "img-f-10", items: [{ blockIndex: 3, corrections: { fontSize: 30 } }] });
  const r = F.lastPost();
  assert.ok(r && r.type === "ocrAdjustResult");
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "PAGE_IDENTITY_CHANGED");
  assert.strictEqual(r.items.length, 0, "整批 STOP，零校正项");
  assert.strictEqual(F.frontObj.fontSize, 12, "正面对象不被修改");
  assert.strictEqual(F.backObj.fontSize, 12);
});

t("ocrAdjust: 请求页未知 → ADJUST_BLOCKED_PAGE_NOT_FOUND", () => {
  const F = freshBridge();
  F.win.postMessage = function (d) { F.win._posted = d; };
  F.dispatch({ pageId: "canvas:zz", transactionId: "tx9", items: [{ blockIndex: 3, corrections: { fontSize: 20 } }] });
  const r = F.lastPost();
  assert.ok(r && r.ok === false && r.code === "ADJUST_BLOCKED_PAGE_NOT_FOUND");
});

t("ocrAdjust: 旧调用（无 pageId/tx）兼容 → side 定位 + 旧 key", () => {
  const F = freshBridge();
  F.win.postMessage = function (d) { F.win._posted = d; };
  F.dispatch({ side: "front", items: [{ blockIndex: 3, corrections: { fontSize: 16 } }] });
  const r = F.lastPost();
  assert.strictEqual(r.ok, true);
  assert.strictEqual(F.oldFront.fontSize, 16, "旧 key zy-ocr-3 命中");
  assert.strictEqual(F.frontObj.fontSize, 12, "tx9 键对象不因旧调用被误改");
});

// ---------------- 汇总 ----------------
console.log("transaction-identity.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);