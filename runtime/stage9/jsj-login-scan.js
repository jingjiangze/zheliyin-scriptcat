// runtime/stage9/jsj-login-scan.js — Stage 9 P0-3F：jsj 用户中心登录后 OCR 入口枚举
// 流程：打开真实浏览器窗口 jsj/index.do → 若未登录，等待用户手动完成登录（滑块由人操作，
//       脚本只轮询状态）→ 登录后枚举全部菜单/链接找 文字识别/OCR 入口 → 输出 URL。
// 纯工具（evidence），不升版、不改生产。
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
  const out = { ts: new Date().toISOString(), stage: "STAGE-9-P0F-JSJ-LOGIN", branch: "stage-9-altq-baidu-reconstruction", url: URL, errors: [] };
  let browser = null, page = null;
  const ev = (fn, arg) => (arg === undefined ? page.evaluate(fn) : page.evaluate(fn, arg)).catch((e) => ({ err: String(e || "").slice(0, 200) }));
  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1440, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    page = browser.pages()[0];
    page.on("pageerror", (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 300)); });
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => out.errors.push("goto:" + String(e && e.message || e).slice(0, 160)));
    await SLEEP(6000);
    // 轮询登录态（用户可能在窗口中手动完成滑块验证；脚本只轮询，不做任何鼠标/坐标自动化）
    const isLoggedIn = () => ev(() => ({
      hasLoginBtn: !!Array.from(document.querySelectorAll("a,button,span,div")).find((el) => { if (!el.offsetParent) return false; const t = String(el.textContent || "").trim(); return t === "登录" && String(el.className || "").indexOf("login") >= 0; }),
      headText: (document.body ? document.body.innerText : "").slice(0, 120)
    }));
    let first = await isLoggedIn();
    out.loginInitially = first;
    const t0 = Date.now();
    let loggedIn = !first.hasLoginBtn;
    while (!loggedIn && Date.now() - t0 < 240000) {
      const s = await isLoggedIn();
      if (!s.hasLoginBtn) { loggedIn = true; break; }
      await SLEEP(6000);
    }
    out.loginResolved = loggedIn;
    out.loginWaitMs = Date.now() - t0;
    await SLEEP(5000);
    // 登录后完整枚举
    out.menuAfterLogin = await ev(() => {
      const links = Array.from(document.querySelectorAll("a[href]"));
      const outRows = [];
      for (const a of links) { const t = String(a.textContent || "").trim(); const h = a.getAttribute("href") || ""; if (t && t.length < 24 && (t || h)) outRows.push({ text: t, href: h.slice(0, 180) }); }
      const menuLike = outRows.filter((r) => /工具|中心|管理|订单|模板|设置|识别|OCR|文字/i.test(r.text)).slice(0, 80);
      const bodyHead = (document.body ? document.body.innerText : "").replace(/\n{2,}/g, "\n").slice(0, 1600);
      return { bodyHead: bodyHead, ocrLinks: outRows.filter((r) => /ocr|识别|文字/i.test(r.text + r.href)).slice(0, 40), toolLinks: menuLike };
    });
  } catch (e) { out.errors.push(String(e && e.message || e).slice(0, 400)); }
  finally { try { page && await page.close(); } catch (e) {} try { browser && await browser.close(); } catch (e) {} }
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, "jsj-login-scan.json"), JSON.stringify(out, null, 2));
  console.log("STAGE-9 P0F jsj-login-scan done -> " + path.join(REPORT_DIR, "jsj-login-scan.json"));
})();