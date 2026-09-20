// runtime/stage8d/font-source.test.js — Stage 8D P5-1：Font Source / Special Style / Orientation 单测
"use strict";
const assert = require("assert");
const F = require("../../extension/src/ocr/font-source.js");
const G = require("../../extension/src/ocr/ocr-candidate-gate.js"); // classifyTextAngle

let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); } }

// Case A：模板真实字体 → FONT_REAL_TEMPLATE
t("Case A: template=Arial → REAL_TEMPLATE", () => {
  const r = F.resolveFontSource({ templateFamily: "Arial", siteDefaultFamily: null, systemMatchFamily: null });
  assert.strictEqual(r.source, "FONT_REAL_TEMPLATE");
  assert.strictEqual(r.family, "Arial");
});
// Case B：无 template，有真实站点默认 → SITE_DEFAULT
t("Case B: siteDefault=Microsoft YaHei → SITE_DEFAULT", () => {
  const r = F.resolveFontSource({ templateFamily: null, siteDefaultFamily: "Microsoft YaHei", systemMatchFamily: null });
  assert.strictEqual(r.source, "FONT_SITE_DEFAULT");
  assert.strictEqual(r.family, "Microsoft YaHei");
});
// Case C：system match（有真实证据传入）→ SYSTEM_MATCH
t("Case C: systemMatch=Times New Roman → SYSTEM_MATCH", () => {
  const r = F.resolveFontSource({ templateFamily: null, siteDefaultFamily: null, systemMatchFamily: "Times New Roman" });
  assert.strictEqual(r.source, "FONT_SYSTEM_MATCH");
  assert.strictEqual(r.family, "Times New Roman");
});
// Case D：什么都没有 → FONT_FALLBACK + sans-serif
t("Case D: 全缺 → FONT_FALLBACK sans-serif", () => {
  const r = F.resolveFontSource({});
  assert.strictEqual(r.source, "FONT_FALLBACK");
  assert.strictEqual(r.family, "sans-serif");
  const r2 = F.resolveFontSource({ templateFamily: "", siteDefaultFamily: " ", systemMatchFamily: null });
  assert.strictEqual(r2.source, "FONT_FALLBACK", "空串不得作假来源");
});
// 优先级：template 优先于 siteDefault/system
t("优先级: template > siteDefault > system > fallback", () => {
  assert.strictEqual(F.resolveFontSource({ templateFamily: "A", siteDefaultFamily: "B", systemMatchFamily: "C" }).source, "FONT_REAL_TEMPLATE");
  assert.strictEqual(F.resolveFontSource({ templateFamily: null, siteDefaultFamily: "B", systemMatchFamily: "C" }).source, "FONT_SITE_DEFAULT");
  assert.strictEqual(F.resolveFontSource({ templateFamily: null, siteDefaultFamily: null, systemMatchFamily: "C" }).source, "FONT_SYSTEM_MATCH");
});
// Case E：specialStyle=true 的确定输入（无模板字体+单行+大字号+长度≥2）
t("Case E: specialStyle=true 确定输入", () => {
  const r = F.assessSpecialStyle({ noTemplateFont: true, singleLine: true, largeFont: true, textLength: 12 });
  assert.strictEqual(r.specialStyle, true);
  assert.strictEqual(r.styleStatus, "STYLE_DEFERRED");
  assert.ok(r.specialStyleEvidence.noTemplateFont);
});
// Case F：普通小字号文本 → false
t("Case F: 普通文本 specialStyle=false", () => {
  const r = F.assessSpecialStyle({ noTemplateFont: true, singleLine: true, largeFont: false, textLength: 12 });
  assert.strictEqual(r.specialStyle, false);
  assert.strictEqual(r.styleStatus, "STYLE_READY");
});
// 单字（长度<2）不触发
t("specialStyle: textLength<2 → false", () => {
  assert.strictEqual(F.assessSpecialStyle({ noTemplateFont: true, singleLine: true, largeFont: true, textLength: 1 }).specialStyle, false);
});
// Case G：全缺 → FONT_FALLBACK 且不抛异常
t("Case G: 全缺不抛异常", () => {
  let r = null;
  try { r = F.resolveFontSource(null); } catch (e) { assert.fail("resolveFontSource(null) 抛异常"); }
  assert.strictEqual(r.source, "FONT_FALLBACK");
  try { F.assessSpecialStyle(null); } catch (e) { assert.fail("assessSpecialStyle(null) 抛异常"); }
});
// Orientation：无 OCR line angle → UNKNOWN/NONE
t("Orientation: 无 line angle → UNKNOWN/NONE", () => {
  const d = F.buildOrientationDiagnostics(null, 0, { classifyTextAngle: G.classifyTextAngle });
  assert.strictEqual(d.classification, "UNKNOWN");
  assert.strictEqual(d.source, "NONE");
  assert.strictEqual(d.blockAngle, null);
});
// Orientation：有 line angle → OCR_LINE 分类
t("Orientation: line angle=15 → TEXT_ROTATION", () => {
  const d = F.buildOrientationDiagnostics(15, 0, { classifyTextAngle: G.classifyTextAngle });
  assert.strictEqual(d.source, "OCR_LINE");
  assert.strictEqual(d.classification, "TEXT_ROTATION");
});
// blockTextAngle median
t("blockTextAngle median", () => {
  assert.strictEqual(F.blockTextAngle([{ angle: 10 }, { angle: 20 }, { angle: 15 }]), 15);
  assert.strictEqual(F.blockTextAngle([{ rotation: 5 }, { angle: 9 }]), 7);
  assert.strictEqual(F.blockTextAngle([{ text: "x" }]), null);
});

console.log("font-source.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);