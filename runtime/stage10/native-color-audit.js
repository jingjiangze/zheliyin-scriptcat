// runtime/stage10/native-color-audit.js — Stage 10-A Phase 2：Native Color Audit（先审计，不改生产）
// ---------------------------------------------------------------------
// 目标：在真实 diy.zheliyin.com 编辑器确认 Native 字体颜色的真实写入路径，禁止凭经验伪造。
// 审计层（§四优先级）：P0 Native Editor Color API → P1 Native UI Color Setter → P2 Fabric fill+render → P3 serializer/save。
// 步骤：
//   A 读现有 native textbox 的 fill/stroke/strokeWidth/opacity/fontColor 契约
//   B 原生 drawText 带 fontColor → 读 obj.fill（fontColor→fill 映射真值）
//   C fabric obj.fill 直接修改 → setCoords → render → 像素级证据 + measure
//   D UI 颜色控件侦察（DOM 控件 / 绑定字段 / 页面模块）
//   E serializer/产品 JSON 侦察（Q()/product builder/checkObjsInProductJson 是否含 color 字段）
//   F save（网络捕获）+ reload → 持久性
// 只读审计 + 受控 probe 创建（立即清理恢复）。凭据：ZY_STAGE9_COOKIE 仅运行时（缺失回退持久 profile）。
// 报告：runtime/reports/stage-10/native-color-audit.json
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
const REPORT_FILE = path.join(REPORT_DIR, "native-color-audit.json");
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
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }
if (!COOKIE_RAW) console.warn("[native-color-audit] 未注入 ZY_STAGE9_COOKIE —— 回退持久 profile（可能过期）");

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
function resolveEntry10A(tag) {
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

// ---- 页面审计主脚本（A 现有契约 + serializer 侦察） ----
const PAGE_AUDIT = `
const r = resolveEntry10A("A");
const out = { existing: [], modules: [], serializer: {}, qFound: false, productDataHits: [], uiColorControls: [], errors: [] };
const d = r.entry;
const c = r.canvas;
if (!c) return { ok: false, reason: "no-canvas" };
try { if (typeof c.setCoords === "function") c.setCoords(); } catch (e) {}
const tboxes = (c.getObjects() || []).filter(function (o) { return o && (String(o.type) === "textbox" || String(o.type) === "i-text" || String(o.type) === "text"); });
(tboxes || []).slice(0, 3).forEach(function (o, i) {
  let media = null; try { media = o.media || null; } catch (e) {}
  let font = null; try { font = (media && media.font) || o.font || null; } catch (e) {}
  let location = null;
  try {
    location = {
      locationX: o.locationX, locationY: o.locationY, locationWidth: o.locationWidth, locationHeight: o.locationHeight, locationRotation: o.locationRotation,
      loc: (o.location && typeof o.location === "object") ? { x: o.location.x, y: o.location.y, width: o.location.width, height: o.location.height, factWidth: o.location.factWidth, factHeight: o.location.factHeight, rotation: o.location.rotation } : null
    };
  } catch (e) { location = { err: String(e && e.message || e).slice(0, 80) }; }
  out.existing.push({
    index: i,
    text: String(o.text || "").slice(0, 20),
    fill: typeof o.fill !== "undefined" ? String(o.fill) : null,
    stroke: typeof o.stroke !== "undefined" ? String(o.stroke) : null,
    strokeWidth: typeof o.strokeWidth !== "undefined" ? o.strokeWidth : null,
    opacity: typeof o.opacity !== "undefined" ? o.opacity : null,
    shadow: o.shadow ? { color: o.shadow.color, blur: o.shadow.blur, offsetX: o.shadow.offsetX, offsetY: o.shadow.offsetY } : null,
    fontColor: font ? font.fontColor : null,
    font: font ? Object.keys(font).slice(0, 20) : null,
    fontColorProp: o.fontColor != null ? o.fontColor : null,
    mediaKeys: media ? Object.keys(media).slice(0, 20) : null,
    location: location,
    canvasToProductObjArrIdx: (d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr) ? d.canvasObjInfo.canvasToProductObjArr.indexOf(o) : -1
  });
});
// serializer / Q 侦察
try {
  if (typeof window.Q === "function") { out.qFound = true; out.serializer.Q = { type: "function", len: window.Q.length }; }
  const defs = r.defs || {};
  const kw = ["ProductData", "productData", "serialize", "Serializ", "toProductJson", "productJson", "saveProduct", "checkObjs", "MediaTypeInfo", "Sundry", "QSerializer", "JsonQ"];
  Object.keys(defs).forEach(function (mn) {
    if (kw.some(function (k) { return mn.indexOf(k) >= 0; })) {
      const m = defs[mn];
      const sig = (typeof m === "function") ? "function" : (typeof m === "object" && m !== null ? "object:" + Object.keys(m).slice(0, 12).join(",") : typeof m);
      out.modules.push({ name: mn, sig: sig });
    }
  });
} catch (eSr) { out.errors.push("serializer-scan:" + String(eSr && eSr.message || eSr).slice(0, 100)); }
// UI 颜色控件侦察（只读 DOM）
try {
  const els = document.querySelectorAll("input[type=color], input[type=text][class*=color], .color-picker, [class*=colorPicker], [class*=colour]");
  els.forEach(function (el) { out.uiColorControls.push({ tag: el.tagName, cls: String(el.className || "").slice(0, 60), type: el.getAttribute && el.getAttribute("type") || null, val: el.value || null }); });
  if (!els.length) out.uiColorControls.push({ note: "no-static-color-control-found (deps on select-to-open panel)" });
} catch (eUi) { out.errors.push("ui-scan:" + String(eUi && eUi.message || eUi).slice(0, 100)); }
return { ok: true, out: out };
`;

// ---- 页面 B：fontColor→fill 映射（原生 drawText 带 fontColor 变体） ----
const PAGE_BLCK_REQ = `const r = resolveEntry10A("B"); const diy = r.canvasDiy; const c = r.canvas;
const out = { mapping: [], errors: [] };
if (!diy || !c) return { ok: false, reason: "no-canvas-diy" };
const nativeGuid = (function () { try { if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID(); } catch (e) {} return "zy-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10); })();
const buildMedia = function (text, size, colorHex, left, top, layerNum) {
  const w = Math.max(60, size * String(text).length * 0.9 + 20);
  return {
    media: { mediaType: "text", text: text, font: { pointSize: size, fontColor: colorHex, isHorizontal: 1, gravity: "left", id: "1", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.2, lineIdType: 0, isBG: 0, imgPath: "" },
    location: { x: left, y: top, width: w, height: Math.round(size * 1.3 + 8), factWidth: w, factHeight: Math.round(size * 1.3 + 8), rotation: 0 },
    printLocation: { x: left, y: top, width: w, height: Math.round(size * 1.3 + 8), rotation: 0 },
    layer: { alpha: 1 }, layerNum: layerNum, isEdit: 1, isDisplay: 0, deleteState: 0, visitLevel: 1,
    multiUuid: nativeGuid + "-" + Date.now().toString(36), markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0,
    lowPixelFlag: 0, selectEnabled: 1, isDesign: 1, isComposite: 0, isPreview: 0, isDesignShape: 0
  };
};
const colors = ["#ff0000", "#00ff00", "#0000ff", "#000000", "#ffffff", "#ffd700"];
colors.forEach(function (col, ci) {
  try {
    const idOf = function (o) { return String((o && (o.uuid || o.multiUuid || o.id)) || ""); };
    const beforeIds = (c.getObjects() || []).map(idOf);
    let maxLayer = -1;
    try { c.getObjects().forEach(function (o) { if (o && typeof o.layerNum === "number" && o.layerNum > maxLayer) maxLayer = o.layerNum; }); } catch (e) {}
    const layerNum = maxLayer + 1;
    const media = buildMedia("测色" + ci, 26, col, 40 + ci * 130, 160, layerNum);
    const nObj = diy.drawText("测色" + ci, 26, media.location.x, media.location.y, media, layerNum);
    const after = c.getObjects() || [];
    let obj = (typeof nObj === "object" && nObj !== null) ? nObj : null;
    let identity = obj ? "NATIVE_RETURN" : "OBJECT_DELTA";
    if (!obj) { obj = after.filter(function (o) { return beforeIds.indexOf(idOf(o)) < 0; }).find(function (o) { return /textbox|i-text|text/.test(String(o.type || "")); }) || null; }
    const rec = { colorHex: col, identity: identity, requestedFontColor: col, actualFill: obj ? (typeof obj.fill !== "undefined" ? String(obj.fill) : null) : null, actualFontColorProp: obj ? obj.fontColor : null, actualMediaFontColor: (obj && obj.media && obj.media.font) ? String(obj.media.font.fontColor) : null, actualStroke: obj ? String(obj.stroke) : null, opacity: obj ? obj.opacity : null, found: !!obj };
    rec.exact = rec.actualFill != null && rec.actualFill.toLowerCase() === col.toLowerCase();
    out.mapping.push(rec);
    try { const regIdx = diy.canvasObjInfo && diy.canvasObjInfo.canvasToProductObjArr ? diy.canvasObjInfo.canvasToProductObjArr.indexOf(obj) : -1; if (regIdx >= 0) diy.canvasObjInfo.canvasToProductObjArr.splice(regIdx, 1); if (obj && typeof c.remove === "function") c.remove(obj); try { if (typeof c.requestRenderAll === "function") c.requestRenderAll(); } catch (e) {} } catch (eCl) {}
  } catch (eB) { out.errors.push("case-" + col + ":" + String(eB && eB.stack || (eB && eB.message || eB)).slice(0, 160)); }
});
return { ok: true, out: out };
`;

// ---- 页面 C：fabric fill 直接改 + render 像素证据 ----
const PAGE_C_REQ = `const r = resolveEntry10A("C"); const diy = r.canvasDiy; const c = r.canvas;
const out = { fillMutation: [], errors: [] };
if (!diy || !c) return { ok: false, reason: "no-canvas-diy" };
const nativeGuid = (function () { try { if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID(); } catch (e) {} return "zy-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10); })();
const idOf = function (o) { return String((o && (o.uuid || o.multiUuid || o.id)) || ""); };
const beforeIds = (c.getObjects() || []).map(idOf);
let maxLayer = -1;
try { c.getObjects().forEach(function (o) { if (o && typeof o.layerNum === "number" && o.layerNum > maxLayer) maxLayer = o.layerNum; }); } catch (e) {}
const layerNum = maxLayer + 1;
const w = 160;
const media = {
  media: { mediaType: "text", text: "ZY_PIXEL_COLOR", font: { pointSize: 28, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "1", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.2, lineIdType: 0, isBG: 0, imgPath: "" },
  location: { x: 300, y: 30, width: w, height: 45, factWidth: w, factHeight: 45, rotation: 0 },
  printLocation: { x: 300, y: 30, width: w, height: 45, rotation: 0 },
  layer: { alpha: 1 }, layerNum: layerNum, isEdit: 1, isDisplay: 0, deleteState: 0, visitLevel: 1,
  multiUuid: nativeGuid + "-" + Date.now().toString(36), markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0,
  lowPixelFlag: 0, selectEnabled: 1, isDesign: 1, isComposite: 0, isPreview: 0, isDesignShape: 0
};
try {
  const nObj = diy.drawText("ZY_PIXEL_COLOR", 28, media.location.x, media.location.y, media, layerNum);
  const after = c.getObjects() || [];
  let obj = (typeof nObj === "object" && nObj !== null) ? nObj : null;
  let identity = obj ? "NATIVE_RETURN" : "OBJECT_DELTA";
  if (!obj) { obj = after.filter(function (o) { return beforeIds.indexOf(idOf(o)) < 0; }).find(function (o) { return /textbox|i-text|text/.test(String(o.type || "")); }) || null; }
  const readRegion = function () {
    try {
      if (typeof obj.setCoords === "function") obj.setCoords();
      if (typeof c.setCoords === "function") c.setCoords();
      const ac = obj && obj.aCoords;
      if (!ac || !ac.tl || !ac.tr || !ac.br || !ac.bl) return null;
      const xs = [ac.tl.x, ac.tr.x, ac.br.x, ac.bl.x], ys = [ac.tl.y, ac.tr.y, ac.br.y, ac.bl.y];
      const l = Math.max(0, Math.floor(Math.min.apply(null, xs))) - 2, t = Math.max(0, Math.floor(Math.min.apply(null, ys))) - 2;
      const rr = Math.min(c.width, Math.ceil(Math.max.apply(null, xs))) + 2, bb = Math.min(c.height, Math.ceil(Math.max.apply(null, ys))) + 2;
      const w2 = Math.max(1, rr - l), h2 = Math.max(1, bb - t);
      if (w2 < 4 || h2 < 4) return null;
      const dl = typeof c.toDataURL === "function"
        ? (function () { try { return c.toDataURL({ left: l, top: t, width: w2, height: h2, format: "png" }); } catch (e) { return null; } })()
        : null;
      let hash = null;
      try { if (dl) { const s = dl; let h = 0x811c9dc5; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } hash = h.toString(16); } } catch (eH) {}
      return { l: l, t: t, w: w2, h: h2, hash: hash };
    } catch (ePx) { return { err: String(ePx && ePx.message || ePx).slice(0, 80) }; }
  };
  const before = { fill: obj ? String(obj.fill) : null, stroke: obj ? String(obj.stroke) : null, region: readRegion() };
  if (obj) {
    try { obj.set({ fill: "#00aa33", stroke: "#00aa33", strokeWidth: 1 }); if (typeof c.setCoords === "function") c.setCoords(); if (typeof c.requestRenderAll === "function") c.requestRenderAll(); } catch (eS) { out.errors.push("set:" + String(eS && eS.message || eS).slice(0, 100)); }
  }
  if (obj) { try { if (typeof obj.setCoords === "function") obj.setCoords(); } catch (e) {} }
  const after1 = { fill: obj ? String(obj.fill) : null, stroke: obj ? String(obj.stroke) : null, strokeWidth: obj ? obj.strokeWidth : null, region: readRegion() };
  out.fillMutation.push({ identity: identity, before: before, after: after1, fillChanged: !!(obj && before.fill !== String(obj.fill)), renderChanged: !!(before.region && after1.region && before.region.hash && after1.region.hash && before.region.hash !== after1.region.hash) });
  try { const regIdx = diy.canvasObjInfo && diy.canvasObjInfo.canvasToProductObjArr ? diy.canvasObjInfo.canvasToProductObjArr.indexOf(obj) : -1; if (regIdx >= 0) diy.canvasObjInfo.canvasToProductObjArr.splice(regIdx, 1); if (obj && typeof c.remove === "function") c.remove(obj); try { if (typeof c.requestRenderAll === "function") c.requestRenderAll(); } catch (e) {} } catch (eCl) {}
} catch (eC) { out.errors.push("main:" + String(eC && eC.stack || (eC && eC.message || eC)).slice(0, 200)); }
return { ok: true, out: out };
`;

// ---- 页面 D：UI 颜色控件激活侦察（选中对象 → 找颜色面板） ----
const PAGE_D_REQ = `const r = resolveEntry10A("D"); const c = r.canvas;
const out = { controls: [], events: [], errors: [] };
if (!c) return { ok: false, reason: "no-canvas" };
try {
  const tboxes = (c.getObjects() || []).filter(function (o) { return o && (String(o.type) === "textbox" || String(o.type) === "i-text" || String(o.type) === "text"); });
  if (!tboxes.length) return { ok: false, reason: "no-textbox" };
  const target = tboxes[0];
  try { if (typeof c.setActiveObject === "function") { c.setActiveObject(target); if (typeof c.requestRenderAll === "function") c.requestRenderAll(); } } catch (eSel) { out.errors.push("select:" + String(eSel && eSel.message || eSel).slice(0, 100)); }
  return new Promise(function (resolveFinal) {
    setTimeout(function () {
      try {
        const els = document.querySelectorAll("input[type=color], input[type=text][class*=color i], [class*=colorPicker i], [class*=colour i], [id*=color i]");
        const list = [];
        els.forEach(function (el) { list.push({ tag: el.tagName, cls: String(el.className || "").slice(0, 80), id: String(el.id || "").slice(0, 40), type: el.getAttribute && el.getAttribute("type") || null, val: el.value != null ? String(el.value).slice(0, 40) : null }); });
        out.controls = list.slice(0, 20);
        out.controlsCount = list.length;
        // 页面模块颜色绑定侦察
        const defs = r.defs || {};
        const hits = [];
        Object.keys(defs).forEach(function (mn) {
          const m = defs[mn];
          if (!m || typeof m !== "object") return;
          Object.keys(m).slice(0, 80).forEach(function (k) {
            if (/color|colour|fill|fontColor/i.test(k)) hits.push({ mod: mn, key: k, type: typeof m[k] });
          });
        });
        out.colorBindings = hits.slice(0, 30);
        resolveFinal({ ok: true, out: out });
      } catch (eD) { out.errors.push("scan:" + String(eD && eD.message || eD).slice(0, 120)); resolveFinal({ ok: true, out: out }); }
    }, 600);
  });
} catch (eOuter) { return { ok: false, reason: String(eOuter && eOuter.message || eOuter).slice(0, 120) }; }
`;

// ---- 页面 E：serializer JSON 侦察（对 probe 对象求产品 JSON） ----
const PAGE_E_REQ = `const r = resolveEntry10A("E"); const diy = r.canvasDiy; const c = r.canvas;
const out = { serializerProbes: [], errors: [] };
if (!diy || !c) return { ok: false, reason: "no-canvas-diy" };
try {
  const nativeGuid = (function () { try { if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID(); } catch (e) {} return "zy-" + Date.now().toString(36); })();
  const idOf = function (o) { return String((o && (o.uuid || o.multiUuid || o.id)) || ""); };
  const beforeIds = (c.getObjects() || []).map(idOf);
  let maxLayer = -1;
  try { c.getObjects().forEach(function (o) { if (o && typeof o.layerNum === "number" && o.layerNum > maxLayer) maxLayer = o.layerNum; }); } catch (e) {}
  const layerNum = maxLayer + 1;
  const w = 140;
  const media = {
    media: { mediaType: "text", text: "ZY_SER_COLOR", font: { pointSize: 26, fontColor: "#ff6600", isHorizontal: 1, gravity: "left", id: "1", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.2, lineIdType: 0, isBG: 0, imgPath: "" },
    location: { x: 200, y: 200, width: w, height: 42, factWidth: w, factHeight: 42, rotation: 0 },
    printLocation: { x: 200, y: 200, width: w, height: 42, rotation: 0 },
    layer: { alpha: 1 }, layerNum: layerNum, isEdit: 1, isDisplay: 0, deleteState: 0, visitLevel: 1,
    multiUuid: nativeGuid + "-" + Date.now().toString(36), markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0,
    lowPixelFlag: 0, selectEnabled: 1, isDesign: 1, isComposite: 0, isPreview: 0, isDesignShape: 0
  };
  const nObj = diy.drawText("ZY_SER_COLOR", 26, 200, 200, media, layerNum);
  let obj = (typeof nObj === "object" && nObj !== null) ? nObj : null;
  if (!obj) { obj = (c.getObjects() || []).filter(function (o) { return beforeIds.indexOf(idOf(o)) < 0; }).find(function (o) { return /textbox|i-text|text/.test(String(o.type || "")); }) || null; }
  if (!obj) return { ok: false, reason: "create-failed", out: out };
  // 1) fabric toJSON（对象级序列化候选）
  let fabricJson = null; try { fabricJson = typeof obj.toJSON === "function" ? obj.toJSON() : null; } catch (e) { fabricJson = { err: String(e && e.message || e).slice(0, 80) }; }
  const flat = fabricJson && !fabricJson.err ? { keys: Object.keys(fabricJson).slice(0, 40), fill: fabricJson.fill, style: fabricJson.style, styles: fabricJson.styles } : null;
  // 2) Q() 全局序列化（若存在）
  let qJson = null; let qKeys = null; try { if (typeof window.Q === "function") { qJson = window.Q(); qKeys = typeof qJson === "string" ? Object.keys(JSON.parse(qJson)) : (qJson && typeof qJson === "object" ? Object.keys(qJson).slice(0, 30) : null); } } catch (eQ) { qJson = { err: String(eQ && eQ.message || eQ).slice(0, 100) }; }
  // 3) canvasObjInfo 宿主 JSON（canvasToProductObjArr 对应产品字段）
  let infoKeys = null; try { infoKeys = r.entry.canvasObjInfo ? Object.keys(r.entry.canvasObjInfo).slice(0, 40) : null; } catch (eI) {}
  let infoSample = null;
  try {
    if (r.entry.canvasObjInfo) {
      const arr = r.entry.canvasObjInfo.canvasToProductObjArr || [];
      const ix = arr.indexOf(obj);
      if (ix >= 0) {
        const host = r.entry.canvasObjInfo.canvasToProductObj; if (host && host[ix]) { const h = host[ix]; infoSample = { index: ix, keys: Object.keys(h).slice(0, 40), colorFields: Object.keys(h).filter(function (k) { return /color|fill/i.test(k); }).reduce(function (acc, k) { acc[k] = h[k]; return acc; }, {}) }; }
      }
    }
  } catch (eS) { infoSample = { err: String(eS && eS.message || eS).slice(0, 100) }; }
  out.serializerProbes.push({ objFill: String(obj.fill), fabricJson: flat, qKeys: qKeys, qErr: (qJson && qJson.err) || null, canvasObjInfoKeys: infoKeys, canvasToProductObjHost: infoSample, mediaFontColor: (obj.media && obj.media.font) ? obj.media.font.fontColor : null, multiUuid: obj.multiUuid ? String(obj.multiUuid) : null, markuuid: obj.markuuid ? String(obj.markuuid) : null });
  try { const regIdxE = r.entry.canvasObjInfo && r.entry.canvasObjInfo.canvasToProductObjArr ? r.entry.canvasObjInfo.canvasToProductObjArr.indexOf(obj) : -1; if (regIdxE >= 0) r.entry.canvasObjInfo.canvasToProductObjArr.splice(regIdxE, 1); if (obj && typeof c.remove === "function") c.remove(obj); try { if (typeof c.requestRenderAll === "function") c.requestRenderAll(); } catch (e) {} } catch (eCl) {}
} catch (eE) { out.errors.push("main:" + String(eE && eE.stack || (eE && eE.message || eE)).slice(0, 200)); }
return { ok: true, out: out };
`;

// ---- 页面 F：保存按钮侦察 + 网络捕获 ----
const PAGE_F_REQ = `const out = { saveButtons: [], errors: [] };
try {
  const all = Array.from(document.querySelectorAll("button,a,span,div"));
  for (const el of all) { const s = String(el.textContent || "").trim(); if (/^保存$|立即保存|保存并|保存$|保存当前|提交保存/.test(s) && s.length <= 10) out.saveButtons.push({ tag: el.tagName, cls: String(el.className || "").slice(0, 50), text: s, visible: !!el.offsetParent }); }
} catch (eF) { out.errors.push(String(eF && eF.message || eF).slice(0, 100)); }
return { ok: true, out: out };
`;

[RESOLVE_ENTRY, PAGE_AUDIT, PAGE_BLCK_REQ, PAGE_C_REQ, PAGE_D_REQ, PAGE_E_REQ, PAGE_F_REQ].forEach(function (src, i) {
  try { new Function(src); } catch (e) { console.error("[compile-check] chunk " + i + " SyntaxError: " + String(e && e.message || e) + " head=" + JSON.stringify((src || "").slice(0, 80)) + " tail=" + JSON.stringify((src || "").slice(-80))); process.exit(2); }
});

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const out = { ts: new Date().toISOString(), stage: "STAGE-10A-NATIVE-COLOR-AUDIT", version: USERSCRIPT_VERSION, url: URL.split("?")[0], cookiePresent: !!COOKIE_RAW, phases: {}, errors: [] };
  let browser = null;
  let page = null;
  try {
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1280, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    page = browser.pages()[0];
    const onPageErr = (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 140)); };
    page.on("pageerror", onPageErr);
    const saveResponses = [];
    const allNet = [];
    page.on("request", (req) => { try { const p = String(req.url()).split("?")[0]; if (p.indexOf(".js") < 0 && p.indexOf(".css") < 0 && p.indexOf(".png") < 0 && p.indexOf(".jpg") < 0 && p.indexOf(".jpeg") < 0 && p.indexOf(".gif") < 0 && p.indexOf(".woff") < 0 && p.indexOf(".ico") < 0 && p.indexOf("fonts.g") < 0) allNet.push({ status: null, method: req.method(), path: p.slice(0, 200) }); } catch (e) {} });
    page.on("response", (res) => { try { const u = String(res.url()); const p = u.split("?")[0]; if (p.indexOf(".js") < 0 && p.indexOf(".css") < 0 && p.indexOf(".png") < 0 && p.indexOf(".jpg") < 0 && p.indexOf(".gif") < 0 && p.indexOf(".woff") < 0 && p.indexOf(".ico") < 0 && p.indexOf("fonts.g") < 0) allNet.push({ status: res.status(), method: res.request() ? res.request().method() : null, path: p.slice(0, 160), kind: "response" }); } catch (e) {} });
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
    const evalAudit = async (codeChunk) => page.evaluate((ch) => { try { return window["__zyColorAudit"](ch); } catch (e) { return { ok: false, reason: "missing-fn" }; } }, codeChunk.name).catch((e) => ({ ok: false, reason: String(e && e.message || e).slice(0, 120) }));
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
    await injectPageWorld(RESOLVE_ENTRY + "\n;window.__zyColorAudit = (function(n){ var map={A:(function(){" + PAGE_AUDIT + "}),B:(function(){" + PAGE_BLCK_REQ + "}),C:(function(){" + PAGE_C_REQ + "}),D:(function(){" + PAGE_D_REQ + "}),E:(function(){" + PAGE_E_REQ + "}),F:(function(){" + PAGE_F_REQ + "})}; return function(ch){ return map[ch](); }; })();");
    await SLEEP(800);
    const audA = await evalAudit({ name: "A" });
    if (audA && audA.ok && audA.out) out.phases.A = audA.out;
    else out.phases.A = { failed: audA };
    await SLEEP(400);
    const audB = await evalAudit({ name: "B" });
    if (audB && audB.ok && audB.out) out.phases.B = audB.out;
    else out.phases.B = { failed: audB };
    await SLEEP(400);
    const audC = await evalAudit({ name: "C" });
    if (audC && audC.ok && audC.out) out.phases.C = audC.out;
    else out.phases.C = { failed: audC };
    await SLEEP(400);
    const audD = await evalAudit({ name: "D" });
    if (audD && audD.ok && audD.out) out.phases.D = audD.out;
    else out.phases.D = { failed: audD };
    await SLEEP(400);
    const audE = await evalAudit({ name: "E" });
    if (audE && audE.ok && audE.out) out.phases.E = audE.out;
    else out.phases.E = { failed: audE };
    await SLEEP(400);
    const audF = await evalAudit({ name: "F" });
    if (audF && audF.ok && audF.out) out.phases.F = audF.out;
    else out.phases.F = { failed: audF };
    // F2：真实保存按钮尝试（若存在）+ 网络捕获（只记 status，不落 body）
    const saveBtns = (out.phases.F && out.phases.F.saveButtons) || [];
    const visibleSave = saveBtns.filter((b) => b.visible)[0] || null;
    if (visibleSave) {
      const clicked = await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll("button,a,span,div"));
        for (const el of all) { const s = String(el.textContent || "").trim(); if (/^保存$|立即保存/.test(s) && el.offsetParent) { try { el.click(); return { clicked: true, text: s }; } catch (e) { return { clicked: false, err: String(e && e.message || e).slice(0, 80) }; } } }
        return { clicked: false };
      }).catch(() => ({ clicked: false }));
      await SLEEP(2500);
      out.phases.F2 = { button: visibleSave.text, clicked, saveNetwork: allNet.slice(-12) };
    } else {
      out.phases.F2 = { note: "no-visible-save-button（未触发真实保存网络）", saveNetwork: allNet.slice(-12) };
    }
    // ---- Phase G：save/reload 持久化闭环（受控 probe，立即清理恢复） ----
    out.phases.G = { steps: [], errors: [], netAfterSave: [] };
    try {
      // G1 创建 probe（fontColor #3366cc）
      const gCreate = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
        const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
        const c = d && d.canvas;
        if (!d || !c || typeof d.drawText !== "function") return { ok: false, reason: "no-diy" };
        let maxLayer = -1;
        try { c.getObjects().forEach(function (o) { if (o && typeof o.layerNum === "number" && o.layerNum > maxLayer) maxLayer = o.layerNum; }); } catch (e) {}
        const layerNum = maxLayer + 1;
        const w = 170;
        const media = {
          media: { mediaType: "text", text: "ZY_PERSIST_COLOR", font: { pointSize: 26, fontColor: "#3366cc", isHorizontal: 1, gravity: "left", id: "1", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.2, lineIdType: 0, isBG: 0, imgPath: "" },
          location: { x: 300, y: 260, width: w, height: 42, factWidth: w, factHeight: 42, rotation: 0 },
          printLocation: { x: 300, y: 260, width: w, height: 42, rotation: 0 },
          layer: { alpha: 1 }, layerNum: layerNum, isEdit: 1, isDisplay: 0, deleteState: 0, visitLevel: 1,
          multiUuid: "zy-persist-" + Date.now().toString(36), markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0,
          lowPixelFlag: 0, selectEnabled: 1, isDesign: 1, isComposite: 0, isPreview: 0, isDesignShape: 0
        };
        const nObj = d.drawText("ZY_PERSIST_COLOR", 26, 300, 260, media, layerNum);
        let obj = (typeof nObj === "object" && nObj !== null) ? nObj : null;
        const idOf = function (o) { return String((o && (o.uuid || o.multiUuid || o.id)) || ""); };
        if (!obj) { obj = (c.getObjects() || []).filter(function (o) { return o && String(o.text || "") === "ZY_PERSIST_COLOR"; })[0] || null; }
        if (!obj) return { ok: false, reason: "create-failed" };
        const rec = { uuid: String(obj.uuid || obj.multiUuid || ""), fill: String(obj.fill), identity: (typeof nObj === "object" && nObj !== null) ? "NATIVE_RETURN" : "LOOKUP" };
        return { ok: true, rec };
      }).catch((e) => ({ ok: false, reason: String(e && e.message || e).slice(0, 120) }));
      if (gCreate && gCreate.ok && gCreate.rec) out.phases.G.probeUuid = gCreate.rec.uuid;
      out.phases.G.steps.push({ step: "g1-create-probe", ok: !!(gCreate && gCreate.ok), rec: gCreate && gCreate.rec });
      // G2 真实保存（找“保存”按钮点击 + 全量网络）
      const gSave = await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll("button,a,span,div"));
        for (const el of all) { const s = String(el.textContent || "").trim(); if (/^保存$|立即保存/.test(s) && el.offsetParent) { try { el.click(); return { clicked: true, text: s }; } catch (e) { return { clicked: false }; } } }
        return { clicked: false };
      }).catch(() => ({ clicked: false }));
      await SLEEP(4000);
      out.phases.G.steps.push({ step: "g2-save", clicked: !!(gSave && gSave.clicked), netAfterSave: allNet.slice(-15) });
      // G3 reload → 重新注入 → 读 probe 持久性
      await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => out.phases.G.errors.push("RELOAD: " + String(e && e.message || e).slice(0, 100)));
      await SLEEP(4000);
      await injectPageWorld(pageWorldPayloadFor(cond));
      await SLEEP(1200);
      const readyG = await waitEditorReady(18);
      out.phases.G.steps.push({ step: "g3-reload-ready", ok: !!(readyG && readyG.ok) });
      await SLEEP(2500);
      const gRead = await page.evaluate((arg) => {
        const req = window.requirejs || window.require;
        const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
        const c = vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas;
        if (!c) return { ok: false, reason: "no-canvas" };
        const found = (c.getObjects() || []).filter(function (o) { return o && String(o.text || "") === "ZY_PERSIST_COLOR"; }).map(function (o) { return { uuid: String(o.uuid || o.multiUuid || ""), fill: String(o.fill), left: o.left, top: o.top }; });
        return { ok: true, found: found, probeUuid: arg.uuid };
      }, { uuid: out.phases.G.probeUuid }).catch((e) => ({ ok: false, reason: String(e && e.message || e).slice(0, 120) }));
      out.phases.G.steps.push({ step: "g4-read-after-reload", ok: !!(gRead && gRead.ok), foundCount: (gRead && gRead.found || []).length, found: (gRead && gRead.found || []) });
      out.phases.G.persisted = !!(gRead && gRead.ok && gRead.found.length === 1 && gRead.found[0].uuid === out.phases.G.probeUuid && String(gRead.found[0].fill).toLowerCase() === "#3366cc");
      // G5 清理 probe + 再保存（恢复模板）
      const gClean = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
        const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
        const c = d && d.canvas;
        let removed = 0;
        if (c) { (c.getObjects() || []).forEach(function (o) { try { if (o && String(o.text || "") === "ZY_PERSIST_COLOR") { const li = d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr ? d.canvasObjInfo.canvasToProductObjArr.indexOf(o) : -1; if (li >= 0) d.canvasObjInfo.canvasToProductObjArr.splice(li, 1); c.remove(o); removed += 1; } } catch (e) {} }); try { if (typeof c.requestRenderAll === "function") c.requestRenderAll(); } catch (e) {} }
        return { removed: removed };
      }).catch(() => ({ removed: 0 }));
      await SLEEP(600);
      const gSave2 = await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll("button,a,span,div"));
        for (const el of all) { const s = String(el.textContent || "").trim(); if (/^保存$|立即保存/.test(s) && el.offsetParent) { try { el.click(); return { clicked: true }; } catch (e) {} } }
        return { clicked: false };
      }).catch(() => ({ clicked: false }));
      await SLEEP(3000);
      out.phases.G.steps.push({ step: "g5-cleanup-save", removed: gClean.removed, clicked: !!(gSave2 && gSave2.clicked) });
      out.phases.G.cleanupRestored = gClean.removed >= 1;
    } catch (eG) { out.phases.G.errors.push("G: " + String(eG && e.stack || (eG && eG.message || eG)).slice(0, 250)); }
    await SLEEP(800);
  } catch (e) { out.errors.push("MAIN: " + String(e && e.stack || (e && e.message || e)).slice(0, 300)); }
  if (browser) await browser.close().catch(() => {});
  fs.writeFileSync(REPORT_FILE, JSON.stringify(out, null, 2));
  console.log("[native-color-audit] report=" + REPORT_FILE + " version=" + out.version);
  const B = out.phases.B, C = out.phases.C, A = out.phases.A;
  if (A) console.log("[native-color-audit] A existing#=" + ((A.existing || []).length) + " sampleFill=" + JSON.stringify((A.existing || []).map((x) => x.fill)));
  if (B) (B.mapping || []).forEach((m) => console.log("[native-color-audit] B " + m.colorHex + " -> fill=" + m.actualFill + " exact=" + m.exact + " mediaFontColor=" + m.actualMediaFontColor));
  if (C) (C.fillMutation || []).forEach((m) => console.log("[native-color-audit] C fillChanged=" + m.fillChanged + " renderChanged=" + m.renderChanged + " before=" + JSON.stringify(m.before && m.before.pixel && m.before.pixel.darkest) + " after=" + JSON.stringify(m.after && m.after.pixel && m.after.pixel.darkest)));
  if (out.phases.D) console.log("[native-color-audit] D controls#=" + (out.phases.D.controlsCount) + " bindings=" + ((out.phases.D.colorBindings || []).length));
  if (out.phases.E) console.log("[native-color-audit] E serializerProbes#=" + ((out.phases.E.serializerProbes || []).length) + " qKeys=" + JSON.stringify(((out.phases.E.serializerProbes || [])[0] || {}).qKeys));
  if (out.phases.F2) console.log("[native-color-audit] F2 save=" + JSON.stringify({ clicked: out.phases.F2.clicked, net: (out.phases.F2.saveNetwork || []).length }));
  out.errors.forEach((e) => console.log("[native-color-audit] ERR " + e));
  process.exit(out.errors.length ? 1 : 0);
})();