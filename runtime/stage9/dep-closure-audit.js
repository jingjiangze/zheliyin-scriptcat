// runtime/stage9/dep-closure-audit.js — Stage 9.9 Phase 2：Runtime Dependency Closure Audit
// 逐项检查 userscript 全部 @require：
//   URL → branch/ref → 远端文件 HEAD 存在性 → 内容 vs 本地 extension/src → 兼容性结论。
// 输出：runtime/reports/stage-9/dependency-closure.json
"use strict";
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const USERSCRIPT = path.join(ROOT, "zheliyin-card-assistant.user.js");
const OUT = path.join(ROOT, "runtime", "reports", "stage-9", "dependency-closure.json");
const VERSION = (/\/\/ @version\s+([\d.]+)/.exec(fs.readFileSync(USERSCRIPT, "utf8")) || [])[1] || "unknown";

function gitShow(ref, rel) {
  try {
    const out = execSync('git show "' + ref + ":" + rel + '"', { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    return { ok: true, content: out };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e).split("\n").slice(0, 3).join(" ") };
  }
}
function sha256(s) {
  return require("crypto").createHash("sha256").update(String(s).replace(/\r\n/g, "\n"), "utf8").digest("hex").slice(0, 16);
}

const src = fs.readFileSync(USERSCRIPT, "utf8");
const reqs = [];
src.split("\n").forEach((line) => {
  const m = /\/\/ @require\s+(\S+)/.exec(line);
  // 仅认真实 raw.githubusercontent 依赖 URL；注释里出现的 “@require 注入” 之类伪匹配一律过滤
  if (m && m[1].indexOf("https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/") === 0) {
    const url = m[1];
    const um = /https:\/\/raw\.githubusercontent\.com\/jingjiangze\/zheliyin-scriptcat\/([^/]+)\/extension\/src\/(.+?)(\?v=([\d.]+))?$/.exec(url);
    reqs.push({ url, branch: um ? um[1] : null, rel: um ? um[2] : null, versionQuery: um ? um[4] : null });
    if (!um) console.log("[dep-closure] UNPARSED URL: " + url);
  }
});

const files = [];
reqs.forEach((r) => {
  if (!r.branch || !r.rel) { files.push({ url: r.url, status: "PARSE_FAIL" }); return; }
  const remote = gitShow("origin/" + r.branch, "extension/src/" + r.rel);
  const local = path.join(ROOT, "extension", "src", r.rel);
  const localExists = fs.existsSync(local);
  const localContent = localExists ? fs.readFileSync(local, "utf8") : null;
  const rec = {
    file: r.rel,
    branch: r.branch,
    versionQuery: r.versionQuery,
    versionMatch: r.versionQuery === VERSION,
    remoteExists: remote.ok,
    localExists: localExists,
    remoteHash: remote.ok ? sha256(remote.content) : null,
    localHash: localContent != null ? sha256(localContent) : null,
    contentMatch: remote.ok && localContent != null ? sha256(remote.content) === sha256(localContent) : null
  };
  if (!remote.ok) rec.status = "MISSING_ON_BRANCH";
  else if (!localExists) rec.status = "LOCAL_MISSING";
  else if (rec.contentMatch) rec.status = "MATCH_LOCAL";
  else rec.status = "DIFFERS_FROM_LOCAL";
  files.push(rec);
});

let mixedBranches = [];
const byBranch = {};
files.forEach((f) => { byBranch[f.branch] = (byBranch[f.branch] || 0) + 1; });
if (byBranch.demo && byBranch.test) mixedBranches = Object.keys(byBranch).map((b) => ({ branch: b, count: byBranch[b] }));

const staleModules = files.filter((f) => f.status === "DIFFERS_FROM_LOCAL");
const versionMismatches = files.filter((f) => f.versionQuery && !f.versionMatch);
const missing = files.filter((f) => f.status === "MISSING_ON_BRANCH" || f.status === "LOCAL_MISSING");

const passed = missing.length === 0 && staleModules.filter((f) => f.branch === "test").length === 0;
const out = {
  ts: new Date().toISOString(),
  stage: "STAGE-9-9-DEPENDENCY-CLOSURE",
  version: VERSION,
  userscript: USERSCRIPT,
  dependencyClosure: {
    passed,
    totalRequires: reqs.length,
    files,
    mixedBranches,
    staleModules: staleModules.map((f) => ({ file: f.file, branch: f.branch })),
    versionMismatches: versionMismatches.map((f) => ({ file: f.file, versionQuery: f.versionQuery })),
    missingOnBranch: missing.map((f) => ({ file: f.file, branch: f.branch, status: f.status }))
  }
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log("[dep-closure] report=" + OUT);
console.log("[dep-closure] total=" + reqs.length + " demo=" + (byBranch.demo || 0) + " test=" + (byBranch.test || 0));
files.forEach((f) => console.log("[dep-closure] " + f.branch + "/" + f.file + " -> " + f.status + (f.versionMatch ? "" : " [VERSION-Q-" + f.versionQuery + "]")));
console.log("[dep-closure] passed=" + passed);
process.exit(passed ? 0 : 1);