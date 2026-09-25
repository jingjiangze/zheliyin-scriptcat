// 真机探索：编辑器是否支持正反面（CanvasObjVO.totalCanvasArray 多页）+ 页面切换/加页 UI 入口
// 只读探测，不改画布。输出 stdout JSON。
"use strict";
const path = require("path");
const { chromium } = require("D:/zheliyin-scriptcat/node_modules/playwright");
const ROOT = "D:/zheliyin-scriptcat";
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const EXT_ID = "ndcooeababalnlpkfedmmbbbgkljhpjf";
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const probeMod = require(path.join(ROOT, "runtime", "stage9", "session-probe"));

const URLS = (process.env.ZY_PROBE_URLS || "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do").split(",").map((s) => s.trim()).filter(Boolean);

function parseCookies(raw) {
  const out = [];
  String(raw || "").split(";").forEach((part) => {
    const eq = part.indexOf("=");
    if (eq <= 0) return;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!name || !value) return;
    out.push({ name: name, value: value.replace(/^"|"$/g, ""), domain: ".diy.zheliyin.com", path: "/", expires: -1 });
  });
  return out;
}

(async () => {
  const sess = await probeMod.resolveStage9Cookie();
  const RAW = sess.raw || "";
  if (!RAW) { console.error("NO_COOKIE: " + (sess.error || "")); process.exit(2); }
  const browser = await chromium.launchPersistentContext(PROFILE, {
    channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
    args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR],
    viewport: { width: 1280, height: 900 }
  });
  const page = browser.pages()[0];
  for (const c of parseCookies(RAW)) { try { await browser.addCookies([c]); } catch (e) {} }
  const out = { cookieSource: sess.source, urls: [] };
  for (const u of URLS) {
    const rec = { url: u, errors: [] };
    try {
      await page.goto(u, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => rec.errors.push("GOTO:" + String(e && e.message || e).slice(0, 100)));
      await SLEEP(6000);
      rec.title = await page.title().catch(() => null);
      rec.finalUrl = page.url();
      rec.canvas = await page.evaluate(() => {
        try {
          const req = window.requirejs || window.require;
          const ctx = req && req.s && req.s.contexts && req.s.contexts._;
          const CV = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO || null;
          if (!CV) return { ok: false, reason: "NO_CanvasObjVO", hasRequire: !!req, keys: Object.keys(window).filter((k) => /Canvas|canvas/.test(k)).slice(0, 20) };
          const total = Array.isArray(CV.totalCanvasArray) ? CV.totalCanvasArray : [];
          const unwrap = (e) => { try { return (e && e.canvas) || e; } catch (x) { return null; } };
          return {
            ok: true,
            currentCanvasNum: CV.currentCanvasNum != null ? CV.currentCanvasNum : null,
            count: total.length,
            frontImgPathStr: CV.frontImgPathStr ? String(CV.frontImgPathStr).slice(0, 80) : null,
            backImgPathStr: CV.backImgPathStr ? String(CV.backImgPathStr).slice(0, 80) : null,
            pages: total.map((e, i) => {
              const c = unwrap(e);
              let objs = null; let texts = [];
              try { if (c && c.getObjects) { const os = c.getObjects(); objs = os.length; texts = os.filter((o) => o && /text|i-text|textbox/.test(String(o.type))).map((o) => String(o.text || "").slice(0, 24)).slice(0, 8); } } catch (x) {}
              return { i: i, idName: e && e.idName ? String(e.idName) : null, pageName: e && (e.pageName || e.title) || null, drawText: !!(e && typeof e.drawText === "function"), objCount: objs, texts: texts, w: c ? (c.width || (c.getWidth && c.getWidth())) : null, h: c ? (c.height || (c.getHeight && c.getHeight())) : null };
            })
          };
        } catch (e) { return { ok: false, reason: "EVAL:" + String(e && e.message || e).slice(0, 120) }; }
      }).catch((e) => ({ ok: false, reason: "PW:" + String(e && e.message || e).slice(0, 120) }));
      rec.pageGroups = await page.evaluate(() => Array.from(document.querySelectorAll(".page-group")).map((el) => ({ cls: String(el.className || ""), text: String(el.textContent || "").trim().slice(0, 40) }))).catch(() => []);
      rec.addPageCandidates = await page.evaluate(() => {
        const hits = [];
        document.querySelectorAll("a,button,span,div,li,i,em").forEach((el) => {
          const t = String(el.textContent || "").trim();
          if (!t || t.length > 12) return;
          if (/双面|反面|背面|正反面|添加页面|加页|新增页面|换面|翻面/.test(t) && el.offsetParent) {
            hits.push({ tag: el.tagName, id: el.id || null, cls: String(el.className || "").slice(0, 60), text: t });
          }
        });
        return hits.slice(0, 25);
      }).catch(() => []);
      rec.thumbCandidates = await page.evaluate(() => {
        const hits = [];
        document.querySelectorAll("[class*='page'],[class*='thumb'],[class*='side']").forEach((el) => {
          const cls = String(el.className || "");
          if (!/page|thumb|side/i.test(cls)) return;
          if (!el.offsetParent) return;
          hits.push({ tag: el.tagName, cls: cls.slice(0, 70), text: String(el.textContent || "").trim().slice(0, 30) });
        });
        return hits.slice(0, 30);
      }).catch(() => []);
    } catch (e) { rec.errors.push("OUTER:" + String(e && e.message || e).slice(0, 200)); }
    out.urls.push(rec);
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error("FATAL " + String(e && e.message || e)); process.exit(1); });
