#!/usr/bin/env node
/**
 * runtime/check-demo-closure.js
 * Demo 依赖闭包检查（Demo Dependency Closure）—— 零依赖，纯 Node 内置模块。
 *
 * 目的：回答「用户装到的到底是一份什么代码」。
 *   只检查 @updateURL 是不够的：本项目曾出现「demo 的 userscript 指向 main 的 @require」，
 *   导致用户装 Demo 却加载 main 的 page-bridge（缺少 Stage 5.1 P1 identity 修复）。
 *
 * 检查两件事，分级处理：
 *   ① 结构闭包（离线可判）：所有 raw 依赖必须指向允许的分支白名单；@updateURL/@downloadURL 一致
 *      → 违反 = FAIL（退出码 1）
 *   ② 网络可达性（需联网）：逐个 HEAD/GET，记录 HTTP status 与 sha256
 *      → 网络不可用 = DEPENDENCY_NETWORK_UNKNOWN（**不判 FAIL**，见治理指令 §二十七）
 *
 * 用法：
 *   node runtime/check-demo-closure.js                 # 结构检查（默认读 origin/demo 或本地 demo）
 *   node runtime/check-demo-closure.js --net           # 追加网络检查
 *   node runtime/check-demo-closure.js --net --json    # 输出 JSON 报告
 *   node runtime/check-demo-closure.js --net --out runtime/reports/demo-closure.json
 *   node runtime/check-demo-closure.js --ref <gitref>  # 指定基线
 *   node runtime/check-demo-closure.js --expect-branch demo   # 显式要求交付分支（CI 用于 demo）
 *
 * 分支判定规则（核心不变量 = **自洽**）：
 *   ① 所有 raw 依赖必须指向**同一个**分支（即 @updateURL 声明的交付分支）
 *      —— 本项目曾出现 demo 的 @require 指向 main，正是这条被违反
 *   ② 若给了 --expect-branch，则交付分支必须等于它；未给则只校验自洽
 *      （这样 main / 治理分支（其 @updateURL 指向 main）在 CI 上同样能通过）
 *
 * 退出码：0 = 闭包合规（网络未知也算 0）；1 = 结构违反；2 = 用法/环境错误
 *
 * 安全：报告只含 URL / 状态 / 分支 / sha256，**不含任何凭据、图片、用户数据**。
 */
"use strict";

const { execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SKIP_DIRS = new Set(["node_modules", ".git"]);
const RAW_RE = /https:\/\/raw\.githubusercontent\.com\/([^/\s]+)\/([^/\s]+)\/([^/\s]+)\//g;

// 仓库根：本脚本位于 <root>/runtime/，据此定位仓库根并用 `git -C` 执行，
// 这样无论从哪个 cwd 调用（本地 / CI / 其他脚本）都能正确解析引用。
const REPO_ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const o = { net: false, json: false, out: null, refs: [], expectBranch: null, timeout: 20000 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--net") o.net = true;
    else if (a === "--json") o.json = true;
    else if (a === "--out") o.out = argv[++i];
    else if (a === "--ref") o.refs.push(argv[++i]);
    else if (a === "--expect-branch") o.expectBranch = argv[++i];
    else if (a === "--timeout") o.timeout = Number(argv[++i]) || o.timeout;
    else { console.error("未知参数：" + a); process.exit(2); }
  }
  return o;
}

function git(args) {
  return execFileSync("git", ["-C", REPO_ROOT, ...args], { encoding: "utf8", maxBuffer: 1 << 26 }).trim();
}

function resolveRef(explicit) {
  const cands = explicit && explicit.length
    ? explicit
    : ["origin/demo", "refs/remotes/origin/demo", "demo", "refs/heads/demo", "HEAD"];
  // 名字/描述引用先转 SHA，避免同一次运行里引用变化
  for (const c of cands) {
    try { return git(["rev-parse", "--verify", c]); } catch (_) { /* next */ }
  }
  return null;
}

function extractMeta(src) {
  const meta = { require: [], updateURL: [], downloadURL: [], version: null, constVersion: null };
  for (const line of src.split(/\r?\n/)) {
    let m = line.match(/^\/\/\s*@require\s+(\S+)/); if (m) { meta.require.push(m[1]); continue; }
    m = line.match(/^\/\/\s*@updateURL\s+(\S+)/); if (m) { meta.updateURL.push(m[1]); continue; }
    m = line.match(/^\/\/\s*@downloadURL\s+(\S+)/); if (m) { meta.downloadURL.push(m[1]); continue; }
    m = line.match(/^\/\/\s*@version\s+(\S+)/); if (m) { meta.version = m[1]; continue; }
  }
  const cm = src.match(/const\s+VERSION\s*=\s*"([^"]+)"/);
  meta.constVersion = cm ? cm[1] : null;
  return meta;
}

async function fetchInfo(url, timeout) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": "zheliyin-demo-closure-check" } });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, bytes: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex") };
  } catch (e) {
    return { status: null, error: String(e && (e.name + ": " + e.message) || e).slice(0, 160), networkUnknown: true };
  } finally {
    clearTimeout(t);
  }
}

function branchOf(url) {
  const re = new RegExp(RAW_RE.source);
  const m = re.exec(url);
  return m ? { owner: m[1], repo: m[2], branch: m[3] } : null;
}

(async () => {
  const opt = parseArgs(process.argv);
  const ref = resolveRef(opt.refs);
  if (!ref) {
    console.error("找不到 demo 引用（尝试过 origin/demo、demo）。请先 git fetch --all --prune，或 --ref 指定。");
    process.exit(2);
  }

  const US = "zheliyin-card-assistant.user.js";
  let src;
  try { src = execFileSync("git", ["-C", REPO_ROOT, "show", `${ref}:${US}`], { encoding: "utf8", maxBuffer: 1 << 26 }); }
  catch (e) { console.error("无法读取 " + ref + ":" + US + " —— " + String(e.message).slice(0, 120)); process.exit(2); }

  const meta = extractMeta(src);
  const demoSha = crypto.createHash("sha256").update(src).digest("hex");

  const violations = [];
  const networkUnknown = [];
  const deps = [];

  // 交付分支 = @updateURL 所声明的分支（无 @updateURL 时取第一个 raw URL）
  const declaredFrom = (meta.updateURL[0] || meta.require[0] || meta.downloadURL[0] || "");
  const declaredBranch = branchOf(declaredFrom) ? branchOf(declaredFrom).branch : null;

  const urlList = [
    ...meta.require.map((u) => ({ u, kind: "@require" })),
    ...meta.updateURL.map((u) => ({ u, kind: "@updateURL" })),
    ...meta.downloadURL.map((u) => ({ u, kind: "@downloadURL" }))
  ];
  for (const { u, kind } of urlList) {
    const b = branchOf(u);
    const rec = { url: u, kind, branch: b ? b.branch : null, status: null, bytes: null, sha256: null, note: null };
    if (!b) {
      violations.push(`非 raw.githubusercontent 依赖（需人工确认是否可信来源）：${u}`);
      rec.note = "non-raw-url";
    } else if (declaredBranch && b.branch !== declaredBranch) {
      violations.push(`依赖分支与交付分支不一致：${kind} 指向 ${b.branch}，而交付分支为 ${declaredBranch} —— ${u}`);
      rec.note = "branch-mismatch";
    } else {
      rec.note = "branch-consistent";
    }
    deps.push(rec);
  }

  if (opt.expectBranch && declaredBranch && declaredBranch !== opt.expectBranch) {
    violations.push(`交付分支不符：期望 ${opt.expectBranch}，实际 ${declaredBranch}`);
  }
  if (opt.expectBranch && !declaredBranch) {
    violations.push(`无法判定交付分支（缺少 @updateURL raw 链接），但已指定 --expect-branch ${opt.expectBranch}`);
  }

  if (meta.updateURL.length && meta.downloadURL.length && meta.updateURL[0] !== meta.downloadURL[0]) {
    violations.push("@updateURL 与 @downloadURL 不一致");
  }
  if (!meta.version) violations.push("缺少 @version");
  if (meta.version && meta.constVersion && meta.version !== meta.constVersion) {
    violations.push(`版本不一致：@version=${meta.version} vs const VERSION=${meta.constVersion}`);
  }

  if (opt.net) {
    for (const d of deps) {
      const info = await fetchInfo(d.url, opt.timeout);
      d.status = info.status;
      d.bytes = info.bytes == null ? null : info.bytes;
      d.sha256 = info.sha256 || null;
      if (info.networkUnknown) { d.note = "DEPENDENCY_NETWORK_UNKNOWN"; networkUnknown.push(d.url); }
      else if (info.status !== 200) { violations.push(`依赖 HTTP ${info.status}：${d.url}`); d.note = "http-" + info.status; }
      else { d.note = "ok"; }
    }
  }

  const report = {
    demo: ref,
    version: meta.version,
    constVersion: meta.constVersion,
    userscriptSha256: demoSha,
    declaredBranch: declaredBranch,
    expectBranch: opt.expectBranch || null,
    dependencies: deps,
    networkChecked: !!opt.net,
    networkUnknown,
    violations,
    status: violations.length ? "FAIL" : (networkUnknown.length ? "PASS_STRUCTURE_ONLY" : "PASS"),
    ts: new Date().toISOString()
  };

  if (opt.out) {
    fs.mkdirSync(path.dirname(opt.out), { recursive: true });
    fs.writeFileSync(opt.out, JSON.stringify(report, null, 1));
  }

  if (opt.json) {
    console.log(JSON.stringify(report, null, 1));
  } else {
    console.log("=== Demo Dependency Closure ===");
    console.log(`基线 ref   : ${ref}`);
    console.log(`@version   : ${meta.version}   (const VERSION ${meta.constVersion})`);
    console.log(`userscript : sha256 ${demoSha.slice(0, 16)}…`);
    console.log(`依赖 ${deps.length} 条，交付分支 = ${declaredBranch || "(无法判定)"}${opt.expectBranch ? "  期望 = " + opt.expectBranch : ""}`);
    for (const d of deps) {
      console.log(`  [${d.note}] ${d.kind.padEnd(12)} branch=${String(d.branch).padEnd(6)} status=${d.status == null ? "-" : d.status} ${d.url}`);
      if (d.sha256) console.log(`              sha256 ${d.sha256}`);
    }
    for (const u of networkUnknown) console.log(`::warning::DEPENDENCY_NETWORK_UNKNOWN ${u}`);
    for (const v of violations) console.log("::error::" + v);
    console.log(`\n结论：${report.status}`);
  }

  process.exit(violations.length ? 1 : 0);
})();
