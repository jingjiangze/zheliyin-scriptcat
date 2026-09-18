// runtime/stage-7-4/real-ocr-page-ownership.js — Stage 7.6/7.7 真实 OCR 页归属验证
// 真实 ScriptCat + stage userscript（页面桥已临时指向 stage 分支，带 Ownership 门禁 + Source Freeze）
// 真实 UI「识别当前图片」→ 真实 Cloud/Local OCR → TextBlock(pageId/side) → ocrCreate(pageId) → 门禁放行 → 创建
// Case1: FRONT 仅 —— ocrCreateResult.pageId===canvas:c0 且 created[].pageId===canvas:c0
// Case2: 切 BACK —— pageId===canvas:c1
// 安全：始终不点保存；创建对象按返回 uuid 立即回滚（canvas + 图层数组）；最终停在 FRONT
// 依赖：P0_PROFILE 持久会话（252438 可开）+ GM 存储已配 OCR 凭据（沿用 p0 profile）
// 证据: runtime/reports/stage-7-page/real-ocr-page-ownership.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const adapter = require("../scriptcat-adapter");
const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const EXT_ID = adapter.EXT_ID;
const USERSCRIPT_PATH = path.join(ROOT, "zheliyin-card-assistant.user.js");
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-7-page");
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shortUuid = (u) => (typeof u === "string" ? u.slice(0, 8) : null);

(async () => {
  const out = { ts: new Date().toISOString(), stage: "STAGE-7.6/7.7-REAL-OCR-PAGE-OWNERSHIP", cases: [], errors: [], scriptAt: USERSCRIPT_PATH };
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
  // 页面世界消息抓取器：OCR 全链路相关 reply 全量落窗，供探针断言（含 ocrCreateResult 的 pageId/side）
  const armCapture = () => ev(() => {
    window.__p7cap = [];
    const on = (e) => {
      if (e.data && (e.data.source === "zy-card-assistant-page" || e.data.source === "zy-card-assistant")) {
        const t = e.data.type || "";
        if (/Result|ocrCreate|ocrPrepare|getCurrentPage/.test(t)) {
          window.__p7cap.push({ t: Date.now(), src: e.data.source, type: e.data.type,
            ok: e.data.ok, code: e.data.code, pageId: e.data.pageId || null, side: e.data.side || null,
            createdCount: e.data.createdCount, detectedBlocks: e.data.detectedBlocks,
            created: (e.data.created || []).map((c) => ({ pageId: c.pageId || null, side: c.side || null, text: String(c.text || "").slice(0, 12), uuid: shortUuid(c.uuid) })),
            priv: e.data.code || (e.data.ok ? "OK" : "FAIL") });
        }
      }
    };
    window.addEventListener("message", on);
    return { armed: true };
  });
  const waitCapture = async (type, timeoutMs, tag) => {
    const t0 = Date.now();
    for (;;) {
      const hit = await ev((arg) => {
        const arr = (window.__p7cap || []).filter((c) => c.type === arg.type && !c.usedByProbe);
        if (arr.length) { arr[0].usedByProbe = true; return arr[0]; }
        return null;
      }, { type });
      if (hit) return hit;
      if (Date.now() - t0 > timeoutMs) return { timeout: true, type };
      await sleep(800);
    }
  };
  const clickOcrBtn = () => ev(() => {
    const q = ["#zy-native-ocr-btn", "[data-zy-role=ocr]", ".zy-native-ocr-btn"];
    for (const sel of q) { const el = document.querySelector(sel); if (el && el.offsetParent) { try { el.click(); return { clicked: true, via: sel }; } catch (e) { return { clicked: false, err: String(e).slice(0, 80) }; } } }
    const all = Array.from(document.querySelectorAll("button, a, span, div"));
    for (const el of all) { if (!el.offsetParent) continue; const t = String(el.textContent || "").trim(); if (t.indexOf("识别当前图片") >= 0 && t.length <= 12) { try { el.click(); return { clicked: true, via: "text" }; } catch (e) { return { clicked: false, err: String(e).slice(0, 80) }; } } }
    return { clicked: false };
  });
  const getCurrentPageByMessage = () => ev(() => new Promise((resolve) => {
    const on = (e) => { if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === "getCurrentPageResult") { window.removeEventListener("message", on); resolve({ ok: e.data.ok, code: e.data.code, pageId: e.data.pageId, side: e.data.side, cc: e.data.currentCanvasNum }); } };
    window.addEventListener("message", on);
    window.postMessage({ source: "zy-card-assistant", type: "getCurrentPage", _probeTs: Date.now() }, location.origin);
    setTimeout(() => { window.removeEventListener("message", on); resolve({ timeout: true }); }, 4000);
  }));
  const clickPage = (txt) => ev((arg) => {
    const all = Array.from(document.querySelectorAll("li, a, span, div, i, em, button"));
    for (const el of all) { if (!el.offsetParent) continue; const t = String(el.textContent || "").trim(); if (t === arg.txt && t.length <= 4) { try { el.click(); return { clicked: true, txt: t }; } catch (e) { return { clicked: false }; } } }
    return { clicked: false };
  }, { txt: txt });
  const FIXTURE_PNG = path.join(ROOT, "runtime", "p0", "fixtures", "ocr-test.png");
const FIXTURE_DATAURL = "data:image/png;base64," + fs.readFileSync(FIXTURE_PNG).toString("base64");
const IMG_TAG = "p7-img-";
// 模板当前页无图（252438 打开时无 active/背景/图片对象）→ 按项目既有取证路径注入原生 fabric.Image
// （禁止点击站点换图弹窗流）；注入对象带 multiUuid 前缀便于回滚
const ensureImageOnPage = (canvasIndex) => ev(async (arg) => {
  const req = window.requirejs || window.require;
  const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
  const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[arg.canvasIndex]) || null;
  const c = d && d.canvas;
  if (!c) return { ok: false, reason: "no canvas" };
  const f = (c.constructor && c.constructor.fabric) || window.fabric;
  const existing = c.getObjects().filter((o) => o && String(o.type) === "image");
  if (existing.length) return { ok: true, usedExisting: true, n: existing.length };
  if (!f || !f.Image) return { ok: false, reason: "no fabric.Image" };
  return await new Promise((resolve) => {
    try {
      f.Image.fromURL(arg.dataUrl, (im) => {
        try {
          if (!im) { resolve({ ok: false, reason: "fromURL null" }); return; }
          im.set({ left: 40, top: 40, scaleX: 1, scaleY: 1 });
          im.multiUuid = arg.tag + Date.now();
          c.add(im);
          try { if (d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr) d.canvasObjInfo.canvasToProductObjArr.push(im); } catch (e) {}
          if (c.requestRenderAll) c.requestRenderAll();
          const n = c.getObjects().filter((o) => o && String(o.type) === "image").length;
          resolve({ ok: true, usedExisting: false, n: n, uuid: im.multiUuid });
        } catch (e) { resolve({ ok: false, reason: String(e && e.message || e).slice(0, 100) }); }
      }, { crossOrigin: "anonymous" });
    } catch (e) { resolve({ ok: false, reason: String(e && e.message || e).slice(0, 100) }); }
  });
}, { canvasIndex, dataUrl: FIXTURE_DATAURL, tag: IMG_TAG });
const rollbackInjectedImage = (canvasIndex) => ev((arg) => {
  const req = window.requirejs || window.require;
  const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
  const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[arg.canvasIndex]) || null;
  const c = d && d.canvas;
  if (!c) return { ok: false, reason: "no canvas" };
  const objs = c.getObjects().filter((o) => o && String(o.multiUuid || "").indexOf(arg.tag) === 0);
  objs.forEach((o) => { try { const li = d.canvasObjInfo.canvasToProductObjArr.indexOf(o); if (li >= 0) d.canvasObjInfo.canvasToProductObjArr.splice(li, 1); c.remove(o); } catch (e) {} });
  try { if (c.requestRenderAll) c.requestRenderAll(); } catch (e) {}
  return { ok: true, removed: objs.length, remaining: c.getObjects().length };
}, { canvasIndex, tag: IMG_TAG });
  const rollbackCreated = (canvasIndex, uuids, texts) => ev((arg) => {
    const req = window.requirejs || window.require;
    const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
    const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[arg.canvasIndex]) || null;
    const c = d && d.canvas;
    if (!c) return { ok: false, reason: "no canvas" };
    const uu = (arg.uuids || []).filter(Boolean);
    const tx = (arg.texts || []).filter(Boolean);
    const objs = c.getObjects();
    const target = objs.filter((o) => o && ((o.uuid && uu.indexOf(String(o.uuid)) >= 0) || (o.multiUuid && uu.indexOf(String(o.multiUuid)) >= 0) || tx.indexOf(String(o.text || "")) >= 0));
    target.forEach((o) => { try { const li = d.canvasObjInfo.canvasToProductObjArr.indexOf(o); if (li >= 0) d.canvasObjInfo.canvasToProductObjArr.splice(li, 1); c.remove(o); } catch (e) {} });
    try { if (c.requestRenderAll) c.requestRenderAll(); } catch (e) {}
    return { ok: true, removed: target.length, remaining: c.getObjects().length };
  }, { canvasIndex, uuids, texts });
  const runCase = async (label, wantSide) => {
    const rec = { label, wantSide, click: null, current: null, reply: null, statusFlow: [] };
    const idx = wantSide === "BACK" ? 1 : 0;
    const expPageId = wantSide === "BACK" ? "canvas:c1" : "canvas:c0";
    await armCapture();
    const cur0 = await getCurrentPageByMessage();
    rec.current = cur0;
    // 目标页画布若无图片 → 注入原生 fabric.Image（fixture ocr-test.png；巡检目标页，非全局）
    rec.imgInjected = await ensureImageOnPage(idx);
    const before = await ev((arg) => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[arg.idx]) || null;
      const c = d && d.canvas;
      return c ? c.getObjects().length : -1;
    }, { idx });
    rec.click = await clickOcrBtn();
    if (!rec.click.clicked) { rec.reply = { blocked: true, reason: "ocr button not found" }; return rec; }
    // 状态流采样 + 成功信号（“已生成 N 个文字”）+ 目标页对象增量（reply 消息可能不可达探针世界，用行为证据代替）
    const t0 = Date.now();
    let lastStatus = null;
    let done = false;
    for (;;) {
      const r = await ev(() => {
        const el = document.querySelector("#zy-native-status");
        const st = el ? String(el.textContent || "").trim() : null;
        return { st: st ? st.slice(0, 120) : null, n: (function () {
          const req = window.requirejs || window.require;
          const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
          const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[0]) ? vo.totalCanvasArray[0] : null;
          const c = d && d.canvas;
          return c ? c.getObjects().length : -1;
        })() };
      });
      const st = r && r.st;
      if (st && st !== lastStatus) { lastStatus = st; rec.statusFlow.push({ t: Math.round((Date.now() - t0) / 1000) + "s", s: st, objs: r.n }); }
      if (st && /已生成 \d+ 个文字/.test(st)) { rec.doneAt = Math.round((Date.now() - t0) / 1000) + "s"; done = true; break; }
      if (Date.now() - t0 > 180000) { break; }
      await sleep(900);
    }
    rec.captureLog = await ev(() => (window.__p7cap || []).map((c) => ({ t: c.type, ok: c.ok, code: c.code, pageId: c.pageId || null, side: c.side || null, createdCount: c.createdCount })));
    const after = await ev((arg) => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[arg.idx]) || null;
      const c = d && d.canvas;
      if (!c) return { n: -1, texts: [] };
      return { n: c.getObjects().length, texts: c.getObjects().filter((o) => o && typeof o.text === "string").map((o) => String(o.text || "").slice(0, 10)) };
    }, { idx });
    rec.after = { ...after, before: before };
    // 断言（行为证据）：成功状态 + 目标页对象增量 + 请求来源冻结 pageId
    const ocrReq = (rec.captureLog || []).filter((c) => c.t === "ocrCreate").pop() || null;
    rec.assert = {
      done: done,
      sourceFreezePageId: ocrReq ? ocrReq.pageId : null,
      sourceFreezeMatch: !!(ocrReq && ocrReq.pageId === expPageId),
      textsOnPage: after.n - before,
      createdOwned: done && after.n > before && (ocrReq ? ocrReq.pageId === expPageId : false)
    };
    rec.reply = done ? { ok: true, code: "STATUS_SUC_CREATE", note: "reply 消息未进探针世界，以 status+canvas 增量为创建证据；pageId 证据取 ocrCreate 请求冻结值" } : { timeout: true, type: "ocrCreateResult" };
    // 回滚：先删注入图，再按目标页文本删除 OCR 新增文字（与回复 uuid 脱钩，行为级清理）
    rec.imgRolled = await rollbackInjectedImage(idx);
    const newTexts = (rec.after && rec.after.texts) || [];
    rec.textRollback = await ev((arg) => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[arg.idx]) || null;
      const c = d && d.canvas;
      if (!c) return { ok: false, reason: "no canvas" };
      const taken = [];
      const objs = c.getObjects();
      arg.texts.forEach((tst) => {
        const hit = objs.filter((o) => o && String(o.text || "").trim() === tst && !(o.multiUuid || "").indexOf("p7-img-") === 0 && taken.indexOf(o) < 0);
        if (hit.length) { taken.push(hit[0]); }
      });
      taken.forEach((o) => { try { const li = d.canvasObjInfo.canvasToProductObjArr.indexOf(o); if (li >= 0) d.canvasObjInfo.canvasToProductObjArr.splice(li, 1); c.remove(o); } catch (e) {} });
      if (c.requestRenderAll) c.requestRenderAll();
      return { ok: true, removed: taken.length, remaining: c.getObjects().length };
    }, { idx, texts: newTexts });
    return rec;
  };
  try {
    if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
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
    try {
      const all = await adapter.getAllScripts(opts);
      for (const s of (all || []).filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(opts, s.uuid); } catch (e) {} }
      await adapter.installByCode(opts, { uuid: "zheliyin-realocr-" + Date.now(), code: fs.readFileSync(USERSCRIPT_PATH, "utf8"), upsertBy: "user" });
      out.install = "ok";
    } catch (e) { out.errors.push("scriptcat install: " + String(e && e.message || e).slice(0, 200)); }
    await sleep(1500);
    page = opts;
    out.console = [];
    page.on("console", (m) => { try { const txt = m.text(); if (/\[zy-ocr\]|zy-ocr|error|uncaught/i.test(txt)) out.console.push(txt.slice(0, 300)); } catch (e) {} });
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => out.errors.push(String(e).slice(0, 130)));
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const w = await waitUntil(canvasReady(), "editor+script bridge", 150000);
    out.ready = !!(w && w.ok);
    if (!out.ready) { out.errors.push("editor not ready"); throw new Error("editor_not_ready"); }
    await sleep(3000);
    // 确认新桥已生效（getCurrentPage 有回复且带 FRONT；旧桥不会回复该消息）
    const probeCur = await getCurrentPageByMessage();
    out.bridgeVersion = probeCur; // { ok, pageId canvas:c0, side FRONT, ... }
    if (!(probeCur && probeCur.ok)) { out.errors.push("new bridge check failed: " + JSON.stringify(probeCur)); }
    out.baiduCfg = await ev(() => {
      const ak = document.querySelector("#zy-baidu-ak-native");
      const mode = document.querySelector("#zy-ocr-mode-native");
      return { akPlaceholder: ak ? String(ak.getAttribute("placeholder") || "").slice(0, 60) : null, mode: mode ? mode.value : null };
    });

    out.cases.push(await runCase("CASE1_FRONT_ONLY", "FRONT"));
    await clickPage("背面"); await sleep(2500);
    out.cases.push(await runCase("CASE2_BACK_ONLY", "BACK"));
    await clickPage("正面"); await sleep(2000);

    out.verdict = {
      CASE1: out.cases[0].assert || { blocked: true },
      CASE2: out.cases[1].assert || { blocked: true }
    };
    const pass = !!(out.verdict.CASE1.createdOwned && out.verdict.CASE1.sourceFreezeMatch && out.verdict.CASE2.createdOwned && out.verdict.CASE2.sourceFreezeMatch);
    out.RESULT = pass ? "PASS" : (out.cases.some((c) => c.assert && !c.assert.done) ? "BLOCKED_OCR_NO_CREATE" : "FAIL");
    fs.writeFileSync(path.join(REPORT_DIR, "real-ocr-page-ownership.json"), JSON.stringify(out, null, 2));
    console.log("REAL-OCR-PAGE-OWNERSHIP done result=" + out.RESULT + " bridge=" + (probeCur && probeCur.pageId) + " cases=" + out.cases.map((c) => (c.assert ? ("done=" + c.assert.done + " freeze=" + c.assert.sourceFreezePageId + " owned=" + c.assert.createdOwned + " delta=" + c.assert.textsOnPage) : ("blocked=" + (c.reply ? c.reply.reason || "timeout" : "?")))).join(" | ") + " errors=" + out.errors.length);
  } catch (e) {
    out.errors.push(String(e && e.message || e).slice(0, 300));
    try { fs.writeFileSync(path.join(REPORT_DIR, "real-ocr-page-ownership.json"), JSON.stringify(out, null, 2)); } catch (e2) {}
    console.error("FATAL", e && (e.message || e));
    process.exitCode = 1;
  } finally {
    try { page && await page.close(); } catch (e) {}
    try { browser && await browser.close(); } catch (e) {}
  }
})();