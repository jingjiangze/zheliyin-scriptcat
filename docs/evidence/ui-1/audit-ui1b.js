/**
 * UI-1 audit part 2: deep-dive the native AI panel design system,
 * the native OCR css, and the rightBar tab controller.
 */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const TARGET = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const OUT_DIR = "C:\\Users\\Administrator\\WorkBuddy\\2026-09-16-12-13-35\\ui-audit";

const PROBE = `(() => {
  const out = {};
  const pick = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    return { tag: el.tagName.toLowerCase(), id: el.id||null, cls: (typeof el.className==='string'?el.className:'').trim()||null,
      rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},
      display:cs.display, position:cs.position, zIndex:cs.zIndex, width:cs.width,
      fontFamily:cs.fontFamily, fontSize:cs.fontSize, fontWeight:cs.fontWeight, lineHeight:cs.lineHeight,
      color:cs.color, background:cs.backgroundColor, border:cs.border, borderRadius:cs.borderRadius,
      padding:cs.padding, margin:cs.margin, boxShadow:cs.boxShadow==='none'?null:cs.boxShadow.slice(0,140),
      transition:cs.transition, text:(el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,50)||null };
  };

  // ---- A. design-ai.css rules (extracted from the stylesheet object model) ----
  const rules = [];
  for (const ss of Array.from(document.styleSheets)) {
    const href = ss.href || '';
    if (!/design-ai|ocr\\.css/i.test(href)) continue;
    let list = null;
    try { list = ss.cssRules; } catch(e) { list = null; }
    if (!list) continue;
    const name = href.split('/').pop();
    for (const r of Array.from(list)) {
      if (r.selectorText) rules.push(name + ' :: ' + r.style.cssText.slice(0, 300));
      else if (r.cssText) rules.push(name + ' :: ' + r.cssText.slice(0, 300));
    }
  }
  out.designCssRules = rules;

  // ---- B. AI panel instances (live geometry) ----
  out.aiPanels = Array.from(document.querySelectorAll('.design-ai-panel')).map(el => ({
    ...pick(el),
    sub: Array.from(el.querySelectorAll('.ai-panel-header,.ai-panel-title,.ai-panel-body')).map(pick),
    buttons: Array.from(el.querySelectorAll('button,.btn,[class*=btn]')).slice(0,10).map(pick),
  }));

  // are any visible now?
  out.aiPanelsVisible = Array.from(document.querySelectorAll('.design-ai-panel')).filter(el => {
    const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0;
  }).map(pick);

  // ---- C. native ocr.css related DOM ----
  out.ocrNodes = Array.from(document.querySelectorAll('[id*=ocr],[class*=ocr],[id*=Ocr],[class*=Ocr]')).slice(0,40).map(pick);
  out.ocrLianDan = Array.from(document.querySelectorAll('#ocrLianDan,#ocrTable,#ocrTableCont,#ocrDesign,#logincallOcrCount,#ocrBgColor,#ocrUid')).map(pick);

  // ---- D. the OCR entry button in the native toolbar (find by text) ----
  const all = Array.from(document.querySelectorAll('a,li,div,span,button'));
  out.ocrEntryCandidates = all.filter(e => {
    const t = (e.textContent||'').replace(/\\s+/g,'').trim();
    return (t === '文字识别' || t === 'OCR' || t === '识别' || t === '图片识别' || t === '拍照识别' || t === '图片文字识别' || t === '图片转文字') && e.children.length <= 2;
  }).slice(0, 20).map(e => ({ ...pick(e), html: e.outerHTML.slice(0,220), parent: pick(e.parentElement) }));

  // ---- E. toolbar (left / top) structure ----
  out.toolBar = pick(document.querySelector('.toolBar'));
  out.editBar = pick(document.querySelector('.editBar'));
  out.editBarR = pick(document.querySelector('.editBarR'));
  out.extraBar = pick(document.querySelector('.extraBar'));
  out.toolGroups = Array.from(document.querySelectorAll('.toolGroup')).slice(0,12).map(g => ({
    ...pick(g),
    items: Array.from(g.querySelectorAll('a,li,div')).slice(0,14).map(x => ({
      tag: x.tagName.toLowerCase(), id: x.id||null, cls: (typeof x.className==='string'?x.className:'').trim()||null,
      title: x.getAttribute('title'), text: (x.textContent||'').replace(/\\s+/g,' ').trim().slice(0,20)||null,
      rect: (()=>{const r=x.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};})(),
      html: x.outerHTML.slice(0,160),
    })),
  }));

  // ---- F. tabPageLayer controller ----
  const tpl = document.querySelector('.tabPageLayer');
  out.tabPageLayer = { ...pick(tpl), html: tpl ? tpl.outerHTML.slice(0, 600) : null,
    children: tpl ? Array.from(tpl.children).map(c => ({ tag:c.tagName.toLowerCase(), id:c.id||null, cls:(typeof c.className==='string'?c.className:'').trim()||null, text:(c.textContent||'').trim(), html:c.outerHTML.slice(0,200) })) : [] };

  // ---- G. the .bg-material sliding panel (260px) ----
  out.bgMaterial = { ...pick(document.querySelector('.bg-material')), html: (document.querySelector('.bg-material')||{}).outerHTML ? document.querySelector('.bg-material').outerHTML.slice(0,700) : null };

  // ---- H. switch-content (the "< 常用素材" pull tab) ----
  out.switchContent = { ...pick(document.querySelector('.switch-content')), html: (document.querySelector('.switch-content')||{outerHTML:null}).outerHTML ? document.querySelector('.switch-content').outerHTML.slice(0,500) : null };
  out.btnSwitch = { ...pick(document.querySelector('.btn-switch')), html: (document.querySelector('.btn-switch')||{outerHTML:null}).outerHTML ? document.querySelector('.btn-switch').outerHTML.slice(0,400) : null };

  // ---- I. icon font available? ----
  out.iconFontSample = Array.from(document.querySelectorAll('[class*=icon-]')).slice(0,25).map(e => ({
    cls: (typeof e.className==='string'?e.className:'').trim(), content: getComputedStyle(e, '::before').content, fontFamily: getComputedStyle(e).fontFamily,
  }));

  // ---- J. is jQuery / Vue / React present? ----
  out.frameworks = { jquery: typeof jQuery !== 'undefined' ? (jQuery.fn && jQuery.fn.jquery) : null, vue: typeof Vue !== 'undefined', react: typeof React !== 'undefined', layer: typeof layer !== 'undefined' };

  return out;
})()`;

(async () => {
  const browser = await chromium.launch({ executablePath: "C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe", args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
  const page = await ctx.newPage();
  await page.goto(TARGET, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(9000);
  const r = await page.evaluate(PROBE).catch((e) => ({ error: String(e).slice(0, 400) }));
  fs.writeFileSync(path.join(OUT_DIR, "ui-audit2.json"), JSON.stringify(r, null, 2), "utf8");
  console.log("designCssRules=" + ((r.designCssRules||[]).length) + " aiPanels=" + ((r.aiPanels||[]).length) + " ocrNodes=" + ((r.ocrNodes||[]).length) + " ocrEntry=" + ((r.ocrEntryCandidates||[]).length) + " toolGroups=" + ((r.toolGroups||[]).length));
  await browser.close();
})().catch((e) => { console.error("FAIL " + String(e).slice(0, 400)); process.exit(1); });
