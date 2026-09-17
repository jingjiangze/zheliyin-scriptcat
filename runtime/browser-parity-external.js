// runtime/browser-parity-external.js — BROWSER PARITY · External Chrome 侧
// 复用既有真机 harness（persistent profile-usc3 + channel:chromium + addInitScript 注入生产 pageBridge），
// 执行与 Agent 侧逐字节相同的两份探针表达式（parity-core-probe.js / parity-native-probe.js），
// 输出脱敏 JSON 到 runtime/reports/browser-parity-external.json。
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const BRIDGE_FILE = path.join(__dirname, "..", "extension", "src", "editor", "page-bridge.js");
const CORE_PROBE = path.join(__dirname, "parity-core-probe.js");
const NATIVE_PROBE = path.join(__dirname, "parity-native-probe.js");
const REPORT_PATH = path.join(__dirname, "reports", "browser-parity-external.json");

(async () => {
  const report = { ts: new Date().toISOString(), probe: "BROWSER-PARITY", env: "external-chrome-persistent-profile-usc3", url: EDITOR_URL, phases: {}, errors: [] };
  let browser = null;
  try {
    const bridgeSrc = fs.readFileSync(BRIDGE_FILE, "utf8");
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    const page = browser.pages()[0];
    const bridgeStart = (bridgeSrc || "").trim() + "\n;if (typeof pageBridge === 'function' && !window.__ZY_CARD_ASSISTANT_BRIDGE__) { try { pageBridge(); } catch (e) { window.__zyBridgeInstallErr = String((e && e.message) || e).slice(0, 300); } }";
    await page.addInitScript(bridgeStart);
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    let rd = null;
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
      rd = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
        const t = vo && vo.totalCanvasArray;
        const d = (Array.isArray(t) && t[0]) || null;
        const c = d && (d.canvas || d);
        return { ok: !!(d && c && c.getObjects && typeof d.drawText === "function"), objs: c ? c.getObjects().length : 0 };
      }).catch(() => ({ ok: false }));
      if (rd && rd.ok) break;
      await page.waitForTimeout(2000);
    }
    report.phases.ready = rd || { ok: false };
    await page.waitForTimeout(3000);

    const coreSrc = fs.readFileSync(CORE_PROBE, "utf8");
    report.phases.core = await page.evaluate(coreSrc, { timeout: 60000 }).catch((e) => ({ evalError: String(e && e.message || e) }));

    const nativeSrc = fs.readFileSync(NATIVE_PROBE, "utf8");
    report.phases.native = await page.evaluate(nativeSrc, { timeout: 60000 }).catch((e) => ({ evalError: String(e && e.message || e) }));
  } catch (e) {
    report.errors.push(String(e && e.message || e));
  } finally {
    if (browser) await browser.close();
  }
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1));
  console.log("REPORT_PATH=" + REPORT_PATH);
  console.log(JSON.stringify(report, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
