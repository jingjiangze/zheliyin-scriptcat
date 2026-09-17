// runtime/stage-6-p0-editor-lifecycle-audit12.js — Stage 6 P0 审计 R12（sundry.historyUtil 源码 + document 委托句柄探测）
// 纯只读 evaluate，目标拿到原生「推送历史快照」的具体 API，供 OCR 批次接入（不伪造历史）。
// 输出：runtime/reports/stage-6-p0-lifecycle-audit12.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-6-p0-lifecycle-audit12.json");

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-6-P0-EDITOR-LIFECYCLE-AUDIT-R12", steps: [], errors: [] };
  const step = (n, ok, d) => { report.steps.push({ name: n, ok: ok ? "PASS" : "INFO", detail: String(d || "").slice(0, 4200) }); if (!ok) report.errors.push(n); };
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

    const probe = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const defs = ctx && ctx.defined ? ctx.defined : {};
      const sundry = defs["sundry"];
      const out = {};
      if (sundry && typeof sundry.historyUtil === "function") {
        out.historyUtilSrc = sundry.historyUtil.toString().replace(/\s+/g, " ").slice(0, 1800);
      } else if (sundry) {
        out.histType = typeof sundry.historyUtil;
        if (sundry.historyUtil !== undefined) out.histKeys = Object.getOwnPropertyNames(sundry.historyUtil);
      }
      const u = defs["Undo"] ? defs["Undo"].getInstance() : null;
      if (u) {
        if (u.replay) out.replaySrc = u.replay.toString().replace(/\s+/g, " ").slice(0, 900);
        if (u.buttonControl) out.buttonControlSrc = u.buttonControl.toString().replace(/\s+/g, " ").slice(0, 700);
        out.undoProp = u.undo;
        out.redoProp = u.redo;
      }
      // 委托句柄：document 上的 undo/redo 相关监听
      const delegated = [];
      try {
        const evs = (window.jQuery && jQuery._data) ? jQuery._data(document, "events") : null;
        if (evs) Object.keys(evs).forEach((k) => { (evs[k] || []).forEach((h) => { const s = String(h.handler || "").toString().replace(/\s+/g, " "); if (/undo|redo|history|撤销|重做/i.test(s)) delegated.push(k + " :: " + s.slice(0, 300)); }); });
      } catch (e) { delegated.push("err " + String(e).slice(0, 80)); }
      out.delegatedUndo = delegated.slice(0, 8);
      // 撤销按钮元素与父链 class（定位委托容器）
      const btn = Array.from(document.querySelectorAll("span, li, a, div")).find((b) => (b.textContent || "").trim() === "撤销");
      if (btn) { const chain = []; let p = btn; let d = 0; while (p && d < 5) { chain.push((p.tagName || "") + "." + String(p.className || "").slice(0, 30)); p = p.parentElement; d += 1; } out.undoBtnChain = chain; }
      return out;
    }).catch((e) => ({ err: String(e && e.message || e).slice(0, 300) }));
    step("probe", true, JSON.stringify(probe).slice(0, 4200));
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.stack || e).slice(0, 600));
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1));
    console.log("audit12 report -> " + REPORT_PATH);
    report.steps.forEach((s) => console.log("  [" + s.ok + "] " + s.name + " :: " + String(s.detail).replace(/\n/g, " ").slice(0, 500)));
  }
})();