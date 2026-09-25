// 深挖：zyIsNum 作用域问题（用 stderr 探针 + 结构分析）
"use strict";
const fs = require("fs");
const PB = "D:/zheliyin-scriptcat/extension/src/editor/page-bridge.js";
let pbSrc = fs.readFileSync(PB, "utf8");

// 1) 最小对照实验（确认 new Function + 函数声明提升行为）
const mini = `function outer(){ function a(){ return typeof b; } function b(){ return 1; } return a(); } return outer();`;
console.log("mini hoisting:", new Function(mini)());

// 2) 在 zyDecideLayout 入口插 console.error 探针（打印在 stderr，不受 strip 影响）
const marker = "function zyDecideLayout(input) {";
const idx = pbSrc.indexOf(marker);
console.log("marker at", idx, "line", pbSrc.slice(0, idx).split("\n").length);
pbSrc = pbSrc.slice(0, idx + marker.length) + ' console.error("ZY_DECIDE_ENTER hasIsNum=" + (typeof zyIsNum) + " hasHashOf=" + (typeof zySnapshotHashOf));' + pbSrc.slice(idx + marker.length);
console.log("probe inserted:", pbSrc.indexOf("ZY_DECIDE_ENTER") >= 0);

// 3) 加载并触发
const frontCanvas = { _objs: [], width: 400, height: 300, getObjects() { return this._objs; }, requestRenderAll() {} };
const backCanvas = { _objs: [], width: 400, height: 300, getObjects() { return this._objs; }, requestRenderAll() {} };
const win = { CanvasObjVO: { totalCanvasArray: [{ idName: "c0", canvas: frontCanvas }, { idName: "c1", canvas: backCanvas }], currentCanvasNum: 1 }, addEventListener(t, fn) { win._h = fn; }, postMessage() {} };
const doc = { querySelector: () => null, querySelectorAll: () => [] };
const fn = new Function("window", "document", "location", "console", pbSrc + "\n;return typeof pageBridge === 'function' ? pageBridge : null;");
const pb = fn(win, doc, { origin: "x" }, console);
pb();
win.postMessage = (d) => { console.log("POSTED:", d && d.type, d && d.ok, d && d.code); };
try {
  win._h({ source: win, data: { source: "zy-card-assistant", type: "ocrAdjust", transactionId: "tx9", items: [{ blockIndex: 3, corrections: { fontSize: 20 } }] } });
} catch (e) {
  console.log("THREW:", String(e && e.message || e));
}

// 4) 结构核验：pageBridge 起止行 + zyIsNum 与 zyDecideLayout 是否同层
const lines = pbSrc.split("\n");
let depth = 0, startLine = 0, endLine = 0;
for (let i = 0; i < lines.length; i += 1) {
  const l = lines[i];
  if (depth === 0 && /^function pageBridge\(\)/.test(l)) { startLine = i + 1; }
  for (const ch of l) { if (ch === "{") depth += 1; else if (ch === "}") depth -= 1; }
  if (startLine && depth === 0 && i + 1 > startLine) { endLine = i + 1; break; }
}
console.log("pageBridge spans lines", startLine, "-", endLine, "(file lines", lines.length + ")");
const ln = (n) => lines[n - 1];
console.log("L814 (zyIsNum):", JSON.stringify(ln(814)));
console.log("L1830 (zyDecideLayout):", JSON.stringify(ln(1830)));