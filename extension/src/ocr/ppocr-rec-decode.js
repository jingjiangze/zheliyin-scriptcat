// =====================================================================
// 折立印名片套版助手 - PP-OCR rec 字典与 CTC 解码（Stage 12 M3-2：rec decode）
// ---------------------------------------------------------------------
// 职责（单一职责）：PP-OCRv6 rec 输出（1xTxC 概率）→ 文本 + 置信度：纯函数。
//   1. parseDictText     字典文本 → 字符数组（逐行一个字符；空行忽略）
//   2. buildRecCharset   PaddleOCR 约定：charset = ['blank'] + (' ' 可选) + 字典字符
//                        （对应 BaseRecLabelEncode：use_space_char 前置空格，blank 插入 index 0）
//   3. ctcGreedyDecode   CTC 贪心解码：argmax → 去 blank → 去连续重复 → 文本
//                        置信度 = 保留时间步的最大概率均值（如实定义，便于跨实现比对）
// 输入形状：output = { data: Float32Array(平铺 T*C) | number[][]（T 行） | Float32Array[] } +
//   { timeSteps, classes }；也支持 { probs: ... } 同义字段。
//   applySoftmax：模型若直接输出概率（PaddleOCR rec 为 softmax 后），保持 false；
//   若拿到 logits（部分导出），置 true。
// 纯函数、自包含（无 require、无 DOM/网络）；node 可单测。
// =====================================================================
"use strict";

function zyRecIsNum(v) { return typeof v === "number" && isFinite(v); }

// ---- 1. 字典文本 → 字符数组 ----
function parseDictText(text) {
  if (text == null) return [];
  return String(text).split(/\r?\n/).map(function (line) { return line.replace(/\r$/, ""); }).filter(function (line) { return line.length > 0; });
}

// ---- 2. charset 组装 ----
// opts: { useSpaceChar=true, blankToken="blank" }
function buildRecCharset(dictText, opts) {
  var o = opts || {};
  var useSpace = o.useSpaceChar !== false;
  var dictChars = Array.isArray(dictText) ? dictText.slice() : parseDictText(dictText);
  var chars = useSpace ? [" "].concat(dictChars) : dictChars;
  var charset = [o.blankToken != null ? o.blankToken : "blank"].concat(chars);
  // ok 只看字典本身有无字符（空格是约定插入，不构成有效字典）
  return { ok: dictChars.length > 0, charset: charset, size: charset.length, dictSize: dictChars.length, useSpaceChar: useSpace };
}

// ---- 3. CTC 贪心解码 ----
// output: { data|probs, timeSteps, classes }（平铺）或 { data|probs: number[][] }（T 行）
// opts: { charset, applySoftmax=false, blankIndex=0, minProb=null }
function ctcGreedyDecode(output, opts) {
  var o = opts || {};
  var charset = o.charset || [];
  var blankIndex = zyRecIsNum(o.blankIndex) ? o.blankIndex : 0;
  var applySoftmax = !!o.applySoftmax;
  var src = output && (output.data != null ? output.data : output.probs);
  if (src == null) return { ok: false, errorCode: "REC_OUTPUT_INVALID", text: "", confidence: 0, chars: [] };
  var timeSteps = zyRecIsNum(output.timeSteps) ? output.timeSteps : (Array.isArray(src) && Array.isArray(src[0]) ? src.length : 0);
  var classes = zyRecIsNum(output.classes) ? output.classes : (Array.isArray(src) && Array.isArray(src[0]) ? src[0].length : 0);
  if (!timeSteps || !classes) return { ok: false, errorCode: "REC_SHAPE_INVALID", text: "", confidence: 0, chars: [] };
  var row = function (t, c) {
    if (Array.isArray(src)) {
      var r = src[t];
      if (Array.isArray(r)) return r[c];
      return src[t * classes + c]; // 兼容 Array 平铺
    }
    return src[t * classes + c];
  };
  var softmaxRow = function (t) {
    var maxV = -Infinity;
    for (var c = 0; c < classes; c += 1) { var v = row(t, c); if (v > maxV) maxV = v; }
    var sum = 0;
    var exps = new Array(classes);
    for (var c2 = 0; c2 < classes; c2 += 1) { var e = Math.exp(row(t, c2) - maxV); exps[c2] = e; sum += e; }
    for (var c3 = 0; c3 < classes; c3 += 1) exps[c3] = exps[c3] / sum;
    return exps;
  };
  var chars = [];
  var prevIndex = -1;
  var probSum = 0;
  var probCount = 0;
  var minProb = null;
  for (var t = 0; t < timeSteps; t += 1) {
    var bestIndex = 0, bestProb = -Infinity;
    if (applySoftmax) {
      var probs = softmaxRow(t);
      for (var c = 0; c < classes; c += 1) { if (probs[c] > bestProb) { bestProb = probs[c]; bestIndex = c; } }
    } else {
      for (var c2 = 0; c2 < classes; c2 += 1) { var v = row(t, c2); if (v > bestProb) { bestProb = v; bestIndex = c2; } }
    }
    if (bestIndex === blankIndex) { prevIndex = bestIndex; continue; }
    if (bestIndex === prevIndex) { prevIndex = bestIndex; continue; }
    prevIndex = bestIndex;
    var ch = charset[bestIndex] != null ? charset[bestIndex] : "";
    chars.push({ index: bestIndex, char: ch, prob: bestProb, timeStep: t });
    probSum += bestProb;
    probCount += 1;
    if (minProb == null || bestProb < minProb) minProb = bestProb;
  }
  var text = chars.map(function (x) { return x.char; }).join("");
  // 置信度：保留时间步的最大概率均值（无保留 → 0）
  var confidence = probCount > 0 ? probSum / probCount : 0;
  return { ok: true, text: text, confidence: confidence, minCharProb: probCount > 0 ? minProb : 0, chars: chars, timeSteps: timeSteps, classes: classes, blankIndex: blankIndex };
}

// ---- 4. cls（0°/180°）解码：2 类 argmax ----
// output: { data|probs: Float32Array(2) } 或 (1x2)
function clsDecode(output) {
  var src = output && (output.data != null ? output.data : output.probs);
  if (src == null || src.length < 2) return { ok: false, errorCode: "CLS_OUTPUT_INVALID", rotation: null, labelIndex: null };
  var a = src[0], b = src[1];
  return { ok: true, rotation: b > a ? 180 : 0, labelIndex: b > a ? 1 : 0, scores: [a, b] };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  parseDictText: parseDictText,
  buildRecCharset: buildRecCharset,
  ctcGreedyDecode: ctcGreedyDecode,
  clsDecode: clsDecode
};