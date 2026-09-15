// runtime/probe-scriptcat-monaco-api.js — 探测 ScriptCat 编辑器页面暴露的 Monaco/editor 句柄（只读）
"use strict";
const path = require("path");
const { chromium } = require("playwright");

(async () => {
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  const EXT_ID = "ndcooeababalnlpkfedmmbbbgkljhpjf";
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-scmonaco"), {
      channel: "chromium", headless: true,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${scDir}`, `--load-extension=${scDir}`],
      viewport: { width: 1400, height: 900 }
    });
    const page = browser.pages()[0];
    await page.goto("chrome-extension://" + EXT_ID + "/src/options.html#/script/editor", { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(6000);
    const info = await page.evaluate(() => {
      const keys = Object.keys(window).filter((k) => /monaco|editor|vscode/i.test(k)).slice(0, 20);
      const globalVars = {};
      ["monaco", "editor", "require"].forEach((k) => {
        const v = window[k];
        globalVars[k] = v ? (typeof v) : null;
      });
      const monacoEditors = window.monaco ? (() => { try { return window.monaco.editor ? window.monaco.editor.getEditors().length : 0; } catch (e) { return -1; } })() : -1;
      return { keys, globalVars, monacoEditors };
    }).catch((e) => ({ evalError: String(e && e.message || e) }));
    console.log(JSON.stringify(info, null, 1));
  } catch (e) { console.log("ERR " + String(e && e.message || e)); }
  finally { if (browser) await browser.close().catch(() => {}); }
})();