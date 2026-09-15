// runtime/probe-csp2.js — CSP 细则 + pageBridge 注入点源码复核（只读）
"use strict";
const path = require("path");
const { launchDedicated } = require("./browser-launcher");

(async () => {
  const profileDir = path.join(__dirname, "browser", "profile-full");
  const manifestDir = path.join(__dirname, "..", "extension");
  let browser = null;
  try {
    const launched = await launchDedicated({ profileDir, headless: false, loadExtensionDir: manifestDir, forcePlaywrightChromium: true });
    browser = launched.browser;
    const page = browser.pages()[0];
    // 捕获响应 header（CSP 可能在编辑器资源的响应头）
    let cspHeaders = [];
    page.on("response", (r) => {
      const h = r.headers();
      const csp = h["content-security-policy"] || h["content-security-policy-report-only"];
      if (csp) cspHeaders.push({ url: r.url().slice(0, 120), csp: csp.slice(0, 200) });
    });
    // 捕获 CSP 违规细节
    const viol = [];
    page.on("console", (msg) => { if (/Content Security Policy|Refused to execute inline/i.test(msg.text())) viol.push(msg.text().slice(0, 300)); });

    await page.goto("https://diy.zheliyin.com/diyWeb/third/20408603/1/thirdLoginDiyEdit.do", { waitUntil: "domcontentloaded", timeout: 40000 }).catch(() => {});
    await page.waitForTimeout(9000);

    // 直接查当前 document 的 CSP（Chrome 支持 document.securityPolicyViolationEvent / csp 通过 meta 或 header）
    const info = await page.evaluate(() => ({
      hasPanel: !!document.getElementById("zy-card-assistant"),
      marker: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed === true),
      scriptTagsWithBridge: Array.from(document.querySelectorAll("script")).filter((s) => String(s.textContent || s.src).indexOf("__ZY_CARD_ASSISTANT_BRIDGE__") >= 0).length,
      cspMeta: (() => { const m = document.querySelector('meta[http-equiv="content-security-policy"]'); return m ? m.getAttribute("content").slice(0, 300) : null; })(),
      reqS: (() => { const req = window.requirejs || window.require; return req && req.s && req.s.contexts ? Object.keys(req.s.contexts) : []; })()
    }));
    console.log(JSON.stringify({ cspHeaders: cspHeaders.slice(0, 5), violations: viol.slice(0, 5), info }, null, 1));
  } catch (e) { console.log("ERR " + String(e && e.message || e)); }
  finally { if (browser) await browser.close().catch(() => {}); }
})();