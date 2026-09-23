// runtime/stage9/native-capability-audit.js — Stage 9 方案 Commit 2：Native Capability Gate（五层证据）
// ---------------------------------------------------------------------
// 全局原则（§一~§三）：任何能力先审计原生网页是否已有，禁止「查不到 = 不存在」。
// 五层证据：L1 UI / L2 Event / L3 Network / L4 Module-API / L5 Object State。
// 结论：NATIVE_READY / NATIVE_PARTIAL / NATIVE_UNKNOWN（≠ UNAVAILABLE）。
// 纯只读审计：不点击破坏性按钮、不创建/修改/删除对象、不触发保存。
// L4 模块枚举 + 目标签名 probe（CanvasDiy.drawText 等）；L3 记录 request/response/websocket
//   metadata（只记 method/url/status/键名，禁止 cookie/Authorization/AK/SK/token 值）；
// L5 复用 native-anchor 快照对全部页面做对象普查（含 textbox/i-text/text 原生文字层）。
// 凭据：env ZY_STAGE9_COOKIE（编辑器会话，缺失回退持久 profile；报告只记 cookiePresent）。
// URL：env ZY_URL 覆盖，默认用户提供的新模板 1234075。
// 报告：runtime/reports/stage-9/native-capability-audit.json
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
const NC = require(path.join(ROOT, "extension", "src", "editor", "native-capability.js"));
const adapter = require("../scriptcat-adapter");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const DEFAULT_URL = "https://diy.zheliyin.com/diyWeb/third/1234075/2114747/999/thirdDiyAdd.do";
const URL = process.env.ZY_URL || DEFAULT_URL;
const COOKIE_RAW = process.env.ZY_STAGE9_COOKIE || "";
const USERSCRIPT_VERSION = (/\/\/ @version\s+([\d.]+)/.exec(fs.readFileSync(USERSCRIPT_PATH, "utf8")) || [])[1] || "unknown";
const UI_KEYWORDS = ["新增", "识别", "OCR", "编辑文字", "字体", "字号", "尺寸", "页面", "正面", "背面", "保存", "撤销", "素材", "二维码", "导出", "对齐", "图层", "文字"];
const NET_KEYWORDS = ["/do", "/api", "/product", "/template", "/canvas", "/material", "/text", "/font", "/save", "upload", "ocr", "page", "size", "undo"];

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
function parseTemplateUrl(url) {
  const m = /\/diyWeb\/third\/(\d+)\/(\d+)\/(\d+)\/thirdDiyAdd\.do/.exec(String(url || ""));
  if (!m) return null;
  return { third: m[1], product: m[2], detail: m[3] };
}
function selfTest() {
  const t = (n, c) => { if (!c) throw new Error("SELFTEST FAIL " + n); console.log("[selftest] PASS " + n); };
  t("cookie-parse", parseCookies("a=1; b=2; c").length === 2);
  t("url-parse-new", JSON.stringify(parseTemplateUrl(DEFAULT_URL)) === JSON.stringify({ third: "1234075", product: "2114747", detail: "999" }));
  t("url-parse-old", parseTemplateUrl("https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do").third === "252438");
  t("verdict-ready", NC.verdictFor("text-create", { l4: 2, l5: 3 }).status === "NATIVE_READY");
  t("verdict-unknown", NC.verdictFor("qrcode", {}).status === "NATIVE_UNKNOWN");
  t("module-classify", NC.classifyModuleNames(["CanvasDiy", "ocrX"], NC.AREAS).find((x) => x.area === "ocr").count === 1);
  t("report-shape", (() => { const r = NC.buildCapabilityReport({ moduleNames: ["drawText", "textbox-1"], objectCountsByType: { textbox: 1 }, pagesWithObjects: 1, uiEntries: [], netEntries: 0 }); return !!r.gate && r.capabilities.length === NC.AREAS.length; })());
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }
if (!COOKIE_RAW) console.warn("[native-capability-audit] 未注入 ZY_STAGE9_COOKIE —— 回退持久 profile 会话（可能已过期）；报告 cookiePresent=false");

// ---- 页面侧：L4 模块/API 枚举 + 目标签名 probe（只读）----
const probeModules = (page) => page.evaluate(() => {
  const req = window.requirejs || window.require;
  const defs = (req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined) || {};
  const names = Object.keys(defs).slice(0, 3000);
  const sig = {};
  const probe = (modId, fnNames) => {
    const m = defs[modId];
    if (!m) return;
    sig[modId] = { found: true, type: typeof m, keys: typeof m === "object" ? Object.keys(m).slice(0, 40) : [] };
    (fnNames || []).forEach((fn) => {
      try {
        const f = typeof m === "object" ? m[fn] : m;
        if (typeof f === "function") sig[modId].signatures = sig[modId].signatures || {}, sig[modId].signatures[fn] = f.toString().replace(/\s+/g, " ").slice(0, 160);
        else if (fn in (typeof m === "object" ? m : {})) sig[modId][fn] = "present:" + typeof m[fn];
      } catch (e) {}
    });
  };
  ["CanvasDiy", "CanvasObjVO", "CurrentCanvas", "Undo", "sundry", "Canvas", "TemplateVO"].forEach((modId) => probe(modId, ["drawText", "addText", "setCoords", "getObjects", "save", "getInstance", "loadTemplate", "canvasObjInfo"]));
  return { moduleCount: names.length, names: names, signature: sig };
}).catch(() => ({ moduleCount: 0, names: [], signature: {} }));

// ---- 页面侧：L1 UI 扫描 + L2 Event 扫描（只读）----
const probeUiAndEvents = (page) => page.evaluate((kws) => {
  const uiEntries = [];
  const seen = {};
  const hit = (tag, text, block) => {
    const s = String(text || "").trim();
    if (!s || s.length > 40) return;
    let kw = null;
    for (const k of kws) { if (s.indexOf(k) >= 0) { kw = k; break; } }
    if (!kw) return;
    const key = tag + ":" + s;
    if (seen[key]) return;
    seen[key] = 1;
    uiEntries.push({ tag, text: s, keyword: kw, block: block || null });
  };
  document.querySelectorAll("button, a, li, [role=button], [role=menuitem], .pageNum, .page-group [class*=page]").forEach((el) => {
    let text = (el.textContent || "").trim();
    let block = (el.parentElement && el.parentElement.textContent ? el.parentElement.textContent.trim().slice(0, 80) : null);
    if (/^(button|a|li)$/.test(el.tagName.toLowerCase())) hit(el.tagName.toLowerCase(), text, null);
    else hit(el.className && el.className.baseVal != null ? el.className.baseVal : String(el.className || "").slice(0, 40), text.slice(0, 30), block);
  });
  const defs = (window.requirejs && window.requirejs.s && window.requirejs.s.contexts && window.requirejs.s.contexts._ && window.requirejs.s.contexts._.defined) || {};
  const eventModules = Object.keys(defs).filter((n) => /hotkey|shortcut|keydown|keyboard/i.test(n)).slice(0, 20);
  const contenteditable = document.querySelectorAll("[contenteditable=true], [contenteditable='']").length;
  return { uiEntries: uiEntries.slice(0, 200), eventModules: eventModules, contenteditable: contenteditable, keymapGlobal: typeof (window.Keymap || window.KeyMap) };
}, UI_KEYWORDS).catch(() => ({ uiEntries: [], eventModules: [], contenteditable: 0, keymapGlobal: "undefined" }));

// ---- 页面侧：L5 全部页面对象普查（只读；复用 native-anchor 采集字段）----
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
    pages.push({ pageIndex: pi, pageId: (d && (d.pageId != null ? String(d.pageId) : (d.uuid != null ? String(d.uuid) : null))) || null, canvas, objectCounts: byType, background, registryLen, rawList });
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
    pageIndex: pg.pageIndex, pageId: pg.pageId || null, side: side || null,
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
    stage: "STAGE-9-V6-NATIVE-CAPABILITY-AUDIT",
    userscriptVersion: USERSCRIPT_VERSION,
    url: URL,
    template: parseTemplateUrl(URL),
    cookiePresent: !!COOKIE_RAW,
    note: "5-layer capability audit (L1 UI / L2 Event / L3 Network / L4 Module-API / L5 Object State); read-only, no destructive probes; UNKNOWN != UNAVAILABLE",
    layers: {}, capabilities: null, gate: null, pages: [], errors: []
  };
  const netEntries = [];
  let wsCount = 0;
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
      console.log("[native-capability-audit] scriptcat cleaned removed=" + removed);
    } catch (eClean) { out.errors.push("CLEAN: " + String(eClean && eClean.message || eClean).slice(0, 120)); }
    for (const c of parseCookies(COOKIE_RAW)) { try { await browser.addCookies([c]); } catch (e) { out.errors.push("COOKIE:" + c.name + " " + String(e && e.message || e).slice(0, 100)); } }
    page = await (async () => { await page.close().catch(() => {}); const p = await browser.newPage(); p.on("pageerror", onPageErr); return p; })();
    // ---- L3 网络监听（先于 goto 注册）----
    const relevant = (u) => { const s = String(u || ""); return /^https?:/.test(s) && NET_KEYWORDS.some((k) => s.indexOf(k) >= 0) && !/\.(css|js|png|jpe?g|gif|svg|woff2?|ttf|ico)(\?|$)/i.test(s); };
    page.on("request", (r) => {
      try {
        if (!relevant(r.url())) return;
        let payloadKeys = [];
        try { const d = r.postDataJSON(); if (d && typeof d === "object") payloadKeys = Object.keys(d).slice(0, 40); } catch (e) {}
        netEntries.push({ method: r.method(), url: r.url().slice(0, 160), status: null, payloadKeys: payloadKeys, responseKeys: [] });
      } catch (e) {}
    });
    page.on("response", (res) => {
      try {
        if (!relevant(res.url())) return;
        const entry = netEntries.find((e) => e.url === res.url().slice(0, 160) && e.status === null);
        if (!entry) return;
        entry.status = res.status();
        const ct = (res.headers()["content-type"] || "");
        if (ct.indexOf("json") < 0) return;
        const len = Number(res.headers()["content-length"] || 0);
        if (len > 1048576) return;
        Promise.race([
          res.json().then((j) => { if (j && typeof j === "object") entry.responseKeys = Object.keys(j).slice(0, 60); }).catch(() => {}),
          new Promise((r) => setTimeout(() => r(), 2500))
        ]);
      } catch (e) {}
    });
    page.on("websocket", () => { wsCount += 1; });

    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => out.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
    await SLEEP(4000);
    const waitEditorReady = async (tries) => {
      for (let i = 0; i < (tries || 18); i += 1) {
        const r = await page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)) })).catch(() => ({}));
        if (r && r.ok) return r;
        await SLEEP(1200);
      }
      return page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)) })).catch(() => ({}));
    };
    const ready = await waitEditorReady(18);
    if (!(ready && ready.ok)) out.errors.push("EDITOR_UNAVAILABLE");
    await SLEEP(2500);

    const mod = await probeModules(page);
    out.layers.L4_MODULE = { moduleCount: mod.moduleCount, moduleNames: mod.names, signature: mod.signature };
    const uiEv = await probeUiAndEvents(page);
    out.layers.L1_UI = { entries: uiEv.uiEntries, total: uiEv.uiEntries.length };
    out.layers.L2_EVENT = { eventModules: uiEv.eventModules, contenteditable: uiEv.contenteditable, keymapGlobal: uiEv.keymapGlobal };
    const raw = await collectAllPagesRaw(page);
    if (!raw.ok) out.errors.push("COLLECT: " + (raw.reason || "?"));
    out.pages = (raw.pages || []).map((pg) => assemblePage(pg, pg.pageIndex === 0 ? "FRONT" : (pg.pageIndex === 1 ? "BACK" : null)));
    const mergedTypes = {};
    (raw.pages || []).forEach((pg) => { Object.keys(pg.objectCounts || {}).forEach((k) => { mergedTypes[k] = (mergedTypes[k] || 0) + pg.objectCounts[k]; }); });
    const pagesWithObjects = (raw.pages || []).filter((pg) => Object.keys(pg.objectCounts || {}).length > 0).length;
    out.layers.L5_OBJECT = { pages: (raw.pages || []).length, mergedObjectTypes: mergedTypes, textObjects: (mergedTypes["textbox"] || 0) + (mergedTypes["i-text"] || 0) + (mergedTypes["text"] || 0), pagesWithObjects: pagesWithObjects, registryLenByPage: (raw.pages || []).map((pg) => pg.registryLen) };
    out.layers.L3_NETWORK = { entries: netEntries.slice(0, 120), wsCount: wsCount };
    // 网络路径 → 能力域命中（仅 URL metadata，无值）
    const netPathHits = {};
    NC.AREAS.forEach((a) => { netPathHits[a.area] = netEntries.filter((e) => NC.matchNames([e.url], a.kws).length > 0).length; });
    const eventHits = {};
    NC.AREAS.forEach((a) => { eventHits[a.area] = uiEv.eventModules.filter((m) => NC.matchNames([m], a.kws).length > 0).length; });
    const rep = NC.buildCapabilityReport({ moduleNames: mod.names, objectCountsByType: mergedTypes, pagesWithObjects: pagesWithObjects, uiEntries: uiEv.uiEntries, netEntries: netEntries.length, netPathHits: netPathHits, eventHits: eventHits, eventEntries: uiEv.eventModules.length });
    out.capabilities = rep.capabilities;
    out.gate = rep.gate;
    out.summary = rep.summary;
    out.layerEvidence = rep.layerEvidence;
  } catch (e) { out.errors.push("MAIN: " + String(e && e.stack || (e && e.message || e)).slice(0, 300)); }
  if (browser) await browser.close().catch(() => {});
  fs.writeFileSync(path.join(REPORT_DIR, "native-capability-audit.json"), JSON.stringify(out, null, 2));
  console.log("[native-capability-audit] report=" + path.join(REPORT_DIR, "native-capability-audit.json"));
  console.log("[native-capability-audit] gate=" + out.gate + " modules=" + ((out.layers.L4_MODULE || {}).moduleCount) + " net=" + netEntries.length + " ws=" + wsCount + " ui=" + (out.layers.L1_UI || {}).total + " textObjs=" + (out.layerEvidence && out.layerEvidence.l5_textObjects));
  if (out.capabilities) out.capabilities.filter((x) => x.status === "NATIVE_READY" || x.status === "NATIVE_PARTIAL").forEach((x) => console.log("[native-capability-audit] " + x.area + " -> " + x.status + " (" + x.reason + ")"));
  const errs = out.errors;
  errs.forEach((e) => console.log("[native-capability-audit] ERR " + e));
  process.exit(errs.length ? 1 : 0);
})();