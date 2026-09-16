// runtime/probe-scriptcat-deep.js — 深入诊断：installByCode 返回完整对象 + getAllScripts 全量 dump（只读验证，装后保留供检查）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const adapter = require("./scriptcat-adapter");

const EXT_ID = adapter.EXT_ID;
const PROBE_UUID = "runtime8-probe-schema-uuid";
const PROBE_NAME = "Zheliyin Runtime 8 Probe";

(async () => {
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  let browser = null;
  const out = { steps: [], errors: [] };
  const step = (n, ok, d) => { out.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 800) }); if (!ok) out.errors.push(n); };
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-full"), {
      channel: "chromium", headless: true,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${scDir}`, `--load-extension=${scDir}`],
      viewport: { width: 1440, height: 900 }
    });
    const page = browser.pages()[0];
    await page.goto("chrome-extension://" + EXT_ID + "/src/options.html#/script/list", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(4000);

    // 完整 probe code（含 namespace）
    const fixture = fs.readFileSync(path.join(__dirname, "fixtures", "runtime8-scriptcat-probe.user.js"), "utf8");
    const bridgeSrc = fs.readFileSync(path.join(__dirname, "..", "extension", "src", "editor", "page-bridge.js"), "utf8").replace(/^function\s+pageBridge\s*\(/i, "function pageBridge(");
    // 最小 probe：不依赖 GM_addElement，仅 console + DOM mark，验证 ScriptCat 注入链路本身
    const MIN_CODE = [
      "// ==UserScript==",
      "// @name Zheliyin Runtime 8 Min Probe",
      "// @namespace https://github.com/jingjiangze/zheliyin-scriptcat",
      "// @match https://diy.zheliyin.com/*",
      "// @run-at document-idle",
      "// ==/UserScript==",
      "console.log('[zy-rt8-min] executed', location.href);",
      "try { document.documentElement.setAttribute('data-zy-rt8-min','1'); } catch (e) {}"
    ].join("\n");
    const MIN_NAME = "Zheliyin Runtime 8 Min Probe";
    const MIN_UUID = "runtime8-min-probe-uuid";

    // installByCode：最小 probe（无 GM_addElement，验证注入链路）
    const installed = await adapter.installByCode(page, { uuid: MIN_UUID, code: MIN_CODE, upsertBy: "user" }).catch((e) => ({ __err: String(e && e.message || e) }));
    step("install-return", !installed.__err, "return=" + JSON.stringify(installed).slice(0, 700));

    // 列表页等一会 + 导航到编辑器 URL（验证注入）
    await page.waitForTimeout(3000);
    const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(10000);
    const h = await (async () => {
      const deadline = Date.now() + 60000;
      let hp = null;
      while (Date.now() < deadline) {
        hp = await page.evaluate(() => ({ req: !!(window.requirejs || window.require), fab: !!window.fabric })).catch(() => null);
        if (hp && hp.req && hp.fab) break;
        await new Promise((r) => setTimeout(r, 3000));
      }
      return hp;
    })();
    step("editor-health", !!(h && h.req && h.fab), JSON.stringify(h));
    // 检查 DOM mark（userscript 注入证据）
    const marks = await page.evaluate(() => {
      const el = document.documentElement;
      const attrs = Array.prototype.slice.call(el.attributes).map((a) => a.name).filter((n) => n.indexOf("data-zy-rt8") >= 0);
      return attrs;
    }).catch(() => null);
    step("min-probe-dom-mark", !!(marks && marks.length > 0), "marks=" + JSON.stringify(marks));
  } catch (e) { step("fatal", false, String(e && e.stack || e)); }
  finally { if (browser) await browser.close().catch(() => {}); }
  fs.writeFileSync(path.join(__dirname, "reports", "scriptcat-deep-report.json"), JSON.stringify(out, null, 1), "utf8");
  console.log(JSON.stringify(out, null, 1));
})();