// 对比 demo vs test 的 native truth 流水线函数体（用户要求：对比代码审计）
"use strict";
const fs = require("fs");
const path = require("path");
const DIR = __dirname;
function extract(file, startMark, endMarks) {
  const s = fs.readFileSync(file, "utf8").split("\r\n").join("\n");
  const i = s.indexOf(startMark);
  if (i < 0) return "/* MISS: " + startMark + " */";
  let j = -1;
  for (const em of endMarks) { const k = s.indexOf(em, i + startMark.length); if (k >= 0 && (j < 0 || k < j)) j = k; }
  return s.slice(i, j < 0 ? Math.min(s.length, i + 30000) : j);
}
const ends = ["  // 本地 Tesseract 执行器", "  // ---- Stage 5.5B P1：识别图片文字", "  function zyBuildCopyText", "  async function copyLayerTexts"];
const out = [];
out.push("==== maybeApplyNativeTruth（demo=0.3.11.74） ====");
out.push(extract(path.join(DIR, "demo-us.js"), "async function maybeApplyNativeTruth", ends));
out.push("");
out.push("==== maybeApplyNativeTruth（test=0.3.11.88） ====");
out.push(extract(path.join(DIR, "test-us.js"), "async function maybeApplyNativeTruth", ends));
out.push("");
out.push("==== nativeTruthGatePassed/Fail（demo） ====");
out.push(extract(path.join(DIR, "demo-us.js"), "function nativeTruthGatePassed", ["  async function maybeApplyNativeTruth"]));
out.push("");
out.push("==== nativeTruthGatePassed/Fail（test） ====");
out.push(extract(path.join(DIR, "test-us.js"), "function nativeTruthGatePassed", ["  async function maybeApplyNativeTruth"]));
fs.writeFileSync(path.join(DIR, "cmp-native-truth.txt"), out.join("\n"), "utf8");
console.log("wrote cmp-native-truth.txt");
