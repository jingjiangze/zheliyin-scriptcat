// runtime/stage9/partial-sidecar-recovery.js — OCR-P1 Commit 3c：部分创建 + LOCAL sidecar 真机 CASE A/B/C
// ---------------------------------------------------------------------
// CASE（Native 固定 textType=2；Baidu=node 侧同源 provider；素材 ZY_BG_FILE）：
//   A = sidecar OFF  → 期望 finalUnmatched>0（缺失行）→ 仅创建可靠行、missingTexts 明确
//   B = sidecar ON + engine 首次加载（ocrEngineCache=null）→ local 恢复成功时 finalMatched 步进
//   C = sidecar ON + local 仍无法恢复 → 与 A 相同创建数（不猜位置）
// 报告 13 字段：nativeLines / initialMatched / initialUnmatched / sidecarUsed /
//   engineLoaded / localCandidates / localRecovered / finalMatched / finalUnmatched /
//   createdCount / missingTexts / createCalled / nativeLayerCount。
// 凭据：env ZY_STAGE9_COOKIE + ZY_BAIDU_AK + ZY_BAIDU_SK（仅运行时，不落盘不打印值）。
// 报告：runtime/reports/stage-9/partial-sidecar-recovery.json（cookie 只记名）。
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
const CARD = process.env.ZY_BG_FILE || path.join(ROOT, "runtime", "stage8b", "assets", "real-card-xiazhu.png");
const COOKIE_RAW = process.env.ZY_STAGE9_COOKIE || "";
const BAIDU_AK = process.env.ZY_BAIDU_AK || "";
const BAIDU_SK = process.env.ZY_BAIDU_SK || "";
const CASES = [
  { id: "A", sidecar: "0", note: "sidecar OFF：可靠行创建 + 缺失文字告知" },
  { id: "B", sidecar: "1", note: "sidecar ON：首次 engine load + local 恢复" },
  { id: "C", sidecar: "1", note: "sidecar ON：local 无法恢复 → 不猜位置" }
];
const RUNS_PER = Math.max(1, Number(process.env.ZY_RUNS || 1));
const CASE_WHITELIST = (process.env.ZY_CASE || "").split(",").map((s) => s.trim()).filter(Boolean);

// ---- 13 字段 schema（报告用；runner 与 selftest 同源）----
const FIELDS = ["nativeLines", "initialMatched", "initialUnmatched", "sidecarUsed", "engineLoaded", "localCandidates", "localRecovered", "finalMatched", "finalUnmatched", "createdCount", "missingTexts", "createCalled", "nativeLayerCount"];

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
  t("cases-3", CASES.length === 3 && CASES.map((c) => c.id).join() === "A,B,C");
  t("fields-13", FIELDS.length === 13);
  const cB = conditionCode({ sidecar: "1" });
  const cA = conditionCode({ sidecar: "0" });
  t("code-inject-sidecar", cB.indexOf("LOCAL_SIDECAR = true") >= 0 && cA.indexOf("LOCAL_SIDECAR = false") >= 0);
  t("code-native-fixed", cB.indexOf('"2"') >= 0 && cB.indexOf('GM_getValue("zyStage9NativeOcrMode", "2")') < 0);
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
  repl('GM_getValue("zyBaiduOcrMode", "standard")', JSON.stringify("standard"));
  repl('GM_getValue("zyStage9NativeOcrMode", "2")', JSON.stringify("2"));
  repl('GM_getValue("zyStage9NativeTruth", "1") === "1"', "true");
  repl('GM_getValue("zyStage9LocalSidecar", "0") === "1"', cond.sidecar === "1" ? "true" : "false");
  repl('GM_getValue("zyOcrMode", "auto")', JSON.stringify("baidu"));
  repl('res = await provider.recognize(img.dataUrl, { imageWidth: img.width, imageHeight: img.height, mode: BAIDU_OCR_MODE });', 'res = (window.__zyBaiduExternal && window.__zyBaiduExternal.res) ? window.__zyBaiduExternal.res : { error: { errorCode: "EXTERNAL_BAIDU_MISSING", errorMessage: "runner external baidu not injected" } };');
  repl('document.addEventListener("DOMContentLoaded", initZheliyin);', '(function(){ if (document.body) { initZheliyin(); } else { document.addEventListener("DOMContentLoaded", function(){ initZheliyin(); }); } })();');
  return code;
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }
if (!COOKIE_RAW) { console.error("[partial-sidecar] 缺少 ZY_STAGE9_COOKIE（编辑器会话）。--selftest 纯函数可验。"); process.exit(2); }
if (!BAIDU_AK || !BAIDU_SK) { console.error("[partial-sidecar] 缺少 ZY_BAIDU_AK / ZY_BAIDU_SK。"); process.exit(2); }

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
    stage: "OCR-P1-COMMIT3C-PARTIAL-SIDECAR",
    cases: CASES.map((c) => ({ id: c.id, sidecar: c.sidecar, note: c.note })),
    image: path.basename(CARD),
    cookiePresent: !!COOKIE_RAW,
    fields: FIELDS,
    runs: [],
    errors: []
  };
  if (!fs.existsSync(CARD)) { console.error("[partial-sidecar] 图片不存在: " + CARD); process.exit(1); }
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
      console.log("[partial-sidecar] scriptcat cleaned");
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
    const setGm = async (c) => page.evaluate((a) => {
      const set = (k, v) => { try { localStorage.setItem("zy8dshim:" + k, JSON.stringify(v)); } catch (e) {} };
      set("zyBaiduOcrMode", "standard");
      set("zyStage9NativeOcrMode", "2");
      set("zyStage9NativeTruth", "1");
      set("zyStage9LocalSidecar", a.sidecar);
      set("zyOcrMode", "baidu");
      return true;
    }, { sidecar: c.sidecar });
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
      im.onload = () => { try { const bg = new f.Image(im); var cw = c.getWidth && c.getWidth() ? c.getWidth() : (c.width || 0); var chh = c.getHeight && c.getHeight() ? c.getHeight() : (c.height || 0); bg.set({ left: 0, top: 0, scaleX: cw && im.naturalWidth ? cw / im.naturalWidth : 1, scaleY: chh && im.naturalHeight ? chh / im.naturalHeight : 1 }); c.setBackgroundImage(bg, () => { try { if (c.requestRenderAll) c.requestRenderAll(); } catch (e) {} res({ ok: true }); }); } catch (e) { res({ ok: false, reason: String(e && e.message || e).slice(0, 100) }); } };
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
          return { st: el ? String(el.textContent || "").trim().slice(0, 200) : null };
        }).catch(() => ({}));
        const st = r && r.st;
        if (st && /已生成 \d+ 个文字|已校准 \d+ 个文字|未识别到文字|未生成文字|未找到可识别的图片|本批不进入创建|无法确定当前图片所属页面|OCR 目标已失效|无有效块|未通过质量检查|阻断|失败|异常|几何校验完成|已处理 \d+ 个文字图层|追加完成|识别完成|即将创建|文字不创建|缺失 \d+ 行/.test(st)) return { done: true, st };
        await SLEEP(900);
      }
      return { done: false };
    };
    const readNew = (ids) => page.evaluate(async (arg) => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
      const c = d && d.canvas;
      if (!c) return { arr: [], layerCount: null, err: "no-canvas" };
      const arr = [];
      for (const o of c.getObjects()) {
        if (typeof o.text !== "string") continue;
        const id = o.uuid || o.multiUuid || o.id || null;
        if (arg.ids && arg.ids.length && id != null && arg.ids.indexOf(id) < 0) continue;
        arr.push({ id, zyOcrKey: o.zyOcrKey || null, text: String(o.text || "").slice(0, 32), blockIndex: (o.zyOcrObjectId && o.zyOcrObjectId.blockId != null) ? o.zyOcrObjectId.blockId : null });
      }
      const layerCount = (d.canvasObjInfo && Array.isArray(d.canvasObjInfo.canvasToProductObjArr)) ? d.canvasObjInfo.canvasToProductObjArr.filter((o) => o && typeof o.text === "string").length : null;
      return { arr, layerCount };
    }, { ids });
    const snapIds = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const c = vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas;
      return c ? c.getObjects().map((o) => o.uuid || o.multiUuid || o.id || null) : [];
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
    const readGateSummary = () => page.evaluate(() => ({ summary: window.__zyNativeGateSummary || null, initial: window.__zyInitialGate || null, engine: window.__zyLocalEngineState || null, ev: window.__zyOcrPipelineEvidence || null })).catch(() => ({}));

    for (const c of CASES) { if (CASE_WHITELIST.length && CASE_WHITELIST.indexOf(c.id) < 0) continue;
      for (let r = 1; r <= RUNS_PER; r += 1) {
        const rec = { case: c.id, sidecar: c.sidecar === "1", run: r, steps: [], errors: [], created: [], acceptance: null };
        out.runs.push(rec);
        try {
          await setGm(c);
          await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => rec.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
          await SLEEP(2500);
          await injectPageWorld(pageWorldPayloadFor(c));
          await SLEEP(1200);
          const ready = await waitEditorReady(16);
          rec.steps.push({ step: "editor-ready", ok: !!(ready && ready.ok), bridge: !!(ready && ready.bridge) });
          if (!(ready && ready.ok)) { rec.errors.push("EDITOR_UNAVAILABLE"); continue; }
          const cp = await bridgeCall("getCurrentPage", {}, "getCurrentPageResult", 6000).catch(() => null);
          rec.pageId = (cp && cp.pageId) || null;
          const bg = await setBg();
          rec.steps.push({ step: "bg-inject", ok: !!(bg && bg.ok) });
          if (!(bg && bg.ok)) { rec.errors.push("BG_INJECT_FAIL"); continue; }
          const prep = await bridgeCall("ocrPrepare", {}, "ocrPrepareResult", 15000).catch(() => null);
          rec.steps.push({ step: "ocr-prepare", ok: !!(prep && prep.ok && prep.dataUrl) });
          if (!(prep && prep.ok && prep.dataUrl)) { rec.errors.push("OCR_PREPARE_FAIL"); continue; }
          const extRes = await baiduRecognizeExternal(prep.dataUrl, "standard");
          rec.baiduCount = (extRes && !extRes.error && extRes.candidates) ? extRes.candidates.length : null;
          rec.steps.push({ step: "baidu-external", ok: !!(extRes && !extRes.error), candidates: rec.baiduCount });
          if (!extRes || extRes.error) { rec.errors.push("BAIDU_EXTERNAL_FAIL: " + String((extRes && extRes.error && extRes.error.errorCode) || "?")); continue; }
          await page.evaluate((r) => { try { window.__zyBaiduExternal = { res: r }; } catch (e) {} }, extRes);
          const before = await snapIds();
          const cl = await clickOcr();
          rec.steps.push({ step: "click-ocr", clicked: !!(cl && cl.clicked) });
          if (!(cl && cl.clicked)) { rec.errors.push("OCR_BTN_NOT_FOUND"); continue; }
          const doneW = await waitOcrDone(240000);
          rec.steps.push({ step: "ocr-done", done: !!doneW.done, status: doneW.st || null });
          if (!doneW.done) { rec.errors.push("OCR_TIMEOUT"); continue; }
          const gs = await readGateSummary();
          rec.gate = gs.summary; rec.gateInitial = gs.initial; rec.engine = gs.engine;
          const cre = (gs.ev || []).filter((x) => x.stage === "CREATE");
          rec.createCalled = (cre || []).length > 0;
          rec.createEvidence = (cre || []).map((x) => ({ requested: x.requested, created: x.created, fail: x.fail || null }));
          const after = await snapIds();
          const createdIds = (after || []).filter((id) => (before || []).indexOf(id) < 0);
          const rd = await readNew(createdIds);
          rec.created = (rd && rd.arr || []).map((o) => ({ text: o.text, id: o.id, blockIndex: o.blockIndex }));
          rec.nativeLayerCount = (rd && rd.layerCount) || null;
          // ---- 13 字段汇总 ----
          const g = gs.summary || {};
          const nativeLines = (g.totalNative != null ? g.totalNative : ((gs.ev || []).find((x) => x.stage === "NATIVE") || {}).nativeLines) || 0;
          rec.fields = {
            nativeLines: nativeLines,
            initialMatched: g.initialMatched != null ? g.initialMatched : ((gs.initial && gs.initial.matched) || 0),
            initialUnmatched: g.initialUnmatched != null ? g.initialUnmatched : ((gs.initial && gs.initial.unmatched) || 0),
            sidecarUsed: !!(g.localSidecar && g.localSidecar.used),
            engineLoaded: !!(gs.engine && gs.engine.loaded),
            localCandidates: (g.localSidecar && g.localSidecar.candidates) || null,
            localRecovered: (g.localSidecar && g.localSidecar.recovered) || 0,
            finalMatched: g.finalMatched != null ? g.finalMatched : null,
            finalUnmatched: g.finalUnmatched != null ? g.finalUnmatched : null,
            createdCount: rec.created.length,
            missingTexts: g.missingTexts || [],
            createCalled: rec.createCalled,
            nativeLayerCount: rec.nativeLayerCount
          };
          // ---- 断言 ----
          const acc = [];
          const f = rec.fields;
          const A = (name, ok, detail) => { acc.push({ name, ok: !!ok, detail: detail || null }); };
          A("consistency", (f.finalMatched != null && f.finalUnmatched != null && f.nativeLines != null) && (f.finalMatched + f.finalUnmatched === f.nativeLines), "finalMatched+finalUnmatched===nativeLines");
          A("missing-created-sum", (f.missingTexts.length === (f.finalUnmatched || 0)), "missingTexts.length===finalUnmatched");
          A("sidecar-per-case", (c.sidecar === "1" && f.sidecarUsed) || (c.sidecar === "0" && !f.sidecarUsed), "case " + c.id + " sidecarUsed=" + f.sidecarUsed);
          A("missing-not-created", f.missingTexts.every((m) => !rec.created.some((o) => o.text === m)), "缺失行 text 不进入画布");
          A("created-equal-finalMatched", f.createdCount === f.finalMatched, "createdCount===finalMatched");
          if (c.id === "B") A("engine-first-load", f.engineLoaded === true, "sidecar ON 首次 engine load（__zyLocalEngineState.loaded）");
          if (c.id === "C") A("local-unrecoverable-no-guess", (f.localRecovered === 0) && (f.createdCount === f.finalMatched), "local 无法恢复时只创建可靠行（不猜位置）");
          rec.acceptance = acc;
          await rollback();
          rec.steps.push({ step: "rollback", ok: true });
        } catch (e) { rec.errors.push("RUN: " + String(e && e.stack || (e && e.message || e)).slice(0, 300)); }
      }
    }
    out.acceptance = out.runs.reduce((m, r) => { (r.acceptance || []).forEach((a) => { if (!m[a.name]) m[a.name] = { pass: 0, fail: 0 }; m[a.name][a.ok ? "pass" : "fail"] += 1; }); return m; }, {});
    out.errors = out.errors.slice(0, 20);
  } catch (e) { out.errors.push("FATAL: " + String(e && e.stack || (e && e.message || e)).slice(0, 400)); }
  finally { try { await browser.close(); } catch (e) {} }
  fs.writeFileSync(path.join(REPORT_DIR, "partial-sidecar-recovery.json"), JSON.stringify(out, null, 2));
  console.log("[partial-sidecar] report -> runtime/reports/stage-9/partial-sidecar-recovery.json");
})().catch((e) => { console.error("FATAL: " + String(e && e.stack || (e && e.message || e)).slice(0, 600)); process.exit(1); });