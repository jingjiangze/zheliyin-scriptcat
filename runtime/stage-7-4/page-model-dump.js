// runtime/stage-7-4/page-model-dump.js — Stage 7.4 第二轮：多页结构深挖（只读）
// 目标：确认「正面/反面」事实来源 —— CanvasObjVO 顶层 canvasPagesArr/canvasPagesJsonArr/
//       canvasPackingBoxArray/canvasObjPagesArr 结构, 并与服务端模板元数据(pageList/getImgInfos)对照。
// 用法：node runtime/stage-7-4/page-model-dump.js
// 产物：runtime/reports/stage-7-page/page-model-dump.json
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
  { id: "DUAL_252438", url: "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do", expect: "dual" },
  { id: "ALT_20408603", url: "https://diy.zheliyin.com/diyWeb/third/20408603/2114747/999/thirdDiyAdd.do", expect: "single-or-unknown" }
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const out = { ts: new Date().toISOString(), stage: "STAGE-7.4-PAGE-MODEL-DUMP", cases: {}, errors: [] };
  let browser = null, page = null;
  const ev = (fn, arg) => (arg === undefined ? page.evaluate(fn) : page.evaluate(fn, arg)).catch((e) => ({ err: String(e || "").slice(0, 220) }));
  const waitUntil = async (fnEval, desc, timeoutMs, pollMs = 1500) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const r = await ev(fnEval);
      if (r && r.ok) return { ok: true, data: r, ms: Date.now() - t0 };
      await sleep(pollMs);
    }
    return { ok: false, desc, ms: Date.now() - t0 };
  };
  const readyExpr = () => () => {
    const req = window.requirejs || window.require;
    const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
    const d = (vo && Array.isArray(vo.totalCanvasArray) && vo.totalCanvasArray[0]) || null;
    return { ok: !!(d && d.canvas && typeof d.drawText === "function") };
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
    // 全量 zheliyin JSON 捕获（脱敏），供 pageList/模板元数据对照
    await browser.addInitScript(() => {
      if (window.__zyD1Init) return;
      window.__zyD1Init = true;
      window.__p0AllNet = [];
      const red = (x) => { try { return String(x).replace(/"(access_token|token|password|pwd|secret|cookie|authorization|userId)"\s*:\s*"[^"]*"/gi, '"$1":"[R]"').replace(/userId=|\/userId\/|\/user\//gi, "u=[R]"); } catch (e) { return x; } };
      const push = (rec) => { const a = window.__p0AllNet; if (a.length < 200) a.push(rec); };
      const of = window.fetch;
      if (of && !of.__zyD1) {
        window.fetch = function () {
          const url = String(arguments[0] && arguments[0].url || arguments[0] || "");
          if (url.indexOf("zheliyin.com") >= 0) push({ t: Date.now(), k: "fetch", u: url.slice(0, 280) });
          return of.apply(this, arguments).then((r) => {
            try { if (r && r.url && r.url.indexOf("zheliyin.com") >= 0) { const c = r.clone(); c.text().then((t) => push({ t: Date.now(), k: "fetchR", u: r.url.slice(0, 280), b: red(t).slice(0, 20000) })).catch(() => {}); } } catch (e) {}
            return r;
          });
        };
        window.fetch.__zyD1 = true;
      }
      const op_ = XMLHttpRequest.prototype.open, sp_ = XMLHttpRequest.prototype.send;
      if (!op_.__zyD1) {
        XMLHttpRequest.prototype.open = function (m, u) { this.__u = String(u || ""); return op_.apply(this, arguments); };
        XMLHttpRequest.prototype.send = function (body) {
          const u0 = this.__u || "";
          const self = this;
          if (u0.indexOf("zheliyin.com") >= 0 && this.addEventListener) {
            this.addEventListener("load", function () {
              try { if (self.readyState === 4) push({ t: Date.now(), k: "xhrR", u: u0.slice(0, 280), b: red(self.responseText || "").slice(0, 20000) }); } catch (e) {}
            });
          }
          return sp_.apply(this, arguments);
        };
        XMLHttpRequest.prototype.open.__zyD1 = true;
      }
    });
    // 安装真实 userscript
    const opts = browser.pages()[0];
    await opts.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await sleep(2500);
    try {
      const all = await adapter.getAllScripts(opts);
      for (const s of (all || []).filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(opts, s.uuid); } catch (e) {} }
      await opts.evaluate(async () => {
        const all2 = await chrome.storage.local.get(null);
        const t = Object.keys(all2).filter((k) => /^compiled_resource:|^resource:/.test(k));
        for (const k of t) { try { await chrome.storage.local.remove(k); } catch (e) {} }
      });
      await adapter.installByCode(opts, { uuid: "zheliyin-page-dump-" + Date.now(), code: fs.readFileSync(USERSCRIPT_PATH, "utf8"), upsertBy: "user" });
    } catch (e) { out.errors.push("scriptcat: " + String(e && e.message || e).slice(0, 160)); }
    await sleep(1500);

    for (const c of CASES) {
      const rec = { url: c.url.slice(0, 150), expect: c.expect, ready: false, voTop: null, pageArrays: null, totalCanvas: null, errors: [] };
      out.cases[c.id] = rec;
      await page.goto("https://diy.zheliyin.com/", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await page.goto(c.url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => rec.errors.push(String(e).slice(0, 120)));
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      const w = await waitUntil(readyExpr(), "editor " + c.id, 120000);
      rec.ready = !!(w && w.ok);
      if (!rec.ready) { rec.errors.push("editor not ready"); continue; }
      await sleep(2000);
      const dump = await ev(() => {
        const req = window.requirejs || window.require;
        const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
        if (!vo) return { err: "no vo" };
        const shape = (v, depth) => {
          if (depth > 2) return "...";
          if (Array.isArray(v)) return { arrLen: v.length, sample: v.slice(0, 2).map((x) => shape(x, depth + 1)) };
          if (v && typeof v === "object") { const o = {}; Object.keys(v).slice(0, 30).forEach((k) => { const val = v[k]; if (typeof val === "string" || typeof val === "number" || typeof val === "boolean" || val == null) o[k] = val; else o[k] = shape(val, depth + 1); }); return o; }
          if (typeof v === "string" && v.length > 60) return v.slice(0, 60) + "...";
          return v;
        };
        // 顶层多页结构
        const pageArrays = {};
        ["canvasPagesArr", "canvasPagesJsonArr", "canvasPackingBoxArray", "canvasObjPagesArr", "canvasPagesBase64Arr", "canvasPagesSVGArr", "initialPagesBgArr", "canvasObjPagesArr"].forEach((k) => {
          if (vo[k] !== undefined) pageArrays[k] = shape(vo[k], 0);
        });
        // totalCanvasArray 顶层标识
        const total = Array.isArray(vo.totalCanvasArray) ? vo.totalCanvasArray : [];
        const totalCanvas = total.map((d, i) => {
          const pick = {};
          Object.keys(d).forEach((k) => { const val = d[k]; if (/page|side|face|no|num|order|title|name|template|group|front|back|current/i.test(k) && (typeof val === "string" || typeof val === "number" || typeof val === "boolean")) pick[k] = typeof val === "string" && val.length > 60 ? val.slice(0, 60) : val; });
          const cio = d.canvasObjInfo || {};
          const cioPick = {};
          Object.keys(cio).forEach((k) => { const val = cio[k]; if (/page|side|face|no|num|order|title|name|template|group|front|back|current/i.test(k) && (typeof val === "string" || typeof val === "number" || typeof val === "boolean")) cioPick[k] = typeof val === "string" && val.length > 60 ? val.slice(0, 60) : val; });
          return { runtimeIndex: i, top: pick, canvasObjInfo: cioPick, objCount: d.canvas && d.canvas.getObjects ? d.canvas.getObjects().length : null };
        });
        const topVals = {};
        ["currentCanvasNum", "canvasPagesNum", "multiCanvas", "diyCanvasW", "diyCanvasH"].forEach((k) => { if (vo[k] !== undefined) topVals[k] = vo[k]; });
        return { topVals, pageArrays, totalCanvas };
      });
      rec.voTop = dump && dump.topVals;
      rec.pageArrays = dump && dump.pageArrays;
      rec.totalCanvas = dump && dump.totalCanvas;
      const allNet = await ev(() => (window.__p0AllNet || [])).catch(() => []);
      rec.net = allNet.filter((n) => /findTemplateById|getImgInfos|pageList|template|designInfo/i.test(n.u || "") || (n.b || "").indexOf("pageList") >= 0).slice(-20);
    }
    fs.writeFileSync(path.join(REPORT_DIR, "page-model-dump.json"), JSON.stringify(out, null, 2));
    console.log("STAGE-7.4-dump done. report=" + path.join(REPORT_DIR, "page-model-dump.json") + " errors=" + out.errors.length);
  } catch (e) {
    out.errors.push(String(e && e.message || e).slice(0, 300));
    try { fs.writeFileSync(path.join(REPORT_DIR, "page-model-dump.json"), JSON.stringify(out, null, 2)); } catch (e2) {}
    console.error("FATAL", e && (e.message || e));
  } finally {
    try { page && await page.close(); } catch (e) {}
    try { browser && await browser.close(); } catch (e) {}
  }
})();