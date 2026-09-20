// runtime/stage9/ocrtool-discovery.js — Stage 9 P0-3B：OCRTool.do 站内 OCR 工具页取证
// ---------------------------------------------------------------------
// 目的（用户线索 2026-09-20）：
//   https://diy.zheliyin.com/siteWeb/userCenterJsj/OCRTool.do 也能提供文字提取。
// 取证内容：
//   1. 页面功能：上传控件/识别按钮/结果区结构
//   2. 网络协议：识别接口 URL / POST 参数 / 响应结构（文字+bbox?）
//   3. 结果展示：DOM 文本/坐标（是否原生给出 layout evidence）
//   4. 该页 Alt+Q 是否有效（真实 keyboard.press）
//   5. 上传真实名片（real-card-shengying.png）做一次真识别取证
// 纯工具（evidence），不升版、不改生产。
// 用法：node runtime/stage9/ocrtool-discovery.js
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
const URL = "https://diy.zheliyin.com/siteWeb/userCenterJsj/OCRTool.do";
const CARD = path.join(ROOT, "runtime", "stage8b", "assets", "real-card-shengying.png");

(async () => {
  const out = { ts: new Date().toISOString(), stage: "STAGE-9-P0B-OCRTOOL", branch: "stage-9-altq-baidu-reconstruction", url: URL, net: [], console: [], errors: [] };
  let browser = null, page = null;
  const ev = (fn, arg) => (arg === undefined ? page.evaluate(fn) : page.evaluate(fn, arg)).catch((e) => ({ err: String(e || "").slice(0, 200) }));
  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1440, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    page = browser.pages()[0];
    page.on("console", (m) => { const t = m.text(); out.console.push(t.slice(0, 300)); if (out.console.length > 100) out.console = out.console.slice(-100); });
    page.on("pageerror", (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 300)); });
    page.on("request", (r) => {
      const u = r.url();
      if (u.indexOf("diy.zheliyin.com") < 0 && u.indexOf("baidu") < 0) return;
      const pd = (r.postData() || "");
      out.net.push({ dir: "req", method: r.method(), url: u.slice(0, 220), post: pd.slice(0, 300), contentType: (r.headers()["content-type"] || "").slice(0, 60) });
      if (out.net.length > 250) out.net = out.net.slice(-250);
    });
    page.on("response", async (r) => {
      const u = r.url();
      if (u.indexOf("diy.zheliyin.com") < 0 && u.indexOf("baidu") < 0) return;
      const ct = (r.headers()["content-type"] || "");
      let body = null;
      if (/application\/json|text\/plain|text\/html/.test(ct)) { try { body = (await r.text()).slice(0, 4000); } catch (e) { body = "[read-fail]"; } }
      out.net.push({ dir: "res", status: r.status(), url: u.slice(0, 220), ct: ct.slice(0, 60), body: body });
      if (out.net.length > 250) out.net = out.net.slice(-250);
    });
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => out.errors.push("goto: " + String(e && e.message || e).slice(0, 200)));
    await SLEEP(4000);
    // 页面结构取证
    out.pageInfo = await ev(() => ({
      title: document.title, ready: document.readyState,
      bodyTextFileted: (document.body ? document.body.innerText : "").replace(/\n{2,}/g, "\n").slice(0, 1200),
      fileInputs: Array.from(document.querySelectorAll("input[type=file]")).map((el) => ({ name: el.name || el.id || null, accept: el.accept || null, hidden: el.offsetParent === null })),
      buttons: Array.from(document.querySelectorAll("button, a, span, div")).filter((el) => { const t = String(el.textContent || "").trim(); return /识别|提取|上传|转换|开始|确定/i.test(t) && t.length < 20 && el.offsetParent !== null; }).slice(0, 15).map((el) => ({ tag: el.tagName, text: String(el.textContent || "").trim().slice(0, 16), cls: String(el.className || "").slice(0, 60) })),
      iframes: Array.from(document.querySelectorAll("iframe")).map((f) => f.src).slice(0, 5),
      altqBox: { have: false }
    }));
    // 该页 Alt+Q 行为（真实 key）
    await page.bringToFront();
    await ev(() => { try { document.body.focus(); } catch (e) {} return { ok: true }; });
    await page.keyboard.press("Alt+Q");
    await SLEEP(2500);
    out.altqOnPage = await ev(() => ({ active: (document.activeElement && (document.activeElement.tagName)) || null, bodyHead: document.body ? document.body.innerText.slice(0, 260) : null }));
    // 上传真实名片
    const inputs = await ev(() => Array.from(document.querySelectorAll("input[type=file]")).map((el) => ({ name: el.name || el.id || "", idx: (function () { const all = document.querySelectorAll("input[type=file]"); for (let i = 0; i < all.length; i += 1) if (all[i] === el) return i; return -1; })() })));
    out.fileInputsFinal = inputs;
    if (fs.existsSync(CARD) && inputs.length) {
      try { await page.setInputFiles("input[type=file]", CARD); out.uploaded = true; } catch (e) { out.uploaded = String(e && e.message || e).slice(0, 120); }
      await SLEEP(4000);
      // 找并点击"识别/提取"类按钮
      const clicked = await ev(() => {
        const els = Array.from(document.querySelectorAll("button, a, span, div"));
        const t = els.find((el) => { if (!el.offsetParent) return false; const s = String(el.textContent || "").trim(); return /^识别|^提取|^开始|^确定|^OCR/.test(s) && s.length <= 10; });
        if (t) { try { t.click(); } catch (e) { return { clicked: false }; } return { clicked: true, text: String(t.textContent || "").trim().slice(0, 16) }; }
        return { clicked: false };
      });
      out.recognizeClicked = clicked;
      await SLEEP(5000);
      out.resultAfterRecognize = await ev(() => {
        const b = document.body ? document.body.innerText : "";
        // 结果区候选：包含坐标/文字关键词的文本片段
        const lines = b.split("\n").map((x) => x.trim()).filter(Boolean).slice(-120);
        const ocrish = lines.filter((l) => /^[\w\u4e00-\u9fff@.\-+：: ]+[\t ]/i.test(l)).length;
        return { bodyTail: lines.slice(-40).join(" | ").slice(0, 2500), ocrLineLike: ocrish, tables: document.querySelectorAll("table").length };
      });
    } else {
      out.uploadSkipped = (!fs.existsSync(CARD) ? "no-card" : "no-file-input");
    }
  } catch (e) { out.errors.push(String(e && e.message || e).slice(0, 400)); }
  finally { try { page && await page.close(); } catch (e) {} try { browser && await browser.close(); } catch (e) {} }
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, "ocrtool-discovery.json"), JSON.stringify(out, null, 2));
  console.log("STAGE-9 P0B ocrtool-discovery done -> " + path.join(REPORT_DIR, "ocrtool-discovery.json"));
})();