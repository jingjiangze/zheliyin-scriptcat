// runtime/enable-allow-user-scripts3.js — 深 shadow pierce：读取/点击 Allow User Scripts（含结构 dump）
"use strict";
const path = require("path");
const { chromium } = require("playwright");

const EXT_ID = "ndcooeababalnlpkfedmmbbbgkljhpjf";

(async () => {
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${scDir}`, `--load-extension=${scDir}`],
      viewport: { width: 1440, height: 1000 }
    });
    const page = browser.pages()[0];
    await page.goto("chrome://extensions/?id=" + EXT_ID, { waitUntil: "domcontentloaded", timeout: 40000 });
    await page.waitForTimeout(9000);

    // 深度遍历并 dump 详情视图结构（找 switch 真实位置与状态）
    const dump = await page.evaluate(() => {
      const out = { rows: [] };
      const walk = (host, depth) => {
        if (depth > 6 || !host || !host.shadowRoot) return;
        const sr = host.shadowRoot;
        const rows = sr.querySelectorAll ? sr.querySelectorAll("extensions-toggle-row") : [];
        for (const row of rows) {
          const t = (row.textContent || "").slice(0, 60);
          if (/允许运行用户脚本|allow user scripts/i.test(t)) {
            out.rows.push({
              text: t,
              html: row.outerHTML ? row.outerHTML.slice(0, 400) : "no-html",
              children: Array.from(row.querySelectorAll("*")).map((el) => ({ tag: el.tagName, id: el.id || "", cls: String(el.className || "").slice(0, 40), aria: el.getAttribute("aria-checked") || el.getAttribute("aria-pressed") || "" })).slice(0, 12)
            });
          }
        }
        // 继续下钻
        sr.querySelectorAll ? sr.querySelectorAll("*") : [];
        for (const el of sr.querySelectorAll("*")) { if (el.shadowRoot) walk(el, depth + 1); }
      };
      walk(document.querySelector("extensions-manager"), 0);
      return out;
    }).catch((e) => ({ evalError: String(e && e.message || e) }));
    console.log(JSON.stringify(dump, null, 1));

    // 若找到 toggle 就点击其内部按钮
    const clicked = await page.evaluate(() => {
      const findToggleBtn = (host, depth) => {
        if (depth > 8 || !host || !host.shadowRoot) return null;
        const sr = host.shadowRoot;
        const rows = sr.querySelectorAll ? sr.querySelectorAll("extensions-toggle-row") : [];
        for (const row of rows) {
          const t = (row.textContent || "");
          if (/允许运行用户脚本|allow user scripts/i.test(t)) {
            // 尝试所有内部可点击元素
            const btn = row.querySelector(".cr-toggle") || row.querySelector("[role=switch]") || row.querySelector("label, [tabindex]");
            if (btn) { btn.click(); return { tag: btn.tagName, cls: String(btn.className).slice(0, 40) }; }
            row.click(); return { tag: row.tagName, cls: "row" };
          }
        }
        for (const el of sr.querySelectorAll("*")) { const r = el.shadowRoot ? findToggleBtn(el, depth + 1) : null; if (r) return r; }
        return null;
      };
      const res = findToggleBtn(document.querySelector("extensions-manager"), 0);
      return res;
    }).catch((e) => ({ clickError: String(e && e.message || e) }));
    console.log("clicked=" + JSON.stringify(clicked));
    await page.waitForTimeout(4000);

    // 测试 API（扩展页上下文；若点击生效需 reload SW —— 这里直接测试，SW 在扩展运行时 newPage 会重建）
    const o = await browser.newPage();
    await o.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 20000 });
    await o.waitForTimeout(2500);
    const api = await o.evaluate(() => {
      const out = { userScriptsType: typeof chrome.userScripts };
      if (typeof chrome.userScripts !== "undefined" && chrome.userScripts.register) {
        out.registerFn = true;
        chrome.userScripts.getScripts().then((r) => { self.__r = "ok:" + (r ? r.length : 0); }).catch((e) => { self.__r = "rej:" + String(e && e.message || e); });
      }
      return out;
    });
    await o.waitForTimeout(800);
    const g = await o.evaluate(() => self.__r || "n/a").catch(() => "n/a");
    console.log(JSON.stringify(Object.assign(api, { getScripts: g }), null, 1));
  } catch (e) { console.log("ERR " + String(e && e.stack || e)); }
  finally { if (browser) await browser.close().catch(() => {}); }
})();