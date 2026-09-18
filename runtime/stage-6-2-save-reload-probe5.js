// runtime/stage-6-2-save-reload-probe5.js — thirdDiyEdit.do 模式下保存链路取证
// probe3/4 结论：thirdDiyAdd.do（添加模式）保存 → IfDiyOrderidExit.do?designId=(空) → error，零写库。
// 本探针验证编辑模式（thirdDiyEdit.do）是否具备 designId/订单上下文、保存是否走真实写库。
// 只测保存流程（不创建对象），监听 fetch/ajax/XHR + location 跳转 + 弹层。
// 输出：runtime/reports/stage-6-2-save-reload-probe5.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDIT_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyEdit.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-6-2-save-reload-probe5.json");

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-6-2-SAVE-RELOAD-PROBE5", url: EDIT_URL, phases: {}, errors: [] };
  let browser = null;
  try {
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
    await page.goto(EDIT_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(6000);
    report.phases.firstNav = await page.evaluate(() => ({ href: location.href.slice(0, 200), title: document.title.slice(0, 80), readyState: document.readyState })).catch((e) => ({ err: String(e || "").slice(0, 150) }));

    const readyEval = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = (vo && Array.isArray(vo.totalCanvasArray) && vo.totalCanvasArray[0]) || null;
      const c = d && (d.canvas || d);
      return { ok: !!(d && c && c.getObjects && typeof d.drawText === "function"), objs: c ? c.getObjects().length : 0, href: location.href.slice(0, 160) };
    }).catch(() => ({ ok: false }));
    let rd = null;
    const d1 = Date.now() + 60000;
    while (Date.now() < d1) { rd = await readyEval(); if (rd && rd.ok) break; await page.waitForTimeout(2000); }
    report.phases.editorReady = rd || { ok: false };

    // 网络钩（含响应体 + location 变更标记）
    await page.evaluate(() => {
      window.__zyNavs = [];
      const nav = { push: () => window.history.pushState, replace: () => window.history.replaceState };
      try {
        const oh = window.history.pushState;
        window.history.pushState = function () { window.__zyNavs.push("push:" + location.href.slice(0, 160)); return oh.apply(this, arguments); };
        const or2 = window.history.replaceState;
        window.history.replaceState = function () { window.__zyNavs.push("replace:" + location.href.slice(0, 160)); return or2.apply(this, arguments); };
      } catch (e) {}
      const rec = (url, method, status, body) => {
        if (!url) return;
        let b = "";
        if (typeof body === "string") b = " body=" + JSON.stringify(String(body).slice(0, 400));
        (window.__zyNet = window.__zyNet || []).push(String(method || "?") + " " + String(url).slice(0, 200) + (status ? " ->" + status : "") + b);
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
          opts.success = function (data) { try { rec(u, "jqRes", "200", typeof data === "string" ? data : JSON.stringify(data)); } catch (e) {} if (typeof success === "function") { try { return success.apply(this, arguments); } catch (e2) {} } };
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

    // 点保存（若有）→ 抓 8s 请求 + location 变更
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
      try { btn.click(); } catch (e) { return { found: true, clicked: false, err: String(e).slice(0, 150) }; }
      const snaps = [];
      for (let i = 0; i < 4; i++) { await waitMs(2000); snaps.push({ t: i + 1, net: (window.__zyNet || []).slice(), href: location.href.slice(0, 160), navs: (window.__zyNavs || []).slice() }); }
      return { found: true, clicked: true, net: (window.__zyNet || []).slice(), snaps: snaps, finalHref: location.href.slice(0, 160) };
    }).catch((e) => ({ err: String(e || "").slice(0, 250) }));
    report.phases.save = save;
    await page.waitForTimeout(2000);
    report.phases.postSaveHref = await page.evaluate(() => location.href.slice(0, 200)).catch(() => null);
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.stack || e).slice(0, 700));
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1));
    console.log("report -> " + REPORT_PATH);
    console.log("  [firstNav] " + JSON.stringify(report.phases.firstNav));
    console.log("  [editorReady] " + JSON.stringify(report.phases.editorReady));
    console.log("  [save] found=" + JSON.stringify(report.phases.save && report.phases.save.found) + " clicked=" + JSON.stringify(report.phases.save && report.phases.save.clicked));
    console.log("  [save.net] " + JSON.stringify((report.phases.save && report.phases.save.net || []).slice(0, 12)));
    console.log("  [postSaveHref] " + JSON.stringify(report.phases.postSaveHref));
    if (report.errors && report.errors.length) console.log("  [errors] " + report.errors.join(" ;; "));
  }
})();
