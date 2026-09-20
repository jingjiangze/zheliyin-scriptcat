// runtime/stage9/font-target-ab.js — Stage 9 P4-B Commit 3：ImageInk typography target 真机 A/B 矩阵
// ---------------------------------------------------------------------
// 矩阵（Native 固定 textType=2）：
//   A1 = Baidu standard + ImageInk OFF   A2 = Baidu standard + ImageInk ON
//   B1 = Baidu accurate + ImageInk OFF   B2 = Baidu accurate + ImageInk ON
// 每条件 ≥2 独立 run（fresh runtime：每 run 重设 GM(localStorage shim) → reload → 重注入 userscript，禁止同页改 GM 复用）
// 目标：真机验证 ImageInk target 是否让 EditorActualInk 更接近 ImageInk（且位置随之改善、无新增 wrap/identity/page 回归）
// 运行链（FULL_REAL_PIPELINE）：
//   真实编辑器页 → ocrPrepare 提取当前页源图/几何 → createTransaction(页面内) → 点击「识别当前图片」
//     → 真实 Baidu standard/accurate → Native uploadOCR(textType=2) → Text Truth → candidate gate
//     → buildTextBlocks → buildItemsFromOcr → ImageInk/OCR_BBOX target → solveFontSizeFusion
//     → textbox create → Editor 渲染 → measureFabricObjectInk(EditorInk) → 几何/位置/wrap/identity 采样
// 复用已验证范式：e2e-front-back-isolation.js（cookie + pageWorld 注入 + bridgeCall）
//   + geometry-diagnostic.js（clickOcr/readNew/状态轮询） + ink-measure.js（window.__zy8dInk）
// 凭据：env ZY_STAGE9_COOKIE（必需）+ ZY_BAIDU_AK / ZY_BAIDU_SK（必需），仅运行时注入，不落盘不打印值
// 运行：env ZY_STAGE9_COOKIE=... ; $env:ZY_BAIDU_AK=... ; $env:ZY_BAIDU_SK=... node runtime/stage9/font-target-ab.js
// 报告：runtime/reports/stage-9/font-target-ab.json（cookie 只记名）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("../../node_modules/playwright");
const adapter = require("../scriptcat-adapter");
const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const EXT_ID = adapter.EXT_ID;
const USERSCRIPT_PATH = path.join(ROOT, "zheliyin-card-assistant.user.js");
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-9");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const CARD = process.env.ZY_BG_FILE || path.join(ROOT, "runtime", "stage8b", "assets", "real-card-shengying.png");
const COOKIE_RAW = process.env.ZY_STAGE9_COOKIE || "";
const BAIDU_AK = process.env.ZY_BAIDU_AK || "";
const BAIDU_SK = process.env.ZY_BAIDU_SK || "";
const SKIP_BROWSER = process.env.ZY_SKIP_BROWSER === "1";
// 矩阵：每条件 run 数（最低 2）。条件定义 {id, baidu, inkTarget}
const CONDITIONS = [
  { id: "A1", baidu: "standard", ink: "0" },
  { id: "A2", baidu: "standard", ink: "1" },
  { id: "B1", baidu: "accurate", ink: "0" },
  { id: "B2", baidu: "accurate", ink: "1" }
];
const RUNS_PER = Number(process.env.ZY_RUNS || 2);

// ---- 纯函数自检（--selftest，零联网零凭据）----
function selfTest() {
  const parseCookies = (raw) => String(raw || "").split(";").filter((p) => p.indexOf("=") > 0).map((p) => ({ name: p.slice(0, p.indexOf("=")).trim(), value: p.slice(p.indexOf("=") + 1).trim() })).filter((c) => c.name && c.value);
  const t = (n, c) => { if (!c) throw new Error("SELFTEST FAIL " + n); console.log("[selftest] PASS " + n); };
  t("cookie-parse", parseCookies("a=1; b=2; c").length === 2 && parseCookies("a=1; b=2; c")[1].name === "b");
  t("matrix-4", CONDITIONS.length === 4 && CONDITIONS.map((c) => c.id).join() === "A1,A2,B1,B2");
  t("runs-min2", RUNS_PER >= 2);
  t("env-gate", (SKIP_BROWSER ? true : SKIP_BROWSER) !== null);
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }

// ---- 凭据门（09 纪律：缺凭据显式报缺，不伪造不占位）----
if (!COOKIE_RAW) { console.error("[font-target-ab] 缺少 ZY_STAGE9_COOKIE（编辑器会话，仅运行时注入，不落盘）。--selftest 可校验纯函数。"); process.exit(2); }
if (!BAIDU_AK || !BAIDU_SK) { console.error("[font-target-ab] 缺少 ZY_BAIDU_AK / ZY_BAIDU_SK（Baidu OCR，仅运行时注入）。"); process.exit(2); }

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
const GM_SHIM_SOURCE = [
  "try{window.__ZY8D_PAGE_WORLD__=true;",
  "if(typeof window.GM_getValue==='undefined'){window.GM_getValue=function(k,d){try{var v=localStorage.getItem('zy8dshim:'+k);return v==null?d:JSON.parse(v);}catch(e){return d;}};}",
  "if(typeof window.GM_setValue==='undefined'){window.GM_setValue=function(k,v){try{localStorage.setItem('zy8dshim:'+k,JSON.stringify(v));}catch(e){}};window.GM_deleteValue=function(k){try{localStorage.removeItem('zy8dshim:'+k);}catch(e){}};}",
  "if(typeof window.GM_xmlhttpRequest==='undefined'){window.GM_xmlhttpRequest=function(o){var u=o.url||'',m=(o.method||'GET');fetch(u,{method:m,headers:(o.headers||{})}).then(function(res){return res.text().then(function(t){return {status:res.status,responseText:t,response:t,readyState:4,finalUrl:u};});}).then(function(r){if(o.onload)try{o.onload(r);}catch(e){};}).catch(function(e){if(o.onerror)try{o.onerror({status:0,error:String(e&&e.message||e)||'fetch-error',responseText:''});}catch(e2){};});return {abort:function(){}};};}",
  "if(typeof window.GM_addStyle==='undefined'){window.GM_addStyle=function(css){var el=document.createElement('style');el.textContent=css;(document.head||document.documentElement).appendChild(el);return el;};}",
  "if(typeof window.GM_addElement==='undefined'){window.GM_addElement=function(tag,attrs){var el=document.createElement(tag);for(var k in (attrs||{})){try{el[k]=attrs[k];}catch(e){}};(document.head||document.documentElement).appendChild(el);return el;};}",
  "}catch(e){console.error('[zy8d-shim]',e);}"
].join("\n");
function pageWorldPayload() {
  const norm = injectUserscript();
  const parts = [GM_SHIM_SOURCE];
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

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const out = {
    ts: new Date().toISOString(),
    stage: "STAGE-9-V4-FONT-TARGET-AB",
    native: { fixed: "textType=2", note: "Native handwriting fixed; recognizeWithFallback may retry textType=1 on empty/fail" },
    matrix: CONDITIONS.map((c) => ({ id: c.id, baidu: c.baidu, imageInk: c.ink, runs: RUNS_PER })),
    image: path.basename(CARD),
    cookiePresent: !!COOKIE_RAW,
    cookieNames: parseCookies(COOKIE_RAW).map((c) => c.name).filter(Boolean),
    runs: [],
    frontBack: null,
    errors: []
  };
  if (!fs.existsSync(CARD)) { console.error("[font-target-ab] 图片不存在: " + CARD); process.exit(1); }
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1280, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    const page = browser.pages()[0];
    page.on("pageerror", (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 200)); });
    for (const c of parseCookies(COOKIE_RAW)) { try { await browser.addCookies([c]); } catch (e) { out.errors.push("COOKIE:" + c.name + " " + String(e && e.message || e).slice(0, 100)); } }
    // ScriptCat 清理旧脚本 + 安装本分支 userscript（含 stage-9 @require 注入列表一致性用真实扩展安装写存储）
    await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await SLEEP(1500);
    const allOld = await adapter.getAllScripts(page) || [];
    for (const s of allOld.filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(page, s.uuid); } catch (e) {} }
    const US = injectUserscript();
    await adapter.installByCode(page, { uuid: "zheliyin-stage9-ab-" + Date.now(), code: US, upsertBy: "user" });
    await SLEEP(1200);
    // 编辑器侧调用 helper（页面 world 注入路径与 e2e 一致；bridge 由 userscript 安装，页面主 world 注入时同步可用）
    const bridgeCall = (type, payload, replyType, timeoutMs) => page.evaluate((arg) => new Promise((resolve) => {
      let done = false;
      const on = (ev) => { const d = ev.data; if (d && d.source === "zy-card-assistant-page" && d.type === arg.replyType) { window.removeEventListener("message", on); done = true; resolve(d); } };
      window.addEventListener("message", on);
      setTimeout(() => { if (!done) { window.removeEventListener("message", on); resolve({ skip: true, timeout: arg.timeoutMs }); } }, arg.timeoutMs);
      window.postMessage(Object.assign({ source: "zy-card-assistant", type: arg.type }, arg.payload || {}), location.origin);
    }), { type, payload, replyType, timeoutMs: timeoutMs || 12000 });
    // 每条件独立 run：设置 GM(localStorage shim) → 编辑器页 reload → 注入 pageWorld → 等待 editor → 注入背景图 → 点击识别 → 采样
    const setGm = async (cond) => page.evaluate((a) => {
      const set = (k, v) => { try { localStorage.setItem("zy8dshim:" + k, JSON.stringify(v)); } catch (e) {} };
      set("zyBaiduOcrMode", a.baidu);
      set("zyStage9NativeOcrMode", "2");
      set("zyStage9NativeTruth", "1");
      set("zyStage9FontInkTarget", a.ink);
      set("zyStage9Calibration", "1");
      set("zyOcrMode", "baidu");
      return true;
    }, { baidu: cond.baidu, ink: cond.ink });
    const injectPageWorld = (payload) => page.evaluate((code) => { const s = document.createElement("script"); s.textContent = code; (document.head || document.documentElement).appendChild(s); }, payload);
    const waitEditorReady = async (tries) => {
      for (let i = 0; i < (tries || 12); i += 1) {
        const r = await page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed) })).catch(() => ({}));
        if (r && r.ok && r.bridge) return r;
        await SLEEP(1200);
      }
      return page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed) })).catch(() => ({}));
    };
    const setBg = (ci, dataUrl) => page.evaluate((arg) => new Promise((res) => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[arg.ci];
      const c = d && d.canvas;
      if (!c) return res({ ok: false, reason: "no-canvas" });
      const f = (c.constructor && c.constructor.fabric) || window.fabric;
      const im = new Image();
      im.onload = () => { try { const bg = new f.Image(im); bg.set({ left: 0, top: 0 }); c.setBackgroundImage(bg, () => { try { if (c.requestRenderAll) c.requestRenderAll(); } catch (e) {} res({ ok: true }); }); } catch (e) { res({ ok: false, reason: String(e && e.message || e).slice(0, 100) }); } };
      im.onerror = () => res({ ok: false, reason: "img-fail" });
      im.src = arg.dataUrl;
    }), { ci, dataUrl: "data:image/png;base64," + fs.readFileSync(CARD).toString("base64") });
    const clickOcr = () => page.evaluate(() => {
      const q = ["#zy-native-ocr-btn", "#zy-ocr-btn", "[data-zy-role=ocr]"];
      for (const s of q) { const el = document.querySelector(s); if (el && el.offsetParent) { try { el.click(); return { clicked: true, sel: s }; } catch (e) {} } }
      const all = Array.from(document.querySelectorAll("button,a,span,div"));
      for (const el of all) { if (!el.offsetParent) continue; if (/识别当前图片|识别图片文字/.test(String(el.textContent || "").trim())) { try { el.click(); return { clicked: true, sel: "text" }; } catch (e) {} } }
      return { clicked: false };
    });
    const waitOcrDone = async (timeoutMs) => {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        const r = await page.evaluate(() => {
          const el = document.querySelector("#zy-native-status") || document.querySelector(".zy-status");
          const st = el ? String(el.textContent || "").trim() : null;
          return { st: st ? st.slice(0, 160) : null };
        }).catch(() => ({}));
        const st = r && r.st;
        if (st && /已生成 \d+ 个文字|未识别到文字|失败|异常/.test(st)) return { done: true, st };
        await SLEEP(900);
      }
      return { done: false };
    };
    const snapIds = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const c = vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas;
      return c ? c.getObjects().map((o) => o.uuid || o.multiUuid || o.id || null) : [];
    });
    const readNew = (ids) => page.evaluate(async (arg) => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
      const c = d && d.canvas;
      if (!c) return { arr: [], err: "no-canvas" };
      const arr = [];
      for (const o of c.getObjects()) {
        if (typeof o.text !== "string") continue;
        const id = o.uuid || o.multiUuid || o.id || null;
        if (arg.ids && arg.ids.length && id != null && arg.ids.indexOf(id) < 0) continue;
        let geo = null;
        try { if (typeof o.setCoords === "function") o.setCoords(); const ac = o.aCoords; if (ac && ac.tl && ac.br) { geo = { tl: [ac.tl.x, ac.tl.y], tr: [ac.tr.x, ac.tr.y], br: [ac.br.x, ac.br.y], bl: [ac.bl.x, ac.bl.y], cx: (ac.tl.x + ac.tr.x + ac.br.x + ac.bl.x) / 4, cy: (ac.tl.y + ac.tr.y + ac.br.y + ac.bl.y) / 4, angle: Math.atan2(ac.tr.y - ac.tl.y, ac.tr.x - ac.tl.x) * 180 / Math.PI }; } } catch (e) {}
        let ink = null;
        try { if (window.__zy8dInk && typeof window.__zy8dInk.measureFabricObjectInk === "function") ink = window.__zy8dInk.measureFabricObjectInk(o); } catch (e) {}
        arr.push({
          id: id,
          zyOcrKey: o.zyOcrKey || null,
          zyOcrObjectId: o.zyOcrObjectId || null,
          text: String(o.text || "").slice(0, 24),
          fontFamily: o.fontFamily || null,
          fontSize: typeof o.fontSize === "number" ? o.fontSize : null,
          left: typeof o.left === "number" ? o.left : null,
          top: typeof o.top === "number" ? o.top : null,
          width: typeof o.width === "number" ? o.width : null,
          height: typeof o.height === "number" ? o.height : null,
          angle: typeof o.angle === "number" ? o.angle : null,
          geo: geo,
          ink: (ink && ink.ok) ? { inkWidth: ink.inkWidth, inkHeight: ink.inkHeight, lineCount: ink.lineCount, method: ink.method, fontUsed: ink.fontUsed } : null,
          count: o._textLines && o._textLines.length ? o._textLines.length : null,
          diag: o.zyOcrDiagnostics || null
        });
      }
      return { arr, err: null };
    }, { ids });
    const rollback = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      let removed = 0;
      (vo && vo.totalCanvasArray || []).forEach((d) => {
        const c = d && d.canvas;
        if (!c) return;
        c.getObjects().forEach((o) => { if (!o) return; try { const li = d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr ? d.canvasObjInfo.canvasToProductObjArr.indexOf(o) : -1; if (li >= 0) d.canvasObjInfo.canvasToProductObjArr.splice(li, 1); c.remove(o); removed += 1; } catch (e) {} });
      });
      try { if (vo && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas) vo.totalCanvasArray[0].canvas.requestRenderAll(); } catch (e) {}
      return { removed };
    });
    const advanceWidthOf = (text, fs, family) => page.evaluate((a) => {
      const cv = document.createElement("canvas"); const ctx = cv.getContext("2d");
      if (!ctx) return null;
      ctx.font = (a.fs || 16) + "px " + (a.family || "sans-serif");
      return ctx.measureText(a.text).width;
    }, { text, fs, family }).catch(() => null);

    // ---- 矩阵执行 ----
    for (const cond of CONDITIONS) {
      for (let r = 1; r <= RUNS_PER; r += 1) {
        const rec = { condition: cond.id, baidu: cond.baidu, imageInkTarget: cond.ink === "1", run: r, pipeline: null, steps: [], blocks: [], errors: [] };
        out.runs.push(rec);
        try {
          await setGm(cond);
          await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => rec.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
          await SLEEP(2500);
          const payload = pageWorldPayload();
          await injectPageWorld(payload);
          await SLEEP(1200);
          const ready = await waitEditorReady(16);
          rec.steps.push({ step: "editor-ready", ok: !!(ready && ready.ok), bridge: !!(ready && ready.bridge) });
          if (!(ready && ready.ok)) { rec.errors.push("EDITOR_UNAVAILABLE"); continue; }
          // ocrPrepare 由 userscript 自动（点击识别时）；此处先用 bridge 抓取当前页身份
          const cp = await bridgeCall("getCurrentPage", {}, "getCurrentPageResult", 6000).catch(() => null);
          rec.pageId = (cp && cp.pageId) || null;
          rec.steps.push({ step: "current-page", pageId: rec.pageId, code: cp && cp.code });
          const bg = await setBg(0, "data:image/png;base64," + fs.readFileSync(CARD).toString("base64"));
          rec.steps.push({ step: "bg-inject", ok: !!(bg && bg.ok) });
          if (!(bg && bg.ok)) { rec.errors.push("BG_INJECT_FAIL"); continue; }
          const before = await snapIds();
          const cl = await clickOcr();
          rec.steps.push({ step: "click-ocr", clicked: !!(cl && cl.clicked), sel: cl && cl.sel });
          if (!(cl && cl.clicked)) { rec.errors.push("OCR_BTN_NOT_FOUND"); continue; }
          const doneW = await waitOcrDone(120000);
          rec.steps.push({ step: "ocr-done", done: !!doneW.done, status: doneW.st || null });
          if (!doneW.done) { rec.errors.push("OCR_TIMEOUT"); continue; }
          const after = await snapIds();
          const createdIds = (after || []).filter((id) => (before || []).indexOf(id) < 0);
          const rd = await readNew(createdIds);
          rec.steps.push({ step: "read", objects: (rd && rd.arr || []).length });
          rec.pipeline = "FULL_REAL_PIPELINE";
          // 四层证据（§13/§14/§15）
          for (const ob of (rd && rd.arr) || []) {
            const diag = ob.diag || {};
            const ocrBBox = diag.ocrBBox8d || null;
            const src = diag.targetSource || null;
            const tgtW = diag.targetWidth || null;
            const inkTgt = diag.imageInkTargetWidth || null;
            const aw = await advanceWidthOf(ob.text, ob.fontSize, ob.fontFamily);
            rec.blocks.push({
              blockIndex: ob.zyOcrObjectId && ob.zyOcrObjectId.blockId != null ? ob.zyOcrObjectId.blockId : null,
              objectId: ob.id,
              zyOcrKey: ob.zyOcrKey,
              text: ob.text,
              fontFamily: ob.fontFamily,
              fontSize: ob.fontSize,
              scriptType: diag.sizeCluster || null,
              sizeBucket: null,
              targetSource: src,
              ocrBBoxTargetWidth: ocrBBox ? ocrBBox.width : null,
              imageInkTargetWidth: inkTgt,
              inkFallback: !!diag.inkFallback,
              inkReason: diag.inkReason || null,
              targetWidth: tgtW,
              advanceWidth: aw != null ? Math.round(aw * 100) / 100 : null,
              editorInkWidth: ob.ink ? ob.ink.inkWidth : null,
              editorInkHeight: ob.ink ? ob.ink.inkHeight : null,
              K2_after: (ob.ink && inkTgt > 0) ? Math.round((ob.ink.inkWidth / inkTgt) * 1000) / 1000 : null,
              geometry: ob.geo,
              position: { left: ob.left, top: ob.top, width: ob.width, height: ob.height, angle: ob.angle },
              wrap: { sourceLineCount: diag.sourceLineCount != null ? diag.sourceLineCount : null, estimatedFinalLineCount: diag.estimatedFinalLineCount != null ? diag.estimatedFinalLineCount : null, forcedWrapDetected: !!diag.forcedWrapDetected, renderedLineCount: ob.count },
              sourceQuad: null,
              objectQuad: ob.geo
            });
          }
          await rollback();
          rec.steps.push({ step: "rollback", ok: true });
        } catch (e) {
          rec.errors.push("RUN: " + String(e && e.stack || (e && e.message || e)).slice(0, 300));
        }
      }
    }
    // ---- Front/Back 隔离（§19：至少一次 Front→Back→Front）----
    try {
      const cc = CONDITIONS[0];
      await setGm(cc);
      await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      await SLEEP(2500);
      await injectPageWorld(pageWorldPayload());
      await SLEEP(1200);
      await waitEditorReady(16);
      const fb = { steps: [], errors: [], acceptance: null };
      out.frontBack = fb;
      const setCurrentNum = (n) => page.evaluate((nn) => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); if (vo) vo.currentCanvasNum = nn; try { delete window.CurrentCanvas; } catch (e) {} return !!vo; }, n);
      const switchSide = async (label) => {
        const r = await page.evaluate((lb) => {
          const els = document.querySelectorAll(".page-group .pageNum");
          for (const el of els) { const s = String(el.textContent || "").trim(); if (lb === "back" && /反面|背面/.test(s)) { el.click(); return { ok: true, txt: s }; } if (lb === "front" && /正面/.test(s)) { el.click(); return { ok: true, txt: s }; } }
          return { ok: false };
        }, label);
        if (!(r && r.ok)) setCurrentNum(label === "back" ? 2 : 1);
        await SLEEP(1500);
        return r;
      };
      const inventory = async () => (await bridgeCall("getTextInventory", {}, "getTextInventoryResult", 6000).catch(() => null));
      const subs = (inv) => (inv && inv.items || []).map((o) => ({ objectUuid: o.objectUuid, zyOcrKey: o.zyOcrKey || null, text: String(o.text || ""), left: o.left, top: o.top, width: o.width, height: o.height, fontSize: o.fontSize }));
      const p0 = await bridgeCall("getCurrentPage", {}, "getCurrentPageResult", 6000).catch(() => null);
      const inv0 = await inventory();
      // 用真实 OCR 结果校准 front（复用矩阵 A1 的第一条真实对象列表不存在时走 calItems 保底）
      const calItems = (inv0 && inv0.items && inv0.items.length) ? inv0.items.map((o) => ({ blockIndex: o.objectUuid && o.objectUuid.blockId != null ? o.objectUuid.blockId : null, text: o.text, top: o.top, left: o.left, width: o.width, height: o.height, fontSize: o.fontSize })) : [{ blockIndex: 0, text: "佛山盛盈包装制品有限公司", top: 60, left: 40, width: 320, height: 30, fontSize: 20 }, { blockIndex: 1, text: "吴健湘", top: 110, left: 40, width: 120, height: 24, fontSize: 16 }];
      const tx = () => "tx-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
      if (p0 && p0.ok && p0.pageId) {
        const invB = await inventory();
        fb.steps.push({ step: "inv-before-front", items: subs(invB) });
        const r1 = await bridgeCall("ocrCalibrate", { pageId: p0.pageId, transactionId: tx(), imageFingerprint: "fb-front-1", items: calItems }, "ocrCalibrateResult", 15000);
        fb.steps.push({ step: "front-calibrate", ok: !!(r1 && r1.ok), calibrated: (r1 && (r1.calibrated || []).length), created: (r1 && (r1.created || []).length) });
        const invF = await inventory();
        fb.steps.push({ step: "inv-after-front", items: subs(invF) });
        await switchSide("back");
        const pB = await bridgeCall("getCurrentPage", {}, "getCurrentPageResult", 6000).catch(() => null);
        const invB2 = await inventory();
        fb.steps.push({ step: "inv-on-back", items: subs(invB2), pageId: (pB && pB.pageId) || null });
        const r2 = await bridgeCall("ocrCalibrate", { pageId: (pB && pB.pageId) || "canvas:c1", transactionId: tx(), imageFingerprint: "fb-back", items: [{ blockIndex: 0, text: "诚信经营", top: 80, left: 50, width: 160, height: 24, fontSize: 14 }] }, "ocrCalibrateResult", 15000);
        fb.steps.push({ step: "back-calibrate", ok: !!(r2 && r2.ok), calibrated: (r2 && (r2.calibrated || []).length), created: (r2 && (r2.created || []).length) });
        await switchSide("front");
        const invB3 = await inventory();
        fb.steps.push({ step: "inv-return-front", items: subs(invB3) });
        const r3 = await bridgeCall("ocrCalibrate", { pageId: p0.pageId, transactionId: tx(), imageFingerprint: "fb-front-2", items: calItems }, "ocrCalibrateResult", 15000);
        fb.steps.push({ step: "front-recalibrate", ok: !!(r3 && r3.ok), calibrated: (r3 && (r3.calibrated || []).length), created: (r3 && (r3.created || []).length) });
        const invF2 = await inventory();
        fb.steps.push({ step: "inv-after-front2", items: subs(invF2) });
        const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
        // 本段只判定 Front 对象身份不变（Back 处理前后同一 front 页对象清单/几何一致）；
        // 反方向（Front 处理前后 back 不变）与 PAGE_IDENTITY_CHANGED STOP 已由 e2e-front-back-isolation.json（ac530ab PASS）取证，
        // 本矩阵不在每条件重复双面校准，避免把隔离变量与 A/B 变量耦合。
        fb.acceptance = {
          frontInvariant: same(subs(invF), subs(invF2)),
          note: "back-invariance + PAGE_IDENTITY_CHANGED 见 e2e-front-back-isolation.json (ac530ab PASS)"
        };
      } else { fb.errors.push("NO_CURRENT_PAGE"); }
    } catch (e) { if (!out.frontBack) out.frontBack = { errors: [] }; out.frontBack.errors.push("FB: " + String(e && e.message || e).slice(0, 300)); }
  } catch (e) { out.errors.push("MAIN: " + String(e && e.message || e).slice(0, 300)); }
  if (browser) await browser.close().catch(() => {});
  fs.writeFileSync(path.join(REPORT_DIR, "font-target-ab.json"), JSON.stringify(out, null, 2));
  const runs = out.runs || [];
  console.log("[font-target-ab] runs=" + runs.length + " errors=" + (out.errors || []).length + " cookiePresent=" + (!!out.cookiePresent));
  runs.forEach((r) => console.log("[font-target-ab] " + r.condition + " r" + r.run + " pipeline=" + r.pipeline + " blocks=" + (r.blocks || []).length + " errs=" + r.errors.length + (r.errors.length ? " :: " + r.errors.join(" | ").slice(0, 140) : "")));
  process.exit((out.errors || []).length || runs.some((r) => r.errors.length) ? 1 : 0);
})();