// runtime/stage10/native-color-matrix.js — Stage 10-A Phase 5：真机颜色矩阵 C1-C10
// ---------------------------------------------------------------------
// 每 Case：页面世界合成彩色名片卡（真实浏览器渲染文字 → dataURL）→ setBg 注入为编辑器背景图
//   → image-space 解析（buildImageTransform/effectiveScale 证据）
//   → 自然图像素（IMAGE_PIXEL）按已知 OCR bbox + ImageInk 前景 → extractForegroundColor
//   → sourceColor vs detectedColor（RGB 欧氏 delta）
//   → 生产路径：bridge ocrCreate（items 带 fill）→ 读回 actualFill → requested vs actual
// C9/C10：旋转/非均匀缩放图片 —— 采样仍在 IMAGE_PIXEL（与对象变换解耦），验证 delta 不受影响。
// 附加：C8 双行 → 逐行 ink height + ratio（Mixed Typography evidence，仅记录不改字号算法）。
// 凭据：ZY_STAGE9_COOKIE 仅运行时（缺失回退持久 profile）。报告：runtime/reports/stage-10/native-color-matrix.json
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
const REPORT_FILE = path.join(REPORT_DIR, "native-color-matrix.json");
const adapter = require("../scriptcat-adapter");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const DEFAULT_URL = "https://diy.zheliyin.com/diyWeb/third/1234075/2114747/999/thirdDiyAdd.do";
const URL = process.env.ZY_URL || DEFAULT_URL;
const COOKIE_RAW = process.env.ZY_STAGE9_COOKIE || "";
const USERSCRIPT_VERSION = (/\/\/ @version\s+([\d.]+)/.exec(fs.readFileSync(USERSCRIPT_PATH, "utf8")) || [])[1] || "unknown";
const NC10 = require(path.join(ROOT, "extension", "src", "editor", "native-color.js"));
const { compareColor: compareColor10 } = NC10;

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
if (!COOKIE_RAW) console.warn("[native-color-matrix] 未注入 ZY_STAGE9_COOKIE —— 回退持久 profile（可能过期）");

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
  fs.readFileSync(path.join(ROOT, "extension", "src", "editor", "native-color.js"), "utf8")
].join("\n;\n");
const RESOLVE_ENTRY = `
function resolveEntry10M() {
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
function zy10lineInkRegion(gray, iw, ih, bb) {
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
function zy10loadImageData(el) {
  const iw = el.naturalWidth || el.width, ih = el.naturalHeight || el.height;
  if (!iw || !ih) return { ok: false, reason: "no-size" };
  const cv = document.createElement("canvas"); cv.width = iw; cv.height = ih;
  const g = cv.getContext && cv.getContext("2d");
  if (!g) return { ok: false, reason: "no-ctx" };
  let d = null; try { g.drawImage(el, 0, 0); d = g.getImageData(0, 0, iw, ih); } catch (e) { d = null; }
  if (!d) return { ok: false, reason: "cross-origin" };
  return { ok: true, data: d.data, width: iw, height: ih };
}
function zy10grayOf(rgba, w, h) {
  const g = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) { const j = i * 4; g[i] = Math.round(0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]); }
  return g;
}
`;

const CASES = [
  { id: "C1", label: "black-white-bg", fg: [17, 17, 17], bg: [255, 255, 255], bgMode: "solid", text: "黑字白底公司名称", lines: 1, rotate: null, scale: null },
  { id: "C2", label: "white-dark-bg", fg: [248, 248, 248], bg: [32, 38, 46], bgMode: "solid", text: "白字深底文字信息", lines: 1, rotate: null, scale: null },
  { id: "C3", label: "blue-light-bg", fg: [0, 87, 184], bg: [245, 245, 245], bgMode: "solid", text: "蓝字浅底示例文字", lines: 1, rotate: null, scale: null },
  { id: "C4", label: "red-light-bg", fg: [217, 43, 43], bg: [255, 248, 240], bgMode: "solid", text: "红字浅底测试文本", lines: 1, rotate: null, scale: null },
  { id: "C5", label: "darkgray", fg: [77, 77, 77], bg: [255, 255, 255], bgMode: "solid", text: "深灰文字版本信息", lines: 1, rotate: null, scale: null },
  { id: "C6", label: "gold-mottled", fg: [230, 184, 0], bg: [222, 222, 222], bgMode: "checker", text: "金色彩色背景复杂", lines: 1, rotate: null, scale: null },
  { id: "C7", label: "single-line", fg: [30, 30, 30], bg: [255, 255, 255], bgMode: "solid", text: "单行测试文字行", lines: 1, rotate: null, scale: null },
  { id: "C8", label: "multi-line", fg: [25, 25, 25], bg: [250, 250, 250], bgMode: "solid", text: "第一行大标题" + String.fromCharCode(10) + "第二行小字备注", lines: 2, rotate: null, scale: null },
  { id: "C9", label: "rotated-image", fg: [40, 40, 40], bg: [255, 255, 255], bgMode: "solid", text: "旋转图片文字采样", lines: 1, rotate: 30, scale: null },
  { id: "C10", label: "nonuniform-scale", fg: [40, 40, 40], bg: [255, 255, 255], bgMode: "solid", text: "非均匀缩放松弛文字", lines: 1, rotate: null, scale: [0.6, 1.1] }
];

// 页面侧：合成名片卡（真实浏览器渲染文字）+ 注入背景 + 提取 + 读回
const PAGE_CASE = `
const args = __zy10args;
const out = { case: args.id, steps: [], errors: [] };
try {
  const N = 900, M = 560;
  const cvCard = document.createElement("canvas"); cvCard.width = N; cvCard.height = M;
  const gc = cvCard.getContext("2d");
  // 背景
  if (args.bgMode === "checker") {
    for (let y = 0; y < M; y += 1) for (let x = 0; x < N; x += 1) { const v = ((x >> 3) + (y >> 3)) % 2 === 0 ? 215 : 229; gc.fillStyle = "rgb(" + v + "," + v + "," + v + ")"; gc.fillRect(x, y, 1, 1); }
  } else {
    gc.fillStyle = "rgb(" + args.bg.join(",") + ")"; gc.fillRect(0, 0, N, M);
  }
  // 文字（仿真 OCR 区块：yCenter 200/300）
  const fgCss = "rgb(" + args.fg.join(",") + ")";
  gc.fillStyle = fgCss;
  const lines = args.text.split("\\n");
  let yC = 200;
  lines.forEach(function (ln, li) {
    gc.font = (li === 0 ? "bold 46px" : "bold 26px") + " SimSun, serif";
    gc.fillText(ln, 90, yC + li * 72);
  });
  // 兼容已知 bbox：单行 {x:80,y:170,width:500,height:64}；双行 yBand per-line
  const bbox = args.lines > 1
    ? { x: 80, y: 150, width: 500, height: 190 }
    : { x: 80, y: 170, width: 500, height: 64 };
  out.drawn = { bbox: bbox, lines: lines };
  const dataUrl = cvCard.toDataURL("image/png");
  // 注入为编辑器背景
  const r = resolveEntry10M();
  const c = r.canvas;
  if (!c) { out.errors.push("no-canvas"); return { ok: false, out: out }; }
  const f = (c.constructor && c.constructor.fabric) || window.fabric;
  const im = new Image();
  await new Promise(function (res, rej) {
    im.onload = () => res();
    im.onerror = () => rej(new Error("img-fail"));
    im.src = dataUrl;
  });
  await new Promise(function (res) {
    const bg = new f.Image(im); bg.set({ left: 30, top: 20 });
    c.setBackgroundImage(bg, function () { try { if (c.requestRenderAll) c.requestRenderAll(); } catch (e) {} res(); });
  });
  await new Promise(function (r2) { setTimeout(r2, 500); });
  // 对象变换（C9/C10）
  const bgObj = c.backgroundImage;
  if (bgObj) {
    if (args.rotate) { bgObj.set({ angle: args.rotate }); }
    if (args.scale) { bgObj.set({ scaleX: args.scale[0], scaleY: args.scale[1] }); }
    try { if (typeof c.requestRenderAll === "function") c.requestRenderAll(); } catch (e) {}
    await new Promise(function (r2) { setTimeout(r2, 400); });
  }
  out.bgObject = bgObj ? { left: bgObj.left, top: bgObj.top, width: bgObj.width, height: bgObj.height, scaleX: bgObj.scaleX, scaleY: bgObj.scaleY, angle: bgObj.angle, aCoords: bgObj.aCoords ? { tl: [bgObj.aCoords.tl.x, bgObj.aCoords.tl.y], br: [bgObj.aCoords.br.x, bgObj.aCoords.br.y] } : null } : null;
  const T = buildImageTransform({ naturalWidth: im.naturalWidth, naturalHeight: im.naturalHeight, width: bgObj ? bgObj.width : im.naturalWidth, height: bgObj ? bgObj.height : im.naturalHeight, aCoords: bgObj && bgObj.aCoords });
  out.imageTransform = T ? { affine: T.map(function (v) { return Math.round(v * 1e6) / 1e6; }) } : null;
  out.effectiveScale = effectiveScaleOf(T);
  // IMAGE_PIXEL 采样（与对象变换解耦）
  const nat = zy10loadImageData(im);
  if (!nat.ok) { out.errors.push(nat.reason); return { ok: false, out: out }; }
  const gray = zy10grayOf(nat.data, nat.width, nat.height);
  // 逐行 bbox（双行）
  const bands = [];
  if (args.lines > 1) {
    for (let li = 0; li < lines.length; li += 1) { bands.push({ x: 80, y: 150 + li * 72 - 40, width: 500, height: 70 }); }
  } else { bands.push(bbox); }
  const perLine = [];
  bands.forEach(function (bb, li) {
    const ink = zy10lineInkRegion(gray, nat.width, nat.height, bb);
    perLine.push({ line: li, bbox: bb, inkHeight: ink.ok ? ink.inkHeight : null, inkWidth: ink.ok ? ink.inkWidth : null, inkBox: ink.ok ? ink.inkBox : null });
  });
  out.perLine = perLine;
  // 主色提取（区域取各 band 的 inkBox union；否则用 band bbox）
  const region = { x: Infinity, y: Infinity, x2: -Infinity, y2: -Infinity };
  bands.forEach(function (bb, li) {
    const ib = perLine[li].inkBox || bb;
    region.x = Math.min(region.x, ib.x); region.y = Math.min(region.y, ib.y);
    region.x2 = Math.max(region.x2, ib.x + ib.width); region.y2 = Math.max(region.y2, ib.y + ib.height);
  });
  const bboxRegion = { x: region.x, y: region.y, width: region.x2 - region.x, height: region.y2 - region.y };
  const fe = extractForegroundColor({ data: nat.data, width: nat.width, height: nat.height, bbox: bboxRegion });
  out.detected = fe;
  // Mixed typography（C8）：双行 ink ratio
  if (args.lines > 1 && perLine.length >= 2 && perLine[0].inkHeight && perLine[1].inkHeight) {
    const h0 = perLine[0].inkHeight, h1 = perLine[1].inkHeight;
    const small = Math.min(h0, h1), large = Math.max(h0, h1);
    out.mixed = { lineInkHeights: [h0, h1], inkRatio: Math.round((small / large) * 1000) / 1000, suspectedMixedTypography: (small / large) < 0.6 };
  } else { out.mixed = { note: "single-line or no-ink", lineInkHeights: perLine.map((p) => p.inkHeight) }; }
  return { ok: true, out: out };
} catch (eM) { out.errors.push("main:" + String(eM && eM.stack || (eM && eM.message || eM)).slice(0, 220)); return { ok: false, out: out }; }
`;

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const out = { ts: new Date().toISOString(), stage: "STAGE-10A-NATIVE-COLOR-MATRIX", version: USERSCRIPT_VERSION, url: URL.split("?")[0], cookiePresent: !!COOKIE_RAW, cases: [], passCount: 0, failCount: 0, errors: [] };
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
      if (!c) return { ok: false, texts: [] };
      const texts = [];
      (c.getObjects() || []).forEach((o, i) => {
        if (!o) return;
        const ty = String(o.type || "");
        if (ty !== "textbox" && ty !== "i-text" && ty !== "text") return;
        texts.push({ index: i, text: String(o.text || ""), zyOcrKey: o.zyOcrKey || null, uuid: o.uuid || o.multiUuid || null, fill: typeof o.fill !== "undefined" ? String(o.fill) : null });
      });
      return { ok: true, textboxCount: texts.length, texts: texts };
    }).catch(() => ({ ok: false, texts: [] }));
    const cleanupBg = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const c = vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas;
      if (!c) return { cleaned: false };
      if (c.backgroundImage) { try { c.setBackgroundImage(null, function () {}); } catch (e) {} }
      let removed = 0;
      (c.getObjects() || []).forEach((o) => { try { const k = o.zyOcrKey || ""; if (k.indexOf("zy-ocr-") === 0) { const d = vo.totalCanvasArray[0]; const li = d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr ? d.canvasObjInfo.canvasToProductObjArr.indexOf(o) : -1; if (li >= 0) d.canvasObjInfo.canvasToProductObjArr.splice(li, 1); c.remove(o); removed += 1; } } catch (e) {} });
      try { if (typeof c.requestRenderAll === "function") c.requestRenderAll(); } catch (e) {}
      return { cleaned: true, removed: removed };
    }).catch(() => ({ cleaned: false }));
    const cond = { baidu: "standard", ink: "0" };
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => out.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
    await SLEEP(4000);
    await injectPageWorld(pageWorldPayloadFor(cond));
    await SLEEP(1200);
    const ready = await waitEditorReady(18, true);
    if (!(ready && ready.ok)) out.errors.push("EDITOR_UNAVAILABLE");
    await SLEEP(2500);
    await injectPageWorld(MEGA_MODULES + "\n;\n" + RESOLVE_ENTRY + "\n" + LINE_INK_HELPER + "\n;window.__zy10case = null;\n;window.__zy10runner = async function(__zy10args){\n" + PAGE_CASE + "\n};");
    await SLEEP(600);
    const runCase = async (cs) => {
      const res = await page.evaluate((c2) => { try { return window.__zy10runner(c2); } catch (e) { return { ok: false, out: { errors: [String(e && e.message || e).slice(0, 160)] } }; } }, cs).catch((e) => ({ ok: false, out: { errors: [String(e && e.message || e).slice(0, 160)] } }));
      return res;
    };
    for (const cs of CASES) {
      const rec = { case: cs.id, label: cs.label };
      const res = await runCase(cs);
      const r = res && res.ok && res.out ? res.out : null;
      if (!r) { rec.passed = false; rec.failed = (res && res.out && res.out.errors || ["run-failed"]); out.cases.push(rec); out.failCount += 1; continue; }
      rec.detected = r.detected;
      rec.perLine = r.perLine;
      rec.mixed = r.mixed;
      rec.effectiveScale = r.effectiveScale;
      rec.imageTransform = r.imageTransform;
      rec.bgObject = r.bgObject;
      rec.errors = r.errors || [];
      // delta
      const s = cs.fg, d = (r.detected && r.detected.ok && r.detected.color) ? r.detected.color : null;
      if (d) {
        const dp = { r: parseInt(d.slice(1, 3), 16), g: parseInt(d.slice(3, 5), 16), b: parseInt(d.slice(5, 7), 16) };
        rec.deltaRgb = Math.round(Math.hypot(s[0] - dp.r, s[1] - dp.g, s[2] - dp.b) * 100) / 100;
        rec.detectedColor = d;
        rec.colorLevel = rec.deltaRgb <= 32 ? (rec.deltaRgb === 0 ? "EXACT" : "NEAR") : "MISMATCH";
      } else { rec.colorLevel = "UNKNOWN"; }
      rec.sourceColor = "#" + s.map((v) => ("0" + v.toString(16)).slice(-2)).join("");
      // 生产创建路径：ocrCreate items 带 fill=detectedColor → 读回 actualFill
      const cp = await bridgeCall("getCurrentPage", {}, "getCurrentPageResult", 6000).catch(() => null);
      const pageId = (cp && cp.pageId) || "canvas:c0";
      const probeText = "ZY_C10_" + cs.id;
      const txId = "tx-" + Date.now().toString(36);
      const cr = await bridgeCall("ocrCreate", { pageId: pageId, side: "FRONT", transactionId: txId, imageFingerprint: "m-" + cs.id, items: [{ blockIndex: 0, text: probeText, left: 60, top: 60, width: 200, height: 50, fontSize: 24, fill: rec.detectedColor || null }] }, "ocrCreateResult", 15000).catch(() => null);
      await SLEEP(800);
      const tb = await collectTexts();
      const created = (tb.texts || []).filter((x) => x.text === probeText);
      if (cr && cr.ok && created.length) {
        rec.requestedFill = rec.detectedColor || null;
        rec.actualFill = created[0].fill;
        const cc = compareColor10(rec.requestedFill, rec.actualFill);
        rec.fillPass = cc.level; // EXACT / NEAR / MISMATCH / UNKNOWN
        rec.fillPassOk = cc.level === "EXACT" || cc.level === "NEAR";
        rec.createdUuid = created[0].uuid;
      } else { rec.fillPass = "UNKNOWN"; rec.fillPassOk = false; rec.createErr = cr && cr.message || (cr && cr.code) || "no-created"; }
      await cleanupBg();
      await SLEEP(900);
      rec.passed = (rec.colorLevel === "EXACT" || rec.colorLevel === "NEAR") && rec.fillPassOk;
      out.cases.push(rec);
      if (rec.passed) out.passCount += 1; else out.failCount += 1;
    }
  } catch (e) { out.errors.push("MAIN: " + String(e && e.stack || (e && e.message || e)).slice(0, 300)); }
  if (browser) await browser.close().catch(() => {});
  fs.writeFileSync(REPORT_FILE, JSON.stringify(out, null, 2));
  console.log("[native-color-matrix] report=" + REPORT_FILE + " version=" + out.version);
  console.log("[native-color-matrix] pass=" + out.passCount + " fail=" + out.failCount);
  out.cases.forEach((c) => console.log("[native-color-matrix] " + c.case + " src=" + c.sourceColor + " det=" + (c.detectedColor || "?") + " delta=" + c.deltaRgb + " lvl=" + c.colorLevel + " fillPass=" + c.fillPass + " -> " + (c.passed ? "PASS" : "FAIL") + (c.errors && c.errors.length ? " errs=" + c.errors.join("|") : "")));
  out.errors.forEach((e) => console.log("[native-color-matrix] ERR " + e));
  process.exit((out.errors.length || out.failCount) ? 1 : 0);
})();