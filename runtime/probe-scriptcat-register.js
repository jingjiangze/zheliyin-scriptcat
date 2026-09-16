// runtime/probe-scriptcat-register.js — hook ScriptCat SW 的 userScripts.register 调用（取证注入是否发生）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const adapter = require("./scriptcat-adapter");

const EXT_ID = adapter.EXT_ID;

(async () => {
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  let browser = null;
  const out = { steps: [], errors: [] };
  const step = (n, ok, d) => { out.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 500) }); if (!ok) out.errors.push(n); };
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-full"), {
      channel: "chromium", headless: true,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${scDir}`, `--load-extension=${scDir}`],
      viewport: { width: 1440, height: 900 }
    });
    // 取 SW
    let sw = null;
    const deadline = Date.now() + 30000;
    while (!sw && Date.now() < deadline) {
      const workers = browser.serviceWorkers();
      sw = workers.find((w) => w.url().includes(EXT_ID)) || null;
      if (!sw) await new Promise((r) => setTimeout(r, 1500));
    }
    step("sw-found", !!sw, sw ? sw.url() : "no SW", "REAL_SCRIPT_CAT_EXTENSION");
    if (!sw) return;

    // hook register 并安装
    const hook = `
      (() => {
        const orig = chrome.userScripts.register;
        self.__rt8_regs = [];
        self.__rt8_done = false;
        chrome.userScripts.register = function(scripts) {
          try {
            const arr = Array.isArray(scripts) ? scripts : [scripts];
            self.__rt8_regs.push(arr.map(s => ({id: s.id, matches: s.matches, world: s.world, jsPreviews: (s.js||[]).map(j => (j.code||j.file||'').slice(0,80))})));
          } catch(e) { self.__rt8_regs.push({hookErr:String(e&&e.message||e)}); }
          return orig.apply(this, arguments);
        };
        self.__rt8_done = true;
      })();`;
    await sw.evaluate(hook).catch((e) => step("hook-fail", false, String(e && e.message || e)));

    // 安装 probe
    const probeCode = `// ==UserScript==\n// @name Zheliyin Runtime 8 Min Probe\n// @namespace https://github.com/jingjiangze/zheliyin-scriptcat\n// @match https://diy.zheliyin.com/*\n// @run-at document-idle\n// ==/UserScript==\nconsole.log('[zy-rt8-min2] executed',location.href);document.documentElement.setAttribute('data-zy-rt8-min2','1');`;
    const page = browser.pages()[0];
    await page.goto("chrome-extension://" + EXT_ID + "/src/options.html#/script/list", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500);
    const installed = await adapter.installByCode(page, { uuid: "runtime8-min2-probe", code: probeCode, upsertBy: "user" }).catch((e) => ({ __err: String(e && e.message || e) }));
    step("install", !installed.__err, "uuid=runtime8-min2-probe" + (installed.__err ? " err=" + installed.__err : ""));

    // 等 SW 处理（register 应在安装后异步触发）
    await page.waitForTimeout(6000);
    step("sw-unavailable", true, "hook finish（若 SW 因服务不可达会 miss）");
    // 读取寄存器
    let regs = [];
    let done = false;
    try {
      const r = await sw.evaluate(() => self.__rt8_regs).catch(() => null);
      if (r) { regs = r; done = true; }
      step("register-hook-read", done, "regs=" + JSON.stringify(regs));
    } catch (e) {
      // SW 可能已重启；用最后一次会话读不到 → 记录
      step("register-hook-read", false, "SW restarted? " + String(e && e.message || e));
    }

    // 失败诊断补充：检查 ScriptCat 内部注册状态（list 页可见 enable toggle）
    await page.goto("chrome-extension://" + EXT_ID + "/src/options.html#/script/list", { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(3000);
    const listBody = await page.evaluate(() => (document.body ? document.body.innerText : "").slice(0, 300));
    step("list-body", true, listBody.replace(/\s+/g, " ").slice(0, 200));
  } catch (e) { step("fatal", false, String(e && e.message || e)); }
  finally { if (browser) await browser.close().catch(() => {}); }
  fs.writeFileSync(path.join(__dirname, "reports", "scriptcat-register-report.json"), JSON.stringify(out, null, 1), "utf8");
  console.log(JSON.stringify(out, null, 1));
})();