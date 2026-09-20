// runtime/stage8b/background-image-audit.js — Stage 8B STEP 5：background-image 专项审计
// ---------------------------------------------------------------------
// 单一运行 = 一个 (route=background, angle, scale)。真实模板 252438。
// 流程：注入背景图(给定 angle/scale) → 捕获 ocrPrepareResult.geometry（含 aCoords，验证 Phase 0）
//       → 真实 OCR → 捕获 ocrCreate items（含 zy8bTargetQuad，验证 Phase A）
//       → 观察 ocrAdjust 校正流量与 ocrCreateResult.created[].geometry（验证 Phase B/C/D/E）
//       → 读回创建后 textbox 全 aCoords quad → runner 侧独立 compareTextGeometry → PASS/FAIL
//       → 记录 canvas/图片全字段 + viewport/zoom/retina（坐标合同 §1/§6）。
// 每 case 内嵌 3 个 OCR 块（大字标题/中号正文/小字页脚，行距分离）。
// env: ZY_CASES 默认 "A0,B10,C30,D45s05"；ZY_TARGET=252438|_ 。凭据 env ZY_BAIDU_AK/SK。
// 输出 runtime/reports/stage-8b/background-image-audit-{case}.json
// 零生产代码修改（仅页面世界探针/injectUserscript 的 @require 分支重写）。
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("../../node_modules/playwright");
const adapter = require("../scriptcat-adapter");
const ROOT = path.join(__dirname, "..", "..");
const Ink = require(path.join(ROOT, "extension", "src", "editor", "ink-measure.js")); // Stage 8D P6-1：ink 实测/三层对比（node 纯函数核）
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const EXT_ID = adapter.EXT_ID;
const USERSCRIPT_PATH = path.join(ROOT, "zheliyin-card-assistant.user.js");
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-8b");
const BRANCH = "stage-8d-ocr-quality-reconstruction";
const BAIDU_AK = process.env.ZY_BAIDU_AK || "";
const BAIDU_SK = process.env.ZY_BAIDU_SK || "";
const TARGET = process.env.ZY_TARGET || "252438";
// Stage 9：Native OCR 真机认证/开关（cookie 敏感仅运行时；feature zyStage9NativeTruth）
const STAGE9_COOKIE = process.env.ZY_STAGE9_COOKIE || "";
const STAGE9_NATIVE_TRUTH = process.env.ZY_STAGE9_NATIVE_TRUTH === "1";
const STAGE9_NATIVE_OCR_MODE = process.env.ZY_STAGE9_NATIVE_OCR_MODE || "1"; // textType（取证值 1|2）
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
// Stage 9：cookie 解析（敏感，仅注入浏览器，绝不落盘报告原值）
function parseCookies9(raw) {
  const out = [];
  String(raw || "").split(";").forEach((part) => {
    const eq = part.indexOf("=");
    if (eq <= 0) return;
    const name = part.slice(0, eq).trim();
    let value = part.slice(eq + 1).trim();
    if (!name || !value) return;
    value = value.replace(/^"|"$/g, "");
    out.push({ name: name, value: value, domain: ".diy.zheliyin.com", path: "/", expires: -1 });
  });
  return out;
}

const URL = TARGET === "88" || TARGET === "1040459"
  ? "https://diy.zheliyin.com/diyWeb/third/1040459/5368967/999/thirdDiyAdd.do"
  : "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";

// Case 矩阵（STEP 5 规格：B=10°，C=30°，D=45°×0.5；A=0° 基准）
const CASE_DEFS = [
  { id: "A0", angle: 0, scale: 1 },
  { id: "B10", angle: 10, scale: 1 },
  { id: "C30", angle: 30, scale: 1 },
  { id: "D45s05", angle: 45, scale: 0.5 }
];

const SZ_ROWS = [
  { t: "大字标题实例文字", y: 30, s: 40 },
  { t: "中号正文联系电话与邮箱地址", y: 110, s: 20 },
  { t: "小字页脚版权备注行", y: 200, s: 12 }
];
const SZ_W = 1000, SZ_H = 300;

function injectUserscript() {
  let code = fs.readFileSync(USERSCRIPT_PATH, "utf8");
  ["stage-8a-1-ocr-overflow-rotation", "stage-8a-ocr-audit", "stage-8b-ocr-reconstruction-engine", "stage-8a-2-rotation-policy-geometry", "test", "demo"].forEach((b) => {
    if (b === BRANCH) return;
    code = code.split(b + "/extension/src/").join(BRANCH + "/extension/src/");
    code = code.replace(new RegExp(b.replace(/[-]/g, "\\-") + "\\/zheliyin-card-assistant\\.user\\.js", "g"), BRANCH + "/zheliyin-card-assistant.user.js");
  });
  return code;
}

// ---- Stage 8D：页面 world 注入通道（ZY_PAGE_WORLD=1）----
// 原因：清空 profile 后 ScriptCat 的 userScripts 注入通路失效（chrome.userScripts API 不可用），
// 安装成功但脚本不注入。自建通道：addInitScript 在页面 world 预注入
// [GM shim] + [@require 模块内联] + [userscript 主体]，与原沙箱（同作用域共享）语义一致。
// 差异诚实记录：GM_xmlhttpRequest→fetch（OCR 引擎 CDN 因 CORS 可下载；Baidu 云端因 CORS 不可用 → 自动走本地 OCR）。
const GM_SHIM_SOURCE = [
  "try{window.__ZY8D_PAGE_WORLD__=true;",
  "if(typeof window.GM_getValue==='undefined'){window.GM_getValue=function(k,d){try{var v=localStorage.getItem('zy8dshim:'+k);return v==null?d:JSON.parse(v);}catch(e){return d;}};}",
  "if(typeof window.GM_setValue==='undefined'){window.GM_setValue=function(k,v){try{localStorage.setItem('zy8dshim:'+k,JSON.stringify(v));}catch(e){}};window.GM_deleteValue=function(k){try{localStorage.removeItem('zy8dshim:'+k);}catch(e){}};}",
  "if(typeof window.GM_xmlhttpRequest==='undefined'){window.GM_xmlhttpRequest=function(o){var u=o.url||'',m=(o.method||'GET');fetch(u,{method:m,headers:(o.headers||{})}).then(function(res){return res.text().then(function(t){return {status:res.status,responseText:t,response:t,readyState:4,finalUrl:u};});}).then(function(r){if(o.onload)try{o.onload(r);}catch(e){};}).catch(function(e){if(o.onerror)try{o.onerror({status:0,error:String(e&&e.message||e)||'fetch-error',responseText:''});}catch(e2){};});return {abort:function(){}};};}",
  "if(typeof window.GM_addStyle==='undefined'){window.GM_addStyle=function(css){var el=document.createElement('style');el.textContent=css;(document.head||document.documentElement).appendChild(el);return el;};}",
  "if(typeof window.GM_addElement==='undefined'){window.GM_addElement=function(tag,attrs){var el=document.createElement(tag);for(var k in (attrs||{})){try{el[k]=attrs[k];}catch(e){}};(document.head||document.documentElement).appendChild(el);return el;};}",
  "if(typeof window.GM_setClipboard==='undefined'){window.GM_setClipboard=function(t){try{navigator.clipboard&&navigator.clipboard.writeText(String(t||''));}catch(e){}};}",
  "}catch(e){console.error('[zy8d-shim]',e);}"
].join("\n");

function pageWorldPayload() {
  const norm = injectUserscript(); // 已含分支归一（@require 指向 BRANCH）
  const parts = [GM_SHIM_SOURCE];
  const reqs = [...norm.matchAll(/\/\/ @require\s+(\S+)/g)].map((m) => m[1]);
  for (const u of reqs) {
    const mm = /\/extension\/src\/(.+)$/.exec(u);
    if (!mm) continue;
    const rel = mm[1].split("?")[0];
    const fp = path.join(ROOT, "extension", "src", rel);
    if (fs.existsSync(fp)) parts.push("// ==== @require " + rel + " ====\n" + fs.readFileSync(fp, "utf8"));
    else console.log("PAGE_WORLD missing module: " + rel);
  }
  parts.push(norm);
  return parts.join("\n;\n");
}

// runner 侧独立 compare（忠实复刻 text-fit.compareTextGeometry 阈值语义；页面世界无模块可直接引用）
function quadCenter(q) { let sx = 0, sy = 0; q.forEach((p) => { sx += p.x; sy += p.y; }); return { x: sx / q.length, y: sy / q.length }; }
function quadSize(q) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  return { width: (d(q[0], q[1]) + d(q[2], q[3])) / 2, height: (d(q[0], q[3]) + d(q[1], q[2])) / 2 };
}
function quadAngle(q) { return (Math.atan2(q[1].y - q[0].y, q[1].x - q[0].x) * 180) / Math.PI; }
function compareQuad(target, actual) {
  const centerTol = 2, widthTol = 3, heightTol = 3, angleTol = 0.5;
  const cT = quadCenter(target), cA = quadCenter(actual);
  const sT = quadSize(target), sA = quadSize(actual);
  const centerError = Math.hypot(cT.x - cA.x, cT.y - cA.y);
  const widthError = Math.abs(sT.width - sA.width);
  const heightError = Math.abs(sT.height - sA.height);
  const aT = quadAngle(target), aA = quadAngle(actual);
  const angleError = Math.abs(((aT - aA + 180) % 360 + 360) % 360 - 180);
  const failures = [];
  if (centerError > centerTol) failures.push("center");
  if (widthError > widthTol) failures.push("width");
  if (heightError > heightTol) failures.push("height");
  if (angleError > angleTol) failures.push("angle");
  return { pass: failures.length === 0, failures, centerError, widthError, heightError, angleError,
    target: { center: cT, size: sT, angle: aT }, actual: { center: cA, size: sA, angle: aA } };
}

(async () => {
  const out = { ts: new Date().toISOString(), stage: "STAGE-8B-STEP5", branch: BRANCH, url: URL, cases: [], errors: [] };
  let browser = null, page = null, opts = null;
  const ev = (fn, arg) => (arg === undefined ? page.evaluate(fn) : page.evaluate(fn, arg)).catch((e) => ({ err: String(e || "").slice(0, 200) }));
  const waitUntil = async (fnEval, desc, t0, poll) => { const t1 = Date.now(); while (Date.now() - t1 < t0) { const r = await ev(fnEval); if (r && r.ok) return { ok: true, ms: Date.now() - t1 }; await SLEEP(poll || 1500); } return { ok: false, desc }; };
  const canvasReady = () => () => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[0]) || null; return { ok: !!(d && d.canvas && typeof d.drawText === "function") }; };
  const render = () => ev((arg) => { const cv = document.createElement("canvas"); cv.width = arg.w; cv.height = arg.h; const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, arg.w, arg.h); ctx.fillStyle = "#000"; ctx.textBaseline = "top"; ctx.font = arg.weight + " " + arg.style + " " + arg.rows[0].s + "px " + arg.family; const lh = arg.lineHeight; (arg.rows || []).forEach((r) => { if (lh) ctx.lineHeight = lh; ctx.font = arg.weight + " " + arg.style + " " + r.s + "px " + arg.family; ctx.fillText(r.t, 30, r.y); }); return cv.toDataURL("image/png"); }, { w: SZ_W, h: SZ_H, rows: SZ_ROWS, family: (process.env.TEST_FONT_FAMILY || "SimHei, sans-serif"), weight: (process.env.TEST_FONT_WEIGHT || "normal"), style: (process.env.TEST_FONT_STYLE || "normal"), lineHeight: (process.env.TEST_LINE_HEIGHT ? Number(process.env.TEST_LINE_HEIGHT) : null) });
  // 背景图注入（含 scale/angle），并先清活动选择（确保 ocrPrepare 命中 background route）
  const setBg = (ci, dataUrl, tf) => ev((arg) => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[arg.ci]) || null; const c = d && d.canvas; if (!c) return { ok: false, reason: "no canvas" }; try { if (c.discardActiveObject) c.discardActiveObject(); } catch (e) {} const f = (c.constructor && c.constructor.fabric) || window.fabric; return new Promise((res) => { const im = new Image(); im.onload = () => { try { const bg = new f.Image(im); bg.set({ scaleX: arg.tf.scaleX || 1, scaleY: arg.tf.scaleY || 1, angle: arg.tf.angle || 0, left: 0, top: 0 }); c.setBackgroundImage(bg, () => { try { c.setCoords && c.setCoords(); if (c.requestRenderAll) c.requestRenderAll(); } catch (e) {} res({ ok: true, w: bg.width, h: bg.height, nw: im.naturalWidth, nh: im.naturalHeight, left: bg.left, top: bg.top, scaleX: bg.scaleX, scaleY: bg.scaleY, angle: bg.angle, ac: bg.aCoords ? { tl: [bg.aCoords.tl.x, bg.aCoords.tl.y], tr: [bg.aCoords.tr.x, bg.aCoords.tr.y], br: [bg.aCoords.br.x, bg.aCoords.br.y], bl: [bg.aCoords.bl.x, bg.aCoords.bl.y] } : null }); }); } catch (e) { res({ ok: false, reason: String(e && e.message || e).slice(0, 100) }); } }; im.onerror = () => res({ ok: false, reason: "onerror" }); im.src = arg.dataUrl; }); }, { ci, dataUrl, tf });
  // active/first route 注入：直接 canvas.add 普通图片对象（选中以命中 active-image；不选中命中 first-image）
  const injectImg = (ci, dataUrl, tf, opts) => ev((arg) => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[arg.ci]) || null; const c = d && d.canvas; if (!c) return { ok: false, reason: "no canvas" }; const f = (c.constructor && c.constructor.fabric) || window.fabric; return new Promise((res) => { const im = new Image(); im.onload = () => { try { const obj = new f.Image(im); obj.set({ left: arg.tf.left || 0, top: arg.tf.top || 0, scaleX: arg.tf.scaleX || 1, scaleY: arg.tf.scaleY || 1, angle: arg.tf.angle || 0 }); obj.multiUuid = arg.tag + Date.now(); c.add(obj); if (arg.selectOnAdd) { try { c.setActiveObject(obj); } catch (e) {} } if (d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr) d.canvasObjInfo.canvasToProductObjArr.push(obj); if (c.requestRenderAll) c.requestRenderAll(); res({ ok: true, left: obj.left, top: obj.top, scaleX: obj.scaleX, scaleY: obj.scaleY, angle: obj.angle, w: obj.width, h: obj.height, nw: im.naturalWidth, nh: im.naturalHeight }); } catch (e) { res({ ok: false, reason: String(e && e.message || e).slice(0, 100) }); } }; im.onerror = () => res({ ok: false, reason: "onerror" }); im.src = arg.dataUrl; }); }, { ci, dataUrl, tf, tag: opts && opts.tag, selectOnAdd: opts && opts.selectOnAdd });
  const bgSnap = () => ev(() => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0]; const c = d && d.canvas; if (!c) return null; try { c.setCoords && c.setCoords(); } catch (e) {} const bg = c.backgroundImage || null; let image = null; if (bg && String(bg.type) === "image") { const el = bg.getElement ? bg.getElement() : null; image = { naturalWidth: el ? el.naturalWidth : null, naturalHeight: el ? el.naturalHeight : null, width: bg.width, height: bg.height, scaleX: bg.scaleX, scaleY: bg.scaleY, left: bg.left, top: bg.top, angle: bg.angle, originX: bg.originX, originY: bg.originY, aCoords: bg.aCoords ? { tl: [bg.aCoords.tl.x, bg.aCoords.tl.y], tr: [bg.aCoords.tr.x, bg.aCoords.tr.y], br: [bg.aCoords.br.x, bg.aCoords.br.y], bl: [bg.aCoords.bl.x, bg.aCoords.bl.y] } : null }; }
    return { image, canvas: { width: c.width, height: c.height, viewportTransform: c.viewportTransform ? Array.from(c.viewportTransform) : null, zoom: c.getZoom ? c.getZoom() : null, retina: c.getRetinaScaling ? c.getRetinaScaling() : null }, diy: { currentFactWidth: d.currentFactWidth, currentFactHeight: d.currentFactHeight, currentSize: d.currentSize }, registry: d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr ? d.canvasObjInfo.canvasToProductObjArr.length : null }; });
  const clickOcr = () => ev(() => { const q = ["#zy-native-ocr-btn", "[data-zy-role=ocr]", ".zy-native-ocr-btn"]; for (const s of q) { const el = document.querySelector(s); if (el && el.offsetParent) { try { el.click(); return { clicked: true }; } catch (e) {} } } const all = Array.from(document.querySelectorAll("button,a,span,div")); for (const el of all) { if (!el.offsetParent) continue; if (String(el.textContent || "").trim().indexOf("识别当前图片") === 0) { try { el.click(); return { clicked: true }; } catch (e) {} } } return { clicked: false }; });
  const snapObjs = () => ev(() => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const c = vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas; return c ? c.getObjects().map((o) => o.uuid || o.multiUuid) : []; });
  // 读新建文字对象：全 aCoords quad + 业务字段
  const readNew = (ids) => ev((arg) => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0]; const c = d && d.canvas; if (!c) return { arr: [], canvas: null }; try { c.setCoords && c.setCoords(); } catch (e) {} const arr = []; c.getObjects().forEach((o) => { if (typeof o.text !== "string") return; const id = o.uuid || o.multiUuid; if (arg.ids && arg.ids.length && id != null && arg.ids.indexOf(id) < 0) return; if (!(String(o.zyOcrKey || "").indexOf("zy-ocr-") === 0 || o.zyOcrDiagnostics || o.zy8bTargetQuad || (arg.ids && arg.ids.length && id != null))) return; const ac = o.aCoords || null; const quad = ac && ac.tl ? [ac.tl, ac.tr, ac.br, ac.bl].map((p) => ({ x: p.x, y: p.y })) : null;
    // Stage 8D P6-1：对真实 Native 文本对象实例化 ink（像素级 alpha bbox；页面 world 的 __zy8dInk 由 @require inline 注入）
    let ink = null;
    if (window.__zy8dInk && typeof window.__zy8dInk.measureFabricObjectInk === "function") {
      try { ink = window.__zy8dInk.measureFabricObjectInk(o); } catch (eInk) { ink = { ok: false, reason: "RUNNER_ERR:" + String(eInk && eInk.message || eInk).slice(0, 60) }; }
    }
    arr.push({ id: id || null, text: String(o.text || "").slice(0, 14), zyOcrKey: o.zyOcrKey || null, left: o.left, top: o.top, width: o.width, height: o.height, scaleX: o.scaleX, scaleY: o.scaleY, fontSize: o.fontSize, angle: o.angle, originX: o.originX, quad: quad, ink: ink, fontFamily: typeof o.fontFamily === "string" ? o.fontFamily : null, fontWeight: o.fontWeight != null ? String(o.fontWeight) : null, fontStyle: o.fontStyle != null ? String(o.fontStyle) : null, lineHeight: (typeof o.lineHeight === "number") ? o.lineHeight : null, charSpacing: (typeof o.charSpacing === "number") ? o.charSpacing : null, biz: { locationX: o.locationX, locationY: o.locationY, locationWidth: o.locationWidth, locationHeight: o.locationHeight, locationRotation: o.locationRotation, loc: o.location ? { x: o.location.x, y: o.location.y, width: o.location.width, height: o.location.height, factWidth: o.location.factWidth, factHeight: o.location.factHeight, rotation: o.location.rotation } : null, pointSize: o.media && o.media.font ? o.media.font.pointSize : null } }); }); return { arr, canvas: { width: c.width, height: c.height, viewportTransform: c.viewportTransform ? Array.from(c.viewportTransform) : null, zoom: c.getZoom ? c.getZoom() : null, retina: c.getRetinaScaling ? c.getRetinaScaling() : null } }; }, { ids });
  const armHook = () => ev(() => {
    if (window.__b8capOn) { try { window.removeEventListener("message", window.__b8capOn); } catch (e) {} }
    window.__b8cap = { prep: [], msg: [], adjust: [], adjustResult: [], createResult: null };
    const on = (e) => {
      if (!e.data) return;
      try {
        if (e.data.source === "zy-card-assistant-page" && e.data.type === "ocrPrepareResult") window.__b8cap.prep.push({ geo: e.data.geometry || null, pageOk: !!(e.data.page && e.data.page.ok) });
        if (e.data.source === "zy-card-assistant" && e.data.type === "ocrCreate") window.__b8cap.msg.push({ items: (e.data.items || []).map((it) => ({ blockIndex: it.blockIndex, text: String(it.text || "").slice(0, 10), left: it.left, top: it.top, fontSize: it.fontSize, width: it.width, height: it.height, angle: it.angle, hasTargetQuad: !!it.zy8bTargetQuad, targetQuad: it.zy8bTargetQuad || null, usedFont: it.fontFamily || null, src: (it.diagnostics && it.diagnostics.ocrBBox8d) || null })) });
        if (e.data.source === "zy-card-assistant" && e.data.type === "ocrAdjust") window.__b8cap.adjust.push({ items: (e.data.items || []).map((a) => ({ blockIndex: a.blockIndex, corrections: a.corrections || null })) });
        if (e.data.source === "zy-card-assistant-page" && e.data.type === "ocrCreateResult") window.__b8cap.createResult = { ok: e.data.ok, detectedBlocks: e.data.detectedBlocks, createdCount: e.data.createdCount, created: (e.data.created || []).map((c) => ({ blockIndex: c.blockIndex, geometry: c.geometry || null, text: String(c.text || "").slice(0, 10) })) };
        if (e.data.source === "zy-card-assistant-page" && e.data.type === "ocrAdjustResult") window.__b8cap.adjustResult.push({ items: (e.data.items || []).map((r) => ({ blockIndex: r.blockIndex, ok: r.ok, error: r.error, geometry: r.geometry || null })) });
      } catch (e2) {}
    };
    window.addEventListener("message", on);
    window.__b8capOn = on;
    return { ok: true };
  });
  const readHook = () => ev(() => (window.__b8cap || { prep: [], msg: [], adjust: [], adjustResult: [], createResult: null }));
  const rollback = (tag) => ev((arg) => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); let removed = 0; (vo && vo.totalCanvasArray || []).forEach((d) => { const c = d && d.canvas; if (!c) return; const objs = c.getObjects().filter((o) => o && (String(o.multiUuid || "").indexOf(arg.tag) === 0 || String(o.zyOcrKey || "").indexOf("zy-ocr-") === 0)); objs.forEach((o) => { try { const li = d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr ? d.canvasObjInfo.canvasToProductObjArr.indexOf(o) : -1; if (li >= 0) d.canvasObjInfo.canvasToProductObjArr.splice(li, 1); c.remove(o); } catch (e) {} }); removed += objs.length; }); try { if (vo && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas && vo.totalCanvasArray[0].canvas.requestRenderAll) vo.totalCanvasArray[0].canvas.requestRenderAll(); } catch (e) {} return { ok: true, removed }; }, tag);

  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1440, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    page = browser.pages()[0];
    // Stage 9：注入 Native OCR 会话 Cookie（敏感，仅浏览器内存；报告只记录 cookie 名）
    if (STAGE9_COOKIE) {
      const cks = parseCookies9(STAGE9_COOKIE);
      await browser.addCookies(cks);
      out.stage9cookieNames = cks.map((c) => c.name);
    }
    out.console = [];
    out.consoleDiag = [];
    page.on("console", (m) => { const t = m.text(); if (/RAW_WORDS8D/.test(t)) { out.consoleLong = out.consoleLong || []; out.consoleLong.push(t.slice(0, 30000)); } if (/\[zy-ocr\]/.test(t)) out.console.push(t.slice(0, 400)); else if (/(error|uncaught|failed|syntax|reference|typeerror|is not a function|undefined is not)/i.test(t)) out.consoleDiag.push(t.slice(0, 500)); });
    page.on("pageerror", (e) => { const t = String(e && e.message || e); out.consoleDiag.push("PAGEERROR: " + t.slice(0, 500)); });
    const USE_PAGE_WORLD = process.env.ZY_PAGE_WORLD === "1";
    if (USE_PAGE_WORLD) {
      // Stage 8D：自建页面 world 注入（绕过 ScriptCat 注入链，详见 pageWorldPayload）
      // 先清 ScriptCat 旧脚本，避免与 page-world 注入的脚本共存；（旧实例无 8D 取证逻辑 → rawDump null）
      opts = page;
      await opts.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await SLEEP(1800);
      const allOld = await adapter.getAllScripts(opts) || [];
      for (const s of allOld.filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(opts, s.uuid); } catch (e) {} }
      // 注入改为编辑器就绪后单次 addScriptTag（不再 addInitScript 每次导航注入 → 避免多实例竞争/rawDump 被覆盖）
      out.injectMode = "page-world";
    } else {
      opts = page;
      await opts.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await SLEEP(2000);
      const all = await adapter.getAllScripts(opts);
      for (const s of (all || []).filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(opts, s.uuid); } catch (e) {} }
      await adapter.installByCode(opts, { uuid: "zheliyin-8b-step5-" + Date.now(), code: injectUserscript(), upsertBy: "user" });
      await SLEEP(8000);
      out.injectMode = "scriptcat";
    }
    if (BAIDU_AK && BAIDU_SK) { await ev((a) => { const ai = document.querySelector("#zy-baidu-ak-native") || document.querySelector("#zy-baidu-ak"); const si = document.querySelector("#zy-baidu-sk-native") || document.querySelector("#zy-baidu-sk"); const sb = document.querySelector("#zy-baidu-save-native") || document.querySelector("#zy-baidu-save"); if (!ai || !si || !sb) return { ok: false }; ai.value = a.ak; si.value = a.sk; try { sb.click(); } catch (e) {} return { ok: true }; }, { ak: BAIDU_AK, sk: BAIDU_SK }); await SLEEP(3000); }
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const w = await waitUntil(canvasReady(), "ready", 150000);
    if (!(w && w.ok)) throw new Error("editor not ready");
    if (USE_PAGE_WORLD) {
      // 编辑器就绪后单次注入（页面世界；脚本在页面加载完成后执行，行为等同 document-idle）
      // Stage 9 V3：Native Truth feature 开关（page-world GM shim 读 localStorage zy8dshim:*；值需 JSON 编码，shim 会 JSON.parse）
      if (STAGE9_NATIVE_TRUTH) {
        out.flagWrite = await ev(() => {
          const r = { e1: null, e2: null };
          try { localStorage.setItem("zy8dshim:zyStage9NativeTruth", JSON.stringify("1")); } catch (e) { r.e1 = String(e && e.message || e).slice(0, 120); }
          try { localStorage.setItem("zy8dshim:zyStage9NativeOcrMode", JSON.stringify("2")); } catch (e) { r.e2 = String(e && e.message || e).slice(0, 120); }
          r.raw2 = localStorage.getItem("zy8dshim:zyStage9NativeOcrMode");
          return r;
        });
        out.stage9nativeTruth = true;
        out.stage9nativeOcrMode = STAGE9_NATIVE_OCR_MODE;
      }
      await page.addScriptTag({ content: pageWorldPayload() });
      // 回读 GM shim 注入值（诊断 mode 是否真正送达 userscript）
      if (STAGE9_NATIVE_TRUTH) {
        out.modeReadback = await ev(() => { try { return { truth: window.GM_getValue ? window.GM_getValue("zyStage9NativeTruth", "0") : "(no-gm)", mode: window.GM_getValue ? window.GM_getValue("zyStage9NativeOcrMode", "1") : "(no-gm)" }; } catch (e) { return { err: String(e && e.message || e).slice(0, 120) }; } });
      }
      await SLEEP(2500);
    }
    await SLEEP(4000);
    const DU = await render();
    let dataUrl = typeof DU === "string" ? DU : DU.dataUrl;
    // ZY_BG_FILE：注入外部真实图片（如用户上传的名片）为背景图 —— 优先 background 路由验证
    const bgFile = process.env.ZY_BG_FILE;
    if (bgFile) {
      const fp = path.join(ROOT, bgFile);
      if (fs.existsSync(fp)) {
        dataUrl = "data:image/png;base64," + fs.readFileSync(fp).toString("base64");
        out.bgFile = fp;
        console.log("using real bg file: " + fp + " dataUrl " + dataUrl.length + " chars");
      } else { out.errors.push("ZY_BG_FILE missing: " + fp); }
    }

    const cases = process.env.ZY_CASES ? process.env.ZY_CASES.split(",") : CASE_DEFS.map((c) => c.id);
    const ROUTE = process.env.ZY_ROUTE || "background"; // background | active | first
    for (const cid of cases) {
      let def = CASE_DEFS.find((c) => c.id === cid) || { id: cid, angle: 0, scale: 1 };
      const parsed = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(cid);
      if (parsed) def = { id: cid, angle: parseFloat(parsed[1]), scale: parseFloat(parsed[2]) };
      const rec = { id: def.id, route: ROUTE, angle: def.angle, scale: def.scale, steps: [], rows: [], hook: null, created: null, compare: [], errors: [] };
      out.cases.push(rec);
      try {
        if (ROUTE === "background") {
          rec.imgInjected = await setBg(0, dataUrl, { angle: def.angle, scaleX: def.scale, scaleY: def.scale });
        } else {
          const injected = await injectImg(0, dataUrl, { left: 60, top: 60, angle: def.angle, scaleX: def.scale, scaleY: def.scale }, { tag: "b8r-", selectOnAdd: ROUTE === "active" });
          rec.imgInjected = injected;
        }
        await SLEEP(1500);
        const snap = await bgSnap();
        rec.imgSnap = snap;
        await armHook();
        rec.steps.push(await bgSnap());
        const before = await snapObjs();
        rec.beforeObjCount = (before || []).length;
        let cl = await clickOcr();
        for (let rt = 0; !cl.clicked && rt < 5; rt += 1) { await SLEEP(3000); cl = await clickOcr(); } // 首载慢导致按钮晚渲染 → 重试
        if (!cl.clicked) { rec.errors.push("ocr button"); continue; }
        let last = null, done = false;
        const t0 = Date.now();
        for (;;) {
          await SLEEP(900);
          const r = await ev(() => { const el = document.querySelector("#zy-native-status"); const st = el ? String(el.textContent || "").trim() : null; return { st: st ? st.slice(0, 220) : null }; });
          const st = r && r.st;
          if (st && st !== last) { last = st; rec.status = (rec.status || []).concat([st]); }
          if (st && /已生成 \d+ 个文字|几何校验完成|未识别到文字|失败|滚/.test(st)) { done = true; break; }
          if (Date.now() - t0 > 120000) break;
          await SLEEP(900);
        }
        rec.done = done;
        await SLEEP(2000); // 让闭环校正（ocrAdjust）异步完成
        // Stage 8D 取证：抓取 tesseract 原始输出（完整 words/lines），供 node 完整复现
        const rawD = await ev(() => { try { const v = window.__zy8dRaw; return v ? JSON.parse(v) : null; } catch (e) { return { __err: String(e).slice(0, 100) }; } }).catch((e) => ({ __err: String(e).slice(0, 100) }));
        if (rawD && (rawD.w || rawD.l)) rec.rawDump = rawD;
        rec.hook = await readHook();
        // 创建对象（keep zy-ocr keyed）+ 独立 compare vs expected targetQuad
        const after = await snapObjs();
        const ids = (after || []).filter((id) => (before || []).indexOf(id) < 0);
        const rd = await readNew(ids);
        rec.created = rd.arr || [];
        rec.canvasSnap = rd.canvas || null;
        // runner 侧独立 compare：expected = ocrCreate item.zy8bTargetQuad；actual = created quad
        const items = (rec.hook.msg && rec.hook.msg.length ? rec.hook.msg[0].items : []) || [];
        items.forEach((it) => {
          const created = rec.created.find((o) => (o.zyOcrKey || "").indexOf("zy-ocr-" + it.blockIndex) === 0);
          if (it.hasTargetQuad && created && created.quad) {
            const cmp = compareQuad(it.targetQuad, created.quad);
            rec.compare.push({ blockIndex: it.blockIndex, text: created.text, pass: cmp.pass, failures: cmp.failures, errors: { center: Math.round(cmp.centerError * 100) / 100, width: Math.round(cmp.widthError * 100) / 100, height: Math.round(cmp.heightError * 100) / 100, angle: Math.round(cmp.angleError * 100) / 100 }, expected: { center: cmp.target.center, size: cmp.target.size, angle: cmp.target.angle }, actual: { center: cmp.actual.center, size: cmp.actual.size, angle: cmp.actual.angle } });
          }
        });
        rec.passSummary = { blocks: rec.compare.length, pass: rec.compare.filter((c) => c.pass).length, fail: rec.compare.filter((c) => !c.pass).length };
        // Stage 8D P6-1：Source(OCR bbox)/Target(text-fit)/Actual(rendered ink) 三层对比，逐 block 汇总
        rec.inkRows = (items || []).map((it) => {
          const created = rec.created.find((o) => (o.zyOcrKey || "").indexOf("zy-ocr-" + it.blockIndex) === 0);
          const actual = (created && created.ink) || null;
          const source = it.src || null;
          const target = { width: it.width, height: it.height, fontSize: it.fontSize };
          return { blockIndex: it.blockIndex, text: created ? created.text : String(it.text || "").slice(0, 10), usedFont: created ? created.fontFamily : (it.usedFont || null), source: source, target: target, actual: actual ? { ok: actual.ok, inkWidth: actual.inkWidth, inkHeight: actual.inkHeight, fontUsed: actual.fontUsed, fontSize: actual.fontSize, lineCount: actual.lineCount, method: actual.method || null, reason: actual.reason || null } : null, diag: Ink.buildInkDiagnostics({ source: source, target: target, actual: actual }) };
        });
        rec.inkSummary = { rows: rec.inkRows.length, inkOk: rec.inkRows.filter((r) => r.actual && r.actual.ok).length, inkMissing: rec.inkRows.filter((r) => !r.actual || !r.actual.ok).length, widerThanTarget: rec.inkRows.filter((r) => r.diag.flags.indexOf("INK_WIDER_THAN_TARGET") >= 0).length };
        // Stage 8D P7：三视图 overlay（页面 world 真实 canvas 生成）—— raw=OCR words / filtered=归一化 lines / reconstructed=创建后主画布
        rec.overlay = await ev((arg) => {
          const req = window.requirejs || window.require;
          const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
          const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
          const c = d && d.canvas;
          const out = { w: arg.w, h: arg.h, views: {} };
          const W = 1024, H = Math.max(16, Math.round(W * (arg.h / arg.w)));
          const sx = W / arg.w, sy = H / arg.h;
          const bgEl = c && c.backgroundImage && c.backgroundImage.getElement ? c.backgroundImage.getElement() : null;
          const mk = () => { const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const ctx = cv.getContext("2d"); ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H); if (bgEl) { try { ctx.drawImage(bgEl, 0, 0, W, H); } catch (e) {} } return { cv: cv, ctx: ctx }; };
          const rectOf = (b) => { if (!b) return null; const x0 = (b.x0 != null) ? b.x0 : (b.x != null ? b.x : 0); const y0 = (b.y0 != null) ? b.y0 : (b.y != null ? b.y : 0); const x1 = (b.x1 != null) ? b.x1 : (b.x != null ? b.x + b.width : x0); const y1 = (b.y1 != null) ? b.y1 : (b.y != null ? b.y + b.height : y0); return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) }; };
          try {
            if (arg.rawDump && Array.isArray(arg.rawDump.w) && arg.rawDump.w.length) {
              const { cv, ctx } = mk();
              ctx.strokeStyle = "#16a34a"; ctx.lineWidth = 1; ctx.fillStyle = "#14532d"; ctx.font = "bold 10px sans-serif";
              arg.rawDump.w.forEach((wd, i) => { const r = rectOf(wd.bbox || {}); if (!r) return; ctx.strokeRect(r.x * sx, r.y * sy, r.w * sx, r.h * sy); ctx.fillText(String(i), r.x * sx, Math.max(8, r.y * sy - 2)); });
              out.views.raw = cv.toDataURL("image/png"); out.rawWords = arg.rawDump.w.length;
            }
            try {
              if (typeof groupWordsToLines === "function" && typeof unifyCandidates === "function" && arg.rawDump && Array.isArray(arg.rawDump.w)) {
                const cands = unifyCandidates(arg.rawDump.w, arg.rawDump.size);
                const lines = groupWordsToLines(cands, {});
                const { cv, ctx } = mk();
                ctx.strokeStyle = "#2563eb"; ctx.lineWidth = 1.5; ctx.fillStyle = "#1e3a8a"; ctx.font = "bold 12px sans-serif";
                (lines || []).forEach((ln, i) => { const r = rectOf(ln.bbox || {}); if (!r) return; ctx.strokeRect(r.x * sx, r.y * sy, r.w * sx, r.h * sy); ctx.fillText(String(i), r.x * sx, Math.max(10, r.y * sy - 3)); });
                out.views.filtered = cv.toDataURL("image/png"); out.filteredLines = (lines || []).length;
              }
            } catch (eF) { out.errFiltered = String(eF && eF.message || eF).slice(0, 120); }
            if (c && typeof c.toDataURL === "function") {
              try { if (c.discardActiveObject) c.discardActiveObject(); } catch (e) {}
              try { c.setCoords && c.setCoords(); if (c.requestRenderAll) c.requestRenderAll(); } catch (e) {}
              try { out.views.reconstructed = c.toDataURL({ format: "png", multiplier: 1 }); } catch (e4) { try { out.views.reconstructed = c.toDataURL("png"); } catch (e5) {} }
            }
          } catch (e) { out.err = String(e && e.message || e).slice(0, 160); }
          return out;
        }, { rawDump: rec.rawDump || null, w: 895, h: 577 });
        const rb = await rollback("b8r-"); // b8r- 前缀：同时清理每 case 注入的图片对象 + OCR 文字（防 active/first 路由图片累积）
        rec.rollback = rb;
        // 清背景图
        await ev(() => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const c = vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas; if (c) { try { c.setBackgroundImage(null); if (c.requestRenderAll) c.requestRenderAll(); } catch (e) {} } return { ok: true }; });
        await SLEEP(1500);
      } catch (e) { rec.errors.push(String(e && e.message || e).slice(0, 300)); }
    }
  } catch (e) { out.errors.push(String(e && e.message || e).slice(0, 400)); }
  finally { try { page && await page.close(); } catch (e) {} try { browser && await browser.close(); } catch (e) {} }
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const name = process.env.ZY_OUT || ("background-image-audit-" + (process.env.ZY_CASES || "A0,B10,C30,D45s05").replace(/[,\/]/g, "-") + ".json"); // ZY_OUT：短输出名（规避超长路径 MAX_PATH）
  fs.writeFileSync(path.join(REPORT_DIR, name), JSON.stringify(out, null, 2));
  console.log("STAGE-8B STEP5 done cases=" + out.cases.length + " errors=" + out.errors.length + " -> " + path.join(REPORT_DIR, name));
  console.log("summary: " + out.cases.map((c) => c.id + "=" + (c.passSummary ? (c.passSummary.pass + "/" + c.passSummary.blocks) : "n/a")).join(" "));
})();