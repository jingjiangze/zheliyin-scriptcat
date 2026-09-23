// runtime/stage9/native-anchor-recovery.test.js — OCR-P1 Commit 4.2 Anchor recovery 单测
const path = require("path");
const assert = require("assert");
const AR = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "native-anchor-recovery.js"));

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass += 1; } catch (e) { fail += 1; console.error("FAIL " + name + ": " + String(e && e.message || e)); } }
function anchor(o) {
  return Object.assign({ pageId: "p1", side: "front", center: { x: 100, y: 100 }, yIndex: 0, width: 60, height: 24, angle: 0, identity: { uuid: "u" } }, o || {});
}
function resolve(native, anchors, opts) {
  return AR.resolveAnchor(Object.assign({ nativeText: native, expectedOrder: 0 }, { existingAnchors: anchors }), opts);
}

// ---- text 直接证据 ----
t("exact text anchor match", () => {
  const r = resolve("夏祝莲", [anchor({ text: "夏祝莲" })], { pageId: "p1", side: "front" });
  assert.strictEqual(r.matched, true);
  assert.strictEqual(r.factors.textScore, 1);
  assert.strictEqual(r.anchor.identity.uuid, "u");
});
t("包含级（长侧>=3）列为 0.8 直接证据", () => {
  const r = resolve("董事长办公室", [anchor({ text: "董事长" })], { pageId: "p1", side: "front" });
  assert.strictEqual(r.matched, true);
  assert.ok(r.factors.textScore >= 0.8);
});
// ---- 单阈值粗暴规则禁止：纯文本分数不足但顺序证据不该救场（最低证据要求）----
t("weak text with high order still rejected (evidence-A/B both required)", () => {
  const r = resolve("张三", [anchor({ text: "李四", yIndex: 0 })], { pageId: "p1", side: "front" });
  assert.strictEqual(r.matched, false); // 文本证据缺失不得因序号救场 —— 拒绝原因可为 evidence-insufficient 或 below-total-min
});
t("below total min rejected", () => {
  const r = resolve("abcdefghij", [anchor({ text: "xyz", width: 10, height: 8, yIndex: 3 })], { pageId: "p1", side: "front" });
  assert.strictEqual(r.matched, false);
});
// ---- 顺序/邻域/尺寸 结构性证据 ----
t("order+neighbor+size structural evidence accepts", () => {
  const r = resolve("13800138000", [
    anchor({ text: "姓名", center: { x: 60, y: 50 }, yIndex: 0, width: 40, height: 20 }),
    anchor({ text: "13800138000", center: { x: 60, y: 120 }, yIndex: 1, width: 90, height: 20 }),
    anchor({ text: "微信", center: { x: 60, y: 190 }, yIndex: 2, width: 40, height: 20 })
  ], { pageId: "p1", side: "front", expectDist: 70 });
  assert.strictEqual(r.matched, true);
});
// ---- 平局 → UNCERTAIN（禁止唯一性猜测）----
t("ambiguous runner-up -> UNCERTAIN not MATCH", () => {
  const r = resolve("手机",
    [anchor({ text: "手机", center: { x: 100, y: 100 }, yIndex: 0 }), anchor({ text: "手机", center: { x: 120, y: 105 }, yIndex: 1 })],
    { pageId: "p1", side: "front" });
  assert.strictEqual(r.matched, false);
  assert.strictEqual(r.verdict, "UNCERTAIN");
});
// ---- 跨页隔离 ----
t("cross-page anchor rejected", () => {
  const r = resolve("夏祝莲", [anchor({ text: "夏祝莲", pageId: "p2", side: "back" })], { pageId: "p1", side: "front" });
  assert.strictEqual(r.matched, false);
  assert.ok((r.reason || "").indexOf("scope") >= 0, r.reason);
});
t("cross-side anchor rejected", () => {
  const r = resolve("夏祝莲", [anchor({ text: "夏祝莲", pageId: "p1", side: "back" })], { pageId: "p1", side: "front" });
  assert.strictEqual(r.matched, false);
});
// ---- 无候选 ----
t("no anchors", () => {
  const r = resolve("夏祝莲", [], { pageId: "p1", side: "front" });
  assert.strictEqual(r.matched, false);
  assert.strictEqual(r.verdict, "NO_MATCH");
});
// ---- 旋转兼容 ----
t("angle compatible anchor preferred over rotated-mismatch", () => {
  const r = AR.resolveAnchor({ nativeText: "Tel", angle: 0, expectedOrder: 0, existingAnchors: [
    anchor({ text: "Tel", angle: 90, center: { x: 300, y: 60 }, yIndex: 0 }),
    anchor({ text: "Tel", angle: 0, center: { x: 100, y: 60 }, yIndex: 0 })
  ] }, { pageId: "p1", side: "front", thresholds: { margin: 0.05 } });
  assert.strictEqual(r.matched, true);
  assert.strictEqual(r.anchor.angle, 0); // native 0° vs 0°候选 angleScore=1 → 0° 胜出
  assert.ok(r.factors.angleScore > 0.9);
});
t("native angle 0 vs anchor 105 mismatch reduces score not fatal", () => {
  const r = AR.resolveAnchor({ nativeText: "Tel", angle: 0, expectedOrder: 0, existingAnchors: [anchor({ text: "Tel", angle: 105 })] }, { pageId: "p1", side: "front" });
  assert.strictEqual(r.matched, true); // text 证据仍充分
  assert.ok(r.factors.angleScore < 0.5);
});
// ---- 尺寸 ----
t("size mismatch weakens score but text evidence keeps match", () => {
  const r = resolve("公司地址", [anchor({ text: "公司地址", width: 12, height: 8 })], { pageId: "p1", side: "front" });
  assert.strictEqual(r.matched, true);
  assert.ok(r.factors.sizeScore <= 0.5);
});
// ---- factors 可审计结构 ----
t("factors schema complete", () => {
  const r = resolve("夏祝莲", [anchor({ text: "夏祝莲" })], { pageId: "p1", side: "front" });
  const f = r.factors;
  for (const k of ["textScore", "orderScore", "neighborScore", "sizeScore", "angleScore", "totalScore"]) {
    assert.strictEqual(typeof f[k], "number", k);
  }
});
// ---- 最小证据阈值可调（opts.thresholds）----
t("thresholds overridable", () => {
  const r = resolve("名字", [anchor({ text: "名玉", yIndex: 0 })], { pageId: "p1", side: "front", thresholds: { textMin: 0.5, totalMin: 0.3, margin: 0.2 } });
  assert.strictEqual(r.matched, true);
});

console.log("native-anchor-recovery.test: pass=" + pass + " fail=" + fail);
if (fail > 0) process.exit(1);