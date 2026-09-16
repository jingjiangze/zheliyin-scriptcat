// runtime/verify-min-user-script.js — RUNTIME-8.3 §六/§七：注册最小 userscript 并验证真实执行
// 注册一个只在 html 上打 data-zy-runtime8-user-script 标记的脚本，打开真实编辑器，检查 dataset。
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const adapter = require("./scriptcat-adapter");

const EXT_ID = adapter.EXT_ID;
const MIN_UUID = "rt8-min-exec-uuid";

(async () => {
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  const report = { ts: new Date().toISOString(), steps: [], errors: [] };
  const step = (n, ok, d, ev) => { report.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 500), evidence: ev || "n/a" }); if (!ok) report.errors.push(n); };
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${scDir}`, `--load-extension=${scDir}`],
      viewport: { width: 1440, height: 900 }
    });
    const page = browser.pages()[0];

    // 1) capability 确认
    await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(2500);
    const cap = await page.evaluate(() => {
      const out = { userScriptsType: typeof chrome.userScripts, registerFn: !!(typeof chrome.userScripts !== "undefined" && chrome.userScripts.register), ua: navigator.userAgent.slice(0, 60) };
      return out;
    });
    step("userScripts-capability", cap.userScriptsType === "object" && cap.registerFn, JSON.stringify(cap), "API_SUPPORTED_AND_ENABLED");

    // 2) 配置最小 userscript（经 ScriptCat install）
    const MIN_CODE = [
      "// ==UserScript==",
      "// @name Zheliyin RT8 Min Exec",
      "// @namespace https://github.com/jingjiangze/zheliyin-scriptcat",
      "// @match https://diy.zheliyin.com/*",
      "// @run-at document-idle",
      "// ==/UserScript==",
      "document.documentElement.setAttribute('data-zy-runtime8-user-script','1');"
    ].join("\n");
    const inst = await adapter.installByCode(page, { uuid: MIN_UUID, code: MIN_CODE, upsertBy: "user" }).catch((e) => ({ __err: String(e && e.message || e) }));
    step("install-min", !inst.__err, inst.__err ? inst.__err : "uuid=" + MIN_UUID + " status=" + inst.status, "REAL_SCRIPT_CAT_INSTALL");

    // 3) 打开真实编辑器，等待并检查 dataset
    const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => step("nav", false, String(e && e.message || e)));
    step("nav", true, redactUrl(page.url()));
    // 等待编辑器 + data mark
    let marked = false;
    let h = null;
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
      h = await page.evaluate(() => ({
        req: !!(window.requirejs || window.require), fab: !!window.fabric,
        mark: document.documentElement.getAttribute("data-zy-runtime8-user-script")
      })).catch(() => null);
      if (h && h.mark === "1") { marked = true; break; }
      if (h && h.req && h.fab && !marked) {
        // 编辑器就绪但还没 mark —— 再等等 userscript 注入
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    step("min-exec-mark", marked, JSON.stringify(h), marked ? "REAL_SCRIPT_CAT_USER_SCRIPT_EXECUTION" : "REAL_EDITOR+REAL_CANVAS");
  } catch (e) { step("fatal", false, String(e && e.stack || e)); }
  finally { if (browser) await browser.close().catch(() => {}); }
  fs.writeFileSync(path.join(__dirname, "reports", "verify-min-user-script-report.json"), JSON.stringify(report, null, 1), "utf8");
  console.log(JSON.stringify(report, null, 1));
  process.exit(report.errors.length ? 1 : 0);

  function redactUrl(u) { try { return u.replace(/([?&](?:token|key|secret|sign|session)=)[^&#]*/gi, "$1***").slice(0, 150); } catch (e) { return String(u).slice(0, 150); } }
})();