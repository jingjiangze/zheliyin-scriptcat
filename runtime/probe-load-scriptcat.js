// runtime/probe-load-scriptcat.js — 验证 Playwright Chromium 能否加载真实 ScriptCat（只读）
"use strict";
const path = require("path");
const { chromium } = require("playwright");

(async () => {
  const profileDir = path.join(__dirname, "browser", "profile-scriptcat-probe");
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(profileDir, {
      channel: "chromium",
      headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: [
        "--disable-features=DisableLoadExtensionCommandLineSwitch",
        "--enable-unsafe-extension-debugging",
        `--disable-extensions-except=${scDir}`,
        `--load-extension=${scDir}`
      ],
      viewport: { width: 1440, height: 900 }
    });
    const page = browser.pages()[0];
    // 检查扩展是否加载（service worker / extension target）
    const cdp = await browser.newCDPSession(page);
    const targets = await cdp.send("Target.getTargets");
    const extTargets = targets.targetInfos.filter(t => t.url.startsWith("chrome-extension://"));
    const out = { extTargets: extTargets.map(t => t.url) };
    // 直接访问 ScriptCat 管理页（按其 manifest 的 options_ui page）
    const extId = extTargets.length ? new URL(extTargets[0].url).host : null;
    out.extId = extId;
    if (extId) {
      const opts = await browser.newPage();
      await opts.goto("chrome-extension://" + extId + "/src/options.html#/script/editor", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(e => { out.optionsErr = String(e && e.message || e); });
      await opts.waitForTimeout(3000);
      out.optionsTitle = await opts.title().catch(() => null);
      out.optionsBody = (await opts.evaluate(() => (document.body ? document.body.innerText : "").slice(0, 200)).catch(() => "")) + "";
      await opts.close().catch(() => {});
    }
    console.log(JSON.stringify(out, null, 1));
  } catch (e) {
    console.log(JSON.stringify({ error: String(e && e.message || e) }, null, 1));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();