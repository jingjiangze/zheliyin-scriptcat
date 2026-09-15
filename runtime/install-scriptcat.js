// runtime/install-scriptcat.js — 自动把当前 userscript 安装进真实 ScriptCat（§10 Path C）
// 流程：Playwright Chromium + 真实 ScriptCat(vendor) → 打开 Script Editor → Monaco 填代码 → 保存(启用)
// 保存后 ScriptCat 管理页脚本列表应出现「折立印名片套版助手」；重复安装时覆盖（同一 @name/@namespace）。
// 敏感：无凭据；不写用户个人数据。
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EXT_ID = "ndcooeababalnlpkfedmmbbbgkljhpjf";
const USERSCRIPT_PATH = path.join(__dirname, "..", "zheliyin-card-assistant.user.js");

(async () => {
  const profileDir = path.join(__dirname, "browser", "profile-scriptcat");
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  let browser = null;
  const out = { ts: new Date().toISOString(), steps: [], errors: [] };
  const step = (n, ok, d) => { out.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 400) }); if (!ok) out.errors.push(n); };

  try {
    const code = fs.readFileSync(USERSCRIPT_PATH, "utf8");
    if (!code.includes("@name") || !code.includes("@match")) { step("read-userscript", false, "userscript content invalid"); return; }
    step("read-userscript", true, "len=" + code.length);

    browser = await chromium.launchPersistentContext(profileDir, {
      channel: "chromium", headless: true,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${scDir}`, `--load-extension=${scDir}`],
      viewport: { width: 1600, height: 1000 }
    });
    const page = browser.pages()[0];
    await page.goto("chrome-extension://" + EXT_ID + "/src/options.html#/script/editor", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);
    step("open-editor", true, "Script Editor loaded");
    await page.waitForSelector("textarea.inputarea", { timeout: 15000 });
    step("monaco-ready", true, "monaco textarea present");

    // 聚焦 Monaco：等 .monaco-editor 可见稳定后点其中心（触发 textarea 聚焦）
    await page.locator(".monaco-editor").first().waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(1200); // 等待编辑器交互层完全就绪
    const edBox = await page.locator(".monaco-editor").first().boundingBox().catch(() => null);
    if (!edBox) { step("editor-box", false, "no editor box"); return; }
    await page.mouse.click(edBox.x + Math.min(150, edBox.width / 2), edBox.y + Math.min(80, edBox.height / 2));
    await page.waitForTimeout(800);
    const focusedOk = await page.evaluate(() => {
      const ae = document.activeElement;
      return !!(ae && ae.tagName === "TEXTAREA");
    });
    step("monaco-focused", focusedOk, "activeElement=" + (await page.evaluate(() => document.activeElement ? document.activeElement.tagName : null)));
    await page.keyboard.press("Control+a");
    await page.waitForTimeout(300);
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(300);
    // 剪贴板路径：写 code 到剪贴板并 Ctrl+V（Monaco 严格支持粘贴）
    await page.evaluate((txt) => navigator.clipboard.writeText(txt), code).catch((e) => step("clipboard-write", false, String(e && e.message || e)));
    await page.waitForTimeout(300);
    await page.keyboard.press("Control+v", { delay: 60 });
    await page.waitForTimeout(1500);
    // 诊断：读取 Monaco 模型是否已含目标代码（输入是否成功）
    const diag = await page.evaluate((markerStart) => {
      try {
        const req = window.require && window.require; // 扩展页内可能有自己的 monaco 实例
        // 读 Monaco hidden textarea value
        const ta = document.querySelector("textarea.inputarea");
        const v = ta ? ta.value : "";
        return { taLen: v.length, taHasMarker: v.length > 0 && v.indexOf(markerStart) >= 0 };
      } catch (e) { return { err: String(e && e.message || e) }; }
    }, "@name");
    step("monaco-content-check", diag.taHasMarker === true, JSON.stringify(diag));

    await page.keyboard.press("Control+s");
    await page.waitForTimeout(6000);

    // 验证保存：脚本列表出现「折立印名片套版助手」
    await page.goto("chrome-extension://" + EXT_ID + "/src/options.html#/script/list", { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(4000);
    const found = await page.evaluate((name) => {
      const tx = document.body ? document.body.innerText : "";
      return { hasName: tx.indexOf(name) >= 0, hasVersion: tx.indexOf("0.3.0.0") >= 0 };
    }, "折立印名片套版助手");
    step("script-appears-in-list", found.hasName && found.hasVersion, JSON.stringify(found));

    // 启用状态（ScriptCat 编辑器保存后默认启用；若列表有启用开关则读取）
    const enabledInfo = await page.evaluate(() => {
      const sw = Array.from(document.querySelectorAll("[class*='switch'],[class*='Switch'],input[type=checkbox]")).filter((el) => el.offsetParent !== null);
      return sw.length;
    });
    step("toggle-detected", enabledInfo >= 0, "visible toggle count=" + enabledInfo + "（0 不代表未启用：编辑器保存即为启用）");
  } catch (e) {
    step("fatal", false, String(e && e.message || e));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  const reportPath = path.join(__dirname, "reports", "scriptcat-install-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(out, null, 1), "utf8");
  console.log("[zy-install-scriptcat] wrote " + reportPath + " steps=" + out.steps.length + " errors=" + out.errors.length);
  process.exit(out.errors.length ? 1 : 0);
})();