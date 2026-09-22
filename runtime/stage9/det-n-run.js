"use strict";
// ---------------------------------------------------------------------
// runtime/stage9/det-n-run.js — Stage 9.9 Geometry Determinism / Ink-Off A-B Harness（只读）
// ---------------------------------------------------------------------
// 目的：审计「同卡同输入 → 不同输出」的运行时几何非确定性，以及墨迹接管开关的差异。
// 方法：对同一卡片（ZY_BG_FILE，默认 real-card-xiazhu.png）以子进程隔离连续运行
//       commit-46-real.js N 次（每次全新浏览器会话，符合「同输入不同输出」判定条件），
//       每次运行后归档 per-case JSON，随后聚合：
//         - OCR bbox 输入方差（ocrBBox8d）
//         - Geometry Solver 输出方差（targetGeometry left/top/width/height/angle + fontSize + fontFamily）
//         - visualGeomSource 分布（IMAGE_INK vs OCR_BBOX_FALLBACK）
//       determinism pass 容差：left/top/width/height ≤3px，angle ≤0.5°，fontSize ≤1px。
// 不修改 production userscript / commit-46-real 生产逻辑；仅新增本审计 harness。
// 用法：P0_LOGIN_USER/PASS + ZY_BAIDU_AK/SK 注入；node runtime/stage9/det-n-run.js [B=10] [A=3]
// 报告：runtime/reports/stage-9/det-9.9/determinism-summary.json + det-run-{ab}-{i}.json
// ---------------------------------------------------------------------
"use strict";
const path = require("path");
const fs = require("fs");
const { spawnSync, execSync } = require("child_process");
const probeMod = require("./session-probe");
const ROOT = path.join(__dirname, "..", "..");
const REQ = "runtime/reports/stage-9";
const OUTDIR = path.join(ROOT, REQ, "det-9.9");
const REPORT_SUM = path.join(OUTDIR, "determinism-summary.json");

function stdevOf(arr) {
  if (!arr || arr.length < 2) return null;
  const n = arr.length, m = arr.reduce((a, b) => a + b, 0) / n;
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) * (b - m), 0) / (n - 1));
}
function rangeOf(arr) {
  const f = (arr || []).filter((v) => v != null && isFinite(v));
  if (!f.length) return null;
  const mn = Math.min.apply(null, f), mx = Math.max.apply(null, f);
  return { min: Math.round(mn * 100) / 100, max: Math.round(mx * 100) / 100, range: Math.round((mx - mn) * 100) / 100 };
}

async function main() {
  const bCount = Number(process.argv[2] || 10);
  const aCount = Number(process.argv[3] || 3);
  const cookie = await probeMod.resolveStage9Cookie();
  if (!cookie.ok || !cookie.raw) { console.error("[det-n-run] cookie resolve failed: " + (cookie.error || "NO_COOKIE")); process.exit(2); }
  console.log("[det-n-run] cookie source=" + cookie.source + " (chars=" + cookie.raw.length + ")");
  fs.mkdirSync(OUTDIR, { recursive: true });
  let gitHead = "?";
  try { gitHead = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(); } catch (e) {}
  const rpt = { ts: new Date().toISOString(), card: process.env.ZY_BG_FILE || "runtime/stage8b/assets/real-card-xiazhu.png", cookieSource: cookie.source, gitHead, plan: { B: bCount, A: aCount }, runs: [], blocks: {}, failures: [], aggregate: null };
  const jobs = [];
  for (let i = 1; i <= bCount; i += 1) jobs.push({ ab: "B", i });
  for (let i = 1; i <= aCount; i += 1) jobs.push({ ab: "A", i });
  for (const j of jobs) {
    const t0 = Date.now();
    const env = Object.assign({}, process.env, { ZY_CASE: "V0", ZY_AB: j.ab, ZY_STAGE9_COOKIE: cookie.raw, ZY_SESSION_REFRESH: "0" });
    const r = spawnSync(process.execPath, [path.join(ROOT, "runtime", "stage9", "commit-46-real.js")], { cwd: ROOT, env, encoding: "utf8", timeout: 420000 });
    const tag = "det-run-" + j.ab + "-" + j.i;
    const rec = { tag, ab: j.ab, exit: r.status, durMs: Date.now() - t0, rows: 0, sources: {}, status: null };
    if (r.status !== 0) { rec.stderr = String(r.stderr || r.stdout || "").slice(0, 300); rpt.failures.push(tag + " exit=" + r.status); }
    const perCase = path.join(ROOT, REQ, "commit-46-real-V0-" + j.ab + ".json");
    if (fs.existsSync(perCase)) {
      let data = null;
      try { data = JSON.parse(fs.readFileSync(perCase, "utf8")); } catch (e) { rpt.failures.push(tag + " parse-fail"); }
      if (data) {
        fs.writeFileSync(path.join(OUTDIR, tag + ".json"), JSON.stringify(data, null, 2), "utf8");
        rec.status = data.status || null;
        (data.visualRows || []).forEach((row) => {
          const key = String(row.nativeText || "?");
          rec.rows += 1;
          const src = String(row.visualGeometrySource || "?");
          rec.sources[src] = (rec.sources[src] || 0) + 1;
          if (!rpt.blocks[key]) rpt.blocks[key] = {};
          const blk = rpt.blocks[key];
          const tg = row.targetGeometry || {}, ob = row.ocrBBox || {};
          const pushF = (name, v) => { if (!blk[name]) blk[name] = {}; if (!blk[name][j.ab]) blk[name][j.ab] = []; if (v != null && isFinite(v)) blk[name][j.ab].push(Math.round(v * 100) / 100); };
          pushF("target.left", tg.left); pushF("target.top", tg.top);
          pushF("target.width", tg.width); pushF("target.height", tg.height);
          pushF("target.angle", tg.angle);
          pushF("fontSize", row.fontSize);
          if (row.fontFamily != null) { if (!blk["fontFamily"]) blk["fontFamily"] = {}; if (!blk["fontFamily"][j.ab]) blk["fontFamily"][j.ab] = []; blk["fontFamily"][j.ab].push(String(row.fontFamily)); }
          pushF("ocrBBox.left", ob.left); pushF("ocrBBox.width", ob.width); pushF("ocrBBox.height", ob.height);
        });
      }
    }
    rpt.runs.push(rec);
    console.log("[det-n-run] " + tag + " exit=" + rec.exit + " dur=" + Math.round(rec.durMs / 1000) + "s rows=" + rec.rows + " sources=" + JSON.stringify(rec.sources));
  }
  const TOL = { "target.left": 3, "target.top": 3, "target.width": 3, "target.height": 3, "target.angle": 0.5, "fontSize": 1, "ocrBBox.left": 3, "ocrBBox.width": 3, "ocrBBox.height": 3 };
  const agg = { pass: true, degradedFields: [], perBlock: [] };
  Object.keys(rpt.blocks).sort().forEach((key) => {
    const blk = rpt.blocks[key];
    const row = { block: key };
    Object.keys(TOL).forEach((f) => {
      row[f] = {};
      ["B", "A"].forEach((ab) => {
        const arr = blk[f] && blk[f][ab] ? blk[f][ab] : null;
        const rng = arr ? rangeOf(arr) : null;
        const sd = arr ? stdevOf(arr) : null;
        row[f][ab] = rng ? { range: rng.range, min: rng.min, max: rng.max, stdev: sd != null ? Math.round(sd * 100) / 100 : null, n: arr.length } : { n: recordN(blk, f, ab) };
        if (rng && rng.range > TOL[f] && agg.degradedFields.indexOf(f) < 0) agg.degradedFields.push(f);
      });
    });
    const fam = new Set((blk["fontFamily"] && blk["fontFamily"].B) || []);
    row.fontFamilyB = Array.from(fam);
    row.fontFamilyACount = ((blk["fontFamily"] && blk["fontFamily"].A) || []).length;
    agg.perBlock.push(row);
  });
  function recordN(blk, f, ab) { return (blk[f] && blk[f][ab] && blk[f][ab].length) || 0; }
  agg.pass = agg.degradedFields.length === 0;
  rpt.aggregate = agg;
  fs.writeFileSync(REPORT_SUM, JSON.stringify(rpt, null, 2), "utf8");
  console.log("[det-n-run] DONE pass=" + agg.pass + " degradedFields=" + JSON.stringify(agg.degradedFields) + " runs=" + rpt.runs.length + " failures=" + rpt.failures.length);
  if (rpt.failures.length) { console.error("[det-n-run] FAILURES: " + JSON.stringify(rpt.failures)); process.exitCode = 3; }
}
main().catch((e) => { console.error("FATAL: " + String(e && e.message || e)); process.exit(1); });
