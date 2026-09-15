// runtime/probe-err.js — 加载编辑器页，捕获 console/pageerror，定位 assistant 注入异常（只读）
"use strict";
const path = require("path");
const { launchDedicated, healthCheck } = require("./browser-launcher");

(async () => {
  const profileDir = path.join(__dirname, "browser", "profile-full");
  const manifestDir = path.join(__dirname, "..", "extension");
  let browser = null;
  try {
    const launched = await launchDedicated({ profileDir, headless: false, loadExtensionDir: manifestDir, forcePlaywrightChromium: true });
    browser = launched.browser;
    const page = browser.pages()[0];
    const logs = [];
    page.on("console", (msg) => { if (["error", "warning"].includes(msg.type())) logs.push("[" + msg.type() + "] " + msg.text().slice(0, 200)); });
    page.on("pageerror", (err) => logs.push("[pageerror] " + String(err && err.message || err).slice(0, 300)));

    await page.goto("https://diy.zheliyin.com/diyWeb/third/20408603/1/thirdLoginDiyEdit.do", { waitUntil: "domcontentloaded", timeout: 40000 }).catch((e) => console.log("nav err " + e.message));
    await page.waitForTimeout(8000);

    const h = await healthCheck(page);
    const b = await page.evaluate(() => {
      const cb = window.__ZY_CARD_ASSISTANT_BRIDGE__;
      return { marker: cb ? { installed: cb.installed, ts: cb.ts } : null, markerKeys: cb ? Object.keys(cb) : [], hasPanel: !!document.getElementById("zy-card-assistant") };
    });
    console.log(JSON.stringify({ health: { panelCount: h.panelCount, bridgeMarker: h.bridgeMarker, requirejs: h.requirejs, fabric: h.fabric }, bridge: b, logs: logs.slice(0, 20) }, null, 1));
  } catch (e) { console.log("ERR " + String(e && e.message || e)); }
  finally { if (browser) await browser.close().catch(() => {}); }
})();