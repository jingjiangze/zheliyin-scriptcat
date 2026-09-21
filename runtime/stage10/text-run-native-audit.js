// runtime/stage10/text-run-native-audit.js — Stage 10-B Phase 10-B.0：Native Multi-Textbox Capability Audit
// ---------------------------------------------------------------------
// 目标（规格 §四/§五）：在真实 diy.zheliyin.com 编辑器确认「多个相邻 textbox 各自独立 fontSize/fill，
// save/reload 后仍保持两个对象」—— 这是 Stage 10-B Run Segmentation 的 Native 前提。
// 步骤：
//   A 创建两个紧邻 probe textbox（A=fontSize 40 红，B=fontSize 20 蓝），读各自 uuid/markuuid/layerNum/pageId/aCoords
//   B 只改 A 字号 / 只改 B fill → 验证互不串扰（A alone / B alone）
//   C 读取对象 identity 独立性（uuid 不同、markuuid 独立、layerNum 独立、aCoords 独立）
//   D serializer/产品 JSON 侦察（两个独立条目 / media font.pointSize / fontColor）
//   E save（真实保存按钮点击 + 网络捕获）→ reload → 验证仍为两个对象（文本/字号/fill 各自保持）
// 只读审计 + 受控 probe 创建（结束时立即清理恢复）。凭据：ZY_STAGE9_COOKIE 仅运行时（缺失回退持久 profile）。
// 报告：runtime/reports/stage-10/text-run-native-audit.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("../../node_modules/playwright");
const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const EXT_ID = "ndcooeababalnlpkfedmmbbbgkljhpjf";
const USERSCRIPT_PATH = path.join(ROOT, "zheliyin-card-assistant.user.js");
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-10");
const REPORT_FILE = path.join(REPORT_DIR, "text-run-native-audit.json");
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
  t("version-49", USERSCRIPT_VERSION === "0.3.11.49");
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }
if (!COOKIE_RAW) console.warn("[text-run-native-audit] 未注入 ZY_STAGE9_COOKIE —— 回退持久 profile（可能过期）");

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

const RESOLVE_ENTRY = `
function resolveEntry10B(tag) {
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
  return { ok: true, idx: idx, entry: entry, canvas: canvas, canvasDiy: (entry && typeof entry.drawText === "function") ? entry : null, defs: defs };
}
`;

// 通用：创建紧邻双 textbox（A fontSize 40 红，B fontSize 20 蓝），返回 {a, b}
const PAGE_A_CREATE = `const r = resolveEntry10B("A"); const diy = r.canvasDiy; const c = r.canvas;
const out = { objects: [], errors: [] };
if (!diy || !c) return { ok: false, reason: "no-canvas-diy", out: out };
const nativeGuid = (function () { try { if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID(); } catch (e) {} return "zy-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10); })();
const idOf = function (o) { return String((o && (o.uuid || o.multiUuid || o.id)) || ""); };
const beforeIds = (c.getObjects() || []).map(idOf);
function maxLayer() { let m = -1; try { c.getObjects().forEach(function (o) { if (o && typeof o.layerNum === "number" && o.layerNum > m) m = o.layerNum; }); } catch (e) {} return m; }
function buildMedia(text, size, colorHex, left, top, layerNum) {
  const w = Math.max(60, size * String(text).length * 0.9 + 20);
  return {
    media: { mediaType: "text", text: text, font: { pointSize: size, fontColor: colorHex, isHorizontal: 1, gravity: "left", id: "1", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.2, lineIdType: 0, isBG: 0, imgPath: "" },
    location: { x: left, y: top, width: w, height: Math.round(size * 1.3 + 8), factWidth: w, factHeight: Math.round(size * 1.3 + 8), rotation: 0 },
    printLocation: { x: left, y: top, width: w, height: Math.round(size * 1.3 + 8), rotation: 0 },
    layer: { alpha: 1 }, layerNum: layerNum, isEdit: 1, isDisplay: 0, deleteState: 0, visitLevel: 1,
    multiUuid: nativeGuid + "-" + Date.now().toString(36), markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0,
    lowPixelFlag: 0, selectEnabled: 1, isDesign: 1, isComposite: 0, isPreview: 0, isDesignShape: 0
  };
}
function createOne(text, size, colorHex, left, top) {
  const ln = maxLayer() + 1;
  const media = buildMedia(text, size, colorHex, left, top, ln);
  const nObj = diy.drawText(text, size, media.location.x, media.location.y, media, ln);
  let obj = (typeof nObj === "object" && nObj !== null) ? nObj : null;
  if (!obj) { obj = (c.getObjects() || []).filter(function (o) { return beforeIds.indexOf(idOf(o)) < 0; }).find(function (o) { return String(o.text || "") === text; }) || null; }
  return { obj: obj, identity: (typeof nObj === "object" && nObj !== null) ? "NATIVE_RETURN" : "OBJECT_DELTA" };
}
try {
  const A = createOne("ZY_RUN_A_TEXT", 40, "#ff0000", 300, 280);
  const B = createOne("ZY_RUN_B_TEXT", 20, "#0000ff", 300, 340);
  const readObj = function (o, tag) {
    if (!o) return null;
    try { if (typeof o.setCoords === "function") o.setCoords(); } catch (e) {}
    const ac = o.aCoords;
    return {
      tag: tag, text: String(o.text || ""), fill: typeof o.fill !== "undefined" ? String(o.fill) : null, stroke: String(o.stroke || ""), strokeWidth: o.strokeWidth,
      fontSize: o.fontSize, pointSize: (o.media && o.media.font) ? o.media.font.pointSize : null, fontColor: (o.media && o.media.font) ? o.media.font.fontColor : null,
      uuid: String(o.uuid || ""), multiUuid: String(o.multiUuid || ""), markuuid: String(o.markuuid || ""), layerNum: o.layerNum, type: String(o.type || ""),
      aCoords: ac ? { tl: [Math.round(ac.tl.x * 100) / 100, Math.round(ac.tl.y * 100) / 100], br: [Math.round(ac.br.x * 100) / 100, Math.round(ac.br.y * 100) / 100] } : null,
      left: Math.round(o.left * 100) / 100, top: Math.round(o.top * 100) / 100
    };
  };
  out.objects.push(readObj(A.obj, "A"));
  out.objects.push(readObj(B.obj, "B"));
  out.a = { identity: A.identity, found: !!A.obj };
  out.b = { identity: B.identity, found: !!B.obj };
  out.distinctIds = (A.obj && B.obj) ? (idOf(A.obj) !== idOf(B.obj)) : false;
  out.distinctLayer = (A.obj && B.obj) ? (A.obj.layerNum !== B.obj.layerNum) : false;
} catch (eA) { out.errors.push("create:" + String(eA && eA.stack || (eA && eA.message || eA)).slice(0, 200)); }
return { ok: true, out: out };
`;

// ---- B：只改 A 字号 + 只改 B fill（探针对象由 tag text 定位；禁止删） ----
const PAGE_B_MUTATE = `const r = resolveEntry10B("B"); const diy = r.canvasDiy; const c = r.canvas;
const out = { before: [], after: [], errors: [] };
if (!c) return { ok: false, reason: "no-canvas", out: out };
function findT(t) { return (c.getObjects() || []).filter(function (o) { return o && String(o.text || "") === t; })[0] || null; }
const rd = function (o) { if (!o) return null; return { fontSize: o.fontSize, fontColor: (o.media && o.media.font) ? o.media.font.fontColor : null, fill: String(o.fill), left: Math.round(o.left * 100) / 100, top: Math.round(o.top * 100) / 100 }; };
try {
  const A = findT("ZY_RUN_A_TEXT"); const B = findT("ZY_RUN_B_TEXT");
  out.before = { A: rd(A), B: rd(B) };
  if (!A || !B) return { ok: true, out: out, missing: { A: !!A, B: !!B } };
  // 只改 A 字号：48（fontSize + media.font.pointSize 同步改）
  try {
    A.set({ fontSize: 48 });
    if (A.media && A.media.font) { A.media.font.pointSize = 48; A.media.pointSize = 48; }
    if (typeof c.setCoords === "function") c.setCoords(); if (typeof c.requestRenderAll === "function") c.requestRenderAll();
  } catch (eM) { out.errors.push("mutate-A-size:" + String(eM && eM.message || eM).slice(0, 120)); }
  // 只改 B fill：绿色
  try {
    B.set({ fill: "#00aa33" });
    if (B.media && B.media.font) B.media.font.fontColor = "#00aa33";
    if (typeof c.setCoords === "function") c.setCoords(); if (typeof c.requestRenderAll === "function") c.requestRenderAll();
  } catch (eM2) { out.errors.push("mutate-B-fill:" + String(eM2 && eM2.message || eM2).slice(0, 120)); }
  out.after = { A: rd(findT("ZY_RUN_A_TEXT")), B: rd(findT("ZY_RUN_B_TEXT")) };
  out.aSizeChanged = !!(out.before.A && out.after.A && out.before.A.fontSize !== out.after.A.fontSize);
  out.bFillChanged = !!(out.before.B && out.after.B && out.before.B.fill !== out.after.B.fill);
  out.aFillUnchanged = !!(out.before.A && out.after.A && out.before.A.fill === out.after.A.fill);
  out.bSizeUnchanged = !!(out.before.B && out.after.B && out.before.B.fontSize === out.after.B.fontSize);
} catch (eB) { out.errors.push("main:" + String(eB && eB.stack || (eB && eB.message || eB)).slice(0, 200)); }
return { ok: true, out: out };
`;

// ---- C：identity 独立性（uuid/markuuid/layerNum/aCoords/registered index） ----
const PAGE_C_IDENTITY = `const r = resolveEntry10B("C"); const diy = r.canvasDiy; const c = r.canvas;
const out = { objects: [], errors: [] };
if (!c) return { ok: false, reason: "no-canvas", out: out };
function findT(t) { return (c.getObjects() || []).filter(function (o) { return o && String(o.text || "") === t; })[0] || null; }
try {
  const A = findT("ZY_RUN_A_TEXT"); const B = findT("ZY_RUN_B_TEXT");
  const probeId = function (o, tag) {
    if (!o) return null;
    try { if (typeof o.setCoords === "function") o.setCoords(); } catch (e) {}
    const regIdx = (diy && diy.canvasObjInfo && diy.canvasObjInfo.canvasToProductObjArr) ? diy.canvasObjInfo.canvasToProductObjArr.indexOf(o) : -1;
    const ac = o.aCoords;
    return { tag: tag, uuid: String(o.uuid || ""), multiUuid: String(o.multiUuid || ""), markuuid: String(o.markuuid || ""), layerNum: o.layerNum, regIdx: regIdx, type: String(o.type || ""), hasPageId: "pageId" in o ? String(o.pageId || "") : null, aCoords: ac ? { tl: [Math.round(ac.tl.x * 100) / 100, Math.round(ac.tl.y * 100) / 100], br: [Math.round(ac.br.x * 100) / 100, Math.round(ac.br.y * 100) / 100] } : null };
  };
  out.objects.push(probeId(A, "A"));
  out.objects.push(probeId(B, "B"));
  out.distinct = (A && B) ? { uuid: String(A.uuid) !== String(B.uuid), multiUuid: String(A.multiUuid) !== String(B.multiUuid), markuuid: String(A.markuuid || "") !== String(B.markuuid || ""), layerNum: A.layerNum !== B.layerNum, regIdx: out.objects[0].regIdx >= 0 && out.objects[0].regIdx !== out.objects[1].regIdx, aCoords: !!(out.objects[0].aCoords && out.objects[1].aCoords && (out.objects[0].aCoords.tl[0] !== out.objects[1].aCoords.tl[0] || out.objects[0].aCoords.tl[1] !== out.objects[1].aCoords.tl[1])) } : null;
} catch (eC) { out.errors.push("main:" + String(eC && eC.stack || (eC && eC.message || eC)).slice(0, 200)); }
return { ok: true, out: out };
`;

// ---- D：serializer 侦察（两个独立条目是否进入产品 JSON / toJSON / canvasObjInfo 队列） ----
const PAGE_D_SERIAL = `const r = resolveEntry10B("D"); const diy = r.canvasDiy; const c = r.canvas;
const out = { serializerProbes: [], errors: [] };
if (!c) return { ok: false, reason: "no-canvas", out: out };
function findT(t) { return (c.getObjects() || []).filter(function (o) { return o && String(o.text || "") === t; })[0] || null; }
try {
  const A = findT("ZY_RUN_A_TEXT"); const B = findT("ZY_RUN_B_TEXT");
  if (!A || !B) return { ok: true, out: out, missing: { A: !!A, B: !!B } };
  const probeEach = function (o, tag) {
    let fabricJson = null; try { fabricJson = typeof o.toJSON === "function" ? o.toJSON() : null; } catch (e) { fabricJson = { err: String(e && e.message || e).slice(0, 80) }; }
    const flat = fabricJson && !fabricJson.err ? { keys: Object.keys(fabricJson).slice(0, 30), fill: fabricJson.fill, text: String(fabricJson.text || "").slice(0, 16), fontSize: fabricJson.fontSize } : null;
    return { tag: tag, objFill: String(o.fill), fontSize: o.fontSize, text: String(o.text || "").slice(0, 16), mediaPointSize: (o.media && o.media.font) ? o.media.font.pointSize : null, mediaFontColor: (o.media && o.media.font) ? o.media.font.fontColor : null, toJSON: flat };
  };
  out.serializerProbes.push(probeEach(A, "A"));
  out.serializerProbes.push(probeEach(B, "B"));
  // 产品队列中的索引独立性
  try {
    const arr = diy && diy.canvasObjInfo && diy.canvasObjInfo.canvasToProductObjArr ? diy.canvasObjInfo.canvasToProductObjArr : [];
    out.regIdx = { A: arr.indexOf(A), B: arr.indexOf(B) };
    out.regDistinct = arr.indexOf(A) >= 0 && arr.indexOf(A) !== arr.indexOf(B);
  } catch (eR) {}
  // 全局 Q() 若存在（记录是否含两个 text= 片段）
  try { if (typeof window.Q === "function") { const q = String(window.Q()); out.qHasA = q.indexOf("ZY_RUN_A_TEXT") >= 0; out.qHasB = q.indexOf("ZY_RUN_B_TEXT") >= 0; } } catch (eQ) { out.errors.push("Q:" + String(eQ && eQ.message || eQ).slice(0, 80)); }
} catch (eD) { out.errors.push("main:" + String(eD && eD.stack || (eD && eD.message || eD)).slice(0, 200)); }
return { ok: true, out: out };
`;

// ---- E2 状态读取（save/reload 后复用） ----
const PAGE_E_READ = `const r = resolveEntry10B("E"); const diy = r.canvasDiy; const c = r.canvas;
const out = { objects: [], errors: [] };
if (!c) return { ok: false, reason: "no-canvas", out: out };
function findT(t) { return (c.getObjects() || []).filter(function (o) { return o && String(o.text || "") === t; })[0] || null; }
try {
  ["ZY_RUN_A_TEXT", "ZY_RUN_B_TEXT"].forEach(function (t) {
    const o = findT(t);
    if (!o) { out.objects.push({ text: t, found: false }); return; }
    out.objects.push({ text: t, found: true, fontSize: o.fontSize, fill: String(o.fill), fontColor: (o.media && o.media.font) ? o.media.font.fontColor : null, uuid: String(o.uuid || ""), layerNum: o.layerNum, left: Math.round(o.left * 100) / 100, top: Math.round(o.top * 100) / 100 });
  });
} catch (eE) { out.errors.push("main:" + String(eE && eE.stack || (eE && eE.message || eE)).slice(0, 200)); }
return { ok: true, out: out };
`;

// ---- CLEAN：清理 probe 两个对象（含注册队列） ----
const PAGE_CLEAN = `const r = resolveEntry10B("CL"); const diy = r.canvasDiy; const c = r.canvas;
const out = { removed: 0, errors: [] };
if (c) { (c.getObjects() || []).forEach(function (o) { try { if (o && (String(o.text || "") === "ZY_RUN_A_TEXT" || String(o.text || "") === "ZY_RUN_B_TEXT")) { const li = diy && diy.canvasObjInfo && diy.canvasObjInfo.canvasToProductObjArr ? diy.canvasObjInfo.canvasToProductObjArr.indexOf(o) : -1; if (li >= 0) diy.canvasObjInfo.canvasToProductObjArr.splice(li, 1); c.remove(o); out.removed += 1; } } catch (e) {} }); try { if (typeof c.requestRenderAll === "function") c.requestRenderAll(); } catch (e) {} }
return { ok: true, out: out };
`;

[RESOLVE_ENTRY, PAGE_A_CREATE, PAGE_B_MUTATE, PAGE_C_IDENTITY, PAGE_D_SERIAL, PAGE_E_READ, PAGE_CLEAN].forEach(function (src, i) {
  try { new Function(src); } catch (e) { console.error("[compile-check] chunk " + i + " SyntaxError: " + String(e && e.message || e) + " head=" + JSON.stringify((src || "").slice(0, 80)) + " tail=" + JSON.stringify((src || "").slice(-80))); process.exit(2); }
});

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const out = { ts: new Date().toISOString(), stage: "STAGE-10B0-NATIVE-MULTI-TEXTBOX-AUDIT", version: USERSCRIPT_VERSION, url: URL.split("?")[0], cookiePresent: !!COOKIE_RAW, phases: {}, errors: [] };
  let browser = null;
  let page = null;
  try {
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1280, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    page = browser.pages()[0];
    const onPageErr = (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 140)); };
    page.on("pageerror", onPageErr);
    const allNet = [];
    page.on("request", (req) => { try { const p = String(req.url()).split("?")[0]; if (p.indexOf(".js") < 0 && p.indexOf(".css") < 0 && p.indexOf(".png") < 0 && p.indexOf(".jpg") < 0 && p.indexOf(".gif") < 0 && p.indexOf(".woff") < 0 && p.indexOf(".ico") < 0) allNet.push({ status: null, method: req.method(), path: p.slice(0, 200) }); } catch (e) {} });
    page.on("response", (res) => { try { const u = String(res.url()); const p = u.split("?")[0]; if (p.indexOf(".js") < 0 && p.indexOf(".css") < 0 && p.indexOf(".png") < 0 && p.indexOf(".jpg") < 0 && p.indexOf(".gif") < 0 && p.indexOf(".woff") < 0 && p.indexOf(".ico") < 0) allNet.push({ status: res.status(), method: res.request() ? res.request().method() : null, path: p.slice(0, 160) }); } catch (e) {} });
    try {
      await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await SLEEP(1400);
      const allOld = await adapter.getAllScripts(page) || [];
      for (const s of allOld.filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(page, s.uuid); } catch (e) {} }
      out.errors = out.errors.filter((x) => x.indexOf("PAGEERROR") < 0);
    } catch (eClean) { out.errors.push("CLEAN: " + String(eClean && eClean.message || eClean).slice(0, 120)); }
    for (const c of parseCookies(COOKIE_RAW)) { try { await browser.addCookies([c]); } catch (e) {} }
    page = await (async () => { await page.close().catch(() => {}); const p = await browser.newPage(); p.on("pageerror", onPageErr); return p; })();
    const injectPageWorld = (payload) => page.evaluate((code) => { const s = document.createElement("script"); s.textContent = code; (document.head || document.documentElement).appendChild(s); }, payload);
    const evalProbe = async (name) => page.evaluate((ch) => { try { return window["__zyRunProbe"](ch); } catch (e) { return { ok: false, reason: "missing-fn" }; } }, name).catch((e) => ({ ok: false, reason: String(e && e.message || e).slice(0, 120) }));
    const waitEditorReady = async (tries) => {
      for (let i = 0; i < (tries || 18); i += 1) {
        const r = await page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed) })).catch(() => ({}));
        if (r && r.ok && r.bridge) return r;
        await SLEEP(1200);
      }
      return page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed) })).catch(() => ({}));
    };
    const cond = { baidu: "standard", ink: "0" };
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => out.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
    await SLEEP(4000);
    await injectPageWorld(pageWorldPayloadFor(cond));
    await SLEEP(1200);
    const ready = await waitEditorReady(18);
    if (!(ready && ready.ok)) out.errors.push("EDITOR_UNAVAILABLE");
    await SLEEP(2500);
    await injectPageWorld(RESOLVE_ENTRY + "\n;window.__zyRunProbe = (function(n){ var map={A:(function(){" + PAGE_A_CREATE + "}),B:(function(){" + PAGE_B_MUTATE + "}),C:(function(){" + PAGE_C_IDENTITY + "}),D:(function(){" + PAGE_D_SERIAL + "}),E:(function(){" + PAGE_E_READ + "}),CL:(function(){" + PAGE_CLEAN + "})}; return function(ch){ return map[ch](); }; })();");
    await SLEEP(800);
    const audA = await evalProbe("A");
    if (audA && audA.ok && audA.out) out.phases.A = audA.out; else out.phases.A = { failed: audA };
    await SLEEP(500);
    const audB = await evalProbe("B");
    if (audB && audB.ok && audB.out) out.phases.B = audB.out; else out.phases.B = { failed: audB };
    await SLEEP(500);
    const audC = await evalProbe("C");
    if (audC && audC.ok && audC.out) out.phases.C = audC.out; else out.phases.C = { failed: audC };
    await SLEEP(500);
    const audD = await evalProbe("D");
    if (audD && audD.ok && audD.out) out.phases.D = audD.out; else out.phases.D = { failed: audD };
    await SLEEP(500);
    // E：真实保存（找“保存”按钮）+ 网络捕获 → reload → 重读两个对象独立性
    out.phases.E = { steps: [], errors: [], netAfterSave: [] };
    try {
      const saveBtn = await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll("button,a,span,div"));
        for (const el of all) { const s = String(el.textContent || "").trim(); if (/^保存$|立即保存/.test(s) && el.offsetParent) { try { el.click(); return { clicked: true, text: s }; } catch (e) { return { clicked: false }; } } }
        return { clicked: false };
      }).catch(() => ({ clicked: false }));
      await SLEEP(4000);
      out.phases.E.steps.push({ step: "e1-save", clicked: !!(saveBtn && saveBtn.clicked), netAfterSave: allNet.slice(-15) });
      await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => out.phases.E.errors.push("RELOAD: " + String(e && e.message || e).slice(0, 100)));
      await SLEEP(4000);
      await injectPageWorld(pageWorldPayloadFor(cond));
      await SLEEP(1200);
      const readyE = await waitEditorReady(18);
      out.phases.E.steps.push({ step: "e2-reload-ready", ok: !!(readyE && readyE.ok) });
      // reload 后页面重置，需重新注入 probe 入口（同首次注入）
      await injectPageWorld(RESOLVE_ENTRY + "\n;window.__zyRunProbe = (function(n){ var map={A:(function(){" + PAGE_A_CREATE + "}),B:(function(){" + PAGE_B_MUTATE + "}),C:(function(){" + PAGE_C_IDENTITY + "}),D:(function(){" + PAGE_D_SERIAL + "}),E:(function(){" + PAGE_E_READ + "}),CL:(function(){" + PAGE_CLEAN + "})}; return function(ch){ return map[ch](); }; })();");
      await SLEEP(800);
      const eRead = await evalProbe("E");
      if (eRead && eRead.ok && eRead.out) out.phases.E.readAfterReload = eRead.out; else out.phases.E.readAfterReload = { failed: eRead };
      const objs = (out.phases.E.readAfterReload && out.phases.E.readAfterReload.objects) || [];
      const A = objs.filter((o) => o.text === "ZY_RUN_A_TEXT")[0];
      const B = objs.filter((o) => o.text === "ZY_RUN_B_TEXT")[0];
      out.phases.E.persistedTwoObjects = !!(A && B && A.found && B.found);
      out.phases.E.aSizeAfterReload = A ? A.fontSize : null;
      out.phases.E.bFillAfterReload = B ? B.fill : null;
      out.phases.E.independentAfterReload = !!(A && B && A.found && B.found && A.uuid !== B.uuid && A.fontSize !== B.fontSize && A.fill !== B.fill);
      // E3 清理 probe + 再保存（恢复模板状态）
      const cl0 = await evalProbe("CL");
      await SLEEP(600);
      const save2 = await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll("button,a,span,div"));
        for (const el of all) { const s = String(el.textContent || "").trim(); if (/^保存$|立即保存/.test(s) && el.offsetParent) { try { el.click(); return { clicked: true }; } catch (e) {} } }
        return { clicked: false };
      }).catch(() => ({ clicked: false }));
      await SLEEP(3000);
      out.phases.E.steps.push({ step: "e3-cleanup-save", removed: (cl0 && cl0.out && cl0.out.removed) || 0, clicked: !!(save2 && save2.clicked) });
      out.phases.E.cleanupRestored = (cl0 && cl0.out && cl0.out.removed) >= 2;
    } catch (eE) { out.phases.E.errors.push("E: " + String(eE && eE.stack || (eE && eE.message || eE)).slice(0, 250)); }
    await SLEEP(800);
  } catch (e) { out.errors.push("MAIN: " + String(e && e.stack || (e && e.message || e)).slice(0, 300)); }
  if (browser) await browser.close().catch(() => {});
  fs.writeFileSync(REPORT_FILE, JSON.stringify(out, null, 2));
  console.log("[text-run-native-audit] report=" + REPORT_FILE + " version=" + out.version);
  const A = out.phases.A, B = out.phases.B, C = out.phases.C, E = out.phases.E;
  if (A) console.log("[text-run-native-audit] A foundA=" + (A.a && A.a.found) + " foundB=" + (A.b && A.b.found) + " distinctIds=" + A.distinctIds + " distinctLayer=" + A.distinctLayer);
  if (A && A.objects) A.objects.forEach((o) => console.log("[text-run-native-audit] A " + o.tag + " fs=" + o.fontSize + " fill=" + o.fill + " pointSize=" + o.pointSize + " layer=" + o.layerNum));
  if (B) console.log("[text-run-native-audit] B aSizeChanged=" + B.aSizeChanged + " bFillChanged=" + B.bFillChanged + " aFillUnchanged=" + B.aFillUnchanged + " bSizeUnchanged=" + B.bSizeUnchanged);
  if (C) console.log("[text-run-native-audit] C distinct=" + JSON.stringify(C.distinct));
  if (out.phases.D) console.log("[text-run-native-audit] D regIdx=" + JSON.stringify(out.phases.D.regIdx) + " regDistinct=" + out.phases.D.regDistinct);
  if (E) console.log("[text-run-native-audit] E persistedTwo=" + E.persistedTwoObjects + " aSize=" + E.aSizeAfterReload + " bFill=" + E.bFillAfterReload + " independent=" + E.independentAfterReload);
  out.errors.forEach((e) => console.log("[text-run-native-audit] ERR " + e));
  process.exit(out.errors.length ? 1 : 0);
})();