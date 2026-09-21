// =====================================================================
// 折立印名片套版助手 - Text Run Model（Stage 10-B）
// ---------------------------------------------------------------------
// 纯数据/纯逻辑模块，不持有 DOM / Fabric / OCR 网络。职责：
//   1. makeRun(input)           构造一个 Text Run 数据模型（规格 §六）
//   2. runIdentity(run)         runId = blockFingerprint + charStart + charEnd（§二十二）
//   3. textConservation(runs)   join(runs.text) === nativeText 硬门（§二十四/§二十五）
//   4. unionGeometry(runs)      Run Union 几何（§二十六 Run Geometry Conservation）
//   5. blockFallback(item)      Single Textbox fallback 模型（§十五/§三十八）
//   6. assignRunColor(run,colorEvidence)  颜色集成（§二十八/§二十九）
// 铁律（Stage 10-B §六/§二十二/§二十四/§二十五/§二十六）：
//   - charStart/charEnd 必须来自 Native OCR final text 索引；
//   - runId 禁止使用文字内容作为唯一 identity（重复文字/电话号码/姓名同值）；
//   - join(runs.text) === nativeText 必须完全相等，禁止 trim/collapse 静默改写；
//   - Run Union 与源 Block 几何保持（geometryConservation 供 gate 判定）。
// 纯函数 node 可测；页面世界负责 Native Create/Measure。
// =====================================================================
"use strict";

function isFiniteNumber(v) { return typeof v === "number" && isFinite(v); }

// ---- 1. makeRun：构造一个 Run（±默认 typography 继承父 Block 提议值）----
function makeRun(input) {
  var o = input || {};
  var nativeText = (o.nativeText == null) ? "" : String(o.nativeText);
  var c0 = (o.charStart == null) ? 0 : Math.max(0, Math.floor(o.charStart));
  var c1 = (o.charEnd == null) ? nativeText.length : Math.min(nativeText.length, Math.max(c0, Math.floor(o.charEnd)));
  var text = nativeText.slice(c0, c1);
  var g = o.geometry || {};
  var t = o.typography || {};
  var cc = o.color || {};
  var ev = o.evidence || {};
  var quad = g.quad || null;
  if (!quad && isFiniteNumber(g.left) && isFiniteNumber(g.top) && isFiniteNumber(g.width) && isFiniteNumber(g.height)) {
    quad = [g.left, g.top, g.left + g.width, g.top, g.left + g.width, g.top + g.height, g.left, g.top + g.height];
  }
  var run = {
    blockId: o.blockId != null ? String(o.blockId) : null,
    runId: o.runId != null ? String(o.runId) : null,
    charStart: c0,
    charEnd: c1,
    text: text,
    lineIndex: isFiniteNumber(o.lineIndex) ? o.lineIndex : null,
    geometry: {
      quad: quad,
      left: isFiniteNumber(g.left) ? g.left : null,
      top: isFiniteNumber(g.top) ? g.top : null,
      width: isFiniteNumber(g.width) ? g.width : null,
      height: isFiniteNumber(g.height) ? g.height : null,
      angle: isFiniteNumber(g.angle) ? g.angle : 0
    },
    typography: {
      fontSize: isFiniteNumber(t.fontSize) ? t.fontSize : null,
      fontFamily: t.fontFamily != null ? String(t.fontFamily) : null,
      fontWeight: t.fontWeight != null ? String(t.fontWeight) : null,
      fontStyle: t.fontStyle != null ? String(t.fontStyle) : null,
      lineHeight: isFiniteNumber(t.lineHeight) ? t.lineHeight : null,
      charSpacing: isFiniteNumber(t.charSpacing) ? t.charSpacing : 0
    },
    color: {
      fill: cc.fill != null ? String(cc.fill) : null,
      confidence: isFiniteNumber(cc.confidence) ? cc.confidence : null
    },
    evidence: {
      lineInkHeight: isFiniteNumber(ev.lineInkHeight) ? ev.lineInkHeight : null,
      lineAdvance: isFiniteNumber(ev.lineAdvance) ? ev.lineAdvance : null,
      inkWidth: isFiniteNumber(ev.inkWidth) ? ev.inkWidth : null,
      inkHeight: isFiniteNumber(ev.inkHeight) ? ev.inkHeight : null,
      sizeRatio: isFiniteNumber(ev.sizeRatio) ? ev.sizeRatio : null,
      confidence: isFiniteNumber(ev.confidence) ? ev.confidence : null
    },
    pageId: o.pageId != null ? String(o.pageId) : null,
    side: o.side != null ? String(o.side) : null,
    transactionId: o.transactionId != null ? String(o.transactionId) : null
  };
  if (run.runId == null) run.runId = runIdentity(run);
  return run;
}

// ---- 2. runIdentity：runId = blockFingerprint + charStart + charEnd（§二十二）----
// blockFingerprint 来自调用方（如 item.fingerprint/pageId+side+blockIndex 的稳定哈希）。
// 禁止把文字内容当唯一 identity。
function runIdentity(run) {
  var r = run || {};
  var base = r.blockId != null ? String(r.blockId) : "block";
  return base + ":" + (isFiniteNumber(r.charStart) ? r.charStart : 0) + ":" + (isFiniteNumber(r.charEnd) ? r.charEnd : 0);
}

// ---- 3. textConservation：join(runs.text) === nativeText（§二十四/§二十五）----
// 必须完全相等；任何 trim/collapse/规范化偷改 → false（禁创建）。
function textConservation(runs, nativeText, opts) {
  var runsList = Array.isArray(runs) ? runs.filter(function (r) { return r && typeof r.text === "string"; }) : [];
  // 顺序校验：runs 必须按 charStart 升序且连续覆盖 [0, len)
  var sorted = runsList.slice().sort(function (a, b) { return (a.charStart || 0) - (b.charStart || 0); });
  var joined = sorted.map(function (r) { return r.text; }).join("");
  var expected = nativeText == null ? "" : String(nativeText);
  var ok = joined === expected;
  var detail = { joined: joined, expected: expected, ok: ok, runCount: runsList.length, charTotal: joined.length };
  var cursor = 0, gaps = [];
  sorted.forEach(function (r) {
    if ((r.charStart || 0) !== cursor) gaps.push({ expected: cursor, got: r.charStart || 0, atRun: r.runId || runIdentity(r) });
    cursor = (r.charEnd != null ? r.charEnd : (r.charStart || 0) + String(r.text || "").length);
  });
  detail.ordered = sorted.every(function (r, i) { var p = i === 0 ? 0 : (sorted[i - 1].charEnd || 0); return (r.charStart || 0) === p; });
  detail.gapCount = gaps.length;
  ok = ok && detail.ordered && gaps.length === 0;
  detail.ok = ok;
  return detail;
}

// ---- 4. unionGeometry：Run Union 几何（§二十六）----
// 输入 runs（各自 geometry.quad 为 [x0,y0,x1,y1,x2,y2,x3,y3] 或 left/top/width/height）
// 输出块级 AABB + 视觉 AABB（用于与源 Block 几何对比）。
function unionGeometry(runs) {
  var pts = [];
  (Array.isArray(runs) ? runs : []).forEach(function (r) {
    var q = r && r.geometry && r.geometry.quad;
    if (Array.isArray(q)) { for (var i = 0; i < q.length; i += 2) pts.push([q[i], q[i + 1]]); return; }
    var g = r && r.geometry;
    if (g && isFiniteNumber(g.left) && isFiniteNumber(g.top) && isFiniteNumber(g.width) && isFiniteNumber(g.height)) {
      pts.push([g.left, g.top], [g.left + g.width, g.top], [g.left + g.width, g.top + g.height], [g.left, g.top + g.height]);
    }
  });
  if (!pts.length) return { ok: false, left: null, top: null, width: null, height: null, pointCount: 0 };
  var xs = pts.map(function (p) { return p[0]; });
  var ys = pts.map(function (p) { return p[1]; });
  var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
  var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
  return { ok: true, left: minX, top: minY, width: maxX - minX, height: maxY - minY, pointCount: pts.length };
}

// ---- 5. blockFallback：Single Textbox fallback 模型（§三十八）----
// 返回一个 run（charStart 0 / charEnd len），geometry/typography/color 继承父 block。
function blockFallback(input) {
  var o = input || {};
  var nativeText = (o.nativeText == null) ? "" : String(o.nativeText);
  var g = o.geometry || {};
  var t = o.typography || {};
  var cc = o.color || {};
  return makeRun({
    blockId: o.blockId, runId: o.blockId != null ? String(o.blockId) + ":single" : null,
    nativeText: nativeText, charStart: 0, charEnd: nativeText.length, lineIndex: null,
    geometry: g, typography: t, color: cc,
    evidence: { sizeRatio: 1, confidence: isFiniteNumber(o.fallbackConfidence) ? o.fallbackConfidence : 0.5 },
    pageId: o.pageId, side: o.side, transactionId: o.transactionId
  });
}

// ---- 6. assignRunColor：颜色集成（§二十八/§二十九）----
// 每个 Run 独立拥有 fill；颜色差异必须有独立 image evidence（调用方提供），
// 禁止因为 fontSize 不同自动给不同颜色。
function assignRunColor(run, colorEvidence) {
  var e = colorEvidence || {};
  var next = Object.assign({}, run);
  next.color = Object.assign({}, run.color, {
    fill: e.fill != null ? String(e.fill) : run.color.fill,
    confidence: isFiniteNumber(e.confidence) ? e.confidence : run.color.confidence
  });
  return next;
}

// ---- 导出（node + page-world 双端兼容）----
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    makeRun: makeRun,
    runIdentity: runIdentity,
    textConservation: textConservation,
    unionGeometry: unionGeometry,
    blockFallback: blockFallback,
    assignRunColor: assignRunColor
  };
}