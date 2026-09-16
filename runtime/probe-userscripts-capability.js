// runtime/probe-userscripts-capability.js — RUNTIME-8.3 userScripts 能力检测（§二/§十五/§十六）
// 输出 chrome.userScripts 真实可用性并归为 A/B/C/D。尝试自动打开 chrome://extensions 详情页检查 Allow User Scripts。
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EXT_ID = "ndcooeababalnlpkfedmmbbbgkljhpjf";

(async () => {
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  let browser = null;
  const out = { ts: new Date().toISOString(), steps: [] };
  const step = (n, d) => out.steps.push({ name: n, detail: String(d || "").slice(0, 500) });
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc"), {
      channel: "chromium", headless: false, // chrome://extensions 需要 headed 才能完整渲染
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${scDir}`, `--load-extension=${scDir}`],
      viewport: { width: 1440, height: 900 }
    });
    const page = browser.pages()[0];

    // 1) 版本/权限/API 五元组（扩展页上下文）
    await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(3000);
    const api = await page.evaluate(() => {
      const out = { ua: navigator.userAgent };
      out.chromeVersion = (() => { const m = navigator.userAgent.match(/Chrome\/(\d+)/); return m ? m[1] : null; })();
      out.userScriptsType = typeof chrome.userScripts;
      out.scriptingType = typeof chrome.scripting;
      out.userScriptsKeys = typeof chrome.userScripts !== "undefined" ? Object.keys(chrome.userScripts) : [];
      // 官方建议：实际调用 getScripts 检测（区分 undefined 与 throws）
      if (typeof chrome.userScripts !== "undefined") {
        try { chrome.userScripts.getScripts().then(() => { self.__zyUSCalls = "ok"; }).catch((e) => { self.__zyUSCalls = "reject:" + String(e && e.message || e); }); } catch (e) { self.__zyUSCalls = "throw:" + String(e && e.message || e); }
      }
      return out;
    });
    await page.waitForTimeout(800);
    const calls = await page.evaluate(() => self.__zyUSCalls || "n/a");
    step("ext-api", JSON.stringify(Object.assign(api, { getScripts: calls })));

    // 2) chrome://extensions 详情页：Allow User Scripts 开关
    await page.goto("chrome://extensions/", { waitUntil: "domcontentloaded", timeout: 25000 }).catch((e) => step("extensions-page", "ERR " + String(e && e.message || e)));
    await page.waitForTimeout(4000);
    // 详情页 URL: chrome://extensions/?id=<ID>
    await page.goto("chrome://extensions/?id=" + EXT_ID, { waitUntil: "domcontentloaded", timeout: 25000 }).catch((e) => step("details-page", "ERR " + String(e && e.message || e)));
    await page.waitForTimeout(5000);
    // 读取页面 shadow DOM 结构（extensions 页是自定义元素）
    const details = await page.evaluate(() => {
      const out = { url: location.href, hasManager: !!document.querySelector("extensions-manager"), bodySnippet: (document.body ? document.body.innerText : "").slice(0, 500) };
      // 深度穿透 shadow DOM 找 "Allow user scripts" / "用户脚本" 文本
      const walk = (root, found) => {
        const all = root.querySelectorAll("*");
        for (const el of all) {
          const t = (el.textContent || "").trim();
          if (/allow user scripts|用户脚本/i.test(t) && t.length < 120) {
            try { found.push({ tag: el.tagName, text: t.slice(0, 80), id: el.id || "", cls: String(el.className || "").slice(0, 60) }); } catch (e) {}
          }
          if (el.shadowRoot) walk(el.shadowRoot, found);
        }
        return found;
      };
      out.allowUserScriptsEls = walk(document, []);
      return out;
    }).catch((e) => ({ evalError: String(e && e.message || e) }));
    step("ext-details", JSON.stringify(details));

    console.log(JSON.stringify(out, null, 1));
  } catch (e) { step("fatal", String(e && e.message || e)); console.log(JSON.stringify(out, null, 1)); }
  finally { if (browser) await browser.close().catch(() => {}); }
})();