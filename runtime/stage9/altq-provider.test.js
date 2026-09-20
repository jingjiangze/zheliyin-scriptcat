// runtime/stage9/altq-provider.test.js — Stage 9 P1：Alt+Q Provider 契约单测
"use strict";
const assert = require("assert");
const A = require("../../extension/src/ocr/altq-provider.js");

let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); } }

// §三：matchText 归一化（rawText 不变，matchText 仅用于匹配）
t("normalizeMatchText: Tel：0757-88809856 → tel075788809856", () => {
  assert.strictEqual(A.normalizeMatchText("Tel：0757-88809856"), "tel075788809856");
});
t("normalizeMatchText: 大小写/空白/标点", () => {
  assert.strictEqual(A.normalizeMatchText("  Ab C "), "abc");
  assert.strictEqual(A.normalizeMatchText("（中文）名称"), "中文名称");
  assert.strictEqual(A.normalizeMatchText(null), "");
});
// §十二：contract 形状
t("buildAltQTexts: 契约形状 + rawText 保留原样", () => {
  const raw = [{ text: "吴健湘", order: 0 }, { text: "Tel：0757-88809856", order: 1, nativeBBox: { x: 1, y: 2, width: 3, height: 4 } }];
  const ts = A.buildAltQTexts(raw, { source: "NATIVE_PAGE" });
  assert.strictEqual(ts.length, 2);
  assert.strictEqual(ts[0].rawText, "吴健湘");
  assert.strictEqual(ts[0].matchText, "吴健湘");
  assert.strictEqual(ts[1].rawText, "Tel：0757-88809856");
  assert.strictEqual(ts[1].matchText, "tel075788809856");
  assert.strictEqual(ts[0].textSource === undefined, true); // 无多余字段
  assert.ok(ts[1].nativeBBox && ts[1].nativeBBox.width === 3);
  assert.ok(ts[0].evidence && ts[0].evidence.source === "NATIVE_PAGE");
});
t("buildAltQTexts: 空文本过滤 / id 稳定", () => {
  const ts = A.buildAltQTexts([{ text: "  " }, { text: "a", order: 5 }]);
  assert.strictEqual(ts.length, 1);
  assert.strictEqual(ts[0].order, 5);
  const t1 = A.buildAltQTexts([{ text: "a" }]);
  assert.ok(t1[0].id.length > 4);
});
// §十二：capture 无源 → ALTQ_UNAVAILABLE（真实站点 P0 反证路径，不伪造）
t("capture: 无探测器 → ok=false ALTQ_UNAVAILABLE texts=[]", async () => {
  const r = await A.capture({ detector: null });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "ALTQ_UNAVAILABLE");
  assert.deepStrictEqual(r.texts, []);
  assert.strictEqual(r.source, "NONE");
});
t("capture: detector 未发现源 → ALTQ_UNAVAILABLE + 记录探测证据", async () => {
  const r = await A.capture({ detector: () => ({ found: false, reason: "NO_KEYDOWN_BINDING", hints: ["altq:absent"] }) });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "ALTQ_UNAVAILABLE");
  assert.strictEqual(r.unavailable, "NO_KEYDOWN_BINDING");
});
// §十二：capture 有源（mock 直连页面 native 能力时）
t("capture: 有源 → ok=true texts 正确 + meta", async () => {
  const r = await A.capture({
    pageId: "canvas:c0", transactionId: "tx-1", imageFingerprint: A.imageFingerprint({ naturalWidth: 895, naturalHeight: 577 }),
    detector: () => ({ found: true, source: "NATIVE_PAGE", rawItems: [{ text: "佛山盛盈包装制品有限公司", order: 0 }, { text: "吴健湘", order: 1 }] })
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.reason, "ALTQ_READY");
  assert.strictEqual(r.source, "NATIVE_PAGE");
  assert.strictEqual(r.pageId, "canvas:c0");
  assert.ok(r.imageFingerprint.indexOf("895x577") >= 0);
  assert.strictEqual(r.texts.length, 2);
  assert.strictEqual(r.texts[0].rawText, "佛山盛盈包装制品有限公司");
});
// §三：editorTextOf 只输出 rawText
t("editorTextOf: 只返回 rawText", () => {
  const ts = A.buildAltQTexts([{ text: "A\nB" }, { text: "x" }]);
  assert.deepStrictEqual(A.editorTextOf(ts), ["A\nB", "x"]);
});
// §五十四：fingerprint 稳定
t("imageFingerprint: 稳定 + 换尺寸变化", () => {
  assert.strictEqual(A.imageFingerprint({ naturalWidth: 895, naturalHeight: 577 }), A.imageFingerprint({ naturalWidth: 895, naturalHeight: 577 }));
  assert.notStrictEqual(A.imageFingerprint({ naturalWidth: 895, naturalHeight: 577 }), A.imageFingerprint({ naturalWidth: 100, naturalHeight: 50 }));
});
// 全缺不抛
t("capture: 无参不抛异常", async () => {
  let r = null;
  try { r = await A.capture(); } catch (e) { assert.fail("capture() 抛异常: " + e.message); }
  assert.strictEqual(r.ok, false);
});

console.log("altq-provider.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);