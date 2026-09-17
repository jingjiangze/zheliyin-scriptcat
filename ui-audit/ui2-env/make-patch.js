/** 生成 UI-2 交付补丁：demo 分支 userscript 的 UI 段改造（unified diff 格式，便于跨分支应用） */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const REPO = "C:\\Users\\Administrator\\WorkBuddy\\2026-09-16-12-13-35\\zheliyin-scriptcat";
const GIT = "C:\\Program Files\\Git\\cmd\\git.exe";
const WORK = __dirname;
const OUTDIR = path.join(REPO, "ui-audit", "ui2-patch");

fs.mkdirSync(OUTDIR, { recursive: true });

const orig = execFileSync(GIT, ["-C", REPO, "cat-file", "blob", "e941e6d:zheliyin-card-assistant.user.js"], { maxBuffer: 64 * 1024 * 1024 });
const mod = fs.readFileSync(path.join(REPO, "ui-audit", "baseline-038", "userscript-038.js"));

fs.writeFileSync(path.join(OUTDIR, "userscript-0.3.8.0.orig.js"), orig);
fs.writeFileSync(path.join(OUTDIR, "userscript-0.3.8.0.ui2.js"), mod);

// 用 git diff --no-index 生成 unified diff
let diffTxt = "";
try {
  diffTxt = execFileSync(GIT, [
    "-C", REPO, "diff", "--no-index", "--no-color",
    "-U6",
    path.join(OUTDIR, "userscript-0.3.8.0.orig.js").replace(/\\/g, "/"),
    path.join(OUTDIR, "userscript-0.3.8.0.ui2.js").replace(/\\/g, "/"),
  ], { maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
} catch (e) {
  // git diff --no-index 有差异时返回 exit 1，输出在 stdout
  diffTxt = (e.stdout || Buffer.from("")).toString("utf8");
  if (!diffTxt) diffTxt = "[diff failed] " + e.message;
}
// 归一化路径（去掉绝对路径噪音）
diffTxt = diffTxt.replace(/a\/.*?userscript-0\.3\.8\.0\.orig\.js/g, "a/zheliyin-card-assistant.user.js")
                 .replace(/b\/.*?userscript-0\.3\.8\.0\.ui2\.js/g, "b/zheliyin-card-assistant.user.js");
fs.writeFileSync(path.join(OUTDIR, "ui2-native.patch"), diffTxt, "utf8");

const stats = {
  origBytes: orig.length,
  modBytes: mod.length,
  origLines: orig.toString("utf8").split("\n").length,
  modLines: mod.toString("utf8").split("\n").length,
  patchBytes: Buffer.byteLength(diffTxt),
  addedLines: (diffTxt.match(/^\+(?!\+\+)/gm) || []).length,
  removedLines: (diffTxt.match(/^-(?!--)/gm) || []).length,
  hunks: (diffTxt.match(/^@@/gm) || []).length,
};
fs.writeFileSync(path.join(OUTDIR, "stats.json"), JSON.stringify(stats, null, 2), "utf8");
console.log(JSON.stringify(stats, null, 2));
