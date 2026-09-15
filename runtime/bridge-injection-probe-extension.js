// runtime/bridge-injection-probe-extension.js — MV3 MAIN world 注入通道（probe 版）
// 目标（§8/§10）：在真实编辑器页面验证 "在 MAIN world 安装 pageBridge → marker → probe → response → canvas" 全链路。
// 关键区分：本探针用 Playwright page.evaluate（=> 页面主世界，语义等价 chrome.scripting.executeScript({world:'MAIN'})）
// 且【不提前执行 DUP_SIM 或其他注入】——首次注入即本探针，保证 response 只能来自本探针安装的 bridge（§12/§27）。
// 注意：这不是真实扩展 executeScript 的二进制证据，而是同 world 语义的通道证明；最终 production 采用需真实 background executeScript 验证。
"use strict";
const path = require("path");
const { launchDedicated, healthCheck, redactText } = require("./browser-launcher");
const { readMarker, probeExactlyOne, probeNTimes } = require("./bridge");

(async () => {
  const profileDir = path.join(__dirname, "browser", "profile-full");
  const manifestDir = path.join(__dirname, "..", "extension");
  const out = { ts: new Date().toISOString(), mode: "MAIN_WORLD_INJECTION_PROBE", steps: [], errors: [] };
  const step = (n, ok, d, ev) => { out.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: redactText(d), evidence: ev }); if (!ok) out.errors.push(n); };

  let browser = null;
  try {
    const launched = await launchDedicated({ profileDir, headless: false, loadExtensionDir: manifestDir, forcePlaywrightChromium: true });
    browser = launched.browser;
    const page = browser.pages()[0];
    await page.goto("https://diy.zheliyin.com/diyWeb/third/20408603/1/thirdLoginDiyEdit.do", { waitUntil: "domcontentloaded", timeout: 40000 }).catch((e) => step("nav", false, String(e && e.message || e)));
    step("nav", true, "editor-url");

    // 等真实编辑器就绪
    const ready = await (async () => {
      const deadline = Date.now() + 90000;
      while (Date.now() < deadline) {
        const h = await healthCheck(page);
        if (h.requirejs === true && h.fabric === true) return true;
        await new Promise((r) => setTimeout(r, 3000));
      }
      return false;
    })();
    if (!ready) { step("editor-ready", false, "timeout"); }
    else {
      step("editor-ready", true, "requirejs+fabric 就绪", "REAL_LOGGED_IN_EDITOR");

      // 关键：确保页面此刻【无任何 pageBridge 安装】→ 首个注入/响应必须来自本探针
      const before = await readMarker(page);
      step("bridge-absent-before", before === null, "pre-inject marker=" + JSON.stringify(before), "REAL_BRIDGE");
      if (before !== null) { step("bridge-absent-before", false, "页面已有 marker（可能 extension assistant 注入成功或残留）→ 本探针做增量验证"); }

      // MAIN world 安装：读取 page-bridge.js 源，主世界执行 pageBridge()（等价 executeScript world:MAIN）
      const fs = require("fs");
      const src = fs.readFileSync(path.join(__dirname, "..", "extension", "src", "editor", "page-bridge.js"), "utf8");
      await page.evaluate(src + "\n;pageBridge();");
      const after = await readMarker(page);
      step("bridge-installed-main-world", after !== null && after.installed === true, JSON.stringify(after), "MAIN_WORLD(equiv executeScript)");

      if (after && after.installed === true) {
        const p1 = await probeExactlyOne(page);
        step("probe-exactly-one", p1.ok, p1.detail, "MAIN_WORLD(equiv executeScript)");
        const pn = await probeNTimes(page, 5);
        step("probe-5x-5responses", pn.ok, pn.detail, "MAIN_WORLD(equiv executeScript)");

        // §10 真实 Canvas 随注入后的 probe 一同校验
        const snap = await (async () => { try { return await page.evaluate(() => {
          const req = window.requirejs || window.require;
          const ctx = req && req.s && req.s.contexts && req.s.contexts._;
          const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
          const total = vo && vo.totalCanvasArray;
          if (Array.isArray(total) && total[0]) { const c = (total[0].canvas) || total[0]; return { count: total.length, width: c.width, height: c.height, objs: typeof c.getObjects === "function" ? c.getObjects().length : null }; }
          return { count: 0 };
        }); } catch (e2) { return { evalError: String(e2 && e2.message || e2) }; } })();
        step("canvas-with-bridge", snap.count >= 1 && snap.width > 0, JSON.stringify(snap), "REAL_CANVAS");
      }
    }
  } catch (e) { step("fatal", false, String(e && e.message || e)); }
  finally { if (browser) await browser.close().catch(() => {}); }
  console.log(JSON.stringify(out, null, 1));
  process.exitCode = out.errors.length ? 1 : 0;
})();