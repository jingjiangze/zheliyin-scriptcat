// runtime/stage-6-2-save-reload-probe4.js — 设计信息 modal 确认后的保存链路取证
// probe3 结论：点「保存」→ 弹「设计信息」modal（作品名*/用户名*/备注*）→ IfDiyOrderidExit.do 返回
//   {"data":"","status":"error"}（designId 空），无写库请求。
// 本探针回答：填必填项 + 点「确定」后，是否出现真正的保存写库请求；若有 → 刷新验证持久化闭环。
// 流程：打开 252438 → 网络钩(含响应体) → ocrCreate 1 对象 → 点保存 → 填 modal 必填项 → 确定
//       → 抓 10s 请求序列 → 刷新读对象 → 清理（移除对象+保存+刷新验证）→ 报告
// 输出：runtime/reports/stage-6-2-save-reload-probe4.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const BRIDGE_FILE = path.join(__dirname, "..", "extension", "src", "editor", "page-bridge.js");
const REPORT_PATH = path.join(__dirname, "reports", "stage-6-2-save-reload-probe4.json");
const PROBE_TEXT = "持久探针4";

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-6-2-SAVE-RELOAD-PROBE4", url: EDITOR_URL, phases: {}, errors: [] };
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
      report.dialogs.push({ msg: String(d.message() || "<empty>").slice(0, 200), type: d.type() });
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
      return { ok: !!(d && c && c.getObjects && typeof d.drawText === "function"), objs: c ? c.getObjects().length : 0 };
    }).catch(() => ({ ok: false }));
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    let rd = null;
    const d1 = Date.now() + 150000;
    while (Date.now() < d1) { rd = await readyEval(); if (rd && rd.ok) break; await page.waitForTimeout(2000); }
    report.phases.ready = rd || { ok: false };

    // 全量网络钩（含响应体）
    await page.evaluate(() => {
      const rec = (url, method, status, body) => {
        if (!url) return;
        const m = String(method || "?");
        const s = status ? " ->" + status : "";
        let b = "";
        if (typeof body === "string") b = " body=" + JSON.stringify(String(body).slice(0, 400));
        (window.__zyNet = window.__zyNet || []).push(m + " " + String(url).slice(0, 200) + s + b);
      };
      const of = window.fetch;
      if (of && !of.__zyNetHooked) {
        window.fetch = function () {
          const u = arguments[0] && typeof arguments[0] === "object" ? (arguments[0].url || "") : String(arguments[0] || "");
          try { rec(u, "fetch(" + ((arguments[1] && arguments[1].method) || "GET") + ")"); } catch (e) {}
          const p = of.apply(this, arguments);
          return p.then((r) => { try { r.clone().text().then((t) => rec(u, "fetchRes", r.status, t)); } catch (e) {} return r; });
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
          opts.error = function (xhr) { try { rec(u, "jqErr", xhr && xhr.status, xhr && xhr.responseText); } catch (e) {} if (typeof error === "function") { try { return error.apply(this, arguments); } catch (e2) {} } };
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

    // 创建 1 探针对象
    const ocrRes = await page.evaluate((items) => new Promise((resolve) => {
      const to = window.setTimeout(() => { window.removeEventListener("message", on); resolve({ ok: false, timeout: true }); }, 18000);
      const on = (e) => { if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === "ocrCreateResult") { window.clearTimeout(to); window.removeEventListener("message", on); resolve(e.data); } };
      window.addEventListener("message", on);
      window.postMessage({ source: "zy-card-assistant", type: "ocrCreate", items: items }, location.origin);
    }), [{ text: PROBE_TEXT, blockIndex: 0, left: 70, top: 96, width: 200, height: 30, fontSize: 24 }]).catch((e) => ({ err: String(e || "").slice(0, 300) }));
    report.phases.ocrCreate = { ok: !!(ocrRes && ocrRes.ok), created: ocrRes && ocrRes.createdCount, mode: ocrRes && ocrRes.editorIntegration && ocrRes.editorIntegration.mode };

    // 点保存 → 等 modal → 填必填 → 确定 → 抓 10s 请求
    const saveFlow = await page.evaluate(async () => {
      const waitMs = (ms) => new Promise((r) => window.setTimeout(r, ms));
      const cands = Array.from(document.querySelectorAll("button, a, span, div, li"));
      const btn = cands.find((el) => {
        const t = String(el.textContent || "").trim();
        if (t !== "保存" && t !== "保存并预览") return false;
        const r = el.getBoundingClientRect();
        return r.width > 10 && r.height > 10 && getComputedStyle(el).visibility !== "hidden";
      });
      if (!btn) return { found: false };
      btn.click();
      await waitMs(2500);
      // 定位 modal：包含"设计信息"字样且尺寸足够大的容器
      const modal = Array.from(document.querySelectorAll("div, section")).find((el) => {
        const t = String(el.textContent || "");
        const r = el.getBoundingClientRect();
        return /设计信息/.test(t) && r.width > 300 && r.height > 100;
      });
      if (!modal) return { found: true, modal: "not-found", net: (window.__zyNet || []).slice() };
      // 找输入框（input/textarea），按文档顺序填：作品名/用户名/备注
      const inputs = Array.from(modal.querySelectorAll("input[type=text], input:not([type]), textarea, input[type=textarea]")).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 20 && getComputedStyle(el).visibility !== "hidden";
      });
      const filled = [];
      const fillVals = ["P4测试作品", "P4测试用户", "P4测试备注"];
      inputs.slice(0, 3).forEach((el, i) => {
        try {
          const proto = Object.getPrototypeOf(el);
          const setter = Object.getOwnPropertyDescriptor(proto, "value");
          if (setter && setter.set) setter.set.call(el, fillVals[i]);
          else el.value = fillVals[i];
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          filled.push({ tag: el.tagName, id: el.id, name: el.name, cls: String(el.className || "").slice(0, 30), val: el.value });
        } catch (e) { filled.push({ err: String(e).slice(0, 100) }); }
      });
      // 点 modal 内"确定"
      let confirmClick = null;
      const confirmBtn = Array.from(modal.querySelectorAll("button, a, span, div, li")).find((el) => {
        const t = String(el.textContent || "").trim();
        if (t !== "确定" && t !== "确 定" && t !== "确认" && t !== "保存") return false;
        const r = el.getBoundingClientRect();
        return r.width > 10 && r.height > 10;
      });
      if (confirmBtn) {
        try { confirmBtn.click(); confirmClick = "clicked"; } catch (e) { confirmClick = "err " + String(e).slice(0, 100); }
      } else confirmClick = "not-found";
      // 抓 10s 请求
      const snaps = [];
      for (let i = 0; i < 5; i++) { await waitMs(2000); snaps.push((window.__zyNet || []).slice()); }
      // 保存后画布/图层
      let after = null;
      try {
        const req = window.requirejs || window.require;
        const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
        after = { canvas: vo.totalCanvasArray[0].canvas.getObjects().length, layer: vo.totalCanvasArray[0].canvasObjInfo.canvasToProductObjArr.length };
      } catch (e) { after = { err: String(e).slice(0, 100) }; }
      return { found: true, modal: "found", modalText: String(modal.textContent || "").trim().slice(0, 200), filled: filled, confirmClick: confirmClick, net: (window.__zyNet || []).slice(), snaps: snaps, after: after };
    }).catch((e) => ({ err: String(e || "").slice(0, 250) }));
    report.phases.saveFlow = saveFlow;

    // 刷新验证
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

    report.conclusion = { note: "请求序列见 phases.saveFlow.net；若出现 saveDesign/thirdDiyAdd/写库 POST 且刷新后 probe 仍在 → 持久化闭环成立。", reloadRestored: !!(report.phases.afterReload && report.phases.afterReload.probeOnCanvas === 1) };

    // 清理：移除对象 + 保存 + 刷新验证干净
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
      return { clicked: clicked, net: (window.__zyNet || []).slice(-10) };
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
    console.log("  [saveFlow] modal=" + JSON.stringify((report.phases.saveFlow && report.phases.saveFlow.modal) || null) + " confirm=" + JSON.stringify((report.phases.saveFlow && report.phases.saveFlow.confirmClick) || null) + " filled=" + JSON.stringify((report.phases.saveFlow && report.phases.saveFlow.filled) || []));
    console.log("  [saveFlow.net] " + JSON.stringify((report.phases.saveFlow && report.phases.saveFlow.net || []).slice(0, 14)));
    console.log("  [afterReload] " + JSON.stringify(report.phases.afterReload));
    console.log("  [cleanupVerify] " + JSON.stringify(report.phases.cleanupVerify));
    if (report.errors && report.errors.length) console.log("  [errors] " + report.errors.join(" ;; "));
  }
})();
