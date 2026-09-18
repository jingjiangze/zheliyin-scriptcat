// runtime/stage-7-4/page-switch.js — Stage 7.5 当前页识别 + 正反面切换实验（只读取证）
// 目标：1) 定位真实的页面切换 UI（正面/背面 tab）2) 点击切换，观测 CanvasObjVO 状态变化
//       3) 切回正面验证 identity 稳定（不得假设 index==0 是正面）
// 用法：node runtime/stage-7-4/page-switch.js
// 产物：runtime/reports/stage-7-page/page-switch.json
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
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const out = { ts: new Date().toISOString(), stage: "STAGE-7.5-PAGE-SWITCH", url: EDITOR_URL, rounds: [], errors: [] };
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
  const readyExpr = () => () => {
    const req = window.requirejs || window.require;
    const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
    const d = (vo && Array.isArray(vo.totalCanvasArray) && vo.totalCanvasArray[0]) || null;
    return { ok: !!(d && d.canvas && typeof d.drawText === "function") };
  };
  const snap = async (label) => {
    const st = await ev(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      if (!vo) return { err: "no vo" };
      const total = Array.isArray(vo.totalCanvasArray) ? vo.totalCanvasArray : [];
      return {
        currentCanvasNum: vo.currentCanvasNum, canvasPagesNum: vo.canvasPagesNum, multiCanvas: vo.multiCanvas,
        totalCanvasCount: total.length,
        base64Count: Array.isArray(vo.canvasPagesBase64Arr) ? vo.canvasPagesBase64Arr.length : null,
        pagesJsonCount: Array.isArray(vo.canvasPagesJsonArr) ? vo.canvasPagesJsonArr.length : null,
        perTotal: total.map((d, i) => ({ i, idName: d.idName, objCount: d.canvas && d.canvas.getObjects ? d.canvas.getObjects().length : null }))
      };
    });
    // 页面切换 UI 观测
    const ui = await ev(() => {
      const cands = [];
      const scan = (root, base) => {
        const els = root.querySelectorAll("*");
        const list = [];
        for (let i = 0; i < Math.min(els.length, 4000); i++) {
          const el = els[i];
          if (!el.offsetParent) continue;
          const t = String(el.textContent || "").trim();
          const cls = String(el.className || "").trim();
          if ((t === "正面" || t === "反面" || t === "背面" || /^第\s*[12课]\s*页$/.test(t) || t === "第1页" || t === "第2页") && t.length <= 8 && !/script|style/.test(el.tagName)) {
            list.push({ tag: el.tagName, cls: cls.slice(0, 50), txt: t, id: el.id || "" });
          }
        }
        return list;
      };
      cands.push(...scan(document, 0));
      return cands.slice(0, 20);
    });
    out.rounds.push({ label, state: st, switchUi: ui });
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
    const opts = browser.pages()[0];
    await opts.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await sleep(2000);
    try {
      const all = await adapter.getAllScripts(opts);
      for (const s of (all || []).filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(opts, s.uuid); } catch (e) {} }
      await adapter.installByCode(opts, { uuid: "zheliyin-switch-" + Date.now(), code: fs.readFileSync(USERSCRIPT_PATH, "utf8"), upsertBy: "user" });
    } catch (e) { out.errors.push("scriptcat: " + String(e && e.message || e).slice(0, 160)); }
    await sleep(1200);
    await page.goto("https://diy.zheliyin.com/", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => out.errors.push(String(e).slice(0, 130)));
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const w = await waitUntil(readyExpr(), "editor", 120000);
    out.ready = !!(w && w.ok);
    if (!out.ready) { out.errors.push("editor not ready"); } else {
      await sleep(2000);
      await snap("ROUND1_FRONT_INITIAL");
      // 尝试点击「背面」/「反面」切换元素
      const clicked = await ev(() => {
        const all = Array.from(document.querySelectorAll("li, a, span, div, i, em, button"));
        const targets = [];
        for (const el of all) {
          if (!el.offsetParent) continue;
          const t = String(el.textContent || "").trim();
          if ((t === "背面" || t === "反面") && t.length <= 4) { targets.push(el); break; }
        }
        if (targets[0]) { try { targets[0].click(); return { clicked: true, txt: String(targets[0].textContent || "").trim(), cls: String(targets[0].className || "").slice(0, 50) }; } catch (e) { return { clicked: false, err: String(e) }; } }
        return { clicked: false };
      });
      out.backClick = clicked;
      await sleep(2500);
      await snap("ROUND2_BACK_AFTER_CLICK");
      // 切回正面
      const clickedF = await ev(() => {
        const all = Array.from(document.querySelectorAll("li, a, span, div, i, em, button"));
        for (const el of all) {
          if (!el.offsetParent) continue;
          const t = String(el.textContent || "").trim();
          if (t === "正面" && t.length <= 4) { try { el.click(); return { clicked: true, txt: t }; } catch (e) { return { clicked: false }; } }
        }
        return { clicked: false };
      });
      out.frontClick = clickedF;
      await sleep(2500);
      await snap("ROUND3_FRONT_BACK_AGAIN");
    }
    fs.writeFileSync(path.join(REPORT_DIR, "page-switch.json"), JSON.stringify(out, null, 2));
    console.log("STAGE-7.5 done. report=" + path.join(REPORT_DIR, "page-switch.json"));
  } catch (e) {
    out.errors.push(String(e && e.message || e).slice(0, 300));
    try { fs.writeFileSync(path.join(REPORT_DIR, "page-switch.json"), JSON.stringify(out, null, 2)); } catch (e2) {}
    console.error("FATAL", e && (e.message || e));
  } finally {
    try { page && await page.close(); } catch (e) {}
    try { browser && await browser.close(); } catch (e) {}
  }
})();