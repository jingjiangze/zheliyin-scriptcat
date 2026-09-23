// runtime/stage9/commit-46-real.js — Commit 4.6：OCR Visual Geometry / Typography / Color 真机 A/B 对照
// ---------------------------------------------------------------------
// 目标验证（任务书 §18/§19）：
//   1. 整体左移是否消失（ocrBBox.left vs visualInkBox.left vs targetQuad.left vs 实际渲染 ink）
//   2. 异常大字（如“服务热线”）是否恢复合理字号（inkHeight 污染判定：fontEvidence.status）
//   3. 同一组文字字号差异是否缩小（per-line median / advance 交叉校验）
//   4. 颜色是否来自同一 visual region（visualGeometrySource 与 fillGate 一致性）
// A/B 对照：
//   A = 旧 OCR bbox geometry（注入 vbBox=null 强制 OCR_BBOX_FALLBACK）
//   B = Visual Ink geometry（默认：IMAGE_INK 优先，仅可信时切换）
// 凭据：ZY_STAGE9_COOKIE / ZY_BAIDU_AK / ZY_BAIDU_SK（仅运行时）
// 报告：runtime/reports/stage-9/commit-46c-template-real.json + per-case（cookie 只记名）
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
const { createBaiduProvider } = require(path.join(ROOT, "extension", "src", "ocr", "baidu-provider.js"));
const adapter = require("../scriptcat-adapter");
const probeMod = require("./session-probe");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const CARD = process.env.ZY_BG_FILE || path.join(ROOT, "runtime", "stage8b", "assets", "real-card-xiazhu.png");
const BAIDU_AK = process.env.ZY_BAIDU_AK || "";
const BAIDU_SK = process.env.ZY_BAIDU_SK || "";
const WHITELIST = (process.env.ZY_CASE || "").split(",").map((s) => s.trim()).filter(Boolean);
const DROP_PREFIX = process.env.ZY_DROP || "";
const ROT_ANGLE = Number(process.env.ZY_IMG_ANGLE || 0);
const AB_MODE = (process.env.ZY_AB || "").split(",").map((s) => s.trim()).filter(Boolean);
const DIAG_KEY = process.env.ZY_DIAG_KEY || "__zyStage9VisualDiag";
const TIMELINE_ENABLED = process.env.ZY_TIMELINE === "1";
const CASE_DEFS = [
  { id: "V0", sidecar: "0", note: "直排名片复检：ocrBBox vs visualInk vs targetQuad vs 实际 ink 的 dx/dy" },
  { id: "V15", sidecar: "0", rot: 15, note: "旋转 15°：visual bbox 四角 affine → targetQuad，位置/字号/颜色同源" },
  { id: "V45", sidecar: "0", rot: 45, note: "旋转 45°：验证旋转下 visual geometry 映射不回归" }
];
const DECIMAL = (v, n) => (v != null && isFinite(v)) ? Math.round(v * Math.pow(10, n || 2)) / Math.pow(10, n || 2) : null;

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
const GM_SHIM_SOURCE = [
  "try{window.__ZY8D_PAGE_WORLD__=true;",
  "if(typeof window.GM_getValue==='undefined'){window.GM_getValue=function(k,d){try{var v=localStorage.getItem('zy8dshim:'+k);return v==null?d:JSON.parse(v);}catch(e){return d;}};}",
  "if(typeof window.GM_setValue==='undefined'){window.GM_setValue=function(k,v){try{localStorage.setItem('zy8dshim:'+k,JSON.stringify(v));}catch(e){}};window.GM_deleteValue=function(k){try{localStorage.removeItem('zy8dshim:'+k);}catch(e){}};}",
  "if(typeof window.GM_xmlhttpRequest==='undefined'){window.GM_xmlhttpRequest=function(o){var u=o.url||'',m=(o.method||'GET');fetch(u,{method:m,headers:(o.headers||{})}).then(function(res){return res.text().then(function(t){return {status:res.status,responseText:t,response:t,readyState:4,finalUrl:u};});}).then(function(r){if(o.onload)try{o.onload(r);}catch(e){};}).catch(function(e){if(o.onerror)try{o.onerror({status:0,error:String(e&&e.message||e)||'fetch-error',responseText:''});}catch(e2){};});return {abort:function(){}};};}",
  "if(typeof window.GM_addStyle==='undefined'){window.GM_addStyle=function(css){var el=document.createElement('style');el.textContent=css;(document.head||document.documentElement).appendChild(el);return el;};}",
  "if(typeof window.GM_addElement==='undefined'){window.GM_addElement=function(tag,attrs){var el=document.createElement(tag);for(var k in (attrs||{})){try{el[k]=attrs[k];}catch(e){}};(document.head||document.documentElement).appendChild(el);return el;};}",
  "}catch(e){console.error('[zy8d-shim]',e);}"
].join("\n");

function injectUserscript(ab) {
  let code = fs.readFileSync(USERSCRIPT_PATH, "utf8");
  ["stage-8a-1-ocr-overflow-rotation", "stage-8a-ocr-audit", "stage-8b-ocr-reconstruction-engine", "stage-8a-2-rotation-policy-geometry", "stage-8d-ocr-quality-reconstruction", "test", "demo"].forEach((b) => {
    code = code.split(b + "/extension/src/").join("stage-9-altq-baidu-reconstruction/extension/src/");
    code = code.replace(new RegExp(b.replace(/[-]/g, "\\-") + "\\/zheliyin-card-assistant\\.user\\.js", "g"), "stage-9-altq-baidu-reconstruction/zheliyin-card-assistant.user.js");
  });
  // Commit 4.6 A/B 对照：A 模式强制 vbBox=null（OCR_BBOX_FALLBACK），B 模式保留默认（IMAGE_INK 优先）
  if (ab === "A") {
    // Commit A：vbBox 直写位置已移除；A/B-A 改为强制墨迹位置接管关闭（与 B 默认一致，均可再注入 zyStage9InkGeometry=1 复审）
    const ANCH = "const STAGE9_INK_GEOMETRY = GM_getValue(\"zyStage9InkGeometry\", \"0\") === \"1\";";
    if (code.indexOf(ANCH) >= 0) {
      code = code.split(ANCH).join("const STAGE9_INK_GEOMETRY = false; // A/B-A: 强制墨迹位置接管关闭");
      injectUserscript.patched = true;
    }
  }
  return code;
}
function conditionCode(cond, ab) {
  let code = injectUserscript(ab);
  // 容错 repl（test vs demo 对照）：锚点缺失（demo 0.3.11.49 无 localSidecar/inkGeometry 等）时跳过并告警，不抛错。
  // test 分支自身锚点齐全，行为不变；demo 分支按 demo 自身语义运行（缺的配置不替换）。
  const repl = (o, n) => { if (code.indexOf(o) < 0) { console.warn("[conditionCode] anchor missing (skip): " + o.slice(0, 60)); return; } code = code.split(o).join(n); };
  repl('GM_getValue("zyBaiduOcrMode", "standard")', JSON.stringify("standard"));
  repl('GM_getValue("zyStage9NativeOcrMode", "2")', JSON.stringify("2"));
  repl('GM_getValue("zyStage9NativeTruth", "1") === "1"', "true");
  repl('GM_getValue("zyStage9LocalSidecar", "0") === "1"', cond.local ? "true" : "false");
  repl('GM_getValue("zyOcrMode", "auto")', JSON.stringify("baidu"));
  repl('res = await provider.recognize(img.dataUrl, { imageWidth: img.width, imageHeight: img.height, mode: BAIDU_OCR_MODE });', 'res = (window.__zyBaiduExternal && window.__zyBaiduExternal.res) ? window.__zyBaiduExternal.res : { error: { errorCode: "EXTERNAL_BAIDU_MISSING", errorMessage: "external baidu not injected" } };');
  repl('document.addEventListener("DOMContentLoaded", initZheliyin);', '(function(){ if (document.body) { initZheliyin(); } else { document.addEventListener("DOMContentLoaded", function(){ initZheliyin(); }); } })();');
  return code;
}
function selfTest() {
  const t = (n, c) => { if (!c) throw new Error("SELFTEST FAIL " + n); console.log("[selftest] PASS " + n); };
  t("cases-3", CASE_DEFS.length === 3 && CASE_DEFS.map((c) => c.id).join() === "V0,V15,V45");
  t("ab-patch-A", injectUserscript("A").indexOf("STAGE9_INK_GEOMETRY = false;") >= 0);
  t("ab-patch-B", injectUserscript("B").indexOf("STAGE9_INK_GEOMETRY = false;") < 0);
  t("code-anchor", conditionCode({ local: false }, "B").indexOf("NATIVE_ANCHOR") >= 0);
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }
if (!BAIDU_AK || !BAIDU_SK) { console.error("[commit-46c-template] 缺少凭据 env（baidu ak/sk）"); process.exit(2); }
function pageWorldPayloadFor(cond, ab) {
  const parts = [GM_SHIM_SOURCE];
  const norm = conditionCode(cond, ab);
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
const BAIDU_CACHE = process.env.ZY_BAIDU_CACHE || "";
async function baiduRecognizeExternal(dataUrl, mode) {
  // 同 OCR 输入对照：ZY_BAIDU_CACHE 指向缓存文件（存在即用；否则识别后写入）
  // 用于 test vs demo 公平对比 —— 消除云端 OCR 跨轮行分割/bbox 随机差异。
  if (BAIDU_CACHE && fs.existsSync(BAIDU_CACHE)) {
    try { return JSON.parse(fs.readFileSync(BAIDU_CACHE, "utf8")); } catch (e) { /* fallthrough */ }
  }
  const provider = createBaiduProvider({
    getConfig: () => ({ apiKey: BAIDU_AK, secretKey: BAIDU_SK }),
    http: { request: async (m, u, o) => { const res = await fetch(u, { method: m, headers: o.headers || {}, body: o.body, signal: AbortSignal.timeout(o.timeout || 30000) }); return { status: res.status, responseText: await res.text() }; } },
    storage: { get: () => "", set: () => {} },
    resizeImage: null
  });
  const res = await provider.recognize(dataUrl, { imageWidth: null, imageHeight: null, mode }).catch((e) => ({ error: { errorCode: "EXCEPTION", errorMessage: String(e && e.message || e) } }));
  if (BAIDU_CACHE && res && !res.error && Array.isArray(res.candidates) && res.candidates.length) {
    try { fs.writeFileSync(BAIDU_CACHE, JSON.stringify(res), "utf8"); console.log("[baidu-cache] written -> " + BAIDU_CACHE); } catch (e) {}
  }
  return res;
}
(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const sessCookie = await probeMod.resolveStage9Cookie();
  const COOKIE_RAW = sessCookie.raw || "";
  if (!COOKIE_RAW) { console.error("[commit-46c-template] 会话 cookie 解析失败：" + (sessCookie.error || "NO_COOKIE") + "（已尝试 显式 env → 自动抓取 OCRTool.do；请注入 ZY_STAGE9_COOKIE 或确保持久 profile 已登录）"); process.exit(2); }
  const out = { ts: new Date().toISOString(), stage: "OCR-P1-COMMIT4_6C-TEMPLATE-REAL", cases: CASE_DEFS, image: path.basename(CARD), cookiePresent: !!COOKIE_RAW, cookieSource: sessCookie.source || null, cookieWarning: sessCookie.warning || null, cookieNote: sessCookie.note || null, abModes: AB_MODE.length ? AB_MODE : ["B"], runs: [], errors: [] };
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1280, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    let page = browser.pages()[0];
    const onPageErr = (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 200)); };
    page.on("pageerror", onPageErr);
    try {
      await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await SLEEP(1400);
      const allOld = await adapter.getAllScripts(page) || [];
      for (const s of allOld.filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(page, s.uuid); } catch (e) {} }
      out.errors = out.errors.filter((x) => x.indexOf("PAGEERROR") < 0);
      console.log("[commit-46c-template] scriptcat cleaned");
    } catch (eClean) { out.errors.push("CLEAN: " + String(eClean && eClean.message || eClean).slice(0, 120)); }
    for (const c of parseCookies(COOKIE_RAW)) { try { await browser.addCookies([c]); } catch (e) { out.errors.push("COOKIE:" + c.name + " " + String(e && e.message || e).slice(0, 100)); } }
    const newRunPage = async (payload) => {
      await page.close().catch(() => {});
      page = await browser.newPage();
      page.on("pageerror", onPageErr);
      await page.addInitScript(({ code }) => { const s = document.createElement("script"); s.textContent = code; const root = document.documentElement || document.head || document.body || document; root.appendChild(s); }, { code: payload });
      return page;
    };
    const bridgeCall = (type, payload, replyType, timeoutMs) => page.evaluate((arg) => new Promise((resolve) => {
      let done = false;
      const on = (ev) => { const d = ev.data; if (d && d.source === "zy-card-assistant-page" && d.type === arg.replyType) { window.removeEventListener("message", on); done = true; resolve(d); } };
      window.addEventListener("message", on);
      setTimeout(() => { if (!done) { window.removeEventListener("message", on); resolve({ skip: true, timeout: arg.timeoutMs }); } }, arg.timeoutMs);
      window.postMessage(Object.assign({ source: "zy-card-assistant", type: arg.type }, arg.payload || {}), location.origin);
    }), { type, payload, replyType, timeoutMs: timeoutMs || 12000 });
    const setGm = async (local) => page.evaluate((a) => {
      const set = (k, v) => { try { localStorage.setItem("zy8dshim:" + k, JSON.stringify(v)); } catch (e) {} };
      set("zyBaiduOcrMode", "standard");
      set("zyStage9NativeOcrMode", "2");
      set("zyStage9NativeTruth", "1");
      set("zyStage9LocalSidecar", a.local ? "1" : "0");
      set("zyOcrMode", "baidu");
      set("zyStage9InkGeometry", "0"); // Commit A：墨迹位置接管默认关（B 亦回退 OCR bbox；如需复审接管可注入 "1"）
      set("zyCalibrate8B", a.calibrate ? "1" : "0"); // Commit C bisect: calibration on/off
      return true;
    }, { local, calibrate: process.env.ZY_NO_CALIBRATE !== "1" });
    const injectPageWorld = (payload) => page.evaluate((code) => { const s = document.createElement("script"); s.textContent = code; (document.head || document.documentElement).appendChild(s); }, payload);
    const waitEditorReady = async (tries) => {
      for (let i = 0; i < (tries || 16); i += 1) {
        const r = await page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed), bver: (window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.ver) || window.__ZY_BRIDGE_VERSION__ || null })).catch(() => ({}));
        if (r && r.ok && r.bridge) return r;
        await SLEEP(1200);
      }
      return page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed), bver: (window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.ver) || window.__ZY_BRIDGE_VERSION__ || null })).catch(() => ({}));
    };
    const setBg = (angleDeg) => page.evaluate((arg) => new Promise((res) => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
      const c = d && d.canvas;
      if (!c) return res({ ok: false, reason: "no-canvas" });
      const f = (c.constructor && c.constructor.fabric) || window.fabric;
      const im = new Image();
      im.onload = () => { try { const bg = new f.Image(im); var cw = c.getWidth && c.getWidth() ? c.getWidth() : (c.width || 0); var chh = c.getHeight && c.getHeight() ? c.getHeight() : (c.height || 0); bg.set({ left: 0, top: 0, scaleX: cw && im.naturalWidth ? cw / im.naturalWidth : 1, scaleY: chh && im.naturalHeight ? chh / im.naturalHeight : 1 }); c.setBackgroundImage(bg, () => { try { if (arg.angle) bg.set({ angle: arg.angle }); if (c.requestRenderAll) c.requestRenderAll(); } catch (e) {} res({ ok: true }); }); } catch (e) { res({ ok: false, reason: String(e && e.message || e).slice(0, 100) }); } };
      im.onerror = () => res({ ok: false, reason: "img-fail" });
      im.src = arg.dataUrl;
    }), { dataUrl: "data:image/png;base64," + fs.readFileSync(CARD).toString("base64"), angle: angleDeg || 0 });
    const clickOcr = async (timeoutMs) => {
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
    const waitOcrDone = async (timeoutMs) => {
      const t0 = Date.now();
      const samples = [];
      while (Date.now() - t0 < timeoutMs) {
        const r = await page.evaluate(() => {
          const el = document.querySelector("#zy-native-status") || document.querySelector("#zy-status") || document.querySelector(".zy-status");
          return { st: el ? String(el.textContent || "").trim().slice(0, 200) : null };
        }).catch(() => ({}));
        const st = r && r.st;
        if (st) samples.push(String(st).slice(0, 200));
        if (st && /已生成 \d+ 个文字|已校准 \d+ 个文字|追加完成|几何校验完成|已处理 \d+ 个文字图层|识别完成|未识别到文字|未生成文字|未找到可识别的图片|本批不进入创建|无法确定当前图片所属页面|OCR 目标已失效|无有效块|未通过质量检查|阻断|失败|异常|即将创建|文字不创建|缺失 \d+ 行/.test(st)) return { done: true, st, samples };
        await SLEEP(900);
      }
      return { done: false, samples };
    };
    const readVisualDiag = () => page.evaluate((dk) => (window[dk] || []).slice(), DIAG_KEY);
    const readActualInk = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const c = vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas;
      if (!c) return [];
      const out = [];
      c.getObjects().forEach((o) => {
        if (typeof o.text !== "string") return;
        let ink = null;
        try { if (window.__zy8dInk && typeof window.__zy8dInk.measureFabricObjectInk === "function") ink = window.__zy8dInk.measureFabricObjectInk(o); } catch (e) {}
        let quad = null;
        try {
          const vt = (typeof c.viewportTransform === "function") ? c.viewportTransform() : (c.viewportTransform || null);
          const acTL = (o.aCoords && o.aCoords.tl && typeof o.aCoords.tl.x === "number") ? { x: Math.round(o.aCoords.tl.x * 100) / 100, y: Math.round(o.aCoords.tl.y * 100) / 100 } : null;
          let entry = null;
          try { entry = o.zyOcrEntry || null; } catch (eX) {}
          let entR = null;
          try { entR = { zyOcrKey: o.zyOcrKey || null, byAssistant: !!o.zyCreatedByAssistant }; } catch (eZ) {}
          out.push({ text: String(o.text || "").slice(0, 24), left: DEC2(o.left), top: DEC2(o.top), angle: DEC2(o.angle), originX: o.originX || null, scaleX: DEC2(o.scaleX), scaleY: DEC2(o.scaleY), fontSize: DEC2(o.fontSize), fill: (o.fill != null ? String(o.fill).slice(0, 40) : null), padding: DEC2(o.padding), paddingLeft: DEC2(o.paddingLeft), charSpacing: DEC2(o.charSpacing), textAlign: o.textAlign || null, strokeWidth: DEC2(o.strokeWidth), width: DEC2(o.width), aCoordsTL: acTL, entry: entry, identity: entR, viewport: vt ? [DEC2(vt[4]), DEC2(vt[5])] : null, ink: ink && ink.ok ? { inkWidth: DEC2(ink.inkWidth), inkHeight: DEC2(ink.inkHeight) } : null, cached: false });
        } catch (e) {}
      });
      function DEC2(v) { return (v != null && isFinite(v)) ? Math.round(v * 100) / 100 : null; }
      return out;
    });
    const rollback = () => page.evaluate(() => {
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
    // Stage 10-D Commit C：模板套版模式（Template First）验收 —— 注入真实文字槽位 → FULL_REAL_PIPELINE → 5 次稳定性
    // 断言：对象数=槽位数（不新建/删除）、layerNum 对应不变、left/top/width/height/angle/fontSize/fontFamily/fill 冻结，
    //       text 从占位变为客户内容；R0 空槽 → 重建模式（NEW_RECOGNITION）与 commit-46-real 行为一致。
    const TPL_CASES = [
      { id: "T0", slots: 5, note: "模板模式：注入 5 文字槽位 × 5 次识别稳定性（Template First，只改 text）" },
      { id: "R0", slots: 0, note: "重建回归：空槽（无文字层）→ NEW_RECOGNITION 重建行为不变" }
    ];
    for (const def of TPL_CASES) {
      if (WHITELIST.length && WHITELIST.indexOf(def.id) < 0) continue;
      const rec = { case: def.id, note: def.note, steps: [], errors: [], runs: [], asserts: [], status: null };
      out.runs.push(rec);
      try {
        await setGm(false);
        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => rec.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
        await SLEEP(2500);
        await injectPageWorld(pageWorldPayloadFor({ local: false }, "B"));
        await SLEEP(1400);
        await page.evaluate((dk) => { try { window[dk] = []; } catch (e) {} }, DIAG_KEY);
        let ready = await waitEditorReady(20);
        if (!(ready && ready.ok)) { rec.errors.push("EDITOR_UNAVAILABLE"); continue; }
        rec.steps.push({ step: "editor-ready", bver: (ready && ready.bver) || null });
        if (ready && ready.bver && ready.bver !== "0.3.11.63") rec.errors.push("BRIDGE_VERSION_MISMATCH(" + String(ready.bver).slice(0, 40) + ") — 期望 0.3.11.63");
        const cp = await bridgeCall("getCurrentPage", {}, "getCurrentPageResult", 6000).catch(() => null);
        rec.pageId = (cp && cp.pageId) || null;
        const bg = await setBg(0);
        if (!(bg && bg.ok)) { rec.errors.push("BG_INJECT_FAIL"); continue; }
        const prep = await bridgeCall("ocrPrepare", {}, "ocrPrepareResult", 15000).catch(() => null);
        if (!(prep && prep.ok && prep.dataUrl)) { rec.errors.push("OCR_PREPARE_FAIL"); continue; }
        const extRes = await baiduRecognizeExternal(prep.dataUrl, "standard");
        if (!extRes || extRes.error) { rec.errors.push("BAIDU_EXTERNAL_FAIL"); continue; }
        const extCands = (Array.isArray(extRes.candidates) ? extRes.candidates : []).slice();
        rec.baiduCount = extCands.length;
        await page.evaluate((r) => { try { window.__zyBaiduExternal = { res: r }; } catch (e) {} }, Object.assign({}, extRes, { candidates: extCands }));
        // --- T0：注入模板槽位（真实媒体对象，drawText；与 getTextInventory 同遍历同序）---
        let slotBase = [];
        if (def.slots > 0) {
          const inj = await page.evaluate(() => {
            const req2 = window.requirejs || window.require;
            const vo2 = ((req2 && req2.s && req2.s.contexts && req2.s.contexts._ && req2.s.contexts._.defined && req2.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
            const d2 = vo2 && vo2.totalCanvasArray && vo2.totalCanvasArray[0];
            if (!d2 || !d2.canvas || !d2.canvasObjInfo || typeof d2.drawText !== "function") return { ok: false, reason: "NO_CANVASDIY" };
            const baseLayer2 = (d2.canvasObjInfo.canvasToProductObjArr || []).length;
            const SLOTS = [
              { text: "占位姓名", left: 100, top: 30, width: 200, height: 40, fontSize: 18, fontFamily: "思源黑体 Regular" },
              { text: "占位职位", left: 100, top: 80, width: 200, height: 40, fontSize: 24, fontFamily: "思源黑体 Bold" },
              { text: "占位公司", left: 100, top: 130, width: 260, height: 40, fontSize: 14, fontFamily: "方正黑体简体" },
              { text: "占位电话", left: 100, top: 180, width: 160, height: 40, fontSize: 15, fontFamily: "思源黑体 Regular" },
              { text: "占位邮箱", left: 100, top: 230, width: 220, height: 40, fontSize: 12, fontFamily: "思源黑体 Regular" }
            ];
            let made = 0;
            const errs = [];
            SLOTS.forEach(function (s, i) {
              try {
                const entry = { "media": { "mediaType": "text", "text": s.text, "font": { "pointSize": s.fontSize, "fontColor": "#000000", "isHorizontal": 1, "gravity": "left", "id": String(600 + i), "isItalic": 0, "textDecoration": "", "linethrough": 0, "overline": 0, "isBold": 0, "overprintStroke": 0 }, "charSpace": 0, "lineSpace": 1.2, "lineIdType": 0, "isBG": 0, "imgPath": "" }, "location": { "x": s.left, "y": s.top, "width": s.width, "height": s.height, "factWidth": s.width, "factHeight": s.height, "rotation": 0 }, "printLocation": { "x": s.left, "y": s.top, "width": s.width, "height": s.height, "rotation": 0 }, "layer": { "alpha": 1 }, "layerNum": baseLayer2 + i, "isEdit": 1, "isDisplay": 0, "deleteState": 0, "visitLevel": 1, "multiUuid": "tpl-" + String(101 + i), "markuuid": "", "topEnable": 1, "resourceType": 0, "maskEnable": 0, "lowPixelFlag": 0, "selectEnabled": 1, "isDesign": 1, "isComposite": 0, "isPreview": 0, "isDesignShape": 0 };
                d2.drawText(s.text, null, null, null, entry, baseLayer2 + i);
                made += 1;
              } catch (e) { errs.push(String(i) + ":" + String(e && e.message || e).slice(0, 90)); }
            });
            try { d2.canvas.requestRenderAll(); } catch (e) {}
            return { ok: made === SLOTS.length, made: made, total: SLOTS.length, errs: errs };
          }).catch((e) => ({ ok: false, reason: String(e && e.message || e).slice(0, 100) }));
          if (!(inj && inj.ok)) { rec.errors.push("SLOT_INJECT_FAIL " + JSON.stringify(inj)); continue; }
          rec.slotInjected = inj;
          await SLEEP(1400);
          slotBase = await page.evaluate(() => {
            const req3 = window.requirejs || window.require;
            const vo3 = ((req3 && req3.s && req3.s.contexts && req3.s.contexts._ && req3.s.contexts._.defined && req3.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
            const c3 = vo3 && vo3.totalCanvasArray && vo3.totalCanvasArray[0] && vo3.totalCanvasArray[0].canvas;
            if (!c3) return [];
            return c3.getObjects().filter(function (o) { return typeof o.text === "string"; }).map(function (o) { return { text: String(o.text || ""), multiUuid: o.multiUuid != null ? String(o.multiUuid) : null, markuuid: o.markuuid != null ? String(o.markuuid) : null, layerNum: typeof o.layerNum === "number" ? o.layerNum : null, left: o.left, top: o.top, width: o.width, height: o.height, angle: o.angle, fontSize: o.fontSize, fontFamily: o.fontFamily != null ? String(o.fontFamily) : null, fill: o.fill != null ? String(o.fill) : null }; });
          }).catch(() => []);
          rec.slotBase = slotBase;
          rec.steps.push({ step: "slot-inject", ok: slotBase.length > 0, count: slotBase.length });
        }
        // --- 5 次 FULL_PIPELINE 识别 ---
        for (let rnd = 1; rnd <= 5; rnd += 1) {
          const runRec = { rnd: rnd, status: null };
          rec.runs.push(runRec);
          const cl = await clickOcr();
          if (!(cl && cl.clicked)) { runRec.error = "OCR_BTN_NOT_FOUND"; continue; }
          const doneW = await waitOcrDone(360000);
          runRec.status = doneW.st || null;
          await SLEEP(1600);
          const now = await readActualInk();
          const invNow = await bridgeCall("getTextInventory", {}, "getTextInventoryResult", 6000).catch(() => null);
          runRec.inventoryCount = (invNow && invNow.ok && Array.isArray(invNow.items)) ? invNow.items.length : -1;
          runRec.actual = now.map(function (o) { return { text: o.text, left: o.left, top: o.top, fontSize: o.fontSize, fill: o.fill, layerNum: o.layerNum }; });
          if (!def.slots) { runRec.reconstruction = true; continue; } // R0 只记录
          // T0 模板断言
          const fails = [];
          const nList = now.slice();
          if (nList.length !== slotBase.length) fails.push("COUNT " + slotBase.length + "->" + nList.length + "（不应新建/删除对象）");
          for (let si = 0; si < Math.min(slotBase.length, nList.length); si += 1) {
            const sb = slotBase[si], nn = nList[si];
            if (String(sb.text) === String(nn.text)) fails.push("TEXT_UNCHANGED[" + String(nn.text).slice(0, 8) + "]（识别未更新内容）");
            for (const k of ["left", "top", "width", "height", "angle", "fontSize"]) {
              if (sb[k] != null && nn[k] != null && Math.abs(sb[k] - nn[k]) > 0.01) fails.push("GEOM_CHANGED " + k + " " + sb[k] + "->" + nn[k] + " @ " + String(nn.text).slice(0, 8));
            }
            if (sb.fontFamily && nn.fontFamily && String(sb.fontFamily) !== String(nn.fontFamily)) fails.push("FONT_CHANGED @ " + String(nn.text).slice(0, 8));
            if (sb.fill != null && nn.fill != null && String(sb.fill) !== String(nn.fill)) fails.push("FILL_CHANGED @ " + String(nn.text).slice(0, 8));
          }
          if (invNow && invNow.ok && Array.isArray(invNow.items)) {
            const iv = invNow.items.slice();
            if (iv.length !== slotBase.length) { /* COUNT 已报 */ }
            for (let si = 0; si < Math.min(slotBase.length, iv.length); si += 1) {
              if (slotBase[si].layerNum != null && iv[si] && slotBase[si].layerNum !== iv[si].layerNum) fails.push("LAYER_CHANGED[" + si + "] " + slotBase[si].layerNum + "->" + iv[si].layerNum);
            }
          }
          runRec.assertFails = fails;
          if (fails.length) { rec.asserts.push({ rnd: rnd, fails: fails }); rec.errors.push("ASSERT_FAIL r" + rnd + ": " + fails.join(" | ")); }
        }
        if (def.slots > 0) {
          rec.assess = { templateOk: rec.asserts.length === 0, rounds: rec.runs.length - rec.asserts.length, total: rec.runs.length };
        }
        rec.steps.push({ step: "rollback", ok: true });
        await rollback();
      } catch (e) { rec.errors.push("RUN: " + String(e && (e.message || e) || e).slice(0, 300)); }
    }

    out.errors = out.errors.slice(0, 20);
  } catch (e) { out.errors.push("FATAL: " + String(e && (e.message || e) || e).slice(0, 400)); }
  finally { try { await browser.close(); } catch (e) {} }
  fs.writeFileSync(path.join(REPORT_DIR, "commit-46c-template-real.json"), JSON.stringify(out, null, 2));
  try {
    for (const rc of out.runs) {
      fs.writeFileSync(path.join(REPORT_DIR, "commit-46c-template-real-" + rc.case + "-" + rc.ab + ".json"), JSON.stringify({ case: rc.case, ab: rc.ab, steps: rc.steps, status: rc.status, visualRows: rc.visualRows, renderedInkCompare: rc.renderedInkCompare, leftShiftObserved: rc.leftShiftObserved, errors: rc.errors }, null, 2));
    }
  } catch (eW) {}
  console.log("[commit-46c-template] report -> runtime/reports/stage-9/commit-46c-template-real.json");
})().catch((e) => { console.error("FATAL: " + String(e && (e.message || e) || e).slice(0, 600)); process.exit(1); });
