// =====================================================================
// 折立印名片套版助手 - Alt+Q 文字真值 Provider（Stage 9 P1, §十二~§十三）
// ---------------------------------------------------------------------
// 职责边界（§一/§二/§三）：
//   Alt+Q = 最终文字唯一真值。本模块把「页面原生 Alt+Q 提取」的能力边界化：
//     capture() → Promise<AltQResult>
//   text 分成两层：rawText（最终显示/创建，绝对保留原样）与 matchText（仅用于候选匹配，
//   做大小写/空白/标点归一化，绝不送入 Editor）。
// 真实能力探测：
//   P0-3 真实取证（2026-09-20）结论 = diy.zheliyin.com 当前：
//     - 252438 编辑器 Alt+Q 三状态变体零行为、无绑定
//     - OCRTool.do 已废弃（JS 跳转 http://host:443 → 400）
//     - jsj 用户中心登录后工具菜单无文字识别
//   因此本模块默认走 honest 路径：detector 未发现可用源 → {ok:false, reason:"ALTQ_UNAVAILABLE",
//   evidence 记录探测结果}；**绝不虚拟伪造文字**。一旦未来站点提供可用入口，新增 detector 接入即可。
// 本模块为 @require 候选（P1 本轮未接线主链：纯模块 + node 单测；规格 §六十八 先审计后接线）。
// =====================================================================
"use strict";

// ---- §三：matchText 归一化（仅用于匹配；绝不修改 rawText）----
// 大小写统一、空白压缩、匹配用标点剥离，保留字母/数字/中文。
function normalizeMatchText(s) {
  if (s == null) return "";
  var t = String(s);
  t = t.toLowerCase();
  t = t.replace(/[\s\u3000]+/g, " ");
  t = t.trim();
  t = t.replace(/[·•．。，,、；;\u3000\s'"“”‘’（）()【】\[\]《》<>:：-]/g, "");
  return t;
}

// ---- §九/§十三：stable id（来源 + 序号 + 文本前 6 字符 hash 化）----
function altqTextId(source, index, rawText) {
  var s = String(source == null ? "ALT_Q" : source) + ":" + index + ":" + String(rawText || "").slice(0, 8);
  var h = 5381;
  for (var i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return "altq-" + ((h >>> 0).toString(16));
}

// ---- §十二：rawItems → texts（契约形状组装；纯函数）----
// rawItems: [{ text, order?, nativeBBox? }]
function buildAltQTexts(rawItems, opts) {
  var o = opts || {};
  var source = o.source || "NATIVE_PAGE";
  return (Array.isArray(rawItems) ? rawItems : [])
    .filter(function (it) { return it && typeof it.text === "string" && it.text.trim() !== ""; })
    .map(function (it, i) {
      var raw = String(it.text);
      return {
        id: it.id != null ? String(it.id) : altqTextId(source, i, raw),
        rawText: raw,
        matchText: normalizeMatchText(raw),
        order: typeof it.order === "number" ? it.order : i,
        nativeBBox: it.nativeBBox || null,
        evidence: {
          source: source,
          confidence: typeof it.confidence === "number" ? it.confidence : null,
          raw: it.raw != null ? it.raw : null
        }
      };
    });
}

// ---- §五十四：image fingerprint（width/height + 内容 hash 组合）----
function imageFingerprint(o) {
  var w = o && o.naturalWidth, h = o && o.naturalHeight, hash = (o && o.hash) || "";
  var hh = 5381;
  var s = w + "x" + h + "#" + String(hash || "");
  for (var i = 0; i < s.length; i += 1) hh = ((hh << 5) + hh + s.charCodeAt(i)) | 0;
  return "img-" + ((hh >>> 0).toString(16)) + "-" + (w || 0) + "x" + (h || 0);
}

// ---- 探测：detector() 返回 { found:true, rawItems:[{text,...}] } 或 { found:false, reason, hints } ----
// 页面 world 的 detector 负责真实查找（window/module/UI/DOM/clipboard/editor 对象），
// 本模块只消费其输出，并在无源时给出 ALTQ_UNAVAILABLE 诚实结果。
function capture(opts) {
  var o = opts || {};
  var detector = typeof o.detector === "function" ? o.detector : null;
  var t0 = o.now ? o.now() : Date.now();
  return Promise.resolve()
    .then(function () {
      var det = detector
        ? detector()
        : { found: false, reason: "NO_DETECTOR" };
      var result = {
        provider: "ALT_Q",
        source: det && det.found ? (det.source || "NATIVE_PAGE") : "NONE",
        pageId: o.pageId || null,
        transactionId: o.transactionId || null,
        imageFingerprint: o.imageFingerprint || null,
        texts: [],
        meta: {
          elapsed: (o.now ? o.now() : Date.now()) - t0,
          timestamp: o.timestamp || new Date().toISOString(),
          detect: det || null
        }
      };
      if (det && det.found) {
        result.texts = buildAltQTexts(det.rawItems, { source: result.source });
        result.ok = true;
        result.reason = "ALTQ_READY";
      } else {
        result.ok = false;
        result.reason = "ALTQ_UNAVAILABLE";
        if (det && det.reason) result.unavailable = det.reason;
      }
      return result;
    });
}

// ---- §三 硬保障：Editor 只允许消费 rawText ----
function editorTextOf(texts) {
  return (texts || []).filter(function (t) { return t && typeof t.rawText === "string"; }).map(function (t) { return t.rawText; });
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  normalizeMatchText, buildAltQTexts, imageFingerprint, capture, editorTextOf, altqTextId
};