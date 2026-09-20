// tests/editor-object-model/text-fit.test.js — Stage 8B STEP 3：文本适配单测
// 测量走 syntheticTextMeasurer 确定性模型（CJK=1fs、字母数字=0.55fs、空格=0.32fs、asc=0.8fs desc=0.2fs），
// 期望值全部手算：
//   "张三"@fs → advance=2fs、ink=2fs、visualHeight=fs；"销售经理"@fs → advance=4fs、visualHeight=fs。
"use strict";
const path = require("path");
const it = require(path.join(__dirname, "..", "..", "extension", "src", "editor", "text-fit.js"));
const {
  syntheticTextMeasurer, solveFontSize, solveTextWidth, fitTextObject,
  compareTextGeometry, quadCenter, quadSize, quadAngle, angNorm
} = it;

const results = [];
const failures = [];
function t(name, cond, detail, d) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "") + (d ? " :: " + JSON.stringify(d) : "")); }
function near(a, b, eps) { return Math.abs(a - b) < (eps || 1e-6); }

const syn = syntheticTextMeasurer();
const O = { measurer: syn, margin: 0, minWidth: 0 };

// ================= A: solveFontSize 恢复视觉行高 =================
const a1 = solveFontSize("张三", { height: 20 }, O);
t("a.fs20", a1 && a1.fontSize === 20 && near(a1.heightError, 0, 1e-6), "", a1);
const a2 = solveFontSize("张三", { height: 30 }, O);
t("a.fs30", a2 && a2.fontSize === 30 && near(a2.heightError, 0, 1e-6), "", a2);
const a3 = solveFontSize("张三", { height: 20, width: 40 }, O);
t("a.width-error-target", a3 && near(a3.widthError, 0, 1e-6), "", a3);
const a4 = solveFontSize("Abc", { height: 20 }, O);
// "Abc" ink height = fs（字母同 0.8/0.2 模型）→ 仍求解 20
t("a.latin-fs20", a4 && a4.fontSize === 20 && near(a4.heightError, 0, 1e-6), "", a4);
const a5 = solveFontSize("   ", { height: 20 }, O);
t("a.space-fs20", a5 && a5.fontSize === 20, "", a5);
const aNull = solveFontSize("", { height: 20 }, O);
t("a.empty-null", aNull === null, "");
const aNull2 = solveFontSize("张三", { height: 0 }, O);
t("a.zero-h-null", aNull2 === null, "");

// ================= B: solveTextWidth 实测行宽 =================
const b1 = solveTextWidth("张三三", 20, O);
t("b.width-cjk3", b1 && near(b1.visualWidth, 60, 1e-9) && near(b1.advanceWidth, 60, 1e-9), "", b1);
const b2 = solveTextWidth("A1b x", 20, O);
// A=11, 1=11, b=11, space=6.4, x=11 → 50.4
t("b.width-mixed", b2 && near(b2.visualWidth, 50.4, 1e-9), "", b2);
const b3 = solveTextWidth("张三", 20, Object.assign({}, O, { margin: 8, minWidth: 100 }));
t("b.box-minwidth", b3 && near(b3.boxWidth, 100, 1e-9), "", b3);
const b4 = solveTextWidth("张三", 20, Object.assign({}, O, { margin: 8 }));
t("b.box-margin", b4 && near(b4.boxWidth, 48, 1e-9), "", b4);

// ================= C: fitTextObject 多行逐行 + 宽高分离 =================
const c = fitTextObject([{ text: "张三", targetHeight: 20 }, { text: "销售经理", targetHeight: 16 }], Object.assign({}, O, { margin: 0, lineSpace: 0.3 }));
t("c.perline-fonts", c && c.perLine.length === 2 && c.perLine[0].fontSize === 20 && c.perLine[1].fontSize === 16, "", c && c.perLine);
t("c.width-longest", c && near(c.maxVisualWidth, 64, 1e-9) && c.textboxWidth === 64, "", c && { maxVisualWidth: c.maxVisualWidth, textboxWidth: c.textboxWidth });
// textboxHeight = vh0(20) + space(20*0.3=6) + vh1(16) = 42
t("c.height-lines", c && c.textboxHeight === 42, "", c && { textboxHeight: c.textboxHeight });
t("c.separate", c && c.visualWidth === 64 && c.layoutWidth === 64, "", c);
// lineSpace 为 0 时高度 = 20+16
const c0 = fitTextObject([{ text: "张三", targetHeight: 20 }, { text: "销售经理", targetHeight: 16 }], Object.assign({}, O, { margin: 0, lineSpace: 0 }));
t("c.height-nospace", c0 && c0.textboxHeight === 36, "", c0 && { textboxHeight: c0.textboxHeight });

// ================= D: quad 基础量 =================
const QT = [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 140 }, { x: 100, y: 140 }];
t("d.center", near(quadCenter(QT).x, 150) && near(quadCenter(QT).y, 120), "");
t("d.size", near(quadSize(QT).width, 100) && near(quadSize(QT).height, 40), "");
t("d.angle0", near(quadAngle(QT), 0), "");
// 30° 旋转绕中心 (150,120)：
const r30 = (Math.PI * 30) / 180, c30 = Math.cos(r30), s30 = Math.sin(r30);
const QR = QT.map(function (p) { const dx = p.x - 150, dy = p.y - 120; return { x: 150 + dx * c30 - dy * s30, y: 120 + dx * s30 + dy * c30 }; });
t("d.angle30", near(quadAngle(QR), 30, 1e-6), "", quadAngle(QR));

// ================= E: compareTextGeometry（STEP 6 拆分：geometry vs typography） =================
const e1 = compareTextGeometry(QT, QT.map(function (p) { return { x: p.x + 1, y: p.y }; }), {});
t("e.shift1-pass", e1.status === "PASS" && e1.geometry.pass === true && near(e1.geometry.centerError, 1, 1e-9) && near(e1.typography.widthError, 0, 1e-9) && near(e1.geometry.angleError, 0, 1e-9), "", e1);
// score = 1 − (1/2+0+0+0+0+0)/6 = 1 − 1/12 = 0.9167
t("e.shift1-score", near(e1.score, 0.9167, 1e-3), "", e1.score);
const e2 = compareTextGeometry(QT, QT.map(function (p) { return { x: p.x + 3, y: p.y }; }), {});
t("e.shift3-geometry-fail", e2.status === "GEOMETRY_FAIL" && e2.geometry.pass === false && e2.failures.indexOf("center") >= 0 && near(e2.geometry.centerError, 3, 1e-9), "", e2);
// 旋转 1° → angle fail（GEOMETRY_FAIL）
const e3 = compareTextGeometry(QT, QT.map(function (p) {
  const dx = p.x - 150, dy = p.y - 120;
  const r1 = Math.PI / 180;
  return { x: 150 + dx * Math.cos(r1) - dy * Math.sin(r1), y: 120 + dx * Math.sin(r1) + dy * Math.cos(r1) };
}), {});
t("e.rot1-angle-fail", e3.status === "GEOMETRY_FAIL" && e3.failures.indexOf("angle") >= 0 && near(e3.geometry.angleError, 1, 1e-6), "", e3);
// 目标与实测都是 30° 旋转 quad → pass（旋转一致）
const e4 = compareTextGeometry(QR, QR.slice(), {});
t("e.rot30-pass", e4.status === "PASS" && near(e4.geometry.angleError, 0, 1e-6), "", e4);
// 宽度 +5（中心不动，角位移 2.5 ≤ cornerTol=3）→ typography width fail（GEOMETRY 仍过）
const e5 = compareTextGeometry(QT, QT.map(function (p, i) { return (i === 0 || i === 3) ? { x: p.x - 2.5, y: p.y } : { x: p.x + 2.5, y: p.y }; }), {});
t("e.width5-typography-fail", e5.status === "TYPOGRAPHY_FAIL" && e5.geometry.pass === true && e5.typography.widthError > 3, "", e5);
// 高度 +5（中心不动）但 fontSize=20（sanity hi=40 < 45）→ TYPOGRAPHY_FAIL（geometry 过）
const e5b = compareTextGeometry(QT, QT.map(function (p, i) { return (i === 0 || i === 1) ? { x: p.x, y: p.y - 2.5 } : { x: p.x, y: p.y + 2.5 }; }), { fontSize: 20 });
t("e.height5-typography-fail", e5b.status === "TYPOGRAPHY_FAIL" && e5b.geometry.pass === true && e5b.failures.indexOf("height") >= 0, "", e5b);
// 同 quad 但 fontSize 与 box 匹配（fs=40 → sanity [24,80] ≥ 45）→ PASS（§10/§24 sanity 模型）
const e5c = compareTextGeometry(QT, QT.map(function (p, i) { return (i === 0 || i === 1) ? { x: p.x, y: p.y - 2.5 } : { x: p.x, y: p.y + 2.5 }; }), { fontSize: 40 });
t("e.height-sanity-pass", e5c.status === "PASS", "", e5c);
// 阈值可配（centerTol=5 时 shift3 通过）
const e6 = compareTextGeometry(QT, QT.map(function (p) { return { x: p.x + 3, y: p.y }; }), { centerTol: 5 });
t("e.tol-config", e6.status === "PASS", "", e6);

// ================= H: wrap / fontMismatch / cornerTol =================
const H1 = compareTextGeometry(QT, QT.slice(), { renderedLineCount: 2, targetLineCount: 1 });
t("h.wrap-detected", H1.status === "TYPOGRAPHY_FAIL" && H1.typography.wrapDetected === true && H1.failures.indexOf("wrap") >= 0, "", H1);
const H2 = compareTextGeometry(QT, QT.slice(), { renderedLineCount: 1, targetLineCount: 1 });
t("h.no-wrap-pass", H2.status === "PASS" && H2.typography.wrapDetected === false, "", H2);
// Stage 9 Commit 8 D：rendered < source（行折叠）→ 不得 PASS（须调整 width/fontSize/lineHeight）
const H5 = compareTextGeometry(QT, QT.slice(), { renderedLineCount: 1, targetLineCount: 3 });
t("h.collapse-detected", H5.status === "TYPOGRAPHY_FAIL" && H5.typography.pass === false && H5.typography.wrapDetected === false && H5.failures.indexOf("collapse") >= 0, "c8", H5);
const H6 = compareTextGeometry(QT, QT.slice(), { renderedLineCount: 2, targetLineCount: 2 });
t("h.line-match-pass", H6.status === "PASS" && H6.typography.pass === true && H6.failures.indexOf("collapse") < 0 && H6.failures.indexOf("wrap") < 0, "c8", H6);
const H3 = compareTextGeometry(QT, QT.slice(), { renderedLineCount: 1, targetLineCount: 1, fontMismatch: true });
t("h.font-mismatch-flag", H3.typography.fontMismatch === true && H3.status === "PASS", "", H3); // 仅标记不阻断
// cornerTol 放大且 centerTol 同步放大 → PASS（几何各维度都在容差内）
const H4 = compareTextGeometry(QT, QT.map(function (p) { return { x: p.x, y: p.y + 8 }; }), { centerTol: 8, cornerTol: 8, renderedLineCount: 1, targetLineCount: 1 });
t("h.corner-tol-high-pass", H4.status === "PASS", "", H4);

// ================= I: solveFontSizeByWidth（advance 宽度求解，STEP 5 主算法） =================
// SimHei 模型：CJK 1.0fs。"大字标题实例文字" 8 字 → advance=8fs；目标宽 316 → fs≈39.5→40
const i1 = it.solveFontSizeByWidth("大字标题实例文字", 316, O);
t("i.width-fs40", i1 && i1.fontSize === 40 && i1.widthError <= 3, "", i1);
// 12 字 267 → 20.54 → round 21
const i2 = it.solveFontSizeByWidth("中号正文联系电话与邮箱地址", 267, O);
t("i.width-fs21", i2 && i2.fontSize === 21, "", i2);
// "销售经理" 4 字 64 → 16
const i3 = it.solveFontSizeByWidth("销售经理", 64, O);
t("i.width-fs16", i3 && i3.fontSize === 16, "", i3);
// 混合（数字/字母 0.55fs）"A1b x" 12 字? 用 "ABCDE" 5 字 27.5 → fs=... target 55 → 55/2.75=20
const i4 = it.solveFontSizeByWidth("ABCDE", 55, O);
t("i.width-latin-fs20", i4 && i4.fontSize === 20, "", i4);
const iNull = it.solveFontSizeByWidth("", 100, O);
t("i.width-empty-null", iNull === null, "");
const iNull2 = it.solveFontSizeByWidth("王", 0, O);
t("i.width-zero-null", iNull2 === null, "");

// ================= F: angNorm =================
t("f.angnorm", near(angNorm(350), -10, 1e-9), "", angNorm(350));
t("f.angnorm2", near(angNorm(-190), 170, 1e-9), "", angNorm(-190));

// ================= G: 行盒优先（lineBox，v0.3.11.16） =================
// provider 带 fontBoundingBox：visualHeight=行盒高(1.45fs)。目标 57 → fs≈39.3→39
// （glyph ink 路径会解得 fs≈57，宽 8 字需 456px > boxW → 换行——A0 块 0 根因）。
const synFB = it.createTextMeasurer({ measureText: function (t, f) { const m = /^([\d.]+)px/.exec(f || ""); const fs = m ? parseFloat(m[1]) : 16; return { width: fs, actualBoundingBoxAscent: fs * 0.8, actualBoundingBoxDescent: fs * 0.2, fontBoundingBoxAscent: fs * 1.1, fontBoundingBoxDescent: fs * 0.35 }; } });
const g1 = solveFontSize("王", { height: 57 }, { measurer: synFB });
t("g.linebox-solve-fs39", g1 && g1.fontSize === 39, "", g1);
const g2 = solveFontSize("王", { height: 57 }, { measurer: synFB, fontFamily: "x" });
t("g.linebox-height-error", g2 && g2.heightError <= 2, "", g2);
// 无 fontBoundingBox（合成模型）回落 glyph ink：视觉高=fs，求解 identity
const g3 = solveFontSize("王", { height: 24 }, O);
t("g.ink-fallback-fs24", g3 && g3.fontSize === 24, "", g3);

// ================= 汇总 =================
console.log("text-fit.test: " + results.length + " checks, " + failures.length + " failures");
results.forEach(function (r) { console.log("  " + r); });
if (failures.length) { console.error("FAILURES:\n" + failures.join("\n")); process.exit(1); }
console.log("ALL PASS");