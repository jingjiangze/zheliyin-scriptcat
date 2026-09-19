// runtime/stage-7-8/size-ratio-bench.js — Stage 7.8R §十三/§十四：字号黄金样本 × sizeRatio 阈值 benchmark
// ---------------------------------------------------------------------
// LINES→BLOCK 层（groupLinesToBlocks）实验：对 10 组人工标注黄金样本，分别跑
//   sizeRatioMax ∈ {1.10, 1.20, 1.30, 1.40, 1.50}，统计 FALSE_MERGE（应拆未拆）
//   / FALSE_SPLIT（应合未合），输出表格 + JSON 证据（runtime/stage-7-8/）。
// 选择依据（§十四）：「明显不同字号不合并」优先，而非 block 数最少。
// 说明：本 benchmark 是算法层证据；最终阈值需真机 Fixture 取证后定（UNKNOWN 如实记录）。
"use strict";
const fs = require("fs");
const path = require("path");
const cn = require("../../extension/src/ocr/candidate-normalizer.js");
const { groupLinesToBlocks } = cn;

const OUT = path.join(__dirname);
const RATIOS = [1.1, 1.2, 1.3, 1.4, 1.5];

function L(text, x, y, w, h) { return { text: text, bbox: { x: x, y: y, width: w, height: h } }; }

// 黄金样本：{id, desc, expectBlocks, lines}  expectBlocks=人工标注（§十三：应是 1 还是 2 blocks）
const SAMPLES = [
  { id: "B40_16", desc: "40/16 上下近距", expectBlocks: 2, lines: [L("大标题", 40, 10, 200, 40), L("小正文", 40, 60, 120, 16)] },
  { id: "B40_20", desc: "40/20 上下近距", expectBlocks: 2, lines: [L("大标题", 40, 10, 200, 40), L("小正文", 40, 60, 120, 20)] },
  { id: "B40_24", desc: "40/24 上下近距", expectBlocks: 2, lines: [L("大标题", 40, 10, 200, 40), L("小正文", 40, 60, 120, 24)] },
  { id: "B32_20", desc: "32/20 上下近距", expectBlocks: 2, lines: [L("大标题", 40, 10, 160, 32), L("小正文", 40, 54, 100, 20)] },
  { id: "B32_24", desc: "32/24 上下近距", expectBlocks: 2, lines: [L("大标题", 40, 10, 160, 32), L("小正文", 40, 52, 110, 24)] },
  { id: "B28_20", desc: "28/20 上下近距", expectBlocks: 2, lines: [L("大标题", 40, 10, 140, 28), L("小正文", 40, 48, 100, 20)] },
  { id: "B24_20", desc: "24/20 上下近距（相近，应合一）", expectBlocks: 1, lines: [L("标题行", 40, 10, 120, 24), L("正文行", 40, 42, 100, 20)] },
  { id: "SAME_36", desc: "同字号 36/36（对照，应合一）", expectBlocks: 1, lines: [L("张三", 40, 10, 100, 36), L("经理", 40, 54, 80, 36)] },
  { id: "NEAR_21_20", desc: "20/21（§十八 视觉同字号，应合一）", expectBlocks: 1, lines: [L("甲", 40, 10, 60, 20), L("乙", 40, 38, 60, 21)] },
  { id: "ROW_40_16", desc: "同行大字40+小字16（word 层已拆；block 层不得并回）", expectBlocks: 2, lines: [L("大", 40, 10, 40, 40), L("小", 90, 22, 20, 16)] },
  { id: "TITLE_SUB", desc: "标题36+副标题16（§二十三 baseline 拆）", expectBlocks: 2, lines: [L("年度盛典", 40, 10, 180, 36), L("诚邀莅临指导", 40, 60, 140, 16)] }
];

function runSample(lines, sizeRatioMax) {
  const blocks = groupLinesToBlocks(lines, { sizeRatioMax: sizeRatioMax });
  return blocks.length;
}

// 输出：{ratio, bySample:{id:{expect,actual,verdict}}, falseMerge, falseSplit}
const rows = RATIOS.map((r) => {
  const bySample = {};
  let falseMerge = 0, falseSplit = 0;
  SAMPLES.forEach((s) => {
    const actual = runSample(s.lines, r);
    let verdict = "OK";
    if (actual > s.expectBlocks) { verdict = "FALSE_SPLIT"; falseSplit += 1; }
    else if (actual < s.expectBlocks) { verdict = "FALSE_MERGE"; falseMerge += 1; }
    bySample[s.id] = { expect: s.expectBlocks, actual: actual, verdict: verdict, sizeRatioMax: r };
  });
  return { ratio: r, bySample: bySample, falseMerge: falseMerge, falseSplit: falseSplit };
});

// 表格
console.log("sizeRatioMax | False Merge | False Split | 明细");
rows.forEach((row) => {
  const detail = SAMPLES.map((s) => row.bySample[s.id].verdict === "OK" ? "." : (row.bySample[s.id].verdict === "FALSE_MERGE" ? "M" : "S")).join("");
  console.log("    " + String(row.ratio).padEnd(6) + "|      " + row.falseMerge + "      |      " + row.falseSplit + "      | " + detail);
});

fs.writeFileSync(path.join(OUT, "size-ratio-benchmark.json"), JSON.stringify({ generatedAt: new Date().toISOString(), ratios: RATIOS, samples: SAMPLES.map((s) => ({ id: s.id, desc: s.desc, expectBlocks: s.expectBlocks })), rows: rows }, null, 2) + "\n", "utf8");
console.log("evidence -> " + path.join(OUT, "size-ratio-benchmark.json"));