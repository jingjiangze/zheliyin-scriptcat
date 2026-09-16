// runtime/runtime8-full-chain.js — RUNTIME-8.3 §二十八：npm run runtime:scriptcat 全链闭环
// 流程：启动 Chromium → 加载真实 ScriptCat → userScripts capability 分类(A/B/C/D, §十六)
//   → 自动安装 min-exec probe（§六/§七 真实执行+DOM mark）
//   → 自动安装 GM probe（production pageBridge via GM_addElement，§八；禁 DUP_SIM §九）
//   → marker（§十）→ probe exactly-one → 5x-5（§十一）
//   → Canvas（§二十三）→ Apply → readback → rollback → readback（§十三）
//   → 删除 probes → 生成报告 → 退出（§二十八）
// 证据来源单一：extension/src/editor/page-bridge.js（production，禁复制第二份 §八）
"use strict";
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { chromium } = require("playwright");
const { healthCheck, redactText } = require("./browser-launcher");
const adapter = require("./scriptcat-adapter");

const EXT_ID = adapter.EXT_ID;
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";
const TEST_VAL = "TEST_RUNTIME_VALUE";
const MIN_UUID = "rt8-chain-min-exec-uuid";
const GM_UUID = "rt8-chain-gm-uuid";

(async () => {
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  const report = { ts: new Date().toISOString(), stage: "RUNTIME-8.3", steps: [], errors: [] };
  const step = (n, ok, d, ev) => { report.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: redactText(String(d || "")).slice(0, 600), evidence: ev || "n/a" }); if (!ok) report.errors.push(n); };
  let browser = null;

  // production pageBridge 源码（唯一来源；GM probe 内嵌其源码文本）
  let bridgeSrc = fs.readFileSync(path.join(__dirname, "..", "extension", "src", "editor", "page-bridge.js"), "utf8");
  bridgeSrc = bridgeSrc.replace(/^function\s+pageBridge\s*\(/i, "function pageBridge(");
  const bridgeHash = crypto.createHash("sha256").update(bridgeSrc).digest("hex").slice(0, 16);

  const MIN_CODE = [
    "// ==UserScript==",
    "// @name Zheliyin RT8 Chain Min Exec",
    "// @namespace https://github.com/jingjiangze/zheliyin-scriptcat",
    "// @match https://diy.zheliyin.com/*",
    "// @run-at document-idle",
    "// ==/UserScript==",
    "(function(){",
    "  document.documentElement.setAttribute('data-zy-runtime8-user-script','1');",
    "})();"
  ].join("\n");

  const GM_CODE = [
    "// ==UserScript==",
    "// @name Zheliyin RT8 Chain GM Bridge",
    "// @namespace https://github.com/jingjiangze/zheliyin-scriptcat",
    "// @match https://diy.zheliyin.com/*",
    "// @grant GM_addElement",
    "// @run-at document-idle",
    "// ==/UserScript==",
    "(function(){",
    "var BRIDGE_SRC = " + JSON.stringify(bridgeSrc) + ";",
    "try {",
    "  GM_addElement('script', {textContent: '(function(){'+BRIDGE_SRC+';try{pageBridge()}catch(e){console.error(\"[zy-rt8-chain] init\",e)}})();'});",
    "  document.documentElement.setAttribute('data-zy-rt8-gm-called','1');",
    "} catch(e) { console.error('[zy-rt8-chain] threw', e); }",
    "})();"
  ].join("\n");

  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${scDir}`, `--load-extension=${scDir}`],
      viewport: { width: 1440, height: 900 }
    });
    step("launch+scriptcat", true, "Playwright Chromium + 真实 ScriptCat(" + EXT_ID + ")", "REAL_SCRIPT_CAT_EXTENSION");
    const page = browser.pages()[0];
    await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch((e) => step("options", false, String(e && e.message || e)));
    await page.waitForTimeout(3500);
    step("options-loaded", true, "ScriptCat options 页", "REAL_SCRIPT_CAT_EXTENSION");

    // §四/§五/§十六：userScripts capability 分类（官方建议 getScripts() 实际调用法 + undefined 区分）
    const cap = await page.evaluate(() => {
      const out = { ua: navigator.userAgent.slice(0, 120), hasUserScripts: typeof chrome.userScripts !== "undefined", userScriptsType: typeof chrome.userScripts, hasScripting: typeof chrome.scripting !== "undefined", getScriptsResult: null, getScriptsError: null, manifestPerms: null };
      try { out.manifestPerms = (chrome.runtime && chrome.runtime.getManifest && chrome.runtime.getManifest().permissions) || null; } catch (e) { out.manifestPerms = String(e && e.message || e); }
      try {
        if (typeof chrome.userScripts !== "undefined") {
          const p = chrome.userScripts.getScripts();
          if (p && typeof p.then === "function") out.getScriptsResult = "PROMISE"; // 权限正常时返回 Promise
          else out.getScriptsResult = "SYNC:" + String(p);
          out.getScriptsError = null;
        }
      } catch (e) { out.getScriptsError = String(e && e.message || e).slice(0, 200); }
      return out;
    }).catch((e) => ({ evalError: String(e && e.message || e) }));
    // 分类判定（§十六）：A 支持且启用；B 支持但关闭；C 策略阻止；D 不可用
    let cat = "D:API_NOT_AVAILABLE";
    if (cap && !cap.evalError && cap.hasUserScripts) {
      if (!cap.getScriptsError) cat = "A:API_SUPPORTED_AND_ENABLED";
      else if (/permission|policy|not allowed|受策略|blocked/i.test(cap.getScriptsError)) cat = "C:API_BLOCKED_BY_BROWSER_POLICY";
      else cat = "B:API_SUPPORTED_BUT_DISABLED";
    }
    step("userscripts-capability", cap && cap.hasUserScripts && !cap.getScriptsError, cat + " | " + JSON.stringify(cap).slice(0, 400), "RUNTIME-8.3 §四/§五/§十六");

    // 安装两个 probe（§六/§八）：min-exec（仅 DOM mark）+ GM（production pageBridge）
    const instMin = await adapter.installByCode(page, { uuid: MIN_UUID, code: MIN_CODE, upsertBy: "user" }).catch((e) => ({ __err: String(e && e.message || e) }));
    step("install-min-exec", !instMin.__err, instMin.__err || "status=" + instMin.status, "REAL_SCRIPT_CAT_INSTALL");
    const instGm = await adapter.installByCode(page, { uuid: GM_UUID, code: GM_CODE, upsertBy: "user" }).catch((e) => ({ __err: String(e && e.message || e) }));
    step("install-gm-probe", !instGm.__err, instGm.__err || "status=" + instGm.status, "REAL_SCRIPT_CAT_INSTALL");
    if (instMin.__err || instGm.__err) return;

    // 打开真实编辑器（触发两个 userscript 执行）
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => step("nav-editor", false, String(e && e.message || e)));
    step("nav-editor", true, redactText(page.url()), "REAL_LOGGED_IN_EDITOR");
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => step("reload-editor", false, String(e && e.message || e)));

    // 等 Bridge + Canvas 就绪
    let bridge = null;
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
      const st = await page.evaluate(() => {
        const cb = window.__ZY_CARD_ASSISTANT_BRIDGE__;
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
        const total = vo && vo.totalCanvasArray;
        let c = null;
        if (Array.isArray(total) && total[0]) c = (total[0].canvas) || total[0];
        return { bridge: cb ? cb.installed === true : false, width: c ? c.width : null, height: c ? c.height : null, objs: c && typeof c.getObjects === "function" ? c.getObjects().length : null };
      }).catch(() => null);
      if (st && st.bridge && st.width > 0) { bridge = st; break; }
      await new Promise((r) => setTimeout(r, 3000));
    }
    step("bridge+canvas-ready", !!(bridge && bridge.width > 0), JSON.stringify(bridge), "REAL_SCRIPT_CAT_BRIDGE+REAL_CANVAS");
    if (!bridge || !bridge.width) return;

    // §七：min-exec 真实执行证据（DOM mark，main world 共享 DOM）
    const marks = await page.evaluate(() => Array.prototype.slice.call(document.documentElement.attributes).map((a) => a.name).filter((n) => n.indexOf("data-zy-rt8") >= 0 || n.indexOf("data-zy-runtime8") >= 0));
    step("user-script-exec", marks.indexOf("data-zy-runtime8-user-script") >= 0, "marks=" + JSON.stringify(marks), "REAL_SCRIPT_CAT_USER_SCRIPT_EXECUTION");
    step("gm-add-element-exec", marks.indexOf("data-zy-rt8-gm-called") >= 0, "marks=" + JSON.stringify(marks), "REAL_GM_ADD_ELEMENT");

    // marker（§十）
    const marker = await page.evaluate(() => { const cb = window.__ZY_CARD_ASSISTANT_BRIDGE__; return cb ? { installed: cb.installed === true, ts: cb.ts } : null; });
    step("bridge-marker", !!(marker && marker.installed), JSON.stringify(marker), "REAL_SCRIPT_CAT_BRIDGE");

    // Probe exactly-one + 5x-5（§十一）+ 来源检查（§十四）
    const probeOne = await page.evaluate(() => new Promise((res) => {
      let n = 0;
      const on = (e) => { if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === "probeResult") n += 1; };
      window.addEventListener("message", on);
      window.postMessage({ source: "zy-card-assistant", type: "probe" }, location.origin);
      setTimeout(() => { window.removeEventListener("message", on); res(n); }, 1500);
    }));
    step("probe-exactly-one", probeOne === 1, "responses=" + probeOne, "REAL_SCRIPT_CAT_BRIDGE");
    const probeFive = await page.evaluate(() => new Promise((res) => {
      let n = 0, done = 0;
      const on = (e) => { if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === "probeResult") n += 1; };
      window.addEventListener("message", on);
      for (let i = 0; i < 5; i += 1) window.postMessage({ source: "zy-card-assistant", type: "probe" }, location.origin);
      setTimeout(() => { window.removeEventListener("message", on); res(n); }, 2000);
    }));
    step("probe-5x-5", probeFive === 5, "responses=" + probeFive, "REAL_SCRIPT_CAT_BRIDGE");

    // 快照（apply 前，order 1:1）
    const pre = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const total = vo && vo.totalCanvasArray;
      if (!Array.isArray(total) || !total[0]) return null;
      const c = (total[0].canvas) || total[0];
      if (typeof c.getObjects !== "function") return null;
      const objs = c.getObjects();
      const texts = objs.filter((o) => o && (o.text != null || String(o.type || "").indexOf("text") >= 0));
      return { total: objs.length, textTotal: texts.length, snapshot: objs.map((o) => String(o && o.text != null ? o.text : "")), sample: texts.length ? String(texts[0].text || "").slice(0, 60) : null };
    });
    step("snapshot", !!(pre && pre.total > 0 && pre.textTotal > 0), JSON.stringify({ total: pre && pre.total, textTotal: pre && pre.textTotal, sample: pre && pre.sample }), "REAL_CANVAS");
    if (!pre) return;

    // Apply（生产协议：front side + name；响应必须来自 production pageBridge）
    const applyRes = await page.evaluate((val) => new Promise((res) => {
      const resp = [];
      const on = (e) => { if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === "applyResult" && resp.length < 1) resp.push(e.data); };
      window.addEventListener("message", on);
      window.postMessage({ source: "zy-card-assistant", type: "apply", side: "front", fields: { name: val } }, location.origin);
      setTimeout(() => { window.removeEventListener("message", on); res({ resp, marker: window.__ZY_CARD_ASSISTANT_BRIDGE__ || null }); }, 3000);
    }), TEST_VAL);
    const applyOk = applyRes.resp.length > 0 && applyRes.resp[0].ok === true;
    step("apply-response", applyOk, JSON.stringify(applyRes.resp.slice(0, 1)).slice(0, 400), "REAL_SCRIPT_CAT_APPLY|src=page-bridge.js#sha256:" + bridgeHash + "|marker=" + !!(applyRes.marker && applyRes.marker.installed));

    const readback = await page.evaluate((val) => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const total = vo && vo.totalCanvasArray;
      if (!Array.isArray(total) || !total[0]) return null;
      const c = (total[0].canvas) || total[0];
      const objs = c.getObjects();
      const hit = objs.find((o) => o && String(o.text || "") === val);
      return { found: !!hit, text: hit ? String(hit.text).slice(0, 100) : null, objCount: objs.length };
    }, TEST_VAL);
    step("apply-readback", !!(readback && readback.found), JSON.stringify(readback), "REAL_SCRIPT_CAT_APPLY");

    const rollback = await page.evaluate(({ val, pre }) => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const total = vo && vo.totalCanvasArray;
      if (!Array.isArray(total) || !total[0]) return { ok: false, msg: "no canvas" };
      const c = (total[0].canvas) || total[0];
      try {
        const setText = (o, t) => { if (typeof o.setText === "function") o.setText(t); else if (typeof o.set === "function") o.set("text", t); else o.text = t; o.text = t; o.dirty = true; if (typeof o.initDimensions === "function") o.initDimensions(); if (typeof o.setCoords === "function") o.setCoords(); };
        let removed = 0, restored = 0;
        c.getObjects().slice().forEach((o) => { if (o && o.zyCreatedByAssistant) { c.remove(o); removed++; } });
        const rest = c.getObjects();
        rest.forEach((o, i) => { if (o && i < pre.snapshot.length && String(o.text || "") !== pre.snapshot[i]) { setText(o, pre.snapshot[i]); restored++; } });
        if (c.requestRenderAll) c.requestRenderAll(); else if (c.renderAll) c.renderAll();
        const after = c.getObjects();
        const leaked = after.filter((o) => o && String(o.text || "").indexOf(val) >= 0).length;
        return { ok: after.length === pre.total && leaked === 0, removed: removed, restored: restored, leaked: leaked, total: after.length, preTotal: pre.total };
      } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
    }, { val: TEST_VAL, pre: pre });
    step("rollback", rollback.ok, JSON.stringify(rollback), "REAL_SCRIPT_CAT_ROLLBACK");

    // 删除 probes（§二十八）
    for (const u of [GM_UUID, MIN_UUID]) {
      try { await adapter.removeScript(page, u); step("cleanup-" + u, true, "removed"); } catch (e) { step("cleanup-" + u, false, String(e && e.message || e)); }
    }
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 500));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  const reportPath = path.join(__dirname, "reports", "runtime8-full-chain-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 1), "utf8");
  console.log("[zy-runtime8-full-chain] errors=" + report.errors.length + " → " + reportPath);
  process.exit(report.errors.length ? 1 : 0);
})();