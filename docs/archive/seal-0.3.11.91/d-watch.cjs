// 前台监听 46p 真机验收：轮询 runner 进程 + 报告文件，直到结束或达到本次监听上限
"use strict";
const fs = require("fs");
const cp = require("child_process");
const ROOT = "D:/zheliyin-scriptcat";
const REPORT = ROOT + "/runtime/reports/stage-11/commit-46p-real-acceptance.json";
const LOG = ROOT + "/runtime/reports/stage-11/commit-46p-demo-run.log";
const MAX_MS = Number(process.env.ZY_WATCH_MS || 540000); // 本次前台监听上限（默认 9 分钟）
const PID = Number(process.env.ZY_RUNNER_PID || 0);

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return false; } };
const findRunner = () => {
  try {
    const out = cp.execSync('wmic process where "name=\'node.exe\'" get ProcessId,CommandLine /format:csv', { encoding: "utf8" });
    const lines = out.split(/\r?\n/).filter((l) => l.indexOf("commit-46p-real-acceptance.js") >= 0);
    for (const l of lines) {
      const parts = l.split(",");
      const id = Number(parts[parts.length - 1]);
      if (id) return id;
    }
  } catch (e) {}
  return 0;
};
const st = () => {
  let rep = null;
  try { rep = fs.statSync(REPORT); } catch (e) {}
  let logSz = 0;
  try { logSz = fs.statSync(LOG).size; } catch (e) {}
  return { reportMtime: rep ? rep.mtime.toISOString() : null, logSz };
};
const summarize = () => {
  try {
    const r = JSON.parse(fs.readFileSync(REPORT, "utf8"));
    const rows = (r.runs || []).map((x) => {
      const f = (x.roundsData || []).flatMap((d) => (d.frozen && d.frozen.fails) || []);
      const pf = (x.roundsData || []).flatMap((d) => d.previewFails || []);
      const af = (x.roundsData || []).flatMap((d) => d.applyFails || []);
      const er = (x.roundsData || []).flatMap((d) => d.errors || []);
      return { case: x.case, roundsDone: x.roundsDone, matched: (x.roundsData || []).map((d) => d.matchedCount), frozenFails: f.length, previewFails: pf.length, applyFails: af.length, roundErrs: er.length, bver: x.bver || null, backExists: x.backExists };
    });
    return { ts: r.ts, stage: r.stage, bverExpect: r.bverExpect, aiModel: r.aiModel, cookieSource: r.cookieSource, errors: r.errors, rows: rows };
  } catch (e) { return { error: String(e && e.message || e) }; }
};

(async () => {
  const t0 = Date.now();
  let pid = PID || findRunner();
  console.log("[watch] runner pid=" + (pid || "NOT_FOUND") + " maxMs=" + MAX_MS + " start=" + new Date().toISOString());
  if (!pid) { console.log("[watch] 未找到 runner 进程，可能已结束"); }
  let last = st();
  console.log("[watch] report.mtime=" + last.reportMtime + " logSize=" + last.logSz);
  while (Date.now() - t0 < MAX_MS) {
    await new Promise((r) => setTimeout(r, 20000));
    const cur = st();
    const el = Math.round((Date.now() - t0) / 1000);
    const up = pid ? alive(pid) : false;
    console.log("[watch] t+" + el + "s runnerAlive=" + up + " logSize=" + cur.logSz + " reportMtime=" + cur.reportMtime);
    if (cur.logSz !== last.logSz) {
      const tail = cp.execSync('powershell -NoProfile -Command "Get-Content -Path \'' + LOG + '\' -Tail 25"', { encoding: "utf8" });
      console.log("[watch] --- new log ---\n" + tail);
      last = cur;
    }
    if (!up) { console.log("[watch] runner 已退出"); break; }
  }
  console.log("[watch] === 报告摘要 ===");
  console.log(JSON.stringify(summarize(), null, 2));
  const pidAfter = findRunner();
  console.log("[watch] runner still running after this window: " + (pidAfter ? ("YES pid=" + pidAfter) : "NO"));
  process.exit(0);
})();
