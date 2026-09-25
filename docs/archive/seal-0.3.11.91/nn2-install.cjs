// 安装 会话 UI 移除 真机 runner（repo 非工作目录，故经本脚本写入）
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = "D:/zheliyin-scriptcat";
const DST = path.join(ROOT, "runtime", "stage9", "commit-46w-no-session-ui-real.js");
const content = fs.readFileSync(path.join(__dirname, "nn2-runner.txt"), "utf8").split("\r\n").join("\n");
fs.writeFileSync(DST, content, "utf8");
console.log("wrote " + path.relative(ROOT, DST).split(path.sep).join("/") + " (" + content.length + " bytes)");
