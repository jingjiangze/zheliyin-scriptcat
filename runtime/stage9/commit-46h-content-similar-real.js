// runtime/stage9/commit-46h-content-similar-real.js — Stage 10-G Commit I-4：内容相似智能套版 真机验收
// ---------------------------------------------------------------------
// 目标验证（Commit I 验收）：
//   1. C-MAIN：注入与客户内容近似的既有文字图层（含格式略异的电话占位"1380 0138 000"），
//      粘贴原文（含无格式电话"13800138000"）→ 点真实 #zy-smart-fill → 内容相似套版：
//      text === 原文逐字（非归一/非剥前缀）、对象数恒定（绝不新建）、fontSize 按容器自适应∈[10,160]、
//      lineHeight/charSpacing 前后不变（仅字号写回）、3 轮稳定性；
//   2. C-NO_MATCH：无相似图层 → 0 套版、未匹配上报、图层零变化；
//   3. C-EMPTY：清空画布 → 0 套版、绝不 OCR/legacy 创建。
// 凭据：ZY_STAGE9_COOKIE（会话；无则 probe 自动抓取）。
// 报告：runtime/reports/stage-11/commit-46h-content-similar-real.json
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
const adapter = require("../scriptcat-adapter");
const probeMod = require("./session-probe");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const WHITELIST = (process.env.ZY_CASE || "").split(",").map((s) => s.trim()).filter(Boolean);
const DIAG_KEY = process.env.ZY_DIAG_KEY || "__zyStage9VisualDiag";
const BVER = "0.3.11.91";

function parseCookies(raw) {
  const out = [];
  String(raw || "").split(";").forEach((part) => {
    const eq = part.indexOf("=");
    if (eq <= 0) return;
    out.push({ name: part.slice(0, eq).trim(), value: part.slice(eq + 1).trim().replace(/^"|"$/g, ""), domain: ".diy.zheliyin.com", path: "/", expires: -1 });
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
  t("cases-3", CONTENT_CASES.length === 3 && CONTENT_CASES.map((c) => c.id).join() === "C-MAIN,C-NO_MATCH,C-EMPTY");
  t("require-planner", cc.indexOf("content-similar-planner.js?v=" + BVER) >= 0 && cc.indexOf("planContentSimilar") >= 0);
  t("smart-fill-html", cc.indexOf('id="zy-smart-fill"') >= 0 && cc.indexOf('#zy-smart-fill").addEventListener("click", contentApplyFromPanel)') >= 0);
  t("smart-dispatch", cc.indexOf('type: "templateApplySmart", plans: plans, side: "both"') >= 0);
  t("classify-verbatim", cc.indexOf("绝对禁止修改") >= 0 && cc.indexOf("splitLinesByMarkers") >= 0);
  t("bver-const", BVER === "0.3.11.91");
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

// 场景：slots 是画布既有图层（模板现存文字，与客户内容近似/含噪声格式），pasteRows 是客户原文行。
const CONTENT_CASES = [
  {
    id: "C-MAIN", rounds: 3, note: "内容相似套版：3 槽（姓名/带空格电话/地址）← 原文 3 行（电话无格式）→ text=原文逐字 + fontSize 自适应 + lineHeight/charSpacing 不变 + 不新建",
    pasteRows: ["王小明", "13800138000", "北京市朝阳区建国路88号"],
    slots: [
      { text: "王小明", fontSize: 18, fontFamily: "思源黑体 Regular" },
      { text: "1380 0138 000", fontSize: 15, fontFamily: "思源黑体 Regular" },
      { text: "北京市朝阳区建国路88号", fontSize: 11, fontFamily: "思源黑体 Regular" }
    ],
    expectTexts: ["王小明", "13800138000", "北京市朝阳区建国路88号"], expectApplied: 3
  },
  {
    id: "C-NO_MATCH", rounds: 1, note: "无相似图层：1 槽（电话占位）+ 无关行 → 0 套版、未匹配上报、图层零变化",
    pasteRows: ["定制软件开发与系统集成服务商"],
    slots: [{ text: "占位电话", fontSize: 15, fontFamily: "思源黑体 Regular" }],
    expectTexts: ["占位电话"], expectApplied: 0
  },
  {
    id: "C-EMPTY", rounds: 1, note: "空画布：无图层 → 0 套版，绝不 OCR/字段重建（对象数为 0）",
    pasteRows: ["王小明", "13800138000"],
    slots: [], clearFirst: true, expectApplied: 0, expectZeroObjects: true
  }
];

if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const sessCookie = await probeMod.resolveStage9Cookie();
  const COOKIE_RAW = sessCookie.raw || "";
  if (!COOKIE_RAW) { console.error("[commit-46h] 会话 cookie 解析失败：" + (sessCookie.error || "NO_COOKIE")); process.exit(2); }
  const out = { ts: new Date().toISOString(), stage: "STAGE10-G-COMMIT-I-CONTENT-SIMILAR-REAL", cases: CONTENT_CASES.map((c) => c.id), cookiePresent: !!COOKIE_RAW, cookieSource: sessCookie.source || null, cookieWarning: sessCookie.warning || null, cookieNote: sessCookie.note || null, bverExpect: BVER, runs: [], errors: [] };
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
      console.log("[commit-46h] scriptcat cleaned");
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
    const setGm = async () => page.evaluate(() => {
      const set = (k, v) => { try { localStorage.setItem("zy8dshim:" + k, JSON.stringify(v)); } catch (e) {} };
      set("zyBaiduOcrMode", "standard");
      set("zyStage9NativeOcrMode", "2");
      set("zyStage9NativeTruth", "1");
      set("zyStage9LocalSidecar", "0");
      set("zyOcrMode", "baidu");
      set("zyStage9InkGeometry", "0");
      set("zyShowTemplatePanel", "1");
      set("zyArkApiKey", ""); // 强制无 AI key → 本地标记分类（AI 仅分类路径在单测/报告记录）
      return true;
    });
    const injectPageWorld = (payload) => page.evaluate((code) => { const s = document.createElement("script"); s.textContent = code; (document.head || document.documentElement).appendChild(s); }, payload);
    const waitEditorReady = async (tries) => {
      for (let i = 0; i < (tries || 16); i += 1) {
        const r = await page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed), bver: (window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.ver) || window.__ZY_BRIDGE_VERSION__ || null })).catch(() => ({}));
        if (r && r.ok && r.bridge) return r;
        await SLEEP(1200);
      }
      return page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed), bver: (window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.ver) || window.__ZY_BRIDGE_VERSION__ || null })).catch(() => ({}));
    };
    const canvasCountNow = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      return (vo && vo.totalCanvasArray || []).length;
    }).catch(() => 0);
    const injectSlotsOn = (canvasIdx, slotDefs) => page.evaluate((json) => {
      const arg = JSON.parse(json);
      const req2 = window.requirejs || window.require;
      const vo2 = ((req2 && req2.s && req2.s.contexts && req2.s.contexts._ && req2.s.contexts._.defined && req2.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d2 = vo2 && vo2.totalCanvasArray && vo2.totalCanvasArray[arg.canvasIdx];
      if (!d2 || !d2.canvas || !d2.canvasObjInfo || typeof d2.drawText !== "function") return { ok: false, reason: arg.canvasIdx === 1 ? "NO_BACK_CANVAS" : "NO_CANVASDIY", absent: arg.canvasIdx === 1 };
      const cw = d2.canvas.getWidth ? d2.canvas.getWidth() : (d2.canvas.width || 300);
      const ch = d2.canvas.getHeight ? d2.canvas.getHeight() : (d2.canvas.height || 210);
      const baseLayer2 = (d2.canvasObjInfo.canvasToProductObjArr || []).length;
      let made = 0;
      const errs = [];
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
    }, JSON.stringify({ canvasIdx: canvasIdx, defs: slotDefs })).catch((e) => ({ ok: false, reason: String(e && e.message || e).slice(0, 100), absent: canvasIdx === 1 }));
    const invAllNow = () => bridgeCall("getTextInventoryAll", {}, "getTextInventoryAllResult", 8000).catch(() => null);
    const clearAllTexts = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      let removed = 0;
      (vo && vo.totalCanvasArray || []).forEach((d) => {
        const c = d && d.canvas;
        if (!c) return;
        c.getObjects().forEach((o) => { if (!o || typeof o.text !== "string") return; try { c.remove(o); removed += 1; } catch (e) {} });
      });
      try { if (vo && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas) vo.totalCanvasArray[0].canvas.requestRenderAll(); } catch (e) {}
      return removed;
    }).catch(() => -1);
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
    const fillRawText = (rawLines) => page.evaluate((t) => {
      const ta = document.querySelector("#zy-raw");
      if (!ta) return { ok: false, reason: "NO_RAW_TEXTAREA" };
      ta.value = t;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      return { ok: true };
    }, rawLines.join("\n"));
    const clickSmartFill = async (timeoutMs) => {
      const t0 = Date.now();
      while (Date.now() - t0 < (timeoutMs || 20000)) {
        const r = await page.evaluate(() => {
          const btn = document.querySelector("#zy-smart-fill");
          if (btn && btn.offsetParent) { try { btn.click(); return { clicked: true }; } catch (e) {} }
          return { clicked: false };
        }).catch(() => ({ clicked: false }));
        if (r && r.clicked) return r;
        await SLEEP(900);
      }
      return { clicked: false };
    };
    const waitApplyDone = async (timeoutMs) => {
      const t0 = Date.now();
      const samples = [];
      while (Date.now() - t0 < timeoutMs) {
        const r = await page.evaluate(() => {
          const el = document.querySelector("#zy-native-status") || document.querySelector("#zy-status") || document.querySelector(".zy-status");
          return { st: el ? String(el.textContent || "").trim().slice(0, 300) : null };
        }).catch(() => ({}));
        const st = r && r.st;
        if (st) samples.push(String(st).slice(0, 300));
        if (st && /智能套版：正面更新 \d+ 槽|智能套版完成|智能套版失败|请先粘贴客户文字/.test(st)) return { done: true, st, samples };
        await SLEEP(900);
      }
      return { done: false, samples };
    };
    const waitPanel = async (tries) => {
      for (let i = 0; i < (tries || 15); i += 1) {
        const has = await page.evaluate(() => !!document.querySelector("#zy-raw") && !!document.querySelector("#zy-smart-fill")).catch(() => false);
        if (has) return true;
        await SLEEP(900);
      }
      return false;
    };

    for (const def of CONTENT_CASES) {
      if (WHITELIST.length && WHITELIST.indexOf(def.id) < 0) continue;
      const rec = { case: def.id, note: def.note, steps: [], errors: [], runs: [], asserts: [], status: null };
      out.runs.push(rec);
      try {
        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => rec.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
        await SLEEP(2000);
        await setGm();
        await SLEEP(400);
        await injectPageWorld(pageWorldPayloadFor());
        await SLEEP(1400);
        await page.evaluate((dk) => { try { window[dk] = []; } catch (e) {} }, DIAG_KEY);
        const ready = await waitEditorReady(20);
        if (!(ready && ready.ok)) { rec.errors.push("EDITOR_UNAVAILABLE"); continue; }
        rec.bver = (ready && ready.bver) || null;
        if (ready && ready.bver && ready.bver !== BVER) rec.errors.push("BRIDGE_VERSION_MISMATCH(" + String(ready.bver).slice(0, 40) + ")");
        const panelOk = await waitPanel(15);
        if (!panelOk) { rec.errors.push("PANEL_UNAVAILABLE"); continue; }
        if (def.slots && def.slots.length) {
          const inj = await injectSlotsOn(0, def.slots);
          if (!(inj && inj.ok)) { rec.errors.push("SLOT_INJECT_FAIL " + JSON.stringify(inj).slice(0, 200)); continue; }
          await SLEEP(1400);
        }
        if (def.clearFirst) { const clr = await clearAllTexts(); rec.steps.push({ step: "clear-texts", removed: clr }); await SLEEP(800); }
        const baseInv = await invAllNow();
        rec.baseCount = { front: (baseInv && baseInv.front && baseInv.front.items) ? baseInv.front.items.length : 0, back: (baseInv && baseInv.back && baseInv.back.items) ? baseInv.back.items.length : 0 };
        for (let rnd = 1; rnd <= def.rounds; rnd += 1) {
          const runRec = { rnd: rnd, status: null };
          rec.runs.push(runRec);
          const fill = await fillRawText(def.pasteRows);
          if (!(fill && fill.ok)) { runRec.error = "FILL_FAIL " + JSON.stringify(fill); continue; }
          const cl = await clickSmartFill();
          if (!(cl && cl.clicked)) { runRec.error = "BTN_NOT_FOUND"; continue; }
          const doneW = await waitApplyDone(60000);
          runRec.status = doneW.st || null;
          runRec.samples = (doneW.samples || []).slice(-8);
          await SLEEP(1600);
          const invNow = await invAllNow();
          const front = (invNow && invNow.front && invNow.front.items) || [];
          runRec.frontCount = front.length;
          runRec.invFront = front;
          // 逐槽断言：text===原文逐字、fontSize 自适应∈[10,160]、lineHeight/charSpacing 不变（仅字号写回）
          const fails = [];
          if (front.length !== def.slots.length) fails.push("COUNT " + def.slots.length + "->" + front.length + "（不应新建/删除）");
          for (let i = 0; i < front.length && i < (def.slots || []).length && i < def.expectTexts.length; i += 1) {
            const it = front[i];
            const b = baseInv && baseInv.front && baseInv.front.items && baseInv.front.items[i];
            const exp = def.expectTexts[i];
            if (it.text !== exp) fails.push("TEXT@" + i + " 期望[" + exp + "] 实得[" + String(it.text).slice(0, 24) + "]（非原文逐字）");
            if (!(it.fontSize >= 10 && it.fontSize <= 160)) fails.push("FONT_SIZE@" + i + " 越界 " + it.fontSize);
            if (b && it.lineHeight != null && b.lineHeight != null && Math.abs(it.lineHeight - b.lineHeight) > 0.0001) fails.push("LINE_HEIGHT_CHANGED@" + i + " " + b.lineHeight + "->" + it.lineHeight + "（仅字号可写回）");
            if (b && it.charSpacing != null && b.charSpacing != null && Math.abs(it.charSpacing - b.charSpacing) > 0.0001) fails.push("CHAR_SPACING_CHANGED@" + i + " " + b.charSpacing + "->" + it.charSpacing);
          }
          // applied 数以状态消息「正面更新 X 槽」为准（内容相同也算已套版）
          const appliedReg = new RegExp("正面更新 " + def.expectApplied + " 槽");
          if (def.expectApplied >= 0 && !(runRec.status && appliedReg.test(runRec.status))) fails.push("STATUS_APPLIED " + def.expectApplied + " 不符：" + String(runRec.status || "").slice(0, 60));
          if (def.expectZeroObjects && front.length !== 0) fails.push("ZERO_OBJECTS_FAIL " + front.length);
          runRec.assertFails = fails;
          if (fails.length) { rec.asserts.push({ rnd: rnd, fails: fails }); rec.errors.push("ASSERT_FAIL r" + rnd + ": " + fails.join(" | ")); }
        }
        rec.steps.push({ step: "rollback", ok: true });
        await rollback();
      } catch (e) { rec.errors.push("RUN: " + String(e && (e.message || e) || e).slice(0, 300)); }
    }
    out.errors = out.errors.slice(0, 20);
  } catch (e) { out.errors.push("FATAL: " + String(e && (e.message || e) || e).slice(0, 400)); }
  finally { try { await browser.close(); } catch (e) {} }
  fs.writeFileSync(path.join(REPORT_DIR, "commit-46h-content-similar-real.json"), JSON.stringify(out, null, 2));
  console.log("[commit-46h] report -> runtime/reports/stage-11/commit-46h-content-similar-real.json");
})().catch((e) => { console.error("FATAL: " + String(e && (e.message || e) || e).slice(0, 600)); process.exit(1); });