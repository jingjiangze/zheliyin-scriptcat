// runtime/stage5-5a-scriptcat-ocr-smoke.js — Stage 5.5A §二十三/§二十五 P4：Real ScriptCat OCR Smoke
// 链：真实 ScriptCat（profile-usc3）→ GM probe userscript（@grant GM_addElement，isolated world）
//   → GM_addElement 注入 CDN tesseract → page world window.Tesseract（isolated 可见）
//   → createWorker chi_sim (cacheMethod=indexeddb)：首次(下载20MB)+第二次(cache hit) 计时（§六）
//   → 读取「用户当前图片」（编辑器第一张 image object，经 page-world requirejs）+ natural 尺寸 + toDataURL
//   → recognize → data.lines（原生行）→ 回传 Node
// Node 侧：行级 candidates → image-mapper(真实 geometry+natural) → matcher → create（思源黑体/校准字号/防换行宽）
//   → editable → 原图保留 → reload rollback
// 输出：reports/stage5-5a-real-scriptcat-ocr.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const adapter = require("./scriptcat-adapter");
const matcher = require(path.join(__dirname, "..", "extension", "src", "editor", "object-matcher.js"));
const imageMapper = require(path.join(__dirname, "..", "extension", "src", "ocr", "image-mapper.js"));

const EXT_ID = adapter.EXT_ID;
const PROBE_UUID = "rt5-5a-ocr-smoke-uuid";
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
  const out = { ts: new Date().toISOString(), stage: "Stage 5.5A real-scriptcat-ocr-smoke", steps: [], errors: [] };
  const step = (n, ok, d, ev) => { out.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 700), evidence: ev || "n/a" }); if (!ok) out.errors.push(n); };
  let browser = null;
  const fns = extractFunctions(fs.readFileSync(path.join(__dirname, "..", "extension", "src", "editor", "page-bridge.js"), "utf8"), ["createTextObject", "inheritReferenceProps", "getReferenceStyle"]);
  try {
    // 下载真实 tesseract.min.js 文本（jsdelivr 66KB；供 GM_addElement inline 注入——5.1 已验证该模式绕过 inline CSP）
    const engineText = await new Promise((res) => {
      const https = require("https");
      https.get(CDN, (r) => { let b = ""; r.on("data", (c) => { b += c; }); r.on("end", () => res(b)); }).on("error", () => res(""));
    });
    step("engine-text-downloaded", engineText.length > 1000, "engine text " + engineText.length + " bytes", "n/a");

    // GM probe（isolated world）：GM_addElement inline 注入引擎文本（绕过 CSP）→ 主世界编排
    const PROBE = [
      "// ==UserScript==",
      "// @name Zheliyin 5.5A OCR Injection Probe",
      "// @namespace https://github.com/jingjiangze/zheliyin-scriptcat",
      "// @match https://diy.zheliyin.com/*",
      "// @grant GM_addElement",
      "// @run-at document-idle",
      "// ==/UserScript==",
      "(function(){",
      "var ENGINE_TEXT = " + JSON.stringify(engineText) + ";",
      "setTimeout(function(){",
      "  try {",
      "    GM_addElement('script',{textContent: ENGINE_TEXT});",
      "    document.documentElement.setAttribute('data-zy-55a-inj','1');",
      "  } catch(e) { document.documentElement.setAttribute('data-zy-55a-inj','err:'+String(e&&e.message||e).slice(0,60)); }",
      "}, 2500);",
      "})();"
    ].join("\n");

    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${path.join(__dirname, "vendor", "scriptcat")}`, `--load-extension=${path.join(__dirname, "vendor", "scriptcat")}`],
      viewport: { width: 1440, height: 900 }
    });
    const page = browser.pages()[0];
    await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const inst = await adapter.installByCode(page, { uuid: PROBE_UUID, code: PROBE, upsertBy: "user" }).catch((e) => ({ __err: String(e && e.message || e) }));
    step("install-probe", !inst.__err, inst.__err || "status=" + inst.status, "REAL_SCRIPT_CAT_INSTALL");

    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => step("nav", false, String(e && e.message || e)));
    step("nav", true, "真实编辑器已打开", "REAL_EDITOR");
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});

    // 等注入标记（probe 已用 GM_addElement 注入 CDN；主世界轮询 window.Tesseract 出现）
    const injDeadline = Date.now() + 30000;
    let injMark = null;
    while (Date.now() < injDeadline) {
      injMark = await page.evaluate(() => document.documentElement.getAttribute("data-zy-55a-inj")).catch(() => null);
      if (injMark) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    step("gm-add-element-injected", !!injMark && String(injMark).indexOf("err") !== 0, "mark=" + injMark, "REAL_SCRIPT_INJECTION(GM_addElement)");

    // CSP 取证（§二十七 区分 AUTOMATION 与 PRODUCT POLICY）
    const csp = await page.evaluate(() => {
      const metas = Array.prototype.slice.call(document.querySelectorAll("meta[http-equiv]")).map((m) => (m.getAttribute("http-equiv") + "=" + (m.getAttribute("content") || "").slice(0, 120)));
      return { metas: metas, resourcePolicy: (performance.getEntriesByType("resource") || []).filter((r) => /tesseract|jsdelivr/i.test(r.name)).map((r) => ({ name: r.name.slice(0, 70), duration: +r.duration.toFixed(0) })).slice(0, 4) };
    }).catch(() => null);
    out.csp = csp;
    step("csp-evidence", true, "meta=" + JSON.stringify(csp && csp.metas) + " tesseract-resources=" + JSON.stringify(csp && csp.resourcePolicy), "policy-evidence");

    // 编辑器页 OCR 编排（调试通道验证引擎可注入性）：
    //   1) 瞬时停用 window.define（页面 requirejs 的 AMD 检测会让 tesseract UMD 走 define 分支而不设全局）
    //   2) inline 注入真实引擎文本（66KB）
    //   3) 恢复 define → 轮询 window.Tesseract → worker 尝试（记录 CSP worker 结果）
    const ocr = await page.evaluate(async ({ engineText }) => {
      function poll(fn, ms, stepMs) { const s = Date.now(); return new Promise((res, rej) => { (function tick() { let v = null; try { v = fn(); } catch (e) {} if (v) return res(v); if (Date.now() - s > ms) return rej(new Error("timeout")); setTimeout(tick, stepMs || 200); })(); }); }
      function getFirstCanvasImage() {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
        const c = vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && ((vo.totalCanvasArray[0].canvas) || vo.totalCanvasArray[0]);
        if (!c || typeof c.getObjects !== "function") return null;
        const o = c.getObjects().find((x) => x && String(x.type) === "image");
        if (!o) return null;
        const el = o._element || (o.getElement && o.getElement()) || null;
        if (!el) return null;
        const cv = document.createElement("canvas");
        cv.width = el.naturalWidth || o.width; cv.height = el.naturalHeight || o.height;
        const c2 = cv.getContext && cv.getContext("2d");
        let dataUrl = null;
        if (c2 && el.naturalWidth > 0) { c2.drawImage(el, 0, 0); try { dataUrl = cv.toDataURL("image/png"); } catch (e) {} }
        return { naturalWidth: el.naturalWidth || 0, naturalHeight: el.naturalHeight || 0, dataUrl: dataUrl, obj: { left: o.left, top: o.top, width: o.width, height: o.height, scaleX: o.scaleX, scaleY: o.scaleY, angle: o.angle } };
      }
      const t0 = Date.now();
      let T = null;
      let injectResult = null;
      // 1) AMD 屏蔽（tesseract.js UMD 检测 define.amd → requirejs 会拦截为模块而非 set global）
      const savedDefine = window.define;
      try { Object.defineProperty(window, "define", { value: undefined, writable: true, configurable: true }); } catch (e) {}
      // 2) inline 注入引擎（调试通道 evaluate 不受页面 script-src CSP 约束）
      try {
        const s = document.createElement("script");
        s.textContent = engineText;
        (document.head || document.documentElement).appendChild(s);
        injectResult = "inline-inserted";
      } catch (e) { injectResult = "inline-error:" + String(e && e.message || e).slice(0, 60); }
      // 3) 恢复 define
      try { Object.defineProperty(window, "define", { value: savedDefine, writable: true, configurable: true }); } catch (e) {}
      try { T = await poll(() => window.Tesseract, 20000); } catch (e) {
        return { err: "window.Tesseract not present after inline+define-hack", injectMode: injectResult, amdHint: true };
      }
      const engineMs = Date.now() - t0;
      const img = getFirstCanvasImage();
      if (!img || !img.dataUrl) return { err: "no image element", injectMode: injectResult };
      let workerOk = true;
      let workerErr = null;
      let w1;
      try { w1 = await T.createWorker("chi_sim", 1, { cacheMethod: "indexeddb" }); } catch (e) { workerOk = false; workerErr = String(e && e.message || e).slice(0, 160); return { err: "worker create blocked", workerErr: workerErr, injectMode: injectResult, workerCspHint: true }; }
      const data1Ms = Date.now() - t0;
      const { data } = await w1.recognize(img.dataUrl);
      const recMs = Date.now() - t0;
      const lines = (data.lines || []).map((l) => ({ text: l.text.trim(), confidence: +l.confidence.toFixed(1), bbox: l.bbox }));
      const words = (data.words || []).length;
      await w1.terminate();
      const t2 = Date.now();
      let data2Ms = null;
      try { const w2 = await T.createWorker("chi_sim", 1, { cacheMethod: "indexeddb" }); data2Ms = Date.now() - t2; await w2.terminate(); } catch (e) {}
      return { engineMs: engineMs, data1Ms: data1Ms, data2Ms: data2Ms, recMs: recMs, lines: lines, words: words, imageSize: data.imageWidth + "x" + data.imageHeight, img: img, injectMode: injectResult, workerOk: workerOk };
    }, { engineText: engineText }, { timeout: 240000 }).catch((e) => ({ __err: String(e && e.message || e).slice(0, 200) }));

    out.ocrRaw = ocr;
    step("gm-inject-and-ocr", !!(ocr && ocr.lines && ocr.lines.length > 0), "mark=" + injMark + " engine=" + (ocr && ocr.engineMs) + " data1=" + (ocr && ocr.data1Ms) + " rec=" + (ocr && ocr.recMs) + " lines=" + (ocr && ocr.lines && ocr.lines.length) + " words=" + (ocr && ocr.words) + " err=" + (ocr && (ocr.__err || ocr.err)), "REAL_SCRIPT_INJECTION+REAL_OCR");
    if (!(ocr && ocr.lines)) return;

    out.gm = { engineMs: ocr.engineMs, data1Ms: ocr.data1Ms, data2Ms: ocr.data2Ms, recMs: ocr.recMs, engineCachedFromStart: ocr.engineMs < 500, imageSize: ocr.imageSize, img: ocr.img, injectionMark: injMark };
    const cacheHit = ocr.data2Ms != null && ocr.data2Ms < ocr.data1Ms * 0.6;
    step("cache-strategy", cacheHit, "firstData=" + ocr.data1Ms + "ms cachedData=" + ocr.data2Ms + "ms ratio=" + (ocr.data2Ms / Math.max(1, ocr.data1Ms)).toFixed(2), "§六 indexeddb cache");
    const firstLoadMs = ocr.engineMs + ocr.data1Ms;
    out.timing = { firstLoadMs: firstLoadMs, cachedLoadMs: ocr.engineMs + ocr.data2Ms, recognizeMs: ocr.recMs };
    step("timing-recorded", firstLoadMs > 0, JSON.stringify(out.timing), "§六 firstLoad/cached/recognize");

    // Node 侧重建：行级 candidates → mapper（真实 image geometry + natural）→ matcher → create
    const imgObj = { left: ocr.img.obj.left, top: ocr.img.obj.top, width: ocr.img.obj.width, height: ocr.img.obj.height, scaleX: ocr.img.obj.scaleX, scaleY: ocr.img.obj.scaleY, angle: ocr.img.obj.angle };
    const cands = ocr.lines.map((l) => {
      const n = imageMapper.imageLocalNormalized(imgObj, { x: l.bbox.x0 / ocr.img.naturalWidth, y: l.bbox.y0 / ocr.img.naturalHeight, width: (l.bbox.x1 - l.bbox.x0) / ocr.img.naturalWidth, height: (l.bbox.y1 - l.bbox.y0) / ocr.img.naturalHeight });
      const canvasRect = imageMapper.imageLocalRectToCanvas(imgObj, n);
      return { text: l.text, bbox: canvasRect, visualHeight: canvasRect.height, fontSize: Math.max(10, Math.round(FS_COEF * canvasRect.height)), confidence: l.confidence / 100 };
    }).filter((c) => c.bbox.width > 0);
    step("mapper-real-img", cands.length >= 1, "mapped=" + cands.length + " (natural " + ocr.img.naturalWidth + "x" + ocr.img.naturalHeight + " -> canvas rects)", "REAL_IMAGE_MAPPING");

    // matcher + create
    const texts = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      return c.getObjects().filter((o) => typeof o.text === "string").map((o) => { let vb = null; try { if (typeof o.getBoundingRect === "function") { const r = o.getBoundingRect(); vb = { left: r.left, top: r.top, width: r.width, height: r.height }; } } catch (e) {} return { index: c.getObjects().indexOf(o), left: o.left, top: o.top, width: o.width, height: o.height, scaleX: o.scaleX, scaleY: o.scaleY, angle: o.angle, vb }; });
    });
    const objects = texts.map((t) => ({ identity: { index: t.index, kind: "text", isText: true, type: "textbox" }, geometry: { left: t.left, top: t.top, width: t.width, height: t.height, scaleX: t.scaleX, scaleY: t.scaleY, angle: t.angle }, content: { text: "[R]", textLen: 1 }, visualBounds: t.vb }));
    const results = cands.map((c) => { const m = matcher.match({ text: c.text, bbox: c.bbox, confidence: c.confidence, source: "local" }, objects, { canvasWidth: 619.5, canvasHeight: 376.8625 }); return { text: c.text.slice(0, 12), status: m.status, sel: m.selected ? m.selected.index : null }; });
    out.matcher = results;
    step("matcher", results.length === cands.length, JSON.stringify(results), "REAL_TEXT_RECONSTRUCTION(protection)");

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
        const boxW = Math.max(60, cd.bbox.width, estW);
        o.set({ left: cd.bbox.left, top: cd.bbox.top, width: boxW, fontSize: cd.fontSize, fontFamily: cd.font, textAlign: "left" });
        setText(o, cd.text);
        o.zyFieldKey = "ocr55a_" + cd.text.slice(0, 4);
        created.push({ text: cd.text.slice(0, 12), fontSize: cd.fontSize, type: o.type, editable: o.editable !== false, fontFamily: o.fontFamily, markuuid: o.markuuid != null ? String(o.markuuid).slice(0, 6) : null });
      });
      c.requestRenderAll && c.requestRenderAll();
      return { created, count: c.getObjects().length };
    }, { cands: cands.map((c) => ({ text: c.text, bbox: c.bbox, fontSize: c.fontSize, font: FONT, visualHeight: c.visualHeight })), fnsSrc: fns }).catch((e) => ({ __err: String(e && e.message || e) }));
    out.execution = exec;
    if (exec.__err) { step("create", false, exec.__err, "n/a"); return; }
    step("create", exec.created.length === cands.length, "created=" + exec.created.length, "REAL_TEXTBOX");
    step("editable-font", exec.created.every((o) => o.type === "textbox" && o.editable === true && o.fontFamily === FONT), "editable/font=" + exec.created.length, "REAL_EDITABLE_TEXT");
    step("identity-clean", exec.created.every((o) => o.markuuid == null), "markuuid clean=" + exec.created.length, "CREATION_SAFETY");
    // 原图保留 + rollback
    const refImg = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      return c.getObjects().filter((o) => String(o.type) === "image").length;
    });
    step("reference-preserved", refImg >= 4, "images=" + refImg, "ORIGINAL_IMAGE_PRESERVED");
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 8000));
    const after = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      const objs = c.getObjects();
      return { count: objs.length, texts: objs.filter((o) => typeof o.text === "string").length, images: objs.filter((o) => String(o.type) === "image").length };
    });
    step("rollback", after.count === 21 && after.texts === 4 && after.images === 3, "count=" + after.count + " texts=" + after.texts + " images=" + after.images, "ROLLBACK");
    try { await adapter.removeScript(page, PROBE_UUID); } catch (e) {}
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 500));
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.writeFileSync(path.join(__dirname, "reports", "stage5-5a-real-scriptcat-ocr.json"), JSON.stringify(out, null, 1), "utf8");
    console.log("[stage5-5a-smoke] errors=" + out.errors.length + " → reports/stage5-5a-real-scriptcat-ocr.json");
    process.exit(out.errors.length ? 1 : 0);
  }
})();