// runtime/probe-csp.js — 检测编辑器页 CSP（meta/header），验证 inline script 是否被禁（只读）
"use strict";
const path = require("path");
const { chromium } = require("playwright");

(async () => {
  const exe = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-probecsp"), {
    executablePath: exe, headless: true, ignoreDefaultArgs: ["--enable-automation"], viewport: { width: 1440, height: 900 }
  });
  const page = browser.pages()[0];
  try {
    const resp = await page.goto("https://diy.zheliyin.com/diyWeb/third/20408603/1/thirdLoginDiyEdit.do", { waitUntil: "domcontentloaded", timeout: 40000 });
    await page.waitForTimeout(4000);
    const cspHeader = resp && resp.headers() ? resp.headers()["content-security-policy"] || null : null;
    const meta = await page.evaluate(() => {
      const m = document.querySelector('meta[http-equiv="content-security-policy" i]');
      return m ? m.getAttribute("content") : null;
    });
    console.log(JSON.stringify({ cspHeader, cspMeta: meta, url: page.url() }, null, 1));
  } catch (e) { console.log("ERR " + String(e && e.message || e)); }
  finally { await browser.close().catch(() => {}); }
})();