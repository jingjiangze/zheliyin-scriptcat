/**
 * UI-1 audit: inspect the real zheliyin editor page.
 * Read-only. No production code modified.
 */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const TARGET = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const OUT_DIR = process.argv[2] || "C:\\Users\\Administrator\\WorkBuddy\\2026-09-16-12-13-35\\ui-audit";
fs.mkdirSync(OUT_DIR, { recursive: true });

const INSPECT = `(() => {
  const pick = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      cls: (typeof el.className === 'string' ? el.className : '').trim() || null,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      display: cs.display, position: cs.position, zIndex: cs.zIndex,
      fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight, lineHeight: cs.lineHeight,
      color: cs.color, background: cs.backgroundColor,
      border: cs.border, borderRadius: cs.borderRadius,
      padding: cs.padding, margin: cs.margin,
      boxShadow: cs.boxShadow === 'none' ? null : cs.boxShadow.slice(0, 120),
      overflow: cs.overflow, transition: cs.transition === 'all 0s ease 0s' ? null : cs.transition,
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60) || null,
    };
  };
  const q = (s) => { try { return document.querySelector(s); } catch(e) { return null; } };
  const qa = (s) => { try { return Array.from(document.querySelectorAll(s)).slice(0, 12); } catch(e) { return []; } };

  const out = { url: location.href, title: document.title, viewport: { w: innerWidth, h: innerHeight }, dpr: devicePixelRatio };

  // --- top-level structural scan ---
  const ids = Array.from(document.querySelectorAll('[id]')).map(e => e.id).filter(Boolean);
  out.idCount = ids.length;
  out.idsSample = ids.slice(0, 400);
  out.idKeywords = ids.filter(i => /right|bar|panel|drawer|tool|layer|attr|prop|mat|tab|menu|sider|aside|diy|editor|canvas|ocr/i.test(i)).slice(0, 200);

  // --- class scan for native design language ---
  const classFreq = {};
  document.querySelectorAll('[class]').forEach(e => {
    const c = typeof e.className === 'string' ? e.className : '';
    c.split(/\\s+/).filter(Boolean).forEach(x => { classFreq[x] = (classFreq[x] || 0) + 1; });
  });
  out.classKeywords = Object.entries(classFreq)
    .filter(([k]) => /btn|button|input|panel|drawer|bar|tab|title|header|close|item|list|tool|menu|dialog|modal|select|label|text/i.test(k))
    .sort((a, b) => b[1] - a[1]).slice(0, 220)
    .map(([k, v]) => k + ' ×' + v);

  // --- right bar area ---
  const rightCandidates = ['.rightPageBar', '.rightBar', '.right-bar', '.rightbar'];
  out.rightBar = rightCandidates.map(s => ({ sel: s, el: pick(q(s)), childCount: q(s) ? q(s).children.length : 0 }));

  // buttons inside right bar
  const rb = q('.rightPageBar') || q('.rightBar');
  if (rb) {
    out.rightBarChildren = Array.from(rb.children).slice(0, 25).map(el => ({
      ...pick(el),
      html: el.outerHTML.slice(0, 300),
    }));
    out.rightBarButtons = Array.from(rb.querySelectorAll('button, a, li, div[onclick], [class*=btn]')).slice(0, 30).map(el => ({
      ...pick(el),
      onclick: el.getAttribute('onclick'),
      dataAttrs: Array.from(el.attributes).filter(a => a.name.startsWith('data-')).map(a => a.name + '=' + a.value).join(' '),
    }));
  }

  // --- candidate design tokens: sample real buttons/inputs/panels ---
  const sampleButtons = qa('button, .btn, [class*=btn], input[type=button], input[type=submit]');
  out.buttons = sampleButtons.map(pick);
  const sampleInputs = qa('input[type=text], input[type=password], input:not([type]), textarea, select');
  out.inputs = sampleInputs.map(pick);
  const samplePanels = qa('[class*=panel], [class*=drawer], [class*=dialog], [class*=modal], [class*=popup], [class*=layer]');
  out.panels = samplePanels.map(el => ({ ...pick(el), childCount: el.children.length }));

  // --- CSS variables on :root and body ---
  const rootCS = getComputedStyle(document.documentElement);
  const vars = {};
  for (let i = 0; i < rootCS.length; i++) {
    const n = rootCS[i];
    if (n.startsWith('--')) vars[n] = rootCS.getPropertyValue(n).trim().slice(0, 60);
  }
  out.cssVars = vars;

  // --- stylesheet inventory (origin + rule counts) ---
  out.styleSheets = Array.from(document.styleSheets).slice(0, 60).map(ss => {
    let rules = null;
    try { rules = ss.cssRules ? ss.cssRules.length : null; } catch (e) { rules = 'CORS'; }
    return { href: (ss.href || '(inline)').slice(-90), rules };
  });

  // --- legacy injected UI present? ---
  out.injected = {
    zyNativeOcrPanel: !!q('#zy-native-ocr-panel'),
    zyAny: Array.from(document.querySelectorAll('[id^=zy-], [class^=zy-]')).slice(0, 20).map(e => e.tagName + '#' + (e.id || '') + '.' + (typeof e.className === 'string' ? e.className : '')),
    scriptcat: !!q('#scriptcat-app') || !!q('[data-scriptcat]'),
  };

  // --- spacing token detection from real elements ---
  const gaps = {};
  document.querySelectorAll('*').forEach(el => {
    const cs = getComputedStyle(el);
    [cs.marginTop, cs.marginBottom, cs.paddingTop, cs.paddingLeft, cs.gap].forEach(v => {
      if (v && v !== '0px' && v !== 'normal' && v !== 'auto' && !v.includes('%')) gaps[v] = (gaps[v] || 0) + 1;
    });
  });
  out.spacingTokens = Object.entries(gaps).sort((a,b)=>b[1]-a[1]).slice(0, 40).map(([k,v]) => k + ' ×' + v);

  return out;
})()`;

(async () => {
  const browser = await chromium.launch({
    channel: undefined,
    executablePath: "C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();
  const logs = [];
  page.on("console", (m) => logs.push("[" + m.type() + "] " + m.text().slice(0, 300)));
  page.on("pageerror", (e) => logs.push("[pageerror] " + String(e).slice(0, 300)));

  const result = { target: TARGET, steps: [] };
  try {
    await page.goto(TARGET, { waitUntil: "domcontentloaded", timeout: 90000 });
    result.steps.push("goto ok");
  } catch (e) {
    result.gotoError = String(e).slice(0, 300);
  }
  await page.waitForTimeout(8000);
  try { await page.waitForLoadState("load", { timeout: 30000 }); } catch (_) {}

  await page.screenshot({ path: path.join(OUT_DIR, "01-initial-1440.png"), fullPage: false });

  const audit = await page.evaluate(INSPECT).catch((e) => ({ error: String(e).slice(0, 300) }));
  result.audit = audit;
  result.consoleLogs = logs.slice(-60);

  // try a wider viewport too
  try {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT_DIR, "02-1920.png") });
    result.audit1920 = await page.evaluate(`(() => {
      const r = document.querySelector('.rightPageBar') || document.querySelector('.rightBar');
      if (!r) return null;
      const b = r.getBoundingClientRect(), cs = getComputedStyle(r);
      return { rect:{x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}, position:cs.position, zIndex:cs.zIndex, background:cs.backgroundColor, borderLeft:cs.borderLeft };
    })()`);
  } catch (_) {}

  fs.writeFileSync(path.join(OUT_DIR, "ui-audit.json"), JSON.stringify(result, null, 2), "utf8");
  console.log("OUT_DIR=" + OUT_DIR);
  console.log("ids=" + (audit.idCount || "?") + " keywords=" + ((audit.idKeywords || []).length) + " buttons=" + ((audit.buttons || []).length) + " inputs=" + ((audit.inputs || []).length));
  console.log("rightBar=" + JSON.stringify((audit.rightBar || []).map(x => x.sel + ":" + (x.el ? x.el.rect.w + "x" + x.el.rect.h : "null"))));
  await browser.close();
})().catch((e) => { console.error("FAIL " + String(e).slice(0, 500)); process.exit(1); });
