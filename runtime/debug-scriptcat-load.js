// runtime/debug-scriptcat-load.js — 极简：加载 vendor ScriptCat + 打开列表页（仅诊断，headed）
"use strict";
const path = require("path");
const { chromium } = require("playwright");

(async () => {
  const fs = require("fs");
  const log = (m) => { const s = "[dsc] " + m; console.log(s); fs.appendFileSync(path.join(__dirname, "reports", "dsc.log"), s + "\n"); };
  log("start");
  const profileDir = path.join(__dirname, "browser", "profile-dsc");
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  let browser = null;
  try {
    log("launching");
    browser = await chromium.launchPersistentContext(profileDir, {
      channel: "chromium", headless: true,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${scDir}`, `--load-extension=${scDir}`],
      viewport: { width: 1200, height: 800 }
    });
    log("launched");
    const page = browser.pages()[0];
    await page.goto("chrome-extension://ndcooeababalnlpkfedmmbbbgkljhpjf/src/options.html#/script/list", { waitUntil: "domcontentloaded", timeout: 25000 });
    log("goto list ok");
    await page.waitForTimeout(3500);
    const body = await page.evaluate(() => (document.body ? document.body.innerText : "").slice(0, 400));
    log("body=" + JSON.stringify(body.slice(0, 300)));
    log("done");
  } catch (e) {
    log("ERR " + String(e && e.stack || e));
  } finally {
    if (browser) { try { await browser.close(); log("closed"); } catch (e2) { log("close err " + String(e2 && e2.message || e2)); } }
  }
  log("end");
})();