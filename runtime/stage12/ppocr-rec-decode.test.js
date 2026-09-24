// runtime/stage12/ppocr-rec-decode.test.js — Stage 12 M3-2：字典组装 + CTC 解码单测
"use strict";
const assert = require("assert");
const R = require("../../extension/src/ocr/ppocr-rec-decode.js");

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed += 1; }
  catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); }
}
const near = (a, b, eps) => Math.abs(a - b) < (eps == null ? 1e-6 : eps);

// ---- T1 字典解析 ----
t("T1 parseDictText：逐行一字符、忽略空行与 \\r", () => {
  assert.deepStrictEqual(R.parseDictText("a\nb\n\nc\n"), ["a", "b", "c"]);
  assert.deepStrictEqual(R.parseDictText("测\r\n试\r\n"), ["测", "试"]);
  assert.deepStrictEqual(R.parseDictText(null), []);
});

// ---- T2 charset 组装（PaddleOCR 约定：blank 在 0，空格前置） ----
t("T2 buildRecCharset：['blank',' ','测','试']；useSpaceChar=false → ['blank','测','试']", () => {
  const c = R.buildRecCharset("测\n试");
  assert.deepStrictEqual(c.charset, ["blank", " ", "测", "试"]);
  assert.strictEqual(c.size, 4);
  const c2 = R.buildRecCharset("测\n试", { useSpaceChar: false });
  assert.deepStrictEqual(c2.charset, ["blank", "测", "试"]);
  assert.strictEqual(R.buildRecCharset("").ok, false);
});

// ---- T3 CTC 贪心：去 blank、去连续重复 ----
t("T3 ctcGreedyDecode：blank+重复折叠 → 'AB'，置信度=0.825", () => {
  const charset = ["blank", "A", "B"];
  const data = Float32Array.from([
    0.9, 0.05, 0.05,  // t0 → blank
    0.1, 0.8, 0.1,    // t1 → A
    0.1, 0.8, 0.1,    // t2 → A（连续重复 → 折叠）
    0.05, 0.1, 0.85   // t3 → B
  ]);
  const r = R.ctcGreedyDecode({ data, timeSteps: 4, classes: 3 }, { charset });
  assert.strictEqual(r.text, "AB");
  assert.strictEqual(r.chars.length, 2);
  assert.ok(near(r.confidence, 0.825), "conf=" + r.confidence);
  assert.ok(near(r.minCharProb, 0.8), "min=" + r.minCharProb);
});

// ---- T4 空白分隔的重复字符 → 'AA' ----
t("T4 ctcGreedyDecode：A-blank-A → 'AA'", () => {
  const charset = ["blank", "A", "B"];
  const data = Float32Array.from([0.1, 0.8, 0.1, 0.9, 0.05, 0.05, 0.1, 0.7, 0.2]);
  const r = R.ctcGreedyDecode({ data, timeSteps: 3, classes: 3 }, { charset });
  assert.strictEqual(r.text, "AA");
  assert.ok(near(r.confidence, 0.75), "conf=" + r.confidence);
});

// ---- T5 logits + softmax ----
t("T5 ctcGreedyDecode applySoftmax：logits 输入 → 'AB'（softmax 概率 0.665）", () => {
  const charset = ["blank", "A", "B"];
  const logits = [[0, 2, 1], [0, 1, 2]];
  const r = R.ctcGreedyDecode({ data: logits }, { charset, applySoftmax: true });
  assert.strictEqual(r.text, "AB");
  assert.ok(near(r.confidence, 0.6652, 0.001), "conf=" + r.confidence);
  // 二维数组（无 applySoftmax）与平铺等价
  const flat = Float32Array.from([0.1, 0.8, 0.1, 0.1, 0.1, 0.8]);
  const r2 = R.ctcGreedyDecode({ data: flat, timeSteps: 2, classes: 3 }, { charset });
  const r3 = R.ctcGreedyDecode({ data: [[0.1, 0.8, 0.1], [0.1, 0.1, 0.8]] }, { charset });
  assert.strictEqual(r2.text, r3.text);
  assert.ok(near(r2.confidence, r3.confidence));
});

// ---- T6 charset 缺位/空文本 ----
t("T6 全 blank → 空文本、置信度 0；charset 未覆盖索引 → 空字符", () => {
  const r = R.ctcGreedyDecode({ data: Float32Array.from([0.9, 0.1, 0.9, 0.1]), timeSteps: 2, classes: 2 }, { charset: ["blank", "A"] });
  assert.strictEqual(r.text, "");
  assert.strictEqual(r.confidence, 0);
  const r2 = R.ctcGreedyDecode({ data: Float32Array.from([0.1, 0.9]), timeSteps: 1, classes: 2 }, { charset: ["blank"] });
  assert.strictEqual(r2.text, "");
});

// ---- T7 非法输出 ----
t("T7 非法输出 → REC_OUTPUT_INVALID / REC_SHAPE_INVALID", () => {
  assert.strictEqual(R.ctcGreedyDecode(null, { charset: [] }).errorCode, "REC_OUTPUT_INVALID");
  assert.strictEqual(R.ctcGreedyDecode({ data: Float32Array.from([1, 2]) }, { charset: [] }).errorCode, "REC_SHAPE_INVALID");
});

// ---- T8 cls 解码 ----
t("T8 clsDecode：[0.9,0.1]→0°；[0.2,0.8]→180°；非法 → CLS_OUTPUT_INVALID", () => {
  assert.strictEqual(R.clsDecode({ data: Float32Array.from([0.9, 0.1]) }).rotation, 0);
  assert.strictEqual(R.clsDecode({ data: Float32Array.from([0.2, 0.8]) }).rotation, 180);
  assert.strictEqual(R.clsDecode({ data: Float32Array.from([0.5]) }).errorCode, "CLS_OUTPUT_INVALID");
});

console.log("ppocr-rec-decode.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);