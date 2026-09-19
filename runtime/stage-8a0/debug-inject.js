// runtime/stage-8a0/debug-inject.js — 最小脚本注入验证（ScriptCat 链路 vs user.js 链路）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("../../node_modules/playwright");
const adapter = require("../scriptcat-adapter");
const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const EXT_ID = adapter.EXT_ID;
const USERSCRIPT_PATH = path.join(ROOT, "zheliyin-card-assistant.user.js");
const BRANCH = "stage-8a-ocr-audit";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MINI = `// ==UserScript==
// @name        zy-audit-mini
// @version     0.0.1
// @match       https://diy.zheliyin.com/*
// @run-at      document-idle
// @grant       GM_log
// ==/UserScript==
(function(){ try { document.documentElement.setAttribute('data-zy-mini', '1'); GM_log('MINI RAN'); } catch(e){ document.documentElement.setAttribute('data-zy-mini-err', String(e)); } })();`;

function injectUserscript() {
  let code = fs.readFileSync(USERSCRIPT_PATH, "utf8");
  code = code.split("test/extension/src/").join(BRANCH + "/extension/src/");
  code = code.split("demo/extension/src/").join(BRANCH + "/extension/src/");
  code = code.replace(/test\/zheliyin-card-assistant\.user\.js/g, BRANCH + "/zheliyin-card-assistant.user.js");
  code = code.replace(/demo\/zheliyin-card-assistant\.user\.js/g, BRANCH + "/zheliyin-card-assistant.user.js");
  return code;
}

(async () => {
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(PROFILE, {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR],
      viewport: { width: 1440, height: 900 }
    });
    const opts = browser.pages()[0];
    await opts.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await sleep(2000);
    const all = await adapter.getAllScripts(opts);
    for (const s of (all || []).filter((x) => /zheliyin|折立印|zy-audit/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(opts, s.uuid); } catch (e) {} }
    await adapter.installByCode(opts, { uuid: "z-audit-mini", code: MINI, upsertBy: "user" });
    await sleep(1500);
    const miniMsgs = [];
    opts.on("console", (m) => miniMsgs.push(m.text().slice(0, 120)));
    await opts.goto("https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do", { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => console.log("goto err", String(e).slice(0, 120)));
    await opts.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await sleep(12000);
    const miniCheck = await opts.evaluate(() => ({ mini: document.documentElement.getAttribute("data-zy-mini"), miniErr: document.documentElement.getAttribute("data-zy-mini-err") })).catch((e) => ({ err: String(e && e.message || e).slice(0, 80) }));
    console.log("MINI check:", JSON.stringify(miniCheck), "console:", JSON.stringify(miniMsgs.slice(-4)));
    // 再装完整 user.js
    await opts.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await sleep(1000);
    await adapter.installByCode(opts, { uuid: "z-audit-full", code: injectUserscript(), upsertBy: "user" });
    await sleep(1500);
    const fullMsgs = [];
    opts.on("console", (m) => { const t = m.text(); if (/zy-ocr|折立印|error/i.test(t)) fullMsgs.push(t.slice(0, 160)); });
    await opts.goto("https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do", { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await opts.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await sleep(20000);
    const fullCheck = await opts.evaluate(() => ({ panel: !!document.getElementById("zy-native-ocr-panel"), btn: !!document.querySelector("#zy-native-ocr-btn"), bridge: !!window.__ZY_CARD_ASSISTANT_BRIDGE__, init: !!document.documentElement.getAttribute("data-zy-ocr-init") })).catch((e) => ({ err: String(e && e.message || e).slice(0, 80) }));
    console.log("FULL check:", JSON.stringify(fullCheck));
    console.log("FULL console:", JSON.stringify(fullMsgs.slice(-8)));
  } finally { try { browser && await browser.close(); } catch (e) {} }
})();