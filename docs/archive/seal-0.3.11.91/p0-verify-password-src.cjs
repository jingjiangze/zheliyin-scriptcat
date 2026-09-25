// 确认页面上 4 个 input[type=password] 的来源（站点自身 vs 我们漏改）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("D:/zheliyin-scriptcat/node_modules/playwright");
const ROOT = "D:/zheliyin-scriptcat";
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const EXT_ID = "ndcooeababalnlpkfedmmbbbgkljhpjf";
const adapter = require(path.join(ROOT, "runtime", "scriptcat-adapter"));
const probeMod = require(path.join(ROOT, "runtime", "stage9", "session-probe"));
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";

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
const LIST = () => {
  return Array.from(document.querySelectorAll("input[type=password]")).map((el) => {
    const box = el.getBoundingClientRect();
    const pathTxt = (function () {
      let p = el, segs = [];
      for (let i = 0; i < 5 && p; i += 1) { segs.unshift(p.tagName.toLowerCase() + (p.id ? "#" + p.id : "") + (p.className && typeof p.className === "string" ? "." + p.className.trim().split(/\s+/).slice(0, 2).join(".") : "")); p = p.parentElement; }
      return segs.join(" > ");
    })();
    return { id: el.id || null, name: el.name || null, cls: String(el.className || ""), placeholder: String(el.placeholder || "").slice(0, 40), visible: el.offsetParent !== null, w: Math.round(box.width), h: Math.round(box.height), inOurPanel: !!el.closest("#zy-card-assistant, .zy-status, .zy-settings"), inNativeDrawer: !!el.closest("[class*=zy-]"), ancestorPath: pathTxt };
  });
};

(async () => {
  const sess = await probeMod.resolveStage9Cookie();
  if (!sess.raw) { console.error("NO_COOKIE"); process.exit(2); }
  const browser = await chromium.launchPersistentContext(PROFILE, {
    channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
    args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR],
    viewport: { width: 1280, height: 900 }
  });
  const page = browser.pages()[0];
  try { await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}); await SLEEP(1400); const all = await adapter.getAllScripts(page) || []; for (const s of all.filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(page, s.uuid); } catch (e) {} } } catch (e) {}
  for (const c of parseCookies(sess.raw)) { try { await browser.addCookies([c]); } catch (e) {} }
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await SLEEP(6000);
  const out = { withoutOurScript: null, withOurScript: null };
  out.withoutOurScript = await page.evaluate(LIST).catch(() => null);
  // 注入我们的脚本后再看
  await page.evaluate(() => { const set = (x, v) => { try { localStorage.setItem("zy8dshim:" + x, JSON.stringify(v)); } catch (e) {} }; set("zyShowTemplatePanel", "1"); });
  await SLEEP(300);
  const code = (function () {
    const GM = "try{window.__ZY8D_PAGE_WORLD__=true;if(typeof window.GM_getValue==='undefined'){window.GM_getValue=function(k,d){try{var v=localStorage.getItem('zy8dshim:'+k);return v==null?d:JSON.parse(v);}catch(e){return d;}};}if(typeof window.GM_setValue==='undefined'){window.GM_setValue=function(k,v){try{localStorage.setItem('zy8dshim:'+k,JSON.stringify(v));}catch(e){}};}if(typeof window.GM_xmlhttpRequest==='undefined'){window.GM_xmlhttpRequest=function(o){var u=o.url||'',m=(o.method||'POST');fetch(u,{method:m,headers:(o.headers||{}),body:o.data}).then(function(res){return res.text().then(function(t){return {status:res.status,responseText:t,response:t,readyState:4,finalUrl:u};});}).then(function(r){if(o.onload)try{o.onload(r);}catch(e){};}).catch(function(e){if(o.onerror)try{o.onerror({status:0,error:String(e&&e.message||e)||'fetch-error',responseText:''});}catch(e2){};});return {abort:function(){}};};}if(typeof window.GM_addStyle==='undefined'){window.GM_addStyle=function(css){var el=document.createElement('style');el.textContent=css;(document.head||document.documentElement).appendChild(el);return el;};}if(typeof window.GM_addElement==='undefined'){window.GM_addElement=function(tag,attrs){var el=document.createElement(tag);for(var k in (attrs||{})){try{el[k]=attrs[k];}catch(e){}};(document.head||document.documentElement).appendChild(el);return el;};}}catch(e){console.error('[zy8d-shim]',e);}";
    let us = fs.readFileSync(path.join(ROOT, "zheliyin-card-assistant.user.js"), "utf8");
    ["stage-8a-1-ocr-overflow-rotation", "stage-8a-ocr-audit", "stage-8b-ocr-reconstruction-engine", "stage-8a-2-rotation-policy-geometry", "stage-8d-ocr-quality-reconstruction", "test", "demo"].forEach((b) => {
      us = us.split(b + "/extension/src/").join("stage-9-altq-baidu-reconstruction/extension/src/");
      us = us.replace(new RegExp(b.replace(/[-]/g, "\\-") + "\\/zheliyin-card-assistant\\.user\\.js", "g"), "stage-9-altq-baidu-reconstruction/zheliyin-card-assistant.user.js");
    });
    const parts = [GM];
    [...us.matchAll(/\/\/ @require\s+(\S+)/g)].map((m) => m[1]).forEach((u) => {
      const mm = /\/extension\/src\/(.+)$/.exec(u);
      if (!mm) return;
      const rel = mm[1].split("?")[0];
      const fp = path.join(ROOT, "extension", "src", rel);
      if (fs.existsSync(fp)) parts.push(fs.readFileSync(fp, "utf8"));
    });
    parts.push(us);
    return parts.join("\n;\n");
  })();
  await page.evaluate((c) => { const s = document.createElement("script"); s.textContent = c; (document.head || document.documentElement).appendChild(s); }, code);
  for (let i = 0; i < 20; i += 1) { const ok = await page.evaluate(() => !!document.querySelector("#zy-raw")).catch(() => false); if (ok) break; await SLEEP(1000); }
  await SLEEP(1500);
  out.withOurScript = await page.evaluate(LIST).catch(() => null);
  out.ourPanelFields = await page.evaluate(() => Array.from(document.querySelectorAll("#zy-card-assistant input")).map((e) => ({ id: e.id, type: e.type }))).catch(() => null);
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error("FATAL " + String(e && e.message || e)); process.exit(1); });