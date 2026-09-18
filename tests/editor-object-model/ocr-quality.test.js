// tests/editor-object-model/ocr-quality.test.js — OCR 质量门纯函数单测
"use strict";
const assert = require("assert");
const Q = require("../../extension/src/ocr/ocr-quality.js");
const { assessOcrCandidates } = Q;

const ok = (cands, meta) => assign(cands, meta).ok;
const code = (cands, meta) => assign(cands, meta).reasonCode;
const keptN = (cands, meta) => (assign(cands, meta).kept || []).length;
const droppedN = (cands, meta) => (assign(cands, meta).dropped || []).length;

function assign(cands, meta) {
  return assessOcrCandidates(cands, meta);
}

function cand(text, x, y, w, h, conf) {
  const c = { text, bbox: { x, y, width: w, height: h } };
  if (conf !== undefined) c.confidence = conf;
  return c;
}

let passed = 0;
function t(name, fn) {
  try { fn(); passed += 1; console.log("PASS " + name); }
  catch (e) { console.error("FAIL " + name + ": " + (e && e.message)); process.exitCode = 1; }
}

t("空列表 → empty-result FAIL", () => {
  const r = assessOcrCandidates([], { width: 800, height: 600 });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reasonCode, "empty-result");
  assert.strictEqual(r.total, 0);
});

t("正常候选 → PASS、保留全部", () => {
  const r = assessOcrCandidates([cand("销售经理", 10, 20, 120, 30), cand("张三", 10, 60, 80, 28)], { width: 800, height: 600 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(keptN([cand("a", 1, 2, 3, 4)], { width: 8, height: 9 }), 1);
  assert.strictEqual(droppedN([cand("a", 1, 2, 3, 4)], { width: 8, height: 9 }), 0);
});

t("空文本被剔除；其余有效 → PASS + dropped 诊断", () => {
  const r = assessOcrCandidates([cand("", 10, 20, 30, 30), cand("李四", 10, 60, 80, 28)], { width: 800, height: 600 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.kept.length, 1);
  assert.strictEqual(r.dropped.length, 1);
  assert.strictEqual(r.dropped[0].reason, "empty-text");
});

t("非法 bbox（宽高<=0）全部剔除 → invalid-result FAIL", () => {
  const r = assessOcrCandidates([cand("x", 0, 0, 0, 10), cand("y", 0, 0, 10, 0)], { width: 800, height: 600 });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reasonCode, "invalid-result");
  assert.ok(r.reason.indexOf("invalid-bbox") >= 0);
});

t("bbox 字段缺失全部剔除 → invalid-result FAIL", () => {
  const r = assessOcrCandidates([{ text: "abc" }, { text: "def", bbox: null }], { width: 800, height: 600 });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reasonCode, "invalid-result");
});

t("低置信度占多数 → low-confidence FAIL", () => {
  const r = assessOcrCandidates([cand("a", 0, 0, 10, 10, 0.2), cand("b", 0, 20, 10, 10, 0.3), cand("c", 0, 40, 10, 10, 0.9)], { width: 800, height: 600 });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reasonCode, "low-confidence");
});

t("部分低置信度但占比不足一半 → PASS（剔除坏项）", () => {
  const r = assessOcrCandidates([cand("a", 0, 0, 10, 10, 0.2), cand("b", 0, 20, 10, 10, 0.98), cand("c", 0, 40, 10, 10, 0.95)], { width: 800, height: 600 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.kept.length, 2);
  assert.strictEqual(r.dropped[0].reason, "low-confidence");
});

t("有效占比低于 50% → invalid-result FAIL", () => {
  const r = assessOcrCandidates([cand("a", 0, 0, 10, 10), cand("b", 0, 20, 10, 10), cand("", 0, 40, 10, 10), { text: "no-box" }, cand("", 0, 60, 10, 10), cand("c", 0, 80, 10, 10, 0.1)], { width: 800, height: 600 });
  assert.strictEqual(r.ok, false);
});

t("bbox 越出图片边界（超 5% 容差）被剔除", () => {
  const r = assessOcrCandidates([cand("ok", 10, 10, 50, 20), cand("far", -100, 10, 50, 20)], { width: 400, height: 300 });
  assert.strictEqual(r.kept.length, 1);
  assert.strictEqual(r.dropped[0].reason, "out-of-bounds");
});

t("无 imageSize 时越界检查跳过（不误杀）", () => {
  const r = assessOcrCandidates([cand("a", -5000, -5000, 50, 20)]);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.kept.length, 1);
});

t("超长单条文本被剔除 → abnormal-length", () => {
  const longText = "x".repeat(300);
  const r = assessOcrCandidates([cand(longText, 0, 0, 100, 20), cand("ok", 10, 40, 50, 20)]);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.dropped[0].reason, "abnormal-length");
});

t("整批条数超限 → abnormal FAIL", () => {
  const cands = [];
  for (let i = 0; i < 250; i += 1) cands.push(cand("t" + i, 0, i, 30, 15));
  const r = assessOcrCandidates(cands);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reasonCode, "abnormal");
});

t("兼容 {x0,y0,x1,y1} bbox", () => {
  const r = assessOcrCandidates([{ text: "hi", bbox: { x0: 10, y0: 20, x1: 60, y1: 50 } }]);
  assert.strictEqual(r.ok, true);
});

t("confidence 非数字不误伤", () => {
  const r = assessOcrCandidates([cand("a", 0, 0, 10, 10, "high")]);
  assert.strictEqual(r.ok, true);
});

console.log("ocr-quality: " + passed + " passing");
if (process.exitCode) process.exit(1);