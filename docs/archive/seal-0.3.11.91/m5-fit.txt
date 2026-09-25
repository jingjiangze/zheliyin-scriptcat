// =====================================================================
// 折立印名片套版助手 - Template Text Fit（M5 模板 Fit 引擎）
// ---------------------------------------------------------------------
// 职责：给定「客户文本 + 目标宽度 + 基准字号 + 真实测量器」，求不溢出的最大字号。
// 硬规则（M5 定稿）：
//   1. 只产出 fontSize —— 绝不产出 geometry/font/style/identity/layer 变更；
//   2. 默认开启：基准字号已放得下 → 不改（changed=false，零副作用）；
//   3. 放不下 → 在 [minFontSize, base] 内核搜索 ≤ targetWidth 的最大字号；
//   4. 到最小字号仍放不下 → 返回 minFontSize 且 overflow=true（不强行继续缩、不换行）；
//   5. 无测量器/无目标宽/无基准字号/测量失败 → 保持原字号（保守，绝不猜）。
// 自包含：函数内不引用模块级 helper，便于经 toString() 连带注入 page 世界。
// 测量器注入：measurer(text, fontFamily, fontSize) → width | null（page 世界 = canvas 2d 真实测量）。
// 真源：runtime/stage11/template-text-fit.test.js
// =====================================================================
"use strict";

function zyFitFontSize(input) {
  var o = input || {};
  var isNum = function (v) { return typeof v === "number" && isFinite(v); };
  var text = String(o.text == null ? "" : o.text);
  var ff = String(o.fontFamily || "sans-serif");
  var measurer = (typeof o.measurer === "function") ? o.measurer : null;
  var base = (isNum(o.baseFontSize) && o.baseFontSize > 0) ? o.baseFontSize : null;
  var target = (isNum(o.targetWidth) && o.targetWidth > 0) ? o.targetWidth : null;
  var minCfg = (isNum(o.minFontSize) && o.minFontSize > 0) ? Math.round(o.minFontSize) : null;
  var ratio = (isNum(o.minRatio) && o.minRatio > 0 && o.minRatio < 1) ? o.minRatio : 0.6;
  var min = (minCfg != null) ? minCfg : ((base != null) ? Math.max(8, Math.round(base * ratio)) : 8);
  if (base != null && min > base) min = base;
  var warnings = [];
  var out = function (fontSize, reason, measured, overflow) {
    return { ok: true, fontSize: fontSize, changed: !!(base != null && isNum(fontSize) && fontSize !== base), reason: reason, overflow: !!overflow, measured: measured || null, warnings: warnings };
  };
  if (!text) return out(base, "EMPTY_TEXT", null, false);
  if (!measurer) return out(base, "NO_EVIDENCE_MEASURER", null, false);
  if (!target) return out(base, "NO_EVIDENCE_TARGET", null, false);
  if (!base) return out(base, "NO_EVIDENCE_BASE", null, false);
  var wBase = measurer(text, ff, base);
  if (!isNum(wBase)) return out(base, "MEASURE_FAILED", null, false);
  if (wBase <= target) return out(base, "FITS", { width: wBase, limit: target }, false);
  var lo = min, hi = base, best = null, bestW = null, iter = 0;
  while (lo <= hi && iter < 24) {
    iter += 1;
    var mid = Math.round((lo + hi) / 2);
    var w = measurer(text, ff, mid);
    if (!isNum(w)) { warnings.push("measure-miss@" + mid); break; }
    if (w <= target) { best = mid; bestW = w; lo = mid + 1; } else { hi = mid - 1; }
  }
  if (best == null) {
    var wMin = measurer(text, ff, min);
    warnings.push("min-font-reached");
    return out(min, "OVERFLOW", { width: isNum(wMin) ? wMin : null, limit: target }, true);
  }
  return out(best, "SHRINK", { width: bestW, limit: target }, false);
}

function zyFitMatches(input) {
  var o = input || {};
  var isNum = function (v) { return typeof v === "number" && isFinite(v); };
  var matches = Array.isArray(o.matches) ? o.matches : [];
  var slots = Array.isArray(o.slots) ? o.slots : [];
  var measurer = (typeof o.measurer === "function") ? o.measurer : null;
  var fits = [], changed = 0, overflow = 0;
  matches.forEach(function (m, i) {
    var so = slots[m && m.slotIdx];
    var base = (so && isNum(so.fontSize)) ? so.fontSize : null;
    var target = (so && isNum(so.width) && so.width > 0) ? so.width : null;
    var tx = (m && (m.text != null ? m.text : m.customerText));
    var r = zyFitFontSize({ text: tx, targetWidth: target, fontFamily: (so && so.fontFamily) || "sans-serif", baseFontSize: base, measurer: measurer, minFontSize: o.minFontSize, minRatio: o.minRatio });
    if (r.changed) changed += 1;
    if (r.overflow) overflow += 1;
    fits.push({ slotIdx: (m && m.slotIdx != null) ? m.slotIdx : i, fieldKey: (m && m.fieldKey) || null, from: base, to: r.fontSize, changed: r.changed, reason: r.reason, overflow: r.overflow, measured: r.measured });
  });
  return { ok: true, fits: fits, changed: changed, overflowCount: overflow };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { zyFitFontSize: zyFitFontSize, zyFitMatches: zyFitMatches };
}
