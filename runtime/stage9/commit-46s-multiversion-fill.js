// runtime/stage9/commit-46s-multiversion-fill.js — P2 多版套版真机验收（仅当前版）
// ---------------------------------------------------------------------
// 目的：真机验证 P2「多版套版（仅当前版）」——版隔离 / 切版跟切 / 填当前面·填正反面。
// 场景：先点「背面」materialize 第二画布 → 开多版（依据第1版+新增1版）→ 两版各注入正反槽位 →
//   走真实 UI（粘贴客户文字 → 一键智能填充 → 「多版套版」区 填当前面/填正反面）。
//
// 每轮（ROUNDS=2）串行断言：
//   S1 多版建立：versionCount=2、totalLen=4、.pageWrapMulti li=2
//   S2 切版跟切(UI)：v0 时 #zy-mv-label 显示「第 1 版 / 共 2 版 ｜ 当前面：正面」
//   S3 两侧槽位注入后快照基线（v0/v1 正反文本）
//   S4 AI 预览 → 切到 v1：标签变「第 2 版」且 #zy-mv-status 含「已失效」（切版跟切 + 冻结匹配失效）
//        → 在 v1 点「填当前面」必须被拦截（不得写错版）→ 切回 v0 → 重新填充
//   S5 填当前面：仅 v0 当前面变化；v0 另一面不变；v1 正反 0 变化（版隔离）
//   S6 填正反面：仅 v0 正反变化；v1 正反 0 变化（版隔离）
//   S7 跨版拒绝(无 AI 依赖)：混版命令 → templateApplyV2 必须 VERSION_MISMATCH，且两侧零泄漏
//
// 凭据：ZY_AI_KEY（仅 env 临时注入，绝不落盘）；会话 cookie 走 session-probe 自动解析。
// 报告：runtime/reports/stage-11/commit-46s-multiversion-fill.json
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
const REPORT_FILE = path.join(REPORT_DIR, "commit-46s-multiversion-fill.json");
const adapter = require("../scriptcat-adapter");
const probeMod = require("./session-probe");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = process.env.ZY_URL || "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const ROUNDS = Number(process.env.ZY_ROUNDS || 2);
const MERGE = process.env.ZY_MERGE === "1";
const BVER = "0.3.11.82";
const AI_KEY = process.env.ZY_AI_KEY || "";
const AI_BASE_URL = process.env.ZY_AI_BASE_URL || "https://api.siliconflow.cn/v1";
const AI_MODEL = process.env.ZY_AI_MODEL || "Qwen/Qwen2.5-7B-Instruct";
const SLEEP_SWITCH = Number(process.env.ZY_SWITCH_SLEEP || 4500);
const MV_POLL_WAIT = Number(process.env.ZY_MV_POLL_WAIT || 4000); // > userscript 轮询间隔 1.5s

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

// 两版结构平行（便于「仅当前版被填」的隔离断言）。注入文本与客户文本刻意不同，便于检测变化。
const V0_FRONT = [
  { text: "启诚科技有限公司", fontSize: 16, fontFamily: "思源黑体 Regular" },
  { text: "王晓明", fontSize: 22, fontFamily: "思源黑体 Bold" },
  { text: "销售总监", fontSize: 14, fontFamily: "思源黑体 Regular" },
  { text: "13800000000", fontSize: 13, fontFamily: "思源黑体 Regular" }
];
const V0_BACK = [
  { text: "主营：企业咨询", fontSize: 14, fontFamily: "思源黑体 Regular" },
  { text: "服务热线：400-100-1000", fontSize: 12, fontFamily: "思源黑体 Regular" }
];
const V1_FRONT = JSON.parse(JSON.stringify(V0_FRONT));
const V1_BACK = JSON.parse(JSON.stringify(V0_BACK));
const PASTE_ROWS = ["正面：", "启诚科技有限公司", "王小明", "销售总监", "电话：13800138000",
  "反面：", "主营：企业信息化咨询", "服务热线：400-888-6666"];
const NAME_CUST = "王小明";         // 正面姓名客户值（应与注入「王晓明」不同）
const BACK_CUST_MARK = "企业信息化咨询"; // 反面客户值标记

function selfTest() {
  const t = (n, c) => { if (!c) throw new Error("SELFTEST FAIL " + n); console.log("[selftest] PASS " + n); };
  const cc = injectUserscript();
  t("bver", BVER === "0.3.11.82");
  t("rounds>=2", ROUNDS >= 2);
  t("p2-ui-present", cc.indexOf("zy-mv-apply-current") >= 0 && cc.indexOf("zy-mv-apply-both") >= 0 && cc.indexOf("zy-mv-label") >= 0);
  t("p2-select-fn", cc.indexOf("zySelectCommands") >= 0);
  t("has-multiversion-msg", cc.indexOf("getMultiVersionInfo") >= 0);
  t("markers-differ", NAME_CUST !== V0_FRONT[1].text);
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const sessCookie = await probeMod.resolveStage9Cookie();
  const COOKIE_RAW = sessCookie.raw || "";
  if (!COOKIE_RAW) { console.error("[commit-46s] 会话 cookie 解析失败：" + (sessCookie.error || "NO_COOKIE")); process.exit(2); }
  if (!AI_KEY) { console.error("[commit-46s] 缺少 ZY_AI_KEY 环境变量（仅临时注入，绝不落盘）。"); process.exit(2); }
  let out = { ts: new Date().toISOString(), stage: "STAGE10-G-P2-MULTIVERSION-FILL", cookieSource: sessCookie.source || null, aiModel: AI_MODEL, bverExpect: BVER, rounds: ROUNDS, runs: [], errors: [] };
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

    const setGm = async () => page.evaluate(({ baseUrl, model, key }) => {
      const set = (k, v) => { try { localStorage.setItem("zy8dshim:" + k, JSON.stringify(v)); } catch (e) {} };
      set("zyShowTemplatePanel", "1"); set("zyOcrMode", "baidu"); set("zyStage9NativeTruth", "1");
      set("zyArkApiKey", key); set("zyArkBaseUrl", baseUrl); set("zyArkModel", model);
      return true;
    }, { baseUrl: AI_BASE_URL, model: AI_MODEL, key: AI_KEY });

    const injectPageWorld = (payload) => page.evaluate((code) => { const s = document.createElement("script"); s.textContent = code; (document.head || document.documentElement).appendChild(s); }, payload);

    const canvasState = () => page.evaluate(() => {
      try {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const CV = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO || null;
        if (!CV) return { ok: false, reason: "NO_CanvasObjVO" };
        const total = Array.isArray(CV.totalCanvasArray) ? CV.totalCanvasArray : [];
        return { ok: true, count: total.length, currentCanvasNum: CV.currentCanvasNum != null ? CV.currentCanvasNum : null };
      } catch (e) { return { ok: false, reason: String(e && e.message || e).slice(0, 120) }; }
    }).catch((e) => ({ ok: false, reason: String(e && e.message || e).slice(0, 120) }));

    const clickPageSide = async (want, timeoutMs) => {
      const t0 = Date.now();
      while (Date.now() - t0 < (timeoutMs || 20000)) {
        const r = await page.evaluate((w) => {
          const els = Array.from(document.querySelectorAll(".page-group, .pageNum"));
          const hit = els.find((el) => String(el.textContent || "").trim() === w && el.offsetParent);
          if (hit) { try { hit.click(); return { clicked: true }; } catch (e) {} }
          return { clicked: false };
        }, want).catch(() => ({ clicked: false }));
        if (r && r.clicked) return r;
        await SLEEP(700);
      }
      return { clicked: false };
    };
    const waitCanvasCount = async (n, timeoutMs) => {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        const c = await canvasState();
        if (c && c.ok && c.count >= n) return c;
        await SLEEP(900);
      }
      return null;
    };
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
        const has = await page.evaluate(() => !!document.querySelector("#zy-raw") && !!document.querySelector("#zy-smart-fill") && !!document.querySelector("#zy-mv-label")).catch(() => false);
        if (has) return true;
        await SLEEP(900);
      }
      return false;
    };
    const expandPanels = () => page.evaluate(() => { document.querySelectorAll("#zy-card-assistant details.zy-settings").forEach((d) => { try { d.open = true; } catch (e) {} }); return true; }).catch(() => false);
    const readMvLabel = () => page.evaluate(() => { const el = document.getElementById("zy-mv-label"); return el ? String(el.textContent || "").trim() : null; }).catch(() => null);
    const readMvStatus = () => page.evaluate(() => { const el = document.getElementById("zy-mv-status"); return el ? String(el.textContent || "").trim() : null; }).catch(() => null);

    const injectSlotsOn = (canvasIdx, slotDefs, layerBase) => page.evaluate((json) => {
      const arg = JSON.parse(json);
      const req2 = window.requirejs || window.require;
      const vo2 = ((req2 && req2.s && req2.s.contexts && req2.s.contexts._ && req2.s.contexts._.defined && req2.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d2 = vo2 && vo2.totalCanvasArray && vo2.totalCanvasArray[arg.canvasIdx];
      if (!d2 || !d2.canvas || !d2.canvasObjInfo || typeof d2.drawText !== "function") return { ok: false, reason: "NO_CANVAS" };
      const cw = d2.canvas.getWidth ? d2.canvas.getWidth() : (d2.canvas.width || 300);
      const ch = d2.canvas.getHeight ? d2.canvas.getHeight() : (d2.canvas.height || 210);
      const baseLayer2 = (d2.canvasObjInfo.canvasToProductObjArr || []).length;
      let made = 0; const errs = [];
      arg.defs.forEach(function (s, i) {
        try {
          const left = cw * 0.12 + (i % 3) * 8;
          const top = ch * 0.1 + i * (ch * 0.075);
          const entry = { "media": { "mediaType": "text", "text": s.text, "font": { "pointSize": s.fontSize, "fontColor": "#111111", "isHorizontal": 1, "gravity": "left", "id": String(900 + arg.layerBase + i), "isItalic": 0, "textDecoration": "", "linethrough": 0, "overline": 0, "isBold": 0, "overprintStroke": 0 }, "charSpace": 0, "lineSpace": 1.2, "lineIdType": 0, "isBG": 0, "imgPath": "" }, "location": { "x": left, "y": top, "width": 160, "height": 36, "factWidth": 160, "factHeight": 36, "rotation": 0 }, "printLocation": { "x": left, "y": top, "width": 160, "height": 36, "rotation": 0 }, "layer": { "alpha": 1 }, "layerNum": arg.layerBase + baseLayer2 + i, "isEdit": 1, "isDisplay": 0, "deleteState": 0, "visitLevel": 1, "multiUuid": "cplq-s" + String(arg.layerBase + 201 + i), "markuuid": "", "topEnable": 1, "resourceType": 0, "maskEnable": 0, "lowPixelFlag": 0, "selectEnabled": 1, "isDesign": 1, "isComposite": 0, "isPreview": 0, "isDesignShape": 0 };
          d2.drawText(s.text, null, null, null, entry, arg.layerBase + baseLayer2 + i);
          made += 1;
        } catch (e) { errs.push(String(i) + ":" + String(e && e.message || e).slice(0, 90)); }
      });
      try { d2.canvas.requestRenderAll(); } catch (e) {}
      return { ok: made === arg.defs.length, made: made, total: arg.defs.length, errs: errs };
    }, JSON.stringify({ canvasIdx: canvasIdx, defs: slotDefs, layerBase: layerBase || 0 })).catch((e) => ({ ok: false, reason: String(e && e.message || e).slice(0, 100) }));

    const readV = async (v) => {
      const r = await bridgeCall("getTextInventoryAll", { version: v }, "getTextInventoryAllResult", 10000).catch(() => null);
      if (!r || !r.front) return null;
      return {
        version: (typeof r.version === "number") ? r.version : null,
        versionCount: (typeof r.versionCount === "number") ? r.versionCount : null,
        current: r.current || null,
        snapshotHash: r.snapshotHash || null,
        pageId: (r.page && r.page.pageId) || null,
        frontItems: Array.isArray(r.front.items) ? r.front.items : [],
        backItems: (r.back && Array.isArray(r.back.items)) ? r.back.items : [],
        backExists: !!(r.back && r.back.exists)
      };
    };
    const textsOf = (arr) => (Array.isArray(arr) ? arr.map((it) => String(it.text)) : []);
    const fillRawText = (rawLines) => page.evaluate((t) => { const ta = document.querySelector("#zy-raw"); if (!ta) return { ok: false }; ta.value = t; ta.dispatchEvent(new Event("input", { bubbles: true })); return { ok: true }; }, rawLines.join("\n"));
    const clickById = async (selector, timeoutMs) => {
      const t0 = Date.now();
      while (Date.now() - t0 < (timeoutMs || 15000)) {
        const r = await page.evaluate((sel) => { const el = document.querySelector(sel); if (el && el.offsetParent) { try { el.click(); return { clicked: true }; } catch (e) {} } return { clicked: false }; }, selector).catch(() => ({ clicked: false }));
        if (r && r.clicked) return r;
        await SLEEP(800);
      }
      return { clicked: false };
    };
    const waitStatusContains = async (sub, timeoutMs) => {
      const t0 = Date.now(); const samples = [];
      while (Date.now() - t0 < timeoutMs) {
        const r = await page.evaluate(() => { const el = document.querySelector("#zy-status"); return { st: el ? String(el.textContent || "").trim().slice(0, 1200) : null }; }).catch(() => ({}));
        const st = r && r.st;
        if (st) samples.push(String(st).slice(0, 1200));
        if (st && st.indexOf(sub) >= 0) return { done: true, st: st, samples: samples };
        await SLEEP(900);
      }
      return { done: false, samples: samples };
    };
    const previewOnce = async (timeoutMs) => {
      const c = await clickById("#zy-smart-fill");
      if (!(c && c.clicked)) return { done: false, reason: "BTN" };
      const d = await waitStatusContains("AI 槽位匹配完成（预览，未修改画布）", timeoutMs || 120000);
      return d;
    };
    const previewWithRetry = async () => { let d = await previewOnce(120000); if (!d.done) d = await previewOnce(120000); return d; };
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
    const clickGroupAt = async (idx, timeoutMs) => {
      const t0 = Date.now();
      while (Date.now() - t0 < (timeoutMs || 20000)) {
        const r = await page.evaluate((i) => {
          const gs = Array.from(document.querySelectorAll(".pageWrapMulti .page-group"));
          if (gs.length <= i) return { ok: false, len: gs.length };
          try { gs[i].click(); return { ok: true }; } catch (e) { return { ok: false }; }
        }, idx).catch(() => ({ ok: false }));
        if (r && r.ok) return r;
        await SLEEP(700);
      }
      return { ok: false };
    };

    for (let rd = 0; rd < ROUNDS; rd += 1) {
      const R = { round: rd + 1, errors: [], steps: {} };
      try {
        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => R.errors.push("GOTO: " + String(e && e.message || e).slice(0, 100)));
        await SLEEP(6000);
        // 1) 先点背面（materialize 第二画布）+ 开多版（纯 DOM 交互，无需桥）
        const cb = await clickPageSide("背面", 20000);
        const cAfterBack = await waitCanvasCount(2, 20000);
        const cf = await clickPageSide("正面", 20000);
        await SLEEP(2000);
        const mv = await openMultiVersion(1);
        R.steps.S1_apply = mv;
        await SLEEP(2000);
        if (!(cb && cb.clicked && cf && cf.clicked && cAfterBack)) R.errors.push("BACK_MATERIALIZE_FAIL");
        if (!(mv && mv.ok)) { R.errors.push("S1_OPEN_MULTIVERSION_FAIL " + JSON.stringify(mv).slice(0, 120)); out.runs.push(R); continue; }
        // 2) 注入 page world（桥/userscript 就绪后再读布局）
        await setGm();
        await SLEEP(400);
        await injectPageWorld(pageWorldPayloadFor());
        await SLEEP(1600);
        const ready = await waitEditorReady(20);
        if (!(ready && ready.ok)) { R.errors.push("EDITOR_UNAVAILABLE"); out.runs.push(R); continue; }
        if (rd === 0) R.bver = ready.bver || null;
        if (rd === 0 && ready.bver && ready.bver !== BVER) R.errors.push("BRIDGE_VERSION_MISMATCH(" + String(ready.bver) + ")");
        if (!(await waitPanelReady(15))) { R.errors.push("PANEL_UNAVAILABLE"); out.runs.push(R); continue; }
        await expandPanels();
        // 3) S1 多版建立（桥就绪后读）
        const L = await bridgeCall("getMultiVersionInfo", {}, "getMultiVersionInfoResult", 10000).catch(() => null);
        R.steps.S1 = L ? { ok: L.ok, code: L.code, vc: L.versionCount, tl: L.totalLen, cur: L.current, li: L.dom && L.dom.liCount, conflicts: L.conflicts, hard: L.hardConflicts } : null;
        if (!(L && L.versionCount === 2 && L.totalLen === 4 && L.dom && L.dom.liCount === 2)) { R.errors.push("S1_MULTIVERSION_FAIL " + JSON.stringify(R.steps.S1).slice(0, 200)); out.runs.push(R); continue; }
        // 切到 v0 正面
        await clickGroupAt(0); await SLEEP(SLEEP_SWITCH);
        // S2 切版跟切 label
        const lbl0 = await readMvLabel();
        R.steps.S2 = { label: lbl0 };
        if (!(lbl0 && lbl0.indexOf("第 1 版") >= 0 && lbl0.indexOf("共 2 版") >= 0 && lbl0.indexOf("正面") >= 0)) R.errors.push("S2_LABEL_V0_FAIL " + String(lbl0).slice(0, 80));
        // S3 注入两版双侧槽位
        const inj = {};
        inj.v0f = await injectSlotsOn(0, V0_FRONT, 0);
        inj.v0b = await injectSlotsOn(1, V0_BACK, 500);
        inj.v1f = await injectSlotsOn(2, V1_FRONT, 1000);
        inj.v1b = await injectSlotsOn(3, V1_BACK, 1500);
        R.steps.S3_inject = inj;
        await SLEEP(1800);
        if (!(inj.v0f && inj.v0f.ok && inj.v0b && inj.v0b.ok && inj.v1f && inj.v1f.ok && inj.v1b && inj.v1b.ok)) R.errors.push("S3_SLOT_INJECT_FAIL " + JSON.stringify(inj).slice(0, 200));
        const beforeV0 = await readV(0);
        const beforeV1 = await readV(1);
        R.steps.S3 = { v0: { front: textsOf(beforeV0 && beforeV0.frontItems), back: textsOf(beforeV0 && beforeV0.backItems) }, v1: { front: textsOf(beforeV1 && beforeV1.frontItems), back: textsOf(beforeV1 && beforeV1.backItems) } };
        if (!(beforeV0 && beforeV0.version === 0 && beforeV1 && beforeV1.version === 1)) R.errors.push("S3_READ_VERSION_FAIL");
        // S4 AI 预览 → 切版失效 → 误点拦截 → 切回
        const fill = await fillRawText(PASTE_ROWS);
        const doneP = (fill && fill.ok) ? await previewWithRetry() : { done: false };
        R.steps.S4_preview = { done: !!doneP.done };
        if (!doneP.done) R.errors.push("S4_AI_PREVIEW_NOT_DONE");
        if (doneP.done) {
          const sw1 = await clickGroupAt(2); // 切到第2版正面
          await SLEEP(MV_POLL_WAIT);
          const lbl1 = await readMvLabel();
          const st1 = await readMvStatus();
          R.steps.S4_switch = { label: lbl1, status: st1 };
          if (!(sw1 && sw1.ok && lbl1 && lbl1.indexOf("第 2 版") >= 0)) R.errors.push("S4_LABEL_V1_FAIL " + String(lbl1).slice(0, 80));
          if (!(st1 && st1.indexOf("已失效") >= 0)) R.errors.push("S4_STALE_NOT_SHOWN " + String(st1).slice(0, 80));
          // 误点填当前面 → 必须被拦截（不得写第2版）
          const clBad = await clickById("#zy-mv-apply-current");
          const doneBad = clBad && clBad.clicked ? await waitStatusContains("已失效", 10000) : { done: false };
          const afterBadV1 = await readV(1);
          R.steps.S4_block = { clicked: !!(clBad && clBad.clicked), blocked: !!doneBad.done, v1front: textsOf(afterBadV1 && afterBadV1.frontItems) };
          const leakBad = textsOf(afterBadV1 && afterBadV1.frontItems || []).some((x) => String(x) === NAME_CUST);
          if (!doneBad.done) R.errors.push("S4_STALE_APPLY_NOT_BLOCKED");
          if (leakBad) R.errors.push("S4_STALE_LEAK_INTO_V1");
          // 切回 v0 正面并重新预览
          await clickGroupAt(0); await SLEEP(SLEEP_SWITCH);
          const doneP2 = await previewWithRetry();
          R.steps.S4_preview2 = { done: !!doneP2.done };
          if (!doneP2.done) R.errors.push("S4_AI_PREVIEW2_NOT_DONE");
          // S5 填当前面
          if (doneP2.done) {
            const cA = await clickById("#zy-mv-apply-current");
            const dA = cA && cA.clicked ? await waitStatusContains("填当前面", 30000) : { done: false };
            await SLEEP(1200);
            const aV0 = await readV(0); const aV1 = await readV(1);
            const v0f = textsOf(aV0 && aV0.frontItems), v0b = textsOf(aV0 && aV0.backItems);
            const v1f = textsOf(aV1 && aV1.frontItems), v1b = textsOf(aV1 && aV1.backItems);
            R.steps.S5 = { clicked: !!(cA && cA.clicked), status: dA.done ? String(dA.st).slice(0, 200) : null, v0front: v0f, v0back: v0b, v1front: v1f, v1back: v1b };
            if (!dA.done) R.errors.push("S5_APPLY_CURRENT_NOT_DONE");
            const frontChanged = JSON.stringify(v0f) !== JSON.stringify(textsOf(beforeV0 && beforeV0.frontItems));
            if (!frontChanged) R.errors.push("S5_V0_FRONT_NOT_CHANGED");
            if (JSON.stringify(v0b) !== JSON.stringify(textsOf(beforeV0 && beforeV0.backItems))) R.errors.push("S5_V0_BACK_MUTATED");
            if (JSON.stringify(v1f) !== JSON.stringify(textsOf(beforeV1 && beforeV1.frontItems))) R.errors.push("S5_V1_FRONT_MUTATED(版隔离失败)");
            if (JSON.stringify(v1b) !== JSON.stringify(textsOf(beforeV1 && beforeV1.backItems))) R.errors.push("S5_V1_BACK_MUTATED(版隔离失败)");
          }
          // S6 填正反面（重新预览）
          const doneP3 = await previewWithRetry();
          if (doneP3.done) {
            const beforeV0b2 = await readV(0);
            const cB = await clickById("#zy-mv-apply-both");
            const dB = cB && cB.clicked ? await waitStatusContains("填正反面", 30000) : { done: false };
            await SLEEP(1200);
            const bV0 = await readV(0); const bV1 = await readV(1);
            R.steps.S6 = { clicked: !!(cB && cB.clicked), v0front: textsOf(bV0 && bV0.frontItems), v0back: textsOf(bV0 && bV0.backItems), v1front: textsOf(bV1 && bV1.frontItems), v1back: textsOf(bV1 && bV1.backItems) };
            if (!dB.done) R.errors.push("S6_APPLY_BOTH_NOT_DONE");
            const backChanged = JSON.stringify(textsOf(bV0 && bV0.backItems)) !== JSON.stringify(textsOf(beforeV0 && beforeV0.backItems));
            R.steps.S6.backChanged = backChanged;
            if (!backChanged) R.errors.push("S6_V0_BACK_NOT_CHANGED");
            if (JSON.stringify(textsOf(bV1 && bV1.frontItems)) !== JSON.stringify(textsOf(beforeV1 && beforeV1.frontItems))) R.errors.push("S6_V1_FRONT_MUTATED(版隔离失败)");
            if (JSON.stringify(textsOf(bV1 && bV1.backItems)) !== JSON.stringify(textsOf(beforeV1 && beforeV1.backItems))) R.errors.push("S6_V1_BACK_MUTATED(版隔离失败)");
          }
        }
        // S7 跨版拒绝（无 AI 依赖）：混版命令必须被拒 + 零泄漏
        await clickGroupAt(0); await SLEEP(SLEEP_SWITCH);
        const s7Inv = await readV(0);
        const pid = (s7Inv && s7Inv.pageId) || null;
        const idxBase = (s7Inv && s7Inv.frontItems || []).map(function (it, i) { return { version: 0, side: "front", slotId: "front-" + (i + 1), slotIdx: i, objectUuid: it.objectUuid || null, customerText: "P2-跨版应被拒" }; });
        const mixed = idxBase.slice(0, 1).concat([{ version: 1, side: "front", slotId: "front-1", slotIdx: 0, objectUuid: null, customerText: "P2-跨版应被拒" }]);
        const ap = await bridgeCall("templateApplyV2", { commands: mixed, pageId: pid, slotsCount: {}, planHash: null }, "templateApplyV2Result", 25000).catch(() => null);
        await SLEEP(1000);
        const x0 = await readV(0); const x1 = await readV(1);
        R.steps.S7 = { applyResult: ap ? { ok: ap.ok, code: ap.code } : null, v0front: textsOf(x0 && x0.frontItems) };
        const rejected = !!(ap && ap.ok === false && ap.code === "VERSION_MISMATCH");
        if (!rejected) R.errors.push("S7_NOT_REJECTED " + JSON.stringify(ap && { ok: ap.ok, code: ap.code }).slice(0, 120));
        const leak0 = textsOf(x0 && x0.frontItems || []).some((x) => String(x) === "P2-跨版应被拒");
        const leak1 = textsOf(x1 && x1.frontItems || []).some((x) => String(x) === "P2-跨版应被拒");
        if (leak0 || leak1) R.errors.push("S7_LEAK(跨版写入泄漏)");
      } catch (e) { R.errors.push("RUN: " + String(e && (e.message || e) || e).slice(0, 300)); }
      out.runs.push(R);
    }
    out.errors = out.errors.slice(0, 30);
  } catch (e) { out.errors.push("FATAL: " + String(e && (e.message || e) || e).slice(0, 400)); }
  finally { try { await browser.close(); } catch (e) {} }
  fs.writeFileSync(REPORT_FILE, JSON.stringify(out, null, 2));
  const okRuns = out.runs.filter((r) => (r.errors || []).length === 0).length;
  console.log("[commit-46s] report -> runtime/reports/stage-11/commit-46s-multiversion-fill.json runs=" + out.runs.length + " cleanRuns=" + okRuns);
})().catch((e) => { console.error("FATAL: " + String(e && (e.message || e) || e).slice(0, 600)); process.exit(1); });
