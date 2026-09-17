// runtime/stage-6-p0-editor-lifecycle-audit7.js — Stage 6 P0 审计 R7（驱动原生 Undo：save→add→undo→redo 闭环验证）
// 假设：快照式 Undo。若「save() 前快照」+ raw add + undo() 能回到创建前、redo() 能恢复且带原生 identity，
// 则 OCR 事务 = save() → create batch → （原生 undo/redo 自动闭环），无需伪造历史。
// 步骤：
//   1. typeof 每 key（undo/redo/save/replay/buttonControl/_undoBtn/_redoBtn/state）
//   2. save() → undoLen/stateLen 变化
//   3. raw add 1 个 textbox → 录制身份（是否带编辑器字段）
//   4. undo() → objs/身份（预期回到创建前）
//   5. redo() → objs/身份（预期对象恢复；检查 multiUuid/location*/media* 字段是否出现 → 原生反序列化）
// 输出：runtime/reports/stage-6-p0-lifecycle-audit7.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-6-p0-lifecycle-audit7.json");

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-6-P0-EDITOR-LIFECYCLE-AUDIT-R7", steps: [], errors: [] };
  const step = (n, ok, d) => { report.steps.push({ name: n, ok: ok ? "PASS" : "INFO", detail: String(d || "").slice(0, 3800) }); if (!ok) report.errors.push(n); };
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

  const dumpTypes = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const u = (ctx && ctx.defined && ctx.defined.Undo && ctx.defined.Undo.getInstance) ? ctx.defined.Undo.getInstance() : null;
    if (!u) return { err: "no undo" };
    const out = {};
    ["undo", "redo", "undoLength", "save", "replay", "buttonControl", "state"].forEach((k) => {
      const v = u[k];
      out[k] = typeof v;
      if (typeof v === "function") { try { out[k + "_src"] = v.toString().replace(/\s+/g, " ").slice(0, 240); } catch (e) {} }
    });
    return out;
  }).catch((e) => ({ err: String(e) }));

  const act = (what) => page.evaluate((w) => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const defs = ctx && ctx.defined ? ctx.defined : {};
    const u = defs["Undo"].getInstance ? defs["Undo"].getInstance() : null;
    const vo = defs["CanvasObjVO"] || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    const res = { step: w, objs: c ? c.getObjects().length : null };
    if (u) { res.undoLen = typeof u.undoLength === "function" ? u.undoLength() : u.undoLength; res.stateLen = typeof u.state === "string" ? u.state.length : (u.state ? u.state.length : null); }
    if (w === "save" && u && typeof u.save === "function") { try { u.save(); res.saved = true; } catch (e) { res.saveErr = String(e && e.message || e).slice(0, 120); } }
    if ((w === "undo" || w === "redo") && u && typeof u[w] === "function") { try { u[w](); res.called = true; } catch (e) { res.err = String(e && e.message || e).slice(0, 200); } }
    if (u) { res.afterUndoLen = typeof u.undoLength === "function" ? u.undoLength() : u.undoLength; }
    // 身份快照
    const KEYS = ["type", "text", "multiUuid", "markuuid", "uuid", "layerNum", "mediaMediaType", "locationX", "locationY", "locationWidth", "locationHeight", "locationRotation", "printLocationX", "printLocationY", "isDesign", "isEdit", "isLineText", "fontSize", "fontFamily", "deleteState"];
    res.objsInfo = c ? c.getObjects().map((o, i) => {
      const p = {};
      KEYS.forEach((k) => { if (o[k] !== undefined) { const v = o[k]; p[k] = (typeof v === "object" && v !== null) ? "[o]" : v; } });
      return { i: i, p: p };
    }).slice(-6) : [];
    res.stateHead = typeof u.state === "string" ? u.state.slice(0, 200) : null;
    return res;
  }, what).catch((e) => ({ err: String(e && e.message || e).slice(0, 200) }));

  const addRaw = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    if (!c || !window.fabric) return { ok: false };
    const obj = new window.fabric.Textbox("批量快照测试A\n第二行", { left: 70, top: 70, width: 180, fontSize: 18, fill: "#000000" });
    c.add(obj);
    if (c.requestRenderAll) c.requestRenderAll();
    return { ok: true, count: c.getObjects().length, ctor: obj.constructor.name };
  }).catch((e) => ({ ok: false, err: String(e && e.message || e).slice(0, 120) }));

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

    const dt = await dumpTypes();
    step("undo-method-types", true, JSON.stringify(dt).slice(0, 2600));

    const b0 = await act("base");
    step("base", true, JSON.stringify(b0).slice(0, 900));
    const s1 = await act("save");
    step("after-save", true, JSON.stringify(s1).slice(0, 900));
    const a1 = await addRaw();
    step("raw-add", !!(a1 && a1.ok), JSON.stringify(a1).slice(0, 300));
    const s2 = await act("after-add");
    step("after-add", true, JSON.stringify(s2).slice(0, 2000));
    const u1 = await act("undo");
    step("undo-after-save-add", true, JSON.stringify(u1).slice(0, 2400));
    const r1 = await act("redo");
    step("redo-after-undo", true, JSON.stringify(r1).slice(0, 2600));
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.stack || e).slice(0, 600));
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1));
    console.log("audit7 report -> " + REPORT_PATH);
    report.steps.forEach((s) => console.log("  [" + s.ok + "] " + s.name + " :: " + String(s.detail).replace(/\n/g, " ").slice(0, 300)));
  }
})();