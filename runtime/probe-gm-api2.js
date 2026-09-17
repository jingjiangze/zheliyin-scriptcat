// runtime/probe-gm-api2.js — 探测 serviceWorker/value/* 有效方法与编码格式
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
    const uuid = "rt-api2-" + Date.now().toString(36);

    // 直接探测 API（无需装脚本；带 uuid 探测路由存在性）
    const probes = [
      { tag: "getScriptValue", action: "serviceWorker/value/getScriptValue", data: { uuid: uuid } },
      { tag: "setScriptValue-plural", action: "serviceWorker/value/setScriptValues", data: { uuid: uuid, keyValuePairs: [["probeKey", [0, "probeVal"]]], ts: Date.now() } },
      { tag: "getAllScriptValues", action: "serviceWorker/value/getAllScriptValues", data: { uuid: uuid } },
      { tag: "script/values", action: "serviceWorker/script/getScriptValue", data: { uuid: uuid } }
    ];
    for (const p of probes) {
      try {
        const r = await optsPage.evaluate(({ action, data }) => chrome.runtime.sendMessage({ action: action, data: data }), p);
        out.steps.push({ name: p.tag, ok: !r || !r.code, detail: String(JSON.stringify(r)).slice(0, 200) });
      } catch (e) {
        out.steps.push({ name: p.tag, ok: false, detail: String(e.message || e).slice(0, 120) });
      }
    }
    fs.writeFileSync(path.join(__dirname, "reports", "probe-gm-api2.json"), JSON.stringify(out, null, 1), "utf8");
    console.log(JSON.stringify(out, null, 1));
  } catch (e) {
    out.steps.push({ name: "fatal", ok: false, detail: String(e && e.stack || e).slice(0, 500) });
    console.log(JSON.stringify(out, null, 1));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();