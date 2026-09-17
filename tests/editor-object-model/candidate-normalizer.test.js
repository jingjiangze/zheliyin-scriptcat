// tests/editor-object-model/candidate-normalizer.test.js — Stage 5.5B P3：OCR 候选统一边界单测
//                                             + Stage 6 P6.0：行聚类 / wordBoxes / lineBBox
"use strict";
const path = require("path");
const { unifyCandidates, groupWordsToLines, aggregateLineCandidates } = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "candidate-normalizer.js"));

const results = [];
const failures = [];
function t(name, cond, detail) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "")); }

// executor 私有 lines{x0,y0,x1,y1} → 统一候选
const lines = [
  { text: "测试公司", bbox: { x0: 61, y0: 79, x1: 168, y1: 142 } },
  { text: "13800138000", bbox: { x0: 20, y0: 300, x1: 220, y1: 330 } },
  { text: "", bbox: { x0: 5, y0: 5, x1: 50, y1: 20 } },          // 空文本剔除
  { text: "B", bbox: { x0: 5, y0: 5, x1: 5, y1: 20 } },          // 零宽剔除
  { text: "C" }                                                  // 无 bbox 剔除
];
const img = { width: 900, height: 1200 };
const u1 = unifyCandidates(lines, img);
t("executor-lines->unified", u1.length === 2 && u1[0].text === "测试公司" && u1[0].bbox.x === 61 && u1[0].bbox.y === 79 && u1[0].bbox.width === 107 && u1[0].bbox.height === 63, JSON.stringify(u1));
t("unified.coordinateSpace", u1.every((c) => c.coordinateSpace === "image-pixel" && c.imageSize.width === 900), JSON.stringify(u1[0]));
t("unified.confidence-null", u1[0].confidence === null, "conf=" + u1[0].confidence);
t("unified.reversed-bbox", unifyCandidates([{ text: "X", bbox: { x0: 100, y0: 90, x1: 10, y1: 5 } }], null)[0].bbox.x === 10 && unifyCandidates([{ text: "X", bbox: { x0: 100, y0: 90, x1: 10, y1: 5 } }], null)[0].bbox.width === 90, "reversed normalized");

// 统一候选直通（Baidu Provider 输出）
const uni = [{ text: "折立印", bbox: { x: 100, y: 200, width: 300, height: 40 }, confidence: 0.98, coordinateSpace: "image-pixel" }];
const u2 = unifyCandidates(uni, img);
t("unified-passthrough", u2.length === 1 && u2[0].bbox.x === 100 && u2[0].bbox.width === 300 && u2[0].confidence === 0.98 && u2[0].imageSize.width === 900, JSON.stringify(u2));

// 非数组 / null / 噪声
t("non-array", unifyCandidates(null, img).length === 0 && unifyCandidates(undefined, null).length === 0);
t("noise", unifyCandidates([{ text: "a", bbox: { x: 0, y: 0, width: -5, height: 10 } }], null).length === 0, "negative width filtered");

// ---- Stage 6 P6.0：executor v2 行级携带 words → 统一候选带 wordBoxes/lineBBox ----
const v2 = [
  { text: "姓名 张三", bbox: { x0: 40, y0: 60, x1: 220, y1: 110 },
    words: [
      { text: "姓名", bbox: { x0: 40, y0: 60, x1: 110, y1: 110 }, confidence: 0.98 },
      { text: "张三", bbox: { x0: 140, y0: 60, x1: 220, y1: 110 }, confidence: 0.95 }
    ] }
];
const u3 = unifyCandidates(v2, img);
t("v2-words-carried", u3.length === 1 && u3[0].wordBoxes.length === 2 && u3[0].lineBBox.x === 40, JSON.stringify(u3[0]));
t("v2-bbox-compat", u3[0].bbox.width === 180 && u3[0].coordinateSpace === "image-pixel", "bbox stays line box by default");

// ---- Stage 6 P6.0：轻量行聚类（Case A：水平中文两行；Case B：中英混合；Case D：邮箱）----
// Case A：两行中文，每行 3 个 word；行间距大 → 应聚类为 2 行
const wordsA = [
  { text: "张", bbox: { x: 10, y: 20, width: 40, height: 40 } }, { text: "三", bbox: { x: 55, y: 20, width: 40, height: 40 } },
  { text: "经理", bbox: { x: 100, y: 20, width: 80, height: 40 } },
  { text: "测试", bbox: { x: 10, y: 120, width: 80, height: 40 } }, { text: "公司", bbox: { x: 95, y: 120, width: 80, height: 40 } }
];
const linesA = groupWordsToLines(wordsA);
t("group-A-2lines", linesA.length === 2, JSON.stringify(linesA.map((l) => l.text)));
t("group-A-text", linesA[0].text === "张 三 经理" && linesA[1].text === "测试 公司", JSON.stringify(linesA.map((l) => l.text)));
t("group-A-tight-bbox", linesA[0].bbox.x === 10 && linesA[0].bbox.width === 170 && linesA[0].bbox.y === 20 && linesA[0].bbox.height === 40, JSON.stringify(linesA[0].bbox));
t("group-A-wordBoxes", linesA[0].wordBoxes.length === 3, "wb=" + linesA[0].wordBoxes.length);

// Case B：中英混合单行（y 相近、字高相近 → 1 行）
const wordsB = [
  { text: "北京", bbox: { x: 30, y: 200, width: 80, height: 34 } },
  { text: "BeiJing", bbox: { x: 120, y: 203, width: 110, height: 32 } },
  { text: "科技", bbox: { x: 240, y: 200, width: 80, height: 34 } }
];
const linesB = groupWordsToLines(wordsB);
t("group-B-1line", linesB.length === 1 && linesB[0].text === "北京 BeiJing 科技", JSON.stringify(linesB));
t("group-B-bbox", linesB[0].bbox.x === 30 && linesB[0].bbox.width === 290, JSON.stringify(linesB[0].bbox));

// Case C：数字/手机号 单行
const wordsC = [
  { text: "138", bbox: { x: 50, y: 400, width: 90, height: 36 } },
  { text: "0013", bbox: { x: 145, y: 400, width: 120, height: 36 } },
  { text: "8000", bbox: { x: 270, y: 400, width: 120, height: 36 } }
];
const linesC = groupWordsToLines(wordsC);
t("group-C-1line", linesC.length === 1 && linesC[0].text === "138 0013 8000", JSON.stringify(linesC));

// 字高差异大 → 不合并（同一 row 内大小混排视为两行，供混合字号识别）
const wordsMixed = [
  { text: "标题", bbox: { x: 10, y: 20, width: 90, height: 60 } },
  { text: "小字", bbox: { x: 110, y: 34, width: 46, height: 26 } }
];
const linesMixed = groupWordsToLines(wordsMixed);
t("group-mixed-height-split", linesMixed.length === 2, JSON.stringify(linesMixed.map((l) => l.text)));

// aggregateLineCandidates：统一候选形状
const agg = aggregateLineCandidates(wordsA, img);
t("aggregate-shape", agg.length === 2 && agg[0].bbox.width === 170 && agg[0].wordBoxes.length === 3 && agg[0].imageSize.width === 900 && agg[0].coordinateSpace === "image-pixel", JSON.stringify(agg[0]));
t("aggregate-confidence-mean", Math.abs(agg[0].confidence - null) < 0.001 || typeof agg[0].confidence === "number", "conf=" + agg[0].confidence);
t("aggregate-empty", aggregateLineCandidates([], img).length === 0);

console.log("== candidate-normalizer ==");
console.log(results.join("\n"));
failures.forEach((f) => console.log("  > " + f));
console.log("candidate-normalizer: " + (failures.length ? failures.length + " FAILURES" : "ALL PASS"));
process.exit(failures.length ? 1 : 0);