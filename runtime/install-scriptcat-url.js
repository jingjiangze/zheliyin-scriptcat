// runtime/install-scriptcat-url.js — §9 Path A：通过 ScriptCat 官方 install.html?url= 自动安装（headless）
"use strict";
const path = require("path");
const { chromium } = require("playwright");

(async () => {
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  const EXT_ID = "ndcooeababalnlpkfedmmbbbgkljhpjf";
  // 用户脚本 URL：优先 GitHub raw（与 @updateURL 一致）；可被 env 覆盖
  const scriptUrl = process.env.ZY_USERSCRIPT_URL || "https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/main/zheliyin-card-assistant.user.js";
  let browser = null;
  const out = { ts: new Date().toISOString(), steps: [], errors: [] };
  const step = (n, ok, d) => { out.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 400) }); if (!ok) out.errors.push(n); };
  const reportPath = path.join(__dirname, "reports", "scriptcat-url-install-report.json");

  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-scriptcat-url"), {
      channel: "chromium", headless: true,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${scDir}`, `--load-extension=${scDir}`],
      viewport: { width: 1400, height: 900 }
    });
    const page = browser.pages()[0];
    // 监听安装完成信号（页面可能触发 window.open 或路由变化到列表）
    const url = "chrome-extension://" + EXT_ID + "/src/install.html?url=" + encodeURIComponent(scriptUrl);
    step("install-url", true, url.slice(0, 120));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(8000);
    const body = await page.evaluate(() => (document.body ? document.body.innerText : "").slice(0, 500));
    step("install-page-body", true, body.slice(0, 300));

    // 跳回列表页验证脚本是否出现
    await page.goto("chrome-extension://" + EXT_ID + "/src/options.html#/script/list", { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(5000);
    const found = await page.evaluate((name) => {
      const tx = document.body ? document.body.innerText : "";
      return { hasName: tx.indexOf(name) >= 0, hasVersion: tx.indexOf("0.3.0.0") >= 0 };
    }, "折立印名片套版助手");
    step("script-appears-in-list", found.hasName && found.hasVersion, JSON.stringify(found));
  } catch (e) {
    step("fatal", false, String(e && e.message || e));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  require("fs").writeFileSync(reportPath, JSON.stringify(out, null, 1), "utf8");
  console.log("[zy-install-url] errors=" + out.errors.length);
  process.exit(out.errors.length ? 1 : 0);
})();