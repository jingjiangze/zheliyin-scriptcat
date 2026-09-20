// runtime/check-version-manifest.js — Stage 8B STEP 6：RUNTIME_VERSION_MISMATCH 诊断
// ---------------------------------------------------------------------
// 校验三点：
//   1) userscript @version 与 manifest.userscriptVersion 一致
//   2) 全部 @require 的 ?v= 与 @version 一致
//   3) @require 模块集合（id+branch+path）与 manifest.modules 一致（缺/多即 MISMATCH）
// 退出码：0=一致；1=MISMATCH（打印 RUNTIME_VERSION_MISMATCH）
// 用途：真机套版前由 runtime 前置调用；套版不阻塞（仅告警），OCR 重建前置不通过（阻塞）。
// 纯工具，不升版。
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, ".."); // runtime/ 位于仓库根下
const USERSCRIPT_PATH = path.join(ROOT, "zheliyin-card-assistant.user.js");
const MANIFEST = path.join(ROOT, "runtime", "runtime-manifest.json");

const src = fs.readFileSync(USERSCRIPT_PATH, "utf8");
let manifest = null;
try { manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8")); } catch (e) { console.error("RUNTIME_VERSION_MISMATCH: manifest 缺失/损坏 - " + String(e && e.message || e)); process.exit(1); }

const version = (/@version\s+([\d.]+)/.exec(src) || [])[1] || null;
const mods = [];
const requireRe = /@require\s+(https:\/\/raw\.githubusercontent\.com\/jingjiangze\/zheliyin-scriptcat\/([^/]+)\/(.*?)\?(?:v=([\d.]+))?)/g;
let m;
while ((m = requireRe.exec(src))) {
  const urlPath = m[3], v = m[4] || null;
  const modMatch = /\/([^/]+)\.js$/.exec(urlPath);
  mods.push({ id: modMatch ? modMatch[1] : urlPath, branch: m[2], path: urlPath, version: v });
}

const issues = [];
const fmt = (x) => x.id + "@" + (x.version || "nov") + "/" + x.branch;
if (version !== manifest.userscriptVersion) issues.push("userscript @version " + version + " != manifest " + manifest.userscriptVersion);
mods.forEach((x) => { if (x.version && x.version !== version) issues.push("module ?v 不一致: " + fmt(x)); });
const byId = (arr) => { const o = {}; arr.forEach((x) => (o[x.id + "|" + x.branch + "|" + x.path] = x)); return o; };
const cur = byId(mods), exp = byId(manifest.modules || []);
const curKeys = Object.keys(cur), expKeys = Object.keys(exp);
const missing = expKeys.filter((k) => !cur[k]);
const extra = curKeys.filter((k) => !exp[k]);
if (missing.length) issues.push("缺少模块: " + missing.join(", "));
if (extra.length) issues.push("多出模块: " + extra.join(", "));

if (issues.length) {
  console.error("RUNTIME_VERSION_MISMATCH (" + version + " vs manifest " + manifest.userscriptVersion + "):");
  issues.forEach((i) => console.error("  - " + i));
  console.log("结论：套版不受影响（仅告警）；OCR 自动重建前置不通过（阻塞，防止旧模块几何不一致）。");
  process.exit(1);
}
console.log("RUNTIME_MANIFEST: MATCH（version=" + version + " modules=" + mods.length + "）—— 可继续 OCR 重建。");