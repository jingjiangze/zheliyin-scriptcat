/**
 * 生成 UI-3 交付补丁。
 *
 * 产出两个 diff：
 *   ui2-native.patch        累计：demo 原始 v0.3.8.0 → 当前（UI-2 + UI-3）
 *   ui3-native.patch        增量：UI-2 结果 → UI-3 结果（只包含本轮的 9 项修复）
 *
 * 增量 diff 是关键证据：它证明本轮只动了 UI-3 清单里的项目，且都在
 * #zy-native-ocr-panel / #zy-native-ocr-tool-btn 作用域内（§十一）。
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const REPO = "C:\\Users\\Administrator\\WorkBuddy\\2026-09-16-12-13-35\\zheliyin-scriptcat";
const GIT = "C:\\Program Files\\Git\\cmd\\git.exe";
const WORK = __dirname;
const OUTDIR = path.join(REPO, "ui-audit", "ui2-patch");
const OUTDIR3 = path.join(REPO, "ui-audit", "ui3-patch");
fs.mkdirSync(OUTDIR3, { recursive: true });

const gitDiff = (a, b, out) => {
  let t = "";
  try {
    t = execFileSync(GIT, ["-C", REPO, "diff", "--no-index", "--no-color", "-U6",
      a.replace(/\\/g, "/"), b.replace(/\\/g, "/")], { maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
  } catch (e) {
    t = (e.stdout || Buffer.from("")).toString("utf8") || "[diff failed] " + e.message;
  }
  t = t.replace(/a[\/\\].*?\.orig\.js/g, "a/zheliyin-card-assistant.user.js")
       .replace(/a[\/\\].*?\.ui2\.js/g, "a/zheliyin-card-assistant.user.js")
       .replace(/b[\/\\].*?\.ui2\.js/g, "b/zheliyin-card-assistant.user.js")
       .replace(/b[\/\\].*?\.ui3\.js/g, "b/zheliyin-card-assistant.user.js");
  fs.writeFileSync(out, t, "utf8");
  return t;
};

const statOf = (orig, mod, diffTxt) => ({
  origBytes: orig.length,
  modBytes: mod.length,
  origLines: orig.toString("utf8").split("\n").length,
  modLines: mod.toString("utf8").split("\n").length,
  patchBytes: Buffer.byteLength(diffTxt),
  addedLines: (diffTxt.match(/^\+(?!\+\+)/gm) || []).length,
  removedLines: (diffTxt.match(/^-(?!--)/gm) || []).length,
  hunks: (diffTxt.match(/^@@/gm) || []).length,
});

// ---- 累计：原始 demo v0.3.8.0 → UI-3 结果 ----
const orig = execFileSync(GIT, ["-C", REPO, "cat-file", "blob", "e941e6d:zheliyin-card-assistant.user.js"], { maxBuffer: 64 * 1024 * 1024 });
const cur = fs.readFileSync(path.join(REPO, "ui-audit", "baseline-038", "userscript-038.js"));

fs.writeFileSync(path.join(OUTDIR, "userscript-0.3.8.0.orig.js"), orig);
fs.writeFileSync(path.join(OUTDIR, "userscript-0.3.8.0.ui2.js"), cur);
const cumDiff = gitDiff(
  path.join(OUTDIR, "userscript-0.3.8.0.orig.js"),
  path.join(OUTDIR, "userscript-0.3.8.0.ui2.js"),
  path.join(OUTDIR, "ui2-native.patch")
);

// ---- 增量：UI-2 结果 → UI-3 结果 ----
// UI-2 结果 = 用备份分支上的 ui2 版本；此处以「去掉 UI-3 注释行的当前文件」不可靠，
// 改从 git 里取 UI-2 提交时的 blob（c1ff5ce 的 ui-audit/ui2-patch/userscript-0.3.8.0.ui2.js）
let ui2Blob = null;
try {
  ui2Blob = execFileSync(GIT, ["-C", REPO, "cat-file", "blob",
    "c1ff5ce:ui-audit/ui2-patch/userscript-0.3.8.0.ui2.js"], { maxBuffer: 64 * 1024 * 1024 });
} catch (e) { ui2Blob = null; }

if (ui2Blob) {
  fs.writeFileSync(path.join(OUTDIR3, "userscript-0.3.8.0.ui2.js"), ui2Blob);
  fs.writeFileSync(path.join(OUTDIR3, "userscript-0.3.8.0.ui3.js"), cur);
  const incDiff = gitDiff(
    path.join(OUTDIR3, "userscript-0.3.8.0.ui2.js"),
    path.join(OUTDIR3, "userscript-0.3.8.0.ui3.js"),
    path.join(OUTDIR3, "ui3-native.patch")
  );
  const incStats = statOf(ui2Blob, cur, incDiff);
  fs.writeFileSync(path.join(OUTDIR3, "stats.json"), JSON.stringify(incStats, null, 2), "utf8");
  console.log("=== INCREMENTAL (UI-2 -> UI-3) ===");
  console.log(JSON.stringify(incStats, null, 2));
  // 列出增量 diff 里改动的 CSS 属性，供 §十一 合规复核
  const changed = incDiff.split("\n").filter(l => /^[+-](?![+-])/.test(l)).map(l => l.trim());
  console.log("\n=== changed lines ===");
  changed.forEach(l => console.log(l));
} else {
  console.log("[WARN] cannot read UI-2 blob from c1ff5ce; incremental diff skipped");
}

const cumStats = statOf(orig, cur, cumDiff);
fs.writeFileSync(path.join(OUTDIR, "stats.json"), JSON.stringify(cumStats, null, 2), "utf8");
console.log("\n=== CUMULATIVE (demo orig -> UI-3) ===");
console.log(JSON.stringify(cumStats, null, 2));
