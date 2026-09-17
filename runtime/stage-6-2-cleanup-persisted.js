// runtime/stage-6-2-cleanup-persisted.js — 将 Save/Reload 探测写入服务端的探针文字移除（写回服务器）
// 上一步 stage-6-2-save-reload-probe 真实保存了"保存重载探针A/B"到 252438 模板实例；
// 本地清理不写回服务器。本脚本：打开编辑器 → 移除探针对象 → 真实点击保存 → 刷新验证服务端已干净。
// 输出：runtime/reports/stage-6-2-cleanup-persisted.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-6-2-cleanup-persisted.json");
const PROBE_COINS = ["保存重载探针A", "保存重载探针B"];

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-6-2-CLEANUP-PERSISTED", url: EDITOR_URL, phases: {} };
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    browser.on("dialog", (d) => { report.dialogs = report.dialogs || []; report.dialogs.push(String(d.message() || "").slice(0, 200)); d.dismiss().catch(() => {}); });
    const page = browser.pages()[0];
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const ready = async () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = (vo && Array.isArray(vo.totalCanvasArray) && vo.totalCanvasArray[0]) || null;
      return { ok: !!(d && d.canvas && d.canvas.getObjects), objs: d ? d.canvas.getObjects().length : 0 };
    }).catch(() => ({ ok: false }));
    let rd = null;
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) { rd = await ready(); if (rd && rd.ok) break; await page.waitForTimeout(2000); }
    report.phases.ready = rd || { ok: false };

    // 移除探针对象（canvas + 图层数组）
    const removed = await page.evaluate((coins) => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const diy = vo.totalCanvasArray[0];
      let n = 0;
      diy.canvas.getObjects().filter((o) => coins.indexOf(o.text) >= 0).forEach((o) => {
        const i = diy.canvasObjInfo.canvasToProductObjArr.indexOf(o);
        if (i >= 0) diy.canvasObjInfo.canvasToProductObjArr.splice(i, 1);
        diy.canvas.remove(o); n += 1;
      });
      if (diy.canvas.requestRenderAll) diy.canvas.requestRenderAll();
      return { removed: n, canvas: diy.canvas.getObjects().length, layer: diy.canvasObjInfo.canvasToProductObjArr.length };
    }, PROBE_COINS).catch((e) => ({ err: String(e || "").slice(0, 250) }));
    report.phases.removed = removed;

    // 真实点击保存（写回服务器）
    const save = await page.evaluate(async () => {
      const cands = Array.from(document.querySelectorAll("button, a, span, div, li"));
      const btn = cands.find((el) => {
        const t = String(el.textContent || "").trim();
        if (t !== "保存" && t !== "保存并预览") return false;
        const r = el.getBoundingClientRect();
        return r.width > 10 && r.height > 10 && getComputedStyle(el).visibility !== "hidden";
      });
      if (!btn) return { clicked: false, note: "no save button" };
      try { btn.click(); } catch (e) { return { clicked: false, err: String(e).slice(0, 150) }; }
      await new Promise((r) => window.setTimeout(r, 3500));
      return { clicked: true, text: btn.textContent.trim() };
    }).catch((e) => ({ err: String(e || "").slice(0, 250) }));
    report.phases.save = save;

    // 刷新验证服务端干净
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    let rd2 = null;
    const deadline2 = Date.now() + 90000;
    while (Date.now() < deadline2) { rd2 = await ready(); if (rd2 && rd2.ok) break; await page.waitForTimeout(2000); }
    const verify = await page.evaluate((coins) => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const diy = vo.totalCanvasArray[0];
      const objs = diy.canvas.getObjects();
      return { canvas: objs.length, layer: diy.canvasObjInfo.canvasToProductObjArr.length, probeLeft: coins.filter((t) => objs.some((o) => o.text === t)).length };
    }, PROBE_COINS).catch((e) => ({ err: String(e || "").slice(0, 250) }));
    report.phases.verifyAfterReload = verify;
    report.conclusion = (verify && verify.probeLeft === 0) ? "SERVER-CLEAN" : ((removed && removed.removed > 0) ? "LOCAL-REMOVED-SERVER-PENDING" : "NOTHING-TO-REMOVE");
  } catch (e) {
    report.errors = report.errors || [];
    report.errors.push("fatal: " + String(e && e.stack || e).slice(0, 600));
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1));
    console.log("report -> " + REPORT_PATH);
    console.log("  [removed] " + JSON.stringify(report.phases.removed || {}));
    console.log("  [save] " + JSON.stringify(report.phases.save || {}));
    console.log("  [verify] " + JSON.stringify(report.phases.verifyAfterReload || {}));
    console.log("  [conclusion] " + report.conclusion);
  }
})();