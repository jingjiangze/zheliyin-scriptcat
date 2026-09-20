// =====================================================================
// 折立印名片套版助手 - Text Truth Gate（Stage 9 V3 §七/§八/§十六~§十九）
// ---------------------------------------------------------------------
// 硬规则（§一/§九十三）：Native OCR = 绝对文字真值。最终进入 Editor 的 textbox.text
//   必须来自 nativeOcr.texts[].rawText，禁止 Baidu/Tesseract/AI 文本进入。
// 职责：
//   1. validateNativeText(region, nativeText) —— 最终文本来源校验（§七），产出三种硬失败码（§八）：
//        FAIL_BAIDU_TEXT_LEAK        textbox.text 来自百度
//        FAIL_LOCAL_OCR_TEXT_LEAK    textbox.text 来自 Tesseract
//        FAIL_NATIVE_TEXT_MISMATCH   textbox.text !== native.rawText
//   2. applyNativeTextTruth(blocks, nativeResult) —— 主链接线（§六十一 Case A~E 语义）：
//        Native 文本按几何序 one-to-one 绑定到几何候选块；最终块.text = native.rawText（原样）；
//        无 Native 文本对应的几何块在 NATIVE_ON 模式下不创建（疑似噪点块，§三十）；无几何的
//        Native 行 → unmatchedNative（不伪造位置，§七十五）。
// 依赖解耦：Geometry（Baidu/Local/ImageInk）与 Text 完全解耦（§十~§十二）。
// 纯函数，node 可测。
// =====================================================================
"use strict";

var TEXT_TRUTH_OK = "TEXT_TRUTH_OK";
var FAIL_BAIDU_TEXT_LEAK = "FAIL_BAIDU_TEXT_LEAK";
var FAIL_LOCAL_OCR_TEXT_LEAK = "FAIL_LOCAL_OCR_TEXT_LEAK";
var FAIL_NATIVE_TEXT_MISMATCH = "FAIL_NATIVE_TEXT_MISMATCH";
var FAIL_TEXT_SOURCE_NOT_NATIVE = "FAIL_TEXT_SOURCE_NOT_NATIVE";
var GEOMETRY_KEEP = "GEOMETRY_FROM_CANDIDATE";
var GEOMETRY_UNKNOWN = "UNKNOWN_GEOMETRY";

// ---- §七/§八：最终文本来源校验 ----
// region: { text, textSource }
// nativeText: { rawText }（来自 nativeOcr.texts[]）
function validateNativeText(region, nativeText) {
  var r = region || {};
  var nt = nativeText || {};
  if (r.textSource !== "NATIVE_OCR") {
    var code = r.textSource === "BAIDU" ? FAIL_BAIDU_TEXT_LEAK
      : r.textSource === "LOCAL" || r.textSource === "TESSERACT" ? FAIL_LOCAL_OCR_TEXT_LEAK
        : FAIL_TEXT_SOURCE_NOT_NATIVE;
    return { ok: false, code: code, message: "text 来源非 NATIVE_OCR（" + String(r.textSource || "none") + "）" };
  }
  var want = nt.rawText != null ? String(nt.rawText) : null;
  var got = r.text != null ? String(r.text) : null;
  if (want == null) return { ok: false, code: FAIL_NATIVE_TEXT_MISMATCH, message: "缺少 Native rawText" };
  if (got !== want) return { ok: false, code: FAIL_NATIVE_TEXT_MISMATCH, message: "text !== native.rawText" };
  return { ok: true, code: TEXT_TRUTH_OK, message: "text 来自 NATIVE_OCR 且与 rawText 一致" };
}

// ---- §十六~§十九 辅助：geometry Center（候选块 bbox 中心 y，用于排序配对）----
function bboxCenterY(b) {
  if (!b || !b.bbox) return 0;
  var y = typeof b.bbox.y === "number" ? b.bbox.y : (b.bbox.y0 != null ? b.bbox.y0 : 0);
  var h = typeof b.bbox.height === "number" ? b.bbox.height : (b.bbox.y1 != null ? Math.abs(b.bbox.y1 - y) : 0);
  return y + h / 2;
}

// ---- §六十一：Native 文本与几何候选绑定（Text Truth 接线核心，纯函数）----
// blocks: 几何候选（buildTextBlocks 产物，含 bbox/text/sourceProvider）
// nativeResult: NativeOCRResult（native-ocr-provider.toNativeResult 输出，texts[] 按 order 语义排序）
// out: {
//   kept:    [ { ...block, text=rawText(原样), rawText, textSource:"NATIVE_OCR", textTruth:{nativeId,order,nativeRawText,geometryStatus} } ]
//   legacyDropped: [block]            —— 无 Native 文本对应（NATIVE_ON 不创建；疑似噪点）
//   unmatchedNative: [nativeLine]     —— Native 有、几何无（不伪造位置）
//   gate: { totalNative, totalBlocks, kept, dropped, unmatched, allTextTruthValid }
// }
function applyNativeTextTruth(blocks, nativeResult) {
  var bs = (Array.isArray(blocks) ? blocks : []).slice();
  var ns = (nativeResult && Array.isArray(nativeResult.texts) ? nativeResult.texts : []).slice();
  // 几何候选按 y 排序（阅读序自上而下）；Native 按 order 排序
  bs.sort(function (a, b) { return bboxCenterY(a) - bboxCenterY(b); });
  ns.sort(function (a, b) { return (a.order != null ? a.order : 0) - (b.order != null ? b.order : 0); });
  var kept = [];
  var legacyDropped = [];
  var unmatchedNative = [];
  bs.forEach(function (b, i) {
    if (i < ns.length && ns[i]) {
      var nb = ns[i];
      var nbText = String(nb.rawText != null ? nb.rawText : "");
      if (nbText === "") { legacyDropped.push(b); return; }
      kept.push(Object.assign({}, b, {
        text: nbText,
        rawText: nbText,
        textSource: "NATIVE_OCR",
        textTruth: { nativeId: nb.id != null ? nb.id : null, order: nb.order != null ? nb.order : i, nativeRawText: nbText, geometryStatus: GEOMETRY_KEEP }
      }));
    } else {
      legacyDropped.push(b);
    }
  });
  if (ns.length > bs.length) unmatchedNative = ns.slice(bs.length);
  // 校验：kept 全部必须通过 Text Truth Gate
  var gate = { totalNative: ns.length, totalBlocks: bs.length, kept: kept.length, dropped: legacyDropped.length, unmatched: unmatchedNative.length, allTextTruthValid: true, failureCode: null };
  for (var i = 0; i < kept.length; i += 1) {
    var v = validateNativeText({ text: kept[i].text, textSource: kept[i].textSource }, { rawText: kept[i].rawText });
    if (!v.ok) { gate.allTextTruthValid = false; gate.failureCode = v.code; break; }
  }
  return { kept: kept, legacyDropped: legacyDropped, unmatchedNative: unmatchedNative, gate: gate };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  validateNativeText, applyNativeTextTruth, bboxCenterY,
  TEXT_TRUTH_OK, FAIL_BAIDU_TEXT_LEAK, FAIL_LOCAL_OCR_TEXT_LEAK, FAIL_NATIVE_TEXT_MISMATCH, FAIL_TEXT_SOURCE_NOT_NATIVE, GEOMETRY_KEEP, GEOMETRY_UNKNOWN
};