// runtime/stage-6-p0-editor-lifecycle-audit11.js — Stage 6 P0 审计 R11（最终试探：拖拽素材/精确上画布点击/CanvasToolBar 文案方法 + sundry.guid）
// 若仍无法原生落字，则审计结论固化：原生放置在自动化代理不可复现，改为文档化 + 安全第一修复步。
// 输出：runtime/reports/stage-6-p0-lifecycle-audit11.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-6-p0-lifecycle-audit11.json");

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-6-P0-EDITOR-LIFECYCLE-AUDIT-R11", steps: [], errors: [] };
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

  const info = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const defs = ctx && ctx.defined ? ctx.defined : {};
    const vo = defs["CanvasObjVO"] || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    const objs = c ? c.getObjects() : [];
    const typeCount = {};
    objs.forEach((o) => { typeCount[o.type || "?"] = (typeCount[o.type || "?"] || 0) + 1; });
    const sundry = defs["sundry"];
    const out = { objs: objs.length, typeCount: typeCount };
    if (sundry && typeof sundry.guid === "function") { try { const g0 = sundry.guid(); const g1 = sundry.guid(); out.guid0 = String(g0); out.guid1 = String(g1); out.guidIsV4 = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(String(g1)); } catch (e) { out.guidErr = String(e); } }
    const ctb = defs["CanvasToolBar"];
    if (ctb && ctb.prototype) {
      out.ctbTextLike = Object.getOwnPropertyNames(ctb.prototype).filter((k) => /text|add|create|insert|txt|obj/i.test(k)).slice(0, 60);
      out.ctbSub = {};
      Object.getOwnPropertyNames(ctb.prototype).filter((k) => /text|add|create|insert|txt|obj/i.test(k)).slice(0, 20).forEach((k) => { try { out.ctbSub[k] = ctb.prototype[k].toString().replace(/\s+/g, " ").slice(0, 160); } catch (e) {} });
    }
    const ccv = defs["CurrentCanvas"];
    if (ccv && ccv.prototype) out.ccvProto = Object.getOwnPropertyNames(ccv.prototype).slice(0, 60);
    return out;
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

  const upperCanvasRect = () => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    if (!c || !c.upperCanvasEl) return null;
    const r = c.upperCanvasEl.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) };
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
    const inf = await info();
    step("info", true, JSON.stringify(inf).slice(0, 3600));

    // 方案A：普通文本 → upper canvas 中心点击
    const c1 = await clickKeyword(["普通文本", "普通文本"]);
    step("click-normal-text", c1.clicked, JSON.stringify(c1).slice(0, 160));
    await page.waitForTimeout(800);
    const r1 = await upperCanvasRect();
    step("upper-canvas-rect", !!r1, JSON.stringify(r1));
    if (r1) { await page.mouse.move(r1.x, r1.y); await page.mouse.click(r1.x, r1.y); }
    await page.waitForTimeout(1800);
    const sA = await info();
    step("after-approach-A", !!(sA && sA.objs > rd.objs), "before=" + rd.objs + " after=" + (sA ? sA.objs : 0) + " type=" + JSON.stringify(sA && sA.typeCount));

    // 方案B：双击左侧素材元素模拟"放置"（部分编辑器双击即插入）
    if (!(sA && sA.objs > rd.objs)) {
      const dbl = await page.evaluate(() => {
        const el = Array.from(document.querySelectorAll("li, div, span")).find((b) => (b.textContent || "").trim() === "普通文本");
        if (!el) return false;
        el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        return true;
      }).catch(() => false);
      step("dblclick-normal-text", dbl, "");
      await page.waitForTimeout(1800);
      const sB = await info();
      step("after-approach-B", !!(sB && sB.objs > rd.objs), "before=" + rd.objs + " after=" + (sB ? sB.objs : 0) + " type=" + JSON.stringify(sB && sB.typeCount));
    }

    // 方案C：工具栏「文字」→「添加文字」→ upper canvas 两次点击
    if (!(sA && sA.objs > rd.objs)) {
      await clickKeyword(["文字", "文本"]);
      await page.waitForTimeout(700);
      await clickKeyword(["添加文字"]);
      await page.waitForTimeout(700);
      const r2 = await upperCanvasRect();
      if (r2) { await page.mouse.move(r2.x, r2.y); await page.mouse.click(r2.x, r2.y); await page.waitForTimeout(900); await page.mouse.click(r2.x, r2.y); }
      await page.waitForTimeout(1600);
      const sC = await info();
      step("after-approach-C", !!(sC && sC.objs > rd.objs), "before=" + rd.objs + " after=" + (sC ? sC.objs : 0) + " type=" + JSON.stringify(sC && sC.typeCount));
    }
    const fin = await info();
    step("final", true, JSON.stringify(fin).slice(0, 1800));
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.stack || e).slice(0, 600));
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1));
    console.log("audit11 report -> " + REPORT_PATH);
    report.steps.forEach((s) => console.log("  [" + s.ok + "] " + s.name + " :: " + String(s.detail).replace(/\n/g, " ").slice(0, 300)));
  }
})();