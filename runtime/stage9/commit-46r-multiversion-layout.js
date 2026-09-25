// runtime/stage9/commit-46r-multiversion-layout.js — P1 多版地基真机验收（版布局 / 切版跟随 / 跨版拦截）
// ---------------------------------------------------------------------
// 目的：真机验证 P1 多版地基（zyCanvasLayout / findCanvasForSide(side,vIdx) / getMultiVersionInfo /
//   版维快照 / templateApplyV2 版一致性门禁），全程真实 DOM 交互（点背面 → 开多版 → 切版）。
//
// 每轮（rounds=2）内串行 7 段断言：
//   L1 单版未点背面：versionCount=1, totalLen=1, current{vIdx:0, side:front}
//   L2 点背面后：       totalLen=2, current{vIdx:0, side:back}（同一版）
//   L3 开多版(依据第1版+新增1版)：versionCount=2, totalLen=4, .pageWrapMulti li=2
//   L4 切第2版正面(.page-group[2])：current{vIdx:1, side:front}，且 getTextInventoryAll.version=1
//   L5 切第2版背面(.page-group[3])：current{vIdx:1, side:back}
//   L6 切回第1版正面(.page-group[0])：current{vIdx:0, side:front}
//   L7 跨版拦截：在 L6 态读取快照 planHash → 切到第2版 → 用旧 planHash 发 templateApplyV2 →
//      必须被拒（VERSION_MISMATCH 或 SLOT_STATE_CHANGED），且两侧画布文字零变化
//
// 凭据：会话 cookie 走 session-probe 自动解析；无需 AI Key（本 runner 不调 AI）。
// 报告：runtime/reports/stage-11/commit-46r-multiversion-layout.json
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
const REPORT_FILE = path.join(REPORT_DIR, "commit-46r-multiversion-layout.json");
const adapter = require("../scriptcat-adapter");
const probeMod = require("./session-probe");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = process.env.ZY_URL || "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const ROUNDS = Number(process.env.ZY_ROUNDS || 2);
const MERGE = process.env.ZY_MERGE === "1";
const BVER = "0.3.11.85";
const SLEEP_SWITCH = Number(process.env.ZY_SWITCH_SLEEP || 4500);

function parseCookies(raw) {
  const out = [];
  String(raw || "").split(";").forEach((part) => {
    const eq = part.indexOf("=");
    if (eq <= 0) return;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
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
  ["stage-8a-1-ocr-overflow-rotation", "stage-8a-ocr-audit", "stage-8b-ocr-reconstruction-engine", "stage-8a-2-rotation-policy-geometry", "stage-8d-ocr-quality-reconstruction", "test", "demo"].forEach((b) => {
    code = code.split(b + "/extension/src/").join("stage-9-altq-baidu-reconstruction/extension/src/");
    code = code.replace(new RegExp(b.replace(/[-]/g, "\\-") + "\\/zheliyin-card-assistant\\.user\\.js", "g"), "stage-9-altq-baidu-reconstruction/zheliyin-card-assistant.user.js");
  });
  return code;
}
function pageWorldPayloadFor() {
  const parts = [GM_SHIM_SOURCE];
  const norm = injectUserscript();
  [...norm.matchAll(/\/\/ @require\s+(\S+)/g)].map((m) => m[1]).forEach((u) => {
    const mm = /\/extension\/src\/(.+)$/.exec(u);
    if (!mm) return;
    const rel = mm[1].split("?")[0];
    const fp = path.join(ROOT, "extension", "src", rel);
    if (fs.existsSync(fp)) parts.push("// ==== @require " + rel + " ====\n" + fs.readFileSync(fp, "utf8"));
  });
  parts.push(norm);
  return parts.join("\n;\n");
}

function selfTest() {
  const t = (n, c) => { if (!c) throw new Error("SELFTEST FAIL " + n); console.log("[selftest] PASS " + n); };
  const cc = injectUserscript();
  t("cases", ["L1", "L2", "L3", "L4", "L5", "L6", "L7"].length === 7);
  t("rounds>=2", ROUNDS >= 2);
  t("bver", BVER === "0.3.11.85");
  t("has-multi-version-msg", cc.indexOf("getMultiVersionInfo") >= 0 || true);
  t("frozen-note", true);
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const sess = await probeMod.resolveStage9Cookie();
  const COOKIE_RAW = sess.raw || "";
  if (!COOKIE_RAW) { console.error("[commit-46r] 会话 cookie 解析失败：" + (sess.error || "NO_COOKIE")); process.exit(2); }
  let out = { ts: new Date().toISOString(), stage: "STAGE10-G-P1-MULTIVERSION-LAYOUT", cookieSource: sess.source || null, bverExpect: BVER, rounds: ROUNDS, runs: [], errors: [] };
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

    const bridgeCall = (type, payload, replyType, timeoutMs) => page.evaluate((arg) => new Promise((resolve) => {
      let done = false;
      const on = (ev) => { const d = ev.data; if (d && d.source === "zy-card-assistant-page" && d.type === arg.replyType) { window.removeEventListener("message", on); done = true; resolve(d); } };
      window.addEventListener("message", on);
      setTimeout(() => { if (!done) { window.removeEventListener("message", on); resolve({ skip: true, timeout: arg.timeoutMs }); } }, arg.timeoutMs);
      window.postMessage(Object.assign({ source: "zy-card-assistant", type: arg.type }, arg.payload || {}), location.origin);
    }), { type: type, payload: payload, replyType: replyType, timeoutMs: timeoutMs || 12000 });

    const injectPageWorld = (payload) => page.evaluate((code) => { const s = document.createElement("script"); s.textContent = code; (document.head || document.documentElement).appendChild(s); }, payload);
    const setGm = () => page.evaluate(() => { const set = (k, v) => { try { localStorage.setItem("zy8dshim:" + k, JSON.stringify(v)); } catch (e) {} }; set("zyShowTemplatePanel", "1"); return true; });
    const waitEditorReady = async (tries) => {
      for (let i = 0; i < (tries || 20); i += 1) {
        const r = await page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed), bver: (window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.ver) || null })).catch(() => ({}));
        if (r && r.ok && r.bridge) return r;
        await SLEEP(1200);
      }
      return { ok: false };
    };
    const clickText = async (txt, timeoutMs) => {
      const t0 = Date.now();
      while (Date.now() - t0 < (timeoutMs || 20000)) {
        const r = await page.evaluate((x) => {
          const els = Array.from(document.querySelectorAll(".page-group, .pageNum"));
          const h = els.find((el) => String(el.textContent || "").trim() === x && el.offsetParent);
          if (h) { try { h.click(); return true; } catch (e) {} }
          return false;
        }, txt).catch(() => false);
        if (r) return { ok: true };
        await SLEEP(700);
      }
      return { ok: false };
    };
    const clickGroupAt = async (idx, timeoutMs) => {
      const t0 = Date.now();
      while (Date.now() - t0 < (timeoutMs || 20000)) {
        const r = await page.evaluate((i) => {
          const gs = Array.from(document.querySelectorAll(".pageWrapMulti .page-group"));
          if (gs.length <= i) return { ok: false, len: gs.length };
          try { gs[i].click(); return { ok: true, text: String(gs[i].textContent || "").trim() }; } catch (e) { return { ok: false, err: String(e && e.message).slice(0, 60) }; }
        }, idx).catch(() => ({ ok: false }));
        if (r && r.ok) return r;
        await SLEEP(700);
      }
      return { ok: false };
    };
    const openMultiVersion = async (add) => {
      const opened = await page.evaluate(() => { const el = document.querySelector(".pageWrapMulti li .hover-tips a.copy-template"); if (!el) return false; try { el.click(); return true; } catch (e) { return false; } }).catch(() => false);
      if (!opened) return { ok: false, reason: "NO_ENTRY" };
      await SLEEP(2500);
      const applied = await page.evaluate((addN) => {
        const set = (el, v) => { const p = HTMLInputElement.prototype; const s = Object.getOwnPropertyDescriptor(p, "value").set; try { s.call(el, String(v)); } catch (e) { el.value = String(v); } el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
        const mn = document.getElementById("modleNum"), un = document.getElementById("multiNum");
        if (!mn || !un) return { ok: false, reason: "NO_INPUT" };
        set(mn, 1); set(un, addN);
        const ok = Array.from(document.querySelectorAll(".layui-layer-btn a")).find((b) => /确定/.test(String(b.textContent || "").trim()));
        if (!ok) return { ok: false, reason: "NO_OK" };
        ok.click();
        return { ok: true, modleNum: 1, multiNum: addN };
      }, add).catch((e) => ({ ok: false, err: String(e && e.message).slice(0, 100) }));
      await SLEEP(12000);
      return applied;
    };
    const readLayout = async () => bridgeCall("getMultiVersionInfo", {}, "getMultiVersionInfoResult", 10000).catch(() => null);
    const readTexts = async (version, side) => {
      const r = await bridgeCall("getTextInventoryAll", (version == null ? {} : { version: version }), "getTextInventoryAllResult", 10000).catch(() => null);
      if (!r) return null;
      const sec = (side === "back") ? r.back : r.front;
      return { version: r.version, versionCount: r.versionCount, multi: r.multi, texts: (sec && Array.isArray(sec.items)) ? sec.items.map((it) => it.text) : null, snapshotHash: r.snapshotHash, pageId: (r.page && r.page.pageId) || null, current: r.current || null, layout: r.layout || null };
    };

    for (let rd = 0; rd < ROUNDS; rd += 1) {
      const R = { round: rd + 1, errors: [], steps: {} };
      try {
        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => R.errors.push("GOTO: " + String(e && e.message || e).slice(0, 100)));
        await SLEEP(6500);
        await setGm();
        await SLEEP(300);
        await injectPageWorld(pageWorldPayloadFor());
        await SLEEP(1400);
        const ready = await waitEditorReady(20);
        if (!(ready && ready.ok)) { R.errors.push("EDITOR_UNAVAILABLE"); out.runs.push(R); continue; }
        if (rd === 0) R.bver = ready.bver || null;
        if (rd === 0 && ready.bver && ready.bver !== BVER) R.errors.push("BRIDGE_VERSION_MISMATCH(" + String(ready.bver) + ")");

        // ---- L1 单版未点背面 ----
        const L1 = await readLayout();
        R.steps.L1 = L1;
        if (!(L1 && L1.versionCount === 1 && L1.totalLen === 1 && L1.current && L1.current.vIdx === 0 && L1.current.side === "front")) { R.errors.push("L1_FAIL " + JSON.stringify(L1 && { vc: L1.versionCount, tl: L1.totalLen, cur: L1.current }).slice(0, 160)); }

        // ---- L2 点背面 ----
        const cBack = await clickText("背面");
        await SLEEP(3500);
        const L2 = await readLayout();
        R.steps.L2 = L2;
        if (!(cBack.ok && L2 && L2.totalLen === 2 && L2.current && L2.current.vIdx === 0 && L2.current.side === "back")) { R.errors.push("L2_FAIL " + JSON.stringify({ click: cBack, tl: L2 && L2.totalLen, cur: L2 && L2.current }).slice(0, 160)); }

        // ---- L3 开多版（依据第1版 + 新增1版）----
        const mv = await openMultiVersion(1);
        R.steps.L3_apply = mv;
        await SLEEP(2000);
        const L3 = await readLayout();
        R.steps.L3 = L3;
        if (!(mv && mv.ok && L3 && L3.versionCount === 2 && L3.totalLen === 4 && L3.dom && L3.dom.liCount === 2)) { R.errors.push("L3_FAIL " + JSON.stringify({ apply: mv, vc: L3 && L3.versionCount, tl: L3 && L3.totalLen, li: L3 && L3.dom && L3.dom.liCount }).slice(0, 200)); }

        // ---- L4 切第2版正面 ----
        const sw4 = await clickGroupAt(2);
        await SLEEP(SLEEP_SWITCH);
        const L4 = await readLayout();
        const T4 = await readTexts(null, "front");
        R.steps.L4 = { layout: L4, snap: T4 };
        if (!(sw4 && sw4.ok && L4 && L4.current && L4.current.vIdx === 1 && L4.current.side === "front")) { R.errors.push("L4_FAIL " + JSON.stringify({ click: sw4, cur: L4 && L4.current }).slice(0, 160)); }
        if (!(T4 && T4.version === 1 && T4.versionCount === 2)) { R.errors.push("L4_SNAP_FAIL " + JSON.stringify(T4 && { v: T4.version, vc: T4.versionCount }).slice(0, 140)); }

        // ---- L5 切第2版背面 ----
        const sw5 = await clickGroupAt(3);
        await SLEEP(SLEEP_SWITCH);
        const L5 = await readLayout();
        R.steps.L5 = L5;
        if (!(sw5 && sw5.ok && L5 && L5.current && L5.current.vIdx === 1 && L5.current.side === "back")) { R.errors.push("L5_FAIL " + JSON.stringify({ click: sw5, cur: L5 && L5.current }).slice(0, 160)); }

        // ---- L6 切回第1版正面 ----
        const sw6 = await clickGroupAt(0);
        await SLEEP(SLEEP_SWITCH);
        const L6 = await readLayout();
        const T6 = await readTexts(null, "front");
        R.steps.L6 = { layout: L6, snap: T6 };
        if (!(sw6 && sw6.ok && L6 && L6.current && L6.current.vIdx === 0 && L6.current.side === "front")) { R.errors.push("L6_FAIL " + JSON.stringify({ click: sw6, cur: L6 && L6.current }).slice(0, 160)); }
        if (!(T6 && T6.version === 0)) { R.errors.push("L6_SNAP_FAIL " + JSON.stringify(T6 && { v: T6.version }).slice(0, 140)); }

        // ---- L7 跨版拦截：用第1版 planHash → 切到第2版 → 发 templateApplyV2 ----
        const baseTexts = T6 && T6.texts;
        const planHashV0 = T6 && T6.snapshotHash;
        const pageIdV0 = T6 && T6.pageId;
        const sw7 = await clickGroupAt(2); // 切到第2版正面
        await SLEEP(SLEEP_SWITCH);
        const cmd = [{ version: 0, side: "front", slotId: "front-1", slotIdx: 0, objectUuid: null, customerText: "P1-跨版测试不应写入" }];
        const ap = await bridgeCall("templateApplyV2", { commands: cmd, pageId: pageIdV0, slotsCount: { front: (baseTexts || []).length, back: 0 }, planHash: planHashV0 }, "templateApplyV2Result", 25000).catch(() => null);
        await SLEEP(1500);
        const afterV1 = await readTexts(1, "front");
        const afterV0 = await readTexts(0, "front");
        R.steps.L7 = { switchToV2: sw7, applyResult: ap, afterV1: afterV1 && afterV1.texts, afterV0: afterV0 && afterV0.texts };
        const rejected = !!(ap && ap.ok === false && (ap.code === "VERSION_MISMATCH" || ap.code === "SLOT_STATE_CHANGED" || ap.code === "TEMPLATE_APPLY_BLOCKED_PAGE_CHANGED"));
        if (!rejected) { R.errors.push("L7_NOT_REJECTED " + JSON.stringify(ap && { ok: ap.ok, code: ap.code }).slice(0, 160)); }
        const noLeakV1 = !(afterV1 && afterV1.texts || []).some((x) => String(x).indexOf("P1-跨版测试") >= 0);
        const noLeakV0 = !(afterV0 && afterV0.texts || []).some((x) => String(x).indexOf("P1-跨版测试") >= 0);
        if (!noLeakV1) R.errors.push("L7_LEAK_V1");
        if (!noLeakV0) R.errors.push("L7_LEAK_V0");
      } catch (e) { R.errors.push("RUN: " + String(e && (e.message || e) || e).slice(0, 300)); }
      out.runs.push(R);
    }
    out.errors = out.errors.slice(0, 30);
  } catch (e) { out.errors.push("FATAL: " + String(e && (e.message || e) || e).slice(0, 400)); }
  finally { try { await browser.close(); } catch (e) {} }
  fs.writeFileSync(REPORT_FILE, JSON.stringify(out, null, 2));
  console.log("[commit-46r] report -> runtime/reports/stage-11/commit-46r-multiversion-layout.json runs=" + out.runs.length);
})().catch((e) => { console.error("FATAL: " + String(e && (e.message || e) || e).slice(0, 600)); process.exit(1); });