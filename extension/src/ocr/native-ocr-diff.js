// =====================================================================
// 折立印名片套版助手 - Native OCR A/B Diff（Stage 9 V3 §七）
// ---------------------------------------------------------------------
// 职责仅一项：compareNativeOcr(a, b) —— 输出两模式 Native OCR 结果的事实差异。
// 不做"哪个更好"评分、不调用 AI、不做归一化判定；只逐行/逐字符如实记录。
// input: a/b = { mode, textType, lines:[{order,rawText,matchText}] }
// output:
//   lineCountA/B, sameLineCount, changedLines[], addedLines[], removedLines[],
//   characterDiffCount, whitespaceDiffCount, punctuationDiffCount,
//   semanticChangedFields { name, company, phone, tel, email }（两模式该字段文本是否相同）
// 纯函数，node 可测；不改主链/不升版。
// =====================================================================
"use strict";

var RE_PUNC = /[·•．。，,、；;'"“”‘’（）()【】\[\]《》<>:：\-_@+]/;
var RE_WS = /[\s\u3000\u00a0]/;

// 字符级差异统计：对两个字符串逐位置比较（忽略共同前缀/后缀后数不同点），并归类空白/标点
function charDiffStat(rawA, rawB) {
  var a = String(rawA == null ? "" : rawA);
  var b = String(rawB == null ? "" : rawB);
  var total = 0, ws = 0, punc = 0;
  var len = Math.max(a.length, b.length);
  for (var i = 0; i < len; i += 1) {
    var ca = i < a.length ? a.charAt(i) : "";
    var cb = i < b.length ? b.charAt(i) : "";
    if (ca === cb) continue;
    total += 1;
    if (!ca || !cb || RE_WS.test(ca) || RE_WS.test(cb)) ws += 1;
    else if (RE_PUNC.test(ca) || RE_PUNC.test(cb)) punc += 1;
  }
  return { total: total, ws: ws, punc: punc };
}

// 语义字段提取（仅为对比相等性；不参与"哪个更好"）
function fieldOf(lines, pred) {
  for (var i = 0; i < (lines || []).length; i += 1) {
    var t = String((lines[i] || {}).rawText || "");
    if (pred(t)) return t;
  }
  return null;
}
function semanticFields(lines) {
  return {
    name: fieldOf(lines, function (t) { return t.indexOf("吴健湘") >= 0; }),
    company: fieldOf(lines, function (t) { return t.indexOf("佛山盛盈包装") >= 0 || t.indexOf("佛山盛") >= 0 || t.indexOf("包装制品") >= 0; }),
    phone: fieldOf(lines, function (t) { return /1591317158/.test(t); }),
    tel: fieldOf(lines, function (t) { return /88809856/.test(t); }),
    email: fieldOf(lines, function (t) { return /sandy\.wu/i.test(t); })
  };
}

function compareNativeOcr(a, b) {
  var la = (a && Array.isArray(a.lines) ? a.lines : []).slice();
  var lb = (b && Array.isArray(b.lines) ? b.lines : []).slice();
  var byOrder = function (l) { var arr = {}; (l || []).forEach(function (x, i) { arr[x.order != null ? x.order : i] = x; }); return arr; };
  var ax = byOrder(la), bx = byOrder(lb);
  var orders = Array.from(new Set(Object.keys(ax).concat(Object.keys(bx)))).map(Number).sort(function (x, y) { return x - y; });
  var changed = [], added = [], removed = [];
  var same = 0, charT = 0, wsT = 0, puncT = 0;
  orders.forEach(function (o) {
    var ra = ax[o] ? ax[o].rawText : null;
    var rb = bx[o] ? bx[o].rawText : null;
    if (ra == null && rb != null) { added.push({ order: o, rawText: rb }); return; }
    if (ra != null && rb == null) { removed.push({ order: o, rawText: ra }); return; }
    if (ra === rb) { same += 1; return; }
    var s = charDiffStat(ra, rb);
    charT += s.total; wsT += s.ws; puncT += s.punc;
    changed.push({ order: o, rawA: ra, rawB: rb, characterDiff: s.total, whitespaceDiff: s.ws, punctuationDiff: s.punc });
  });
  var fA = semanticFields(la), fB = semanticFields(lb);
  return {
    modeA: (a && (a.mode || a.textType)) || null,
    modeB: (b && (b.mode || b.textType)) || null,
    lineCountA: la.length,
    lineCountB: lb.length,
    sameLineCount: same,
    changedLines: changed,
    addedLines: added,
    removedLines: removed,
    characterDiffCount: charT,
    whitespaceDiffCount: wsT,
    punctuationDiffCount: puncT,
    semanticChangedFields: {
      name: fA.name === fB.name,
      company: fA.company === fB.company,
      phone: fA.phone === fB.phone,
      tel: fA.tel === fB.tel,
      email: fA.email === fB.email
    }
  };
}

if (typeof module !== "undefined" && module.exports) module.exports = { compareNativeOcr, charDiffStat, semanticFields };