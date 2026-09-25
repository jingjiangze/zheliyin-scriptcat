// runtime/stage9/commit-46w-no-session-ui-real.js — 去掉「原生 OCR 会话(自动更新 Cookie)」UI 真机验收
// ---------------------------------------------------------------------
// 目的：真机验证 UI 已无会话设置项，且会话保活仍在后台按默认执行。
// 场景：进入设计编辑页 → 注入 userscript → 校验浮窗内无任何 zy-ocr-session-* 控件
//   → 等待后台首触（启动后 4s）→ 校验 GM 已写入会话状态（证明后台保活运行，无需 UI）。
//
// 每轮（ROUNDS=2）串行断言：
//   U1 UI 无会话设置项：#zy-ocr-session-auto / -interval / -refresh / -status 全为 0；浮窗在；识别入口在
//   U2 后台保活：zyOcrSessionLastAt（时间戳）+ zyOcrSessionLastStatus 均被写入（首触 4s 内）
//   U3 回归：原生 OCR 栏（上一批移除）仍为 0
//
// 凭据：会话 cookie 走 session-probe 自动解析（本 runner 不调 AI）。
// 报告：runtime/reports/stage-11/commit-46w-no-session-ui-real.json
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
const REPORT_FILE = path.join(REPORT_DIR, "commit-46w-no-session-ui-real.json");
const adapter = require("../scriptcat-adapter");
const probeMod = require("./session-probe");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = process.env.ZY_URL || "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const ROUNDS = Number(process.env.ZY_ROUNDS || 2);
const MERGE = process.env.ZY_MERGE === "1";
const BVER = "0.3.11.91";

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
  const gate = fs.readFileSync(path.join(ROOT, "extension", "src", "ocr", "native-completeness-gate.js"), "utf8");
  t("bver", BVER === "0.3.11.91");
  t("rounds>=2", ROUNDS >= 2);
  t("no-session-ui-src", cc.indexOf("zy-ocr-session-auto") < 0 && cc.indexOf("zy-ocr-session-interval") < 0 && cc.indexOf("zy-ocr-session-refresh") < 0 && cc.indexOf("ocrSessionSettingsHtml") < 0 && cc.indexOf("bindOcrSessionControls") < 0);
  t("keeper-kept", cc.indexOf("startOcrSessionKeeper") >= 0 && cc.indexOf("touchNativeOcrSession") >= 0);
  t("no-native-panel", cc.indexOf("zy-native-ocr-panel") < 0);
  t("gate-split", gate.indexOf("NATIVE_EMPTY") >= 0 && gate.indexOf("NATIVE_TRUTH_PIPELINE_ERROR") >= 0 && gate.indexOf("无 Native 文字真值") >= 0);
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const sess = await probeMod.resolveStage9Cookie();
  const COOKIE_RAW = sess.raw || "";
  if (!COOKIE_RAW) { console.error("[commit-46w] 会话 cookie 解析失败：" + (sess.error || "NO_COOKIE")); process.exit(2); }
  let out = { ts: new Date().toISOString(), stage: "STAGE10-G-NO-SESSION-UI-REAL", cookieSource: sess.source || null, bverExpect: BVER, rounds: ROUNDS, runs: [], errors: [] };
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

    const setGm = () => page.evaluate(() => { try { localStorage.setItem("zy8dshim:zyShowTemplatePanel", JSON.stringify("1")); } catch (e) {} return true; });
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
      sessAuto: document.querySelectorAll("#zy-ocr-session-auto").length,
      sessInterval: document.querySelectorAll("#zy-ocr-session-interval").length,
      sessRefresh: document.querySelectorAll("#zy-ocr-session-refresh").length,
      sessStatus: document.querySelectorAll("#zy-ocr-session-status").length,
      panel: document.querySelectorAll("#zy-card-assistant").length,
      ocrBtn: !!document.querySelector("#zy-ocr-btn"),
      nativePanel: document.querySelectorAll("#zy-native-ocr-panel").length,
      nativeToolBtn: document.querySelectorAll("#zy-native-ocr-tool-btn").length
    }));
    const gmProbe = () => page.evaluate(() => {
      const g = (k) => { try { const v = localStorage.getItem("zy8dshim:" + k); return v == null ? null : JSON.parse(v); } catch (e) { return null; } };
      return { at: g("zyOcrSessionLastAt"), status: g("zyOcrSessionLastStatus"), auto: g("zyOcrSessionAuto") };
    });

    for (let rd = 0; rd < ROUNDS; rd += 1) {
      const R = { round: rd + 1, errors: [], steps: {} };
      try {
        // 清掉上一轮可能残留的会话状态，确保是「本轮后台写入」
        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => R.errors.push("GOTO: " + String(e && e.message || e).slice(0, 100)));
        await SLEEP(6000);
        await page.evaluate(() => { try { localStorage.removeItem("zy8dshim:zyOcrSessionLastAt"); localStorage.removeItem("zy8dshim:zyOcrSessionLastStatus"); } catch (e) {} }).catch(() => {});
        await setGm();
        await SLEEP(400);
        await injectPageWorld(pageWorldPayloadFor());
        await SLEEP(1600);
        const ready = await waitEditorReady(20);
        if (!(ready && ready.ok)) { R.errors.push("EDITOR_UNAVAILABLE"); out.runs.push(R); continue; }
        if (rd === 0) R.bver = ready.bver || null;
        if (rd === 0 && ready.bver && ready.bver !== BVER) R.errors.push("BRIDGE_VERSION_MISMATCH(" + String(ready.bver) + ")");
        if (!(await waitPanelReady(15))) { R.errors.push("PANEL_UNAVAILABLE"); out.runs.push(R); continue; }
        // U1 UI 无会话设置项
        const u1 = await uiProbe();
        R.steps.U1 = u1;
        if (u1.sessAuto !== 0 || u1.sessInterval !== 0 || u1.sessRefresh !== 0 || u1.sessStatus !== 0) R.errors.push("U1_SESSION_UI_PRESENT " + JSON.stringify(u1));
        if (u1.panel !== 1) R.errors.push("U1_PANEL_MISSING");
        if (!u1.ocrBtn) R.errors.push("U1_OCR_ENTRY_MISSING");
        // U3 回归：上一批移除的原生栏仍为 0
        R.steps.U3 = { nativePanel: u1.nativePanel, nativeToolBtn: u1.nativeToolBtn };
        if (u1.nativePanel !== 0 || u1.nativeToolBtn !== 0) R.errors.push("U3_NATIVE_PANEL_REGRESSED");
        // U2 后台保活：等首触（启动后 4s）写入 GM
        let gm = null;
        for (let i = 0; i < 20; i += 1) {
          gm = await gmProbe();
          if (gm && typeof gm.at === "number" && gm.at > 0 && gm.status) break;
          await SLEEP(1000);
        }
        R.steps.U2 = gm;
        if (!(gm && typeof gm.at === "number" && gm.at > 0)) R.errors.push("U2_KEEPER_NOT_RUN(at)");
        if (!(gm && gm.status)) R.errors.push("U2_KEEPER_NOT_RUN(status)");
      } catch (e) { R.errors.push("RUN: " + String(e && (e.message || e) || e).slice(0, 300)); }
      out.runs.push(R);
    }
    out.errors = out.errors.slice(0, 30);
  } catch (e) { out.errors.push("FATAL: " + String(e && (e.message || e) || e).slice(0, 400)); }
  finally { try { await browser.close(); } catch (e) {} }
  fs.writeFileSync(REPORT_FILE, JSON.stringify(out, null, 2));
  const okRuns = out.runs.filter((r) => (r.errors || []).length === 0).length;
  console.log("[commit-46w] report -> runtime/reports/stage-11/commit-46w-no-session-ui-real.json runs=" + out.runs.length + " cleanRuns=" + okRuns);
})().catch((e) => { console.error("FATAL: " + String(e && (e.message || e) || e).slice(0, 600)); process.exit(1); });
