// 安装 M4 真机 runner 到仓库（repo 非工作目录，故经本脚本写入）
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = "D:/zheliyin-scriptcat";
const SRC = path.join(__dirname, "m4t-runner.txt");
const DST = path.join(ROOT, "runtime", "stage9", "commit-46t-workbench-real.js");
const content = fs.readFileSync(SRC, "utf8").split("\r\n").join("\n");
fs.writeFileSync(DST, content, "utf8");
console.log("wrote " + path.relative(ROOT, DST).split(path.sep).join("/") + " (" + content.length + " bytes)");
