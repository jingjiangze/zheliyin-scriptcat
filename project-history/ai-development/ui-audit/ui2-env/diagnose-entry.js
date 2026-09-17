/**
 * 诊断：右栏「图片文字识别」入口为何点不开。
 *
 * 复现用户的真实首访场景，逐层排查：
 *   A. 脚本是否注入成功
 *   B. 入口是否创建
 *   C. 入口是否被遮挡（elementFromPoint 命中测试）
 *   D. 各遮挡候选元素的 z-index / pointer-events / 尺寸
 *   E. 不移除遮罩直接点击 → 能否打开（真实用户路径）
 *   F. 移除遮罩后点击 → 能否打开（排除法）
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
const LOG = path.join(WORK, "ui3-entry-diagnose.log");
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
  await page.goto(TARGET, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(7000);

  const injErr = await page.evaluate(({ bundle }) => {
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
  await page.waitForTimeout(2500);
  log("[A-INJECT] error=" + JSON.stringify(injErr));

  // ---- B/C/D：入口存在性与遮挡命中测试（不动任何东西） ----
  const diag = await page.evaluate(() => {
    const tool = document.getElementById("zy-native-ocr-tool-btn");
    if (!tool) return { fatal: "tool entry not found" };
    const r = tool.getBoundingClientRect();
    const cx = Math.round(r.x + r.width / 2);
    const cy = Math.round(r.y + r.height / 2);
    const hit = document.elementFromPoint(cx, cy);
    const describe = (el) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      const rr = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        id: el.id || null,
        cls: typeof el.className === "string" ? el.className.slice(0, 80) : null,
        zIndex: cs.zIndex, position: cs.position, display: cs.display,
        pointerEvents: cs.pointerEvents, opacity: cs.opacity, visibility: cs.visibility,
        geo: { x: Math.round(rr.x), y: Math.round(rr.y), w: Math.round(rr.width), h: Math.round(rr.height) },
      };
    };
    // 沿命中链向上走，找出真正吃点击的元素
    const chain = [];
    let cur = hit;
    for (let i = 0; i < 6 && cur; i++) { chain.push(describe(cur)); cur = cur.parentElement; }

    // 全局扫描：哪些元素覆盖了入口中心点（按面积/层级排序）
    const covering = [];
    document.querySelectorAll("body *").forEach((el) => {
      const rr = el.getBoundingClientRect();
      if (rr.width <= 0 || rr.height <= 0) return;
      if (cx < rr.left || cx > rr.right || cy < rr.top || cy > rr.bottom) return;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return;
      covering.push(describe(el));
    });
    covering.sort((a, b) => (parseInt(b.zIndex) || 0) - (parseInt(a.zIndex) || 0));

    return {
      toolGeo: describe(tool),
      centerPoint: { x: cx, y: cy },
      hitElement: describe(hit),
      hitIsToolOrChild: !!(hit && (hit === tool || tool.contains(hit))),
      hitChain: chain,
      coveringCount: covering.length,
      covering: covering.slice(0, 8),
      // 遮罩状态
      newGuide: (() => {
        const g = document.querySelector(".new-guide");
        if (!g) return null;
        const cs = getComputedStyle(g);
        const rr = g.getBoundingClientRect();
        return { cls: g.className, display: cs.display, zIndex: cs.zIndex, opacity: cs.opacity,
                 pointerEvents: cs.pointerEvents, geo: { x: Math.round(rr.x), y: Math.round(rr.y), w: Math.round(rr.width), h: Math.round(rr.height) } };
      })(),
    };
  });
  log("[B-D-DIAG] " + JSON.stringify(diag, null, 1));

  // ---- E：真实用户路径 —— 不移除遮罩，直接点入口 ----
  const displayBefore = await page.evaluate(() => ((document.querySelector("#zy-native-ocr-panel") || {}).style || {}).display);
  let clickErr = null;
  try {
    await page.click("#zy-native-ocr-tool-btn", { timeout: 6000 });
  } catch (e) { clickErr = e.message.split("\n")[0].slice(0, 220); }
  await page.waitForTimeout(900);
  const displayAfterPlainClick = await page.evaluate(() => ((document.querySelector("#zy-native-ocr-panel") || {}).style || {}).display);
  log("[E-PLAIN-CLICK] displayBefore=" + JSON.stringify(displayBefore) +
      " displayAfter=" + JSON.stringify(displayAfterPlainClick) +
      " clickError=" + JSON.stringify(clickErr));

  // ---- F：移除遮罩后再点 ----
  const removed = await page.evaluate(() => { const g = document.querySelector(".new-guide"); if (g) { g.remove(); return true; } return false; });
  let clickErr2 = null;
  try {
    await page.click("#zy-native-ocr-tool-btn", { timeout: 8000 });
  } catch (e) { clickErr2 = e.message.split("\n")[0].slice(0, 220); }
  await page.waitForTimeout(900);
  const displayAfterGuideRemoved = await page.evaluate(() => ((document.querySelector("#zy-native-ocr-panel") || {}).style || {}).display);
  log("[F-AFTER-GUIDE-REMOVED] guideWasPresent=" + removed +
      " displayAfter=" + JSON.stringify(displayAfterGuideRemoved) +
      " clickError=" + JSON.stringify(clickErr2));

  // ---- 结论判定 ----
  const culprit = diag.covering && diag.covering.find(c => c.pointerEvents !== "none" && (parseInt(c.zIndex) || 0) > 100);
  log("[VERDICT] " + JSON.stringify({
    entryExists: !!(diag.toolGeo),
    hitIsToolOrChild: diag.hitIsToolOrChild,
    topBlocker: culprit || null,
    newGuidePresent: !!diag.newGuide,
    worksWithoutGuide: displayAfterGuideRemoved === "flex",
    worksWithGuide: displayAfterPlainClick === "flex",
  }, null, 1));

  if (errs.length) log("[PAGEERRS] " + JSON.stringify(errs.slice(0, 5)));
  await page.screenshot({ path: path.join(WORK, "shot-ui3-entry-diagnose.png") });
  log("[END] " + new Date().toISOString());
  await ctx.close();
})().catch(e => { log("[FATAL] " + e.stack); process.exit(1); });
