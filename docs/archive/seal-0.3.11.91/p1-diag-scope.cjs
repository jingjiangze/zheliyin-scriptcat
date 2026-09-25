// 作用域深度分析：pageBridge 内每个关键函数的 {} 深度（判断嵌套层级）
"use strict";
const fs = require("fs");
const PB = "D:/zheliyin-scriptcat/extension/src/editor/page-bridge.js";
const lines = fs.readFileSync(PB, "utf8").split(/\r?\n/);

// 逐行累计花括号深度（忽略字符串/注释中的括号 —— 粗略但对本文件足够；用简单状态机）
let depth = 0;
const lineDepth = [];
let inS = null, inLC = false, inBC = false;
for (let i = 0; i < lines.length; i += 1) {
  const l = lines[i];
  lineDepth[i] = depth; // 该行开始时的深度
  inLC = false; inBC = false;
  for (let j = 0; j < l.length; j += 1) {
    const c = l[j], n = l[j + 1];
    if (inLC) break;
    if (inBC) { if (c === "*" && n === "/") { inBC = false; j += 1; } continue; }
    if (inS) { if (c === "\\") { j += 1; continue; } if (c === inS) inS = null; continue; }
    if (c === "/" && n === "/") { inLC = true; continue; }
    if (c === "/" && n === "*") { inBC = true; j += 1; continue; }
    if (c === '"' || c === "'" || c === "`") { inS = c; continue; }
    if (c === "{") depth += 1;
    else if (c === "}") depth -= 1;
  }
}
const at = (n) => lineDepth[n - 1];
const targets = [
  [16, "function pageBridge()"],
  [788, "zyInventoryItem"],
  [814, "zyIsNum"],
  [815, "zySnapshotHashOf"],
  [838, "zySnapshotHashItems (P1 added)"],
  [848, "zySnapshotItemWithSlot"],
  [877, "zyBuildTemplateSnapshot"],
  [902, "zyInventorySide"],
  [1312, "post"],
  [1367, "getTextInventoryAll handler?"],
  [1388, "getCanvasObjVO"],
  [1423, "buildCurrentPageInfo"],
  [1790, "sampleTemplateFont"],
  [1818, "zyCanvasIndexOf"],
  [1830, "zyDecideLayout"],
  [1868, "zyCanvasLayout"],
  [1889, "findCanvasForSide"],
  [1920, "getLoadedModule"],
  [2308, "pageBridge end"]
];
console.log("depth@line  line  code");
for (const [n, label] of targets) console.log("  " + String(at(n)).padStart(3) + "      " + String(n).padStart(4) + "  " + label);
// 找 zyIsNum 所在层的"函数头"行（向上扫到深度减少的那一行）
const dN = at(814);
let head = 0;
for (let i = 813; i >= 0; i -= 1) { if (lineDepth[i] < dN) { head = i + 1; break; } }
console.log("\nzyIsNum(814) depth=" + dN + " → 所在作用域的起始行 = " + head + ": " + JSON.stringify(lines[head - 1]));
const dD = at(1830);
let head2 = 0;
for (let i = 1829; i >= 0; i -= 1) { if (lineDepth[i] < dD) { head2 = i + 1; break; } }
console.log("zyDecideLayout(1830) depth=" + dD + " → 所在作用域的起始行 = " + head2 + ": " + JSON.stringify(lines[head2 - 1]));