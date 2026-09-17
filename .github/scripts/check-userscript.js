#!/usr/bin/env node
/**
 * .github/scripts/check-userscript.js
 * 轻量元数据一致性检查（无依赖，零 npm install）。
 *
 * 检查项：
 *  1. 必需 metadata 字段齐全
 *  2. @version === 脚本内 const VERSION === extension/assistant.js 的 VERSION
 *     === extension/manifest.json 的 version_name     ← 项目既有不变量
 *  3. 所有 raw.githubusercontent 链接指向同一个分支（自洽）
 *  4. @updateURL === @downloadURL
 *  5. 在 demo 分支上：URL 分支必须 === demo（否则安装 demo 会跑 main 的代码）→ FAIL
 *     在其他非 main 分支上：URL 分支 !== 当前分支 → WARNING（不阻塞）
 *
 * 退出码：0 = 通过；1 = 失败
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const USERSCRIPT = path.join(ROOT, "zheliyin-card-assistant.user.js");
const ASSISTANT = path.join(ROOT, "extension/assistant.js");
const MANIFEST = path.join(ROOT, "extension/manifest.json");

const fails = [];
const warns = [];
const info = [];

function fail(m) { fails.push(m); }
function warn(m) { warns.push(m); }
function note(m) { info.push(m); }

if (!fs.existsSync(USERSCRIPT)) {
  console.log("SKIP: zheliyin-card-assistant.user.js 不存在");
  process.exit(0);
}

const src = fs.readFileSync(USERSCRIPT, "utf8");

// ---------- 1. 必需字段 ----------
const REQUIRED = ["@name", "@namespace", "@version", "@match", "@require", "@updateURL", "@downloadURL"];
const meta = {};
for (const line of src.split(/\r?\n/)) {
  const m = line.match(/^\/\/\s*(@[A-Za-z]+)\s+(.*)$/);
  if (m) (meta[m[1]] = meta[m[1]] || []).push(m[2].trim());
}
for (const k of REQUIRED) {
  if (!meta[k]) fail(`metadata 缺少必需字段 ${k}`);
}

const version = (meta["@version"] || [""])[0];
note(`@version = ${version}`);
note(`@require 数量 = ${(meta["@require"] || []).length}`);
note(`@match 数量 = ${(meta["@match"] || []).length}`);

// ---------- 2. 版本一致性 ----------
const vm = src.match(/const\s+VERSION\s*=\s*"([^"]+)"/);
if (!vm) fail("脚本内未找到 const VERSION");
else if (vm[1] !== version) fail(`版本不一致：@version=${version} 但 const VERSION=${vm[1]}`);

if (fs.existsSync(ASSISTANT)) {
  const am = fs.readFileSync(ASSISTANT, "utf8").match(/const\s+VERSION\s*=\s*"([^"]+)"/);
  if (!am) fail("extension/assistant.js 未找到 const VERSION");
  else if (am[1] !== version) fail(`版本不一致：@version=${version} 但 assistant.js VERSION=${am[1]}`);
} else {
  warn("extension/assistant.js 不存在，跳过版本一致性检查");
}

if (fs.existsSync(MANIFEST)) {
  try {
    const mf = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
    if (mf.version_name && mf.version_name !== version) {
      fail(`版本不一致：@version=${version} 但 manifest version_name=${mf.version_name}`);
    }
    // manifest.version 必须是 @version 的前三段（Chrome MV3 语义，项目既有约定）
    const prefix = String(version).split(".").slice(0, 3).join(".");
    if (mf.version && mf.version !== prefix) {
      fail(`版本不一致：manifest version=${mf.version} 但应为 @version 前三段 ${prefix}`);
    }
  } catch (e) { fail("extension/manifest.json 不是合法 JSON: " + e.message); }
} else {
  warn("extension/manifest.json 不存在，跳过检查");
}

// ---------- 3/4/5. URL 自洽 ----------
const RAW = /https:\/\/raw\.githubusercontent\.com\/[^/\s]+\/[^/\s]+\/([^/\s]+)\//g;
const branches = new Set();
for (const u of (meta["@require"] || []).concat(meta["@updateURL"] || [], meta["@downloadURL"] || [])) {
  let m;
  const re = new RegExp(RAW.source, "g");
  while ((m = re.exec(u)) !== null) branches.add(m[1]);
}
// 脚本内常量也纳入
for (const key of ["UPDATE_URL", "DOWNLOAD_URL"]) {
  const cm = src.match(new RegExp(`const\\s+${key}\\s*=\\s*"([^"]+)"`));
  if (cm && cm[1]) {
    const re = new RegExp(RAW.source);
    const mm = re.exec(cm[1]);
    if (mm) branches.add(mm[1]);
  }
}

const branchList = [...branches];
note(`URL 指向的分支集合 = {${branchList.join(", ")}}`);

if (branchList.length > 1) {
  fail(`URL 分支不自洽：同时指向 ${branchList.join(" / ")}。同一份脚本的 @require 与 @updateURL 必须同一分支`);
}

const upd = (meta["@updateURL"] || [])[0];
const dld = (meta["@downloadURL"] || [])[0];
if (upd && dld && upd !== dld) fail("@updateURL 与 @downloadURL 不一致（会导致更新提示与下载地址不同步）");

const current = process.env.GITHUB_REF_NAME || "";
const urlBranch = branchList[0] || "";
if (current) {
  if (current === "demo" && urlBranch !== "demo") {
    fail(`demo 分支的 URL 必须指向 demo（当前指向 ${urlBranch}）—— 否则安装 demo 会加载 ${urlBranch} 的模块，且 ScriptCat 会把用户更新回 ${urlBranch}`);
  } else if (current !== "main" && urlBranch && urlBranch !== current) {
    warn(`当前分支 ${current} 的 URL 指向 ${urlBranch}（预期行为可能是"跟随稳定版"；若不是，请改到 ${current}）`);
  }
}

// ---------- 输出 ----------
for (const i of info) console.log("ℹ " + i);
for (const w of warns) console.log("::warning::" + w);
for (const f of fails) console.log("::error::" + f);

if (fails.length) {
  console.log(`\nuserscript metadata check: FAIL（${fails.length} 项）`);
  process.exit(1);
}
console.log(`\nuserscript metadata check: PASS${warns.length ? `（${warns.length} 项警告）` : ""}`);
