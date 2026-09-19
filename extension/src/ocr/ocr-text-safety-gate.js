// =====================================================================
// 折立印名片套版助手 - OCR 文本安全门（Stage 7.8R §八/§二十五/§二十六）
// ---------------------------------------------------------------------
// 职责：Sanitizer 之后的最终兜底检查 —— 判断「safeText 能否安全送 DIY 创建」。
// 职责边界（§二十六）：只回答「DIY 能不能接受」，不评判 OCR 质量（ocr-quality）、
//   不判断页面（page-model）、不做几何（Geometry）。
//
// assessTextSafety({text, rawText, safeText}, opts) -> {
//   ok, status: "SAFE"|"BLOCK", issues: [], sanitized, blockedCount, safeText, rawText
// }
//
// 阻断条件（§八，硬门禁）：
//   1. safeText trim 后为空            → "empty"
//   2. safeText 残留非法 surrogate     → "lone-surrogate"
//   3. safeText 残留异常控制字符       → "control-char"
//   4. safeText 残留异常不可见字符     → "invisible-char"
//   5. safeText 残留变体选择器         → "variation-selector"
//
// 明确不阻断（§八：SAFE 普通中文标点不得被阻断）：
//   - 中文标点（，。！？、；：（）《》…——等，见 SAFE_PATTERNS 语义）
//   - 结构字符（@ . + / # 等）
//   - blocked.length > 0 但 safeText 已清洗干净 → status=SAFE + sanitized=true
//     （§二十五：★→BLOCKED 是 Sanitizer 正常职责，不是 Provider 失败，更不是
//       Safety Gate 阻断；gate 只拦「清洗后仍残留」的异常）
//
// 本模块为 @require 注入，纯函数可单测，不触碰 DOM/网络。
// =====================================================================
"use strict";

// 与 sanitizer 同源的异常判定（独立实现，避免强耦合；规则收口以 sanitizer 为准）
// 三类分别判定（§八：异常控制字符 / 异常不可见字符 / 变体选择器 是不同检查项）
function isControlChar(cp) {
  // C0（除 \t\n\r）、DEL、C1
  return (cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) || cp === 0x7f || (cp >= 0x80 && cp <= 0x9f);
}
function isInvisibleChar(cp) {
  // 零宽/不可见/Bidi 控制/夹杂控制/BOM/行间注释
  return (cp >= 0x200b && cp <= 0x200f) || (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2060 && cp <= 0x2064) ||
         (cp >= 0x2066 && cp <= 0x2069) || cp === 0xfeff || cp === 0x061c || cp === 0x180e || (cp >= 0xfff9 && cp <= 0xfffb);
}
function isVariationSelector(cp) {
  return (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef);
}
function isLoneSurrogate(units, i) {
  const c = units[i];
  if (c >= 0xd800 && c <= 0xdbff) {
    const nx = units[i + 1];
    return !(nx !== undefined && nx >= 0xdc00 && nx <= 0xdfff);
  }
  if (c >= 0xdc00 && c <= 0xdfff) {
    const pv = units[i - 1];
    return !(pv !== undefined && pv >= 0xd800 && pv <= 0xdbff);
  }
  return false;
}

// 中文标点 / 结构字符（白名单，绝不阻断；与 sanitizer SAFE_PATTERNS 语义对齐）
function isSafePunct(cp, ch) {
  if ((cp >= 0x3001 && cp <= 0x303f) || cp === 0x3000 || cp === 0x2014) return true;   // CJK 标点区
  if ((cp >= 0x2018 && cp <= 0x201d) || cp === 0x2026 || cp === 0x00b7 || cp === 0x00a0) return true;
  if ("+#@._:/\\-|,;~=&%^$!?'\"()[]{}<>*".indexOf(ch) >= 0) return true;
  if (cp === 0x00d7 || cp === 0x00f7 || cp === 0x00b1 || cp === 0x00b0 || cp === 0x2103 || cp === 0x2109) return true;
  return false;
}

// input: {text, rawText?, safeText?} 或直接字符串（此时 safeText=rawText=text，未经 sanitize）
// opts:  {blockedCount?}  —— sanitize 结果里的 blocked 数量（诊断；不阻断）
function assessTextSafety(input, opts) {
  const o = opts || {};
  const src = (input && typeof input === "object") ? input : { text: input };
  const rawText = src.rawText != null ? String(src.rawText) : String(src.text == null ? "" : src.text);
  const safeText = src.safeText != null ? String(src.safeText) : rawText;
  const issues = [];
  let status = "SAFE";

  if (!safeText.trim()) {
    issues.push("empty");
    status = "BLOCK";
  } else {
    const units = [];
    for (let i = 0; i < safeText.length; i += 1) units.push(safeText.charCodeAt(i));
    let sawControl = false, sawInvisible = false, sawVS = false, sawSurrogate = false;
    for (let i = 0; i < units.length; i += 1) {
      const c = units[i];
      if (isLoneSurrogate(units, i)) { sawSurrogate = true; break; }
      if (isControlChar(c)) { sawControl = true; continue; }
      if (isInvisibleChar(c)) { sawInvisible = true; continue; }
      if (isVariationSelector(c)) { sawVS = true; continue; }
    }
    if (sawSurrogate) { issues.push("lone-surrogate"); status = "BLOCK"; }
    if (sawControl) { issues.push("control-char"); status = "BLOCK"; }
    if (sawInvisible) { issues.push("invisible-char"); status = "BLOCK"; }
    if (sawVS) { issues.push("variation-selector"); status = "BLOCK"; }
  }

  const blockedCount = (o.blockedCount != null) ? o.blockedCount : ((src.blocked && Array.isArray(src.blocked)) ? src.blocked.length : 0);
  const sanitized = (blockedCount > 0) || (safeText !== rawText);
  return {
    ok: status === "SAFE",
    status: status,
    issues: issues,
    sanitized: sanitized,
    blockedCount: blockedCount,
    safeText: safeText,
    rawText: rawText
  };
}

// TextBlock 便捷入口：{text, rawText, safeText, sanitize:{blockedCount}} → 同 assessTextSafety
function assessBlockSafety(block) {
  const b = block || {};
  return assessTextSafety(
    { text: b.text, rawText: b.rawText, safeText: b.safeText },
    { blockedCount: (b.sanitize && b.sanitize.blockedCount) || 0 }
  );
}

if (typeof module !== "undefined" && module.exports) module.exports = { assessTextSafety, assessBlockSafety, isLoneSurrogate, isControlChar, isInvisibleChar, isVariationSelector };