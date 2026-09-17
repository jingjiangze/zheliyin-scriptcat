// runtime/stage-6-2-scan.js — 在 vendor bundle 里定位模式并打印上下文（行长可能很大，手动切片）
"use strict";
const fs = require("fs");
const path = require("path");
const DIR = path.join(__dirname, "vendor", "252438");
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".js") && /r\d+/.test(f));
const pattern = process.argv[2] || "普通文本|addText|createText";
const ctxChars = Number(process.argv[3] || 600);
const re = new RegExp(pattern);
let hit = 0;
files.forEach((f) => {
  const txt = fs.readFileSync(path.join(DIR, f), "utf8");
  let idx = 0;
  let m;
  while ((m = re.exec(txt.slice(idx)))) {
    const at = idx + m.index;
    const start = Math.max(0, at - Math.floor(ctxChars / 2));
    const snip = txt.slice(start, at + ctxChars / 2).replace(/\s+/g, " ").slice(0, ctxChars);
    console.log("==== " + f + " @ " + at + "\n" + snip + "\n");
    hit += 1;
    if (hit >= (Number(process.argv[4] || 12))) { console.log("(hit cap reached)"); process.exit(0); }
    idx = at + m[0].length;
  }
});
console.log("scan done, hits=" + hit);