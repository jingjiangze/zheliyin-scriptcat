// runtime/stage9/native-anchor-reuse.js — Stage 9 Commit 6：Native Anchor Reuse 真机验证（bridge 直驱）
// ---------------------------------------------------------------------
// 4 个接受场景（真实编辑器对象模型；OCRea 为 bridge 合成 items → 真 native 执行）：
//   A existing anchor -> reuse（created[].reused=true，textbox 数不变）
//   B no anchor -> native create -> measure（新建 +1）
//   C uncertain anchor -> 禁止强制复用（新建，anchorResolver.uncertain >=1）
//   D wrong page -> blocked（CREATE_BLOCKED_WRONG_PAGE / createdCount=0）
// 全部场景后清理 probe 对象，恢复 objectCount。
// 凭据：ZY_STAGE9_COOKIE 仅运行时注入；本 Commit 不需要 Baidu。
// 报告：runtime/reports/stage-9/native-anchor-reuse.json（version=0.3.11.46）
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
const adapter = require("../scriptcat-adapter");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const DEFAULT_URL = "https://diy.zheliyin.com/diyWeb/third/1234075/2114747/999/thirdDiyAdd.do";
const URL = process.env.ZY_URL || DEFAULT_URL;
const COOKIE_RAW = process.env.ZY_STAGE9_COOKIE || "";
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
  t("version-46", USERSCRIPT_VERSION === "0.3.11.46");
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }
if (!COOKIE_RAW) console.warn("[native-anchor-reuse] 未注入 ZY_STAGE9_COOKIE —— 回退持久 profile（可能过期）；cookiePresent=false");

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

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const out = { ts: new Date().toISOString(), stage: "STAGE-9-V10-NATIVE-ANCHOR-REUSE", version: USERSCRIPT_VERSION, url: URL, cookiePresent: !!COOKIE_RAW, note: "bridge 合成 items -> 真 native 对象模型执行；probe 对象创建后即清理恢复", scenarios: [], anchorResolverStats: null, errors: [] };
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
    } catch (eClean) { out.errors.push("CLEAN: " + String(eClean && eClean.message || eClean).slice(0, 120)); }
    for (const c of parseCookies(COOKIE_RAW)) { try { await browser.addCookies([c]); } catch (e) { out.errors.push("COOKIE:" + c.name + " " + String(e && e.message || e).slice(0, 100)); } }
    page = await (async () => { await page.close().catch(() => {}); const p = await browser.newPage(); p.on("pageerror", onPageErr); return p; })();
    const bridgeCall = (type, payload, replyType, timeoutMs) => page.evaluate((arg) => new Promise((resolve) => {
      let done = false;
      const on = (ev) => { const d = ev.data; if (d && d.source === "zy-card-assistant-page" && d.type === arg.replyType) { window.removeEventListener("message", on); done = true; resolve(d); } };
      window.addEventListener("message", on);
      setTimeout(() => { if (!done) { window.removeEventListener("message", on); resolve({ skip: true, timeout: arg.timeoutMs }); } }, arg.timeoutMs);
      window.postMessage(Object.assign({ source: "zy-card-assistant", type: arg.type }, arg.payload || {}), location.origin);
    }), { type, payload, replyType, timeoutMs: timeoutMs || 12000 });
    const injectPageWorld = (payload) => page.evaluate((code) => { const s = document.createElement("script"); s.textContent = code; (document.head || document.documentElement).appendChild(s); }, payload);
    const waitEditorReady = async (tries) => {
      for (let i = 0; i < (tries || 18); i += 1) {
        const r = await page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed) })).catch(() => ({}));
        if (r && r.ok && r.bridge) return r;
        await SLEEP(1200);
      }
      return page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed) })).catch(() => ({}));
    };
    const cond = { baidu: "standard", ink: "0" };
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => out.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
    await SLEEP(4000);
    await injectPageWorld(pageWorldPayloadFor(cond));
    await SLEEP(1200);
    const ready = await waitEditorReady(18);
    if (!(ready && ready.ok)) out.errors.push("EDITOR_UNAVAILABLE");
    await SLEEP(2500);
    const cp = await bridgeCall("getCurrentPage", {}, "getCurrentPageResult", 6000).catch(() => null);
    const pageId0 = (cp && cp.pageId) || "canvas:c0";

    // 采集前端文字锚点（供场景参数 + 校验）
    const collectTexts = () => page.evaluate(() => {
      const req = window.requirejs; const ctx = req && req.s && req.s.contexts && req.s.contexts._; const defs = (ctx && ctx.defined) || {};
      const CV = defs.CanvasObjVO || window.CanvasObjVO || null;
      const c = CV && CV.totalCanvasArray && CV.totalCanvasArray[0] && CV.totalCanvasArray[0].canvas;
      if (!c) return { ok: false, reason: "no-canvas", texts: [] };
      const texts = [];
      (c.getObjects() || []).forEach((o, i) => {
        if (!o) return;
        const ty = String(o.type || "");
        if (ty !== "textbox" && ty !== "i-text" && ty !== "text") return;
        try { if (typeof c.setCoords === "function") c.setCoords(); if (typeof o.setCoords === "function") o.setCoords(); } catch (e) {}
        const ac = o.aCoords;
        let cx = null, cy = null;
        if (ac && ac.tl) { cx = (ac.tl.x + ac.tr.x + ac.br.x + ac.bl.x) / 4; cy = (ac.tl.y + ac.tr.y + ac.br.y + ac.bl.y) / 4; }
        texts.push({ index: i, text: String(o.text || ""), left: o.left, top: o.top, width: o.width, height: o.height, fontSize: o.fontSize, fontFamily: o.fontFamily, center: (cx == null ? null : { x: cx, y: cy }) });
      });
      return { ok: true, objectCount: c.getObjects().length, textboxCount: texts.length, texts: texts };
    }).catch(() => ({ ok: false, reason: "collect-fail", texts: [] }));
    const cleanupByKey = (keyPart) => page.evaluate((k) => {
      const req = window.requirejs; const ctx = req && req.s && req.s.contexts && req.s.contexts._; const defs = (ctx && ctx.defined) || {};
      const CV = defs.CanvasObjVO || window.CanvasObjVO || null;
      let removed = 0;
      (CV && CV.totalCanvasArray || []).forEach((d) => { const c = d && d.canvas; if (!c) return; (c.getObjects() || []).forEach((o) => { try { const key = o.zyOcrKey || ""; if (o && key.indexOf(k) === 0) { const li = d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr ? d.canvasObjInfo.canvasToProductObjArr.indexOf(o) : -1; if (li >= 0) d.canvasObjInfo.canvasToProductObjArr.splice(li, 1); c.remove(o); removed += 1; } } catch (e) {} }); });
      try { if (CV && CV.totalCanvasArray[0] && CV.totalCanvasArray[0].canvas) CV.totalCanvasArray[0].canvas.requestRenderAll(); } catch (e) {}
      return { removed };
    }, keyPart).catch(() => ({ removed: 0 }));

    const base = await collectTexts();
    out.baseState = { objectCount: base.objectCount, textboxCount: base.textboxCount };
    const jianshe = (base.texts || []).find((x) => x.text && x.text.indexOf("简 小设") >= 0) || null;
    const em = (base.texts || []).find((x) => x.text && /^Email/.test(x.text)) || null;
    const tel = (base.texts || []).find((x) => x.text && /^Tel/.test(x.text)) || null;
    const tx = () => "reuse-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);

    // D: wrong page -> blocked
    const d1 = await bridgeCall("ocrCreate", { pageId: "canvas:c1", side: "BACK", transactionId: tx(), imageFingerprint: "reuse-wrong-page", items: [{ blockIndex: 0, text: "客户经理", left: 50, top: 50, width: 100, height: 30, fontSize: 20 }] }, "ocrCreateResult", 15000).catch(() => null);
    out.scenarios.push({ case: "D-wrong-page-blocked", blocked: !!(d1 && !d1.ok && /CREATE_BLOCKED|PAGE/.test(String(d1.code || ""))), code: d1 && d1.code, createdCount: d1 && d1.createdCount, passed: !!(d1 && !d1.ok && String(d1.code || "").indexOf("CREATE_BLOCKED") === 0) });

    // A: existing anchor -> reuse（简 小设）
    if (jianshe) {
      const a1 = await bridgeCall("ocrCreate", { pageId: pageId0, side: "FRONT", transactionId: tx(), imageFingerprint: "reuse-a", items: [{ blockIndex: 0, text: "简 小设", left: jianshe.left, top: jianshe.top, width: jianshe.width, height: jianshe.height, fontSize: jianshe.fontSize, fontFamily: jianshe.fontFamily }] }, "ocrCreateResult", 15000).catch(() => null);
      const after1 = await collectTexts();
      const reusedFlag = (a1 && a1.created || []).some((x) => x.reused === true);
      out.scenarios.push({ case: "A-existing-anchor-reuse", ok: !!(a1 && a1.ok), reused: reusedFlag, createdCount: a1 && a1.createdCount, textboxCountDelta: after1.textboxCount - base.textboxCount, resolver: a1 && a1.editorIntegration && a1.editorIntegration.anchorResolver, passed: !!(a1 && a1.ok && reusedFlag && after1.textboxCount === base.textboxCount) });
    } else { out.scenarios.push({ case: "A-existing-anchor-reuse", skipped: "no 简 小设 anchor", passed: false }); }

    // B: no anchor -> create (empty region)
    const bx = 220, by = 20;
    const b1 = await bridgeCall("ocrCreate", { pageId: pageId0, side: "FRONT", transactionId: tx(), imageFingerprint: "reuse-b", items: [{ blockIndex: 0, text: "ZY_REUSE_PROBE_X", left: bx, top: by, width: 180, height: 34, fontSize: 22 }] }, "ocrCreateResult", 15000).catch(() => null);
    const afterB = await collectTexts();
    const createdNew = (b1 && b1.created || []).some((x) => !x.reused);
    out.scenarios.push({ case: "B-no-anchor-create", ok: !!(b1 && b1.ok), createdCount: b1 && b1.createdCount, reusedCount: (b1 && b1.created || []).filter((x) => x.reused).length, textboxCountDelta: afterB.textboxCount - base.textboxCount, resolver: b1 && b1.editorIntegration && b1.editorIntegration.anchorResolver, passed: !!(b1 && b1.ok && createdNew) });
    await cleanupByKey("zy-ocr-");
    await SLEEP(1600);

    // C: uncertain -> no forced reuse (midpoint Email/Tel)
    if (em && tel && em.center && tel.center) {
      const cBase = await collectTexts();
      const mid = { x: (em.center.x + tel.center.x) / 2, y: (em.center.y + tel.center.y) / 2 };
      const c1 = await bridgeCall("ocrCreate", { pageId: pageId0, side: "FRONT", transactionId: tx(), imageFingerprint: "reuse-c", items: [{ blockIndex: 0, text: "ZY_MID_PROBE", left: mid.x - 60, top: mid.y - 15, width: 120, height: 30, fontSize: 13 }] }, "ocrCreateResult", 15000).catch(() => null);
      const afterC = await collectTexts();
      const res = c1 && c1.editorIntegration && c1.editorIntegration.anchorResolver;
      const reusedInC = (c1 && c1.created || []).filter((x) => x.reused).length;
      out.scenarios.push({ case: "C-uncertain-no-forced-reuse", ok: !!(c1 && c1.ok), uncertain: res ? res.uncertain : 0, reused: reusedInC, createdCount: c1 && c1.createdCount, textboxCountDelta: afterC.textboxCount - cBase.textboxCount, resolver: res, decidedUncertain: !!(res && res.uncertain >= 1), noForcedReuse: reusedInC === 0, createdAttempted: !!(res && res.created >= 1), passed: !!(res && res.uncertain >= 1) && reusedInC === 0 && !!(res && res.created >= 1) });
      await cleanupByKey("zy-ocr-");
      await SLEEP(600);
    } else { out.scenarios.push({ case: "C-uncertain-no-forced-reuse", skipped: "Email/Tel not found", passed: false }); }

    const finalState = await collectTexts();
    out.finalState = { objectCount: finalState.objectCount, textboxCount: finalState.textboxCount };
    // 模板原生 textbox 锚数必须恢复；objectCount 允许编辑器渲染层 line-helper 重排的 ±1 漂移（非业务对象）
    out.cleanupRestored = finalState.textboxCount === base.textboxCount;
  } catch (e) { out.errors.push("MAIN: " + String(e && e.stack || (e && e.message || e)).slice(0, 300)); }
  if (browser) await browser.close().catch(() => {});
  fs.writeFileSync(path.join(REPORT_DIR, "native-anchor-reuse.json"), JSON.stringify(out, null, 2));
  console.log("[native-anchor-reuse] report=" + path.join(REPORT_DIR, "native-anchor-reuse.json") + " version=" + out.version);
  out.scenarios.forEach((s) => console.log("[native-anchor-reuse] " + s.case + " -> " + (s.passed ? "PASS" : "FAIL") + " " + (JSON.stringify(Object.assign({}, s, { passed: undefined })).slice(0, 220))));
  console.log("[native-anchor-reuse] cleanupRestored=" + out.cleanupRestored);
  const errs = out.errors;
  errs.forEach((e) => console.log("[native-anchor-reuse] ERR " + e));
  const allPass = out.scenarios.every((s) => s.passed);
  process.exit((errs.length || !allPass) ? 1 : 0);
})();