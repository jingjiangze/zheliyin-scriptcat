/**
 * UI-2 功能回归（保护性验证，§十六）
 * 边界：只验证「UI 改动是否影响既有接线」，不改 OCR 技术逻辑。
 * 检查项：
 *  R1 入口唯一性（面板数恒为 1 / 按钮数恒为 1）
 *  R2 重复挂载守卫（连续 ensure 不产生第二份）
 *  R3 status 双目标更新（setStatus 同时写入抽屉与浮窗节点）
 *  R4 OCR 按钮存在且绑定（点击不抛错；引擎未就绪时 early-click 不崩）
 *  R5 Baidu 设置区存在（AK/SK/保存/测试）
 *  R6 抽屉 toggle 双向 + 关闭按钮
 *  R7 legacy 浮窗未挂载（OCR-only）
 *  R8 面板不遮挡原生右栏（宽度与 x 关系）
 */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const CHROME = "C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe";
const WORK = __dirname;
const USER_DATA = path.join(WORK, "profile-ui2");
const EXT = path.join(WORK, "scriptcat-ext");
const MODDIR = path.join(WORK, "modules");
const TARGET = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const SCRIPT = path.join(WORK, "..", "baseline-038", "userscript-038.js");

const LOG = path.join(WORK, "ui2-regress.log");
const log = (...a) => fs.appendFileSync(LOG, a.map(x => (typeof x === "string" ? x : JSON.stringify(x))).join(" ") + "\n", "utf8");

const ORDER = [
  "fields__field-core.js", "core__config-core.js", "ai__ai-client.js", "editor__page-bridge.js",
  "ocr__baidu-provider.js", "ocr__fallback-policy.js", "ocr__candidate-normalizer.js", "ocr__credential-crypto.js",
];

(async () => {
  fs.writeFileSync(LOG, "", "utf8");
  const main = fs.readFileSync(SCRIPT, "utf8");
  const bundle = ORDER.map(n => fs.readFileSync(path.join(MODDIR, n), "utf8")).join("\n;\n") + "\n;\n" + main;

  const ctx = await chromium.launchPersistentContext(USER_DATA, {
    executablePath: CHROME, headless: false,
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
    args: ["--disable-extensions-except=" + EXT, "--load-extension=" + EXT, "--no-first-run", "--no-default-browser-check"],
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push("PAGEERR: " + e.message));
  await page.goto(TARGET, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(7000);

  // 注入
  await page.evaluate(({ bundle }) => {
    const store = {};
    window.GM_getValue = (k, d) => (k in store ? store[k] : d);
    window.GM_setValue = (k, v) => { store[k] = v; };
    window.GM_addStyle = (css) => { const s = document.createElement("style"); s.textContent = css; (document.head || document.documentElement).appendChild(s); return s; };
    window.GM_xmlhttpRequest = function () { return { abort() {} }; };
    window.GM_setClipboard = () => {};
    window.GM_addElement = (t, o) => { const el = document.createElement(t); if (o && o.textContent) el.textContent = o.textContent; document.head.appendChild(el); return el; };
    window.unsafeWindow = window;
    (0, eval)(bundle);
  }, { bundle });
  await page.waitForTimeout(2500);

  const results = {};

  // R1 唯一性
  results.R1 = await page.evaluate(() => ({
    panels: document.querySelectorAll("#zy-native-ocr-panel").length,
    tools: document.querySelectorAll("#zy-native-ocr-tool-btn").length,
    ocrBtns: document.querySelectorAll("#zy-native-ocr-btn").length,
    legacy: document.querySelectorAll("#zy-card-assistant").length,
  }));

  // R2 重复挂载守卫：连续触发 MutationObserver 场景
  results.R2 = await page.evaluate(() => {
    const before = document.querySelectorAll("#zy-native-ocr-panel").length;
    // 模拟 DOM 变动触发 observer
    for (let i = 0; i < 5; i++) {
      const d = document.createElement("div");
      d.style.display = "none";
      document.body.appendChild(d);
      d.remove();
    }
    return { before, after: document.querySelectorAll("#zy-native-ocr-panel").length };
  });
  await page.waitForTimeout(1500);
  results.R2.afterWait = await page.evaluate(() => document.querySelectorAll("#zy-native-ocr-panel").length);

  // R3 status 双目标：调用 setStatus 的可见效果（通过触发 UI 交互间接验证：点击识别按钮后状态应变化）
  results.R3 = await page.evaluate(() => ({
    drawerStatus: document.querySelectorAll("#zy-native-status").length,
    drawerStatusText: (document.querySelector("#zy-native-status") || {}).textContent,
    allStatusNodes: document.querySelectorAll(".zy-status").length,
  }));

  // R4 early click（引擎未就绪时点击不崩）
  await page.evaluate(() => { const g = document.querySelector(".new-guide"); if (g) g.remove(); });
  await page.click("#zy-native-ocr-tool-btn").catch(() => {});
  await page.waitForTimeout(600);
  const preErrCount = errs.length;
  await page.click("#zy-native-ocr-btn", { timeout: 8000 }).catch(e => log("[R4-click-note] " + e.message.slice(0, 100)));
  await page.waitForTimeout(3000);
  results.R4 = await page.evaluate(() => ({
    statusAfterClick: (document.querySelector("#zy-native-status") || {}).textContent,
    btnDisabled: !!((document.querySelector("#zy-native-ocr-btn") || {}).disabled),
  }));
  results.R4.newErrors = errs.slice(preErrCount);

  // R5 百度设置区
  results.R5 = await page.evaluate(() => ({
    ak: !!document.querySelector("#zy-baidu-ak-native"),
    sk: !!document.querySelector("#zy-baidu-sk-native"),
    save: !!document.querySelector("#zy-baidu-save-native"),
    test: !!document.querySelector("#zy-baidu-test-native"),
    details: !!document.querySelector("#zy-native-ocr-panel details.zy-settings"),
  }));

  // R6 toggle 双向 + 关闭按钮
  const st1 = await page.evaluate(() => (document.querySelector("#zy-native-ocr-panel") || {}).style.display);
  await page.click("#zy-native-close").catch(() => {});
  await page.waitForTimeout(500);
  const st2 = await page.evaluate(() => (document.querySelector("#zy-native-ocr-panel") || {}).style.display);
  await page.click("#zy-native-ocr-tool-btn").catch(() => {});
  await page.waitForTimeout(500);
  const st3 = await page.evaluate(() => (document.querySelector("#zy-native-ocr-panel") || {}).style.display);
  results.R6 = { afterOpen: st1, afterClose: st2, afterReopen: st3 };

  // R7 legacy
  results.R7 = await page.evaluate(() => ({
    legacy: !!document.getElementById("zy-card-assistant"),
    legacyButtons: document.querySelectorAll("#zy-card-assistant button").length,
  }));

  // R8 面板不遮挡原生右栏 + 面板几何
  results.R8 = await page.evaluate(() => {
    const p = document.getElementById("zy-native-ocr-panel");
    const rb = document.querySelector(".rightPageBar.rightBar");
    const pr = p ? p.getBoundingClientRect() : null;
    const rr = rb ? rb.getBoundingClientRect() : null;
    return {
      panel: pr ? { x: Math.round(pr.x), w: Math.round(pr.width), right: Math.round(pr.right) } : null,
      rightBar: rr ? { x: Math.round(rr.x), w: Math.round(rr.width) } : null,
      overlap: (pr && rr) ? (Math.round(pr.right) > Math.round(rr.x)) : null,
      toolBtnInsideRightBar: (() => {
        const t = document.getElementById("zy-native-ocr-tool-btn");
        if (!t || !rb) return null;
        const tr = t.getBoundingClientRect();
        const rbr = rb.getBoundingClientRect();
        return { toolX: Math.round(tr.x), toolW: Math.round(tr.width), rbX: Math.round(rbr.x), rbW: Math.round(rbr.width), contained: Math.round(tr.x) >= Math.round(rbr.x) && Math.round(tr.right) <= Math.round(rbr.right) + 1 };
      })(),
      hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });

  results.pageErrors = errs.slice(0, 10);

  log("[REGRESS] " + JSON.stringify(results, null, 1));
  fs.writeFileSync(path.join(WORK, "ui2-regress.json"), JSON.stringify(results, null, 2), "utf8");
  await page.screenshot({ path: path.join(WORK, "shot-ui2-regress.png") });
  await ctx.close();
})().catch(e => { log("[FATAL] " + e.stack); process.exit(1); });
