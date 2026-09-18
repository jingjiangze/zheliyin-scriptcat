// runtime/stage-7-3-font-inventory.js — Native Font Inventory + Native Textbox 字段 Runtime Inventory
// Electron-free: 复用 External Chrome persistent profile（真实登录，profile-usc3）。
// 目标（Stage 7.3 第二/三目标）：
//   1) 抓取网页原生字体资源 findAllFont.do 的真实响应（脱敏后存 JSON）
//   2) DOM 侧 fontFamily 面板 li[fontid] 交叉核对
//   3) 读取模板既有 textbox 的真实字体/样式字段（CanvasObjVO, 不只看输入框）
//   4) 用原生 CanvasDiy.drawText 建一个探针 textbox，读回完整字段（含 media.font）并清理
// 输出：runtime/reports/stage-7-3-font-inventory.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-7-3-font-inventory.json");

const FONT_FIELD_SUBSET = ["text", "fontFamily", "fontSize", "fill", "fontWeight", "fontStyle", "lineHeight", "charSpacing", "textAlign", "layerNum", "multiUuid", "markuuid", "mediaMediaType", "italic", "isBold", "fontId", "fontName"];

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-7.3-FONT-INVENTORY", url: EDITOR_URL, phases: {}, errors: [] };
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    browser.on("dialog", (d) => { d.accept().catch(() => {}); });
    const page = browser.pages()[0];
    const readyEval = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = (vo && Array.isArray(vo.totalCanvasArray) && vo.totalCanvasArray[0]) || null;
      const c = d && (d.canvas || d);
      return { ok: !!(d && c && c.getObjects && typeof d.drawText === "function") };
    }).catch(() => ({ ok: false }));
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    let ok = false;
    const d1 = Date.now() + 150000;
    while (Date.now() < d1) { ok = await readyEval(); if (ok && ok.ok) break; await page.waitForTimeout(2000); }
    report.phases.ready = !!(ok && ok.ok);
    if (!ok) throw new Error("editor not ready after 150s");

    // ---- Phase 1: findAllFont.do ----
    report.phases.findAllFont = await page.evaluate(async () => {
      const out = { method: null, status: null, count: null, sampleFields: null, first3: [], domFontlist: null, pageReloaded: false };
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 20000);
        const r = await fetch("diy/findAllFont.do", { method: "POST", credentials: "include", signal: ctrl.signal });
        clearTimeout(to);
        out.method = r.status === 200 ? "fetch-post-ok" : "fetch-post-" + r.status;
        out.status = r.status;
        const text = await r.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (e) {}
        if (!parsed) { out.raw = String(text).slice(0, 300); return out; }
        const userData = parsed.userData || parsed.data || parsed.list || parsed.rows || (Array.isArray(parsed) ? parsed : null);
        const arr = Array.isArray(userData) ? userData : (userData && userData.data) || [];
        out.count = arr.length;
        out.sampleFields = arr.length ? Object.keys(arr[0] || {}) : null;
        out.first3 = arr.slice(0, 3); // 字体元数据非敏感
        return out;
      } catch (e) {
        out.method = "fetch-error " + String(e && e.message || e).slice(0, 120);
        // 兜底：触发保存按钮，从网络钩抓 findAllFont.do（同 probe7 方式）
        try {
          const btn = document.querySelector(".rightBtn .save");
          if (btn) btn.click();
          out.savedTriggered = true;
        } catch (e2) {}
        return out;
      }
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // findAllFont 最小目录（FontResolver 用：id/fontname/fontclassify/defaultimage，去 fontpath 压缩）
    report.phases.findAllFontMin = await page.evaluate(async () => {
      try {
        const r = await fetch("diy/findAllFont.do", { method: "POST", credentials: "include" });
        const parsed = await r.json();
        const arr = Array.isArray(parsed) ? parsed : (parsed.userData || parsed.data || parsed.list || []);
        if (!Array.isArray(arr)) return { err: "unexpected shape", keys: Object.keys(parsed || {}) };
        return arr.map((f) => ({ id: f.id, fontname: f.fontname, fontclassify: f.fontclassify, defaultimage: f.defaultimage != null ? String(f.defaultimage).slice(0, 120) : null }));
      } catch (e) { return { err: String(e && e.message || e).slice(0, 160) }; }
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // 网络钩（兜底 findAllFont 响应与保存序列观测）
    await page.evaluate(() => {
      window.__zyFontNet = [];
      const rec = (m, u, s, b) => { if (!u) return; (window.__zyFontNet).push(m + " " + String(u).slice(-120) + (s ? " ->" + s : "") + (b ? " body=" + String(b).slice(0, 200) : "")); };
      const oa = window.jQuery && window.jQuery.ajax;
      if (oa && !oa.__zyFontHooked) {
        const wrap = function (opts2) {
          const o = opts2 && typeof opts2 === "object" ? opts2 : {};
          try { rec("jq." + (o.type || "GET"), o.url, null, null); } catch (e) {}
          const s2 = o.success;
          o.success = function (d) { try { if (String(o.url || "").indexOf("Font") >= 0) rec("jqRes", o.url, "200", typeof d === "string" ? d : JSON.stringify(d)); } catch (e) {} if (typeof s2 === "function") { try { return s2.apply(this, arguments); } catch (e2) {} } };
          return oa.call(this, o);
        };
        wrap.__zyFontHooked = true;
        window.jQuery.ajax = wrap;
      }
    }).catch(() => {});

    // ---- Phase 2: DOM fontFamily 面板 ----
    report.phases.domFont = await page.evaluate(() => {
      const items = Array.prototype.map.call(document.querySelectorAll(".fontFamily li, .editFontFamily li"), (li) => ({
        fontid: li.getAttribute ? li.getAttribute("fontid") : null,
        title: String(li.getAttribute ? (li.getAttribute("title") || li.getAttribute("fontname") || li.textContent) : "").slice(0, 40)
      })).slice(0, 8);
      return { count: document.querySelectorAll(".fontFamily li, .editFontFamily li").length, items: items };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // ---- Phase 3: 既有 textbox 字体/样式字段（不只看输入框）----
    const findDiySrc = "(function(){var req=window.requirejs||window.require;var vo=(req&&req.s&&req.s.contexts&&req.s.contexts._&&req.s.contexts._.defined&&req.s.contexts._.defined.CanvasObjVO)||window.CanvasObjVO;if(!vo||!Array.isArray(vo.totalCanvasArray))return null;for(var i=0;i<vo.totalCanvasArray.length;i++){var d=vo.totalCanvasArray[i];if(d&&typeof d.drawText==='function'&&d.canvas&&d.canvas.getObjects&&d.canvasObjInfo)return d;}return null;})()";
    report.phases.existingObjects = await page.evaluate((p) => {
      const subset = p.subset;
      const req = window.requirejs || window.require;
      const vo = (req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO;
      if (!vo || !Array.isArray(vo.totalCanvasArray)) return { err: "no CanvasObjVO" };
      const flatten = (objs, acc, depth) => {
        acc = acc || [];
        (Array.isArray(objs) ? objs : []).forEach((o) => {
          if (!o || depth > 3) return;
          acc.push(o);
          try { flatten(o.getObjects ? o.getObjects() : [], acc, depth + 1); } catch (e) {}
        });
        return acc;
      };
      const isTextish = (o) => o && ((o.text != null) || (o.media && o.media.mediaType === "text") || String(o.type) === "i-text" || String(o.type) === "textbox");
      const pick = (o) => {
        const r = {};
        subset.forEach((k) => { if (o[k] !== undefined) r[k] = o[k]; });
        if (o.media && o.media.font) { r._mediaFont = { text: String(o.text || "").slice(0, 12) }; Object.keys(o.media.font).forEach((k) => { r._mediaFont[k] = o.media.font[k]; }); }
        if (o.media) r._mediaKeys = Object.keys(o.media);
        if (o.type) r.type = o.type;
        return r;
      };
      const perCanvas = [];
      const samples = [];
      vo.totalCanvasArray.forEach((d, idx) => {
        if (!d || !d.canvas || !d.canvas.getObjects) return;
        const flat = flatten(d.canvas.getObjects(), [], 0);
        const texts = flat.filter(isTextish);
        perCanvas.push({ idx: idx, total: d.canvas.getObjects().length, flat: flat.length, textish: texts.length });
        if (samples.length < 3 && texts.length) samples.push.apply(samples, texts.slice(0, 3).map(pick));
      });
      return { perCanvas: perCanvas, totalTextish: samples.length, sample: samples };
    }, { src: findDiySrc, subset: FONT_FIELD_SUBSET }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // ---- Phase 4: 原生 drawText 探针 textbox 读回 ----
    report.phases.nativeProbe = await page.evaluate((p) => {
      const d = eval(p.src);
      if (!d) return { err: "no live CanvasDiy" };
      const subset = p.subset;
      const baseLayer = d.canvasObjInfo.canvasToProductObjArr.length;
      const uid = "font-probe-" + Date.now();
      const entry = {
        media: { mediaType: "text", text: uid, font: { pointSize: 24, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "1", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.2, lineIdType: 0, isBG: 0, imgPath: "" },
        location: { x: 80, y: 80, width: 180, height: 40, factWidth: 180, factHeight: 40, rotation: 0 },
        printLocation: { x: 80, y: 80, width: 180, height: 40, rotation: 0 },
        layer: { alpha: 1 }, layerNum: baseLayer, isEdit: 1, isDisplay: 1, deleteState: 0, visitLevel: 1,
        multiUuid: uid, markuuid: ""
      };
      const before = d.canvas.getObjects().length;
      try { d.drawText(uid, null, null, null, entry, baseLayer); }
      catch (e) { return { err: String(e && e.message || e).slice(0, 200), before: before }; }
      const created = d.canvas.getObjects().filter((o) => String(o.text || "") === uid)[0] || null;
      if (!created) return { err: "created object not found by text", before: before, after: d.canvas.getObjects().length };
      const pick = (o) => {
        const r = {};
        subset.forEach((k) => { if (o[k] !== undefined) r[k] = o[k]; });
        if (o.media && o.media.font) { r._mediaFont = {}; Object.keys(o.media.font).forEach((k) => { r._mediaFont[k] = o.media.font[k]; }); }
        if (o.media) r._mediaKeys = Object.keys(o.media);
        r._ownProps = Object.getOwnPropertyNames(o).filter((n) => /font|fill|style|color|weight|spacing|line|text/i.test(n)).slice(0, 40);
        return r;
      };
      const readback = pick(created);
      // 补充：完整 media font 字段 / 序列化形态 / mediafont* 自有属性全量
      let mediaFull = null, toJsonKeys = null, mediafontProps = null, allFontProps = null;
      try { if (created.media) mediaFull = JSON.parse(JSON.stringify(created.media)); } catch (e) {}
      try { const j = created.toJSON ? created.toJSON() : null; if (j) toJsonKeys = Object.keys(j); } catch (e) {}
      try { mediafontProps = Object.getOwnPropertyNames(created).filter((n) => /mediafont/i.test(n)); } catch (e) {}
      try { allFontProps = Object.getOwnPropertyNames(created).filter((n) => /font/i.test(n)); } catch (e) {}
      try { const li = d.canvasObjInfo.canvasToProductObjArr.indexOf(created); if (li >= 0) d.canvasObjInfo.canvasToProductObjArr.splice(li, 1); } catch (e2) {}
      try { d.canvas.remove(created); } catch (e3) {}
      return { before: before, after: d.canvas.getObjects().length, readback: readback, mediaFull: mediaFull, toJsonKeys: toJsonKeys, mediafontProps: mediafontProps, allFontProps: allFontProps };
    }, { src: findDiySrc, subset: FONT_FIELD_SUBSET }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // 收集 2s 网络（兜底 findAllFont 响应）
    await page.waitForTimeout(2000);
    report.phases.net = await page.evaluate(() => (window.__zyFontNet || []).slice()).catch(() => []);
    report.phases.cleanup = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
      return d ? d.canvas.getObjects().length : -1;
    }).catch(() => -1);
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.message || e).slice(0, 300));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log("STAGE-7.3-FONT-INVENTORY done -> " + REPORT_PATH);
  console.log("ready=" + report.phases.ready + " findAllFont=" + JSON.stringify(report.phases.findAllFont).slice(0, 400));
  console.log("existing=" + JSON.stringify(report.phases.existingObjects).slice(0, 400));
  console.log("nativeProbe=" + JSON.stringify(report.phases.nativeProbe).slice(0, 600));
})().catch((e) => { console.error("probe crashed: " + e); process.exit(1); });