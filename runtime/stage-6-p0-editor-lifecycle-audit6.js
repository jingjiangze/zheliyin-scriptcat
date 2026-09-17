// runtime/stage-6-p0-editor-lifecycle-audit6.js — Stage 6 P0 审计 R6（Undo 管理器状态机 + 原生撤销按钮处理器）
// 目标：
//   1. Undo.getInstance() 关键状态：state 形状 / undoLength / _canvas 绑定
//   2. 找到「撤销/重做」按钮的注册 handler（jQuery events）→ 还原真实撤销调用链源码
//   3. 实验：raw canvas.add（OCR 同路径）→ 观察 undoLength/state 变化 → 直接调用 Undo.instance.undo() →
//      观察画布（验证 undo 是否感知我们的对象；感知则直接复用，否则需我们自己 push state）
//   4. 尝试 Undo.instance.save() 后 add，再 undo/redo → 验证「快照式」撤销能否覆盖我们的批次
// 输出：runtime/reports/stage-6-p0-lifecycle-audit6.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-6-p0-lifecycle-audit6.json");

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-6-P0-EDITOR-LIFECYCLE-AUDIT-R6", steps: [], errors: [] };
  const step = (n, ok, d) => { report.steps.push({ name: n, ok: ok ? "PASS" : "INFO", detail: String(d || "").slice(0, 3600) }); if (!ok) report.errors.push(n); };
  let browser = null;
  let page = null;

  const ready = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    return { ok: !!(c && c.getObjects), objs: c ? c.getObjects().length : 0 };
  }).catch(() => ({ ok: false }));

  const undoStateDump = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const defs = ctx && ctx.defined ? ctx.defined : {};
    const u = defs["Undo"] && defs["Undo"].getInstance ? defs["Undo"].getInstance() : null;
    if (!u) return { err: "no undo instance" };
    const out = {
      keys: Object.keys(u),
      undoLength: typeof u.undoLength === "function" ? u.undoLength() : u.undoLength,
      stateType: u.state ? (Array.isArray(u.state) ? "array:" + u.state.length : typeof u.state) : null
    };
    if (u.state != null) {
      if (Array.isArray(u.state)) {
        out.stateSample = u.state.slice(0, 3).map((it) => {
          if (it == null) return null;
          if (typeof it === "object") { const p = {}; Object.keys(it).slice(0, 16).forEach((k) => { const v = it[k]; p[k] = (typeof v === "object" && v !== null) ? "[o]" : (Array.isArray(v) ? "arr:" + v.length : v); }); return p; }
          return String(it).slice(0, 60);
        });
      } else if (typeof u.state === "object") {
        out.stateKeys = Object.keys(u.state).slice(0, 40);
        out.stateSample = JSON.stringify(u.state).slice(0, 1200);
      }
    }
    try { out.canvasType = u._canvas ? (u._canvas.getObjects ? "fabric-canvas" : typeof u._canvas) : "none"; } catch (e) {}
    return out;
  }).catch((e) => ({ err: String(e) }));

  const btnHandlers = () => page.evaluate(() => {
    const findEl = (txt) => Array.from(document.querySelectorAll("span, li, a, button, div")).find((b) => (b.textContent || "").trim() === txt || (b.title || "").indexOf(txt) >= 0);
    const out = {};
    ["撤销", "重做"].forEach((t) => {
      const el = findEl(t);
      if (!el) { out[t] = "not-found"; return; }
      let events = null;
      try { events = window.jQuery && jQuery._data ? jQuery._data(el, "events") : null; } catch (e) {}
      const evs = events ? Object.keys(events) : [];
      const srcs = [];
      if (events) Object.keys(events).forEach((k) => { (events[k] || []).forEach((h) => { srcs.push(k + ": " + String(h.handler || h).toString().replace(/\s+/g, " ").slice(0, 400)); }); });
      out[t] = { evs: evs, srcs: srcs.slice(0, 6) };
    });
    return out;
  }).catch((e) => ({ err: String(e) }));

  const getCanvas = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    return { ok: !!c, count: c ? c.getObjects().length : 0 };
  }).catch(() => ({ ok: false }));

  const addRawTextboxes = (n) => page.evaluate((cnt) => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    if (!c) return { ok: false };
    const fabric = window.fabric;
    const addOne = () => {
      const obj = new fabric.Textbox("回归文字" + (Math.random() * 1000 | 0), { left: 60, top: 60 + cnt * 10, width: 160, fontSize: 16, fill: "#000000" });
      c.add(obj);
      return obj;
    };
    const created = [];
    for (let i = 0; i < cnt; i += 1) created.push(addOne());
    if (c.requestRenderAll) c.requestRenderAll();
    return { ok: true, added: created.length, count: c.getObjects().length };
  }, n).catch((e) => ({ ok: false, err: String(e && e.message || e).slice(0, 120) }));

  const undoCall = (path, how) => page.evaluate((pp) => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const defs = ctx && ctx.defined ? ctx.defined : {};
    const u = defs["Undo"] && defs["Undo"].getInstance ? defs["Undo"].getInstance() : null;
    if (!u) return { err: "no undo instance" };
    const fn = pp === "redo" ? u.redo : u.undo;
    if (typeof fn !== "function") return { err: "no fn" };
    const r = { before: typeof u.undoLength === "function" ? u.undoLength() : u.undoLength };
    fn.call(u);
    const vo = defs["CanvasObjVO"] || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    r.after = c ? c.getObjects().length : null;
    r.undoLengthAfter = typeof u.undoLength === "function" ? u.undoLength() : u.undoLength;
    return r;
  }, path).catch((e) => ({ err: String(e && e.message || e).slice(0, 120) }));

  const undoStep = (how) => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const defs = ctx && ctx.defined ? ctx.defined : {};
    const u = defs["Undo"] && defs["Undo"].getInstance ? defs["Undo"].getInstance() : null;
    const vo = defs["CanvasObjVO"] || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    const info = (tag) => ({ tag: tag, objs: c ? c.getObjects().length : null, undoLen: u ? (typeof u.undoLength === "function" ? u.undoLength() : u.undoLength) : null, stateLen: u && Array.isArray(u.state) ? u.state.length : (u && u.state ? u.state.length : null) });
    return info("t");
  }).catch(() => null);

  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    page = browser.pages()[0];
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const deadline = Date.now() + 150000;
    let rd = null;
    while (Date.now() < deadline) { rd = await ready(); if (rd && rd.ok && rd.objs > 0) break; await page.waitForTimeout(2000); }
    step("editor-ready", !!(rd && rd.ok), JSON.stringify(rd));
    if (!(rd && rd.ok)) throw new Error("not ready");

    const us = await undoStateDump();
    step("undo-state", true, JSON.stringify(us).slice(0, 2200));

    const bh = await btnHandlers();
    step("undo-redo-btn-handlers", true, JSON.stringify(bh).slice(0, 2600));

    const before = await undoStep("before-add");
    step("before-add", true, JSON.stringify(before).slice(0, 600));
    const addR = await addRawTextboxes(3);
    step("raw-add-3", !!(addR && addR.ok), JSON.stringify(addR).slice(0, 400));
    const afterAdd = await undoStep("after-add");
    step("after-add-undolen", true, JSON.stringify(afterAdd).slice(0, 600));

    const u1 = await undoCall("undo", "direct");
    step("direct-undo-after-raw", true, JSON.stringify(u1).slice(0, 600));
    const st1 = await undoStep("after-direct-undo");
    step("after-direct-undo", true, JSON.stringify(st1).slice(0, 600));

    const r1 = await undoCall("redo", "direct");
    step("direct-redo", true, JSON.stringify(r1).slice(0, 600));
    const st2 = await undoStep("after-direct-redo");
    step("after-direct-redo", true, JSON.stringify(st2).slice(0, 600));
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.stack || e).slice(0, 600));
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1));
    console.log("audit6 report -> " + REPORT_PATH);
    report.steps.forEach((s) => console.log("  [" + s.ok + "] " + s.name + " :: " + String(s.detail).replace(/\n/g, " ").slice(0, 260)));
  }
})();