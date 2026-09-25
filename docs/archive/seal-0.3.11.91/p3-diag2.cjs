// P3 诊断2：注入全部 4 个画布（v0f/v0b/v1f/v1b）后，读 getTextInventoryAll {version:0|1}，复现 runner 空读
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("D:/zheliyin-scriptcat/node_modules/playwright");
const ROOT = "D:/zheliyin-scriptcat";
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = path.join(ROOT, "runtime", "browser", "profile-usc3");
const EXT_ID = "ndcooeababalnlpkfedmmbbbgkljhpjf";
const USERSCRIPT_PATH = path.join(ROOT, "zheliyin-card-assistant.user.js");
const probeMod = require(path.join(ROOT, "runtime", "stage9", "session-probe"));
const adapter = require(path.join(ROOT, "runtime", "scriptcat-adapter"));
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";

function parseCookies(raw) {
  const out = [];
  String(raw || "").split(";").forEach((part) => { const eq = part.indexOf("="); if (eq <= 0) return; const name = part.slice(0, eq).trim(); const value = part.slice(eq + 1).trim(); if (!name || !value) return; out.push({ name: name, value: value.replace(/^"|"$/g, ""), domain: ".diy.zheliyin.com", path: "/", expires: -1 }); });
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
function injectUserscript() { let code = fs.readFileSync(USERSCRIPT_PATH, "utf8"); ["test", "demo"].forEach((b) => { code = code.split(b + "/extension/src/").join("stage-9-altq-baidu-reconstruction/extension/src/"); }); return code; }
function pageWorldPayloadFor() {
  const parts = [GM_SHIM_SOURCE];
  const norm = injectUserscript();
  [...norm.matchAll(/\/\/ @require\s+(\S+)/g)].map((m) => m[1]).forEach((u) => { const mm = /\/extension\/src\/(.+)$/.exec(u); if (!mm) return; const rel = mm[1].split("?")[0]; const fp = path.join(ROOT, "extension", "src", rel); if (fs.existsSync(fp)) parts.push("// ==== @require " + rel + " ====\n" + fs.readFileSync(fp, "utf8")); });
  parts.push(norm);
  return parts.join("\n;\n");
}
const INJ_FN = `function (canvasIdx, base, defs) {
  const req2 = window.requirejs || window.require;
  const vo2 = ((req2 && req2.s && req2.s.contexts && req2.s.contexts._ && req2.s.contexts._.defined && req2.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
  const d2 = vo2 && vo2.totalCanvasArray && vo2.totalCanvasArray[canvasIdx];
  if (!d2 || !d2.canvas || !d2.canvasObjInfo || typeof d2.drawText !== "function") return { ci: canvasIdx, ok: false, reason: "NO_CANVAS" };
  const cw = d2.canvas.getWidth ? d2.canvas.getWidth() : 300, ch = d2.canvas.getHeight ? d2.canvas.getHeight() : 210;
  const baseLayer2 = (d2.canvasObjInfo.canvasToProductObjArr || []).length;
  let made = 0; const errs = [];
  defs.forEach(function (s, i) {
    try {
      const left = cw * 0.12 + i * 8, top = ch * 0.1 + i * (ch * 0.075);
      const entry = { "media": { "mediaType": "text", "text": s.text, "font": { "pointSize": s.fontSize, "fontColor": "#111111", "isHorizontal": 1, "gravity": "left", "id": String(900 + base + i), "isItalic": 0, "textDecoration": "", "linethrough": 0, "overline": 0, "isBold": 0, "overprintStroke": 0 }, "charSpace": 0, "lineSpace": 1.2, "lineIdType": 0, "isBG": 0, "imgPath": "" }, "location": { "x": left, "y": top, "width": 160, "height": 36, "factWidth": 160, "factHeight": 36, "rotation": 0 }, "printLocation": { "x": left, "y": top, "width": 160, "height": 36, "rotation": 0 }, "layer": { "alpha": 1 }, "layerNum": base + baseLayer2 + i, "isEdit": 1, "isDisplay": 0, "deleteState": 0, "visitLevel": 1, "multiUuid": "cplq-s" + String(base + 201 + i), "markuuid": "", "topEnable": 1, "resourceType": 0, "maskEnable": 0, "lowPixelFlag": 0, "selectEnabled": 1, "isDesign": 1, "isComposite": 0, "isPreview": 0, "isDesignShape": 0 };
      d2.drawText(s.text, null, null, null, entry, base + baseLayer2 + i); made += 1;
    } catch (e) { errs.push(String(i) + ":" + String(e && e.message || e).slice(0, 80)); }
  });
  try { d2.canvas.requestRenderAll(); } catch (e) {}
  return { ci: canvasIdx, ok: made === defs.length, made: made, baseLayer: baseLayer2, errs: errs };
}`;
(async () => {
  const sess = await probeMod.resolveStage9Cookie();
  const COOKIE_RAW = sess.raw || "";
  if (!COOKIE_RAW) { console.error("NO_COOKIE"); process.exit(2); }
  const browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1280, height: 900 } });
  browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
  const page = browser.pages()[0];
  const bridgeCall = (type, payload) => page.evaluate((arg) => new Promise((resolve) => {
    let done = false;
    const on = (ev) => { const d = ev.data; if (d && d.source === "zy-card-assistant-page" && d.type === arg.rt) { window.removeEventListener("message", on); done = true; resolve(d); } };
    window.addEventListener("message", on);
    setTimeout(() => { if (!done) { window.removeEventListener("message", on); resolve({ skip: true }); } }, 10000);
    window.postMessage(Object.assign({ source: "zy-card-assistant", type: arg.type }, arg.payload || {}), location.origin);
  }), { type: type, payload: payload, rt: type + "Result" });
  const injectAt = (ci, base, defs) => page.evaluate((arg) => { const fn = eval("(" + arg.fn + ")"); return fn(arg.ci, arg.base, JSON.parse(arg.defs)); }, { fn: INJ_FN, ci: ci, base: base, defs: JSON.stringify(defs) });
  try {
    await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await SLEEP(1200);
    const all = await adapter.getAllScripts(page) || [];
    for (const s of all.filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(page, s.uuid); } catch (e) {} }
    for (const c of parseCookies(COOKIE_RAW)) { try { await browser.addCookies([c]); } catch (e) {} }
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await SLEEP(6000);
    await page.evaluate(() => { const el = Array.from(document.querySelectorAll(".page-group, .pageNum")).find((e) => String(e.textContent || "").trim() === "背面" && e.offsetParent); if (el) el.click(); });
    await SLEEP(3000);
    await page.evaluate(() => { const el = Array.from(document.querySelectorAll(".page-group, .pageNum")).find((e) => String(e.textContent || "").trim() === "正面" && e.offsetParent); if (el) el.click(); });
    await SLEEP(2500);
    await page.evaluate(() => { const el = document.querySelector(".pageWrapMulti li .hover-tips a.copy-template"); if (el) el.click(); });
    await SLEEP(2500);
    await page.evaluate(() => { const set = (el, v) => { const p = HTMLInputElement.prototype; const s = Object.getOwnPropertyDescriptor(p, "value").set; try { s.call(el, String(v)); } catch (e) { el.value = String(v); } el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }; const mn = document.getElementById("modleNum"), un = document.getElementById("multiNum"); if (mn && un) { set(mn, 1); set(un, 1); const ok = Array.from(document.querySelectorAll(".layui-layer-btn a")).find((b) => /确定/.test(String(b.textContent || "").trim())); if (ok) ok.click(); } });
    await SLEEP(12000);
    await page.evaluate(() => { try { localStorage.setItem("zy8dshim:" + "zyShowTemplatePanel", JSON.stringify("1")); } catch (e) {} });
    await page.evaluate((code) => { const s = document.createElement("script"); s.textContent = code; (document.head || document.documentElement).appendChild(s); }, pageWorldPayloadFor());
    await SLEEP(2000);
    for (let i = 0; i < 20; i += 1) { const r = await page.evaluate(() => !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed)).catch(() => false); if (r) break; await SLEEP(1000); }
    await page.evaluate(() => { const gs = Array.from(document.querySelectorAll(".pageWrapMulti .page-group")); if (gs[0]) gs[0].click(); });
    await SLEEP(4500);
    const F = [{ text: "启诚科技有限公司", fontSize: 16 }, { text: "王晓明", fontSize: 22 }, { text: "销售总监", fontSize: 14 }, { text: "13800000000", fontSize: 13 }];
    const B = [{ text: "主营：企业咨询", fontSize: 14 }, { text: "服务热线：400-100-1000", fontSize: 12 }];
    const inj = [];
    inj.push(await injectAt(0, 0, F));
    inj.push(await injectAt(1, 500, B));
    inj.push(await injectAt(2, 1000, F));
    inj.push(await injectAt(3, 1500, B));
    await SLEEP(1800);
    const direct = await page.evaluate(() => { const req = window.requirejs || window.require; const ctx = req && req.s && req.s.contexts && req.s.contexts._; const CV = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO || null; const total = CV && CV.totalCanvasArray; const out = []; if (Array.isArray(total)) total.forEach((e, i) => { let n = null; try { const c = e && e.canvas; if (c && c.getObjects) n = c.getObjects().length; } catch (ex) {} out.push({ idx: i, objs: n }); }); return { totalLen: Array.isArray(total) ? total.length : null, currentCanvasNum: CV && CV.currentCanvasNum, out: out }; });
    const i0 = await bridgeCall("getTextInventoryAll", { version: 0 });
    const i1 = await bridgeCall("getTextInventoryAll", { version: 1 });
    const ia = await bridgeCall("getTextInventoryAll", {});
    const mvi = await bridgeCall("getMultiVersionInfo", {});
    console.log("[diag2] inj=" + JSON.stringify(inj));
    console.log("[diag2] direct=" + JSON.stringify(direct));
    console.log("[diag2] invV0: front=" + (i0 && i0.front && (i0.front.items || []).length) + " back=" + (i0 && i0.back && (i0.back.items || []).length) + " exists=" + (i0 && i0.front && i0.front.exists));
    console.log("[diag2] invV1: front=" + (i1 && i1.front && (i1.front.items || []).length) + " back=" + (i1 && i1.back && (i1.back.items || []).length) + " exists=" + (i1 && i1.front && i1.front.exists));
    console.log("[diag2] invAll: front=" + (ia && ia.front && (ia.front.items || []).length) + " back=" + (ia && ia.back && (ia.back.items || []).length));
    console.log("[diag2] mvi.versions=" + JSON.stringify(mvi && mvi.versions));
    console.log("[diag2] mvi.current=" + JSON.stringify(mvi && mvi.current));
  } catch (e) { console.error("[diag2] ERR " + String(e && e.message || e)); }
  finally { try { await browser.close(); } catch (e) {} }
})();
