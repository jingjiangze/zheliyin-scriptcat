// runtime/stage8d/probe-userscripts.js — 验证 chrome.userScripts API 注入通路与授权状态
"use strict";
const path = require("path");
const { chromium } = require("../../node_modules/playwright");
const adapter = require("../scriptcat-adapter");
const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1440, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    const opts = browser.pages()[0];
    await opts.goto("chrome-extension://" + adapter.EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await SLEEP(2000);
    const r1 = await opts.evaluate(async () => {
      const out = {};
      try {
        const worlds = await chrome.userScripts.getWorldConfigurations();
        out.worlds = worlds;
      } catch (e) { out.worldsErr = String(e && e.message || e).slice(0, 160); }
      try {
        await chrome.userScripts.unregister({ ids: ["zy8d-direct-marker"] }).catch(() => {});
        await chrome.userScripts.register({
          id: "zy8d-direct-marker",
          matches: ["https://diy.zheliyin.com/*"],
          js: [{ code: "try{window.__zy8dInjected=(window.__zy8dInjected||0)+1}catch(e){}" }],
          runAt: "document_idle"
        });
        out.register = "ok";
      } catch (e) { out.registerErr = String(e && e.message || e).slice(0, 200); }
      return out;
    });
    console.log("userScripts probe:", JSON.stringify(r1));
    await opts.goto("https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do", { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await SLEEP(6000);
    const marker = await opts.evaluate(() => ({ injected: window.__zy8dInjected || 0 })).catch((e) => ({ err: String(e).slice(0, 100) }));
    console.log("marker on target page:", JSON.stringify(marker));
  } catch (e) { console.log("PROBE ERROR:", String(e && e.message || e).slice(0, 400)); }
  finally { try { browser && await browser.close(); } catch (e) {} }
})();