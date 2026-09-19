// tests/editor-object-model/merge-golden-word.test.js — Stage 7.8R §十三/§十五/§十六/§十七/§十八/§十九
// WORDS→LINE 阶段黄金样本：明显不同字号不能误归同一行（40/20、40/16 同行）；
//   正常同行文字不误拆（张三 同字号、联系电话 8 字）；字高比 guard 实验旋钮；
//   Merge Decision Evidence（wordMergeEvidence/wordSplitEvidence 数值化）。
"use strict";
const path = require("path");
const cn = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "candidate-normalizer.js"));
const { groupWordsToLines } = cn;

const results = [];
const failures = [];
function t(name, cond, detail) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "")); }

function W(text, x, y, w, h) { return { text: text, bbox: { x: x, y: y, width: w, height: h } }; }
const texts = (lines) => lines.map((l) => l.text);

// ---- §十九 正常同行：张三 同字号 → 1 行 ----
const zhangSan = groupWordsToLines([W("张", 0, 10, 30, 34), W("三", 34, 10, 30, 34)]);
t("g19.zhangsan-1line", zhangSan.length === 1 && zhangSan[0].text === "张三", JSON.stringify(texts(zhangSan)));

// ---- §十九 正常同行：联系电话 8 字同字号 → 1 行 ----
const lianxi = [];
for (let i = 0; i < 8; i += 1) lianxi.push(W("联", i * 34, 10, 30, 34));
const lx = groupWordsToLines(lianxi);
t("g19.lianxi-1line", lx.length === 1 && lx[0].text === "联联联联联联联联", JSON.stringify(texts(lx)));

// ---- §十八/§十六：40/16 同行（ratio 2.5）、40/20（ratio 2.0）→ 不得误归同一行 ----
// 默认 hSizeRatioMax=2.0：40/16（2.5>2.0）→ 拆；40/20（2.0<=2.0）→ 合并（边界，实验旋钮收紧）
const bigSmall25 = groupWordsToLines([W("优", 0, 20, 40, 40), W("惠", 48, 26, 16, 16)]);
t("g16.ratio25-splits", bigSmall25.length === 2, JSON.stringify(texts(bigSmall25)));
const bigSmall20 = groupWordsToLines([W("优", 0, 20, 40, 40), W("惠", 48, 24, 20, 20)]);
t("g16.ratio20-default-merged", bigSmall20.length === 1, JSON.stringify(texts(bigSmall20)) + "（默认 2.0 边界；真机取证后收紧）");

// ---- hSizeRatioMax 实验旋钮（§十四）：1.9 / 1.8 收紧 40/20 ----
const knob19 = groupWordsToLines([W("优", 0, 20, 40, 40), W("惠", 48, 24, 20, 20)], { hSizeRatioMax: 1.9 });
t("g14.knob19-splits", knob19.length === 2, JSON.stringify(texts(knob19)));
const knob18 = groupWordsToLines([W("优", 0, 20, 40, 40), W("惠", 48, 24, 20, 20)], { hSizeRatioMax: 1.8 });
t("g14.knob18-splits", knob18.length === 2, JSON.stringify(texts(knob18)));
// OCR 噪声场景（§十五：张56/三36 ratio 1.56）：hSizeRatioMax=1.8 时仍同行（不误拆）
const ocrNoise = groupWordsToLines([W("张", 0, 10, 40, 56), W("三", 44, 22, 30, 36)], { hSizeRatioMax: 1.8 });
t("g15.ocr-noise-kept", ocrNoise.length === 1, JSON.stringify(texts(ocrNoise)) + "（1.56 ≤ 1.8 保留同行）");

// ---- 上下两行大字+小字（非同行）：本就按 y 分离，与 hSizeRatioMax 无关 ----
const stacked = groupWordsToLines([W("标题", 0, 0, 80, 40), W("正文", 0, 90, 60, 16)]);
t("g16.stacked-2lines", stacked.length === 2, JSON.stringify(texts(stacked)));

// ---- §十九 张三 | 总经理：大字姓名 + 小字职位 同行 → 拆 2 行（hSizeRatioMax=1.8）----
const nameTitle = groupWordsToLines([
  W("张", 0, 20, 40, 40), W("三", 44, 20, 40, 40),   // 姓名 40
  W("总", 120, 26, 18, 18), W("经", 140, 26, 18, 18), W("理", 160, 26, 18, 18) // 职位 18
], { hSizeRatioMax: 1.8 });
t("g19.name-title-split", nameTitle.length === 2 && nameTitle[0].text === "张三" && nameTitle[1].text === "总经理", JSON.stringify(texts(nameTitle)));

// ---- §十七 Merge Decision Evidence（WORDS→LINE）----
const evLines = groupWordsToLines([W("优", 0, 20, 40, 40), W("惠", 48, 24, 20, 20)], { hSizeRatioMax: 1.8 });
t("g17.split-evidence", Array.isArray(evLines[1].wordSplitEvidence) && evLines[1].wordSplitEvidence.length >= 1, JSON.stringify(evLines[1].wordSplitEvidence));
if (evLines[1].wordSplitEvidence[0]) {
  const ev = evLines[1].wordSplitEvidence[0];
  t("g17.split-fields", ev.heightA === 40 && ev.heightB === 20 && ev.sizeRatio === 2 && ev.decision === "KEEP_SEPARATE", JSON.stringify(ev));
  t("g17.split-numeric", typeof ev.centerYDelta === "number" && typeof ev.verticalOverlap === "number" && typeof ev.baselineProxy === "number");
}
const evMerge = groupWordsToLines([W("张", 0, 10, 30, 34), W("三", 34, 10, 30, 34)]);
t("g17.merge-evidence", evMerge[0].wordMergeEvidence.length === 1 && evMerge[0].wordMergeEvidence[0].decision === "MERGE" && evMerge[0].wordMergeEvidence[0].sizeRatio === 1, JSON.stringify(evMerge[0].wordMergeEvidence));
t("g17.merge-fields", evMerge[0].wordMergeEvidence[0].heightA === 34 && evMerge[0].wordMergeEvidence[0].heightB === 34 && typeof evMerge[0].wordMergeEvidence[0].horizontalGap === "number", JSON.stringify(evMerge[0].wordMergeEvidence));

console.log(results.join("\n"));
failures.forEach((f) => console.log("  > " + f));
console.log("merge-golden-word: " + (failures.length ? failures.length + " FAILURES" : "ALL PASS"));
process.exit(failures.length ? 1 : 0);