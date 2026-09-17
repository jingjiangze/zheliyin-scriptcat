/**
 * UI-3 调查：抽屉打开态 × 原生 AI 面板并排比对。
 *
 * 目标（任务书 §五 / §十五）：不凭经验设计，从真实原生组件逐项读取视觉语言，
 * 找出我们抽屉里仍然"不像原生"的具体项，形成 UI-3 精修清单。
 *
 * 做法：
 *   1. 在真实页面里定位原生 AI 面板容器（.design-ai-panel / .ai-*-Cont 族）
 *   2. 枚举原生面板内的 button / input / select / textarea / 标题 / 分隔线 / 间距
 *   3. 打开我们的抽屉，在同一坐标系下采集同一批元素
 *   4. 输出并排表（供 UI-3 逐项收敛）
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
const LOG = path.join(WORK, "ui3-compare.log");
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
    args: [ "--no-first-run", "--no-default-browser-check"],
  });
  const page = await ctx.newPage();
  await page.goto(TARGET, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(7000);

  await page.evaluate(({ bundle }) => {
    const store = {};
    window.GM_getValue = (k, d) => (k in store ? store[k] : d);
    window.GM_setValue = (k, v) => { store[k] = v; };
    window.GM_addStyle = (css) => { const s = document.createElement("style"); s.textContent = css; (document.head || document.documentElement).appendChild(s); return s; };
    window.GM_xmlhttpRequest = function () { return { abort() {} }; };
    window.GM_setClipboard = () => {};
    window.GM_addElement = (t, o) => { const el = document.createElement(t); if (o && o.textContent) el.textContent = o.textContent; document.head.appendChild(el); return el; };
    window.unsafeWindow = window;
    try { (0, eval)(bundle); } catch (e) { window.__zyInjectErr = e.message; }
  }, { bundle });
  await page.waitForTimeout(2500);

  // ---------- 阶段 1：枚举原生页面里 AI 面板族的真实 DOM 与样式 ----------
  const nativeProbe = await page.evaluate(() => {
    const px = (v) => { const n = parseFloat(v); return isNaN(n) ? v : Math.round(n * 100) / 100; };
    const style = (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        sel: (el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") +
              (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : "")).slice(0, 90),
        geo: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        display: cs.display, position: cs.position, zIndex: cs.zIndex,
        bg: cs.backgroundColor, color: cs.color,
        radius: cs.borderRadius, border: cs.borderWidth + " " + cs.borderStyle + " " + cs.borderColor,
        shadow: cs.boxShadow === "none" ? "none" : cs.boxShadow.slice(0, 90),
        font: px(cs.fontSize) + "/" + cs.fontWeight + " " + cs.fontFamily.split(",")[0].replace(/["']/g, ""),
        pad: cs.padding, margin: cs.margin, gap: cs.gap,
        height: cs.height, width: cs.width,
        lineHeight: cs.lineHeight,
      };
    };

    // 找 AI 面板族：.design-ai-panel 及 .ai-* 前缀类
    const out = { aiFamily: [], roots: [] };
    const seen = new Set();
    document.querySelectorAll('[class*="ai-panel"], [class*="design-ai"], [class*="ai-btn"], [class*="ai-*-Cont"]').forEach((el) => {
      const k = el.tagName + "|" + el.className;
      if (seen.has(k)) return;
      seen.add(k);
      out.aiFamily.push(style(el));
    });

    // 找可能承载 AI 面板的容器（含"AI"文案的可视面板）
    document.querySelectorAll("div,section,aside").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 200 || r.width > 520 || r.height < 200) return;
      const cs = getComputedStyle(el);
      if (cs.position !== "absolute" && cs.position !== "fixed") return;
      if (el.children.length < 2) return;
      const t = (el.textContent || "").slice(0, 120);
      if (!/AI|智能|识别/.test(t)) return;
      out.roots.push(Object.assign(style(el), { textHead: t.replace(/\s+/g, " ").slice(0, 70), kids: el.children.length }));
    });

    // 右栏原生条目体例（对照我们的入口）
    const rb = document.querySelector(".rightPageBar.rightBar");
    out.rightBarSamples = [];
    if (rb) {
      Array.from(rb.children).forEach((c) => out.rightBarSamples.push(style(c)));
      // 右栏内可点的 li / div 行（原生 tab 体例）
      Array.from(rb.querySelectorAll("li")).slice(0, 14).forEach((li) => out.rightBarSamples.push(style(li)));
    }

    // 原生 input / select / button 样本
    out.inputs = Array.from(document.querySelectorAll("input[type=text],input[type=password],select,textarea")).slice(0, 10).map(style);
    out.buttons = Array.from(document.querySelectorAll("button,a.btn,div.btn")).filter((b) => {
      const r = b.getBoundingClientRect(); return r.width > 40 && r.height > 20 && r.height < 70;
    }).slice(0, 14).map(style);

    return out;
  });
  fs.writeFileSync(path.join(WORK, "ui3-native-probe.json"), JSON.stringify(nativeProbe, null, 2), "utf8");
  log("[NATIVE] aiFamily=" + nativeProbe.aiFamily.length + " roots=" + nativeProbe.roots.length +
      " rbSamples=" + nativeProbe.rightBarSamples.length + " inputs=" + nativeProbe.inputs.length + " buttons=" + nativeProbe.buttons.length);

  // ---------- 阶段 2：打开我们的抽屉，采集同一批元素 ----------
  await page.evaluate(() => { const g = document.querySelector(".new-guide"); if (g) g.remove(); });
  await page.click("#zy-native-ocr-tool-btn", { timeout: 15000 }).catch(e => log("[CLICK-ERR] " + e.message.slice(0, 160)));
  await page.waitForTimeout(1200);

  const ourProbe = await page.evaluate(() => {
    const px = (v) => { const n = parseFloat(v); return isNaN(n) ? v : Math.round(n * 100) / 100; };
    const style = (el, label) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        label,
        sel: (el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") +
              (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : "")).slice(0, 90),
        text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
        geo: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        display: cs.display, position: cs.position, zIndex: cs.zIndex,
        bg: cs.backgroundColor, color: cs.color,
        radius: cs.borderRadius, border: cs.borderWidth + " " + cs.borderStyle + " " + cs.borderColor,
        shadow: cs.boxShadow === "none" ? "none" : cs.boxShadow.slice(0, 90),
        font: px(cs.fontSize) + "/" + cs.fontWeight + " " + cs.fontFamily.split(",")[0].replace(/["']/g, ""),
        pad: cs.padding, margin: cs.margin, gap: cs.gap,
        height: cs.height, width: cs.width,
        lineHeight: cs.lineHeight,
        boxSizing: cs.boxSizing,
      };
    };
    const P = document.getElementById("zy-native-ocr-panel");
    const out = { entries: [], panel: null, internals: [] };
    if (!P) { out.error = "no panel"; return out; }
    out.panel = style(P, "panel");

    // 面板内全部可见元素（带文本或可交互），用于逐项比对
    const all = P.querySelectorAll("*");
    all.forEach((el) => {
      if (el.children.length > 0 && !/BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY/.test(el.tagName)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 6) return;
      out.internals.push(style(el, el.tagName.toLowerCase()));
    });

    // 关键元素点名
    const named = { ocrBtn: "#zy-native-ocr-btn", modeSelect: "#zy-ocr-mode-native", status: ".zy-status", head: ".zy-head", body: ".zy-body", title: ".zy-title", close: "#zy-native-close" };
    for (const [k, sel] of Object.entries(named)) {
      const el = P.querySelector(sel);
      if (el) out.entries.push(style(el, k));
    }
    // 抽屉外：右栏入口
    const tool = document.getElementById("zy-native-ocr-tool-btn");
    if (tool) out.entries.push(style(tool, "toolEntry"));
    return out;
  });
  fs.writeFileSync(path.join(WORK, "ui3-our-probe.json"), JSON.stringify(ourProbe, null, 2), "utf8");
  log("[OURS] panel=" + (ourProbe.panel ? JSON.stringify(ourProbe.panel.geo) : "none") +
      " entries=" + ourProbe.entries.length + " internals=" + ourProbe.internals.length);

  // ---------- 阶段 3：并排截图 ----------
  // 原生右栏（含原生入口 / 工具条）
  await page.screenshot({ path: path.join(WORK, "shot-ui3-ours-opened.png") });
  const rbShot = await page.evaluate(() => {
    const rb = document.querySelector(".rightPageBar.rightBar");
    if (!rb) return null; const r = rb.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  });
  if (rbShot) {
    await page.screenshot({ path: path.join(WORK, "shot-ui3-native-rightbar.png"), clip: rbShot });
  }
  // 我们的抽屉 clip
  if (ourProbe.panel) {
    const g = ourProbe.panel.geo;
    await page.screenshot({ path: path.join(WORK, "shot-ui3-ours-panel.png"), clip: { x: g.x, y: g.y, width: g.w, height: g.h } });
  }

  log("[END] " + new Date().toISOString());
  await ctx.close();
})().catch(e => { log("[FATAL] " + e.stack); process.exit(1); });
