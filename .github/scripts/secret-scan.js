#!/usr/bin/env node
/**
 * .github/scripts/secret-scan.js
 * 轻量敏感信息扫描（零依赖，纯 Node，跨平台）。
 *
 * 规则：
 *  A. 硬编码凭据关键词赋长字符串            → ERROR（阻断）
 *  B. Bearer <token>                        → ERROR（阻断）
 *  C. runtime/reports/ 中出现 data:image base64 → ERROR（可能把真实图片入库）
 *  D. 保留测试号之外的真实手机号            → WARNING（阻断性 0，需人工确认）
 *     - 位于 tests/ 或 runtime/reports/ 的手机号：只做汇总计数（夹具与报告本就含合成号）
 *     - 位于源码 / 脚本 / 文档的手机号：逐个 WARNING
 *
 * 规范依据：docs/REAL_MACHINE_EVIDENCE.md、docs/SENSITIVE_DATA_AUDIT.md
 * 维护：新增合成测试号时，把它加进 FAKE_PHONES（保持仓库里的合成号可识别）
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const SKIP_DIRS = new Set(["node_modules", ".git", ".workbuddy", "dist", "build"]);
const TEXT_EXT = new Set([".js", ".mjs", ".cjs", ".json", ".md", ".txt", ".html", ".yml", ".yaml", ".ps1"]);
const FIXTURE_DIRS = ["tests/", "runtime/reports/"];

// 仓库中已知的合成/保留测试号（非真实用户数据）
const FAKE_PHONES = new Set([
  "13800138000", "13800138001", "13900139000", "13700137000",
  "13911112222", "13812345678", "13566668888", "13799990000",
  "13600001111", "13755550002", "13912340001", "18888888888",
  "13800138002", "13800138003"
]);

const errors = [];
const warns = [];
let fixturePhoneCount = 0;

function walk(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      out = out.concat(walk(path.join(dir, e.name)));
    } else if (e.isFile() && TEXT_EXT.has(path.extname(e.name).toLowerCase())) {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

const files = walk(ROOT);
console.log(`扫描 ${files.length} 个文本文件`);

const CRED = /(api[_-]?key|secret|password|passwd|token|authorization|bearer)\s*[:=]\s*["']([A-Za-z0-9_\-\.]{16,})["']/i;
const BEARER = /Bearer\s+[A-Za-z0-9_\-\.]{20,}/;
const PHONE = /\b1[3-9][0-9]{9}\b/g;

for (const f of files) {
  const rel = path.relative(ROOT, f).split(path.sep).join("/");
  let s;
  try { s = fs.readFileSync(f, "utf8"); } catch (_) { continue; }

  const lines = s.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(CRED);
    if (m) errors.push(`${rel}:${i + 1} 疑似硬编码凭据（字段名 ${m[1]}）`);
    if (BEARER.test(lines[i])) errors.push(`${rel}:${i + 1} 疑似 Bearer token`);
  }

  if (rel.startsWith("runtime/reports/") && /data:image\//.test(s)) {
    errors.push(`${rel} 含 data:image base64 —— 可能把真实图片写入了报告`);
  }

  const inFixture = FIXTURE_DIRS.some((d) => rel.startsWith(d));
  const found = s.match(PHONE) || [];
  for (const ph of new Set(found)) {
    if (FAKE_PHONES.has(ph)) continue;
    if (inFixture) fixturePhoneCount++;
    else warns.push(`${rel} 含非白名单手机号 ${ph.slice(0, 3)}****${ph.slice(-2)}（请确认是合成数据；若为合成号请加入 FAKE_PHONES）`);
  }
}

if (fixturePhoneCount > 0) {
  console.log(`ℹ 夹具/报告中另有 ${fixturePhoneCount} 个非白名单手机号（属合成数据区，仅计数不逐个告警）`);
}
for (const w of warns) console.log("::warning::" + w);
for (const e of errors) console.log("::error::" + e);

if (errors.length) {
  console.log(`\nsecret scan: FAIL（${errors.length} 项 error / ${warns.length} 项 warning）`);
  process.exit(1);
}
console.log(`\nsecret scan: PASS（${warns.length} 项 warning）`);
