/**
 * UI-1c : multi-viewport responsive probe  (READ ONLY, no production code touched)
 *
 * Verifies §十八: rightBar / bg-material / switch-content / canvas geometry must be
 * measured on the REAL page across 1366 / 1440 / 1600 / 1920 rather than assumed.
 * Also captures cropped close-ups for §二十一 screenshot comparison.
 */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const URL =
  "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const EXE =
  "C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe";
const OUT = __dirname;

const VIEWPORTS = [
  { w: 1366, h: 768, tag: "1366" },
  { w: 1440, h: 900, tag: "1440" },
  { w: 1600, h: 900, tag: "1600" },
  { w: 1920, h: 1080, tag: "1920" },
];

const PROBE = () => {
  const q = (s) => document.querySelector(s);
  const geo = (sel) => {
    const el = q(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      sel,
      rect: {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      },
      pos: cs.position,
      z: cs.zIndex,
      bg: cs.backgroundColor,
      right: Math.round(window.innerWidth - r.right),
      display: cs.display,
      visible: r.width > 0 && r.height > 0,
    };
  };

  const rightBar = q(".rightPageBar.rightBar");
  const rbRect = rightBar ? rightBar.getBoundingClientRect() : null;

  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    scrollW: document.documentElement.scrollWidth,
    docW: document.documentElement.clientWidth,
    hasHScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
    rightBar: geo(".rightPageBar.rightBar"),
    switchContent: geo(".switch-content"),
    btnSwitch: geo(".btn-switch"),
    tabPageLayer: geo(".tabPageLayer"),
    bgMaterial: geo(".bg-material"),
    layerWrap: geo(".layerWrap"),
    toolBar: geo(".toolBar"),
    extraBar: geo(".extraBar"),
    aiFangzhi: geo("#ai-fangzhiCont"),
    aiSheji: geo("#ai-shejiCont"),
    // canvas host candidates - the editor painting surface
    canvasHost: geo("#rectCanvas"),
    canvasBground: geo("#canvasBground"),
    // derived: usable gap between left material panel and rightBar
    leftPanel: geo("#leftMenu") || geo(".leftMenu") || geo("#mMaterial"),
    derived: rbRect
      ? {
          rightBarX: Math.round(rbRect.x),
          rightBarW: Math.round(rbRect.width),
          gapLeftOfRightBar: Math.round(rbRect.x - 0),
          bgMaterialX: (() => {
            const b = q(".bg-material");
            return b ? Math.round(b.getBoundingClientRect().x) : null;
          })(),
        }
      : null,
  };
};

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const results = [];

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    try {
      await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(9000);
      // dismiss the onboarding coach-marks if present so geometry is clean
      try {
        await page.evaluate(() => {
          document
            .querySelectorAll(
              ".fixed-menu-btn, .close-tips, #fixed-menu-tips, .js-guide-close"
            )
            .forEach((n) => (n.style.visibility = "hidden"));
        });
      } catch (_) {}

      const probe = await page.evaluate(PROBE);
      probe.tag = vp.tag;
      results.push(probe);

      await page.screenshot({
        path: path.join(OUT, `vp-${vp.tag}-full.png`),
      });

      // crop the right rail region for close visual comparison (§二十一)
      if (probe.rightBar) {
        const r = probe.rightBar.rect;
        const x = Math.max(0, r.x - 60);
        await page.screenshot({
          path: path.join(OUT, `vp-${vp.tag}-rightrail.png`),
          clip: {
            x,
            y: r.y,
            width: Math.min(vp.w - x, r.w + 60),
            height: Math.min(vp.h - r.y, r.h),
          },
        });
      }

      // crop the top toolbar for design-language comparison
      await page.screenshot({
        path: path.join(OUT, `vp-${vp.tag}-toolbar.png`),
        clip: { x: 0, y: 0, width: vp.w, height: 100 },
      });
    } catch (e) {
      results.push({ tag: vp.tag, error: String(e && e.message) });
    }
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(
    path.join(OUT, "ui-audit3.json"),
    JSON.stringify(results, null, 2)
  );
  console.log("DONE viewports=" + results.length);
})();
