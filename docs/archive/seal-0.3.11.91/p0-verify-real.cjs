// P0 真机验证：改后凭据输入框 type/遮罩/可写性 + 面板无 password 字段
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
  const page = browser.pages()[0];
  try { await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}); await SLEEP(1400); const all = await adapter.getAllScripts(page) || []; for (const s of all.filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(page, s.uuid); } catch (e) {} } } catch (e) {}
  for (const c of parseCookies(sess.raw)) { try { await browser.addCookies([c]); } catch (e) {} }
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await SLEEP(6000);
  await page.evaluate(({ b, m, k }) => { const set = (x, v) => { try { localStorage.setItem("zy8dshim:" + x, JSON.stringify(v)); } catch (e) {} }; set("zyShowTemplatePanel", "1"); set("zyArkApiKey", k); set("zyArkBaseUrl", b); set("zyArkModel", m); }, { b: "https://api.siliconflow.cn/v1", m: "Qwen/Qwen2.5-7B-Instruct", k: "sk-test-p0-verify" });
  await SLEEP(400);
  await page.evaluate((code) => { const s = document.createElement("script"); s.textContent = code; (document.head || document.documentElement).appendChild(s); }, payload());
  for (let i = 0; i < 20; i += 1) { const ok = await page.evaluate(() => !!document.querySelector("#zy-raw")).catch(() => false); if (ok) break; await SLEEP(1000); }
  await SLEEP(1200);

  const out = {};
  // 1) 全页 password 字段计数（应为 0）
  out.passwordFieldsInPage = await page.evaluate(() => document.querySelectorAll("input[type=password]").length);
  // 2) 5 个凭据输入框属性 + 遮罩 + 可写性
  out.fields = await page.evaluate(() => {
    const ids = ["zy-api-key", "zy-baidu-ak", "zy-baidu-sk", "zy-baidu-ak-native", "zy-baidu-sk-native"];
    return ids.map((id) => {
      const el = document.getElementById(id);
      if (!el) return { id, found: false };
      const cs = getComputedStyle(el);
      // 可写性测试
      const orig = el.value;
      const p = HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(p, "value").set;
      let wrote = null, readBack = null;
      try { setter.call(el, "P0-WRITE-TEST"); el.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) { el.value = "P0-WRITE-TEST"; }
      readBack = el.value;
      wrote = readBack === "P0-WRITE-TEST";
      try { setter.call(el, orig); el.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) { el.value = orig; }
      return {
        id, found: true, type: el.type, hasSecretClass: el.classList.contains("zy-secret"),
        autocomplete: el.getAttribute("autocomplete"), dataFormType: el.getAttribute("data-form-type"),
        textSecurity: cs.webkitTextSecurity || cs.getPropertyValue("-webkit-text-security"),
        wrote, readBackOk: readBack === "P0-WRITE-TEST", restored: el.value === orig
      };
    });
  });
  // 3) 面板仍可正常操作（一键智能填充按钮存在 + 粘贴框可写）
  out.panelOk = await page.evaluate(() => {
    const ta = document.querySelector("#zy-raw"), btn = document.querySelector("#zy-smart-fill");
    if (!ta || !btn) return { ok: false };
    ta.value = "正面：\n测试\n";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    return { ok: true, rawWritable: ta.value.indexOf("测试") >= 0, btnVisible: !!btn.offsetParent };
  });
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error("FATAL " + String(e && e.message || e)); process.exit(1); });