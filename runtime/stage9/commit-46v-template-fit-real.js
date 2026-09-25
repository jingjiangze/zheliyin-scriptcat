// runtime/stage9/commit-46v-template-fit-real.js — M5 模板 Fit 引擎真机验收
// ---------------------------------------------------------------------
// 目的：真机验证「模板 Fit（字号自适应，默认开启）」在真实套版路径生效且不破坏冻结承诺。
// 场景：materialize 背面 → 注入正反槽位 → 捕获基线 → 粘贴【长文本】客户文字 → 一键智能填充（AI 预览）
//   → 确认套版（走 templateApplyV2 真实执行路径）→ 读回执 fontSizeEvidence + 读画布复测。
//
// 每轮（ROUNDS=2）串行断言：
//   M1 基线：front 槽位 fontSize/width/left/top/angle/fontFamily/fill/objectUuid
//   M2 预览：一键智能填充产出匹配（AI 预览完成）
//   M3 执行：确认套版完成（回执含 fontSizeEvidence）
//   M4 Fit 生效：至少 1 槽字号下降；任一槽字号不增；SHRINK 槽实测宽 ≤ 目标宽（不溢出）
//   M5 冻结：objectUuid/left/top/angle/fontId/fontFamily/fill 全槽零变化（仅 text + fontSize 可变）
//   M6 溢出规范：OVERFLOW 只允许出现在「已到最小字号」的槽位（到最小仍放不下 → 标位，不强行缩、不换行）；
//      且非 OVERFLOW 槽位的实测宽必须 ≤ 目标宽（无未标注溢出）。
//
// 凭据：ZY_AI_KEY（仅 env 临时注入，绝不落盘）；会话 cookie 走 session-probe 自动解析。
// 报告：runtime/reports/stage-11/commit-46v-template-fit-real.json
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
const REPORT_FILE = path.join(REPORT_DIR, "commit-46v-template-fit-real.json");
const adapter = require("../scriptcat-adapter");
const probeMod = require("./session-probe");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = process.env.ZY_URL || "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const ROUNDS = Number(process.env.ZY_ROUNDS || 2);
const MERGE = process.env.ZY_MERGE === "1";
const BVER = "0.3.11.85";
const AI_KEY = process.env.ZY_AI_KEY || "";
const AI_BASE_URL = process.env.ZY_AI_BASE_URL || "https://api.siliconflow.cn/v1";
const AI_MODEL = process.env.ZY_AI_MODEL || "Qwen/Qwen2.5-7B-Instruct";

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

const FRONT = [
  { text: "启诚科技有限公司", fontSize: 16, fontFamily: "思源黑体 Regular" },
  { text: "王晓明", fontSize: 22, fontFamily: "思源黑体 Bold" },
  { text: "销售总监", fontSize: 14, fontFamily: "思源黑体 Regular" },
  { text: "13800000000", fontSize: 13, fontFamily: "思源黑体 Regular" }
];
const BACK = [
  { text: "主营：企业咨询", fontSize: 14, fontFamily: "思源黑体 Regular" },
  { text: "服务热线：400-100-1000", fontSize: 12, fontFamily: "思源黑体 Regular" }
];
// 长文本客户值：明显长于模板占位（触发 Fit 缩字号）
const LONG_FRONT = ["正面：", "上海启诚科技有限公司（华东区域总部）", "王小明（销售总监）", "销售总监兼大客户部负责人", "电话：13800138000"];
const LONG_BACK = ["反面：", "主营：企业信息化咨询与数字化转型服务", "服务热线：400-888-6666"];
const FROZEN = ["objectUuid", "left", "top", "angle", "fontId", "fontFamily", "fill"];

function selfTest() {
  const t = (n, c) => { if (!c) throw new Error("SELFTEST FAIL " + n); console.log("[selftest] PASS " + n); };
  const cc = injectUserscript();
  const pb = fs.readFileSync(path.join(ROOT, "extension", "src", "editor", "page-bridge.js"), "utf8");
  const fit = fs.readFileSync(path.join(ROOT, "extension", "src", "editor", "template-text-fit.js"), "utf8");
  t("bver", BVER === "0.3.11.85");
  t("rounds>=2", ROUNDS >= 2);
  t("fit-module", fit.indexOf("function zyFitFontSize") >= 0 && fit.indexOf("function zyFitMatches") >= 0);
  t("bridge-wired", pb.indexOf("v2FitFn") >= 0 && pb.indexOf("fontSizeEvidence") >= 0 && pb.indexOf("zyFitFontSize") >= 0);
  t("injected-to-page", cc.indexOf("zyFitSrc") >= 0 && cc.indexOf("template-text-fit.js") >= 0);
  t("no-native-panel", cc.indexOf("zy-native-ocr-panel") < 0);
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const sess = await probeMod.resolveStage9Cookie();
  const COOKIE_RAW = sess.raw || "";
  if (!COOKIE_RAW) { console.error("[commit-46v] 会话 cookie 解析失败：" + (sess.error || "NO_COOKIE")); process.exit(2); }
  if (!AI_KEY) { console.error("[commit-46v] 缺少 ZY_AI_KEY 环境变量（仅临时注入，绝不落盘）。"); process.exit(2); }
  let out = { ts: new Date().toISOString(), stage: "STAGE10-G-M5-TEMPLATE-FIT-REAL", cookieSource: sess.source || null, aiModel: AI_MODEL, bverExpect: BVER, rounds: ROUNDS, runs: [], errors: [] };
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
      setTimeout(() => { if (!done) { window.removeEventListener("message", on); resolve({ skip: true }); } }, arg.timeoutMs);
      window.postMessage(Object.assign({ source: "zy-card-assistant", type: arg.type }, arg.payload || {}), location.origin);
    }), { type: type, payload: payload, replyType: replyType, timeoutMs: timeoutMs || 12000 });

    const setGm = () => page.evaluate(({ baseUrl, model, key }) => {
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
        if (!CV) return { ok: false };
        const total = Array.isArray(CV.totalCanvasArray) ? CV.totalCanvasArray : [];
        return { ok: true, count: total.length };
      } catch (e) { return { ok: false }; }
    }).catch(() => ({ ok: false }));
    const clickPageSide = async (want, timeoutMs) => {
      const t0 = Date.now();
      while (Date.now() - t0 < (timeoutMs || 20000)) {
        const r = await page.evaluate((w) => { const els = Array.from(document.querySelectorAll(".page-group, .pageNum")); const hit = els.find((el) => String(el.textContent || "").trim() === w && el.offsetParent); if (hit) { try { hit.click(); return true; } catch (e) {} } return false; }, want).catch(() => false);
        if (r) return { clicked: true };
        await SLEEP(700);
      }
      return { clicked: false };
    };
    const waitCanvasCount = async (n, timeoutMs) => {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) { const c = await canvasState(); if (c && c.ok && c.count >= n) return c; await SLEEP(900); }
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
        const has = await page.evaluate(() => !!document.querySelector("#zy-raw") && !!document.querySelector("#zy-smart-fill") && !!document.querySelector("#zy-apply-confirm")).catch(() => false);
        if (has) return true;
        await SLEEP(900);
      }
      return false;
    };
    const injectSlotsOn = (canvasIdx, slotDefs, layerBase) => page.evaluate((json) => {
      const arg = JSON.parse(json);
      const req2 = window.requirejs || window.require;
      const vo2 = ((req2 && req2.s && req2.s.contexts && req2.s.contexts._ && req2.s.contexts._.defined && req2.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d2 = vo2 && vo2.totalCanvasArray && vo2.totalCanvasArray[arg.canvasIdx];
      if (!d2 || !d2.canvas || !d2.canvasObjInfo || typeof d2.drawText !== "function") return { ok: false, reason: "NO_CANVAS" };
      const cw = d2.canvas.getWidth ? d2.canvas.getWidth() : 300, ch = d2.canvas.getHeight ? d2.canvas.getHeight() : 210;
      const baseLayer2 = (d2.canvasObjInfo.canvasToProductObjArr || []).length;
      let made = 0; const errs = [];
      arg.defs.forEach(function (s, i) {
        try {
          const left = cw * 0.12 + (i % 3) * 8, top = ch * 0.1 + i * (ch * 0.075);
          const entry = { "media": { "mediaType": "text", "text": s.text, "font": { "pointSize": s.fontSize, "fontColor": "#111111", "isHorizontal": 1, "gravity": "left", "id": String(900 + arg.layerBase + i), "isItalic": 0, "textDecoration": "", "linethrough": 0, "overline": 0, "isBold": 0, "overprintStroke": 0 }, "charSpace": 0, "lineSpace": 1.2, "lineIdType": 0, "isBG": 0, "imgPath": "" }, "location": { "x": left, "y": top, "width": 160, "height": 36, "factWidth": 160, "factHeight": 36, "rotation": 0 }, "printLocation": { "x": left, "y": top, "width": 160, "height": 36, "rotation": 0 }, "layer": { "alpha": 1 }, "layerNum": arg.layerBase + baseLayer2 + i, "isEdit": 1, "isDisplay": 0, "deleteState": 0, "visitLevel": 1, "multiUuid": "cplq-t" + String(arg.layerBase + 201 + i), "markuuid": "", "topEnable": 1, "resourceType": 0, "maskEnable": 0, "lowPixelFlag": 0, "selectEnabled": 1, "isDesign": 1, "isComposite": 0, "isPreview": 0, "isDesignShape": 0 };
          d2.drawText(s.text, null, null, null, entry, arg.layerBase + baseLayer2 + i); made += 1;
        } catch (e) { errs.push(String(i) + ":" + String(e && e.message || e).slice(0, 90)); }
      });
      try { d2.canvas.requestRenderAll(); } catch (e) {}
      return { ok: made === arg.defs.length, made: made, errs: errs };
    }, JSON.stringify({ canvasIdx: canvasIdx, defs: slotDefs, layerBase: layerBase || 0 })).catch((e) => ({ ok: false, reason: String(e && e.message || e).slice(0, 100) }));

    const readV = async (v) => {
      const r = await bridgeCall("getTextInventoryAll", { version: v }, "getTextInventoryAllResult", 10000).catch(() => null);
      if (!r || !r.front) return null;
      return { frontItems: Array.isArray(r.front.items) ? r.front.items : [], backItems: (r.back && Array.isArray(r.back.items)) ? r.back.items : [] };
    };
    const fillRawText = (rows) => page.evaluate((t) => { const ta = document.querySelector("#zy-raw"); if (!ta) return { ok: false }; ta.value = t; ta.dispatchEvent(new Event("input", { bubbles: true })); return { ok: true }; }, rows.join("\n"));
    const clickById = async (sel, timeoutMs) => {
      const t0 = Date.now();
      while (Date.now() - t0 < (timeoutMs || 15000)) {
        const r = await page.evaluate((s) => { const el = document.querySelector(s); if (el && el.offsetParent) { try { el.click(); return true; } catch (e) {} } return false; }, sel).catch(() => false);
        if (r) return { clicked: true };
        await SLEEP(800);
      }
      return { clicked: false };
    };
    const waitStatusContains = async (sub, timeoutMs) => {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        const st = await page.evaluate(() => { const el = document.querySelector("#zy-status"); return el ? String(el.textContent || "").trim().slice(0, 1200) : null; }).catch(() => null);
        if (st && st.indexOf(sub) >= 0) return { done: true, st: st };
        await SLEEP(900);
      }
      return { done: false };
    };
    const previewWithRetry = async () => {
      let c = await clickById("#zy-smart-fill");
      if (!c.clicked) return { done: false, reason: "BTN" };
      let d = await waitStatusContains("AI 槽位匹配完成（预览，未修改画布）", 120000);
      if (!d.done) { await clickById("#zy-smart-fill"); d = await waitStatusContains("AI 槽位匹配完成（预览，未修改画布）", 120000); }
      return d;
    };
    const armV2Recorder = () => page.evaluate(() => {
      window.__zy46v = { count: 0, last: null };
      if (!window.__zy46vHook) {
        window.__zy46vHook = true;
        window.addEventListener("message", (ev) => {
          const d = ev.data;
          if (d && d.source === "zy-card-assistant-page" && d.type === "templateApplyV2Result") { window.__zy46v.count += 1; window.__zy46v.last = d; }
        });
      }
      return true;
    });
    const readV2Recorder = () => page.evaluate(() => (window.__zy46v ? { count: window.__zy46v.count, fit: (window.__zy46v.last && window.__zy46v.last.fontSizeEvidence) || null, applied: (window.__zy46v.last && window.__zy46v.last.applied) || null, code: (window.__zy46v.last && window.__zy46v.last.code) || null } : null));
    const snapFrozen = (items) => (items || []).map((it) => { const o = {}; FROZEN.forEach((k) => { o[k] = it[k] != null ? String(it[k]) : null; }); o.fontSize = it.fontSize != null ? it.fontSize : null; o.width = it.width != null ? it.width : null; return o; });

    for (let rd = 0; rd < ROUNDS; rd += 1) {
      const R = { round: rd + 1, errors: [], steps: {} };
      try {
        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => R.errors.push("GOTO: " + String(e && e.message || e).slice(0, 100)));
        await SLEEP(6000);
        const cb = await clickPageSide("背面", 20000);
        const cAfterBack = await waitCanvasCount(2, 20000);
        const cf = await clickPageSide("正面", 20000);
        await SLEEP(2000);
        if (!(cb.clicked && cf.clicked && cAfterBack)) R.errors.push("BACK_MATERIALIZE_FAIL");
        await setGm();
        await SLEEP(400);
        await injectPageWorld(pageWorldPayloadFor());
        await SLEEP(1600);
        const ready = await waitEditorReady(20);
        if (!(ready && ready.ok)) { R.errors.push("EDITOR_UNAVAILABLE"); out.runs.push(R); continue; }
        if (rd === 0) R.bver = ready.bver || null;
        if (rd === 0 && ready.bver && ready.bver !== BVER) R.errors.push("BRIDGE_VERSION_MISMATCH(" + String(ready.bver) + ")");
        if (!(await waitPanelReady(15))) { R.errors.push("PANEL_UNAVAILABLE"); out.runs.push(R); continue; }
        await armV2Recorder();
        const injF = await injectSlotsOn(0, FRONT, 0);
        const injB = await injectSlotsOn(1, BACK, 500);
        await SLEEP(1800);
        if (!(injF.ok && injB.ok)) R.errors.push("SLOT_INJECT_FAIL " + JSON.stringify({ f: injF, b: injB }).slice(0, 160));
        const before = await readV(0);
        R.steps.M1 = { front: snapFrozen(before && before.frontItems), back: snapFrozen(before && before.backItems) };
        if (!(before && (before.frontItems || []).length === FRONT.length && (before.backItems || []).length === BACK.length)) R.errors.push("INJECT_COUNT_FAIL");
        // M2 预览
        const fill = await fillRawText(LONG_FRONT.concat(LONG_BACK));
        const prev = (fill && fill.ok) ? await previewWithRetry() : { done: false };
        R.steps.M2 = { previewDone: !!prev.done, status: String(prev.st || "").slice(0, 160) };
        if (!prev.done) { R.errors.push("AI_PREVIEW_NOT_DONE"); out.runs.push(R); continue; }
        // M3 执行（确认套版 → templateApplyV2）
        const cc = await clickById("#zy-apply-confirm");
        const done = cc.clicked ? await waitStatusContains("AI 填充完成", 30000) : { done: false };
        await SLEEP(1500);
        const rec = await readV2Recorder();
        const after = await readV(0);
        const beforeItems = (before && before.frontItems) || [];
        const afterItems = (after && after.frontItems) || [];
        R.steps.M3 = { clicked: cc.clicked, statusDone: done.done, v2Count: rec ? rec.count : null, v2Code: rec ? rec.code : null, evidence: rec ? rec.fit : null };
        if (!done.done) R.errors.push("M3_APPLY_NOT_DONE");
        if (!(rec && rec.count >= 1)) R.errors.push("M3_NO_V2_RESULT");
        // M4 Fit 生效：至少 1 槽字号下降；任一槽不增；SHRINK 槽实测宽 ≤ 目标宽
        const pairs = beforeItems.map((b, i) => ({ i: i, from: b.fontSize, to: (afterItems[i] || {}).fontSize, wFrom: b.width, wTo: (afterItems[i] || {}).width }));
        const shrunk = pairs.filter((p) => typeof p.from === "number" && typeof p.to === "number" && p.to < p.from);
        const grew = pairs.filter((p) => typeof p.from === "number" && typeof p.to === "number" && p.to > p.from);
        const ev = (rec && rec.fit) || [];
        const shrinkEv = ev.filter((e) => e && e.reason === "SHRINK");
        const badMeasure = shrinkEv.filter((e) => !(e.measured && typeof e.measured.width === "number" && typeof e.measured.limit === "number" && e.measured.width <= e.measured.limit + 1e-6));
        R.steps.M4 = { pairs: pairs, shrunkCount: shrunk.length, grewCount: grew.length, shrinkEvCount: shrinkEv.length, badMeasure: badMeasure.slice(0, 3) };
        if (!(shrunk.length >= 1)) R.errors.push("M4_FIT_NOT_ENGAGED(no slot shrank)");
        if (grew.length) R.errors.push("M4_FONT_GREW " + grew.slice(0, 2).map((p) => p.i + ":" + p.from + "->" + p.to).join(" | "));
        if (!(shrinkEv.length >= 1)) R.errors.push("M4_NO_SHRINK_EVIDENCE");
        if (badMeasure.length) R.errors.push("M4_SHRINK_STILL_OVERFLOW " + JSON.stringify(badMeasure[0]).slice(0, 160));
        // M5 冻结（仅 text + fontSize 可变）
        const frozenFails = [];
        for (let i = 0; i < beforeItems.length && i < afterItems.length; i += 1) {
          for (const k of FROZEN) {
            if (String(beforeItems[i][k]) !== String(afterItems[i][k])) { frozenFails.push("FROZEN[" + i + "]." + k + " " + String(beforeItems[i][k]).slice(0, 12) + "->" + String(afterItems[i][k]).slice(0, 12)); break; }
          }
        }
        R.steps.M5 = { frozenFails: frozenFails };
        if (frozenFails.length) R.errors.push("M5_FROZEN " + frozenFails.slice(0, 3).join(" | "));
        // M6 溢出规范：OVERFLOW 只能出现在已到最小字号的槽位；非 OVERFLOW 槽位不得实测溢出
        const ovf = ev.filter((e) => e && e.overflow);
        const minOf = (f) => Math.max(8, Math.round(f * 0.6));
        const badOvf = ovf.filter((e) => typeof e.from !== "number" || typeof e.to !== "number" || e.to !== minOf(e.from));
        const nonOvfOverflow = ev.filter((e) => e && !e.overflow && e.measured && typeof e.measured.width === "number" && typeof e.measured.limit === "number" && e.measured.width > e.measured.limit + 1e-6);
        R.steps.M6 = { overflowCount: ovf.length, overflowAtMinOnly: badOvf.length === 0, badOverflow: badOvf.slice(0, 3), unflaggedOverflow: nonOvfOverflow.slice(0, 3) };
        if (badOvf.length) R.errors.push("M6_OVERFLOW_NOT_AT_MIN " + JSON.stringify(badOvf[0]).slice(0, 160));
        if (nonOvfOverflow.length) R.errors.push("M6_UNFLAGGED_OVERFLOW " + JSON.stringify(nonOvfOverflow[0]).slice(0, 160));
      } catch (e) { R.errors.push("RUN: " + String(e && (e.message || e) || e).slice(0, 300)); }
      out.runs.push(R);
    }
    out.errors = out.errors.slice(0, 30);
  } catch (e) { out.errors.push("FATAL: " + String(e && (e.message || e) || e).slice(0, 400)); }
  finally { try { await browser.close(); } catch (e) {} }
  fs.writeFileSync(REPORT_FILE, JSON.stringify(out, null, 2));
  const okRuns = out.runs.filter((r) => (r.errors || []).length === 0).length;
  console.log("[commit-46v] report -> runtime/reports/stage-11/commit-46v-template-fit-real.json runs=" + out.runs.length + " cleanRuns=" + okRuns);
})().catch((e) => { console.error("FATAL: " + String(e && (e.message || e) || e).slice(0, 600)); process.exit(1); });
