// runtime/stage-7-4/page-inventory.js — Stage 7.4 Runtime Page Inventory（只读取证, 不改生产）
// 目标：确认真实编辑器里 Page/Canvas 到底长什么样 —— totalCanvasArray 数量、正反面来源字段、
//       模板元数据 pageList 是否与 canvas 数组对齐、当前激活页、rawIdentifiers（脱敏）。
// 必须：真实 ScriptCat + 真实 userscript + 真实编辑器（禁止 Node mock、禁止伪造 page array）。
// 用法：node runtime/stage-7-4/page-inventory.js
// 产物：runtime/reports/stage-7-page/page-inventory.json（含页面钩子捕获的模板/图片信息, 脱敏）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const adapter = require("../scriptcat-adapter");

const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const EXT_ID = adapter.EXT_ID;
const USERSCRIPT_PATH = path.join(ROOT, "zheliyin-card-assistant.user.js");
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-7-page");
const CASES = [
  { id: "CASE_B_DUAL", url: "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do", expect: "dual" },
  { id: "CASE_A_SINGLE", url: "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do", expect: "single" }
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const out = { ts: new Date().toISOString(), stage: "STAGE-7.4-PAGE-INVENTORY", reportDir: REPORT_DIR, cases: {}, errors: [] };
  const consoleLines = [];
  let browser = null, page = null;
  const ev = (fn, arg) => (arg === undefined ? page.evaluate(fn) : page.evaluate(fn, arg)).catch((e) => ({ err: String(e || "").slice(0, 200) }));
  const waitUntil = async (fnEval, desc, timeoutMs, pollMs = 1500) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const r = await ev(fnEval);
      if (r && r.ok) return { ok: true, data: r, ms: Date.now() - t0 };
      await sleep(pollMs);
    }
    return { ok: false, desc, ms: Date.now() - t0 };
  };
  const readyExpr = () => {
    return () => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = (vo && Array.isArray(vo.totalCanvasArray) && vo.totalCanvasArray[0]) || null;
      return { ok: !!(d && d.canvas && typeof d.drawText === "function") };
    };
  };
  try {
    if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
    browser = await chromium.launchPersistentContext(PROFILE, {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR],
      viewport: { width: 1440, height: 900 }
    });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    page = browser.pages()[0];
    page.on("console", (m) => { const t = String(m.text() || ""); if (/zy-ocr|折立印/.test(t)) consoleLines.push(t.slice(0, 220)); });
    // 页面钩子（脱敏）：捕获模板元数据/图片信息响应
    await browser.addInitScript(() => {
      if (window.__zyPgInit) return;
      window.__zyPgInit = true;
      window.__p0PgNet = [];
      const red = (x) => { try { return String(x).replace(/"(access_token|token|password|pwd|secret|cookie|authorization|userId)"\s*:\s*"[^"]*"/gi, '"$1":"[R]"').replace(/userId=|\/userId\/|\/user\//gi, "u=[R]"); } catch (e) { return x; } };
      const push = (rec) => { const a = window.__p0PgNet; if (a.length < 120) a.push(rec); };
      const of = window.fetch;
      if (of && !of.__zyPg) {
        window.fetch = function () {
          const url = String(arguments[0] && arguments[0].url || arguments[0] || "");
          try { if (url.indexOf("zheliyin.com") >= 0 && /findTemplateById|getImgInfos|pageList|template/i.test(url)) push({ t: Date.now(), k: "fetch", u: url.slice(0, 260) }); } catch (e) {}
          return of.apply(this, arguments).then((r) => {
            try { if (r && r.url && /findTemplateById|getImgInfos/i.test(r.url)) { const c = r.clone(); c.text().then((t) => push({ t: Date.now(), k: "fetchR", u: r.url.slice(0, 260), b: red(t).slice(0, 12000) })).catch(() => {}); } } catch (e) {}
            return r;
          });
        };
        window.fetch.__zyPg = true;
      }
      const op_ = XMLHttpRequest.prototype.open, sp_ = XMLHttpRequest.prototype.send;
      if (!op_.__zyPg) {
        XMLHttpRequest.prototype.open = function (m, u) { this.__u = String(u || ""); return op_.apply(this, arguments); };
        XMLHttpRequest.prototype.send = function (body) {
          const u0 = this.__u || "";
          const self = this;
          if (u0.indexOf("zheliyin.com") >= 0 && /findTemplateById|getImgInfos/i.test(u0) && this.addEventListener) {
            this.addEventListener("load", function () {
              try { if (self.readyState === 4) push({ t: Date.now(), k: "xhrR", u: u0.slice(0, 260), b: red(self.responseText || "").slice(0, 12000) }); } catch (e) {}
            });
          }
          return sp_.apply(this, arguments);
        };
        XMLHttpRequest.prototype.open.__zyPg = true;
      }
    });

    // ---- 安装真实 userscript（与生产同源 v0.3.10.2）----
    const opts = browser.pages()[0];
    await opts.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await sleep(2500);
    try {
      const all = await adapter.getAllScripts(opts);
      const mine = (all || []).filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")));
      for (const s of mine) { try { await adapter.removeScript(opts, s.uuid); } catch (e) {} }
      await opts.evaluate(async () => {
        const all2 = await chrome.storage.local.get(null);
        const t = Object.keys(all2).filter((k) => /^compiled_resource:|^resource:/.test(k));
        for (const k of t) { try { await chrome.storage.local.remove(k); } catch (e) {} }
      });
      const code = fs.readFileSync(USERSCRIPT_PATH, "utf8");
      out.scriptRegistered = await adapter.installByCode(opts, { uuid: "zheliyin-page-inv-" + Date.now(), code, upsertBy: "user" });
    } catch (e) { out.errors.push("scriptcat: " + String(e && e.message || e).slice(0, 160)); }
    await sleep(1500);

    for (const c of CASES) {
      const rec = { url: c.url.slice(0, 140), expect: c.expect, ready: false, canvas: null, currentState: null, rawIdentifiers: null, net: null, errors: [] };
      out.cases[c.id] = rec;
      await page.goto("https://diy.zheliyin.com/", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await page.goto(c.url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => rec.errors.push(String(e).slice(0, 120)));
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      const w = await waitUntil(readyExpr(), "editor ready " + c.id, 120000);
      rec.ready = !!(w && w.ok);
      if (!rec.ready) { rec.errors.push("editor not ready"); continue; }
      await sleep(2000);
      // 1) totalCanvasArray 全量枚举
      const canv = await ev(() => {
        const req = window.requirejs || window.require;
        const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
        if (!vo) return { ok: false, err: "no CanvasObjVO" };
        const total = Array.isArray(vo.totalCanvasArray) ? vo.totalCanvasArray : [];
        const canvases = [];
        for (let i = 0; i < total.length; i++) {
          const d = total[i] || {};
          const canvas = d.canvas || null;
          const objs = canvas && typeof canvas.getObjects === "function" ? canvas.getObjects() : [];
          const oTypes = {};
          objs.forEach((o) => { const t = String(o && (o.mediaMediaType || o.type) || "?"); oTypes[t] = (oTypes[t] || 0) + 1; });
          const pick = (k) => { const v = d[k]; return v === undefined ? null : v; };
          canvases.push({
            runtimeIndex: i,
            canvasId: pick("canvasId"), pageNumber: pick("pageNumber"), pageNo: pick("pageNo"),
            pageName: pick("pageName"), title: pick("title"), templateID: pick("templateID"), pageGroup: pick("pageGroup"),
            autoKey: pick("autoKey"), canvasOrder: pick("canvasOrder"),
            width: canvas ? (canvas.getWidth ? canvas.getWidth() : null) : null,
            height: canvas ? (canvas.getHeight ? canvas.getHeight() : null) : null,
            objectCount: objs.length, hasBackground: !!(canvas && canvas.backgroundImage),
            objectTypes: oTypes,
            canvasKeyList: Object.keys(d).filter((k) => /page|side|front|back|face|no|order/i.test(k)).slice(0, 40)
          });
        }
        return { ok: true, canvasCount: total.length, canvases };
      });
      rec.canvas = canv;
      // 2) 当前激活/页状态候选字段
      const cur = await ev(() => {
        const req = window.requirejs || window.require;
        const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
        if (!vo) return null;
        const keys = Object.keys(vo).filter((k) => /page|current|active|side|face|canvas/i.test(k)).slice(0, 40);
        const vals = {};
        keys.forEach((k) => { let v = vo[k]; if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") vals[k] = v; else if (v && typeof v === "object" && !Array.isArray(v)) { vals[k + ".(type)"] = Object.keys(v).slice(0, 6); } });
        return { topKeys: keys, vals };
      });
      rec.currentState = cur;
      // 3) rawIdentifiers（脱敏：id 类仅前 8 位）
      const rid = await ev(() => {
        const req = window.requirejs || window.require;
        const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
        if (!(vo && Array.isArray(vo.totalCanvasArray))) return null;
        const redId = (v) => { const s = String(v == null ? "" : v); return s ? s.slice(0, 8) + ("...") : s; };
        return vo.totalCanvasArray.map((d, i) => {
          const identify = {};
          ["canvasId", "pageId", "pageNo", "pageNumber", "templateID", "pageName", "pageGroup", "id", "uuid", "diyId", "orderId"].forEach((k) => { if (d[k] !== undefined && d[k] !== null) { const s = String(d[k]); identify[k] = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(s) ? redId(s) : (s.length > 40 ? s.slice(0, 40) : s); } });
          const cio = d.canvasObjInfo;
          if (cio) { const inner = {}; ["templateId", "templateID", "pageId", "pageNo", "pageNumber", "pageName", "multiUuid"].forEach((k) => { if (cio[k] !== undefined && cio[k] !== null) { const s = String(cio[k]); inner[k] = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(s) ? redId(s) : (s.length > 40 ? s.slice(0, 40) : s); } }); identify.canvasObjInfo = inner; }
          return { runtimeIndex: i, identify };
        });
      });
      rec.rawIdentifiers = rid;
      // 4) 页面钩子捕获的模板/图片信息
      const net = await ev(() => (window.__p0PgNet || []).slice(-40)).catch(() => []);
      rec.net = net;
    }

    out.console = consoleLines.slice(-40);
    fs.writeFileSync(path.join(REPORT_DIR, "page-inventory.json"), JSON.stringify(out, null, 2));
    console.log("STAGE-7.4 done. report=" + path.join(REPORT_DIR, "page-inventory.json") + " errors=" + out.errors.length);
  } catch (e) {
    out.errors.push(String(e && e.message || e).slice(0, 300));
    try { fs.writeFileSync(path.join(REPORT_DIR, "page-inventory.json"), JSON.stringify(out, null, 2)); } catch (e2) {}
    console.error("FATAL", e && (e.message || e));
  } finally {
    try { page && await page.close(); } catch (e) {}
    try { browser && await browser.close(); } catch (e) {}
  }
})();