// runtime/probe-scriptcat-editor.js — 探查 ScriptCat 编辑器保存/启用 UI（只读）
"use strict";
const path = require("path");
const { chromium } = require("playwright");

(async () => {
  const profileDir = path.join(__dirname, "browser", "profile-scriptcat-editor");
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  const extId = "ndcooeababalnlpkfedmmbbbgkljhpjf";
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(profileDir, {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${scDir}`, `--load-extension=${scDir}`],
      viewport: { width: 1600, height: 1000 }
    });
    const page = browser.pages()[0];
    await page.goto("chrome-extension://" + extId + "/src/options.html#/script/editor", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(e => console.log("goto err " + e.message));
    await page.waitForTimeout(4000);
    const info = await page.evaluate(() => {
      const txt = (el) => el ? (el.textContent || "").trim().slice(0, 24) : null;
      const btns = Array.from(document.querySelectorAll("button, a, .arco-btn, [role=button], [class*=btn]")).map((el) => ({
        tag: el.tagName, text: txt(el), cls: String(el.className || "").slice(0, 60), visible: el.offsetParent !== null
      })).filter((x) => x.visible && (x.text || x.cls)).slice(0, 50);
      // 找 Monaco editor 实例
      const monacoHost = document.querySelector(".monaco-editor, [class*='monaco'], textarea[class*='input']");
      return {
        hasMonaco: !!monacoHost,
        monacoClass: monacoHost ? String(monacoHost.className).slice(0, 60) : null,
        url: location.href.slice(0, 120),
        textareas: Array.from(document.querySelectorAll("textarea")).map((t) => ({ cls: String(t.className || "").slice(0, 40), rows: t.rows, cols: t.cols })).slice(0, 5),
        visibleControls: btns
      };
    });
    console.log(JSON.stringify(info, null, 1));
  } catch (e) { console.log("ERR " + String(e && e.message || e)); }
  finally { if (browser) await browser.close().catch(() => {}); }
})();