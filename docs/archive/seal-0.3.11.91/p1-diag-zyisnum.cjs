// 诊断：page-bridge 里 zyIsNum 对 zyDecideLayout 是否可见（模拟 transaction-identity.test 的加载方式）
"use strict";
const fs = require("fs");
const path = require("path");
const PB = "D:/zheliyin-scriptcat/extension/src/editor/page-bridge.js";
let pbSrc = fs.readFileSync(PB, "utf8");

// 在 zyDecideLayout 入口插探针（不改磁盘文件，仅内存）
const marker = "function zyDecideLayout(input) {";
if (pbSrc.indexOf(marker) < 0) { console.error("marker miss"); process.exit(1); }
pbSrc = pbSrc.replace(marker, marker + " try{globalThis.__P_HAS_ISNUM__=(typeof zyIsNum);}catch(e){globalThis.__P_ERR__=String(e&&e.message||e);} ");

const frontCanvas = { _objs: [], width: 400, height: 300, getObjects() { return this._objs; }, add(o) { this._objs.push(o); }, requestRenderAll() {} };
const backCanvas = { _objs: [], width: 400, height: 300, getObjects() { return this._objs; }, add(o) { this._objs.push(o); }, requestRenderAll() {} };
const win = {
  CanvasObjVO: { totalCanvasArray: [{ idName: "c0", canvas: frontCanvas }, { idName: "c1", canvas: backCanvas }], currentCanvasNum: 1, frontImgPathStr: "/f.png", backImgPathStr: "/b.png" },
  addEventListener(t, fn) { win._h = fn; },
  postMessage() {}
};
const doc = { querySelector: () => null, querySelectorAll: () => [] };
const loc = { origin: "https://diy.zheliyin.com" };

try {
  const fn = new Function("window", "document", "location", "console", pbSrc + "\n;return typeof pageBridge === 'function' ? pageBridge : null;");
  const pb = fn(win, doc, loc, console);
  console.log("pageBridge type:", typeof pb);
  pb();
  console.log("__P_HAS_ISNUM__ (before dispatch):", globalThis.__P_HAS_ISNUM__);
  // 触发旧调用路径（无 pageId/tx）→ 走 findCanvasForSide
  const obj = { text: "x", fontSize: 12, width: 120, height: 24, left: 10, top: 10, angle: 0, type: "text", zyOcrKey: "zy-ocr-3", set(cfg) { Object.keys(cfg || {}).forEach((k) => { this[k] = cfg[k]; }); }, setCoords() {}, aCoords: { tl: { x: 10, y: 10 }, tr: { x: 130, y: 10 }, br: { x: 130, y: 34 }, bl: { x: 10, y: 34 } } };
  frontCanvas._objs.push(obj);
  win._posted = null;
  win.postMessage = (d) => { win._posted = d; };
  try {
    win._h({ source: win, data: { source: "zy-card-assistant", type: "ocrAdjust", transactionId: "tx9", items: [{ blockIndex: 3, corrections: { fontSize: 20 } }] } });
  } catch (e) {
    console.log("DISPATCH THREW:", String(e && e.message || e));
  }
  console.log("__P_HAS_ISNUM__ (after dispatch):", globalThis.__P_HAS_ISNUM__);
  console.log("__P_ERR__:", globalThis.__P_ERR__);
  console.log("posted type:", win._posted && win._posted.type, "ok:", win._posted && win._posted.ok, "code:", win._posted && win._posted.code);
  // 结构分析：pageBridge 内顶层函数声明清单（用正则粗查 4 空格缩进的 function）
  const lines = pbSrc.split(/\r?\n/);
  const decls = [];
  lines.forEach((l, i) => { if (/^    function (\w+)/.test(l)) decls.push((i + 1) + ":" + /^    function (\w+)/.exec(l)[1]); });
  console.log("pageBridge-level function decls (count=" + decls.length + "):");
  console.log(decls.join("  "));
} catch (e) {
  console.error("LOAD ERR: " + String(e && e.message || e));
}