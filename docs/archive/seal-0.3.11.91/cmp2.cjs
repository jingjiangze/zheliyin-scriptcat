// 抽出两分支的 maybeApplyNativeTruth 函数体，分别落盘以便 git diff --no-index 精确比对
"use strict";
const fs = require("fs");
const path = require("path");
const DIR = __dirname;
function body(file) {
  const s = fs.readFileSync(file, "utf8").split("\r\n").join("\n");
  const i = s.indexOf("async function maybeApplyNativeTruth");
  if (i < 0) throw new Error("MISS in " + file);
  const ends = ["  // 本地 Tesseract 执行器", "  // ---- Stage 5.5B P1：识别图片文字", "  function zyBuildCopyText"];
  let j = -1;
  for (const em of ends) { const k = s.indexOf(em, i); if (k >= 0 && (j < 0 || k < j)) j = k; }
  if (j < 0) throw new Error("END MISS in " + file);
  return s.slice(i, j);
}
const d = body(path.join(DIR, "demo-us.js"));
const t = body(path.join(DIR, "test-us.js"));
fs.writeFileSync(path.join(DIR, "fn-demo.txt"), d.split("\n").map((l) => l.replace(/\s+$/, "")).join("\n") + "\n", "utf8");
fs.writeFileSync(path.join(DIR, "fn-test.txt"), t.split("\n").map((l) => l.replace(/\s+$/, "")).join("\n") + "\n", "utf8");
console.log("fn-demo lines=" + d.split("\n").length + "  fn-test lines=" + t.split("\n").length);
