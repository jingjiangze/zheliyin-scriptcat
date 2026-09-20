// runtime/stage9/native-create-measure.js — Stage 9 方案 Commit 3：Native Create → Measure
// ---------------------------------------------------------------------
// 只做（§二）：Native Create / Object Recovery / Snapshot / Geometry Measurement /
//   Dimension Discovery / Page Discovery / Cleanup。禁止 OCR / Baidu / ImageInk / 字体校准。
// 核心问题：请求 geometry vs 原生 drawText 后真实 Canvas 几何（aCoords/left/top/location*）。
// 对象定位：findCreatedNativeObject 多级优先级（NATIVE_RETURN>REGISTRY_DELTA>OBJECT_DELTA>
//   MULTIUUID>UUID>LAYERNUM>CREATION_ORDER>TEXT_FALLBACK），text 仅最后兜底。
// 页面侧前导代码（RESOLVE_ENTRY + MEASURE_FN）由 node 侧以字符串注入 evaluate，
// 避免 Playwright 不序列化外层闭包导致 resolveEntry undefined。
// 凭据：ZY_STAGE9_COOKIE 仅运行时注入（报告只记 cookiePresent）。本 Commit 不需要 Baidu。
// 报告：runtime/reports/stage-9/native-create-measure.json
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
const Z = require(path.join(ROOT, "extension", "src", "editor", "native-create-measure.js"));
const adapter = require("../scriptcat-adapter");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const DEFAULT_URL = "https://diy.zheliyin.com/diyWeb/third/1234075/2114747/999/thirdDiyAdd.do";
const URL = process.env.ZY_URL || DEFAULT_URL;
const COOKIE_RAW = process.env.ZY_STAGE9_COOKIE || "";
const USERSCRIPT_VERSION = (/\/\/ @version\s+([\d.]+)/.exec(fs.readFileSync(USERSCRIPT_PATH, "utf8")) || [])[1] || "unknown";
const CASES = [
  { id: "A", text: "ZY_NATIVE_PROBE_A", fontSize: 24, left: 50, top: 50, w: 160, h: 34, angle: 0 },
  { id: "B", text: "ZY_NATIVE_PROBE_B", fontSize: 24, left: 200, top: 120, w: 160, h: 34, angle: 0 },
  { id: "C", text: "ZY_NATIVE_PROBE_C", fontSize: 24, left: 50, top: 50, w: 160, h: 34, angle: 90 },
  { id: "D", text: "ZY_NATIVE_PROBE_D", fontSize: 60, left: 50, top: 50, w: 300, h: 80, angle: 0 },
  { id: "E", text: "ZY_NATIVE_PROBE_" + String.fromCharCode(20013) + "文字ABC123", fontSize: 24, left: 50, top: 50, w: 240, h: 34, angle: 0 }
];

// ---- 页面侧前导：解析当前编辑页 entry/canvas（CurrentCanvas 身份 > currentCanvasNum > 唯一页）----
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
// ---- 页面侧前导：按身份实测（setCoords → aCoords/三层位置/样式/identity）----
const MEASURE_FN = `
function measureByIdentity(identityId) {
  const r = resolveEntry();
  if (!r.ok) return { ok: false, reason: r.reason };
  let o = null;
  try { o = (r.canvas.getObjects() || []).find((x) => { const id = (x && (x.multiUuid || x.uuid || x.id)) || null; return id === identityId; }) || null; } catch (e) {}
  if (!o) return { ok: false, reason: "identity-not-found:" + identityId };
  try { if (typeof r.canvas.setCoords === "function") r.canvas.setCoords(); if (typeof o.setCoords === "function") o.setCoords(); } catch (e) {}
  const ac = o.aCoords;
  const n = (v) => (typeof v === "number" ? v : null);
  const quad = (ac && ac.tl && ac.tr && ac.br && ac.bl) ? [ac.tl, ac.tr, ac.br, ac.bl] : null;
  const cx = quad ? (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4 : null;
  const cy = quad ? (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4 : null;
  const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const visualWidth = quad ? (d2(quad[0], quad[1]) + d2(quad[2], quad[3])) / 2 : null;
  const visualHeight = quad ? (d2(quad[0], quad[3]) + d2(quad[1], quad[2])) / 2 : null;
  const visualAngle = quad ? Math.atan2(quad[1].y - quad[0].y, quad[1].x - quad[0].x) * 180 / Math.PI : null;
  return {
    ok: true,
    fabric: { left: n(o.left), top: n(o.top), width: n(o.width), height: n(o.height), scaleX: n(o.scaleX), scaleY: n(o.scaleY), angle: n(o.angle), originX: o.originX != null ? String(o.originX) : null, originY: o.originY != null ? String(o.originY) : null },
    aCoords: quad ? { center: { x: cx, y: cy }, visualWidth: visualWidth, visualHeight: visualHeight, angle: visualAngle } : null,
    location: { locationX: n(o.locationX), locationY: n(o.locationY), locationWidth: n(o.locationWidth), locationHeight: n(o.locationHeight), locationRotation: n(o.locationRotation) },
    style: { fontFamily: o.fontFamily != null ? String(o.fontFamily) : null, fontSize: n(o.fontSize), lineHeight: n(o.lineHeight), charSpacing: n(o.charSpacing), textAlign: o.textAlign != null ? String(o.textAlign) : null },
    identity: { uuid: o.uuid != null ? String(o.uuid) : null, multiUuid: o.multiUuid != null ? String(o.multiUuid) : null, markuuid: o.markuuid != null ? String(o.markuuid) : null, layerNum: n(o.layerNum), text: (typeof o.text === "string") ? o.text.slice(0, 40) : null }
  };
}
`;
const PAGE_PRELUDE = RESOLVE_ENTRY + MEASURE_FN;

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
  t("case-count", CASES.length === 5 && CASES.map((c) => c.id).join() === "A,B,C,D,E");
  t("identify-NATIVE_RETURN", Z.identifyNewlyCreated({ before: [{ key: "k1" }], after: [{ key: "k1" }, { key: "k2", multiUuid: "mk" }], nativeReturnId: "mk" }).recoverySource === "NATIVE_RETURN");
  t("identify-REGISTRY_DELTA", Z.identifyNewlyCreated({ before: [{ key: "k1" }], after: [{ key: "k1" }, { key: "k2", multiUuid: "mk" }], beforeRegistry: ["m1"], afterRegistry: ["m1", "mk"] }).recoverySource === "REGISTRY_DELTA");
  t("geom-diff-zero", Z.geometryDiff({ left: 50, top: 50, width: 100, height: 30, angle: 0 }, { left: 50, top: 50, width: 100, height: 30, scaleX: 1, scaleY: 1, angle: 0, center: { x: 100, y: 65 }, visualWidth: 100, visualHeight: 30 }).centerError === 0);
  t("mismatch-flag", Z.checkRegistryMismatch({ canvasDelta: 1, registryDelta: 0 }).code === "NATIVE_CREATE_REGISTRY_MISMATCH");
  t("consistency", Z.consistencyChecks({}).consistent === true);
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }
if (!COOKIE_RAW) console.warn("[native-create-measure] 未注入 ZY_STAGE9_COOKIE —— 回退持久 profile（可能过期）；cookiePresent=false");

const pageRun = (page, code) => page.evaluate("(function(){ " + PAGE_PRELUDE + "\n return (function(){ " + code + " })(); })()").catch((e) => ({ ok: false, reason: "evaluate:" + String(e && e.message || e).slice(0, 120) }));

// ---- 采集创建前后状态（对象 + registry + 文字锚点数）----
const collectStateCode = `
const r = resolveEntry();
if (!r.ok) return { ok: false, reason: r.reason };
const objs = r.canvas.getObjects() || [];
const registry = (r.entry && r.entry.canvasObjInfo && Array.isArray(r.entry.canvasObjInfo.canvasToProductObjArr)) ? r.entry.canvasObjInfo.canvasToProductObjArr : [];
const idOf = (o) => (o && (o.multiUuid || o.uuid || o.id)) || null;
const canonical = (o, i) => idOf(o) || ("t:" + (o.type || "?") + ":" + i);
const textDescs = [];
objs.forEach(function (o, i) { const t = o.type || ""; if (t === "textbox" || t === "i-text" || t === "text") textDescs.push({ key: canonical(o, i), uuid: o.uuid != null ? String(o.uuid) : null, multiUuid: o.multiUuid != null ? String(o.multiUuid) : null, layerNum: (typeof o.layerNum === "number") ? o.layerNum : null, text: (typeof o.text === "string") ? o.text : null }); });
const types = {};
objs.forEach(function (o) { const t = o.type || "?"; types[t] = (types[t] || 0) + 1; });
return { ok: true, objectCount: objs.length, objectTypes: types, objectIds: objs.map(canonical), textAnchorCount: textDescs.length, textDescs: textDescs, registryCount: registry.length, registryIds: registry.map(idOf) };
`;

// ---- 调用原生 drawText(text, fontSize, left, top, mediaJson, layerNum)；media 与 page-bridge.buildTextMediaEntry 形状一致 ----
const callDrawTextCode = `
const arg = window.__zyArg;
const r = resolveEntry();
if (!r.ok) return { ok: false, reason: r.reason };
if (!r.canvasDiy) return { ok: false, reason: "no-drawText-entry" };
const sundry = (window.requirejs && window.requirejs.s && window.requirejs.s.contexts && window.requirejs.s.contexts._ && window.requirejs.s.contexts._.defined.sundry) || null;
let guid = null;
try { if (sundry && typeof sundry.guid === "function") guid = sundry.guid(); } catch (e) {}
if (!guid && window.crypto && typeof window.crypto.randomUUID === "function") guid = window.crypto.randomUUID();
if (!guid) guid = "zy-probe-" + Date.now().toString(36);
let maxLayer = -1;
try { r.canvas.getObjects().forEach(function (o) { if (o && typeof o.layerNum === "number" && o.layerNum > maxLayer) maxLayer = o.layerNum; }); } catch (e) {}
const layerNum = maxLayer + 1;
const size = arg.fontSize, w = arg.w, h = arg.h, x = arg.left, y = arg.top, rot = arg.angle || 0;
const media = {
  media: { mediaType: "text", text: arg.text, font: { pointSize: size, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "1", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.2, lineIdType: 0, isBG: 0, imgPath: "" },
  location: { x: x, y: y, width: w, height: h, factWidth: w, factHeight: h, rotation: rot },
  printLocation: { x: x, y: y, width: w, height: h, rotation: rot },
  layer: { alpha: 1 }, layerNum: layerNum, isEdit: 1, isDisplay: 0, deleteState: 0, visitLevel: 1,
  multiUuid: guid, markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0, lowPixelFlag: 0, selectEnabled: 1, isDesign: 1, isComposite: 0, isPreview: 0, isDesignShape: 0
};
const beforeCount = r.canvas.getObjects().length;
let ret = { value: null, type: "undefined" };
try {
  const v = r.canvasDiy.drawText(arg.text, size, x, y, media, layerNum);
  if (v && typeof v === "object") ret = { value: String(v.multiUuid || v.uuid || v.id || "") || null, type: v.type || "object" };
} catch (e) { return { ok: false, reason: "drawText-threw:" + String(e && e.message || e).slice(0, 120) }; }
try { if (typeof r.canvas.setCoords === "function") r.canvas.setCoords(); } catch (e) {}
const afterCount = r.canvas.getObjects().length;
return { ok: true, drewDelta: afterCount - beforeCount, ret: ret, layerNum: layerNum, guid: guid };
`;

const mutateCode = `
const arg = window.__zyArg2;
const r = resolveEntry();
if (!r.ok) return { ok: false, reason: r.reason };
let o = null;
try { o = (r.canvas.getObjects() || []).find(function (x) { const id = (x && (x.multiUuid || x.uuid || x.id)) || null; return id === arg.identityId; }) || null; } catch (e) {}
if (!o) return { ok: false, reason: "identity-not-found" };
try {
  if (arg.kind === "setText" && arg.value != null && typeof o.setText === "function") o.setText(String(arg.value));
  else if (arg.kind === "setText" && arg.value != null) o.text = String(arg.value);
  else if (arg.kind === "fontSize") o.fontSize = arg.value;
  else if (arg.kind === "angle") o.angle = arg.value;
} catch (e) { return { ok: false, reason: "mutate-threw:" + String(e && e.message || e).slice(0, 120) }; }
try { if (typeof r.canvas.requestRenderAll === "function") r.canvas.requestRenderAll(); if (typeof r.canvas.setCoords === "function") r.canvas.setCoords(); } catch (e) {}
return measureByIdentity(arg.identityId);
`;

const cleanupCode = `
const arg = window.__zyArg3;
const r = resolveEntry();
if (!r.ok) return { ok: false, reason: r.reason };
const registry = (r.entry && r.entry.canvasObjInfo && Array.isArray(r.entry.canvasObjInfo.canvasToProductObjArr)) ? r.entry.canvasObjInfo.canvasToProductObjArr : null;
let o = null;
try { o = (r.canvas.getObjects() || []).find(function (x) { const id = (x && (x.multiUuid || x.uuid || x.id)) || null; return id === arg.identityId; }) || null; } catch (e) {}
const regBefore = registry ? registry.length : null;
let regRemoved = 0;
if (registry && o) { const li = registry.indexOf(o); if (li >= 0) { registry.splice(li, 1); regRemoved = 1; } }
let removed = false;
if (o) { try { r.canvas.remove(o); removed = true; } catch (e) { removed = false; } }
try { if (typeof r.canvas.requestRenderAll === "function") r.canvas.requestRenderAll(); if (typeof r.canvas.setCoords === "function") r.canvas.setCoords(); } catch (e) {}
return { ok: true, removed: removed, registryRemoved: regRemoved, registryBefore: regBefore, registryAfter: registry ? registry.length : null };
`;

// ---- drawText 签名探针（instance + prototype 一层递归；不记录完整源码）----
const probeSignatureCode = `
const r = resolveEntry();
if (!r.ok) return { ok: false, reason: r.reason };
const entry = r.canvasDiy || r.entry;
const sig = { found: !!entry };
if (!entry) return sig;
function scan(obj, levelName) {
  try {
    const names = Object.getOwnPropertyNames(obj);
    const hit = names.indexOf("drawText") >= 0 ? obj.drawText : null;
    return { level: levelName, ownNamesSample: names.slice(0, 50), hasOwnDrawText: names.indexOf("drawText") >= 0, drawTextType: typeof hit, drawTextLength: (hit && typeof hit === "function") ? hit.length : null, drawTextSrc: (hit && typeof hit === "function") ? String(hit).replace(/\\s+/g, " ").slice(0, 200) : null, ownerName: (obj.constructor && obj.constructor.name) || null };
  } catch (e) { return { level: levelName, error: String(e && e.message || e).slice(0, 80) }; }
}
const chain = [];
let cur = entry;
for (let d = 0; d < 5 && cur; d += 1) { chain.push({ obj: cur, level: d === 0 ? "instance" : "prototype-" + d }); cur = Object.getPrototypeOf(cur); if (cur === Object.prototype) { chain.push({ obj: null, level: "Object.prototype" }); cur = null; } }
sig.chainDepth = chain.length;
chain.forEach(function (c) { if (c.obj) sig["lv_" + c.level] = scan(c.obj, c.level); else sig["lv_" + c.level] = { level: c.level, hasOwnDrawText: false }; });
const ownerHit = chain.filter(function (c) { return !!(c.obj && c.obj.hasOwnProperty && c.obj.hasOwnProperty("drawText")); })[0] || null;
sig.drawTextOwner = ownerHit ? ownerHit.level : null;
const defs = (window.requirejs && window.requirejs.s && window.requirejs.s.contexts && window.requirejs.s.contexts._ && window.requirejs.s.contexts._.defined) || {};
sig.related = Object.keys(defs).filter(function (m) { return /Calc|Size|DeleteCommand|SimpleCommand|ProductJson|CanvasObjInfo/i.test(m); }).slice(0, 20);
return sig;
`;

// ---- 尺寸体系（只读调用 + round-trip；不修改 Canvas 尺寸）----
const probeDimensionCode = `
const arg = window.__zyArg4;
const r = resolveEntry();
if (!r.ok) return { ok: false, reason: r.reason };
const defs = (window.requirejs && window.requirejs.s && window.requirejs.s.contexts && window.requirejs.s.contexts._ && window.requirejs.s.contexts._.defined) || {};
const sundry = defs.sundry || window.sundry || null;
const out = { sundryFound: !!sundry, mmToPX: null, pxToMM: null, roundtrip: null };
try {
  if (sundry && typeof sundry.mmToPX === "function") out.mmToPX = { width: sundry.mmToPX(arg.widthMm, undefined), height: sundry.mmToPX(arg.heightMm, undefined) };
  if (sundry && typeof sundry.pxToMM === "function") out.pxToMM = { canvasW: sundry.pxToMM(arg.canvasWidth, undefined), canvasH: sundry.pxToMM(arg.canvasHeight, undefined) };
  if (out.mmToPX && out.mmToPX.width != null && sundry && typeof sundry.pxToMM === "function") out.roundtrip = { widthPx: out.mmToPX.width, heightPx: out.mmToPX.height, recoveredWidthMm: sundry.pxToMM(out.mmToPX.width, undefined), recoveredHeightMm: sundry.pxToMM(out.mmToPX.height, undefined) };
} catch (e) { out.error = String(e && e.message || e).slice(0, 120); }
const vo = r.CV || {};
out.businessFields = {};
["width", "height", "physicalWidth", "physicalHeight", "pageWidth", "pageHeight", "mmWidth", "mmHeight"].forEach(function (k) { if (vo[k] != null) out.businessFields[k] = vo[k]; });
return out;
`;
const probeDimensionSourcesCode = `
const defs = (window.requirejs && window.requirejs.s && window.requirejs.s.contexts && window.requirejs.s.contexts._ && window.requirejs.s.contexts._.defined) || {};
const targets = ["CanvasObjVO", "ProductVO", "MasterVO", "ProductDataModel", "DesignVO", "PageVO", "DesignPageVO", "CurrentCanvasInfo", "TemplateVO"];
const findings = [];
targets.forEach(function (modName) {
  const m = defs[modName];
  if (!m) return;
  try { Object.keys(m).forEach(function (k) { if (/width|height|size|mm|physical|dimension|rotation|canvasNum|multiCanvas/i.test(k) && typeof m[k] !== "function" && typeof m[k] !== "object") findings.push({ sourceModule: modName, field: k, rawType: typeof m[k], value: String(m[k]).slice(0, 40) }); }); } catch (e) {}
});
return findings.slice(0, 60);
`;

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const out = {
    ts: new Date().toISOString(), stage: "STAGE-9-V7-NATIVE-CREATE-MEASURE",
    userscriptVersion: USERSCRIPT_VERSION, url: URL, cookiePresent: !!COOKIE_RAW,
    note: "Native Create → Measure（只读探针 + 可恢复 sentinel 创建）；OCR pipeline 未改动；SAVE_UNPROBED",
    template: null, pages: [], nativeApi: null, dimensionContract: null, probes: [], mutationProbes: null, summary: null, errors: []
  };
  let browser = null;
  let okCases = 0;
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
    const waitEditorReady = async (tries) => {
      for (let i = 0; i < (tries || 18); i += 1) {
        const r = await page.evaluate(() => { const req = window.requirejs; const vo = (req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO; return { ok: !!(vo && Array.isArray(vo.totalCanvasArray)) }; }).catch(() => ({}));
        if (r && r.ok) return r;
        await SLEEP(1200);
      }
      return page.evaluate(() => ({ ok: false })).catch(() => ({}));
    };
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => out.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
    await SLEEP(4000);
    const ready = await waitEditorReady(18);
    if (!(ready && ready.ok)) out.errors.push("EDITOR_UNAVAILABLE");
    await SLEEP(2500);

    const pgInfo = await page.evaluate(() => {
      const req = window.requirejs; const ctx = req && req.s && req.s.contexts && req.s.contexts._; const defs = (ctx && ctx.defined) || {};
      const CV = defs.CanvasObjVO || window.CanvasObjVO || null;
      const total = CV ? CV.totalCanvasArray : [];
      const pages = (total || []).map((d, i) => { const c = d && d.canvas; const reg = (d && d.canvasObjInfo && Array.isArray(d.canvasObjInfo.canvasToProductObjArr)) ? d.canvasObjInfo.canvasToProductObjArr.length : null; return { pageIndex: i, idName: d && d.idName != null ? String(d.idName) : null, hasDrawText: !!(d && typeof d.drawText === "function"), canvasWidth: c ? c.width : null, canvasHeight: c ? c.height : null, objectCount: c ? c.getObjects().length : null, registryLen: reg }; });
      return { pageCount: (total || []).length, currentCanvasNum: CV ? CV.currentCanvasNum : null, canvasPagesNum: CV ? CV.canvasPagesNum : null, multiCanvas: !!CV.multiCanvas, frontImg: !!(CV && CV.frontImgPathStr), backImg: !!(CV && CV.backImgPathStr), pages: pages, currentCanvasFn: !!(defs.CurrentCanvas || window.CurrentCanvas) };
    }).catch((e) => ({ error: String(e && e.message || e).slice(0, 120) }));
    out.template = Object.assign({ url: URL, third: (/\/third\/(\d+)/.exec(URL) || [])[1] || null, product: (/\/third\/\d+\/(\d+)/.exec(URL) || [])[1] || null, detail: (/\/third\/\d+\/\d+\/(\d+)/.exec(URL) || [])[1] || null }, pgInfo.error ? { error: pgInfo.error } : pgInfo);
    out.pages = pgInfo.pages || [];

    out.nativeApi = await pageRun(page, probeSignatureCode);
    out.nativeApi = Object.assign(out.nativeApi || {}, { saveProbed: false, saveStatus: "SAVE_UNPROBED", note: "§十四 未触发真实保存；DeleteCommand/ProductJson 模块名仅登记" });

    const firstPage = (pgInfo.pages || [])[0] || {};
    const cw = firstPage.canvasWidth, ch = firstPage.canvasHeight;
    const dim = await page.evaluate("(function(){ " + PAGE_PRELUDE + "\n window.__zyArg4 = " + JSON.stringify({ widthMm: 92, heightMm: 56, canvasWidth: cw, canvasHeight: ch }) + ";\n return (function(){ " + probeDimensionCode + " })(); })()").catch(() => null);
    const dimSources = await pageRun(page, probeDimensionSourcesCode);
    let roundtrip = null;
    if (dim && dim.roundtrip) roundtrip = Z.dimensionRoundTrip({ widthMm: 92, heightMm: 56, widthPx: dim.roundtrip.widthPx, heightPx: dim.roundtrip.heightPx, recoveredWidthMm: dim.roundtrip.recoveredWidthMm, recoveredHeightMm: dim.roundtrip.recoveredHeightMm });
    out.dimensionContract = { canvasWidth: cw, canvasHeight: ch, orientation: (cw != null && ch != null) ? (cw >= ch ? "LANDSCAPE" : "PORTRAIT") : null, conversion: dim, roundtrip: roundtrip, sources: dimSources, note: "物理尺寸真值来源待 Commit 4；比例仅为 CORROBORATION" };

    const stateHash = (s) => (s && s.ok ? { objectCount: s.objectCount, registryCount: s.registryCount, textAnchorCount: s.textAnchorCount, objectTypes: s.objectTypes } : { error: s && s.reason });
    const runCreate = (arg2) => page.evaluate("(function(){ " + PAGE_PRELUDE + "\n window.__zyArg = " + JSON.stringify(arg2) + ";\n return (function(){ " + callDrawTextCode + " })(); })()").catch((e) => ({ ok: false, reason: "evaluate:" + String(e && e.message || e).slice(0, 100) }));
    const runMeasure = (identityId) => page.evaluate("(function(){ " + PAGE_PRELUDE + "\n return measureByIdentity(" + JSON.stringify(identityId) + "); })()").catch((e) => ({ ok: false, reason: "evaluate:" + String(e && e.message || e).slice(0, 100) }));
    const runMutate = (kind, value, identityId) => page.evaluate("(function(){ " + PAGE_PRELUDE + "\n window.__zyArg2 = " + JSON.stringify({ kind: kind, value: value, identityId: identityId }) + ";\n return (function(){ " + mutateCode + " })(); })()").catch((e) => ({ ok: false, reason: "evaluate:" + String(e && e.message || e).slice(0, 100) }));
    const runCleanup = (identityId) => page.evaluate("(function(){ " + PAGE_PRELUDE + "\n window.__zyArg3 = " + JSON.stringify({ identityId: identityId }) + ";\n return (function(){ " + cleanupCode + " })(); })()").catch((e) => ({ ok: false, reason: "evaluate:" + String(e && e.message || e).slice(0, 100) }));

    for (const c of CASES) {
      const rec = { case: c.id, requestedGeometry: { text: c.text, fontSize: c.fontSize, left: c.left, top: c.top, width: c.w, height: c.h, angle: c.angle }, errors: [] };
      out.probes.push(rec);
      try {
        const s1 = await pageRun(page, collectStateCode);
        rec.before = stateHash(s1);
        const cr = await runCreate({ text: c.text, fontSize: c.fontSize, left: c.left, top: c.top, w: c.w, h: c.h, angle: c.angle });
        rec.create = { ok: !!cr.ok, drewDelta: cr.drewDelta, retIdentity: cr.ret && cr.ret.value, reason: cr.reason || null };
        await SLEEP(300);
        const s2 = await pageRun(page, collectStateCode);
        const ident = Z.identifyNewlyCreated({ before: s1.textDescs || [], after: s2.textDescs || [], beforeRegistry: s1.registryIds || [], afterRegistry: s2.registryIds || [], nativeReturnId: (cr.ret && cr.ret.value) || null, sentinelText: c.text });
        rec.recoverySource = ident.recoverySource || "NONE";
        rec.registryDelta = Z.objectDelta(s1.registryIds || [], s2.registryIds || []);
        rec.objectDelta = Z.objectDelta(s1.objectIds || [], s2.objectIds || []);
        rec.canvasRegistration = Z.checkRegistryMismatch({ canvasDelta: rec.objectDelta.delta, registryDelta: rec.registryDelta.delta });
        const identityId = (ident.index != null && s2.textDescs[ident.index] != null) ? (s2.textDescs[ident.index].multiUuid || s2.textDescs[ident.index].uuid || s2.textDescs[ident.index].key) : (cr.ret && cr.ret.value) || null;
        rec.identityResolved = !!identityId;
        if (!identityId) rec.errors.push("IDENTITY_UNRESOLVED");
        const meas = identityId ? await runMeasure(identityId) : null;
        rec.identityMeasured = meas && meas.ok ? meas.identity : null;
        rec.actualGeometry = meas && meas.ok ? { left: meas.fabric.left, top: meas.fabric.top, width: meas.fabric.width, height: meas.fabric.height, scaleX: meas.fabric.scaleX, scaleY: meas.fabric.scaleY, angle: meas.fabric.angle, fontSize: meas.style.fontSize, aCoords: meas.aCoords } : null;
        rec.fabricPosition = meas && meas.ok ? meas.fabric : null;
        rec.locationPosition = meas && meas.ok ? meas.location : null;
        rec.style = meas && meas.ok ? meas.style : null;
        if (meas && meas.ok && rec.actualGeometry) {
          rec.geometry = Z.geometryDiff(rec.requestedGeometry, Object.assign({}, rec.actualGeometry, { center: meas.aCoords ? meas.aCoords.center : null, visualWidth: meas.aCoords ? meas.aCoords.visualWidth : null, visualHeight: meas.aCoords ? meas.aCoords.visualHeight : null }));
          rec.consistency = Z.consistencyChecks({ fabric: meas.fabric, aCoords: meas.aCoords, location: meas.location });
        }
        if (c.id === "C" && identityId && meas && meas.ok && (meas.fabric.angle == null || meas.fabric.angle === 0)) {
          rec.angleApplied = "native-unset";
          const m2 = await runMutate("angle", 90, identityId);
          if (m2 && m2.ok) rec.rotation90FabricSet = { angle: m2.fabric.angle, originX: m2.fabric.originX, originY: m2.fabric.originY, center: m2.aCoords ? m2.aCoords.center : null, visualWidth: m2.aCoords ? m2.aCoords.visualWidth : null, visualHeight: m2.aCoords ? m2.aCoords.visualHeight : null };
        } else if (c.id === "C") { rec.angleApplied = "native-applied"; }
        const cl = identityId ? await runCleanup(identityId) : { ok: false, reason: "no-identity" };
        rec.cleanup = { method: "canvas.remove + registry splice (native objects)", removed: !!cl.removed, registryHandled: !!cl.registryRemoved, registryBefore: cl.registryBefore, registryAfter: cl.registryAfter, reason: cl.reason || null };
        const s4 = await pageRun(page, collectStateCode);
        rec.afterCleanup = stateHash(s4);
        rec.cleanupVerify = Z.verifyCleanup({ objectCount: s1.objectCount, registryCount: s1.registryCount, textAnchorCount: s1.textAnchorCount }, { objectCount: s4.objectCount, registryCount: s4.registryCount, textAnchorCount: s4.textAnchorCount });
      } catch (e) { rec.errors.push("CASE: " + String(e && e.message || e).slice(0, 200)); }
    }

    const mutationProbe = async (rec) => {
      const s1 = await pageRun(page, collectStateCode);
      const cr = await runCreate({ text: "ZY_NATIVE_PROBE_" + rec.which, fontSize: 24, left: 50, top: 50, w: 180, h: 34, angle: 0 });
      if (!cr.ok) { rec.error = cr.reason; return; }
      await SLEEP(300);
      const s2 = await pageRun(page, collectStateCode);
      const ident = Z.identifyNewlyCreated({ before: s1.textDescs || [], after: s2.textDescs || [], beforeRegistry: s1.registryIds || [], afterRegistry: s2.registryIds || [], nativeReturnId: (cr.ret && cr.ret.value) || null, sentinelText: "ZY_NATIVE_PROBE_" + rec.which });
      const identityId = (ident.index != null && s2.textDescs[ident.index] != null) ? (s2.textDescs[ident.index].multiUuid || s2.textDescs[ident.index].uuid || s2.textDescs[ident.index].key) : (cr.ret && cr.ret.value) || null;
      if (!identityId) { rec.error = "IDENTITY_UNRESOLVED"; return; }
      const steps = [];
      const addStep = (m) => { if (m && m.ok) steps.push({ left: m.fabric.left, top: m.fabric.top, width: m.fabric.width, height: m.fabric.height, fontSize: m.style.fontSize, angle: m.fabric.angle, scaleX: m.fabric.scaleX, scaleY: m.fabric.scaleY, center: m.aCoords ? m.aCoords.center : null, visualWidth: m.aCoords ? m.aCoords.visualWidth : null, visualHeight: m.aCoords ? m.aCoords.visualHeight : null }); };
      if (rec.which === "M") {
        addStep(await runMeasure(identityId));
        addStep(await runMutate("setText", "AAAA", identityId));
        addStep(await runMutate("setText", "BBBBBBBB", identityId));
        rec.rows = steps; rec.classified = Z.classifyMutation(steps, "setText");
      } else if (rec.which === "F") {
        addStep(await runMutate("fontSize", 24, identityId));
        addStep(await runMutate("fontSize", 36, identityId));
        rec.rows = steps; rec.classified = Z.classifyMutation(steps, "fontSize");
      } else if (rec.which === "R") {
        const a0 = await runMeasure(identityId);
        const a45 = await runMutate("angle", 45, identityId);
        const a90 = await runMutate("angle", 90, identityId);
        rec.rows = [a0 && a0.ok && { originX: a0.fabric.originX, originY: a0.fabric.originY, angle: a0.fabric.angle, left: a0.fabric.left, top: a0.fabric.top, center: a0.aCoords ? a0.aCoords.center : null, visualWidth: a0.aCoords ? a0.aCoords.visualWidth : null, visualHeight: a0.aCoords ? a0.aCoords.visualHeight : null }, a45 && a45.ok && { originX: a45.fabric.originX, originY: a45.fabric.originY, angle: a45.fabric.angle, left: a45.fabric.left, top: a45.fabric.top, center: a45.aCoords ? a45.aCoords.center : null, visualWidth: a45.aCoords ? a45.aCoords.visualWidth : null, visualHeight: a45.aCoords ? a45.aCoords.visualHeight : null }, a90 && a90.ok && { originX: a90.fabric.originX, originY: a90.fabric.originY, angle: a90.fabric.angle, left: a90.fabric.left, top: a90.fabric.top, center: a90.aCoords ? a90.aCoords.center : null, visualWidth: a90.aCoords ? a90.aCoords.visualWidth : null, visualHeight: a90.aCoords ? a90.aCoords.visualHeight : null }].filter(Boolean);
      }
      const cl = await runCleanup(identityId);
      rec.cleanup = { removed: !!cl.removed, reason: cl.reason || null };
    };
    const mut = { setText: { which: "M" }, fontSize: { which: "F" }, rotation: { which: "R" } };
    for (const k of ["setText", "fontSize", "rotation"]) { try { await mutationProbe(mut[k]); } catch (e) { mut[k].error = String(e && e.message || e).slice(0, 160); } }
    out.mutationProbes = mut;

    okCases = out.probes.length;
    const createPass = out.probes.filter((p) => p.create && p.create.ok).length;
    const recoveryPass = out.probes.filter((p) => p.recoverySource && p.recoverySource !== "NONE").length;
    const geometryPass = out.probes.filter((p) => p.geometry && p.actualGeometry).length;
    const identityPass = out.probes.filter((p) => p.identityMeasured && (p.identityMeasured.uuid || p.identityMeasured.multiUuid)).length;
    const canvasRegPass = out.probes.filter((p) => p.canvasRegistration && p.canvasRegistration.code === "OK").length;
    const businessReg = out.probes.filter((p) => p.registryDelta && p.registryDelta.delta > 0 && p.canvasRegistration && p.canvasRegistration.code === "OK").length;
    const cleanupPass = out.probes.filter((p) => p.cleanupVerify && p.cleanupVerify.restored).length;
    out.bridgingEvidence = {
      capabilityMethod: { module: "CanvasDiy", method: "drawText" },
      create: createPass === okCases ? "PASS" : (createPass > 0 ? "PARTIAL" : "FAIL"),
      objectRecovery: recoveryPass === okCases ? "PASS" : (recoveryPass > 0 ? "PARTIAL" : "FAIL"),
      canvasRegistration: canvasRegPass === okCases ? "PASS" : (canvasRegPass > 0 ? "PARTIAL" : "FAIL"),
      businessRegistration: businessReg === okCases ? "PASS" : (businessReg > 0 ? "PARTIAL" : "FAIL"),
      geometry: geometryPass === okCases ? "PASS" : (geometryPass > 0 ? "PARTIAL" : "FAIL"),
      identity: identityPass === okCases ? "PASS" : (identityPass > 0 ? "PARTIAL" : "FAIL"),
      cleanup: cleanupPass === okCases ? "PASS" : (cleanupPass > 0 ? "PARTIAL" : "FAIL"),
      verdict: (createPass === okCases && recoveryPass === okCases && geometryPass === okCases && identityPass === okCases) ? "NATIVE_CREATE_MEASURE_READY" : "NATIVE_CREATE_MEASURE_INCOMPLETE",
      counts: { cases: okCases, create: createPass, recovery: recoveryPass, canvasRegistration: canvasRegPass, businessRegistration: businessReg, geometry: geometryPass, identity: identityPass, cleanup: cleanupPass }
    };
    out.summary = {
      recoverySources: out.probes.map((p) => p.case + ":" + p.recoverySource),
      registryMismatches: out.probes.filter((p) => p.canvasRegistration && p.canvasRegistration.code === "NATIVE_CREATE_REGISTRY_MISMATCH").map((p) => p.case),
      geometryInconsistencies: out.probes.filter((p) => p.consistency && !p.consistency.consistent).map((p) => p.case + ":" + (p.consistency.issues || []).map((i) => i.pair).join("+")),
      mutationVerdicts: { setText: mut.setText.classified || mut.setText.error || null, fontSize: mut.fontSize.classified || mut.fontSize.error || null }
    };
  } catch (e) { out.errors.push("MAIN: " + String(e && e.stack || (e && e.message || e)).slice(0, 300)); }
  if (browser) await browser.close().catch(() => {});
  fs.writeFileSync(path.join(REPORT_DIR, "native-create-measure.json"), JSON.stringify(out, null, 2));
  console.log("[native-create-measure] report=" + path.join(REPORT_DIR, "native-create-measure.json"));
  if (out.bridgingEvidence) console.log("[native-create-measure] verdict=" + out.bridgingEvidence.verdict + " create=" + out.bridgingEvidence.counts.create + "/" + okCases + " recovery=" + out.bridgingEvidence.counts.recovery + "/" + okCases + " geom=" + out.bridgingEvidence.counts.geometry + "/" + okCases + " identity=" + out.bridgingEvidence.counts.identity + "/" + okCases + " cleanup=" + out.bridgingEvidence.counts.cleanup + "/" + okCases);
  out.probes.forEach((p) => console.log("[native-create-measure] " + p.case + " create=" + (p.create && p.create.ok) + " recovery=" + p.recoverySource + " reg=" + (p.canvasRegistration || {}).code + " placementErr=" + (p.geometry ? Math.round(p.geometry.placementError * 100) / 100 : null) + " cleanupRestored=" + (p.cleanupVerify ? p.cleanupVerify.restored : null) + (p.errors && p.errors.length ? " errs=" + p.errors.join("|") : "")));
  const errs = out.errors;
  errs.forEach((e) => console.log("[native-create-measure] ERR " + e));
  process.exit(errs.length ? 1 : 0);
})();