// runtime/stage-7-8/probe-canvas.js — 真机探针：canvas fillText → toDataURL → Image 加载 链路
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("../../node_modules/playwright");
const adapter = require("../scriptcat-adapter");
const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const EXT_ID = adapter.EXT_ID;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FIXTURE_PNG = path.join(ROOT, "runtime", "p0", "fixtures", "ocr-test.png");

(async () => {
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(PROFILE, {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR],
      viewport: { width: 1440, height: 900 }
    });
    const page = browser.pages()[0];
    await page.goto("https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do", { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(8000);
    const res = await page.evaluate(() => {
      const out = { tests: [] };
      try {
        const cv = document.createElement("canvas");
        cv.width = 1120; cv.height = 600;
        const ctx = cv.getContext("2d");
        ctx.scale(2, 2);
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 560, 300);
        ctx.fillStyle = "#000";
        ctx.textBaseline = "top";
        ctx.font = "32px SimHei, Microsoft YaHei, sans-serif";
        ctx.fillText("武汉高端科技有限公司", 40, 40);
        const du = cv.toDataURL("image/png");
        out.tests.push({ name: "toDataURL", len: du.length, head: du.slice(0, 30) });
        return new Promise((resolve) => {
          const im = new Image();
          im.onload = () => resolve({ tests: out.tests.concat([{ name: "Image.load", w: im.naturalWidth, h: im.naturalHeight }]) });
          im.onerror = () => resolve({ tests: out.tests.concat([{ name: "Image.onerror" }]) });
          im.src = du;
        });
      } catch (e) { out.tests.push({ name: "exception", err: String(e && e.message || e).slice(0, 200) }); return out; }
    });
    console.log(JSON.stringify(res, null, 2));
  } finally { try { browser && await browser.close(); } catch (e) {} }
})();