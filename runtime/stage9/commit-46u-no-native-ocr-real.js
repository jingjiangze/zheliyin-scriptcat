// runtime/stage9/commit-46u-no-native-ocr-real.js — 去掉原生 OCR 栏 真机验收
// ---------------------------------------------------------------------
// 目的：真机验证「原生 OCR 栏已移除（不在 UI 显示），OCR 默认后台执行」。
// 场景：进入设计编辑页 → 注入 userscript → 校验无原生抽屉/工具按钮 → 模拟 SPA 变更（重挂 observer 应不存在）
//   → 点浮窗「识别图片文字」→ OCR 状态机在后台启动（无任何原生栏）。
//
// 每轮（ROUNDS=2）：N0 模式 = 轮1 旧 OCR-only("2") / 轮2 常规("1") —— 两种模式下原生栏都必须为 0。
//   N1 UI 结构：无 #zy-native-ocr-panel / 无 #zy-native-ocr-tool-btn / 无 #zy-native-status；浮窗存在；#zy-ocr-btn 存在
//   N2 SPA 重挂防护：body 变更后仍无原生栏（旧 observer 已移除）
//   N3 后台执行：点 #zy-ocr-btn → 状态进入「正在等待编辑器加载/正在准备图片」（无原生栏）
//
// 凭据：会话 cookie 走 session-probe 自动解析（本 runner 不调 AI）。
// 报告：runtime/reports/stage-11/commit-46u-no-native-ocr-real.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("../../node_modules/playwright");
const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const EXT_ID = "ndcooeababalnlpkfedmmbbbgkljhpjf";
const USERSCRIPT_PATH = path.join(ROOT, "zheliyin-card-assistant.user.js");
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-11");
const REPORT_FILE = path.join(REPORT_DIR, "commit-46u-no-native-ocr-real.json");
const adapter = require("../scriptcat-adapter");
const probeMod = require("./session-probe");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = process.env.ZY_URL || "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const ROUNDS = Number(process.env.ZY_ROUNDS || 2);
const MERGE = process.env.ZY_MERGE === "1";
const BVER = "0.3.11.84";
const MODES = ["2", "1"]; // 轮1 旧 OCR-only；轮2 常规

function parseCookies(raw) {
  const out = [];
  String(raw || "").split(";").forEach((part) => {
    const eq = part.indexOf("="); if (eq <= 0) return;
    const name = part.slice(0, eq).trim(); const value = part.slice(eq + 1).trim();
    if (!name || !value) return;
    out.push({ name: name, value: value.replace(/^"|"$/g, ""), domain: ".diy.zheliyin.com", path: "/", expires: -1 });
  });
  return out;
}
const GM_SHIM_SOURCE = [
  "try{window.__ZY8D_PAGE_WORLD__=true;",
  "if(typeof window.GM_getValue==='undefined'){window.GM_getValue=function(k,d){try{var v=localStorage.getItem('zy8dshim:'+k);return v==null?d:JSON.parse(v);}catch(e){return d;}};}",
  "if(typeof window.GM_setValue==='undefined'){window.GM_setValue=function(k,v){try{localStorage.setItem('zy8dshim:'+k,JSON.stringify(v));}catch(e){}};window.GM_deleteValue=function(k){try{localStorage.removeItem('zy8dshim:'+k);}catch(e){}};}",
  "if(typeof window.GM_xmlhttpRequest==='undefined'){window.GM_xmlhttpRequest=function(o){var u=o.url||'',m=(o.method||'POST');fetch(u,{method:m,headers:(o.headers||{}),body:o.data}).then(function(res){return res.text().then(function(t){return {status:res.status,responseText:t,response:t,readyState:4,finalUrl:u};});}).then(function(r){if(o.onload)try{o.onload(r);}catch(e){};}).catch(function(e){if(o.onerror)try{o.onerror({status:0,error:String(e&&e.message||e)||'fetch-error',responseText:''});}catch(e2){};});return {abort:function(){}};};}",
  "if(typeof window.GM_addStyle==='undefined'){window.GM_addStyle=function(css){var el=document.createElement('style');el.textContent=css;(document.head||document.documentElement).appendChild(el);return el;};}",
  "if(typeof window.GM_addElement==='undefined'){window.GM_addElement=function(tag,attrs){var el=document.createElement(tag);for(var k in (attrs||{})){try{el[k]=attrs[k];}catch(e){}};(document.head||document.documentElement).appendChild(el);return el;};}",
  "}catch(e){console.error('[zy8d-shim]',e);}"
].join("\n");
function injectUserscript() {
  let code = fs.readFileSync(USERSCRIPT_PATH, "utf8");
  ["test", "demo"].forEach((b) => { code = code.split(b + "/extension/src/").join("stage-9-altq-baidu-reconstruction/extension/src/"); });
  return code;
}
function pageWorldPayloadFor() {
  const parts = [GM_SHIM_SOURCE];
  const norm = injectUserscript();
  [...norm.matchAll(/\/\/ @require\s+(\S+)/g)].map((m) => m[1]).forEach((u) => {
    const mm = /\/extension\/src\/(.+)$/.exec(u); if (!mm) return;
    const rel = mm[1].split("?")[0]; const fp = path.join(ROOT, "extension", "src", rel);
    if (fs.existsSync(fp)) parts.push("// ==== @require " + rel + " ====\n" + fs.readFileSync(fp, "utf8"));
  });
  parts.push(norm);
  return parts.join("\n;\n");
}

function selfTest() {
  const t = (n, c) => { if (!c) throw new Error("SELFTEST FAIL " + n); console.log("[selftest] PASS " + n); };
  const cc = injectUserscript();
  t("bver", BVER === "0.3.11.84");
  t("rounds>=2", ROUNDS >= 2);
  t("no-native-panel-src", cc.indexOf("zy-native-ocr-panel") < 0 && cc.indexOf("mountNativeOcrPanel") < 0 && cc.indexOf("OCR_ONLY_MODE") < 0);
  t("ocr-entry-kept", cc.indexOf("handleOcrImage") >= 0 && cc.indexOf('id="zy-ocr-btn"') >= 0);
  t("floating-panel-kept", cc.indexOf('"zy-card-assistant"') >= 0 && cc.indexOf('id="zy-smart-fill"') >= 0);
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const sess = await probeMod.resolveStage9Cookie();
  const COOKIE_RAW = sess.raw || "";
  if (!COOKIE_RAW) { console.error("[commit-46u] 会话 cookie 解析失败：" + (sess.error || "NO_COOKIE")); process.exit(2); }
  let out = { ts: new Date().toISOString(), stage: "STAGE10-G-NO-NATIVE-OCR-REAL", cookieSource: sess.source || null, bverExpect: BVER, rounds: ROUNDS, modes: MODES, runs: [], errors: [] };
  if (MERGE && fs.existsSync(REPORT_FILE)) {
    try { const old = JSON.parse(fs.readFileSync(REPORT_FILE, "utf8")); if (old && Array.isArray(old.runs)) out.runs = old.runs; if (Array.isArray(old.errors)) out.errors = old.errors; } catch (e) {}
  }
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1280, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    const page = browser.pages()[0];
    page.on("pageerror", (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 200)); });
    try {
      await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await SLEEP(1400);
      const allOld = await adapter.getAllScripts(page) || [];
      for (const s of allOld.filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(page, s.uuid); } catch (e) {} }
    } catch (eClean) { out.errors.push("CLEAN: " + String(eClean && eClean.message || eClean).slice(0, 120)); }
    for (const c of parseCookies(COOKIE_RAW)) { try { await browser.addCookies([c]); } catch (e) { out.errors.push("COOKIE:" + c.name); } }

    const setGm = (mode) => page.evaluate((m) => {
      const set = (k, v) => { try { localStorage.setItem("zy8dshim:" + k, JSON.stringify(v)); } catch (e) {} };
      set("zyShowTemplatePanel", m);
      return true;
    }, mode);
    const injectPageWorld = (payload) => page.evaluate((code) => { const s = document.createElement("script"); s.textContent = code; (document.head || document.documentElement).appendChild(s); }, payload);
    const waitEditorReady = async (tries) => {
      for (let i = 0; i < (tries || 20); i += 1) {
        const r = await page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed), bver: (window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.ver) || null })).catch(() => ({}));
        if (r && r.ok && r.bridge) return r;
        await SLEEP(1200);
      }
      return { ok: false };
    };
    const waitPanelReady = async (tries) => {
      for (let i = 0; i < (tries || 15); i += 1) {
        const has = await page.evaluate(() => !!document.querySelector("#zy-raw") && !!document.querySelector("#zy-smart-fill")).catch(() => false);
        if (has) return true;
        await SLEEP(900);
      }
      return false;
    };
    const uiProbe = () => page.evaluate(() => ({
      nativePanel: document.querySelectorAll("#zy-native-ocr-panel").length,
      nativeToolBtn: document.querySelectorAll("#zy-native-ocr-tool-btn").length,
      nativeStatus: document.querySelectorAll("#zy-native-status").length,
      panel: document.querySelectorAll("#zy-card-assistant").length,
      ocrBtn: !!(document.querySelector("#zy-ocr-btn")),
      smartFill: !!(document.querySelector("#zy-smart-fill")),
      rightBar: !!document.querySelector(".rightPageBar.rightBar") || !!document.querySelector(".rightBar")
    }));
    const clickById = async (sel, timeoutMs) => {
      const t0 = Date.now();
      while (Date.now() - t0 < (timeoutMs || 12000)) {
        const r = await page.evaluate((s) => { const el = document.querySelector(s); if (el && el.offsetParent) { try { el.click(); return true; } catch (e) {} } return false; }, sel).catch(() => false);
        if (r) return { clicked: true };
        await SLEEP(700);
      }
      return { clicked: false };
    };
    const waitStatusContains = async (sub, timeoutMs) => {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        const st = await page.evaluate(() => { const el = document.querySelector("#zy-status"); return el ? String(el.textContent || "").trim().slice(0, 400) : null; }).catch(() => null);
        if (st && st.indexOf(sub) >= 0) return { done: true, st: st };
        await SLEEP(700);
      }
      return { done: false };
    };

    for (let rd = 0; rd < ROUNDS; rd += 1) {
      const mode = MODES[rd % MODES.length];
      const R = { round: rd + 1, mode: mode, errors: [], steps: {} };
      try {
        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => R.errors.push("GOTO: " + String(e && e.message || e).slice(0, 100)));
        await SLEEP(6000);
        await setGm(mode);
        await SLEEP(400);
        await injectPageWorld(pageWorldPayloadFor());
        await SLEEP(1600);
        const ready = await waitEditorReady(20);
        if (!(ready && ready.ok)) { R.errors.push("EDITOR_UNAVAILABLE"); out.runs.push(R); continue; }
        if (rd === 0) R.bver = ready.bver || null;
        if (rd === 0 && ready.bver && ready.bver !== BVER) R.errors.push("BRIDGE_VERSION_MISMATCH(" + String(ready.bver) + ")");
        if (!(await waitPanelReady(15))) { R.errors.push("PANEL_UNAVAILABLE"); out.runs.push(R); continue; }
        // N1 结构：无原生栏 + 浮窗在
        const u1 = await uiProbe();
        R.steps.N1 = u1;
        if (u1.nativePanel !== 0) R.errors.push("N1_NATIVE_PANEL_PRESENT " + u1.nativePanel);
        if (u1.nativeToolBtn !== 0) R.errors.push("N1_NATIVE_TOOL_BTN_PRESENT " + u1.nativeToolBtn);
        if (u1.nativeStatus !== 0) R.errors.push("N1_NATIVE_STATUS_PRESENT " + u1.nativeStatus);
        if (u1.panel !== 1) R.errors.push("N1_FLOATING_PANEL_MISSING " + u1.panel);
        if (!u1.ocrBtn) R.errors.push("N1_OCR_BTN_MISSING");
        // N2 SPA 重挂防护：body 变更后仍无原生栏
        await page.evaluate(() => { const d = document.createElement("div"); d.id = "zy-46u-spa-probe"; d.textContent = "spa"; document.body.appendChild(d); }).catch(() => {});
        await SLEEP(2600);
        const u2 = await uiProbe();
        R.steps.N2 = u2;
        if (u2.nativePanel !== 0 || u2.nativeToolBtn !== 0) R.errors.push("N2_REMOUNTED panel=" + u2.nativePanel + " btn=" + u2.nativeToolBtn);
        // N3 后台执行：点 识别图片文字 → 状态机启动（无原生栏）
        const c = await clickById("#zy-ocr-btn");
        const st = c.clicked ? await waitStatusContains("正在等待编辑器加载", 12000) : { done: false };
        const st2 = st.done ? st : (c.clicked ? await waitStatusContains("正在准备图片", 20000) : { done: false });
        await SLEEP(600);
        const u3 = await uiProbe();
        R.steps.N3 = { clicked: c.clicked, statusStarted: !!(st.done || st2.done), status: String((st2 && st2.st || st.st) || "").slice(0, 120), nativePanel: u3.nativePanel, nativeToolBtn: u3.nativeToolBtn };
        if (!c.clicked) R.errors.push("N3_OCR_BTN_NOT_CLICKED");
        if (!(st.done || st2.done)) R.errors.push("N3_OCR_STATE_NOT_STARTED");
        if (u3.nativePanel !== 0 || u3.nativeToolBtn !== 0) R.errors.push("N3_NATIVE_APPEARED_AFTER_OCR");
      } catch (e) { R.errors.push("RUN: " + String(e && (e.message || e) || e).slice(0, 300)); }
      out.runs.push(R);
    }
    out.errors = out.errors.slice(0, 30);
  } catch (e) { out.errors.push("FATAL: " + String(e && (e.message || e) || e).slice(0, 400)); }
  finally { try { await browser.close(); } catch (e) {} }
  fs.writeFileSync(REPORT_FILE, JSON.stringify(out, null, 2));
  const okRuns = out.runs.filter((r) => (r.errors || []).length === 0).length;
  console.log("[commit-46u] report -> runtime/reports/stage-11/commit-46u-no-native-ocr-real.json runs=" + out.runs.length + " cleanRuns=" + okRuns);
})().catch((e) => { console.error("FATAL: " + String(e && (e.message || e) || e).slice(0, 600)); process.exit(1); });
