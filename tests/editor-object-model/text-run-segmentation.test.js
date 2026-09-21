// tests/editor-object-model/text-run-segmentation.test.js — Stage 10-B：Text Run Segmentation 单测
// 覆盖 detectMixedTypography / detectRunCandidates / scoreRunBoundary / mergeStableRuns / planRuns
"use strict";
const path = require("path");
const S = require(path.join(__dirname, "..", "..", "extension", "src", "editor", "text-run-segmentation.js"));
const { detectMixedTypography, detectRunCandidates, scoreRunBoundary, mergeStableRuns, planRuns } = S;

const results = [];
const failures = [];
function t(name, cond, detail, d) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "") + (d ? " :: " + JSON.stringify(d) : "")); }
function near(a, b, eps) { return Math.abs(a - b) < (eps || 1e-6); }

// ================= detectMixedTypography（§八/§九） =================
// 单行单字号 → Single
const d1 = detectMixedTypography({ lineSpans: [{ spanInkHeight: 58 }, { spanInkHeight: 57 }, { spanInkHeight: 59 }] });
t("dmt-single", d1.status === "MIXED_OR_SINGLE" && d1.mixedCandidate === false, JSON.stringify(d1));
// 大字 57 / 小字 32 → mixed candidate（57 vs 32 ratio < 0.65）
const d2 = detectMixedTypography({ lineSpans: [{ spanInkHeight: 57 }, { spanInkHeight: 32 }] });
t("dmt-mixed-57vs32", d2.mixedCandidate === true && d2.ratio <= 0.65, JSON.stringify(d2));
// 57 vs 52 → 不轻易 mixed（ratio 0.91 > 0.65）
const d3 = detectMixedTypography({ lineSpans: [{ spanInkHeight: 57 }, { spanInkHeight: 52 }] });
t("dmt-57vs52-single", d3.mixedCandidate === false, JSON.stringify(d3));
// 证据不足 → UNKNOWN（不强行判断）
const d4 = detectMixedTypography({ lineSpans: [{ spanInkHeight: 10 }] });
t("dmt-unknown", d4.status === "UNKNOWN", JSON.stringify(d4));
t("dmt-empty", detectMixedTypography({ lineSpans: [] }).status === "UNKNOWN");

// ================= detectRunCandidates（§十/§十二/§十三） =================
// 三 span：大-小-大（58/30/57）→ 2 边界 3 run
const c1 = detectRunCandidates({
  nativeText: "ABCDEF",
  spans: [
    { start: 0, end: 2, spanInkHeight: 58, spanInkWidth: 40, x: 20, y: 10 },
    { start: 2, end: 4, spanInkHeight: 30, spanInkWidth: 30, x: 60, y: 12 },
    { start: 4, end: 6, spanInkHeight: 57, spanInkWidth: 40, x: 90, y: 10 }
  ]
});
t("drc-3-runs", c1.candidate === true && c1.runs.length === 3, JSON.stringify(c1));
t("drc-text-slice", c1.runs[0].text === "AB" && c1.runs[1].text === "CD" && c1.runs[2].text === "EF", JSON.stringify(c1.runs.map((r) => r.text)));
t("drc-char-range", c1.runs[0].charStart === 0 && c1.runs[0].charEnd === 2 && c1.runs[2].charStart === 4 && c1.runs[2].charEnd === 6);
// 大-大-小（58/57/30）→ 1 边界 2 run（相邻相同样式先合并）
const c1b = detectRunCandidates({
  nativeText: "ABCDEF",
  spans: [
    { start: 0, end: 2, spanInkHeight: 58, spanInkWidth: 40, x: 20 },
    { start: 2, end: 4, spanInkHeight: 57, spanInkWidth: 40, x: 60 },
    { start: 4, end: 6, spanInkHeight: 30, spanInkWidth: 30, x: 100 }
  ]
});
t("drc-2-runs-merge", c1b.candidate === true && c1b.runs.length === 2 && c1b.runs[0].text === "ABCD", JSON.stringify(c1b));
// 高度接近（57/58/52）→ 无边界 → single run
const c2 = detectRunCandidates({
  nativeText: "ABCDEF",
  spans: [
    { start: 0, end: 2, spanInkHeight: 58, spanInkWidth: 40, x: 20 },
    { start: 2, end: 4, spanInkHeight: 57, spanInkWidth: 40, x: 60 },
    { start: 4, end: 6, spanInkHeight: 52, spanInkWidth: 40, x: 100 }
  ]
});
t("drc-near-heights-single", c2.candidate === false && c2.runs.length === 1, JSON.stringify(c2));
// 无序 spans → 仍按 start 排序产出
const c3 = detectRunCandidates({
  nativeText: "ABCD",
  spans: [
    { start: 2, end: 4, spanInkHeight: 30, spanInkWidth: 30, x: 80 },
    { start: 0, end: 2, spanInkHeight: 58, spanInkWidth: 40, x: 20 }
  ]
});
t("drc-unsorted-ok", c3.runs.length === 2 && c3.runs[0].text === "AB" && c3.runs[1].text === "CD", JSON.stringify(c3));

// ================= scoreRunBoundary（§十五/§三十四） =================
// 高置信 split（57 vs 32，顺序连续）
const s1 = scoreRunBoundary({
  nativeText: "ABCD",
  runs: [
    { charStart: 0, charEnd: 2, text: "AB", medianSpanInkHeight: 57, x: 20, spanInkWidth: 40 },
    { charStart: 2, charEnd: 4, text: "CD", medianSpanInkHeight: 32, x: 80, spanInkWidth: 30 }
  ],
  mixedConfidence: 0.9
}, {});
t("sb-high-split", s1.verdict === "SPLIT" && s1.level === "HIGH", JSON.stringify(s1));
// 低置信 → SINGLE（57 vs 52）
const s2 = scoreRunBoundary({
  nativeText: "ABCD",
  runs: [
    { charStart: 0, charEnd: 2, text: "AB", medianSpanInkHeight: 57, x: 20, spanInkWidth: 40 },
    { charStart: 2, charEnd: 4, text: "CD", medianSpanInkHeight: 52, x: 80, spanInkWidth: 40 }
  ],
  mixedConfidence: 0.1
});
t("sb-low-single", s2.verdict === "SINGLE", JSON.stringify(s2));
// 单 run → HIGH single
t("sb-single-run", scoreRunBoundary({ runs: [{ text: "AB" }] }).level === "HIGH");
// 顺序 gap → 降级
const s4 = scoreRunBoundary({
  nativeText: "ABCDE",
  runs: [
    { charStart: 0, charEnd: 2, text: "AB", medianSpanInkHeight: 57, x: 20, spanInkWidth: 40 },
    { charStart: 4, charEnd: 5, text: "E", medianSpanInkHeight: 32, x: 100, spanInkWidth: 20 }
  ],
  mixedConfidence: 0.9
});
t("sb-order-gap", s4.reasons.some((r) => String(r).indexOf("order-gap") >= 0), JSON.stringify(s4));

// ================= mergeStableRuns（§三十三） =================
const m1 = mergeStableRuns({
  runs: [
    { charStart: 0, charEnd: 1, text: "A", fontSize: 34 },
    { charStart: 1, charEnd: 2, text: "B", fontSize: 34 },
    { charStart: 2, charEnd: 3, text: "C", fontSize: 20 },
    { charStart: 3, charEnd: 4, text: "D", fontSize: 20 }
  ]
});
t("mrg-merge-adjacent-same", m1.length === 2 && m1[0].text === "AB" && m1[1].text === "CD", JSON.stringify(m1));
const m2 = mergeStableRuns({
  runs: [
    { charStart: 0, charEnd: 1, text: "A", medianSpanInkHeight: 57 },
    { charStart: 1, charEnd: 2, text: "B", medianSpanInkHeight: 33 }
  ]
});
t("mrg-diff-ink-no-merge", m2.length === 2, JSON.stringify(m2));

// ================= planRuns（§十五/§二十四/§三十八） =================
// 高置信 mixed → FULL_RUN_SPLIT + text conservation
const p1 = planRuns({
  nativeText: "张三设计总监",
  spans: [
    { start: 0, end: 2, spanInkHeight: 57, spanInkWidth: 50, x: 30 },
    { start: 2, end: 6, spanInkHeight: 31, spanInkWidth: 90, x: 100 }
  ]
});
t("plan-high-split", p1.result === "FULL_RUN_SPLIT" && p1.runs.length === 2, JSON.stringify({ r: p1.result, runs: p1.runs.map((x) => x.text), sc: p1.score }));
t("plan-conservation", p1.runs.map((r) => r.text).join("") === "张三设计总监");
// 低置信（57 vs 52）→ SINGLE_BLOCK_FALLBACK
const p2 = planRuns({
  nativeText: "ABCD",
  spans: [
    { start: 0, end: 2, spanInkHeight: 57, spanInkWidth: 40, x: 20 },
    { start: 2, end: 4, spanInkHeight: 52, spanInkWidth: 40, x: 80 }
  ]
});
t("plan-low-fallback", p2.result === "SINGLE_BLOCK_FALLBACK", JSON.stringify({ r: p2.result, sc: p2.score }));
// candidate 边界即使存在但 gap（不连续）→ 不 split
const p3 = planRuns({
  nativeText: "ABCDE",
  spans: [
    { start: 0, end: 1, spanInkHeight: 57, spanInkWidth: 20, x: 10 },
    { start: 2, end: 3, spanInkHeight: 30, spanInkWidth: 20, x: 60 }
  ]
});
t("plan-evidence-gap-fallback", p3.result === "SINGLE_BLOCK_FALLBACK", JSON.stringify({ r: p3.result, sc: p3.score, det: p3.detection }));

console.log(results.map((r) => "[text-run-segmentation] " + r).join("\n"));
const passCount = results.filter((r) => r.indexOf("PASS") > 0).length;
console.log("[text-run-segmentation] PASS=" + passCount + "/" + results.length);
if (failures.length) {
  failures.forEach((f) => console.log("[text-run-segmentation] FAIL-DETAIL " + f));
  process.exit(1);
} else {
  process.exit(0);
}