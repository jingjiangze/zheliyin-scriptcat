// P1 修复 F（修正）：zyDecideLayout 内联数值判断 —— 支持缩进参数（模块 0 空格 / page-bridge 4 空格）
"use strict";
const fs = require("fs");

function patchFile(F, indent, label) {
  const raw = fs.readFileSync(F, "utf8");
  const crlf = raw.indexOf("\r\n") >= 0;
  let src = crlf ? raw.split("\r\n").join("\n") : raw;
  const P = (s) => s.split("\n").map((l) => (l ? indent + l : l)).join("\n");

  const OLD = P(`function zyDecideLayout(input) {
  const o = input || {};
  const out = {
    ok: true, code: "OK", multi: false, versionCount: 1, totalLen: 0,`);
  const NEW = P(`function zyDecideLayout(input) {
  const o = input || {};
  // 本函数位于 pageBridge 直接层级（depth 1），而 zyIsNum 定义在 message handler 内部（depth 2）不可见，
  // 故内联等价数值判断（isNum 语义与 zyIsNum 完全一致：typeof number && isFinite）。
  const isNum = function (v) { return typeof v === "number" && isFinite(v); };
  const out = {
    ok: true, code: "OK", multi: false, versionCount: 1, totalLen: 0,`);
  let i = src.indexOf(OLD);
  if (i < 0) throw new Error("ANCHOR MISS A [" + label + "]");
  if (src.indexOf(OLD, i + 1) >= 0) throw new Error("ANCHOR NOT UNIQUE A [" + label + "]");
  src = src.slice(0, i) + NEW + src.slice(i + OLD.length);

  const pairs = [
    [`const totalLen = (zyIsNum(o.totalLen) && o.totalLen >= 0) ? o.totalLen : 0;`, `const totalLen = (isNum(o.totalLen) && o.totalLen >= 0) ? o.totalLen : 0;`],
    [`const liCount = zyIsNum(o.domLiCount) && o.domLiCount > 0 ? o.domLiCount : null;`, `const liCount = isNum(o.domLiCount) && o.domLiCount > 0 ? o.domLiCount : null;`],
    [`const curLiIdx = zyIsNum(o.domCurrentLiIdx) && o.domCurrentLiIdx >= 0 ? o.domCurrentLiIdx : null;`, `const curLiIdx = isNum(o.domCurrentLiIdx) && o.domCurrentLiIdx >= 0 ? o.domCurrentLiIdx : null;`],
    [`const curGroupIdx = zyIsNum(o.domCurrentGroupIdx) && o.domCurrentGroupIdx >= 0 ? o.domCurrentGroupIdx : null;`, `const curGroupIdx = isNum(o.domCurrentGroupIdx) && o.domCurrentGroupIdx >= 0 ? o.domCurrentGroupIdx : null;`],
    [`const cc = (zyIsNum(o.currentCanvasNum) && o.currentCanvasNum >= 1) ? (o.currentCanvasNum - 1) : null;`, `const cc = (isNum(o.currentCanvasNum) && o.currentCanvasNum >= 1) ? (o.currentCanvasNum - 1) : null;`]
  ];
  for (const [o1, n1] of pairs) {
    const oo = P(o1), nn = P(n1);
    const j = src.indexOf(oo);
    if (j < 0) throw new Error("ANCHOR MISS [" + label + "] :: " + o1.slice(0, 40));
    if (src.indexOf(oo, j + 1) >= 0) throw new Error("ANCHOR NOT UNIQUE [" + label + "] :: " + o1.slice(0, 40));
    src = src.slice(0, j) + nn + src.slice(j + oo.length);
  }
  fs.writeFileSync(F, crlf ? src.split("\n").join("\r\n") : src, "utf8");
  const left = (src.match(/zyIsNum\(/g) || []).length;
  console.log("  patched " + label + " (zyIsNum remaining=" + left + ")");
}

patchFile("D:\\zheliyin-scriptcat\\extension\\src\\editor\\page-bridge.js", "    ", "page-bridge.js");
console.log("P1 fix F (bridge) applied.");