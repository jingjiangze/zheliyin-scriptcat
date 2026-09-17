// runtime/stage-6-2-native-probe.js — Stage 6.2 §十三~§二十二 真机原生管线对拍（R2 修复版）
// 修复：count.page 箭头函数、TEXT media 最小条目构造（空模板场景）、多参 evaluate 包对象
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-6-2-native-probe.json");
const FIELD_KEYS = [
  "type", "text", "multiUuid", "uuid", "markuuid", "layerNum",
  "mediaMediaType", "isDesign", "isEdit", "isLineText", "deleteState",
  "locationX", "locationY", "locationWidth", "locationHeight", "locationRotation",
  "printLocationX", "printLocationY", "printLocationWidth", "printLocationHeight", "printLocationRotation",
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "charSpacing",
  "isPreview", "isDisplay", "left", "top", "width", "height", "angle", "scaleX", "scaleY",
  "mediaText", "mediafontPointSize", "mediafontColor", "mediafontId", "mediafontIsHorizontal",
  "mediafontGravity", "mediaIsItalic", "mediaIsBold", "mediaWordSpace", "mediaLineSpace",
  "layerAlpha", "visible", "protoVisible", "visitLevel", "fill", "originX", "originY"
];

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-6-2-NATIVE-PROBE-R2", url: EDITOR_URL, phases: {}, errors: [] };
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    const page = browser.pages()[0];
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    let rd = null;
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
      rd = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
        const t = vo && vo.totalCanvasArray;
        const d = (Array.isArray(t) && t[0]) || null;
        const c = d && (d.canvas || d);
        return { ok: !!(d && c && c.getObjects && typeof d.drawText === "function"), objs: c ? c.getObjects().length : 0 };
      }).catch(() => ({ ok: false }));
      if (rd && rd.ok) break;
      await page.waitForTimeout(2000);
    }
    report.phases.ready = rd || { ok: false };
    if (!(rd && rd.ok)) throw new Error("editor not ready");
    await page.waitForTimeout(4000); // 模板异步对象落定

    // ============ Phase 0：基线 + 最小 TEXT media 构造要素 ============
    const preset = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const defs = (ctx && ctx.defined) || {};
      const vo = defs.CanvasObjVO || window.CanvasObjVO;
      const diy = vo.totalCanvasArray[0];
      const c = diy.canvas;
      const pageIdx = vo.currentCanvasNum - 1;
      const U = defs.Undo ? defs.Undo.getInstance() : null;
      // fontId 来源（r124 TEXT 分支所用 DOM）
      const fontLi = document.querySelector(".fontFamily li") || document.querySelector(".editFontFamily li");
      const fontId = fontLi ? fontLi.getAttribute("fontid") : null;
      const fontName = fontLi ? fontLi.getAttribute("fontname") : null;
      // ProductVO 全局空间（r124 依赖模块）
      const pvo = defs.ProductVO || null;
      const itemList = pvo && pvo.pageList && pvo.pageList[pageIdx] && pvo.pageList[pageIdx].content && pvo.pageList[pageIdx].content.itemList;
      const textMediaInItemList = itemList ? itemList.find((it) => it.media && it.media.mediaType === "text") || null : null;
      return {
        canvasObjs: c.getObjects().length,
        layerArrLen: diy.canvasObjInfo.canvasToProductObjArr.length,
        undoLen: (vo.undoAndRedo.undo[pageIdx] || []).length,
        redoLen: (vo.undoAndRedo.redo[pageIdx] || []).length,
        pageIdx, currentCanvasNum: vo.currentCanvasNum,
        hasUndoModule: !!U,
        fontId, fontName,
        itemListLen: itemList ? itemList.length : null,
        hasProductVO: !!pvo,
        templateTextMedia: textMediaInItemList,
        isBlankTemplate: itemList ? itemList.length === 0 : null,
        canvasJsonSample: JSON.stringify(pvo && pvo.pageList && pvo.pageList[pageIdx] ? { workAreaWidth: pvo.pageList[pageIdx].workAreaWidth, workAreaHeight: pvo.pageList[pageIdx].workAreaHeight, dpi: pvo.pageList[pageIdx].dpi } : null)
      };
    }).catch((e) => ({ err: String(e || "").slice(0, 300) }));
    report.phases.p0_baseline = preset;
    if (preset.err) throw new Error("p0 failed: " + preset.err);
    const undoLenPre = preset.undoLen;
    const redoLenPre = preset.redoLen;

    // ============ Phase 1：临时 hook ============
    const hookLog = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const defs = (ctx && ctx.defined) || {};
      const vo = defs.CanvasObjVO || window.CanvasObjVO;
      const diy = vo.totalCanvasArray[0];
      const diyC = diy.canvas;
      const U = defs.Undo ? defs.Undo.getInstance() : null;
      const PJA = defs.ProductJsonObjAssignment || null;
      const log = [];
      const rec = (fn, b, a, extra) => log.push({ fn, t: Date.now() - W_T0, before: b, after: a, extra: String(extra || "").slice(0, 220) });
      window.W_T0 = Date.now();
      const pageIdx = () => vo.currentCanvasNum - 1;
      const undoLen = () => (vo.undoAndRedo.undo[pageIdx()] || []).length;
      const redoLen = () => (vo.undoAndRedo.redo[pageIdx()] || []).length;
      const stats = { canvas: () => diyC.getObjects().length, layer: () => diy.canvasObjInfo.canvasToProductObjArr.length, undo: undoLen, redo: redoLen };
      window.__zyProbeLog = log;
      const o1 = diy.drawText; const o2 = diyC.add; const o3 = diy.checkObjsInProductJson;
      const o4 = U && U.save; const o5 = PJA && PJA.createObjProductJsonDetail;
      window.__zyProbeRestore = () => {
        try { diy.drawText = o1; } catch (e) {}
        try { diyC.add = o2; } catch (e) {}
        try { diy.checkObjsInProductJson = o3; } catch (e) {}
        try { if (U && o4) U.save = o4; } catch (e) {}
        try { if (PJA && o5) PJA.createObjProductJsonDetail = o5; } catch (e) {}
        return true;
      };
      const snapBefore = { canvas: stats.canvas(), layer: stats.layer(), undo: stats.undo(), redo: stats.redo() };
      try {
        diy.drawText = function () {
          const args = Array.prototype.slice.call(arguments);
          const b = { canvas: stats.canvas(), layer: stats.layer(), undo: stats.undo(), redo: stats.redo() };
          rec("drawText", b, null, "args=" + args.map((a) => (a && typeof a === "object" ? "{keys:" + Object.keys(a).slice(0, 6) + ",text:" + (a.text || "") + "}" : String(a).slice(0, 40))).join("|"));
          const r = o1.apply(this, arguments);
          rec("drawText", b, { canvas: stats.canvas(), layer: stats.layer(), undo: stats.undo(), redo: stats.redo() }, "ok");
          return r;
        };
        diyC.add = function (obj) {
          const b = { canvas: stats.canvas(), layer: stats.layer() };
          const r = o2.apply(this, arguments);
          rec("canvas.add", b, { canvas: stats.canvas(), layer: stats.layer() }, "obj=" + String((obj && (obj.text || obj.mediaText || obj.type)) || "").slice(0, 60));
          return r;
        };
        if (o3) diy.checkObjsInProductJson = function (m) {
          const b = { layer: stats.layer() };
          const r = o3.apply(this, arguments);
          rec("checkObjsInProductJson", b, { layer: stats.layer() }, "mediaType=" + ((m && m.media && m.media.mediaType) || "?"));
          return r;
        };
        if (U && o4) U.save = function () {
          const b = { undo: stats.undo(), redo: stats.redo() };
          const r = o4.apply(this, arguments);
          rec("Undo.save", b, { undo: stats.undo(), redo: stats.redo() }, "ok");
          return r;
        };
        if (PJA && o5) PJA.createObjProductJsonDetail = function (o, m, cv) {
          const b = { canvas: stats.canvas() };
          const r = o5.apply(this, arguments);
          rec("createObjProductJsonDetail", b, { canvas: stats.canvas() }, "mediaType=" + ((m && m.media && m.media.mediaType) || "?"));
          return r;
        };
      } catch (e) { rec("hook-install-error", null, null, String(e || "").slice(0, 160)); }
      return { hooked: true, snapBefore, log };
    }).catch((e) => ({ err: String(e || "").slice(0, 300) }));
    report.phases.p1_hook = hookLog;
    const hookLogArr = (hookLog && hookLog.log) || [];

    // ============ Phase 2：T1 原生新增（manual 路径）============
    const t1 = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const defs = (ctx && ctx.defined) || {};
      const vo = defs.CanvasObjVO || window.CanvasObjVO;
      const diy = vo.totalCanvasArray[0];
      const U = defs.Undo ? defs.Undo.getInstance() : null;
      const before = { canvas: diy.canvas.getObjects().length, layer: diy.canvasObjInfo.canvasToProductObjArr.length };
      try { if (U && U.save) U.save(); } catch (e) {}
      diy.drawText("对拍文字123", 16, 120, 130);
      const objs = diy.canvas.getObjects();
      let created = null;
      for (let i = objs.length - 1; i >= 0; i--) { if (objs[i].text === "对拍文字123") { created = objs[i]; break; } }
      const after = { canvas: diy.canvas.getObjects().length, layer: diy.canvasObjInfo.canvasToProductObjArr.length };
      return {
        before, after, found: !!created,
        layerRegisteredIndex: created ? diy.canvasObjInfo.canvasToProductObjArr.indexOf(created) : -1,
        uuid: created ? created.uuid : null, text: created ? created.text : null,
        fontSize: created ? created.fontSize : null, left: created ? created.left : null, top: created ? created.top : null,
        isEdit: created ? created.isEdit : null, mediaMediaType: created ? created.mediaMediaType : null,
        layerNum: created ? created.layerNum : null, multiUuid: created ? created.multiUuid : null
      };
    }).catch((e) => ({ err: String(e || "").slice(0, 400) }));
    report.phases.p2_t1_create = t1;
    await page.waitForTimeout(1800);

    const t1Fields = await page.evaluate((keys) => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const defs = (ctx && ctx.defined) || {};
      const vo = defs.CanvasObjVO || window.CanvasObjVO;
      const diy = vo.totalCanvasArray[0];
      const objs = diy.canvas.getObjects();
      let o = null;
      for (let i = objs.length - 1; i >= 0; i--) { if (objs[i].text === "对拍文字123") { o = objs[i]; break; } }
      if (!o) return { found: false };
      const own = Object.keys(o);
      const vals = {};
      keys.forEach((k) => { vals[k] = o[k] !== undefined ? JSON.stringify(o[k] === null ? null : o[k]).slice(0, 90) : "<absent>"; });
      const layerIdx = diy.canvasObjInfo.canvasToProductObjArr.indexOf(o);
      return { found: true, layerIdx, ownKeyCount: own.length, vals };
    }, FIELD_KEYS).catch((e) => ({ err: String(e || "").slice(0, 300) }));
    report.phases.p2_t1_fields = t1Fields;

    // ============ Phase 3：原生撤销 / 重做闭环 ============
    const undoRedo = await page.evaluate(async () => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const defs = (ctx && ctx.defined) || {};
      const vo = defs.CanvasObjVO || window.CanvasObjVO;
      const diy = vo.totalCanvasArray[0];
      const pageIdx = vo.currentCanvasNum - 1;
      const snapshot = (tag) => ({ tag, canvas: diy.canvas.getObjects().length, t1OnCanvas: diy.canvas.getObjects().some((o) => o.text === "对拍文字123"), layer: diy.canvasObjInfo.canvasToProductObjArr.length, t1InLayer: diy.canvasObjInfo.canvasToProductObjArr.some((o) => o.text === "对拍文字123"), undoLen: (vo.undoAndRedo.undo[pageIdx] || []).length, redoLen: (vo.undoAndRedo.redo[pageIdx] || []).length });
      const res = [];
      try { var U = defs.Undo.getInstance(); U.save(); } catch (e) {}   // 创建后快照
      res.push(snapshot("afterPostSave"));
      const clickBtn = (sel) => { const $b = window.jQuery(sel).filter(":visible").first(); if ($b.length) { $b.trigger("click"); return "clicked"; } return "no-btn"; };
      res.push({ tag: "undoClick", action: clickBtn(".undo") });
      await new Promise((r) => window.setTimeout(r, 1200));
      res.push(snapshot("afterUndoClick"));
      const afterUndo = snapshot("afterUndo2");
      if (afterUndo.t1OnCanvas === true) {
        try { U.replay(vo.undoAndRedo.undo[pageIdx], vo.undoAndRedo.redo[pageIdx], window.jQuery(".redo").filter(":visible").first(), window.jQuery(".undo").filter(":visible").first()); } catch (e) { res.push({ tag: "directReplayErr", err: String(e || "").slice(0, 120) }); }
        await new Promise((r) => window.setTimeout(r, 1200));
        res.push(snapshot("afterUndoDirectReplay"));
      } else {
        res.push(afterUndo);
      }
      res.push({ tag: "redoClick", action: clickBtn(".redo") });
      await new Promise((r) => window.setTimeout(r, 1200));
      res.push(snapshot("afterRedoClick"));
      return res;
    }).catch((e) => ({ err: String(e || "").slice(0, 300) }));
    report.phases.p3_undo_redo = undoRedo;
    await page.waitForTimeout(1200);

    // ============ Phase 4：T2 原生新增（media 路径，最小 TEXT media 条目）============
    const t2 = await page.evaluate((fKeys) => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const defs = (ctx && ctx.defined) || {};
      const vo = defs.CanvasObjVO || window.CanvasObjVO;
      const diy = vo.totalCanvasArray[0];
      const pageIdx = vo.currentCanvasNum - 1;
      const pvo = defs.ProductVO || null;
      const itemList = pvo && pvo.pageList && pvo.pageList[pageIdx] && pvo.pageList[pageIdx].content && pvo.pageList[pageIdx].content.itemList;
      const fontLi = document.querySelector(".fontFamily li") || document.querySelector(".editFontFamily li");
      const fontId = fontLi ? fontLi.getAttribute("fontid") : "1";
      const wa = pvo && pvo.pageList && pvo.pageList[pageIdx] && pvo.pageList[pageIdx].workAreaWidth;
      const ha = pvo && pvo.pageList && pvo.pageList[pageIdx] && pvo.pageList[pageIdx].workAreaHeight;
      const entry = {
        media: { mediaType: "text", text: "对拍media路径", font: { pointSize: 18, fontColor: "#000000", isHorizontal: 1, gravity: "center", id: fontId, isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.2, lineIdType: 0, isBG: 0, imgPath: "" },
        location: { x: 200, y: 220, width: 220, height: 32, factWidth: 220, factHeight: 32, rotation: 0 },
        printLocation: { x: 200, y: 220, width: 220, height: 32, rotation: 0 },
        layer: { alpha: 1 },
        layerNum: 0, isEdit: 1, isDisplay: 1, deleteState: 0, visitLevel: 1,
        multiUuid: "zyprobe-" + Date.now().toString(16) + "-" + Math.random().toString(16).slice(2, 8)
      };
      const before = { canvas: diy.canvas.getObjects().length, layer: diy.canvasObjInfo.canvasToProductObjArr.length, itemList: itemList ? itemList.length : null };
      const newLayerNum = diy.canvasObjInfo.canvasToProductObjArr.length;
      entry.layerNum = newLayerNum;
      try { diy.drawText(entry.media.text, null, null, null, entry, newLayerNum); } catch (e) {
        return { found: false, reason: "drawText threw: " + String(e && e.message || e).slice(0, 320) };
      }
      const objs = diy.canvas.getObjects();
      let created = null;
      for (let i = objs.length - 1; i >= 0; i--) { if (objs[i].text === "对拍media路径") { created = objs[i]; break; } }
      const after = { canvas: diy.canvas.getObjects().length, layer: diy.canvasObjInfo.canvasToProductObjArr.length, itemList: itemList ? itemList.length : null };
      const vals = {};
      fKeys.forEach((k) => { vals[k] = created ? (created[k] !== undefined ? JSON.stringify(created[k]).slice(0, 90) : "<absent>") : null; });
      return {
        found: !!created, before, after,
        layerRegisteredIndex: created ? diy.canvasObjInfo.canvasToProductObjArr.indexOf(created) : -1,
        uuid: created ? created.uuid : null, multiUuid: created ? created.multiUuid : null,
        left: created ? created.left : null, top: created ? created.top : null,
        width: created ? created.width : null, height: created ? created.height : null,
        layerNum: created ? created.layerNum : null, isEdit: created ? created.isEdit : null,
        workArea: { wa, ha },
        vals
      };
    }, FIELD_KEYS).catch((e) => ({ err: String(e || "").slice(0, 400) }));
    report.phases.p4_t2_media = t2;

    const t2Undo = await page.evaluate(async () => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const defs = (ctx && ctx.defined) || {};
      const vo = defs.CanvasObjVO || window.CanvasObjVO;
      const diy = vo.totalCanvasArray[0];
      const pageIdx = vo.currentCanvasNum - 1;
      const snap = (tag) => ({ tag, canvas: diy.canvas.getObjects().length, t2Canvas: diy.canvas.getObjects().some((o) => o.text === "对拍media路径"), layer: diy.canvasObjInfo.canvasToProductObjArr.length, t2Layer: diy.canvasObjInfo.canvasToProductObjArr.some((o) => o.text === "对拍media路径"), undoLen: (vo.undoAndRedo.undo[pageIdx] || []).length, redoLen: (vo.undoAndRedo.redo[pageIdx] || []).length });
      const res = [];
      const $b = window.jQuery(".undo").filter(":visible").first();
      if ($b.length) $b.trigger("click");
      return new Promise((r) => window.setTimeout(() => { res.push(snap("afterT2Undo")); r(res); }, 1400));
    }).catch((e) => ({ err: String(e || "").slice(0, 300) }));
    report.phases.p4_t2_undo = t2Undo;
    await page.waitForTimeout(1000);

    // ============ Phase 5：对拍剩余可见对象（若有）============
    const diff = await page.evaluate((fKeys) => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const defs = (ctx && ctx.defined) || {};
      const vo = defs.CanvasObjVO || window.CanvasObjVO;
      const diy = vo.totalCanvasArray[0];
      const o = diy.canvas.getObjects().find((x) => x.text === "对拍media路径" || x.text === "对拍文字123");
      if (!o) return { found: false, note: "no native test obj on canvas now (expected after undo)" };
      const vals = {};
      fKeys.forEach((k) => { vals[k] = o[k] !== undefined ? JSON.stringify(o[k]).slice(0, 80) : "<absent>"; });
      return { found: true, layerIdx: diy.canvasObjInfo.canvasToProductObjArr.indexOf(o), vals };
    }, FIELD_KEYS).catch((e) => ({ err: String(e || "").slice(0, 300) }));
    report.phases.p5_diff = diff;

    // ============ Phase 6：hook 调用链证据（撤销前读取，避免闭包序列化时机问题）============
    const p6 = await page.evaluate(() => window.__zyProbeLog || []).catch(() => []);
    report.phases.p6_hookLog = p6;

    // ============ Phase 7：完整恢复（多参包对象）============
    const cleanup = await page.evaluate((args) => {
      const preUndo = args.preUndo, preRedo = args.preRedo;
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const defs = (ctx && ctx.defined) || {};
      const vo = defs.CanvasObjVO || window.CanvasObjVO;
      const diy = vo.totalCanvasArray[0];
      const pageIdx = vo.currentCanvasNum - 1;
      const out = {};
      try { out.restoreHooks = window.__zyProbeRestore ? window.__zyProbeRestore() : false; } catch (e) { out.restoreHooks = "err " + String(e).slice(0, 120); }
      delete window.__zyProbeRestore;
      let removed = 0;
      diy.canvas.getObjects().filter((o) => o.text === "对拍文字123" || o.text === "对拍media路径").forEach((o) => {
        const i = diy.canvasObjInfo.canvasToProductObjArr.indexOf(o);
        if (i >= 0) diy.canvasObjInfo.canvasToProductObjArr.splice(i, 1);
        diy.canvas.remove(o); removed += 1;
      });
      diy.canvas.requestRenderAll();
      out.removedObjects = removed;
      out.finalCanvas = diy.canvas.getObjects().length;
      out.finalLayer = diy.canvasObjInfo.canvasToProductObjArr.length;
      try {
        const ua = vo.undoAndRedo.undo[pageIdx]; if (Array.isArray(ua) && ua.length > preUndo) ua.length = preUndo;
        const ra = vo.undoAndRedo.redo[pageIdx]; if (Array.isArray(ra) && ra.length > preRedo) ra.length = preRedo;
        out.undoRestored = { undoLen: (vo.undoAndRedo.undo[pageIdx] || []).length, redoLen: (vo.undoAndRedo.redo[pageIdx] || []).length, preUndo, preRedo };
      } catch (e) { out.undoRestored = "err " + String(e).slice(0, 120); }
      try {
        const pvo = defs.ProductVO || null;
        const il = pvo && pvo.pageList && pvo.pageList[pageIdx] && pvo.pageList[pageIdx].content && pvo.pageList[pageIdx].content.itemList;
        if (il) { const before = il.length; const idx = il.findIndex((it) => it.media && it.media.text === "对拍media路径"); if (idx >= 0) il.splice(idx, 1); out.itemList = { before, after: il.length, removedIdx: idx }; }
      } catch (e) { out.itemList = "err " + String(e).slice(0, 120); }
      try { const U = defs.Undo ? defs.Undo.getInstance() : null; U && U.buttonControl && U.buttonControl(0, 0); } catch (e) {}
      return out;
    }, { preUndo: undoLenPre, preRedo: redoLenPre }).catch((e) => ({ err: String(e || "").slice(0, 300) }));
    report.phases.p7_cleanup = cleanup;

    // ============ 汇总 ============
    const ur = Array.isArray(undoRedo) ? undoRedo : [];
    const evd = ur.map((s) => s.tag);
    report.metrics = {
      phaseSequence: evd,
      undoRemovedT1: evd.indexOf("afterUndoClick") >= 0 && ur.find((s) => s.tag === "afterUndoClick") && ur.find((s) => s.tag === "afterUndoClick").t1OnCanvas === false,
      redoRestoredT1: ur.find((s) => s.tag === "afterRedoClick") && ur.find((s) => s.tag === "afterRedoClick").t1OnCanvas,
      t2_undoRemoved: report.phases.p4_t2_undo && report.phases.p4_t2_undo[0] ? !report.phases.p4_t2_undo[0].t2Canvas : null,
      templateStateRestored: cleanup && cleanup.finalLayer === preset.layerArrLen
    };
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.stack || e).slice(0, 700));
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1));
    console.log("probe report -> " + REPORT_PATH);
    const summarize = (p) => { try { return JSON.stringify(p).replace(/\s+/g, " ").slice(0, 340); } catch (e) { return String(p).slice(0, 160); } };
    Object.keys(report.phases).forEach((k) => console.log("  [" + k + "] " + summarize(report.phases[k])));
    if (report.metrics) console.log("  [metrics] " + JSON.stringify(report.metrics));
    if (report.errors && report.errors.length) console.log("  [errors] " + report.errors.join(" ;; "));
  }
})();