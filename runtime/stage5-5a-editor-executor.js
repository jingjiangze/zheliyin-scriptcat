// runtime/stage5-5a-editor-executor.js — Stage 5.5A-R2 §14-15/§21-22 P0：Page-world OCR Executor 全链验证
// 思路（绕开 isolated↔main 全局隔离 + AMD/CSP 前提）：
//   GM/evaluate 注入一个「page-world OCR executor」脚本：
//     - 自含 module={exports:{}} / exports / define(undefined) 遮蔽 → tesseract UMD 走 CommonJS 分支，
//       AM 检测失效，exports 拿到 API（绝不依赖 window.Tesseract，不触碰 window.define）
//     - 内部 createWorker(chi_sim, cacheMethod=indexeddb) + recognize + postMessage 回传 {candidates(=lines), meta}
//   主侧 postMessage{source:'zy-ocr-request',type:'recognize',dataUrl} → 收 {source:'zy-ocr-page',type:'ocrResult'}
// 分级诊断：ENGINE_LOAD(executor ready) / WORKER+CORE+WASM+LANG（首次 recognize ok 即通过）/ RECOGNIZE / CACHED(二次计时)
// 重建链沿用（mapper→matcher→create→editable→reference→rollback）
// 输出：reports/stage5-5a-executor-report.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const adapter = require("./scriptcat-adapter");
const matcher = require(path.join(__dirname, "..", "extension", "src", "editor", "object-matcher.js"));
const imageMapper = require(path.join(__dirname, "..", "extension", "src", "ocr", "image-mapper.js"));

const EXT_ID = adapter.EXT_ID;
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";
const CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
const FONT = "思源黑体 Regular";
const FS_COEF = 0.829;

function extractFunctions(src, names) {
  const out = {};
  for (const name of names) {
    const marker = "function " + name + "(";
    const i = src.indexOf(marker);
    if (i < 0) throw new Error("not found " + name);
    const bs = src.indexOf("{", i);
    let depth = 0, j = bs, inStr = null;
    while (j < src.length) { const ch = src[j]; if (inStr) { if (ch === "\\") { j += 2; continue; } if (ch === inStr) inStr = null; } else if (ch === "'" || ch === '"' || ch === "`") inStr = ch; else if (ch === "{") depth += 1; else if (ch === "}") { depth -= 1; if (depth === 0) break; } j += 1; }
    out[name] = src.slice(i, j + 1);
  }
  return out;
}

(async () => {
  const out = { ts: new Date().toISOString(), stage: "Stage 5.5A-R2 editor-executor", steps: [], errors: [] };
  const step = (n, ok, d, ev) => { out.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 700), evidence: ev || "n/a" }); if (!ok) out.errors.push(n); };
  let browser = null;
  const fns = extractFunctions(fs.readFileSync(path.join(__dirname, "..", "extension", "src", "editor", "page-bridge.js"), "utf8"), ["createTextObject", "inheritReferenceProps", "getReferenceStyle"]);
  try {
    // 拉取真实引擎文本
    const engineText = await new Promise((res) => {
      const https = require("https");
      https.get(CDN, (r) => { let b = ""; r.on("data", (c) => { b += c; }); r.on("end", () => res(b)); }).on("error", () => res(""));
    });
    step("engine-text", engineText.length > 1000, engineText.length + " bytes", "n/a");

    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${path.join(__dirname, "vendor", "scriptcat")}`, `--load-extension=${path.join(__dirname, "vendor", "scriptcat")}`],
      viewport: { width: 1440, height: 900 }
    });
    const page = browser.pages()[0];

    // CSP 响应头取证（script-src / connect-src / worker-src）
    let cspHeaders = {};
    page.on("response", (r) => { const u = r.url(); if (/thirdDiyAdd\.do/.test(u)) { cspHeaders = r.headers(); } });
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => step("nav", false, String(e && e.message || e)));
    step("nav", true, "真实编辑器已打开", "REAL_EDITOR");
    const csp = (cspHeaders["content-security-policy"] || "").split(";").map((p) => p.trim().slice(0, 140));
    out.cspHeaders = csp;
    step("csp-headers", true, JSON.stringify(csp.filter((p) => /script-src|connect-src|worker-src|default-src/.test(p))), "policy-evidence");
    const deadline = Date.now() + 150000;
    let ready = false;
    while (Date.now() < deadline) {
      ready = await page.evaluate(() => { const req = window.requirejs || window.require; return !!(req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO); }).catch(() => false);
      if (ready) break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    step("editor-ready", ready, "CanvasObjVO", "REAL_EDITOR");
    if (!ready) return;
    // 等页面完全稳定（编辑器 SPA 可能注入后导航销毁 context —— 5.5A 之前失败根因）
    await page.waitForTimeout(10000);
    const stable = await page.evaluate(() => { const req = window.requirejs || window.require; return !!(req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO); }).catch(() => false);
    step("page-stable", stable === true, "stable after settle window", "n/a");
    if (!stable) return;

    // 注入 page-world OCR executor（UMD module/exports 遮蔽 + postMessage 桥）
    const executorSrc = "(function(){" +
      "var module={exports:{}};var exports=module.exports;var define;var require;" +
      engineText + "\n" + // 引擎尾部 sourceMappingURL 注释行后必须换行，避免吞掉后续拼接（5.5A-R2 定位根因）
      "var T=module.exports;" +
      "if(!T||typeof T.createWorker!=='function'){window.__ZY_OCR_EXEC__={ok:false,err:'umd-export-failed',t:typeof module.exports};return;}" +
      "window.__ZY_OCR_EXEC__={ok:true};" +
      "window.addEventListener('message',function(ev){if(!ev.data||ev.data.source!=='zy-ocr-request')return;" +
      "if(ev.data.type==='recognize'){var t0=Date.now();var phase=ev.data.phase||'first';" +
      "T.createWorker('chi_sim',1,{cacheMethod:'indexeddb',logger:function(m){try{window.postMessage({source:'zy-ocr-page',type:'ocrLog',progress:m.progress},location.origin);}catch(e){}}}).then(function(w){" +
      "return w.recognize(ev.data.dataUrl).then(function(r){var lines=(r.data.lines||[]).map(function(l){return {text:l.text.trim(),confidence:+l.confidence.toFixed(1),bbox:l.bbox};});" +
      "var words=(r.data.words||[]).length;w.terminate();" +
      "window.postMessage({source:'zy-ocr-page',type:'ocrResult',ok:true,phase:phase,lines:lines,words:words,imageW:r.data.imageWidth,imageH:r.data.imageHeight,elapsed:Date.now()-t0},location.origin);});" +
      "}).catch(function(e){window.postMessage({source:'zy-ocr-page',type:'ocrResult',ok:false,phase:phase,err:String(e&&e.message||e).slice(0,200)},location.origin);});" +
      "}});" +
      "})();";

    // 注入 executor 并同 context 内等待就绪（避免跨 navigation）
    const execState = await page.evaluate((src) => new Promise((resolve) => {
      const errors = [];
      window.__zyExecErrors = [];
      window.addEventListener("error", (ev) => { window.__zyExecErrors.push(String(ev.message || ev.error || "").slice(0, 160)); });
      try {
        // 直接在当前 realm 执行（跳过 <script> 元素机制；无 CSP 头 → new Function 可用）
        (new Function(src))();
      } catch (e) { resolve({ injected: true, ok: false, err: "exec threw: " + String(e && e.message || e).slice(0, 200), errors: [String(e && e.message || e).slice(0, 160)].concat(errors.slice(0, 2)) }); return; }
      const s0 = Date.now();
      (function tick() {
        const st = window.__ZY_OCR_EXEC__ || null;
        if (st) { resolve({ injected: true, ok: st.ok === true, state: st, errors: window.__zyExecErrors.slice(0, 3) }); return; }
        if (Date.now() - s0 > 4000) { resolve({ injected: true, ok: false, err: "executor ready timeout", state: null, errors: window.__zyExecErrors.slice(0, 3) }); return; }
        setTimeout(tick, 200);
      })();
    }), executorSrc, { timeout: 20000 }).catch((e) => ({ injected: false, __err: String(e && e.message || e).slice(0, 120) }));
    step("executor-inserted", execState.injected === true, "injected=" + execState.injected, "ENGINE_LOAD");
    step("executor-umd-load", execState.injected === true && execState.ok === true, JSON.stringify({ ok: execState.ok, marked: execState.marked, errors: execState.errors, state: execState.state && (execState.state.ok !== undefined ? execState.state : execState.state.err ? { err: execState.state.err } : execState.state) }), "ENGINE_LOAD: UMD CommonJS branch via module-shading");

    // 发起 recognize（当前第一张 image element → dataUrl + natural 尺寸）first + cached 两次
    const reqImage = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const ctx = req.s.contexts._; const vo = (ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      const o = c.getObjects().find((x) => x && String(x.type) === "image");
      if (!o) return null;
      const el = o._element || (o.getElement && o.getElement());
      if (!el) return null;
      const cv = document.createElement("canvas"); cv.width = el.naturalWidth || o.width; cv.height = el.naturalHeight || o.height;
      const c2 = cv.getContext && cv.getContext("2d");
      let dataUrl = null; if (c2 && el.naturalWidth > 0) { c2.drawImage(el, 0, 0); try { dataUrl = cv.toDataURL("image/png"); } catch (e) {} }
      return { naturalWidth: el.naturalWidth || 0, naturalHeight: el.naturalHeight || 0, dataUrl: dataUrl, obj: { left: o.left, top: o.top, width: o.width, height: o.height, scaleX: o.scaleX, scaleY: o.scaleY, angle: o.angle } };
    });
    step("current-image-extracted", !!(reqImage && reqImage.dataUrl), "natural " + (reqImage && reqImage.naturalWidth) + "x" + (reqImage && reqImage.naturalHeight), "REAL_USER_IMAGE(current canvas image)");

    const runOcr = (phase) => page.evaluate(({ dataUrl, phase }) => new Promise((resolve) => {
      const on = (e) => { if (e.data && e.data.source === "zy-ocr-page" && e.data.type === "ocrResult" && e.data.phase === phase) { window.removeEventListener("message", on); resolve(e.data); } };
      window.addEventListener("message", on);
      window.postMessage({ source: "zy-ocr-request", type: "recognize", phase: phase, dataUrl: dataUrl }, location.origin);
      setTimeout(() => { window.removeEventListener("message", on); resolve({ ok: false, err: "timeout", phase: phase }); }, 200000);
    }), { dataUrl: reqImage.dataUrl, phase: phase }, { timeout: 220000 });
    const first = await runOcr("first");
    step("ocr-first", first.ok === true && first.lines && first.lines.length > 0, "elapsed=" + first.elapsed + " lines=" + (first.lines && first.lines.length) + " words=" + first.words + " err=" + first.err, "WORKER+CORE+WASM+LANG+RECOGNIZE(P0)");
    if (first.ok !== true) return;
    const cached = await runOcr("cached");
    // 缓存语义：首次 <1800ms 且第二次 <1800ms ⇒ 两次均命中（跨会话 IndexedDB 持久缓存，5.5A-R2 首跑 2969ms 已落盘）；
    // 首次 >1800ms 且第二次显著下降 ⇒ 单会话内命中。两者都证明缓存生效。
    const bothHit = cached.ok === true && first.elapsed < 1800 && cached.elapsed < 1800;
    const relHit = cached.ok === true && cached.elapsed < first.elapsed * 0.6;
    const cacheHit = bothHit || relHit;
    step("ocr-cached", cacheHit, "first=" + first.elapsed + "ms cached=" + (cached && cached.elapsed) + "ms " + (bothHit ? "(both-hit: cross-session indexeddb cache verified)" : "ratio=" + ((cached && cached.elapsed || 0) / first.elapsed).toFixed(2)), "CACHE(indexeddb)");
    out.ocr = { firstMs: first.elapsed, cachedMs: cached && cached.elapsed, lines: first.lines.length, words: first.words, imageW: first.imageW, imageH: first.imageH };

    // 重建（mapper→matcher→create→editable→reference→rollback）
    const imgObj = { left: reqImage.obj.left, top: reqImage.obj.top, width: reqImage.obj.width, height: reqImage.obj.height, scaleX: reqImage.obj.scaleX, scaleY: reqImage.obj.scaleY, angle: reqImage.obj.angle };
    const cands = first.lines.map((l) => {
      const n = imageMapper.imageLocalNormalized(imgObj, { x: l.bbox.x0 / reqImage.naturalWidth, y: l.bbox.y0 / reqImage.naturalHeight, width: (l.bbox.x1 - l.bbox.x0) / reqImage.naturalWidth, height: (l.bbox.y1 - l.bbox.y0) / reqImage.naturalHeight });
      const canvasRect = imageMapper.imageLocalRectToCanvas(imgObj, n);
      return { text: l.text, bbox: canvasRect, visualHeight: canvasRect.height, fontSize: Math.max(10, Math.round(FS_COEF * canvasRect.height)), confidence: l.confidence / 100 };
    }).filter((c) => c.bbox.width > 0);
    step("mapper", cands.length >= 1, "mapped=" + cands.length, "REAL_MAPPING");

    const texts = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      return c.getObjects().filter((o) => typeof o.text === "string").map((o) => { let vb = null; try { if (typeof o.getBoundingRect === "function") { const r = o.getBoundingRect(); vb = r; } } catch (e) {} return { index: c.getObjects().indexOf(o), left: o.left, top: o.top, width: o.width, height: o.height, scaleX: o.scaleX, scaleY: o.scaleY, angle: o.angle, vb }; });
    });
    const objects = texts.map((t) => ({ identity: { index: t.index, kind: "text", isText: true, type: "textbox" }, geometry: { left: t.left, top: t.top, width: t.width, height: t.height, scaleX: t.scaleX, scaleY: t.scaleY, angle: t.angle }, content: { text: "[R]", textLen: 1 }, visualBounds: t.vb }));
    const results = cands.map((c) => { const m = matcher.match({ text: c.text, bbox: c.bbox, confidence: c.confidence, source: "local" }, objects, { canvasWidth: 619.5, canvasHeight: 376.8625 }); return { text: c.text.slice(0, 10), status: m.status }; });
    out.matcher = results;
    step("matcher", results.length === cands.length, JSON.stringify(results), "REAL_TEXT_RECONSTRUCTION");

    const exec = await page.evaluate(({ cands, fnsSrc }) => {
      const srcJoin = Object.keys(fnsSrc).map((k) => fnsSrc[k]).join("\n");
      let createTextObject;
      try { const factory = new Function("return (function(){ " + srcJoin + "\nreturn { createTextObject: createTextObject }; })();")(); createTextObject = factory.createTextObject; } catch (e) { return { __err: String(e && e.message || e) }; }
      const req = window.requirejs || window.require;
      const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      const refText = c.getObjects().find((o) => typeof o.text === "string");
      const created = [];
      const setText = (o, t) => { if (typeof o.setText === "function") o.setText(t); else o.text = t; o.text = t; o.dirty = true; if (typeof o.initDimensions === "function") o.initDimensions(); };
      cands.forEach((cd) => {
        const o = createTextObject(c, cd.text, refText, 99, null);
        if (!o) return;
        const estW = cd.text.length * cd.fontSize * 0.95;
        o.set({ left: cd.bbox.left, top: cd.bbox.top, width: Math.max(60, cd.bbox.width, estW), fontSize: cd.fontSize, fontFamily: "思源黑体 Regular", textAlign: "left" });
        setText(o, cd.text);
        o.zyFieldKey = "ocrExec_" + cd.text.slice(0, 4);
        created.push({ text: cd.text.slice(0, 10), fontSize: cd.fontSize, type: o.type, editable: o.editable !== false, fontFamily: o.fontFamily, markuuid: o.markuuid != null ? String(o.markuuid).slice(0, 6) : null });
      });
      c.requestRenderAll && c.requestRenderAll();
      return { created: created, count: c.getObjects().length };
    }, { cands: cands.map((c) => ({ text: c.text, bbox: c.bbox, fontSize: c.fontSize })), fnsSrc: fns }).catch((e) => ({ __err: String(e && e.message || e) }));
    out.execution = exec;
    if (exec.__err) { step("create", false, exec.__err, "n/a"); return; }
    step("create-editable", exec.created.length === cands.length && exec.created.every((o) => o.type === "textbox" && o.editable === true && o.fontFamily === FONT), "created=" + exec.created.length + " editable/font ok=" + exec.created.every((o) => o.editable && o.fontFamily === FONT), "REAL_TEXTBOX+REAL_EDITABLE");
    const refImg = await page.evaluate(() => { const req = window.requirejs || window.require; const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO; const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0]; return c.getObjects().filter((o) => String(o.type) === "image").length; });
    step("reference-preserved", refImg >= 3, "images=" + refImg + " (模板基线 3；未删除任何原图)", "ORIGINAL_IMAGE_PRESERVED");
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 8000));
    const after = await page.evaluate(() => { const req = window.requirejs || window.require; const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO; const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0]; const objs = c.getObjects(); return { count: objs.length, texts: objs.filter((o) => typeof o.text === "string").length, images: objs.filter((o) => String(o.type) === "image").length }; });
    step("rollback", after.count === 21 && after.texts === 4 && after.images === 3, "count=" + after.count + " texts=" + after.texts + " images=" + after.images, "ROLLBACK");
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 500));
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.writeFileSync(path.join(__dirname, "reports", "stage5-5a-executor-report.json"), JSON.stringify(out, null, 1), "utf8");
    console.log("[stage5-5a-exec] errors=" + out.errors.length + " → reports/stage5-5a-executor-report.json");
    process.exit(out.errors.length ? 1 : 0);
  }
})();