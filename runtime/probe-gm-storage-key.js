// runtime/probe-gm-storage-key.js — 探测 ScriptCat 脚本 GM 存储 key 格式（用于 restore 开关测试）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const adapter = require("./scriptcat-adapter");

const EXT_ID = adapter.EXT_ID;
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";
const UUID = "rt-probe-" + Date.now().toString(36);
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
    const inst = await adapter.installByCode(optsPage, { uuid: UUID, code: src, upsertBy: "user" }).catch((e) => ({ __err: String(e.message || e) }));
    out.steps.push({ name: "install", ok: !inst.__err, detail: inst.__err || "status=" + inst.status });

    const page = await browser.newPage();
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const d = Date.now() + 120000;
    let got = null;
    while (Date.now() < d) {
      got = await page.evaluate(() => !!document.getElementById("zy-native-ocr-panel")).catch(() => false);
      if (got) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    out.steps.push({ name: "drawer-ready", ok: !!got });

    // 触发 GM_setValue：切换识别方式 + 触发百度 key 占位刷新（仅 loadBaiduConfig 不写值）
    await page.evaluate(() => {
      const sel = document.getElementById("zy-ocr-mode-native");
      if (sel) { sel.value = "local"; sel.dispatchEvent(new Event("change")); }
    }).catch(() => {});
    await page.evaluate(() => {
      // 无浮窗时无法保存 key；尝试直接触发 bindOcrControls 保存逻辑的路径不存在 —— 仅靠 mode。
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2500));

    // 法 1：options 页 chrome.storage.local 全量扫描 zy*
    const viaOptions = await optsPage.evaluate(async () => {
      const all = await chrome.storage.local.get(null);
      const keys = Object.keys(all);
      return { total: keys.length, zy: keys.filter((k) => /zy|Show|Template|Ocr|Baidu/i.test(k)).slice(0, 30), sample: keys.slice(0, 12) };
    });
    out.steps.push({ name: "options-page-keys", ok: !!viaOptions, detail: JSON.stringify(viaOptions) });

    // 法 2：editor 页是否可访问 chrome.storage（content sandbox 一般不可），或 GM 注入 window
    const viaPage = await page.evaluate(() => ({
      hasChrome: typeof chrome !== "undefined" && !!(chrome && chrome.storage),
      hasGMOnWindow: typeof GM_setValue !== "undefined" || typeof GM !== "undefined" || !!(window.GM_GetValue) || !!window.GM_getValue,
      keys: typeof window.GM_getValue === "function" ? ["GM_getValue exists"] : []
    })).catch(() => null);
    out.steps.push({ name: "editor-page-gm", ok: !!viaPage, detail: JSON.stringify(viaPage) });

    fs.writeFileSync(path.join(__dirname, "reports", "probe-gm-storage-key.json"), JSON.stringify(out, null, 1), "utf8");
    console.log(JSON.stringify(out, null, 1));
    await adapter.removeScript(optsPage, UUID).catch(() => {});
  } catch (e) {
    out.steps.push({ name: "fatal", ok: false, detail: String(e && e.stack || e).slice(0, 500) });
    console.log(JSON.stringify(out, null, 1));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();