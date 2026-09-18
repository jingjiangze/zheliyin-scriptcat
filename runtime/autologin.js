// runtime/autologin.js — 登录专用浏览器（凭据只经环境变量，不写文件、不入库）
// 用法：
//   $env:ZY_USER="[REDACTED_USER]"; $env:ZY_PASS="..."; node runtime/autologin.js --expect-editor [--headed]
// 完成后打印 AUTH 结果。退出码 0 = 编辑态就绪。
"use strict";
const path = require("path");
const { launchDedicated, healthCheck, redactText } = require("./browser-launcher");

(async () => {
  const user = process.env.ZY_USER || "";
  const pass = process.env.ZY_PASS || "";
  if (!user || !pass) { console.log(JSON.stringify({ error: "ZY_USER/ZY_PASS required" }, null, 1)); process.exit(2); }

  const expectEditor = process.argv.includes("--expect-editor");
  const profileDir = path.join(__dirname, "browser", "profile-full");
  const manifestDir = path.join(__dirname, "..", "extension");
  const out = { ts: new Date().toISOString(), steps: [], errors: [] };
  function step(name, ok, detail) { out.steps.push({ name, ok: ok ? "PASS" : "FAIL", detail: redactText(detail) }); if (!ok) out.errors.push(name); }

  let browser = null;
  try {
    const launched = await launchDedicated({ profileDir, headless: false, loadExtensionDir: manifestDir });
    browser = launched.browser;
    const page = browser.pages()[0];

    // 1) 先访问门户登录页（未登录时编辑器 URL 直连会 404/重定向）
    await page.goto("https://diy.zheliyin.com/diyWeb/", { waitUntil: "domcontentloaded", timeout: 40000 }).catch((e) => step("navigation", false, String(e && e.message || e)));
    step("navigation", true, "https://diy.zheliyin.com/diyWeb/");
    await page.waitForTimeout(3000);

    const hasForm = await page.evaluate(() => !!document.getElementById("userAccount"));
    if (hasForm) {
      // 可能藏在未激活 tab 内：先激活「登录」入口（a/button 文本含"登录"）
      await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll("a, button, li, span"));
        const login = els.find((el) => {
          const t = (el.textContent || "").trim();
          return t === "登录" && el.offsetParent !== null;
        });
        if (login) login.click();
      }).catch(() => {});
      await page.waitForTimeout(1200);
      // 用 JS 直接赋值（绕过可见性/加密前置结构），再触发页面登录按钮
      await page.evaluate(({ u, p }) => {
        const acc = document.getElementById("userAccount");
        const pwd = document.getElementById("userPassword");
        if (acc) {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
          setter.call(acc, u);
          acc.dispatchEvent(new Event("input", { bubbles: true }));
          acc.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (pwd) {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
          setter.call(pwd, p);
          pwd.dispatchEvent(new Event("input", { bubbles: true }));
          pwd.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }, { u: user, p: pass });
      await page.waitForTimeout(500);
      const loginDone = await page.evaluate(() => {
        const btn = document.getElementById("loginBtn");
        if (btn && typeof btn.click === "function") { btn.click(); return true; }
        // 兜底点可见的登录按钮
        const els = Array.from(document.querySelectorAll("a, button"));
        const b = els.find((el) => (el.textContent || "").trim() === "登录" && el.offsetParent !== null);
        if (b) { b.click(); return true; }
        return false;
      });
      if (!loginDone) console.log("[autologin] no login button found/clickable");
      await page.waitForTimeout(10000);
    }

    // 3) 尝试进入编辑器 URL
    const editorUrl = expectEditor
      ? "https://diy.zheliyin.com/diyWeb/third/20408603/1/thirdLoginDiyEdit.do"
      : "https://diy.zheliyin.com/diyWeb/";
    await page.goto(editorUrl, { waitUntil: "domcontentloaded", timeout: 40000 }).catch((e) => step("goto-editor", false, String(e && e.message || e)));
    step("goto-editor", true, redactText(editorUrl));

    // 4) 等编辑态
    const loginOk = await (async () => {
      const deadline = Date.now() + 120000;
      while (Date.now() < deadline) {
        const h = await healthCheck(page);
        if (h.requirejs === true && h.fabric === true) return true;
        if (Date.now() % 9000 < 3000) console.log("[autologin] waiting editor-ready… url=" + redactText(h.url));
        await new Promise((r) => setTimeout(r, 3000));
      }
      return false;
    })();
    if (loginOk) {
      step("auth", true, "自动登录成功，编辑态就绪");
    } else {
      const h = await healthCheck(page);
      step("auth", false, "未达编辑态 url=" + redactText(h.url) + " req=" + h.requirejs + " fab=" + h.fabric + "（可能需短信/图形验证，或项目 id 失效）");
    }
  } catch (e) {
    step("fatal", false, String(e && e.message || e));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  console.log(JSON.stringify(out, null, 1));
  process.exitCode = out.errors.length ? 1 : 0;
})();