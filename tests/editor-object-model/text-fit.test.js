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

// ================= E: compareTextGeometry =================
const e1 = compareTextGeometry(QT, QT.map(function (p) { return { x: p.x + 1, y: p.y }; }), {});
t("e.shift1-pass", e1.pass === true && near(e1.centerError, 1, 1e-9) && near(e1.widthError, 0, 1e-9) && near(e1.angleError, 0, 1e-9), "", e1);
// score = 1 − (1/2+0+0+0)/4 = 0.875
t("e.shift1-score", near(e1.score, 0.875, 1e-4), "", e1.score);
const e2 = compareTextGeometry(QT, QT.map(function (p) { return { x: p.x + 3, y: p.y }; }), {});
t("e.shift3-fail-center", e2.pass === false && e2.failures.indexOf("center") >= 0 && near(e2.centerError, 3, 1e-9), "", e2);
// 旋转 1° → angle fail：
const e3 = compareTextGeometry(QT, QT.map(function (p) {
  const dx = p.x - 150, dy = p.y - 120;
  const r1 = Math.PI / 180;
  return { x: 150 + dx * Math.cos(r1) - dy * Math.sin(r1), y: 120 + dx * Math.sin(r1) + dy * Math.cos(r1) };
}), {});
t("e.rot1-fail-angle", e3.pass === false && e3.failures.indexOf("angle") >= 0 && near(e3.angleError, 1, 1e-6), "", e3);
// 目标与实测都是 30° 旋转 quad → pass（旋转一致）
const e4 = compareTextGeometry(QR, QR.slice(), {});
t("e.rot30-pass", e4.pass === true && near(e4.angleError, 0, 1e-6), "", e4);
// 缩放宽度 +10 → width fail
const e5 = compareTextGeometry(QT, QT.map(function (p, i) { return i === 0 || i === 3 ? { x: p.x, y: p.y } : { x: p.x + 10, y: p.y }; }), {});
t("e.width10-fail", e5.pass === false && e5.failures.indexOf("width") >= 0, "", e5);
// 阈值可配（centerTol=5 时 shift3 通过）
const e6 = compareTextGeometry(QT, QT.map(function (p) { return { x: p.x + 3, y: p.y }; }), { centerTol: 5 });
t("e.tol-config", e6.pass === true, "", e6);

// ================= F: angNorm =================
t("f.angnorm", near(angNorm(350), -10, 1e-9), "", angNorm(350));
t("f.angnorm2", near(angNorm(-190), 170, 1e-9), "", angNorm(-190));

// ================= 汇总 =================
console.log("text-fit.test: " + results.length + " checks, " + failures.length + " failures");
results.forEach(function (r) { console.log("  " + r); });
if (failures.length) { console.error("FAILURES:\n" + failures.join("\n")); process.exit(1); }
console.log("ALL PASS");