// runtime/stage9/commit-46y-local-match-rule-real.js — 阶段1 P0-0：本地匹配规则真机 A/B 验收
// ---------------------------------------------------------------------
// 目的：在真实页面世界验证「本地 OCR 专用匹配规则」——off 保持历史行为、geometry-only 启用弱文字+唯一性规则。
// 手段：?zydebug 出口 + safeRecoverNativeGeometry（生产接线路径，ctx.localRule 透传至 recoverNativeGeometry）。
//
// 每轮断言：
//   A1 off 对照：低相似本地候选 → recovered=0（历史行为，不得放宽）
//   A2 geometry-only：弱文字 + 唯一 → recovered=1、source=LOCAL、method=LOCAL_GEOMETRY_ONLY、score<=0.7
//   A3 唯一性：两个同分候选 → recovered=0（宁缺勿滥）
//   A4 几何硬门：越界候选 → recovered=0（规则不放宽几何）
//
// 凭据：会话 cookie 走 session-probe（本 runner 不调 AI、不依赖站点 OCR 会话）
// 报告：runtime/reports/stage-11/commit-46y-local-match-rule-real.json
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
const REPORT_FILE = path.join(REPORT_DIR, "commit-46y-local-match-rule-real.json");
const adapter = require("../scriptcat-adapter");
const probeMod = require("./session-probe");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = (process.env.ZY_URL || "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do") + "?zydebug=1";
const ROUNDS = Number(process.env.ZY_ROUNDS || 2);
const MERGE = process.env.ZY_MERGE === "1";
const BVER = "0.3.11.90";

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
  const rec = fs.readFileSync(path.join(ROOT, "extension", "src", "ocr", "native-geometry-recovery.js"), "utf8");
  t("bver", BVER === "0.3.11.90");
  t("rounds>=2", ROUNDS >= 2);
  t("rule-impl", rec.indexOf("function matchLocalGeometryOnly(") >= 0 && rec.indexOf('ctx.localRule === "geometry-only"') >= 0);
  t("off-default", cc.indexOf('GM_getValue("zyLocalMatchRule", "off")') >= 0 && cc.indexOf("localRule: LOCAL_MATCH_RULE") >= 0);
  t("debug-hook", cc.indexOf("safeRecoverNativeGeometry: safeRecoverNativeGeometry") >= 0);
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const sess = await probeMod.resolveStage9Cookie();
  const COOKIE_RAW = sess.raw || "";
  if (!COOKIE_RAW) { console.error("[commit-46y] 会话 cookie 解析失败：" + (sess.error || "NO_COOKIE")); process.exit(2); }
  let out = { ts: new Date().toISOString(), stage: "STAGE10-G-LOCAL-MATCH-RULE-AB", cookieSource: sess.source || null, bverExpect: BVER, rounds: ROUNDS, runs: [], errors: [] };
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

    const injectPageWorld = (payload) => page.evaluate((code) => { const s = document.createElement("script"); s.textContent = code; (document.head || document.documentElement).appendChild(s); }, payload);
    const waitReady = async (tries) => {
      for (let i = 0; i < (tries || 20); i += 1) {
        const r = await page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed), bver: (window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.ver) || null, dbg: !!(window.__ZY_DEBUG__ && typeof window.__ZY_DEBUG__.safeRecoverNativeGeometry === "function") })).catch(() => ({}));
        if (r && r.ok && r.bridge && r.dbg) return r;
        await SLEEP(1200);
      }
      return { ok: false };
    };

    for (let rd = 0; rd < ROUNDS; rd += 1) {
      const R = { round: rd + 1, errors: [], steps: {} };
      try {
        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => R.errors.push("GOTO: " + String(e && e.message || e).slice(0, 100)));
        await SLEEP(6000);
        await page.evaluate((rule) => { try { localStorage.setItem("zy8dshim:zyShowTemplatePanel", JSON.stringify("1")); localStorage.setItem("zy8dshim:zyLocalMatchRule", JSON.stringify(rule)); } catch (e) {} }, rd === 0 ? "off" : "geometry-only").catch(() => {});
        await SLEEP(400);
        await injectPageWorld(pageWorldPayloadFor());
        await SLEEP(1600);
        const ready = await waitReady(20);
        if (!(ready && ready.ok)) { R.errors.push("EDITOR_UNAVAILABLE(dbg=" + String(ready && ready.dbg) + ")"); out.runs.push(R); continue; }
        if (rd === 0) R.bver = ready.bver || null;
        if (rd === 0 && ready.bver && ready.bver !== BVER) R.errors.push("BRIDGE_VERSION_MISMATCH(" + String(ready.bver) + ")");

        const probe = await page.evaluate(() => {
          const D = window.__ZY_DEBUG__;
          const bounds = { x: 0, y: 0, width: 400, height: 300 };
          const native = [{ id: 1, rawText: "甲公司", order: 0 }];
          const cand = (t2, x, y) => ({ text: t2, bbox: { x: x, y: y, width: 80, height: 20 }, sourceProvider: "LOCAL" });
          const run = (ctx) => { try { const r = D.safeRecoverNativeGeometry(native, Object.assign({ imageBounds: bounds }, ctx || {})); return { recovered: (r.recovered || []).length, source: r.recovered[0] && r.recovered[0].source, method: r.recovered[0] && r.recovered[0].method, score: r.recovered[0] && r.recovered[0].score, x: r.recovered[0] && r.recovered[0].geometry && r.recovered[0].geometry.bbox && r.recovered[0].geometry.bbox.x, diagErr: (r.diag && r.diag.error) || null }; } catch (e) { return { threw: String(e && (e.message || e)) }; } };
          return {
            off: run({ localCandidates: [cand("甲公旬", 10, 10)] }),
            onUnique: run({ localCandidates: [cand("甲公旬", 10, 10)], localRule: "geometry-only" }),
            onAmbiguous: run({ localCandidates: [cand("甲公旬", 10, 10), cand("甲公甸", 10, 120)], localRule: "geometry-only" }),
            onOutside: run({ localCandidates: [cand("甲公旬", 380, 290)], imageBounds: { x: 0, y: 0, width: 100, height: 60 }, localRule: "geometry-only" })
          };
        }).catch((e) => ({ err: String(e && e.message || e).slice(0, 140) }));
        R.steps = probe;
        if (probe.err) { R.errors.push("PROBE_FAIL " + probe.err); out.runs.push(R); continue; }
        const A = [["off", "off"], ["onUnique", "onUnique"], ["onAmbiguous", "onAmbiguous"], ["onOutside", "onOutside"]];
        A.forEach(([k, label]) => { if (probe[k] && probe[k].threw) R.errors.push("THREW[" + label + "] " + String(probe[k].threw).slice(0, 120)); });
        if (!(probe.off && probe.off.recovered === 0)) R.errors.push("A1_OFF_NOT_STRICT " + JSON.stringify(probe.off).slice(0, 140));
        if (!(probe.onUnique && probe.onUnique.recovered === 1 && probe.onUnique.source === "LOCAL" && probe.onUnique.method === "LOCAL_GEOMETRY_ONLY")) R.errors.push("A2_ON_NOT_RECOVERED " + JSON.stringify(probe.onUnique).slice(0, 160));
        if (!(probe.onUnique && typeof probe.onUnique.score === "number" && probe.onUnique.score <= 0.7 + 1e-9)) R.errors.push("A2_SCORE_CAP " + JSON.stringify(probe.onUnique).slice(0, 120));
        if (!(probe.onAmbiguous && probe.onAmbiguous.recovered === 0)) R.errors.push("A3_AMBIGUOUS_NOT_REJECTED " + JSON.stringify(probe.onAmbiguous).slice(0, 140));
        if (!(probe.onOutside && probe.onOutside.recovered === 0)) R.errors.push("A4_GEOMETRY_GATE_LEAK " + JSON.stringify(probe.onOutside).slice(0, 140));
      } catch (e) { R.errors.push("RUN: " + String(e && (e.message || e) || e).slice(0, 300)); }
      out.runs.push(R);
    }
    out.errors = out.errors.slice(0, 30);
  } catch (e) { out.errors.push("FATAL: " + String(e && (e.message || e) || e).slice(0, 400)); }
  finally { try { await browser.close(); } catch (e) {} }
  fs.writeFileSync(REPORT_FILE, JSON.stringify(out, null, 2));
  const okRuns = out.runs.filter((r) => (r.errors || []).length === 0).length;
  console.log("[commit-46y] report -> runtime/reports/stage-11/commit-46y-local-match-rule-real.json runs=" + out.runs.length + " cleanRuns=" + okRuns);
})().catch((e) => { console.error("FATAL: " + String(e && (e.message || e) || e).slice(0, 600)); process.exit(1); });
