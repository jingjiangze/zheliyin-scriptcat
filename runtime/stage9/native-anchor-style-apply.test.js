// runtime/stage9/native-anchor-style-apply.test.js — Commit 4.6-C：Anchor MATCH 完整同步样式/几何
"use strict";
const assert = require("assert");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const APP = require(path.join(ROOT, "extension", "src", "editor", "native-anchor-style-apply.js"));

let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); } }

// 可配置 fake fabric object：记录受保护的 identity 字段并断言不变
function fakeObj() {
  const o = {
    type: "textbox", uuid: "U-1", multiUuid: "MU-1", markuuid: "M-1", zyOcrObjectId: { objectUuid: "U-1" },
    text: "服务热线", fill: "#333333", left: 100, top: 80, width: 200, height: 40, angle: 0, fontSize: 24,
    fontFamily: "宋体", fontWeight: "normal", fontStyle: "normal", setCoordsCalled: 0, locationX: null,
    setText(t) { o.text = t; }, set(props) { Object.keys(props).forEach((k) => { o[k] = props[k]; }); o.lastSet = props; },
    setCoords() { o.setCoordsCalled += 1; }
  };
  return o;
}
const IT = { text: "客服电话", left: 150, top: 120, width: 260, height: 48, angle: 0, fontSize: 30, fontFamily: "微软雅黑", fontWeight: "bold", fontStyle: "italic", fill: "#000000" };
const IDENTITY_RX = ["uuid", "multiUuid", "markuuid", "zyOcrObjectId"];

function assertIdentityPreserved(o) {
  assert.strictEqual(o.uuid, "U-1", "uuid 不变");
  assert.strictEqual(o.multiUuid, "MU-1", "multiUuid 不变");
  assert.strictEqual(o.markuuid, "M-1", "markuuid 不变");
  assert.strictEqual(o.zyOcrObjectId.objectUuid, "U-1", "zyOcrObjectId 不变");
}

// ---- buildAnchorStyleProps ----
t("props: 合法 item → 全部 geometry/typography/style 提取", () => {
  const b = APP.buildAnchorStyleProps(IT);
  assert.deepStrictEqual(b.props.left, 150); assert.deepStrictEqual(b.props.top, 120);
  assert.deepStrictEqual(b.props.width, 260); assert.deepStrictEqual(b.props.height, 48);
  assert.deepStrictEqual(b.props.angle, 0); assert.deepStrictEqual(b.props.fontSize, 30);
  assert.deepStrictEqual(b.props.fontFamily, "微软雅黑"); assert.deepStrictEqual(b.props.fontWeight, "bold");
  assert.deepStrictEqual(b.props.fontStyle, "italic");
});
t("props: width/height/fontSize <= 0 → 拒绝（保留原生）", () => {
  const b = APP.buildAnchorStyleProps(Object.assign({}, IT, { width: 0, height: -5, fontSize: 0 }));
  assert.ok(!("width" in b.props), "width 0 拒绝");
  assert.ok(!("height" in b.props), "height 负数拒绝");
  assert.ok(!("fontSize" in b.props), "fontSize 0 拒绝");
  assert.ok("left" in b.props && "top" in b.props && "angle" in b.props, "left/top/angle 允许");
});
t("props: null/NaN/空串 → 拒绝", () => {
  const b = APP.buildAnchorStyleProps(Object.assign({}, IT, { left: null, fontSize: NaN, fontFamily: "", fontWeight: "" }));
  assert.ok(!("left" in b.props)); assert.ok(!("fontSize" in b.props));
  assert.ok(!("fontFamily" in b.props)); assert.ok(!("fontWeight" in b.props));
});
// ---- applyAnchorStyleToObject ----
t("apply: MATCH 完整同步 + uuid 等 identity 不变", () => {
  const o = fakeObj();
  const r = APP.applyAnchorStyleToObject(o, IT);
  assert.strictEqual(o.text, "客服电话", "text 更新");
  assert.strictEqual(o.left, 150); assert.strictEqual(o.top, 120); assert.strictEqual(o.width, 260);
  assert.strictEqual(o.height, 48); assert.strictEqual(o.fontSize, 30); assert.strictEqual(o.fontFamily, "微软雅黑");
  assert.strictEqual(o.fontWeight, "bold"); assert.strictEqual(o.fontStyle, "italic");
  assert.strictEqual(o.fill, "#000000", "可靠 fill 证据更新");
  assert.strictEqual(o.setCoordsCalled, 1, "setCoords 调用");
  assert.ok(r.applied); assert.strictEqual(r.textUpdated, true); assert.strictEqual(r.fillUpdated, true);
  assert.strictEqual(r.identityPreserved, true);
  assertIdentityPreserved(o);
  assert.ok(Array.isArray(o.zyAnchorStyleApplied.geometry) && o.zyAnchorStyleApplied.geometry.indexOf("fontSize") >= 0);
});
t("apply: 无 fill 证据 → 保留原生 fill", () => {
  const o = fakeObj();
  const noFill = Object.assign({}, IT); delete noFill.fill;
  const r = APP.applyAnchorStyleToObject(o, noFill);
  assert.strictEqual(o.fill, "#333333", "fill 未动（原生保留）");
  assert.strictEqual(r.fillUpdated, false);
  assert.strictEqual(o.fontSize, 30, "geometry/style 仍同步");
});
t("apply: 无 set 回退属性直写", () => {
  const o = fakeObj(); delete o.set; delete o.setText; delete o.setCoords;
  const r = APP.applyAnchorStyleToObject(o, IT);
  assert.strictEqual(o.left, 150); assert.strictEqual(o.text, "客服电话");
  assert.ok(r.applied); assert.strictEqual(r.fillUpdated, true);
  assertIdentityPreserved(o);
});
t("apply: 空 item / 空对象 → 不破坏", () => {
  const o = fakeObj();
  const r = APP.applyAnchorStyleToObject(o, {});
  assert.ok(!r.applied); assert.strictEqual(r.fillUpdated, false);
  assert.strictEqual(o.text, "服务热线", "text 未动"); assert.strictEqual(o.fill, "#333333");
  const r2 = APP.applyAnchorStyleToObject(null, IT);
  assert.strictEqual(r2.applied, false); assert.strictEqual(r2.reason, "no-object");
});
t("apply: 相同 text → 不触发 setText（幂等）", () => {
  const o = fakeObj();
  let setTextCalls = 0;
  o.setText = () => { setTextCalls += 1; };
  const same = Object.assign({}, IT, { text: "服务热线" });
  const r = APP.applyAnchorStyleToObject(o, same);
  assert.strictEqual(setTextCalls, 0, "相同文本不重设");
  assert.strictEqual(r.textUpdated, false);
  assert.ok(r.applied, "geometry 仍同步");
});
t("apply: syncBusiness 回调被调用", () => {
  const o = fakeObj();
  let synced = 0;
  const r = APP.applyAnchorStyleToObject(o, IT, { syncBusiness: (obj) => { synced += 1; obj.locationX = obj.left; } });
  assert.strictEqual(synced, 1);
  assert.strictEqual(o.locationX, 150, "业务字段同步");
  assert.ok(r.applied);
});

console.log("native-anchor-style-apply.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);
