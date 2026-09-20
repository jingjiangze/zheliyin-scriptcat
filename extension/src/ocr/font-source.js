// =====================================================================
// 折立印名片套版助手 - Font Source Resolver（Stage 8D P5-1）
// ---------------------------------------------------------------------
// 目标：字体来源 provenance 四层分类（§五），且严格「Source 与 Used 分离」（§六）：
//   - 来源判断 ≠ 字体是否安装；FONT_REAL_TEMPLATE 只允许「模板真实 textbox 的 fontFamily」。
//   - FONT_SITE_DEFAULT 仅当调用方提供真实页面/编辑器默认字体证据（getComputedStyle 等）。
//   - FONT_SYSTEM_MATCH 仅当 document.fonts.check 等真实运行证据确认；否则保持 null 向后 fallback。
//   - FONT_FALLBACK 兜底 = sane（默认 "sans-serif"，保持现有行为，不因 resolver 改动实际字体）。
// 职责边界：纯诊断；本模块**不得改变**调用方实际传给 measurement/Native 的 fontFamily（fontFamilyUsed）。
//   specialStyle / STYLE_DEFERRED 亦仅诊断打标，不参与创建决策（禁止 return null / 改尺寸）。
// 本模块为 @require 注入 + node 单测。
// =====================================================================
"use strict";

var FONT_REAL_TEMPLATE = "FONT_REAL_TEMPLATE";
var FONT_SITE_DEFAULT = "FONT_SITE_DEFAULT";
var FONT_SYSTEM_MATCH = "FONT_SYSTEM_MATCH";
var FONT_FALLBACK = "FONT_FALLBACK";
var DEFAULT_FALLBACK = "sans-serif";
var STYLE_READY = "STYLE_READY";
var STYLE_DEFERRED = "STYLE_DEFERRED";

function isNonEmpty(v) { return typeof v === "string" && v.trim() !== ""; }

// ---- §四/§五：四层来源解析（纯函数；siteDefault/systemMatch 由调用方提供真实证据，缺则 null）----
// input: { templateFamily?, siteDefaultFamily?, systemMatchFamily?, fallbackFamily? }
// return: { source, family, templateFamily, siteDefaultFamily, systemMatchFamily, fallbackFamily }
function resolveFontSource(input) {
  var o = input || {};
  var res = {
    source: FONT_FALLBACK,
    family: DEFAULT_FALLBACK,
    templateFamily: isNonEmpty(o.templateFamily) ? o.templateFamily : null,
    siteDefaultFamily: isNonEmpty(o.siteDefaultFamily) ? o.siteDefaultFamily : null,
    systemMatchFamily: isNonEmpty(o.systemMatchFamily) ? o.systemMatchFamily : null,
    fallbackFamily: isNonEmpty(o.fallbackFamily) ? o.fallbackFamily : DEFAULT_FALLBACK
  };
  if (res.templateFamily != null) {
    // §五-1：仅「模板真实 textbox 的 fontFamily」允许 REAL_TEMPLATE（与系统是否安装无关）
    res.source = FONT_REAL_TEMPLATE;
    res.family = res.templateFamily;
  } else if (res.siteDefaultFamily != null) {
    // §五-2：仅当调用方拿到真实站点/编辑器默认字体 CSS 证据
    res.source = FONT_SITE_DEFAULT;
    res.family = res.siteDefaultFamily;
  } else if (res.systemMatchFamily != null) {
    // §五-3：仅当 document.fonts.check 等真实运行证据确认（调用方负责验证后传入）
    res.source = FONT_SYSTEM_MATCH;
    res.family = res.systemMatchFamily;
  } else {
    // §五-4：无可信来源 → fallback（保持既有行为 semantic）
    res.source = FONT_FALLBACK;
    res.family = res.fallbackFamily;
  }
  return res;
}

// ---- §七/§八：Special Style 诊断（conservative heuristic + evidence，仅诊断）----
// input: { noTemplateFont, singleLine, largeFont, textLength, fontWeight, visualRatio }
// 弱证据组合（沿用 P5 审计 §8）：模板无字体 + 单逻辑行 + 大字号/展示型特征。
// 命中 → specialStyle=true, styleStatus=STYLE_DEFERRED（仅打标，不改变创建）。
function assessSpecialStyle(input) {
  var o = input || {};
  var ev = {
    noTemplateFont: !!o.noTemplateFont,
    singleLine: !!o.singleLine,
    largeFont: !!o.largeFont,
    textLength: typeof o.textLength === "number" ? o.textLength : null,
    fontWeight: o.fontWeight != null ? String(o.fontWeight) : null
  };
  var hit = ev.noTemplateFont && ev.singleLine &&
    ev.largeFont && ev.textLength != null && ev.textLength >= 2;
  if (hit) {
    return { specialStyle: true, styleStatus: STYLE_DEFERRED, specialStyleEvidence: ev };
  }
  return { specialStyle: false, styleStatus: STYLE_READY, specialStyleEvidence: ev };
}

// ---- §九：block 行角度统计（OCR line angle/rotation 中位数；无则为 null）----
function blockTextAngle(lines) {
  var vals = [];
  (Array.isArray(lines) ? lines : []).forEach(function (l) {
    var a = l && (typeof l.angle === "number" ? l.angle : (typeof l.rotation === "number" ? l.rotation : null));
    if (a != null && isFinite(a)) vals.push(((a % 360) + 360) % 360);
  });
  if (!vals.length) return null;
  vals.sort(function (x, y) { return x - y; });
  var n = vals.length;
  return n % 2 ? vals[(n - 1) / 2] : (vals[n / 2 - 1] + vals[n / 2]) / 2;
}

// ---- §九：orientation diagnostics 组装（不修改 geometry/item.angle）----
function buildOrientationDiagnostics(blockAngle, imageAngle, opts) {
  var classify = (opts && typeof opts.classifyTextAngle === "function") ? opts.classifyTextAngle : null;
  if (blockAngle == null) {
    return { source: "NONE", blockAngle: null, imageAngle: imageAngle || 0, classification: "UNKNOWN", confidence: 0 };
  }
  if (classify) {
    var c = classify(blockAngle, imageAngle);
    return { source: "OCR_LINE", blockAngle: blockAngle, imageAngle: imageAngle || 0, classification: c.classification, confidence: c.confidence || 0 };
  }
  return { source: "OCR_LINE", blockAngle: blockAngle, imageAngle: imageAngle || 0, classification: "UNKNOWN", confidence: 0 };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  resolveFontSource, assessSpecialStyle, blockTextAngle, buildOrientationDiagnostics,
  FONT_REAL_TEMPLATE, FONT_SITE_DEFAULT, FONT_SYSTEM_MATCH, FONT_FALLBACK, DEFAULT_FALLBACK, STYLE_READY, STYLE_DEFERRED
};