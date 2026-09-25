// P1 修复 G 配套：单测 4d 断言同步为「版数以 totalCanvasArray 为真源」
"use strict";
const fs = require("fs");
const F = "D:\\zheliyin-scriptcat\\runtime\\stage11\\multiversion-p1.test.js";
const raw = fs.readFileSync(F, "utf8");
const crlf = raw.indexOf("\r\n") >= 0;
let src = raw.split("\r\n").join("\n");

const OLD = [
  "// 4d) 软冲突：懒 materialize（DOM 2 版但数组只 2 条）",
  "const S2 = S.zyDecideLayout({ totalLen: 2, currentCanvasNum: 1, domLiCount: 2, domCurrentLiIdx: 0, domCurrentGroupIdx: 0 });",
  "assert.strictEqual(S2.ok, true);",
  "assert.ok(S2.conflicts.join(\"|\").indexOf(\"domLiCount(2)!=arrVersionCount(1)\") >= 0);",
  "assert.strictEqual(S2.versionCount, 2, \"版数以 DOM 为真源\");"
].join("\n");
const NEW = [
  "// 4d) 软冲突：幽灵 li（DOM 报 2 版但 totalCanvasArray 只 2 条 = 单版）",
  "//     修复 G：版数唯一真源 = totalCanvasArray；DOM liCount 仅软告警（曾因 DOM 优先把单版误判为多版）",
  "const S2 = S.zyDecideLayout({ totalLen: 2, currentCanvasNum: 1, domLiCount: 2, domCurrentLiIdx: 0, domCurrentGroupIdx: 0 });",
  "assert.strictEqual(S2.ok, true);",
  "assert.ok(S2.conflicts.join(\"|\").indexOf(\"domLiCount(2)!=arrVersionCount(1)\") >= 0);",
  "assert.strictEqual(S2.versionCount, 1, \"版数以 totalCanvasArray 为真源（DOM li 仅软告警）\");",
  "assert.strictEqual(S2.multi, false, \"幽灵 li 不得把单版判成多版\");"
].join("\n");

if (src.indexOf(OLD) < 0) { console.error("ANCHOR MISS 4d"); process.exit(1); }
if (src.indexOf(OLD) !== src.lastIndexOf(OLD)) { console.error("ANCHOR NOT UNIQUE"); process.exit(1); }
src = src.replace(OLD, NEW);
fs.writeFileSync(F, crlf ? src.split("\n").join("\r\n") : src, "utf8");
console.log("P1 patch T applied (test 4d -> array source).");