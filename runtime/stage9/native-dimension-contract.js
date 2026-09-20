// runtime/stage9/native-dimension-contract.js — Stage 9 方案 Commit 4：Native Template Dimension Contract（READ-ONLY audit）
// ---------------------------------------------------------------------
// 只读审计：打开真实模板（默认 1234075），采集 CanvasDiy/CurrentCanvas/CanvasObjVO/ProductVO/
//   PageVO 等 runtime 证据，调查 mmToPX/pxToMM 真实签名（有界候选参数，非破坏性），
//   四套尺寸（physical/canvas/source natural/viewport）分离，front/back 页结构与非破坏性切换，
//   垂直文字证据（读真实对象，不断言实现方式），location<->aCoords divergence（只记录不修复）。
// 禁止创建/修改/删除对象、禁止保存、禁止改 Canvas 尺寸。
// 纯模块：extension/src/editor/native-dimension-contract.js（node 侧归一化）。
// 凭据：ZY_STAGE9_COOKIE 仅运行时注入。报告：runtime/reports/stage-9/native-dimension-contract.json
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
const DC = require(path.join(ROOT, "extension", "src", "editor", "native-dimension-contract.js"));
const adapter = require("../scriptcat-adapter");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const DEFAULT_URL = "https://diy.zheliyin.com/diyWeb/third/1234075/2114747/999/thirdDiyAdd.do";
const URL = process.env.ZY_URL || DEFAULT_URL;
const COOKIE_RAW = process.env.ZY_STAGE9_COOKIE || "";
const USERSCRIPT_VERSION = (/\/\/ @version\s+([\d.]+)/.exec(fs.readFileSync(USERSCRIPT_PATH, "utf8")) || [])[1] || "unknown";

// ---- 页面侧前导：解析当前编辑页 entry/canvas ----
const RESOLVE_ENTRY = `
function resolveEntry() {
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
  return { ok: true, idx: idx, entry: entry, canvas: canvas, canvasDiy: (entry && typeof entry.drawText === "function") ? entry : null, CV: CV };
}
`;
const pageRun = (page, code) => page.evaluate("(function(){ " + RESOLVE_ENTRY + "\n" + code + "\n })()").catch((e) => ({ ok: false, reason: "evaluate:" + String(e && e.message || e).slice(0, 140) }));

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
  t("normalize-physical", DC.normalizeDimensionEvidence({ physical: { widthMM: 90, heightMM: 55, source: "n" } }).physical.widthMM === 90);
  t("contract-uniform", DC.buildDimensionContract({ physical: { widthMM: 90, heightMM: 55 }, canvas: { widthPx: 450, heightPx: 275, source: "native" } }).uniformScale === true);
  t("contract-nonuniform", DC.buildDimensionContract({ physical: { widthMM: 90, heightMM: 55 }, canvas: { widthPx: 450, heightPx: 330, source: "native" } }).uniformScale === false);
  t("equiv-id", DC.dimensionContractEquivalent({ pageIdentity: "canvas:c0", physical: { widthMM: 90, heightMM: 55 }, canvas: { widthPx: 450, heightPx: 275 } }, { pageIdentity: "canvas:c0", physical: { widthMM: 90, heightMM: 55 }, canvas: { widthPx: 450, heightPx: 275 } }).equivalent === true);
  t("no-hardcode", JSON.stringify(DC.buildDimensionContract({ physical: { widthMM: 90, heightMM: 55 }, canvas: { widthPx: 450, heightPx: 275 } })).indexOf('"92"') < 0);
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }
if (!COOKIE_RAW) console.warn("[native-dim-contract] 未注入 ZY_STAGE9_COOKIE —— 回退持久 profile（可能过期）；cookiePresent=false");

// ---- 页面结构 + 模块/注册表盘点（只读）----
const codeStructure = `
const r = resolveEntry();
const defs = (window.requirejs && window.requirejs.s && window.requirejs.s.contexts && window.requirejs.s.contexts._ && window.requirejs.s.contexts._.defined) || {};
const MODS = ["CanvasDiy", "CanvasObjVO", "CurrentCanvas", "MultiCanvasDiy", "PageVO", "DesignPageVO", "CurrentCanvasInfo", "ProductVO", "MasterVO", "ProductDataModel", "DesignVO"];
const modules = {};
MODS.forEach((m) => { const mod = defs[m]; modules[m] = mod ? { present: true, type: typeof mod, keyCount: (typeof mod === "object") ? Object.keys(mod).length : null } : { present: false }; });
const KEYHITS = ["page", "pageList", "canvasList", "canvasPages", "canvasArray", "multiCanvas", "currentPage", "currentCanvasNum"];
MODS.forEach((m) => { const mod = defs[m]; if (!mod || typeof mod !== "object") return; modules[m].hits = []; KEYHITS.forEach((k) => { if (k in mod) { const v = mod[k]; modules[m].hits.push({ key: k, type: typeof v, prim: (typeof v !== "object" && typeof v !== "function") ? String(v).slice(0, 24) : (Array.isArray(v) ? ("arr:" + v.length) : (typeof v === "function" ? "fn" : "obj")) }); } }); });
const CV = r.CV || {};
const total = CV.totalCanvasArray || [];
return {
  ok: true,
  pageCount: total.length,
  currentCanvasNum: CV.currentCanvasNum != null ? CV.currentCanvasNum : null,
  canvasPagesNum: CV.canvasPagesNum != null ? CV.canvasPagesNum : null,
  multiCanvas: !!CV.multiCanvas,
  frontImg: !!CV.frontImgPathStr, backImg: !!CV.backImgPathStr,
  pages: total.map(function (d, i) { const c = d && d.canvas; return { pageIndex: i, idName: d && d.idName != null ? String(d.idName) : null, hasDrawText: !!(d && typeof d.drawText === "function"), canvasWidth: c ? c.width : null, canvasHeight: c ? c.height : null, objectCount: c ? c.getObjects().length : null, tWidthMM: d && typeof d.tWidthMM === "number" ? d.tWidthMM : null, tHeightMM: d && typeof d.tHeightMM === "number" ? d.tHeightMM : null }; }),
  modules: modules
};
`;

// ---- CanvasDiy.getInstance 深盘点（限制深度；只读 getter 可调用）----
const codeDiyInventory = `
const defs = (window.requirejs && window.requirejs.s && window.requirejs.s.contexts && window.requirejs.s.contexts._ && window.requirejs.s.contexts._.defined) || {};
const CD = defs.CanvasDiy || null;
let inst = null;
try { inst = CD && typeof CD.getInstance === "function" ? CD.getInstance() : null; } catch (e) {}
if (!inst) { const r = resolveEntry(); inst = r.canvasDiy || r.entry || null; }
const out = { found: !!inst, source: "CanvasDiy.getInstance" };
if (!inst) { out.source = "canvasDiy-entry-or-none"; return out; }
const KEYS = ["tWidthMM", "tHeightMM", "width", "height", "canvasWidth", "canvasHeight", "zoom", "scale", "currentCanvasNum", "canvasPagesNum", "multiCanvas", "objWidth", "objHeight", "currentSize", "initRatio", "inchMM", "getCurrentSize", "getCanvasId", "getCurrentFactWidth", "getCurrentFactHeight", "safeWidth", "safeHeight", "bleedWidth", "bleedHeight"];
const protoLevel = (deep, key) => { let lvl = 0; let cur = deep; while (cur && lvl <= 4) { if (Object.prototype.hasOwnProperty.call(cur, key)) return lvl; cur = Object.getPrototypeOf(cur); lvl += 1; } return null; };
const n = (v) => (typeof v === "number" && isFinite(v) ? v : (typeof v === "string" && v.trim() !== "" && isFinite(Number(v)) ? Number(v) : null));
out.fields = {};
KEYS.forEach((k) => {
  let val = null, valType = "absent";
  try { if (k in inst) { const v = inst[k]; if (typeof v === "function") { try { val = typeof v() !== "undefined" && v() !== null && typeof v() !== "object" ? v() : "(fn)"; } catch (e) { val = "(fn)"; } } else if (typeof v !== "object") { val = v; } else { val = "(obj)"; } valType = typeof v === "function" ? "fn" : typeof v; } } catch (e) {}
  out.fields[k] = { protoLevel: protoLevel(inst, k), value: (typeof val === "number") ? Math.round(val * 10000) / 10000 : (typeof val === "string" ? val.slice(0, 40) : val), type: valType };
});
out.physicalCandidates = { tWidthMM: n(inst.tWidthMM), tHeightMM: n(inst.tHeightMM) };
return out;
`;

// ---- mm<->px 换算签名调查（有界候选，非破坏性；SetSize/CalculationCoordsSize 只登记不调用）----
const codeConversion = `
const defs = (window.requirejs && window.requirejs.s && window.requirejs.s.contexts && window.requirejs.s.contexts._ && window.requirejs.s.contexts._.defined) || {};
const sundry = defs.sundry || null;
const fnChain = (owner, fnName) => { const out = { found: false, protoLevel: null, length: null }; if (!owner) return out; let lvl = 0; let cur = owner; while (cur && lvl <= 5) { try { if (Object.prototype.hasOwnProperty.call(cur, fnName)) { out.found = true; out.protoLevel = lvl; const f = cur[fnName]; if (typeof f === "function") { out.length = f.length; out.src = String(f).replace(/\\\\s+/g, " ").slice(0, 200); } return out; } } catch (e) {} cur = Object.getPrototypeOf(cur); lvl += 1; } out.found = false; return out; };
const meta = {};
["mmToPX", "pxToMM"].forEach((fn) => { const m = fnChain(sundry, fn); meta[fn] = { available: m.found, protoLevel: m.protoLevel, functionLength: m.length, src: m.src || null }; });
["CalculationCoordsSize", "SetSize"].forEach((fn) => { const m = fnChain(sundry, fn); meta[fn] = { present: m.found, protoLevel: m.protoLevel, functionLength: m.length }; }); // 只登记不调用
// mmToPX/pxToMM 非破坏性候选调用（形状有来源，非无限 fuzz）
const probe = (fnName, fn) => {
  const candidates = [
    { shape: "scalar(mm)", args: [92] },
    { shape: "scalar,sid", args: [92, undefined] },
    { shape: "scalar,scale", args: [92, 3] },
    { shape: "scalar,0", args: [92, 0] },
    { shape: "scalar,dpi300", args: [92, 300] },
    { shape: "obj{w,h}", args: [{ width: 92, height: 56 }] },
    { shape: "obj,w", args: [{ width: 92, height: 56 }, 92] },
    { shape: "two scalars", args: [92, 56] }
  ];
  const attempts = [];
  if (typeof fn !== "function") return { attempts: attempts, resolved: null };
  for (let i = 0; i < candidates.length; i += 1) {
    const c = candidates[i];
    try {
      const v = fn.apply(sundry, c.args);
      const numStr = (typeof v === "string" && v.trim() !== "" && isFinite(Number(v))) ? Number(v) : null;
      const fin = (typeof v === "number" && isFinite(v)) || numStr != null;
      const objFin = (v && typeof v === "object" && ((typeof v.width === "number" && isFinite(v.width)) || (typeof v.px === "number" && isFinite(v.px))));
      const resolvedV = (typeof v === "number") ? v : numStr;
      attempts.push({ shape: c.shape, result: fin ? resolvedV : (v == null ? null : (objFin ? "obj:" + JSON.stringify({ w: v.width, h: v.height, px: v.px }).slice(0, 40) : String(v).slice(0, 30))) });
      if (fin) return { attempts: attempts, resolved: { shape: c.shape, argsCount: c.args.length, argsFor: c.args, result: Math.round(resolvedV * 10000) / 10000 } };
    } catch (e) { attempts.push({ shape: c.shape, result: "threw" }); }
  }
  return { attempts: attempts, resolved: null };
};
const resMM = probe("mmToPX", sundry && sundry.mmToPX);
const resPX = probe("pxToMM", sundry && sundry.pxToMM);
let roundtrip = null;
if (resMM.resolved && resPX.resolved) { try { const a = Number(sundry.mmToPX.apply(sundry, resMM.resolved.argsFor)); const b = Number(sundry.pxToMM.apply(sundry, [a].concat(resPX.resolved.argsFor.slice(1)))); roundtrip = { mm: 92, px: a, backMm: b, errMm: (isFinite(a) && isFinite(b)) ? Math.round((b - 92) * 100) / 100 : null }; } catch (e) { roundtrip = { err: "roundtrip-threw" }; } }
return { sundryFound: !!sundry, meta: meta, mmToPX: resMM, pxToMM: resPX, roundtrip: roundtrip };
`;

// ---- source image natural size + viewport（只读）----
const codeSourceAndViewport = `
const r = resolveEntry();
if (!r.ok) return { ok: false, reason: r.reason };
const canvas = r.canvas;
const imgs = [];
try { (canvas.getObjects() || []).forEach(function (o) { if (o && String(o.type) === "image") { const el = o._element || (o.getElement && o.getElement()) || null; imgs.push({ o: o, el: el }); } }); } catch (e) {}
const bg = canvas.backgroundImage || null;
const best = imgs.map(function (x) { let w = 0; try { w = (x.o.getScaledWidth && x.o.getScaledWidth()) || 0; } catch (e) {} return { x: x, w: w }; }).sort(function (a, b) { return b.w - a.w; })[0] || null;
const target = bg || (best ? best.x.o : null);
const el = target ? (target._element || (target.getElement && target.getElement()) || null) : null;
const sourceImage = target ? {
  naturalWidthPx: (el && el.naturalWidth) || (target.naturalWidth) || null,
  naturalHeightPx: (el && el.naturalHeight) || (target.naturalHeight) || null,
  objectWidthPx: typeof target.width === "number" ? target.width : null,
  objectHeightPx: typeof target.height === "number" ? target.height : null,
  scaleX: typeof target.scaleX === "number" ? target.scaleX : null,
  scaleY: typeof target.scaleY === "number" ? target.scaleY : null,
  scaledWidthPx: null, scaledHeightPx: null,
  kind: bg ? "backgroundImage" : (best ? "largest-image-object" : null)
} : null;
if (sourceImage) { try { sourceImage.scaledWidthPx = target.getScaledWidth && target.getScaledWidth(); } catch (e) {} try { sourceImage.scaledHeightPx = target.getScaledHeight && target.getScaledHeight(); } catch (e) {} }
let rect = null, zoom = null, cw = null, ch = null;
try { const el2 = canvas.getElement ? canvas.getElement() : canvas.lowerCanvasEl; if (el2) { const rr = el2.getBoundingClientRect(); rect = { width: rr.width, height: rr.height, left: rr.left, top: rr.top }; } } catch (e) {}
try { zoom = typeof canvas.getZoom === "function" ? canvas.getZoom() : null; } catch (e) {}
try { cw = typeof canvas.getWidth === "function" ? canvas.getWidth() : canvas.width; ch = typeof canvas.getHeight === "function" ? canvas.getHeight() : canvas.height; } catch (e) {}
return { ok: true, sourceImage: sourceImage, viewport: { boundingRect: rect, zoom: zoom, canvasGetWidth: cw, canvasGetHeight: ch, note: "canvas logical W/H 与 display rect 分离记录" } };
`;

// ---- 现有原生 textbox 的 location<->aCoords divergence（只读采样，不创建）----
const codeDivergence = `
const r = resolveEntry();
if (!r.ok) return { ok: false, reason: r.reason };
const objs = r.canvas.getObjects() || [];
const samples = [];
objs.forEach(function (o, i) {
  if (!o || (String(o.type) !== "textbox" && String(o.type) !== "i-text" && String(o.type) !== "text")) return;
  if (samples.length >= 12) return;
  try { if (typeof r.canvas.setCoords === "function") r.canvas.setCoords(); if (typeof o.setCoords === "function") o.setCoords(); } catch (e) {}
  const ac = o.aCoords;
  let vw = null, vh = null;
  if (ac && ac.tl && ac.br) { vw = Math.hypot(ac.tr.x - ac.tl.x, ac.tr.y - ac.tl.y); vh = Math.hypot(ac.bl.x - ac.tl.x, ac.bl.y - ac.tl.y); }
  const loc = { width: typeof o.locationWidth === "number" ? o.locationWidth : null, height: typeof o.locationHeight === "number" ? o.locationHeight : null };
  const act = { width: typeof o.width === "number" ? o.width : null, height: typeof o.height === "number" ? o.height : null };
  const acs = { width: vw, height: vh };
  const diverges = (loc.width != null && act.width != null && Math.abs(loc.width - act.width) > 0.5);
  samples.push({ objectIndex: i, text: String(o.text || "").slice(0, 24), nativeRequestedSize: loc, actualObjectSize: act, aCoordsSize: acs, angle: typeof o.angle === "number" ? o.angle : null, consistency: diverges ? "NATIVE_DIVERGENCE" : "MATCH" });
});
const divCount = samples.filter(function (s) { return s.consistency === "NATIVE_DIVERGENCE"; }).length;
return { ok: true, total: samples.length, diverged: divCount, samples: samples };
`;

// ---- 页面切换（非破坏性）----
const setCurrentNumCode = (nn) => `const CV = (window.requirejs && window.requirejs.s && window.requirejs.s.contexts && window.requirejs.s.contexts._ && window.requirejs.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO; if (CV) CV.currentCanvasNum = ${nn}; try { delete window.CurrentCanvas; } catch (e) {} return !!CV;`;
const clickSideCode = (lbl) => `let clicked = false; try { document.querySelectorAll(".page-group .pageNum").forEach(function (el) { const s = String(el.textContent || "").trim(); if (${lbl === "back" ? "/反面|背面|第2页/.test(s)" : "/正面|第1页/.test(s)"}) { el.click(); clicked = true; } }); } catch (e) {} return clicked;`;
const collectSideCode = `
const r = resolveEntry();
if (!r.ok) return { ok: false, reason: r.reason };
const CV = r.CV || {};
const objs = r.canvas.getObjects() || [];
const byType = {};
objs.forEach(function (o) { const t = o.type || "?"; byType[t] = (byType[t] || 0) + 1; });
const vertical = [];
objs.forEach(function (o, i) {
  if (!o || (String(o.type) !== "textbox" && String(o.type) !== "i-text" && String(o.type) !== "text")) return;
  const vw = null, vh = null;
  const ac = o.aCoords;
  let vww = null, vhh = null;
  if (ac && ac.tl && ac.br) { vww = Math.hypot(ac.tr.x - ac.tl.x, ac.tr.y - ac.tl.y); vhh = Math.hypot(ac.bl.x - ac.tl.x, ac.bl.y - ac.tl.y); }
  vertical.push({ index: i, type: o.type, text: String(o.text || "").slice(0, 20), angle: typeof o.angle === "number" ? o.angle : null, originX: o.originX != null ? String(o.originX) : null, originY: o.originY != null ? String(o.originY) : null, width: typeof o.width === "number" ? o.width : null, height: typeof o.height === "number" ? o.height : null, scaleX: typeof o.scaleX === "number" ? o.scaleX : null, scaleY: typeof o.scaleY === "number" ? o.scaleY : null, visualWidth: vww, visualHeight: vhh });
});
return {
  ok: true, pageIndex: r.idx, currentCanvasNum: CV.currentCanvasNum != null ? CV.currentCanvasNum : null,
  idName: r.entry && r.entry.idName != null ? String(r.entry.idName) : null,
  hasDrawText: !!(r.entry && typeof r.entry.drawText === "function"),
  canvasWidth: r.canvas.width, canvasHeight: r.canvas.height,
  tWidthMM: r.entry && typeof r.entry.tWidthMM === "number" ? r.entry.tWidthMM : null,
  tHeightMM: r.entry && typeof r.entry.tHeightMM === "number" ? r.entry.tHeightMM : null,
  objectCount: objs.length, byType: byType, verticalTextCandidates: vertical
};
`;
const waitReadyTick = () => { const req = window.requirejs; const CV = (req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO; return { ok: !!(CV && Array.isArray(CV.totalCanvasArray)) }; };

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const out = {
    ts: new Date().toISOString(), version: USERSCRIPT_VERSION,
    stage: "STAGE-9-V8-NATIVE-DIMENSION-CONTRACT",
    template: { urlPath: URL, third: (/\/third\/(\d+)/.exec(URL) || [])[1] || null, product: (/\/third\/\d+\/(\d+)/.exec(URL) || [])[1] || null, detail: (/\/third\/\d+\/\d+\/(\d+)/.exec(URL) || [])[1] || null },
    cookiePresent: !!COOKIE_RAW,
    note: "READ-ONLY dimension contract audit; 无对象创建/修改/保存; mm<=>px 候选调用仅纯计算; verdict 全部证据型",
    dimensionEvidence: null, conversionEvidence: null, pageEvidence: null, frontPage: null, backPage: null,
    sourceImageEvidence: null, viewportEvidence: null, verticalTextEvidence: null, divergenceEvidence: null,
    contracts: null, verdict: null, errors: []
  };
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
      console.log("[native-dim-contract] scriptcat cleaned removed=" + removed);
    } catch (eClean) { out.errors.push("CLEAN: " + String(eClean && eClean.message || eClean).slice(0, 120)); }
    for (const c of parseCookies(COOKIE_RAW)) { try { await browser.addCookies([c]); } catch (e) { out.errors.push("COOKIE:" + c.name + " " + String(e && e.message || e).slice(0, 100)); } }
    page = await (async () => { await page.close().catch(() => {}); const p = await browser.newPage(); p.on("pageerror", onPageErr); return p; })();
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => out.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
    await SLEEP(4000);
    const waitEditorReady = async (tries) => { for (let i = 0; i < (tries || 18); i += 1) { const r = await page.evaluate(waitReadyTick).catch(() => ({})); if (r && r.ok) return r; await SLEEP(1200); } return page.evaluate(waitReadyTick).catch(() => ({})); };
    const ready = await waitEditorReady(18);
    if (!(ready && ready.ok)) out.errors.push("EDITOR_UNAVAILABLE");
    await SLEEP(2500);

    const structure = await pageRun(page, codeStructure);
    out.pageEvidence = structure;
    const diyInv = await pageRun(page, codeDiyInventory);
    out.dimensionEvidence = { canvasDiyInventory: diyInv };
    const conv = await pageRun(page, codeConversion);
    out.conversionEvidence = conv;
    const sv = await pageRun(page, codeSourceAndViewport);
    out.sourceImageEvidence = sv && sv.sourceImage;
    out.viewportEvidence = sv && sv.viewport;

    // Front evidence
    const front = await pageRun(page, collectSideCode);
    out.frontPage = front;
    // 非破坏性切到 Back
    const fbStep = { attempts: [], switchMethod: null, errors: [] };
    let clickedBack = false;
    try { clickedBack = await page.evaluate(clickSide("back")).catch(() => false); } catch (e) {}
    fbStep.attempts.push({ method: "ui-click-back", ok: clickedBack });
    if (!clickedBack) { await page.evaluate("(function(){ " + setCurrentNumCode(2) + " })()").catch(() => {}); fbStep.attempts.push({ method: "native-currentCanvasNum=2", ok: true }); }
    fbStep.switchMethod = clickedBack ? "ui-click-back" : "native-currentCanvasNum=2";
    await SLEEP(1800);
    const back = await pageRun(page, collectSideCode);
    // 切回 Front 并验证身份恢复
    let clickedFront = false;
    try { clickedFront = await page.evaluate(clickSide("front")).catch(() => false); } catch (e) {}
    if (!clickedFront) { await page.evaluate("(function(){ " + setCurrentNumCode(1) + " })()").catch(() => {}); }
    await SLEEP(1800);
    const frontAfter = await pageRun(page, collectSideCode);
    out.frontPageAfterSwitch = frontAfter;
    fbStep.identityRestored = !!(frontAfter && front.ok && frontAfter.idName === front.idName && frontAfter.currentCanvasNum === front.currentCanvasNum);
    fbStep.objectCountUnchanged = !!(frontAfter && front.ok && frontAfter.objectCount === front.objectCount);
    fbStep.switchVerified = !!(back && back.ok) && ((back.currentCanvasNum == null) || back.currentCanvasNum !== front.currentCanvasNum || back.idName !== front.idName || back.objectCount !== front.objectCount);
    out.pageSwitch = fbStep;
    out.backPage = back;

    // 垂直文字证据（front+back 合并；仅 evidence）
    out.verticalTextEvidence = { front: (front && front.verticalTextCandidates) || [], back: (back && back.verticalTextCandidates) || [], note: "只读真实对象；angle/origin/aCoords 不预设竖版实现方式" };

    // location<->aCoords divergence（现有原生 textbox 采样）
    out.divergenceEvidence = await pageRun(page, codeDivergence);

    // 组装每页 dimension contract
    const mkContract = (side, page, sourceImg, vp) => {
      const physicalMM = (page && page.tWidthMM != null) ? { widthMM: page.tWidthMM, heightMM: page.tHeightMM, source: "CanvasDiy.t*MM" } : (diyInv && diyInv.physicalCandidates && diyInv.physicalCandidates.tWidthMM != null ? { widthMM: diyInv.physicalCandidates.tWidthMM, heightMM: diyInv.physicalCandidates.tHeightMM, source: "CanvasDiy-instance" } : {});
      const canvas = page ? { widthPx: page.canvasWidth, heightPx: page.canvasHeight, source: "native" } : {};
      let conversion = { status: "NATIVE_CONVERSION_SIGNATURE_UNRESOLVED", api: "sundry.mmToPX/pxToMM", confidence: "LOW" };
      if (conv && conv.sundryFound && conv.mmToPX && conv.mmToPX.resolved && conv.pxToMM && conv.pxToMM.resolved) conversion = { status: "NATIVE_CONVERSION_SIGNATURE_CONFIRMED", api: "sundry.mmToPX/pxToMM", confidence: "HIGH", mmToPXShape: conv.mmToPX.resolved.shape, pxToMMShape: conv.pxToMM.resolved.shape, roundtrip: conv.roundtrip || null };
      else if (conv && !conv.sundryFound) conversion = { status: "NATIVE_CONVERSION_UNAVAILABLE", api: "sundry", confidence: "HIGH", note: "sundry 模块未找到（有反证才可判不可用）" };
      return DC.buildDimensionContract({ physical: physicalMM, canvas: canvas, sourceImage: sourceImg || {}, viewport: vp || {}, pageIdentity: page ? ("canvas:" + (page.idName || "?")) : null, canvasIdentity: page ? (page.idName || null) : null, conversion: conversion, sizeDivergence: null });
    };
    out.contracts = {};
    out.contracts.front = mkContract("front", front, null, null);
    out.contracts.back = back && back.ok ? mkContract("back", back, null, null) : null;

    // 对比 core contract（结构/页切换后身份恢复）
    const swapped = frontAfter && front.ok && frontAfter.idName === front.idName;
    out.contracts.frontAfterSwitch = swapped ? mkContract("front-after-switch", frontAfter, null, null) : null;

    // Verdict（证据型结论）
    const v = [];
    const physObserved = !!(diyInv && diyInv.physicalCandidates && diyInv.physicalCandidates.tWidthMM != null && diyInv.physicalCandidates.tHeightMM != null);
    const canvasObserved = !!(front && typeof front.canvasWidth === "number" && front.canvasHeight != null);
    if (physObserved) v.push("NATIVE_DIMENSION_CONFIRMED");
    if (conv && conv.sundryFound && conv.mmToPX && conv.mmToPX.resolved && conv.pxToMM && conv.pxToMM.resolved) v.push("NATIVE_CONVERSION_SIGNATURE_CONFIRMED");
    else v.push("NATIVE_CONVERSION_SIGNATURE_UNRESOLVED");
    if (structure && structure.pageCount > 1) v.push("MULTI_PAGE_CONFIRMED");
    else if (structure && structure.multiCanvas && structure.canvasPagesNum && structure.canvasPagesNum > 1) v.push("MULTI_PAGE_DYNAMIC");
    else v.push("SINGLE_PAGE_CONFIRMED_AS_OBSERVED");
    if (sv && sv.sourceImage && sv.sourceImage.naturalWidthPx != null) v.push("SOURCE_IMAGE_CONFIRMED");
    if (sv && sv.viewport) v.push("VIEWPORT_SEPARATED");
    const vertSeen = (out.verticalTextEvidence.front || []).some((x) => x.angle !== 0 && x.angle != null) || (out.verticalTextEvidence.back || []).some((x) => x.angle !== 0 && x.angle != null);
    v.push(vertSeen ? "VERTICAL_TEXT_OBSERVED" : "VERTICAL_TEXT_UNRESOLVED_OR_NONE");
    out.verdict = { keys: v, physicalWidthMM: diyInv && diyInv.physicalCandidates ? diyInv.physicalCandidates.tWidthMM : null, physicalHeightMM: diyInv && diyInv.physicalCandidates ? diyInv.physicalCandidates.tHeightMM : null, canvasWidthPx: front && front.canvasWidth, canvasHeightPx: front && front.canvasHeight };
  } catch (e) { out.errors.push("MAIN: " + String(e && e.stack || (e && e.message || e)).slice(0, 300)); }
  if (browser) await browser.close().catch(() => {});
  fs.writeFileSync(path.join(REPORT_DIR, "native-dimension-contract.json"), JSON.stringify(out, null, 2));
  console.log("[native-dim-contract] report=" + path.join(REPORT_DIR, "native-dimension-contract.json"));
  if (out.verdict) console.log("[native-dim-contract] verdict=" + out.verdict.keys.join(" | "));
  console.log("[native-dim-contract] physical=" + (out.verdict && out.verdict.physicalWidthMM) + "x" + (out.verdict && out.verdict.physicalHeightMM) + "mm canvas=" + (out.verdict && out.verdict.canvasWidthPx) + "x" + (out.verdict && out.verdict.canvasHeightPx) + (out.conversionEvidence ? " conv=" + (out.conversionEvidence.mmToPX && out.conversionEvidence.mmToPX.resolved ? "RESOLVED" : "UNRESOLVED") : ""));
  console.log("[native-dim-contract] pages=" + (out.pageEvidence ? out.pageEvidence.pageCount : "?") + " canvasPagesNum=" + (out.pageEvidence ? out.pageEvidence.canvasPagesNum : "?") + " switchMethod=" + (out.pageSwitch && out.pageSwitch.switchMethod) + " identityRestored=" + (out.pageSwitch && out.pageSwitch.identityRestored) + " objectCountUnchanged=" + (out.pageSwitch && out.pageSwitch.objectCountUnchanged));
  const errs = out.errors;
  errs.forEach((e) => console.log("[native-dim-contract] ERR " + e));
  process.exit(errs.length ? 1 : 0);
})();