/**
 * UI-2 验证：真机实测改造后的入口与面板几何/样式，并与改造前基线对比。
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

const LOG = path.join(WORK, "ui2-verify.log");
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
  log("[BUNDLE] bytes=" + bundle.length);

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

  const res = await page.evaluate(({ bundle }) => {
    const steps = [];
    const store = {};
    window.GM_getValue = (k, d) => (k in store ? store[k] : d);
    window.GM_setValue = (k, v) => { store[k] = v; };
    window.GM_addStyle = (css) => { const s = document.createElement("style"); s.textContent = css; (document.head || document.documentElement).appendChild(s); return s; };
    window.GM_xmlhttpRequest = function () { return { abort() {} }; };
    window.GM_setClipboard = () => {};
    window.GM_addElement = (t, o) => { const el = document.createElement(t); if (o && o.textContent) el.textContent = o.textContent; document.head.appendChild(el); return el; };
    window.unsafeWindow = window;
    try { (0, eval)(bundle); steps.push("bundle ok"); } catch (e) { steps.push("bundle FAIL :: " + e.message); }
    return steps;
  }, { bundle }).catch(e => ["evaluate failed: " + e.message]);
  log("[INJECT] " + JSON.stringify(res));

  await page.waitForTimeout(3000);

  const snap = async (tag) => {
    const g = await page.evaluate(() => {
      const geo = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          tag: el.tagName, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
          position: cs.position, zIndex: cs.zIndex, display: cs.display, visibility: cs.visibility,
          bg: cs.backgroundColor, color: cs.color, radius: cs.borderRadius,
          fontSize: cs.fontSize, fontWeight: cs.fontWeight,
          fontFamily: cs.fontFamily.slice(0, 72),
          boxShadow: cs.boxShadow, borderBottom: cs.borderBottomWidth + " " + cs.borderBottomColor,
          borderLeft: cs.borderLeftWidth + " " + cs.borderLeftColor,
          cursor: cs.cursor, padding: cs.padding,
        };
      };
      const rb = document.querySelector(".rightPageBar.rightBar");
      const tool = document.getElementById("zy-native-ocr-tool-btn");
      const panel = document.getElementById("zy-native-ocr-panel");
      return {
        toolBtn: geo("#zy-native-ocr-tool-btn"),
        toolText: tool ? (tool.textContent || "").trim() : null,
        toolIconClass: tool && tool.querySelector("i") ? tool.querySelector("i").className : null,
        panel: geo("#zy-native-ocr-panel"),
        panelHead: geo("#zy-native-ocr-panel .zy-head"),
        panelTitle: geo("#zy-native-ocr-panel .zy-title"),
        panelClose: geo("#zy-native-ocr-panel #zy-native-close"),
        ocrBtn: geo("#zy-native-ocr-panel #zy-native-ocr-btn"),
        modeSelect: geo("#zy-native-ocr-panel #zy-ocr-mode-native"),
        status: geo("#zy-native-ocr-panel .zy-status"),
        baiduInput: geo("#zy-native-ocr-panel #zy-baidu-ak-native"),
        legacyPanel: !!document.getElementById("zy-card-assistant"),
        rightBarChildren: rb ? rb.children.length : -1,
        rightBarTags: rb ? Array.from(rb.children).map(c => c.tagName + "#" + (c.id || "." + String(c.className || "").split(" ")[0])) : null,
        hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        // 检查 z-index 是否已降至原生量级
        maxZyZ: panel ? getComputedStyle(panel).zIndex : null,
      };
    });
    fs.writeFileSync(path.join(WORK, `ui2-snap-${tag}.json`), JSON.stringify(g, null, 2), "utf8");
    log(`[SNAP-${tag}] ` + JSON.stringify(g, null, 1));
    return g;
  };

  const closed = await snap("closed");
  await page.screenshot({ path: path.join(WORK, "shot-ui2-closed.png") });

  // 页面新手引导层 .new-guide.on 会拦截点击（真实首访场景）；验证 UI 时先移除遮罩
  const guideRemoved = await page.evaluate(() => {
    const g = document.querySelector(".new-guide");
    if (g) { g.remove(); return true; }
    return false;
  });
  log("[GUIDE] removed=" + guideRemoved);

  // 点击原生体例入口 → 展开抽屉
  await page.click("#zy-native-ocr-tool-btn", { timeout: 15000 }).catch(e => log("[CLICK-ERR] " + e.message.slice(0, 200)));
  await page.waitForTimeout(1200);
  const opened = await snap("opened");
  await page.screenshot({ path: path.join(WORK, "shot-ui2-opened.png") });

  // 再次点击 → 收起（验证 toggle 双向）
  await page.click("#zy-native-ocr-tool-btn", { timeout: 15000 }).catch(e => log("[CLICK2-ERR] " + e.message.slice(0, 120)));
  await page.waitForTimeout(800);
  const reclosed = await snap("reclosed");
  fs.writeFileSync(path.join(WORK, "ui2-snap-reclosed.json"), JSON.stringify(reclosed, null, 2), "utf8");

  // 带抽屉再做一次全页截图（用于与原生 AI 面板并排比对，UI-3 用）
  await page.screenshot({ path: path.join(WORK, "shot-ui2-opened-full.png"), fullPage: false });

  if (errs.length) log("[PAGEERRS] " + JSON.stringify(errs.slice(0, 8), null, 1));
  log("[END] toggle=" + JSON.stringify({
    closed: closed.panel ? closed.panel.display : null,
    opened: opened.panel ? opened.panel.display : null,
    reclosed: reclosed.panel ? reclosed.panel.display : null,
    openedPanelGeo: opened.panel ? { x: opened.panel.x, y: opened.panel.y, w: opened.panel.w, h: opened.panel.h, z: opened.panel.zIndex } : null,
    openedHeadGeo: opened.panelHead ? { x: opened.panelHead.x, y: opened.panelHead.y, w: opened.panelHead.w, h: opened.panelHead.h, bg: opened.panelHead.bg } : null,
    closedHScroll: closed.hScroll, openedHScroll: opened.hScroll,
  }));
  await ctx.close();
})().catch(e => { log("[FATAL] " + e.stack); process.exit(1); });
