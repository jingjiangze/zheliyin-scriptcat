// runtime/probe-gm-value-shape.js — 读取 ScriptCat value:<uuid> 结构并实测写入 zyShowTemplatePanel 生效
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const adapter = require("./scriptcat-adapter");
const EXT_ID = adapter.EXT_ID;
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";
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
    const uuid = "rt-val-" + Date.now().toString(36);
    await adapter.installByCode(optsPage, { uuid: uuid, code: src, upsertBy: "user" }).catch((e) => out.steps.push({ name: "install", ok: false, detail: String(e.message || e) }));

    const page = await browser.newPage();
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
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

    // 读 value:<uuid>
    const val = await optsPage.evaluate(async (uid) => {
      const all = await chrome.storage.local.get(null);
      const v = all["value:" + uid];
      return { has: !!v, v: v, isObj: typeof v === "object", keys: v && typeof v === "object" ? Object.keys(v) : [] };
    }, uuid);
    out.steps.push({ name: "read-value", ok: !!val.has, detail: JSON.stringify(val) });

    // 用官方通道写 zyShowTemplatePanel=1（serviceWorker/value/setScriptValues，值编码 [0,v]，删除用 [1]）
    const apiWrite = await optsPage.evaluate(async (uid) => {
      const res = await chrome.runtime.sendMessage({ action: "serviceWorker/value/setScriptValues", data: { uuid: uid, keyValuePairs: [["zyShowTemplatePanel", [0, "1"]]], ts: Date.now() } });
      return res;
    }, uuid);
    out.steps.push({ name: "api-write-setScriptValue", ok: apiWrite && apiWrite.code === 0, detail: JSON.stringify(apiWrite) });

    // 新开 editor 页验证浮窗出现（写值后首次加载时应读到）
    const page2 = await browser.newPage();
    await page2.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page2.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const d2 = Date.now() + 120000;
    let st = null;
    while (Date.now() < d2) {
      st = await page2.evaluate(() => ({
        legacy: !!document.getElementById("zy-card-assistant"),
        drawer: !!document.getElementById("zy-native-ocr-panel")
      })).catch(() => null);
      if (st && st.legacy) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    out.steps.push({ name: "legacy-appears-after-write", ok: !!(st && st.legacy), detail: JSON.stringify(st) });

    // 清掉 zyShowTemplatePanel → reload → 恢复 OCR-only（官方通道写 [1] = undefined/删除）
    await optsPage.evaluate(async (uid) => {
      await chrome.runtime.sendMessage({ action: "serviceWorker/value/setScriptValues", data: { uuid: uid, keyValuePairs: [["zyShowTemplatePanel", [1]]], ts: Date.now() } });
    }, uuid);
    const page3 = await browser.newPage();
    await page3.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page3.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const d3 = Date.now() + 120000;
    let st3 = null;
    while (Date.now() < d3) {
      st3 = await page3.evaluate(() => ({
        legacy: !!document.getElementById("zy-card-assistant"),
        drawer: !!document.getElementById("zy-native-ocr-panel")
      })).catch(() => null);
      if (st3 && st3.drawer) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    out.steps.push({ name: "ocr-only-back-after-clear", ok: !!(st3 && st3.drawer && !st3.legacy), detail: JSON.stringify(st3) });

    fs.writeFileSync(path.join(__dirname, "reports", "probe-gm-value-shape.json"), JSON.stringify(out, null, 1), "utf8");
    console.log(JSON.stringify(out, null, 1));
    await adapter.removeScript(optsPage, uuid).catch(() => {});
  } catch (e) {
    out.steps.push({ name: "fatal", ok: false, detail: String(e && e.stack || e).slice(0, 500) });
    console.log(JSON.stringify(out, null, 1));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();