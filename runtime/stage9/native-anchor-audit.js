// runtime/stage9/native-anchor-audit.js — Stage 9 方案 Commit 1：Native Canvas Anchor Inventory
// ---------------------------------------------------------------------
// 纯审计：只读取原生 Canvas 对象状态（P0 aCoords 经 canvas.setCoords()/obj.setCoords()
// 后采集，禁止用 left/top+width+angle 猜四角），不做任何 create/update/remove/save。
// 一次扫描 totalCanvasArray 全部页面（不依赖 currentCanvasNum 切换），pageId 与编辑器
// 业务 registry（canvasToProductObjArr）长度一并记录。
// 页面世界采集原始字段 → node 侧过 extension/src/editor/native-anchor.js 归一化
// （buildAnchorSnapshot / summarizeAnchors，纯模块 node 可测）。
// 位置优先级（§五）：P0=aCoords 视觉终态真值；P1=fabric transform；P2=editor location*。
// P0 与 P2 不一致：只记 NATIVE_ANCHOR_GEOMETRY_CONSISTENCY，禁止 P2 覆盖 P0。
// 凭据：env ZY_STAGE9_COOKIE（编辑器会话，优先 env 注入；缺失则回退持久 profile 会话，
//   报告只记 cookiePresent 名/状态，不记任何值）。无 OCR / 无 Baidu / 无写操作。
// 报告：runtime/reports/stage-9/native-anchor-audit.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("../../node_modules/playwright");
const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const EXT_ID = "ndcooeababalnlpkfedmmbbbgkljhpjf";
const USERSCRIPT_PATH = path.join(ROOT, "zheliyin-card-assistant.user.js");
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-9");
const { buildAnchorSnapshot, summarizeAnchors } = require(path.join(ROOT, "extension", "src", "editor", "native-anchor.js"));
const adapter = require("../scriptcat-adapter");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const COOKIE_RAW = process.env.ZY_STAGE9_COOKIE || "";
const USERSCRIPT_VERSION = (/\/\/ @version\s+([\d.]+)/.exec(fs.readFileSync(USERSCRIPT_PATH, "utf8")) || [])[1] || "unknown";

function selfTest() {
  const t = (n, c) => { if (!c) throw new Error("SELFTEST FAIL " + n); console.log("[selftest] PASS " + n); };
  t("cookie-parse", parseCookies("a=1; b=2; c").length === 2);
  t("angle-p0-first", (() => { const s = buildAnchorSnapshot({ type: "textbox", text: "客户经理", angle: 0, aCoords: { tl: { x: 100, y: 10 }, tr: { x: 110, y: 0 }, br: { x: 120, y: 40 }, bl: { x: 110, y: 50 } } }); return Math.abs(s.geometry.angle + 45) < 1e-6; })());
  t("aCoords-null-safe", buildAnchorSnapshot({ type: "textbox", text: "x", aCoords: null }).geometry.aCoords === null);
  t("primitive-only", (() => { const a = buildAnchorSnapshot({ type: "textbox", text: "a" }); return JSON.stringify(JSON.parse(JSON.stringify(a))) === JSON.stringify(a); })());
  t("consistency-flag", buildAnchorSnapshot({ type: "textbox", text: "a", locationX: 0, locationY: 0, locationWidth: 10, locationHeight: 10, scaleX: 1, scaleY: 1, aCoords: { tl: { x: 200, y: 100 }, tr: { x: 320, y: 100 }, br: { x: 320, y: 134 }, bl: { x: 200, y: 134 } } }).consistency === "NATIVE_ANCHOR_GEOMETRY_CONSISTENCY");
  t("sum-textbox", summarizeAnchors([buildAnchorSnapshot({ type: "textbox", text: "a" }), buildAnchorSnapshot({ type: "rect", text: null, aCoords: null })]).textbox === 1);
  t("useragent-ok", typeof pageWorldPayloadFor === "function");
  console.log("[selftest] ALL PASS");
}

function parseCookies(raw) {
  const out = [];
  String(raw || "").split(";").forEach((part) => {
    const eq = part.indexOf("=");
    if (eq <= 0) return;
    const name = part.slice(0, eq).trim();
    let value = part.slice(eq + 1).trim();
    if (!name || !value) return;
    value = value.replace(/^"|"$/g, "");
    out.push({ name, value, domain: ".diy.zheliyin.com", path: "/", expires: -1 });
  });
  return out;
}

function injectUserscript() {
  let code = fs.readFileSync(USERSCRIPT_PATH, "utf8");
  ["stage-8a-1-ocr-overflow-rotation", "stage-8a-ocr-audit", "stage-8b-ocr-reconstruction-engine", "stage-8a-2-rotation-policy-geometry", "stage-8d-ocr-quality-reconstruction", "test", "demo"].forEach((b) => {
    code = code.split(b + "/extension/src/").join("stage-9-altq-baidu-reconstruction/extension/src/");
    code = code.replace(new RegExp(b.replace(/[-]/g, "\\-") + "\\/zheliyin-card-assistant\\.user\\.js", "g"), "stage-9-altq-baidu-reconstruction/zheliyin-card-assistant.user.js");
  });
  return code;
}

function conditionCode(cond) {
  let code = injectUserscript();
  const repl = (o, n) => { if (code.indexOf(o) < 0) throw new Error("code anchor not found: " + o); code = code.split(o).join(n); };
  repl('GM_getValue("zyBaiduOcrMode", "standard")', JSON.stringify(cond.baidu));
  repl('GM_getValue("zyStage9FontInkTarget", "0") === "1"', cond.ink === "1" ? "true" : "false");
  repl('GM_getValue("zyStage9NativeOcrMode", "2")', JSON.stringify("2"));
  repl('GM_getValue("zyStage9NativeTruth", "0") === "1"', "true");
  repl('GM_getValue("zyOcrMode", "auto")', JSON.stringify("baidu"));
  repl('res = await provider.recognize(img.dataUrl, { imageWidth: img.width, imageHeight: img.height, mode: BAIDU_OCR_MODE });', 'res = (window.__zyBaiduExternal && window.__zyBaiduExternal.res) ? window.__zyBaiduExternal.res : { error: { errorCode: "EXTERNAL_BAIDU_MISSING", errorMessage: "runner external baidu not injected" } };');
  repl('document.addEventListener("DOMContentLoaded", initZheliyin);', '(function(){ if (document.body) { initZheliyin(); } else { document.addEventListener("DOMContentLoaded", function(){ initZheliyin(); }); } })();');
  return code;
}

const GM_SHIM_SOURCE = [
  "try{window.__ZY8D_PAGE_WORLD__=true;",
  "if(typeof window.GM_getValue==='undefined'){window.GM_getValue=function(k,d){try{var v=localStorage.getItem('zy8dshim:'+k);return v==null?d:JSON.parse(v);}catch(e){return d;}};}",
  "if(typeof window.GM_setValue==='undefined'){window.GM_setValue=function(k,v){try{localStorage.setItem('zy8dshim:'+k,JSON.stringify(v));}catch(e){}};window.GM_deleteValue=function(k){try{localStorage.removeItem('zy8dshim:'+k);}catch(e){}};}",
  "if(typeof window.GM_xmlhttpRequest==='undefined'){window.GM_xmlhttpRequest=function(o){var u=o.url||'',m=(o.method||'GET');fetch(u,{method:m,headers:(o.headers||{})}).then(function(res){return res.text().then(function(t){return {status:res.status,responseText:t,response:t,readyState:4,finalUrl:u};});}).then(function(r){if(o.onload)try{o.onload(r);}catch(e){};}).catch(function(e){if(o.onerror)try{o.onerror({status:0,error:String(e&&e.message||e)||'fetch-error',responseText:''});}catch(e2){};});return {abort:function(){}};};}",
  "if(typeof window.GM_addStyle==='undefined'){window.GM_addStyle=function(css){var el=document.createElement('style');el.textContent=css;(document.head||document.documentElement).appendChild(el);return el;};}",
  "if(typeof window.GM_addElement==='undefined'){window.GM_addElement=function(tag,attrs){var el=document.createElement(tag);for(var k in (attrs||{})){try{el[k]=attrs[k];}catch(e){}};(document.head||document.documentElement).appendChild(el);return el;};}",
  "}catch(e){console.error('[zy8d-shim]',e);}"
].join("\n");

function pageWorldPayloadFor(cond) {
  const parts = [GM_SHIM_SOURCE];
  const norm = conditionCode(cond);
  const reqs = [...norm.matchAll(/\/\/ @require\s+(\S+)/g)].map((m) => m[1]);
  for (const u of reqs) {
    const mm = /\/extension\/src\/(.+)$/.exec(u);
    if (!mm) continue;
    const rel = mm[1].split("?")[0];
    const fp = path.join(ROOT, "extension", "src", rel);
    if (fs.existsSync(fp)) parts.push("// ==== @require " + rel + " ====\n" + fs.readFileSync(fp, "utf8"));
  }
  parts.push(norm);
  return parts.join("\n;\n");
}

if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }

// ---- 页面侧：只读采集全部页面原生对象原始字段（不修改任何对象）----
const collectAllPagesRaw = (page) => page.evaluate(() => {
  const req = window.requirejs || window.require;
  const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
  if (!vo) return { ok: false, reason: "no-canvasobjvo", pages: [] };
  const arr = vo.totalCanvasArray || [];
  const n = (v) => (typeof v === "number" ? v : null);
  const b = (v) => (v === true || v === false ? v : null);
  const s = (v) => (v != null ? String(v) : null);
  const pages = [];
  arr.forEach((d, pi) => {
    const c = d && d.canvas;
    const canvas = { width: c ? c.width : null, height: c ? c.height : null };
    const byType = {};
    const rawList = [];
    let background = null;
    let registryLen = null;
    if (c) {
      try { if (typeof c.setCoords === "function") c.setCoords(); } catch (e) {}
      (c.getObjects() || []).forEach((o, oi) => {
        const t = o.type || "unknown";
        byType[t] = (byType[t] || 0) + 1;
        if (t !== "textbox" && t !== "i-text" && t !== "text") return;
        try { if (typeof o.setCoords === "function") o.setCoords(); } catch (e) {}
        const ac = o.aCoords;
        const raw = {
          pageId: (d && (d.pageId != null ? String(d.pageId) : (d.uuid != null ? String(d.uuid) : null))) || null,
          type: t,
          text: s(o.text),
          uuid: s(o.uuid != null ? o.uuid : o.multiUuid),
          markuuid: s(o.markuuid),
          layerNum: n(o.layerNum),
          objectIndex: oi,
          left: n(o.left), top: n(o.top), width: n(o.width), height: n(o.height),
          scaleX: n(o.scaleX), scaleY: n(o.scaleY), angle: n(o.angle),
          originX: s(o.originX), originY: s(o.originY),
          locationX: n(o.locationX), locationY: n(o.locationY),
          locationWidth: n(o.locationWidth), locationHeight: n(o.locationHeight),
          locationRotation: n(o.locationRotation),
          fontFamily: s(o.fontFamily), fontSize: n(o.fontSize),
          fontWeight: s(o.fontWeight), fontStyle: s(o.fontStyle),
          lineHeight: n(o.lineHeight), charSpacing: n(o.charSpacing),
          textAlign: s(o.textAlign), fill: s(o.fill), stroke: s(o.stroke), strokeWidth: n(o.strokeWidth),
          visible: b(o.visible), selectable: b(o.selectable), evented: b(o.evented),
          isDesign: b(o.isDesign), isEdit: b(o.isEdit), isLineText: b(o.isLineText), isPreview: b(o.isPreview)
        };
        if (ac && ac.tl && ac.tr && ac.br && ac.bl) raw.aCoords = { tl: { x: ac.tl.x, y: ac.tl.y }, tr: { x: ac.tr.x, y: ac.tr.y }, br: { x: ac.br.x, y: ac.br.y }, bl: { x: ac.bl.x, y: ac.bl.y } };
        try { if (window.__zy8dInk && typeof window.__zy8dInk.measureFabricObjectInk === "function") { const r = window.__zy8dInk.measureFabricObjectInk(o); if (r && r.ok) { raw.inkWidth = n(r.inkWidth); raw.inkHeight = n(r.inkHeight); raw.inkLineCount = r.lineCount != null ? r.lineCount : null; } } } catch (e) {}
        rawList.push(raw);
      });
      try {
        const bi = c.backgroundImage;
        if (bi) {
          try { if (typeof bi.setCoords === "function") bi.setCoords(); } catch (e) {}
          const bac = bi.aCoords;
          const n2 = (v) => (typeof v === "number" ? v : null);
          background = {
            type: bi.type || "image",
            width: n2(bi.width), height: n2(bi.height),
            naturalWidth: bi.naturalWidth != null ? bi.naturalWidth : (bi._originalElement && bi._originalElement.naturalWidth) || null,
            naturalHeight: bi.naturalHeight != null ? bi.naturalHeight : (bi._originalElement && bi._originalElement.naturalHeight) || null,
            scaleX: n2(bi.scaleX), scaleY: n2(bi.scaleY), angle: n2(bi.angle), left: n2(bi.left), top: n2(bi.top),
            aCoords: bac && bac.tl ? { tl: [bac.tl.x, bac.tl.y], tr: [bac.tr.x, bac.tr.y], br: [bac.br.x, bac.br.y], bl: [bac.bl.x, bac.bl.y] } : null
          };
        }
      } catch (e) {}
      try { if (d.canvasObjInfo && Array.isArray(d.canvasObjInfo.canvasToProductObjArr)) registryLen = d.canvasObjInfo.canvasToProductObjArr.length; } catch (e) {}
    }
    pages.push({
      pageIndex: pi,
      pageId: (d && (d.pageId != null ? String(d.pageId) : (d.uuid != null ? String(d.uuid) : null))) || null,
      canvas,
      objectCounts: byType,
      background,
      registryLen,
      rawList
    });
  });
  return { ok: true, pageCount: pages.length, pages };
}).catch(() => ({ ok: false, reason: "evaluate-threw", pages: [] }));

function assemblePage(pg, side) {
  const anchors = (pg.rawList || []).map((raw) => {
    const src = Object.assign({}, raw);
    if ((!src.pageId || src.pageId == null) && pg.pageId) src.pageId = pg.pageId;
    if (side) src.side = side;
    return buildAnchorSnapshot(src);
  });
  const label = (a, i) => (a.sourceText && a.sourceText.rawText ? a.sourceText.rawText : "<textbox#" + i + ">");
  const consistency = [];
  anchors.forEach((a, i) => { if (a.consistency === "NATIVE_ANCHOR_GEOMETRY_CONSISTENCY") consistency.push(i); });
  return {
    pageIndex: pg.pageIndex,
    pageId: pg.pageId || null,
    side: side || null,
    registryLen: pg.registryLen != null ? pg.registryLen : null,
    canvas: pg.canvas || null,
    objectCounts: pg.objectCounts || null,
    background: pg.background || null,
    anchors: anchors.map((a, i) => Object.assign({ index: i, label: label(a, i) }, a)),
    summarize: summarizeAnchors(anchors),
    consistency: consistency.map((i) => ({ index: i, label: label(anchors[i], i) }))
  };
}

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const out = {
    ts: new Date().toISOString(),
    stage: "STAGE-9-V5-NATIVE-ANCHOR-AUDIT",
    userscriptVersion: USERSCRIPT_VERSION,
    url: URL,
    cookiePresent: !!COOKIE_RAW,
    note: "read-only inventory across all editor pages; setCoords only; no create/update/remove/save; P0 aCoords > P1 transform > P2 location*; anchors include only text-type objects (textbox/i-text/text)",
    pages: [],
    errors: []
  };
  const SKIP_FB = process.env.ZY_SKIP_FB === "1";
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1280, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    let page = browser.pages()[0];
    const onPageErr = (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 160)); };
    page.on("pageerror", onPageErr);
    try {
      await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await SLEEP(1400);
      const allOld = await adapter.getAllScripts(page) || [];
      let removed = 0;
      for (const s of allOld.filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(page, s.uuid); removed += 1; } catch (e) {} }
      out.errors = out.errors.filter((x) => x.indexOf("PAGEERROR") < 0);
      console.log("[native-anchor-audit] scriptcat cleaned removed=" + removed);
    } catch (eClean) { out.errors.push("CLEAN: " + String(eClean && eClean.message || eClean).slice(0, 120)); }
    for (const c of parseCookies(COOKIE_RAW)) { try { await browser.addCookies([c]); } catch (e) { out.errors.push("COOKIE:" + c.name + " " + String(e && e.message || e).slice(0, 100)); } }
    const bridgeCall = (type, payload, replyType, timeoutMs) => page.evaluate((arg) => new Promise((resolve) => {
      let done = false;
      const on = (ev) => { const d = ev.data; if (d && d.source === "zy-card-assistant-page" && d.type === arg.replyType) { window.removeEventListener("message", on); done = true; resolve(d); } };
      window.addEventListener("message", on);
      setTimeout(() => { if (!done) { window.removeEventListener("message", on); resolve({ skip: true, timeout: arg.timeoutMs }); } }, arg.timeoutMs);
      window.postMessage(Object.assign({ source: "zy-card-assistant", type: arg.type }, arg.payload || {}), location.origin);
    }), { type, payload, replyType, timeoutMs: timeoutMs || 8000 });
    const injectPageWorld = (payload) => page.evaluate((code) => { const s = document.createElement("script"); s.textContent = code; (document.head || document.documentElement).appendChild(s); }, payload);
    const waitEditorReady = async (tries) => {
      for (let i = 0; i < (tries || 16); i += 1) {
        const r = await page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed) })).catch(() => ({}));
        if (r && r.ok && r.bridge) return r;
        await SLEEP(1200);
      }
      return page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed) })).catch(() => ({}));
    };
    const setCurrentNum = (n) => page.evaluate((nn) => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); if (vo) vo.currentCanvasNum = nn; try { delete window.CurrentCanvas; } catch (e) {} return !!vo; }, n);
    const switchSide = async (label) => {
      const r = await page.evaluate((lb) => {
        for (const el of document.querySelectorAll(".page-group .pageNum")) { const s = String(el.textContent || "").trim(); if (lb === "back" && /反面|背面/.test(s)) { el.click(); return { ok: true, txt: s }; } if (lb === "front" && /正面/.test(s)) { el.click(); return { ok: true, txt: s }; } }
        return { ok: false };
      }, label);
      if (!(r && r.ok)) setCurrentNum(label === "back" ? 2 : 1);
      await SLEEP(1500);
      return r;
    };

    const cond = { baidu: "standard", ink: "0" };
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => out.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
    await SLEEP(2500);
    await injectPageWorld(pageWorldPayloadFor(cond));
    await SLEEP(1200);
    const ready = await waitEditorReady(16);
    if (!(ready && ready.ok)) out.errors.push("EDITOR_UNAVAILABLE");

    const cp = await bridgeCall("getCurrentPage", {}, "getCurrentPageResult", 6000).catch(() => null);
    const pageIdFront = (cp && cp.pageId) || null;
    const sideFront = (cp && cp.side) || "FRONT";
    let pageIdBack = null;
    if (!SKIP_FB) {
      try {
        await switchSide("back");
        const cpB = await bridgeCall("getCurrentPage", {}, "getCurrentPageResult", 6000).catch(() => null);
        pageIdBack = (cpB && cpB.pageId) || null;
        await switchSide("front");
      } catch (e) { out.errors.push("FB-BRIDGE: " + String(e && e.message || e).slice(0, 160)); }
    }

    const raw = await collectAllPagesRaw(page);
    if (!raw.ok) out.errors.push("COLLECT: " + (raw.reason || "?"));
    out.pages = (raw.pages || []).map((pg) => { const pid = pg.pageId || (pg.pageIndex === 0 ? pageIdFront : (pg.pageIndex === 1 ? pageIdBack : null)); let side = (pg.pageId && pg.pageId === pageIdFront) ? sideFront : ((pg.pageId && pg.pageId === pageIdBack) ? "BACK" : null); if (!side && pg.pageIndex === 0 && pageIdFront) side = sideFront; if (!side && pg.pageIndex === 1 && pageIdBack) side = "BACK"; return assemblePage(Object.assign({}, pg, { pageId: pid }), side); });
    out.frontBack = { frontPageId: pageIdFront, backPageId: pageIdBack };
    out.bridgeCurrentPage = { ok: !!(cp && (cp.pageId || cp.side)), pageId: pageIdFront, side: sideFront, code: cp && cp.code };
    out.pages.forEach((p) => {
      console.log("[native-anchor-audit] page" + p.pageIndex + " " + (p.pageId || "?") + " side=" + p.side + " anchors=" + p.anchors.length + " textbox=" + p.summarize.textbox + " aCoords=" + p.summarize.withACoords + " consistency=" + p.consistency.length + " objectCounts=" + JSON.stringify(p.objectCounts));
    });
    const totalAnchors = out.pages.reduce((s, p) => s + p.anchors.length, 0);
    if (!SKIP_FB && totalAnchors === 0) out.limitation = "本模板无原生文字对象（textbox/i-text/text=0）。Native Canvas Anchor 的 Matcher/Reuse 验证需要一个本身含原生占位文字的模板，或在同图重建后（管线创建对象成为原生 textbox）再采集。另：页面业务对象 d 层级未携带 pageId，pageId 由桥接 getCurrentPage + 页序索引映射得到（本模板 page0 → 正面页，page1 → 背面页）。(报告仅记录页面对象普查，不包含业务数据)";
  } catch (e) { out.errors.push("MAIN: " + String(e && e.message || e).slice(0, 300)); }
  if (browser) await browser.close().catch(() => {});
  fs.writeFileSync(path.join(REPORT_DIR, "native-anchor-audit.json"), JSON.stringify(out, null, 2));
  const errs = out.errors;
  console.log("[native-anchor-audit] report written at " + path.join(REPORT_DIR, "native-anchor-audit.json") + " pages=" + out.pages.length + " anchors=" + out.pages.reduce((s, p) => s + p.anchors.length, 0) + " errors=" + errs.length + " cookiePresent=" + (!!out.cookiePresent));
  errs.forEach((e) => console.log("[native-anchor-audit] ERR " + e));
  process.exit(errs.length ? 1 : 0);
})();