// runtime/debug-monaco-focus.js — 深入诊断 ScriptCat 编辑器真实输入目标
"use strict";
const path = require("path");
const { chromium } = require("playwright");

(async () => {
  const fs = require("fs");
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  const EXT_ID = "ndcooeababalnlpkfedmmbbbgkljhpjf";
  const log = (m) => { const s = "[dmf] " + m; console.log(s); fs.appendFileSync(path.join(__dirname, "reports", "dmf.log"), s + "\n"); };
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-dmf"), {
      channel: "chromium", headless: true,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${scDir}`, `--load-extension=${scDir}`],
      viewport: { width: 1400, height: 900 }
    });
    const page = browser.pages()[0];
    await page.goto("chrome-extension://" + EXT_ID + "/src/options.html#/script/editor", { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(6000);
    const before = await page.evaluate(() => {
      const tas = Array.from(document.querySelectorAll("textarea")).map((t, i) => ({
        i, cls: String(t.className || "").slice(0, 40), visible: t.offsetParent !== null,
        readOnly: t.readOnly, valueLen: (t.value || "").length
      }));
      // 找 Monaco 容器
      const containers = Array.from(document.querySelectorAll("[class*='monaco']")).map((e) => ({ cls: String(e.className).slice(0, 50), vis: e.offsetParent !== null })).slice(0, 8);
      return { textareas: tas, containers };
    });
    log("BEFORE " + JSON.stringify(before));

    // 点击第一个可见 textarea —— 失败（focus 留 BODY），改点 .monaco-editor 可见中心
    const box = await page.locator(".monaco-editor").first().boundingBox().catch(() => null);
    log("EDITOR_BOX " + JSON.stringify(box));
    if (box) {
      await page.mouse.click(box.x + Math.min(150, box.width / 2), box.y + Math.min(80, box.height / 2));
      await page.waitForTimeout(600);
    }
    const afterFocus = await page.evaluate(() => ({
      activeTag: document.activeElement ? document.activeElement.tagName : null,
      activeCls: document.activeElement ? String(document.activeElement.className || "").slice(0, 50) : null,
      activeValueLen: document.activeElement && document.activeElement.value ? document.activeElement.value.length : -1
    }));
    log("AFTER_FOCUS " + JSON.stringify(afterFocus));

    // 尝试键盘输入短串
    await page.keyboard.type("HELLO_RUNTIME8", { delay: 10 });
    await page.waitForTimeout(400);
    const afterType = await page.evaluate(() => {
      const tas = Array.from(document.querySelectorAll("textarea")).map((t, i) => ({ i, cls: String(t.className || "").slice(0, 30), len: (t.value || "").length }));
      return { tas, activeValueLen: document.activeElement && document.activeElement.value ? document.activeElement.value.length : -1 };
    });
    log("AFTER_TYPE " + JSON.stringify(afterType));
  } catch (e) { log("ERR " + String(e && e.stack || e)); }
  finally { if (browser) await browser.close().catch(() => {}); }
})();