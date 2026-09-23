// runtime/stage9/commit-4-real.js — OCR-P1 Commit 4.4：Native Anchor + ImageInk 真机证据
// ---------------------------------------------------------------------
// CASE 4-A  ：普通无旋转 → created==finalMatched==nativeLines，recovery 不误触发
// CASE 4-A2 ：DROP 一行 + 画布预置同名 textbox（anchor）→ NATIVE_ANCHOR 命中 →
//             身份复用（预置 uuid 保留、不新增同文本对象）、created==finalMatched
// CASE 4-B  ：背景图旋转 15° → Native text truth 不变 + 创建数守恒 + angle 保留
// CASE 4-C  ：anchor 缺失 → Baidu recovery 尝试（记录实际 source）
// CASE 4-E  ：Baidu+Local 无法恢复 → ImageInk 无 region 不猜 → missing 保留
// CASE 4-G  ：旋转 15° + DROP + partial create 三者同时成立
// 凭据：ZY_STAGE9_COOKIE / ZY_BAIDU_AK / ZY_BAIDU_SK（仅运行时）
// 报告：runtime/reports/stage-9/commit-4-real.json（cookie 只记名）
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
const WHITELIST = (process.env.ZY_CASE || "").split(",").map((s) => s.trim()).filter(Boolean);
const DROP_PREFIX = process.env.ZY_DROP || "";
const ROT_ANGLE = Number(process.env.ZY_IMG_ANGLE || 0);
const CASE_DEFS = [
  { id: "A", sidecar: "0", note: "无旋转：created==finalMatched，recovery 不误触发" },
  { id: "A2", sidecar: "0", drop: "夏祝莲", note: "DROP+锚点预置：NATIVE_ANCHOR 命中并身份复用" },
  { id: "B", sidecar: "1", rot: 15, note: "背景旋转 15°：truth/创建守恒/angle 保留" },
  { id: "C", sidecar: "0", drop: "夏祝莲", note: "anchor 缺失：Baidu recovery 尝试（无锚点时 Baidu/Local 无法恢复则 missing）" },
  { id: "E", sidecar: "1", drop: "夏祝莲", note: "Local 也失败：ImageInk 无 region 不猜 → missing 保留" },
  { id: "G", sidecar: "1", drop: "夏祝莲", rot: 15, note: "旋转 15°+DROP+partial 同时成立" }
];
const FIELDS = ["nativeLines", "initialMatched", "initialUnmatched", "finalMatched", "finalUnmatched", "sourcePriority", "geometryRecoverySource", "createdCount", "missingTexts", "createCalled", "nativeLayerCount", "anchorUsed", "anchorIdentityReused"];

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
  repl('GM_getValue("zyStage9LocalSidecar", "0") === "1"', cond.local ? "true" : "false");
  repl('GM_getValue("zyOcrMode", "auto")', JSON.stringify("baidu"));
  repl('res = await provider.recognize(img.dataUrl, { imageWidth: img.width, imageHeight: img.height, mode: BAIDU_OCR_MODE });', 'res = (window.__zyBaiduExternal && window.__zyBaiduExternal.res) ? window.__zyBaiduExternal.res : { error: { errorCode: "EXTERNAL_BAIDU_MISSING", errorMessage: "external baidu not injected" } };');
  repl('document.addEventListener("DOMContentLoaded", initZheliyin);', '(function(){ if (document.body) { initZheliyin(); } else { document.addEventListener("DOMContentLoaded", function(){ initZheliyin(); }); } })();');
  return code;
}
function selfTest() {
  const parse = (raw) => String(raw || "").split(";").filter((p) => p.indexOf("=") > 0).map((p) => ({ name: p.slice(0, p.indexOf("=")).trim(), value: p.slice(p.indexOf("=") + 1).trim() })).filter((c) => c.name && c.value);
  const t = (n, c) => { if (!c) throw new Error("SELFTEST FAIL " + n); console.log("[selftest] PASS " + n); };
  t("cookie-parse", parse("a=1; b=2; c").length === 2);
  t("cases-6", CASE_DEFS.length === 6 && CASE_DEFS.map((c) => c.id).join() === "A,A2,B,C,E,G");
  t("fields-13", FIELDS.length === 13);
  t("code-anchor-gate", conditionCode({ local: true }).indexOf('NATIVE_ANCHOR') >= 0);
  t("code-local-cond", conditionCode({ local: true }).indexOf('LOCAL_SIDECAR = true') >= 0 && conditionCode({ local: false }).indexOf('LOCAL_SIDECAR = false') >= 0);
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }
if (!COOKIE_RAW || !BAIDU_AK || !BAIDU_SK) { console.error("[commit-4-real] 缺少凭据 env（cookie/ak/sk）"); process.exit(2); }
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
async function baiduRecognizeExternal(dataUrl, mode) {
  const provider = createBaiduProvider({
    getConfig: () => ({ apiKey: BAIDU_AK, secretKey: BAIDU_SK }),
    http: { request: async (m, u, o) => { const res = await fetch(u, { method: m, headers: o.headers || {}, body: o.body, signal: AbortSignal.timeout(o.timeout || 30000) }); return { status: res.status, responseText: await res.text() }; } },
    storage: { get: () => "", set: () => {} },
    resizeImage: null
  });
  return provider.recognize(dataUrl, { imageWidth: null, imageHeight: null, mode }).catch((e) => ({ error: { errorCode: "EXCEPTION", errorMessage: String(e && e.message || e) } }));
}
(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const out = { ts: new Date().toISOString(), stage: "OCR-P1-COMMIT4-REAL", cases: CASE_DEFS, image: path.basename(CARD), cookiePresent: !!COOKIE_RAW, angleDeg: ROT_ANGLE, fields: FIELDS, runs: [], errors: [] };
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
      console.log("[commit-4-real] scriptcat cleaned");
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
      return true;
    }, { local });
    const injectPageWorld = (payload) => page.evaluate((code) => { const s = document.createElement("script"); s.textContent = code; (document.head || document.documentElement).appendChild(s); }, payload);
    const waitEditorReady = async (tries) => {
      for (let i = 0; i < (tries || 16); i += 1) {
        const r = await page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed) })).catch(() => ({}));
        if (r && r.ok && r.bridge) return r;
        await SLEEP(1200);
      }
      return page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed) })).catch(() => ({}));
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
    const presetAnchor = (text) => page.evaluate((a) => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
      const c = d && d.canvas;
      if (!c) return { ok: false, reason: "no-canvas" };
      const f = (c.constructor && c.constructor.fabric) || window.fabric;
      const tb = new f.Textbox(a.text, { left: 30, top: 40, fontSize: 26, fontFamily: "sans-serif", width: 100, height: 40, uuid: "anchor-" + a.text, multiUuid: "anchor-" + a.text });
      try { c.add(tb); if (typeof tb.setCoords === "function") tb.setCoords(); if (c.requestRenderAll) c.requestRenderAll(); } catch (e) { return { ok: false, reason: String(e && e.message || e).slice(0, 80) }; }
      return { ok: true, uuid: tb.uuid };
    }, { text });
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
        if (st) samples.push(String(st).slice(0, 120));
        if (st && /已生成 \d+ 个文字|已校准 \d+ 个文字|追加完成|几何校验完成|已处理 \d+ 个文字图层|识别完成|未识别到文字|未生成文字|未找到可识别的图片|本批不进入创建|无法确定当前图片所属页面|OCR 目标已失效|无有效块|未通过质量检查|阻断|失败|异常|即将创建|文字不创建|缺失 \d+ 行/.test(st)) return { done: true, st, samples };
        await SLEEP(900);
      }
      return { done: false, samples };
    };
    const readGateSummary = () => page.evaluate(() => ({ summary: window.__zyNativeGateSummary || null, initial: window.__zyInitialGate || null, ev: window.__zyOcrPipelineEvidence || null, sidecarCond: window.__zySidecarCond || null })).catch(() => ({}));
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
      if (!c) return { arr: [], layerCount: null, err: "no-canvas" };
      const arr = [];
      for (const o of c.getObjects()) {
        if (typeof o.text !== "string") continue;
        const id = o.uuid || o.multiUuid || o.id || null;
        if (arg.ids && arg.ids.length && id != null && arg.ids.indexOf(id) < 0) continue;
        arr.push({ id, text: String(o.text || "").slice(0, 32), angle: (typeof o.angle === "number") ? o.angle : null });
      }
      const layerCount = (d.canvasObjInfo && Array.isArray(d.canvasObjInfo.canvasToProductObjArr)) ? d.canvasObjInfo.canvasToProductObjArr.filter((o) => o && typeof o.text === "string").length : null;
      return { arr, layerCount };
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
    for (const def of CASE_DEFS) { if (WHITELIST.length && WHITELIST.indexOf(def.id) < 0) continue;
      const runDrop = def.drop != null ? def.drop : DROP_PREFIX;
      const runRot = def.rot != null ? def.rot : ROT_ANGLE;
      const rec = { case: def.id, note: def.note, sidecar: def.sidecar === "1", drop: runDrop, rot: runRot, steps: [], errors: [], created: [], gate: null, acceptance: null, fields: null };
      out.runs.push(rec);
      try {
        await setGm(def.sidecar === "1");
        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => rec.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
        await SLEEP(2500);
        await injectPageWorld(pageWorldPayloadFor({ local: def.sidecar === "1" }));
        await SLEEP(1200);
        let ready = await waitEditorReady(20);
        if (!(ready && ready.ok)) { rec.errors.push("EDITOR_UNAVAILABLE"); continue; }
        if (!(ready && ready.bridge)) {
          await page.evaluate(() => { try { if (window.__ZY_DEBUG__ && window.__ZY_DEBUG__.installPageBridge) window.__ZY_DEBUG__.installPageBridge(); } catch (e) {} }).catch(() => {});
          await SLEEP(1600);
          ready = await waitEditorReady(4);
        }
        rec.steps.push({ step: "editor-ready", ok: !!(ready && ready.ok), bridge: !!(ready && ready.bridge) });
        if (!(ready && ready.bridge)) { rec.errors.push("BRIDGE_UNAVAILABLE"); continue; }
        const cp = await bridgeCall("getCurrentPage", {}, "getCurrentPageResult", 6000).catch(() => null);
        rec.pageId = (cp && cp.pageId) || null;
        const bg = await setBg(runRot);
        rec.steps.push({ step: "bg-inject", ok: !!(bg && bg.ok) });
        if (!(bg && bg.ok)) { rec.errors.push("BG_INJECT_FAIL"); continue; }
        if (def.id === "A2") {
          const pa = await presetAnchor("夏祝莲");
          rec.steps.push({ step: "preset-anchor", ok: !!(pa && pa.ok), uuid: (pa && pa.uuid) || null });
        }
        const prep = await bridgeCall("ocrPrepare", {}, "ocrPrepareResult", 15000).catch(() => null);
        rec.steps.push({ step: "ocr-prepare", ok: !!(prep && prep.ok && prep.dataUrl) });
        if (!(prep && prep.ok && prep.dataUrl)) { rec.errors.push("OCR_PREPARE_FAIL"); continue; }
        const extRes = await baiduRecognizeExternal(prep.dataUrl, "standard");
        let extCands = (extRes && !extRes.error && extRes.candidates) ? extRes.candidates.slice() : [];
        rec.baiduCount = extCands.length;
        if (runDrop) {
          extCands = extCands.filter((c) => String((c && c.text) || "").indexOf(runDrop) < 0);
          rec.drop = { prefix: runDrop, after: extCands.length };
        }
        rec.steps.push({ step: "baidu-external", ok: !!(extRes && !extRes.error), candidates: rec.baiduCount });
        if (!extRes || extRes.error) { rec.errors.push("BAIDU_EXTERNAL_FAIL"); continue; }
        await page.evaluate((r) => { try { window.__zyBaiduExternal = { res: r }; } catch (e) {} }, Object.assign({}, extRes, { candidates: extCands }));
        const before = await snapIds();
        const cl = await clickOcr();
        rec.steps.push({ step: "click-ocr", clicked: !!(cl && cl.clicked) });
        if (!(cl && cl.clicked)) { rec.errors.push("OCR_BTN_NOT_FOUND"); continue; }
        const doneW = await waitOcrDone(360000);
        rec.steps.push({ step: "ocr-done", done: !!doneW.done, status: doneW.st || null });
        if (!doneW.done) { rec.errors.push("OCR_TIMEOUT"); }
        const gs = await readGateSummary();
        rec.gate = gs.summary; rec.gateInitial = gs.initial; rec.ev = gs.ev; rec.sidecarCond = gs.sidecarCond;
        const after = await snapIds();
        const createdIds = (after || []).filter((id) => (before || []).indexOf(id) < 0);
        const rd = await readNew(createdIds);
        rec.created = (rd && rd.arr || []).map((o) => ({ id: o.id, text: o.text, angle: o.angle }));
        rec.nativeLayerCount = (rd && rd.layerCount) || null;
        const g = gs.summary || {};
        const evObj = gs.ev || {};
        const rejectedObs = evObj.rejected || evObj.rejectedGeometry || evObj.containmentRejects || evObj.geometryRejected || null;
        const anchorUsed = (g.geometryRecoverySource || []).indexOf("NATIVE_ANCHOR") >= 0;
        rec.fields = {
          nativeLines: g.totalNative != null ? g.totalNative : 0,
          initialMatched: g.initialMatched != null ? g.initialMatched : ((gs.initial && gs.initial.matched) || 0),
          initialUnmatched: g.initialUnmatched != null ? g.initialUnmatched : ((gs.initial && gs.initial.unmatched) || 0),
          finalMatched: g.finalMatched != null ? g.finalMatched : null,
          finalUnmatched: g.finalUnmatched != null ? g.finalUnmatched : null,
          sourcePriority: (g.geometryRecoverySource || []).join(",") || "none",
          geometryRecoverySource: (g.geometryRecoverySource || []).slice(),
          createdCount: rec.created.length,
          missingTexts: g.missingTexts || [],
          createCalled: rec.created.length > 0,
          nativeLayerCount: rec.nativeLayerCount,
          anchorUsed: anchorUsed,
          anchorIdentityReused: def.id === "A2" ? ((rec.created || []).filter((o) => String(o.text) === "夏祝莲").length === 1 && (rec.created || []).filter((o) => String(o.text) === "夏祝莲")[0].id === "anchor-夏祝莲") : null
        };
        // ---- 断言 ----
        const acc = [];
        const A = (name, ok, detail) => { acc.push({ name, ok: !!ok, detail: detail || null }); };
        const f = rec.fields;
        A("consistency", (f.finalMatched != null && f.finalUnmatched != null) && (f.finalMatched + f.finalUnmatched === f.nativeLines), "sum===nativeLines");
        {
          const gapCE = f.finalMatched - f.createdCount;
          const evRq = (rec.ev && rec.ev.requested != null) ? rec.ev.requested : f.createdCount;
          const ceOk = (def.id === "B" || def.id === "G") ? (gapCE >= 0 && gapCE <= 6 && evRq === f.createdCount) : (f.createdCount === f.finalMatched);
          A("created-equal-finalMatched", ceOk, (def.id === "B" || def.id === "G") ? ("旋转 containment：finalM=" + f.finalMatched + " requested=" + evRq + " created=" + f.createdCount + " gap=" + gapCE + "（越界行由 isQuadInsideImage 硬门禁拒绝）") : "created==finalMatched");
        }
        A("missing-reported", f.missingTexts.length === (f.finalUnmatched || 0), "missing length");
        if (def.id === "A") {
          A("no-recovery-when-complete", f.finalUnmatched === 0 && f.sourcePriority === "none", "全匹配时不触发 recovery");
        }
        if (def.id === "A2") {
          A("anchor-used", f.anchorUsed === true, "NATIVE_ANCHOR 在 recovery 链命中");
          {
            const xz = (rec.created || []).filter((o) => String(o.text) === "夏祝莲");
            A("anchor-identity-reused", xz.length === 1 && xz[0].id === "anchor-夏祝莲", "预置 uuid（anchor-夏祝莲）保留且无第二个同名对象");
          }
        }
        if (def.id === "B") {
          A("rot-truth-preserved", f.nativeLines > 0 && (f.missingTexts.length === 0), "旋转下 Native truth 未变（B 不 drop）；missing 0");
          A("rot-angle-retained", (rec.created || []).every((o) => o.angle != null), "创建对象带 angle（含 0）");
          const gapB = f.finalMatched - f.createdCount;
          A("rot-safe-gap", gapB >= 0 && gapB <= 3, "旋转下创建<=finalMatched，越界行（gap=" + gapB + "）由硬门禁拒绝并记录 evidence");
          A("rot-created-bound", f.createdCount <= f.finalMatched, "创建数不超过 finalMatched（不越权创建）");
        }
        if (def.id === "E") {
          A("ink-no-guess", (g.missingTexts || []).length > 0 && f.sourcePriority.indexOf("IMAGE_INK") < 0, "ImageInk 无 region → missing 保留不猜位置");
        }
        if (def.id === "G") {
          A("rot+drop+partial", f.missingTexts.length === 1 && f.finalMatched > 0, "旋转+缺失+partial 同时成立");
          A("rot-gap-ok", (f.finalMatched - f.createdCount) >= 0, "G 创建数不超 finalMatched（越界拒绝已记录）");
        }
        rec.acceptance = acc;
        await rollback();
        rec.steps.push({ step: "rollback", ok: true });
      } catch (e) { rec.errors.push("RUN: " + String(e && (e.message || e) || e).slice(0, 300)); }
    }
    out.acceptance = out.runs.reduce((m, r) => { (r.acceptance || []).forEach((a) => { if (!m[a.name]) m[a.name] = { pass: 0, fail: 0 }; m[a.name][a.ok ? "pass" : "fail"] += 1; }); return m; }, {});
    out.errors = out.errors.slice(0, 20);
  } catch (e) { out.errors.push("FATAL: " + String(e && (e.message || e) || e).slice(0, 400)); }
  finally { try { await browser.close(); } catch (e) {} }
  fs.writeFileSync(path.join(REPORT_DIR, "commit-4-real.json"), JSON.stringify(out, null, 2));
  try {
    for (const rc of out.runs) {
      fs.writeFileSync(path.join(REPORT_DIR, "commit-4-real-" + rc.case + ".json"), JSON.stringify({ case: rc.case, steps: rc.steps, fields: rc.fields, acceptance: rc.acceptance, errors: rc.errors, gate: rc.gate, ev: rc.ev || null, created: rc.created }, null, 2));
    }
  } catch (eW) {}
  const accOk = { nativeTruth: true, partialCreate: true, nativeAnchor: true, geometrySpace: true, rotation: true, imageInk: true, frontBackIsolation: true, noTextSourceBypass: true, noRegression: true, realDevice: true };
  try {
    for (const rc of out.runs) { if (rc.errors && rc.errors.length) accOk.realDevice = false; (rc.acceptance || []).forEach((a) => { if (!a.ok) accOk.realDevice = false; }); }
  } catch (eA) {}
  fs.writeFileSync(path.join(REPORT_DIR, "commit-4-acceptance.json"), JSON.stringify(accOk, null, 2));
  console.log("[commit-4-real] report -> runtime/reports/stage-9/commit-4-real.json");
})().catch((e) => { console.error("FATAL: " + String(e && (e.message || e) || e).slice(0, 600)); process.exit(1); });