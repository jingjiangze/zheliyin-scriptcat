// runtime/verify-gm-bridge.js — RUNTIME-8.3 §八-十二：真实 ScriptCat userscript 内 GM_addElement 注入 production pageBridge
// 流程：ScriptCat installByCode 安装 GM probe（内含 production page-bridge.js 源码，经 GM_addElement 注入）
// → 真实 editor → marker → probe exactly-one → 5×probe → cross-instance install×3 (ScriptCat 幂等) → 仍 exactly-one
// 禁止 DUP_SIM / page.evaluate(pageBridge)（§九）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const adapter = require("./scriptcat-adapter");

const EXT_ID = adapter.EXT_ID;
const GM_UUID = "rt8-gm-bridge-uuid";
const GM_NAME = "Zheliyin RT8 GM Bridge";
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";

(async () => {
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  const report = { ts: new Date().toISOString(), steps: [], errors: [] };
  const step = (n, ok, d, ev) => { report.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 500), evidence: ev || "n/a" }); if (!ok) report.errors.push(n); };
  let browser = null;
  try {
    // production pageBridge 源码（直读，不做第二份）
    let bridgeSrc = fs.readFileSync(path.join(__dirname, "..", "extension", "src", "editor", "page-bridge.js"), "utf8");
    bridgeSrc = bridgeSrc.replace(/^function\s+pageBridge\s*\(/i, "function pageBridge(");

    // GM probe：userscript 内经 GM_addElement 注入 production pageBridge 到 page world
    const GM_CODE = [
      "// ==UserScript==",
      "// @name " + GM_NAME,
      "// @namespace https://github.com/jingjiangze/zheliyin-scriptcat",
      "// @match https://diy.zheliyin.com/*",
      "// @grant GM_addElement",
      "// @run-at document-idle",
      "// ==/UserScript==",
      "(function(){",
      "var BRIDGE_SRC = " + JSON.stringify(bridgeSrc) + ";",
      "function mark(k){try{document.documentElement.setAttribute('data-zy-rt8-'+k,'1')}catch(e){}}",
      "try {",
      "  GM_addElement('script', {textContent: '(function(){'+BRIDGE_SRC+';try{pageBridge()}catch(e){console.error(\"[zy-rt8-gm] init\",e)}})();'});",
      "  mark('gm-called');",
      "  console.log('[zy-rt8-gm] gm-add-element called');",
      "} catch(e) {",
      "  mark('gm-threw-' + String(e && e.message || e).slice(0,20).replace(/[^a-z0-9-]/gi,'-'));",
      "  console.error('[zy-rt8-gm] threw', e);",
      "}",
      "setTimeout(function(){ try{ var cb=window.__ZY_CARD_ASSISTANT_BRIDGE__; mark('marker-'+(cb&&cb.installed?'yes':'no')); }catch(e){} }, 800);",
      "})();"
    ].join("\n");

    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${scDir}`, `--load-extension=${scDir}`],
      viewport: { width: 1440, height: 900 }
    });
    const page = browser.pages()[0];
    await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(2500);

    // install GM probe
    const inst = await adapter.installByCode(page, { uuid: GM_UUID, code: GM_CODE, upsertBy: "user" }).catch((e) => ({ __err: String(e && e.message || e) }));
    step("install-gm-probe", !inst.__err, inst.__err || "status=" + inst.status, "REAL_SCRIPT_CAT_INSTALL");

    // open real editor
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => step("nav", false, String(e && e.message || e)));
    step("nav", true, redactUrl(page.url()));

    // 收集证据：等待编辑器 + marker + gm mark
    let ready = false, markInfo = null;
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
      markInfo = await page.evaluate(() => {
        const attrs = Array.prototype.slice.call(document.documentElement.attributes).map((a) => a.name).filter((n) => n.indexOf("data-zy-rt8-") >= 0);
        const cb = window.__ZY_CARD_ASSISTANT_BRIDGE__;
        return { req: !!(window.requirejs || window.require), fab: !!window.fabric, attrs, marker: cb ? { installed: cb.installed === true, ts: cb.ts || null } : null };
      }).catch(() => null);
      if (markInfo && markInfo.req && markInfo.fab && markInfo.marker && markInfo.marker.installed) { ready = true; break; }
      await new Promise((r) => setTimeout(r, 3000));
    }
    step("gm-marks", !!markInfo && (markInfo.attrs || []).length > 0, "attrs=" + JSON.stringify(markInfo && markInfo.attrs), "REAL_SCRIPT_CAT_GM_ADD_ELEMENT");
    step("bridge-marker", !!(markInfo && markInfo.marker && markInfo.marker.installed), JSON.stringify(markInfo && markInfo.marker), "REAL_SCRIPT_CAT_BRIDGE");
    if (!ready && !(markInfo && markInfo.marker && markInfo.marker.installed)) { /* 未注入则到此为止 */ }

    if (markInfo && markInfo.marker && markInfo.marker.installed) {
      // probe exactly-one（§十一）
      const p1 = await page.evaluate(() => new Promise((res) => {
        let n = 0;
        const on = (e) => { if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === "probeResult") n += 1; };
        window.addEventListener("message", on);
        window.postMessage({ source: "zy-card-assistant", type: "probe", rt8: true }, location.origin);
        setTimeout(() => { window.removeEventListener("message", on); res(n); }, 1500);
      }));
      step("probe-exactly-one", p1 === 1, "responses=" + p1, "REAL_SCRIPT_CAT_BRIDGE");

      // 5× probe → 5 response
      const p5 = await page.evaluate(() => new Promise((res) => {
        let n = 0;
        const on = (e) => { if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === "probeResult") n += 1; };
        window.addEventListener("message", on);
        for (let i = 0; i < 5; i++) window.postMessage({ source: "zy-card-assistant", type: "probe", rt8: true }, location.origin);
        setTimeout(() => { window.removeEventListener("message", on); res(n); }, 1500);
      }));
      step("probe-5x-5", p5 === 5, "responses=" + p5, "REAL_SCRIPT_CAT_BRIDGE");

      // cross-instance（§十二）：ScriptCat 再 install×2（同 uuid upsert）→ 仍 exactly-one（幂等由 pageBridge marker 防御）
      await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 25000 });
      await page.waitForTimeout(2000);
      for (let i = 0; i < 2; i++) {
        await adapter.installByCode(page, { uuid: GM_UUID, code: GM_CODE, upsertBy: "user" }).catch(() => {});
      }
      await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(10000);
      // 刷新后 marker 重新安装但 listener 防重：1 probe → 1 response（pageBridge 的 window marker 保证跨实例/跨刷新仅一个 listener）
      const after = await page.evaluate(() => new Promise((res) => {
        let n = 0;
        const on = (e) => { if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === "probeResult") n += 1; };
        window.addEventListener("message", on);
        window.postMessage({ source: "zy-card-assistant", type: "probe", rt8: true }, location.origin);
        setTimeout(() => { window.removeEventListener("message", on); res(n); }, 1500);
      }));
      step("cross-instance-1-response", after === 1, "responses=" + after + " (userscript SP每一次都独立执行 GM_addElement，但 pageBridge 的 window marker 保证 list 不重复)", "REAL_SCRIPT_CAT_BRIDGE+CROSS_INSTANCE");
    }

    // cleanup
    try { await adapter.removeScript(page, GM_UUID); step("cleanup", true, "removed " + GM_UUID); } catch (e) { step("cleanup", false, String(e && e.message || e)); }
  } catch (e) { step("fatal", false, String(e && e.stack || e)); }
  finally { if (browser) await browser.close().catch(() => {}); }
  fs.writeFileSync(path.join(__dirname, "reports", "verify-gm-bridge-report.json"), JSON.stringify(report, null, 1), "utf8");
  console.log(JSON.stringify(report, null, 1));
  process.exit(report.errors.length ? 1 : 0);

  function redactUrl(u) { try { return u.replace(/([?&](?:token|key|secret|sign|session)=)[^&#]*/gi, "$1***").slice(0, 150); } catch (e) { return String(u).slice(0, 150); } }
})();