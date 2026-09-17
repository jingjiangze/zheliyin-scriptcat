// runtime/stage-6-2-window.js — 打印文件的 [from,to] 字符窗口
"use strict";
const fs = require("fs");
const path = require("path");
const file = process.argv[2];
const from = Number(process.argv[3] || 0);
const len = Number(process.argv[4] || 4000);
const txt = fs.readFileSync(path.join(__dirname, "vendor", "252438", file), "utf8");
console.log(">>>> window " + from + ".." + (from + len) + " of " + file + " (len=" + txt.length + ")");
console.log(txt.slice(from, from + len));