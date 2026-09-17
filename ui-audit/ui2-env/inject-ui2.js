/**
 * UI-2 真机注入：按 @require 顺序加载依赖模块，再执行主 userscript。
 * 目的: 在真实折立印页面上获得 #zy-native-ocr-panel / #zy-native-ocr-tool-btn 的实测几何 (UI-RISK-09)
 * 依赖模块从本地仓库 extension/src 读取（等价于 ScriptCat 从 @require 拉取的内容）。
 */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const CHROME = "C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe";
const WORK = __dirname;
const REPO = path.resolve(WORK, "..", "..");
const USER_DATA = path.join(WORK, "profile-ui2");
const EXT = path.join(WORK, "scriptcat-ext");
const TARGET = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";

const LOG = path.join(WORK, "ui2-inject.log");
const log = (...a) => {
  const line = a.map(x => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
  fs.appendFileSync(LOG, line + "\n", "utf8");
};

// @require 顺序（与 userscript 头部一致）
const REQUIRES = [
  "extension/src/fields/field-core.js",
  "extension/src/core/config-core.js",
  "extension/src/ai/ai-client.js",
  "extension/src/editor/page-bridge.js",
  "extension/src/ocr/baidu-provider.js",
  "extension/src/ocr/fallback-policy.js",
  "extension/src/ocr/candidate-normalizer.js",
  "extension/src/ocr/credential-crypto.js",
];

(async () => {
  fs.writeFileSync(LOG, "", "utf8");
  log("[START] " + new Date().toISOString());

  const main = fs.readFileSync(path.join(WORK, "..", "baseline-038", "userscript-038.js"), "utf8");
  const mods = REQUIRES.map(rel => {
    const p = path.join(REPO, rel);
    return { rel, code: fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null };
  });
  log("[MODS] " + JSON.stringify(mods.map(m => ({ rel: m.rel, bytes: m.code ? m.code.length : -1 }))));

  const ctx = await chromium.launchPersistentContext(USER_DATA, {
    executablePath: CHROME,
    headless: false,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    args: [
      "--disable-extensions-except=" + EXT,
      "--load-extension=" + EXT,
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });

  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push("PAGEERR: " + e.message));

  await page.goto(TARGET, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(7000);

  // GM shim + 按序注入依赖模块 + 主脚本
  const res = await page.evaluate(({ mods, main }) => {
    const out = { steps: [] };
    try {
      // ---- GM shim ----
      const store = {};
      window.GM_getValue = (k, d) => (k in store ? store[k] : d);
      window.GM_setValue = (k, v) => { store[k] = v; };
      window.GM_addStyle = (css) => { const s = document.createElement("style"); s.textContent = css; (document.head || document.documentElement).appendChild(s); return s; };
      window.GM_xmlhttpRequest = function () { return { abort() {} }; };
      window.GM_setClipboard = () => {};
      window.GM_addElement = (t, o) => { const el = document.createElement(t); if (o && o.textContent) el.textContent = o.textContent; (o && o.parentNode || document.head).appendChild(el); return el; };
      window.unsafeWindow = window;
      window.__ZY_UI2_PROBE__ = true;
      out.steps.push("gm-shim ok");

      // ---- @require 模块（顶层 const 需转为 var 以便跨 eval 可见；此处用间接 eval 保持作用域）----
      for (const m of mods) {
        if (!m.code) { out.steps.push("MISSING " + m.rel); continue; }
        try {
          (0, eval)(m.code);           // 间接 eval -> 全局作用域
          out.steps.push("mod ok " + m.rel);
        } catch (e) {
          out.steps.push("mod FAIL " + m.rel + " :: " + e.message);
        }
      }

      // ---- 主脚本 ----
      try {
        (0, eval)(main);
        out.steps.push("main ok");
      } catch (e) {
        out.steps.push("main FAIL :: " + e.message);
      }
    } catch (e) {
      out.steps.push("FATAL :: " + e.message);
    }
    return out;
  }, { mods, main }).catch(e => ({ steps: ["evaluate failed: " + e.message] }));
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
        fontSize: cs.fontSize, fontWeight: cs.fontWeight,
        fontFamily: cs.fontFamily.slice(0, 70),
        boxShadow: cs.boxShadow,
        borderLeft: cs.borderLeftWidth + " " + cs.borderLeftColor,
      };
    };
    const rb = document.querySelector(".rightPageBar.rightBar");
    return {
      panel: g("#zy-native-ocr-panel"),
      panelHead: g("#zy-native-ocr-panel .zy-head"),
      toolBtn: g("#zy-native-ocr-tool-btn"),
      legacy: g("#zy-card-assistant"),
      rightBar: g(".rightPageBar.rightBar"),
      rightBarChildCount: rb ? rb.children.length : -1,
      rightBarLast: rb && rb.lastElementChild ? { tag: rb.lastElementChild.tagName, cls: rb.lastElementChild.className, txt: (rb.lastElementChild.textContent || "").trim().slice(0, 24) } : null,
      rightBarChildTags: rb ? Array.from(rb.children).map(c => c.tagName + "." + (c.className || "").split(" ")[0]) : null,
      hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      gmKeys: Object.keys(window).filter(k => /^GM_/.test(k)),
      hasPanelGlobal: typeof GM_getValue,
    };
  }).catch(e => ({ err: e.message }));
  log("[GEO] " + JSON.stringify(geo, null, 1));
  if (errs.length) log("[PAGEERRS] " + JSON.stringify(errs.slice(0, 10), null, 1));

  await page.screenshot({ path: path.join(WORK, "shot-ui2-real.png") });
  fs.writeFileSync(path.join(WORK, "ui2-inject.json"), JSON.stringify({ res, geo, errs }, null, 2), "utf8");

  log("[END]");
  await ctx.close();
})().catch(e => { log("[FATAL] " + e.stack); process.exit(1); });
