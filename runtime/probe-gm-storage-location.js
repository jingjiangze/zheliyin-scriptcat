// runtime/probe-gm-storage-location.js — 读取 script:/compiled_resource 值，定位 GM 值字段
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
    const uuid = "rt-loc-" + Date.now().toString(36);
    await adapter.installByCode(optsPage, { uuid: uuid, code: src, upsertBy: "user" }).catch((e) => out.steps.push({ name: "install", ok: false, detail: String(e.message || e) }));

    // 让脚本跑一次并写 GM 值
    const page = await browser.newPage();
    await page.goto("https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do", { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const d = Date.now() + 120000;
    let got = false;
    while (Date.now() < d) {
      got = await page.evaluate(() => !!document.getElementById("zy-native-ocr-panel")).catch(() => false);
      if (got) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    await page.evaluate(() => {
      const sel = document.getElementById("zy-ocr-mode-native");
      if (sel) { sel.value = "baidu"; sel.dispatchEvent(new Event("change")); }
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 3000));
    out.steps.push({ name: "editor-set-mode", ok: got, detail: "drawer=" + got });

    const dump = await optsPage.evaluate(async (uid) => {
      const all = await chrome.storage.local.get(null);
      const scriptKey = "script:" + uid;
      const compiledKey = Object.keys(all).find((k) => k.indexOf("compiled_resource:") === 0 && k.endsWith(":" + uid));
      const pick = (k) => { const v = all[k]; if (v == null) return null; const s = typeof v === "string" ? v : JSON.stringify(v); return s.slice(0, 3000); };
      return {
        script: pick(scriptKey),
        compiled: compiledKey ? pick(compiledKey) : null,
        scriptKeys: Object.keys(all).filter((k) => k.indexOf(uid) >= 0)
      };
    }, uuid);
    out.steps.push({ name: "storage-dump", ok: !!dump, detail: JSON.stringify(dump) });

    fs.writeFileSync(path.join(__dirname, "reports", "probe-gm-storage-location.json"), JSON.stringify(out, null, 1), "utf8");
    console.log(JSON.stringify(out, null, 1));
    await adapter.removeScript(optsPage, uuid).catch(() => {});
  } catch (e) {
    out.steps.push({ name: "fatal", ok: false, detail: String(e && e.stack || e).slice(0, 500) });
    console.log(JSON.stringify(out, null, 1));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();