/**
 * 诊断 2：真实 ScriptCat 环境下，入口为何不挂载。
 *
 * 上一个诊断证明「Node 手工注入 → 入口正常」。
 * 本诊断找出「真实 ScriptCat 环境」的差异点：
 *   - readyState 在 init 时的值
 *   - rightBar 在 init 时是否已存在
 *   - DOMContentLoaded 是否已错过（readyState=complete 时才注入 → 事件永不触发）
 *   - 是否运行在 iframe 里
 *   - observer 是否真的挂上
 */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const CHROME = "C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe";
const WORK = __dirname;
const USER_DATA = path.join(WORK, "profile-ui2");
const MODDIR = path.join(WORK, "modules");
const TARGET = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const SCRIPT = path.join(WORK, "..", "baseline-038", "userscript-038.js");
const LOG = path.join(WORK, "ui3-lateinject-diagnose.log");
const log = (...a) => fs.appendFileSync(LOG, a.map(x => (typeof x === "string" ? x : JSON.stringify(x))).join(" ") + "\n", "utf8");

const ORDER = [
  "fields__field-core.js", "core__config-core.js", "ai__ai-client.js", "editor__page-bridge.js",
  "ocr__baidu-provider.js", "ocr__fallback-policy.js", "ocr__candidate-normalizer.js", "ocr__credential-crypto.js",
];

(async () => {
  fs.writeFileSync(LOG, "", "utf8");
  log("[START] " + new Date().toISOString());
  const main = fs.readFileSync(SCRIPT, "utf8");
  const bundle = ORDER.map(n => fs.readFileSync(path.join(MODDIR, n), "utf8")).join("\n;\n") + "\n;\n" + main;

  const ctx = await chromium.launchPersistentContext(USER_DATA, {
    executablePath: CHROME, headless: false,
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
    args: ["--no-first-run", "--no-default-browser-check"],
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push("PAGEERR: " + e.message));

  // ============ 场景 A：早注入（domcontentloaded 之后立刻，rightBar 可能未就绪）============
  await page.goto(TARGET, { waitUntil: "domcontentloaded", timeout: 60000 });
  const stateA = await page.evaluate(() => ({
    readyState: document.readyState,
    hasRightBar: !!document.querySelector(".rightPageBar.rightBar"),
    hasBody: !!document.body,
    isIframe: window.top !== window.self,
  }));
  log("[A-PRE-INJECT-STATE] " + JSON.stringify(stateA));

  const injA = await page.evaluate(({ bundle }) => {
    const store = {};
    window.GM_getValue = (k, d) => (k in store ? store[k] : d);
    window.GM_setValue = (k, v) => { store[k] = v; };
    window.GM_addStyle = (css) => { const s = document.createElement("style"); s.textContent = css; (document.head || document.documentElement).appendChild(s); return s; };
    window.GM_xmlhttpRequest = function () { return { abort() {} }; };
    window.GM_setClipboard = () => {};
    window.GM_addElement = (t, o) => { const el = document.createElement(t); if (o && o.textContent) el.textContent = o.textContent; document.head.appendChild(el); return el; };
    window.unsafeWindow = window;
    try { (0, eval)(bundle); return null; } catch (e) { return e.message; }
  }, { bundle });
  log("[A-INJECT] error=" + JSON.stringify(injA));

  for (const t of [500, 2000, 5000, 10000]) {
    await page.waitForTimeout(t === 500 ? 500 : t - (t === 2000 ? 500 : t === 5000 ? 2000 : 5000));
    const s = await page.evaluate(() => ({
      t: Date.now(),
      hasRightBar: !!document.querySelector(".rightPageBar.rightBar"),
      entry: !!document.getElementById("zy-native-ocr-tool-btn"),
      panel: !!document.getElementById("zy-native-ocr-panel"),
      legacy: !!document.getElementById("zy-card-assistant"),
    }));
    log(`[A-T+${t}ms] ` + JSON.stringify(s));
  }

  // ============ 场景 B：晚注入（页面完全加载后才注入，模拟 @run-at document-idle 已错过 DCL）============
  const page2 = await ctx.newPage();
  const errs2 = [];
  page2.on("pageerror", e => errs2.push("PAGEERR: " + e.message));
  await page2.goto(TARGET, { waitUntil: "load", timeout: 60000 });
  await page2.waitForTimeout(8000);
  const stateB = await page2.evaluate(() => ({
    readyState: document.readyState,
    hasRightBar: !!document.querySelector(".rightPageBar.rightBar"),
    hasBody: !!document.body,
    isIframe: window.top !== window.self,
  }));
  log("[B-PRE-INJECT-STATE] " + JSON.stringify(stateB));

  const injB = await page2.evaluate(({ bundle }) => {
    const store = {};
    window.GM_getValue = (k, d) => (k in store ? store[k] : d);
    window.GM_setValue = (k, v) => { store[k] = v; };
    window.GM_addStyle = (css) => { const s = document.createElement("style"); s.textContent = css; (document.head || document.documentElement).appendChild(s); return s; };
    window.GM_xmlhttpRequest = function () { return { abort() {} }; };
    window.GM_setClipboard = () => {};
    window.GM_addElement = (t, o) => { const el = document.createElement(t); if (o && o.textContent) el.textContent = o.textContent; document.head.appendChild(el); return el; };
    window.unsafeWindow = window;
    try { (0, eval)(bundle); return null; } catch (e) { return e.message; }
  }, { bundle });
  log("[B-INJECT] error=" + JSON.stringify(injB));
  await page2.waitForTimeout(3000);
  const afterB = await page2.evaluate(() => ({
    readyState: document.readyState,
    entry: !!document.getElementById("zy-native-ocr-tool-btn"),
    panel: !!document.getElementById("zy-native-ocr-panel"),
    legacy: !!document.getElementById("zy-card-assistant"),
    stylesInjected: !!document.querySelector("style") && Array.from(document.querySelectorAll("style")).some(s => (s.textContent || "").includes("zy-native-ocr-panel")),
  }));
  log("[B-AFTER] " + JSON.stringify(afterB));

  // ============ 场景 C：iframe 检测（编辑器可能在 iframe 内）============
  const frames = page.frames().map(f => ({ url: f.url().slice(0, 100), name: f.name() }));
  log("[C-FRAMES] count=" + frames.length + " " + JSON.stringify(frames));

  if (errs.length) log("[A-PAGEERRS] " + JSON.stringify(errs.slice(0, 5)));
  if (errs2.length) log("[B-PAGEERRS] " + JSON.stringify(errs2.slice(0, 5)));
  log("[END] " + new Date().toISOString());
  await ctx.close();
})().catch(e => { log("[FATAL] " + e.stack); process.exit(1); });
