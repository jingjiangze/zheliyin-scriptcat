// runtime/stage-8a1/selected-image-diagnostic.js — Stage 8A-1A Selected Image Overflow 诊断（§六~§十六）
// ---------------------------------------------------------------------
// 真实 ScriptCat + userscript(@require→stage-8a-1-ocr-overflow-rotation 分支) + env 百度 Key。
// 流程：注入 Selected Image（可配 scale/angle）→ OCR 创建 → 按 uuid diff 精确定位新建 textbox →
//   回读完整 Native 字段（bbox/scale/origin/visible/aCoords/oCoords/getBoundingRect/viewport/业务字段）→
//   overflow 分类 + A-9 数值链（offline 复算预测 vs 实际）。
// 输出：runtime/reports/stage-8a1/selected-image-overflow.json（多场景合并）
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
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-8a1");
const BRANCH = "stage-8a-1-ocr-overflow-rotation";
const BAIDU_AK = process.env.ZY_BAIDU_AK || "";
const BAIDU_SK = process.env.ZY_BAIDU_SK || "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 场景矩阵（全部用同一张源图：1200x260，字号 40/20/12）
const SCENARIOS = [
  { id: "S1-sel-base", scaleX: 1, scaleY: 1, angle: 0, left: 20, top: 20 },
  { id: "S2-sel-rot8", scaleX: 1, scaleY: 1, angle: 8, left: 200, top: 100 },
  { id: "S3-sel-scale0_5", scaleX: 0.5, scaleY: 0.5, angle: 0, left: 20, top: 20 },
  { id: "S4-sel-rot2-scale2", scaleX: 2, scaleY: 2, angle: 2, left: 50, top: 50 },
  // Stage 8A-1B：Background Rotation 角度序列（同一张图；GROUP h = OCR 行高代理证据）
  { id: "B1-rot0", scaleX: 1, scaleY: 1, angle: 0, left: 30, top: 30 },
  { id: "B2-rot2", scaleX: 1, scaleY: 1, angle: 2, left: 30, top: 30 },
  { id: "B3-rot5", scaleX: 1, scaleY: 1, angle: 5, left: 30, top: 30 },
  { id: "B4-rot8", scaleX: 1, scaleY: 1, angle: 8, left: 30, top: 30 },
  { id: "B5-rot10", scaleX: 1, scaleY: 1, angle: 10, left: 30, top: 30 }
];
const SZ_ROWS = [
  { t: "大字标题实例文字", y: 30, s: 40 },
  { t: "中号正文联系电话与邮箱地址", y: 110, s: 20 },
  { t: "小字页脚版权备注行", y: 200, s: 12 }
];
const SZ_W = 1200, SZ_H = 260;

function injectUserscript() {
  let code = fs.readFileSync(USERSCRIPT_PATH, "utf8");
  code = code.split("stage-8a-ocr-audit/extension/src/").join(BRANCH + "/extension/src/");
  code = code.split("test/extension/src/").join(BRANCH + "/extension/src/");
  code = code.split("demo/extension/src/").join(BRANCH + "/extension/src/");
  code = code.replace(/stage-8a-ocr-audit\/zheliyin-card-assistant\.user\.js/g, BRANCH + "/zheliyin-card-assistant.user.js");
  code = code.replace(/test\/zheliyin-card-assistant\.user\.js/g, BRANCH + "/zheliyin-card-assistant.user.js");
  code = code.replace(/demo\/zheliyin-card-assistant\.user\.js/g, BRANCH + "/zheliyin-card-assistant.user.js");
  return code;
}

(async () => {
  const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
  const out = { ts: new Date().toISOString(), stage: "STAGE-8A1A-SELECTED-IMAGE-OVERFLOW", branch: BRANCH, scenarios: [], errors: [] };
  let browser = null, page = null;
  const ev = (fn, arg) => (arg === undefined ? page.evaluate(fn) : page.evaluate(fn, arg)).catch((e) => ({ err: String(e || "").slice(0, 200) }));
  const waitUntil = async (fnEval, desc, timeoutMs, pollMs = 1500) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) { const r = await ev(fnEval); if (r && r.ok) return { ok: true, data: r, ms: Date.now() - t0 }; await sleep(pollMs); }
    return { ok: false, desc };
  };
  const canvasReady = () => () => {
    const req = window.requirejs || window.require;
    const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
    const d = (vo && Array.isArray(vo.totalCanvasArray) && vo.totalCanvasArray[0]) || null;
    return { ok: !!(d && d.canvas && typeof d.drawText === "function") };
  };
  const objectSnapshot = () => ev(() => {
    const req = window.requirejs || window.require;
    const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
    const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[0]) || null;
    const c = d && d.canvas;
    if (!c) return { n: 0, ids: [] };
    return { n: c.getObjects().length, ids: c.getObjects().map((o) => o.uuid || o.multiUuid || ("idx" + c.getObjects().indexOf(o))) };
  });
  // 完整 Native 字段回读（A-8/A-2）
  const readTextboxes = (ids) => ev((arg) => {
    const req = window.requirejs || window.require;
    const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
    const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[0]) || null;
    const c = d && d.canvas;
    if (!c) return { err: "no canvas" };
    const want = arg.ids || [];
    const found = [];
    c.getObjects().forEach((o) => {
      const id = o.uuid || o.multiUuid;
      if (!(typeof o.text === "string")) return;
      if (want.length && id != null && want.indexOf(id) < 0) return;
      const br = o.getBoundingRect ? o.getBoundingRect() : null;
      const aC = o.aCoords || null, oC = o.oCoords || null;
      found.push({
        id: id || null, text: String(o.text || "").slice(0, 16),
        left: o.left, top: o.top, width: o.width, height: o.height,
        scaleX: o.scaleX, scaleY: o.scaleY, fontSize: o.fontSize, angle: o.angle,
        originX: o.originX, originY: o.originY,
        visible: o.visible, opacity: o.opacity,
        aCoords: aC && aC.tl ? { tl: [aC.tl.x, aC.tl.y], br: [aC.br.x, aC.br.y], tr: [aC.tr.x, aC.tr.y], bl: [aC.bl.x, aC.bl.y] } : null,
        oCoords: oC && oC.tl ? { tl: [oC.tl.x, oC.tl.y], br: [oC.br.x, oC.br.y], tr: [oC.tr.x, oC.tr.y], bl: [oC.bl.x, oC.bl.y] } : null,
        boundingRect: br ? { x: br.x, y: br.y, width: br.width, height: br.height, left: br.left, top: br.top, right: br.right, bottom: br.bottom } : null,
        scaledW: o.getScaledWidth ? o.getScaledWidth() : null,
        scaledH: o.getScaledHeight ? o.getScaledHeight() : null,
        clipPath: o.clipPath ? "SET" : null,
        business: { locationX: o.locationX, locationY: o.locationY, locationWidth: o.locationWidth, locationHeight: o.locationHeight, Rotation: o.Rotation, mediaLineSpace: o.mediaLineSpace, isEdit: o.isEdit, isDesign: o.isDesign }
      });
    });
    return { found, canvas: { width: c.width, height: c.height, viewportTransform: c.viewportTransform ? Array.from(c.viewportTransform) : null, zoom: c.getZoom ? c.getZoom() : null, retina: c.getRetinaScaling ? c.getRetinaScaling() : null } };
    }, { ids });
  const attachCanvas = (rec) => {
    if (rec && rec.found) { const cv = rec.canvas || {}; rec.found.forEach((o) => { o._canvasW = cv.width; o._canvasH = cv.height; o._viewport = cv.viewportTransform; o._zoom = cv.zoom; o._retina = cv.retina; }); }
    return rec;
  };
  const renderSz = () => ev((arg) => {
    const cv = document.createElement("canvas");
    cv.width = arg.w; cv.height = arg.h;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, arg.w, arg.h);
    ctx.fillStyle = "#000000"; ctx.textBaseline = "top";
    (arg.rows || []).forEach((r) => { ctx.font = r.s + "px SimHei, sans-serif"; ctx.fillText(r.t, 30, r.y); });
    return cv.toDataURL("image/png");
  }, { w: SZ_W, h: SZ_H, rows: SZ_ROWS });
  const ensureImageOnPage = (canvasIndex, dataUrl, tag, tf) => ev((arg) => {
    const req = window.requirejs || window.require;
    const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
    const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[arg.canvasIndex]) || null;
    const c = d && d.canvas;
    if (!c) return { ok: false, reason: "no canvas" };
    const f = (c.constructor && c.constructor.fabric) || window.fabric;
    return new Promise((resolve) => {
      try {
        const imgEl = new Image();
        imgEl.onload = function () {
          try {
            const im = new f.Image(imgEl);
            im.set({ left: arg.tf.left, top: arg.tf.top, scaleX: arg.tf.scaleX, scaleY: arg.tf.scaleY, angle: arg.tf.angle });
            im.multiUuid = arg.tag + Date.now();
            c.add(im);
            try { if (d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr) d.canvasObjInfo.canvasToProductObjArr.push(im); } catch (e) {}
            try { c.setActiveObject(im); } catch (e) {}
            if (c.requestRenderAll) c.requestRenderAll();
            resolve({ ok: true, width: im.width, height: im.height, nw: imgEl.naturalWidth, nh: imgEl.naturalHeight, scaleX: im.scaleX, scaleY: im.scaleY, angle: im.angle, left: im.left, top: im.top });
          } catch (e) { resolve({ ok: false, reason: String(e && e.message || e).slice(0, 100) }); }
        };
        imgEl.onerror = function () { resolve({ ok: false, reason: "imgEl onerror" }); };
        imgEl.src = arg.dataUrl;
      } catch (e) { resolve({ ok: false, reason: String(e && e.message || e).slice(0, 100) }); }
    });
  }, { canvasIndex, dataUrl, tag, tf });
  const rollbackAll = (tag) => ev((arg) => {
    const req = window.requirejs || window.require;
    const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
    let removed = 0;
    (vo && vo.totalCanvasArray || []).forEach((d) => {
      const c = d && d.canvas;
      if (!c) return;
      const objs = c.getObjects().filter((o) => o && (String(o.multiUuid || "").indexOf(arg.tag) === 0 || (typeof o.text === "string" && String(o.multiUuid || "") === "")));
      objs.forEach((o) => { try { const li = d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr ? d.canvasObjInfo.canvasToProductObjArr.indexOf(o) : -1; if (li >= 0) d.canvasObjInfo.canvasToProductObjArr.splice(li, 1); c.remove(o); } catch (e) {} });
      removed += objs.length;
    });
    try { if (vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas && vo.totalCanvasArray[0].canvas.requestRenderAll) vo.totalCanvasArray[0].canvas.requestRenderAll(); } catch (e) {}
    return { ok: true, removed };
  }, tag);
  const clickOcrBtn = () => ev(() => {
    const q = ["#zy-native-ocr-btn", "[data-zy-role=ocr]", ".zy-native-ocr-btn"];
    for (const sel of q) { const el = document.querySelector(sel); if (el && el.offsetParent) { try { el.click(); return { clicked: true, via: sel }; } catch (e) { return { clicked: false, err: String(e).slice(0, 80) }; } } }
    const all = Array.from(document.querySelectorAll("button, a, span, div"));
    for (const el of all) { if (!el.offsetParent) continue; const t = String(el.textContent || "").trim(); if (t.indexOf("识别当前图片") >= 0 && t.length <= 12) { try { el.click(); return { clicked: true, via: "text" }; } catch (e) { return { clicked: false, err: String(e).slice(0, 80) }; } } }
    return { clicked: false };
  });
  const getCurrentPage = () => ev(() => new Promise((resolve) => {
    const on = (e) => { if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === "getCurrentPageResult") { window.removeEventListener("message", on); resolve({ ok: e.data.ok, code: e.data.code, pageId: e.data.pageId, side: e.data.side }); } };
    window.addEventListener("message", on);
    window.postMessage({ source: "zy-card-assistant", type: "getCurrentPage", _t: Date.now() }, location.origin);
    setTimeout(() => { window.removeEventListener("message", on); resolve({ timeout: true }); }, 4000);
  }));

  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    browser = await chromium.launchPersistentContext(PROFILE, {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR],
      viewport: { width: 1440, height: 900 }
    });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    const opts = browser.pages()[0];
    await opts.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await sleep(2000);
    const all = await adapter.getAllScripts(opts);
    for (const s of (all || []).filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(opts, s.uuid); } catch (e) {} }
    await adapter.installByCode(opts, { uuid: "zheliyin-a1-" + Date.now(), code: injectUserscript(), upsertBy: "user" });
    out.install = "ok";
    await sleep(1500);
    page = opts;
    out.console = [];
    page.on("console", (m) => { try { const txt = m.text(); if (/\[zy-ocr\]/.test(txt)) out.console.push(txt.slice(0, 400)); } catch (e) {} });
    await opts.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await sleep(1200);
    if (BAIDU_AK && BAIDU_SK) {
      await ev((arg) => {
        const akIn = document.querySelector("#zy-baidu-ak-native") || document.querySelector("#zy-baidu-ak");
        const skIn = document.querySelector("#zy-baidu-sk-native") || document.querySelector("#zy-baidu-sk");
        const saveBtn = document.querySelector("#zy-baidu-save-native") || document.querySelector("#zy-baidu-save");
        if (!akIn || !skIn || !saveBtn) return { skipped: true };
        akIn.value = arg.ak; skIn.value = arg.sk;
        try { saveBtn.click(); } catch (e) {}
        return { ok: true };
      }, { ak: BAIDU_AK, sk: BAIDU_SK });
      await sleep(3000);
    }
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const w = await waitUntil(canvasReady(), "editor ready", 150000);
    if (!(w && w.ok)) throw new Error("editor not ready");
    await sleep(4000);
    const pageInfo = await getCurrentPage();
    out.pageInfo = pageInfo;

    for (const sc of SCENARIOS) {
      const rec = { id: sc.id, tf: sc, injected: null, pageId: null, createdIds: [], created: [], prepare: null, provider: null, classification: null, numericChain: null, errors: [] };
      out.scenarios.push(rec);
      try {
        const du = await renderSz();
        rec.injected = await ensureImageOnPage(0, typeof du === "string" ? du : du.dataUrl, "p8x-", sc);
        await sleep(1200);
        const before = await objectSnapshot();
        const cl = await clickOcrBtn();
        if (!cl.clicked) { rec.errors.push("ocr btn not found"); continue; }
        let last = null, done = false;
        const t0 = Date.now();
        for (;;) {
          const r = await ev(() => { const el = document.querySelector("#zy-native-status"); const st = el ? String(el.textContent || "").trim() : null; return { st: st ? st.slice(0, 150) : null }; });
          const st = r && r.st;
          if (st && st !== last) { last = st; rec.status = st; }
          if (st && /已生成 \d+ 个文字|未识别到文字|失败/.test(st)) { done = true; break; }
          if (Date.now() - t0 > 180000) break;
          await sleep(900);
        }
        const after = await objectSnapshot();
        rec.createdIds = (after.ids || []).filter((id) => (before.ids || []).indexOf(id) < 0);
        const ctb = await readTextboxes(rec.createdIds);
        attachCanvas(ctb);
        rec.created = (ctb.found || []);
        rec.canvasInfo = ctb.canvas || null;
        rec.prepare = (function () { const m = out.console.slice(-40).join("\n").match(/\[zy-ocr\]\[PREPARING\] ([^\n]*)/); return m ? m[1].slice(0, 200) : null; })();
        const cTail = out.console.slice(-40).join("\n");
        rec.provider = /BAIDU_RECOGNIZING/.test(cTail) ? "baidu" : (/LOCAL_RECOGNIZING/.test(cTail) ? "local" : "unknown");
        rec.done = done;
        // 8A-1B 证据：LOCAL GROUP 行高（OCR bbox 高度代理）随角度
        rec.groupHeights = (function () { const m = cTail.match(/\[GROUP\] lines=\d+ y=[^\n]* h=([^\n]*)/); return m ? m[1] : null; })();
        // overflow 分类（§九）
        const cv = rec.created.length ? rec.created[0] : null;
        if (cv && cv.boundingRect && cv.canvasWidthOk === undefined) {
          // canvas 尺寸从 readTextboxes 的 canvas 字段取（首个对象那次调用已返回）
        }
        rec.classification = (function () {
          const first = rec.created[0];
          if (!first) return "NO_TEXTBOX";
          const cw = first._canvasW, ch = first._canvasH;
          const b = first.boundingRect;
          if (!b || !cw) return "UNKNOWN";
          const overflow = { left: b.left < 0, top: b.top < 0, right: b.right > cw, bottom: b.bottom > ch };
          const overflowAmount = Math.max(overflow.left ? -b.left : 0, overflow.top ? -b.top : 0, overflow.right ? b.right - cw : 0, overflow.bottom ? b.bottom - ch : 0);
          const sizeRatio = cw > 0 ? b.width / cw : 0;
          const cls = [];
          if (overflow.left || overflow.top || overflow.right || overflow.bottom) cls.push((overflowAmount > cw * 0.5 ? "POSITION_OVERFLOW(major)" : "POSITION_OVERFLOW") + "(amt=" + Math.round(overflowAmount) + ")");
          if (sizeRatio > 0.5 || (first.scaledW && first.scaledW > cw * 1.2)) cls.push("SIZE_OVERFLOW(w/canvas=" + Math.round(sizeRatio * 100) + "%)");
          if (first.visible === false || first.opacity === 0) cls.push("OBJECT_HIDDEN");
          if (first.angle && Math.abs(first.angle) > 0.5 && first.originX === "center") cls.push("ORIGIN_CENTER(rotated)");
          if (!cls.length) cls.push((b.right <= cw && b.bottom <= ch && b.left >= 0 && b.top >= 0) ? "IN_CANVAS" : "UNKNOWN");
          return cls.join("+");
        })();
        // 数值链（A-9）：用注入的 tf 与回读实际对比（离线复算关键步）
        rec.numericChain = (function () {
          const first = rec.created[0];
          if (!first) return null;
          return {
            injectedImage: { nw: rec.injected && rec.injected.nw, nh: rec.injected && rec.injected.nh, scaleX: sc.scaleX, scaleY: sc.scaleY, angle: sc.angle, left: sc.left, top: sc.top },
            createdTextbox: { text: first.text, left: first.left, top: first.top, width: first.width, height: first.height, scaleX: first.scaleX, scaleY: first.scaleY, fontSize: first.fontSize, angle: first.angle, originX: first.originX },
            renderedBBox: first.boundingRect,
            note: "fs≈行高×scaleY÷0.969；left=imgLeft+ocrX×scaleX-4（非旋转）—— 预测量见报告离线复算"
          };
        })();
        await rollbackAll("p8x-");
        await sleep(1200);
      } catch (e) {
        rec.errors.push(String(e && e.message || e).slice(0, 200));
      }
    }
  } catch (e) {
    out.errors.push(String(e && e.message || e).slice(0, 400));
  } finally {
    try { page && await page.close(); } catch (e) {}
    try { browser && await browser.close(); } catch (e) {}
  }
  const sceneOut = out.scenarios.map((s) => ({ id: s.id, tf: s.tf, injected: s.injected && { nw: s.injected.nw, nh: s.injected.nh, scaleX: s.injected.scaleX, scaleY: s.injected.scaleY, angle: s.injected.angle, left: s.injected.left, top: s.injected.top }, done: s.done || null, status: s.status || null, provider: s.provider, prepare: s.prepare, groupHeights: s.groupHeights, createdIds: s.createdIds, created: s.created, classification: s.classification, numericChain: s.numericChain, errors: s.errors }));
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, "selected-image-overflow.json"), JSON.stringify({ generatedAt: new Date().toISOString(), branch: BRANCH, pageInfo: out.pageInfo, install: out.install, scenarios: sceneOut, errors: out.errors, consoleTail: out.console.slice(-20) }, null, 2));
  console.log("STAGE-8A1A done scenarios=" + sceneOut.length + " errors=" + out.errors.length + " -> " + REPORT_DIR);
  sceneOut.forEach((s) => console.log("  " + s.id + " done=" + s.done + " provider=" + s.provider + " created=" + s.created.length + " cls=" + s.classification + " fs=" + (s.created[0] ? s.created[0].fontSize : "-")));
})();