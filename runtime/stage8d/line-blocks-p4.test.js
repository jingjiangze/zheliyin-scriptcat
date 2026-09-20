// runtime/stage8d/line-blocks-p4.test.js — Stage 8D P4 LINE→BLOCK 回归
// Case A：错误链式合并拆除（回册佛山… 与 多 不再同块）
// Case B：正常相邻多行左对齐文本保持合理合并
// Case C：3+ line chain 防线（baselineDelta 超门不再被链式吸入）
// Case D：旧 8B 单行 block 行为不回归
"use strict";
const assert = require("assert");
const path = require("path");
const CN = require("../../extension/src/ocr/candidate-normalizer.js");
const fx = JSON.parse(require("fs").readFileSync(path.join(__dirname, "fixtures", "real-card-words-97.json"), "utf8"));

let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); } }

const words = fx.words.map((w) => ({ text: w.text, bbox: w.bbox, confidence: w.conf }));
const lines = CN.groupWordsToLines(words, { tessLines: fx.rawLines });
const blocks = CN.groupLinesToBlocks(lines, {});

// Case A：真实名片 —— 「回册佛山盛包装制品限」与「多」不再同块；3+ 行块为零
t("Case A: 3+ 行巨型块拆除 && 回册/多拆分", () => {
  const multi3 = blocks.filter((b) => b.lineCount >= 3);
  assert.strictEqual(multi3.length, 0, "仍有 3+ 行块：" + JSON.stringify(multi3.map((b) => String(b.text).replace(/\n/g, "/").slice(0, 20))));
  const bA = blocks.find((b) => String(b.text || "").indexOf("回册佛山") >= 0);
  assert.ok(bA, "回册块缺失");
  assert.ok(bA.lineCount < 3, "回册块仍多行合并 lines=" + bA.lineCount);
  const bM = blocks.find((b) => String(b.text || "").indexOf("多") >= 0 && String(b.text || "").indexOf("回册") < 0);
  assert.ok(bM, "『多』未成为独立块（或已并入回册块）");
});

// Case B：正常相邻多行左对齐文本 → 允许合理合并（前两行正常并入；不出现灾难 3 行巨块/全散块）
t("Case B: 正常相邻左对齐多行保持合理合并", () => {
  const ls = [
    { text: "广东省佛山市高明区杨和镇", bbox: { x: 60, y: 60, width: 300, height: 36 } },
    { text: "阳西大道下路 8 号", bbox: { x: 60, y: 104, width: 240, height: 34 } },
    { text: "Tel: 0757-88809856", bbox: { x: 60, y: 146, width: 220, height: 32 } }
  ];
  const bl = CN.groupLinesToBlocks(ls, {});
  // 至少出现一个 2 行块（前两行正常相邻合并，未被新 baseline 门禁误拆）
  const two = bl.filter((b) => b.lineCount === 2);
  assert.ok(two.length >= 1, "正常相邻多行被误拆成单行块：" + JSON.stringify(bl.map((b) => String(b.text))));
  // 且不得出现 3+ 行巨块（防链式）
  assert.strictEqual(bl.filter((b) => b.lineCount >= 3).length, 0);
});

// Case C：链式防线 —— 前两行合并后，第三行 baselineDelta 超门 → 不吸入
t("Case C: 高 baselineDelta 不链式吸入", () => {
  const ls = [
    { text: "佛山盛盈包装", bbox: { x: 40, y: 40, width: 300, height: 40 } },
    { text: "回册包装制品", bbox: { x: 40, y: 85, width: 300, height: 40 } },   // gap=5 正常并入
    { text: "下段远离行", bbox: { x: 40, y: 175, width: 200, height: 40 } }    // gap=50(>1.25*40) 且中心差大
  ];
  const bl = CN.groupLinesToBlocks(ls, {});
  // 行为：前两行一处，第三行独立（vertical-gap / baseline-delta 拒绝）
  const one = bl.filter((b) => b.lineCount === 2);
  assert.strictEqual(one.length, 1, "期望前两行合一块：" + JSON.stringify(bl.map((b) => ({ n: b.lineCount, t: String(b.text) }))));
});

// Case D：8B 回归 —— 合成图三行（大字/中字/小字独立行距）保持单行块（不误并、不误拆）
t("Case D: 8B 合成图三行保持单行块", () => {
  const ls = [
    { text: "大字标题实例文字", bbox: { x: 30, y: 30, width: 316, height: 57 } },
    { text: "中号正文联系电话与邮箱地址", bbox: { x: 30, y: 110, width: 257, height: 28 } },
    { text: "小字页脚版权备注行", bbox: { x: 30, y: 200, width: 107, height: 16 } }
  ];
  const bl = CN.groupLinesToBlocks(ls, {});
  assert.strictEqual(bl.length, 3, "三行应各自独立块，实际 " + bl.length);
});

console.log("line-blocks-p4.test: blocks=" + blocks.length + " pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);