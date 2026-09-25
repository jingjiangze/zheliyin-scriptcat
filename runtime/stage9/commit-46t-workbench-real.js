// runtime/stage9/commit-46t-workbench-real.js — M4 可编辑匹配工作台真机验收
// ---------------------------------------------------------------------
// 目的：真机验证 M4 工作台「编辑 → 确认套版」闭环（原模板只读 / 客户值可编辑 / 点选分配 / 解绑 / 交换 / MANUAL_EDIT）。
// 场景：materialize 背面 → 注入正反槽位 → 粘贴客户文字 → 一键智能填充（AI）→ 在工作台编辑 → 确认套版 → 校验画布与冻结。
//
// 每轮（ROUNDS=2）串行断言：
//   A1 工作台渲染：可见、槽位行数=注入数、每行「原模板」非空、客户块 ≥1、汇总含「匹配工作台」
//   A2 解绑：解绑 front-1 → 该行客户值清空
//   A3 点选分配：点选一个客户块 → 分配所选块 → front-1 客户值 == 该块文本
//   A4 行内编辑：front-1 设为标记值 → 状态含「已手动编辑」、徽标=手动编辑（MANUAL_EDIT）
//   A5 交换：front-1 ↔ front-2 客户值互换
//   A6 确认套版：画布 front 第2槽 == 编辑值；对象数不变（不新建/不删除）
//   A7 冻结：objectUuid/left/top/width/angle/fontId/fontFamily/fill 全槽零变化（height 记证据不判）
//
// 凭据：ZY_AI_KEY（仅 env 临时注入，绝不落盘）；会话 cookie 走 session-probe 自动解析。
// 报告：runtime/reports/stage-11/commit-46t-workbench-real.json
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
const REPORT_FILE = path.join(REPORT_DIR, "commit-46t-workbench-real.json");
const adapter = require("../scriptcat-adapter");
const probeMod = require("./session-probe");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = process.env.ZY_URL || "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const ROUNDS = Number(process.env.ZY_ROUNDS || 2);
const MERGE = process.env.ZY_MERGE === "1";
const BVER = "0.3.11.86";
const AI_KEY = process.env.ZY_AI_KEY || "";
const AI_BASE_URL = process.env.ZY_AI_BASE_URL || "https://api.siliconflow.cn/v1";
const AI_MODEL = process.env.ZY_AI_MODEL || "Qwen/Qwen2.5-7B-Instruct";
const EDIT_MARK = "M4-编辑值";

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
const PASTE_ROWS = ["正面：", "启诚科技有限公司", "王小明", "销售总监", "电话：13800138000",
  "反面：", "主营：企业信息化咨询", "服务热线：400-888-6666"];
const FROZEN = ["objectUuid", "left", "top", "width", "angle", "fontId", "fontFamily", "fill"];

function selfTest() {
  const t = (n, c) => { if (!c) throw new Error("SELFTEST FAIL " + n); console.log("[selftest] PASS " + n); };
  const cc = injectUserscript();
  t("bver", BVER === "0.3.11.86");
  t("rounds>=2", ROUNDS >= 2);
  t("wb-ui", cc.indexOf("zy-wb-row") >= 0 && cc.indexOf("zy-wb-chip") >= 0 && cc.indexOf("data-assign") >= 0 && cc.indexOf("data-swap") >= 0);
  t("wb-fns", cc.indexOf("mwDoAssign") >= 0 && cc.indexOf("zyWbSwap") >= 0 && cc.indexOf("mwSyncPlan") >= 0);
  t("legacy-removed", cc.indexOf("正反面与字段（可编辑）") < 0);
  t("require-wb", cc.indexOf("template-match-workbench.js") >= 0);
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const sess = await probeMod.resolveStage9Cookie();
  const COOKIE_RAW = sess.raw || "";
  if (!COOKIE_RAW) { console.error("[commit-46t] 会话 cookie 解析失败：" + (sess.error || "NO_COOKIE")); process.exit(2); }
  if (!AI_KEY) { console.error("[commit-46t] 缺少 ZY_AI_KEY 环境变量（仅临时注入，绝不落盘）。"); process.exit(2); }
  let out = { ts: new Date().toISOString(), stage: "STAGE10-G-M4-WORKBENCH-REAL", cookieSource: sess.source || null, aiModel: AI_MODEL, bverExpect: BVER, rounds: ROUNDS, runs: [], errors: [] };
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
        const has = await page.evaluate(() => !!document.querySelector("#zy-raw") && !!document.querySelector("#zy-smart-fill") && !!document.getElementById("zy-match-block")).catch(() => false);
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
    const textsOf = (arr) => (Array.isArray(arr) ? arr.map((it) => String(it.text)) : []);
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

    // ---- 工作台 DOM 助手 ----
    const wbSnapshot = () => page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("#zy-match-rows .zy-wb-row")).map((r) => {
        const sid = r.getAttribute("data-slot");
        const inp = r.querySelector("input[data-cust=\"" + sid + "\"]");
        const tpl = r.querySelector(".zy-wb-tpl");
        const bd = r.querySelector(".zy-wb-badge");
        return { slotId: sid, tpl: tpl ? String(tpl.textContent || "").trim() : "", cust: inp ? String(inp.value) : null, badge: bd ? String(bd.textContent || "").trim() : "" };
      });
      const chips = Array.from(document.querySelectorAll("#zy-wb-blocks .zy-wb-chip")).map((c) => ({ blockId: c.getAttribute("data-block"), text: String((c.querySelector(".zy-wb-chip-tx") || {}).textContent || "").trim(), st: String((c.querySelector(".zy-wb-chip-st") || {}).textContent || "").trim() }));
      const sum = document.getElementById("zy-match-summary");
      const blk = document.getElementById("zy-match-block");
      return { visible: !!(blk && blk.style.display !== "none"), rows: rows, chips: chips, summary: sum ? String(sum.textContent || "").trim() : null };
    });
    const wbClickChip = (text) => page.evaluate((t) => { const cs = Array.from(document.querySelectorAll("#zy-wb-blocks .zy-wb-chip")); const c = cs.find((x) => String((x.querySelector(".zy-wb-chip-tx") || {}).textContent || "").trim() === t); if (!c) return false; c.click(); return true; }, text);
    const wbClickAssign = (slotId) => page.evaluate((s) => { const b = document.querySelector("#zy-match-rows [data-assign=\"" + s + "\"]"); if (!b) return false; b.click(); return true; }, slotId);
    const wbClickUnbind = (slotId) => page.evaluate((s) => { const b = document.querySelector("#zy-match-rows [data-unbind=\"" + s + "\"]"); if (!b) return false; b.click(); return true; }, slotId);
    const wbSetCust = (slotId, val) => page.evaluate((a) => { const i = document.querySelector("#zy-match-rows input[data-cust=\"" + a.s + "\"]"); if (!i) return false; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; try { set.call(i, a.v); } catch (e) { i.value = a.v; } i.dispatchEvent(new Event("change", { bubbles: true })); return true; }, { s: slotId, v: val });
    const wbSetSwap = (slotId, target) => page.evaluate((a) => { const s = document.querySelector("#zy-match-rows select[data-swap=\"" + a.s + "\"]"); if (!s) return false; s.value = a.t; s.dispatchEvent(new Event("change", { bubbles: true })); return true; }, { s: slotId, t: target });
    const pick = (items, k) => items ? items.map((it) => it[k]) : [];

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
        // 注入正反槽位
        const injF = await injectSlotsOn(0, FRONT, 0);
        const injB = await injectSlotsOn(1, BACK, 500);
        await SLEEP(1800);
        if (!(injF.ok && injB.ok)) R.errors.push("SLOT_INJECT_FAIL " + JSON.stringify({ f: injF, b: injB }).slice(0, 160));
        const before = await readV(0);
        R.steps.A0 = { front: textsOf(before && before.frontItems), back: textsOf(before && before.backItems), frozenBefore: (before && before.frontItems || []).map((it) => { const o = {}; FROZEN.forEach((k) => { o[k] = it[k] != null ? String(it[k]) : null; }); return o; }) };
        if (!(before && (before.frontItems || []).length === FRONT.length && (before.backItems || []).length === BACK.length)) R.errors.push("INJECT_COUNT_FAIL");
        // 一键智能填充（AI 预览 → 生成工作台）
        const fill = await fillRawText(PASTE_ROWS);
        const prev = (fill && fill.ok) ? await previewWithRetry() : { done: false };
        R.steps.A1_preview = { done: !!prev.done };
        if (!prev.done) { R.errors.push("AI_PREVIEW_NOT_DONE"); out.runs.push(R); continue; }
        // A1 工作台渲染
        const w1 = await wbSnapshot();
        const tplOk = w1.rows.filter((r) => r.tpl && r.tpl.indexOf("原模板：") === 0 && r.tpl.length > 4).length;
        R.steps.A1 = { visible: w1.visible, rowCount: w1.rows.length, chipCount: w1.chips.length, summary: w1.summary, tplNonEmpty: tplOk };
        if (!w1.visible) R.errors.push("A1_NOT_VISIBLE");
        if (w1.rows.length !== FRONT.length + BACK.length) R.errors.push("A1_ROW_COUNT " + w1.rows.length + " != " + (FRONT.length + BACK.length));
        if (!(tplOk === w1.rows.length)) R.errors.push("A1_TPL_EMPTY " + tplOk + "/" + w1.rows.length);
        if (!(w1.chips.length >= 1)) R.errors.push("A1_NO_CHIPS");
        if (!(w1.summary && w1.summary.indexOf("匹配工作台") >= 0)) R.errors.push("A1_SUMMARY " + String(w1.summary).slice(0, 80));
        // A2 解绑 front-1
        await wbClickUnbind("front-1");
        const w2 = await wbSnapshot();
        const r1b = w2.rows.find((r) => r.slotId === "front-1");
        R.steps.A2 = { front1: r1b };
        if (!(r1b && String(r1b.cust) === "")) R.errors.push("A2_UNBIND_FAIL " + JSON.stringify(r1b).slice(0, 120));
        // A3 点选分配：选一个文本非空的客户块 → 分配到 front-1
        const chip = (w2.chips.find((c) => c.text && c.text.length >= 2 && c.text !== EDIT_MARK)) || w2.chips[0];
        if (!chip) { R.errors.push("A3_NO_CHIP"); out.runs.push(R); continue; }
        const ck = await wbClickChip(chip.text);
        const asg = await wbClickAssign("front-1");
        const w3 = await wbSnapshot();
        const r1c = w3.rows.find((r) => r.slotId === "front-1");
        R.steps.A3 = { chipText: chip.text, chipClicked: ck, assignClicked: asg, front1: r1c && r1c.cust, badge: r1c && r1c.badge };
        if (!(r1c && String(r1c.cust) === chip.text)) R.errors.push("A3_ASSIGN_FAIL got=" + String(r1c && r1c.cust).slice(0, 30) + " want=" + chip.text.slice(0, 30));
        // A4 行内编辑（MANUAL_EDIT）
        await wbSetCust("front-1", EDIT_MARK);
        const st4 = await waitStatusContains("已手动编辑", 8000);
        const w4 = await wbSnapshot();
        const r1d = w4.rows.find((r) => r.slotId === "front-1");
        R.steps.A4 = { status: st4.done, front1: r1d && r1d.cust, badge: r1d && r1d.badge };
        if (!(r1d && String(r1d.cust) === EDIT_MARK)) R.errors.push("A4_EDIT_FAIL");
        if (!st4.done) R.errors.push("A4_STATUS_NO_MARK");
        if (!(r1d && r1d.badge === "手动编辑")) R.errors.push("A4_BADGE " + String(r1d && r1d.badge));
        // A5 交换 front-1 ↔ front-2
        const w5a = await wbSnapshot();
        const f1 = w5a.rows.find((r) => r.slotId === "front-1");
        const f2 = w5a.rows.find((r) => r.slotId === "front-2");
        const v1 = f1 && f1.cust, v2 = f2 && f2.cust;
        const sw = await wbSetSwap("front-1", "front-2");
        const w5b = await wbSnapshot();
        const n1 = w5b.rows.find((r) => r.slotId === "front-1");
        const n2 = w5b.rows.find((r) => r.slotId === "front-2");
        R.steps.A5 = { swapSent: sw, before: { f1: v1, f2: v2 }, after: { f1: n1 && n1.cust, f2: n2 && n2.cust } };
        if (!(n1 && n2 && String(n1.cust) === String(v2) && String(n2.cust) === String(v1))) R.errors.push("A5_SWAP_FAIL");
        // A6 确认套版 → 画布 front 第 2 槽 == EDIT_MARK
        const cc = await clickById("#zy-apply-confirm");
        const done = cc.clicked ? await waitStatusContains("AI 填充完成", 30000) : { done: false };
        await SLEEP(1200);
        const after = await readV(0);
        const afterFront = textsOf(after && after.frontItems);
        R.steps.A6 = { clicked: cc.clicked, status: done.done, afterFront: afterFront };
        if (!done.done) R.errors.push("A6_APPLY_NOT_DONE");
        if (!(afterFront[1] === EDIT_MARK)) R.errors.push("A6_SLOT2_NOT_EDITED got=" + String(afterFront[1]).slice(0, 24));
        if (!((after && after.frontItems || []).length === (before && before.frontItems || []).length)) R.errors.push("A6_OBJECT_COUNT_CHANGED");
        // A7 冻结（objectUuid/left/top/width/angle/fontId/fontFamily/fill）
        const beforeItems = (before && before.frontItems) || [];
        const afterItems = (after && after.frontItems) || [];
        const frozenFails = [];
        for (let i = 0; i < beforeItems.length && i < afterItems.length; i += 1) {
          for (const k of FROZEN) {
            if (String(beforeItems[i][k]) !== String(afterItems[i][k])) { frozenFails.push("FROZEN[" + i + "]." + k + " " + String(beforeItems[i][k]).slice(0, 12) + "->" + String(afterItems[i][k]).slice(0, 12)); break; }
          }
        }
        R.steps.A7 = { frozenFails: frozenFails };
        if (frozenFails.length) R.errors.push("A7_FROZEN " + frozenFails.slice(0, 3).join(" | "));
      } catch (e) { R.errors.push("RUN: " + String(e && (e.message || e) || e).slice(0, 300)); }
      out.runs.push(R);
    }
    out.errors = out.errors.slice(0, 30);
  } catch (e) { out.errors.push("FATAL: " + String(e && (e.message || e) || e).slice(0, 400)); }
  finally { try { await browser.close(); } catch (e) {} }
  fs.writeFileSync(REPORT_FILE, JSON.stringify(out, null, 2));
  const okRuns = out.runs.filter((r) => (r.errors || []).length === 0).length;
  console.log("[commit-46t] report -> runtime/reports/stage-11/commit-46t-workbench-real.json runs=" + out.runs.length + " cleanRuns=" + okRuns);
})().catch((e) => { console.error("FATAL: " + String(e && (e.message || e) || e).slice(0, 600)); process.exit(1); });
