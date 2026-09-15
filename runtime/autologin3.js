// runtime/autologin3.js — 打开登录弹窗（翻转 mask display）+ 填表 + 提交（凭据仅 env）
"use strict";
const path = require("path");
const { launchDedicated, healthCheck, redactText } = require("./browser-launcher");

(async () => {
  const user = process.env.ZY_USER || ""; const pass = process.env.ZY_PASS || "";
  if (!user || !pass) { console.log(JSON.stringify({ error: "ZY_USER/ZY_PASS required" }, null, 1)); process.exit(2); }
  const profileDir = path.join(__dirname, "browser", "profile-full");
  const manifestDir = path.join(__dirname, "..", "extension");
  let browser = null;
  const out = { steps: [], errors: [] };
  const step = (n, ok, d) => { out.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: redactText(d) }); if (!ok) out.errors.push(n); };
  try {
    const launched = await launchDedicated({ profileDir, headless: false, loadExtensionDir: manifestDir, forcePlaywrightChromium: true });
    browser = launched.browser;
    const page = browser.pages()[0];
    await page.goto("https://diy.zheliyin.com/diyWeb/", { waitUntil: "domcontentloaded", timeout: 40000 }).catch((e) => step("nav", false, String(e && e.message || e)));
    step("nav", true, "portal");
    await page.waitForTimeout(4000);

    // 打开登录弹窗：找 class 含 zLoginIn 的开关元素；否则直接翻转 mask-bg zLoginOut display:none→block
    await page.evaluate(() => {
      const opener = document.querySelector("[class*='zLoginIn']");
      if (opener && opener.offsetParent !== null) { opener.click(); return; }
      const masks = Array.from(document.querySelectorAll(".mask-bg.zLoginOut, .zLoginOut"));
      masks.forEach((m) => { m.style.display = "block"; });
      const tan = document.querySelector(".zLoginTan");
      if (tan) tan.style.display = "block";
    });
    await page.waitForTimeout(1500);

    const visible = await page.evaluate(() => {
      const vis = (id) => { const el = document.getElementById(id); return el ? { display: getComputedStyle(el).display, off: el.offsetParent !== null } : null; };
      return { acc: vis("userAccount"), pwd: vis("userPassword") };
    });
    step("login-panel-open", !!(visible.acc && visible.off), JSON.stringify(visible));

    if (visible.acc && visible.off) {
      await page.fill("#userAccount", user);
      await page.fill("#userPassword", pass);
      await page.waitForTimeout(500);
      // 找弹窗内可见提交按钮
      const clicked = await page.evaluate(() => {
        const ids = ["accountLogin", "loginBtn"];
        const visibleEl = Array.from(document.querySelectorAll("input,button,a")).find((el) => {
          const t = (el.textContent || "").trim();
          return el.offsetParent !== null && (t === "登录" || el.id === "loginBtn" || el.id === "accountLogin");
        });
        if (visibleEl) { visibleEl.click(); return visibleEl.id || visibleEl.tagName; }
        return null;
      });
      step("click-login", !!clicked, "clicked=" + clicked);
      await page.waitForTimeout(15000);
    } else {
      step("click-login", false, "面板未展开（尝试直接翻转失败）");
    }

    // 等编辑态（登录后 go 编辑器 URL）
    await page.goto("https://diy.zheliyin.com/diyWeb/third/20408603/1/thirdLoginDiyEdit.do", { waitUntil: "domcontentloaded", timeout: 40000 }).catch((e) => step("goto-editor", false, String(e && e.message || e)));
    step("goto-editor", true, "editor-url");
    const ok = await (async () => {
      const deadline = Date.now() + 120000;
      while (Date.now() < deadline) {
        const h = await healthCheck(page);
        if (h.requirejs === true && h.fabric === true) return true;
        await new Promise((r) => setTimeout(r, 3000));
      }
      return false;
    })();
    if (ok) step("auth", true, "登录成功，编辑态就绪");
    else { const h = await healthCheck(page); step("auth", false, "url=" + redactText(h.url) + " fab=" + h.fabric + " req=" + h.requirejs); }
  } catch (e) { step("fatal", false, String(e && e.message || e)); }
  finally { if (browser) await browser.close().catch(() => {}); }
  console.log(JSON.stringify(out, null, 1));
  process.exitCode = out.errors.length ? 1 : 0;
})();