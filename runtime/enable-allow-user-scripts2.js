// runtime/enable-allow-user-scripts2.js — 用 Playwright pierce shadow DOM 开启 Allow User Scripts（§三）
"use strict";
const path = require("path");
const { chromium } = require("playwright");

const EXT_ID = "ndcooeababalnlpkfedmmbbbgkljhpjf";

(async () => {
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc2"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${scDir}`, `--load-extension=${scDir}`],
      viewport: { width: 1440, height: 1000 }
    });
    const page = browser.pages()[0];
    await page.goto("chrome://extensions/?id=" + EXT_ID, { waitUntil: "domcontentloaded", timeout: 40000 });
    // 等详情视图渲染（shadow DOM 深处）
    await page.waitForTimeout(8000);
    // 直接尝试查找 switch（Playwright pierces shadow DOM）
    const row = page.locator("extensions-toggle-row#allow-user-scripts");
    const cnt = await row.count().catch(() => 0);
    console.log("row count=" + cnt);
    if (cnt > 0) {
      const inner = row.locator("[role=switch], .cr-toggle");
      await inner.first().waitFor({ state: "visible", timeout: 10000 }).catch((e) => console.log("switch wait err " + e.message));
      const state = await inner.first().getAttribute("aria-checked").catch(() => null);
      console.log("switch aria-checked=" + state);
      if (state !== "true") {
        await inner.first().click({ force: true }).catch((e) => console.log("click err " + e.message));
        await page.waitForTimeout(3000);
        const after = await inner.first().getAttribute("aria-checked").catch(() => null);
        console.log("after click aria-checked=" + after);
      } else {
        console.log("already enabled");
      }
    } else {
      // 备选：整页文本定位
      const body = await page.evaluate(() => (document.body ? document.body.innerText : "").slice(0, 300)).catch(() => "");
      console.log("body=" + JSON.stringify(body.slice(0, 200)));
    }
    // reload 扩展，然后检验 API
    await page.goto("chrome://extensions/?id=" + EXT_ID, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(2000);
    await page.keyboard.press("F5");
    await page.waitForTimeout(4000);
    const o = await browser.newPage();
    await o.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 20000 });
    await o.waitForTimeout(2000);
    const api = await o.evaluate(() => {
      const out = { userScriptsType: typeof chrome.userScripts };
      if (typeof chrome.userScripts !== "undefined") {
        try { chrome.userScripts.getScripts().then((r) => { self.__r = "ok:" + (r ? r.length : 0); }).catch((e) => { self.__r = "rej:" + String(e && e.message || e); }); } catch (e) { self.__r = "thr:" + String(e && e.message || e); }
      }
      return out;
    });
    await o.waitForTimeout(800);
    const g = await o.evaluate(() => self.__r || "n/a").catch(() => "n/a");
    console.log(JSON.stringify(Object.assign(api, { getScripts: g }), null, 1));
  } catch (e) { console.log("ERR " + String(e && e.stack || e)); }
  finally { if (browser) await browser.close().catch(() => {}); }
})();