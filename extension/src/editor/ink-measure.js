// =====================================================================
// 折立印名片套版助手 - Rendered Ink 实测（Stage 8D P6-1）
// ---------------------------------------------------------------------
// 目标：建立 Source / Target / Actual 三层数据（§二十一）：
//   Source = OCR bbox（调用方提供，image→canvas 像素）
//   Target = geometry/text-fit 目标（layoutWidth / boxHeight / fontSize）
//   Actual = Native textbox 实际渲染 ink —— 像素级 alpha bbox 实测（透明画布 fillText 后 getImageData）
// 职责边界：纯诊断测量。本模块**不得**改变创建/字号/宽度/融合任何行为；
//   测量结果仅写入 diagnostics / 取证，供后续决定尺寸模型是否调整（不预先改 fusion）。
// 兼容：node 单测可测纯函数核（computeAlphaInkBounds / buildInkDiagnostics / fontDeclaration / resolveLines）；
//   canvas 渲染分支仅在页面 world 可用（无 document → 返回 {ok:false, reason:NO_CANVAS}，不抛异常）。
// =====================================================================
"use strict";

var INK_OK = "OK";
var INK_NO_CANVAS = "NO_CANVAS";
var INK_NO_CTX = "NO_CTX";
var INK_EMPTY = "EMPTY_RENDER";
var INK_NO_TEXT = "NO_TEXT";
var INK_NO_OBJECT = "NO_OBJECT";

// ---- 纯函数：alpha bbox（ImageData.data：Uint8ClampedArray RGBA；alpha>0 视为 ink）----
// 返回 { inkLeft, inkTop, inkRight, inkBottom, inkWidth, inkHeight, alphaPixels }
// 无 ink 像素 → null
function computeAlphaInkBounds(width, height, data) {
  if (!(width > 0) || !(height > 0) || !data || !(data.length >= width * height * 4)) return null;
  var minX = width, minY = height, maxX = -1, maxY = -1, count = 0;
  for (var y = 0; y < height; y += 1) {
    var row = y * width;
    for (var x = 0; x < width; x += 1) {
      if (data[(row + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        count += 1;
      }
    }
  }
  if (!count) return null;
  return { inkLeft: minX, inkTop: minY, inkRight: maxX, inkBottom: maxY, inkWidth: maxX - minX + 1, inkHeight: maxY - minY + 1, alphaPixels: count };
}

// ---- 字体声明串：与 Fabric Text._getFontDeclaration 的组合语义一致（style weight sizePx family）----
function fontDeclaration(o) {
  var fs = (o && typeof o.fontSize === "number" && o.fontSize > 0) ? o.fontSize : 16;
  var style = (o && o.fontStyle) ? String(o.fontStyle) : "normal";
  var weight = (o && o.fontWeight) ? String(o.fontWeight) : "normal";
  var family = (o && typeof o.fontFamily === "string" && o.fontFamily.trim()) ? o.fontFamily : "sans-serif";
  return style + " " + weight + " " + fs + "px " + family;
}

// ---- 取对象的实际渲染行（优先 fabric _textLines；无则按 \n 拆分；再无则为单行）----
function resolveLines(obj) {
  if (obj && Array.isArray(obj._textLines) && obj._textLines.length) {
    return obj._textLines
      .map(function (l) { return Array.isArray(l) ? l.join("") : String(l); })
      .filter(function (t) { return t !== ""; });
  }
  var text = (obj && typeof obj.text === "string") ? obj.text : "";
  if (!text) return [];
  var lines = text.split("\n").filter(function (t) { return t !== ""; });
  return lines.length ? lines : [text];
}

// ---- 页面 world：透明画布渲染文本 → alpha bbox（Actual rendered ink；多行按行高逐行绘制）----
// input: { text, fontFamily?, fontSize?, fontWeight?, fontStyle?, lineHeight?, charSpacing? }
// 也能接受 fabric 文本对象（含 _textLines），字段缺省从对象属性取。
function measureRenderedInk(opts) {
  var o = Object.assign({}, opts || {});
  try {
    if (typeof document === "undefined") return { ok: false, reason: INK_NO_CANVAS };
    var lines = resolveLines(o);
    if (!lines.length) return { ok: false, reason: INK_NO_TEXT, fontSize: o.fontSize || null };
    var fs = (typeof o.fontSize === "number" && o.fontSize > 0) ? o.fontSize : 16;
    var lineH = (typeof o.lineHeight === "number" && o.lineHeight > 0) ? o.lineHeight : 1.16;
    var probe = document.createElement("canvas");
    probe.width = 64; probe.height = 64;
    var pctx = probe.getContext("2d");
    var maxW = 0;
    if (pctx) {
      pctx.font = fontDeclaration(o);
      for (var i = 0; i < lines.length; i += 1) {
        var wl = pctx.measureText(lines[i]);
        if (wl && typeof wl.width === "number" && wl.width > maxW) maxW = wl.width;
      }
    }
    var pad = Math.max(2, Math.ceil(fs * 0.9));
    var W = Math.min(8192, Math.max(16, Math.ceil(maxW) + pad * 2));
    var H = Math.min(8192, Math.max(16, Math.ceil(lines.length * fs * lineH) + pad * 3));
    var canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { ok: false, reason: INK_NO_CTX, width: W, height: H };
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#000000";
    // charSpacing：近似映射为 CSS letter-spacing（Fabric charSpacing 语义近似）；
    // 真机默认 0，此项仅对非零场景作近似记录，不参与创建。
    if (typeof o.charSpacing === "number" && o.charSpacing !== 0) {
      try { ctx.letterSpacing = o.charSpacing + "px"; } catch (eLetter) {}
    }
    var cursorY = pad + fs - Math.max(0, (fs * lineH - fs) / 2);
    for (var li = 0; li < lines.length; li += 1) {
      if (!lines[li]) { cursorY += fs * lineH; continue; }
      ctx.font = fontDeclaration(o);
      ctx.fillText(lines[li], pad, cursorY, W - pad * 2);
      cursorY += fs * lineH;
    }
    var img = ctx.getImageData(0, 0, W, H);
    var b = computeAlphaInkBounds(W, H, img.data);
    if (!b) return { ok: false, reason: INK_EMPTY, width: W, height: H, fontSize: fs, fontUsed: ctx.font, lineCount: lines.length };
    return {
      ok: true,
      inkLeft: b.inkLeft, inkTop: b.inkTop, inkRight: b.inkRight, inkBottom: b.inkBottom,
      inkWidth: b.inkWidth, inkHeight: b.inkHeight, alphaPixels: b.alphaPixels,
      canvasWidth: W, canvasHeight: H, fontSize: fs, fontUsed: ctx.font,
      lineCount: lines.length, lineHeight: lineH,
      method: "CANVAS_TEXT"
    };
  } catch (e) {
    return { ok: false, reason: "MEASURE_ERR:" + String(e && e.message || e).slice(0, 90) };
  }
}

// ---- 对 Native fabric 文本对象直接测量（readNew 取证用；取对象实际属性与 _textLines）----
function measureFabricObjectInk(obj) {
  if (!obj) return { ok: false, reason: INK_NO_OBJECT };
  try {
    var s = {};
    ["fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "charSpacing", "text"].forEach(function (k) {
      if (obj[k] != null) s[k] = obj[k];
    });
    if (!s.text) s.text = resolveLines(obj).join("\n");
    var r = measureRenderedInk(s);
    if (r && r.ok) r.method = "FABRIC_OBJECT_LINES";
    return r;
  } catch (e) {
    return { ok: false, reason: "OBJECT_ERR:" + String(e && e.message || e).slice(0, 90) };
  }
}

// ---- 纯函数：Source/Target/Actual 三层对比（仅汇总/打标，不做任何创建决策）----
// input:
//   source: { width, height } | null   —— OCR bbox（canvas 像素）
//   target: { width, height, fontSize } | null —— geometry/text-fit 目标
//   actual: { inkWidth, inkHeight, ... } | null —— measureRenderedInk 结果
// out:
//   { source, target, actual, inkGap, sourceTargetRatio, inkTargetRatio, flags, status }
function buildInkDiagnostics(input) {
  var o = input || {};
  var src = (o.source && typeof o.source.width === "number") ? { width: o.source.width, height: typeof o.source.height === "number" ? o.source.height : null } : null;
  var tgt = (o.target && typeof o.target.width === "number") ? { width: o.target.width, height: typeof o.target.height === "number" ? o.target.height : null, fontSize: typeof o.target.fontSize === "number" ? o.target.fontSize : null } : null;
  var act = (o.actual && o.actual.ok && typeof o.actual.inkWidth === "number") ? { inkWidth: o.actual.inkWidth, inkHeight: o.actual.inkHeight } : null;
  var flags = [];
  var inkGap = null;
  var inkTargetRatio = null;
  if (act && tgt) {
    inkGap = { width: Math.round((tgt.width - act.inkWidth) * 100) / 100, height: tgt.height != null ? Math.round((tgt.height - act.inkHeight) * 100) / 100 : null };
    inkTargetRatio = { width: Math.round((act.inkWidth / tgt.width) * 1000) / 1000, height: tgt.height != null ? Math.round((act.inkHeight / tgt.height) * 1000) / 1000 : null };
    if (act.inkWidth > tgt.width + 1) flags.push("INK_WIDER_THAN_TARGET");
    if (tgt.height != null && act.inkHeight > tgt.height + 1) flags.push("INK_TALLER_THAN_TARGET");
    if (tgt.height != null && act.inkHeight < tgt.height * 0.5) flags.push("INK_HEIGHT_UNDERSHOOT");
  }
  var sourceTargetRatio = null;
  if (src && tgt && tgt.width > 0) {
    sourceTargetRatio = { width: Math.round((src.width / tgt.width) * 1000) / 1000, height: (src.height != null && tgt.height != null && tgt.height > 0) ? Math.round((src.height / tgt.height) * 1000) / 1000 : null };
  }
  if (!act) flags.push("INK_MISSING");
  if (!tgt) flags.push("NO_TARGET");
  var status = "INK_READY";
  if (!act) status = "INK_MISSING";
  else if (!tgt) status = "NO_TARGET";
  return { source: src, target: tgt, actual: act, inkGap: inkGap, sourceTargetRatio: sourceTargetRatio, inkTargetRatio: inkTargetRatio, flags: flags, status: status };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  computeAlphaInkBounds, fontDeclaration, resolveLines, measureRenderedInk, measureFabricObjectInk, buildInkDiagnostics,
  INK_OK, INK_NO_CANVAS, INK_NO_CTX, INK_EMPTY, INK_NO_TEXT, INK_NO_OBJECT
};

// 页面 world 暴露（runner readNew 页面 evaluate 直接调用；node 下 window 未定义则跳过）
if (typeof window !== "undefined") {
  window.__zy8dInk = {
    computeAlphaInkBounds: computeAlphaInkBounds,
    fontDeclaration: fontDeclaration,
    resolveLines: resolveLines,
    measureRenderedInk: measureRenderedInk,
    measureFabricObjectInk: measureFabricObjectInk,
    buildInkDiagnostics: buildInkDiagnostics
  };
}