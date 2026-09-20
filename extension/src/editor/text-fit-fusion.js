// =====================================================================
// 折立印名片套版助手 - Typography Evidence Fusion（Stage 8D §十三~§十五）
// ---------------------------------------------------------------------
// 目标：不再是「OCR bbox width 单一指标独裁字号」。fontSize 求解融合多个证据：
//   1. advance width（8B 定案主求解，§十五 第一优先；控制组精确命中源字号）
//   2. visual ink height（源图墨迹行高证据；有则与 advance 交叉校验）
//   3. OCR bbox height（引擎 padding 产物；仅作 sanity 窗，低质时继续降权）
// 并叠加 OCR confidence / block quality（Readiness 子项）→ 质量过低拒绝创建。
//
// 数据语义（8D §十二）：
//   ocrBBox          = OCR 检测区域（padding 产物，不可直接当文字视觉尺寸）
//   textVisualTarget = 文字视觉目标（advance 宽 / ink 高；本模块输入）
//   textLayoutTarget = textbox 布局目标（layoutWidth/boxHeight；仍在 buildItemsFromOcr）
//
// API：
//   solveFontSizeFusion(input) -> {ok, fontSize, reason, confidence,
//                                  sources:{advance, ink, ocrHeight}, warnings[]}
//   bboxSeparation(ocrBBox, scale, opts) -> {ocrBBox, textVisualTarget, textLayoutTarget}
// 本模块为 @require 注入 + node 单测；measurer 可注入（browser 2d context / synthetic）。
// =====================================================================
"use strict";

// —— 常驻阈值 ----
var MIN_QUALITY_TO_CREATE = 0.5;   // 质量低于此 → 不创建（8D §十五 低质不创建）
var OK_BOTH_RATIO = 0.15;          // advance/ink 双证据偏差 ≤15% → 一致采用 advance
var OCR_H_SANITY_LO = 0.4;         // fs 不得低于 ocrHeight*LO（过小 → 异常）
var OCR_H_SANITY_HI = 2.4;         // fs 不得高于 ocrHeight*HI（过大 → 异常）
var FS_MIN = 8, FS_MAX = 160;

function isFiniteNum(v) { return typeof v === "number" && isFinite(v); }

// 按 fontFamily 的行盒系数（lineBox 高 ≈ fs * ratio；SimHei≈1.425，sans/site 各异）
// 缺省 1.2（保守）；调用方可传 opts.lineHeightRatio 覆盖（页面/模板度量）。
function lineBoxRatio(fontFamily, opts) {
  var o = opts || {};
  if (o.lineHeightRatio != null && isFiniteNum(o.lineHeightRatio)) return o.lineHeightRatio;
  var f = String(fontFamily || "").toLowerCase();
  if (f.indexOf("simhei") >= 0 || f.indexOf("黑体") >= 0) return 1.425;
  if (f.indexOf("simsun") >= 0 || f.indexOf("宋") >= 0) return 1.16;
  if (f.indexOf("microsoft yahei") >= 0 || f.indexOf("微软雅黑") >= 0) return 1.32;
  return 1.2;
}

// advance 证据：解字号使文本 advanceWidth ≈ targetVisualWidth（8B §主算法）
// measurer 接口兼容：createTextMeasurer（measureLine(line,fs,family)/measureGlyph）与原生 measureText(text,fontString)
function solveByAdvance(text, targetVisualWidth, fontFamily, measurer) {
  if (!(targetVisualWidth > 0) || !measurer) return null;
  var measureOf = function (fs) {
    if (typeof measurer.measureLine === "function") return measurer.measureLine(text, fs, fontFamily);
    if (typeof measurer.measureText === "function") return measurer.measureText(text, (fs + "px ") + fontFamily);
    return null;
  };
  var fs = Math.max(FS_MIN, Math.min(FS_MAX, Math.round(targetVisualWidth / Math.max(1, text.length) * 1.0)));
  var lo = FS_MIN, hi = FS_MAX, best = null, bestErr = Infinity;
  for (var i = 0; i < 40; i += 1) {
    var m = measureOf(fs);
    if (!m || !isFiniteNum(m.width)) break;
    var err = Math.abs(m.width - targetVisualWidth);
    if (err < bestErr) { bestErr = err; best = fs; }
    if (m.width > targetVisualWidth) hi = fs; else lo = fs;
    fs = Math.round((lo + hi) / 2 * 100) / 100;
    if (hi - lo < 0.05) break;
  }
  if (best == null) return null;
  var m2 = measureOf(best);
  return { fontSize: Math.max(FS_MIN, Math.min(FS_MAX, Math.round(best))), advanceWidth: m2 ? m2.width : null, err: bestErr };
}

// ink 证据：fs = inkHeight / lineBoxRatio（ink 高指视觉墨迹行高，含 lineBox 比例）
function solveByInkHeight(inkHeight, fontFamily, opts) {
  if (!isFiniteNum(inkHeight) || inkHeight <= 0) return null;
  var fs = Math.max(FS_MIN, Math.min(FS_MAX, Math.round(inkHeight / lineBoxRatio(fontFamily, opts))));
  return { fontSize: fs, inkHeight: inkHeight, ratio: lineBoxRatio(fontFamily, opts) };
}

// —— 主入口（8D §十四/§十五）——
// input: {
//   text, targetVisualWidth (advance 目标=ocrBBox.width×scale),
//   inkHeight (可选源图墨迹行高证据), ocrHeight (可选 sanity),
//   fontFamily, fontFamilySource, measurer, quality (0-1), context
// }
// return {ok, fontSize, reason, confidence, sources:{advance, ink, ocrHeight}, warnings}
function solveFontSizeFusion(input) {
  var o = input || {};
  var text = String(o.text || "");
  var quality = isFiniteNum(o.quality) ? Math.max(0, Math.min(1, o.quality)) : 0.9;
  var warnings = [];
  if (!text) return { ok: false, reason: "empty-text", fontSize: null, confidence: 0, sources: {}, warnings: warnings };
  if (quality < MIN_QUALITY_TO_CREATE) {
    return { ok: false, reason: "low-quality(" + Math.round(quality * 100) + ")", fontSize: null, confidence: 0, sources: {}, warnings: warnings.concat(["quality below create threshold"]) };
  }
  var fontFamily = o.fontFamily || "sans-serif";
  var measurer = o.measurer || null;
  var adv = null, ink = null, ocrSrc = null;
  if (measurer) adv = solveByAdvance(text, o.targetVisualWidth, fontFamily, measurer);
  if (isFiniteNum(o.inkHeight)) ink = solveByInkHeight(o.inkHeight, fontFamily, o.context || o);
  if (isFiniteNum(o.ocrHeight)) ocrSrc = { ocrHeight: o.ocrHeight };

  var fs = null, reason = "no-evidence";
  var sources = { advance: adv, ink: ink, ocrHeight: ocrSrc };
  if (adv && ink) {
    var d = Math.abs(adv.fontSize - ink.fontSize) / Math.max(1, Math.max(adv.fontSize, ink.fontSize));
    if (d <= OK_BOTH_RATIO) { fs = adv.fontSize; reason = "advance-ink-consistent"; }
    else { fs = adv.fontSize; reason = "advance-primary-ink-conflict"; warnings.push("ink conflict d=" + Math.round(d * 100) + "%"); }
  } else if (adv) { fs = adv.fontSize; reason = "advance-width-primary"; }
  else if (ink) { fs = ink.fontSize; reason = "ink-height-primary"; }
  else if (ocrSrc) { fs = Math.max(FS_MIN, Math.min(FS_MAX, Math.round(ocrSrc.ocrHeight / 1.425))); reason = "ocr-height-legacy"; }

  if (fs == null) return { ok: false, reason: "no-evidence", fontSize: null, confidence: 0, sources: sources, warnings: warnings };
  // OCR height sanity（不分主权重；离谱才警示/遏制）
  if (ocrSrc && quality < 0.75) {
    if (fs < ocrSrc.ocrHeight * OCR_H_SANITY_LO || fs > ocrSrc.ocrHeight * OCR_H_SANITY_HI) {
      fs = Math.max(FS_MIN, Math.min(FS_MAX, Math.round(ocrSrc.ocrHeight / 1.425)));
      reason += "-ocrsanity-clamp";
      warnings.push("fs outside ocr sanity window");
    }
  }
  fs = Math.max(FS_MIN, Math.min(FS_MAX, Math.round(fs)));
  var confidence = Math.round((0.5 + 0.5 * quality - (reason.indexOf("conflict") >= 0 ? 0.15 : 0)) * 100) / 100;
  return { ok: true, fontSize: fs, reason: reason, confidence: Math.max(0.1, Math.min(1, confidence)), sources: sources, warnings: warnings };
}

// —— 8D §十二：bbox 三层分离 ——
// normalize: ocrBBox（原样）；textVisualTarget（宽=bbox.width×scale 视觉宽 + ink 高估计）；
//            textLayoutTarget（布局提示：最小宽/行距，供 buildItemsFromOcr 使用）
function bboxSeparation(ocrBBox, scale, opts) {
  var o = opts || {};
  var bw = isFiniteNum(ocrBBox && ocrBBox.width) ? ocrBBox.width : 0;
  var bh = isFiniteNum(ocrBBox && ocrBBox.height) ? ocrBBox.height : 0;
  var s = scale || 1;
  var inkHeight = isFiniteNum(o.inkHeight) ? o.inkHeight : null;
  return {
    ocrBBox: { x: ocrBBox.x, y: ocrBBox.y, width: bw, height: bh },
    textVisualTarget: { width: bw * s, heightUnit: "px", inkHeight: inkHeight, advanceWidthTarget: bw * s },
    textLayoutTarget: { width: null, boxHeight: null }
  };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  solveFontSizeFusion, bboxSeparation, lineBoxRatio,
  MIN_QUALITY_TO_CREATE, OCR_H_SANITY_LO, OCR_H_SANITY_HI
};