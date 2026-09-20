// runtime/stage9/native-ocr-diff.test.js — Stage 9 V3：A/B Diff 单测（事实差异，不评分）
"use strict";
const assert = require("assert");
const D = require("../../extension/src/ocr/native-ocr-diff.js");

let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); } }

const L = (arr) => arr.map((rawText, i) => ({ order: i, rawText, matchText: rawText }));

// 相同 → 0 diff
t("相同结果 → 0 差异", () => {
  const a = { mode: "1", lines: L(["吴健湘", "佛山盛盈包装制品有限公司"]) };
  const b = { mode: "2", lines: L(["吴健湘", "佛山盛盈包装制品有限公司"]) };
  const d = D.compareNativeOcr(a, b);
  assert.strictEqual(d.lineCountA, 2);
  assert.strictEqual(d.sameLineCount, 2);
  assert.strictEqual(d.changedLines.length, 0);
  assert.strictEqual(d.characterDiffCount, 0);
  assert.strictEqual(d.semanticChangedFields.company, true);
});
// 公司误识：changedLines 记录事实，不判优劣
t("公司名不同 → changed=true 不评分", () => {
  const a = { lines: L(["回册佛山盛包装制品限"]) };
  const b = { lines: L(["佛山盛盈包装制品有限公司"]) };
  const d = D.compareNativeOcr(a, b);
  assert.strictEqual(d.changedLines.length, 1);
  assert.deepStrictEqual({ rawA: d.changedLines[0].rawA, rawB: d.changedLines[0].rawB }, { rawA: "回册佛山盛包装制品限", rawB: "佛山盛盈包装制品有限公司" });
  assert.ok(d.characterDiffCount > 0);
  assert.strictEqual(d.semanticChangedFields.company, false);
});
// 标点/空白归类（tel 字符串级有空格差异 → semanticChangedFields.tel=false 也是如实结果）
t("标点与空白差异归类", () => {
  const d = D.compareNativeOcr({ lines: L(["Tel.:0757-88809856", "地址：广东省"]) }, { lines: L(["Tel.: 0757-88809856", "地址:广东省"]) });
  assert.strictEqual(d.changedLines.length, 2);
  assert.ok(d.whitespaceDiffCount >= 1);
  assert.ok(d.punctuationDiffCount >= 1);
  assert.ok(d.changedLines[0].whitespaceDiff >= 1, "Tel 行存在空格差异");
  assert.strictEqual(d.changedLines[1].punctuationDiff, 1);
});
// 行数差 → added/removed
t("行数不同 → added/removed 如实", () => {
  const d = D.compareNativeOcr({ lines: L(["a", "b"]) }, { lines: L(["a", "b", "c"]) });
  assert.strictEqual(d.addedLines.length, 1);
  assert.strictEqual(d.addedLines[0].rawText, "c");
  const d2 = D.compareNativeOcr({ lines: L(["a", "b", "c"]) }, { lines: L(["a", "b"]) });
  assert.strictEqual(d2.removedLines.length, 1);
});
// email 敏感（ltd vs Itd 大小写）
t("邮箱差异如实（ltd vs Itd）", () => {
  const d = D.compareNativeOcr({ lines: L(["sandy.wu@shengying.ltd"]) }, { lines: L(["sandy.wu@shengying.Itd"]) });
  assert.strictEqual(d.changedLines.length, 1);
  assert.strictEqual(d.semanticChangedFields.email, false);
});
// 空输入稳健
t("空输入", () => {
  const d = D.compareNativeOcr(null, null);
  assert.strictEqual(d.lineCountA, 0);
  assert.strictEqual(d.characterDiffCount, 0);
  assert.strictEqual(d.changedLines.length, 0);
});
// matchText 不参与比较（只用 rawText）
t("仅比较 rawText（matchText 不参与）", () => {
  const a = { lines: [{ order: 0, rawText: "西", matchText: "x" }] };
  const b = { lines: [{ order: 0, rawText: "东", matchText: "d" }] };
  const d = D.compareNativeOcr(a, b);
  assert.strictEqual(d.changedLines[0].rawA, "西");
  assert.strictEqual(d.changedLines[0].rawB, "东");
});

console.log("native-ocr-diff.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);