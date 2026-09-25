// 解决 userscript 唯一冲突：@require 块（远端新增 PP-OCRv6 模块，本侧为空）→ 保留远端
"use strict";
const fs = require("fs");
const F = "D:/zheliyin-scriptcat/zheliyin-card-assistant.user.js";
const raw = fs.readFileSync(F, "utf8");
const crlf = raw.indexOf("\r\n") >= 0;
let src = crlf ? raw.split("\r\n").join("\n") : raw;
const before = (src.match(/^(<<<<<<<|=======|>>>>>>>)/gm) || []).length;
src = src.split("\n").filter((ln) => !/^<<<<<<< Updated upstream\s*$/.test(ln) && !/^=======\s*$/.test(ln) && !/^>>>>>>> Stashed changes\s*$/.test(ln)).join("\n");
const after = (src.match(/^(<<<<<<<|=======|>>>>>>>)/gm) || []).length;
fs.writeFileSync(F, crlf ? src.split("\n").join("\r\n") : src, "utf8");
console.log("conflict markers: before=" + before + " after=" + after);
if (after !== 0) throw new Error("markers remain");
const chk = fs.readFileSync(F, "utf8");
console.log("ppocr requires=" + (chk.match(/ppocr-/g) || []).length + " requires=" + (chk.match(/^\/\/ @require/gm) || []).length + " version=" + (/\/\/ @version\s+([\d.]+)/.exec(chk) || [])[1]);
