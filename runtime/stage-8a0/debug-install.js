// runtime/stage-8a0/debug-install.js — 调试：安装后检查脚本是否注入页面
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

function injectUserscript() {
  let code = fs.readFileSync(USERSCRIPT_PATH, "utf8");
  code = code.split("test/extension/src/").join(BRANCH + "/extension/src/");
  code = code.split("demo/extension/src/").join(BRANCH + "/extension/src/");
  code = code.replace(/test\/zheliyin-card-assistant\.user\.js/g, BRANCH + "/zheliyin-card-assistant.user.js");
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
    console.log("existing scripts:", (all || []).length, (all || []).map((s) => String(s.name || s.url || "").slice(0, 40)));
    for (const s of (all || []).filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(opts, s.uuid); } catch (e) {} }
    const code = injectUserscript();
    console.log("injected code len:", code.length, "has-@require-sanitizer:", code.indexOf("ocr-text-sanitizer.js") >= 0, "branch-cnt:", (code.match(/stage-8a-ocr-audit/g) || []).length);
    await adapter.installByCode(opts, { uuid: "z-dbg-" + Date.now(), code: code, upsertBy: "user" });
    await sleep(2000);
    const after = await adapter.getAllScripts(opts);
    console.log("after install scripts:", (after || []).length, (after || []).map((s) => String(s.name || s.url || s.uuid || "").slice(0, 40)));
    const consoleMsgs = [];
    opts.on("console", (m) => { const t = m.text(); if (/zy-ocr|折立印|error/i.test(t)) consoleMsgs.push(t.slice(0, 200)); });
    await opts.goto("https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do", { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => console.log("goto err", String(e).slice(0, 120)));
    await opts.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await sleep(15000);
    const check = await opts.evaluate(() => ({
      panel: !!document.getElementById("zy-native-ocr-panel"),
      drawer: !!document.querySelector("#zy-native-ocr-btn"),
      bridgeVar: !!window.__ZY_CARD_ASSISTANT_BRIDGE__,
      hasRequire: !!(window.requirejs || window.require)
    })).catch((e) => ({ err: String(e && e.message || e).slice(0, 80) }));
    console.log("page check:", JSON.stringify(check));
    console.log("console tail:", JSON.stringify(consoleMsgs.slice(-12)));
  } finally { try { browser && await browser.close(); } catch (e) {} }
})();