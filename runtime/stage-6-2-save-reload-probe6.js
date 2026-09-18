// runtime/stage-6-2-save-reload-probe6.js — IfDiyOrderidExit 调用源码取证
// 目的：从真实页面已加载脚本中定位 IfDiyOrderidExit 的调用逻辑与 designId 来源，
//       钉死「designId 为空 → 订单检查 error → 保存终止」的前端机制。
// 输出：runtime/reports/stage-6-2-save-reload-probe6.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-6-2-save-reload-probe6.json");

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-6-2-SAVE-RELOAD-PROBE6", url: EDITOR_URL, hits: [], errors: [] };
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    const page = browser.pages()[0];
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const readyEval = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = (vo && Array.isArray(vo.totalCanvasArray) && vo.totalCanvasArray[0]) || null;
      return !!(d && d.canvas && d.canvas.getObjects && typeof d.drawText === "function");
    }).catch(() => false);
    let ok = false;
    const d1 = Date.now() + 150000;
    while (Date.now() < d1) { ok = await readyEval(); if (ok) break; await page.waitForTimeout(2000); }
    report.editorReady = ok;

    // 收集已加载 JS 资源（含动态 require 的 bundle）
    const srcs = await page.evaluate(() => {
      const set = new Set();
      Array.from(document.querySelectorAll("script[src]")).forEach((s) => set.add(s.src));
      window.performance.getEntriesByType("resource").forEach((r) => { if (/\.js(\?|$)/.test(r.name)) set.add(r.name); });
      const req = window.requirejs || window.require;
      if (req && req.s && req.s.contexts && req.s.contexts._) {
        const ctx = req.s.contexts._;
        if (ctx.urlArgs && ctx.paths) {}
        Object.keys(ctx.defined || {}).slice(0, 200).forEach((k) => {});
        if (ctx.registry) { Object.keys(ctx.registry).forEach((k) => { const m = ctx.registry[k]; if (m && m.url) set.add(m.url); }); }
        if (ctx.urlMap) { Object.keys(ctx.urlMap).forEach((k) => { const v = ctx.urlMap[k]; if (typeof v === "string") set.add(v); }); }
      }
      return Array.from(set).filter((u) => !/^data:/.test(u)).slice(0, 120);
    }).catch((e) => { report.errors.push("collect: " + String(e || "").slice(0, 150)); return []; });
    report.scriptCount = srcs.length;

    // fetch 每个 JS，找 IfDiyOrderidExit / saveDesign / thirdDiyAdd 关键调用
    for (let i = 0; i < srcs.length; i += 1) {
      const u = srcs[i];
      try {
        const txt = await page.evaluate(async (url) => {
          try {
            const r = await fetch(url, { cache: "force-cache" });
            if (!r.ok) return null;
            const t = await r.text();
            return t.length > 6000000 ? t.slice(0, 6000000) : t;
          } catch (e) { return null; }
        }, u).catch(() => null);
        if (!txt) continue;
        const idx = txt.indexOf("IfDiyOrderidExit");
        if (idx < 0) continue;
        const snip = txt.slice(Math.max(0, idx - 700), idx + 500);
        report.hits.push({ url: u.slice(0, 220), len: txt.length, ctx: snip });
        if (report.hits.length >= 4) break;
      } catch (e) {
        report.errors.push("fetch " + String(u).slice(0, 100) + ": " + String(e || "").slice(0, 120));
      }
    }
    report.hitCount = report.hits.length;
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.stack || e).slice(0, 700));
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1));
    console.log("report -> " + REPORT_PATH);
    console.log("  [editorReady] " + report.editorReady + " scripts=" + report.scriptCount + " hits=" + report.hitCount);
    report.hits.forEach((h, i) => {
      console.log("  --- hit " + i + " ---");
      console.log("  url=" + h.url);
      console.log("  ctx=" + h.ctx.replace(/\s+/g, " ").slice(0, 900));
    });
    if (report.errors && report.errors.length) console.log("  [errors] " + report.errors.join(" ;; "));
  }
})();
