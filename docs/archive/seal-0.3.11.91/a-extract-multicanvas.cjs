// 提取编辑器源码中 multiCanvas / 多版 相关片段（压缩代码，按命中位置切片）
"use strict";
const fs = require("fs");
const ROOT = "D:/zheliyin-scriptcat/runtime/downloads/save-scan/";
const targets = [
  { f: "MultiNewPagePublic.js-v20260707017", kw: ["multiCanvas", "多版"] },
  { f: "CanvasDiy.js-v20260707017", kw: ["multiCanvas"] },
  { f: "DULeftNativePublic.js-v20260707017", kw: ["multiCanvas", "多版"] },
  { f: "sundry.js-v20260707017", kw: ["multiCanvas"] }
];
const CTX = 260;
for (const t of targets) {
  const p = ROOT + t.f;
  if (!fs.existsSync(p)) { console.log("MISSING " + t.f); continue; }
  const src = fs.readFileSync(p, "utf8");
  console.log("\n========================================");
  console.log("FILE " + t.f + "  len=" + src.length);
  for (const kw of t.kw) {
    let from = 0, hits = 0;
    while (hits < 8) {
      const i = src.indexOf(kw, from);
      if (i < 0) break;
      const s = Math.max(0, i - CTX), e = Math.min(src.length, i + kw.length + CTX);
      console.log("\n--- [" + kw + "] @" + i + " ---");
      console.log(src.slice(s, e).replace(/\s+/g, " "));
      from = i + kw.length; hits += 1;
    }
  }
}