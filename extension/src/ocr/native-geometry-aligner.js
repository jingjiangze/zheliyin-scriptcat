// =====================================================================
// 折立印名片套版助手 - Native/Geometry Aligner（OCR-P0.3, §7~§13）
// ---------------------------------------------------------------------
// 定位：Native OCR = 文字真值（无 bbox）；Baidu/Local = Geometry Evidence。
// 本模块是「Text/Geometry Alignment」的唯一实现：把 native 行与几何候选
// 多因素匹配，输出完整性审计字段（§13），为 Completeness Gate（OCR-P0.3-E）
// 提供输入。
// 硬规则：
//   - 禁止按 index 一对一配对（旧 applyNativeTextTruth 的 bs[i]↔ns[i]，
//     OCR-P0.3-A）；必须多因素匹配。
//   - 支持一对多 / 多对一（OCR-P0.3-B）：native 行「张三 董事长」 ↔
//     baidu 两行「张三」「董事长」，反之亦然。
//   - Geometry Provider 只提供 position/bbox/rotation/line grouping，
//     绝不提供 textbox.text（OCR-P0.3-C）。
//   - 匹配不中 → unmatchedNative / unusedGeometry，交由上层判定
//     NATIVE_GEOMETRY_UNRESOLVED / NATIVE_GEOMETRY_INCOMPLETE（OCR-P0.3-D/E）。
// 纯函数，node 可测。
// =====================================================================
"use strict";

// ---- 文本归一（对齐用）----
function normKey(s) {
  if (s == null) return "";
  return String(s).toLowerCase().replace(/[\s\u3000\u00a0]+/g, "").replace(/[·•．。，,、；;'"“”‘’（）()【】\[\]《》<>:：-]/g, "");
}

// ---- 字符类型（CJK / Latin / digit / mixed / empty）----
function scriptType(s) {
  var t = String(s == null ? "" : s);
  var cjk = 0, latin = 0, digit = 0;
  for (var i = 0; i < t.length; i += 1) {
    var c = t.charCodeAt(i);
    if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3040 && c <= 0x30ff)) cjk += 1;
    else if (c >= 0x30 && c <= 0x39) digit += 1;
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) latin += 1;
    else if (c > 0x20 && c !== 0x2e && c !== 0x3a && c !== 0x2d && c !== 0x40 && c !== 0x2f) latin += 1;
  }
  if (!t.trim()) return "empty";
  if (cjk && !latin && !digit) return "cjk";
  if (latin && !cjk && !digit) return "latin";
  if (digit && !cjk && !latin) return "digit";
  return "mixed";
}

// ---- 文本相似度（0..1）----
// 1.0 normalized 完全一致；0.8 一方包含另一方（长侧>=3）；否则字符重叠率。
function textSimilarity(a, b) {
  var ka = normKey(a), kb = normKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  var longer = ka.length >= kb.length ? ka : kb;
  var shorter = ka.length >= kb.length ? kb : ka;
  if (shorter.length >= 3 && longer.indexOf(shorter) >= 0) return 0.8;
  var set = {};
  for (var i = 0; i < longer.length; i += 1) set[longer[i]] = 1;
  var hit = 0;
  for (var j = 0; j < shorter.length; j += 1) if (set[shorter[j]]) hit += 1;
  return hit / longer.length;
}

// ---- bbox 中心/几何聚合 ----
function boxCenter(b) {
  if (!b) return { x: 0, y: 0 };
  var x = typeof b.x === "number" ? b.x : (typeof b.x0 === "number" ? b.x0 : 0);
  var y = typeof b.y === "number" ? b.y : (typeof b.y0 === "number" ? b.y0 : 0);
  var w = typeof b.width === "number" ? b.width : ((typeof b.x1 === "number" && typeof b.x0 === "number") ? Math.abs(b.x1 - b.x0) : 0);
  var h = typeof b.height === "number" ? b.height : ((typeof b.y1 === "number" && typeof b.y0 === "number") ? Math.abs(b.y1 - b.y0) : 0);
  return { x: x + w / 2, y: y + h / 2 };
}
function boxYOrder(b) { return boxCenter(b).y; }
function boxXOrder(b) { return boxCenter(b).x; }

// ---- 规范化 geometry candidate（吸收 BAIDU / LOCAL / unified 候选）----
// g: { text?, bbox{x,y,width,height}|{x0,y0,x1,y1}, words?:[{text?, bbox}], sourceProvider? }
function toGeometry(item) {
  var b = item && item.bbox;
  return {
    sourceProvider: (item && (item.sourceProvider || item.provider)) || "BAIDU",
    text: item && item.text != null ? String(item.text) : null,
    bbox: b || null,
    bboxCenter: boxCenter(b),
    words: Array.isArray(item && item.words) ? (item.words || []).map(toGeometry) : null
  };
}

// ---- 子串配对：判断 native 行是否被 geometry 行包含（one-to-many 的 reverse）----
function containsLine(containerGeometry, nativeLine) {
  var ck = normKey(containerGeometry.text);
  var nk = normKey(nativeLine.rawText);
  if (!ck || !nk) return false;
  if (ck === nk) return true;
  return nk.length >= 2 && ck.indexOf(nk) >= 0;
}

// ---- 构建 geometry 图谱：行内 words 作为 sub-candidates（Baidu word geometry，§10 搜索链第 2 位）----
function expandGeometryWords(geo) {
  if (!geo.words || !geo.words.length) return null;
  return geo.words.filter(function (w) { return w && w.bbox && w.text; });
}

// ---- 主入口：Native 行 ↔ Geometry 候选 多因素匹配 ----
// nativeTexts: [{ id?, rawText, matchText?, order?, bbox:null }]
// geometries: [{ text?, bbox, words?, sourceProvider? }]
// out: {
//   matchedNative:  [ { native: line, geometry: geo, match: {score, factors:[...]}, oneToMany:false } ]
//   matchedGeometry:[ geo（按匹配次序）]        —— 每个 geometry 最多被用一次
//   unmatchedNative:[ line ]                  —— Native 有、几何无（OCR-P0.3-C/D）
//   unusedGeometry:[ geo ]                    —— 几何有、Native 无（审计 §13）
//   gate: { totalNative, geometryCandidates, matched, unmatchedNative, matchedGeometry, unusedGeometry, oneToMany, manyToOne }
// }
function alignNativeGeometry(nativeTexts, geometries, opts) {
  var o = opts || {};
  var ns = (Array.isArray(nativeTexts) ? nativeTexts : []).slice();
  var gs = (Array.isArray(geometries) ? geometries : []).map(toGeometry);
  // 匹配前先按 y 序（阅读序）稳定排序 —— 供「geometry Y 顺序」因素使用（§8 factor 4）
  ns.sort(function (a, b) { return (a.order != null ? a.order : 0) - (b.order != null ? b.order : 0); });
  gs.sort(function (a, b) { return boxYOrder(a.bbox) - boxYOrder(b.bbox) || boxXOrder(a.bbox) - boxXOrder(b.bbox); });

  var matchedNative = [];
  var matchedGeoIdx = {};
  var unmatchedNative = [];
  var oneToManyHits = [];
  var usedNativeIdx = {};

  // ---- Phase 1：exact normalized text（factor 1 主导；几何行 text 可用时）----
  ns.forEach(function (n, ni) {
    if (usedNativeIdx[ni]) return;
    var best = null, bestScore = 0;
    gs.forEach(function (g, gi) {
      if (matchedGeoIdx[gi]) return;
      if (g.text == null) return;
      var sim = textSimilarity(n.rawText, g.text);
      var st = scriptType(n.rawText) === scriptType(g.text) ? 1 : 0;         // factor 3
      var len = Math.abs(String(n.rawText).length - String(g.text).length) <= 2 ? 1 : 0; // factor 2
      var score = sim * 3 + st * 0.5 + len * 0.3;
      if (score > bestScore) { bestScore = score; best = { gi: gi, score: score, sim: sim, st: st, len: len }; }
    });
    if (best && best.sim >= 1) {
      matchedGeoIdx[best.gi] = 1;
      usedNativeIdx[ni] = 1;
      matchedNative.push({
        native: n, geometry: gs[best.gi],
        match: { score: bestScore, method: "EXACT_TEXT", factors: ["text-sim=1.0", "type=" + (best.st ? "same" : "diff"), "len=" + (best.len ? "ok" : "diff")] }
      });
    }
  });

  // ---- Phase 2：one-to-many —— native 行被多个 geometry 行拆分覆盖（§9）----
  // native「张三 董事长」→ 两行 geo「张三」「董事长」：先按 y 序聚合相邻 geo 行的文本，
  // 合并后与 native 行比对；命中 → 该 native 用一个「合成 geometry」承载各子行。
  var remainingG = [];
  gs.forEach(function (g, gi) {
    if (!matchedGeoIdx[gi]) remainingG.push({ geo: g, idx: gi });
  });
  ns.forEach(function (n, ni) {
    if (usedNativeIdx[ni]) return;
    var nk = normKey(n.rawText);
    if (!nk) return;
    // 尝试相邻 geo 行连续拼接（y 序紧邻）
    var limit = Math.min(remainingG.length, 4);
    var found = null;
    for (var w = 2; w <= limit; w += 1) {
      for (var sIdx = 0; sIdx + w <= remainingG.length; sIdx += 1) {
        var win = remainingG.slice(sIdx, sIdx + w);
        var joined = normKey(win.map(function (x) { return x.geo.text || ""; }).join(""));
        if (joined === nk || (nk.length >= 3 && joined.indexOf(nk) >= 0)) {
          // 窗口内 geo 必须未被使用
          var free = win.every(function (x) { return !matchedGeoIdx[x.idx]; });
          if (!free) continue;
          found = win; break;
        }
      }
      if (found) break;
    }
    if (found) {
      found.forEach(function (x) { matchedGeoIdx[x.idx] = 1; });
      usedNativeIdx[ni] = 1;
      matchedNative.push({
        native: n,
        geometry: { synthetic: true, bbox: unionBox(found.map(function (x) { return x.geo.bbox; })), parts: found.map(function (x) { return x.geo; }) },
        match: { score: 1, method: "ONE_TO_MANY_LINES", factors: ["y-adjacent=" + found.length, "joined-text"] }
      });
      oneToManyHits.push({ native: n.rawText, geometryCount: found.length });
    }
  });

  // ---- Phase 3：many-to-one —— 多 native 行对应一个 geometry 行（聚合文本）----
  // native 两行「张三」「董事长」↔ geo 一行「张三 董事长」：单 geo 无法拆两行位置，
  // 此时按 y 序把 native 行绑定到同一 geo 并标记 METHOD=MANY_TO_ONE_SHARED（不拆分伪造位置）。
  remainingG = [];
  gs.forEach(function (g, gi) { if (!matchedGeoIdx[gi]) remainingG.push({ geo: g, idx: gi }); });
  var restN = [];
  ns.forEach(function (n, ni) { if (!usedNativeIdx[ni]) restN.push({ n: n, idx: ni }); });
  remainingG.forEach(function (gi) {
    var g = gi.geo;
    if (g.text == null) return;
    // geo 文本聚合了多行 native？取 y 序最近的 native 集合（最多 3 行），看并联文本包含度
    var anchor = gi;
    // 该 geo 文本与某个 native 行 exact 已处理；此处处理「geo 文本包含多个 native」：
    var candidates = restN.filter(function (x) { return !usedNativeIdx[x.idx] && containsLine(g, x.n); });
    if (candidates.length >= 2) {
      candidates.sort(function (a, b) { return (a.n.order != null ? a.n.order : 0) - (b.n.order != null ? b.n.order : 0); });
      matchedGeoIdx[gi.idx] = 1;
      candidates.forEach(function (c) {
        usedNativeIdx[c.idx] = 1;
        matchedNative.push({
          native: c.n, geometry: g,
          match: { score: 0.8, method: "MANY_TO_ONE_SHARED", factors: ["shared-geometry", "contained-text", "y-order"] }
        });
      });
    }
  });

  // ---- Phase 4：剩余按多因素贪心（禁止 index-only；必须命中 ≥2 因素）----
  remainingG = [];
  gs.forEach(function (g, gi) { if (!matchedGeoIdx[gi]) remainingG.push({ geo: g, idx: gi }); });
  var finalUnmatchedN = [];
  ns.forEach(function (n, ni) {
    if (usedNativeIdx[ni]) return;
    var best = null, bestScore = 0;
    remainingG.forEach(function (gi) {
      var g = gi.geo;
      var sText = g.text != null ? textSimilarity(n.rawText, g.text) : 0;       // factor 1
      var sLen = g.text != null ? (Math.abs(String(n.rawText).length - String(g.text).length) <= 2 ? 1 : 0) : 0.5; // factor 2
      var sType = scriptType(n.rawText) === scriptType(g.text) ? 1 : (g.text ? 0 : 0.5); // factor 3
      // factor 4/5：geometry Y/X 顺序 —— 剩余集合中该 geo 的顺序接近 native 顺序
      var nOrder = (n.order != null ? n.order : 0);
      var gOrder = o.geometryOrder != null ? o.geometryOrder : g.yIndex != null ? g.yIndex : 0;
      var sOrder = Math.abs(nOrder - gOrder) <= 1 ? 0.6 : 0;
      var score = sText * 2 + sLen * 0.4 + sType * 0.4 + sOrder * 0.6;
      if (score > bestScore) { bestScore = score; best = { gIdx: gi.idx, geo: gi.geo, score: score, sText: sText, sLen: sLen, sType: sType, sOrder: sOrder }; }
    });
    // 因素门槛（OCR-P0.3-A 硬规则）：text-sim >= 0.8（相等/包含级）且至少 1 个辅助因素，
    // 拒绝短文本单字符重叠被宽松阈值误配（禁止放宽阈值掩盖 geometry 错误）。
    if (best && best.sText >= 0.8 && (best.sLen > 0 || best.sType > 0)) {
      matchedGeoIdx[best.gIdx] = 1;
      usedNativeIdx[ni] = 1;
      matchedNative.push({
        native: n, geometry: best.geo,
        match: { score: best.score, method: "MULTI_FACTOR", factors: ["text-sim=" + best.sText.toFixed(2), "len=" + best.sLen, "type=" + best.sType, "y-order=" + best.sOrder] }
      });
    }
  });

  // ---- 汇总 ----
  ns.forEach(function (n, ni) { if (!usedNativeIdx[ni]) unmatchedNative.push(n); });
  var matchedGeometry = [];
  var unusedGeometry = [];
  gs.forEach(function (g, gi) {
    if (matchedGeoIdx[gi]) matchedGeometry.push(g); else unusedGeometry.push(g);
  });
  // one-to-many 的反向：matchedNative 中 synthetic parts 计数
  var manyToOne = matchedNative.filter(function (m) { return m.match.method === "MANY_TO_ONE_SHARED"; }).length;

  var gate = {
    totalNative: ns.length,
    geometryCandidates: gs.length,
    matched: matchedNative.length,
    unmatchedNative: unmatchedNative.length,
    matchedGeometry: matchedGeometry.length,
    unusedGeometry: unusedGeometry.length,
    oneToMany: oneToManyHits.length,
    manyToOne: manyToOne
  };
  return { matchedNative: matchedNative, matchedGeometry: matchedGeometry, unmatchedNative: unmatchedNative, unusedGeometry: unusedGeometry, oneToManyHits: oneToManyHits, gate: gate };
}

function unionBox(boxes) {
  var xs = [], ys = [];
  (boxes || []).forEach(function (b) {
    if (!b) return;
    var x = typeof b.x === "number" ? b.x : b.x0, y = typeof b.y === "number" ? b.y : b.y0;
    var x2 = typeof b.width === "number" ? x + b.width : (typeof b.x1 === "number" ? b.x1 : x);
    var y2 = typeof b.height === "number" ? y + b.height : (typeof b.y1 === "number" ? b.y1 : y);
    if (typeof x === "number") xs.push(x, x2);
    if (typeof y === "number") ys.push(y, y2);
  });
  if (!xs.length || !ys.length) return null;
  var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
  var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY, union: true };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  alignNativeGeometry, textSimilarity, scriptType, normKey, boxCenter, unionBox, containsLine, toGeometry
};