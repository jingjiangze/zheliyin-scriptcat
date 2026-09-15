// runtime/browser-launcher.js — RUNTIME-1 Browser Harness
// 职责：启动/复用真实 Chrome；注入诊断探针；健康检查与脱敏。
// 不修改任何生产代码；证据等级由调用方标注。
"use strict";
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

// 脱敏工具（禁止打印 cookie/token/session/个人信息）
function redactText(s) {
  return String(s == null ? "" : s)
    .replace(/(cookie|token|session|apikey|api_key|passwd|password|secret)[^&\s"']*/gi, "$1=REDACTED")
    .replace(/([?&](?:token|key|secret|sign|t)=)[^&#]*/gi, "$1***")
    .slice(0, 240);
}

// 注入到页面主世界的只读健康探针（String 传递，避免函数引用被序列化失败）
// 只读：读取 window globals / requirejs 模块 / bridge marker / panel，不修改任何对象。
const HEALTH_PROBE_SRC = `(() => {
  "use strict";
  function mod(name) {
    try {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      return !!(ctx && ctx.defined && ctx.defined[name]);
    } catch (e) { return false; }
  }
  function cv() {
    try {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const total = vo && vo.totalCanvasArray;
      return {
        canvasCount: Array.isArray(total) ? total.length : 0,
        firstW: (Array.isArray(total) && total[0]) ? (total[0].canvas ? total[0].canvas.width : null) : null,
        firstH: (Array.isArray(total) && total[0]) ? (total[0].canvas ? total[0].canvas.height : null) : null
      };
    } catch (e) { return { error: String(e && e.message || e) }; }
  }
  const cb = window.__ZY_CARD_ASSISTANT_BRIDGE__;
  return {
    url: location.href.slice(0, 240),
    isTop: window === top,
    frames: window.frames.length,
    bridgeMarker: !!(cb && cb.installed === true),
    panelCount: document.querySelectorAll("#zy-card-assistant").length,
    fabric: typeof window.fabric === "object",
    requirejs: !!(window.requirejs || window.require),
    canvasObjVO: mod("CanvasObjVO") || !!window.CanvasObjVO,
    currentCanvas: mod("CurrentCanvas") || !!window.CurrentCanvas,
    canvasDiy: mod("CanvasDiy") || !!window.CanvasDiy,
    canvas: cv(),
    title: String(document.title || "").slice(0, 80)
  };
})()`;

// 默认浏览器路径顺序：系统 Chrome > Edge > Playwright Chromium
function resolveBrowserPath() {
  const candidates = [
    process.env.ZY_CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null; // 回退到 Playwright 自带 chromium
}

// 启动独立 profile 的真实浏览器；返回 { browser, context, page }。调用方负责 close。
// options = { profileDir, headless, loadExtensionDir, forcePlaywrightChromium }
// forcePlaywrightChromium=true 时强制用 Playwright 自带 Chromium（其官方支持 --load-extension，
// 规避系统 Chrome 152 对命令行加载扩展的安全限制）。登录态在 profile 目录，与浏览器无关，可复用。
async function launchDedicated({ profileDir, headless = true, loadExtensionDir = null, forcePlaywrightChromium = false } = {}) {
  const exe = forcePlaywrightChromium ? null : resolveBrowserPath();
  const launchOptions = { headless };
  let args = ["--disable-blink-features=AutomationControlled", "--no-first-run", "--disable-default-apps"];
  if (loadExtensionDir) {
    // Chrome 137+ 禁用命令行 --load-extension；138+ 另需 --enable-unsafe-extension-debugging
    args = args.concat([
      "--disable-features=DisableLoadExtensionCommandLineSwitch",
      "--enable-unsafe-extension-debugging",
      `--disable-extensions-except=${loadExtensionDir}`,
      `--load-extension=${loadExtensionDir}`
    ]);
  }
  launchOptions.args = args;
  if (exe) {
    launchOptions.executablePath = exe;
  }
  const browser = await chromium.launchPersistentContext(profileDir, {
    ...launchOptions,
    viewport: { width: 1440, height: 900 },
    // 需要加载扩展时必须移除 --disable-extensions 与 --enable-automation（否则扩展被禁用）
    ignoreDefaultArgs: loadExtensionDir
      ? ["--enable-automation", "--disable-extensions", "--headless"]
      : ["--enable-automation"]
  });
  const context = browser; // persistentContext 即 context
  const page = context.pages()[0] || (await context.newPage());
  return { browser, context, page, exe: exe || "playwright-chromium" };
}

// 对指定页面注入只读健康探针并返回脱敏结果
async function healthCheck(page) {
  const raw = await page.evaluate(HEALTH_PROBE_SRC).catch((e) => ({ evalError: String(e && e.message || e) }));
  const h = {
    ...raw,
    url: raw.url ? redactText(raw.url) : raw.url
  };
  return h;
}

// 等待页面到达"已加载 requirejs/fabric"的就绪态（事件驱动 + bounded poll，不裸 sleep）
async function waitForEditorReady(page, timeoutMs = 30000) {
  await page.waitForFunction(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    return !!(window.fabric && ctx && ctx.defined && (ctx.defined.CanvasObjVO || window.CanvasObjVO));
  }, null, { timeout: timeoutMs });
}

module.exports = { launchDedicated, healthCheck, redactText, waitForEditorReady, HEALTH_PROBE_SRC, resolveBrowserPath };