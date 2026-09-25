// demo 轨发布收口：@require test→demo + 版本对齐 + @updateURL/@downloadURL 自洽
// 用法: node d-promote-demo.cjs [--check]
"use strict";
const fs = require("fs");
const path = require("path");

const US = "D:\\zheliyin-scriptcat\\zheliyin-card-assistant.user.js";
const CHECK = process.argv.indexOf("--check") >= 0;

let src = fs.readFileSync(US, "utf8");
const nl = src.indexOf("\r\n") >= 0 ? "\r\n" : "\n";
const version = (/\/\/ @version\s+([\d.]+)/.exec(src) || [])[1] || null;
if (!version) { console.error("FATAL: @version not found"); process.exit(1); }

const before = { test: (src.match(/zheliyin-scriptcat\/test\//g) || []).length };

// 1) @require 行 test → demo
const lines = src.split(/\r?\n/);
let flipped = 0, vFixed = 0;
for (let i = 0; i < lines.length; i++) {
  if (!/^\/\/\s*@require\s+/.test(lines[i])) continue;
  const orig = lines[i];
  lines[i] = lines[i].replace(/zheliyin-scriptcat\/test\//, "zheliyin-scriptcat/demo/");
  lines[i] = lines[i].replace(/\?v=[\d.]+/, "?v=" + version);
  if (lines[i] !== orig) flipped++;
  if (/\?v=/.test(lines[i]) && !lines[i].includes("?v=" + version)) vFixed++;
}
src = lines.join(nl);

// 2) @updateURL / @downloadURL 自洽（demo 分支）
const demoUrl = "https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/zheliyin-card-assistant.user.js";
const headerEnd = src.indexOf("// ==/UserScript==");
if (headerEnd < 0) { console.error("FATAL: header end not found"); process.exit(1); }
let head = src.slice(0, headerEnd);
let tail = src.slice(headerEnd);
head = head.replace(/^\/\/\s*@updateURL.*$/m, "").replace(/^\/\/\s*@downloadURL.*$/m, "");
head = head.replace(/\r?\n\r?\n+$/, nl);
head += "// @updateURL    " + demoUrl + nl + "// @downloadURL  " + demoUrl + nl;
src = head + tail;

// 3) 版本常量与 URL 常量自洽
src = src.replace(/const VERSION = "[\d.]+";/, 'const VERSION = "' + version + '";');
src = src.replace(/const UPDATE_URL = "[^"]*";/, 'const UPDATE_URL = "' + demoUrl + '";');
src = src.replace(/const DOWNLOAD_URL = "[^"]*";/, 'const DOWNLOAD_URL = "' + demoUrl + '";');

const after = {
  test: (src.match(/zheliyin-scriptcat\/test\//g) || []).length,
  demoReq: (src.match(/\/\/\s*@require\s+https:\/\/raw\.githubusercontent\.com\/jingjiangze\/zheliyin-scriptcat\/demo\//g) || []).length,
  updateURL: /^\/\/\s*@updateURL\s+.*\/demo\//m.test(src),
  downloadURL: /^\/\/\s*@downloadURL\s+.*\/demo\//m.test(src),
  versionConst: (/const VERSION = "([\d.]+)";/.exec(src) || [])[1],
  updateConst: /const UPDATE_URL = "[^"]*\/demo\//.test(src),
  downloadConst: /const DOWNLOAD_URL = "[^"]*\/demo\//.test(src)
};

console.log(JSON.stringify({ version, before, flipped, after }, null, 2));

if (!CHECK) {
  fs.writeFileSync(US, src, "utf8");
  console.log("WROTE " + US);
} else {
  console.log("CHECK-ONLY (no write)");
}
const bad = after.test !== 0 || !after.updateURL || !after.downloadURL || after.versionConst !== version || !after.updateConst || !after.downloadConst;
process.exit(bad ? 2 : 0);
