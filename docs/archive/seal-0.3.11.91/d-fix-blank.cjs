// 修正 demo userscript 头部多余空行（保持与 test 正文逐字一致）
"use strict";
const fs = require("fs");
const US = "D:\\zheliyin-scriptcat\\zheliyin-card-assistant.user.js";
let src = fs.readFileSync(US, "utf8");
const before = src.length;
src = src.replace(/(\/\/ @connect\s+\*\r?\n)\r?\n+(\/\/ @updateURL)/, "$1$2");
fs.writeFileSync(US, src, "utf8");
console.log("before=" + before + " after=" + src.length + " removed=" + (before - src.length));
