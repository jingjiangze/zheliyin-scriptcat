// runtime/stage-7-4/page-registry-probe.js — Stage 7.6 Runtime: 注入 page-model 真机验证
// A:初始FRONT B:切BACK C:切FRONT D:连续切换x5 E:identity稳定  + 冲突场景观测
// 产物: runtime/reports/stage-7-page/page-registry.json
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
const PAGE_MODEL_SRC = fs.readFileSync(path.join(ROOT, "extension", "src", "editor", "page-model.js"), "utf8");
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-7-page");
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const out = { ts: new Date().toISOString(), stage: "STAGE-7.6-PAGE-REGISTRY", rounds: [], errors: [] };
  let browser = null, page = null;
  const ev = (fn, arg) => (arg === undefined ? page.evaluate(fn) : page.evaluate(fn, arg)).catch((e) => ({ err: String(e || "").slice(0, 200) }));
  const waitUntil = async (fnEval, desc, timeoutMs, pollMs = 1500) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) { const r = await ev(fnEval); if (r && r.ok) return { ok: true, data: r, ms: Date.now() - t0 }; await sleep(pollMs); }
    return { ok: false, desc };
  };
  const readyExpr = () => () => {
    const req = window.requirejs || window.require;
    const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
    const d = (vo && Array.isArray(vo.totalCanvasArray) && vo.totalCanvasArray[0]) || null;
    return { ok: !!(d && d.canvas && typeof d.drawText === "function") };
  };
  const clickPage = (txt) => ev(() => {
    const all = Array.from(document.querySelectorAll("li, a, span, div, i, em, button"));
    for (const el of all) { if (!el.offsetParent) continue; const t = String(el.textContent || "").trim(); if (t === txt && t.length <= 4) { try { el.click(); return { clicked: true, txt: t }; } catch (e) { return { clicked: false }; } } }
    return { clicked: false };
  });
  const snapCurrent = (label) => ev((arg) => {
    const req = window.requirejs || window.require;
    const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
    const r = pageModel.resolvePageIdentity(vo, document);
    const pages = pageModel.enumeratePages(vo).map((p) => ({ pageId: p.pageId, canvasId: p.canvasId, pageIndex: p.pageIndex }));
    const uiTxt = (() => { const el = document.querySelector(".page-group.current"); return el ? String(el.textContent || "").trim() : null; })();
    return { label: arg.label, currentCanvasNum: vo ? vo.currentCanvasNum : null, uiTxt: uiTxt, pages: pages, resolution: r };
  }, { label });
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
    const opts = browser.pages()[0];
    await opts.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await sleep(2000);
    try {
      const all = await adapter.getAllScripts(opts);
      for (const s of (all || []).filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(opts, s.uuid); } catch (e) {} }
      await adapter.installByCode(opts, { uuid: "zheliyin-registry-" + Date.now(), code: fs.readFileSync(USERSCRIPT_PATH, "utf8"), upsertBy: "user" });
    } catch (e) { out.errors.push("scriptcat: " + String(e && e.message || e).slice(0, 160)); }
    await sleep(1200);
    await page.goto("https://diy.zheliyin.com/", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => out.errors.push(String(e).slice(0, 130)));
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const w = await waitUntil(readyExpr(), "editor", 120000);
    out.ready = !!(w && w.ok);
    if (!out.ready) { out.errors.push("editor not ready"); }
    else {
      await sleep(2500);
      // 注入 page-model 到页面世界（真实仓库源码）
      const inj = await page.evaluate((src) => { try { (0, eval)(src); return { ok: typeof pageModel === "object" }; } catch (e) { return { ok: false, err: String(e && e.message || e).slice(0, 120) }; } }, PAGE_MODEL_SRC).catch((e) => ({ err: String(e).slice(0, 160) }));
      out.inject = inj;
      if (!(inj && inj.ok)) { out.errors.push("pageModel inject failed"); }
      else {
        await snapCurrent("ROUND0_INITIAL_FRONT");
        for (const step of [{ k: "toBack", f: () => clickPage("背面") }, { k: "toFront", f: () => clickPage("正面") }, { k: "toBack2", f: () => clickPage("背面") }, { k: "toFront2", f: () => clickPage("正面") }]) {
          const c = await step.f(); out.rounds.push({ click: step.k, result: c });
          await sleep(2200);
          out.rounds.push(await snapCurrent("after_" + step.k));
        }
        // 冲突观测：不改 UI（停留正面）但故意给 currentCanvasNum 2 → 应冲突（读场景由单测覆盖, 此处记录真实一致性）
        const conflict = await ev(() => {
          const req = window.requirejs || window.require;
          const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
          const fake = Object.assign({}, vo, { currentCanvasNum: vo.currentCanvasNum === 1 ? 2 : 1 });
          return pageModel.resolvePageIdentity(fake, document);
        }).catch((e) => ({ err: String(e).slice(0, 160) }));
        out.conflictProbe = conflict;
      }
    }
    fs.writeFileSync(path.join(REPORT_DIR, "page-registry.json"), JSON.stringify(out, null, 2));
    console.log("STAGE-7.6-registry done. report=" + path.join(REPORT_DIR, "page-registry.json") + " errors=" + out.errors.length);
  } catch (e) {
    out.errors.push(String(e && e.message || e).slice(0, 300));
    try { fs.writeFileSync(path.join(REPORT_DIR, "page-registry.json"), JSON.stringify(out, null, 2)); } catch (e2) {}
    console.error("FATAL", e && (e.message || e));
  } finally {
    try { page && await page.close(); } catch (e) {}
    try { browser && await browser.close(); } catch (e) {}
  }
})();