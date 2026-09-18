// =====================================================================
// 折立印名片套版助手 - OCR 文本安全清洗器（Stage 7.8 §十~§十六）
// ---------------------------------------------------------------------
// 职责单一：sanitizeOcrText(text) -> {rawText, safeText, changed, removed,
//             normalized, blocked, reason}
//   rawText   OCR 原始文本（仅证据/诊断/重新处理）
//   safeText  真正送入 DIY 的文本（绝对不做 bbox/字体/page/Canvas 责任）
//   changed   safeText !== rawText
//   removed   被删除的字符数（BLOCKED 级 to=""）
//   normalized 被映射替换的字符数（NORMALIZABLE 或 BLOCKED 安全替换）
//   blocked   [{char, cp, to, reason}] 全部 BLOCKED 级命中（to="" 表示删除）
//   reason    人类可读清洗概要
//
// 三级策略（§十二）：
//   SAFE         已验证 DIY 安全，原样保留（不计数）。
//   NORMALIZABLE 不稳定（全角/换行/制表等）→ 映射为安全字符（normalized 计数）。
//   BLOCKED      已明确不适合文本框（控制/零宽/变体选择器）→ 删除或安全替换。
//
// 核心原则（§十/§十五）：
//   - 禁止 /[^一-龥a-zA-Z0-9]/g 粗暴过滤（会误删中文标点/电话符号/邮箱结构）。
//   - 采用「白名单即默认放行」的联合收口：只有落在规则清单内的字符才被处理，
//     其余（含 emoji/中文/未验证扩展字符）原样保留 —— 不因「很特殊」就删除；
//     是否升级 BLOCKED 必须等 §十一 真机单变量实验证明 DIY 失败后决定。
//
// 清洗顺序（§十六）：Unicode normalization（可选 NFKC）→ 换行规范化 → 控制字符
//   → DIY_CHARACTER_COMPATIBILITY 映射。全程逐码点处理（代理对不劈开）。
// 本模块为 @require 注入，纯函数可单测，不触碰 DOM/网络。
// =====================================================================
"use strict";

// 规则一览（name / test(cp) / level / to|null / reason）
// to=null → 动态映射（见 toFor 回调）；to="" → 删除（removed++）。
var RULES = [
  // 标签页 → 空格（§十五 异常制表）
  { name: "tab", test: function (cp) { return cp === 0x09; }, level: "NORMALIZABLE", to: " ", reason: "tab-to-space", toFor: null },
  // 控制字符（C0 除 \t\n\r、DEL、C1 区）→ 删除（明确不适合文本框）
  { name: "control", test: function (cp) { return (cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) || (cp >= 0x7f && cp <= 0x9f); }, level: "BLOCKED", to: "", reason: "control-char", toFor: null },
  // 零宽/不可见/格式控制：ZWSP/ZWNJ/ZWJ/LRM/RLM、Bidi 控制（202A-202E、2066-2069）、夹杂控制
  // （2060-2064）、BOM、阿拉伯/蒙古不可见、行间注释（FFF9-FFFB）
  { name: "zero-width", test: function (cp) { return (cp >= 0x200b && cp <= 0x200f) || (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2060 && cp <= 0x2064) || (cp >= 0x2066 && cp <= 0x2069) || cp === 0xfeff || cp === 0x061c || cp === 0x180e || (cp >= 0xfff9 && cp <= 0xfffb); }, level: "BLOCKED", to: "", reason: "zero-width-invisible", toFor: null },
  // Variation Selectors（仅修饰展示样式，文本框中无意义）
  { name: "variation-selector", test: function (cp) { return (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef); }, level: "BLOCKED", to: "", reason: "variation-selector", toFor: null },
  // 行分隔/段分隔 U+2028/2029 → 统一 \n
  { name: "line-separator", test: function (cp) { return cp === 0x2028 || cp === 0x2029; }, level: "NORMALIZABLE", to: "\n", reason: "line-separator-to-newline", toFor: null },
  // 全角字母/数字（U+FF10..FF19 数字、U+FF21..FF3A 大写、U+FF41..FF5A 小写）→ 半角 ASCII。
  // 注意：只收窄到字母数字 —— 全角中文标点（：；！？（）等 U+FF01..FF0F、FF1A..FF1F 等）属中文排版
  // 语义，保持全角不转换（§十二 全角/半角规范化仅针对「错位 ASCII 内容」）。
  { name: "fullwidth-alnum", test: function (cp) { return (cp >= 0xff10 && cp <= 0xff19) || (cp >= 0xff21 && cp <= 0xff3a) || (cp >= 0xff41 && cp <= 0xff5a); }, level: "NORMALIZABLE", to: null, reason: "fullwidth-alnum-to-halfwidth", toFor: function (cp) { return String.fromCodePoint(cp - 0xfee0); } },
  // 全角 ￥（U+FFE5）→ 半角 ¥（U+00A5）
  { name: "fullwidth-yen", test: function (cp) { return cp === 0xffe5; }, level: "NORMALIZABLE", to: "\u00a5", reason: "fullwidth-yen-to-halfwidth", toFor: null }
];

// 已验证安全的场景（§十一 对照）：SAFE 字符不参与清洗，仅用于分级诊断。
var SAFE_PATTERNS = [
  { name: "cjk-punct", test: function (cp) { return (cp >= 0x3001 && cp <= 0x303f) || cp === 0x3000 || cp === 0x2014; }, reason: "cjk-punctuation-safe" },
  { name: "quote-dots-mid", test: function (cp) { return (cp >= 0x2018 && cp <= 0x201d) || cp === 0x2026 || cp === 0x00b7 || cp === 0x00a0; }, reason: "quote-dots-middot-safe" },
  { name: "structural-ascii", test: function (cp, ch) { return "+#@._:/\\-|,;~=&%^$!?'\"()[]{}<>*".indexOf(ch) >= 0; }, reason: "structural-ascii-safe" },
  { name: "math-unit", test: function (cp) { return cp === 0x00d7 || cp === 0x00f7 || cp === 0x00b1 || cp === 0x00b0 || cp === 0x2103 || cp === 0x2109; }, reason: "math-unit-safe" }
];

// 单字符分级：命中规则 → 该规则级别；命中 SAFE 场景 → SAFE；其余 = SAFE（默认放行，§十五）
function classifyChar(ch) {
  var cp = ch.codePointAt(0);
  for (var i = 0; i < RULES.length; i += 1) {
    var r = RULES[i];
    if (r.test(cp, ch)) {
      var to = r.to;
      if (to === null && r.toFor) to = r.toFor(cp);
      return { level: r.level, reason: r.reason, to: to !== null ? to : ch };
    }
  }
  for (var j = 0; j < SAFE_PATTERNS.length; j += 1) {
    if (SAFE_PATTERNS[j].test(cp, ch)) return { level: "SAFE", reason: SAFE_PATTERNS[j].reason, to: ch };
  }
  return { level: "SAFE", reason: "default-keep", to: ch };
}

// 逐码点迭代（Array.from 展开代理对，emoji 等不会被劈成两半）
function codePointsOf(str) {
  return Array.from(String(str == null ? "" : str));
}

// 主流最终输出三条引用的纯函数。
// opts:
//   normalizeUnicode: NFKC 可选（默认 false；OCR chi_sim 输出通常不需，§十六 标记可选）
//   keepBlocked:      true → BLOCKED 字符原样保留（§十一 真机单变量探测用，仍进 blocked[]）
function sanitizeOcrText(text, opts) {
  var o = opts || {};
  var raw = String(text == null ? "" : text);
  if (o.normalizeUnicode) {
    try {
      raw = raw.normalize("NFKC");
    } catch (e) { /* NFKC 失败则退化为原串 */ }
  }
  var removed = 0;
  var normalized = 0;
  var blocked = [];
  var reasonParts = [];
  var safeText = "";
  var cps = codePointsOf(raw);
  for (var i = 0; i < cps.length; i += 1) {
    var ch = cps[i];
    // 换行规范化：\r\n / \r → \n（§十六 换行规范化，先于控制字符）
    if (ch === "\r") {
      if (cps[i + 1] === "\n") continue; // \r\n 归 \n 处理一次
      safeText += "\n";
      normalized += 1;
      reasonParts.push("cr-to-newline");
      continue;
    }
    var cls = classifyChar(ch);
    if (cls.level === "SAFE") { safeText += ch; continue; }
    if (cls.level === "BLOCKED") {
      blocked.push({ char: ch, cp: ch.codePointAt(0), to: cls.to === ch ? "" : cls.to, reason: cls.reason });
      reasonParts.push(cls.reason);
      if (o.keepBlocked) { safeText += ch; continue; }
      if (cls.to === ch || cls.to === "") { removed += 1; continue; }
      safeText += cls.to; normalized += 1;
      continue;
    }
    // NORMALIZABLE
    if (cls.to === ch) { safeText += ch; continue; }
    safeText += cls.to;
    normalized += 1;
    reasonParts.push(cls.reason);
  }
  var counts = {};
  reasonParts.forEach(function (r) { counts[r] = (counts[r] || 0) + 1; });
  var reason = Object.keys(counts).map(function (k) { return k + "\u00d7" + counts[k]; }).join(", ");
  return {
    rawText: raw,                    // 注意：normalizeUnicode 时 rawText 为 NFKC 后串（原始输入在诊断留档）
    safeText: safeText,
    changed: safeText !== String(text == null ? "" : text),
    removed: removed,
    normalized: normalized,
    blocked: blocked,
    reason: reason || ""
  };
}

// 可配置清单（供质量门禁/诊断读取）
var DIY_CHARACTER_COMPATIBILITY = { rules: RULES, safePatterns: SAFE_PATTERNS };

if (typeof module !== "undefined" && module.exports) module.exports = { sanitizeOcrText, classifyChar, DIY_CHARACTER_COMPATIBILITY };