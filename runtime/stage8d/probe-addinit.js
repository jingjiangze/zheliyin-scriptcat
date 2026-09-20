// runtime/stage8d/probe-addinit.js — 验证 addInitScript 页面 world 注入通路（绕过 ScriptCat 注入）
"use strict";
const path = require("path");
const { chromium } = require("../../node_modules/playwright");
const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = process.env.ZY_URL || "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";

(async () => {
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1440, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    const page = browser.pages()[0];
    // 附加 document 生命周期注入（页面 world 回填 window.__zy8dMarker）
    await page.addInitScript({ content: "try{ window.__zy8dMarker='A:'+(Date.now()); if(window.GM_getValue===undefined){window.GM_getValue=function(k,d){try{return JSON.parse(localStorage.getItem('zy8dshim_'+k)||'null')==null?d:JSON.parse(localStorage.getItem('zy8dshim_'+k));}catch(e){return d;}};} }catch(e){window.__zy8dMarker='ERR:'+e.message;}" });
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await SLEEP(6000);
    const m = await page.evaluate(() => ({ marker: window.__zy8dMarker || null, hasGM: typeof window.GM_getValue })).catch((e) => ({ err: String(e).slice(0, 120) }));
    console.log("addInitScript marker:", JSON.stringify(m));
  } catch (e) { console.log("PROBE ERROR:", String(e && e.message || e).slice(0, 400)); }
  finally { try { browser && await browser.close(); } catch (e) {} }
})();