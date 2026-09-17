// runtime/stage-6-2-save-reload-probe2.js — Stage 6.2 P1（决定性复测）：保存/刷新 双指标区分（§二十二）
// 目的：区分 reload stability（本地草稿缓存）与 server-save persistence（服务端写回）。
// 方法：
//   1) 生产 bridge ocrCreate 创建 2 个对象
//   2) 全量网络钩（fetch + jQuery.ajax + XMLHttpRequest），点击"保存"并【接受】确认弹窗
//   3) 刷新：若对象仍在 → 先记录 reload stability
//   4) Storage.clearDataForOrigin 清站点数据再刷新：仍在 → SERVER-SAVE-PERSISTED（决定性）；消失 → 仅本地草稿 → PENDING + 限制记录
//   5) 收尾：确保服务端干净（移除对象 + 保存 + 清缓存验证），profile 可复用
// 输出：runtime/reports/stage-6-2-save-reload-probe2.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const BRIDGE_FILE = path.join(__dirname, "..", "extension", "src", "editor", "page-bridge.js");
const REPORT_PATH = path.join(__dirname, "reports", "stage-6-2-save-reload-probe2.json");

const TEST_ITEMS = [
  { text: "持久探针X", blockIndex: 0, left: 70, top: 96, width: 200, height: 30, fontSize: 24 },
  { text: "持久探针Y", blockIndex: 1, left: 70, top: 134, width: 200, height: 26, fontSize: 20 }
];

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-6-2-SAVE-RELOAD-PROBE2", url: EDITOR_URL, phases: {}, errors: [] };
  let browser = null;
  try {
    const bridgeSrc = fs.readFileSync(BRIDGE_FILE, "utf8");
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    // 保存确认弹窗：记录并【接受】（上轮 dismiss 可能中断了真实保存）
    browser.on("dialog", (d) => { report.dialogs = report.dialogs || []; report.dialogs.push(String(d.message() || "").slice(0, 200)); d.accept().catch(() => {}); });
    const page = browser.pages()[0];
    const bridgeStart = (bridgeSrc || "").trim() + "\n;if (typeof pageBridge === 'function' && !window.__ZY_CARD_ASSISTANT_BRIDGE__) { try { pageBridge(); } catch (e) { window.__zyBridgeInstallErr = String((e && e.message) || e).slice(0, 300); } }";
    await page.addInitScript(bridgeStart);

    const readyEval = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = (vo && Array.isArray(vo.totalCanvasArray) && vo.totalCanvasArray[0]) || null;
      const c = d && (d.canvas || d);
      return { ok: !!(d && c && c.getObjects && typeof d.drawText === "function"), objs: c ? c.getObjects().length : 0 };
    }).catch(() => ({ ok: false }));
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    let rd = null;
    const d1 = Date.now() + 150000;
    while (Date.now() < d1) { rd = await readyEval(); if (rd && rd.ok) break; await page.waitForTimeout(2000); }
    report.phases.ready = rd || { ok: false };

    // 全量网络钩
    await page.evaluate(() => {
      const rec = (url, method, status) => { if (!url) return; const m = String(method || "?"); const s = status ? " ->" + status : ""; (window.__zyNet = window.__zyNet || []).push(m + " " + String(url).slice(0, 240) + s); };
      const of = window.fetch;
      if (of && !of.__zyNetHooked) { window.fetch = function () { try { rec(arguments[0], "fetch(" + (arguments[1] && arguments[1].method || "GET") + ")"); } catch (e) {} return of.apply(this, arguments); }; window.fetch.__zyNetHooked = true; }
      const oa = window.jQuery && window.jQuery.ajax;
      if (oa && !oa.__zyNetHooked) { const wrap = function () { try { rec(arguments[0] && arguments[0].url, "jq." + (arguments[0] && arguments[0].type || "GET")); } catch (e) {} return oa.apply(this, arguments); }; wrap.__zyNetHooked = true; window.jQuery.ajax = wrap; }
      const ox = window.XMLHttpRequest.prototype.open;
      const os = window.XMLHttpRequest.prototype.send;
      if (!window.__zyXhrHooked) {
        window.XMLHttpRequest.prototype.open = function (m, u) { this.__zyM = m; this.__zyU = u; return ox.apply(this, arguments); };
        window.XMLHttpRequest.prototype.send = function () { const x = this; try { x.addEventListener("loadend", function () { try { (window.__zyNet = window.__zyNet || []).push(x.__zyM + " " + String(x.__zyU).slice(0, 240) + " ->" + x.status); } catch (e) {} }); } catch (e) {} return os.apply(this, arguments); };
        window.__zyXhrHooked = true;
      }
      return true;
    }).catch((e) => report.errors.push("nethook: " + String(e || "").slice(0, 150)));

    // 创建 2 个对象
    const ocrRes = await page.evaluate((items) => new Promise((resolve) => {
      const to = window.setTimeout(() => { window.removeEventListener("message", on); resolve({ ok: false, timeout: true }); }, 18000);
      const on = (e) => { if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === "ocrCreateResult") { window.clearTimeout(to); window.removeEventListener("message", on); resolve(e.data); } };
      window.addEventListener("message", on);
      window.postMessage({ source: "zy-card-assistant", type: "ocrCreate", items: items }, location.origin);
    }), TEST_ITEMS).catch((e) => ({ err: String(e || "").slice(0, 300) }));
    report.phases.ocrCreate = { ok: !!(ocrRes && ocrRes.ok), created: ocrRes && ocrRes.createdCount, mode: ocrRes && ocrRes.editorIntegration && ocrRes.editorIntegration.mode };

    // 点击保存（接受弹窗）
    const saveClick = await page.evaluate(async () => {
      const cands = Array.from(document.querySelectorAll("button, a, span, div, li"));
      const btn = cands.find((el) => {
        const t = String(el.textContent || "").trim();
        if (t !== "保存" && t !== "保存并预览") return false;
        const r = el.getBoundingClientRect();
        return r.width > 10 && r.height > 10 && getComputedStyle(el).visibility !== "hidden";
      });
      if (!btn) return { found: false };
      try { btn.click(); } catch (e) { return { found: true, clicked: false, err: String(e).slice(0, 150) }; }
      await new Promise((r) => window.setTimeout(r, 5000));
      return { found: true, clicked: true, net: (window.__zyNet || []).slice() };
    }).catch((e) => ({ err: String(e || "").slice(0, 250) }));
    report.phases.saveClick = saveClick;

    // 刷新（同会话）：reload stability
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    let rd2 = null;
    const d2 = Date.now() + 90000;
    while (Date.now() < d2) { rd2 = await readyEval(); if (rd2 && rd2.ok) break; await page.waitForTimeout(2000); }
    const readState = () => page.evaluate((coins) => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const diy = vo.totalCanvasArray[0];
      const objs = diy.canvas.getObjects();
      const layers = diy.canvasObjInfo.canvasToProductObjArr;
      return { canvas: objs.length, layer: layers.length, probeOnCanvas: coins.filter((t) => objs.some((o) => o.text === t)).length, probeInLayer: coins.filter((t) => layers.some((o) => o.text === t)).length };
    }, TEST_ITEMS.map((x) => x.text)).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    const afterReload = await readState();
    report.phases.afterReload = afterReload;

    // 清站点数据（localStorage/IndexedDB/ServiceWorker）再刷新：若仍在 → 服务端持久化；消失 → 本地草稿
    let clearResult = null;
    try {
      clearResult = await browser.newCDPSession(page).then((cdp) => cdp.send("Storage.clearDataForOrigin", { origin: "https://diy.zheliyin.com", storageTypes: "local_storage,indexeddb,service_workers,cache_storage" }));
    } catch (e) { clearResult = { err: String(e || "").slice(0, 200) }; }
    report.phases.clearData = clearResult;
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    let rd3 = null;
    const d3 = Date.now() + 90000;
    while (Date.now() < d3) { rd3 = await readyEval(); if (rd3 && rd3.ok) break; await page.waitForTimeout(2000); }
    const afterClearReload = await readState();
    report.phases.afterClearReload = afterClearReload;

    // 判定
    const srvPersisted = !!(afterClearReload && afterClearReload.probeOnCanvas === TEST_ITEMS.length && afterClearReload.probeInLayer === TEST_ITEMS.length);
    const reloadRestored = !!(afterReload && afterReload.probeOnCanvas === TEST_ITEMS.length);
    report.conclusion = srvPersisted
      ? { serverSavePersistence: "verified", reloadStability: "verified", note: "清站点数据后刷新对象仍在 → 服务端真实持久化" }
      : { serverSavePersistence: "PENDING", reloadStability: reloadRestored ? "verified-local-draft" : "not-restored", note: (reloadRestored ? "刷新可恢复但清缓存后消失：上一轮的恢复来自本地草稿缓存，非服务端。" : "刷新未恢复。") + " 服务端持久化需真实登录账号在编辑器内点击保存完成，自动化无登录 profile 无法确认 → 按 §二十六 记录限制（P1 limitation 已记录）。", limitation: "server-save 需真实登录（红线：不在自动化中伪造保存），P1 标记 PENDING 并记录限制" };

    // 收尾：确认服务端干净（无论何状态：存在即移除 + 保存；清缓存后若已消失则无需处理）
    if (afterClearReload && afterClearReload.probeOnCanvas > 0) {
      await page.evaluate((coins) => {
        const req = window.requirejs || window.require;
        const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
        const diy = vo.totalCanvasArray[0];
        diy.canvas.getObjects().filter((o) => coins.indexOf(o.text) >= 0).forEach((o) => {
          const i = diy.canvasObjInfo.canvasToProductObjArr.indexOf(o);
          if (i >= 0) diy.canvasObjInfo.canvasToProductObjArr.splice(i, 1);
          diy.canvas.remove(o);
        });
        if (diy.canvas.requestRenderAll) diy.canvas.requestRenderAll();
      }, TEST_ITEMS.map((x) => x.text)).catch(() => {});
      const save2 = await page.evaluate(async () => {
        const cands = Array.from(document.querySelectorAll("button, a, span, div, li"));
        const btn = cands.find((el) => { const t = String(el.textContent || "").trim(); if (t !== "保存" && t !== "保存并预览") return false; const r = el.getBoundingClientRect(); return r.width > 10 && r.height > 10 && getComputedStyle(el).visibility !== "hidden"; });
        if (!btn) return { clicked: false };
        try { btn.click(); } catch (e) { return { clicked: false }; }
        await new Promise((r) => window.setTimeout(r, 4000));
        return { clicked: true };
      }).catch(() => ({ clicked: false }));
      report.phases.cleanupSave = save2;
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      let rd4 = null; const d4 = Date.now() + 90000;
      while (Date.now() < d4) { rd4 = await readyEval(); if (rd4 && rd4.ok) break; await page.waitForTimeout(2000); }
      report.phases.cleanupVerify = await readState();
    } else {
      report.phases.cleanupNote = "clear 后无残留，服务端本就不含探针对象；无需清理（若此前保存被取消，则对象从未写库）。";
    }
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.stack || e).slice(0, 700));
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1));
    console.log("report -> " + REPORT_PATH);
    console.log("  [ocrCreate] " + JSON.stringify(report.phases.ocrCreate || {}));
    console.log("  [saveClick] " + JSON.stringify({ found: report.phases.saveClick && report.phases.saveClick.found, clicked: report.phases.saveClick && report.phases.saveClick.clicked, net: (report.phases.saveClick && report.phases.saveClick.net || []).slice(0, 6) }));
    console.log("  [afterReload] " + JSON.stringify(report.phases.afterReload || {}));
    console.log("  [clearData] " + JSON.stringify(report.phases.clearData || {}));
    console.log("  [afterClearReload] " + JSON.stringify(report.phases.afterClearReload || {}));
    console.log("  [conclusion] " + JSON.stringify(report.conclusion));
    if (report.errors && report.errors.length) console.log("  [errors] " + report.errors.join(" ;; "));
  }
})();