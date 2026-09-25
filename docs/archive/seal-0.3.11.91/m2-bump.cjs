// M2-6 版本链 bump：0.3.11.74 → 0.3.11.75（userscript / page-bridge stamp / stage9 runner BVER+断言）
// 报告文件（runtime/reports/**）属历史证据，不改。
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = "D:/zheliyin-scriptcat";
const OLD = "0.3.11.74";
const NEW = "0.3.11.75";
const files = ["zheliyin-card-assistant.user.js", "extension/src/editor/page-bridge.js"]
  .concat(fs.readdirSync(path.join(ROOT, "runtime", "stage9")).filter((f) => f.endsWith(".js")).map((f) => "runtime/stage9/" + f));
let total = 0;
for (const rel of files) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) continue;
  const src = fs.readFileSync(fp, "utf8");
  const n = (src.match(new RegExp(OLD.replace(/\./g, "\\."), "g")) || []).length;
  if (!n) continue;
  fs.writeFileSync(fp, src.split(OLD).join(NEW), "utf8");
  total += n;
  console.log("  " + rel + " ×" + n);
}
console.log("bumped " + OLD + " -> " + NEW + " total=" + total);
// 残留检查
let left = 0;
for (const rel of files) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) continue;
  const c = (fs.readFileSync(fp, "utf8").match(new RegExp(OLD.replace(/\./g, "\\."), "g")) || []).length;
  left += c;
}
console.log("remaining " + OLD + " in code=" + left);
const us = fs.readFileSync(path.join(ROOT, "zheliyin-card-assistant.user.js"), "utf8");
console.log("userscript @version=" + (/\/\/ @version\s+([\d.]+)/.exec(us) || [])[1] + " VERSION=" + (/const VERSION = "([\d.]+)"/.exec(us) || [])[1] + " @require=" + (us.match(/^\/\/ @require\s+\S+/gm) || []).length + " vMatch=" + (us.match(new RegExp("\\?v=" + NEW.replace(/\./g, "\\."), "g")) || []).length);
process.exit(left ? 1 : 0);
