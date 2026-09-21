// tests/editor-object-model/text-run-model.test.js — Stage 10-B：Text Run 纯数据模型单测
// 覆盖 makeRun / runIdentity / textConservation / unionGeometry / blockFallback / assignRunColor
"use strict";
const path = require("path");
const M = require(path.join(__dirname, "..", "..", "extension", "src", "editor", "text-run-model.js"));
const { makeRun, runIdentity, textConservation, unionGeometry, blockFallback, assignRunColor } = M;

const results = [];
const failures = [];
function t(name, cond, detail, d) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "") + (d ? " :: " + JSON.stringify(d) : "")); }
function near(a, b, eps) { return Math.abs(a - b) < (eps || 1e-6); }

// ================= makeRun =================
const r1 = makeRun({ blockId: "B1", nativeText: "张三设计", charStart: 0, charEnd: 2, geometry: { left: 10, top: 20, width: 80, height: 30, angle: 0 }, typography: { fontSize: 34, fontFamily: "sans-serif" }, color: { fill: "#000000" }, pageId: "P1", side: "front", transactionId: "TX1" });
t("mr-slice-text", r1.text === "张三", r1.text);
t("mr-char-range", r1.charStart === 0 && r1.charEnd === 2);
t("mr-geometry-quad-derived", Array.isArray(r1.geometry.quad) && r1.geometry.quad.length === 8 && r1.geometry.quad[0] === 10);
t("mr-typography", r1.typography.fontSize === 34 && r1.typography.fontFamily === "sans-serif");
t("mr-color", r1.color.fill === "#000000");
t("mr-lines-single", r1.lineIndex === null);
t("mr-page-side-tx", r1.pageId === "P1" && r1.side === "front" && r1.transactionId === "TX1");

// runId 自动生成（blockId + charStart + charEnd）
const r1b = makeRun({ blockId: "B1", nativeText: "张三设计", charStart: 0, charEnd: 2 });
t("mr-runid-auto", r1b.runId === "B1:0:2", r1b.runId);
t("mr-runid-explicit", makeRun({ blockId: "B1", runId: "custom" }).runId === "custom");

// charEnd 超长截断
const r2 = makeRun({ blockId: "B2", nativeText: "ABCDEF", charStart: 3, charEnd: 99 });
t("mr-clamp-end", r2.text === "DEF" && r2.charEnd === 6, r2.text + ":" + r2.charEnd);

// ================= runIdentity（§二十二：禁止文字内容当唯一 identity） =================
t("ri-same-text-diff-range", runIdentity(makeRun({ blockId: "B", nativeText: "1234", charStart: 0, charEnd: 2 })) !== runIdentity(makeRun({ blockId: "B", nativeText: "1234", charStart: 2, charEnd: 4 })));
t("ri-same-range-diff-block", runIdentity(makeRun({ blockId: "A", nativeText: "同", charStart: 0, charEnd: 1 })) !== runIdentity(makeRun({ blockId: "C", nativeText: "同", charStart: 0, charEnd: 1 })));
t("ri-stable", runIdentity(makeRun({ blockId: "X", nativeText: "abc", charStart: 1, charEnd: 2 })) === "X:1:2");

// ================= textConservation（§二十四/§二十五） =================
const A1 = makeRun({ blockId: "B", nativeText: "山东东方美学美妆工作室", charStart: 0, charEnd: 4 });
const A2 = makeRun({ blockId: "B", nativeText: "山东东方美学美妆工作室", charStart: 4, charEnd: 11 });
const tc1 = textConservation([A2, A1], "山东东方美学美妆工作室"); // 乱序也应补为有序
t("tc-joined-equals", tc1.joined === "山东东方美学美妆工作室", tc1.joined);
t("tc-ok", tc1.ok === true, "", tc1);
const tcBad = textConservation([A1], "山东东方美学美妆工作室");
t("tc-char-total", tcBad.charTotal === 4, tcBad.charTotal);
t("tc-missing-fail", tcBad.ok === false);
const tcGap = textConservation([makeRun({ blockId: "B", nativeText: "ABCDE", charStart: 0, charEnd: 2 }), makeRun({ blockId: "B", nativeText: "ABCDE", charStart: 4, charEnd: 5 })], "ABCDE");
t("tc-gap-detected", tcGap.gapCount === 1 && tcGap.ok === false, "", tcGap);
const tcTrimDanger = textConservation([makeRun({ blockId: "B", nativeText: " 混合 文本 ", charStart: 0, charEnd: 6 })], "混合文本");
t("tc-no-silent-trim", tcTrimDanger.ok === false, "禁止静默 trim 偷改文字");

// ================= unionGeometry（§二十六） =================
const u1 = makeRun({ blockId: "B", nativeText: "AB", charStart: 0, charEnd: 1, geometry: { left: 10, top: 10, width: 40, height: 20 } });
const u2 = makeRun({ blockId: "B", nativeText: "AB", charStart: 1, charEnd: 2, geometry: { left: 55, top: 10, width: 30, height: 20 } });
const uni = unionGeometry([u1, u2]);
t("ug-union-extent", uni.ok && near(uni.left, 10) && near(uni.top, 10) && near(uni.width, 75) && near(uni.height, 20), JSON.stringify(uni));
t("ug-quad-form", unionGeometry([makeRun({ blockId: "B", nativeText: "X", charStart: 0, charEnd: 1, geometry: { quad: [0, 0, 10, 0, 10, 10, 0, 10] } })]).width === 10);

// ================= blockFallback（§三十八） =================
const fb = blockFallback({ blockId: "B3", nativeText: "混合文字", geometry: { left: 1, top: 2, width: 100, height: 30 }, typography: { fontSize: 27 }, color: { fill: "#222222" }, pageId: "P9", side: "back", transactionId: "TX9" });
t("bf-full-range", fb.text === "混合文字" && fb.charStart === 0 && fb.charEnd === 4);
t("bf-single-runid", fb.runId === "B3:single");
t("bf-audit", fb.lineIndex === null);
t("bf-inherit-geometry", fb.geometry.left === 1 && fb.geometry.width === 100);

// ================= assignRunColor（§二十八/§二十九） =================
const rc1 = assignRunColor(makeRun({ blockId: "B", nativeText: "AB", charStart: 0, charEnd: 1 }), { fill: "#ff0000", confidence: 0.9 });
t("ac-fill-set", rc1.color.fill === "#ff0000" && rc1.color.confidence === 0.9);
const rc2 = assignRunColor(makeRun({ blockId: "B", nativeText: "AB", charStart: 0, charEnd: 1, color: { fill: "#000000" } }), {});
t("ac-preserve-when-none", rc2.color.fill === "#000000", "无独立颜色证据时不得改写");
const rc3 = assignRunColor(makeRun({ blockId: "B", nativeText: "AB", charStart: 0, charEnd: 1 }), { fill: "#3366cc" });
t("ac-diff-run-colors-ok", assignRunColor(rc3, { fill: "#00aa33" }).color.fill === "#00aa33", "Run 各自可独立颜色（但需独立 image evidence）");

// ================= NULL/边界 =================
t("ed-empty", makeRun({ blockId: "B", nativeText: "" }).text === "" && textConservation([], "").ok === true);
t("ed-null-native", makeRun({ blockId: "B" }).text === "");
t("ed-geometry-empty", unionGeometry([]).ok === false);

console.log(results.map((r) => "[text-run-model] " + r).join("\n"));
const passCount = results.filter((r) => r.indexOf("PASS") > 0).length;
console.log("[text-run-model] PASS=" + passCount + "/" + results.length);
if (failures.length) {
  failures.forEach((f) => console.log("[text-run-model] FAIL-DETAIL " + f));
  process.exit(1);
} else {
  process.exit(0);
}