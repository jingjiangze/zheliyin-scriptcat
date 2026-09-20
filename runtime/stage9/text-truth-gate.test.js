// runtime/stage9/text-truth-gate.test.js — Stage 9 V3：Text Truth Gate 单测（§六十一 Case A~E 语义）
"use strict";
const assert = require("assert");
const T = require("../../extension/src/ocr/text-truth-gate.js");

let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); } }

const B = (idx, text, y, h) => ({ text: text, bbox: { x: 10, y: y, width: 200, height: h || 20 }, sourceProvider: "LOCAL", blockIndex: idx });
const N = (texts) => ({ ok: true, texts: texts.map((x, i) => typeof x === "string" ? { id: "n" + i, rawText: x, matchText: x, order: i } : Object.assign({ order: i }, x)) });

// §七：validate ok
t("validateNativeText: NATIVE_OCR + text===rawText → OK", () => {
  const v = T.validateNativeText({ text: "吴健湘", textSource: "NATIVE_OCR" }, { rawText: "吴健湘" });
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.code, "TEXT_TRUTH_OK");
});
// §八：FAIL_BAIDU_TEXT_LEAK
t("validateNativeText: textSource=BAIDU → FAIL_BAIDU_TEXT_LEAK", () => {
  const v = T.validateNativeText({ text: "佛山盛盈包装制品限", textSource: "BAIDU" }, { rawText: "佛山盛盈包装制品有限公司" });
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.code, "FAIL_BAIDU_TEXT_LEAK");
});
// §八：FAIL_LOCAL_OCR_TEXT_LEAK
t("validateNativeText: textSource=LOCAL → FAIL_LOCAL_OCR_TEXT_LEAK", () => {
  const v = T.validateNativeText({ text: "回册…", textSource: "LOCAL" }, { rawText: "佛山…" });
  assert.strictEqual(v.code, "FAIL_LOCAL_OCR_TEXT_LEAK");
});
// §八：FAIL_NATIVE_TEXT_MISMATCH
t("validateNativeText: textSource=NATIVE_OCR 但 text!==rawText → FAIL_NATIVE_TEXT_MISMATCH", () => {
  const v = T.validateNativeText({ text: "被改过的文字", textSource: "NATIVE_OCR" }, { rawText: "吴健湘" });
  assert.strictEqual(v.code, "FAIL_NATIVE_TEXT_MISMATCH");
});
// §六十一 Case A/B/D：Native 正确 / Baidu 错 / Tesseract 错 → 最终 text 都是 Native rawText
t("applyNativeTextTruth: 几何块文本被 Native 替换（Baidu/Tesseract 错误文本不能进入）", () => {
  const native = N(["佛山盛盈包装制品有限公司", "吴健湘"]);
  const blocks = [B(0, "回册佛山盛包装制品限", 20), B(1, "吴建湘", 80)];
  const r = T.applyNativeTextTruth(blocks, native);
  assert.strictEqual(r.kept.length, 2);
  assert.strictEqual(r.kept[0].text, "佛山盛盈包装制品有限公司");
  assert.strictEqual(r.kept[0].textSource, "NATIVE_OCR");
  assert.strictEqual(r.kept[0].rawText, "佛山盛盈包装制品有限公司");
  assert.strictEqual(r.kept[1].text, "吴健湘");
  assert.ok(r.kept[0].textTruth && r.kept[0].textTruth.geometryStatus === "GEOMETRY_FROM_CANDIDATE");
  assert.strictEqual(r.gate.allTextTruthValid, true);
});
// §六十一 Case C：Native 有 / Baidu 空 → Native 保留（无几何时 native 不伪造位置，报 unmatched）
t("applyNativeTextTruth: 几何为空 → native 全 unmatched，不伪造位置", () => {
  const native = N(["客户经理"]);
  const r = T.applyNativeTextTruth([], native);
  assert.strictEqual(r.kept.length, 0);
  assert.strictEqual(r.unmatchedNative.length, 1);
  assert.strictEqual(r.unmatchedNative[0].rawText, "客户经理");
  assert.strictEqual(r.gate.totalNative, 1);
});
// §三十：几何块多于 Native（噪声块）→ 无 Native 文本的块 dropped（NATIVE_ON 不创建）
t("applyNativeTextTruth: 多余几何块 dropped（疑似噪点不创建）", () => {
  const native = N(["吴健湘"]);
  const blocks = [B(0, "吴健湘", 20), B(1, "QR id.jpg P0", 300), B(2, "xxx", 400)];
  const r = T.applyNativeTextTruth(blocks, native);
  assert.strictEqual(r.kept.length, 1);
  assert.strictEqual(r.legacyDropped.length, 2);
});
// §三十一：多 Native 行 → 依序 one-to-one 绑定（保留各自 rawText）
t("applyNativeTextTruth: 多行依 y 序绑定", () => {
  const native = N(["地址：广东省佛山市", "高明区杨和镇阳西大道"]);
  const blocks = [B(0, "misc1", 10), B(1, "misc2", 40)];
  const r = T.applyNativeTextTruth(blocks, native);
  assert.strictEqual(r.kept[0].text, "地址：广东省佛山市");
  assert.strictEqual(r.kept[1].text, "高明区杨和镇阳西大道");
  assert.strictEqual(r.kept[1].textSource, "NATIVE_OCR");
});
// §六：rawText 原样（含空格不被 trim）
t("applyNativeTextTruth: rawText 原样保留（trim 不干预）", () => {
  const native = N(["  Tel: 0757-88809856  ", " 客户经理 "]);
  const r = T.applyNativeTextTruth([B(0, "x", 10), B(1, "y", 40)], native);
  assert.strictEqual(r.kept[0].text, "  Tel: 0757-88809856  ");
  assert.strictEqual(r.kept[1].text, " 客户经理 ");
});
// 空输入稳健
t("applyNativeTextTruth: 全空不抛", () => {
  let r = null;
  try { r = T.applyNativeTextTruth(null, null); } catch (e) { assert.fail("applyNativeTextTruth(null) 抛异常"); }
  assert.strictEqual(r.kept.length, 0);
  assert.strictEqual(r.gate.totalBlocks, 0);
});

console.log("text-truth-gate.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);