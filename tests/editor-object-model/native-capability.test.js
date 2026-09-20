// tests/editor-object-model/native-capability.test.js — Stage 9 方案 Commit 2：Native Capability Gate 纯逻辑单测
"use strict";
const assert = require("assert");
const path = require("path");
const N = require(path.join(__dirname, "..", "..", "extension", "src", "editor", "native-capability.js"));

let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); } }

t("AREAS 覆盖政策清单核心域", () => {
  const areas = N.AREAS.map((a) => a.area);
  ["text-create", "text-edit", "font", "size", "position", "rotate", "side", "save", "undo", "export", "page", "qrcode", "material"].forEach((a) => assert.ok(areas.indexOf(a) >= 0, "missing " + a));
});

t("matchNames 命中与缺失", () => {
  const r = N.matchNames(["CanvasDiy", "CanvasObjVO", "image-space", "x"], ["drawText", "canvas", "space"]);
  const kwDraw = r.filter((x) => x.kw === "drawText");
  assert.strictEqual(kwDraw.length, 0); // drawText 不在模块名里，应是 canvas/space 命中
  assert.ok(r.some((x) => x.kw === "canvas" && x.matches.indexOf("CanvasDiy") >= 0));
  assert.ok(r.some((x) => x.kw === "space" && x.matches.indexOf("image-space") >= 0));
});

t("classifyModuleNames 按域聚合并上限截断", () => {
  const names = Array.from({ length: 80 }, (_, i) => "font-" + i).concat(["CanvasDiy", "ocrX"]);
  const r = N.classifyModuleNames(names, N.AREAS);
  const font = r.find((x) => x.area === "font");
  assert.strictEqual(font.hits.length, 60); // slice(0,60)
  assert.strictEqual(font.count, 80);
});

t("networkSummary 状态计数/键去重/不含值", () => {
  const s = N.networkSummary([
    { method: "GET", url: "https://x/save.do", status: 200, payloadKeys: ["id", "t"], responseKeys: ["a", "b"] },
    { method: "POST", url: "https://x/save.do", status: 200, payloadKeys: ["id"], responseKeys: ["a"] },
    { method: "GET", url: "https://x/img.png", status: 404, payloadKeys: [], responseKeys: [] }
  ]);
  assert.strictEqual(s.total, 3);
  assert.deepStrictEqual(s.byStatus, { "200": 2, "404": 1 });
  assert.deepStrictEqual(s.payloadKeyUnion, ["id", "t"]);
  assert.ok(JSON.stringify(s).indexOf("secretVal") < 0); // 只存 key 不存值
});

t("uiSummary 按 tag 与能力域聚合", () => {
  const u = N.uiSummary([
    { tag: "button", text: "新增文字" },
    { tag: "button", text: "保存" },
    { tag: "li", text: "素材库" },
    { tag: "div", text: "普通按钮" }
  ], N.AREAS);
  assert.strictEqual(u.total, 4);
  assert.strictEqual(u.byTag["button"], 2);
  assert.ok((u.areaHits["text-create"] || 0) >= 1);
  assert.ok((u.areaHits["save"] || 0) >= 1);
  assert.ok((u.areaHits["material"] || 0) >= 1);
});

t("verdictFor：L4+L5 → READY", () => {
  assert.strictEqual(N.verdictFor("text-create", { l4: 2, l5: 3 }).status, "NATIVE_READY");
});
t("verdictFor：仅 L4 → PARTIAL", () => {
  assert.strictEqual(N.verdictFor("font", { l4: 1 }).status, "NATIVE_PARTIAL");
});
t("verdictFor：仅 L1 → PARTIAL", () => {
  assert.strictEqual(N.verdictFor("save", { l1: 1 }).status, "NATIVE_PARTIAL");
});
t("verdictFor：零证据 → UNKNOWN（≠ UNAVAILABLE）", () => {
  assert.strictEqual(N.verdictFor("qrcode", {}).status, "NATIVE_UNKNOWN");
});
t("verdictFor：UNAVAILABLE 需要显式反证，纯函数默认不产出", () => {
  assert.strictEqual(N.verdictFor("any", {}).status, "NATIVE_UNKNOWN");
});

t("buildCapabilityReport 整体 Gate：text-create READY → READY", () => {
  const rep = N.buildCapabilityReport({
    moduleNames: ["drawText", "addText", "textbox-1", "CanvasDiy", "CanvasObjVO", "font-1", "undo", "save"],
    objectCountsByType: { textbox: 3, rect: 1 },
    pagesWithObjects: 2,
    uiEntries: [{ tag: "button", text: "新增文字" }],
    netEntries: 4,
    netPathHits: { "save": 2, "ocr": 1 }
  });
  assert.strictEqual(rep.gate, "NATIVE_READY");
  const tc = rep.capabilities.find((x) => x.area === "text-create");
  assert.strictEqual(tc.status, "NATIVE_READY");
  assert.ok(rep.summary.ready >= 1);
  assert.ok(rep.layerEvidence.l5_textObjects === 3);
});

t("buildCapabilityReport primitive-only 可 JSON", () => {
  const rep = N.buildCapabilityReport({ moduleNames: ["a"], objectCountsByType: {}, uiEntries: [], netEntries: 0, pagesWithObjects: 0 });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(rep)), rep);
});

t("空输入安全", () => {
  assert.deepStrictEqual(N.matchNames(null, ["a"]), []);
  const rep = N.buildCapabilityReport(null);
  assert.ok(rep.capabilities.length === N.AREAS.length);
  assert.strictEqual(rep.gate, "NATIVE_UNKNOWN");
});

t("verdictFor 证据数累加入 reason", () => {
  const v = N.verdictFor("save", { l1: 1, l4: 2 });
  assert.ok(v.reason.indexOf("L4-module=2") >= 0 && v.reason.indexOf("L1-ui=1") >= 0);
});

console.log("native-capability.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);