// tests/editor-object-model/multiline-typography.test.js — Stage 9 Commit 8：多行排版纯模块单测
// 覆盖：A 逐行 ink → median → 字号（禁止 whole-block 总高当字号）；偶数/带 null；fs clamp；
//       C describeLineQuads（union/commonAngle/maxWidth/gaps）；synthesizeTextLayout 合成唯一 textbox；
//       单行 quads 兼容；角度归一。
// 所有期望值为解析推导（独立于模块实现）。
"use strict";
const it = require("../../extension/src/editor/multiline-typography.js");
const { medianLineInk, solveMedianInkFontSize, describeLineQuads, synthesizeTextLayout } = it;

const results = [];
const failures = [];
function t(name, cond, detail, d) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "") + (d ? " :: " + JSON.stringify(d) : "")); }
function near(a, b, eps) { return Math.abs(a - b) < (eps || 1e-6); }
function quadT(x, y, w, h) { return [{ x: x, y: y }, { x: x + w, y: y }, { x: x + w, y: y + h }, { x: x, y: y + h }]; }

// ============ A: per-line ink → median → fontSize ============
{
  const med = medianLineInk([22, 21, 22]);
  t("a.median-odd", med === 22, JSON.stringify(med));
  t("a.solve-22", solveMedianInkFontSize(22) === Math.round(22 / 0.969), String(solveMedianInkFontSize(22)));
  // 关键反证：2 行总高(44)直接当字号 → 45；per-line median 22 → 23。两者必须不同且 median 近真实。
  const wholeBlock = solveMedianInkFontSize(44, { hint: "whole-block-bug" });
  const perLine = solveMedianInkFontSize(med);
  t("a.median-not-wholeblock", perLine !== wholeBlock, "perLine=" + perLine + " wholeBlock=" + wholeBlock);
  t("a.median-close-to-real", Math.abs(perLine - Math.round(22 / 0.969)) < 1, String(perLine));
  t("a.even-median", medianLineInk([21, 22]) === 21.5, JSON.stringify(medianLineInk([21, 22])));
  t("a.null-tolerated", medianLineInk([22, null, 21, 22]) === 22, JSON.stringify(medianLineInk([22, null, 21, 22])));
  t("a.empty-null", medianLineInk([]) === null, String(medianLineInk([])));
  t("a.single", medianLineInk([18]) === 18, String(medianLineInk([18])));
  t("a.clamp-min", solveMedianInkFontSize(2) >= 10, String(solveMedianInkFontSize(2)));
  t("a.clamp-max", solveMedianInkFontSize(5000) <= 160, String(solveMedianInkFontSize(5000)));
  t("a.null-input", solveMedianInkFontSize(null) === null, String(solveMedianInkFontSize(null)));
  t("a.custom-ratio", solveMedianInkFontSize(22, { ratio: 1 }) === 22, String(solveMedianInkFontSize(22, { ratio: 1 })));
}

// ============ C: describeLineQuads ============
{
  // 两行：line0 (10,10,200,40)，line1 (14,60,180,38) → union(10,10,204,88)
  const dq = describeLineQuads([quadT(10, 10, 200, 40), quadT(14, 60, 180, 38)]);
  t("c.union", dq && near(dq.union.left, 10) && near(dq.union.top, 10) && near(dq.union.width, 200) && near(dq.union.height, 88), JSON.stringify(dq && dq.union));
  t("c.count", dq && dq.count === 2, String(dq && dq.count));
  t("c.maxLineWidth", dq && near(dq.maxLineWidth, 200), String(dq && dq.maxLineWidth));
  t("c.gap", dq && dq.lineGaps.length === 1 && near(dq.lineGaps[0], 10), JSON.stringify(dq && dq.lineGaps));
  t("c.totalVisualHeight", dq && near(dq.totalVisualHeight, 88), String(dq && dq.totalVisualHeight));
  t("c.commonAngle-zero", dq && dq.commonAngle && near(dq.commonAngle.angle, 0), JSON.stringify(dq && dq.commonAngle));
  // 旋转行（40° 顶边）
  const rotQ = quadT(100, 100, 60, 20).map(function (p) {
    const a = (Math.PI * 40) / 180, dx = p.x - 130, dy = p.y - 110;
    return { x: 130 + dx * Math.cos(a) - dy * Math.sin(a), y: 110 + dx * Math.sin(a) + dy * Math.cos(a) };
  });
  const dq2 = describeLineQuads([rotQ]);
  t("c.rotated-angle", dq2 && dq2.commonAngle && near(dq2.commonAngle.angle, 40, 1), JSON.stringify(dq2 && dq2.commonAngle));
}

// ============ C: synthesizeTextLayout（多行 → 唯一 textbox） ============
{
  const st = synthesizeTextLayout({ lineQuads: [quadT(10, 10, 200, 40), quadT(14, 60, 180, 38)], lineCount: 2, fontSize: 22, lineHeightRatio: 1.3, layoutWidth: 220 });
  t("d.synth-basic", st && near(st.left, 10) && near(st.top, 10) && st.width >= 220 && st.height >= Math.round(2 * 22 * 1.3), JSON.stringify(st));
  t("d.synth-evidence", st && st.evidence && st.evidence.basis === "canvas-line-quads" && st.evidence.lineQuads === 2, JSON.stringify(st && st.evidence));
  t("d.synth-angle", st && near(st.angle, 0), String(st && st.angle));
  // 单行 quads
  const st1 = synthesizeTextLayout({ lineQuads: [quadT(5, 5, 120, 30)], lineCount: 1, fontSize: 18 });
  t("d.single-line", st1 && near(st1.left, 5) && st1.width >= 120, JSON.stringify(st1));
  // 空输入
  t("d.empty-null", synthesizeTextLayout({ lineQuads: [] }) === null, String(synthesizeTextLayout({ lineQuads: [] })));
}

const pass = results.filter(function (r) { return r.indexOf(" PASS") > 0; }).length;
console.log("multiline-typography.test: pass=" + pass + " fail=" + (results.length - pass));
if (failures.length) { console.log(failures.slice(0, 12).join("\n")); process.exit(1); }
if (!results.length) { console.error("NO TESTS RAN"); process.exit(2); }