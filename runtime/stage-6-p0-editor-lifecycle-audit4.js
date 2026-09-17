// runtime/stage-6-p0-editor-lifecycle-audit4.js — Stage 6 P0 审计 R4（API 全貌：CanvasObjVO / CommandManager 未过滤导出）
// 目标：找到编辑器原生「新增文字 + 注册 + 历史」的真实入口：
//   1. CanvasObjVO 实例全部 50 keys（方法/属性）
//   2. SimpleCommandManager.getSingleton()/getInstance() 导出全貌 + Undo 全貌
//   3. totalCanvasArray[0] 全部 keys → 图层/列表数组
//   4. 点「添加文字」后模态框探测（确认是否需要输入/确认流程）
//   5. 当前画布实例挂载的 undo/redo/addText/command 函数
// 输出：runtime/reports/stage-6-p0-lifecycle-audit4.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-6-p0-lifecycle-audit4.json");

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-6-P0-EDITOR-LIFECYCLE-AUDIT-R4", steps: [], errors: [] };
  const step = (n, ok, d) => { report.steps.push({ name: n, ok: ok ? "PASS" : "INFO", detail: String(d || "").slice(0, 3400) }); if (!ok) report.errors.push(n); };
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

  const dumpApi = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const defs = ctx && ctx.defined ? ctx.defined : {};
    const head = (fn) => { try { return fn.toString().replace(/\s+/g, " ").slice(0, 140); } catch (e) { return "?"; } };
    const dumpModule = (n) => {
      const e = defs[n];
      if (!e) return "UNDEFINED";
      if (typeof e === "function") {
        const out = { fhead: head(e) };
        if (e.prototype) {
          out.proto = {};
          Object.keys(e.prototype).forEach((k) => { const v = e.prototype[k]; if (typeof v === "function") out.proto[k] = head(v); });
          out.protoKeys = Object.keys(e.prototype).length;
        }
        Object.keys(e).forEach((k) => { const v = e[k]; if (typeof v === "function") out["static_" + k] = head(v); });
        return out;
      }
      if (typeof e === "object") {
        const out = { keys: Object.keys(e).slice(0, 120) };
        out.fns = {};
        Object.keys(e).forEach((k) => { const v = e[k]; if (typeof v === "function") out.fns[k] = head(v); });
        return out;
      }
      return { scalar: String(e).slice(0, 60) };
    };
    const vo = defs["CanvasObjVO"] || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    const voKeys = vo ? Object.keys(vo) : [];
    const voFns = {};
    if (vo) Object.keys(vo).forEach((k) => { const v = vo[k]; if (typeof v === "function") voFns[k] = head(v); });
    const idx0 = (Array.isArray(total) && total[0]) || null;
    const cFns = {};
    if (c) Object.keys(c).forEach((k) => { const v = c[k]; if (/undo|redo|history|command|add|text/i.test(k) && typeof v === "function") cFns[k] = head(v); });
    const winFns = {};
    if (typeof window !== "undefined") Object.getOwnPropertyNames(window).forEach((k) => { if (/^((undo|redo|history|command|addText|addObj|layer)[A-Za-z]*)$/i.test(k) && typeof window[k] === "function") winFns[k] = head(window[k]); });
    return {
      simpleCommandManager: dumpModule("SimpleCommandManager"),
      undo: dumpModule("Undo"),
      iCommand: dumpModule("ICommand"),
      canvasObjVOkeys: voKeys.slice(0, 120),
      canvasObjVOfns: voFns,
      totalIndex0Keys: idx0 ? Object.keys(idx0) : [],
      canvasInstanceFns: cFns,
      windowGlobals: winFns,
      layerLikeModules: Object.keys(defs).filter((n) => /layer|undo|redo|history|command|stack/i.test(n))
    };
  }).catch((e) => ({ err: String(e) }));

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

  const probeModals = () => page.evaluate(() => {
    const out = [];
    document.querySelectorAll("input, textarea, [class*=dialog], [class*=modal], [class*=popup], [class*=layui-layer], [style*='display: block'], [class*=window]").forEach((b) => {
      const cls = String(b.className || "");
      const visible = b.offsetParent !== null;
      if (visible) out.push({ tag: b.tagName, cls: cls.slice(0, 50), ph: (b.getAttribute("placeholder") || "").slice(0, 20), val: String(b.value || "").slice(0, 14) });
    });
    return out.slice(0, 40);
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
    while (Date.now() < deadline) { rd = await ready(); if (rd && rd.ok && rd.objs > 0) break; await page.waitForTimeout(2000); }
    step("editor-ready", !!(rd && rd.ok), JSON.stringify(rd));
    if (!(rd && rd.ok)) throw new Error("not ready");

    const api = await dumpApi();
    step("api-full", true, JSON.stringify(api).slice(0, 3400));

    // 点「添加文字」→ 探测模态框/输入
    await clickKeyword(["文字", "文本"]);
    await page.waitForTimeout(700);
    const ab = await clickKeyword(["添加文字"]);
    step("click-addText", ab.clicked, JSON.stringify(ab).slice(0, 160));
    await page.waitForTimeout(900);
    const modals = await probeModals();
    step("after-addText-modals", true, JSON.stringify(modals).slice(0, 1400));
    const modals2 = await probeModals();
    report.modalsAfter = modals2;
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.stack || e).slice(0, 600));
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1));
    console.log("audit4 report -> " + REPORT_PATH);
    report.steps.forEach((s) => console.log("  [" + s.ok + "] " + s.name + " :: " + String(s.detail).replace(/\n/g, " ").slice(0, 260)));
  }
})();