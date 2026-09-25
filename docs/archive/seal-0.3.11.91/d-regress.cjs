// demo 轨发布回归：单测 + runner selftest + release-audit(--branch demo) + 版本链一致性
"use strict";
const fs = require("fs");
const cp = require("child_process");
const ROOT = "D:/zheliyin-scriptcat";
const US = ROOT + "/zheliyin-card-assistant.user.js";
let fail = 0;
const log = (s) => console.log(s);

// ---- 1) 版本链一致性 ----
const s = fs.readFileSync(US, "utf8").replace(/\r\n/g, "\n");
const ver = (/\/\/ @version\s+([\d.]+)/.exec(s) || [])[1];
const verConst = (/const VERSION = "([\d.]+)"/.exec(s) || [])[1];
const reqs = (s.match(/^\/\/ @require\s+(\S+)/gm) || []).map((l) => l.replace(/^\/\/ @require\s+/, ""));
const reqTest = reqs.filter((u) => u.includes("zheliyin-scriptcat/test/")).length;
const reqDemo = reqs.filter((u) => u.includes("zheliyin-scriptcat/demo/")).length;
const reqV = reqs.filter((u) => u.includes("?v=" + ver)).length;
const up = /\/\/ @updateURL\s+(\S+)/.exec(s);
const dl = /\/\/ @downloadURL\s+(\S+)/.exec(s);
const updC = /const UPDATE_URL = "([^"]+)"/.exec(s);
const dnlC = /const DOWNLOAD_URL = "([^"]+)"/.exec(s);
log("== 版本链 ==");
log("  @version=" + ver + " VERSION=" + verConst + " | @require=" + reqs.length + " (demo=" + reqDemo + ", test=" + reqTest + ", v匹配=" + reqV + ")");
log("  @updateURL=" + (up ? up[1] : "MISSING") + " | @downloadURL=" + (dl ? dl[1] : "MISSING"));
log("  UPDATE_URL=" + (updC ? updC[1] : "MISSING") + " | DOWNLOAD_URL=" + (dnlC ? dnlC[1] : "MISSING"));
const demoUrl = "https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/zheliyin-card-assistant.user.js";
// 轨道自适应：test 轨 = 全部 @require 指向 test 且无 @updateURL/@downloadURL；demo 轨 = 全部指向 demo 且两者自洽
const BRANCH = cp.execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
let vcOK;
if (BRANCH === "demo") {
  vcOK = ver === verConst && reqTest === 0 && reqDemo === reqs.length && reqV === reqs.length &&
    up && up[1] === demoUrl && dl && dl[1] === demoUrl && updC && updC[1] === demoUrl && dnlC && dnlC[1] === demoUrl;
} else {
  vcOK = ver === verConst && reqDemo === 0 && reqTest === reqs.length && reqV === reqs.length && !up && !dl;
}
log("  分支=" + BRANCH + " 版本链一致性: " + (vcOK ? "PASS" : "FAIL"));
if (!vcOK) fail++;

// ---- 2) 语法检查 ----
log("== node --check ==");
{
  const r = cp.spawnSync(process.execPath, ["--check", US], { cwd: ROOT, encoding: "utf8" });
  log("  userscript: " + (r.status === 0 ? "PASS" : "FAIL " + (r.stderr || "").slice(0, 200)));
  if (r.status !== 0) fail++;
}
for (const f of ["extension/src/ai/rule-match.js", "extension/src/ai/template-match-plan.js", "extension/src/ai/template-match-validator.js",
  "extension/src/editor/template-apply-v2.js", "extension/src/editor/template-snapshot.js", "extension/src/editor/page-bridge.js"]) {
  const r = cp.spawnSync(process.execPath, ["--check", ROOT + "/" + f], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) { log("  FAIL " + f + " :: " + (r.stderr || "").slice(0, 200)); fail++; }
}
log("  modules: checked");

// ---- 3) 单测 ----
log("== 单测 ==");
const unit = fs.readdirSync(ROOT + "/runtime/stage9").filter((f) => f.endsWith(".test.js")).map((f) => "runtime/stage9/" + f)
  .concat(fs.readdirSync(ROOT + "/runtime/stage11").filter((f) => f.endsWith(".test.js")).map((f) => "runtime/stage11/" + f));
let uOK = 0;
for (const g of unit) {
  const r = cp.spawnSync(process.execPath, [g], { cwd: ROOT, encoding: "utf8", timeout: 180000 });
  const out = ((r.stdout || "") + (r.stderr || "")).trim().split("\n");
  const tail = out.slice(-1)[0];
  if (r.status !== 0) { fail++; log("  FAIL " + g + " :: " + out.slice(-3).join(" | ")); }
  else { uOK++; log("  OK   " + g + " :: " + tail); }
}
log("  单测: " + uOK + "/" + unit.length + " PASS");

// ---- 4) runner selftest ----
log("== runner selftest ==");
const runners = fs.readdirSync(ROOT + "/runtime/stage9").filter((f) => /^commit-46.*-real\.js$/.test(f));
let rOK = 0;
for (const g of runners) {
  const r = cp.spawnSync(process.execPath, [ROOT + "/runtime/stage9/" + g, "--selftest"], { cwd: ROOT, encoding: "utf8", timeout: 120000 });
  const out = String(r.stdout || "");
  if (r.status !== 0) { fail++; log("  FAIL " + g + " :: " + (out || (r.stderr || "")).trim().slice(-200)); }
  else { rOK++; log("  OK   " + g + " :: " + out.trim().split("\n").slice(-1)[0]); }
}
log("  selftest: " + rOK + "/" + runners.length + " PASS");

log(fail ? ("TOTAL FAILS=" + fail) : "ALL GREEN");
process.exit(fail ? 1 : 0);
