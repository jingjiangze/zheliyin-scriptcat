// 通用前台监听器：轮询 runner 进程 + 报告，直到结束或达到本次监听上限
// 环境变量：ZY_REPORT 报告路径；ZY_RUNNER_PAT 进程命令行匹配串；ZY_WATCH_MS 上限（默认 9 分钟）
"use strict";
const fs = require("fs");
const cp = require("child_process");
const REPORT = process.env.ZY_REPORT || "";
const PAT = process.env.ZY_RUNNER_PAT || "";
const MAX_MS = Number(process.env.ZY_WATCH_MS || 540000);
const PID = Number(process.env.ZY_RUNNER_PID || 0);

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return false; } };
const findRunner = () => {
  if (!PAT) return 0;
  try {
    const out = cp.execSync('wmic process where "name=\'node.exe\'" get ProcessId,CommandLine /format:csv', { encoding: "utf8" });
    const lines = out.split(/\r?\n/).filter((l) => l.indexOf(PAT) >= 0);
    for (const l of lines) {
      const parts = l.split(",");
      const id = Number(parts[parts.length - 1]);
      if (id) return id;
    }
  } catch (e) {}
  return 0;
};
const st = () => { try { return fs.statSync(REPORT).mtime.toISOString(); } catch (e) { return null; } };

(async () => {
  const t0 = Date.now();
  const pid = PID || findRunner();
  console.log("[watch2] report=" + REPORT + " pat=" + PAT + " pid=" + (pid || "NOT_FOUND") + " maxMs=" + MAX_MS + " start=" + new Date().toISOString());
  console.log("[watch2] report.mtime=" + st());
  while (Date.now() - t0 < MAX_MS) {
    await new Promise((r) => setTimeout(r, 20000));
    const up = pid ? alive(pid) : false;
    console.log("[watch2] t+" + Math.round((Date.now() - t0) / 1000) + "s runnerAlive=" + up + " reportMtime=" + st());
    if (!up) { console.log("[watch2] runner 已退出"); break; }
  }
  const still = findRunner();
  console.log("[watch2] runner still running after this window: " + (still ? ("YES pid=" + still) : "NO"));
  process.exit(0);
})();