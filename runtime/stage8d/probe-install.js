// runtime/stage8d/probe-install.js — Stage 8D 诊断：验证 scriptcat 安装/启用是否生效（userscript 为何不注入）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("../../node_modules/playwright");
const adapter = require("../scriptcat-adapter");
const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1440, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    const opts = browser.pages()[0];
    await opts.goto("chrome-extension://" + adapter.EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await SLEEP(2500);
    let all = await adapter.getAllScripts(opts) || [];
    console.log("BEFORE install: total=" + all.length + " zy=" + all.filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || ""))).length);
    for (const s of all.filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(opts, s.uuid); } catch (e) { console.log("remove err", e); } }
    const code = fs.readFileSync(path.join(ROOT, process.env.ZY_PROBE_SCRIPT || "zheliyin-card-assistant.user.js"), "utf8");
    const ret = await adapter.installByCode(opts, { uuid: "zy8d-probe-" + Date.now(), code, upsertBy: "user" });
    console.log("installByCode full:", JSON.stringify(ret || {}).slice(0, 1500));
    await SLEEP(2500);
    all = await adapter.getAllScripts(opts) || [];
    const zys = all.filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")));
    console.log("AFTER install: total=" + all.length + " zy=" + zys.length);
    zys.forEach((s) => console.log("  zy script:", JSON.stringify({ uuid: s.uuid, name: s.name, enabled: s.enabled, updatedAt: s.updatedAt }).slice(0, 300)));
    await opts.goto("https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do", { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await SLEEP(6000);
    const hasInit = await opts.evaluate(() => {
      const els = Array.from(document.querySelectorAll("script,style"));
      return { initMarker: document.body ? String(document.body.innerHTML || "").indexOf("zy-card-assistant") >= 0 : false, wps: !!window.postMessage };
    }).catch((e) => ({ err: String(e).slice(0, 120) }));
    console.log("page probe:", JSON.stringify(hasInit));
  } catch (e) { console.log("PROBE ERROR:", String(e && e.message || e).slice(0, 400)); }
  finally { try { browser && await browser.close(); } catch (e) {} }
})();