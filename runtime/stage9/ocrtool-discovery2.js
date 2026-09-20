// runtime/stage9/ocrtool-discovery2.js — Stage 9 P0-3C：jsj 用户中心内 OCR 工具入口定位 + 上传取证
// 流程：jsj/index.do（Vue 渲染）→ 找 OCR/识别/文字入口 → 进入工具页 → 上传真实名片 → 抓接口协议/结果
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("../../node_modules/playwright");
const adapter = require("../scriptcat-adapter");
const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const EXT_ID = adapter.EXT_ID;
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-9");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const CARD = path.join(ROOT, "runtime", "stage8b", "assets", "real-card-shengying.png");

(async () => {
  const out = { ts: new Date().toISOString(), stage: "STAGE-9-P0C-JSJ", branch: "stage-9-altq-baidu-reconstruction", net: [], console: [], pages: [], errors: [] };
  let browser = null, page = null;
  const ev = (fn, arg) => (arg === undefined ? page.evaluate(fn) : page.evaluate(fn, arg)).catch((e) => ({ err: String(e || "").slice(0, 200) }));
  const reqAdd = (page) => page.on("request", (r) => {
    const u = r.url();
    if (u.indexOf("diy.zheliyin.com") < 0 && u.indexOf("baidu") < 0) return;
    const pd = (r.postData() || "");
    out.net.push({ dir: "req", method: r.method(), url: u.slice(0, 240), post: pd.slice(0, 400) });
    if (out.net.length > 400) out.net = out.net.slice(-400);
  });
  const resAdd = (page) => page.on("response", async (r) => {
    const u = r.url();
    if (u.indexOf("diy.zheliyin.com") < 0 && u.indexOf("baidu") < 0) return;
    const ct = (r.headers()["content-type"] || "");
    let body = null;
    if (/json|text/.test(ct)) { try { body = (await r.text()).slice(0, 6000); } catch (e) { body = "[read-fail]"; } }
    out.net.push({ dir: "res", status: r.status(), url: u.slice(0, 240), ct: ct.slice(0, 60), body: body });
    if (out.net.length > 400) out.net = out.net.slice(-400);
  });
  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1440, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    page = browser.pages()[0];
    page.on("console", (m) => { out.console.push(m.text().slice(0, 300)); if (out.console.length > 150) out.console = out.console.slice(-150); });
    page.on("pageerror", (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 300)); });
    reqAdd(page); resAdd(page);
    page.on("popup", async (p) => {
      out.pages.push({ popup: (p.url() || "").slice(0, 200) });
      reqAdd(p); resAdd(p);
      try { await p.waitForLoadState("domcontentloaded", { timeout: 20000 }); } catch (e) {}
    });
    await page.goto("https://diy.zheliyin.com/siteWeb/jsj/index.do", { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => out.errors.push("goto: " + String(e && e.message || e).slice(0, 200)));
    await SLEEP(7000);
    out.homeText = await ev(() => (document.body ? document.body.innerText.replace(/\n{2,}/g, "\n").slice(0, 1800) : ""));
    out.homeLinks = await ev(() => Array.from(document.querySelectorAll("a[href], li, span, div")).filter((el) => { const t = String(el.textContent || "").trim(); return /ocr|识别|文字提取|图片文字|提取/i.test(t) && t.length < 24 && el.offsetParent !== null; }).slice(0, 20).map((el) => ({ tag: el.tagName, text: String(el.textContent || "").trim().slice(0, 20), href: (el.getAttribute && el.getAttribute("href")) || null, cls: String(el.className || "").slice(0, 60) })));
    // 点击候选 OCR 入口（若存在）
    const clicked = await ev(() => {
      const els = Array.from(document.querySelectorAll("a, li, span, div, button"));
      const hit = els.find((el) => { if (!el.offsetParent) return false; const t = String(el.textContent || "").trim(); return /^{?\s*(OCR|识别|文字提取|图片文字)\s*}?$/i.test(t) && t.length <= 12 && t.length >= 2; });
      if (!hit) return { clicked: false };
      try { const a = hit.tagName === "A" ? hit : hit.querySelector("a") || hit; a.click(); return { clicked: true, text: String(hit.textContent || "").trim(), href: (a.getAttribute && a.getAttribute("href")) || null }; } catch (e) { return { clicked: false, err: String(e && e.message || e).slice(0, 100) }; }
    });
    out.ocrEntryClicked = clicked;
    await SLEEP(6000);
    const pages2 = browser.pages();
    out.openPages = pages2.map((p) => p.url().slice(0, 220));
    // 在最后打开的页面上找文件上传与识别
    let target = pages2[pages2.length - 1];
    if (target === page) target = pages2.find((p) => p.url().indexOf("OCR") >= 0 || p.url().indexOf("ocr") >= 0) || target;
    const tEv = (fn, arg) => (arg === undefined ? target.evaluate(fn) : target.evaluate(fn, arg)).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    out.toolPage = { title: await tEv(() => document.title), url: target.url().slice(0, 220), fileInputs: await tEv(() => Array.from(document.querySelectorAll("input[type=file]")).map((el) => ({ name: el.name || el.id || "", accept: el.accept || null }))), txt: await tEv(() => (document.body ? document.body.innerText.replace(/\n{2,}/g, "\n").slice(0, 1500) : "")) };
    if (fs.existsSync(CARD) && (out.toolPage.fileInputs || []).length) {
      try { await target.setInputFiles("input[type=file]", CARD); out.uploaded = true; } catch (e) { out.uploaded = String(e && e.message || e).slice(0, 140); }
      await SLEEP(4000);
      const rc = await tEv(() => {
        const els = Array.from(document.querySelectorAll("button, a, span, div"));
        const hit = els.find((el) => { if (!el.offsetParent) return false; const s = String(el.textContent || "").trim(); return /^(识别|提取|开始|确定|OCR)$/.test(s); });
        if (hit) { try { hit.click(); } catch (e) { return { clicked: false }; } return { clicked: true, text: String(hit.textContent || "").trim() }; }
        return { clicked: false };
      });
      out.recognizeClicked = rc;
      await SLEEP(7000);
      out.resultTxt = await tEv(() => {
        const b = document.body ? document.body.innerText : "";
        const lines = b.split("\n").map((x) => x.trim()).filter(Boolean);
        const tail = lines.slice(-60).join(" | ");
        return { tail: tail.slice(0, 3500), tables: document.querySelectorAll("table").length };
      });
    } else {
      out.uploadSkipped = (!fs.existsSync(CARD) ? "no-card" : ("no-file-input:" + (out.toolPage.fileInputs || []).length));
    }
  } catch (e) { out.errors.push(String(e && e.message || e).slice(0, 400)); }
  finally { try { page && await page.close(); } catch (e) {} try { browser && await browser.close(); } catch (e) {} }
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, "ocrtool-discovery2.json"), JSON.stringify(out, null, 2));
  console.log("STAGE-9 P0C jsj discovery done -> " + path.join(REPORT_DIR, "ocrtool-discovery2.json"));
})();