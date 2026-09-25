// 版本 bump 0.3.11.85 -> 0.3.11.86（修复无 Native 文字真值误报 + 去掉会话 UI）
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = "D:/zheliyin-scriptcat";
const OLD = "0.3.11.85", NEW = "0.3.11.86";
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
