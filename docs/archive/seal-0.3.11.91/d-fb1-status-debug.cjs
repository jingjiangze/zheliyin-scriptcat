// 定位 FB1 预览未完成：抓 #zy-status 采样 + pageerror + console
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("D:/zheliyin-scriptcat/node_modules/playwright");
const ROOT = "D:/zheliyin-scriptcat";
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const EXT_ID = "ndcooeababalnlpkfedmmbbbgkljhpjf";
const USERSCRIPT_PATH = path.join(ROOT, "zheliyin-card-assistant.user.js");
const adapter = require(path.join(ROOT, "runtime", "scriptcat-adapter"));
const probeMod = require(path.join(ROOT, "runtime", "stage9", "session-probe"));
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const AI_KEY = process.env.ZY_AI_KEY || "";
const AI_BASE_URL = process.env.ZY_AI_BASE_URL || "https://api.siliconflow.cn/v1";
const AI_MODEL = process.env.ZY_AI_MODEL || "Qwen/Qwen2.5-7B-Instruct";

const FRONT = [{ text: "山东启诚信息技术股份", fontSize: 14, fontFamily: "方正黑体简体" },
  { text: "王晓明", fontSize: 18, fontFamily: "思源黑体 Regular" },
  { text: "销售副总监", fontSize: 24, fontFamily: "思源黑体 Bold" },
  { text: "1380 0138 000", fontSize: 15, fontFamily: "思源黑体 Regular" }];
const BACK = [{ text: "主营：企业咨询", fontSize: 14, fontFamily: "思源黑体 Regular" },
  { text: "服务热线：400-100", fontSize: 12, fontFamily: "思源黑体 Regular" },
  { text: "地址：建国路89号", fontSize: 11, fontFamily: "思源黑体 Regular" }];
const PASTE = ["正面：", "山东启诚信息技术有限公司", "王小明", "销售总监", "电话：13800138000",
  "反面：", "主营：企业信息化咨询", "服务热线：400-888-6666", "地址：建国路88号"];

function parseCookies(raw) {
  const out = [];
  String(raw || "").split(";").forEach((part) => {
    const eq = part.indexOf("=");
    if (eq <= 0) return;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!name || !value) return;
    out.push({ name, value: value.replace(/^"|"$/g, ""), domain: ".diy.zheliyin.com", path: "/", expires: -1 });
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
function payload() {
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

(async () => {
  const sess = await probeMod.resolveStage9Cookie();
  if (!sess.raw) { console.error("NO_COOKIE"); process.exit(2); }
  const browser = await chromium.launchPersistentContext(PROFILE, {
    channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
    args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR],
    viewport: { width: 1280, height: 900 }
  });
  browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
  const page = browser.pages()[0];
  const perrs = [], cons = [];
  page.on("pageerror", (e) => perrs.push(String(e && e.message || e).slice(0, 300)));
  page.on("console", (m) => { if (m.type() === "error") cons.push(String(m.text()).slice(0, 300)); });
  try { await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}); await SLEEP(1400); const all = await adapter.getAllScripts(page) || []; for (const s of all.filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(page, s.uuid); } catch (e) {} } } catch (e) {}
  for (const c of parseCookies(sess.raw)) { try { await browser.addCookies([c]); } catch (e) {} }
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await SLEEP(6000);
  const clickSide = async (w) => { for (let i = 0; i < 20; i++) { const r = await page.evaluate((x) => { const els = Array.from(document.querySelectorAll(".page-group, .pageNum")); const h = els.find((el) => String(el.textContent || "").trim() === x && el.offsetParent); if (h) { try { h.click(); return true; } catch (e) {} } return false; }, w).catch(() => false); if (r) return true; await SLEEP(700); } return false; };
  console.log("click 背面=" + await clickSide("背面")); await SLEEP(3000);
  console.log("click 正面=" + await clickSide("正面")); await SLEEP(2500);
  await page.evaluate(({ b, m, k }) => { const set = (x, v) => { try { localStorage.setItem("zy8dshim:" + x, JSON.stringify(v)); } catch (e) {} }; set("zyBaiduOcrMode", "standard"); set("zyStage9NativeOcrMode", "2"); set("zyStage9NativeTruth", "1"); set("zyStage9LocalSidecar", "0"); set("zyOcrMode", "baidu"); set("zyStage9InkGeometry", "0"); set("zyShowTemplatePanel", "1"); set("zyArkApiKey", k); set("zyArkBaseUrl", b); set("zyArkModel", m); }, { b: AI_BASE_URL, m: AI_MODEL, k: AI_KEY });
  await SLEEP(400);
  await page.evaluate((code) => { const s = document.createElement("script"); s.textContent = code; (document.head || document.documentElement).appendChild(s); }, payload());
  await SLEEP(1600);
  for (let i = 0; i < 20; i++) { const ok = await page.evaluate(() => !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed) && !!document.querySelector("#zy-raw")).catch(() => false); if (ok) break; await SLEEP(1000); }
  const inj = (idx, defs, base) => page.evaluate((j) => {
    const a = JSON.parse(j);
    const rq = window.requirejs || window.require;
    const vo = ((rq && rq.s && rq.s.contexts && rq.s.contexts._ && rq.s.contexts._.defined && rq.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
    const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[a.canvasIdx];
    if (!d || !d.canvas || typeof d.drawText !== "function") return { ok: false, reason: "NO_CANVAS" };
    const cw = d.canvas.getWidth ? d.canvas.getWidth() : 300, ch = d.canvas.getHeight ? d.canvas.getHeight() : 210;
    const bl = (d.canvasObjInfo.canvasToProductObjArr || []).length;
    let made = 0;
    a.defs.forEach(function (s, i) {
      const left = cw * 0.12 + (i % 3) * 8, top = ch * 0.1 + i * (ch * 0.075);
      const entry = { "media": { "mediaType": "text", "text": s.text, "font": { "pointSize": s.fontSize, "fontColor": "#111111", "isHorizontal": 1, "gravity": "left", "id": String(900 + a.layerBase + i), "isItalic": 0, "textDecoration": "", "linethrough": 0, "overline": 0, "isBold": 0, "overprintStroke": 0 }, "charSpace": 0, "lineSpace": 1.2, "lineIdType": 0, "isBG": 0, "imgPath": "" }, "location": { "x": left, "y": top, "width": 160, "height": 36, "factWidth": 160, "factHeight": 36, "rotation": 0 }, "printLocation": { "x": left, "y": top, "width": 160, "height": 36, "rotation": 0 }, "layer": { "alpha": 1 }, "layerNum": a.layerBase + bl + i, "isEdit": 1, "isDisplay": 0, "deleteState": 0, "visitLevel": 1, "multiUuid": "dbg-" + String(a.layerBase + 201 + i), "markuuid": "", "topEnable": 1, "resourceType": 0, "maskEnable": 0, "lowPixelFlag": 0, "selectEnabled": 1, "isDesign": 1, "isComposite": 0, "isPreview": 0, "isDesignShape": 0 };
      d.drawText(s.text, null, null, null, entry, a.layerBase + bl + i); made += 1;
    });
    try { d.canvas.requestRenderAll(); } catch (e) {}
    return { ok: made === a.defs.length, made: made };
  }, JSON.stringify({ canvasIdx: idx, defs: defs, layerBase: base })).catch((e) => ({ ok: false, reason: String(e && e.message).slice(0, 100) }));
  console.log("injFront=" + JSON.stringify(await inj(0, FRONT, 0)));
  console.log("injBack=" + JSON.stringify(await inj(1, BACK, 500)));
  await SLEEP(1600);
  await page.evaluate((t) => { const ta = document.querySelector("#zy-raw"); ta.value = t; ta.dispatchEvent(new Event("input", { bubbles: true })); }, PASTE.join("\n"));
  const cl = await page.evaluate(() => { const el = document.querySelector("#zy-smart-fill"); if (el && el.offsetParent) { el.click(); return true; } return false; });
  console.log("clicked smart-fill=" + cl);
  const seen = [];
  for (let i = 0; i < 40; i++) {
    await SLEEP(900);
    const st = await page.evaluate(() => { const el = document.querySelector("#zy-status"); return el ? String(el.textContent || "").trim().slice(0, 900) : null; }).catch(() => null);
    if (st && seen[seen.length - 1] !== st) seen.push(st);
    if (st && (st.indexOf("AI 槽位匹配完成") >= 0 || st.indexOf("已改用本地规则") >= 0 || st.indexOf("校验拦截") >= 0)) break;
  }
  console.log("\n=== status 变化序列 ===");
  seen.forEach((s, i) => console.log("[" + i + "] " + s.replace(/\n/g, " ⏎ ")));
  console.log("\n=== pageerrors ===");
  perrs.slice(-8).forEach((e) => console.log("  " + e));
  console.log("=== console errors ===");
  cons.slice(-8).forEach((e) => console.log("  " + e));
  await browser.close();
})().catch((e) => { console.error("FATAL " + String(e && e.message || e)); process.exit(1); });
