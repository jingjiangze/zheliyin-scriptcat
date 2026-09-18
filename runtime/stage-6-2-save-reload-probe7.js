// runtime/stage-6-2-save-reload-probe7.js — 保存表单确定回调深度取证
// probe4 填了 workName/userName 点确定后无 saveThirdUserDesign.do 写库请求。
// 本探针：1) 枚举 modal 全部表单字段(id/值/可见性) 2) 用 jQuery 填必填 3) 点确定
//          4) 抓 12s 请求(重点 saveThirdUserDesign.do) + layer 提示文本 + console 错误
// 输出：runtime/reports/stage-6-2-save-reload-probe7.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const BRIDGE_FILE = path.join(__dirname, "..", "extension", "src", "editor", "page-bridge.js");
const REPORT_PATH = path.join(__dirname, "reports", "stage-6-2-save-reload-probe7.json");

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-6-2-SAVE-RELOAD-PROBE7", url: EDITOR_URL, phases: {}, errors: [] };
  let browser = null;
  try {
    const bridgeSrc = fs.readFileSync(BRIDGE_FILE, "utf8");
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    browser.on("dialog", (d) => { d.accept().catch(() => {}); });
    const page = browser.pages()[0];
    const bridgeStart = (bridgeSrc || "").trim() + "\n;if (typeof pageBridge === 'function' && !window.__ZY_CARD_ASSISTANT_BRIDGE__) { try { pageBridge(); } catch (e) { window.__zyBridgeInstallErr = String((e && e.message) || e).slice(0, 300); } }";
    await page.addInitScript(bridgeStart);

    const readyEval = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = (vo && Array.isArray(vo.totalCanvasArray) && vo.totalCanvasArray[0]) || null;
      const c = d && (d.canvas || d);
      return { ok: !!(d && c && c.getObjects && typeof d.drawText === "function") };
    }).catch(() => ({ ok: false }));
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    let ok = false;
    const d1 = Date.now() + 150000;
    while (Date.now() < d1) { ok = await readyEval(); if (ok) break; await page.waitForTimeout(2000); }
    report.phases.ready = ok;

    // 全局：网络钩 + console/error 钩
    await page.evaluate(() => {
      window.__zyNet = [];
      window.__zyErrs = [];
      try { window.addEventListener("error", function (e) { window.__zyErrs.push("err: " + String(e.message || "").slice(0, 200)); }); } catch (e) {}
      try {
        const oc = window.console.error;
        window.console.error = function () { try { window.__zyErrs.push("console: " + Array.prototype.map.call(arguments, (a) => String(a && a.message || a)).join(" ").slice(0, 250)); } catch (e) {} return oc.apply(this, arguments); };
      } catch (e) {}
      const rec = (url, method, status, body) => {
        if (!url) return;
        let b = "";
        if (typeof body === "string") b = " body=" + JSON.stringify(String(body).slice(0, 300));
        (window.__zyNet).push(String(method || "?") + " " + String(url).slice(0, 180) + (status ? " ->" + status : "") + b);
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
          try { x.addEventListener("loadend", function () { try { (window.__zyNet = window.__zyNet || []).push(x.__zyM + " " + String(x.__zyU).slice(0, 180) + " ->" + x.status + " body=" + JSON.stringify(String(x.responseText || "").slice(0, 300))); } catch (e) {} }); } catch (e) {}
          return os.apply(this, arguments);
        };
        window.__zyXhrHooked = true;
      }
      return true;
    }).catch((e) => report.errors.push("nethook: " + String(e || "").slice(0, 150)));

    // 关键隐藏字段审计（保存前置）
    const audit = await page.evaluate(() => {
      const $ = window.jQuery;
      const g = (sel) => { const el = $(sel)[0]; return el ? String($(sel).val() || "").slice(0, 60) : "<absent>"; };
      return {
        diyId: g("#diyId"), sourceId: g("#sourceId"), worksStatus: g("#worksStatus"), isAdmin: g("#isAdmin"),
        thirdOrderNo: g("#thirdOrderNo"), copyDesignNo: g("#copyDesignNo"), canEdit: g("#canEdit"), checkOperate: g("#checkOperate"),
        multiCheck: g("#multiCheck"), isNoSave: g("#isNoSave"), typeid: g("#typeid"), diyTypeNumCup: g("#diyTypeNumCup"),
        centerTitle: (function () { const el = $(".centerTitle .title")[0]; return el ? String($(el).val() || "").slice(0, 60) : "<absent>"; })(),
        templateName: g("#templateName")
      };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    report.phases.audit = audit;

    // 点保存 → 等 modal → 枚举字段 → 填值 → 确定 → 抓 12s
    const flow = await page.evaluate(async () => {
      const $ = window.jQuery;
      const waitMs = (ms) => new Promise((r) => window.setTimeout(r, ms));
      await waitMs(5000);
      const realBtn = $(".rightBtn .save").filter(":visible")[0];
      const btn = realBtn || Array.from(document.querySelectorAll("button, a, span, div, li")).find((el) => {
        const t = String(el.textContent || "").trim();
        if (t !== "保存" && t !== "保存并预览") return false;
        const r = el.getBoundingClientRect();
        return r.width > 10 && r.height > 10 && getComputedStyle(el).visibility !== "hidden";
      });
      if (!btn) return { found: false, realBtnCount: $(".rightBtn .save").length };
      btn.click();
      await waitMs(3000);
      const modal = Array.from(document.querySelectorAll("div, section")).find((el) => {
        const t = String(el.textContent || "");
        const r = el.getBoundingClientRect();
        return /设计信息/.test(t) && r.width > 300 && r.height > 100;
      });
      if (!modal) return { found: true, modal: "not-found" };
      // 枚举表单字段
      const fields = Array.from(modal.querySelectorAll("input, textarea, select")).map((el) => {
        const r = el.getBoundingClientRect();
        return { tag: el.tagName, id: el.id, name: el.name, type: el.type, val: String(el.value || "").slice(0, 40), visible: r.width > 5 && getComputedStyle(el).visibility !== "hidden", ph: String(el.placeholder || "").slice(0, 40) };
      });
      // jQuery 填必填（workName/userName/address/telNo 若存在）
      const fill = (sel, v) => { const el = $(sel)[0]; if (!el) return false; try { $(el).val(v); $(el).trigger("input"); $(el).trigger("change"); return true; } catch (e) { return false; } };
      const filled = {
        workName: fill("#workName", "P7测试作品"),
        userName: fill("#userName", "P7测试用户"),
        telNo: fill("#telNo", "13800138000"),
        address: fill("#address", "测试地址")
      };
      await waitMs(500);
      // 点 layui 确定按钮（.layui-layer-btn0）
      let confirm = null;
      const lbtn = document.querySelector(".layui-layer-btn0");
      if (lbtn) { try { lbtn.click(); confirm = "clicked-layui-btn0"; } catch (e) { confirm = "err " + String(e).slice(0, 100); } }
      else confirm = "no-layui-btn0";
      // 抓 12s
      const snaps = [];
      for (let i = 0; i < 6; i++) { await waitMs(2000); snaps.push((window.__zyNet || []).slice()); }
      // 抓 layer 提示（msg/alert）
      const layerText = Array.from(document.querySelectorAll(".layui-layer, .layui-layer-msg")).map((el) => String(el.textContent || "").trim().slice(0, 150)).filter((t) => t.length > 0).slice(0, 8);
      return { found: true, modal: "found", fields: fields, filled: filled, confirm: confirm, net: (window.__zyNet || []).slice(), snaps: snaps, layerText: layerText, errs: (window.__zyErrs || []).slice() };
    }).catch((e) => ({ err: String(e || "").slice(0, 300) }));
    report.phases.flow = flow;

    // 若写库请求出现（saveThirdUserDesign.do）→ 刷新验证
    const wrote = (flow && flow.net || []).some((x) => x.indexOf("saveThirdUserDesign") >= 0);
    report.phases.wroteToServer = wrote;
    if (wrote) {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      let ok2 = false;
      const d2 = Date.now() + 90000;
      while (Date.now() < d2) { ok2 = await readyEval(); if (ok2) break; await page.waitForTimeout(2000); }
      report.phases.afterReload = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
        const diy = vo.totalCanvasArray[0];
        return { canvas: diy.canvas.getObjects().length, layer: diy.canvasObjInfo.canvasToProductObjArr.length };
      }).catch((e) => ({ err: String(e || "").slice(0, 150) }));
    }
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.stack || e).slice(0, 700));
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1));
    console.log("report -> " + REPORT_PATH);
    console.log("  [ready] " + report.phases.ready);
    console.log("  [audit] " + JSON.stringify(report.phases.audit));
    console.log("  [flow] modal=" + JSON.stringify((report.phases.flow && report.phases.flow.modal) || null) + " confirm=" + JSON.stringify((report.phases.flow && report.phases.flow.confirm) || null));
    console.log("  [flow.fields] " + JSON.stringify((report.phases.flow && report.phases.flow.fields) || []).slice(0, 1200));
    console.log("  [flow.net] " + JSON.stringify((report.phases.flow && report.phases.flow.net || []).slice(0, 14)));
    console.log("  [flow.layerText] " + JSON.stringify((report.phases.flow && report.phases.flow.layerText) || []));
    console.log("  [flow.errs] " + JSON.stringify((report.phases.flow && report.phases.flow.errs) || []));
    console.log("  [wroteToServer] " + report.phases.wroteToServer + " afterReload=" + JSON.stringify(report.phases.afterReload || {}));
    if (report.errors && report.errors.length) console.log("  [errors] " + report.errors.join(" ;; "));
  }
})();

