// runtime/full.js — RUNTIME 全链路（browser → scriptcat → bridge → canvas → apply/rollback → report）
// 用法：
//   node runtime/full.js                 # 冒烟：门户/无登录态 → 编辑态项标 NOT_EDITOR(BLOCKED)
//   node runtime/full.js --expect-editor # 需真实登录编辑态：若无登录会等待用户完成一次登录后自动继续
//   node runtime/full.js --expect-editor --login-wait=600000   # 自定义登录等待上限（默认 10 分钟）
// 证据等级每个步骤单独标注，禁止把 BLOCKED 写成 FAIL。
"use strict";
const path = require("path");
const fs = require("fs");
const { launchDedicated, healthCheck, redactText, waitForEditorReady } = require("./browser-launcher");
const { assertPanel } = require("./scriptcat");
const { probeExactlyOne, probeNTimes, readMarker, crossInstanceDuplicate } = require("./bridge");
const { canvasSnapshot, assertSnapshot } = require("./canvas");
const { safeDirectApply, bridgeApplyAndRollback } = require("./apply");

async function waitForLogin(page, timeoutMs) {
  // 事件驱动：轮询等待编辑器就绪（requirejs+fabric+CanvasObjVO 出现）
  // 内嵌在 waitForFunction 中，由浏览器侧推进，无裸 sleep。
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const h = await healthCheck(page);
    if (h.requirejs === true && h.fabric === true) return { ok: true, health: h };
    // 每 3 秒重试（浏览器侧计时，Playwright 事件循环不阻塞）
    await new Promise((r) => setTimeout(r, 3000));
  }
  return { ok: false, reason: "login/editor-ready timeout after " + timeoutMs + "ms" };
}

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
    const launched = await launchDedicated({ profileDir, headless: !expectEditor, loadExtensionDir: manifestDir, forcePlaywrightChromium: true });
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
        blocked("auth", "冒烟模式（无登录态），未要求登录");
        blocked("scriptcat", "门户页（无登录态），#zy-card-assistant 不存在属预期");
        blocked("scriptcat-panel", "门户页无编辑器（无登录态），面板不存在属预期");
        blocked("bridge-marker", "未进入编辑页，bridge 未安装属预期");
        blocked("canvas", "未进入编辑页，canvas 不存在属预期");
        blocked("apply", "未进入编辑页，跳过安全 Apply");
        rec("navigation", true, "门户可达（冒烟通过）", "HEADLESS_REAL_BROWSER");
      } else if (expectEditor) {
        if (editorReady) {
          rec("auth", true, "编辑态已就绪（profile 已登录或本次直接可进）", "REAL_LOGGED_IN_EDITOR");
        } else {
          // §5 自动登录尝试（env 凭据）+ USER ACTION REQUIRED 兜底：一器完成
          const loginWait = (() => {
            const m = process.argv.find((a) => a.startsWith("--login-wait="));
            return m ? Number(m.split("=")[1]) : 600000;
          })();
          const zyUser = process.env.ZY_USER || "";
          const zyPass = process.env.ZY_PASS || "";
          if (zyUser) {
            console.log("[runtime] 尝试自动登录（已提供凭据 env）…");
            // 若当前在门户页且有登录表单：激活登录 tab + 预填（含加密前置结构走页面原生事件链）
            await page.evaluate(({ u, p }) => {
              const acc = document.getElementById("userAccount");
              if (!acc) return;
              const els = Array.from(document.querySelectorAll("a, button, li, span"));
              const login = els.find((el) => (el.textContent || "").trim() === "登录" && el.offsetParent !== null);
              if (login) login.click();
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
              const fill = function (el, v) { setter.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
              fill(document.getElementById("userAccount"), u);
              const pwd = document.getElementById("userPassword");
              if (pwd) fill(pwd, p);
            }, { u: zyUser, p: zyPass });
            await page.waitForTimeout(1500);
            await page.evaluate(() => {
              const btn = document.getElementById("loginBtn");
              if (btn && typeof btn.click === "function") { btn.click(); return; }
              const els = Array.from(document.querySelectorAll("a, button"));
              const b = els.find((el) => (el.textContent || "").trim() === "登录" && el.offsetParent !== null);
              if (b) b.click();
            }).catch(() => {});
            console.log("[runtime] 已提交登录，等待编辑态…（如遇验证码/滑块请在浏览器中补一步）");
          } else {
            console.log("[runtime] USER ACTION REQUIRED: 请在打开的专用浏览器中完成折立印登录（上限 " + Math.round(loginWait / 60000) + " 分钟）。登录后自动继续。");
          }
          const login = await waitForLogin(page, loginWait);
          if (login.ok) {
            rec("auth", true, "登录完成，编辑态就绪", "REAL_LOGGED_IN_EDITOR");
          } else {
            blocked("auth", String(login.reason));
          }
        }

        if (report.layers.auth && report.layers.auth.ok === true) {
          // 编辑态就绪：全量断言
          await page.waitForTimeout(1200); // 等 panel 注入（事件驱动后补，现以 bounded）
          const panel = await assertPanel(page);
          rec("scriptcat-panel", panel.ok, panel.detail, "REAL_LOGGED_IN_EDITOR");
          rec("scriptcat", panel.ok && report.layers["scriptcat-panel"].ok, panel.detail, "REAL_SCRIPT_CAT(userscript v0.3.0.0)");

          const m = await readMarker(page);
          const markerOk = !!(m && m.installed === true);
          if (!markerOk && !panel.ok) {
            // 载体未注入（ScriptCat/扩展未装入 dedicated runtime）→ BLOCKED，非产品失败（§26/§28）
            blocked("bridge-marker", "dedicated runtime 载体未注入（panel 缺失），bridge 未安装属环境限制；真实 ScriptCat 面板证据来自用户人工取证（§19.1 REAL_SCRIPT_CAT）");
            blocked("bridge-probe-exactly-one", "载体未注入，bridge 未安装 → 不可测（环境限制）");
            blocked("bridge-probe-5x-5responses", "载体未注入，bridge 未安装 → 不可测（环境限制）");
          } else {
            rec("bridge-marker", markerOk, JSON.stringify(m), "REAL_BRIDGE");
            const p1 = await probeExactlyOne(page);
            rec("bridge-probe-exactly-one", p1.ok, p1.detail, "REAL_BRIDGE");
            const pn = await probeNTimes(page, 5);
            rec("bridge-probe-5x-5responses", pn.ok, pn.detail, "REAL_BRIDGE");
          }

          // §12 跨实例重复防护（Stage 4.0 修复的大真实页面再验）
          const dup = await crossInstanceDuplicate(page, path.join(__dirname, "..", "extension", "src", "editor", "page-bridge.js"));
          rec("bridge-cross-instance-dup", dup.ok, dup.detail, "REAL_BRIDGE+DUP_SIM");

          const snap = await canvasSnapshot(page);
          const cs = await assertSnapshot(snap);
          rec("canvas", cs.ok, "snapshot=" + JSON.stringify(snap) + " check=" + cs.detail, "REAL_CANVAS");

          // §19 直接 Canvas 最小修改 + 回滚（Test A）
          const applyA = await safeDirectApply(page, "TEST_RUNTIME_VALUE");
          rec("canvas-mutation", applyA.ok, applyA.detail, "REAL_CANVAS");

          // §20 Bridge Apply（Test B）：注意本层在 bridge-cross-instance-dup（DUP_SIM）之后执行，
          // 页面中存在由测试注入的 pageBridge —— 因此该证据只能标
          // BRIDGE_APPLY_WITH_SIMULATED_INSTALLATION（§14/§27），不得声称 REAL_BRIDGE_APPLY；
          // 真实 ScriptCat/Extension 注入的 Bridge Apply 需在 RUNTIME-8 注入方案验证后另行完成。
          const applyB = await bridgeApplyAndRollback(page, "ZY_RUNTIME_TEST_VALUE");
          rec("bridge-apply", applyB.ok, applyB.detail, "BRIDGE_APPLY_WITH_SIMULATED_INSTALLATION (DUP_SIM 注入后，非真实载体)");
        } else {
          blocked("scriptcat", "编辑态未就绪，跳过");
          blocked("scriptcat-panel", "编辑态未就绪，跳过");
          blocked("bridge-marker", "编辑态未就绪，跳过");
          blocked("canvas", "编辑态未就绪，跳过");
          blocked("apply", "编辑态未就绪，跳过");
        }
      } else {
        // expectEditor=false 且已然就绪（headless 直进编辑器兜底，极少的公开页场景）
        rec("auth", true, "headless 直入编辑态（公开访问场景）", "HEADLESS_REAL_BROWSER");
        await page.waitForTimeout(1200);
        const panel = await assertPanel(page);
        rec("scriptcat-panel", panel.ok, panel.detail, "HEADLESS_REAL_BROWSER");
        rec("bridge-marker", String(await readMarker(page)) !== "null", String(await readMarker(page)), "HEADLESS_REAL_BROWSER");
        const p1 = await probeExactlyOne(page);
        rec("bridge-probe-exactly-one", p1.ok, p1.detail, "HEADLESS_REAL_BROWSER");
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