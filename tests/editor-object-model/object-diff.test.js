// tests/editor-object-model/object-diff.test.js — Stage 5.0 §四十二/§三十五：Object Diff 单测（无浏览器）
"use strict";
const path = require("path");
const diff = require(path.join(__dirname, "..", "..", "runtime", "editor-object-diff.js"));

const results = [];
const failures = [];
function t(name, cond, detail) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "")); }
function sameArr(a, b) { return JSON.stringify(a.slice().sort()) === JSON.stringify(b.slice().sort()); }

const base = { type: "textbox", text: "简小设", left: 26.16865675953352, top: 147.37885874780164, width: 95.27115, height: 35.03, scaleX: 1, scaleY: 1, angle: 0, fontSize: 31, markuuid: "AD4636D5227B49399987EA16FC0FF3EA" };
const mutated = Object.assign({}, base, { text: "LONG_TEST_VALUE", height: 563.28 });

// ---- diff 核心：setText 只报 text + height（§三十五/§三十七 真实行为）----
const d = diff.diff(base, mutated);
t("diff.changed", sameArr(d.changedFields, ["height", "text"]), JSON.stringify(d.changedFields));
t("diff.not-changed", d.changedFields.indexOf("fontSize") < 0 && d.changedFields.indexOf("left") < 0 && d.changedFields.indexOf("markuuid") < 0);

// ---- 数值容差（float geometry）----
const eps = diff.diff(base, Object.assign({}, base, { left: base.left + 1e-10 }));
t("diff.num-eps", eps.changedFields.length === 0);

// ---- 类型安全（§六.4）：类型不同必须判 changed，防止 1==="1" / true==="true" ----
const t1 = diff.diff(base, Object.assign({}, base, { fontSize: "31" }));
t("diff.type-string-vs-number", t1.changedFields.indexOf("fontSize") >= 0);
const t2 = diff.diff(base, Object.assign({}, base, { scaleX: true }));
t("diff.type-bool-vs-number", t2.changedFields.indexOf("scaleX") >= 0);
const t3 = diff.diff(base, Object.assign({}, base, { fontSize: 31 }));
t("diff.same-type-stable", t3.changedFields.indexOf("fontSize") < 0);

// ---- rollback 后零残留（§三十六 实测）----
const restored = diff.diff(base, Object.assign({}, base, { text: "简小设", height: 35.03 }));
t("diff.rollback-zero", restored.changedFields.length === 0);

// ---- snapshot 白名单：只保留已审计字段，丢弃 fabric 运行时噪音 ----
const snap = diff.snapshot({ aCoords: {}, dirty: false, canvas: {}, text: "x", markuuid: "M", left: 1, _cacheCanvas: {} });
t("snapshot.white-list", snap.dirty === undefined && snap.canvas === undefined && snap.aCoords === undefined && snap.text === "x" && snap.markuuid === "M" && snap.left === 1);

// ---- changesByGroup 分组 ----
const groups = diff.changesByGroup(base, mutated);
t("groups.text", groups.content && sameArr(groups.content, ["text"]));
t("groups.geometry-only-height", groups.geometry && groups.geometry.length === 1 && groups.geometry[0] === "height");
t("groups.no-text-key", groups.content.indexOf("text") >= 0);

console.log(results.join("\n"));
console.log("object-diff: " + (failures.length ? failures.length + " FAILURES" : "ALL PASS"));
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }