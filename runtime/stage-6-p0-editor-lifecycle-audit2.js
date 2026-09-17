// runtime/stage-6-p0-editor-lifecycle-audit2.js — Stage 6 P0 审计 R2（深挖原生历史/命令/新建文字链路）
// 目标：
//   A. 导出 Undo / SimpleCommandManager / ICommand / CurrentCanvas / layer / DesignVO / CanvasToolBar 的
//      可观察 API（typeof / keys / 函数头）
//   B. 钩住画布原型链 add/remove/loadFromJSON + Undo/SimpleCommandManager 函数 → 记录原生新增文字与撤销重做调用
//   C. 原生「文字」标签 → 找到真正创建 textbox 的入口 → 生成 → 观察对象 identity（multiUuid/location*/media*/layerNum）
//   D. 原生 撤销 → 观察对象数量/身份/undo 模块调用 → 重做 → 观察恢复
//   E. 图层面板可见性
// 输出：runtime/reports/stage-6-p0-lifecycle-audit2.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-6-p0-lifecycle-audit2.json");

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-6-P0-EDITOR-LIFECYCLE-AUDIT-R2", steps: [], errors: [] };
  const step = (n, ok, d) => { report.steps.push({ name: n, ok: ok ? "PASS" : "INFO", detail: String(d || "").slice(0, 3200) }); if (!ok) report.errors.push(n); };
  let browser = null;
  let page = null;

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
    const KEYS = ["type", "text", "multiUuid", "markuuid", "uuid", "layerNum", "mediaMediaType", "locationX", "locationY", "locationWidth", "locationHeight", "locationRotation", "printLocationX", "printLocationY", "printLocationWidth", "printLocationHeight", "printLocationRotation", "isDesign", "isEdit", "fontSize", "fontFamily"];
    return {
      objCount: c.getObjects().length,
      list: c.getObjects().map((o, i) => {
        const p = {};
        KEYS.forEach((k) => { if (o[k] !== undefined) { const v = o[k]; p[k] = (typeof v === "object" && v !== null) ? "[o]" : v; } });
        return { i: i, p: p };
      }).slice(-16)
    };
  }).catch((e) => ({ objCount: 0, list: [], err: String(e) }));

  const moduleDump = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const defs = (ctx && ctx.defined) || {};
    const names = ["Undo", "SimpleCommandManager", "ICommand", "CurrentCanvas", "layer", "DesignVO", "CanvasToolBar", "TextPropPanel", "CanvasObjVO", "CanvasDiy"];
    const out = {};
    names.forEach((n) => {
      const e = defs[n];
      if (!e) { out[n] = "UNDEFINED"; return; }
      const props = {};
      if (typeof e === "object" || typeof e === "function") {
        Object.keys(e).slice(0, 40).forEach((k) => { const v = e[k]; if (typeof v === "function" || (k.indexOf("history") >= 0) || (k.indexOf("undo") >= 0) || (k.indexOf("redo") >= 0) || (k.indexOf("command") >= 0) || (k.indexOf("stack") >= 0)) props[k] = typeof v; });
      }
      if (typeof e === "function") {
        try { props.__fnHead = e.toString().slice(0, 200); } catch (err) {}
        const proto = e.prototype;
        if (proto) { const pm = {}; Object.keys(proto).slice(0, 40).forEach((k) => { const v = proto[k]; if (typeof v === "function") pm[k] = v.toString().slice(0, 120); }); props.__protoMethods = pm; }
      } else if (typeof e === "object") {
        try { props.__head = JSON.stringify(e).slice(0, 200); } catch (err) {}
      }
      out[n] = { typeof_: typeof e, props: props };
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
    if (window.__zA2) return { ok: true, patched: false };
    window.__zA2 = true;
    window.__zLog2 = [];
    const log = (m, x) => window.__zLog2.push({ ts: Date.now(), m: m, x: String(x || "").slice(0, 400) });
    const patchProto = (proto, label) => {
      if (!proto) return;
      ["add", "remove", "loadFromJSON"].forEach((fn) => {
        if (typeof proto[fn] === "function" && !proto[fn].__zA2) {
          const orig = proto[fn];
          proto[fn] = function () {
            const ob = arguments[0];
            log(fn + "@" + label, ob ? ("type=" + ob.type + " ownKeys=" + Object.keys(ob).length + " text=" + String(ob.text || "").slice(0, 10)) : "");
            const r = orig.apply(this, arguments);
            if (fn === "add" && ob) {
              setTimeout(() => { const k = Object.keys(ob).filter((x) => /multiUuid|markuuid|location|media|layerNum|print|postL/i.test(x)); log("add-post@", ob.type + " keys=" + JSON.stringify(k)); }, 700);
            }
            return r;
          };
          proto[fn].__zA2 = true;
        }
      });
    };
    // 实例原型链 + window.fabric + 编辑器 canvas 类的原型
    const seen = new Set();
    let p = c;
    let depth = 0;
    while (p && depth < 12) {
      if (p.constructor && p.constructor.prototype && !seen.has(p.constructor.prototype)) { seen.add(p.constructor.prototype); patchProto(p.constructor.prototype, p.constructor.name || String(depth)); }
      p = Object.getPrototypeOf(p); depth += 1;
    }
    if (window.fabric && window.fabric.Canvas && !seen.has(window.fabric.Canvas.prototype)) { seen.add(window.fabric.Canvas.prototype); patchProto(window.fabric.Canvas.prototype, "fabric.Canvas"); }
    // Undo / SimpleCommandManager 函数包装（记录撤销重做调用）
    const defs = ctx && ctx.defined ? ctx.defined : {};
    ["Undo", "SimpleCommandManager"].forEach((n) => {
      const e = defs[n];
      if (!e) return;
      const wrapFn = (fn, name, path) => {
        if (typeof fn !== "function" || fn.__zA2) return;
        fn.__zA2 = true;
        return function () { log("mod." + path, name); return fn.apply(this, arguments); };
      };
      try {
        if (typeof e === "function") {
          const proto = e.prototype;
          if (proto) Object.keys(proto).forEach((k) => { if (typeof proto[k] === "function") proto[k] = wrapFn(proto[k], k, n + "." + k); });
          Object.keys(e).forEach((k) => { if (typeof e[k] === "function") e[k] = wrapFn(e[k], k, n + "." + k); });
        } else if (typeof e === "object") {
          Object.keys(e).forEach((k) => { if (typeof e[k] === "function") e[k] = wrapFn(e[k], k, n + "." + k); });
        }
      } catch (err) { log("wrap-err", n + " " + String(err).slice(0, 100)); }
    });
    return { ok: true, patched: true, chainDepth: depth };
  }).catch((e) => ({ ok: false, err: String(e) }));

  const readLog = () => page.evaluate(() => (window.__zLog2 || []).slice(-160)).catch(() => []);
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

  // 遍历按下「文字」标签后出现的可点击元素（文本预设/添加入口）
  const probeTextPaneItems = () => page.evaluate(() => {
    const items = [];
    document.querySelectorAll("li, span, div, a, button").forEach((b) => {
      const t = (b.textContent || "").trim();
      const cls = String(b.className || "");
      if (/文字|文本|添加|点击|双击|drag|拖/i.test(t) || /text|font|character|txt/i.test(cls)) {
        if (t && t.length <= 12) items.push({ tag: b.tagName, text: t, cls: cls.slice(0, 40), visible: !!(b.offsetParent !== null) });
      }
    });
    return items.slice(0, 80);
  }).catch((e) => []);

  const layerPanelProbe = () => page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll("span, li, a, div")).find((b) => b.textContent.trim() === "图层");
    if (tab) tab.click();
    return { clicked: !!tab };
  }).catch(() => ({ clicked: false }));

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
    let ready = false;
    while (Date.now() < deadline) {
      const s = await snapshot();
      if (s) { ready = true; break; }
      await page.waitForTimeout(2000);
    }
    step("editor-ready", !!ready, "objs=" + (await snapshot() || {}).objCount);
    if (!ready) throw new Error("editor not ready");

    const m = await moduleDump();
    step("module-exports", true, JSON.stringify(m, null, 0).slice(0, 3200));
    const hook = await fireHooks();
    step("hooks", !!(hook && hook.ok), JSON.stringify(hook).slice(0, 200));

    // 原生「文字」标签 → 观察出现的新入口
    const tabClick = await clickKeyword(["文字", "文本"]);
    step("click-text-tab", tabClick.clicked, JSON.stringify(tabClick).slice(0, 200));
    await page.waitForTimeout(900);
    const pane = await probeTextPaneItems();
    step("text-pane-items", true, JSON.stringify(pane).slice(0, 1600));

    // 尝试创建：先试「添加文字/双击/点击文字」类入口；再逐个尝试短文本项
    let created = false;
    const attempts = [["添加文字"], ["点击添加文字"], ["双击添加"]];
    for (const k of attempts) {
      const r = await clickKeyword(k);
      if (r.clicked) { step("try-create:" + k[0], true, JSON.stringify(r).slice(0, 160)); await page.waitForTimeout(1200); const s = await snapshot(); if (s && s.objCount > 9) { created = true; step("create-by-entry", true, JSON.stringify(s)); break; } else { step("create-by-entry:" + k[0], false, "objCount unchanged " + JSON.stringify(s)); } }
    }
    if (!created) {
      for (const it of pane) {
        if (!/文字|文本|添加|双击|点击/i.test(it.text)) continue;
        const r = await clickKeyword([it.text]);
        await page.waitForTimeout(1000);
        const s = await snapshot();
        if (s && s.objCount > 9) { step("create-by-item", true, "item=" + it.text + " " + JSON.stringify(s)); created = true; break; }
      }
    }
    step("native-text-created", created, "created=" + created);
    const idNative = await identityDump();
    step("native-text-identity", true, JSON.stringify(idNative).slice(0, 3000));
    const baseCount = (await snapshot() || {}).objCount || 0;

    // 原生撤销
    const u1 = await clickKeyword(["撤销", "undo"]);
    step("click-undo-native", u1.clicked, JSON.stringify(u1).slice(0, 160));
    await page.waitForTimeout(1200);
    const afterU = await identityDump();
    step("after-undo-native", true, "count=" + afterU.objCount + " (base=" + baseCount + ") " + JSON.stringify(afterU).slice(0, 2400));
    // 重做
    const r1 = await clickKeyword(["重做", "redo"]);
    step("click-redo-native", r1.clicked, JSON.stringify(r1).slice(0, 160));
    await page.waitForTimeout(1200);
    const afterR = await identityDump();
    step("after-redo-native", true, "count=" + afterR.objCount + " (base=" + baseCount + ") " + JSON.stringify(afterR).slice(0, 2400));

    // 图层面板
    const lp = await layerPanelProbe();
    step("layer-panel-click", lp.clicked, JSON.stringify(lp).slice(0, 120));
    await page.waitForTimeout(800);
    const lpItems = await page.evaluate(() => {
      const arr = [];
      document.querySelectorAll("ul li, [class*=layer] li, [class*=Layer] li, [class*=layer] div, [class*=Layer] div").forEach((b) => {
        const t = (b.textContent || "").trim(); if (t && t.length <= 40) arr.push(t.slice(0, 30));
      });
      return arr.slice(0, 50);
    }).catch(() => []);
    step("layer-panel-items", true, JSON.stringify(lpItems).slice(0, 1200));

    const log = await readLog();
    step("audit-log", true, log.map((l) => l.m + " | " + l.x).join("\n").slice(0, 3200));

    const fin = await identityDump();
    report.finalObjCount = fin.objCount;
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.stack || e).slice(0, 600));
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1));
    console.log("audit2 report -> " + REPORT_PATH);
    console.log("steps: " + report.steps.length + ", errors: " + report.errors.length);
    report.steps.forEach((s) => console.log("  [" + s.ok + "] " + s.name + " :: " + String(s.detail).replace(/\n/g, " ").slice(0, 200)));
  }
})();