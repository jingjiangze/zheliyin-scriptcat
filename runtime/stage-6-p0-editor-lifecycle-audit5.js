// runtime/stage-6-p0-editor-lifecycle-audit5.js — Stage 6 P0 审计 R5（真实点击落字 + undoAndRedo 堆栈刻画）
// 目标：用真实输入事件复刻原生「添加文字→画布点击落字」，抓取：
//   - SimpleCommandManager.getInstance() / Undo.getInstance() 实例方法包装（撤销/重做调用链）
//   - canvas add/remove/loadFromJSON 包装
//   - vo.undoAndRedo 堆栈结构快照（新增文字后 length 变化、元素形状）
//   - 新建 textbox 的完整 identity（multiUuid/location*/media*/layerNum）
//   - 原生撤销→重做后的对象状态
// 输出：runtime/reports/stage-6-p0-lifecycle-audit5.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-6-p0-lifecycle-audit5.json");

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-6-P0-EDITOR-LIFECYCLE-AUDIT-R5", steps: [], errors: [] };
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

  const snap = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    const objs = c ? c.getObjects() : [];
    const typeCount = {};
    objs.forEach((o) => { typeCount[o.type || "?"] = (typeCount[o.type || "?"] || 0) + 1; });
    const idx0 = (Array.isArray(total) && total[0]) || null;
    const ur = vo ? vo.undoAndRedo : null;
    return {
      objCount: objs.length, typeCount: typeCount,
      undoAndRedoType: ur == null ? "null" : Array.isArray(ur) ? "array:" + ur.length : typeof ur,
      undoAndRedoSample: Array.isArray(ur) ? sample(ur, 300) : null,
      canvasObjInfoKeys: idx0 && idx0.canvasObjInfo ? Object.keys(idx0.canvasObjInfo).slice(0, 60) : null,
      cutImgsLayerLen: idx0 && idx0.cutImgsLayerArr ? idx0.cutImgsLayerArr.length : null
    };
    function sample(arr, max) {
      const out = [];
      arr.slice(0, 4).forEach((it) => {
        if (it == null) { out.push(null); return; }
        if (typeof it === "object") { const p = {}; Object.keys(it).slice(0, 18).forEach((k) => { const v = it[k]; p[k] = (typeof v === "object" && v !== null) ? "[obj]" : (Array.isArray(v) ? "arr:" + v.length : v); }); out.push(p); }
        else out.push(String(it).slice(0, 40));
      });
      return JSON.stringify(out).slice(0, max);
    }
  }).catch((e) => null);

  const idDump = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    if (!c) return { objCount: 0 };
    const KEYS = ["type", "text", "multiUuid", "markuuid", "uuid", "layerNum", "mediaMediaType", "locationX", "locationY", "locationWidth", "locationHeight", "locationRotation", "printLocationX", "printLocationY", "isDesign", "isEdit", "isLineText", "fontSize", "fontFamily", "fontWeight", "deleteState", "textAlign", "lineHeight", "charSpacing", "iTextLineHeight"];
    return {
      objCount: c.getObjects().length,
      list: c.getObjects().map((o, i) => {
        const p = {};
        KEYS.forEach((k) => { if (o[k] !== undefined) { const v = o[k]; p[k] = (typeof v === "object" && v !== null) ? "[o]" : v; } });
        return { i: i, p: p };
      }).slice(-18)
    };
  }).catch((e) => ({ err: String(e) }));

  const fireHooks = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const defs = ctx && ctx.defined ? ctx.defined : {};
    const vo = defs["CanvasObjVO"] || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    if (!c) return { ok: false };
    if (window.__zA5) return { ok: true, patched: false };
    window.__zA5 = true;
    window.__zLog5 = [];
    const log = (m, x) => window.__zLog5.push({ ts: Date.now(), m: m, x: String(x || "").slice(0, 300) });
    const wrapFn = (fn, name, holder, key) => {
      if (typeof fn !== "function" || fn.__zA5) return fn;
      const w = function () { log("call." + name, "args=" + arguments.length); const r = fn.apply(this, arguments); return r; };
      w.__zA5 = true;
      return w;
    };
    const patchProto = (proto, label) => {
      if (!proto) return;
      ["add", "remove", "loadFromJSON"].forEach((fn) => {
        if (typeof proto[fn] === "function" && !proto[fn].__zA5) {
          const orig = proto[fn];
          proto[fn] = function () {
            const ob = arguments[0];
            log(fn + "@" + label, ob ? (ob.type + " ownKeys=" + Object.keys(ob).length + " text=" + String(ob.text || "").slice(0, 8)) : "");
            const r = orig.apply(this, arguments);
            if (fn === "add" && ob) setTimeout(() => { const idk = Object.keys(ob).filter((x) => /multiUuid|markuuid|layerNum|location|media|print|isDesign/i.test(x)); log("add-post-" + label, ob.type + " idKeys=" + JSON.stringify(idk) + " multiUuid=" + (ob.multiUuid || "")); }, 1000);
            return r;
          };
          proto[fn].__zA5 = true;
        }
      });
    };
    let p = c, depth = 0;
    const seen = new Set();
    while (p && depth < 12) {
      if (p.constructor && p.constructor.prototype && !seen.has(p.constructor.prototype)) { seen.add(p.constructor.prototype); patchProto(p.constructor.prototype, p.constructor.name || String(depth)); }
      p = Object.getPrototypeOf(p); depth += 1;
    }
    if (window.fabric && window.fabric.Canvas) patchProto(window.fabric.Canvas.prototype, "fabric.Canvas");
    // 命令/撤销单例实例包装
    try {
      const scm = defs["SimpleCommandManager"] && defs["SimpleCommandManager"].getInstance ? defs["SimpleCommandManager"].getInstance() : null;
      if (scm) Object.getOwnPropertyNames(scm).forEach((k) => { if (typeof scm[k] === "function") scm[k] = wrapFn(scm[k], "SCM." + k, scm, k); });
      if (scm && scm.constructor && scm.constructor.prototype) Object.keys(scm.constructor.prototype).forEach((k) => { if (typeof scm.constructor.prototype[k] === "function") scm.constructor.prototype[k] = wrapFn(scm.constructor.prototype[k], "SCMproto." + k, scm.constructor.prototype, k); });
      const u = defs["Undo"] && defs["Undo"].getInstance ? defs["Undo"].getInstance() : null;
      if (u) { Object.keys(u).forEach((k) => { if (typeof u[k] === "function") u[k] = wrapFn(u[k], "Undo." + k, u, k); }); if (u.constructor && u.constructor.prototype) Object.keys(u.constructor.prototype).forEach((k) => { if (typeof u.constructor.prototype[k] === "function") u.constructor.prototype[k] = wrapFn(u.constructor.prototype[k], "UndoProto." + k, u.constructor.prototype, k); }); log("undo-instance-keys", JSON.stringify(Object.keys(u))); if (u.constructor && u.constructor.prototype) log("undo-proto-keys", JSON.stringify(Object.keys(u.constructor.prototype))); }
      if (scm) log("scm-instance-keys", JSON.stringify(Object.keys(scm)));
    } catch (e) { log("wrap-instances-err", String(e).slice(0, 120)); }
    return { ok: true };
  }).catch((e) => ({ ok: false, err: String(e) }));

  const readLog = () => page.evaluate(() => (window.__zLog5 || []).slice(-200)).catch(() => []);
  const clickKeyword = (kws) => page.evaluate((k) => {
    const all = Array.from(document.querySelectorAll("button, [role=button], [class*=btn], [class*=icon], li, a, span, div"));
    const score = (b) => {
      const t = (b.textContent || "").trim(); const title = b.title || ""; const aria = b.getAttribute("aria-label") || ""; const cls = String(b.className || "");
      if (t === k[0] || title === k[0] || aria === k[0]) return 100;
      if (k.some((x) => t.indexOf(x) === 0 || (title && title.indexOf(x) >= 0) || (aria && aria.indexOf(x) >= 0))) return 60;
      if (k.some((x) => cls.indexOf(x) >= 0)) return 30;
      return 0;
    };
    let best = null, bs = 0;
    all.forEach((b) => { const s = score(b); if (s > bs) { bs = s; best = b; } });
    if (!best || bs <= 0) return { clicked: false };
    best.click();
    return { clicked: true, text: (best.textContent || "").trim().slice(0, 10), cls: String(best.className || "").slice(0, 40), score: bs };
  }, kws).catch((e) => ({ clicked: false, err: String(e && e.message || e).slice(0, 60) }));

  const canvasCenterPos = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    if (!c || !c.wrapperEl) return null;
    const rect = c.wrapperEl.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width * 0.45), y: Math.round(rect.top + rect.height * 0.38), w: Math.round(rect.width), h: Math.round(rect.height) };
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
    const baseSnap = await snap();
    step("base-state", true, JSON.stringify(baseSnap).slice(0, 2000));
    const hk = await fireHooks();
    step("hooks", !!(hk && hk.ok), JSON.stringify(hk).slice(0, 200));

    await clickKeyword(["文字", "文本"]);
    await page.waitForTimeout(700);
    const ab = await clickKeyword(["添加文字"]);
    step("click-addText", ab.clicked, JSON.stringify(ab).slice(0, 160));
    await page.waitForTimeout(500);
    const pos = await canvasCenterPos();
    step("canvas-pos", !!pos, JSON.stringify(pos));
    if (pos) {
      await page.mouse.move(pos.x, pos.y);
      await page.mouse.click(pos.x, pos.y);
      await page.waitForTimeout(1600);
    }
    const afterAdd = await snap();
    step("after-native-add", !!(afterAdd && afterAdd.objCount > rd.objs), "before=" + rd.objs + " after=" + (afterAdd ? afterAdd.objCount : 0) + " type=" + JSON.stringify(afterAdd && afterAdd.typeCount));
    const idN = await idDump();
    step("native-text-identity", true, JSON.stringify(idN).slice(0, 3200));

    const u1 = await clickKeyword(["撤销", "undo"]);
    step("click-undo", u1.clicked, JSON.stringify(u1).slice(0, 160));
    await page.waitForTimeout(1500);
    const idU = await idDump();
    step("after-undo", true, "count=" + idU.objCount + " " + JSON.stringify(idU).slice(0, 2600));

    const r1 = await clickKeyword(["重做", "redo"]);
    step("click-redo", r1.clicked, JSON.stringify(r1).slice(0, 160));
    await page.waitForTimeout(1500);
    const idR = await idDump();
    step("after-redo", true, "count=" + idR.objCount + " " + JSON.stringify(idR).slice(0, 2600));

    const sEnd = await snap();
    step("end-state", true, JSON.stringify(sEnd).slice(0, 1600));
    const log = await readLog();
    step("audit-log", true, log.map((l) => l.m + " | " + l.x).join("\n").slice(0, 3600));
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.stack || e).slice(0, 600));
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1));
    console.log("audit5 report -> " + REPORT_PATH);
    report.steps.forEach((s) => console.log("  [" + s.ok + "] " + s.name + " :: " + String(s.detail).replace(/\n/g, " ").slice(0, 240)));
  }
})();