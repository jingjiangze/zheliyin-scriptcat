// runtime/stage8b/generate-runtime-manifest.js — Stage 8B STEP 6：从 userscript @require 生成 runtime-manifest.json
// ---------------------------------------------------------------------
// 单一事实来源 = zheliyin-card-assistant.user.js 的 @require 块。
// 输出 runtime/runtime-manifest.json：
//   { generatedAt, userscriptVersion, modules: [{id, branch, path, url, version}...] }
// 配套检查 runtime/check-version-manifest.js（RUNTIME_VERSION_MISMATCH 诊断）。
// 纯工具，不升版。
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const USERSCRIPT_PATH = path.join(ROOT, "zheliyin-card-assistant.user.js");
const OUT = path.join(ROOT, "runtime", "runtime-manifest.json");

const src = fs.readFileSync(USERSCRIPT_PATH, "utf8");
const versionMatch = /@version\s+([\d.]+)/.exec(src) || [];
const version = versionMatch[1] || "unknown";
const mods = [];
const requireRe = /@require\s+(https:\/\/raw\.githubusercontent\.com\/jingjiangze\/zheliyin-scriptcat\/([^/]+)\/(.*?)\?(?:v=([\d.]+))?)/g;
let m;
while ((m = requireRe.exec(src))) {
  const full = m[1], branch = m[2], urlPath = m[3], v = m[4] || null;
  const modMatch = /\/([^/]+)\.js$/.exec(urlPath);
  mods.push({ id: modMatch ? modMatch[1] : urlPath, branch, path: urlPath, version: v, url: full });
}
const manifest = {
  generatedAt: new Date().toISOString(),
  userscriptVersion: version,
  moduleCount: mods.length,
  modules: mods
};
fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2));
console.log("manifest written: " + OUT + " version=" + version + " modules=" + mods.length);
// 一致性快速自检
const bad = mods.filter((x) => x.version !== null && x.version !== version);
if (bad.length) {
  console.log("WARN: ?v= 与 @version 不一致的模块: " + bad.map((x) => x.id + "@" + x.version).join(", "));
  process.exitCode = 1;
} else {
  console.log("OK: 全部 @require ?v= 与 @version 一致（" + version + "）");
}