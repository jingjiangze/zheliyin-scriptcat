// =====================================================================
// 折立印名片套版助手 - Text/Geometry 匹配（Stage 9 P3, §十六~§二十一）
// ---------------------------------------------------------------------
// 目标：AltQText + BaiduLayout = TextRegion（§十六/§十七）。
// 优先级（§十八）：pageId → exact/normalized text similarity → 空间顺序 → bbox 相对位置 → 长度。
// 特殊处理：
//   - text 完全不同（AltQ 佛山盛盈… vs Baidu 回册佛山…）→ 用 position/order/bbox/length 辅助匹配，
//     最终 text 恒为 AltQ rawText（§十九/§四十六）。
//   - 一个 Baidu bbox 对应多个 AltQ（one-to-many，§二十）→ 标记 AMBIGUOUS/LINE_SPLIT_SUGGESTED，
//     不盲目复制一个 bbox 给多个 textbox。
//   - 多个相似文本（§二十一）→ 用 order/pageId/source index 做稳定 identity，不用 text===text。
// 纯函数，node 可测；为 Stage 9 P3 契约层（本轮未接线主链）。
// =====================================================================
"use strict";

var MATCH_EXACT_TEXT = "EXACT_TEXT";
var MATCH_POSITION_ORDER = "POSITION_ORDER";
var NOT_MATCHED = "NOT_MATCHED";
var AMBIG_ONE_TO_MANY = "ONE_TO_MANY";

function textKey(s) {
  if (s == null) return "";
  return String(s).toLowerCase().replace(/[\s\u3000\u00a0]+/g, "").trim();
}

// ---- §十八/§二十一：稳定 identity（pageId + order + 文本）----
function identityKey(pageId, order, text, index) {
  return "p:" + (pageId == null ? "-" : pageId) + ":o:" + (order == null ? "-" : order) + ":i:" + (index == null ? "-" : index) + ":t:" + textKey(text).slice(0, 6);
}

// ---- §二十：one-to-many 检测 —— layout 候选 hintText 是否包含多个 altq matchText ----
function detectOneToMany(altqTexts, layoutHint, opts) {
  var o = opts || {};
  var parts = [];
  (Array.isArray(altqTexts) ? altqTexts : []).forEach(function (a, i) {
    if (!a || !a.matchText) return;
    var idx = textKey(layoutHint || "").indexOf(textKey(a.matchText));
    if (idx >= 0) parts.push({ index: i, at: idx, len: a.matchText.length, text: a.rawText });
  });
  var distinct = [];
  parts.forEach(function (p) { if (!distinct.some(function (d) { return d.index === p.index; })) distinct.push(p); });
  return distinct.length >= 2 ? { ambiguous: true, kind: AMBIG_ONE_TO_MANY, parts: distinct } : { ambiguous: false, parts: distinct };
}

// ---- 主匹配器 ----
// altqTexts: [{id,rawText,matchText,order,pageId?}]（§三）
// layouts: [{id,pageId,hintText,bbox,geometry,confidence}]（§十五）
// out: { regions:[TextRegion], unmatchedAltQ:[...], unmatchedBaidu:[...], ambiguousMatches:[...] }
function matchTextGeometry(altqTexts, layouts, opts) {
  var o = opts || {};
  var page = o.pageId != null ? o.pageId : null;
  var altq = (Array.isArray(altqTexts) ? altqTexts : []).slice();
  var la = (Array.isArray(layouts) ? layouts : []).slice();
  var pageSkippedA = [], pageSkippedL = [];
  if (page != null) {
    // §十八/§五十五：跨 page 数据绝不参与匹配，并如实记为 unmatched（隔离审计）
    var keepA = [], keepL = [];
    altq.forEach(function (a) { if (a.pageId == null || a.pageId === page) keepA.push(a); else pageSkippedA.push(a.rawText); });
    la.forEach(function (l) { if (l.pageId == null || l.pageId === page) keepL.push(l); else pageSkippedL.push({ id: l.id, hint: l.hintText }); });
    altq = keepA; la = keepL;
  }
  var usedA = {}, usedL = {};
  var regions = [];
  var ambiguousMatches = [];
  // 第一优先：exact text（normalized 后相同）
  altq.forEach(function (a, ai) {
    if (usedA[ai]) return;
    var hit = -1;
    for (var li = 0; li < la.length; li += 1) {
      if (usedL[li]) continue;
      if (textKey(a.matchText) !== "" && textKey(a.matchText) === textKey(la[li].hintText)) { hit = li; break; }
    }
    if (hit >= 0) {
      usedA[ai] = 1; usedL[hit] = 1;
      regions.push(mkRegion(a, la[hit], 1, MATCH_EXACT_TEXT, false));
    }
  });
  // 第二优先：position/order（未匹配项按 y→x 排序后按序配对；text 恒取 AltQ）
  var restA = altq.map(function (a, i) { return { a: a, i: i }; }).filter(function (x) { return !usedA[x.i]; });
  var restL = la.map(function (l, i) { return { l: l, i: i }; }).filter(function (x) { return !usedL[x.i]; });
  // 按空间顺序排序（top→bottom, left→right）
  restA.sort(function (x, y) { var ax = bboxOf(x.a).center, ay = bboxOf(y.a).center; return (ax.y - ay.y) || (ax.x - ay.x); });
  restL.sort(function (x, y) { var bx = geometryOf(x.l).center, by = geometryOf(y.l).center; return (bx.y - by.y) || (bx.x - by.x); });
  var maxRegion = Math.max(restA.length, restL.length);
  for (var k = 0; k < maxRegion; k += 1) {
    if (restA[k] && restL[k]) {
      usedA[restA[k].i] = 1; usedL[restL[k].i] = 1;
      // 检查 one-to-many：该 layout 的 hint 是否还命中其他 altq
      var om = detectOneToMany(altq.filter(function (a, i) { return !usedA[i]; }).concat([restA[k].a]), restL[k].l.hintText, {});
      regions.push(mkRegion(restA[k].a, restL[k].l, 0.8, MATCH_POSITION_ORDER, om.ambiguous));
      if (om.ambiguous) ambiguousMatches.push({ baiduId: restL[k].l.id, key: om.kind, parts: om.parts });
    } else if (restA[k]) { usedA[restA[k].i] = 1; }
  }
  var unmatchedAltQ = [].concat(pageSkippedA);
  altq.forEach(function (a, i) { if (!usedA[i]) unmatchedAltQ.push(a.rawText); });
  var unmatchedBaidu = [].concat(pageSkippedL);
  la.forEach(function (l, i) { if (!usedL[i]) unmatchedBaidu.push({ id: l.id, hint: l.hintText }); });
  return { regions: regions, unmatchedAltQ: unmatchedAltQ, unmatchedBaidu: unmatchedBaidu, ambiguousMatches: ambiguousMatches };
}

function bboxOf(a) { return (a && a.nativeBBox) || { center: { x: 0, y: 0 } }; }
function geometryOf(l) { return (l && l.geometry) || { center: { x: 0, y: 0 } }; }

function mkRegion(a, l, score, method, ambiguousFlag) {
  var r = {
    id: "tr-" + (a.id != null ? a.id : "a") + "-" + (l.id != null ? l.id : "l"),
    text: a.rawText,
    textSource: "ALT_Q",
    geometrySource: "BAIDU",
    textEvidence: { altqId: a.id, altqRawText: a.rawText, altqMatchText: a.matchText },
    geometryEvidence: { baiduId: l.id, bbox: l.bbox, confidence: l.confidence },
    match: { score: score, method: method, ambiguous: !!ambiguousFlag },
    pageId: null
  };
  if (a.pageId != null) r.pageId = a.pageId;
  if (l.pageId != null) r.pageId = l.pageId;
  return r;
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  matchTextGeometry, detectOneToMany, textKey, identityKey,
  MATCH_EXACT_TEXT, MATCH_POSITION_ORDER, NOT_MATCHED, AMBIG_ONE_TO_MANY
};