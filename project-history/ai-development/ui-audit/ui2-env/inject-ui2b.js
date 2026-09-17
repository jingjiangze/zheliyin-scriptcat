/**
 * UI-2 真机注入 v2：按 ScriptCat 语义 —— 把 @require 模块与主脚本【拼接】到同一作用域执行。
 * 依据: field-core.js 头部注释「通过拼接/加载顺序引入，作用域共享」+ "use strict" 下间接 eval 不泄漏声明。
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

const LOG = path.join(WORK, "ui2-inject2.log");
const log = (...a) => fs.appendFileSync(LOG, a.map(x => (typeof x === "string" ? x : JSON.stringify(x))).join(" ") + "\n", "utf8");

// 拼接顺序 = userscript @require 顺序 + 主脚本
const ORDER = [
  "fields__field-core.js",
  "core__config-core.js",
  "ai__ai-client.js",
  "editor__page-bridge.js",
  "ocr__baidu-provider.js",
  "ocr__fallback-policy.js",
  "ocr__candidate-normalizer.js",
  "ocr__credential-crypto.js",
];

(async () => {
  fs.writeFileSync(LOG, "", "utf8");
  log("[START] " + new Date().toISOString());

  const main = fs.readFileSync(path.join(WORK, "..", "baseline-038", "userscript-038.js"), "utf8");
  const parts = ORDER.map(n => {
    const p = path.join(MODDIR, n);
    if (!fs.existsSync(p)) return { n, code: "" };
    return { n, code: fs.readFileSync(p, "utf8") };
  });
  log("[PARTS] " + JSON.stringify(parts.map(p => ({ n: p.n, b: p.code.length }))));

  // 拼接：模块在前，主脚本在后。主脚本自身的 ==UserScript== header 需剔除或保留（注释无害）。
  const bundle = parts.map(p => p.code).join("\n;\n") + "\n;\n" + main;
  log("[BUNDLE] bytes=" + bundle.length);
  fs.writeFileSync(path.join(WORK, "bundle-ui2.js"), bundle, "utf8");

  const ctx = await chromium.launchPersistentContext(USER_DATA, {
    executablePath: CHROME, headless: false,
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
    args: [ "--no-first-run", "--no-default-browser-check"],
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push("PAGEERR: " + e.message));
  await page.goto(TARGET, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(7000);

  const res = await page.evaluate(({ bundle }) => {
    const out = { steps: [] };
    const store = {};
    window.GM_getValue = (k, d) => (k in store ? store[k] : d);
    window.GM_setValue = (k, v) => { store[k] = v; };
    window.GM_addStyle = (css) => { const s = document.createElement("style"); s.textContent = css; (document.head || document.documentElement).appendChild(s); return s; };
    window.GM_xmlhttpRequest = function () { return { abort() {} }; };
    window.GM_setClipboard = () => {};
    window.GM_addElement = (t, o) => { const el = document.createElement(t); if (o && o.textContent) el.textContent = o.textContent; (o && o.parentNode || document.head).appendChild(el); return el; };
    window.unsafeWindow = window;
    out.steps.push("gm-shim ok");
    try {
      (0, eval)(bundle);
      out.steps.push("bundle ok");
    } catch (e) {
      out.steps.push("bundle FAIL :: " + e.message);
      out.stack = String(e.stack || "").split("\n").slice(0, 6);
    }
    return out;
  }, { bundle }).catch(e => ({ steps: ["evaluate failed: " + e.message] }));
  log("[INJECT] " + JSON.stringify(res, null, 1));

  await page.waitForTimeout(4000);

  const geo = await page.evaluate(() => {
    const g = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        position: cs.position, zIndex: cs.zIndex, display: cs.display,
        bg: cs.backgroundColor, color: cs.color, radius: cs.borderRadius,
        fontSize: cs.fontSize, fontWeight: cs.fontWeight, fontFamily: cs.fontFamily.slice(0, 70),
        boxShadow: cs.boxShadow, borderLeft: cs.borderLeftWidth + " " + cs.borderLeftColor,
      };
    };
    const rb = document.querySelector(".rightPageBar.rightBar");
    const panel = document.querySelector("#zy-native-ocr-panel");
    return {
      panel, panelHead: g("#zy-native-ocr-panel .zy-head"), panelBody: g("#zy-native-ocr-panel .zy-body"),
      panelGeo: g("#zy-native-ocr-panel"),
      toolBtn: g("#zy-native-ocr-tool-btn"),
      legacy: g("#zy-card-assistant"),
      rightBar: g(".rightPageBar.rightBar"),
      rightBarChildCount: rb ? rb.children.length : -1,
      rightBarChildTags: rb ? Array.from(rb.children).map(c => c.tagName + "." + String(c.className || "").split(" ")[0]) : null,
      panelParent: panel && panel.parentElement ? panel.parentElement.tagName + "." + String(panel.parentElement.className || "").split(" ")[0] : null,
      hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  }).catch(e => ({ err: e.message }));
  log("[GEO] " + JSON.stringify(geo, null, 1));
  if (errs.length) log("[PAGEERRS] " + JSON.stringify(errs.slice(0, 8), null, 1));

  await page.screenshot({ path: path.join(WORK, "shot-ui2-real.png") });
  fs.writeFileSync(path.join(WORK, "ui2-inject2.json"), JSON.stringify({ res, geo, errs }, null, 2), "utf8");
  log("[END]");
  await ctx.close();
})().catch(e => { log("[FATAL] " + e.stack); process.exit(1); });
