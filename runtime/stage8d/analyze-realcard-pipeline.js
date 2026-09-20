// runtime/stage8d/analyze-realcard-pipeline.js — Stage 8D P3 取证分析
// 输入：real-card E2E 报告（含 RAW_WORDS8D 日志 = Tesseract 原 word 级证据）
// 复现证据链：RAW_WORDS → groupWordsToLines（word→line）→ groupLinesToBlocks（line→block）
// 输出：每层统计 + 异常块定位（跨距/过度合并/碎片），用于判断「Word→Line 错 or Line→Block 错」
"use strict";
const path = require("path");
const fs = require("fs");
const CN = require("../../extension/src/ocr/candidate-normalizer.js");

const report = process.argv[2] || "runtime/reports/stage-8b/real-card-gate-a0-v0321124.json";
const r = JSON.parse(fs.readFileSync(report, "utf8"));
const cons = r.console || [];
const rawLine = cons.find((l) => l.indexOf("RAW_WORDS8D") >= 0);
if (!rawLine) { console.error("NO RAW_WORDS8D in report — 该报告没有 word 级证据，无法取证"); process.exit(1); }

// 解析 RAW_WORDS8D：text@{"x":..,"y":..,"w":..,"h":..}:conf|...
const RAW = rawLine.slice(rawLine.indexOf("RAW_WORDS8D") + "RAW_WORDS8D ".length);
const words = RAW.split("|").map((seg) => {
  const m = /^([^@]*)@(\{[^}]*\})(?::(\d+))?$/.exec(seg.trim());
  if (!m) return null;
  const b = JSON.parse(m[2]);
  return { text: m[1], bbox: { x: b.x, y: b.y, width: b.w, height: b.h }, confidence: m[3] ? Number(m[3]) / 100 : null };
}).filter(Boolean);

// tesseract word bbox 是 {x0,y0,x1,y1} 形态，RAW 里已按 x0/x1 折算为 x,y,width,height
const IMG = { width: 895, height: 577 };
console.log("=== RAW_WORDS ===");
console.log("count=" + words.length + " image=" + IMG.width + "x" + IMG.height);
words.forEach((w, i) => console.log("  " + i + " " + JSON.stringify({ t: w.text, x: w.bbox.x, y: w.bbox.y, w: w.bbox.width, h: w.bbox.height, c: w.confidence })));

// 1) word → line（与运行时 aggregateLineCandidates 同参数）
const lines = CN.groupWordsToLines(words, { tessLines: null });
console.log("\n=== WORD->LINE (groupWordsToLines) ===");
console.log("lines=" + lines.length);
lines.forEach((l, i) => console.log("  " + i + " y=" + Math.round(l.bbox.y) + " h=" + Math.round(l.bbox.height) + " w=" + Math.round(l.bbox.width) + " '" + String(l.text).slice(0, 24) + "'"));

// 2) line → block
const blocks = CN.groupLinesToBlocks(lines, {});
console.log("\n=== LINE->BLOCK (groupLinesToBlocks) ===");
console.log("blocks=" + blocks.length);
blocks.forEach((b, i) => {
  const over = [];
  if (b.bbox.height > IMG.height * 0.4) over.push("跨距>40%图高");
  if (b.lineCount > 3) over.push("多行>" + b.lineCount);
  console.log("  block" + i + " lines=" + b.lineCount + " y=" + Math.round(b.bbox.y) + " h=" + Math.round(b.bbox.height) + over.length ? " ⚠" + over.join("/") : "" + " text=" + String(b.text || "").replace(/\n/g, "/").slice(0, 40));
});

console.log("\n=== 判定 ===");
// 精简低置信/窄条在 word 层仍存在 → word→line 问题；line 层过度合并 → line→block 问题
const noiseWords = words.filter((w) => w.bbox.height < 4 || w.bbox.width < 4);
console.log("word 层窄条(width<4||height<4): " + noiseWords.length + "/" + words.length + " " + noiseWords.map((w) => w.text).join(","));
const linesPerBlock = blocks.map((b) => b.lineCount);
console.log("块行数分布: " + JSON.stringify(linesPerBlock));