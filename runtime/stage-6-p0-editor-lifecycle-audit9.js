// runtime/stage-6-p0-editor-lifecycle-audit9.js — Stage 6 P0 审计 R9（原生「普通文本」素材入口 → 真实 textbox + 原生 undo 全链路）
// 目标：找到编辑器真正创建 textbox 且进入历史/图层的入口（避免 UI 点击链盲探）：
//   1. sundry 模块 keys（undo/redo 栈）与 CanvasToolBar 原型方法名
//   2. 包装 CanvasToolBar / sundry / Undo 实例 / canvas.add → 点击左素材库「普通文本」→ 采集调用链
//   3. 新 textbox 身份（multiUuid/location*/media*）→ 原生撤销 → 对象回退 → 原生重做 → 恢复
// 输出：runtime/reports/stage-6-p0-lifecycle-audit9.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-6-p0-lifecycle-audit9.json");

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-6-P0-EDITOR-LIFECYCLE-AUDIT-R9", steps: [], errors: [] };
  const step = (n, ok, d) => { report.steps.push({ name: n, ok: ok ? "PASS" : "INFO", detail: String(d || "").slice(0, 4200) }); if (!ok) report.errors.push(n); };
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

  const moduleRef = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const defs = ctx && ctx.defined ? ctx.defined : {};
    const sundry = defs["sundry"];
    const ctb = defs["CanvasToolBar"];
    const out = {};
    if (sundry) {
      out.sundryKeys = Object.keys(sundry).slice(0, 80);
      out.sundryUndoLike = Object.keys(sundry).filter((k) => /undo|redo|history|stack|arr/i.test(k));
      out.sundryFn = {};
      Object.keys(sundry).forEach((k) => { const v = sundry[k]; if (typeof v === "function") out.sundryFn[k] = v.toString().replace(/\s+/g, " ").slice(0, 180); });
    }
    if (ctb) {
      const proto = ctb.prototype;
      out.ctbProto = proto ? Object.getOwnPropertyNames(proto).slice(0, 120) : null;
      out.ctbOwn = Object.getOwnPropertyNames(ctb).slice(0, 60);
      out.ctbTextLike = Object.keys((proto || {})).filter((k) => /text|add|create|insert|txt/i.test(k));
      out.ctbHead = { };
      if (proto) Object.keys(proto).forEach((k) => { const v = proto[k]; if (typeof v === "function" && /text|add|create|insert/i.test(k)) out.ctbHead[k] = v.toString().replace(/\s+/g, " ").slice(0, 200); });
    }
    return out;
  }).catch((e) => ({ err: String(e) }));

  const fireHooks = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const defs = ctx && ctx.defined ? ctx.defined : {};
    if (window.__zA9) return { ok: true, patched: false };
    window.__zA9 = true;
    window.__zLog9 = [];
    const log = (m, x) => window.__zLog9.push({ ts: Date.now(), m: m, x: String(x || "").slice(0, 320) });
    const wrapFn = (fn, name) => {
      if (typeof fn !== "function" || fn.__zA9) return fn;
      const w = function () { log("call." + name, "args=" + JSON.stringify([].slice.call(arguments).map((a) => (a == null ? String(a) : (typeof a === "object" ? (a.type || Object.keys(a).length + "k") : String(a).slice(0, 20)))).slice(0, 4)).slice(0, 200)); return fn.apply(this, arguments); };
      w.__zA9 = true;
      return w;
    };
    const patchProto = (obj, label) => {
      if (!obj) return;
      let proto = (typeof obj === "function" ? obj.prototype : obj);
      Object.getOwnPropertyNames(proto).forEach((k) => { const v = proto[k]; if (typeof v === "function" && !v.__zA9) proto[k] = wrapFn(v, (typeof obj === "function" ? obj.name || "" : label) + "." + k); });
    };
    ["CanvasToolBar", "sundry", "Undo", "CurrentCanvas"].forEach((n) => { try { patchProto(defs[n], n); } catch (e) { log("patch-err", n + " " + String(e).slice(0, 80)); } });
    const vo = defs["CanvasObjVO"] || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    if (c) {
      let p = c, d = 0;
      const seen = new Set();
      while (p && d < 12) {
        if (p.constructor && p.constructor.prototype && !seen.has(p.constructor.prototype)) { seen.add(p.constructor.prototype); const pname = p.constructor.name || String(d); ["add", "remove", "loadFromJSON"].forEach((fn) => { if (typeof p.constructor.prototype[fn] === "function" && !p.constructor.prototype[fn].__zA9) { const orig = p.constructor.prototype[fn]; p.constructor.prototype[fn] = function () { const ob = arguments[0]; log(fn + "@" + pname, ob ? (ob.type + " text=" + String(ob.text || "").slice(0, 8)) : ""); const r = orig.apply(this, arguments); if (fn === "add" && ob) setTimeout(() => { log("add-post-" + pname, ob.type + " multiUuid=" + (ob.multiUuid || "") + " layerNum=" + ob.layerNum + " media=" + ob.mediaMediaType + " loc=" + String(ob.locationX) + "," + String(ob.locationY)); }, 900); return r; }; p.constructor.prototype[fn].__zA9 = true; } }); }
        p = Object.getPrototypeOf(p); d += 1;
      }
    }
    return { ok: true, patched: true };
  }).catch((e) => ({ ok: false, err: String(e) }));

  const readLog = () => page.evaluate(() => (window.__zLog9 || []).slice(-240)).catch(() => []);
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

  const snap = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    const objs = c ? c.getObjects() : [];
    const typeCount = {};
    objs.forEach((o) => { typeCount[o.type || "?"] = (typeCount[o.type || "?"] || 0) + 1; });
    return { objs: objs.length, typeCount: typeCount };
  }).catch(() => null);

  const idDump = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    if (!c) return { objs: 0 };
    const KEYS = ["type", "text", "multiUuid", "markuuid", "uuid", "layerNum", "mediaMediaType", "locationX", "locationY", "locationWidth", "locationHeight", "locationRotation", "printLocationX", "printLocationY", "isDesign", "isEdit", "isLineText", "fontSize", "fontFamily", "fontWeight", "deleteState", "mediaLineSpace", "charSpacing", "lineHeight", "textAlign"];
    return { objs: c.getObjects().length, list: c.getObjects().map((o, i) => { const p = {}; KEYS.forEach((k) => { if (o[k] !== undefined) { const v = o[k]; p[k] = (typeof v === "object" && v !== null) ? "[o]" : v; } }); return { i: i, p: p }; }).slice(-8) };
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
    const ref = await moduleRef();
    step("module-ref", true, JSON.stringify(ref).slice(0, 3600));
    const hk = await fireHooks();
    step("hooks", !!(hk && hk.ok), JSON.stringify(hk).slice(0, 200));
    const b0 = await snap();
    step("base", true, JSON.stringify(b0));

    // 左素材库「普通文本」
    for (const kw of [["普通文本", "普通文本"], ["普通文字"], ["文本", "文字素材"]]) {
      const r = await clickKeyword(kw);
      step("click:" + kw[0], r.clicked, JSON.stringify(r).slice(0, 200));
      await page.waitForTimeout(1600);
      const s = await snap();
      if (s && s.objs > b0.objs) { step("native-create-by-" + kw[0], true, JSON.stringify(s)); break; }
    }
    const sNative = await snap();
    step("after-native-material", true, JSON.stringify(sNative));
    const idN = await idDump();
    step("native-textbox-identity", true, JSON.stringify(idN).slice(0, 3200));
    const log1 = await readLog();
    step("log-create-cross-section", true, log1.slice(0, 80).map((l) => l.m + " | " + l.x).join("\n").slice(0, 3200));

    // 原生撤销 → 重做
    const u1 = await clickKeyword(["撤销", "undo"]);
    step("native-undo-click", u1.clicked, JSON.stringify(u1).slice(0, 160));
    await page.waitForTimeout(1500);
    const idU = await idDump();
    step("after-undo", true, "objs=" + idU.objs + " " + JSON.stringify(idU).slice(0, 2000));
    const r1 = await clickKeyword(["重做", "redo"]);
    step("native-redo-click", r1.clicked, JSON.stringify(r1).slice(0, 160));
    await page.waitForTimeout(1500);
    const idR = await idDump();
    step("after-redo", true, "objs=" + idR.objs + " " + JSON.stringify(idR).slice(0, 2000));
    const log2 = await readLog();
    step("log-undo-redo", true, log2.slice(-90).map((l) => l.m + " | " + l.x).join("\n").slice(0, 3200));
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.stack || e).slice(0, 600));
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1));
    console.log("audit9 report -> " + REPORT_PATH);
    report.steps.forEach((s) => console.log("  [" + s.ok + "] " + s.name + " :: " + String(s.detail).replace(/\n/g, " ").slice(0, 300)));
  }
})();