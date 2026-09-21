// runtime/stage10/text-run-mixed-detect.js — Stage 10-B Phase 10-B.3：真实图片 Mixed Typography Detection
// ---------------------------------------------------------------------
// 目标（规格 §四/§八/§十/§三十）：在真实编辑器页面合成名片卡（真实浏览器渲染文字）+ IMAGE_PIXEL
// 逐行/逐 band ink 证据 → 复用 text-run-segmentation（detectMixedTypography/detectRunCandidates/
// scoreRunBoundary/planRuns）→ 只生成 evidence，不接生产（candidate-only，规格 §十 B.2/B.3）。
// Case 集合（规格 §四十 真机样本）：T-R1 单行同字号 / T-R2 两行同字号 / T-R3 大字+小字 /
//   T-R4 大字+小字+大字 / T-R6 姓名大+职位小 / T-R7 电话大+邮箱小 / T-R8 旋转 / T-R9 非均匀缩放。
// 渲染层不决定结论：结论 = planRuns 的 conservative gate（HIGH→SPLIT / 否则 SINGLE fallback）。
// 凭据：ZY_STAGE9_COOKIE 仅运行时（缺失回退持久 profile）。报告：runtime/reports/stage-10/text-run-mixed-detect.json
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
const REPORT_FILE = path.join(REPORT_DIR, "text-run-mixed-detect.json");
const adapter = require("../scriptcat-adapter");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const DEFAULT_URL = "https://diy.zheliyin.com/diyWeb/third/1234075/2114747/999/thirdDiyAdd.do";
const URL = process.env.ZY_URL || DEFAULT_URL;
const COOKIE_RAW = process.env.ZY_STAGE9_COOKIE || "";
const SEG10 = require(path.join(ROOT, "extension", "src", "editor", "text-run-segmentation.js"));
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
  const d = SEG10.detectMixedTypography({ lineSpans: [{ spanInkHeight: 57 }, { spanInkHeight: 31 }] });
  t("seg-loads", d.mixedCandidate === true);
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }
if (!COOKIE_RAW) console.warn("[text-run-mixed-detect] 未注入 ZY_STAGE9_COOKIE —— 回退持久 profile（可能过期）");

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
function resolveEntry10T3() {
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
function zy10lineInkRegion(gray, w, h, bb) {
  // 局部 Otsu 前景（与 image-ink-target 同一内核，内联以便独立于页面挂载）
  try {
    const x0 = Math.max(0, Math.floor(bb.x)), y0 = Math.max(0, Math.floor(bb.y));
    const x1 = Math.min(w - 1, Math.ceil(bb.x + bb.width)), y1 = Math.min(h - 1, Math.ceil(bb.y + bb.height));
    if (x1 <= x0 || y1 <= y0) return { ok: false, reason: "empty-region" };
    const hist = new Array(256).fill(0);
    let total = 0, sum = 0;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const g = gray[y * w + x];
        hist[g] += 1; total += 1; sum += g;
      }
    }
    if (total < 16) return { ok: false, reason: "no-ink" };
    const mean = sum / total;
    let sumB = 0, wB = 0, maxVar = -1, threshold = mean;
    for (let t = 0; t < 256; t += 1) {
      wB += hist[t];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const inter = wB * wF * (mB - mF) * (mB - mF);
      if (inter > maxVar) { maxVar = inter; threshold = t; }
    }
    // 前景 = 少数类（ink 像素通常少于背景）；minoriy 侧由 threshold 上下计数决定
    let cntDark = 0, cntLight = 0;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const g = gray[y * w + x];
        if (g <= threshold) cntDark += 1; else cntLight += 1;
      }
    }
    const fgIsDark = cntDark <= cntLight;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, cnt = 0;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const g = gray[y * w + x];
        const isFg = fgIsDark ? (g <= threshold) : (g > threshold);
        if (!isFg) continue;
        cnt += 1;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    if (cnt < 8) return { ok: false, reason: "no-foreground" };
    return { ok: true, inkWidth: maxX - minX + 1, inkHeight: maxY - minY + 1, inkBox: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }, confidence: Math.min(1, cnt / total * 2), method: "local-otsu" };
  } catch (e) { return { ok: false, reason: String(e && e.message || e).slice(0, 80) }; }
}
function zy10grayOf(data, w, h) {
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i += 1) { const o = i * 4; out[i] = Math.round(0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]); }
  return out;
}
function zy10loadImageData(im) {
  try { const cv = document.createElement("canvas"); cv.width = im.naturalWidth; cv.height = im.naturalHeight; const g = cv.getContext("2d", { willReadFrequently: true }); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, cv.width, cv.height); return { ok: true, data: d.data, width: cv.width, height: cv.height }; } catch (e) { return { ok: false, reason: String(e && e.message || e).slice(0, 80) }; }
}
`;

// ---- 页面 Case：合成名片卡（多行不同字号）→ 注入背景 → 逐行 IMAGE_PIXEL ink ----
// 行布局：args.linesMeta = [{text,fontSizePx,bandY,yCenter}]（band 于 IMAGE_PIXEL 系）
const PAGE_CASE = `
const args = __zy10t3args;
const out = { case: args.id, steps: [], errors: [] };
try {
  const N = 900, M = 560;
  const cvCard = document.createElement("canvas"); cvCard.width = N; cvCard.height = M;
  const gc = cvCard.getContext("2d");
  gc.fillStyle = "rgb(252,252,252)"; gc.fillRect(0, 0, N, M);
  const linesMeta = args.linesMeta || [];
  linesMeta.forEach(function (lm) {
    gc.fillStyle = "rgb(20,20,20)";
    gc.font = "bold " + lm.fontSizePx + "px SimSun, serif";
    gc.fillText(lm.text, 90, lm.yCenter);
  });
  const dataUrl = cvCard.toDataURL("image/png");
  out.drawn = { linesMeta: linesMeta };
  const r = resolveEntry10T3();
  const c = r.canvas;
  if (!c) { out.errors.push("no-canvas"); return { ok: false, out: out }; }
  const f = (c.constructor && c.constructor.fabric) || window.fabric;
  const im = new Image();
  await new Promise(function (res, rej) { im.onload = () => res(); im.onerror = () => rej(new Error("img-fail")); im.src = dataUrl; });
  await new Promise(function (res) { const bg = new f.Image(im); bg.set({ left: 30, top: 20 }); c.setBackgroundImage(bg, function () { try { if (c.requestRenderAll) c.requestRenderAll(); } catch (e) {} res(); }); });
  await new Promise(function (r2) { setTimeout(r2, 500); });
  const bgObj = c.backgroundImage;
  if (bgObj) {
    if (args.rotate) { bgObj.set({ angle: args.rotate }); }
    if (args.scale) { bgObj.set({ scaleX: args.scale[0], scaleY: args.scale[1] }); }
    try { if (typeof c.requestRenderAll === "function") c.requestRenderAll(); } catch (e) {}
    await new Promise(function (r2) { setTimeout(r2, 400); });
  }
  out.bgObject = bgObj ? { scaleX: bgObj.scaleX, scaleY: bgObj.scaleY, angle: bgObj.angle } : null;
  const nat = zy10loadImageData(im);
  if (!nat.ok) { out.errors.push(nat.reason); return { ok: false, out: out }; }
  const gray = zy10grayOf(nat.data, nat.width, nat.height);
  const perLine = [];
  linesMeta.forEach(function (lm, li) {
    const bb = { x: 80, y: lm.bandY, width: 520, height: lm.bandH };
    const ink = zy10lineInkRegion(gray, nat.width, nat.height, bb);
    perLine.push({ line: li, text: lm.text, fontSizePx: lm.fontSizePx, bbox: bb, inkHeight: ink.ok ? ink.inkHeight : null, inkWidth: ink.ok ? ink.inkWidth : null, inkBox: ink.ok ? ink.inkBox : null });
  });
  out.perLine = perLine;
  return { ok: true, out: out };
} catch (eM) { out.errors.push("main:" + String(eM && eM.stack || (eM && eM.message || eM)).slice(0, 220)); return { ok: false, out: out }; }
`;

// ---- 清理背景（恢复模板） ----
const PAGE_CLEAN_BG = `const r = resolveEntry10T3(); const c = r.canvas;
const out = { cleared: false };
if (c) { try { c.setBackgroundImage(null, function () { try { if (c.requestRenderAll) c.requestRenderAll(); } catch (e) {} out.cleared = true; }); } catch (e) { out.err = String(e && e.message || e).slice(0, 100); } }
return { ok: true, out: out };`;

[RESOLVE_ENTRY, PAGE_CLEAN_BG].forEach(function (src, i) {
  try { new Function(src); } catch (e) { console.error("[compile-check] chunk " + i + " SyntaxError: " + String(e && e.message || e) + " head=" + JSON.stringify((src || "").slice(0, 80)) + " tail=" + JSON.stringify((src || "").slice(-80))); process.exit(2); }
});
// PAGE_CASE 内含 await，运行时直接作为 async 函数体注入（与 native-color-matrix 相同），此处做编译预检
try { new Function("async function __p(__zy10t3args){" + PAGE_CASE + "\n}"); } catch (e) { console.error("[compile-check] PAGE_CASE async wrapper SyntaxError: " + String(e && e.message || e)); process.exit(2); }

// Case 定义（字号视觉 px / 行 band 均为 IMAGE_PIXEL 系）
const CASES = [
  { id: "T-R1", label: "single-line-same-style", linesMeta: [{ text: "单行同字号示例文本", fontSizePx: 36, yCenter: 200, bandY: 150, bandH: 70 }], expected: { verdict: "SINGLE", runCount: 1, note: "1 Run" } },
  { id: "T-R2", label: "two-line-same-style", linesMeta: [
    { text: "两行同字号内容", fontSizePx: 36, yCenter: 200, bandY: 150, bandH: 70 },
    { text: "第二行同样大小", fontSizePx: 36, yCenter: 280, bandY: 230, bandH: 70 }
  ], expected: { verdict: "SINGLE", runCount: 1, note: "2 line / 1 typography group" } },
  { id: "T-R3", label: "big-plus-small", linesMeta: [
    { text: "大标题文字", fontSizePx: 52, yCenter: 200, bandY: 140, bandH: 90 },
    { text: "小字备注说明", fontSizePx: 22, yCenter: 290, bandY: 240, bandH: 60 }
  ], expected: { verdict: "SPLIT", runCount: 2, note: "2 Run" } },
  { id: "T-R4", label: "big-small-big", linesMeta: [
    { text: "大字第一行", fontSizePx: 52, yCenter: 200, bandY: 140, bandH: 90 },
    { text: "小字中间行", fontSizePx: 22, yCenter: 290, bandY: 240, bandH: 60 },
    { text: "大字第三行", fontSizePx: 52, yCenter: 380, bandY: 320, bandH: 90 }
  ], expected: { verdict: "SPLIT", runCount: 3, note: "3 Run" } },
  { id: "T-R6", label: "name-title", linesMeta: [
    { text: "张三丰", fontSizePx: 56, yCenter: 200, bandY: 140, bandH: 95 },
    { text: "设计总监", fontSizePx: 24, yCenter: 300, bandY: 250, bandH: 60 }
  ], expected: { verdict: "SPLIT", runCount: 2, note: "visual evidence supports split" } },
  { id: "T-R7", label: "phone-email", linesMeta: [
    { text: "13800138000", fontSizePx: 40, yCenter: 200, bandY: 145, bandH: 75 },
    { text: "contact@example.com", fontSizePx: 20, yCenter: 290, bandY: 240, bandH: 55 }
  ], expected: { verdict: "SPLIT", runCount: 2, note: "2 Run" } },
  { id: "T-R8", label: "rotated", rotate: 30, linesMeta: [
    { text: "大标题旋转", fontSizePx: 52, yCenter: 200, bandY: 140, bandH: 90 },
    { text: "小字旋转备注", fontSizePx: 22, yCenter: 290, bandY: 240, bandH: 60 }
  ], expected: { verdict: "SPLIT", runCount: 2, note: "rotation keeps IMAGE_PIXEL ink" } },
  { id: "T-R9", label: "nonuniform-scale", scale: [0.6, 1.1], linesMeta: [
    { text: "大标题非均匀", fontSizePx: 52, yCenter: 200, bandY: 140, bandH: 90 },
    { text: "小字备注缩放", fontSizePx: 22, yCenter: 290, bandY: 240, bandH: 60 }
  ], expected: { verdict: "SPLIT", runCount: 2, note: "nonuniform keeps IMAGE_PIXEL ink" } }
];

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const out = { ts: new Date().toISOString(), stage: "STAGE-10B3-MIXED-TYPOGRAPHY-DETECT", version: USERSCRIPT_VERSION, url: URL.split("?")[0], cookiePresent: !!COOKIE_RAW, cases: [], errors: [] };
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
    const waitEditorReady = async (tries) => {
      for (let i = 0; i < (tries || 18); i += 1) {
        const r = await page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed) })).catch(() => ({}));
        if (r && r.ok && r.bridge) return r;
        await SLEEP(1200);
      }
      return page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed) })).catch(() => ({}));
    };
    const cond = { baidu: "standard", ink: "1" };
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => out.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
    await SLEEP(4000);
    await injectPageWorld(pageWorldPayloadFor(cond));
    await SLEEP(1200);
    const ready = await waitEditorReady(18);
    if (!(ready && ready.ok)) out.errors.push("EDITOR_UNAVAILABLE");
    await SLEEP(2500);
    await injectPageWorld(MEGA_MODULES + "\n;\n" + RESOLVE_ENTRY + "\n;window.__zy10t3run = async function(__zy10t3args){" + PAGE_CASE + "\n}; window.__zy10t3clean = function(){" + PAGE_CLEAN_BG + "\n};");
    await SLEEP(800);
    for (const cs of CASES) {
      const rec = { case: cs.id, label: cs.label, rotate: cs.rotate || null, scale: cs.scale || null, expected: cs.expected };
      const rPage = await page.evaluate((arg) => { const fn = window.__zy10t3run; if (!fn) return { ok: false, reason: "missing-fn" }; return fn(arg); }, { id: cs.id, linesMeta: cs.linesMeta, rotate: cs.rotate, scale: cs.scale }).catch((e) => ({ ok: false, reason: String(e && e.message || e).slice(0, 160) }));
      if (rPage && rPage.ok && rPage.out) rec.page = rPage.out; else rec.page = { failed: rPage };
      await SLEEP(400);
      // node 侧 segmentation（纯模块；candidate-only + conservative gate）
      if (rPage && rPage.ok && rPage.out && Array.isArray(rPage.out.perLine)) {
        const pl = rPage.out.perLine;
        const nativeText = pl.map((p) => p.text).join("\n");
        const spans = [];
        let offset = 0;
        pl.forEach(function (p) {
          const txt = String(p.text || "");
          const inkH = (p.inkHeight != null && p.inkHeight > 0) ? p.inkHeight : null;
          if (inkH) spans.push({ start: offset, end: offset + txt.length, spanInkHeight: inkH, spanInkWidth: p.inkWidth || 0, x: 80 + (p.inkWidth || 120) / 2, y: p.bbox ? p.bbox.y : 0 });
          offset += txt.length + 1; // +1 换行符
        });
        const detect = SEG10.detectMixedTypography({ lineSpans: spans });
        const cand = SEG10.detectRunCandidates({ nativeText: nativeText, spans: spans });
        const score = SEG10.scoreRunBoundary({ runs: cand.runs, nativeText: nativeText, mixedConfidence: detect.confidence });
        const plan = SEG10.planRuns({ nativeText: nativeText, spans: spans });
        rec.seg = { detect: detect, candidate: cand, score: score, planResult: plan.result, planRuns: plan.runs.map(function (rr) { return { text: rr.text, charStart: rr.charStart, charEnd: rr.charEnd, medianSpanInkHeight: rr.medianSpanInkHeight }; }), fallbackReason: plan.fallbackReason || null };
        rec.verdict = plan.result === "FULL_RUN_SPLIT" ? "SPLIT" : "SINGLE";
        rec.runCount = plan.runs.length;
        rec.expectedMatch = rec.verdict === cs.expected.verdict;
        rec.textConservationOk = plan.runs.map(function (rr) { return rr.text; }).join("") === nativeText;
        // 旋转/非均匀不改变 IMAGE_PIXEL ink（仅记录 ink 稳定性）
        if (cs.rotate || cs.scale) rec.geometryNote = "IMAGE_PIXEL ink sampled pre-transform; transform only applied to bg object";
      } else {
        rec.seg = { failed: rPage };
        rec.verdict = "UNKNOWN";
        rec.runCount = 0;
      }
      out.cases.push(rec);
      await SLEEP(400);
      await page.evaluate(() => { const fn = window.__zy10t3clean; return fn ? fn() : null; }).catch(() => {});
      await SLEEP(500);
    }
    // 最终清理背景
    await page.evaluate(() => { const fn = window.__zy10t3clean; return fn ? fn() : null; }).catch(() => {});
    await SLEEP(600);
    const passCount = out.cases.filter((c) => c.expectedMatch === true).length;
    const unknownCount = out.cases.filter((c) => c.verdict === "UNKNOWN").length;
    out.summary = { total: out.cases.length, expectedMatch: passCount, unknown: unknownCount };
  } catch (e) { out.errors.push("MAIN: " + String(e && e.stack || (e && e.message || e)).slice(0, 300)); }
  if (browser) await browser.close().catch(() => {});
  fs.writeFileSync(REPORT_FILE, JSON.stringify(out, null, 2));
  console.log("[text-run-mixed-detect] report=" + REPORT_FILE + " version=" + out.version);
  out.cases.forEach((c) => console.log("[text-run-mixed-detect] " + c.case + " verdict=" + c.verdict + " runs=" + c.runCount + " expected=" + c.expected.verdict + " match=" + c.expectedMatch + (c.seg && c.seg.score ? " score=" + c.seg.score.confidence + " level=" + c.seg.score.level : "") + (c.seg && c.seg.detect ? " detection=" + c.seg.detect.reason : "")));
  out.errors.forEach((e) => console.log("[text-run-mixed-detect] ERR " + e));
  process.exit(out.errors.length ? 1 : 0);
})();