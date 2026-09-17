// runtime/stage-6-p0-editor-lifecycle-audit10.js — Stage 6 P0 审计 R10（素材项点击 → 画布点击落字 → identity/图层/undo/redo 验证）
// 目标：闭环原生「普通文本」素材 → 画布点击 → textbox 出现 → 采集 identity 与调用链 → 原生撤销/重做验证
// 附带：sundry.historyUtil 形状（原生历史工具）
// 输出：runtime/reports/stage-6-p0-lifecycle-audit10.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-6-p0-lifecycle-audit10.json");

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-6-P0-EDITOR-LIFECYCLE-AUDIT-R10", steps: [], errors: [] };
  const step = (n, ok, d) => { report.steps.push({ name: n, ok: ok ? "PASS" : "INFO", detail: String(d || "").slice(0, 4400) }); if (!ok) report.errors.push(n); };
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

  const fireHooks = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const defs = ctx && ctx.defined ? ctx.defined : {};
    if (window.__zA10) return { ok: true, patched: false };
    window.__zA10 = true;
    window.__zLog10 = [];
    const log = (m, x) => window.__zLog10.push({ ts: Date.now(), m: m, x: String(x || "").slice(0, 300) });
    const wrapFn = (fn, name) => {
      if (typeof fn !== "function" || fn.__zA10) return fn;
      const w = function () { log("call." + name, "args=" + arguments.length); return fn.apply(this, arguments); };
      w.__zA10 = true;
      return w;
    };
    ["CurrentCanvas"].forEach((n) => { const e = defs[n]; if (e && e.prototype) Object.getOwnPropertyNames(e.prototype).forEach((k) => { if (typeof e.prototype[k] === "function") e.prototype[k] = wrapFn(e.prototype[k], n + "." + k); }); });
    const vo = defs["CanvasObjVO"] || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    if (c) {
      let p = c, d = 0;
      const seen = new Set();
      while (p && d < 12) {
        if (p.constructor && p.constructor.prototype && !seen.has(p.constructor.prototype)) { seen.add(p.constructor.prototype); const pname = p.constructor.name || String(d); ["add", "remove", "loadFromJSON"].forEach((fn) => { if (typeof p.constructor.prototype[fn] === "function" && !p.constructor.prototype[fn].__zA10) { const orig = p.constructor.prototype[fn]; p.constructor.prototype[fn] = function () { const ob = arguments[0]; log(fn + "@" + pname, ob ? (ob.type + " text=" + String(ob.text || "").slice(0, 8)) : ""); const r = orig.apply(this, arguments); if (fn === "add" && ob && ob.type === "textbox") setTimeout(() => { const idk = Object.keys(ob).filter((x) => /multiUuid|markuuid|layerNum|location|media|print|isDesign|deleteState/i.test(x)); log("add-post-textbox", "idKeys=" + JSON.stringify(idk) + " multiUuid=" + (ob.multiUuid || "") + " layerNum=" + ob.layerNum + " text=" + String(ob.text || "").slice(0, 10)); }, 1100); return r; }; p.constructor.prototype[fn].__zA10 = true; } }); }
        p = Object.getPrototypeOf(p); d += 1;
      }
    }
    const sundry = defs["sundry"];
    if (sundry && sundry.historyUtil) { report = report; }
    return { ok: true };
  }).catch((e) => ({ ok: false, err: String(e) }));

  const historyUtilDump = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const hu = (ctx && ctx.defined && ctx.defined.sundry) ? ctx.defined.sundry.historyUtil : null;
    if (!hu) return { err: "no historyUtil" };
    const out = { keys: Object.keys(hu).slice(0, 80) };
    out.fns = {};
    Object.keys(hu).forEach((k) => { const v = hu[k]; if (typeof v === "function") out.fns[k] = v.toString().replace(/\s+/g, " ").slice(0, 200); });
    ["undoArr", "redoArr", "undoList", "redoList", "undoArray", "redoArray", "history", "length"].forEach((k) => { if (hu[k] !== undefined) out["prop." + k] = Array.isArray(hu[k]) ? "array:" + hu[k].length : typeof hu[k]; });
    return out;
  }).catch((e) => ({ err: String(e) }));

  const readLog = () => page.evaluate(() => (window.__zLog10 || []).slice(-240)).catch(() => []);
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

  const canvasCenter = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    if (!c || !c.wrapperEl) return null;
    const rect = c.wrapperEl.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width * 0.42), y: Math.round(rect.top + rect.height * 0.4), w: Math.round(rect.width), h: Math.round(rect.height) };
  }).catch(() => null);

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
    const KEYS = ["type", "text", "multiUuid", "markuuid", "uuid", "layerNum", "mediaMediaType", "locationX", "locationY", "locationWidth", "locationHeight", "locationRotation", "printLocationX", "printLocationY", "isDesign", "isEdit", "isLineText", "fontSize", "fontFamily", "fontWeight", "deleteState", "mediaLineSpace", "lineHeight"];
    return { objs: c.getObjects().length, list: c.getObjects().map((o, i) => { const p = {}; KEYS.forEach((k) => { if (o[k] !== undefined) { const v = o[k]; p[k] = (typeof v === "object" && v !== null) ? "[o]" : v; } }); return { i: i, t: o.type, tx: String(o.text || "").slice(0, 14), p: p }; }).slice(-8) };
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

    const hu = await historyUtilDump();
    step("historyUtil", true, JSON.stringify(hu).slice(0, 3600));
    const hk = await fireHooks();
    step("hooks", !!(hk && hk.ok), JSON.stringify(hk).slice(0, 200));
    const b0 = await snap();
    step("base", true, JSON.stringify(b0));

    const c1 = await clickKeyword(["普通文本"]);
    step("click-normal-text", c1.clicked, JSON.stringify(c1).slice(0, 200));
    await page.waitForTimeout(900);
    const pos = await canvasCenter();
    step("canvas-pos", !!pos, JSON.stringify(pos));
    if (pos) { await page.mouse.move(pos.x, pos.y); await page.mouse.click(pos.x, pos.y); }
    await page.waitForTimeout(1800);
    const s1 = await snap();
    step("after-place", !!(s1 && s1.objs > b0.objs), "before=" + b0.objs + " after=" + (s1 ? s1.objs : 0) + " type=" + JSON.stringify(s1 && s1.typeCount));
    const id1 = await idDump();
    step("placed-identity", true, JSON.stringify(id1).slice(0, 3400));
    const log1 = await readLog();
    step("log-placement", true, log1.slice(0, 90).map((l) => l.m + " | " + l.x).join("\n").slice(0, 3200));

    const u1 = await clickKeyword(["撤销", "undo"]);
    step("native-undo", u1.clicked, JSON.stringify(u1).slice(0, 160));
    await page.waitForTimeout(1600);
    const idU = await idDump();
    step("after-undo", true, "objs=" + idU.objs + " " + JSON.stringify(idU).slice(0, 2200));
    const r1 = await clickKeyword(["重做", "redo"]);
    step("native-redo", r1.clicked, JSON.stringify(r1).slice(0, 160));
    await page.waitForTimeout(1600);
    const idR = await idDump();
    step("after-redo", true, "objs=" + idR.objs + " " + JSON.stringify(idR).slice(0, 2600));
    const log2 = await readLog();
    step("log-undoredo", true, log2.slice(-100).map((l) => l.m + " | " + l.x).join("\n").slice(0, 3200));
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.stack || e).slice(0, 600));
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1));
    console.log("audit10 report -> " + REPORT_PATH);
    report.steps.forEach((s) => console.log("  [" + s.ok + "] " + s.name + " :: " + String(s.detail).replace(/\n/g, " ").slice(0, 340)));
  }
})();