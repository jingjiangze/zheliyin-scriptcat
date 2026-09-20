// runtime/stage9/ocrtool-discovery3.js — Stage 9 P0-3E：jsj 登录态菜单完整枚举（找文字识别/OCR 入口）
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
const URL = "https://diy.zheliyin.com/siteWeb/jsj/index.do";
(async () => {
  const out = { ts: new Date().toISOString(), stage: "STAGE-9-P0E-JSJ-MENU", branch: "stage-9-altq-baidu-reconstruction", url: URL, errors: [] };
  let browser = null, page = null;
  const ev = (fn, arg) => (arg === undefined ? page.evaluate(fn) : page.evaluate(fn, arg)).catch((e) => ({ err: String(e || "").slice(0, 200) }));
  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1440, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    page = browser.pages()[0];
    page.on("pageerror", (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 300)); });
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => out.errors.push("goto:" + String(e && e.message || e).slice(0, 160)));
    await SLEEP(10000);
    out.loginState = await ev(() => ({ hasLoginBtn: !!Array.from(document.querySelectorAll("a,button,span,div")).find((el) => { if (!el.offsetParent) return false; return String(el.textContent || "").trim() === "登录" && String(el.className || "").indexOf("login") >= 0; }), body: document.body ? document.body.innerText.replace(/\n{2,}/g, "\n").slice(0, 400) : "" }));
    out.links = await ev(() => {
      const all = Array.from(document.querySelectorAll("a[href]"));
      const rows = [];
      for (const a of all) { const t = String(a.textContent || "").trim(); const h = a.getAttribute("href") || ""; if (/ocr|识别|文字|extract|Recognize/i.test(t) || /ocr|recogn/i.test(h)) rows.push({ text: t.slice(0, 30), href: h.slice(0, 160), display: a.offsetParent !== null }); }
      return rows.slice(0, 60);
    });
    out.menuText = await ev(() => {
      // 工具分组区域文本（找含 "识别/OCR" 的整行）
      const lines = (document.body ? document.body.innerText : "").split("\n").map((x) => x.trim()).filter(Boolean);
      return lines.filter((l) => /识别|OCR|文字/i.test(l)).slice(0, 30);
    });
    out.allLinkTexts = await ev(() => Array.from(document.querySelectorAll("a[href]")).map((a) => String(a.textContent || "").trim()).filter((t) => t && t.length < 20).slice(0, 120));
  } catch (e) { out.errors.push(String(e && e.message || e).slice(0, 400)); }
  finally { try { page && await page.close(); } catch (e) {} try { browser && await browser.close(); } catch (e) {} }
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, "ocrtool-discovery3.json"), JSON.stringify(out, null, 2));
  console.log("STAGE-9 P0E jsj-menu done -> " + path.join(REPORT_DIR, "ocrtool-discovery3.json"));
})();