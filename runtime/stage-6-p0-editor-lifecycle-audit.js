// runtime/stage-6-p0-editor-lifecycle-audit.js — Stage 6 P0（用户强制补充 §2026-09-17）：
// 真机刻画 252438 折立印编辑器「新增文字 → 图层注册 → 历史 → Undo/Redo」原生生命周期。
// 目的（禁止猜测，必须真机逆向）：
//   A. 枚举 requirejs 定义模块（text/canvas/history/undo/redo/layer/command/snapshot）
//   B. CanvasObjVO 结构（totalCanvasArray[index] 的 key、layer/数组）
//   C. 原生「文字」按钮 → 创建 textbox → 观察》对象 identity 字段（uuid/markuuid/layerNum/mediaMediaType/locationX...）
//   D. 原生「撤销/重做」按钮 → 观察 canvas.add/remove/loadFromJSON 是否触发、对象数组如何恢复
//   E. 复现 OCR 创建路径（ref-clone textbox）→ 原生 undo 响应（验证用户报告的「撤回异常」）
// 输出：runtime/reports/stage-6-p0-lifecycle-audit.json + 控制台证据
// 说明：不安装 userscript，只在页面主世界（page.evaluate）直接与编辑器运行时对话。
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-6-p0-lifecycle-audit.json");

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-6-P0-EDITOR-LIFECYCLE-AUDIT", steps: [], errors: [] };
  const step = (n, ok, d) => { report.steps.push({ name: n, ok: ok ? "PASS" : "INFO", detail: String(d || "").slice(0, 2500) }); if (!ok) report.errors.push(n); };
  let browser = null;
  let page = null;

  // ---- 主世界快照：模块/画布结构/对象 identity/按钮候选 ----
  const snapshot = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const defined = (ctx && ctx.defined) ? Object.keys(ctx.defined) : [];
    const kw = defined.filter((n) => /text|canvas|history|undo|redo|layer|objvo|command|snapshot|design|state|action|fabric/i.test(n)).sort();
    const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    const objs = c ? c.getObjects() : [];
    const identityKeys = (o) => Object.keys(o).filter((k) => /uuid|mark|layer|media|location|isDesign|isEdit|isLineText|rotation|fontSize|history|dirty|state/i.test(k)).slice(0, 40);
    const objsInfo = objs.slice(0, 16).map((o) => {
      const k = identityKeys(o);
      const picked = {};
      ["markuuid", "uuid", "layerNum", "mediaMediaType", "locationX", "locationY", "locationWidth", "locationHeight", "isDesign", "isEdit", "isLineText", "fontSize", "type"].forEach((f) => { if (o[f] !== undefined) picked[f] = o[f]; });
      return { type: o.type, text: String(o.text || "").slice(0, 14), identityKeys: k.length, picked: picked, ownKeys: Object.keys(o).length };
    });
    const typeCount = {};
    objs.forEach((o) => { typeCount[o.type || "?"] = (typeCount[o.type || "?"] || 0) + 1; });
    // 按钮候选：title 优先，文本严格相等优先
    const btnCandidates = [];
    document.querySelectorAll("button, [role=button], [class*=btn], [class*=icon], li, a, span, div").forEach((b) => {
      const text = (b.textContent || "").trim();
      const title = b.title || "";
      const cls = String(b.className || "");
      const aria = b.getAttribute("aria-label") || "";
      if (title || (text && text.length <= 6) || aria) {
        btnCandidates.push({ tag: b.tagName, text: text.slice(0, 10), title: title.slice(0, 14), aria: aria.slice(0, 14), cls: cls.slice(0, 50), id: b.id || "" });
      }
    });
    const protoChain = (obj) => { const out = []; let p = obj; while (p) { out.push(p.constructor && p.constructor.name || "?"); p = Object.getPrototypeOf(p); } return out.slice(0, 8); };
    const idx0 = (Array.isArray(total) && total[0]) ? total[0] : null;
    const idx0LayerKeys = idx0 ? Object.keys(idx0).filter((k) => /layer|array|obj|text|canvas/i.test(k)).slice(0, 40) : [];
    return {
      ready: !!(ctx && ctx.defined && ctx.defined.CanvasObjVO),
      moduleTotal: defined.length,
      keywords: kw,
      voIndex0AllKeys: idx0 ? Object.keys(idx0) : [],
      voIndex0LayerKeys: idx0LayerKeys,
      hasCanvas: !!c,
      objCount: objs.length,
      typeCount: typeCount,
      objsInfo: objsInfo,
      btnCandidates: btnCandidates.slice(0, 120),
      windowFabricType: typeof window.fabric,
      canvasCtorChain: c ? protoChain(c) : [],
      fabricModules: defined.filter((n) => /fabric/i.test(n)).slice(0, 30)
    };
  }).catch((e) => { report.errors.push("snapshot eval: " + e); return null; });

  // ---- 埋点：canvas.add / remove / loadFromJSON / undo与redo（若存在） ----
  const fireHooks = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    if (!c) return { ok: false };
    const fabric = c.constructor && c.constructor.fabric;
    window.__auditLog = [];
    const log = (m, extra) => { window.__auditLog.push({ ts: Date.now(), m: m, extra: String(extra || "").slice(0, 600) }); };
    if (!window.__auditPatched) {
      window.__auditPatched = true;
      const cls = fabric && fabric.Canvas;
      if (cls && cls.prototype) {
        const add = cls.prototype.add;
        if (add && !add.__zyAudit) { cls.prototype.add = function () { const r = add.apply(this, arguments); const ob = arguments[0]; log("add", (ob && ol(ob))); if (ob && ob.type === "textbox") { setTimeout(() => { window.__auditLog.push({ ts: Date.now(), m: "add-post-800ms", extra: identityDump(ob).slice(0, 1600) }); }, 800); } return r; }; cls.prototype.add.__zyAudit = true; }
        const rm = cls.prototype.remove;
        if (rm && !rm.__zyAudit) { cls.prototype.remove = function () { log("remove", (arguments[0] && ol(arguments[0]))); return rm.apply(this, arguments); }; cls.prototype.remove.__zyAudit = true; }
        const lj = cls.prototype.loadFromJSON;
        if (lj && !lj.__zyAudit) { cls.prototype.loadFromJSON = function () { log("loadFromJSON", null); return lj.apply(this, arguments); }; cls.prototype.loadFromJSON.__zyAudit = true; }
        ["undo", "redo", "historyUndo", "historyRedo", "undoHistory", "redoHistory"].forEach((fn) => {
          if (typeof cls.prototype[fn] === "function" && !cls.prototype[fn].__zyAudit) {
            const orig = cls.prototype[fn];
            cls.prototype[fn] = function () { log("canvas." + fn, null); return orig.apply(this, arguments); };
            cls.prototype[fn].__zyAudit = true;
          }
        });
      }
      // 编辑器自己的 undo/redo/history 函数（requirejs 模块级或挂 canvas 实例）
      const instanceFns = [];
      ["historyUndo", "historyRedo", "undo", "redo", "setHistory", "saveHistory", "go"].forEach((fn) => {
        if (typeof c[fn] === "function") instanceFns.push(fn);
      });
      log("instance-fns", JSON.stringify(instanceFns));
      function ol(o) { return "type=" + (o && o.type) + " text=" + String((o && o.text) || "").slice(0, 14) + " ownKeys=" + (o ? Object.keys(o).length : 0); }
      function identityDump(o) { const k = Object.keys(o).filter((x) => /uuid|mark|layer|media|location|isDesign|isEdit|isLineText|fontSize|history|state/i.test(x)); const p = {}; k.slice(0, 40).forEach((x) => { const v = o[x]; p[x] = (typeof v === "object" && v !== null) ? "[obj]" : v; }); return JSON.stringify(p); }
      window.__zyIdentityDump = identityDump;
      return { ok: true, patched: true };
    }
    return { ok: true, patched: false };
  }).catch((e) => ({ ok: false, err: String(e) }));

  const readLog = () => page.evaluate(() => (window.__auditLog || []).slice(-120)).catch(() => []);
  const dumpIdentity = (filter) => page.evaluate((flt) => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    if (!c) return null;
    const objs = c.getObjects();
    const list = objs.map((o, i) => ({ i: i, type: o.type, text: String(o.text || "").slice(0, 16), dump: window.__zyIdentityDump ? window.__zyIdentityDump(o) : "" })).slice(-20);
    return { objCount: objs.length, list: list };
  }, filter).catch(() => null);

  // 按关键词点击（title/aria/text/class 命中；text 严格相等优先级最高）
  const clickByKeyword = (keywords) => page.evaluate((kws) => {
    const all = Array.from(document.querySelectorAll("button, [role=button], [class*=btn], [class*=icon], li, a, span, div"));
    const score = (b) => {
      const t = (b.textContent || "").trim();
      const title = b.title || "";
      const aria = b.getAttribute("aria-label") || "";
      const cls = String(b.className || "");
      if (t === kws[0]) return 100;                    // 文本严格相等（如「文字」「撤销」）
      if (title === kws[0] || aria === kws[0]) return 90;
      if (kws.some((k) => t.indexOf(k) === 0 || (title && title.indexOf(k) >= 0) || (aria && aria.indexOf(k) >= 0))) return 60;
      if (kws.some((k) => cls.indexOf(k) >= 0)) return 30;
      return 0;
    };
    let best = null, bs = 0;
    all.forEach((b) => { const s = score(b); if (s > bs) { bs = s; best = b; } });
    if (!best || bs <= 0) return { clicked: false, best: bs };
    best.click();
    return { clicked: true, tag: best.tagName, text: (best.textContent || "").trim().slice(0, 10), title: best.title || "", cls: String(best.className || "").slice(0, 50), score: bs };
  }, keywords).catch((e) => ({ clicked: false, err: String(e && e.message || e).slice(0, 80) }));

  // ---- 复现 OCR 创建路径（ref-clone textbox，与 page-bridge ocrCreate 相同手法）----
  const createLikeOcr = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    if (!c) return { ok: false, err: "no canvas" };
    // 找文字类：1) 已有文字对象克隆 2) fabric.Textbox 3) 编辑器自研 text 类（requirejs 提供）
    const ref = c.getObjects().find((o) => typeof o.text === "string" && o.text) || null;
    let obj = null;
    let via = "clone";
    if (ref && ref.constructor) {
      try { obj = new ref.constructor("OCR回归测试文字", { left: 90, top: 90, width: 220, fontSize: 20, fill: "#000000", editable: true }); } catch (e) { obj = null; }
    }
    if (!obj) {
      // fabric 类：隔离世界/页面世界都可能存在
      const fabric = window.fabric || (c.constructor && c.constructor.fabric) || (c.context && c.context.canvas && null) || null;
      if (fabric && fabric.Textbox) { obj = new fabric.Textbox("OCR回归测试文字", { left: 90, top: 90, width: 220, fontSize: 20 }); via = "fabric.Textbox"; }
    }
    if (!obj) {
      // 编辑器自研文字类：在 CanvasObjVO 定义模块里找 Text 构造
      const defs = ctx && ctx.defined;
      const candidates = defs ? Object.keys(defs).filter((n) => /text/i.test(n)) : [];
      obj = null;
      for (let i = 0; i < candidates.length && !obj; i += 1) {
        let exp = null;
        try { exp = ctx.defined[candidates[i]]; } catch (e) {}
        if (exp && typeof exp === "function") {
          try { obj = new exp("OCR回归测试文字", { left: 90, top: 90, width: 220, fontSize: 20 }); via = "module:" + candidates[i]; } catch (e) { obj = null; }
        } else if (exp && exp.Textbox) {
          try { obj = new exp.Textbox("OCR回归测试文字", { left: 90, top: 90, width: 220, fontSize: 20 }); via = "module.Textbox:" + candidates[i]; } catch (e) { obj = null; }
        }
      }
    }
    if (!obj) return { ok: false, err: "no text class", fabricType: typeof window.fabric, canvasKeys: Object.keys(c).length };
    c.add(obj);
    if (c.requestRenderAll) c.requestRenderAll();
    return { ok: true, via: via, objType: obj.type, ctorChain: (function (o) { const out = []; let p = o; while (p) { out.push(p.constructor && p.constructor.name || "?"); p = Object.getPrototypeOf(p); } return out.slice(0, 6); })(obj) };
  }).catch((e) => ({ ok: false, err: String(e && e.stack || e).slice(0, 300) }));

  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    page = browser.pages()[0];
    page.on("console", (msg) => { const t = String(msg.text()); if (/zy-|audit/i.test(t)) report.consoleLogs = (report.consoleLogs || []).concat(t.slice(0, 300)).slice(-40); });
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});

    const deadline = Date.now() + 150000;
    let s0 = null;
    while (Date.now() < deadline) {
      s0 = await snapshot();
      if (s0 && s0.ready && s0.hasCanvas) break;
      await page.waitForTimeout(2000);
    }
    step("editor-ready", !!(s0 && s0.ready && s0.hasCanvas), "modules=" + (s0 && s0.moduleTotal) + " objs=" + (s0 && s0.objCount));
    if (!s0 || !s0.ready || !s0.hasCanvas) throw new Error("editor not ready");

    step("modules-by-keyword", true, (s0.keywords || []).join(", "));
    step("canvasobjvo-structure", true, "voKeys=" + s0.voKeyTotal + " index0Keys=" + JSON.stringify(s0.voIndex0Keys) + " fabricVersion=" + s0.fabricVersion);
    step("initial-objects", true, JSON.stringify(s0.objsInfo));
    step("native-buttons-candidates", true, JSON.stringify(s0.btnCandidates));

    const hook = await fireHooks();
    step("hooks-mounted", !!(hook && hook.ok), JSON.stringify(hook).slice(0, 300));

    // ---- 原生「文字」按钮 ----
    const addTxt = await clickByKeyword(["文字", "文本", "addText", "text"]);
    step("click-native-add-text", addTxt.clicked, JSON.stringify(addTxt).slice(0, 300));
    await page.waitForTimeout(1800);
    const s1 = await snapshot();
    step("after-native-add-objects", !!(s1 && s1.objCount > (s0 ? s0.objCount : 0)), "before=" + (s0 ? s0.objCount : 0) + " after=" + (s1 ? s1.objCount : 0) + " typeCount=" + JSON.stringify((s1 || {}).typeCount) + " " + JSON.stringify((s1 || {}).objsInfo));
    const p1 = await dumpIdentity();
    step("after-native-add-identity", true, JSON.stringify(p1));

    // ---- 原生「撤销」----
    const undoClick = await clickByKeyword(["撤销", "undo", "Undo"]);
    step("click-native-undo", undoClick.clicked, JSON.stringify(undoClick).slice(0, 300));
    await page.waitForTimeout(1200);
    const s2 = await snapshot();
    step("after-native-undo", !!(s2 && s2.objCount === (s0 ? s0.objCount : null)), "before-undo=" + (s1 ? s1.objCount : 0) + " after-undo=" + (s2 ? s2.objCount : 0) + " expected=" + (s0 ? s0.objCount : 0) + " typeCount=" + JSON.stringify((s2 || {}).typeCount));

    // ---- 原生「重做」----
    const redoClick = await clickByKeyword(["重做", "redo", "Redo"]);
    step("click-native-redo", redoClick.clicked, JSON.stringify(redoClick).slice(0, 300));
    await page.waitForTimeout(1200);
    const s3 = await snapshot();
    step("after-native-redo", !!(s3 && s3.objCount > (s2 ? s2.objCount : 0)), "after-redo=" + (s3 ? s3.objCount : 0) + " expect=" + (s1 ? s1.objCount : 0) + " typeCount=" + JSON.stringify((s3 || {}).typeCount));

    // ---- 复现 OCR 创建路径 ----
    const beforeOcr = await snapshot();
    const beforeOcrCount = beforeOcr ? beforeOcr.objCount : 0;
    const ocr = await createLikeOcr();
    step("repro-ocr-create", !!(ocr && ocr.ok), JSON.stringify(ocr).slice(0, 300));
    await page.waitForTimeout(800);
    const pOcr = await dumpIdentity();
    step("repro-ocr-identity", true, JSON.stringify(pOcr));
    // 原生 undo 对 OCR 对象的响应
    const undo2 = await clickByKeyword(["撤销", "undo", "Undo"]);
    await page.waitForTimeout(1200);
    const afterUndoOcr = await dumpIdentity();
    step("repro-ocr-then-undo", true, "before=" + beforeOcrCount + " after=" + (afterUndoOcr ? afterUndoOcr.objCount : "n/a") + " " + JSON.stringify(afterUndoOcr));
    // 再撤销一次（看是否继续回退或状态异常）
    const undo3 = await clickByKeyword(["撤销", "undo", "Undo"]);
    await page.waitForTimeout(1200);
    const afterUndo2 = await dumpIdentity();
    step("repro-ocr-undo-again", true, "after2=" + (afterUndo2 ? afterUndo2.objCount : "n/a") + " " + JSON.stringify(afterUndo2));

    const log = await readLog();
    step("audit-log", true, log.slice(0, 60).map((l) => "[" + l.m + "] " + l.extra).join("\n"));
    report.baseline = { objCount: s0 && s0.objCount };
    report.finalObjCount = afterUndo2 ? afterUndo2.objCount : null;
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.stack || e).slice(0, 600));
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1));
    console.log("audit report -> " + REPORT_PATH);
    console.log("steps: " + report.steps.length + ", errors: " + report.errors.length);
    report.steps.forEach((s) => console.log("  [" + s.ok + "] " + s.name + " :: " + String(s.detail).slice(0, 180)));
  }
})();