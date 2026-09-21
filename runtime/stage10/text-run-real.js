// runtime/stage10/text-run-real.js — Stage 10-B Phase 10-B.4/5：conservative production gate + Native Create/Measure
// ---------------------------------------------------------------------
// 目标（规格 §十五/§二十一/§三十八/§四十二）：验证生产链：
//   合成名片（大字+小字）→ 真实浏览器渲染 → IMAGE_PIXEL 逐行 ink → planRuns
//   → HIGH_CONFIDENCE SPLIT → run items（各独立 text/fontSize/fill/geometry）
//   → bridge ocrCreate 真实 Native Create → 读回实际对象 → run 独立验证 + Text Conservation + 幂等。
// Case（§四十）：T-R1 单行同字号（NO split）/ T-R2 两行同字号（NO split）/
//   T-R3 大字+小字（SPLIT 2）/ T-R4 大-小-大（SPLIT 3）/
//   T-R6 姓名大+职位小（SPLIT 2）/ T-R7 电话大+邮箱小（SPLIT 2）。
// 凭据：ZY_STAGE9_COOKIE 仅运行时（缺失回退持久 profile）。报告：runtime/reports/stage-10/text-run-real.json
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
const REPORT_FILE = path.join(REPORT_DIR, "text-run-real.json");
const adapter = require("../scriptcat-adapter");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const DEFAULT_URL = "https://diy.zheliyin.com/diyWeb/third/1234075/2114747/999/thirdDiyAdd.do";
const URL = process.env.ZY_URL || DEFAULT_URL;
const COOKIE_RAW = process.env.ZY_STAGE9_COOKIE || "";
const SEG10 = require(path.join(ROOT, "extension", "src", "editor", "text-run-segmentation.js"));
const MODEL10 = require(path.join(ROOT, "extension", "src", "editor", "text-run-model.js"));
const NC10 = require(path.join(ROOT, "extension", "src", "editor", "native-color.js"));
const { textConservation } = MODEL10;
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
  t("version-51", USERSCRIPT_VERSION === "0.3.11.51");
  const p = SEG10.planRuns({ nativeText: "大标题\n小字", spans: [{ start: 0, end: 3, spanInkHeight: 50 }, { start: 4, end: 6, spanInkHeight: 20 }] });
  t("plan-split-2", p.result === "FULL_RUN_SPLIT" && p.runs.length === 2, JSON.stringify(p));
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }
if (!COOKIE_RAW) console.warn("[text-run-real] 未注入 ZY_STAGE9_COOKIE —— 回退持久 profile（可能过期）");

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

const MEGA_MODULES = [
  fs.readFileSync(path.join(ROOT, "extension", "src", "editor", "image-space.js"), "utf8"),
  fs.readFileSync(path.join(ROOT, "extension", "src", "editor", "image-containment.js"), "utf8"),
  fs.readFileSync(path.join(ROOT, "extension", "src", "editor", "multiline-typography.js"), "utf8"),
  fs.readFileSync(path.join(ROOT, "extension", "src", "editor", "ink-measure.js"), "utf8"),
  fs.readFileSync(path.join(ROOT, "extension", "src", "editor", "text-run-model.js"), "utf8"),
  fs.readFileSync(path.join(ROOT, "extension", "src", "editor", "text-run-segmentation.js"), "utf8")
].join("\n;\n");
const RESOLVE_ENTRY = `
function resolveEntry10R() {
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
function zyRInkRegion(gray, w, h, bb) {
  try {
    const x0 = Math.max(0, Math.floor(bb.x)), y0 = Math.max(0, Math.floor(bb.y));
    const x1 = Math.min(w - 1, Math.ceil(bb.x + bb.width)), y1 = Math.min(h - 1, Math.ceil(bb.y + bb.height));
    if (x1 <= x0 || y1 <= y0) return { ok: false, reason: "empty-region" };
    const hist = new Array(256).fill(0);
    let total = 0, sum = 0;
    for (let y = y0; y < y1; y += 1) { for (let x = x0; x < x1; x += 1) { const g = gray[y * w + x]; hist[g] += 1; total += 1; sum += g; } }
    if (total < 16) return { ok: false, reason: "no-ink" };
    const mean = sum / total;
    let sumB = 0, wB = 0, maxVar = -1, threshold = mean;
    for (let t = 0; t < 256; t += 1) { wB += hist[t]; if (wB === 0) continue; const wF = total - wB; if (wF === 0) break; sumB += t * hist[t]; const mB = sumB / wB; const mF = (sum - sumB) / wF; const inter = wB * wF * (mB - mF) * (mB - mF); if (inter > maxVar) { maxVar = inter; threshold = t; } }
    let cntDark = 0, cntLight = 0;
    for (let y = y0; y < y1; y += 1) { for (let x = x0; x < x1; x += 1) { const g = gray[y * w + x]; if (g <= threshold) cntDark += 1; else cntLight += 1; } }
    const fgIsDark = cntDark <= cntLight;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, cnt = 0;
    for (let y = y0; y < y1; y += 1) { for (let x = x0; x < x1; x += 1) { const g = gray[y * w + x]; const isFg = fgIsDark ? (g <= threshold) : (g > threshold); if (!isFg) continue; cnt += 1; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; } }
    if (cnt < 8) return { ok: false, reason: "no-foreground" };
    return { ok: true, inkWidth: maxX - minX + 1, inkHeight: maxY - minY + 1, inkBox: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }, confidence: Math.min(1, cnt / total * 2), method: "local-otsu" };
  } catch (e) { return { ok: false, reason: String(e && e.message || e).slice(0, 80) }; }
}
function zyRGrayOf(data, w, h) { const out = new Uint8ClampedArray(w * h); for (let i = 0; i < w * h; i += 1) { const o = i * 4; out[i] = Math.round(0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]); } return out; }
function zyRLoadImageData(im) { try { const cv = document.createElement("canvas"); cv.width = im.naturalWidth; cv.height = im.naturalHeight; const g = cv.getContext("2d", { willReadFrequently: true }); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, cv.width, cv.height); return { ok: true, data: d.data, width: cv.width, height: cv.height }; } catch (e) { return { ok: false, reason: String(e && e.message || e).slice(0, 80) }; } }
`;

const PAGE_CASE = `
const args = __zy10rargs;
const out = { case: args.id, steps: [], errors: [] };
try {
  const N = 900, M = 560;
  const cvCard = document.createElement("canvas"); cvCard.width = N; cvCard.height = M;
  const gc = cvCard.getContext("2d");
  gc.fillStyle = "rgb(252,252,252)"; gc.fillRect(0, 0, N, M);
  const linesMeta = args.linesMeta || [];
  linesMeta.forEach(function (lm) { gc.fillStyle = "rgb(20,20,20)"; gc.font = "bold " + lm.fontSizePx + "px SimSun, serif"; gc.fillText(lm.text, 90, lm.yCenter); });
  const dataUrl = cvCard.toDataURL("image/png");
  const r = resolveEntry10R();
  const c = r.canvas;
  if (!c) { out.errors.push("no-canvas"); return { ok: false, out: out }; }
  const f = (c.constructor && c.constructor.fabric) || window.fabric;
  const im = new Image();
  await new Promise(function (res, rej) { im.onload = () => res(); im.onerror = () => rej(new Error("img-fail")); im.src = dataUrl; });
  await new Promise(function (res) { const bg = new f.Image(im); bg.set({ left: 30, top: 20 }); c.setBackgroundImage(bg, function () { try { if (c.requestRenderAll) c.requestRenderAll(); } catch (e) {} res(); }); });
  await new Promise(function (r2) { setTimeout(r2, 500); });
  const nat = zyRLoadImageData(im);
  if (!nat.ok) { out.errors.push(nat.reason); return { ok: false, out: out }; }
  const gray = zyRGrayOf(nat.data, nat.width, nat.height);
  const perLine = [];
  linesMeta.forEach(function (lm, li) {
    const bb = { x: 80, y: lm.bandY, width: 520, height: lm.bandH };
    const ink = zyRInkRegion(gray, nat.width, nat.height, bb);
    perLine.push({ line: li, text: lm.text, fontSizePx: lm.fontSizePx, bbox: bb, inkHeight: ink.ok ? ink.inkHeight : null, inkWidth: ink.ok ? ink.inkWidth : null, inkBox: ink.ok ? ink.inkBox : null });
  });
  out.perLine = perLine;
  out.naturalSize = { w: nat.width, h: nat.height };
  return { ok: true, out: out };
} catch (eM) { out.errors.push("main:" + String(eM && eM.stack || (eM && eM.message || eM)).slice(0, 220)); return { ok: false, out: out }; }
`;
const PAGE_CLEAN_BG = `const r = resolveEntry10R(); const c = r.canvas;
const out = { cleared: false };
if (c) { try { c.setBackgroundImage(null, function () { try { if (c.requestRenderAll) c.requestRenderAll(); } catch (e) {} out.cleared = true; }); } catch (e) { out.err = String(e && e.message || e).slice(0, 100); } }
return { ok: true, out: out };`;

[RESOLVE_ENTRY, PAGE_CLEAN_BG].forEach(function (src, i) {
  try { new Function(src); } catch (e) { console.error("[compile-check] chunk " + i + " SyntaxError: " + String(e && e.message || e)); process.exit(2); }
});
try { new Function("async function __p(__zy10rargs){" + PAGE_CASE + "\n}"); } catch (e) { console.error("[compile-check] PAGE_CASE async wrapper SyntaxError: " + String(e && e.message || e)); process.exit(2); }

const CASES = [
  { id: "T-R1", label: "single-line-same-style", linesMeta: [{ text: "单行同字号示例文本", fontSizePx: 36, yCenter: 200, bandY: 150, bandH: 70 }], expected: { verdict: "SINGLE", runCount: 1 } },
  { id: "T-R2", label: "two-line-same-style", linesMeta: [
    { text: "两行同字号内容", fontSizePx: 36, yCenter: 200, bandY: 150, bandH: 70 },
    { text: "第二行同样大小", fontSizePx: 36, yCenter: 280, bandY: 230, bandH: 70 }
  ], expected: { verdict: "SINGLE", runCount: 1 } },
  { id: "T-R3", label: "big-plus-small", linesMeta: [
    { text: "大标题文字", fontSizePx: 52, yCenter: 200, bandY: 140, bandH: 90 },
    { text: "小字备注说明", fontSizePx: 22, yCenter: 290, bandY: 240, bandH: 60 }
  ], expected: { verdict: "SPLIT", runCount: 2 } },
  { id: "T-R4", label: "big-small-big", linesMeta: [
    { text: "大字第一行", fontSizePx: 52, yCenter: 200, bandY: 140, bandH: 90 },
    { text: "小字中间行", fontSizePx: 22, yCenter: 290, bandY: 240, bandH: 60 },
    { text: "大字第三行", fontSizePx: 52, yCenter: 380, bandY: 320, bandH: 90 }
  ], expected: { verdict: "SPLIT", runCount: 3 } },
  { id: "T-R6", label: "name-title", linesMeta: [
    { text: "张三丰", fontSizePx: 56, yCenter: 200, bandY: 140, bandH: 95 },
    { text: "设计总监", fontSizePx: 24, yCenter: 300, bandY: 250, bandH: 60 }
  ], expected: { verdict: "SPLIT", runCount: 2 } },
  { id: "T-R7", label: "phone-email", linesMeta: [
    { text: "13800138000", fontSizePx: 40, yCenter: 200, bandY: 145, bandH: 75 },
    { text: "contact@example.com", fontSizePx: 20, yCenter: 290, bandY: 240, bandH: 55 }
  ], expected: { verdict: "SPLIT", runCount: 2 } }
];

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const out = { ts: new Date().toISOString(), stage: "STAGE-10B45-TEXT-RUN-REAL", version: USERSCRIPT_VERSION, url: URL.split("?")[0], cookiePresent: !!COOKIE_RAW, cases: [], errors: [] };
  let browser = null;
  let page = null;
  try {
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1280, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    page = browser.pages()[0];
    const onPageErr = (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 140)); };
    page.on("pageerror", onPageErr);
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
    const bridgeCall = (type, payload, replyType, timeoutMs) => page.evaluate((arg) => new Promise((resolve) => {
      let done = false;
      const on = (ev) => { const d = ev.data; if (d && d.source === "zy-card-assistant-page" && d.type === arg.replyType) { window.removeEventListener("message", on); done = true; resolve(d); } };
      window.addEventListener("message", on);
      setTimeout(() => { if (!done) { window.removeEventListener("message", on); resolve({ skip: true, timeout: arg.timeoutMs }); } }, arg.timeoutMs);
      window.postMessage(Object.assign({ source: "zy-card-assistant", type: arg.type }, arg.payload || {}), location.origin);
    }), { type, payload, replyType, timeoutMs: timeoutMs || 12000 });
    const waitEditorReady = async (tries) => {
      for (let i = 0; i < (tries || 18); i += 1) {
        const r = await page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed) })).catch(() => ({}));
        if (r && r.ok && r.bridge) return r;
        await SLEEP(1200);
      }
      return page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed) })).catch(() => ({}));
    };
    const collectTexts = () => page.evaluate(() => {
      const req = window.requirejs; const ctx = req && req.s && req.s.contexts && req.s.contexts._; const defs = (ctx && ctx.defined) || {};
      const CV = defs.CanvasObjVO || window.CanvasObjVO || null;
      const c = CV && CV.totalCanvasArray && CV.totalCanvasArray[0] && CV.totalCanvasArray[0].canvas;
      if (!c) return { ok: false, texts: [] };
      const texts = [];
      (c.getObjects() || []).forEach((o, i) => {
        if (!o) return;
        const ty = String(o.type || "");
        if (ty !== "textbox" && ty !== "i-text" && ty !== "text") return;
        texts.push({ index: i, text: String(o.text || ""), zyOcrKey: o.zyOcrKey || null, uuid: o.uuid || o.multiUuid || null, fill: typeof o.fill !== "undefined" ? String(o.fill) : null, fontSize: o.fontSize, left: Math.round(o.left * 100) / 100, top: Math.round(o.top * 100) / 100 });
      });
      return { ok: true, textboxCount: texts.length, texts: texts };
    }).catch(() => ({ ok: false, texts: [] }));
    const cleanupBg = () => page.evaluate(() => {
      try {
        const req = window.requirejs; const ctx = req && req.s && req.s.contexts && req.s.contexts._; const defs = (ctx && ctx.defined) || {};
        const CV = defs.CanvasObjVO || window.CanvasObjVO || null;
        const d = CV && CV.totalCanvasArray && CV.totalCanvasArray[0];
        const c = d && d.canvas;
        if (!c) return { removed: 0 };
        let removed = 0;
        (c.getObjects() || []).forEach(function (o) { try { if (o && String(o.text || "").indexOf("ZY_TR_") === 0) { const li = d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr ? d.canvasObjInfo.canvasToProductObjArr.indexOf(o) : -1; if (li >= 0) d.canvasObjInfo.canvasToProductObjArr.splice(li, 1); c.remove(o); removed += 1; } } catch (e) {} });
        try { if (typeof c.requestRenderAll === "function") c.requestRenderAll(); } catch (e) {}
        return { removed: removed };
      } catch (e) { return { removed: 0 }; }
    }).catch(() => ({ removed: 0 }));
    const conditions = { baidu: "standard", ink: "1" };
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => out.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
    await SLEEP(4000);
    await injectPageWorld(pageWorldPayloadFor(conditions));
    await SLEEP(1200);
    const ready = await waitEditorReady(18);
    if (!(ready && ready.ok)) out.errors.push("EDITOR_UNAVAILABLE");
    await SLEEP(2500);
    await injectPageWorld(MEGA_MODULES + "\n;\n" + RESOLVE_ENTRY + "\n;window.__zy10rrun = async function(__zy10rargs){" + PAGE_CASE + "\n}; window.__zy10rclean = function(){" + PAGE_CLEAN_BG + "\n};");
    await SLEEP(800);
    const pageIdRes = await bridgeCall("getCurrentPage", {}, "getCurrentPageResult", 6000).catch(() => null);
    const pageId = (pageIdRes && pageIdRes.pageId) || "canvas:c0";
    for (const cs of CASES) {
      const rec = { case: cs.id, label: cs.label, expected: cs.expected, steps: [] };
      const rPage = await page.evaluate((arg) => { const fn = window.__zy10rrun; if (!fn) return { ok: false, reason: "missing-fn" }; return fn(arg); }, { id: cs.id, linesMeta: cs.linesMeta }).catch((e) => ({ ok: false, reason: String(e && e.message || e).slice(0, 160) }));
      if (rPage && rPage.ok && rPage.out) rec.page = rPage.out; else rec.page = { failed: rPage };
      await SLEEP(400);
      // node 侧 segmentation（同一生产逻辑）
      if (rPage && rPage.ok && rPage.out && Array.isArray(rPage.out.perLine)) {
        const pl = rPage.out.perLine;
        const nativeText = pl.map((p) => p.text).join("\n");
        const spans = [];
        let offset = 0;
        pl.forEach(function (p) {
          const txt = String(p.text || "");
          const inkH = (p.inkHeight != null && p.inkHeight > 0) ? p.inkHeight : null;
          if (inkH) spans.push({ start: offset, end: offset + txt.length, spanInkHeight: inkH, spanInkWidth: p.inkWidth || 0, x: 0, y: 0 });
          offset += txt.length + 1;
        });
        const plan = SEG10.planRuns({ nativeText: nativeText, spans: spans });
        rec.plan = { result: plan.result, runs: plan.runs.map(function (rr) { return { text: rr.text, charStart: rr.charStart, charEnd: rr.charEnd, medianSpanInkHeight: rr.medianSpanInkHeight }; }), score: plan.score };
        rec.verdict = plan.result === "FULL_RUN_SPLIT" ? "SPLIT" : "SINGLE";
        rec.runCount = plan.result === "FULL_RUN_SPLIT" ? plan.runs.length : 1; // SINGLE fallback = 1 textbox
        rec.textConservation = textConservation(plan.runs.map(function (rr) { return { text: rr.text, charStart: rr.charStart, charEnd: rr.charEnd }; }), nativeText);
        // 生产创建：构造 run items（或 single fallback item）→ bridge ocrCreate
        const txId = "tr-" + Date.now().toString(36) + "-" + cs.id.replace("-", "").toLowerCase();
        const items = [];
        if (plan.result === "FULL_RUN_SPLIT" && plan.runs.length >= 2) {
          plan.runs.forEach(function (rr, ri) {
            const lineIdxs = [];
            let o2 = 0;
            pl.forEach(function (p, li) { const s = o2, e = o2 + String(p.text).length; if (e > o2 && rr.charStart < e && rr.charEnd > s) lineIdxs.push(li); o2 = e + 1; });
            const fsRun = rr.medianSpanInkHeight ? Math.min(160, Math.max(8, Math.round(rr.medianSpanInkHeight * 0.8 / 0.969))) : 24;
            items.push({ blockIndex: 0, zyRunIndex: ri, text: rr.text, left: 60, top: 60 + ri * 80, width: 240, height: Math.max(40, fsRun * 1.3 + 8), fontSize: fsRun, fill: "#000000" });
          });
          rec.createdItems = items.map(function (it) { return { zyRunIndex: it.zyRunIndex, text: it.text, fontSize: it.fontSize }; });
        } else {
          items.push({ blockIndex: 0, zyRunIndex: 0, text: nativeText.replace(/\n/g, String.fromCharCode(10)), left: 60, top: 60, width: 300, height: 80, fontSize: 28, fill: "#000000" });
          rec.createdItems = items.map(function (it) { return { text: it.text, fontSize: it.fontSize }; });
        }
        await cleanupBg();
        const cr = await bridgeCall("ocrCreate", { pageId: pageId, side: "FRONT", transactionId: txId, imageFingerprint: "tr-" + cs.id, items: items }, "ocrCreateResult", 15000).catch(() => null);
        await SLEEP(900);
        const tb = await collectTexts();
        const created = (tb.texts || []).filter(function (x) { return String(x.zyOcrKey || "").indexOf(txId) >= 0 || String(x.text || "").indexOf(cs.id.includes("TR") ? "TR" : "x") === 0; });
        const createdRuns = (tb.texts || []).filter(function (x) { return String(x.zyOcrKey || "").indexOf(txId + "-0") >= 0 || String(x.zyOcrKey || "").indexOf(txId) >= 0; });
        rec.ocrCreate = { ok: !!(cr && cr.ok), code: cr && cr.code, message: cr && cr.message, detectedBlocks: cr && cr.detectedBlocks, createdCount: cr && cr.createdCount, created: (cr && cr.created || []).map(function (cc2) { return { text: cc2.text, reused: cc2.reused }; }) };
        rec.actualObjects = createdRuns.map(function (x) { return { text: x.text, fontSize: x.fontSize, fill: x.fill, key: x.zyOcrKey }; });
        rec.createPass = rec.ocrCreate.ok && (!(cs.expected.verdict === "SPLIT") || createdRuns.length >= 2);
        rec.expectedMatch = rec.verdict === cs.expected.verdict && rec.runCount === cs.expected.runCount;
        // 幂等：第二遍同 items 再创建（同 txId？不，第二遍新 txId 但同 blockIndex/runIndex —— 验证不重复创建由对象 key 语义）
        const txId2 = "tr2-" + Date.now().toString(36);
        const cr2 = await bridgeCall("ocrCreate", { pageId: pageId, side: "FRONT", transactionId: txId2, imageFingerprint: "tr2-" + cs.id, items: items.map(function (it) { return Object.assign({}, it, { blockIndex: 0 }); }) }, "ocrCreateResult", 15000).catch(() => null);
        await SLEEP(700);
        rec.idempotence = { secondOk: !!(cr2 && cr2.ok), note: "second tx same block/runIndex — anchor reuse 决策由原生 anchor 多因子决定" };
        await cleanupBg();
        await SLEEP(700);
        rec.passed = rec.expectedMatch && rec.createPass;
        out.cases.push(rec);
      } else {
        rec.verdict = "UNKNOWN"; rec.runCount = 0; rec.createPass = false; rec.expectedMatch = false; rec.passed = false;
        out.cases.push(rec);
      }
    }
    const passCount = out.cases.filter((c) => c.passed === true).length;
    out.summary = { total: out.cases.length, passed: passCount, fail: out.cases.length - passCount };
  } catch (e) { out.errors.push("MAIN: " + String(e && e.stack || (e && e.message || e)).slice(0, 300)); }
  if (browser) await browser.close().catch(() => {});
  fs.writeFileSync(REPORT_FILE, JSON.stringify(out, null, 2));
  console.log("[text-run-real] report=" + REPORT_FILE + " version=" + out.version);
  out.cases.forEach((c) => console.log("[text-run-real] " + c.case + " verdict=" + c.verdict + " runs=" + c.runCount + " expected=" + c.expected.verdict + " match=" + c.expectedMatch + " createOk=" + (c.ocrCreate && c.ocrCreate.ok) + " actual#=" + ((c.actualObjects || []).length) + " -> " + (c.passed ? "PASS" : "FAIL") + ((c.ocrCreate && c.ocrCreate.message) ? " msg=" + String(c.ocrCreate.message).slice(0, 80) : "")));
  out.errors.forEach((e) => console.log("[text-run-real] ERR " + e));
  process.exit((out.errors.length || out.summary.fail) ? 1 : 0);
})();