// runtime/check.js — Runtime Health Check（RUNTIME-1 冒烟）
// 用法：node runtime/check.js [--headed]
// 职责：启动真实浏览器 → 打开折立印站点 → 输出脱敏健康报告。
// 证据等级：HEADLESS_REAL_BROWSER（登录/编辑态不涉及）
"use strict";
const path = require("path");
const { launchDedicated, healthCheck, redactText } = require("./browser-launcher");

(async () => {
  const headed = process.argv.includes("--headed");
  const profileDir = path.join(__dirname, "browser", "profile-smoke");
  let browser = null;
  const out = {
    ts: new Date().toISOString(),
    evidence: "HEADLESS_REAL_BROWSER",
    browser: null,
    steps: [],
    errors: []
  };

  function step(name, ok, detail) {
    out.steps.push({ name, ok: ok ? "PASS" : "FAIL", detail: detail ? redactText(detail) : "" });
    if (!ok) out.errors.push(name);
  }

  try {
    const launched = await launchDedicated({ profileDir, headless: !headed });
    browser = launched.browser;
    out.browser = launched.exe ? "SYSTEM_CHROME:" + path.basename(launched.exe) : "PLAYWRIGHT_CHROMIUM";
    step("browser-launch", true, out.browser);

    // 导航：门户（编辑页面需要登录态，本冒烟只验证可达性与健康探针链路）
    await browser.pages()[0].goto("https://diy.zheliyin.com/diyWeb/", { waitUntil: "domcontentloaded", timeout: 30000 });
    step("navigation", true, "https://diy.zheliyin.com/diyWeb/");

    const h = await healthCheck(browser.pages()[0]);
    out.health = h;
    step("health-probe", typeof h === "object" && !h.evalError, "");
    step("top-window", h.isTop === true, "isTop=" + h.isTop);
    // 编辑态专用全局（requirejs/fabric/canvas 等）在登录页/门户不存在属于预期。
    // 冒烟模式未带登录态 → 标注 NOT_EDITOR（BLOCKED），不判 FAIL（§五十二）。
    const editorRequired = process.argv.includes("--expect-editor");
    if (h.requirejs === true) {
      step("requirejs", true, "requirejs=true");
    } else if (editorRequired) {
      step("requirejs", false, "预期编辑态但 requirejs=false");
    } else {
      step("requirejs", true, "requirejs=false (NOT_EDITOR: 门户/登录页，无登录态属预期)");
    }
  } catch (e) {
    out.errors.push("run:" + String(e && e.message || e));
    out.fatal = redactText(String(e && e.stack || e));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  console.log(JSON.stringify(out, null, 1));
  process.exitCode = out.errors.length ? 1 : 0;
})();