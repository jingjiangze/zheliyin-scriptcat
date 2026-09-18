// runtime/stage-6-2-save-reload-probe3.js — Save 链路精确审计（决定性取证）
// 目的：回答 probe1/probe2 留下的三问——
//   Q1: IfDiyOrderidExit.do 的响应体是什么（订单是否存在 / designId 是否为空）
//   Q2: 点击「保存」后除前置检查外，是否发出真正的写库请求（顺序、URL、响应）
//   Q3: 保存弹窗是原生 dialog 还是页面自绘弹层，文本是什么
// 方法：
//   1) 打开 252438 编辑器（profile-usc3 真实登录）
//   2) 注入全量网络钩（fetch + jQuery.ajax + XHR，含响应体摘要）
//   3) ocrCreate 创建 1 个探针对象（native）
//   4) 点击「保存」，等待 8s，记录请求序列 / 弹窗 / 自绘弹层文本
//   5) 刷新（不清站点数据）读对象状态；随后清理恢复画布
// 输出：runtime/reports/stage-6-2-save-reload-probe3.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const BRIDGE_FILE = path.join(__dirname, "..", "extension", "src", "editor", "page-bridge.js");
const REPORT_PATH = path.join(__dirname, "reports", "stage-6-2-save-reload-probe3.json");
const PROBE_TEXT = "持久探针3";

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-6-2-SAVE-RELOAD-PROBE3", url: EDITOR_URL, phases: {}, errors: [] };
  let browser = null;
  try {
    const bridgeSrc = fs.readFileSync(BRIDGE_FILE, "utf8");
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    browser.on("dialog", (d) => {
      report.dialogs = report.dialogs || [];
      report.dialogs.push({ msg: String(d.message() || "<empty>").slice(0, 300), type: d.type() });
      d.accept().catch(() => {});
    });
    const page = browser.pages()[0];
    const bridgeStart = (bridgeSrc || "").trim() + "\n;if (typeof pageBridge === 'function' && !window.__ZY_CARD_ASSISTANT_BRIDGE__) { try { pageBridge(); } catch (e) { window.__zyBridgeInstallErr = String((e && e.message) || e).slice(0, 300); } }";
    await page.addInitScript(bridgeStart);

    const readyEval = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = (vo && Array.isArray(vo.totalCanvasArray) && vo.totalCanvasArray[0]) || null;
      const c = d && (d.canvas || d);
      return { ok: !!(d && c && c.getObjects && typeof d.drawText === "function"), objs: c ? c.getObjects().length : 0, href: location.href.slice(0, 160) };
    }).catch(() => ({ ok: false }));
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    let rd = null;
    const d1 = Date.now() + 150000;
    while (Date.now() < d1) { rd = await readyEval(); if (rd && rd.ok) break; await page.waitForTimeout(2000); }
    report.phases.ready = rd || { ok: false };

    // 全量网络钩（含响应体摘要）
    await page.evaluate(() => {
      const rec = (url, method, status, body) => {
        if (!url) return;
        const m = String(method || "?");
        const s = status ? " ->" + status : "";
        let b = "";
        if (typeof body === "string") { b = " body=" + JSON.stringify(String(body).slice(0, 400)); }
        (window.__zyNet = window.__zyNet || []).push(m + " " + String(url).slice(0, 200) + s + b);
      };
      const of = window.fetch;
      if (of && !of.__zyNetHooked) {
        window.fetch = function () {
          const u = arguments[0] && typeof arguments[0] === "object" ? (arguments[0].url || "") : String(arguments[0] || "");
          try { rec(u, "fetch(" + ((arguments[1] && arguments[1].method) || "GET") + ")"); } catch (e) {}
          const p = of.apply(this, arguments);
          return p.then((r) => { try { r.clone().text().then((t) => rec(u, "fetchRes." + ((arguments[1] && arguments[1].method) || "GET"), r.status, t)); } catch (e) {} return r; });
        };
        window.fetch.__zyNetHooked = true;
      }
      const oa = window.jQuery && window.jQuery.ajax;
      if (oa && !oa.__zyNetHooked) {
        const wrap = function () {
          const opts = arguments[0] && typeof arguments[0] === "object" ? arguments[0] : {};
          const u = opts.url || "";
          try { rec(u, "jq." + (opts.type || "GET")); } catch (e) {}
          const success = opts.success;
          opts.success = function (data) { try { rec(u, "jqRes." + (opts.type || "GET"), "200", typeof data === "string" ? data : JSON.stringify(data)); } catch (e) {} if (typeof success === "function") { try { return success.apply(this, arguments); } catch (e2) {} } };
          const error = opts.error;
          opts.error = function (xhr) { try { rec(u, "jqErr." + (opts.type || "GET"), xhr && xhr.status, xhr && xhr.responseText); } catch (e) {} if (typeof error === "function") { try { return error.apply(this, arguments); } catch (e2) {} } };
          return oa.call(this, opts);
        };
        wrap.__zyNetHooked = true;
        window.jQuery.ajax = wrap;
      }
      const ox = window.XMLHttpRequest.prototype.open;
      const os = window.XMLHttpRequest.prototype.send;
      if (!window.__zyXhrHooked) {
        window.XMLHttpRequest.prototype.open = function (m, u) { this.__zyM = m; this.__zyU = u; return ox.apply(this, arguments); };
        window.XMLHttpRequest.prototype.send = function () {
          const x = this;
          try { x.addEventListener("loadend", function () { try { (window.__zyNet = window.__zyNet || []).push(x.__zyM + " " + String(x.__zyU).slice(0, 200) + " ->" + x.status + " body=" + JSON.stringify(String(x.responseText || "").slice(0, 400))); } catch (e) {} }); } catch (e) {}
          return os.apply(this, arguments);
        };
        window.__zyXhrHooked = true;
      }
      return true;
    }).catch((e) => report.errors.push("nethook: " + String(e || "").slice(0, 150)));

    // 基线
    const pre = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const diy = vo.totalCanvasArray[0];
      return { canvas: diy.canvas.getObjects().length, layer: diy.canvasObjInfo.canvasToProductObjArr.length, href: location.href.slice(0, 160) };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    report.phases.pre = pre;

    // 创建 1 个探针对象
    const ocrRes = await page.evaluate((items) => new Promise((resolve) => {
      const to = window.setTimeout(() => { window.removeEventListener("message", on); resolve({ ok: false, timeout: true }); }, 18000);
      const on = (e) => { if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === "ocrCreateResult") { window.clearTimeout(to); window.removeEventListener("message", on); resolve(e.data); } };
      window.addEventListener("message", on);
      window.postMessage({ source: "zy-card-assistant", type: "ocrCreate", items: items }, location.origin);
    }), [{ text: PROBE_TEXT, blockIndex: 0, left: 70, top: 96, width: 200, height: 30, fontSize: 24 }]).catch((e) => ({ err: String(e || "").slice(0, 300) }));
    report.phases.ocrCreate = { ok: !!(ocrRes && ocrRes.ok), created: ocrRes && ocrRes.createdCount, mode: ocrRes && ocrRes.editorIntegration && ocrRes.editorIntegration.mode };

    // 点击保存并抓 8s 内请求序列 + 自绘弹层
    const save = await page.evaluate(async () => {
      const waitMs = (ms) => new Promise((r) => window.setTimeout(r, ms));
      const cands = Array.from(document.querySelectorAll("button, a, span, div, li"));
      const btn = cands.find((el) => {
        const t = String(el.textContent || "").trim();
        if (t !== "保存" && t !== "保存并预览") return false;
        const r = el.getBoundingClientRect();
        return r.width > 10 && r.height > 10 && getComputedStyle(el).visibility !== "hidden";
      });
      if (!btn) return { found: false, net: (window.__zyNet || []).slice() };
      const chain = [];
      let el = btn; while (el && el.tagName) { chain.push(el.tagName + "." + String(el.className || "").slice(0, 30)); el = el.parentElement; }
      try { btn.click(); } catch (e) { return { found: true, clicked: false, err: String(e).slice(0, 150) }; }
      const netSnaps = [];
      for (let i = 0; i < 4; i++) { await waitMs(2000); netSnaps.push((window.__zyNet || []).slice()); }
      // 自绘弹层文本
      let layerText = null;
      try {
        layerText = Array.from(document.querySelectorAll("div, section")).filter((el) => {
          const c = String(el.className || "");
          const r = el.getBoundingClientRect();
          return /modal|dialog|popup|layer|alert|confirm/i.test(c) && r.width > 60 && r.height > 30;
        }).map((el) => String(el.textContent || "").trim().slice(0, 120)).filter((t) => t.length > 0).slice(0, 6);
      } catch (e) {}
      const after = await waitMs(500).then(() => ({
        canvas: (function () { try { const req = window.requirejs; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); return vo.totalCanvasArray[0].canvas.getObjects().length; } catch (e) { return -1; } })(),
        layer: (function () { try { const req = window.requirejs; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); return vo.totalCanvasArray[0].canvasObjInfo.canvasToProductObjArr.length; } catch (e) { return -1; } })()
      }));
      return { found: true, clicked: true, chain: chain.slice(0, 6), net: (window.__zyNet || []).slice(), netSnaps: netSnaps, layerText: layerText, after: after };
    }).catch((e) => ({ err: String(e || "").slice(0, 250) }));
    report.phases.save = save;

    // 刷新（不清站点数据）读对象状态
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    let rd2 = null;
    const d2 = Date.now() + 90000;
    while (Date.now() < d2) { rd2 = await readyEval(); if (rd2 && rd2.ok) break; await page.waitForTimeout(2000); }
    const readState = () => page.evaluate((coin) => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const diy = vo.totalCanvasArray[0];
      const objs = diy.canvas.getObjects();
      const layers = diy.canvasObjInfo.canvasToProductObjArr;
      return { canvas: objs.length, layer: layers.length, probeOnCanvas: objs.filter((o) => o.text === coin).length, probeInLayer: layers.filter((o) => o.text === coin).length };
    }, PROBE_TEXT).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    report.phases.afterReload = await readState();

    // 判定
    report.conclusion = {
      note: "保存点击后请求序列见 phases.save.net；IfDiyOrderidExit.do 响应体见 jqRes/fetchRes/XHR body。",
      reloadRestored: !!(report.phases.afterReload && report.phases.afterReload.probeOnCanvas === 1)
    };

    // 清理：无论是否恢复都移除对象 + 保存 + 刷新验证干净
    const clean = await page.evaluate(async (coin) => {
      const waitMs = (ms) => new Promise((r) => window.setTimeout(r, ms));
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const diy = vo.totalCanvasArray[0];
      diy.canvas.getObjects().filter((o) => o.text === coin).forEach((o) => {
        const i = diy.canvasObjInfo.canvasToProductObjArr.indexOf(o);
        if (i >= 0) diy.canvasObjInfo.canvasToProductObjArr.splice(i, 1);
        diy.canvas.remove(o);
      });
      if (diy.canvas.requestRenderAll) diy.canvas.requestRenderAll();
      const cands = Array.from(document.querySelectorAll("button, a, span, div, li"));
      const btn = cands.find((el) => { const t = String(el.textContent || "").trim(); if (t !== "保存" && t !== "保存并预览") return false; const r = el.getBoundingClientRect(); return r.width > 10 && r.height > 10 && getComputedStyle(el).visibility !== "hidden"; });
      let clicked = false;
      if (btn) { try { btn.click(); clicked = true; } catch (e) {} }
      await waitMs(3000);
      return { clicked: clicked, net: (window.__zyNet || []).slice(-8) };
    }, PROBE_TEXT).catch((e) => ({ err: String(e || "").slice(0, 250) }));
    report.phases.cleanup = clean;
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    let rd3 = null;
    const d3 = Date.now() + 90000;
    while (Date.now() < d3) { rd3 = await readyEval(); if (rd3 && rd3.ok) break; await page.waitForTimeout(2000); }
    report.phases.cleanupVerify = await readState();
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.stack || e).slice(0, 700));
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1));
    console.log("report -> " + REPORT_PATH);
    console.log("  [ready] " + JSON.stringify(report.phases.ready));
    console.log("  [ocrCreate] " + JSON.stringify(report.phases.ocrCreate || {}));
    console.log("  [save] found=" + JSON.stringify(report.phases.save && report.phases.save.found) + " clicked=" + JSON.stringify(report.phases.save && report.phases.save.clicked) + " chain=" + JSON.stringify((report.phases.save && report.phases.save.chain) || []));
    console.log("  [save.net] " + JSON.stringify((report.phases.save && report.phases.save.net || []).slice(0, 12)));
    console.log("  [save.layerText] " + JSON.stringify((report.phases.save && report.phases.save.layerText) || []));
    console.log("  [afterReload] " + JSON.stringify(report.phases.afterReload));
    console.log("  [cleanupVerify] " + JSON.stringify(report.phases.cleanupVerify));
    console.log("  [dialogs] " + JSON.stringify(report.dialogs || []));
    if (report.errors && report.errors.length) console.log("  [errors] " + report.errors.join(" ;; "));
  }
})();
