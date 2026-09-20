// runtime/stage9/multiline-typography-audit.js — Stage 9 Commit 8：Multiline Typography + Native Image Fallback 真机审计
// ---------------------------------------------------------------------
// 模板 1234075（默认）。页面世界内联 image-space / image-containment / multiline-typography / ink-measure（唯一事实 = node 侧同源文件）。
// 采集：
//   A per-line ImageInk（3 行真实区块）→ median → 字号求解（vs whole-block 反证）
//   C 多行 drawText → describeLineQuads/synthesizeTextLayout（canvas line quads → 唯一 textbox，记录 evidence）
//   D 创建后 measureFabricObjectInk → _textLines renderedLineCount vs sourceLineCount + placement/fontSize error
//   E Native text-to-image 能力五层审计（L1 UI / L2 Event / L3 Network / L4 Module / L5 Object）→ verdict
//   F Native 最小字号证据（drawText fontSize 2/6/20 → 实际渲染/测量）
// 只读为主；创建的 probe textbox 立即清理恢复。凭据：ZY_STAGE9_COOKIE 仅运行时注入（本 Commit 不需要 Baidu）。
// 报告：runtime/reports/stage-9/multiline-typography.json（version=0.3.11.48）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("../../node_modules/playwright");
const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const EXT_ID = "ndcooeababalnlpkfedmmbbbgkljhpjf";
const USERSCRIPT_PATH = path.join(ROOT, "zheliyin-card-assistant.user.js");
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-9");
const adapter = require("../scriptcat-adapter");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const DEFAULT_URL = "https://diy.zheliyin.com/diyWeb/third/1234075/2114747/999/thirdDiyAdd.do";
const URL = process.env.ZY_URL || DEFAULT_URL;
const COOKIE_RAW = process.env.ZY_STAGE9_COOKIE || "";
const USERSCRIPT_VERSION = (/\/\/ @version\s+([\d.]+)/.exec(fs.readFileSync(USERSCRIPT_PATH, "utf8")) || [])[1] || "unknown";

function parseCookies(raw) {
  const out = [];
  String(raw || "").split(";").forEach((part) => {
    const eq = part.indexOf("=");
    if (eq <= 0) return;
    const name = part.slice(0, eq).trim();
    let value = part.slice(eq + 1).trim();
    if (!name || !value) return;
    value = value.replace(/^"|"$/g, "");
    out.push({ name, value, domain: ".diy.zheliyin.com", path: "/", expires: -1 });
  });
  return out;
}
function selfTest() {
  const t = (n, c) => { if (!c) throw new Error("SELFTEST FAIL " + n); console.log("[selftest] PASS " + n); };
  t("cookie-parse", parseCookies("a=1; b=2; c").length === 2);
  t("version-48", USERSCRIPT_VERSION === "0.3.11.48");
  const MT = require(path.join(ROOT, "extension", "src", "editor", "multiline-typography.js"));
  t("median-22", MT.medianLineInk([22, 21, 22]) === 22);
  t("median-not-wholeblock", MT.solveMedianInkFontSize(MT.medianLineInk([22, 21, 22])) !== MT.solveMedianInkFontSize(44));
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }
if (!COOKIE_RAW) console.warn("[multiline-typography] 未注入 ZY_STAGE9_COOKIE —— 回退持久 profile（可能过期）；cookiePresent=false");

const PAGE_MODULES = [
  fs.readFileSync(path.join(ROOT, "extension", "src", "editor", "image-space.js"), "utf8"),
  fs.readFileSync(path.join(ROOT, "extension", "src", "editor", "image-containment.js"), "utf8"),
  fs.readFileSync(path.join(ROOT, "extension", "src", "editor", "multiline-typography.js"), "utf8"),
  fs.readFileSync(path.join(ROOT, "extension", "src", "editor", "ink-measure.js"), "utf8")
].join("\n;\n");
const RESOLVE_ENTRY = `
function resolveEntry8() {
  const req = window.requirejs || window.require;
  const ctx = req && req.s && req.s.contexts && req.s.contexts._;
  const defs = (ctx && ctx.defined) || {};
  const CV = defs.CanvasObjVO || window.CanvasObjVO || null;
  if (!CV || !Array.isArray(CV.totalCanvasArray)) return { ok: false, reason: "no-canvasobjvo" };
  const total = CV.totalCanvasArray;
  if (!total.length) return { ok: false, reason: "empty-totalCanvasArray" };
  const unwrap = (v) => { if (!v) return null; if (typeof v.getObjects === "function") return v; return (v && v.canvas) || null; };
  let idx = -1;
  const CC = defs.CurrentCanvas || window.CurrentCanvas || null;
  if (CC && typeof CC.getCurrentCanvas === "function") { try { const cur = unwrap(CC.getCurrentCanvas()); if (cur) { for (let i = 0; i < total.length; i += 1) { if (unwrap(total[i]) === cur) { idx = i; break; } } } } catch (e) {} }
  if (idx < 0 && typeof CV.currentCanvasNum === "number" && CV.currentCanvasNum >= 1 && CV.currentCanvasNum <= total.length) idx = CV.currentCanvasNum - 1;
  if (idx < 0 && total.length === 1) idx = 0;
  if (idx < 0) return { ok: false, reason: "unresolved-current" };
  const entry = total[idx];
  const canvas = unwrap(entry) || null;
  return { ok: true, idx: idx, entry: entry, canvas: canvas, canvasDiy: (entry && typeof entry.drawText === "function") ? entry : null };
}
`;
const LINE_INK_HELPER = `
// 与 page-bridge inkMeasure 同构的局部 Otsu 前景 bbox（runner 内联，只读像素）
function lineInkRegion(gray, iw, ih, bb) {
  const x0 = Math.max(0, Math.floor(bb.x)), y0 = Math.max(0, Math.floor(bb.y));
  const x1 = Math.min(iw - 1, Math.ceil(bb.x + bb.width)), y1 = Math.min(ih - 1, Math.ceil(bb.y + bb.height));
  const ws = x1 - x0, hs = y1 - y0;
  if (ws < 2 || hs < 2 || x1 < x0 || y1 < y0) return { ok: false, reason: "NO_REGION" };
  const hist = new Array(256).fill(0); let sum = 0, total = 0;
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) { const g = gray[y * iw + x]; hist[g] += 1; total += 1; sum += g; }
  if (total < 16) return { ok: false, reason: "NO_INK" };
  let sumB = 0, wB = 0, maxVar = 0, th = 128, found = false;
  for (let t = 0; t < 256; t += 1) { wB += hist[t]; if (wB === 0) continue; const wF = total - wB; if (wF === 0) break; sumB += t * hist[t]; const mB = sumB / wB, mF = (sum - sumB) / wF; const v = wB * wF * (mB - mF) * (mB - mF); if (v > maxVar) { maxVar = v; th = t; found = true; } }
  if (!found) return { ok: false, reason: "NO_INK" };
  let dark = 0; for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) if (gray[y * iw + x] <= th) dark += 1;
  const takeDark = dark <= total - dark;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, cnt = 0;
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) { const g = gray[y * iw + x]; const fg = takeDark ? (g <= th) : (g > th); if (!fg) continue; cnt += 1; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  if (!(cnt >= 6 && maxX >= minX && maxY >= minY) || !isFinite(minX)) return { ok: false, reason: "NO_INK" };
  return { ok: true, inkWidth: maxX - minX + 1, inkHeight: maxY - minY + 1, inkBox: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }, coverage: Math.round((cnt / total) * 10000) / 10000 };
}
function loadGray(el) {
  const iw = el.naturalWidth || el.width, ih = el.naturalHeight || el.height;
  if (!iw || !ih) return { ok: false, reason: "no-size" };
  const cv = document.createElement("canvas"); cv.width = iw; cv.height = ih;
  const c2 = cv.getContext && cv.getContext("2d");
  if (!c2) return { ok: false, reason: "no-ctx" };
  let d = null; try { c2.drawImage(el, 0, 0); d = c2.getImageData(0, 0, iw, ih).data; } catch (e) { d = null; }
  if (!d) return { ok: false, reason: "cross-origin" };
  const gray = new Uint8Array(iw * ih);
  for (let i = 0; i < iw * ih; i += 1) { const j = i * 4; gray[i] = Math.round(0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]); }
  return { ok: true, gray: gray, iw: iw, ih: ih };
}
`;

const PAGE_AUDIT = `
const r = resolveEntry8();
const c = r.canvas;
const out = { image: null, effectiveScale: null, perLineInk: [], medianEvidence: null, multiline: null, createMeasure: null, minFont: [], textToImage: null, toolFields: { buildImageTransform: typeof buildImageTransform, synthesizeTextLayout: typeof synthesizeTextLayout, measureFabricObjectInk: typeof measureFabricObjectInk, resolveLines: typeof resolveLines }, scenarios: [] };
const push = function (s) { out.scenarios.push(s); return s; };
if (!c) return { ok: false, reason: "no-canvas", out };
try { if (typeof c.setCoords === "function") c.setCoords(); } catch (e) {}
const imgs = (c.getObjects() || []).filter(function (o) { return o && String(o.type) === "image"; });
if (!imgs.length) return { ok: false, reason: "no-image-object", out };
const img = imgs[0];
const el = typeof img.getElement === "function" ? img.getElement() : (img._element || null);
const nw = el && el.naturalWidth, nh = el && el.naturalHeight, w = img.width, h = img.height;
out.image = { objectCount: imgs.length, left: img.left, top: img.top, width: w, height: h, scaleX: img.scaleX, scaleY: img.scaleY, naturalWidth: nw, naturalHeight: nh, angle: img.angle };
try { if (typeof img.setCoords === "function") img.setCoords(); } catch (e) {}
const T = buildImageTransform({ naturalWidth: nw, naturalHeight: nh, width: w, height: h, aCoords: img.aCoords });
if (!T) return { ok: false, reason: "affine-singular", out };
out.effectiveScale = effectiveScaleOf(T);
if (!(nw > 0) || !(nh > 0)) return { ok: false, reason: "no-natural", out };

// ---- A: per-line ImageInk（3 行 ocr 风格区块）→ median → fontSize（vs whole-block 反证） ----
const grayRes = loadGray(el);
if (grayRes.ok) {
  const rows = [
    { x: Math.round(nw * 0.10), y: Math.round(nh * 0.28), width: Math.round(nw * 0.32), height: Math.round(nh * 0.09) },
    { x: Math.round(nw * 0.10), y: Math.round(nh * 0.40), width: Math.round(nw * 0.28), height: Math.round(nh * 0.09) },
    { x: Math.round(nw * 0.10), y: Math.round(nh * 0.52), width: Math.round(nw * 0.34), height: Math.round(nh * 0.09) }
  ];
  const perLine = [];
  rows.forEach(function (bb, i) {
    const ink = lineInkRegion(grayRes.gray, grayRes.iw, grayRes.ih, bb);
    perLine.push({ line: i, bbox: bb, inkHeight: ink.ok ? ink.inkHeight : null, inkWidth: ink.ok ? ink.inkWidth : null, reason: ink.ok ? "OK" : ink.reason });
  });
  out.perLineInk = perLine;
  const heights = perLine.map(function (p) { return p.inkHeight; });
  const medianH = medianLineInk(heights);
  const effSY = (out.effectiveScale && out.effectiveScale.effectiveScaleY) || 0;
  // whole-block 反证：整块（含行距）一次性 ink → 其 bbox 高（用户禁止的「极块总高当字号」路径）
  const blockInk = lineInkRegion(grayRes.gray, grayRes.iw, grayRes.ih, {
    x: rows[0].x, y: rows[0].y,
    width: Math.max(rows[0].width, rows[1].width, rows[2].width),
    height: (rows[2].y + rows[2].height) - rows[0].y
  });
  out.medianEvidence = {
    perLineInkHeights: heights,
    medianInkHeight: medianH != null ? Math.round(medianH * 100) / 100 : null,
    medianCanvasPx: medianH != null ? Math.round((medianH * effSY) * 100) / 100 : null,
    wholeBlockInkHeight: (blockInk && blockInk.ok) ? blockInk.inkHeight : null,
    wholeBlockCanvasPx: (blockInk && blockInk.ok) ? Math.round((blockInk.inkHeight * effSY) * 100) / 100 : null,
    wholeBlockFs: (blockInk && blockInk.ok && effSY > 0) ? solveMedianInkFontSize(Math.round((blockInk.inkHeight * effSY) * 100) / 100) : null,
    medianFs: (medianH != null && effSY > 0) ? solveMedianInkFontSize(Math.round((medianH * effSY) * 100) / 100) : null,
    effectiveScaleY: Math.round(effSY * 1e6) / 1e6
  };
  push({ case: "A-perline-median", passed: !!(out.medianEvidence.medianInkHeight != null && out.medianEvidence.medianFs != null && out.medianEvidence.wholeBlockFs != null && out.medianEvidence.wholeBlockFs !== out.medianEvidence.medianFs), evidence: { perLineInkHeights: out.medianEvidence.perLineInkHeights, medianInkHeight: out.medianEvidence.medianInkHeight, medianFs: out.medianEvidence.medianFs, wholeBlockInkHeight: out.medianEvidence.wholeBlockInkHeight, wholeBlockFs: out.medianEvidence.wholeBlockFs, effectiveScaleY: out.medianEvidence.effectiveScaleY } });
}

// ---- C: 3 行 OCR 区块 → lineQuads（含 containment）→ synthesizeTextLayout（唯一 textbox 目标） ----
if (typeof synthesizeTextLayout === "function") {
  const rows = [
    { x: nw * 0.12, y: nh * 0.30, width: nw * 0.30, height: nh * 0.08 },
    { x: nw * 0.12, y: nh * 0.42, width: nw * 0.26, height: nh * 0.08 },
    { x: nw * 0.12, y: nh * 0.54, width: nw * 0.32, height: nh * 0.08 }
  ];
  const lineQuads = rows.map(function (bb) {
    const mq = mapRectToCanvas(bb, T);
    return { quad: mq.corners, rect: bb, inside: isQuadInsideImage(mq.corners, T, nw, nh).verdict };
  });
  const fsSolved = out.medianEvidence && out.medianEvidence.medianFs ? out.medianEvidence.medianFs : 22;
  const st = synthesizeTextLayout({ lineQuads: lineQuads.map(function (q) { return q.quad; }), lineCount: 3, fontSize: fsSolved, lineHeightRatio: 1.3, layoutWidth: Math.round((nw * 0.32) * (out.effectiveScale ? out.effectiveScale.effectiveScaleX : 0.585)) });
  out.multiline = { lineQuads: lineQuads.map(function (q) { return { quad: q.quad.map(function (p) { return { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 }; }), containment: q.inside }; }), synthesized: st };
  push({ case: "C-synthesize-one-textbox", passed: !!(st && st.evidence && st.evidence.lineQuads === 3 && lineQuads.every(function (q) { return q.inside === "CONTAINED"; })), evidence: { synthesized: st ? { left: st.left, top: st.top, width: st.width, height: st.height, angle: st.angle, maxLineWidth: st.maxLineWidth, evidence: st.evidence } : null } });
}

// ---- D: 多行 drawText → measureFabricObjectInk（renderedLineCount vs sourceLineCount）+ placement ----
if (r.canvasDiy && typeof measureFabricObjectInk === "function") {
  const g = out.multiline && out.multiline.synthesized ? out.multiline.synthesized : null;
  const left = g ? g.left : 100, top = g ? g.top : 60, fsUse = (out.medianEvidence && out.medianEvidence.medianFs) || 22;
  const label = "ZY_ML8_" + Date.now().toString(36).slice(-6);
  const srcText = "第一行名称\\n第二行职位说明";
  const diy = r.canvasDiy;
  let created = null;
  try {
    const idOf = function (o) { return String((o && (o.multiUuid || o.uuid || o.id)) || ""); };
    const beforeIds = (c.getObjects() || []).map(idOf);
    let maxLayer = -1;
    try { c.getObjects().forEach(function (o) { if (o && typeof o.layerNum === "number" && o.layerNum > maxLayer) maxLayer = o.layerNum; }); } catch (e) {}
    const layerNum = maxLayer + 1;
    const media = {
      media: { mediaType: "text", text: srcText, font: { pointSize: fsUse, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "1", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.2, lineIdType: 0, isBG: 0, imgPath: "" },
      location: { x: left, y: top, width: 200, height: 60, factWidth: 200, factHeight: 60, rotation: 0 },
      printLocation: { x: left, y: top, width: 200, height: 60, rotation: 0 },
      layer: { alpha: 1 }, layerNum: layerNum, isEdit: 1, isDisplay: 0, deleteState: 0, visitLevel: 1,
      multiUuid: "zy-ml8-" + Date.now().toString(36), markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0
    };
    const nObj = diy.drawText(srcText, fsUse, left, top, media, layerNum);
    const afterObjs = c.getObjects() || [];
    let obj = (typeof nObj === "object" && nObj !== null) ? nObj : null;
    let identityMethod = obj ? "NATIVE_RETURN" : "OBJECT_DELTA";
    if (!obj) { obj = afterObjs.filter(function (o) { return beforeIds.indexOf(idOf(o)) < 0; }).find(function (o) { return /textbox|i-text|text/.test(String(o.type || "")); }) || null; }
    if (!obj) { obj = afterObjs.filter(function (o) { return o && String(o.text || "").indexOf("ZY_ML8") >= 0; })[0] || null; }
    identityMethod = obj ? identityMethod : "TEXT_FALLBACK";
    try { if (typeof c.setCoords === "function") c.setCoords(); if (obj && typeof obj.setCoords === "function") obj.setCoords(); } catch (e) {}
    const ac = obj && obj.aCoords;
    const acBB = (function () { if (!ac) return null; const xs = [ac.tl.x, ac.tr.x, ac.br.x, ac.bl.x], ys = [ac.tl.y, ac.tr.y, ac.br.y, ac.bl.y]; return { left: Math.round(Math.min.apply(null, xs) * 100) / 100, top: Math.round(Math.min.apply(null, ys) * 100) / 100, right: Math.round(Math.max.apply(null, xs) * 100) / 100, bottom: Math.round(Math.max.apply(null, ys) * 100) / 100 }; })();
    const ink = obj ? measureFabricObjectInk(obj) : null;
    const renderedLineCount = (obj && obj._textLines && obj._textLines.length) ? obj._textLines.length : (ink && ink.lineCount != null ? ink.lineCount : null);
    const sourceLineCount = 2;
    const actualFs = obj && typeof obj.fontSize === "number" ? obj.fontSize : null;
    const fontSizeError = actualFs != null ? Math.round((actualFs - fsUse) * 100) / 100 : null;
    const centerError = (g && acBB) ? Math.round(Math.hypot((acBB.left + (acBB.right - acBB.left) / 2) - g.left - g.width / 2, (acBB.top + (acBB.bottom - acBB.top) / 2) - g.top - g.height / 2) * 100) / 100 : null;
    created = { ok: true, identityMethod: identityMethod, requested: { left: left, top: top, fontSize: fsUse, sourceLineCount: sourceLineCount }, actual: { aCoordsBB: acBB, fontSize: actualFs, renderedLineCount: renderedLineCount, ink: ink ? { inkWidth: ink.inkWidth, inkHeight: ink.inkHeight, lineCount: ink.lineCount, method: ink.method } : null }, errors: { fontSizeError: fontSizeError, centerError: centerError, lineMismatch: renderedLineCount != null && renderedLineCount !== sourceLineCount } };
    try {
      const regIdx = diy.canvasObjInfo && diy.canvasObjInfo.canvasToProductObjArr ? diy.canvasObjInfo.canvasToProductObjArr.indexOf(obj) : -1;
      if (regIdx >= 0) diy.canvasObjInfo.canvasToProductObjArr.splice(regIdx, 1);
      if (obj && typeof c.remove === "function") c.remove(obj);
      try { if (typeof c.requestRenderAll === "function") c.requestRenderAll(); } catch (e) {}
      created.cleaned = true;
    } catch (eCl) { created.cleanupError = String(eCl && eCl.message || eCl).slice(0, 100); }
  } catch (eCr) { created = { ok: false, error: String(eCr && eCr.message || eCr).slice(0, 160) }; }
  out.createMeasure = created;
  push({ case: "D-create-measure-multiline", passed: !!(created && created.ok && created.actual.renderedLineCount === 2 && created.errors.fontSizeError != null && Math.abs(created.errors.fontSizeError) <= 2 && created.cleaned), created: created });
}

// ---- F: Native 最小字号证据（2/6/20）----
if (r.canvasDiy && typeof measureFabricObjectInk === "function") {
  const diy = r.canvasDiy;
  for (const fsTest of [2, 6, 20]) {
    try {
      const idOf2 = function (o) { return String((o && (o.multiUuid || o.uuid || o.id)) || ""); };
      const beforeIds2 = (c.getObjects() || []).map(idOf2);
      let maxLayer2 = -1;
      try { c.getObjects().forEach(function (o) { if (o && typeof o.layerNum === "number" && o.layerNum > maxLayer2) maxLayer2 = o.layerNum; }); } catch (e) {}
      const mm = { media: { mediaType: "text", text: "最小字号探针", font: { pointSize: fsTest, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "1", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.2, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: 80, y: 200, width: 120, height: 30, factWidth: 120, factHeight: 30, rotation: 0 }, printLocation: { x: 80, y: 200, width: 120, height: 30, rotation: 0 }, layer: { alpha: 1 }, layerNum: maxLayer2 + 1, isEdit: 1, isDisplay: 0, deleteState: 0, visitLevel: 1, multiUuid: "zy-mf-" + Date.now().toString(36), markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0 };
      const nO = diy.drawText("最小字号探针", fsTest, 80, 200, mm, maxLayer2 + 1);
      const after2 = c.getObjects() || [];
      let o2 = (typeof nO === "object" && nO !== null) ? nO : null;
      if (!o2) { o2 = after2.filter(function (o) { return beforeIds2.indexOf(idOf2(o)) < 0; }).find(function (o) { return /textbox|i-text|text/.test(String(o.type || "")); }) || null; }
      const ink2 = o2 ? measureFabricObjectInk(o2) : null;
      const rec = { fontSizeRequested: fsTest, fontSizeActual: o2 && typeof o2.fontSize === "number" ? o2.fontSize : null, renderedLineCount: (o2 && o2._textLines && o2._textLines.length) ? o2._textLines.length : (ink2 && ink2.lineCount != null ? ink2.lineCount : null), inkHeight: ink2 && typeof ink2.inkHeight === "number" ? ink2.inkHeight : null, inkMethod: ink2 ? ink2.method : null, rendered: !!o2 };
      out.minFont.push(rec);
      try { const regIdx = diy.canvasObjInfo && diy.canvasObjInfo.canvasToProductObjArr ? diy.canvasObjInfo.canvasToProductObjArr.indexOf(o2) : -1; if (regIdx >= 0) diy.canvasObjInfo.canvasToProductObjArr.splice(regIdx, 1); if (o2 && typeof c.remove === "function") c.remove(o2); try { if (typeof c.requestRenderAll === "function") c.requestRenderAll(); } catch (e) {} } catch (eCl) {}
    } catch (eF) { out.minFont.push({ fontSizeRequested: fsTest, error: String(eF && eF.message || eF).slice(0, 120) }); }
  }
  const okSizes = out.minFont.filter(function (r) { return r.rendered && r.inkHeight != null; });
  push({ case: "F-native-min-font", passed: okSizes.length >= 2 && okSizes.some(function (r) { return r.fontSizeRequested <= 6; }), evidence: out.minFont });
}

// ---- E: Native text-to-image 五层能力审计（只读）----
{
  const defs = (window.requirejs && window.requirejs.s && window.requirejs.s.contexts && window.requirejs.s.contexts._ && window.requirejs.s.contexts._.defined) || {};
  // L4 Module/API：函数名/关键词命中
  const modHits = [];
  Object.keys(defs).forEach(function (mn) {
    const m = defs[mn];
    if (!m || typeof m !== "object") return;
    Object.keys(m).forEach(function (k) {
      const kw = ["drawImg", "drawImage", "insertImage", "createImg", "createImage", "textToImage", "text2image", "textToImg", "text2img", "ImgToText", "imageToText", "raster"];
      if (kw.some(function (w) { return k.toLowerCase().indexOf(w.toLowerCase()) >= 0; })) modHits.push({ mod: mn, key: k, type: typeof m[k] });
    });
  });
  // L5 Object：当前 image 对象（原生能力对象的证据：编辑器内本身就是图像素材系统）
  // L3 Network：模板素材网络（不额外请求；记录既有证据 key）
  const netKnown = { batchSaveKeepMaterial: true, evidence: "Commit 2 已有批保存接口证据（native 素材保存能力）" };
  // L1 UI：扫描页面文案（只读 DOM 树文本，不点击）
  const uiHits = [];
  try {
    const walk = function (n) { if (!n || n.nodeType !== 1) return; if (n.childElementCount === 0) { const tx = String(n.textContent || "").slice(0, 40); if (/转图|生成图片|文字转图|转成图|素材|图片/.test(tx)) uiHits.push(tx); } for (let i = 0; i < n.children.length; i += 1) walk(n.children[i]); };
    walk(document.body);
  } catch (eUi) {}
  // L2 Event：canvas 对象已注册事件类型（不触发）
  const eventHits = [];
  try { (c.getObjects() || []).slice(0, 12).forEach(function (o) { const ls = o.__eventListeners || null; if (ls) Object.keys(ls).slice(0, 6).forEach(function (t) { if (eventHits.indexOf(t) < 0) eventHits.push(t); }); }); } catch (eEv) {}
  out.textToImage = {
    layers: {
      L1_UI: { hits: uiHits.slice(0, 8) },
      L2_Event: { eventTypes: eventHits.slice(0, 8) },
      L3_Network: netKnown,
      L4_Module: { hits: modHits.slice(0, 12), hitCount: modHits.length },
      L5_Object: { imageObjectCount: imgs.length, textObjectCount: (c.getObjects() || []).filter(function (o) { return /textbox|i-text|text/.test(String(o.type || "")); }).length }
    }
  };
  const textToImageVerdict = modHits.length ? "TEXT_TO_IMAGE_NATIVE_CANDIDATE" : "TEXT_TO_IMAGE_UNKNOWN_NO_MODULE_HIT";
  out.textToImageInterface = textToImageVerdict;
  push({ case: "E-text-to-image-audit", passed: true, verdict: textToImageVerdict, moduleHits: modHits.length, uiHits: uiHits.length, evidence: out.textToImage });
}

// ---- 汇总 ----
return { ok: true, out };
`;

// ---- 页面脚本编译预检（浏览器启动前本地暴露语法错误；仅语句级检查，不执行） ----
[RESOLVE_ENTRY, LINE_INK_HELPER, PAGE_AUDIT].forEach(function (src, i) {
  try { new Function(src); } catch (e) { console.error("[compile-check] chunk " + i + " SyntaxError: " + String(e && e.message || e) + " | len=" + (src && src.length) + " head=" + JSON.stringify((src || "").slice(0, 60)) + " tail=" + JSON.stringify((src || "").slice(-60))); process.exit(2); }
});

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const out = { ts: new Date().toISOString(), stage: "STAGE-9-V12-MULTILINE-TYPOGRAPHY", version: USERSCRIPT_VERSION, url: URL.split("?")[0], cookiePresent: !!COOKIE_RAW, scenarios: [], errors: [] };
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1280, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    let page = browser.pages()[0];
    const onPageErr = (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 140)); };
    page.on("pageerror", onPageErr);
    try {
      await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await SLEEP(1400);
      const allOld = await adapter.getAllScripts(page) || [];
      let removed = 0;
      for (const s of allOld.filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(page, s.uuid); removed += 1; } catch (e) {} }
      out.errors = out.errors.filter((x) => x.indexOf("PAGEERROR") < 0);
    } catch (eClean) { out.errors.push("CLEAN: " + String(eClean && eClean.message || eClean).slice(0, 120)); }
    for (const c of parseCookies(COOKIE_RAW)) { try { await browser.addCookies([c]); } catch (e) { out.errors.push("COOKIE:" + c.name + " " + String(e && e.message || e).slice(0, 100)); } }
    page = await (async () => { await page.close().catch(() => {}); const p = await browser.newPage(); p.on("pageerror", onPageErr); return p; })();
    const injectPageWorld = (payload) => page.evaluate((code) => { const s = document.createElement("script"); s.textContent = code; (document.head || document.documentElement).appendChild(s); }, payload);
    const waitEditorReady = async (tries) => {
      for (let i = 0; i < (tries || 18); i += 1) {
        const r = await page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)) })).catch(() => ({}));
        if (r && r.ok) return r;
        await SLEEP(1200);
      }
      return page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)) })).catch(() => ({}));
    };
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => out.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
    await SLEEP(4000);
    await injectPageWorld(PAGE_MODULES + "\n;\n" + RESOLVE_ENTRY + "\n" + LINE_INK_HELPER + "\n;window.__zyC8Audit = (function(){ " + PAGE_AUDIT + "\n })();");
    await SLEEP(1200);
    const ready = await waitEditorReady(18);
    if (!(ready && ready.ok)) out.errors.push("EDITOR_UNAVAILABLE");
    await SLEEP(2500);
    const audit = await page.evaluate("window.__zyC8Audit").catch((e) => ({ ok: false, reason: "read:" + String(e && e.message || e).slice(0, 140), out: null }));
    if (audit && audit.ok && audit.out) {
      out.audit = audit.out;
      out.scenarios = audit.out.scenarios || [];
      out.image = audit.out.image;
      out.effectiveScale = audit.out.effectiveScale;
      out.medianEvidence = audit.out.medianEvidence;
      out.multiline = audit.out.multiline;
      out.createMeasure = audit.out.createMeasure;
      out.minFont = audit.out.minFont;
      out.textToImageInterface = audit.out.textToImageInterface;
    } else { out.errors.push("AUDIT: " + JSON.stringify(audit).slice(0, 300)); }
    await SLEEP(1600);
    const finalState = await page.evaluate(() => {
      const req = window.requirejs; const ctx = req && req.s && req.s.contexts && req.s.contexts._; const defs = (ctx && ctx.defined) || {};
      const CV = defs.CanvasObjVO || window.CanvasObjVO || null;
      const c = CV && CV.totalCanvasArray && CV.totalCanvasArray[0] && CV.totalCanvasArray[0].canvas;
      return { objectCount: c ? c.getObjects().length : null };
    }).catch(() => ({ objectCount: null }));
    out.finalState = finalState;
  } catch (e) { out.errors.push("MAIN: " + String(e && e.stack || (e && e.message || e)).slice(0, 300)); }
  if (browser) await browser.close().catch(() => {});
  fs.writeFileSync(path.join(REPORT_DIR, "multiline-typography.json"), JSON.stringify(out, null, 2));
  console.log("[multiline-typography] report=" + path.join(REPORT_DIR, "multiline-typography.json") + " version=" + out.version);
  out.scenarios.forEach((s) => console.log("[multiline-typography] " + s.case + " -> " + (s.passed ? "PASS" : "FAIL") + " " + (JSON.stringify(Object.assign({}, s, { passed: undefined })).slice(0, 260))));
  if (out.medianEvidence) console.log("[multiline-typography] median=" + JSON.stringify(out.medianEvidence));
  console.log("[multiline-typography] textToImageInterface=" + out.textToImageInterface + " finalObjectCount=" + (out.finalState && out.finalState.objectCount));
  out.errors.forEach((e) => console.log("[multiline-typography] ERR " + e));
  const allPass = out.scenarios.length > 0 && out.scenarios.every((s) => s.passed === true);
  process.exit((out.errors.length || !allPass) ? 1 : 0);
})();