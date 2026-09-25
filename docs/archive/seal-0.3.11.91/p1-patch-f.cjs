// P1 修复 F：zyDecideLayout 改用内联数值判断（zyIsNum 在 message handler 内部 depth 2，pageBridge 直接层级不可见）
// 模块与 page-bridge 内联镜像同步修改，保持逐字一致。
"use strict";
const fs = require("fs");

function patchFile(F, label) {
  const raw = fs.readFileSync(F, "utf8");
  const crlf = raw.indexOf("\r\n") >= 0;
  let src = crlf ? raw.split("\r\n").join("\n") : raw;
  const OLD = `function zyDecideLayout(input) {
  const o = input || {};
  const out = {
    ok: true, code: "OK", multi: false, versionCount: 1, totalLen: 0,
    current: { vIdx: 0, side: "front", canvasIdx: 0, source: null, materialized: false },
    dom: { liCount: null, currentLiIdx: null, currentGroupIdx: null },
    conflicts: [], hardConflicts: []
  };
  const totalLen = (zyIsNum(o.totalLen) && o.totalLen >= 0) ? o.totalLen : 0;
  out.totalLen = totalLen;
  const liCount = zyIsNum(o.domLiCount) && o.domLiCount > 0 ? o.domLiCount : null;
  const curLiIdx = zyIsNum(o.domCurrentLiIdx) && o.domCurrentLiIdx >= 0 ? o.domCurrentLiIdx : null;
  const curGroupIdx = zyIsNum(o.domCurrentGroupIdx) && o.domCurrentGroupIdx >= 0 ? o.domCurrentGroupIdx : null;`;
  const NEW = `function zyDecideLayout(input) {
  const o = input || {};
  // 本函数位于 pageBridge 直接层级（depth 1），而 zyIsNum 定义在 message handler 内部（depth 2）不可见，
  // 故内联等价数值判断（isNum 语义与 zyIsNum 完全一致：typeof number && isFinite）。
  const isNum = function (v) { return typeof v === "number" && isFinite(v); };
  const out = {
    ok: true, code: "OK", multi: false, versionCount: 1, totalLen: 0,
    current: { vIdx: 0, side: "front", canvasIdx: 0, source: null, materialized: false },
    dom: { liCount: null, currentLiIdx: null, currentGroupIdx: null },
    conflicts: [], hardConflicts: []
  };
  const totalLen = (isNum(o.totalLen) && o.totalLen >= 0) ? o.totalLen : 0;
  out.totalLen = totalLen;
  const liCount = isNum(o.domLiCount) && o.domLiCount > 0 ? o.domLiCount : null;
  const curLiIdx = isNum(o.domCurrentLiIdx) && o.domCurrentLiIdx >= 0 ? o.domCurrentLiIdx : null;
  const curGroupIdx = isNum(o.domCurrentGroupIdx) && o.domCurrentGroupIdx >= 0 ? o.domCurrentGroupIdx : null;`;
  const i = src.indexOf(OLD);
  if (i < 0) throw new Error("ANCHOR MISS [" + label + "]");
  if (src.indexOf(OLD, i + 1) >= 0) throw new Error("ANCHOR NOT UNIQUE [" + label + "]");
  src = src.slice(0, i) + NEW + src.slice(i + OLD.length);
  // cc 行（在 OLD 之外）
  const OLD2 = `  const cc = (zyIsNum(o.currentCanvasNum) && o.currentCanvasNum >= 1) ? (o.currentCanvasNum - 1) : null;`;
  const NEW2 = `  const cc = (isNum(o.currentCanvasNum) && o.currentCanvasNum >= 1) ? (o.currentCanvasNum - 1) : null;`;
  const i2 = src.indexOf(OLD2);
  if (i2 < 0) throw new Error("ANCHOR MISS2 [" + label + "]");
  src = src.slice(0, i2) + NEW2 + src.slice(i2 + OLD2.length);
  fs.writeFileSync(F, crlf ? src.split("\n").join("\r\n") : src, "utf8");
  console.log("  patched " + label + " (zyIsNum -> isNum in zyDecideLayout)");
}

patchFile("D:\\zheliyin-scriptcat\\extension\\src\\editor\\template-snapshot.js", "template-snapshot.js");
patchFile("D:\\zheliyin-scriptcat\\extension\\src\\editor\\page-bridge.js", "page-bridge.js");
console.log("P1 fix F applied.");