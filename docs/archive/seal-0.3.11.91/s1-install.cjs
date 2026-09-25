// 安装 阶段1 真机 runner + 版本 bump 0.3.11.89 -> 0.3.11.90
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = "D:/zheliyin-scriptcat";
const DST = path.join(ROOT, "runtime", "stage9", "commit-46y-local-match-rule-real.js");
const content = fs.readFileSync(path.join(__dirname, "s1-runner.txt"), "utf8").split("\r\n").join("\n");
fs.writeFileSync(DST, content, "utf8");
console.log("wrote " + path.relative(ROOT, DST).split(path.sep).join("/") + " (" + content.length + " bytes)");

const OLD = "0.3.11.89", NEW = "0.3.11.90";
const files = ["zheliyin-card-assistant.user.js", "extension/src/editor/page-bridge.js"]
  .concat(fs.readdirSync(path.join(ROOT, "runtime", "stage9")).filter((f) => f.endsWith(".js")).map((f) => "runtime/stage9/" + f));
let total = 0, touched = 0;
for (const rel of files) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) continue;
  const src = fs.readFileSync(fp, "utf8");
  const n = (src.match(new RegExp(OLD.replace(/\./g, "\\."), "g")) || []).length;
  if (!n) continue;
  fs.writeFileSync(fp, src.split(OLD).join(NEW), "utf8");
  total += n; touched += 1;
  console.log("  bump " + rel + " x" + n);
}
const us = fs.readFileSync(path.join(ROOT, "zheliyin-card-assistant.user.js"), "utf8");
console.log("bump " + OLD + "->" + NEW + " files=" + touched + " occurrences=" + total);
console.log("@version=" + (/\/\/ @version\s+([\d.]+)/.exec(us) || [])[1] + " VERSION=" + (/const VERSION = "([\d.]+)"/.exec(us) || [])[1] + " @require=" + (us.match(/^\/\/ @require\s+\S+/gm) || []).length + " vNew=" + (us.match(new RegExp("\\?v=" + NEW.replace(/\./g, "\\."), "g")) || []).length + " vOldLeft=" + (us.match(new RegExp("\\?v=" + OLD.replace(/\./g, "\\."), "g")) || []).length);
