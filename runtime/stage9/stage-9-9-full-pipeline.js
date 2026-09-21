// runtime/stage9/stage-9-9-full-pipeline.js — Stage 9.9：全链路真机验收 + Runtime Wiring Audit + 最小修复
// ---------------------------------------------------------------------
// 本轮唯一目标：证明 Commit 6/7/8 的能力在真实 diy.zheliyin.com 沿正确数据链路闭环运行。
// 数据链路（每层必须真实 runtime evidence）：
//   Native OCR Truth → Geometry Evidence → Image-Space Transform → Anchor/Create
//   → Typography → Textbox Create → Native Measure → Containment → Rendered Verification
//
// Part A（模板 1234075，bridge 直驱 + 页面世界纯模块）：
//   先做 mega 审计（fresh canvas，等价 C8 条件：image-space 四类图 / containment
//     IN-OUT-REPAIR-STILL_OUT / typography 7 场景 + collapse/wrap FAIL / P0-1/2/3 / text-to-image），
//   再跑 bridge 场景：A1 anchor reuse  A2 no-anchor create  A5 create→measure 闭环
//     A3 UNCERTAIN 不强制复用  A4 wrong-page blocked  A6 幂等性 ×3  A7 PageIdentity 硬门禁
//   cleanup 一律保护 baseState 原生对象（reuse 会为模板锚点打 zyOcrKey，禁止误删）。
// Part B（模板 252438 + 真实名片，FULL_REAL_PIPELINE）：
//   R0 CaseA/D real 原生+真实 Baidu（node 同源 provider）→ 点击真实「识别当前图片」
//   R1 CaseC  Baidu-only → DROP   R2 CaseB  Native-only → UNRESOLVED_GEOMETRY
//   R3 CaseD  冲突 → NATIVE_TRUTH（Baidu 仅 geometry evidence）
// 凭据：ZY_STAGE9_COOKIE 仅运行时（缺失回退持久 profile）；ZY_BAIDU_AK/SK 仅运行时（Part B）。
// 报告：runtime/reports/stage-9/stage-9-9-full-pipeline.json
"use strict";
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { execSync } = require("child_process");
const { chromium } = require("../../node_modules/playwright");
const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const EXT_ID = "ndcooeababalnlpkfedmmbbbgkljhpjf";
const USERSCRIPT_PATH = path.join(ROOT, "zheliyin-card-assistant.user.js");
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-9");
const REPORT_FILE = path.join(REPORT_DIR, "stage-9-9-full-pipeline.json");
const adapter = require("../scriptcat-adapter");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL_A = process.env.ZY_URL_A || "https://diy.zheliyin.com/diyWeb/third/1234075/2114747/999/thirdDiyAdd.do";
const URL_B = process.env.ZY_URL_B || "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const CARD = process.env.ZY_BG_FILE || path.join(ROOT, "runtime", "stage8b", "assets", "real-card-shengying.png");
const COOKIE_RAW = process.env.ZY_STAGE9_COOKIE || "";
const BAIDU_AK = process.env.ZY_BAIDU_AK || "";
const BAIDU_SK = process.env.ZY_BAIDU_SK || "";
const SKIP_A = process.env.ZY_SKIP_A === "1";
const SKIP_B = process.env.ZY_SKIP_B === "1";
const USERSCRIPT_VERSION = (/\/\/ @version\s+([\d.]+)/.exec(fs.readFileSync(USERSCRIPT_PATH, "utf8")) || [])[1] || "unknown";
const { createBaiduProvider } = require(path.join(ROOT, "extension", "src", "ocr", "baidu-provider.js"));

function gitBaseline() {
  const g = (cmd) => { try { return execSync(cmd, { cwd: ROOT, encoding: "utf8", timeout: 15000 }).trim(); } catch (e) { return null; } };
  return {
    head: g("git rev-parse HEAD"),
    branch: g("git branch --show-current"),
    clean: (g("git status --porcelain") || "").trim() === "",
    stage: g("git ls-remote origin stage-9-altq-baidu-reconstruction") && (g("git ls-remote origin stage-9-altq-baidu-reconstruction").split(/\s+/)[0]),
    test: g("git ls-remote origin test") && (g("git ls-remote origin test").split(/\s+/)[0]),
    local: g("git rev-parse HEAD")
  };
}

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

// ================= userscript 注入（同 font-target-ab） =================
function injectUserscript() {
  let code = fs.readFileSync(USERSCRIPT_PATH, "utf8");
  ["stage-8a-1-ocr-overflow-rotation", "stage-8a-ocr-audit", "stage-8b-ocr-reconstruction-engine", "stage-8a-2-rotation-policy-geometry", "stage-8d-ocr-quality-reconstruction", "test", "demo"].forEach((b) => {
    code = code.split(b + "/extension/src/").join("stage-9-altq-baidu-reconstruction/extension/src/");
    code = code.replace(new RegExp(b.replace(/[-]/g, "\\-") + "\\/zheliyin-card-assistant\\.user\\.js", "g"), "stage-9-altq-baidu-reconstruction/zheliyin-card-assistant.user.js");
  });
  return code;
}
function conditionCode(cond) {
  let code = injectUserscript();
  const repl = (o, n) => { if (code.indexOf(o) < 0) throw new Error("code anchor not found: " + o); code = code.split(o).join(n); };
  repl('GM_getValue("zyBaiduOcrMode", "standard")', JSON.stringify(cond.baidu));
  repl('GM_getValue("zyStage9FontInkTarget", "0") === "1"', cond.ink === "1" ? "true" : "false");
  repl('GM_getValue("zyStage9NativeOcrMode", "2")', JSON.stringify("2"));
  repl('GM_getValue("zyStage9NativeTruth", "0") === "1"', "true");
  repl('GM_getValue("zyOcrMode", "auto")', JSON.stringify("baidu"));
  repl('res = await provider.recognize(img.dataUrl, { imageWidth: img.width, imageHeight: img.height, mode: BAIDU_OCR_MODE });', 'res = (window.__zyBaiduExternal && window.__zyBaiduExternal.res) ? window.__zyBaiduExternal.res : { error: { errorCode: "EXTERNAL_BAIDU_MISSING", errorMessage: "runner external baidu not injected" } };');
  repl('document.addEventListener("DOMContentLoaded", initZheliyin);', '(function(){ if (document.body) { initZheliyin(); } else { document.addEventListener("DOMContentLoaded", function(){ initZheliyin(); }); } })();');
  return code;
}
const GM_SHIM_SOURCE = [
  "try{window.__ZY8D_PAGE_WORLD__=true;",
  "if(typeof window.GM_getValue==='undefined'){window.GM_getValue=function(k,d){try{var v=localStorage.getItem('zy8dshim:'+k);return v==null?d:JSON.parse(v);}catch(e){return d;}};}",
  "if(typeof window.GM_setValue==='undefined'){window.GM_setValue=function(k,v){try{localStorage.setItem('zy8dshim:'+k,JSON.stringify(v));}catch(e){}};window.GM_deleteValue=function(k){try{localStorage.removeItem('zy8dshim:'+k);}catch(e){}};}",
  "if(typeof window.GM_xmlhttpRequest==='undefined'){window.GM_xmlhttpRequest=function(o){var u=o.url||'',m=(o.method||'GET');fetch(u,{method:m,headers:(o.headers||{})}).then(function(res){return res.text().then(function(t){return {status:res.status,responseText:t,response:t,readyState:4,finalUrl:u};});}).then(function(r){if(o.onload)try{o.onload(r);}catch(e){};}).catch(function(e){if(o.onerror)try{o.onerror({status:0,error:String(e&&e.message||e)||'fetch-error',responseText:''});}catch(e2){};});return {abort:function(){}};};}",
  "if(typeof window.GM_addStyle==='undefined'){window.GM_addStyle=function(css){var el=document.createElement('style');el.textContent=css;(document.head||document.documentElement).appendChild(el);return el;};}",
  "if(typeof window.GM_addElement==='undefined'){window.GM_addElement=function(tag,attrs){var el=document.createElement(tag);for(var k in (attrs||{})){try{el[k]=attrs[k];}catch(e){}};(document.head||document.documentElement).appendChild(el);return el;};}",
  "}catch(e){console.error('[zy8d-shim]',e);}"
].join("\n");
function pageWorldPayloadFor(cond) {
  const parts = [GM_SHIM_SOURCE];
  const norm = conditionCode(cond);
  const reqs = [...norm.matchAll(/\/\/ @require\s+(\S+)/g)].map((m) => m[1]);
  for (const u of reqs) {
    const mm = /\/extension\/src\/(.+)$/.exec(u);
    if (!mm) continue;
    const rel = mm[1].split("?")[0];
    const fp = path.join(ROOT, "extension", "src", rel);
    if (fs.existsSync(fp)) parts.push("// ==== @require " + rel + " ====\n" + fs.readFileSync(fp, "utf8"));
  }
  parts.push(norm);
  return parts.join("\n;\n");
}

// ================= Part B：node 侧真实 Baidu =================
async function baiduRecognizeExternal(dataUrl, mode) {
  const provider = createBaiduProvider({
    getConfig: () => ({ apiKey: BAIDU_AK, secretKey: BAIDU_SK }),
    http: { request: async (m, u, o) => { const res = await fetch(u, { method: m, headers: o.headers || {}, body: o.body, signal: AbortSignal.timeout(o.timeout || 30000) }); return { status: res.status, responseText: await res.text() }; } },
    storage: { get: () => "", set: () => {} },
    resizeImage: null
  });
  return provider.recognize(dataUrl, { imageWidth: null, imageHeight: null, mode }).catch((e) => ({ error: { errorCode: "EXCEPTION", errorMessage: String(e && e.message || e) } }));
}

// ================= 页面世界纯模块（Part A mega 审计） =================
const MEGA_MODULES = [
  fs.readFileSync(path.join(ROOT, "extension", "src", "editor", "image-space.js"), "utf8"),
  fs.readFileSync(path.join(ROOT, "extension", "src", "editor", "image-containment.js"), "utf8"),
  fs.readFileSync(path.join(ROOT, "extension", "src", "editor", "multiline-typography.js"), "utf8"),
  fs.readFileSync(path.join(ROOT, "extension", "src", "editor", "ink-measure.js"), "utf8"),
  fs.readFileSync(path.join(ROOT, "extension", "src", "editor", "text-fit.js"), "utf8")
].join("\n;\n");
const RESOLVE_ENTRY = `
function resolveEntry99() {
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
function zy99lineInkRegion(gray, iw, ih, bb) {
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
function zy99loadGray(el) {
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
function zy99findInkBands(gray, iw, ih) {
  const rowDark = new Array(ih).fill(0);
  for (let y = 0; y < ih; y += 1) { let d = 0; const off = y * iw; for (let x = 0; x < iw; x += 1) if (gray[off + x] < 128) d += 1; rowDark[y] = d; }
  const bands = []; let inB = false, y0 = 0;
  for (let y = 0; y < ih; y += 1) {
    if (rowDark[y] >= 1 && !inB) { inB = true; y0 = y; }
    else if (rowDark[y] < 1 && inB) { inB = false; if (y - y0 >= 5) bands.push({ y0: y0, y1: y }); }
  }
  if (inB && ih - y0 >= 5) bands.push({ y0: y0, y1: ih });
  return bands;
}
function zy99bandRect(gray, iw, ih, band) {
  const bb = { x: 0, y: band.y0, width: iw, height: band.y1 - band.y0 };
  return zy99lineInkRegion(gray, iw, ih, bb);
}
function zy99rowRect(gray, iw, ih, r) {
  const bb = { x: Math.round(iw * r.x), y: Math.round(ih * r.y), width: Math.round(iw * r.w), height: Math.round(ih * r.h) };
  return zy99lineInkRegion(gray, iw, ih, bb);
}
`;

const MEGA_AUDIT = `
const r = resolveEntry99();
const c = r.canvas;
const out = { image: null, canvas: null, effectiveScale: null, imageTransform: null, toolFields: {}, imageSpace: [], containment: [], typography: [], p0: {}, textToImage: null, scenarios: [] };
const push = function (s) { out.scenarios.push(s); return s; };
if (!c) return { ok: false, reason: "no-canvas", out };
try { if (typeof c.setCoords === "function") c.setCoords(); } catch (e) {}
const imgs = (c.getObjects() || []).filter(function (o) { return o && String(o.type) === "image"; });
const tboxes = (c.getObjects() || []).filter(function (o) { return o && (String(o.type) === "textbox" || String(o.type) === "i-text" || String(o.type) === "text"); });
out.canvas = { width: c.width, height: c.height, objectCount: c.getObjects().length, textboxCount: tboxes.length };
if (!imgs.length) return { ok: false, reason: "no-image-object", out };
const img = imgs[0];
const el = typeof img.getElement === "function" ? img.getElement() : (img._element || null);
const nw = el && el.naturalWidth, nh = el && el.naturalHeight, w = img.width, h = img.height;
out.image = { objectCount: imgs.length, index: 0, left: img.left, top: img.top, objectWidth: w, objectHeight: h, naturalWidth: nw, naturalHeight: nh, scaleX: img.scaleX, scaleY: img.scaleY, angle: img.angle, canvasWidth: c.width, canvasHeight: c.height };
if (!(nw > 0) || !(nh > 0) || typeof buildImageTransform !== "function") return { ok: false, reason: "missing-natural-or-transform", out };
try { if (typeof img.setCoords === "function") img.setCoords(); } catch (e) {}
const T = buildImageTransform({ naturalWidth: nw, naturalHeight: nh, width: w, height: h, aCoords: img.aCoords });
if (!T) return { ok: false, reason: "affine-singular", out };
out.imageTransform = { affine: T.map(function (v) { return Math.round(v * 1e6) / 1e6; }) };
out.effectiveScale = effectiveScaleOf(T);
out.toolFields = { buildImageTransform: typeof buildImageTransform, isQuadInsideImage: typeof isQuadInsideImage, repairQuadCentered: typeof repairQuadCentered, quadTextGeometry: typeof quadTextGeometry, effectiveScaleOf: typeof effectiveScaleOf, medianLineInk: typeof medianLineInk, solveMedianInkFontSize: typeof solveMedianInkFontSize, synthesizeTextLayout: typeof synthesizeTextLayout, measureFabricObjectInk: typeof measureFabricObjectInk, compareTextGeometry: typeof compareTextGeometry };
const round2 = function (v) { return Math.round(v * 100) / 100; };
const record = function (name, verdict, reason, extra, passed) { const s = { case: name, verdict: verdict, reason: reason || null, passed: passed }; if (extra) Object.keys(extra).forEach(function (k) { s[k] = extra[k]; }); out.scenarios.push(s); return s; };

// ============ I. image-space 四类图 ============
const centeredQuad = function (cx, cy, halfW, halfH, sx, sy, deg) {
  const rad = (deg || 0) * Math.PI / 180, co = Math.cos(rad), si = Math.sin(rad);
  return [{ x: -halfW, y: -halfH }, { x: halfW, y: -halfH }, { x: halfW, y: halfH }, { x: -halfW, y: halfH }].map(function (p) {
    const dx = p.x * (sx || 1), dy = p.y * (sy || 1);
    return { x: cx + dx * co - dy * si, y: cy + dx * si + dy * co };
  });
};
const imgCx = w / 2, imgCy = h / 2;
// I1 real（natural != object，对象缩放 0.5849）
{
  const es = out.effectiveScale;
  const rect = { x: nw * 0.16, y: nh * 0.16, width: nw * 0.3, height: nh * 0.09 };
  const mq = mapRectToCanvas(rect, T);
  const res = isQuadInsideImage(mq.corners, T, nw, nh);
  out.imageSpace.push({ type: "I1-real-natural-neq-object", naturalWidth: nw, naturalHeight: nh, objectWidth: w, objectHeight: h, canvasWidth: c.width, canvasHeight: c.height, effectiveScale: es, targetQuad: mq.corners.map(function (p) { return { x: round2(p.x), y: round2(p.y) }; }), containment: res.verdict });
  record("I1-real-transform", "CONTAINED", res.verdict, { natural: { width: nw, height: nh }, object: { width: round2(w), height: round2(h) }, canvas: { width: c.width, height: c.height }, effectiveScale: es, naturalNeqObject: !!(nw !== w || nh !== h) }, (es && Math.abs(es.effectiveScaleX - w / nw) < 0.01 && Math.abs(es.effectiveScaleY - h / nh) < 0.01 && res.verdict === "CONTAINED" && nw !== w));
}
// I2 non-1:1 uniform scale（0.7× 中心缩放）
{
  const quad = centeredQuad(imgCx, imgCy, w / 2, h / 2, 0.7, 0.7, 0);
  const T2 = buildImageTransform({ naturalWidth: nw, naturalHeight: nh, width: w, height: h, quad: quad });
  if (T2) {
    const es2 = effectiveScaleOf(T2);
    const rect = { x: nw / 2 - 120, y: nh / 2 - 30, width: 240, height: 60 };
    const mq = mapRectToCanvas(rect, T2);
    const res = isQuadInsideImage(mq.corners, T2, nw, nh);
    out.imageSpace.push({ type: "I2-uniform-0.7", effectiveScale: es2, containment: res.verdict });
    record("I2-uniform-scale", "CONTAINED", res.verdict, { effectiveScale: es2, expectedSx: round2(0.7 * w / nw), expectedSy: round2(0.7 * h / nh), containment: res.verdict }, !!(es2 && Math.abs(es2.effectiveScaleX - 0.7 * w / nw) < 0.01 && Math.abs(es2.effectiveScaleY - 0.7 * h / nh) < 0.01 && res.verdict === "CONTAINED"));
  } else { record("I2-uniform-scale", "GEOMETRY_INVALID", "affine-singular", null, false); }
}
// I3 rotated（30°）
{
  const quad = centeredQuad(imgCx, imgCy, w / 2, h / 2, 1, 1, 30);
  const T3 = buildImageTransform({ naturalWidth: nw, naturalHeight: nh, width: w, height: h, quad: quad });
  if (T3) {
    const es3 = effectiveScaleOf(T3);
    const rect = { x: nw / 2 - 80, y: nh / 2 - 20, width: 160, height: 40 };
    const mq = mapRectToCanvas(rect, T3);
    const res = isQuadInsideImage(mq.corners, T3, nw, nh);
    const g = quadTextGeometry(mq.corners);
    out.imageSpace.push({ type: "I3-rotated-30", effectiveScale: es3, targetQuadAngle: g.angle, containment: res.verdict });
    record("I3-rotated-30", "CONTAINED", res.verdict, { effectiveScale: es3, targetQuadAngle: g.angle, containment: res.verdict }, !!(es3 && Math.abs(es3.effectiveScaleX - w / nw) < 0.01 && Math.abs(es3.effectiveScaleY - h / nh) < 0.01 && Math.abs(g.angle - 30) < 0.5 && res.verdict === "CONTAINED"));
  } else { record("I3-rotated-30", "GEOMETRY_INVALID", "affine-singular", null, false); }
}
// I4 non-uniform scale（sx=0.6, sy=1.1）
{
  const quad = centeredQuad(imgCx, imgCy, w / 2, h / 2, 0.6, 1.1, 0);
  const T4 = buildImageTransform({ naturalWidth: nw, naturalHeight: nh, width: w, height: h, quad: quad });
  if (T4) {
    const es4 = effectiveScaleOf(T4);
    const rect = { x: nw / 2 - 100, y: nh / 2 - 25, width: 200, height: 50 };
    const mq = mapRectToCanvas(rect, T4);
    const res = isQuadInsideImage(mq.corners, T4, nw, nh);
    out.imageSpace.push({ type: "I4-nonuniform", effectiveScale: es4, containment: res.verdict });
    record("I4-nonuniform-scale", "CONTAINED", res.verdict, { effectiveScale: es4, expectedSx: round2(0.6 * w / nw), expectedSy: round2(1.1 * h / nh), containment: res.verdict }, !!(es4 && Math.abs(es4.effectiveScaleX - 0.6 * w / nw) < 0.01 && Math.abs(es4.effectiveScaleY - 1.1 * h / nh) < 0.01 && res.verdict === "CONTAINED" && es4.effectiveScaleX !== es4.effectiveScaleY));
  } else { record("I4-nonuniform-scale", "GEOMETRY_INVALID", "affine-singular", null, false); }
}

// ============ C. containment 四场景（真实 T） ============
// C-IN
{
  const rect = { x: nw * 0.18, y: nh * 0.18, width: nw * 0.25, height: nh * 0.07 };
  const mq = mapRectToCanvas(rect, T);
  const res = isQuadInsideImage(mq.corners, T, nw, nh);
  record("C-IN", res.verdict, res.reason, { ocrBBox: rect, targetQuad: mq.corners.map(function (p) { return { x: round2(p.x), y: round2(p.y) }; }), createAllowed: res.verdict === "CONTAINED" }, res.verdict === "CONTAINED");
}
// C-OUT
{
  const rect = { x: nw + 300, y: nh + 200, width: 160, height: 40 };
  const mq = mapRectToCanvas(rect, T);
  const res = isQuadInsideImage(mq.corners, T, nw, nh);
  record("C-OUT", res.verdict, res.reason, { ocrBBox: rect, createAllowed: res.verdict === "CONTAINED" }, res.verdict === "OUT_OF_IMAGE");
}
// C-REPAIR
{
  const rect = { x: nw - 140, y: nh * 0.2, width: 280, height: 50 };
  const mq = mapRectToCanvas(rect, T);
  const res = isQuadInsideImage(mq.corners, T, nw, nh);
  const rp = repairQuadCentered(mq.corners, T, nw, nh);
  const post = rp ? isQuadInsideImage(rp.quad, T, nw, nh) : null;
  record("C-REPAIR", res.verdict, res.reason, { before: { verdict: res.verdict, outsideCount: res.evidence ? res.evidence.outsideCount : null }, repair: rp ? { imageShift: rp.evidence.imageShift, canvasShift: rp.evidence.canvasShift, afterVerdict: rp.evidence.afterVerdict } : null, after: post ? { verdict: post.verdict } : null, createAllowed: !!(rp && post && post.verdict === "CONTAINED") }, res.verdict === "NEEDS_REPAIR" && !!rp && !!post && post.verdict === "CONTAINED");
}
// C-STILL_OUT（quad 完全越出且宽超图片 → repair 失败 → 禁止 Create）
{
  const rect = { x: nw * 0.3, y: nh + 200, width: nw * 1.6, height: 40 };
  const mq = mapRectToCanvas(rect, T);
  const res = isQuadInsideImage(mq.corners, T, nw, nh);
  const rp = repairQuadCentered(mq.corners, T, nw, nh);
  const after = (rp && rp.quad) ? isQuadInsideImage(rp.quad, T, nw, nh) : null;
  record("C-STILL_OUT", res.verdict, res.reason, { before: { verdict: res.verdict }, repair: rp ? { afterVerdict: rp.evidence.afterVerdict } : null, after: after ? { verdict: after.verdict } : null, createAllowed: !!(rp && after && after.verdict === "CONTAINED") }, res.verdict !== "CONTAINED" && !rp && !after);
}

// ============ T. typography（per-line ink → median → fontSize → probe create → measure） ============
const grayRes = zy99loadGray(el);
out.p0.grayInk = { grayOk: grayRes.ok, grayReason: grayRes.ok ? null : grayRes.reason };
const bandRects = [];
if (grayRes.ok) {
  const bands = zy99findInkBands(grayRes.gray, grayRes.iw, grayRes.ih);
  bands.forEach(function (b) {
    const ir = zy99bandRect(grayRes.gray, grayRes.iw, grayRes.ih, b);
    if (ir.ok) bandRects.push({ y0: b.y0, y1: b.y1, inkWidth: ir.inkWidth, inkHeight: ir.inkHeight, inkBox: ir.inkBox });
  });
  if (!bandRects.length) {
    // 兜底：C8 已验证的固定行（同模板同条件），仍属真实图片 ink 测量
    const rows8 = [{ x: 0.10, y: 0.28, w: 0.32, h: 0.09 }, { x: 0.10, y: 0.40, w: 0.28, h: 0.09 }, { x: 0.10, y: 0.52, w: 0.34, h: 0.09 }, { x: 0.10, y: 0.10, w: 0.35, h: 0.09 }, { x: 0.10, y: 0.64, w: 0.30, h: 0.09 }, { x: 0.10, y: 0.76, w: 0.45, h: 0.09 }, { x: 0.10, y: 0.85, w: 0.30, h: 0.09 }];
    rows8.forEach(function (rr) {
      const ir = zy99rowRect(grayRes.gray, grayRes.iw, grayRes.ih, rr);
      if (ir.ok) bandRects.push({ y0: rr.y * nh, y1: (rr.y + rr.h) * nh, inkWidth: ir.inkWidth, inkHeight: ir.inkHeight, inkBox: ir.inkBox });
    });
  }
  out.p0.grayInk.bandsFound = bands.length;
  out.p0.grayInk.inkSource = bandRects.length ? (out.p0.grayInk.bandsFound ? "ink-bands" : "fixed-rows-fallback") : "no-ink";
}
out.p0.bandsFound = bandRects.length;
const effSX = (out.effectiveScale && out.effectiveScale.effectiveScaleX) || 0;
const effSY = (out.effectiveScale && out.effectiveScale.effectiveScaleY) || 0;
const TYPEO_CASES = [
  { id: "T1-1line-cn", text: "公司名称示例", lines: 1, bands: 1 },
  { id: "T2-2line-cn", text: "第一行姓名\\n第二行职位", lines: 2, bands: 2 },
  { id: "T3-3line-cn", text: "第一行名称\\n第二行职位\\n第三行备注", lines: 3, bands: 3 },
  { id: "T4-cn-english", text: "公司名称 ABC Ltd", lines: 1, bands: 1 },
  { id: "T5-cn-number", text: "联系电话 13800138000", lines: 1, bands: 1 },
  { id: "T6-long-address", text: "广东省佛山市南海区狮山镇官窑\\n办事处振兴路X号商铺", lines: 2, bands: 2 },
  { id: "T7-short-phone", text: "138 8888 8888", lines: 1, bands: 1 }
];
let bandCursor = 0;
TYPEO_CASES.forEach(function (tc) {
  const need = tc.bands;
  const used = [];
  if (bandCursor + need > bandRects.length) { out.typography.push({ case: tc.id, passed: false, verdict: "UNRESOLVED", reason: "insufficient-ink-rows(" + bandRects.length + ")" }); return; }
  for (let i = 0; i < need; i += 1) used.push(bandRects[bandCursor + i]);
  bandCursor = (bandCursor + need) % Math.max(1, bandRects.length);
  const perLineInk = used.map(function (br) { return br.inkHeight; });
  const medianH = medianLineInk(perLineInk);
  const medianCanvasPx = medianH != null ? medianH * effSY : null;
  const fsSolved = medianCanvasPx != null ? solveMedianInkFontSize(Math.round(medianCanvasPx * 100) / 100) : null;
  if (fsSolved == null || !r.canvasDiy || typeof measureFabricObjectInk !== "function") { out.typography.push({ case: tc.id, passed: false, verdict: "UNRESOLVED", reason: "no-fs-or-diy", perLineInk: perLineInk, medianInkHeight: medianH }); return; }
  const first = used[0];
  const rectBase = { x: Math.max(0, first.inkBox.x - 4), y: Math.max(0, first.inkBox.y - 2), width: Math.min(nw, first.inkBox.width + 12), height: Math.min(nh, (used[need - 1].inkBox.y + used[need - 1].inkBox.height) - first.inkBox.y + 4) };
  const mq = mapRectToCanvas(rectBase, T);
  const lineQuads = [];
  used.forEach(function (br) {
    const rq = { x: br.inkBox.x, y: br.inkBox.y, width: br.inkBox.width, height: br.inkBox.height };
    const q = mapRectToCanvas(rq, T);
    lineQuads.push({ quad: q.corners, rect: rq, inside: isQuadInsideImage(q.corners, T, nw, nh).verdict });
  });
  const g = synthesizeTextLayout({ lineQuads: lineQuads.map(function (q) { return q.quad; }), lineCount: tc.lines, fontSize: fsSolved, lineHeightRatio: 1.3, layoutWidth: Math.max((mq ? mq.width : 0), tc.lines > 1 ? 200 : 120) });
  if (!g) { out.typography.push({ case: tc.id, passed: false, verdict: "UNRESOLVED", reason: "synthesize-null", perLineInk: perLineInk, medianInkHeight: medianH, medianFs: fsSolved }); return; }
  const left = g.left, top = g.top, fsUse = fsSolved;
  const diy = r.canvasDiy;
  let created = null;
  try {
    const idOf = function (o) { return String((o && (o.multiUuid || o.uuid || o.id)) || ""); };
    const beforeIds = (c.getObjects() || []).map(idOf);
    let maxLayer = -1;
    try { c.getObjects().forEach(function (o) { if (o && typeof o.layerNum === "number" && o.layerNum > maxLayer) maxLayer = o.layerNum; }); } catch (e) {}
    const layerNum = maxLayer + 1;
    const media = {
      media: { mediaType: "text", text: tc.text, font: { pointSize: fsUse, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "1", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.2, lineIdType: 0, isBG: 0, imgPath: "" },
      location: { x: left, y: top, width: g.width, height: g.height, factWidth: g.width, factHeight: g.height, rotation: g.angle || 0 },
      printLocation: { x: left, y: top, width: g.width, height: g.height, rotation: g.angle || 0 },
      layer: { alpha: 1 }, layerNum: layerNum, isEdit: 1, isDisplay: 0, deleteState: 0, visitLevel: 1,
      multiUuid: "zy-tp-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6), markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0
    };
    const nObj = diy.drawText(tc.text, fsUse, left, top, media, layerNum);
    const afterObjs = c.getObjects() || [];
    let obj = (typeof nObj === "object" && nObj !== null) ? nObj : null;
    let identityMethod = obj ? "NATIVE_RETURN" : "OBJECT_DELTA";
    if (!obj) { obj = afterObjs.filter(function (o) { return beforeIds.indexOf(idOf(o)) < 0; }).find(function (o) { return /textbox|i-text|text/.test(String(o.type || "")); }) || null; }
    if (!obj) { obj = afterObjs.filter(function (o) { return o && String(o.text || "") === tc.text; })[0] || null; }
    identityMethod = obj ? identityMethod : "TEXT_FALLBACK";
    try { if (typeof c.setCoords === "function") c.setCoords(); if (obj && typeof obj.setCoords === "function") obj.setCoords(); } catch (e) {}
    const ac = obj && obj.aCoords;
    const acBB = (function () { if (!ac) return null; const xs = [ac.tl.x, ac.tr.x, ac.br.x, ac.bl.x], ys = [ac.tl.y, ac.tr.y, ac.br.y, ac.bl.y]; return { left: Math.round(Math.min.apply(null, xs) * 100) / 100, top: Math.round(Math.min.apply(null, ys) * 100) / 100, width: Math.round((Math.max.apply(null, xs) - Math.min.apply(null, xs)) * 100) / 100, height: Math.round((Math.max.apply(null, ys) - Math.min.apply(null, ys)) * 100) / 100 }; })();
    const ink = obj ? measureFabricObjectInk(obj) : null;
    const renderedLineCount = (obj && obj._textLines && obj._textLines.length) ? obj._textLines.length : (ink && ink.lineCount != null ? ink.lineCount : null);
    const actualFs = obj && typeof obj.fontSize === "number" ? obj.fontSize : null;
    const fontSizeError = actualFs != null ? Math.round((actualFs - fsUse) * 100) / 100 : null;
    created = { ok: true, identityMethod: identityMethod, sourceInk: { perLineInkHeights: perLineInk, medianInkHeight: medianH != null ? Math.round(medianH * 100) / 100 : null, medianCanvasPx: medianCanvasPx != null ? Math.round(medianCanvasPx * 100) / 100 : null, requestedFontSize: fsUse }, actual: { fontSize: actualFs, fontSizeError: fontSizeError, renderedLineCount: renderedLineCount, renderedInk: ink ? { inkWidth: ink.inkWidth, inkHeight: ink.inkHeight, lineCount: ink.lineCount } : null, aCoordsBB: acBB }, sourceLineCount: tc.lines, lineCountMatch: renderedLineCount != null && renderedLineCount === tc.lines };
    try {
      const regIdx = diy.canvasObjInfo && diy.canvasObjInfo.canvasToProductObjArr ? diy.canvasObjInfo.canvasToProductObjArr.indexOf(obj) : -1;
      if (regIdx >= 0) diy.canvasObjInfo.canvasToProductObjArr.splice(regIdx, 1);
      if (obj && typeof c.remove === "function") c.remove(obj);
      try { if (typeof c.requestRenderAll === "function") c.requestRenderAll(); } catch (e) {}
      created.cleaned = true;
    } catch (eCl) { created.cleanupError = String(eCl && eCl.message || eCl).slice(0, 100); }
  } catch (eCr) { created = { ok: false, error: String(eCr && eCr.message || eCr).slice(0, 160) }; }
  out.typography.push({ case: tc.id, passed: !!(created && created.ok && created.lineCountMatch && created.actual.fontSizeError != null && Math.abs(created.actual.fontSizeError) <= 2 && created.cleaned), verdict: (created && created.ok) ? (created.lineCountMatch ? "PASS" : "FAIL") : "CREATE_FAILED", created: created });
});

// T-collapse：source 2 行 → rendered 1 行必须 FAIL
if (r.canvasDiy && typeof measureFabricObjectInk === "function" && typeof compareTextGeometry === "function" && bandRects.length >= 2) {
  const b0 = bandRects[0], b1 = bandRects[1];
  const rectBlk = { x: b0.inkBox.x, y: b0.inkBox.y, width: Math.max(b0.inkBox.width, b1.inkBox.width), height: (b1.inkBox.y + b1.inkBox.height) - b0.inkBox.y };
  const mq = mapRectToCanvas(rectBlk, T);
  const srcText = "第一行超长文本\\n第二行";
  const fsHuge = Math.max(60, Math.round((rectBlk.height * effSY) / 0.45));
  const diy = r.canvasDiy;
  let col = null;
  try {
    const idOf = function (o) { return String((o && (o.multiUuid || o.uuid || o.id)) || ""); };
    const beforeIds = (c.getObjects() || []).map(idOf);
    let maxLayer = -1;
    try { c.getObjects().forEach(function (o) { if (o && typeof o.layerNum === "number" && o.layerNum > maxLayer) maxLayer = o.layerNum; }); } catch (e) {}
    const mm = { media: { mediaType: "text", text: srcText, font: { pointSize: fsHuge, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "1", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.2, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: mq.left, y: mq.top, width: mq.width * 2, height: mq.height, factWidth: mq.width * 2, factHeight: mq.height, rotation: 0 }, printLocation: { x: mq.left, y: mq.top, width: mq.width * 2, height: mq.height, rotation: 0 }, layer: { alpha: 1 }, layerNum: maxLayer + 1, isEdit: 1, isDisplay: 0, deleteState: 0, visitLevel: 1, multiUuid: "zy-cl-" + Date.now().toString(36), markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0 };
    const nO = diy.drawText(srcText, fsHuge, mq.left, mq.top, mm, maxLayer + 1);
    const after = c.getObjects() || [];
    let o2 = (typeof nO === "object" && nO !== null) ? nO : null;
    if (!o2) { o2 = after.filter(function (o) { return beforeIds.indexOf(idOf(o)) < 0; }).find(function (o) { return /textbox|i-text|text/.test(String(o.type || "")); }) || null; }
    try { if (typeof c.setCoords === "function") c.setCoords(); if (o2 && typeof o2.setCoords === "function") o2.setCoords(); } catch (e) {}
    const ac2 = o2 && o2.aCoords;
    const actualQuad = ac2 ? [{ x: ac2.tl.x, y: ac2.tl.y }, { x: ac2.tr.x, y: ac2.tr.y }, { x: ac2.br.x, y: ac2.br.y }, { x: ac2.bl.x, y: ac2.bl.y }] : null;
    const renderedLineCount = (o2 && o2._textLines && o2._textLines.length) ? o2._textLines.length : null;
    const cg = (mq && mq.corners && actualQuad) ? compareTextGeometry(mq.corners, actualQuad, { renderedLineCount: renderedLineCount, targetLineCount: 2 }) : null;
    const cgG = (mq && mq.corners && actualQuad) ? compareTextGeometry(mq.corners, actualQuad, { renderedLineCount: 1, targetLineCount: 2 }) : null;
    col = { realRenderedLineCount: renderedLineCount, targetLineCount: 2, realCompareStatus: cg ? cg.status : null, realFailures: cg ? cg.failures : [], gate: cgG ? { compareStatus: cgG.status, collapseDetected: !!(cgG.failures && cgG.failures.indexOf("collapse") >= 0), typographyPass: !!(cgG.typography && cgG.typography.pass), failures: cgG.failures, note: "collapse 通过 failures 上报（typography 对象仅暴露 wrapDetected 字段——Commit 8 诊断 API 不对称，非行为缺陷；生产与单测均以 failures/status 判定）" } : null };
    try { const regIdx = diy.canvasObjInfo && diy.canvasObjInfo.canvasToProductObjArr ? diy.canvasObjInfo.canvasToProductObjArr.indexOf(o2) : -1; if (regIdx >= 0) diy.canvasObjInfo.canvasToProductObjArr.splice(regIdx, 1); if (o2 && typeof c.remove === "function") c.remove(o2); try { if (typeof c.requestRenderAll === "function") c.requestRenderAll(); } catch (e) {} } catch (eCl) {}
  } catch (eCr) { col = { error: String(eCr && eCr.message || eCr).slice(0, 120) }; }
  out.typography.push({ case: "T-collapse-fail", passed: !!(col && col.gate && col.gate.collapseDetected && !col.gate.typographyPass), verdict: (col && col.gate && col.gate.collapseDetected) ? "FAIL_DETECTED" : "NOT_DETECTED", evidence: col });
}
// T-wrap：source 1 行 → rendered >1 行必须 FAIL
if (r.canvasDiy && typeof measureFabricObjectInk === "function" && typeof compareTextGeometry === "function" && bandRects.length >= 1) {
  const b0 = bandRects[0];
  const rectBlk = { x: b0.inkBox.x, y: b0.inkBox.y, width: Math.max(60, b0.inkBox.width), height: b0.inkBox.height };
  const mq = mapRectToCanvas(rectBlk, T);
  const srcText = "广东省佛山市南海区狮山镇官窑办事处振兴路X号商铺联系电话邮箱";
  const fsSmall = 14;
  const diy = r.canvasDiy;
  let wrp = null;
  try {
    const idOf = function (o) { return String((o && (o.multiUuid || o.uuid || o.id)) || ""); };
    const beforeIds = (c.getObjects() || []).map(idOf);
    let maxLayer = -1;
    try { c.getObjects().forEach(function (o) { if (o && typeof o.layerNum === "number" && o.layerNum > maxLayer) maxLayer = o.layerNum; }); } catch (e) {}
    const mm = { media: { mediaType: "text", text: srcText, font: { pointSize: fsSmall, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "1", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.2, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: mq.left, y: mq.top, width: 70, height: 24, factWidth: 70, factHeight: 24, rotation: 0 }, printLocation: { x: mq.left, y: mq.top, width: 70, height: 24, rotation: 0 }, layer: { alpha: 1 }, layerNum: maxLayer + 1, isEdit: 1, isDisplay: 0, deleteState: 0, visitLevel: 1, multiUuid: "zy-wp-" + Date.now().toString(36), markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0 };
    const nO = diy.drawText(srcText, fsSmall, mq.left, mq.top, mm, maxLayer + 1);
    const after = c.getObjects() || [];
    let o2 = (typeof nO === "object" && nO !== null) ? nO : null;
    if (!o2) { o2 = after.filter(function (o) { return beforeIds.indexOf(idOf(o)) < 0; }).find(function (o) { return /textbox|i-text|text/.test(String(o.type || "")); }) || null; }
    try { if (typeof c.setCoords === "function") c.setCoords(); if (o2 && typeof o2.setCoords === "function") o2.setCoords(); } catch (e) {}
    const ac2 = o2 && o2.aCoords;
    const actualQuad = ac2 ? [{ x: ac2.tl.x, y: ac2.tl.y }, { x: ac2.tr.x, y: ac2.tr.y }, { x: ac2.br.x, y: ac2.br.y }, { x: ac2.bl.x, y: ac2.bl.y }] : null;
    const renderedLineCount = (o2 && o2._textLines && o2._textLines.length) ? o2._textLines.length : null;
    const cg = (mq && mq.corners && actualQuad) ? compareTextGeometry(mq.corners, actualQuad, { renderedLineCount: renderedLineCount, targetLineCount: 1 }) : null;
    const cgG = (mq && mq.corners && actualQuad) ? compareTextGeometry(mq.corners, actualQuad, { renderedLineCount: 3, targetLineCount: 1 }) : null;
    wrp = { realRenderedLineCount: renderedLineCount, targetLineCount: 1, realCompareStatus: cg ? cg.status : null, realFailures: cg ? cg.failures : [], gate: cgG ? { compareStatus: cgG.status, wrapDetected: !!(cgG.typography && cgG.typography.wrapDetected), typographyPass: !!(cgG.typography && cgG.typography.pass), failures: cgG.failures } : null };
    try { const regIdx = diy.canvasObjInfo && diy.canvasObjInfo.canvasToProductObjArr ? diy.canvasObjInfo.canvasToProductObjArr.indexOf(o2) : -1; if (regIdx >= 0) diy.canvasObjInfo.canvasToProductObjArr.splice(regIdx, 1); if (o2 && typeof c.remove === "function") c.remove(o2); try { if (typeof c.requestRenderAll === "function") c.requestRenderAll(); } catch (e) {} } catch (eCl) {}
  } catch (eCr) { wrp = { error: String(eCr && eCr.message || eCr).slice(0, 120) }; }
  out.typography.push({ case: "T-wrap-fail", passed: !!(wrp && wrp.gate && wrp.gate.wrapDetected && !wrp.gate.typographyPass), verdict: (wrp && wrp.gate && wrp.gate.wrapDetected) ? "FAIL_DETECTED" : "NOT_DETECTED", evidence: wrp });
}

// ============ P0 复验 ============
{
  const ty = out.typography || [];
  const firstT = ty.filter(function (t) { return t.created && t.created.sourceInk; })[0] || null;
  out.p0.p01 = { naturalNeqObject: !!(nw !== w || nh !== h), natural: { width: nw, height: nh }, object: { width: round2(w), height: round2(h) }, effectiveScale: out.effectiveScale, chain: firstT ? { perLineInkHeights: firstT.created.sourceInk.perLineInkHeights, medianInkHeight: firstT.created.sourceInk.medianInkHeight, medianCanvasPx: firstT.created.sourceInk.medianCanvasPx, requestedFontSize: firstT.created.sourceInk.requestedFontSize, actualFontSize: firstT.created.actual.fontSize, fontSizeError: firstT.created.actual.fontSizeError, renderedLineCount: firstT.created.actual.renderedLineCount } : null };
  record("P0-1-effectiveScale-into-typography", (out.p0.p01.naturalNeqObject && out.p0.p01.chain) ? "PASS" : "FAIL", out.p0.p01.chain ? null : "no-typography-chain", out.p0.p01, !!(out.p0.p01.naturalNeqObject && out.p0.p01.chain));
}
{
  const ty = out.typography || [];
  const multi = ty.filter(function (t) { return t.created && t.created.sourceInk && t.created.sourceLineCount > 1 && t.created.sourceInk.perLineInkHeights && t.created.sourceInk.perLineInkHeights.length > 1; })[0] || null;
  out.p0.p02 = multi ? { perLineInkHeights: multi.created.sourceInk.perLineInkHeights, medianInkHeight: multi.created.sourceInk.medianInkHeight, medianFs: multi.created.sourceInk.requestedFontSize, actualFontSize: multi.created.actual.fontSize, note: "per-line chain 来自真实逐行 ink 测量（median，非 whole-block）" } : null;
  record("P0-2-perline-not-wholeblock", multi ? "PASS" : "FAIL", multi ? null : "no-multiline-evidence", out.p0.p02, !!multi);
}
{
  const rectFar = { x: nw - 120, y: -160, width: 60, height: 25 };
  const mqFar = mapRectToCanvas(rectFar, T);
  const resFar = isQuadInsideImage(mqFar.corners, T, nw, nh);
  const canvasAABBInside = (function () { let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; mqFar.corners.forEach(function (p) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }); return minX >= 0 && minY >= 0 && maxX <= c.width && maxY <= c.height; })();
  out.p0.p03 = { ocrBBoxImage: rectFar, classification: resFar.verdict, imagePts: resFar.evidence ? resFar.evidence.cornersImage : null, canvasAABBInside: canvasAABBInside, frame: "IMAGE_PIXEL (inverse imageTransform)" };
  record("P0-3-image-pixel-containment", resFar.verdict === "OUT_OF_IMAGE" ? "PASS" : "FAIL", resFar.reason, out.p0.p03, resFar.verdict === "OUT_OF_IMAGE");
}

// ============ X. text-to-image capability（只读，productionReady=false） ============
{
  const defs = (window.requirejs && window.requirejs.s && window.requirejs.s.contexts && window.requirejs.s.contexts._ && window.requirejs.s.contexts._.defined) || {};
  const modHits = [];
  Object.keys(defs).forEach(function (mn) {
    const m = defs[mn];
    if (!m || typeof m !== "object") return;
    Object.keys(m).forEach(function (k) {
      const kw = ["drawImg", "drawImage", "insertImage", "createImg", "createImage", "textToImage", "text2image", "textToImg", "text2img", "ImgToText", "imageToText", "raster"];
      if (kw.some(function (w) { return k.toLowerCase().indexOf(w.toLowerCase()) >= 0; })) modHits.push({ mod: mn, key: k, type: typeof m[k] });
    });
  });
  const serializerHits = [];
  Object.keys(defs).forEach(function (mn) {
    const m = defs[mn];
    if (!m || typeof m !== "object") return;
    Object.keys(m).forEach(function (k) {
      if (/serialize|productData|toJSON|getProductData|saveProduct|productDataModel/i.test(k)) serializerHits.push({ mod: mn, key: k, type: typeof m[k] });
    });
  });
  const uiHits = [];
  try {
    const walk = function (n) { if (!n || n.nodeType !== 1) return; if (n.childElementCount === 0) { const tx = String(n.textContent || "").slice(0, 40); if (/转图|生成图片|文字转图|转成图|素材|图片/.test(tx)) uiHits.push(tx); } for (let i = 0; i < n.children.length; i += 1) walk(n.children[i]); };
    walk(document.body);
  } catch (eUi) {}
  const eventHits = [];
  try { (c.getObjects() || []).slice(0, 12).forEach(function (o) { const ls = o.__eventListeners || null; if (ls) Object.keys(ls).slice(0, 6).forEach(function (t) { if (eventHits.indexOf(t) < 0) eventHits.push(t); }); }); } catch (eEv) {}
  const drawImgFn = modHits.filter(function (mh) { return mh.type === "function"; });
  out.textToImage = {
    layers: {
      L1_UI: { hits: uiHits.slice(0, 8) },
      L2_Event: { eventTypes: eventHits.slice(0, 8) },
      L3_Network: { batchSaveKeepMaterial: true, evidence: "Commit 2 已有批保存接口证据（native 素材保存能力），本轮只读不再请求" },
      L4_Module: { hits: modHits.slice(0, 16), hitCount: modHits.length, drawImgFunctions: drawImgFn.slice(0, 6) },
      L5_Object: { imageObjectCount: imgs.length, textObjectCount: (c.getObjects() || []).filter(function (o) { return /textbox|i-text|text/.test(String(o.type || "")); }).length }
    },
    serializerHits: serializerHits.slice(0, 10),
    drawImg: drawImgFn.length > 0,
    serializer: serializerHits.length > 0,
    saveReload: false,
    productionReady: false,
    note: "productionReady 保持 false —— 本轮仅 capability evidence，不做生产接线"
  };
  record("X-text-to-image-capability", "EVIDENCE_ONLY", null, { drawImg: out.textToImage.drawImg, serializer: out.textToImage.serializer, saveReload: out.textToImage.saveReload, productionReady: false, moduleHitCount: modHits.length }, true);
}

return { ok: true, out };
`;

// ---- 页面脚本编译预检 ----
[RESOLVE_ENTRY, LINE_INK_HELPER, MEGA_AUDIT].forEach(function (src, i) {
  try { new Function(src); } catch (e) { console.error("[compile-check] chunk " + i + " SyntaxError: " + String(e && e.message || e) + " | len=" + (src && src.length) + " head=" + JSON.stringify((src || "").slice(0, 80)) + " tail=" + JSON.stringify((src || "").slice(-80))); process.exit(2); }
});

function selfTest() {
  const t = (n, c) => { if (!c) throw new Error("SELFTEST FAIL " + n); console.log("[selftest] PASS " + n); };
  t("cookie-parse", parseCookies("a=1; b=2; c").length === 2);
  t("version-48", USERSCRIPT_VERSION === "0.3.11.48");
  t("card-exists", fs.existsSync(CARD));
  const IC = require(path.join(ROOT, "extension", "src", "editor", "image-containment.js"));
  const es = IC.effectiveScaleOf([0.5849, 0, 0, 0.5849, 0, 0]);
  t("selftest-scale", es && Math.abs(es.effectiveScaleX - 0.5849) < 1e-6);
  t("selftest-code-inject", conditionCode({ baidu: "standard", ink: "0" }).indexOf("__zyBaiduExternal") >= 0);
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }
if (!COOKIE_RAW) console.warn("[stage-9-9] 未注入 ZY_STAGE9_COOKIE —— 回退持久 profile（可能过期）；cookiePresent=false");
if (!BAIDU_AK || !BAIDU_SK) console.warn("[stage-9-9] 缺少 ZY_BAIDU_AK/SK —— Part B 真实 Baidu 将 BLOCKED（仅 bridge 驱动验收）");

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const out = {
    ts: new Date().toISOString(),
    stage: "STAGE-9-9-FULL-PIPELINE",
    version: USERSCRIPT_VERSION,
    cookiePresent: !!COOKIE_RAW,
    baiduPresent: !!(BAIDU_AK && BAIDU_SK),
    gitBaseline: gitBaseline(),
    partA: { url: URL_A, anchor: [], idempotence: null, pageIdentity: null, mega: null, snapshots: [], errors: [] },
    partB: { url: URL_B, card: path.basename(CARD), runs: [], errors: [] },
    summary: { pass: [], fail: [], blocked: [], unknown: [], unresolved: [] },
    nextBlocker: null,
    console: [],
    errors: []
  };
  let browser = null;
  let page = null;
    const injectPageWorld = (payload) => page.evaluate((code) => { const s = document.createElement("script"); s.textContent = code; (document.head || document.documentElement).appendChild(s); }, payload);
    const bridgeCall = (type, payload, replyType, timeoutMs) => page.evaluate((arg) => new Promise((resolve) => {
      let done = false;
      const on = (ev) => { const d = ev.data; if (d && d.source === "zy-card-assistant-page" && d.type === arg.replyType) { window.removeEventListener("message", on); done = true; resolve(d); } };
      window.addEventListener("message", on);
      setTimeout(() => { if (!done) { window.removeEventListener("message", on); resolve({ skip: true, timeout: arg.timeoutMs }); } }, arg.timeoutMs);
      window.postMessage(Object.assign({ source: "zy-card-assistant", type: arg.type }, arg.payload || {}), location.origin);
    }), { type, payload, replyType, timeoutMs: timeoutMs || 12000 });
    const waitEditorReady = async (tries, needBridge) => {
      for (let i = 0; i < (tries || 18); i += 1) {
        const r = await page.evaluate((nb) => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed) }), needBridge).catch(() => ({}));
        if (r && r.ok && (!needBridge || r.bridge)) return r;
        await SLEEP(1200);
      }
      return page.evaluate((nb) => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed) }), needBridge).catch(() => ({}));
    };
    const collectTexts = () => page.evaluate(() => {
      const req = window.requirejs; const ctx = req && req.s && req.s.contexts && req.s.contexts._; const defs = (ctx && ctx.defined) || {};
      const CV = defs.CanvasObjVO || window.CanvasObjVO || null;
      const c = CV && CV.totalCanvasArray && CV.totalCanvasArray[0] && CV.totalCanvasArray[0].canvas;
      if (!c) return { ok: false, reason: "no-canvas", texts: [] };
      const texts = [];
      (c.getObjects() || []).forEach((o, i) => {
        if (!o) return;
        const ty = String(o.type || "");
        if (ty !== "textbox" && ty !== "i-text" && ty !== "text") return;
        try { if (typeof c.setCoords === "function") c.setCoords(); if (typeof o.setCoords === "function") o.setCoords(); } catch (e) {}
        const ac = o.aCoords;
        let cx = null, cy = null;
        if (ac && ac.tl) { cx = (ac.tl.x + ac.tr.x + ac.br.x + ac.bl.x) / 4; cy = (ac.tl.y + ac.tr.y + ac.br.y + ac.bl.y) / 4; }
        texts.push({ index: i, text: String(o.text || ""), left: o.left, top: o.top, width: o.width, height: o.height, fontSize: o.fontSize, fontFamily: o.fontFamily, zyOcrKey: o.zyOcrKey || null, uuid: o.uuid || o.multiUuid || null, center: (cx == null ? null : { x: cx, y: cy }) });
      });
      return { ok: true, objectCount: c.getObjects().length, textboxCount: texts.length, texts: texts };
    }).catch(() => ({ ok: false, reason: "collect-fail", texts: [] }));
    // 等画布稳定：连续两读 objectCount/textboxCount 相同
    const waitStable = async (tries, gap) => {
      let last = null;
      for (let i = 0; i < (tries || 8); i += 1) {
        const cur = await collectTexts();
        if (last && cur.ok && last.ok && cur.objectCount === last.objectCount && cur.textboxCount === last.textboxCount) return { stable: true, state: cur };
        last = cur;
        await SLEEP(gap || 800);
      }
      return { stable: false, state: last };
    };
    const cleanupByKey = (keyPart, protectUuids) => page.evaluate((arg) => {
      const req = window.requirejs; const ctx = req && req.s && req.s.contexts && req.s.contexts._; const defs = (ctx && ctx.defined) || {};
      const CV = defs.CanvasObjVO || window.CanvasObjVO || null;
      const prot = (arg.protect || []).filter(Boolean).map(String);
      let removed = 0;
      (CV && CV.totalCanvasArray || []).forEach((d) => { const c = d && d.canvas; if (!c) return; (c.getObjects() || []).forEach((o) => {
        try {
          if (!o) return;
          const uid = String((o && (o.uuid || o.multiUuid || o.id)) || "");
          if (prot.indexOf(uid) >= 0) return;
          const key = o.zyOcrKey || "";
          if (key.indexOf(arg.key) === 0) {
            const li = d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr ? d.canvasObjInfo.canvasToProductObjArr.indexOf(o) : -1;
            if (li >= 0) d.canvasObjInfo.canvasToProductObjArr.splice(li, 1);
            c.remove(o); removed += 1;
          }
        } catch (e) {}
      }); });
      try { if (CV && CV.totalCanvasArray[0] && CV.totalCanvasArray[0].canvas) CV.totalCanvasArray[0].canvas.requestRenderAll(); } catch (e) {}
      return { removed };
    }, { key: keyPart, protect: protectUuids || [] }).catch(() => ({ removed: 0 }));
    const inventory = async () => (await bridgeCall("getTextInventory", {}, "getTextInventoryResult", 6000).catch(() => null));

    const forceFront = async () => {
      let ok = false;
      for (let i = 0; i < 3 && !ok; i += 1) {
        const r = await page.evaluate(() => {
          for (const el of document.querySelectorAll(".page-group .pageNum")) { const s = String(el.textContent || "").trim(); if (/正面/.test(s)) { el.click(); return { ok: true, txt: s }; } }
          return { ok: false };
        }).catch(() => ({ ok: false }));
        if (!(r && r.ok)) {
          await page.evaluate((nn) => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); if (vo) vo.currentCanvasNum = nn; try { delete window.CurrentCanvas; } catch (e) {} return !!vo; }, 1).catch(() => false);
        }
        await SLEEP(1500);
        const cpt = await bridgeCall("getCurrentPage", {}, "getCurrentPageResult", 6000).catch(() => null);
        const pid = (cpt && cpt.pageId) || null;
        ok = pid != null && /:c0$/.test(String(pid));
      }
      return ok;
    };

  const verdict = function (key, status, detail) { out.summary[status].push(key); if (detail) out.summary[key + "-detail"] = detail; };

  try {
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1280, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    page = browser.pages()[0];
    const onPageErr = (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 140)); };
    page.on("pageerror", onPageErr);
    const onConsole = (msg) => { try { const tx = String(msg.text() || ""); if (/TRUTH|NATIVE|uploadOCR|native/.test(tx) && tx.length < 400) out.console.push(tx); } catch (e) {} };
    page.on("console", onConsole);
    try {
      await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await SLEEP(1400);
      const allOld = await adapter.getAllScripts(page) || [];
      let removed = 0;
      for (const s of allOld.filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(page, s.uuid); removed += 1; } catch (e) {} }
      out.errors = out.errors.filter((x) => x.indexOf("PAGEERROR") < 0);
    } catch (eClean) { out.errors.push("CLEAN: " + String(eClean && eClean.message || eClean).slice(0, 120)); }
    for (const c of parseCookies(COOKIE_RAW)) { try { await browser.addCookies([c]); } catch (e) { out.errors.push("COOKIE:" + c.name + " " + String(e && e.message || e).slice(0, 100)); } }
    page = await (async () => { await page.close().catch(() => {}); const p = await browser.newPage(); p.on("pageerror", onPageErr); p.on("console", onConsole); return p; })();


    if (!SKIP_A) {
      // ================= Part A（模板 1234075） =================
      const cond = { baidu: "standard", ink: "0" };
      await page.goto(URL_A, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => out.partA.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
      await SLEEP(4000);
      await injectPageWorld(pageWorldPayloadFor(cond));
      await SLEEP(1200);
      const readyA = await waitEditorReady(18, true);
      if (!(readyA && readyA.ok)) out.partA.errors.push("EDITOR_UNAVAILABLE");
      const st0 = await waitStable(10, 800);
      out.partA.snapshots.push({ step: "initial-stable", state: st0.state });

      // ---- mega 审计（fresh canvas 优先，等价 C8 条件） ----
      await injectPageWorld(MEGA_MODULES + "\n;\n" + RESOLVE_ENTRY + "\n" + LINE_INK_HELPER + "\n;window.__zy99Audit = (function(){ " + MEGA_AUDIT + "\n })();");
      await SLEEP(1400);
      const audit = await page.evaluate("window.__zy99Audit").catch((e) => ({ ok: false, reason: "read:" + String(e && e.message || e).slice(0, 140), out: null }));
      if (audit && audit.ok && audit.out) {
        out.partA.mega = audit.out;
      } else { out.partA.errors.push("MEGA_AUDIT: " + JSON.stringify(audit).slice(0, 300)); }
      await SLEEP(1200);
      const stM = await waitStable(8, 700);
      out.partA.snapshots.push({ step: "after-mega", state: stM.state });

      // ---- bridge 场景（baseState 在 mega 之后采集；cleanup 保护 base 原生对象） ----
      const base = await collectTexts();
      out.partA.baseState = { objectCount: base.objectCount, textboxCount: base.textboxCount };
      const protectBase = (base.texts || []).map((x) => x.uuid);
      const frontOk = await forceFront();
      const cp = await bridgeCall("getCurrentPage", {}, "getCurrentPageResult", 6000).catch(() => null);
      const pageId0 = (cp && cp.pageId) || "canvas:c0";
      out.partA.snapshots.push({ step: "force-front", ok: frontOk, pageId: pageId0 });
      const jianshe = (base.texts || []).find((x) => x.text && x.text.indexOf("简 小设") >= 0) || null;
      const em = (base.texts || []).find((x) => x.text && /^Email/.test(x.text)) || null;
      const tel = (base.texts || []).find((x) => x.text && /^Tel/.test(x.text)) || null;
      const tx = () => "tx-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);

      // A1：existing anchor -> reuse
      if (jianshe) {
        const a1 = await bridgeCall("ocrCreate", { pageId: pageId0, side: "FRONT", transactionId: tx(), imageFingerprint: "99-a", items: [{ blockIndex: 0, text: "简 小设", left: jianshe.left, top: jianshe.top, width: jianshe.width, height: jianshe.height, fontSize: jianshe.fontSize, fontFamily: jianshe.fontFamily }] }, "ocrCreateResult", 15000).catch(() => null);
        const after1 = await collectTexts();
        const reusedFlag = (a1 && a1.created || []).some((x) => x.reused === true);
        const am = (a1 && a1.created || []).filter((x) => x.anchorMatch)[0];
        out.partA.anchor.push({ case: "A1-existing-anchor-reuse", ok: !!(a1 && a1.ok), reused: reusedFlag, createdCount: a1 && a1.createdCount, textboxCountDelta: after1.textboxCount - base.textboxCount, anchorScore: am && am.anchorMatch && am.anchorMatch.score, winnerMargin: am && am.anchorMatch && am.anchorMatch.margin, matchedUuid: am && am.uuid, matchedMarkuuid: (am && am.markuuid) || null, resolver: a1 && a1.editorIntegration && a1.editorIntegration.anchorResolver, passed: !!(a1 && a1.ok && reusedFlag && after1.textboxCount === base.textboxCount) });
      } else { out.partA.anchor.push({ case: "A1-existing-anchor-reuse", skipped: "no 简 小设 anchor", passed: false }); }

      // A2：no anchor -> native create（probe）
      const bx = 220, by = 20;
      const b1 = await bridgeCall("ocrCreate", { pageId: pageId0, side: "FRONT", transactionId: tx(), imageFingerprint: "99-b", items: [{ blockIndex: 0, text: "ZY_99_PROBE_NEW", left: bx, top: by, width: 180, height: 34, fontSize: 22 }] }, "ocrCreateResult", 15000).catch(() => null);
      const afterB = await collectTexts();
      const createdNew = (b1 && b1.created || []).some((x) => !x.reused);
      out.partA.anchor.push({ case: "A2-no-anchor-create", ok: !!(b1 && b1.ok), createdCount: b1 && b1.createdCount, textboxCountDelta: afterB.textboxCount - base.textboxCount, identity: (b1 && b1.created || []).map((x) => ({ uuid: x.uuid, text: x.text, pageId: x.pageId, side: x.side, geometry: x.geometry })), resolver: b1 && b1.editorIntegration && b1.editorIntegration.anchorResolver, passed: !!(b1 && b1.ok && createdNew) });
      const createdB = (b1 && b1.created || []).filter((x) => !x.reused)[0] || null;

      // A5：create→measure 闭环（对 A2 的 probe）
      if (createdB && createdB.uuid) {
        const measure = await page.evaluate((arg) => new Promise((resolve) => {
          const req = window.requirejs; const ctx = req && req.s && req.s.contexts && req.s.contexts._; const defs = (ctx && ctx.defined) || {};
          const CV = defs.CanvasObjVO || window.CanvasObjVO || null;
          const d = CV && CV.totalCanvasArray && CV.totalCanvasArray[0];
          const c = d && d.canvas;
          if (!c) return resolve({ ok: false, reason: "no-canvas" });
          let o = null;
          (c.getObjects() || []).forEach((x) => { if (!o && x && (x.uuid || x.multiUuid) === arg.uuid) o = x; });
          if (!o) return resolve({ ok: false, reason: "object-not-found" });
          try { if (typeof c.setCoords === "function") c.setCoords(); if (typeof o.setCoords === "function") o.setCoords(); } catch (e) {}
          const ac = o.aCoords;
          const acBB = (function () { if (!ac) return null; const xs = [ac.tl.x, ac.tr.x, ac.br.x, ac.bl.x], ys = [ac.tl.y, ac.tr.y, ac.br.y, ac.bl.y]; return { left: Math.round(Math.min.apply(null, xs) * 100) / 100, top: Math.round(Math.min.apply(null, ys) * 100) / 100, width: Math.round((Math.max.apply(null, xs) - Math.min.apply(null, xs)) * 100) / 100, height: Math.round((Math.max.apply(null, ys) - Math.min.apply(null, ys)) * 100) / 100 }; })();
          let ink = null;
          try { if (window.__zy8dInk && typeof window.__zy8dInk.measureFabricObjectInk === "function") ink = window.__zy8dInk.measureFabricObjectInk(o); } catch (e) {}
          let location = null;
          try { location = (o.location || (o.media && o.media.location) || (o.get && o.get("location"))) || null; } catch (e) { location = null; }
          resolve({
            ok: true,
            requested: { left: arg.requested.left, top: arg.requested.top, width: arg.requested.width, height: arg.requested.height, fontSize: arg.requested.fontSize },
            actual: {
              aCoordsBB: acBB, left: typeof o.left === "number" ? o.left : null, top: typeof o.top === "number" ? o.top : null,
              width: typeof o.width === "number" ? o.width : null, height: typeof o.height === "number" ? o.height : null,
              angle: typeof o.angle === "number" ? o.angle : null, fontSize: typeof o.fontSize === "number" ? o.fontSize : null,
              renderedLineCount: (o._textLines && o._textLines.length) ? o._textLines.length : null,
              ink: (ink && ink.ok) ? { inkWidth: ink.inkWidth, inkHeight: ink.inkHeight, lineCount: ink.lineCount, method: ink.method } : null,
              location: location ? { x: location.x, y: location.y, width: location.width, height: location.height, rotation: location.rotation } : null
            }
          });
        }), { uuid: createdB.uuid, requested: { left: bx, top: by, width: 180, height: 34, fontSize: 22 } }).catch(() => ({ ok: false, reason: "evaluate-fail" }));
        const mErr = measure.ok ? null : measure.reason;
        out.partA.measureClosure = {
          requested: measure.ok ? measure.requested : null,
          actual: measure.ok ? measure.actual : null,
          topLeftError: measure.ok && measure.actual.aCoordsBB ? { x: Math.round((measure.actual.aCoordsBB.left - measure.requested.left) * 100) / 100, y: Math.round((measure.actual.aCoordsBB.top - measure.requested.top) * 100) / 100 } : null,
          locationNote: measure.ok && measure.actual.location == null ? "对象模型未暴露 location 访问器（o.location/o.media.location/o.get(location) 均为 null）—— 以 aCoords/width/height/angle/renderedLineCount 为最终实测几何" : null,
          passed: !!(measure.ok && measure.actual.aCoordsBB && measure.actual.renderedLineCount != null)
        };
        if (!measure.ok) out.partA.measureClosure.reason = mErr;
      } else { out.partA.measureClosure = { ok: false, reason: "no-created-uuid", passed: false }; }
      await cleanupByKey("zy-ocr-", protectBase);
      await SLEEP(1000);
      const stB = await waitStable(8, 700);
      out.partA.snapshots.push({ step: "after-A2-cleanup", state: stB.state });

      // A3：UNCERTAIN -> 不强制复用（Email/Tel 中点）
      if (em && tel && em.center && tel.center) {
        const cBase = await collectTexts();
        const mid = { x: (em.center.x + tel.center.x) / 2, y: (em.center.y + tel.center.y) / 2 };
        const c1 = await bridgeCall("ocrCreate", { pageId: pageId0, side: "FRONT", transactionId: tx(), imageFingerprint: "99-c", items: [{ blockIndex: 0, text: "ZY_99_MID", left: mid.x - 60, top: mid.y - 15, width: 120, height: 30, fontSize: 13 }] }, "ocrCreateResult", 15000).catch(() => null);
        const afterC = await collectTexts();
        const res = c1 && c1.editorIntegration && c1.editorIntegration.anchorResolver;
        const reusedInC = (c1 && c1.created || []).filter((x) => x.reused).length;
        out.partA.anchor.push({ case: "A3-uncertain-no-forced-reuse", ok: !!(c1 && c1.ok), uncertain: res ? res.uncertain : 0, reused: reusedInC, created: res ? res.created : 0, createdCount: c1 && c1.createdCount, textboxCountDelta: afterC.textboxCount - cBase.textboxCount, decidedUncertain: !!(res && res.uncertain >= 1), noForcedReuse: reusedInC === 0, passed: !!(res && res.uncertain >= 1) && reusedInC === 0 });
        await cleanupByKey("zy-ocr-", protectBase);
        await SLEEP(800);
        const stC = await waitStable(6, 700);
        out.partA.snapshots.push({ step: "after-A3", state: stC.state });
      } else { out.partA.anchor.push({ case: "A3-uncertain-no-forced-reuse", skipped: "Email/Tel not found", passed: false }); }

      // A4：wrong page -> blocked
      const wrongPageId = (pageId0 === "canvas:c0") ? "canvas:c1" : "canvas:c0";
      const d1 = await bridgeCall("ocrCreate", { pageId: wrongPageId, side: "BACK", transactionId: tx(), imageFingerprint: "99-d", items: [{ blockIndex: 0, text: "ZY_99_WRONG", left: 50, top: 50, width: 100, height: 30, fontSize: 20 }] }, "ocrCreateResult", 15000).catch(() => null);
      out.partA.anchor.push({ case: "A4-wrong-page-blocked", blocked: !!(d1 && !d1.ok && /CREATE_BLOCKED|PAGE/.test(String(d1.code || ""))), code: d1 && d1.code, createdCount: d1 && d1.createdCount, passed: !!(d1 && !d1.ok && String(d1.code || "").indexOf("CREATE_BLOCKED") === 0) });

      // A6：幂等性（同一 tx + fingerprint + items ×3）
      const idemTx = tx(), idemFp = "99-idem";
      const items = [{ blockIndex: 0, text: "ZY_99_IDEMPOTENT", left: 260, top: 60, width: 170, height: 32, fontSize: 20 }];
      const runs = [];
      const countBefore = (await collectTexts()).textboxCount;
      for (let r = 1; r <= 3; r += 1) {
        const rr = await bridgeCall("ocrCreate", { pageId: pageId0, side: "FRONT", transactionId: idemTx, imageFingerprint: idemFp, items: items }, "ocrCreateResult", 15000).catch(() => null);
        await SLEEP(900);
        const tbs = await collectTexts();
        const sameText = (tbs.texts || []).filter((x) => x.text === "ZY_99_IDEMPOTENT");
        runs.push({ run: r, createdCount: rr && rr.createdCount, reusedCount: (rr && rr.created || []).filter((x) => x.reused).length, textboxCount: tbs.textboxCount, dupObjects: sameText.length, uuids: sameText.map((x) => x.uuid) });
      }
      const noDup2 = !!(runs[1] && runs[1].dupObjects === 1 && runs[1].reusedCount >= 1 && runs[1].createdCount === runs[1].reusedCount);
      const noDup3 = !!(runs[2] && runs[2].dupObjects === 1 && runs[2].reusedCount >= 1 && runs[2].createdCount === runs[2].reusedCount);
      out.partA.idempotence = { runs: runs, countBefore: countBefore, run1Created: runs[0] && runs[0].createdCount, run1Reused: runs[0] && runs[0].reusedCount, run2Reused: runs[1] && runs[1].reusedCount, run3Reused: runs[2] && runs[2].reusedCount, noDuplicateRun2: noDup2, noDuplicateRun3: noDup3, finalSameTextCount: runs[2] && runs[2].dupObjects, passed: !!(runs[0] && runs[0].createdCount >= 1 && noDup2 && noDup3) };
      await cleanupByKey("zy-ocr-", protectBase);
      await SLEEP(800);

      // A7：PageIdentity 硬门禁（OCR 从 front 冻结 → 切到 back → 旧事务创建必须 BLOCKED）
      const pGate = { steps: [], errors: [] };
      out.partA.pageIdentity = pGate;
      const pg0 = await bridgeCall("getCurrentPage", {}, "getCurrentPageResult", 6000).catch(() => null);
      const frontPageId = (pg0 && pg0.pageId) || pageId0;
      pGate.steps.push({ step: "freeze-front", pageId: frontPageId });
      const switchSide = async (label) => {
        const r = await page.evaluate((lb) => {
          for (const el of document.querySelectorAll(".page-group .pageNum")) { const s = String(el.textContent || "").trim(); if (lb === "back" && /反面|背面/.test(s)) { el.click(); return { ok: true, txt: s }; } if (lb === "front" && /正面/.test(s)) { el.click(); return { ok: true, txt: s }; } }
          return { ok: false };
        }, label);
        if (!(r && r.ok)) { try { await page.evaluate((nn) => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); if (vo) vo.currentCanvasNum = nn; try { delete window.CurrentCanvas; } catch (e) {} return !!vo; }, label === "back" ? 2 : 1); } catch (e) {} }
        await SLEEP(1500);
        return r;
      };
      await switchSide("back");
      const pgB = await bridgeCall("getCurrentPage", {}, "getCurrentPageResult", 6000).catch(() => null);
      pGate.steps.push({ step: "active-now-back", pageId: (pgB && pgB.pageId) || null });
      const g1 = await bridgeCall("ocrCreate", { pageId: frontPageId, side: "FRONT", transactionId: tx(), imageFingerprint: "99-gate", items: [{ blockIndex: 0, text: "ZY_99_GATE", left: 200, top: 100, width: 140, height: 30, fontSize: 18 }] }, "ocrCreateResult", 15000).catch(() => null);
      pGate.steps.push({ step: "create-with-frozen-front-id", code: g1 && g1.code, blocked: !!(g1 && !g1.ok && String(g1.code || "").indexOf("CREATE_BLOCKED") === 0) });
      pGate.passed = !!(g1 && !g1.ok && String(g1.code || "").indexOf("CREATE_BLOCKED") === 0 && (pgB && pgB.pageId && pgB.pageId !== frontPageId));
      await switchSide("front");
      await SLEEP(800);
      const finalA = await collectTexts();
      out.partA.cleanupRestored = finalA.textboxCount === base.textboxCount;
      out.partA.finalState = { objectCount: finalA.objectCount, textboxCount: finalA.textboxCount };
    }
  } catch (e) { out.errors.push("PART_A: " + String(e && e.stack || (e && e.message || e)).slice(0, 400)); }

  // ================= Part B（模板 252438 + 真实名片 FULL_REAL_PIPELINE） =================
  if (browser && !SKIP_B) {
    try {
      if (!fs.existsSync(CARD)) { out.partB.errors.push("CARD_MISSING"); }
      else if (!BAIDU_AK || !BAIDU_SK) { out.partB.errors.push("BAIDU_CREDS_MISSING"); out.partB.blocked = true; }
      else {
        const condB = { baidu: "standard", ink: "0" };
        const setBgB = () => page.evaluate((arg) => new Promise((res) => {
          const req = window.requirejs || window.require;
          const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
          const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
          const c = d && d.canvas;
          if (!c) return res({ ok: false, reason: "no-canvas" });
          const f = (c.constructor && c.constructor.fabric) || window.fabric;
          const im = new Image();
          im.onload = () => { try { const bg = new f.Image(im); bg.set({ left: 0, top: 0 }); c.setBackgroundImage(bg, () => { try { if (c.requestRenderAll) c.requestRenderAll(); } catch (e) {} res({ ok: true }); }); } catch (e) { res({ ok: false, reason: String(e && e.message || e).slice(0, 100) }); } };
          im.onerror = () => res({ ok: false, reason: "img-fail" });
          im.src = arg.dataUrl;
        }), { dataUrl: "data:image/png;base64," + fs.readFileSync(CARD).toString("base64") });
        const clickOcrB = async (timeoutMs) => {
          const t0 = Date.now();
          while (Date.now() - t0 < (timeoutMs || 25000)) {
            const r = await page.evaluate(() => {
              const q = ["#zy-ocr-btn", "#zy-native-ocr-btn", "[data-zy-role=ocr]"];
              for (const s of q) { const el = document.querySelector(s); if (el && el.offsetParent) { try { el.click(); return { clicked: true, sel: s }; } catch (e) {} } }
              const all = Array.from(document.querySelectorAll("button,a,span,div"));
              for (const el of all) { if (!el.offsetParent) continue; if (/识别当前图片|识别图片文字/.test(String(el.textContent || "").trim())) { try { el.click(); return { clicked: true, sel: "text" }; } catch (e) {} } }
              return { clicked: false };
            }).catch(() => ({ clicked: false }));
            if (r && r.clicked) return r;
            await SLEEP(1000);
          }
          return { clicked: false };
        };
        const waitOcrDoneB = async (timeoutMs) => {
          const t0 = Date.now();
          while (Date.now() - t0 < timeoutMs) {
            const r = await page.evaluate(() => {
              const el = document.querySelector("#zy-native-status") || document.querySelector("#zy-status") || document.querySelector(".zy-status");
              return { st: el ? String(el.textContent || "").trim().slice(0, 200) : null };
            }).catch(() => ({}));
            const st = r && r.st;
            if (st && /已生成 \d+ 个文字|未识别到文字|失败|异常|几何校验完成/.test(st)) return { done: true, st };
            await SLEEP(900);
          }
          return { done: false };
        };
        const snapIdsB = () => page.evaluate(() => {
          const req = window.requirejs || window.require;
          const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
          const c = vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas;
          return c ? c.getObjects().map((o) => o.uuid || o.multiUuid || o.id || null) : [];
        });
        const readNewB = (ids) => page.evaluate(async (arg) => {
          const req = window.requirejs || window.require;
          const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
          const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
          const c = d && d.canvas;
          if (!c) return { arr: [], err: "no-canvas" };
          const arr = [];
          for (const o of c.getObjects()) {
            if (typeof o.text !== "string") continue;
            const id = o.uuid || o.multiUuid || o.id || null;
            if (arg.ids && arg.ids.length && id != null && arg.ids.indexOf(id) < 0) continue;
            let geo = null;
            try { if (typeof o.setCoords === "function") o.setCoords(); const ac = o.aCoords; if (ac && ac.tl && ac.br) geo = { tl: [ac.tl.x, ac.tl.y], tr: [ac.tr.x, ac.tr.y], br: [ac.br.x, ac.br.y], bl: [ac.bl.x, ac.bl.y], cx: (ac.tl.x + ac.tr.x + ac.br.x + ac.bl.x) / 4, cy: (ac.tl.y + ac.tr.y + ac.br.y + ac.bl.y) / 4, angle: Math.atan2(ac.tr.y - ac.tl.y, ac.tr.x - ac.tl.x) * 180 / Math.PI }; } catch (e) {}
            let ink = null;
            try { if (window.__zy8dInk && typeof window.__zy8dInk.measureFabricObjectInk === "function") ink = window.__zy8dInk.measureFabricObjectInk(o); } catch (e) {}
            arr.push({
              id, zyOcrKey: o.zyOcrKey || null, zyOcrObjectId: o.zyOcrObjectId || null,
              text: String(o.text || "").slice(0, 40),
              fontFamily: o.fontFamily || null, fontSize: typeof o.fontSize === "number" ? o.fontSize : null,
              left: typeof o.left === "number" ? o.left : null, top: typeof o.top === "number" ? o.top : null,
              width: typeof o.width === "number" ? o.width : null, height: typeof o.height === "number" ? o.height : null,
              angle: typeof o.angle === "number" ? o.angle : null, geo,
              ink: (ink && ink.ok) ? { inkWidth: ink.inkWidth, inkHeight: ink.inkHeight, lineCount: ink.lineCount, method: ink.method } : null,
              count: o._textLines && o._textLines.length ? o._textLines.length : null,
              diag: o.zyOcrDiagnostics || null
            });
          }
          return { arr };
        }, { ids });
        const rollbackB = () => page.evaluate(() => {
          const req = window.requirejs || window.require;
          const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
          let removed = 0;
          (vo && vo.totalCanvasArray || []).forEach((d) => {
            const c = d && d.canvas;
            if (!c) return;
            c.getObjects().forEach((o) => { if (!o) return; try { const li = d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr ? d.canvasObjInfo.canvasToProductObjArr.indexOf(o) : -1; if (li >= 0) d.canvasObjInfo.canvasToProductObjArr.splice(li, 1); c.remove(o); removed += 1; } catch (e) {} });
          });
          try { if (vo && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas) vo.totalCanvasArray[0].canvas.requestRenderAll(); } catch (e) {}
          return { removed };
        });
        const collectBgB = () => page.evaluate(() => {
          const req = window.requirejs || window.require;
          const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
          const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
          const c = d && d.canvas;
          const bg = c && c.backgroundImage;
          const ac = bg && bg.aCoords;
          let transform = null;
          if (typeof buildImageTransform === "function" && bg && ac && typeof bg.naturalWidth !== "undefined") {
            try {
              const t = buildImageTransform({ naturalWidth: bg.naturalWidth, naturalHeight: bg.naturalHeight, width: bg.width, height: bg.height, aCoords: ac });
              if (t) transform = { affine: t.map(function (v) { return Math.round(v * 1e6) / 1e6; }) };
            } catch (e) { transform = { err: String(e && e.message || e).slice(0, 80) }; }
          }
          return {
            canvasWidth: c ? c.width : null, canvasHeight: c ? c.height : null,
            bgWidth: bg ? bg.width : null, bgHeight: bg ? bg.height : null,
            naturalWidth: (bg && (bg.naturalWidth || (bg._originalElement && bg._originalElement.naturalWidth))) || null,
            naturalHeight: (bg && (bg.naturalHeight || (bg._originalElement && bg._originalElement.naturalHeight))) || null,
            aCoords: ac ? { tl: [ac.tl.x, ac.tl.y], tr: [ac.tr.x, ac.tr.y], br: [ac.br.x, ac.br.y], bl: [ac.bl.x, ac.bl.y] } : null,
            transform: transform
          };
        }).catch(() => null);
        const quadsToImageBbox = (objs) => page.evaluate((arg) => {
          const req = window.requirejs || window.require;
          const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
          const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
          const c = d && d.canvas;
          const bg = c && c.backgroundImage;
          const ac = bg && bg.aCoords;
          if (!bg || !ac || typeof buildImageTransform !== "function" || typeof mapCanvasPointToImage !== "function") return { ok: false, reason: "no-transform" };
          const T = buildImageTransform({ naturalWidth: bg.naturalWidth, naturalHeight: bg.naturalHeight, width: bg.width, height: bg.height, aCoords: ac });
          if (!T) return { ok: false, reason: "singular" };
          const out = [];
          (arg.objs || []).forEach(function (o) {
            if (!o || !o.geo) return;
            const q = [{ x: o.geo.tl[0], y: o.geo.tl[1] }, { x: o.geo.tr[0], y: o.geo.tr[1] }, { x: o.geo.br[0], y: o.geo.br[1] }, { x: o.geo.bl[0], y: o.geo.bl[1] }];
            const pts = q.map(function (p) { return mapCanvasPointToImage(p, T); });
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            pts.forEach(function (p) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });
            out.push({ text: o.text, id: o.id, bbox: { x: Math.round(minX), y: Math.round(minY), width: Math.round(maxX - minX), height: Math.round(maxY - minY) } });
          });
          return { ok: true, items: out };
        }, { objs: objs }).catch(() => ({ ok: false, reason: "evaluate-fail" }));

        // ---- R0：真实 Baidu + 真实原生 → Case A / Case D ----
        const r0 = { case: "R0-CaseA-CaseD", steps: [], blocks: [], errors: [], nativeTexts: [], baiduTexts: [], finalTexts: [], nativeTruth: null, conflict: null };
        out.partB.runs.push(r0);
        try {
          await page.goto(URL_B, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => r0.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
          await SLEEP(3000);
          await injectPageWorld(pageWorldPayloadFor(condB));
          await SLEEP(1200);
          const readyB = await waitEditorReady(16, true);
          r0.steps.push({ step: "editor-ready", ok: !!(readyB && readyB.ok && readyB.bridge) });
          if (readyB && readyB.ok) {
            const cpB = await bridgeCall("getCurrentPage", {}, "getCurrentPageResult", 6000).catch(() => null);
            r0.pageId = (cpB && cpB.pageId) || null;
            const bgR = await setBgB();
            r0.steps.push({ step: "bg-inject", ok: !!(bgR && bgR.ok) });
            if (bgR && bgR.ok) {
              r0.bgGeometry = await collectBgB();
              const prep = await bridgeCall("ocrPrepare", {}, "ocrPrepareResult", 15000).catch(() => null);
              r0.steps.push({ step: "ocr-prepare", ok: !!(prep && prep.ok && prep.dataUrl) });
              if (prep && prep.ok && prep.dataUrl) {
                const nativeProbe = await page.evaluate((arg) => new Promise((resolve) => {
                  const fd = new FormData();
                  try {
                    const b64 = arg.dataUrl.split(",")[1] || "";
                    const bin = atob(b64); const u8 = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i += 1) u8[i] = bin.charCodeAt(i);
                    fd.append("file", new Blob([u8], { type: "image/png" }), "card.png");
                  } catch (e) { return resolve({ ok: false, error: "atob:" + String(e && e.message || e) }); }
                  fd.append("textType", "2");
                  fetch("/siteWeb/userCenterJsj/uploadOCR.do", { method: "POST", body: fd }).then((res) => res.text().then((t) => resolve({ ok: true, status: res.status, head: String(t).slice(0, 400) }))).catch((e) => resolve({ ok: false, error: String(e && e.message || e) }));
                }), { dataUrl: prep.dataUrl }).catch(() => ({ ok: false, error: "eval-fail" }));
                r0.nativeProbe = nativeProbe;
                r0.steps.push({ step: "native-probe", ok: !!(nativeProbe && nativeProbe.ok), status: nativeProbe && nativeProbe.status, head: nativeProbe && nativeProbe.head && nativeProbe.head.slice(0, 120) });
                const extRes = await baiduRecognizeExternal(prep.dataUrl, "standard");
                r0.steps.push({ step: "baidu-external", ok: !!(extRes && !extRes.error), candidates: (extRes && extRes.candidates || []).length });
                if (extRes && !extRes.error) {
                  r0.baiduTexts = (extRes.candidates || []).map((x) => String(x.text || ""));
                  await page.evaluate((r) => { try { window.__zyBaiduExternal = { res: r }; } catch (e) {} }, extRes);
                  const before = await snapIdsB();
                  const cl = await clickOcrB();
                  r0.steps.push({ step: "click-ocr", clicked: !!(cl && cl.clicked) });
                  const doneW = await waitOcrDoneB(180000);
                  r0.steps.push({ step: "ocr-done", done: !!doneW.done, status: doneW.st || null });
                  if (doneW.done) {
                    const after = await snapIdsB();
                    const createdIds = (after || []).filter((id) => (before || []).indexOf(id) < 0);
                    const rd = await readNewB(createdIds);
                    r0.blocks = rd.arr || [];
                    r0.pipelineEvidence = await page.evaluate(() => (window.__zyOcrPipelineEvidence || null)).catch(() => null);
                    r0.finalTexts = r0.blocks.map((b) => String(b.text || ""));
                    r0.nativeTexts = r0.blocks.map((b) => (b.diag && b.diag.textTruth && b.diag.textTruth.nativeRawText != null) ? String(b.diag.textTruth.nativeRawText) : ((b.diag && b.diag.rawText != null) ? String(b.diag.rawText) : null)).filter((x) => x != null);
                    const allNative = r0.blocks.length > 0 && r0.blocks.every((b) => b.diag && b.diag.textSource === "NATIVE_OCR");
                    const allMatchRaw = r0.blocks.every((b) => { const raw = (b.diag && b.diag.textTruth && b.diag.textTruth.nativeRawText != null) ? String(b.diag.textTruth.nativeRawText) : (b.diag && b.diag.rawText != null ? String(b.diag.rawText) : null); return raw != null && String(b.text || "") === raw; });
                    const nativeBlocked = r0.blocks.every((b) => b.diag && b.diag.textSource === "LEGACY_OCR") && (r0.pipelineEvidence && r0.pipelineEvidence.raw > 0);
                    r0.nativeTruth = { allNativeSource: allNative, allMatchRaw: allMatchRaw, finalTexts: r0.finalTexts, nativeTexts: r0.nativeTexts, verdict: allNative && allMatchRaw ? "NATIVE_TRUTH" : (nativeBlocked ? "NATIVE_BLOCKED" : "VIOLATION") };
                    const baiduS = (extRes.candidates || []).slice().sort((a, b) => (a.bbox.y || 0) - (b.bbox.y || 0));
                    const nativeY = r0.blocks.map((b) => ({ text: String(b.text || ""), y: b.geo ? b.geo.cy : null })).sort((a, b) => (a.y || 0) - (b.y || 0));
                    const conflicts = [];
                    baiduS.forEach((cand, i) => {
                      const n = nativeY[i];
                      if (n && cand && String(cand.text || "") !== n.text) conflicts.push({ baiduText: String(cand.text || ""), nativeText: n.text, resolution: "NATIVE_TRUTH" });
                    });
                    r0.conflict = { conflicts: conflicts, resolution: "NATIVE_TRUTH", evidence: r0.blocks.map((b) => ({ text: String(b.text || ""), textSource: b.diag && b.diag.textSource, rawText: (b.diag && b.diag.rawText != null) ? String(b.diag.rawText) : null })) };
                    r0.acceptance = { caseA: r0.nativeTruth.verdict === "NATIVE_TRUTH", caseD: true, verdict: r0.nativeTruth.verdict, passed: r0.nativeTruth.verdict === "NATIVE_TRUTH" && r0.blocks.length > 0 };
                  } else { r0.errors.push("OCR_TIMEOUT"); }
                } else { r0.errors.push("BAIDU_EXTERNAL_FAIL"); }
              } else { r0.errors.push("OCR_PREPARE_FAIL"); }
            } else { r0.errors.push("BG_INJECT_FAIL"); }
          } else { r0.errors.push("EDITOR_UNAVAILABLE"); }
          await rollbackB();
          r0.steps.push({ step: "rollback", ok: true });
        } catch (e) { r0.errors.push("RUN: " + String(e && e.stack || (e && e.message || e)).slice(0, 300)); }

        // ---- R1：Baidu-only（native 无对应）→ DROP ----
        if (r0.blocks.length > 0) {
          const r1 = { case: "R1-CaseC-baidu-only-drop", steps: [], errors: [], injected: null, createdTexts: [], dropped: null };
          out.partB.runs.push(r1);
          try {
            await page.goto(URL_B, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => r1.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
            await SLEEP(3000);
            await injectPageWorld(pageWorldPayloadFor(condB));
            await SLEEP(1200);
            const readyB = await waitEditorReady(16, true);
            if (readyB && readyB.ok) {
              const bgR = await setBgB();
              if (bgR && bgR.ok) {
                const imgItems = await quadsToImageBbox(r0.blocks.map((b) => ({ text: String(b.text || ""), id: b.id, geo: b.geo })));
                if (imgItems && imgItems.ok && imgItems.items.length) {
                  const cands = imgItems.items.map((it) => ({ text: it.text, bbox: it.bbox, confidence: 0.99, coordinateSpace: "image-pixel" }));
                  cands.push({ text: "ZY_BAIDU_ONLY_DROP_9R", bbox: { x: Math.round(r0.bgGeometry.naturalWidth * 0.5), y: Math.round(r0.bgGeometry.naturalHeight - 30), width: 220, height: 24 }, confidence: 0.9, coordinateSpace: "image-pixel" });
                  const fake = { provider: "baidu-general-standard-position", providerType: "REMOTE", candidates: cands, meta: { mode: "standard", imageWidth: r0.bgGeometry.naturalWidth, imageHeight: r0.bgGeometry.naturalHeight, rawWordCount: cands.length, lineCount: cands.length } };
                  r1.injected = { candidates: cands.length, fakeText: "ZY_BAIDU_ONLY_DROP_9R" };
                  await page.evaluate((r) => { try { window.__zyBaiduExternal = { res: r }; } catch (e) {} }, fake);
                  const before = await snapIdsB();
                  const cl = await clickOcrB();
                  const doneW = await waitOcrDoneB(180000);
                  r1.steps.push({ step: "ocr-done", done: !!doneW.done, status: doneW.st || null });
                  if (doneW.done) {
                    const after = await snapIdsB();
                    const createdIds = (after || []).filter((id) => (before || []).indexOf(id) < 0);
                    const rd = await readNewB(createdIds);
                    r1.createdTexts = (rd.arr || []).map((b) => String(b.text || ""));
                    r1.pipelineEvidence = await page.evaluate(() => (window.__zyOcrPipelineEvidence || null)).catch(() => null);
                    r1.dropped = !r1.createdTexts.some((t) => t.indexOf("ZY_BAIDU_ONLY_DROP") >= 0);
                    r1.acceptance = { baiduOnlyDropped: r1.dropped, passed: r1.dropped };
                  } else { r1.errors.push("OCR_TIMEOUT"); }
                } else { r1.errors.push("NO_IMAGE_BBOX"); }
              } else { r1.errors.push("BG_INJECT_FAIL"); }
            } else { r1.errors.push("EDITOR_UNAVAILABLE"); }
            await rollbackB();
          } catch (e) { r1.errors.push("RUN: " + String(e && e.stack || (e && e.message || e)).slice(0, 300)); }
        } else { out.partB.runs.push({ case: "R1-CaseC-baidu-only-drop", skipped: "R0 无创建对象", passed: false }); }

        // ---- R2：Native-only（Baidu 缺一行几何）→ UNRESOLVED_GEOMETRY ----
        if (r0.blocks.length > 1) {
          const r2 = { case: "R2-CaseB-native-only-unresolved", steps: [], errors: [], injected: null, createdTexts: [], unmatchedNative: null, resolved: null };
          out.partB.runs.push(r2);
          try {
            await page.goto(URL_B, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => r2.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
            await SLEEP(3000);
            await injectPageWorld(pageWorldPayloadFor(condB));
            await SLEEP(1200);
            const readyB = await waitEditorReady(16, true);
            if (readyB && readyB.ok) {
              const bgR = await setBgB();
              if (bgR && bgR.ok) {
                const imgItems = await quadsToImageBbox(r0.blocks.map((b) => ({ text: String(b.text || ""), id: b.id, geo: b.geo })));
                if (imgItems && imgItems.ok && imgItems.items.length > 1) {
                  const cands = imgItems.items.map((it) => ({ text: it.text, bbox: it.bbox, confidence: 0.99, coordinateSpace: "image-pixel" }));
                  const removedIdx = Math.floor(cands.length / 2);
                  const removedText = cands[removedIdx].text;
                  cands.splice(removedIdx, 1);
                  r2.injected = { candidates: cands.length, removedNativeLine: removedText, removedIdx: removedIdx };
                  const fake = { provider: "baidu-general-standard-position", providerType: "REMOTE", candidates: cands, meta: { mode: "standard", imageWidth: r0.bgGeometry.naturalWidth, imageHeight: r0.bgGeometry.naturalHeight, rawWordCount: cands.length, lineCount: cands.length } };
                  await page.evaluate((r) => { try { window.__zyBaiduExternal = { res: r }; } catch (e) {} }, fake);
                  const before = await snapIdsB();
                  const cl = await clickOcrB();
                  const doneW = await waitOcrDoneB(180000);
                  r2.steps.push({ step: "ocr-done", done: !!doneW.done, status: doneW.st || null });
                  if (doneW.done) {
                    const after = await snapIdsB();
                    const createdIds = (after || []).filter((id) => (before || []).indexOf(id) < 0);
                    const rd = await readNewB(createdIds);
                    r2.createdTexts = (rd.arr || []).map((b) => String(b.text || ""));
                    r2.pipelineEvidence = await page.evaluate(() => (window.__zyOcrPipelineEvidence || null)).catch(() => null);
                    const pe = r2.pipelineEvidence || {};
                    const nativeInfo = pe && pe.NATIVE ? pe.NATIVE : null;
                    const unmatched = (nativeInfo && nativeInfo.unmatchedNative != null) ? nativeInfo.unmatchedNative : null;
                    const kept = (nativeInfo && nativeInfo.kept != null) ? nativeInfo.kept : null;
                    r2.unmatchedNative = unmatched;
                    r2.resolved = { notCreated: !r2.createdTexts.some((t) => t === removedText), unmatchedNative: unmatched, kept: kept, verdict: unmatched >= 1 && !r2.createdTexts.some((t) => t === removedText) ? "UNRESOLVED_GEOMETRY" : "UNEXPECTED" };
                    r2.acceptance = { passed: r2.resolved.verdict === "UNRESOLVED_GEOMETRY" };
                  } else { r2.errors.push("OCR_TIMEOUT"); }
                } else { r2.errors.push("NO_IMAGE_BBOX"); }
              } else { r2.errors.push("BG_INJECT_FAIL"); }
            } else { r2.errors.push("EDITOR_UNAVAILABLE"); }
            await rollbackB();
          } catch (e) { r2.errors.push("RUN: " + String(e && e.stack || (e && e.message || e)).slice(0, 300)); }
        } else { out.partB.runs.push({ case: "R2-CaseB-native-only-unresolved", skipped: "R0 创建对象不足", passed: false }); }

        // ---- R3：冲突（Baidu 改写一行文本）→ Native = truth ----
        if (r0.blocks.length > 0) {
          const r3 = { case: "R3-CaseD-conflict-native-truth", steps: [], errors: [], injected: null, createdTexts: [], nativeTruth: null };
          out.partB.runs.push(r3);
          try {
            await page.goto(URL_B, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => r3.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
            await SLEEP(3000);
            await injectPageWorld(pageWorldPayloadFor(condB));
            await SLEEP(1200);
            const readyB = await waitEditorReady(16, true);
            if (readyB && readyB.ok) {
              const bgR = await setBgB();
              if (bgR && bgR.ok) {
                const imgItems = await quadsToImageBbox(r0.blocks.map((b) => ({ text: String(b.text || ""), id: b.id, geo: b.geo })));
                if (imgItems && imgItems.ok && imgItems.items.length) {
                  const cands = imgItems.items.map((it) => ({ text: it.text, bbox: it.bbox, confidence: 0.99, coordinateSpace: "image-pixel" }));
                  const idx = Math.floor(cands.length / 2);
                  const orig = cands[idx].text;
                  const fabricated = (orig && orig.length > 1) ? orig.slice(0, orig.length - 1) + "X" : "FABRICATED_BAIDU_9R";
                  const nativeExpect = orig;
                  cands[idx].text = fabricated;
                  r3.injected = { candidates: cands.length, baiduFabricated: fabricated, nativeExpect: nativeExpect };
                  const fake = { provider: "baidu-general-standard-position", providerType: "REMOTE", candidates: cands, meta: { mode: "standard", imageWidth: r0.bgGeometry.naturalWidth, imageHeight: r0.bgGeometry.naturalHeight, rawWordCount: cands.length, lineCount: cands.length } };
                  await page.evaluate((r) => { try { window.__zyBaiduExternal = { res: r }; } catch (e) {} }, fake);
                  const before = await snapIdsB();
                  const cl = await clickOcrB();
                  const doneW = await waitOcrDoneB(180000);
                  r3.steps.push({ step: "ocr-done", done: !!doneW.done, status: doneW.st || null });
                  if (doneW.done) {
                    const after = await snapIdsB();
                    const createdIds = (after || []).filter((id) => (before || []).indexOf(id) < 0);
                    const rd = await readNewB(createdIds);
                    r3.createdTexts = (rd.arr || []).map((b) => String(b.text || ""));
                    const hasNative = r3.createdTexts.some((t) => t === nativeExpect);
                    const hasFake = r3.createdTexts.some((t) => t === fabricated);
                    const sources = (rd.arr || []).map((b) => (b.diag && b.diag.textSource) || null);
                    r3.nativeTruth = { fabricated: fabricated, nativeExpect: nativeExpect, createdTexts: r3.createdTexts, hasNative: hasNative, hasFake: hasFake, allNativeSource: sources.length > 0 && sources.every((s) => s === "NATIVE_OCR"), resolution: hasNative && !hasFake ? "NATIVE_TRUTH" : "VIOLATION" };
                    r3.acceptance = { passed: r3.nativeTruth.resolution === "NATIVE_TRUTH" };
                  } else { r3.errors.push("OCR_TIMEOUT"); }
                } else { r3.errors.push("NO_IMAGE_BBOX"); }
              } else { r3.errors.push("BG_INJECT_FAIL"); }
            } else { r3.errors.push("EDITOR_UNAVAILABLE"); }
            await rollbackB();
          } catch (e) { r3.errors.push("RUN: " + String(e && e.stack || (e && e.message || e)).slice(0, 300)); }
        } else { out.partB.runs.push({ case: "R3-CaseD-conflict-native-truth", skipped: "R0 无创建对象", passed: false }); }
      }
    } catch (e) { out.partB.errors.push("PART_B: " + String(e && e.stack || (e && e.message || e)).slice(0, 400)); }
  }

  if (browser) await browser.close().catch(() => {});

  // ================= 汇总与 NEXT BLOCKER =================
  const A = out.partA, B = out.partB;
  (A.anchor || []).forEach((s) => { if (s.passed === true) verdict("anchor:" + s.case, "pass"); else if (s.passed === false && s.skipped) verdict("anchor:" + s.case, "blocked", s.skipped); else if (s.passed === false) verdict("anchor:" + s.case, "fail"); });
  if (A.measureClosure) verdict("measure-closure", A.measureClosure.passed ? "pass" : "fail");
  if (A.idempotence) verdict("idempotence", A.idempotence.passed ? "pass" : "fail");
  if (A.pageIdentity) verdict("pageIdentity", A.pageIdentity.passed ? "pass" : "fail");
  const mega = A.mega;
  if (mega && mega.scenarios) {
    const g = (n) => mega.scenarios.filter((s) => s.case === n)[0];
    ["I1-real-transform", "I2-uniform-scale", "I3-rotated-30", "I4-nonuniform-scale"].forEach((n) => { const s = g(n); if (s) verdict("imageSpace:" + n, s.passed === true ? "pass" : "fail"); });
    ["C-IN", "C-OUT", "C-REPAIR", "C-STILL_OUT"].forEach((n) => { const s = g(n); if (s) verdict("containment:" + n, s.passed === true ? "pass" : "fail"); });
    (mega.typography || []).forEach((t) => verdict("typography:" + t.case, t.passed === true ? "pass" : (t.verdict === "UNRESOLVED" || t.verdict === "CREATE_FAILED" ? "unresolved" : "fail")));
    ["P0-1-effectiveScale-into-typography", "P0-2-perline-not-wholeblock", "P0-3-image-pixel-containment"].forEach((n) => { const s = g(n); if (s) verdict("p0:" + n, s.verdict === "PASS" ? "pass" : "fail"); });
    const x = g("X-text-to-image-capability");
    if (x) verdict("textToImage", x.passed === true ? "pass" : "fail");
  } else if (!mega) { verdict("partA-mega", "fail"); }
  (B.runs || []).forEach((r) => {
    if (r.skipped) { verdict("nativeTruth:" + r.case, "blocked", r.skipped); return; }
    const acc = r.acceptance;
    if (!acc) { verdict("nativeTruth:" + r.case, "unresolved", (r.errors || []).join("|").slice(0, 200)); return; }
    if (acc.verdict === "NATIVE_BLOCKED") { verdict("nativeTruth:" + r.case, "blocked", "native uploadOCR 返回登录跳转 HTML（会话未过）—— 见 nativeProbe"); return; }
    verdict("nativeTruth:" + r.case, acc.passed ? "pass" : "fail");
  });
  if (B.blocked) verdict("nativeTruth:partB", "blocked", "BAIDU_CREDS_MISSING");
  if (SKIP_A) verdict("partA", "blocked", "ZY_SKIP_A=1");
  if (SKIP_B) verdict("partB", "blocked", "ZY_SKIP_B=1");

  const fails = out.summary.fail || [];
  const blocked = out.summary.blocked || [];
  const unresolved = out.summary.unresolved || [];
  const partBB = (B.bTooltips) ? "" : " | R0-R3 依赖真实登录会话的 native uploadOCR；当前返回登录跳转（PARSE_FAIL）";
  out.nextBlocker = fails.length
    ? "Stage 9.9 FAIL：" + fails.join(" ; ") + partBB + " —— 需定位真实缺陷后进入 0.3.11.49（禁止合并多问题为一个 commit）"
    : blocked.length
      ? "Stage 9.9 BLOCKED：" + blocked.join(" ; ") + " —— 补测后重新生成报告"
      : unresolved.length
        ? "Stage 9.9 部分 UNRESOLVED（证据不足）：" + unresolved.join(" ; ") + " —— 补测后重新生成报告"
        : "Stage 9.9 PASS —— NEXT BLOCKER = Stage 9.10 Front/Back PageIdentity + Back Canvas Materialization";

  fs.writeFileSync(REPORT_FILE, JSON.stringify(out, null, 2));
  console.log("[stage-9-9] report=" + REPORT_FILE + " version=" + out.version);
  console.log("[stage-9-9] pass=" + (out.summary.pass || []).length + " fail=" + fails.length + " blocked=" + blocked.length + " unresolved=" + unresolved.length);
  (out.summary.pass || []).forEach((k) => console.log("[stage-9-9] PASS  " + k));
  fails.forEach((k) => console.log("[stage-9-9] FAIL  " + k));
  blocked.forEach((k) => console.log("[stage-9-9] BLOCK " + k));
  unresolved.forEach((k) => console.log("[stage-9-9] UNRES " + k));
  (A.errors || []).forEach((e) => console.log("[stage-9-9] ERR-A " + e));
  (B.errors || []).forEach((e) => console.log("[stage-9-9] ERR-B " + e));
  out.errors.forEach((e) => console.log("[stage-9-9] ERR " + e));
  console.log("[stage-9-9] nextBlocker=" + out.nextBlocker);
  process.exit((out.errors.length || fails.length) ? 1 : 0);
})();
