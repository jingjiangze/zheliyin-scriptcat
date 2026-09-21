// runtime/release/release-audit.js — Zheliyin ScriptCat 长期发布体系（Artifact Promotion）
// ---------------------------------------------------------------------
// 职责（Release-2/3）：
//   --gen       生成 release/production-manifest.json（从 userscript 的 @require 闭包）
//   默认/audit  审计“生产闭包”一致性，输出：
//                  version / entry / requires / allResolved / allDemo /
//                  testReferences / versionConsistent / files[]
//   --branch demo     （可选）限定目标分支语义：期望全部 @require 为 demo，禁止 test 引用
//   --ref REF         （可选）对指定 git ref（如 origin/demo 或 HEAD）解析模块文件哈希
// 纯工具，不升版。退出码 0=PASS 1=FAIL。
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
let USERSCRIPT = path.join(ROOT, "zheliyin-card-assistant.user.js");
const MANIFEST = path.join(ROOT, "release", "production-manifest.json");
const ARGV = process.argv.slice(2);
const MODE_GEN = ARGV.indexOf("--gen") >= 0;
const BRANCH_DEMO = ARGV.indexOf("--branch") >= 0;
{ const i = ARGV.indexOf("--entry"); if (i >= 0 && ARGV[i + 1]) USERSCRIPT = path.resolve(ARGV[i + 1]); }
let REF = null;
{ const i = ARGV.indexOf("--ref"); if (i >= 0) REF = ARGV[i + 1] || null; }

function gitShow(ref, rel) {
  try {
    const out = execSync('git show "' + ref + ":" + rel + '"', { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    return { ok: true, content: out };
  } catch (e) { return { ok: false, error: String(e && e.message || e).split("\n").slice(0, 2).join(" ") }; }
}
function sha256(s) { return crypto.createHash("sha256").update(String(s).replace(/\r\n/g, "\n"), "utf8").digest("hex").slice(0, 16); }

const src = fs.readFileSync(USERSCRIPT, "utf8");
const version = (/\/\/ @version\s+([\d.]+)/.exec(src) || [])[1] || null;
const requires = [];
const re = /@require\s+(https:\/\/raw\.githubusercontent\.com\/jingjiangze\/zheliyin-scriptcat\/([^/]+)\/(.*?)\?(?:v=([\d.]+))?)/g;
let m;
while ((m = re.exec(src))) {
  const rel = m[3];
  const mo = /\/([^/]+)\.js$/.exec(rel);
  requires.push({ url: m[0].trim(), branch: m[2], rel: rel, id: mo ? mo[1] : rel, v: m[4] || null });
}
const files = requires.map((r) => r.rel);

if (MODE_GEN) {
  const manifest = {
    version: version,
    entry: "zheliyin-card-assistant.user.js",
    requires: requires.length,
    files: ["zheliyin-card-assistant.user.js"].concat(files),
    requiresDetail: requires.map((r) => ({ id: r.id, branch: r.branch, rel: r.rel, v: r.v }))
  };
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log("[release-audit] manifest written=" + MANIFEST + " version=" + version + " requires=" + requires.length);
  process.exit(0);
}

// ---- audit ----
const out = { version: version, entry: "zheliyin-card-assistant.user.js", requires: requires.length };
const issues = [];
// 版本一致性：全部 ?v= == @version
const versionMismatch = requires.filter((r) => r.v && r.v !== version);
out.versionConsistent = versionMismatch.length === 0;
if (versionMismatch.length) issues.push("VERSION-Q-MISMATCH: " + versionMismatch.map((r) => r.id + "@" + r.v).join(","));

// 解析每个模块内容（按 REF 或当前工作区）；allResolved / hash 记录
const resolved = [];
for (const r of requires) {
  let rec = { id: r.id, branch: r.branch, rel: r.rel, v: r.v };
  if (REF) {
    const g = gitShow(REF, r.rel);
    rec.resolved = g.ok;
    rec.hash = g.ok ? sha256(g.content) : null;
  } else {
    const fp = path.join(ROOT, "extension", "src", r.rel.replace(/^extension\/src\//, ""));
    const lfp = path.join(ROOT, r.rel);
    const exists = fs.existsSync(fp) || fs.existsSync(lfp);
    rec.resolved = exists;
    const actual = exists ? (fs.existsSync(fp) ? fp : lfp) : null;
    rec.hash = actual ? sha256(fs.readFileSync(actual, "utf8")) : null;
  }
  resolved.push(rec);
}
out.allResolved = resolved.every((r) => r.resolved);
if (!out.allResolved) issues.push("MISSING: " + resolved.filter((r) => !r.resolved).map((r) => r.branch + "/" + r.rel).join(","));

// demo 语义：全部 @require 必须 demo，禁止 test
const testRefs = requires.filter((r) => r.branch === "test");
out.testReferences = testRefs.length;
out.allDemo = requires.every((r) => r.branch === "demo");
if (BRANCH_DEMO && testRefs.length) issues.push("DEMO_ENTRY_HAS_TEST_REF: " + testRefs.map((r) => r.id).join(","));
if (BRANCH_DEMO && !out.allDemo) issues.push("DEMO_ENTRY_NOT_ALL_DEMO");

out.files = resolved;
const passed = issues.length === 0 && out.allResolved;
out.passed = passed;
out.issues = issues;
fs.mkdirSync(path.join(ROOT, "runtime", "reports", "release"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "runtime", "reports", "release", "release-audit.json"), JSON.stringify(out, null, 2));
console.log("[release-audit] version=" + version + " requires=" + requires.length + " allResolved=" + out.allResolved + " allDemo=" + out.allDemo + " testReferences=" + testRefs.length + " " + (BRANCH_DEMO ? "(demo-mode)" : "(dev-mode)"));
issues.forEach((i) => console.log("[release-audit] ISSUE " + i));
console.log("[release-audit] " + (passed ? "PASS" : "FAIL"));
process.exit(passed ? 0 : 1);