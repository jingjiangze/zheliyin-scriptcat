// runtime/verify-gm-apply.js — RUNTIME-8.3 §十三/十四：真实 ScriptCat Bridge → Apply → readback → rollback → readback
// 前提：REAL_SCRIPT_CAT_BRIDGE 已 PASS。本脚本复用 GM probe（含 production pageBridge），
// 通过 postMessage apply 协议向真实 Bridge 发送最小安全修改，随后恢复。
"use strict";
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { chromium } = require("playwright");
const adapter = require("./scriptcat-adapter");

const EXT_ID = adapter.EXT_ID;
const GM_UUID = "rt8-gm-apply-uuid";
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";
const TEST_VAL = "TEST_RUNTIME_VALUE";

(async () => {
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  const report = { ts: new Date().toISOString(), steps: [], errors: [] };
  const step = (n, ok, d, ev) => { report.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 600), evidence: ev || "n/a" }); if (!ok) report.errors.push(n); };
  let browser = null;
  try {
    let bridgeSrc = fs.readFileSync(path.join(__dirname, "..", "extension", "src", "editor", "page-bridge.js"), "utf8");
    bridgeSrc = bridgeSrc.replace(/^function\s+pageBridge\s*\(/i, "function pageBridge(");

    // GM probe + 同时监听 apply 响应佐证
    const GM_CODE = [
      "// ==UserScript==",
      "// @name Zheliyin RT8 GM Apply",
      "// @namespace https://github.com/jingjiangze/zheliyin-scriptcat",
      "// @match https://diy.zheliyin.com/*",
      "// @grant GM_addElement",
      "// @run-at document-idle",
      "// ==/UserScript==",
      "(function(){",
      "var BRIDGE_SRC = " + JSON.stringify(bridgeSrc) + ";",
      "try {",
      "  GM_addElement('script', {textContent: '(function(){'+BRIDGE_SRC+';try{pageBridge()}catch(e){console.error(\"[zy-rt8-gm] init\",e)}})();'});",
      "  document.documentElement.setAttribute('data-zy-rt8-gm-called','1');",
      "} catch(e) { console.error('[zy-rt8-gm] threw', e); }",
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
    const inst = await adapter.installByCode(page, { uuid: GM_UUID, code: GM_CODE, upsertBy: "user" }).catch((e) => ({ __err: String(e && e.message || e) }));
    step("install", !inst.__err, inst.__err || "status=" + inst.status, "REAL_SCRIPT_CAT_INSTALL");

    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => step("nav", false, String(e && e.message || e)));
    step("nav", true, redactUrl(page.url()));

    // 等到 Bridge + canvas 就绪
    let bridge = null;
    let snap = null;
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
      const state = await page.evaluate(() => {
        const cb = window.__ZY_CARD_ASSISTANT_BRIDGE__;
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
        const total = vo && vo.totalCanvasArray;
        let c = null;
        if (Array.isArray(total) && total[0]) { c = (total[0].canvas) || total[0]; }
        return { bridge: cb ? cb.installed === true : false, width: c ? c.width : null, height: c ? c.height : null, objs: c && typeof c.getObjects === "function" ? c.getObjects().length : null };
      }).catch(() => null);
      if (state && state.bridge && state.width > 0) { bridge = state; break; }
      await new Promise((r) => setTimeout(r, 3000));
    }
    step("bridge+canvas-ready", !!(bridge && bridge.width > 0), JSON.stringify(bridge), "REAL_SCRIPT_CAT_BRIDGE+REAL_CANVAS");
    if (!bridge || !bridge.width) return;

    // 快照：apply 前记录画布全部文字层文本（作为 readback 对比与 rollback 恢复基准）
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
      // snapshot 与 getObjects() 顺序 1:1 对齐（非文字层记空串），保证 rollback 按下标 diff 恢复不会错位
      return { total: objs.length, textTotal: texts.length, snapshot: objs.map((o) => String(o && o.text != null ? o.text : "")), sample: texts.length ? { idx: objs.indexOf(texts[0]), original: String(texts[0].text || "").slice(0, 100) } : null };
    });
    step("snapshot", !!(pre && pre.total > 0 && pre.textTotal > 0), JSON.stringify({ total: pre && pre.total, textTotal: pre && pre.textTotal, sample: pre && pre.sample }), "REAL_CANVAS");
    if (!pre) return;

    // Apply（postMessage 协议，经真实 ScriptCat 注入的 production pageBridge）
    // 字段走真实 buildItems/applyFields 路径：front 侧 name（最小单值操作，等价用户"填正面姓名"）
    const bridgeHash = crypto.createHash("sha256").update(bridgeSrc).digest("hex").slice(0, 16);
    const applyRes = await page.evaluate((val) => new Promise((res) => {
      const resp = [];
      const on = (e) => {
        if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === "applyResult" && resp.length < 1) { resp.push(e.data); }
      };
      window.addEventListener("message", on);
      window.postMessage({ source: "zy-card-assistant", type: "apply", side: "front", fields: { name: val } }, location.origin);
      setTimeout(() => { window.removeEventListener("message", on); res({ resp, marker: window.__ZY_CARD_ASSISTANT_BRIDGE__ || null }); }, 3000);
    }), TEST_VAL);
    const applyOk = applyRes.resp.length > 0 && applyRes.resp[0].ok === true;
    step("apply-response", applyOk, JSON.stringify(applyRes.resp.slice(0, 1)).slice(0, 400), "REAL_SCRIPT_CAT_APPLY|src=extension/src/editor/page-bridge.js#sha256:" + bridgeHash + "|marker=" + !!(applyRes.marker && applyRes.marker.installed));

    // readback：搜索画布中是否存在 TEST_RUNTIME_VALUE 文本（applyFields 已 setObjectText 写入目标图层）
    const readback = await page.evaluate((val) => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const total = vo && vo.totalCanvasArray;
      if (!Array.isArray(total) || !total[0]) return null;
      const c = (total[0].canvas) || total[0];
      if (typeof c.getObjects !== "function") return null;
      const objs = c.getObjects();
      const hit = objs.find((o) => o && String(o.text || "") === val);
      return { found: !!hit, text: hit ? String(hit.text).slice(0, 100) : null, objCount: objs.length, created: !!(hit && hit.zyCreatedByAssistant) };
    }, TEST_VAL);
    step("apply-readback", !!(readback && readback.found), JSON.stringify(readback), "REAL_SCRIPT_CAT_APPLY");

    // rollback：状态 diff 恢复 —— 1) 删除 apply 新建的 zyCreatedByAssistant 对象；2) 将被覆盖的既有文字层按快照逐字恢复
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
        rest.forEach((o, i) => {
          if (!o) return;
          if (i < pre.snapshot.length) {
            const t = String(o.text || "");
            if (t !== pre.snapshot[i]) { setText(o, pre.snapshot[i]); restored++; }
          }
        });
        if (c.requestRenderAll) c.requestRenderAll(); else if (c.renderAll) c.renderAll();
        const after = c.getObjects();
        const leaked = after.filter((o) => o && String(o.text || "").indexOf(val) >= 0).length;
        return { ok: after.length === pre.total && leaked === 0, removed: removed, restored: restored, leaked: leaked, total: after.length, preTotal: pre.total };
      } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
    }, { val: TEST_VAL, pre: pre });
    const postRm = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const c = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
      const o = c && (c.canvas || c);
      return o && typeof o.getObjects === "function" ? o.getObjects().length : null;
    });
    step("rollback", rollback.ok, JSON.stringify(rollback) + " remaining=" + postRm, "REAL_SCRIPT_CAT_ROLLBACK");

    // cleanup
    try { await adapter.removeScript(page, GM_UUID); step("cleanup", true, "removed"); } catch (e) { step("cleanup", false, String(e && e.message || e)); }
  } catch (e) { step("fatal", false, String(e && e.stack || e)); }
  finally { if (browser) await browser.close().catch(() => {}); }
  fs.writeFileSync(path.join(__dirname, "reports", "verify-gm-apply-report.json"), JSON.stringify(report, null, 1), "utf8");
  console.log(JSON.stringify(report, null, 1));
  process.exit(report.errors.length ? 1 : 0);

  function redactUrl(u) { try { return u.replace(/([?&](?:token|key|secret|sign|session)=)[^&#]*/gi, "$1***").slice(0, 150); } catch (e) { return String(u).slice(0, 150); } }
})();