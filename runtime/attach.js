// runtime/attach.js — RUNTIME-6 Attach Mode
// 连接"当前已打开的真实浏览器"（用户已登录 + ScriptCat 已运行）自动诊断。
// 前置：Chrome 需以 --remote-debugging-port=9222 启动。
// 用法：node runtime/attach.js [--port 9222] [--headed]
"use strict";
const { chromium } = require("playwright");
const { healthCheck, redactText } = require("./browser-launcher");

(async () => {
  const port = (() => { const i = process.argv.indexOf("--port"); return i >= 0 ? process.argv[i + 1] : "9222"; })();
  const out = { ts: new Date().toISOString(), evidence: "REAL_BROWSER_ATTACH", port, steps: [], errors: [] };
  function step(name, ok, detail) { out.steps.push({ name, ok: ok ? "PASS" : "FAIL", detail: detail ? redactText(detail) : "" }); if (!ok) out.errors.push(name); }

  let browser = null;
  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:" + port, { timeout: 10000 });
    const contexts = browser.contexts && browser.contexts();
    if (!contexts.length) throw new Error("no context attached");
    const pages = contexts.flatMap(c => c.pages ? c.pages() : []);
    step("cdp-connect", true, "contexts=" + contexts.length + " pages=" + pages.length);

    // 自动识别设计器页面（diy.zheliyin.com + thirdLoginDiyEdit/thirdDiyAdd）
    let target = pages.find(p => /diy\.zheliyin\.com/.test(p.url()) && /thirdLoginDiyEdit|thirdDiyAdd/i.test(p.url()));
    if (!target) target = pages.find(p => /diy\.zheliyin\.com/.test(p.url()));
    if (!target) { step("editor-page", false, "no diy.zheliyin.com page in attached browser"); }
    else {
      step("editor-page", true, redactText(target.url()));
      const h = await healthCheck(target);
      out.health = h;
      step("health-probe", typeof h === "object" && !h.evalError, "");
      step("bridge-marker", h.bridgeMarker === true, "marker=" + h.bridgeMarker);
      step("panel", h.panelCount >= 1, "panelCount=" + h.panelCount);
      step("canvas", h.canvas && h.canvas.canvasCount >= 1, "canvasCount=" + (h.canvas && h.canvas.canvasCount));
      step("editor-ready", h.requirejs === true && h.fabric === true, "requirejs=" + h.requirejs + " fabric=" + h.fabric);
    }
  } catch (e) {
    out.errors.push("connect:" + String(e && e.message || e));
    step("cdp-connect", false, String(e && e.message || e));
    step("note", true, "请以 --remote-debugging-port=" + port + " 启动 Chrome 后重试（一次性动作）");
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  console.log(JSON.stringify(out, null, 1));
  process.exitCode = out.errors.length ? 1 : 0;
})();