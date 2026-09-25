// P1+stage12 合并后版本 bump：0.3.11.77 → 0.3.11.78
// 起因：P1（本地）与 stage-12 OCR（远端 test）各自独立占用 0.3.11.77，内容不同 →
//   合并后必须升版，避免 @require ?v=0.3.11.77 缓存混版（旧模块 + 新 userscript）。
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = "D:/zheliyin-scriptcat";
const OLD = "0.3.11.77", NEW = "0.3.11.78";
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
  console.log("  bump " + rel + " ×" + n);
}
const us = fs.readFileSync(path.join(ROOT, "zheliyin-card-assistant.user.js"), "utf8");
console.log("bump " + OLD + "->" + NEW + " total=" + total);
console.log("@version=" + (/\/\/ @version\s+([\d.]+)/.exec(us) || [])[1] + " VERSION=" + (/const VERSION = "([\d.]+)"/.exec(us) || [])[1] + " @require=" + (us.match(/^\/\/ @require\s+\S+/gm) || []).length + " vMatch=" + (us.match(new RegExp("\\?v=" + NEW.replace(/\./g, "\\."), "g")) || []).length);