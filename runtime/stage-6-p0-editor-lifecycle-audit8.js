// runtime/stage-6-p0-editor-lifecycle-audit8.js — Stage 6 P0 审计 R8（sundry 历史引擎 + _undoBtn/_redoBtn 原生按钮点击闭环）
// 目标：
//   1. Undo.getInstance() 全 source：save / undo / redo / buttonControl / replay；_undoBtn/_redoBtn 元素
//   2. sundry 模块导出（历史栈结构：undoArray/redoArray?）
//   3. save() 后延时 → undoLen 是否 +1；raw add 后点击原生 _undoBtn → 对象是否回退；_redoBtn → 恢复且带原生 identity
// 输出：runtime/reports/stage-6-p0-lifecycle-audit8.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-6-p0-lifecycle-audit8.json");

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-6-P0-EDITOR-LIFECYCLE-AUDIT-R8", steps: [], errors: [] };
  const step = (n, ok, d) => { report.steps.push({ name: n, ok: ok ? "PASS" : "INFO", detail: String(d || "").slice(0, 4000) }); if (!ok) report.errors.push(n); };
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

  const undoDeep = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const defs = ctx && ctx.defined ? ctx.defined : {};
    const u = defs["Undo"] ? defs["Undo"].getInstance() : null;
    const sundry = defs["sundry"];
    const out = { hasUndo: !!u, hasSundry: !!sundry };
    if (u) {
      out.save = u.save.toString().replace(/\s+/g, " ").slice(0, 900);
      out.undoType = typeof u.undo;
      if (typeof u.undo === "object") out.undoKeys = u.undo ? Object.keys(u.undo) : null;
      out.undoBtnEl = u._undoBtn ? { tag: u._undoBtn.tagName, id: u._undoBtn.id, cls: String(u._undoBtn.className || "").slice(0, 40) } : null;
      out.redoBtnEl = u._redoBtn ? { tag: u._redoBtn.tagName, id: u._redoBtn.id, cls: String(u._redoBtn.className || "").slice(0, 40) } : null;
      if (u.buttonControl) out.buttonControl = u.buttonControl.toString().replace(/\s+/g, " ").slice(0, 400);
      if (u.replay) out.replay = u.replay.toString().replace(/\s+/g, " ").slice(0, 500);
    }
    if (sundry) {
      out.sundryKeys = Object.keys(sundry).slice(0, 60);
      out.sundryFns = {};
      Object.keys(sundry).forEach((k) => { const v = sundry[k]; if (typeof v === "function") out.sundryFns[k] = v.toString().replace(/\s+/g, " ").slice(0, 200); });
    }
    return out;
  }).catch((e) => ({ err: String(e) }));

  const stateNums = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const defs = ctx && ctx.defined ? ctx.defined : {};
    const u = defs["Undo"] ? defs["Undo"].getInstance() : null;
    const vo = defs["CanvasObjVO"] || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    const sundry = defs["sundry"];
    const out = { objs: c ? c.getObjects().length : null, undoLen: u ? u.undoLength : null, stateLen: u && typeof u.state === "string" ? u.state.length : null };
    if (sundry) {
      ["undoArray", "redoArray", "undoArr", "redoArr", "undoList", "redoList"].forEach((k) => { if (sundry[k] !== undefined) out["sundry." + k] = Array.isArray(sundry[k]) ? "arr:" + sundry[k].length : typeof sundry[k]; });
    }
    return out;
  }).catch((e) => ({ err: String(e) }));

  const saveAndAdd = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const defs = ctx && ctx.defined ? ctx.defined : {};
    const u = defs["Undo"] ? defs["Undo"].getInstance() : null;
    const vo = defs["CanvasObjVO"] || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    const res = {};
    if (u && typeof u.save === "function") { u.save(); res.saved = true; }
    if (c && window.fabric) {
      const n = 2;
      for (let i = 0; i < n; i += 1) {
        const obj = new window.fabric.Textbox("OCR批次" + i, { left: 60 + i * 30, top: 90, width: 140, fontSize: 16, fill: "#000000" });
        c.add(obj);
      }
      if (c.requestRenderAll) c.requestRenderAll();
      res.added = n;
    }
    res.objs = c ? c.getObjects().length : null;
    return res;
  }).catch((e) => ({ err: String(e && e.message || e).slice(0, 160) }));

  const clickNativeBtn = (which) => page.evaluate((w) => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const u = (ctx && ctx.defined && ctx.defined.Undo) ? ctx.defined.Undo.getInstance() : null;
    if (!u) return { err: "no undo" };
    const el = w === "redo" ? u._redoBtn : u._undoBtn;
    if (!el) return { err: "no btn" };
    el.click();
    return { clicked: true, tag: el.tagName, cls: String(el.className || "").slice(0, 40) };
  }, which).catch((e) => ({ err: String(e && e.message || e).slice(0, 160) }));

  const idDump = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    if (!c) return { objs: 0 };
    const KEYS = ["type", "text", "multiUuid", "markuuid", "uuid", "layerNum", "mediaMediaType", "locationX", "locationY", "locationWidth", "locationHeight", "locationRotation", "printLocationX", "printLocationY", "isDesign", "isEdit", "isLineText", "fontSize", "fontFamily", "deleteState"];
    return { objs: c.getObjects().length, list: c.getObjects().map((o, i) => { const p = {}; KEYS.forEach((k) => { if (o[k] !== undefined) { const v = o[k]; p[k] = (typeof v === "object" && v !== null) ? "[o]" : v; } }); return { i: i, p: p }; }).slice(-6) };
  }).catch((e) => ({ err: String(e) }));

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

    const dd = await undoDeep();
    step("undo-deep", true, JSON.stringify(dd).slice(0, 3800));

    const n0 = await stateNums();
    step("state-n0", true, JSON.stringify(n0).slice(0, 800));
    const res = await saveAndAdd();
    step("save-and-add", !!(res && res.added), JSON.stringify(res).slice(0, 400));
    await page.waitForTimeout(1200);
    const n1 = await stateNums();
    step("state-n1-after-save-add", true, JSON.stringify(n1).slice(0, 900));

    const ub = await clickNativeBtn("undo");
    step("native-undo-btn", ub.clicked, JSON.stringify(ub).slice(0, 200));
    await page.waitForTimeout(1600);
    const idU = await idDump();
    step("after-native-undo", true, JSON.stringify(idU).slice(0, 2600));
    const nU = await stateNums();
    step("state-after-undo", true, JSON.stringify(nU).slice(0, 800));

    const rb = await clickNativeBtn("redo");
    step("native-redo-btn", rb.clicked, JSON.stringify(rb).slice(0, 200));
    await page.waitForTimeout(1600);
    const idR = await idDump();
    step("after-native-redo", true, JSON.stringify(idR).slice(0, 3000));
    const nR = await stateNums();
    step("state-after-redo", true, JSON.stringify(nR).slice(0, 800));
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.stack || e).slice(0, 600));
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1));
    console.log("audit8 report -> " + REPORT_PATH);
    report.steps.forEach((s) => console.log("  [" + s.ok + "] " + s.name + " :: " + String(s.detail).replace(/\n/g, " ").slice(0, 320)));
  }
})();