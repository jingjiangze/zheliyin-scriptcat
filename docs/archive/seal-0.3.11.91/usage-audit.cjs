// OCR / 套版 模块「被引用度」审计：统计各 @require 模块导出的顶层函数在 userscript 中的引用次数
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = "D:/zheliyin-scriptcat";
const US = fs.readFileSync(path.join(ROOT, "zheliyin-card-assistant.user.js"), "utf8");
const PB = fs.readFileSync(path.join(ROOT, "extension", "src", "editor", "page-bridge.js"), "utf8");
function scanDir(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir).forEach((f) => {
    if (!f.endsWith(".js")) return;
    const p = path.join(dir, f);
    const s = fs.readFileSync(p, "utf8");
    const names = [];
    s.split("\n").forEach((ln) => {
      const m = /^function\s+(\w+)/.exec(ln);
      if (m) names.push(m[1]);
    });
    if (!names.length) return;
    let usRef = 0, pbRef = 0;
    names.forEach((n) => {
      const re = new RegExp("\\b" + n + "\\b", "g");
      usRef += (US.match(re) || []).length - (US.indexOf("// ==== @require") >= 0 ? 0 : 0);
      pbRef += (PB.match(re) || []).length;
    });
    out.push({ file: f, dir: path.basename(dir), fns: names.length, refs: usRef + pbRef, sample: names.slice(0, 3).join(",") });
  });
  return out;
}
const list = [].concat(
  scanDir(path.join(ROOT, "extension", "src", "ocr")),
  scanDir(path.join(ROOT, "extension", "src", "editor")),
  scanDir(path.join(ROOT, "extension", "src", "ai")),
  scanDir(path.join(ROOT, "extension", "src", "fields")),
  scanDir(path.join(ROOT, "extension", "src", "core"))
).sort((a, b) => a.refs - b.refs);
console.log("dir/file | 顶层函数数 | userscript+bridge 引用次数 | 示例导出");
list.forEach((x) => console.log([x.dir, x.file, x.fns, x.refs, x.sample].join(" | ")));
const unused = list.filter((x) => x.refs === 0);
console.log("\n未被 userscript/page-bridge 直接引用的模块数 = " + unused.length + " / " + list.length);
console.log("零引用模块：" + unused.map((x) => x.file).join(", "));
