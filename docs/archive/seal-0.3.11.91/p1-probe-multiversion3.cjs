// 第三轮探测：抓 #copyTemplate 模板文案 + 「页面」菜单项 + 页面"母版"提示，定位真正的多版开启入口
"use strict";
const path = require("path");
const { chromium } = require("D:/zheliyin-scriptcat/node_modules/playwright");
const ROOT = "D:/zheliyin-scriptcat";
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const probeMod = require(path.join(ROOT, "runtime", "stage9", "session-probe"));
const URL = process.env.ZY_URL || "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";

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

(async () => {
  const sess = await probeMod.resolveStage9Cookie();
  if (!sess.raw) { console.error("NO_COOKIE"); process.exit(2); }
  const browser = await chromium.launchPersistentContext(PROFILE, {
    channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
    args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR],
    viewport: { width: 1280, height: 900 }
  });
  browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
  const page = browser.pages()[0];
  for (const c of parseCookies(sess.raw)) { try { await browser.addCookies([c]); } catch (e) {} }
  const out = {};
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await SLEEP(7000);

  // 1) #copyTemplate 模板完整文案
  out.copyTemplate = await page.evaluate(() => {
    const el = document.getElementById("copyTemplate");
    return el ? String(el.outerHTML).replace(/\s+/g, " ").slice(0, 1600) : "MISSING";
  }).catch(() => null);

  // 2) 「页面」菜单（.page-suolve）点开后的项
  out.pageMenuBefore = await page.evaluate(() => Array.from(document.querySelectorAll(".page-suolve")).map((e) => String(e.textContent || "").trim().slice(0, 30)));
  out.pageMenuClick = await page.evaluate(() => {
    const el = document.querySelector(".page-suolve");
    if (!el) return { ok: false };
    try { el.click(); return { ok: true }; } catch (e) { return { ok: false, err: String(e && e.message).slice(0, 60) }; }
  }).catch(() => ({ ok: false }));
  await SLEEP(2500);
  out.pageMenuAfter = await page.evaluate(() => {
    const hits = [];
    document.querySelectorAll("a,button,li,span,div,i").forEach((el) => {
      const t = String(el.textContent || "").trim();
      if (!t || t.length > 16) return;
      if (/多版|母版|增加设计|版设计|复制版|新版|增加页面/.test(t) && el.offsetParent) {
        hits.push({ tag: el.tagName, cls: String(el.className || "").slice(0, 50), id: el.id || null, text: t });
      }
    });
    return hits.slice(0, 30);
  }).catch(() => []);

  // 3) 页面含"母版"的所有可见文本
  out.masterTexts = await page.evaluate(() => {
    const hits = [];
    document.querySelectorAll("*").forEach((el) => {
      if (el.children.length) return;
      const t = String(el.textContent || "").trim();
      if (t && /母版/.test(t) && t.length < 60) hits.push({ tag: el.tagName, cls: String(el.className || "").slice(0, 40), text: t });
    });
    return hits.slice(0, 20);
  }).catch(() => []);

  // 4) #copyTemplate 里可能存在的"依据第X版"提示原文
  out.multiDialogHint = await page.evaluate(() => {
    const el = document.querySelector(".pageWrapMulti li .hover-tips a.copy-template");
    if (!el) return null;
    try { el.click(); } catch (e) {}
    return true;
  }).catch(() => null);
  await SLEEP(2000);
  out.dialogRaw = await page.evaluate(() => {
    const lay = document.querySelector(".layui-layer");
    return {
      title: (function () { const t = document.querySelector(".layui-layer-title"); return t ? String(t.textContent || "").trim() : null; })(),
      contentHtml: lay ? String(lay.querySelector(".layui-layer-content") ? lay.querySelector(".layui-layer-content").innerHTML : "").replace(/\s+/g, " ").slice(0, 1200) : null
    };
  }).catch(() => ({}));
  // 关闭弹窗
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll(".layui-layer-btn a")).find((x) => /取消/.test(String(x.textContent || ""))); if (b) b.click(); }).catch(() => {});
  await SLEEP(1500);

  // 5) 产品数据：pageList / templateInfo 概览（若可读）
  out.productData = await page.evaluate(() => {
    try {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const def = (ctx && ctx.defined) || {};
      const PV = def.ProductVO;
      const out2 = {};
      if (PV && PV.pageList) out2.pageListLen = PV.pageList.length;
      if (PV && PV.pageList) out2.pageList = PV.pageList.slice(0, 6).map((p) => ({ len: p && p.content ? (p.content.itemList ? p.content.itemList.length : null) : null, title: p && p.title, pageOrder: p && p.pageOrder, isModified: p && p.isModified, giftBox: p && p.giftBox }));
      if (PV && PV.templateInfo) out2.templateInfoKeys = Object.keys(PV.templateInfo).slice(0, 30);
      const CV = def.CanvasObjVO || window.CanvasObjVO;
      out2.canvasPagesNum = CV ? CV.canvasPagesNum : null;
      out2.canvasPagesArrLen = CV && CV.canvasPagesArr ? CV.canvasPagesArr.length : null;
      out2.canvasObjPagesArrLen = CV && CV.canvasObjPagesArr ? CV.canvasObjPagesArr.length : null;
      return out2;
    } catch (e) { return { error: String(e && e.message).slice(0, 160) }; }
  }).catch((e) => ({ error: String(e && e.message).slice(0, 120) }));

  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error("FATAL " + String(e && e.message || e)); process.exit(1); });