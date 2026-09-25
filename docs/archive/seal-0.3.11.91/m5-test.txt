"use strict";
// runtime/stage11/template-text-fit.test.js — M5 模板 Fit 引擎：字号自适应纯函数
// 真源：extension/src/editor/template-text-fit.js
// 契约：只产出 fontSize（changed/reason/overflow/measured）；无证据一律保持原字号；到最小仍溢出 → OVERFLOW 标位。
const assert = require("assert");
const { zyFitFontSize, zyFitMatches } = require("D:/zheliyin-scriptcat/extension/src/editor/template-text-fit.js");

// 假测量器：width = len * fontSize * per（可预测、对字号单调）
const mk = (per) => (text, ff, fs) => String(text).length * fs * (per || 0.6);

// 1 基准字号已放得下 → 不改
{
  const r = zyFitFontSize({ text: "短", targetWidth: 100, fontFamily: "f", baseFontSize: 16, measurer: mk() });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.changed, false);
  assert.strictEqual(r.fontSize, 16);
  assert.strictEqual(r.reason, "FITS");
  assert.strictEqual(r.overflow, false);
  console.log("[fit] PASS 1 fits -> no change");
}
// 2 放不下 → 缩小到最大可容纳字号
{
  // len 10、per 0.6 → w(fs)=6*fs；target 90 → 最大整数字号 15
  const r = zyFitFontSize({ text: "0123456789", targetWidth: 90, fontFamily: "f", baseFontSize: 20, measurer: mk() });
  assert.strictEqual(r.reason, "SHRINK");
  assert.strictEqual(r.changed, true);
  assert.strictEqual(r.fontSize, 15);
  assert.ok(r.measured.width <= 90);
  assert.strictEqual(r.overflow, false);
  console.log("[fit] PASS 2 shrink to largest fitting size");
}
// 3 边界紧致：返回字号不溢出，且 +1 即溢出
{
  const meas = mk();
  const r = zyFitFontSize({ text: "0123456789", targetWidth: 90, baseFontSize: 20, measurer: meas });
  assert.ok(meas("0123456789", "f", r.fontSize) <= 90);
  assert.ok(meas("0123456789", "f", r.fontSize + 1) > 90);
  console.log("[fit] PASS 3 boundary tight (max fitting size)");
}
// 4 到最小仍放不下 → OVERFLOW（返回 min，不强行继续缩）
{
  const r = zyFitFontSize({ text: "X".repeat(100), targetWidth: 10, baseFontSize: 20, measurer: mk() });
  assert.strictEqual(r.reason, "OVERFLOW");
  assert.strictEqual(r.overflow, true);
  assert.strictEqual(r.fontSize, 12); // max(8, round(20*0.6)) = 12
  console.log("[fit] PASS 4 overflow flagged at min font");
}
// 5 minFontSize 显式覆盖（并裁剪到不超过 base）
{
  const r = zyFitFontSize({ text: "X".repeat(100), targetWidth: 10, baseFontSize: 40, minFontSize: 12, measurer: mk() });
  assert.strictEqual(r.fontSize, 12);
  assert.strictEqual(r.overflow, true);
  const r2 = zyFitFontSize({ text: "X".repeat(100), targetWidth: 10, baseFontSize: 10, minFontSize: 24, measurer: mk() });
  assert.strictEqual(r2.fontSize, 10); // min > base → 裁剪到 base
  console.log("[fit] PASS 5 explicit minFontSize (+ clamp to base)");
}
// 6 边界：无文本 / 无测量器 / 无目标宽 / 无基准 → 保守保持原字号
{
  const a = zyFitFontSize({ text: "", targetWidth: 50, baseFontSize: 16, measurer: mk() });
  const b = zyFitFontSize({ text: "x", targetWidth: 50, baseFontSize: 16, measurer: null });
  const c = zyFitFontSize({ text: "x", targetWidth: 0, baseFontSize: 16, measurer: mk() });
  const d = zyFitFontSize({ text: "x", targetWidth: 50, baseFontSize: null, measurer: mk() });
  assert.strictEqual(a.changed, false);
  assert.strictEqual(b.changed, false);
  assert.strictEqual(c.changed, false);
  assert.strictEqual(d.changed, false);
  assert.strictEqual(a.reason, "EMPTY_TEXT");
  assert.strictEqual(b.reason, "NO_EVIDENCE_MEASURER");
  assert.strictEqual(c.reason, "NO_EVIDENCE_TARGET");
  assert.strictEqual(d.reason, "NO_EVIDENCE_BASE");
  console.log("[fit] PASS 6 conservative no-evidence paths");
}
// 7 测量器返回 null → MEASURE_FAILED，保持原字号
{
  const r = zyFitFontSize({ text: "x", targetWidth: 50, baseFontSize: 16, measurer: () => null });
  assert.strictEqual(r.changed, false);
  assert.strictEqual(r.reason, "MEASURE_FAILED");
  assert.strictEqual(r.fontSize, 16);
  console.log("[fit] PASS 7 measure failure keeps base");
}
// 8 zyFitMatches：批量决策 + 统计（changed / overflowCount）
{
  const slots = [
    { fontSize: 20, width: 90, fontFamily: "f" },
    { fontSize: 16, width: 100, fontFamily: "f" },
    { fontSize: 12, width: 1, fontFamily: "f" }
  ];
  const matches = [
    { slotIdx: 0, fieldKey: "company", text: "0123456789" },
    { slotIdx: 1, fieldKey: "name", text: "短" },
    { slotIdx: 2, fieldKey: "title", text: "X".repeat(50) }
  ];
  const r = zyFitMatches({ matches: matches, slots: slots, measurer: mk() });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.fits.length, 3);
  assert.strictEqual(r.changed, 2);
  assert.strictEqual(r.overflowCount, 1);
  assert.strictEqual(r.fits[0].reason, "SHRINK");
  assert.strictEqual(r.fits[1].reason, "FITS");
  assert.strictEqual(r.fits[2].overflow, true);
  assert.strictEqual(r.fits[2].to, 8); // max(8, round(12*0.6)=7) = 8
  console.log("[fit] PASS 8 zyFitMatches batch + stats");
}
// 9 输出只承载字号决策（无 geometry/font/style/identity/layer 键）—— 冻结承诺可断言
{
  const r = zyFitFontSize({ text: "0123456789", targetWidth: 90, baseFontSize: 20, measurer: mk() });
  assert.deepStrictEqual(Object.keys(r).sort(), ["changed", "fontSize", "measured", "ok", "overflow", "reason", "warnings"]);
  console.log("[fit] PASS 9 output carries only fontSize decision (no geometry/font/style)");
}
console.log("[fit] ALL PASS");
