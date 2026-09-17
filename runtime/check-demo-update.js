#!/usr/bin/env node
/**
 * runtime/check-demo-update.js
 * Demo 更新链检查（固定 URL → 用户 ScriptCat 能收到更新）—— 零依赖，纯 Node 内置模块。
 *
 * 检查（对应治理指令 §二十四）：
 *   ① raw URL HTTP 200
 *   ② 响应中存在 @version / @updateURL / @downloadURL
 *   ③ @updateURL 与 @downloadURL 指向固定 demo 地址（不再指向 main）
 *   ④ 版本单调性：raw 上的 @version ≥ 仓库中已记录的最近 Demo 版本（不得回退）
 *   ⑤ raw 上的 @version 与 git 中 demo 分支的 @version 一致（不一致多为 CDN/缓存滞后，判 WARN）
 *
 * 分级（对应治理指令 §二十七）：
 *   网络不可用 → DEPENDENCY_NETWORK_UNKNOWN（**不判 FAIL**，退出码 0）
 *   结构/单调性违规 → FAIL（退出码 1）
 *
 * 用法：
 *   node runtime/check-demo-update.js
 *   node runtime/check-demo-update.js --json
 *   node runtime/check-demo-update.js --ref origin/demo --url <raw-url>
 *   node runtime/check-demo-update.js --strict-net      # 网络不可用也判失败（默认关闭）
 *
 * 退出码：0 = 通过（含网络未知）；1 = 违规；2 = 用法/环境错误
 * 安全：不读取、不输出任何凭据 / 图片 / 用户数据。
 */
"use strict";

const { execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DEFAULT_URL = "https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/zheliyin-card-assistant.user.js";
const DEMO_RELEASE_DOC = "docs/DEMO_RELEASE.md";

// 仓库根：本脚本位于 <root>/runtime/，据此定位仓库根并用 `git -C` 执行，
// 这样无论从哪个 cwd 调用（本地 / CI）都能正确解析引用。
const REPO_ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const o = { json: false, ref: null, url: DEFAULT_URL, strictNet: false, timeout: 20000, out: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") o.json = true;
    else if (a === "--ref") o.ref = argv[++i];
    else if (a === "--url") o.url = argv[++i];
    else if (a === "--out") o.out = argv[++i];
    else if (a === "--strict-net") o.strictNet = true;
    else if (a === "--timeout") o.timeout = Number(argv[++i]) || o.timeout;
    else { console.error("未知参数：" + a); process.exit(2); }
  }
  return o;
}

function gitOrNull(args) {
  try { return execFileSync("git", ["-C", REPO_ROOT, ...args], { encoding: "utf8", maxBuffer: 1 << 26 }).trim(); }
  catch (_) { return null; }
}

/** 与脚本内 compareVersion 同语义：按 . 拆分后逐段 parseInt 比较 */
function compareVersion(a, b) {
  const pa = String(a || "").split(".").map((x) => parseInt(x, 10) || 0);
  const pb = String(b || "").split(".").map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

function parseMeta(src) {
  const m = { version: null, updateURL: null, downloadURL: null, requires: 0, constVersion: null };
  for (const line of src.split(/\r?\n/)) {
    let x = line.match(/^\/\/\s*@version\s+(\S+)/); if (x) { m.version = x[1]; continue; }
    x = line.match(/^\/\/\s*@updateURL\s+(\S+)/); if (x) { m.updateURL = x[1]; continue; }
    x = line.match(/^\/\/\s*@downloadURL\s+(\S+)/); if (x) { m.downloadURL = x[1]; continue; }
    if (/^\/\/\s*@require\s+/.test(line)) m.requires++;
  }
  const cm = src.match(/const\s+VERSION\s*=\s*"([^"]+)"/);
  m.constVersion = cm ? cm[1] : null;
  return m;
}

/** 从 docs/DEMO_RELEASE.md 中尽力提取历史上出现过的 Demo 版本号，取最大值 */
function latestRecordedVersion(root) {
  const p = path.join(root, DEMO_RELEASE_DOC);
  if (!fs.existsSync(p)) return { version: null, note: "DEMO_RELEASE.md 不存在" };
  const s = fs.readFileSync(p, "utf8");
  const vers = new Set();
  for (const m of s.matchAll(/`(\d+\.\d+\.\d+\.\d+)`/g)) vers.add(m[1]);
  for (const m of s.matchAll(/Demo v(\d+\.\d+\.\d+\.\d+)/g)) vers.add(m[1]);
  const list = [...vers];
  if (!list.length) return { version: null, note: "文档中未解析到版本号" };
  let max = list[0];
  for (const v of list) if (compareVersion(v, max) > 0) max = v;
  return { version: max, note: `从文档解析到 ${list.length} 个版本，最大 ${max}` };
}

async function fetchRaw(url, timeout) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": "zheliyin-demo-update-check" } });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, body: buf.toString("utf8"), bytes: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex") };
  } catch (e) {
    return { status: null, error: String(e && (e.name + ": " + e.message) || e).slice(0, 160), networkUnknown: true };
  } finally {
    clearTimeout(t);
  }
}

(async () => {
  const opt = parseArgs(process.argv);
  const root = REPO_ROOT;
  const violations = [];
  const warnings = [];

  const ref = opt.ref || (gitOrNull(["rev-parse", "--verify", "origin/demo"]) ? "origin/demo" : "demo");
  const localSrc = gitOrNull(["show", `${ref}:zheliyin-card-assistant.user.js`]);
  const local = localSrc ? parseMeta(localSrc) : null;

  const rec = latestRecordedVersion(root);

  const res = await fetchRaw(opt.url, opt.timeout);
  const report = {
    ts: new Date().toISOString(),
    url: opt.url,
    ref,
    httpStatus: res.status,
    bytes: res.bytes == null ? null : res.bytes,
    sha256: res.sha256 || null,
    remote: null,
    local: local ? { version: local.version, constVersion: local.constVersion, updateURL: local.updateURL, downloadURL: local.downloadURL, requires: local.requires } : null,
    recordedLatest: rec.version,
    violations,
    warnings,
    status: "UNKNOWN"
  };

  if (res.networkUnknown) {
    report.status = "DEPENDENCY_NETWORK_UNKNOWN";
    warnings.push(`网络检查不可用（${res.error}）—— 按治理指令 §二十七，不据此判定代码 FAIL`);
    if (opt.strictNet) violations.push("--strict-net：网络不可用判为失败");
  } else {
    if (res.status !== 200) violations.push(`raw URL HTTP ${res.status}（期望 200）：${opt.url}`);
    else {
      const rm = parseMeta(res.body);
      report.remote = { version: rm.version, constVersion: rm.constVersion, updateURL: rm.updateURL, downloadURL: rm.downloadURL, requires: rm.requires };

      if (!rm.version) violations.push("远端响应缺少 @version");
      if (!rm.updateURL) violations.push("远端响应缺少 @updateURL");
      if (!rm.downloadURL) violations.push("远端响应缺少 @downloadURL");

      const isDemo = (u) => !!u && /\/demo\//.test(u);
      if (rm.updateURL && !isDemo(rm.updateURL)) violations.push(`@updateURL 未指向 demo：${rm.updateURL}`);
      if (rm.downloadURL && !isDemo(rm.downloadURL)) violations.push(`@downloadURL 未指向 demo：${rm.downloadURL}`);
      if (rm.updateURL && rm.downloadURL && rm.updateURL !== rm.downloadURL) violations.push("@updateURL 与 @downloadURL 不一致");

      if (rm.version && local && local.version && compareVersion(rm.version, local.version) !== 0) {
        warnings.push(`raw @version=${rm.version} 与 git ${ref} @version=${local.version} 不一致（多为 CDN 缓存滞后，可重试）`);
      }
      // 部署产物自身的版本自洽（CDN 刷新滞后时为 WARN）
      if (rm.version && rm.constVersion && rm.version !== rm.constVersion) {
        warnings.push(`raw 产物版本不一致：@version=${rm.version} 但 const VERSION=${rm.constVersion}（若刚推送，多为 CDN 未刷新；持续存在即 DEFECT-VER-01 未修）`);
      }
      if (rm.version && rec.version && compareVersion(rm.version, rec.version) < 0) {
        violations.push(`版本回退：raw @version=${rm.version} < DEMO_RELEASE 记录的最新 ${rec.version}`);
      }
      report.status = violations.length ? "FAIL" : "PASS";
    }
  }

  if (opt.out) {
    fs.mkdirSync(path.dirname(opt.out), { recursive: true });
    fs.writeFileSync(opt.out, JSON.stringify(report, null, 1));
  }

  if (opt.json) console.log(JSON.stringify(report, null, 1));
  else {
    console.log("=== Demo Update Check ===");
    console.log(`URL        : ${opt.url}`);
    console.log(`HTTP       : ${res.status == null ? "(network unknown)" : res.status}${res.bytes != null ? "  " + res.bytes + " bytes" : ""}`);
    if (res.sha256) console.log(`sha256     : ${res.sha256}`);
    console.log(`remote     : @version=${report.remote ? report.remote.version : "-"} updateURL=${report.remote && /\/demo\//.test(report.remote.updateURL || "") ? "demo ✓" : "-"} downloadURL=${report.remote && /\/demo\//.test(report.remote.downloadURL || "") ? "demo ✓" : "-"}`);
    console.log(`local ${ref} : @version=${local ? local.version : "-"}  已记录最新=${rec.version || "-"}（${rec.note}）`);
    for (const w of warnings) console.log("::warning::" + w);
    for (const v of violations) console.log("::error::" + v);
    console.log(`\n结论：${report.status}`);
  }

  process.exit(violations.length ? 1 : 0);
})();
