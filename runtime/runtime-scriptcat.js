// runtime/runtime-scriptcat.js — RUNTIME-8.2 全自动：真实 ScriptCat + 自动安装 probe + 真实编辑器验证
// 流程（§三十四）：Playwright Chromium → 加载真实 ScriptCat → 复用已登录 profile → installByCode 装 probe
//   → 验证已保存/启用 → 打开真实 editor → GM_addElement(production pageBridge) → marker → probe → canvas(→ apply/rollback 可选)
// 证据等级：REAL_SCRIPT_CAT_EXTENSION / REAL_SCRIPT_CAT_INSTALL / REAL_SCRIPT_CAT_USER_SCRIPT / ...
// 禁止 DUP_SIM（§二十二）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { healthCheck, redactText } = require("./browser-launcher");
const adapter = require("./scriptcat-adapter");

const EXT_ID = adapter.EXT_ID;
const PROBE_UUID = "runtime8-probe-uuid-001";
const PROBE_NAME = "Zheliyin Runtime 8 Probe";
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";

(async () => {
  const profileSrc = path.join(__dirname, "browser", "profile-full");
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  const out = { ts: new Date().toISOString(), steps: [], errors: [] };
  const step = (n, ok, d, ev) => { out.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: redactText(String(d || "")).slice(0, 500), evidence: ev || "n/a" }); if (!ok) out.errors.push(n); };
  const reportPath = path.join(__dirname, "reports", "scriptcat-runtime-report.json");

  // 准备 probe code：fixture + 替换 production pageBridge 源码
  let probeCode = fs.readFileSync(path.join(__dirname, "fixtures", "runtime8-scriptcat-probe.user.js"), "utf8");
  let bridgeSrc = fs.readFileSync(path.join(__dirname, "..", "extension", "src", "editor", "page-bridge.js"), "utf8");
  // 注入片段要执行 pageBridge()；production page-bridge.js 是 function pageBridge(){...} 声明
  bridgeSrc = bridgeSrc.replace(/^function\s+pageBridge\s*\(/i, "function pageBridge(");
  if (!/pageBridge\s*\(\)/.test(bridgeSrc)) bridgeSrc += "\n;try{pageBridge();}catch(e){console.error('[zy-rt8] pageBridge init', e);}";
  probeCode = probeCode.replace("__ZY_RUNTIME8_BRIDGE_SRC__", () => bridgeSrc.replace(/\n/g, "\n"));
  step("probe-prepared", probeCode.includes("Zheliyin Runtime 8 Probe") && probeCode.includes("GM_addElement"), "bridge src embedded len=" + bridgeSrc.length, "SOURCE_OF_TRUTH=page-bridge.js");

  // profile 策略：直接复用已登录 profile-full（原位加载 ScriptCat，避免 cookie 跨 profile 解密失败）
  // 不再复制 profile（复制会丢失 Chrome cookie 解密 key）
  let browser = null;
  try {
    const profileDir2 = path.join(__dirname, "browser", "profile-full");
    step("profile-reuse", true, "直接复用 profile-full（保留登录态 cookie）", "n/a");

    browser = await chromium.launchPersistentContext(profileDir2, {
      channel: "chromium", headless: true,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${scDir}`, `--load-extension=${scDir}`],
      viewport: { width: 1440, height: 900 }
    });
    step("launch+scriptcat", true, "Playwright Chromium + real ScriptCat(" + EXT_ID + ")", "REAL_SCRIPT_CAT_EXTENSION");

    const page = browser.pages()[0];
    // wait service worker alive via options page
    await page.goto("chrome-extension://" + EXT_ID + "/src/options.html#/script/list", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(4000);
    step("options-loaded", true, "ScriptCat options page", "REAL_SCRIPT_CAT_EXTENSION");

    // §19 先检查 probe 是否已装（幂等）
    const existing = await adapter.isInstalled(page, PROBE_NAME);
    if (existing && existing.uuid) {
      step("probe-precheck", true, "probe already installed uuid=" + existing.uuid, "REAL_SCRIPT_CAT_INSTALL");
    }

    // §9/§12 installByCode（消息契约来自源码证据）
    try {
      const installed = await adapter.installByCode(page, { uuid: PROBE_UUID, code: probeCode, upsertBy: "user" });
      step("installByCode", true, "installed=" + JSON.stringify(installed).slice(0, 200), "REAL_SCRIPT_CAT_INSTALL");
    } catch (e) {
      step("installByCode", false, String(e && e.message || e).slice(0, 300));
    }

    // 验证已保存 + 启用（§19）：ScriptCat script 记录状态字段为 status（源码证据 ea={enable:1,disable:2}）
    const afterInstall = await adapter.isInstalled(page, PROBE_NAME);
    const installedOk = !!(afterInstall && afterInstall.uuid);
    const enabled = !!afterInstall && afterInstall.status === 1;
    step("probe-saved", installedOk, JSON.stringify({ uuid: afterInstall && afterInstall.uuid, name: PROBE_NAME }), "REAL_SCRIPT_CAT_INSTALL");
    step("probe-enabled", installedOk && enabled, "status=" + (afterInstall && afterInstall.status) + " (1=enable, 源码 ea={enable:1})", "REAL_SCRIPT_CAT_INSTALL");

    // 打开真实编辑器（应触发 probe 运行）
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => step("nav-editor", false, String(e && e.message || e)));
    step("nav-editor", true, redactText(page.url()), "REAL_LOGGED_IN_EDITOR");

    // 安装后强制 reload：ScriptCat 需要重新注册 userScripts 并注入到新 doc（同一会话导航不足）
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => step("reload-editor", false, String(e && e.message || e)));
    step("reload-editor", true, "reloaded after install", "REAL_SCRIPT_CAT_USER_SCRIPT");

    // 等编辑器 + collected console & pageerror
    const collected = [];
    const pageErrors = [];
    page.on("console", (msg) => {
      const t = msg.text();
      if (t.indexOf("[zy-runtime8]") >= 0 || /scriptcat|ScriptCat|userscript/i.test(t)) collected.push(t.slice(0, 200));
    });
    page.on("pageerror", (err) => pageErrors.push(String(err && err.message || err).slice(0, 300)));
    // 等编辑器就绪后：确认 ScriptCat 注入标记（ScriptCat 会在 DOM 暴露一些特征；也查 meta/全局）
    let ready = false;
    let lastHealth = null;
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
      const h = await healthCheck(page);
      lastHealth = h;
      if (h.requirejs === true && h.fabric === true) { ready = true; break; }
      await new Promise((r) => setTimeout(r, 3000));
    }
    let diagBody = null;
    if (!ready) {
      diagBody = await page.evaluate(() => ({ title: document.title, body: (document.body ? document.body.innerText : "").slice(0, 300) })).catch(() => null);
    }
    step("editor-ready", ready, ready ? "requirejs+fabric" : "diag=" + JSON.stringify(diagBody), ready ? "REAL_LOGGED_IN_EDITOR" : "n/a");
    // 注：probe 是 @run-at document-idle @match diy.zheliyin.com/*；注入后在 window 无痕判断——ScriptCat 通过 userScripts/isolated world 注入，
    // console 才是可靠证据（collected）。此处仅确认编辑器就绪，实际注入证据靠 gm/res/console logs。
    if (ready) {
      await page.waitForTimeout(8000); // 等 probe 执行
      const marker = await page.evaluate(() => { const cb = window.__ZY_CARD_ASSISTANT_BRIDGE__; return cb ? { installed: cb.installed === true, via: cb.via || null } : null; });
      step("bridge-marker", !!(marker && marker.installed), JSON.stringify(marker), "REAL_SCRIPT_CAT_BRIDGE");
      // DOM 痕迹（userscript 与主文档共享 DOM；isolated world console 可能剥离）
      const domMarks = await page.evaluate(() => {
        const el = document.documentElement;
        const attrs = Array.prototype.slice.call(el.attributes).map((a) => a.name).filter((n) => n.indexOf("data-zy-rt8") >= 0);
        return attrs;
      });
      step("probe-dom-marks", domMarks.length > 0, "marks=" + JSON.stringify(domMarks), "REAL_SCRIPT_CAT_USER_SCRIPT");

      // probe（§16/§21 exactly-one ×2）
      const p1 = await page.evaluate(() => new Promise((res) => {
        let n = 0;
        const on = (e) => { if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === "probeResult") n += 1; };
        window.addEventListener("message", on);
        window.postMessage({ source: "zy-card-assistant", type: "probe", rt8: true }, location.origin);
        setTimeout(() => { window.removeEventListener("message", on); res(n); }, 1500);
      }));
      step("probe-exactly-one", p1 === 1, "responses=" + p1, "REAL_SCRIPT_CAT_BRIDGE");

      // canvas
      const snap = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
        const total = vo && vo.totalCanvasArray;
        if (Array.isArray(total) && total[0]) { const c = (total[0].canvas) || total[0]; return { count: total.length, width: c.width, height: c.height, objs: typeof c.getObjects === "function" ? c.getObjects().length : null }; }
        return { count: 0 };
      });
      step("canvas", snap.count >= 1 && snap.width > 0, JSON.stringify(snap), "REAL_SCRIPT_CAT_CANVAS");

      // console/pageerror 佐证：probe 真实执行证据
      const gm = collected.find((t) => t.indexOf("[zy-runtime8] gm-add-element") >= 0);
      const scLogs = collected.filter((t) => /scriptcat|ScriptCat|userscript/i.test(t)).slice(0, 8);
      const res = collected.find((t) => t.indexOf("[zy-runtime8] result") >= 0);
      step("gm-add-element-executed", !!gm, (gm || "no gm log") + " | pageErrors=" + JSON.stringify(pageErrors.slice(0, 6)) + " | scLogs=" + JSON.stringify(scLogs), "REAL_SCRIPT_CAT_GM_ADD_ELEMENT");
      step("probe-console-result", !!res, (res || "no result log"), "REAL_SCRIPT_CAT_BRIDGE");
    }

    // §27 清理：卸载 probe（可选，标记 disable 或删除）。为保持证据，默认删除。
    try {
      if (afterInstall && afterInstall.uuid) {
        await adapter.removeScript(page, afterInstall.uuid);
        step("probe-removed", true, "uuid=" + afterInstall.uuid, "n/a");
      }
    } catch (e) { step("probe-removed", false, String(e && e.message || e).slice(0, 200)); }
  } catch (e) {
    step("fatal", false, String(e && e.message || e).slice(0, 400));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.writeFileSync(reportPath, JSON.stringify(out, null, 1), "utf8");
  console.log("[zy-runtime-scriptcat] errors=" + out.errors.length + " → " + reportPath);
  process.exit(out.errors.length ? 1 : 0);
})();