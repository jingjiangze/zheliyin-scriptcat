// 真机探索 2：点击 UI「背面」页 → 观察 totalCanvasArray 是否 materialize 第 2 画布
"use strict";
const path = require("path");
const { chromium } = require("D:/zheliyin-scriptcat/node_modules/playwright");
const ROOT = "D:/zheliyin-scriptcat";
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const probeMod = require(path.join(ROOT, "runtime", "stage9", "session-probe"));
const URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";

function parseCookies(raw) {
  const out = [];
  String(raw || "").split(";").forEach((part) => {
    const eq = part.indexOf("=");
    if (eq <= 0) return;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!name || !value) return;
    out.push({ name, value: value.replace(/^"|"$/g, ""), domain: ".diy.zheliyin.com", path: "/", expires: -1 });
  });
  return out;
}
const CANVAS_PROBE = () => {
  try {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const CV = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO || null;
    if (!CV) return { ok: false, reason: "NO_CanvasObjVO" };
    const total = Array.isArray(CV.totalCanvasArray) ? CV.totalCanvasArray : [];
    const unwrap = (e) => { try { return (e && e.canvas) || e; } catch (x) { return null; } };
    return {
      ok: true, currentCanvasNum: CV.currentCanvasNum != null ? CV.currentCanvasNum : null, count: total.length,
      frontImgPathStr: CV.frontImgPathStr ? String(CV.frontImgPathStr).slice(0, 60) : null,
      backImgPathStr: CV.backImgPathStr ? String(CV.backImgPathStr).slice(0, 60) : null,
      pages: total.map((e, i) => {
        const c = unwrap(e);
        let objs = null, texts = [];
        try { if (c && c.getObjects) { const os = c.getObjects(); objs = os.length; texts = os.filter((o) => o && /text|i-text|textbox/.test(String(o.type))).map((o) => String(o.text || "").slice(0, 20)).slice(0, 6); } } catch (x) {}
        return { i, idName: e && e.idName ? String(e.idName) : null, drawText: !!(e && typeof e.drawText === "function"), objCount: objs, texts, w: c ? (c.width || (c.getWidth && c.getWidth())) : null, h: c ? (c.height || (c.getHeight && c.getHeight())) : null };
      })
    };
  } catch (e) { return { ok: false, reason: "EVAL:" + String(e && e.message || e).slice(0, 120) }; }
};

(async () => {
  const sess = await probeMod.resolveStage9Cookie();
  const RAW = sess.raw || "";
  if (!RAW) { console.error("NO_COOKIE"); process.exit(2); }
  const browser = await chromium.launchPersistentContext(PROFILE, {
    channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
    args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR],
    viewport: { width: 1280, height: 900 }
  });
  browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
  const page = browser.pages()[0];
  for (const c of parseCookies(RAW)) { try { await browser.addCookies([c]); } catch (e) {} }
  const out = { cookieSource: sess.source, steps: [] };
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await SLEEP(7000);
  out.steps.push({ step: "initial", canvas: await page.evaluate(CANVAS_PROBE).catch((e) => ({ ok: false, reason: String(e && e.message).slice(0, 100) })) });

  // 点击「背面」页入口（DOM 交互，非坐标点击）
  const clickRes = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll(".page-group, .pageNum, .pageWrapMulti li, .pageWrapMulti a, .pageWrapMulti span, .pageWrapMulti div"));
    const hit = els.find((el) => /^背面$|^反面$/.test(String(el.textContent || "").trim()) && el.offsetParent);
    if (!hit) return { clicked: false, cands: els.map((e) => String(e.textContent || "").trim()).filter(Boolean).slice(0, 30) };
    try { hit.click(); } catch (e) { return { clicked: false, err: String(e && e.message).slice(0, 80) }; }
    return { clicked: true, tag: hit.tagName, cls: String(hit.className || "").slice(0, 60) };
  }).catch((e) => ({ clicked: false, err: String(e && e.message).slice(0, 100) }));
  out.steps.push({ step: "click-back", result: clickRes });
  await SLEEP(6000);
  out.steps.push({ step: "after-click", canvas: await page.evaluate(CANVAS_PROBE).catch((e) => ({ ok: false, reason: String(e && e.message).slice(0, 100) })) });
  out.pageGroupAfter = await page.evaluate(() => Array.from(document.querySelectorAll(".page-group")).map((el) => ({ cls: String(el.className || ""), text: String(el.textContent || "").trim().slice(0, 20) }))).catch(() => []);
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error("FATAL " + String(e && e.message || e)); process.exit(1); });
