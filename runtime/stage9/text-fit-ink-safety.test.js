// runtime/stage9/text-fit-ink-safety.test.js — OCR-P1 Commit 4.6-B：
// InkHeight 可信度判定 —— 异常 Ink 不得无条件压过 advance/OCR sanity，且必须可解释
"use strict";
const assert = require("assert");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const FT = require(path.join(ROOT, "extension", "src", "editor", "text-fit-fusion.js"));

let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); } }

// 简易 measurer（advance 与 text.length 成正比）
function mkMeasurer(ratio) { return { measureLine: (text, fs, family) => ({ width: String(text).length * fs * (ratio || 1) }) }; }

t("eval: inkHeight 正常（ink/ocr≈0.9）→ NORMAL，允许进融合", () => {
  const s = FT.evaluateInkEvidenceForFontSize({ inkHeight: 28, ocrHeight: 30, advanceFontSize: 28, fontFamily: "sans-serif" });
  assert.strictEqual(s.fontEvidenceStatus, "NORMAL");
  assert.ok(s.inkToOcrRatio > 0.8 && s.inkToOcrRatio < 1.0);
});

t("eval: inkHeight 过大（ink/ocr>2.2，疑似多行污染）→ INK_TOO_LARGE", () => {
  const s = FT.evaluateInkEvidenceForFontSize({ inkHeight: 70, ocrHeight: 28, advanceFontSize: 26, fontFamily: "sans-serif" });
  assert.strictEqual(s.fontEvidenceStatus, "INVALID_FOR_FONT_SIZE");
  assert.strictEqual(s.status, "INK_TOO_LARGE");
});

t("eval: inkHeight 过小（ink/ocr<0.35）→ INK_TOO_SMALL", () => {
  const s = FT.evaluateInkEvidenceForFontSize({ inkHeight: 8, ocrHeight: 30, advanceFontSize: 26, fontFamily: "sans-serif" });
  assert.strictEqual(s.fontEvidenceStatus, "INVALID_FOR_FONT_SIZE");
  assert.strictEqual(s.status, "INK_TOO_SMALL");
});

t("eval: advance 与 ink 冲突>15% → ADVANCE_INK_CONFLICT", () => {
  const s = FT.evaluateInkEvidenceForFontSize({ inkHeight: 20, ocrHeight: 22, advanceFontSize: 40, fontFamily: "sans-serif" });
  assert.strictEqual(s.status, "ADVANCE_INK_CONFLICT");
  assert.strictEqual(s.fontEvidenceStatus, "INVALID_FOR_FONT_SIZE");
});

t("eval: 无 inkHeight → INK_INVALID（不采用）", () => {
  const s = FT.evaluateInkEvidenceForFontSize({ ocrHeight: 30, advanceFontSize: 26, fontFamily: "sans-serif" });
  assert.strictEqual(s.fontEvidenceStatus, "INVALID_FOR_FONT_SIZE");
});

t("fusion: ink 过大 + advance 可用 → 采用 advance（ink rejected 可解释）", () => {
  // 目标宽 200，文本 10 字符 → advance fs ≈ 200/10 = 20
  const r = FT.solveFontSizeFusion({ text: "一二三四五六七八九十", targetVisualWidth: 200, inkHeight: 66, ocrHeight: 28, fontFamily: "sans-serif", measurer: mkMeasurer(1), quality: 0.9 });
  assert.strictEqual(r.ok, true);
  assert.ok(r.reason.indexOf("ink-invalid") >= 0, "reason=" + r.reason);
  assert.ok(String(r.fontEvidence.status).indexOf("INK_TOO_LARGE") >= 0, "ev=" + r.fontEvidence.status);
  assert.ok(r.fontEvidence.inkToOcrRatio > 2.2);
  // 采用 advance 派生字号（≈20），而不是 ink 66/0.969≈68
  assert.ok(r.fontSize < 40, "fontSize=" + r.fontSize + " 不应采用异常 ink");
});

t("fusion: ink 正常 → 仍采用 ink（visual evidence 优先）", () => {
  const r = FT.solveFontSizeFusion({ text: "测试文字", targetVisualWidth: 100, inkHeight: 26, ocrHeight: 26, fontFamily: "sans-serif", measurer: mkMeasurer(1), quality: 0.9 });
  assert.strictEqual(r.ok, true);
  assert.ok(r.reason.indexOf("ink-height") >= 0, "reason=" + r.reason);
  assert.deepStrictEqual(r.fontEvidence.status, "NORMAL");
});

t("fusion: ink 异常但无 advance → 用 OCR height sanity（不静默 clamp，有诊断）", () => {
  const r = FT.solveFontSizeFusion({ text: "服务热线", targetVisualWidth: 120, inkHeight: 90, ocrHeight: 30, fontFamily: "sans-serif", measurer: null, quality: 0.9 });
  assert.strictEqual(r.ok, true);
  assert.ok(r.reason.indexOf("ocr-height-sanity-ink-invalid") >= 0, "reason=" + r.reason);
  assert.ok(r.fontSize < 60, "fontSize=" + r.fontSize);
});

t("fusion(A2): INK_TOO_SMALL 合并块（ink<<ocr）→ 信任墨迹行高，禁止巨盒推大字", () => {
  const r = FT.solveFontSizeFusion({ text: "理财顾问", targetVisualWidth: 190, inkHeight: 12, ocrHeight: 84, fontFamily: "sans-serif", quality: 0.9, measurer: null });
  assert.strictEqual(r.ok, true);
  assert.ok(r.fontSize <= 14, "A2 merged-block fs=" + r.fontSize);
  assert.ok(r.reason.indexOf("ink-too-small") >= 0, "A2 reason=" + r.reason);
  assert.strictEqual(r.reason, "ink-height-primary-merged-block-ink-too-small");
  assert.ok(r.fontEvidence && r.fontEvidence.status === "INK_TOO_SMALL");
});

console.log("text-fit-ink-safety.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);
