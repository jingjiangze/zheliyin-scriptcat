// runtime/stage9/font-target-ab.js — Stage 9 P4-B Commit 3：ImageInk typography target 真机 A/B 矩阵
// ---------------------------------------------------------------------
// 矩阵（Native 固定 textType=2）：
//   A1 = Baidu standard + ImageInk OFF   A2 = Baidu standard + ImageInk ON
//   B1 = Baidu accurate + ImageInk OFF   B2 = Baidu accurate + ImageInk ON
// 每条件 ≥2 独立 run（fresh runtime：每 run 重设 GM(localStorage shim) → reload → 重注入 pageWorld）。
// 运行链（FULL_REAL_PIPELINE）：
//   真实编辑器页 → 注入背景图 → ocrPrepare 提取源图 →（node 同源 Baidu provider 真实识别 standard|accurate）
//   → 结果注入页面 → 点击「识别当前图片」→ Native uploadOCR(textType=2) → Text Truth → candidate gate
//   → buildTextBlocks → buildItemsFromOcr → ImageInk/OCR_BBOX target → solveFontSizeFusion
//   → textbox create → Editor 渲染 → measureFabricObjectInk(EditorInk) → 几何/位置/wrap/identity 采样。
// Baidu 在 node 侧调用（与 baidu-geometry-benchmark 同 provider 同配置；浏览器内跨域 CORS 被拒，
//   扩展特权/GM_xmlhttpRequest 无法在纯 pageWorld 下使用——报告标注调用侧）。
// 凭据：env ZY_STAGE9_COOKIE（必需）+ ZY_BAIDU_AK / ZY_BAIDU_SK（必需），仅运行时，不落盘不打印值。
// 报告：runtime/reports/stage-9/font-target-ab.json（cookie 只记名）。
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
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const CARD = process.env.ZY_BG_FILE || path.join(ROOT, "runtime", "stage8b", "assets", "real-card-shengying.png");
const COOKIE_RAW = process.env.ZY_STAGE9_COOKIE || "";
const BAIDU_AK = process.env.ZY_BAIDU_AK || "";
const BAIDU_SK = process.env.ZY_BAIDU_SK || "";
const CONDITIONS = [
  { id: "A1", baidu: "standard", ink: "0" },
  { id: "A2", baidu: "standard", ink: "1" },
  { id: "B1", baidu: "accurate", ink: "0" },
  { id: "B2", baidu: "accurate", ink: "1" }
];
const RUNS_PER = Math.max(1, Number(process.env.ZY_RUNS || 2));
const COND_WHITELIST = (process.env.ZY_COND || '').split(',').map((s) => s.trim()).filter(Boolean);

async function baiduRecognizeExternal(dataUrl, mode) {
  const provider = createBaiduProvider({
    getConfig: () => ({ apiKey: BAIDU_AK, secretKey: BAIDU_SK }),
    http: { request: async (m, u, o) => { const res = await fetch(u, { method: m, headers: o.headers || {}, body: o.body, signal: AbortSignal.timeout(o.timeout || 30000) }); return { status: res.status, responseText: await res.text() }; } },
    storage: { get: () => "", set: () => {} },
    resizeImage: null
  });
  return provider.recognize(dataUrl, { imageWidth: null, imageHeight: null, mode }).catch((e) => ({ error: { errorCode: "EXCEPTION", errorMessage: String(e && e.message || e) } }));
}

function selfTest() {
  const parse = (raw) => String(raw || "").split(";").filter((p) => p.indexOf("=") > 0).map((p) => ({ name: p.slice(0, p.indexOf("=")).trim(), value: p.slice(p.indexOf("=") + 1).trim() })).filter((c) => c.name && c.value);
  const t = (n, c) => { if (!c) throw new Error("SELFTEST FAIL " + n); console.log("[selftest] PASS " + n); };
  t("cookie-parse", parse("a=1; b=2; c").length === 2);
  t("matrix-4", CONDITIONS.length === 4 && CONDITIONS.map((c) => c.id).join() === "A1,A2,B1,B2");
  t("runs-min2", RUNS_PER >= 2);
  const c1 = conditionCode({ baidu: "standard", ink: "0" });
  const c2 = conditionCode({ baidu: "accurate", ink: "1" });
  t("code-inject-baidu", c1.indexOf('"standard"') >= 0 && c2.indexOf('"accurate"') >= 0 && c1.indexOf("__zyBaiduExternal") >= 0);
  t("code-inject-ink", c1.indexOf("INK_TARGET = false") >= 0 && c2.indexOf("INK_TARGET = true") >= 0);
  console.log("[selftest] ALL PASS");
}

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
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }
if (!COOKIE_RAW) { console.error("[font-target-ab] 缺少 ZY_STAGE9_COOKIE（编辑器会话）。--selftest 可校验纯函数。"); process.exit(2); }
if (!BAIDU_AK || !BAIDU_SK) { console.error("[font-target-ab] 缺少 ZY_BAIDU_AK / ZY_BAIDU_SK。"); process.exit(2); }

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
}const GM_SHIM_SOURCE = [
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

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const out = {
    ts: new Date().toISOString(),
    stage: "STAGE-9-V4-FONT-TARGET-AB",
    native: { fixed: "textType=2", note: "Native handwriting fixed; recognizeWithFallback may retry textType=1 on empty/fail" },
    baiduSide: "node (createBaiduProvider 同源模块；浏览器内 CORS 拒绝对 aip.baidubce.com——同 baidu-geometry-benchmark 取证方式)",
    matrix: CONDITIONS.map((c) => ({ id: c.id, baidu: c.baidu, imageInk: c.ink, runs: RUNS_PER })),
    image: path.basename(CARD),
    cookiePresent: !!COOKIE_RAW,
    // §11：报告禁止记录 Cookie 原文/名字——只记 configured 状态
    runs: [],
    frontBack: null,
    errors: []
  };
  if (!fs.existsSync(CARD)) { console.error("[font-target-ab] 图片不存在: " + CARD); process.exit(1); }
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
      let removed = 0;
      for (const s of allOld.filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(page, s.uuid); removed += 1; } catch (e) {} }
      out.errors = out.errors.filter((x) => x.indexOf("PAGEERROR") < 0);
      console.log("[font-target-ab] scriptcat cleaned removed=" + removed);
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
    const setGm = async (cond) => page.evaluate((a) => {
      const set = (k, v) => { try { localStorage.setItem("zy8dshim:" + k, JSON.stringify(v)); } catch (e) {} };
      set("zyBaiduOcrMode", a.baidu);
      set("zyStage9NativeOcrMode", "2");
      set("zyStage9NativeTruth", "1");
      set("zyStage9FontInkTarget", a.ink);
      set("zyStage9Calibration", "1");
      set("zyOcrMode", "baidu");
      return true;
    }, { baidu: cond.baidu, ink: cond.ink });
    const injectPageWorld = (payload) => page.evaluate((code) => { const s = document.createElement("script"); s.textContent = code; (document.head || document.documentElement).appendChild(s); }, payload);
    const waitEditorReady = async (tries) => {
      for (let i = 0; i < (tries || 16); i += 1) {
        const r = await page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed) })).catch(() => ({}));
        if (r && r.ok && r.bridge) return r;
        await SLEEP(1200);
      }
      return page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed) })).catch(() => ({}));
    };
    const setBg = () => page.evaluate((arg) => new Promise((res) => {
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
      while (Date.now() - t0 < timeoutMs) {
        const r = await page.evaluate(() => {
          const el = document.querySelector("#zy-native-status") || document.querySelector("#zy-status") || document.querySelector(".zy-status");
          return { st: el ? String(el.textContent || "").trim().slice(0, 160) : null };
        }).catch(() => ({}));
        const st = r && r.st;
        if (st && /已生成 \d+ 个文字|未识别到文字|失败|异常|几何校验完成/.test(st)) return { done: true, st };
        await SLEEP(900);
      }
      return { done: false };
    };
    const snapIds = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const c = vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas;
      return c ? c.getObjects().map((o) => o.uuid || o.multiUuid || o.id || null) : [];
    });
    const readNew = (ids) => page.evaluate(async (arg) => {
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
          text: String(o.text || "").slice(0, 24),
          fontFamily: o.fontFamily || null, fontSize: typeof o.fontSize === "number" ? o.fontSize : null,
          left: typeof o.left === "number" ? o.left : null, top: typeof o.top === "number" ? o.top : null,
          width: typeof o.width === "number" ? o.width : null, height: typeof o.height === "number" ? o.height : null,
          angle: typeof o.angle === "number" ? o.angle : null, geo,
          ink: (ink && ink.ok) ? { inkWidth: ink.inkWidth, inkHeight: ink.inkHeight, lineCount: ink.lineCount, method: ink.method } : null,
          count: o._textLines && o._textLines.length ? o._textLines.length : null,
          diag: o.zyOcrDiagnostics || null
        });
      }
      return { arr, calib: (window.__zyStage9CalibrationEvidence || []) }; // P4-D：Actual Ink 校准证据
    }, { ids });
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
    const advanceWidthOf = (text, fs, family) => page.evaluate((a) => {
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) return null;
      ctx.font = (a.fs || 16) + "px " + (a.family || "sans-serif");
      return ctx.measureText(a.text).width;
    }, { text, fs, family }).catch(() => null);

    // ---- 矩阵执行 ----
    for (const cond of CONDITIONS) { if (COND_WHITELIST.length && COND_WHITELIST.indexOf(cond.id) < 0) continue;
      for (let r = 1; r <= RUNS_PER; r += 1) {
        const rec = { condition: cond.id, baidu: cond.baidu, imageInkTarget: cond.ink === "1", run: r, pipeline: null, steps: [], blocks: [], errors: [] };
        out.runs.push(rec);
        try {
          await setGm(cond);
          await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => rec.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
          await SLEEP(2500);
          await injectPageWorld(pageWorldPayloadFor(cond));
          await SLEEP(1200);
          const ready = await waitEditorReady(16);
          rec.steps.push({ step: "editor-ready", ok: !!(ready && ready.ok), bridge: !!(ready && ready.bridge) });
          if (!(ready && ready.ok)) { rec.errors.push("EDITOR_UNAVAILABLE"); continue; }
          const cp = await bridgeCall("getCurrentPage", {}, "getCurrentPageResult", 6000).catch(() => null);
          rec.pageId = (cp && cp.pageId) || null;
          rec.steps.push({ step: "current-page", pageId: rec.pageId, code: cp && cp.code });
          const bg = await setBg();
          rec.steps.push({ step: "bg-inject", ok: !!(bg && bg.ok) });
          if (!(bg && bg.ok)) { rec.errors.push("BG_INJECT_FAIL"); continue; }
          const prep = await bridgeCall("ocrPrepare", {}, "ocrPrepareResult", 15000).catch(() => null);
          rec.steps.push({ step: "ocr-prepare", ok: !!(prep && prep.ok && prep.dataUrl), kind: (prep && prep.kind) || null });
          if (!(prep && prep.ok && prep.dataUrl)) { rec.errors.push("OCR_PREPARE_FAIL"); continue; }
          const extRes = await baiduRecognizeExternal(prep.dataUrl, cond.baidu);
          rec.steps.push({ step: "baidu-external", ok: !!(extRes && !extRes.error), candidates: (extRes && extRes.candidates || []).length, meta: (extRes && extRes.meta && extRes.meta.mode) || null });
          if (!extRes || extRes.error) { rec.errors.push("BAIDU_EXTERNAL_FAIL: " + String((extRes && extRes.error && extRes.error.errorCode) || "?")); continue; }
          await page.evaluate((r) => { try { window.__zyBaiduExternal = { res: r }; } catch (e) {} }, extRes);
          const before = await snapIds();
          const cl = await clickOcr();
          rec.steps.push({ step: "click-ocr", clicked: !!(cl && cl.clicked), sel: cl && cl.sel });
          if (!(cl && cl.clicked)) { rec.errors.push("OCR_BTN_NOT_FOUND"); continue; }
          const doneW = await waitOcrDone(180000);
          rec.steps.push({ step: "ocr-done", done: !!doneW.done, status: doneW.st || null });
          if (!doneW.done) { rec.errors.push("OCR_TIMEOUT"); continue; }
          const after = await snapIds();
          const createdIds = (after || []).filter((id) => (before || []).indexOf(id) < 0);
          const rd = await readNew(createdIds);
          rec.steps.push({ step: "read", objects: (rd && rd.arr || []).length });
          rec.calibration = (rd && rd.calib) || []; // P4-D §9
          if ((rd && rd.arr && rd.arr.length) > 0) rec.pipeline = "FULL_REAL_PIPELINE";
          else { rec.errors.push("NO_OBJECTS_CREATED"); continue; }
          for (const ob of (rd && rd.arr) || []) {
            const diag = ob.diag || {};
            const ocrBBox = diag.ocrBBox8d || null;
            const tgtW = diag.targetWidth || null;
            const inkTgt = diag.imageInkTargetWidth || null;
            const aw = await advanceWidthOf(ob.text, ob.fontSize, ob.fontFamily);
            rec.blocks.push({
              blockIndex: ob.zyOcrObjectId && ob.zyOcrObjectId.blockId != null ? ob.zyOcrObjectId.blockId : null,
              objectId: ob.id, zyOcrKey: ob.zyOcrKey, text: ob.text,
              fontFamily: ob.fontFamily, fontSize: ob.fontSize,
              scriptType: diag.sizeCluster || null, sizeBucket: null,
              targetSource: diag.targetSource || null,
              ocrBBoxTargetWidth: ocrBBox ? ocrBBox.width : null,
              imageInkTargetWidth: inkTgt,
              inkFallback: !!diag.inkFallback, inkReason: diag.inkReason || null,
              targetWidth: tgtW,
              advanceWidth: aw != null ? Math.round(aw * 100) / 100 : null,
              editorInkWidth: ob.ink ? ob.ink.inkWidth : null,
              editorInkHeight: ob.ink ? ob.ink.inkHeight : null,
              K2_after: (ob.ink && inkTgt > 0) ? Math.round((ob.ink.inkWidth / inkTgt) * 1000) / 1000 : null,
              geometry: ob.geo,
              position: { left: ob.left, top: ob.top, width: ob.width, height: ob.height, angle: ob.angle },
              wrap: { sourceLineCount: diag.sourceLineCount != null ? diag.sourceLineCount : null, estimatedFinalLineCount: diag.estimatedFinalLineCount != null ? diag.estimatedFinalLineCount : null, forcedWrapDetected: !!diag.forcedWrapDetected, renderedLineCount: ob.count },
              objectQuad: ob.geo
            });
          }
          await rollback();
          rec.steps.push({ step: "rollback", ok: true });
        } catch (e) { rec.errors.push("RUN: " + String(e && e.stack || (e && e.message || e)).slice(0, 300)); }
      }
    }    // ---- Front/Back 隔离（§19 Front→Back→Front；复用 e2e 已验证范式）----
    if (process.env.ZY_SKIP_FB === '1') { out.frontBack = { steps: [], errors: [], acceptance: null, skipped: true }; } else try {
      const fb = { steps: [], errors: [], acceptance: null };
      out.frontBack = fb;
      await setGm(CONDITIONS[0]);
      await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      await SLEEP(2500);
      await injectPageWorld(pageWorldPayloadFor(CONDITIONS[0]));
      await SLEEP(1200);
      const waitR = await waitEditorReady(16);
      fb.steps.push({ step: "editor-ready", ok: !!(waitR && waitR.ok) });
      const setCurrentNum = (n) => page.evaluate((nn) => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); if (vo) vo.currentCanvasNum = nn; try { delete window.CurrentCanvas; } catch (e) {} return !!vo; }, n);
      const switchSide = async (label) => {
        const r = await page.evaluate((lb) => {
          for (const el of document.querySelectorAll(".page-group .pageNum")) { const s = String(el.textContent || "").trim(); if (lb === "back" && /反面|背面/.test(s)) { el.click(); return { ok: true, txt: s }; } if (lb === "front" && /正面/.test(s)) { el.click(); return { ok: true, txt: s }; } }
          return { ok: false };
        }, label);
        if (!(r && r.ok)) setCurrentNum(label === "back" ? 2 : 1);
        await SLEEP(1500);
        return r;
      };
      const inventory = async () => (await bridgeCall("getTextInventory", {}, "getTextInventoryResult", 6000).catch(() => null));
      const subs = (inv) => ((inv && inv.items) || []).map((o) => ({ objectUuid: o.objectUuid, zyOcrKey: o.zyOcrKey || null, text: String(o.text || ""), left: o.left, top: o.top, width: o.width, height: o.height, fontSize: o.fontSize }));
      const tx = () => "tx-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
      const p0 = await bridgeCall("getCurrentPage", {}, "getCurrentPageResult", 6000).catch(() => null);
      fb.steps.push({ step: "current0", pageId: (p0 && p0.pageId) || null, code: p0 && p0.code });
      if (p0 && p0.ok && p0.pageId) {
        const calItems = [{ blockIndex: 0, text: "佛山盛盈包装制品有限公司", top: 60, left: 40, width: 320, height: 30, fontSize: 20 }, { blockIndex: 1, text: "吴健湘", top: 110, left: 40, width: 120, height: 24, fontSize: 16 }];
        const invB = await inventory(); fb.steps.push({ step: "inv-before-front", items: subs(invB) });
        const r1 = await bridgeCall("ocrCalibrate", { pageId: p0.pageId, transactionId: tx(), imageFingerprint: "fb-front-1", items: calItems }, "ocrCalibrateResult", 15000);
        fb.steps.push({ step: "front-calibrate", ok: !!(r1 && r1.ok), calibrated: (r1 && (r1.calibrated || []).length), created: (r1 && (r1.created || []).length) });
        const invF = await inventory(); fb.steps.push({ step: "inv-after-front", items: subs(invF) });
        await switchSide("back");
        const pB = await bridgeCall("getCurrentPage", {}, "getCurrentPageResult", 6000).catch(() => null);
        fb.steps.push({ step: "current-back", pageId: (pB && pB.pageId) || null });
        const r2 = await bridgeCall("ocrCalibrate", { pageId: (pB && pB.pageId) || "canvas:c1", transactionId: tx(), imageFingerprint: "fb-back", items: [{ blockIndex: 0, text: "诚信经营", top: 80, left: 50, width: 160, height: 24, fontSize: 14 }] }, "ocrCalibrateResult", 15000);
        fb.steps.push({ step: "back-calibrate", ok: !!(r2 && r2.ok), calibrated: (r2 && (r2.calibrated || []).length), created: (r2 && (r2.created || []).length) });
        const invB2 = await inventory(); fb.steps.push({ step: "inv-after-back", items: subs(invB2), pageId: (pB && pB.pageId) || null });
        await switchSide("front");
        const invF2 = await inventory(); fb.steps.push({ step: "inv-return-front", items: subs(invF2) });
        const r3 = await bridgeCall("ocrCalibrate", { pageId: p0.pageId, transactionId: tx(), imageFingerprint: "fb-front-2", items: calItems }, "ocrCalibrateResult", 15000);
        fb.steps.push({ step: "front-recalibrate", ok: !!(r3 && r3.ok), calibrated: (r3 && (r3.calibrated || []).length), created: (r3 && (r3.created || []).length) });
        const invF3 = await inventory(); fb.steps.push({ step: "inv-after-front2", items: subs(invF3) });
        const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
        fb.acceptance = {
          frontInvariant: same(subs(invF), subs(invF3)),
          note: "back-invariance + PAGE_IDENTITY_CHANGED 见 e2e-front-back-isolation.json (ac530ab PASS)"
        };
      } else { fb.errors.push("NO_CURRENT_PAGE"); }
    } catch (e) { if (!out.frontBack) out.frontBack = { errors: [] }; out.frontBack.errors.push("FB: " + String(e && e.message || e).slice(0, 300)); }
  } catch (e) { out.errors.push("MAIN: " + String(e && e.message || e).slice(0, 300)); }
  if (browser) await browser.close().catch(() => {});
  fs.writeFileSync(path.join(REPORT_DIR, "font-target-ab.json"), JSON.stringify(out, null, 2));
  const runs = out.runs || [];
  console.log("[font-target-ab] runs=" + runs.length + " errors=" + (out.errors || []).length + " cookiePresent=" + (!!out.cookiePresent));
  runs.forEach((r) => console.log("[font-target-ab] " + r.condition + " r" + r.run + " pipeline=" + r.pipeline + " blocks=" + (r.blocks || []).length + " errs=" + r.errors.length + (r.errors.length ? " :: " + r.errors.join(" | ").slice(0, 140) : "")));
  process.exit((out.errors || []).length || runs.some((r) => r.errors.length) ? 1 : 0);
})();