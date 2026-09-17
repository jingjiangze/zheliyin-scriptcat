// runtime/stage-6-2-save-reload-probe.js — Stage 6.2 P1：保存/刷新的真实行为探测（§二十二）
// 目标：区分 reload stability 与 server-save persistence 两个指标。
//   1) 生产 bridge ocrCreate（原生 drawText）创建 2 个文字对象
//   2) 尝试触发真实保存（查找"保存"按钮；钩住 fetch/jQuery.ajax 记录保存请求）
//   3) 保存后 reload，检查 OCR 文字对象/图层是否恢复（server-save persistence 证据）
//   4) 若无法保存（未登录/只读/弹窗），明确记录限制（P1 允许"已验证或明确记录限制"）
// 输出：runtime/reports/stage-6-2-save-reload-probe.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const BRIDGE_FILE = path.join(__dirname, "..", "extension", "src", "editor", "page-bridge.js");
const REPORT_PATH = path.join(__dirname, "reports", "stage-6-2-save-reload-probe.json");

const TEST_ITEMS = [
  { text: "保存重载探针A", blockIndex: 0, left: 60, top: 90, width: 200, height: 30, fontSize: 24 },
  { text: "保存重载探针B", blockIndex: 1, left: 60, top: 128, width: 200, height: 26, fontSize: 20 }
];

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-6-2-SAVE-RELOAD-PROBE", url: EDITOR_URL, phases: {}, errors: [] };
  let browser = null;
  try {
    const bridgeSrc = fs.readFileSync(BRIDGE_FILE, "utf8");
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    // 弹窗统一记录后关闭，避免阻断后续操作
    browser.on("dialog", (d) => { report.dialogs = report.dialogs || []; report.dialogs.push(String(d.message() || "").slice(0, 200)); d.dismiss().catch(() => {}); });
    const page = browser.pages()[0];
    const bridgeStart = (bridgeSrc || "").trim() + "\n;if (typeof pageBridge === 'function' && !window.__ZY_CARD_ASSISTANT_BRIDGE__) { try { pageBridge(); } catch (e) { window.__zyBridgeInstallErr = String((e && e.message) || e).slice(0, 300); } }";
    await page.addInitScript(bridgeStart);
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    let rd = null;
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
      rd = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
        const t = vo && vo.totalCanvasArray;
        const d = (Array.isArray(t) && t[0]) || null;
        const c = d && (d.canvas || d);
        return { ok: !!(d && c && c.getObjects && typeof d.drawText === "function"), objs: c ? c.getObjects().length : 0 };
      }).catch(() => ({ ok: false }));
      if (rd && rd.ok) break;
      await page.waitForTimeout(2000);
    }
    report.phases.ready = rd || { ok: false };
    if (!(rd && rd.ok)) throw new Error("editor not ready");

    const pre = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const defs = (ctx && ctx.defined) || {};
      const vo = defs.CanvasObjVO || window.CanvasObjVO;
      const diy = vo.totalCanvasArray[0];
      return { canvas: diy.canvas.getObjects().length, layer: diy.canvasObjInfo.canvasToProductObjArr.length, href: location.href };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    report.phases.pre = pre;

    // 钩住保存网络请求（fetch + jQuery.ajax），点击保存后读取
    const netHook = await page.evaluate(() => {
      const rec = (url, method) => { const t = (url || ""); (window.__zySaveNet = window.__zySaveNet || []).push(method + " " + t.slice(0, 220)); };
      try {
        const of = window.fetch;
        if (of && !of.__zyhooked) {
          window.fetch = function () { try { rec(arguments[0], "fetch"); } catch (e) {} return of.apply(this, arguments); };
          window.fetch.__zyhooked = true;
        }
      } catch (e) {}
      try {
        const oa = window.jQuery && window.jQuery.ajax;
        if (oa && oa.__zyajax) window.jQuery.ajax = oa;
        if (window.jQuery && oa && !oa.__zyajax) {
          const wrap = function () { try { rec(arguments[0] && arguments[0].url, "jqajax"); } catch (e) {} return oa.apply(this, arguments); };
          wrap.__zyajax = true;
          window.jQuery.ajax = wrap;
        }
      } catch (e) {}
      return true;
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    report.phases.netHook = netHook;

    // 用生产 bridge 走原生 ocrCreate 创建 2 个对象
    const ocrRes = await page.evaluate((items) => new Promise((resolve) => {
      const to = window.setTimeout(() => { window.removeEventListener("message", on); resolve({ ok: false, timeout: true }); }, 18000);
      const on = (e) => {
        if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === "ocrCreateResult") {
          window.clearTimeout(to); window.removeEventListener("message", on); resolve(e.data);
        }
      };
      window.addEventListener("message", on);
      window.postMessage({ source: "zy-card-assistant", type: "ocrCreate", items: items }, location.origin);
    }), TEST_ITEMS).catch((e) => ({ err: String(e || "").slice(0, 300) }));
    report.phases.ocrCreate = { ok: !!(ocrRes && ocrRes.ok), created: ocrRes && ocrRes.createdCount, editorIntegration: ocrRes && ocrRes.editorIntegration };

    // 查找保存按钮（多个候选），记录点击结果
    const saveClick = await page.evaluate(async () => {
      const findSave = () => {
        const cands = Array.from(document.querySelectorAll("button, a, span, div, li"));
        const hits = cands.filter((el) => {
          const t = String(el.textContent || "").trim();
          if (t !== "保存" && t !== "保存并预览" && t !== "保 存") return false;
          const r = el.getBoundingClientRect();
          return r.width > 10 && r.height > 10 && getComputedStyle(el).visibility !== "hidden";
        });
        return hits[0] || null;
      };
      const btn = findSave();
      if (!btn) return { found: false, note: "no visible save button" };
      const chain = []; let p = btn; let d = 0;
      while (p && d < 6) { chain.push((p.tagName || "") + "." + String(p.className || "").slice(0, 40)); p = p.parentElement; d += 1; }
      try { btn.click(); } catch (e) { return { found: true, clicked: false, err: String(e).slice(0, 150), chain }; }
      await new Promise((r) => window.setTimeout(r, 3500));
      const net = (window.__zySaveNet || []).slice();
      const bodyText = document.body ? document.body.textContent.slice(0, 120) : "";
      return { found: true, clicked: true, text: btn.textContent.trim(), chain: chain, net: net, toast: bodyText.indexOf("保存") >= 0 ? "body-has-保存" : "no", undoLen: (function () { const vo = (window.CanvasObjVO || {}); return vo && vo.undoAndRedo ? ((vo.undoAndRedo.undo[0] || []).length) : null; })() };
    }).catch((e) => ({ err: String(e || "").slice(0, 300) }));
    report.phases.saveClick = saveClick;

    // 保存后 reload → 验证持久化（server-save persistence）
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    let rd2 = null;
    const deadline2 = Date.now() + 90000;
    while (Date.now() < deadline2) {
      rd2 = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
        const t = vo && vo.totalCanvasArray;
        const d = (Array.isArray(t) && t[0]) || null;
        const c = d && (d.canvas || d);
        return { ok: !!(d && c && c.getObjects), objs: c ? c.getObjects().length : 0, href: location.href, isEditor: !!d };
      }).catch(() => ({ ok: false }));
      if (rd2 && rd2.ok && rd2.isEditor) break;
      await page.waitForTimeout(2000);
    }
    const afterReload = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const defs = (ctx && ctx.defined) || {};
      const vo = defs.CanvasObjVO || window.CanvasObjVO;
      const diy = vo.totalCanvasArray[0];
      const coins = ["保存重载探针A", "保存重载探针B"];
      const objs = diy.canvas.getObjects();
      const layers = diy.canvasObjInfo.canvasToProductObjArr;
      return {
        isEditor: true, href: location.href, canvas: objs.length, layer: layers.length,
        probeOnCanvas: coins.filter((t) => objs.some((o) => o.text === t)).length,
        probeInLayer: coins.filter((t) => layers.some((o) => o.text === t)).length
      };
    }).catch((e) => ({ err: String(e || "").slice(0, 300), isEditor: false, note: "post-reload page is not the editor (login/redirect?)" }));
    report.phases.afterReload = afterReload;

    // 判断结论
    const save = saveClick && saveClick.found;
    const saved = save && saveClick.clicked;
    const persisted = !!(afterReload && afterReload.isEditor && afterReload.probeOnCanvas === TEST_ITEMS.length && afterReload.probeInLayer === TEST_ITEMS.length);
    const editorLostAfterReload = !(afterReload && afterReload.isEditor);
    report.conclusion = {
      saveButtonFound: !!save,
      saveClicked: !!saved,
      persistence: persisted ? "SERVER-SAVE-PERSISTED" : (saved ? "NOT-PERSISTED" : (save ? "SAVE-CLICKED-NO-EVIDENCE" : "NO-SAVE-BUTTON")),
      reloadStability: editorLostAfterReload ? "PENDING-limitation: reload did not restore editor (needs real save/login)" : (persisted ? "verified" : "verified-not-persisted-without-save"),
      serverSavePersistence: persisted ? "verified" : "PENDING",
      limitation: editorLostAfterReload ? "post-reload page is not the editor — 保存需真实登录/模板权限，自动化环境无法完成；P1 按 §二十六 记录限制" : (persisted ? "none" : "after save attempt objects not restored on reload — verify manually with logged-in user")
    };

    // 清理：如仍在编辑器，移除探针对象并恢复 undo 基线（保持 profile 干净）
    if (afterReload && afterReload.isEditor) {
      const cleanup = await page.evaluate((args) => {
        const pre = args.pre;
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const defs = (ctx && ctx.defined) || {};
        const vo = defs.CanvasObjVO || window.CanvasObjVO;
        const diy = vo.totalCanvasArray[0];
        const coins = ["保存重载探针A", "保存重载探针B"];
        let removed = 0;
        diy.canvas.getObjects().filter((o) => coins.indexOf(o.text) >= 0).forEach((o) => {
          const i = diy.canvasObjInfo.canvasToProductObjArr.indexOf(o);
          if (i >= 0) diy.canvasObjInfo.canvasToProductObjArr.splice(i, 1);
          diy.canvas.remove(o); removed += 1;
        });
        diy.canvas.requestRenderAll();
        const pageIdx = vo.currentCanvasNum - 1;
        try {
          const ua = vo.undoAndRedo.undo[pageIdx]; if (Array.isArray(ua) && ua.length > pre.undoLen) ua.length = pre.undoLen;
          const ra = vo.undoAndRedo.redo[pageIdx]; if (Array.isArray(ra) && ra.length > pre.redoLen) ra.length = pre.redoLen;
        } catch (e) {}
        return { removed: removed, final: { canvas: diy.canvas.getObjects().length, layer: diy.canvasObjInfo.canvasToProductObjArr.length }, undo: { undoLen: (vo.undoAndRedo.undo[pageIdx] || []).length, redoLen: (vo.undoAndRedo.redo[pageIdx] || []).length } };
      }, { pre }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
      report.phases.cleanup = cleanup;
    } else {
      report.phases.cleanup = { note: "not in editor (login/redirect) — profile left as-is, verify manually" };
    }
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.stack || e).slice(0, 700));
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1));
    console.log("report -> " + REPORT_PATH);
    console.log("  [ready] " + JSON.stringify(report.phases.ready || {}));
    console.log("  [ocrCreate] " + JSON.stringify(report.phases.ocrCreate || {}));
    console.log("  [saveClick] " + JSON.stringify(report.phases.saveClick || {}).slice(0, 600));
    console.log("  [afterReload] " + JSON.stringify(report.phases.afterReload || {}).slice(0, 400));
    console.log("  [conclusion] " + JSON.stringify(report.conclusion));
    if (report.errors && report.errors.length) console.log("  [errors] " + report.errors.join(" ;; "));
  }
})();