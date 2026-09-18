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
// 11) OCR source freeze —— 冻结快照后切页不影响 source（§13/§14/§15）
t("freezeSourcePage snapshot", () => {
  const src = pm.resolvePageIdentity(vo(1, ["c0", "c1"]), dom("正面"));
  const frozen = pm.freezeSourcePage(src);
  assert.strictEqual(frozen.ok, true); assert.strictEqual(frozen.pageId, "canvas:c0"); assert.strictEqual(frozen.side, "FRONT");
  const after = pm.resolvePageIdentity(vo(2, ["c0", "c1"]), dom("背面"));
  assert.notStrictEqual(after.pageId, frozen.pageId); // 切页后 current 变了但 frozen 不变
  assert.strictEqual(frozen.pageId, "canvas:c0");
});
// 12) freeze 失败 → CURRENT_PAGE_UNKNOWN（不得默认 FRONT）
t("freeze failure -> CURRENT_PAGE_UNKNOWN", () => {
  const f = pm.freezeSourcePage(pm.resolvePageIdentity(vo(9, ["c0"]), dom("正面")));
  assert.strictEqual(f.ok, false); assert.strictEqual(f.code, "CURRENT_PAGE_UNKNOWN"); assert.strictEqual(f.pageId, null); assert.strictEqual(f.side, pm.SIDE.UNKNOWN);
});
// 13) group blocks by page（canonical 纯函数）
t("groupOcrBlocksByPage canonical", () => {
  const g = pm.groupOcrBlocksByPage([{ text: "a", pageId: "canvas:c0" }, { text: "b", pageId: "canvas:c0" }, { text: "c", pageId: "canvas:c1" }]);
  assert.strictEqual(g["canvas:c0"].length, 2); assert.strictEqual(g["canvas:c1"].length, 1); assert.deepStrictEqual(Object.keys(g).sort(), ["canvas:c0", "canvas:c1"]);
});
// 14) 未知页进 __UNKNOWN__ 桶
t("groupOcrBlocksByPage unknown bucket", () => {
  const g = pm.groupOcrBlocksByPage([{ text: "x" }, { text: "y", pageId: null }]);
  assert.strictEqual(g["__UNKNOWN__"].length, 2);
});
// 15) validatePageOwnership 硬门禁：一致 OK / 跨页 WRONG_PAGE / 未知 UNKNOWN / 冲突 CONFLICT
t("validatePageOwnership ok", () => {
  const cur = pm.getCurrentPage(vo(1, ["c0", "c1"]), dom("正面"));
  const v = pm.validatePageOwnership("canvas:c0", cur);
  assert.strictEqual(v.ok, true); assert.strictEqual(v.code, "OK");
});
t("validatePageOwnership wrong page", () => {
  const cur = pm.getCurrentPage(vo(2, ["c0", "c1"]), dom("背面"));
  const v = pm.validatePageOwnership("canvas:c0", cur);
  assert.strictEqual(v.ok, false); assert.strictEqual(v.code, "CREATE_BLOCKED_WRONG_PAGE"); assert.strictEqual(v.targetPageId, "canvas:c1");
});
t("validatePageOwnership unknown source", () => {
  const v = pm.validatePageOwnership(null, pm.getCurrentPage(vo(1, ["c0"]), dom("正面")));
  assert.strictEqual(v.ok, false); assert.strictEqual(v.code, "CREATE_BLOCKED_PAGE_UNKNOWN");
});
t("validatePageOwnership identity conflict", () => {
  const c = pm.getCurrentPage(vo(1, ["c0", "c1"]), dom("背面")); // UI 背面 vs index0 隐式正面 → conflict
  assert.strictEqual(c.ok, false);
  const v = pm.validatePageOwnership("canvas:c0", c);
  assert.strictEqual(v.ok, false); assert.strictEqual(v.code, "CREATE_BLOCKED_PAGE_IDENTITY_CONFLICT");
});
console.log("---\npage-model tests pass=" + pass + " fail=" + fail);
if (fail > 0) process.exit(1);