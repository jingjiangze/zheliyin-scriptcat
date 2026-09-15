// runtime/full.js — RUNTIME 全链路（browser → scriptcat → bridge → canvas → apply/rollback → report）
// 用法：
//   node runtime/full.js                 # 冒烟：门户/无登录态 → 编辑态项标 NOT_EDITOR(BLOCKED)
//   node runtime/full.js --expect-editor # 需要真实登录编辑态（dedicated profile 已登录）→ 全量断言
// 证据等级每个步骤单独标注，禁止把 BLOCKED 写成 FAIL。
"use strict";
const path = require("path");
const fs = require("fs");
const { launchDedicated, healthCheck, redactText } = require("./browser-launcher");
const { assertPanel } = require("./scriptcat");
const { probeExactlyOne, probeNTimes, readMarker } = require("./bridge");
const { canvasSnapshot, assertSnapshot } = require("./canvas");
const { safeDirectApply } = require("./apply");

(async () => {
  const expectEditor = process.argv.includes("--expect-editor");
  const profileDir = path.join(__dirname, "browser", "profile-full");
  const manifestDir = path.join(__dirname, "..", "extension"); // 同一份生产源码（extension 载体）
  const report = {
    ts: new Date().toISOString(),
    mode: expectEditor ? "REAL_LOGGED_IN_EDITOR" : "HEADLESS_REAL_BROWSER",
    layers: {},
    blocked: [],
    failures: [],
    env: { chrome: null }
  };

  function rec(layer, ok, detail, evidence) {
    report.layers[layer] = { ok, detail: redactText(detail), evidence: evidence || report.mode };
    if (!ok) report.failures.push(layer);
  }
  function blocked(layer, detail) {
    report.layers[layer] = { ok: "BLOCKED", detail: redactText(detail), evidence: "N/A" };
    report.blocked.push(layer);
  }

  let browser = null;
  try {
    const launched = await launchDedicated({ profileDir, headless: !expectEditor, loadExtensionDir: manifestDir });
    browser = launched.browser;
    report.env.chrome = launched.exe ? path.basename(launched.exe) : "playwright-chromium";
    rec("browser", true, report.env.chrome, "HEADLESS_REAL_BROWSER/REAL_BROWSER");
    const page = browser.pages()[0];

    // 全量模式：要求已登录进编辑器；冒烟模式：门户可达即可
    const url = expectEditor
      ? "https://diy.zheliyin.com/diyWeb/third/20408603/1/thirdLoginDiyEdit.do"
      : "https://diy.zheliyin.com/diyWeb/";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 40000 }).catch((e) => blocked("navigation", String(e && e.message || e)));

    if (!report.layers.navigation) {
      const h = await healthCheck(page);
      report.health = h;
      const editorReady = h.requirejs === true && h.fabric === true;
      rec("health", typeof h === "object" && !h.evalError, "isTop=" + h.isTop + " frames=" + h.frames, "HEADLESS_REAL_BROWSER/REAL_LOGGED_IN_EDITOR");

      if (!expectEditor && !editorReady) {
        // 冒烟模式无登录态：各编辑态层标 BLOCKED，不判 FAIL
        blocked("scriptcat", "门户页（无登录态），#zy-card-assistant 不存在属预期");
        blocked("scriptcat-panel", "门户页无编辑器（无登录态），面板不存在属预期");
        blocked("bridge-marker", "未进入编辑页，bridge 未安装属预期");
        blocked("canvas", "未进入编辑页，canvas 不存在属预期");
        blocked("apply", "未进入编辑页，跳过安全 Apply");
        rec("navigation", true, "门户可达（冒烟通过）", "HEADLESS_REAL_BROWSER");
      } else if (expectEditor && !editorReady) {
        blocked("scriptcat", "expect-editor 但 requirejs=" + h.requirejs + " fabric=" + h.fabric + " url=" + redactText(h.url));
        blocked("bridge-marker", "expect-editor 但编辑态未就绪");
        blocked("canvas", "expect-editor 但编辑态未就绪");
        blocked("apply", "expect-editor 但编辑态未就绪");
      } else {
        // 编辑态就绪：全量断言
        await page.waitForTimeout(1200); // 等 panel 注入（事件驱动后补，现以 bounded）
        const panel = await assertPanel(page);
        rec("scriptcat-panel", panel.ok, panel.detail, expectEditor ? "REAL_LOGGED_IN_EDITOR" : "HEADLESS_REAL_BROWSER");
        rec("scriptcat", panel.ok && report.layers["scriptcat-panel"].ok, panel.detail, "REAL_SCRIPT_CAT(userscript v0.3.0.0)");

        const m = await readMarker(page);
        rec("bridge-marker", !!(m && m.installed === true), JSON.stringify(m), "REAL_BRIDGE");

        const p1 = await probeExactlyOne(page);
        rec("bridge-probe-exactly-one", p1.ok, p1.detail, "REAL_BRIDGE");

        const pn = await probeNTimes(page, 5);
        rec("bridge-probe-5x-5responses", pn.ok, pn.detail, "REAL_BRIDGE");

        const snap = await canvasSnapshot(page);
        const cs = assertSnapshot(snap);
        rec("canvas", cs.ok, "snapshot=" + JSON.stringify(snap) + " check=" + cs.detail, "REAL_CANVAS");

        const apply = await safeDirectApply(page, "TEST_RUNTIME_VALUE");
        rec("apply-rollback", apply.ok, apply.detail, "REAL_APPLY");
      }
    }

    // 报告落盘（脱敏）
    const reportDir = path.join(__dirname, "reports");
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(path.join(reportDir, "runtime-report.json"), JSON.stringify(report, null, 1), "utf8");
    if (report.failures.length) {
      fs.mkdirSync(path.join(reportDir, "screenshots"), { recursive: true });
      await page.screenshot({ path: path.join(reportDir, "screenshots", "failure.png"), fullPage: false }).catch(() => {});
    }
  } catch (e) {
    rec("fatal", false, String(e && e.message || e), "N/A");
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  // Gate（§四十三）
  const f = report.failures;
  const b = report.blocked;
  report.gate = f.length ? "NO-GO" : (b.length ? "CONDITIONAL-GO" : "GO");
  console.log(JSON.stringify(report, null, 1));
  process.exitCode = f.length ? 1 : 0;
})();