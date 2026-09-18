// tests/editor-object-model/page-model.test.js — Stage 7.6 Page Registry 纯函数测试（不访问真实网站/DOM）
"use strict";
const assert = require("assert");
const pm = require("../../extension/src/editor/page-model.js");

const mkEntry = (idName) => ({ idName, canvas: { getWidth: () => 600, getHeight: () => 365, getObjects: () => new Array(9) }, pageName: null });
const vo = (cur, entries, extra) => Object.assign({ currentCanvasNum: cur, totalCanvasArray: entries.map(mkEntry) }, extra || {});
const dom = (txt) => ({ activePageGroupText: txt });

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("PASS", name); } catch (e) { fail++; console.log("FAIL", name, "-", e.message); } };

// 1) resolve current front（初始 currentCanvasNum=1, .page-group.current=正面）
t("resolve current front", () => {
  const r = pm.resolvePageIdentity(vo(1, ["c0"]), dom("正面"));
  assert.strictEqual(r.ok, true); assert.strictEqual(r.side, "FRONT"); assert.strictEqual(r.pageId, "canvas:c0");
});
// 2) resolve current back
t("resolve current back", () => {
  const r = pm.resolvePageIdentity(vo(2, ["c0", "c1"]), dom("背面"));
  assert.strictEqual(r.ok, true); assert.strictEqual(r.side, "BACK"); assert.strictEqual(r.pageId, "canvas:c1");
});
// 3) unknown —— 无 UI、无业务字段 → UNKNOWN（不许默认 FRONT）
t("unknown -> UNKNOWN", () => {
  const r = pm.resolvePageIdentity(vo(1, ["c0"]), dom(""));
  assert.strictEqual(r.ok, true); assert.strictEqual(r.side, pm.SIDE.UNKNOWN);
});
// 4) conflict —— UI=背面 但 currentCanvasNum=1(隐式正面)
t("conflict -> PAGE_IDENTITY_CONFLICT", () => {
  const r = pm.resolvePageIdentity(vo(1, ["c0", "c1"]), dom("背面"));
  assert.strictEqual(r.ok, false); assert.strictEqual(r.code, "PAGE_IDENTITY_CONFLICT");
});
// 5) dynamic materialization —— 初始仅 c0, 切后 c0+c1, 一次性暴露
t("dynamic canvas materialization", () => {
  assert.strictEqual(pm.enumeratePages(vo(1, ["c0"])).length, 1);
  assert.strictEqual(pm.enumeratePages(vo(2, ["c0", "c1"])).length, 2);
});
// 6) identity stable —— 同一 canvas 重复解析 pageId 不变
t("identity stable", () => {
  const a = pm.resolvePageIdentity(vo(1, ["c0", "c1"]), dom("正面"));
  const b = pm.identityOfPage({ idName: "c0", canvas: mkEntry("c0").canvas }, 0);
  assert.strictEqual(a.pageId, "canvas:c0"); assert.strictEqual(b.pageId, "canvas:c0");
  assert.strictEqual(pm.enumeratePages(vo(1, ["c0", "c1"]))[0].pageId, "canvas:c0");
});
// 7) OCR source freeze —— pageId 与 side 在切换后保持（纯数据断言：textblock 携带原页）
t("OCR source freeze", () => {
  const src = pm.resolvePageIdentity(vo(1, ["c0", "c1"]), dom("正面"));
  const tb = { text: "x", bbox: {}, pageId: src.pageId, side: src.side };
  const after = pm.resolvePageIdentity(vo(2, ["c0", "c1"]), dom("背面"));
  assert.strictEqual(tb.pageId, "canvas:c0"); assert.notStrictEqual(after.pageId, tb.pageId);
});
// 8) currentCanvasNum out-of-range → UNKNOWN
t("current canvas unknown when num out of range", () => {
  const r = pm.resolvePageIdentity(vo(9, ["c0"]), dom("正面"));
  assert.strictEqual(r.ok, false); assert.strictEqual(r.code, "CURRENT_PAGE_UNKNOWN");
});
// 9) group by page（组逻辑在调用方：按 pageId 分组）
t("group blocks by page", () => {
  const blocks = [{ pageId: "canvas:c0" }, { pageId: "canvas:c0" }, { pageId: "canvas:c1" }];
  const g = {};
  blocks.forEach((b) => { (g[b.pageId] = g[b.pageId] || []).push(b); });
  assert.strictEqual(g["canvas:c0"].length, 2); assert.strictEqual(g["canvas:c1"].length, 1);
});
// 10) single page compatibility —— 单面无 UI 仍可 resolve FRONT via frontImgPathStr
t("single page compat", () => {
  const r = pm.resolvePageIdentity(vo(1, ["c0"], { frontImgPathStr: "x.png" }), dom(""));
  assert.strictEqual(r.ok, true); assert.strictEqual(r.side, "FRONT");
});
console.log("---\npage-model tests pass=" + pass + " fail=" + fail);
if (fail > 0) process.exit(1);