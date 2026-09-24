"use strict";
// runtime/stage9/commit-46k-ai-slot-match-preview.js — Stage 10-G Commit 03：AI 槽位匹配 preview 真机验收
// 目标：点真实 #zy-smart-fill → aiTemplateSlotMatch：读取 TemplateSnapshot → AI(硅基流动) 全量槽位匹配 →
//   zyValidateTemplateMatchPlan 硬校验 → 状态「AI 槽位匹配完成（预览，未修改画布）」；
//   画布对象数/文本/fontSize 全程不变（此阶段绝不 setText）。
// 凭据：ZY_AI_KEY env 临时注入（绝不落盘）；ZY_STAGE9_COOKIE。
// 报告：runtime/reports/stage-11/commit-46k-ai-slot-match-preview.json
const path = require("path");
const fs = require("fs");
const { chromium } = require("../../node_modules/playwright");
const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const EXT_ID = "ndcooeababalnlpkfedmmbbbgkljhpjf";
const USERSCRIPT_PATH = path.join(ROOT, "zheliyin-card-assistant.user.js");
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-11");
const adapter = require("../scriptcat-adapter");
const probeMod = require("./session-probe");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const WHITELIST = (process.env.ZY_CASE || "").split(",").map((s) => s.trim()).filter(Boolean);
const TRACE_KEY = "__zy7AiTrace";
const BVER = "0.3.11.79";
const AI_KEY = process.env.ZY_AI_KEY || "";
const AI_BASE_URL = process.env.ZY_AI_BASE_URL || "https://api.siliconflow.cn/v1";
const AI_MODEL = process.env.ZY_AI_MODEL || "Qwen/Qwen2.5-7B-Instruct";

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
function conditionCode() {
  let code = injectUserscript();
  const repl = (o, n) => { if (code.indexOf(o) < 0) { console.warn("[conditionCode] anchor missing (skip): " + o.slice(0, 60)); return; } code = code.split(o).join(n); };
  repl('GM_getValue("zyBaiduOcrMode", "standard")', JSON.stringify("standard"));
  repl('GM_getValue("zyStage9NativeOcrMode", "2")', JSON.stringify("2"));
  repl('GM_getValue("zyStage9NativeTruth", "1") === "1"', "true");
  repl('GM_getValue("zyStage9LocalSidecar", "0") === "1"', "false");
  repl('GM_getValue("zyOcrMode", "auto")', JSON.stringify("baidu"));
  repl('document.addEventListener("DOMContentLoaded", initZheliyin);', '(function(){ if (document.body) { initZheliyin(); } else { document.addEventListener("DOMContentLoaded", function(){ initZheliyin(); }); } })();');
  return code;
}
function selfTest() {
  const t = (n, c) => { if (!c) throw new Error("SELFTEST FAIL " + n); console.log("[selftest] PASS " + n); };
  const cc = conditionCode();
  const payload = pageWorldPayloadFor();
  t("cases-1", P_CASES.length === 1 && P_CASES[0].id === "P-SLOT");
  t("slotmatch-fn", cc.indexOf("async function aiTemplateSlotMatch(rawText)") >= 0 && cc.indexOf("AI 槽位匹配完成（预览，未修改画布）") >= 0);
  t("requires-plan+validator", cc.indexOf("template-match-plan.js?v=" + BVER) >= 0 && cc.indexOf("template-match-validator.js?v=" + BVER) >= 0);
  t("smart-fill-html", cc.indexOf('#zy-smart-fill").addEventListener("click", contentApplyFromPanel)') >= 0);
  t("plan-modules-inline", fs.existsSync(path.join(ROOT, "extension", "src", "ai", "template-match-plan.js")) && fs.existsSync(path.join(ROOT, "extension", "src", "ai", "template-match-validator.js")));
  t("verify-bridge-strict", payload.indexOf('if (side === "back") return null;') >= 0);
  t("no-auto-apply", cc.indexOf("未自动修改模板") >= 0);
  t("bver-const", BVER === "0.3.11.79");
  console.log("[selftest] ALL PASS");
}
function pageWorldPayloadFor() {
  const parts = [GM_SHIM_SOURCE];
  const norm = conditionCode();
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
// 5 槽近似内容模板；粘贴客户原文（含正反标记与非模板行）
const P_CASES = [
  {
    id: "P-SLOT", rounds: 1, note: "AI 槽位匹配 preview：正面 5 槽（近似内容）→ 点 #zy-smart-fill → AI(硅基流动) 全量匹配 → 硬校验 → 状态「AI 槽位匹配完成（预览，未修改画布）」；画布文本/fontSize/对象数全程不变",
    pasteRows: [
      "正面：",
      "山东启诚信息技术有限公司",
      "王小明",
      "销售总监",
      "电话：13800138000",
      "地址：北京市朝阳区建国路88号",
      "反面：",
      "主营范围：企业信息化咨询、软件定制开发服务"
    ],
    slots: [
      { text: "山东启诚信息技术股份", fontSize: 14, fontFamily: "方正黑体简体" },
      { text: "王晓明", fontSize: 18, fontFamily: "思源黑体 Regular" },
      { text: "销售副总监", fontSize: 24, fontFamily: "思源黑体 Bold" },
      { text: "1380 0138 000", fontSize: 15, fontFamily: "思源黑体 Regular" },
      { text: "北京市朝阳区建国路89号", fontSize: 11, fontFamily: "思源黑体 Regular" }
    ],
    expectMatchedMin: 3
  }
];
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const sessCookie = await probeMod.resolveStage9Cookie();
  const COOKIE_RAW = sessCookie.raw || "";
  if (!COOKIE_RAW) { console.error("[commit-46k] 会话 cookie 解析失败：" + (sessCookie.error || "NO_COOKIE")); process.exit(2); }
  if (!AI_KEY) { console.error("[commit-46k] 缺少 ZY_AI_KEY 环境变量（仅临时注入，绝不落盘）。"); process.exit(2); }
  const out = { ts: new Date().toISOString(), stage: "STAGE10-G-COMMIT-L3-AI-SLOT-MATCH-PREVIEW", cases: P_CASES.map((c) => c.id), cookieSource: sessCookie.source || null, aiKeyPresent: true, aiModel: AI_MODEL, bverExpect: BVER, runs: [], errors: [] };
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1280, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    let page = browser.pages()[0];
    const onPageErr = (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 200)); };
    page.on("pageerror", onPageErr);
    await page.addInitScript(({ key }) => {
      const arr = []; window[key] = arr;
      const oF = window.fetch;
      window.fetch = function (input, init) {
        try {
          const url = (typeof input === "string" ? input : (input && input.url)) || "";
          if (url.indexOf("chat/completions") >= 0) {
            let model = null;
            try { model = JSON.parse(String(init && init.body || "{}")).model || null; } catch (e) {}
            arr.push({ url: String(url).slice(-60), model: model, ts: Date.now() });
          }
        } catch (e) {}
        return oF.apply(this, arguments);
      };
    }, { key: TRACE_KEY });
    try {
      await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await SLEEP(1400);
      const allOld = await adapter.getAllScripts(page) || [];
      for (const s of allOld.filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(page, s.uuid); } catch (e) {} }
      out.errors = out.errors.filter((x) => x.indexOf("PAGEERROR") < 0);
    } catch (eClean) { out.errors.push("CLEAN: " + String(eClean && eClean.message || eClean).slice(0, 120)); }
    for (const c of parseCookies(COOKIE_RAW)) { try { await browser.addCookies([c]); } catch (e) { out.errors.push("COOKIE:" + c.name + " " + String(e && e.message || e).slice(0, 100)); } }
    const bridgeCall = (type, payload, replyType, timeoutMs) => page.evaluate((arg) => new Promise((resolve) => {
      let done = false;
      const on = (ev) => { const d = ev.data; if (d && d.source === "zy-card-assistant-page" && d.type === arg.replyType) { window.removeEventListener("message", on); done = true; resolve(d); } };
      window.addEventListener("message", on);
      setTimeout(() => { if (!done) { window.removeEventListener("message", on); resolve({ skip: true, timeout: arg.timeoutMs }); } }, arg.timeoutMs);
      window.postMessage(Object.assign({ source: "zy-card-assistant", type: arg.type }, arg.payload || {}), location.origin);
    }), { type, payload, replyType, timeoutMs: timeoutMs || 12000 });
    const setGm = async () => page.evaluate(({ key, baseUrl, model }) => {
      const set = (k, v) => { try { localStorage.setItem("zy8dshim:" + k, JSON.stringify(v)); } catch (e) {} };
      set("zyBaiduOcrMode", "standard"); set("zyStage9NativeOcrMode", "2"); set("zyStage9NativeTruth", "1"); set("zyStage9LocalSidecar", "0"); set("zyOcrMode", "baidu"); set("zyStage9InkGeometry", "0"); set("zyShowTemplatePanel", "1");
      set("zyArkApiKey", key); set("zyArkBaseUrl", baseUrl); set("zyArkModel", model);
      return true;
    }, { key: AI_KEY, baseUrl: AI_BASE_URL, model: AI_MODEL });
    const injectPageWorld = (payload) => page.evaluate((code) => { const s = document.createElement("script"); s.textContent = code; (document.head || document.documentElement).appendChild(s); }, payload);
    const waitEditorReady = async (tries) => {
      for (let i = 0; i < (tries || 16); i += 1) {
        const r = await page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed), bver: (window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.ver) || window.__ZY_BRIDGE_VERSION__ || null })).catch(() => ({}));
        if (r && r.ok && r.bridge) return r;
        await SLEEP(1200);
      }
      return page.evaluate(() => ({ ok: false })).catch(() => ({}));
    };
    const injectSlotsOn = (canvasIdx, slotDefs) => page.evaluate((json) => {
      const arg = JSON.parse(json);
      const req2 = window.requirejs || window.require;
      const vo2 = ((req2 && req2.s && req2.s.contexts && req2.s.contexts._ && req2.s.contexts._.defined && req2.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d2 = vo2 && vo2.totalCanvasArray && vo2.totalCanvasArray[arg.canvasIdx];
      if (!d2 || !d2.canvas || !d2.canvasObjInfo || typeof d2.drawText !== "function") return { ok: false, reason: arg.canvasIdx === 1 ? "NO_BACK_CANVAS" : "NO_CANVASDIY", absent: arg.canvasIdx === 1 };
      const cw = d2.canvas.getWidth ? d2.canvas.getWidth() : (d2.canvas.width || 300);
      const ch = d2.canvas.getHeight ? d2.canvas.getHeight() : (d2.canvas.height || 210);
      const baseLayer2 = (d2.canvasObjInfo.canvasToProductObjArr || []).length;
      let made = 0; const errs = [];
      arg.defs.forEach(function (s, i) {
        try {
          const left = cw * 0.12 + (i % 3) * 8;
          const top = ch * 0.1 + i * (ch * 0.075);
          const entry = { "media": { "mediaType": "text", "text": s.text, "font": { "pointSize": s.fontSize, "fontColor": "#111111", "isHorizontal": 1, "gravity": "left", "id": String(900 + i), "isItalic": 0, "textDecoration": "", "linethrough": 0, "overline": 0, "isBold": 0, "overprintStroke": 0 }, "charSpace": 0, "lineSpace": 1.2, "lineIdType": 0, "isBG": 0, "imgPath": "" }, "location": { "x": left, "y": top, "width": 160, "height": 36, "factWidth": 160, "factHeight": 36, "rotation": 0 }, "printLocation": { "x": left, "y": top, "width": 160, "height": 36, "rotation": 0 }, "layer": { "alpha": 1 }, "layerNum": baseLayer2 + i, "isEdit": 1, "isDisplay": 0, "deleteState": 0, "visitLevel": 1, "multiUuid": "cpl-" + String(201 + i), "markuuid": "", "topEnable": 1, "resourceType": 0, "maskEnable": 0, "lowPixelFlag": 0, "selectEnabled": 1, "isDesign": 1, "isComposite": 0, "isPreview": 0, "isDesignShape": 0 };
          d2.drawText(s.text, null, null, null, entry, baseLayer2 + i);
          made += 1;
        } catch (e) { errs.push(String(i) + ":" + String(e && e.message || e).slice(0, 90)); }
      });
      try { d2.canvas.requestRenderAll(); } catch (e) {}
      return { ok: made === arg.defs.length, made: made, total: arg.defs.length, errs: errs };
    }, JSON.stringify({ canvasIdx: canvasIdx, defs: slotDefs })).catch((e) => ({ ok: false, reason: String(e && e.message || e).slice(0, 100) }));
    const invAllNow = () => bridgeCall("getTextInventoryAll", {}, "getTextInventoryAllResult", 8000).catch(() => null);
    const fillRawText = (rawLines) => page.evaluate((t) => { const ta = document.querySelector("#zy-raw"); if (!ta) return { ok: false }; ta.value = t; ta.dispatchEvent(new Event("input", { bubbles: true })); return { ok: true }; }, rawLines.join("\n"));
    const clickSmartFill = async (timeoutMs) => {
      const t0 = Date.now();
      while (Date.now() - t0 < (timeoutMs || 20000)) {
        const r = await page.evaluate(() => { const btn = document.querySelector("#zy-smart-fill"); if (btn && btn.offsetParent) { try { btn.click(); return { clicked: true }; } catch (e) {} } return { clicked: false }; }).catch(() => ({ clicked: false }));
        if (r && r.clicked) return r;
        await SLEEP(900);
      }
      return { clicked: false };
    };
    const waitPreviewDone = async (timeoutMs) => {
      const t0 = Date.now(); const samples = [];
      while (Date.now() - t0 < timeoutMs) {
        const r = await page.evaluate(() => { const el = document.querySelector("#zy-native-status") || document.querySelector("#zy-status") || document.querySelector(".zy-status"); return { st: el ? String(el.textContent || "").trim().slice(0, 800) : null }; }).catch(() => ({}));
        const st = r && r.st;
        if (st) samples.push(String(st).slice(0, 800));
        if (st && (/AI 槽位匹配完成（预览，未修改画布）/.test(st) || /AI 槽位匹配失败/.test(st) || /AI 槽位匹配不可用/.test(st))) return { done: true, st, samples };
        await SLEEP(900);
      }
      return { done: false, samples };
    };
    const readFrontAfter = async () => {
      for (let i = 0; i < 3; i += 1) {
        const r = await bridgeCall("getTextInventoryAll", {}, "getTextInventoryAllResult", 8000).catch(() => null);
        if (r && r.front && Array.isArray(r.front.items)) return { snapshotHash: r.snapshotHash, frontItems: r.front.items };
        await SLEEP(1200);
      }
      return {};
    };
    const waitPanel = async (tries) => {
      for (let i = 0; i < (tries || 15); i += 1) {
        const has = await page.evaluate(() => !!document.querySelector("#zy-raw") && !!document.querySelector("#zy-smart-fill")).catch(() => false);
        if (has) return true;
        await SLEEP(900);
      }
      return false;
    };

    for (const def of P_CASES) {
      if (WHITELIST.length && WHITELIST.indexOf(def.id) < 0) continue;
      const rec = { case: def.id, note: def.note, steps: [], errors: [], runs: [] };
      out.runs.push(rec);
      try {
        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => rec.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
        await SLEEP(2000);
        await setGm();
        await SLEEP(400);
        await injectPageWorld(pageWorldPayloadFor());
        await SLEEP(1400);
        const ready = await waitEditorReady(20);
        if (!(ready && ready.ok)) { rec.errors.push("EDITOR_UNAVAILABLE"); continue; }
        rec.bver = (ready && ready.bver) || null;
        if (ready && ready.bver && ready.bver !== BVER) rec.errors.push("BRIDGE_VERSION_MISMATCH(" + String(ready.bver) + ")");
        if (!(await waitPanel(15))) { rec.errors.push("PANEL_UNAVAILABLE"); continue; }
        const inj = await injectSlotsOn(0, def.slots);
        await SLEEP(1500);
        if (!(inj && inj.ok)) { rec.errors.push("SLOT_INJECT_FAIL"); continue; }
        await SLEEP(1400);
        const before = await readFrontAfter();
        rec.before = { count: (before.frontItems || []).length, texts: (before.frontItems || []).map((it) => it.text), fontSizes: (before.frontItems || []).map((it) => it.fontSize), hash: before.snapshotHash };
        for (let rnd = 1; rnd <= def.rounds; rnd += 1) {
          const runRec = { rnd: rnd };
          rec.runs.push(runRec);
          const fill = await fillRawText(def.pasteRows);
          if (!(fill && fill.ok)) { runRec.error = "FILL_FAIL"; continue; }
          const cl = await clickSmartFill();
          if (!(cl && cl.clicked)) { runRec.error = "BTN_NOT_FOUND"; continue; }
          const doneW = await waitPreviewDone(90000);
          runRec.status = doneW.st || null;
          runRec.samples = (doneW.samples || []).slice(-14);
          if (!doneW.done) { rec.errors.push("STUCK: preview timeout"); runRec.stuck = true; continue; }
          await SLEEP(1200);
          const after = await readFrontAfter();
          runRec.after = { count: (after.frontItems || []).length, texts: (after.frontItems || []).map((it) => it.text), fontSizes: (after.frontItems || []).map((it) => it.fontSize), hash: after.snapshotHash };
          const trace = await page.evaluate((k) => window[k] || [], TRACE_KEY).catch(() => []);
          runRec.trace = (trace || []).slice(0, 4);
          const fails = [];
          // ① preview 状态
          if (!runRec.status || !/AI 槽位匹配完成（预览，未修改画布）/.test(runRec.status)) fails.push("STATUS_NOT_PREVIEW[" + String(runRec.status || "").slice(0, 90) + "]");
          const m = /匹配 (\d+)\/(\d+) 槽/.exec(runRec.status || "");
          if (!m || Number(m[1]) < (def.expectMatchedMin || 3)) fails.push("MATCHED < expected got " + (m ? m[1] + "/" + m[2] : "none"));
          // ② AI 调用铁证
          const chatOk = (trace || []).some((x) => x.model && String(x.model) === String(AI_MODEL));
          runRec.aiCallOk = chatOk;
          if (!chatOk) fails.push("AI_CALL_NOT_OBSERVED(" + AI_MODEL + ")");
          // ③ 画布零变化（对象数/文本/fontSize/hash 全程不变）
          const bT = JSON.stringify(rec.before && rec.before.texts);
          const aT = JSON.stringify(runRec.after && runRec.after.texts);
          if (rec.before && runRec.after && rec.before.count !== runRec.after.count) fails.push("COUNT_CHANGED " + rec.before.count + "->" + runRec.after.count);
          if (aT !== bT) fails.push("TEXT_CHANGED (画布被修改)" + aT.slice(0, 60));
          if (rec.before && runRec.after && JSON.stringify(rec.before.fontSizes) !== JSON.stringify(runRec.after.fontSizes)) fails.push("FONT_SIZE_CHANGED");
          if (rec.before && runRec.after && rec.before.hash && runRec.after.hash && rec.before.hash !== runRec.after.hash) fails.push("SNAPSHOT_HASH_CHANGED " + rec.before.hash + "->" + runRec.after.hash);
          runRec.assertFails = fails;
          if (fails.length) rec.errors.push("ASSERT_FAIL r" + rnd + ": " + fails.join(" | "));
        }
      } catch (e) { rec.errors.push("RUN: " + String(e && (e.message || e) || e).slice(0, 300)); }
    }
    out.errors = out.errors.slice(0, 20);
  } catch (e) { out.errors.push("FATAL: " + String(e && (e.message || e) || e).slice(0, 400)); }
  finally { try { await browser.close(); } catch (e) {} }
  fs.writeFileSync(path.join(REPORT_DIR, "commit-46k-ai-slot-match-preview.json"), JSON.stringify(out, null, 2));
  console.log("[commit-46k] report -> runtime/reports/stage-11/commit-46k-ai-slot-match-preview.json");
})().catch((e) => { console.error("FATAL: " + String(e && (e.message || e) || e).slice(0, 600)); process.exit(1); });