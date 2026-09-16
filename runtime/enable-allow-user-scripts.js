// runtime/enable-allow-user-scripts.js — RUNTIME-8.3 自动开启 ScriptCat 的 Allow User Scripts 开关（§三/§四）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EXT_ID = "ndcooeababalnlpkfedmmbbbgkljhpjf";

(async () => {
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  let browser = null;
  const out = { ts: new Date().toISOString(), steps: [] };
  const step = (n, ok, d) => out.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 400) });
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${scDir}`, `--load-extension=${scDir}`],
      viewport: { width: 1440, height: 900 }
    });
    const page = browser.pages()[0];
    // 先确保扩展已加载：访问 options 页
    await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 25000 }).catch((e) => step("ext-options", false, "ERR " + String(e && e.message || e)));
    await page.waitForTimeout(3000);
    const extOk = await page.evaluate(() => document.body ? (document.body.innerText || "").slice(0, 40) : "").catch(() => "ERR");
    step("ext-options", extOk.indexOf("ERR") !== 0 && extOk.length > 0, "body='" + extOk + "'");
    await page.goto("chrome://extensions/?id=" + EXT_ID, { waitUntil: "domcontentloaded", timeout: 25000 }).catch((e) => step("open-details", false, "ERR " + String(e && e.message || e)));
    await page.waitForTimeout(5000);

    // 读取开关当前状态（穿透 shadow DOM）：extensions-toggle-row 内部有 button/input
    const before = await page.evaluate(() => {
      const root = document.querySelector("extensions-manager");
      if (!root) return null;
      const findToggle = (r) => {
        const rows = r.querySelectorAll ? r.querySelectorAll("extensions-toggle-row") : [];
        for (const row of rows) {
          const t = (row.textContent || "");
          if (/允许运行用户脚本|allow user scripts/i.test(t)) {
            const btn = row.querySelector(".cr-toggle, [role=switch], button");
            return { text: t.slice(0, 60), btnTag: btn ? btn.tagName : null, btnCls: btn ? String(btn.className).slice(0, 50) : null, btnPressed: btn ? btn.getAttribute("aria-pressed") : null, btnChecked: btn ? (btn.getAttribute("aria-checked") || btn.getAttribute("checked")) : null };
          }
        }
        return null;
      };
      if (root.shadowRoot) return findToggle(root.shadowRoot);
      return findToggle(root);
    });
    step("toggle-before", !!before, JSON.stringify(before));
    if (!before) { console.log(JSON.stringify(out, null, 1)); return; }

    // 点击开关（cr-toggle 是自定义按钮）
    const clicked = await page.evaluate(() => {
      const root = document.querySelector("extensions-manager");
      const findRow = (r) => {
        const rows = r.querySelectorAll ? r.querySelectorAll("extensions-toggle-row") : [];
        for (const row of rows) {
          const t = (row.textContent || "");
          if (/允许运行用户脚本|allow user scripts/i.test(t)) {
            const btn = row.querySelector(".cr-toggle, [role=switch], button");
            if (btn) { btn.click(); return btn; }
            row.querySelector("section, .row, .label-and-link")?.click();
            return row;
          }
        }
        return null;
      };
      let el = null;
      if (root.shadowRoot) el = findRow(root.shadowRoot);
      if (!el) el = findRow(root);
      return el ? String(el.tagName) : null;
    });
    step("toggle-click", !!clicked, "clicked=" + clicked);
    await page.waitForTimeout(3000);

    // reload 扩展使 API 生效
    await page.evaluate(() => {
      const root = document.querySelector("extensions-manager");
      try { if (root.shadowRoot) { const reloadBtn = root.shadowRoot.querySelector("extensions-detail-view") ? root.shadowRoot.querySelector("extensions-detail-view").shadowRoot.querySelector("#reload-button") : null; if (reloadBtn) reloadBtn.click(); } } catch (e) {}
    }).catch(() => {});
    await page.waitForTimeout(4000);

    // 重检 chrome.userScripts（在扩展 options 页上下文）
    await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const after = await page.evaluate(() => {
      const out = { userScriptsType: typeof chrome.userScripts };
      if (typeof chrome.userScripts !== "undefined") {
        out.keys = Object.keys(chrome.userScripts);
        try { chrome.userScripts.getScripts().then((r) => { self.__zyG = "ok count=" + (r ? r.length : 0); }).catch((e) => { self.__zyG = "reject:" + String(e && e.message || e); }); } catch (e) { self.__zyG = "throw:" + String(e && e.message || e); }
      }
      return out;
    });
    await page.waitForTimeout(800);
    const afterCalls = await page.evaluate(() => self.__zyG || "n/a").catch(() => "n/a");
    step("api-after", typeof chrome !== "undefined" ? after.userScriptsType === "object" : false, JSON.stringify(Object.assign(after, { getScripts: afterCalls })));

    // 若仍 undefined，再查一次开关（可能点击失败/需确认弹窗）
    await page.goto("chrome://extensions/?id=" + EXT_ID, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const afterToggle = await page.evaluate(() => {
      const root = document.querySelector("extensions-manager");
      if (!root) return null;
      const find = (r) => {
        const rows = r.querySelectorAll ? r.querySelectorAll("extensions-toggle-row") : [];
        for (const row of rows) { if (/允许运行用户脚本|allow user scripts/i.test(row.textContent || "")) { const b = row.querySelector(".cr-toggle, [role=switch], button"); return { ariaChecked: b ? b.getAttribute("aria-checked") : null, pressed: b ? b.getAttribute("aria-pressed") : null, cls: b ? String(b.className).slice(0, 60) : null }; } }
        return null;
      };
      if (root.shadowRoot) return find(root.shadowRoot);
      return find(root);
    });
    step("toggle-after", !!afterToggle, JSON.stringify(afterToggle));
  } catch (e) { step("fatal", false, String(e && e.stack || e)); }
  finally { if (browser) await browser.close().catch(() => {}); }
  console.log(JSON.stringify(out, null, 1));
})();