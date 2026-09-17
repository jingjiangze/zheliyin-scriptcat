// runtime/stage-6-p0-editor-lifecycle-audit3.js — Stage 6 P0 审计 R3（原生新建文字全链路 + Undo 语义）
// R2 发现：文字 tab → TextPropBar（字体/字效/背景填充 + 「添加文字」btn.addText）→ 点击后需在画布点击落字。
// R3 目标：
//   1) 等画布完全就绪后再导模块 + 埋点（R2 时序失误修复：objs>0 && CanvasObjVO 存在）
//   2) 原生链路：文字 tab → 添加文字 → 画布中心点击 → textbox 创建 → 采集 add 调用与对象 identity（multiUuid/location*）
//   3) 原生撤销 → 对象数变化 + Undo 模块调用 → 重做
//   4) 图层面板：新 textbox 是否出现
// 输出：runtime/reports/stage-6-p0-lifecycle-audit3.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-6-p0-lifecycle-audit3.json");

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-6-P0-EDITOR-LIFECYCLE-AUDIT-R3", steps: [], errors: [] };
  const step = (n, ok, d) => { report.steps.push({ name: n, ok: ok ? "PASS" : "INFO", detail: String(d || "").slice(0, 3200) }); if (!ok) report.errors.push(n); };
  let browser = null;
  let page = null;

  const grabCtx = () => `(() => { const req = window.requirejs || window.require; const ctx = req && req.s && req.s.contexts && req.s.contexts._; return { req, ctx, vo: (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO, total: ((ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO) && ((ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO).totalCanvasArray || null, canvas: null }; })()`;

  const ready = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    return { ok: !!(c && c.getObjects && c.getObjects().length >= 0), objs: c ? c.getObjects().length : 0, hasCtx: !!ctx, voKeys: vo ? Object.keys(vo).length : 0, totalKeys: total ? Object.keys(total).length : 0 };
  }).catch(() => ({ ok: false }));

  const snapshot = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    const objs = c ? c.getObjects() : [];
    const typeCount = {};
    objs.forEach((o) => { typeCount[o.type || "?"] = (typeCount[o.type || "?"] || 0) + 1; });
    return { objCount: objs.length, typeCount: typeCount };
  }).catch((e) => null);

  const identityDump = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    if (!c) return { objCount: 0, list: [] };
    const KEYS = ["type", "text", "multiUuid", "markuuid", "uuid", "layerNum", "mediaMediaType", "locationX", "locationY", "locationWidth", "locationHeight", "locationRotation", "printLocationX", "printLocationY", "printLocationWidth", "printLocationHeight", "printLocationRotation", "isDesign", "isEdit", "fontSize", "fontFamily", "isLineText", "deleteState"];
    return {
      objCount: c.getObjects().length,
      list: c.getObjects().map((o, i) => {
        const p = {};
        KEYS.forEach((k) => { if (o[k] !== undefined) { const v = o[k]; p[k] = (typeof v === "object" && v !== null) ? "[o]" : v; } });
        return { i: i, p: p };
      }).slice(-18)
    };
  }).catch((e) => ({ objCount: 0, list: [], err: String(e) }));

  const moduleDump = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const defs = (ctx && ctx.defined) || {};
    const names = ["Undo", "SimpleCommandManager", "ICommand", "CurrentCanvas", "layer", "CanvasObjVO", "CanvasDiy", "MultiCanvasDiy", "TextPropBar"];
    const out = {};
    names.forEach((n) => {
      const e = defs[n];
      if (!e) { out[n] = "UNDEFINED"; return; }
      const info = { typeof_: typeof e };
      if (typeof e === "object") {
        const ks = Object.keys(e).slice(0, 50).filter((k) => /undo|redo|history|command|stack|add|create|text|layer|go|exec|rollback|save/i.test(k));
        info.keys = ks;
        info.kv = {};
        ks.forEach((k) => { const v = e[k]; info.kv[k] = (typeof v === "function") ? v.toString().replace(/\s+/g, " ").slice(0, 160) : (typeof v === "object" ? "[obj]" : v); });
      } else if (typeof e === "function") {
        info.head = e.toString().replace(/\s+/g, " ").slice(0, 200);
        const proto = e.prototype;
        if (proto) {
          info.proto = {};
          Object.keys(proto).slice(0, 40).forEach((k) => { const v = proto[k]; if (typeof v === "function") info.proto[k] = v.toString().replace(/\s+/g, " ").slice(0, 140); });
        }
      }
      out[n] = info;
    });
    return out;
  }).catch((e) => ({ err: String(e) }));

  const fireHooks = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    if (!c) return { ok: false, err: "no canvas" };
    if (window.__zA3) return { ok: true, patched: false };
    window.__zA3 = true;
    window.__zLog3 = [];
    const log = (m, x) => window.__zLog3.push({ ts: Date.now(), m: m, x: String(x || "").slice(0, 400) });
    const patchProto = (proto, label) => {
      if (!proto) return;
      ["add", "remove", "loadFromJSON"].forEach((fn) => {
        if (typeof proto[fn] === "function" && !proto[fn].__zA3) {
          const orig = proto[fn];
          proto[fn] = function () {
            const ob = arguments[0];
            log(fn + "@" + label, ob ? ("type=" + ob.type + " ownKeys=" + Object.keys(ob).length + " text=" + String(ob.text || "").slice(0, 10)) : "");
            const r = orig.apply(this, arguments);
            if (fn === "add" && ob) setTimeout(() => { const k = Object.keys(ob).filter((x) => /multiUuid|markuuid|location|media|layerNum|print|postL/i.test(x)); log("add-post", ob.type + " keys=" + JSON.stringify(k) + " multiUuid=" + (ob.multiUuid || "")); }, 900);
            return r;
          };
          proto[fn].__zA3 = true;
        }
      });
    };
    const wrapFn = (fn, name) => {
      if (typeof fn !== "function" || fn.__zA3) return fn;
      fn.__zA3 = true;
      return function () { log("mod." + name, ""); return fn.apply(this, arguments); };
    };
    const seen = new Set();
    let p = c;
    let depth = 0;
    while (p && depth < 12) {
      if (p.constructor && p.constructor.prototype && !seen.has(p.constructor.prototype)) { seen.add(p.constructor.prototype); patchProto(p.constructor.prototype, p.constructor.name || String(depth)); }
      p = Object.getPrototypeOf(p); depth += 1;
    }
    if (window.fabric && window.fabric.Canvas && !seen.has(window.fabric.Canvas.prototype)) { seen.add(window.fabric.Canvas.prototype); patchProto(window.fabric.Canvas.prototype, "fabric.Canvas"); }
    const defs = ctx && ctx.defined ? ctx.defined : {};
    ["Undo", "SimpleCommandManager"].forEach((n) => {
      const e = defs[n];
      if (!e) return;
      try {
        if (typeof e === "function") {
          const proto = e.prototype;
          if (proto) Object.keys(proto).forEach((k) => { if (typeof proto[k] === "function") proto[k] = wrapFn(proto[k], n + "." + k); });
          Object.keys(e).forEach((k) => { if (typeof e[k] === "function") e[k] = wrapFn(e[k], n + "." + k); });
        } else if (typeof e === "object") {
          Object.keys(e).forEach((k) => { if (typeof e[k] === "function") e[k] = wrapFn(e[k], n + "." + k); });
        }
      } catch (err) { log("wrap-err", n + " " + String(err).slice(0, 100)); }
    });
    // CanvasObjVO 上的 undo/redo 挂载（编辑器实例级）
    if (vo && typeof vo === "object") Object.keys(vo).slice(0, 80).forEach((k) => { if (typeof vo[k] === "function") vo[k] = wrapFn(vo[k], "vo." + k); });
    return { ok: true, patched: true, chainDepth: depth };
  }).catch((e) => ({ ok: false, err: String(e) }));

  const readLog = () => page.evaluate(() => (window.__zLog3 || []).slice(-200)).catch(() => []);
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

  // 画布中心点击（触发原生 mouse:down 落字）
  const canvasCenterClick = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    if (!c || !c.wrapperEl) return { ok: false, err: "no wrapper" };
    const rect = c.wrapperEl.getBoundingClientRect();
    const x = rect.left + rect.width * 0.42, y = rect.top + rect.height * 0.35;
    const opts = (type) => new MouseEvent(type, { clientX: x, clientY: y, button: 0, buttons: type === "mousedown" ? 1 : 0, bubbles: true, cancelable: true, view: window });
    const el = c.upperCanvasEl || c.wrapperEl;
    try {
      el.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true }));
      el.dispatchEvent(opts("mousedown"));
      el.dispatchEvent(opts("mouseup"));
      el.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true }));
      return { ok: true, x: Math.round(x), y: Math.round(y) };
    } catch (e) { return { ok: false, err: String(e).slice(0, 100) }; }
  }).catch((e) => ({ ok: false, err: String(e && e.message || e).slice(0, 100) }));

  const layerPanelItems = () => page.evaluate(() => {
    const arr = [];
    document.querySelectorAll("ul li, [class*=layer] li, [class*=layer] div, [class*=tree] li").forEach((b) => {
      const t = (b.textContent || "").trim(); if (t && t.length <= 40) arr.push(t.slice(0, 30));
    });
    return arr.slice(0, 60);
  }).catch(() => []);

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
    while (Date.now() < deadline) {
      rd = await ready();
      if (rd && rd.ok && rd.objs > 0) break;
      await page.waitForTimeout(2000);
    }
    step("editor-ready", !!(rd && rd.ok && rd.objs > 0), JSON.stringify(rd));
    if (!(rd && rd.ok)) throw new Error("editor not ready: " + JSON.stringify(rd));

    const m = await moduleDump();
    step("module-exports", true, JSON.stringify(m).slice(0, 3400));
    const base = await snapshot();
    step("base-count", true, JSON.stringify(base));

    const hook = await fireHooks();
    step("hooks", !!(hook && hook.ok), JSON.stringify(hook).slice(0, 200));

    const tabClick = await clickKeyword(["文字", "文本"]);
    step("click-text-tab", tabClick.clicked, JSON.stringify(tabClick).slice(0, 160));
    await page.waitForTimeout(800);
    const addBtn = await clickKeyword(["添加文字"]);
    step("click-addText", addBtn.clicked, JSON.stringify(addBtn).slice(0, 160));
    await page.waitForTimeout(600);
    const cc = await canvasCenterClick();
    step("canvas-center-click", cc.ok, JSON.stringify(cc).slice(0, 160));
    await page.waitForTimeout(1500);
    const afterNative = await snapshot();
    step("after-native-add", !!(afterNative && afterNative.objCount > base.objCount), "before=" + base.objCount + " after=" + (afterNative ? afterNative.objCount : 0) + " typeCount=" + JSON.stringify(afterNative && afterNative.typeCount));
    const idNative = await identityDump();
    step("native-text-identity", true, JSON.stringify(idNative).slice(0, 3000));

    const beforeUndo = await snapshot();
    const u1 = await clickKeyword(["撤销", "undo"]);
    step("click-undo", u1.clicked, JSON.stringify(u1).slice(0, 160));
    await page.waitForTimeout(1400);
    const afterU = await snapshot();
    step("after-undo", true, "before=" + (beforeUndo ? beforeUndo.objCount : 0) + " after=" + (afterU ? afterU.objCount : 0) + " typeCount=" + JSON.stringify(afterU && afterU.typeCount));
    const idU = await identityDump();
    step("undo-identity", true, JSON.stringify(idU).slice(0, 2600));

    const r1 = await clickKeyword(["重做", "redo"]);
    step("click-redo", r1.clicked, JSON.stringify(r1).slice(0, 160));
    await page.waitForTimeout(1400);
    const afterR = await snapshot();
    step("after-redo", true, "after=" + (afterR ? afterR.objCount : 0) + " (expect " + (beforeUndo ? beforeUndo.objCount : 0) + ")");
    const idR = await identityDump();
    step("redo-identity", true, JSON.stringify(idR).slice(0, 2600));

    const lpTab = await clickKeyword(["图层", "layers"]);
    step("layer-tab", lpTab.clicked, JSON.stringify(lpTab).slice(0, 120));
    await page.waitForTimeout(700);
    const lp = await layerPanelItems();
    step("layer-panel-items", true, JSON.stringify(lp).slice(0, 1400));

    const log = await readLog();
    step("audit-log", true, log.map((l) => l.m + " | " + l.x).join("\n").slice(0, 3400));
    report.finalCount = afterR ? afterR.objCount : null;
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.stack || e).slice(0, 600));
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1));
    console.log("audit3 report -> " + REPORT_PATH);
    console.log("steps: " + report.steps.length + ", errors: " + report.errors.length);
    report.steps.forEach((s) => console.log("  [" + s.ok + "] " + s.name + " :: " + String(s.detail).replace(/\n/g, " ").slice(0, 220)));
  }
})();