// runtime/stage9/page-tab-probe.js — Stage 9 V4：真实编辑器页面切换控件探针（只读 + 程序化 click）
// 目的：确认「正面/反面」tab 的 DOM 选择器与切页后 totalCanvasArray 动态扩展行为（page-model 动态 materialize 证据）。
// cookie 注入（env ZY_STAGE9_COOKIE，只记名）；零坐标点击（DOM .click()）。
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("../../node_modules/playwright");
const ROOT = path.join(__dirname, "..", "..");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const COOKIE_RAW = process.env.ZY_STAGE9_COOKIE || "";
function parseCookies(raw) {
  const out = [];
  String(raw || "").split(";").forEach((part) => {
    const eq = part.indexOf("=");
    if (eq <= 0) return;
    const name = part.slice(0, eq).trim();
    let value = part.slice(eq + 1).trim();
    if (!name || !value) return;
    value = value.replace(/^"|"$/g, "");
    out.push({ name, value, domain: ".diy.zheliyin.com", path: "/", expires: -1 });
  });
  return out;
}
(async () => {
  const out = { ts: new Date().toISOString(), url: URL, cookieNames: parseCookies(COOKIE_RAW).map((c) => c.name), tabs: null, afterClick: null, errors: [] };
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"], viewport: { width: 1280, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    const page = browser.pages()[0];
    page.on("pageerror", (e) => out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 150)));
    for (const c of parseCookies(COOKIE_RAW)) { try { await browser.addCookies([c]); } catch (e) {} }
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => out.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
    await SLEEP(4000);
    // 探针①：.page-group 结构 + 各页材料
    const t1 = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const groups = document.querySelectorAll(".page-group");
      const items = [];
      groups.forEach((g) => {
        Array.prototype.forEach.call(g.querySelectorAll("li,a,span,div,b"), (el) => {
          const txt = String(el.textContent || "").trim().slice(0, 12);
          if (!txt) return;
          items.push({ tag: el.tagName, cls: String(el.className || "").slice(0, 40), txt, clickable: typeof el.click === "function" });
        });
      });
      return { href: location.href.slice(0, 100), voReady: !!vo, pagesBefore: vo ? vo.totalCanvasArray.length : null, items: items.slice(0, 30) };
    }).catch((e) => ({ err: String(e && e.message || e).slice(0, 120) }));
    out.tabs = t1;
    // 程序化点击「反面/背面」tab（DOM，非坐标；tab = .page-group .pageNum）
    const clickRes = await page.evaluate(() => {
      const els = document.querySelectorAll(".page-group .pageNum, .page-group li, .page-group a");
      let best = null;
      for (const el of els) { const t = String(el.textContent || "").trim(); if (/反面|背面/.test(t)) { best = el; break; } }
      if (!best) return { ok: false, reason: "no-back-tab" };
      best.click();
      return { ok: true, tag: best.tagName, cls: String(best.className || "").slice(0, 60), txt: String(best.textContent || "").trim().slice(0, 12) };
    }).catch((e) => ({ ok: false, err: String(e && e.message || e).slice(0, 120) }));
    out.click = clickRes;
    await SLEEP(4000);
    // 探针②：切后结构
    const t2 = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      if (!vo) return { ok: false, reason: "no-vo" };
      return {
        ok: true, pagesAfter: vo.totalCanvasArray.length,
        currentCanvasNum: vo.currentCanvasNum != null ? vo.currentCanvasNum : null,
        idNames: vo.totalCanvasArray.map((d) => (d && (d.idName || (d.canvas && d.canvas.idName))) || null),
        frontImg: !!vo.frontImgPathStr, backImg: !!vo.backImgPathStr,
        pageGroupCurrent: (function () { const el = document.querySelector(".page-group.current"); return el ? String(el.textContent || "").trim().slice(0, 12) : null; })()
      };
    }).catch((e) => ({ ok: false, err: String(e && e.message || e).slice(0, 120) }));
    out.afterClick = t2;
  } catch (e) { out.errors.push("PROBE: " + String(e && e.stack || (e && e.message || e)).slice(0, 300)); }
  if (browser) await browser.close().catch(() => {});
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.errors.length ? 1 : 0);
})();