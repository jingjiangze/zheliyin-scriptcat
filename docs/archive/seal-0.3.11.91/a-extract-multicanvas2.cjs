// 挖 MultiCanvasDiy 定义 + 多版开启流程（pageWrapMulti / copy-template / modleNum / copyMulti）
"use strict";
const fs = require("fs");
const ROOT = "D:/zheliyin-scriptcat/runtime/downloads/save-scan/";
const files = fs.readdirSync(ROOT).filter((f) => f.indexOf(".js") >= 0);
const KW = ["MultiCanvasDiy"];
const flow = ["copyMulti", "modleNum", "copyTemplate", "copy-template"];
for (const f of files) {
  const src = fs.readFileSync(ROOT + f, "utf8");
  for (const kw of KW) {
    let from = 0, hits = 0;
    while (hits < 4) {
      const i = src.indexOf(kw, from);
      if (i < 0) break;
      console.log("\n=== [" + kw + "] " + f + " @" + i + " ===");
      console.log(src.slice(Math.max(0, i - 200), Math.min(src.length, i + 900)).replace(/\s+/g, " "));
      from = i + kw.length; hits += 1;
    }
  }
}
// 多版开启流程关键片段
for (const f of files) {
  const src = fs.readFileSync(ROOT + f, "utf8");
  for (const kw of flow) {
    let from = 0, hits = 0;
    while (hits < 2) {
      const i = src.indexOf(kw, from);
      if (i < 0) break;
      if (kw === "copy-template" && hits > 0) break;
      console.log("\n--- [" + kw + "] " + f + " @" + i + " ---");
      console.log(src.slice(Math.max(0, i - 150), Math.min(src.length, i + 700)).replace(/\s+/g, " "));
      from = i + kw.length; hits += 1;
    }
  }
}