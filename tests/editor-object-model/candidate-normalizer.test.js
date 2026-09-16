// tests/editor-object-model/candidate-normalizer.test.js — Stage 5.5B P3：OCR 候选统一边界单测
"use strict";
const path = require("path");
const { unifyCandidates } = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "candidate-normalizer.js"));

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

console.log("== candidate-normalizer ==");
console.log(results.join("\n"));
failures.forEach((f) => console.log("  > " + f));
console.log("candidate-normalizer: " + (failures.length ? failures.length + " FAILURES" : "ALL PASS"));
process.exit(failures.length ? 1 : 0);