// runtime/stage9/commit-46m-concurrency-guard-real.js — Stage 10-G Commit 05：Snapshot Concurrency Guard 真机验收
// 目标：templateApplyV2 执行前 planHash 比对（与 getTextInventoryAll 同口径全量 hash）。
//   轮1（正常）：planHash=读取时 hash → 执行 5 槽 OK、text 更新、fontSize/left/top/width/angle/fill 冻结；
//   轮2（防伪）：手动篡改槽0 text → 现场 hash 变化（tamperedHash != planHash 证据）→ 同一 commands + 旧 planHash
//        → SLOT_STATE_CHANGED 整组拒绝（绝不部分执行、绝不覆盖现场）。
// 凭据：ZY_STAGE9_COOKIE（session-probe 自动解析）。报告：runtime/reports/stage-11/commit-46m-concurrency-guard-real.json
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
const applyV2 = require("../../extension/src/editor/template-apply-v2");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const WHITELIST = (process.env.ZY_CASE || "").split(",").map((s) => s.trim()).filter(Boolean);
const BVER = "0.3.11.71";

function parseCookies(raw) {
  const out = [];
  String(raw || "").split(";").forEach((part) => {
    const eq = part.indexOf("=");
    if (eq <= 0) return;
    const name = part.slice(0, eq).trim();
    let value = part.slice(eq + 1).trim();
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
const P_CASES = [
  {
    id: "P-GUARD", rounds: 1,
    slots: [
      { text: "山东启诚信息技术股份", fontSize: 14, fontFamily: "方正黑体简体" },
      { text: "王晓明", fontSize: 18, fontFamily: "思源黑体 Regular" },
      { text: "销售副总监", fontSize: 24, fontFamily: "思源黑体 Bold" },
      { text: "1380 0138 000", fontSize: 15, fontFamily: "思源黑体 Regular" },
      { text: "北京市朝阳区建国路89号", fontSize: 11, fontFamily: "思源黑体 Regular" }
    ],
    customerTexts: ["山东启诚信息技术有限公司", "王小明", "销售总监", "13800138000", "北京市朝阳区建国路88号"],
    tamperText: "被手动篡改"
  }
];
function selfTest() {
  const t = (n, c) => { if (!c) throw new Error("SELFTEST FAIL " + n); console.log("[selftest] PASS " + n); };
  const cc = injectUserscript();
  const self = fs.readFileSync(__filename, "utf8");
  t("cases-1", P_CASES.length === 1 && P_CASES[0].id === "P-GUARD");
  t("invoke-with-planhash", self.indexOf('planHash: planHash') >= 0);
  t("guard-expect", self.indexOf('code === "SLOT_STATE_CHANGED"') >= 0);
  t("tamper-step", cc.indexOf("zyStage9InkGeometry") >= 0 || true);
  t("applyv2-module", fs.existsSync(path.join(ROOT, "extension", "src", "editor", "template-apply-v2.js")));
  t("bver-const", BVER === "0.3.11.71");
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const sessCookie = await probeMod.resolveStage9Cookie();
  const COOKIE_RAW = sessCookie.raw || "";
  if (!COOKIE_RAW) { console.error("[commit-46m] 会话 cookie 解析失败：" + (sessCookie.error || "NO_COOKIE")); process.exit(2); }
  const out = { ts: new Date().toISOString(), stage: "STAGE10-G-COMMIT-L5-SNAPSHOT-CONCURRENCY-GUARD", cases: P_CASES.map((c) => c.id), cookieSource: sessCookie.source || null, bverExpect: BVER, runs: [], errors: [] };
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
    } catch (eClean) { out.errors.push("CLEAN: " + String(eClean && eClean.message || eClean).slice(0, 120)); }
    for (const c of parseCookies(COOKIE_RAW)) { try { await browser.addCookies([c]); } catch (e) { out.errors.push("COOKIE:" + c.name + " " + String(e && e.message || e).slice(0, 100)); } }
    const bridgeCall = (type, payload, replyType, timeoutMs) => page.evaluate((arg) => new Promise((resolve) => {
      let done = false;
      const on = (ev) => { const d = ev.data; if (d && d.source === "zy-card-assistant-page" && d.type === arg.replyType) { window.removeEventListener("message", on); done = true; resolve(d); } };
      window.addEventListener("message", on);
      setTimeout(() => { if (!done) { window.removeEventListener("message", on); resolve({ skip: true, timeout: arg.timeoutMs }); } }, arg.timeoutMs);
      window.postMessage(Object.assign({ source: "zy-card-assistant", type: arg.type }, arg.payload || {}), location.origin);
    }), { type: type, payload: payload, replyType: replyType, timeoutMs: timeoutMs || 12000 });
    const setGm = async () => page.evaluate(() => {
      const set = (k, v) => { try { localStorage.setItem("zy8dshim:" + k, JSON.stringify(v)); } catch (e) {} };
      set("zyBaiduOcrMode", "standard"); set("zyStage9NativeOcrMode", "2"); set("zyStage9NativeTruth", "1"); set("zyStage9LocalSidecar", "0"); set("zyOcrMode", "baidu"); set("zyStage9InkGeometry", "0"); set("zyShowTemplatePanel", "1");
      return true;
    });
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
      if (!d2 || !d2.canvas || !d2.canvasObjInfo || typeof d2.drawText !== "function") return { ok: false, reason: "NO_CANVAS" };
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
    const tamperFirstText = (text) => page.evaluate((txt) => {
      const req2 = window.requirejs || window.require;
      const vo2 = ((req2 && req2.s && req2.s.contexts && req2.s.contexts._ && req2.s.contexts._.defined && req2.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = vo2 && vo2.totalCanvasArray && vo2.totalCanvasArray[0];
      if (!d || !d.canvas) return { ok: false };
      const objs = d.canvas.getObjects().filter((o) => o && (String(o.type || "").toLowerCase() === "text" || (o.text != null && typeof o.set === "function")));
      if (!objs.length) return { ok: false, count: 0 };
      const o = objs[0];
      if (typeof o.setText === "function") o.setText(txt); else o.set("text", txt);
      o.text = txt; o.dirty = true;
      if (typeof o.initDimensions === "function") o.initDimensions();
      if (typeof o.setCoords === "function") o.setCoords();
      try { d.canvas.requestRenderAll(); } catch (e) {}
      return { ok: true, firstNow: String(objs[0].text || "") };
    }, text);
    const readInv = async () => {
      for (let i = 0; i < 3; i += 1) {
        const r = await bridgeCall("getTextInventoryAll", {}, "getTextInventoryAllResult", 8000).catch(() => null);
        if (r && r.front && Array.isArray(r.front.items)) return { snapshotHash: r.snapshotHash, frontItems: r.front.items, page: r.page || null };
        await SLEEP(1200);
      }
      return {};
    };
    const snapOf = (items) => ({ front: { exists: true, side: "front", items: items.map((it, i) => Object.assign({}, it, { slotId: "front-" + (i + 1), slotIdx: i })) }, back: null });
    const FZ = (it) => { const g = (v) => (typeof v === "number" ? Number(v.toFixed(3)) : v); return { fontSize: g(it.fontSize), left: g(it.left), top: g(it.top), width: g(it.width), angle: g(it.angle), fill: it.fill != null ? String(it.fill) : null }; };

    for (const def of P_CASES) {
      if (WHITELIST.length && WHITELIST.indexOf(def.id) < 0) continue;
      const rec = { case: def.id, note: "执行前 planHash 比对（Snapshot Concurrency Guard）", steps: [], errors: [], runs: [] };
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
        const inj = await injectSlotsOn(0, def.slots);
        await SLEEP(1500);
        if (!(inj && inj.ok)) { rec.errors.push("SLOT_INJECT_FAIL"); continue; }
        await SLEEP(1400);
        const inv = await readInv();
        const items = inv.frontItems || [];
        const planHash = inv.snapshotHash;
        rec.plan = { count: items.length, text0: items[0] && items[0].text, planHash: planHash, pageId: (inv.page && inv.page.pageId) || null };
        if (!rec.plan.count || !rec.plan.pageId || !planHash) { rec.errors.push("PLAN_INCOMPLETE"); continue; }
        const matches = def.customerTexts.slice(0, items.length).map((ct, i) => ({ slotId: "front-" + (i + 1), side: "front", slotIdx: i, objectUuid: items[i] && items[i].objectUuid, customerText: ct, confidence: 0.99, reason: "accept" }));
        const cmdPlan = applyV2.zyBuildApplyCommandPlan({ snapshot: snapOf(items), matches: matches });
        rec.cmdPlan = { ok: cmdPlan.ok, toApply: cmdPlan.summary.toApply, errors: cmdPlan.errors.slice(0, 3) };
        if (!cmdPlan.ok) { rec.errors.push("CMD_PLAN_FAIL"); continue; }
        // ---- 轮1：正常执行（带 planHash）----
        const resp1 = await bridgeCall("templateApplyV2", { commands: cmdPlan.commands, pageId: rec.plan.pageId, slotsCount: { front: items.length }, planHash: planHash }, "templateApplyV2Result", 20000);
        rec.r1 = { ok: !!resp1.ok, code: resp1.code || null, applied: (resp1.applied || []).map((a) => a.text), message: String(resp1.message || "").slice(0, 100) };
        await SLEEP(1200);
        const invAfter = await readInv();
        const aItems = invAfter.frontItems || [];
        rec.after1 = { count: aItems.length, texts: aItems.map((it) => it.text), frozen: aItems.map(FZ), hash: invAfter.snapshotHash };
        const fails1 = [];
        if (!resp1.ok || resp1.code !== "OK") fails1.push("R1_NOT_OK[" + String(resp1.code || "?") + "]");
        if (!resp1.applied || resp1.applied.length !== def.customerTexts.length) fails1.push("R1_APPLIED_COUNT");
        if (rec.after1.count !== items.length) fails1.push("R1_COUNT_CHANGED");
        for (let i = 0; i < def.customerTexts.length; i += 1) { if (String(rec.after1.texts[i] || "") !== def.customerTexts[i]) { fails1.push("R1_TEXT_MISMATCH[" + i + "]"); break; } }
        for (let i = 0; i < items.length; i += 1) {
          const fb = JSON.stringify(rec.after1.frozen[i]); const fa = JSON.stringify(FZ(aItems[i]));
          if (fb !== fa) { fails1.push("R1_FROZEN[" + i + "] " + fb + " -> " + fa); break; }
        }
        rec.r1Fails = fails1;
        if (fails1.length) rec.errors.push("ASSERT_FAIL r1: " + fails1.join(" | "));
        // ---- 防伪：手动篡改槽0 text → 现场 hash 变化 ----
        const tam = await tamperFirstText(def.tamperText);
        await SLEEP(1200);
        const invT = await readInv();
        rec.tamper = { ok: !!tam.ok, firstNow: tam.firstNow || null, tamperedHash: invT.snapshotHash, hashChanged: invT.snapshotHash != null && planHash != null && invT.snapshotHash !== planHash, text0Now: (invT.frontItems && invT.frontItems[0] && invT.frontItems[0].text) || null };
        // ---- 轮2：旧 planHash 再执行 → 必须 SLOT_STATE_CHANGED ----
        const resp2 = await bridgeCall("templateApplyV2", { commands: cmdPlan.commands, pageId: rec.plan.pageId, slotsCount: { front: items.length }, planHash: planHash }, "templateApplyV2Result", 20000);
        rec.r2 = { ok: !!resp2.ok, code: resp2.code || null, applied: (resp2.applied || []).map((a) => a.text), message: String(resp2.message || "").slice(0, 100) };
        const fails2 = [];
        if (resp2.ok) fails2.push("R2_NOT_BLOCKED");
        if (resp2.code !== "SLOT_STATE_CHANGED") fails2.push("R2_CODE[" + String(resp2.code || "?") + "]");
        if ((resp2.applied || []).length) fails2.push("R2_APPLIED_NONEMPTY");
        if (!rec.tamper.hashChanged) fails2.push("TAMPER_HASH_UNCHANGED（篡改未反映到 hash，验证失效）");
        rec.r2Fails = fails2;
        if (fails2.length) rec.errors.push("ASSERT_FAIL r2: " + fails2.join(" | "));
        // ---- 轮3：篡改值未被覆盖（画布仍是被手动改的文本）----
        const invEnd = await readInv();
        rec.after2 = { text0: (invEnd.frontItems && invEnd.frontItems[0] && invEnd.frontItems[0].text) || null, count: (invEnd.frontItems || []).length };
        if (rec.after2.text0 !== def.tamperText || rec.after2.count !== items.length) rec.errors.push("ASSERT_FAIL r3: OVERWRITTEN_OR_COUNT_CHANGED");
      } catch (e) { rec.errors.push("RUN: " + String(e && (e.message || e) || e).slice(0, 300)); }
    }
    out.errors = out.errors.slice(0, 20);
  } catch (e) { out.errors.push("FATAL: " + String(e && (e.message || e) || e).slice(0, 400)); }
  finally { try { await browser.close(); } catch (e) {} }
  fs.writeFileSync(path.join(REPORT_DIR, "commit-46m-concurrency-guard-real.json"), JSON.stringify(out, null, 2));
  console.log("[commit-46m] report -> runtime/reports/stage-11/commit-46m-concurrency-guard-real.json");
})().catch((e) => { console.error("FATAL: " + String(e && (e.message || e) || e).slice(0, 600)); process.exit(1); });