// runtime/probe-gm-api.js — 探测 ScriptCat 扩展 GM 值读写 API 与存储 key 全集
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const adapter = require("./scriptcat-adapter");
const EXT_ID = adapter.EXT_ID;
const USERSCRIPT_PATH = path.join(__dirname, "..", "zheliyin-card-assistant.user.js");

(async () => {
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  const out = { ts: new Date().toISOString(), steps: [] };
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${scDir}`, `--load-extension=${scDir}`],
      viewport: { width: 1440, height: 900 }
    });
    const optsPage = browser.pages()[0];
    await optsPage.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await optsPage.waitForTimeout(2500);
    const src = fs.readFileSync(USERSCRIPT_PATH, "utf8");
    const uuid = "rt-api-" + Date.now().toString(36);
    const inst = await adapter.installByCode(optsPage, { uuid: uuid, code: src, upsertBy: "user" }).catch((e) => ({ __err: String(e.message || e) }));
    out.steps.push({ name: "install", ok: !inst.__err, detail: inst.__err || JSON.stringify(inst) });

    // 1) 全部 storage key
    const allKeys = await optsPage.evaluate(async () => {
      const all = await chrome.storage.local.get(null);
      return Object.keys(all);
    });
    out.steps.push({ name: "all-storage-keys", ok: true, detail: JSON.stringify(allKeys) });

    // 2) 候选 GM 值方法探测（serviceWorker/script/*）
    const candidates = ["GM_setValue", "GM_getValue", "setValue", "getValue", "values", "getValues", "setValues", "scriptValues", "getScriptValues", "setScriptValues", "GM_setValues", "categoryScript", "tags"];
    const results = [];
    for (const m of candidates) {
      try {
        const r = await adapter.call(optsPage, m, { uuid: uuid });
        results.push({ m: m, ok: true, r: String(JSON.stringify(r)).slice(0, 120) });
      } catch (e) {
        results.push({ m: m, ok: false, r: String(e.message || e).slice(0, 120) });
      }
    }
    out.steps.push({ name: "candidate-methods", ok: true, detail: JSON.stringify(results) });

    fs.writeFileSync(path.join(__dirname, "reports", "probe-gm-api.json"), JSON.stringify(out, null, 1), "utf8");
    console.log(JSON.stringify(out, null, 1));
    await adapter.removeScript(optsPage, uuid).catch(() => {});
  } catch (e) {
    out.steps.push({ name: "fatal", ok: false, detail: String(e && e.stack || e).slice(0, 500) });
    console.log(JSON.stringify(out, null, 1));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();