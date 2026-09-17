// runtime/stage-6-2-dump-bundles.js — Stage 6.2：采集 252438 编辑器前端 bundle 供静态逆向
// 目标：拿到编辑器「新增文字 → 对象构造 → 图层注册 → 历史注册」真实代码路径所需的源码。
// 步骤：
//   1. 真机 profile 打开编辑器，等待 canvas ready
//   2. 收集 document script src + requirejs config（baseUrl/paths）
//   3. 用浏览器 context.request（带 cookie）下载全部 bundle 到 runtime/vendor/252438/
// 输出：runtime/reports/stage-6-2-bundle-dump.json（清单+大小），bundle 落盘
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const VENDOR = path.join(__dirname, "vendor", "252438");
const REPORT_PATH = path.join(__dirname, "reports", "stage-6-2-bundle-dump.json");

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-6-2-BUNDLE-DUMP", steps: [], errors: [], files: [] };
  const step = (n, ok, d) => { report.steps.push({ name: n, ok: ok ? "PASS" : "INFO", detail: String(d || "").slice(0, 2000) }); if (!ok) report.errors.push(n); };
  let browser = null;
  let page = null;
  const ready = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    return { ok: !!(c && c.getObjects), objs: c ? c.getObjects().length : 0 };
  }).catch(() => ({ ok: false }));
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    page = browser.pages()[0];
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const deadline = Date.now() + 150000;
    let rd = null;
    while (Date.now() < deadline) { rd = await ready(); if (rd && rd.ok) break; await page.waitForTimeout(2000); }
    step("editor-ready", !!(rd && rd.ok), JSON.stringify(rd));
    if (!(rd && rd.ok)) throw new Error("not ready");

    const meta = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const cfg = ctx && ctx.config ? ctx.config : {};
      const out = {
        baseUrl: cfg.baseUrl || null,
        waitSeconds: cfg.waitSeconds,
        paths: Object.keys(cfg.paths || {}).slice(0, 60),
        pathsSample: JSON.stringify(cfg.paths || {}).slice(0, 3000),
        urlArgs: cfg.urlArgs || null,
        definedCount: ctx && ctx.defined ? Object.keys(ctx.defined).length : 0,
        definedSample: ctx && ctx.defined ? Object.keys(ctx.defined).slice(0, 80) : []
      };
      out.scripts = Array.from(document.querySelectorAll("script[src]")).map((s) => s.getAttribute("src")).filter(Boolean);
      return out;
    }).catch((e) => ({ err: String(e && e.message || e).slice(0, 300) }));
    step("meta", true, JSON.stringify(meta).slice(0, 4000));
    if (meta.err) throw new Error(meta.err);

    fs.mkdirSync(VENDOR, { recursive: true });
    // 监听真实网络响应（requirejs 懒加载的编辑器核心 bundle 不在初始 <script> 标签里）
    const captured = new Map();
    page.on("response", function (r) {
      try {
        const u = r.url();
        if (!/\.js(\?|$)/.test(u)) return;
        if (captured.has(u)) return;
        captured.set(u, null);
        r.text().then(function (t) { captured.set(u, t); }).catch(function () {});
      } catch (e) {}
    });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const dl = Date.now() + 150000;
    while (Date.now() < dl) { rd = await ready(); if (rd && rd.ok) break; await page.waitForTimeout(2000); }
    step("editor-ready-after-reload", !!(rd && rd.ok), JSON.stringify(rd));
    await page.waitForTimeout(4000); // 等懒加载请求完成
    let jsFiles = 0, htmlSkip = 0;
    for (const [u, t] of captured) {
      if (t == null) { report.steps.push({ name: "no-body", ok: false, detail: u }); continue; }
      if (t.indexOf("<html") >= 0 || t.indexOf("<base ") >= 0 || !t.trim()) { htmlSkip += 1; continue; }
      const name = "r" + (jsFiles) + "-" + u.replace(/^https?:\/\/[^/]+/, "").replace(/[^\w.-]+/g, "_").slice(-80) + ".js";
      fs.writeFileSync(path.join(VENDOR, name), t);
      report.files.push({ url: u, name: name, bytes: t.length });
      jsFiles += 1;
    }
    step("captured-js", jsFiles > 5, "js=" + jsFiles + " htmlSkip=" + htmlSkip + " total=" + captured.size);
    report.definedCount = meta.definedCount;
    report.definedSample = meta.definedSample;
    report.requireConfig = { baseUrl: meta.baseUrl, pathsSample: meta.pathsSample, urlArgs: meta.urlArgs };
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.stack || e).slice(0, 600));
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1));
    console.log("bundle dump -> " + REPORT_PATH);
    report.files.forEach((f) => console.log("  [" + f.bytes + "] " + f.name));
    report.steps.forEach((s) => console.log("  [" + s.ok + "] " + s.name + " :: " + String(s.detail).replace(/\n/g, " ").slice(0, 300)));
  }
})();