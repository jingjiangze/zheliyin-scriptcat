// runtime/stage9/check-pageworld-syntax.js — 复刻 pageWorldPayload 拼接并做语法检查（定位 await 顶层崩点）
"use strict";
const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..", "..");
const USERSCRIPT = path.join(ROOT, "zheliyin-card-assistant.user.js");
const src = fs.readFileSync(USERSCRIPT, "utf8");
const reqs = [...src.matchAll(/\/\/ @require\s+(\S+)/g)].map((m) => m[1]);
const parts = [];
for (const u of reqs) {
  const mm = /\/extension\/src\/(.+)$/.exec(u);
  if (!mm) continue;
  const rel = mm[1].split("?")[0];
  const fp = path.join(ROOT, "extension", "src", rel);
  if (fs.existsSync(fp)) parts.push({ rel, code: fs.readFileSync(fp, "utf8") });
  else console.log("MISSING module: " + rel);
}
parts.push({ rel: "(userscript)", code: src });
// 逐段累加 parse：找到第一个让整段变非法的位置
let acc = "";
for (const p of parts) {
  acc = acc.length ? acc + "\n;\n" + p.code : p.code;
  try { new Function(acc); } catch (e) { console.log("PARSE FAIL at module:", p.rel, "->", String(e && e.message).slice(0, 200)); process.exit(1); }
}
console.log("syntax OK, segments=" + parts.length);