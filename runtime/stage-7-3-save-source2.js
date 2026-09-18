// runtime/stage-7-3-save-source2.js — t4 v5：requirejs 模块枚举 → toUrl → 抓保存/订单模块真实源码
// 目标文件：保存主逻辑（IfDiyOrderidExit / saveThirdUserDesign / getShopAndWangWangInfo / autosave K[0]）
// 输出：runtime/reports/stage-7-3-save-source2.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-7-3-save-source2.json");
const KEYWORDS = ["IfDiyOrderidExit", "saveThirdUserDesign", "getShopAndWangWangInfo", "saveThirdUser", "thirdOrderNo", "tbOrderNo", "workOrderNum", "saveProduct", "thirdDiyEdit", "designSave", "Orderid"];

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-7.3-SAVE-SOURCE2", url: EDITOR_URL, phases: {}, errors: [] };
  let browser = null;
  let page = null;
  let src = "";
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    page = browser.pages()[0];
    const readyEval = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = (vo && Array.isArray(vo.totalCanvasArray) && vo.totalCanvasArray[0]) || null;
      const c = d && (d.canvas || d);
      return { ok: !!(d && c && c.getObjects && typeof d.drawText === "function") };
    }).catch(() => ({ ok: false }));
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    let ok = false;
    const d1 = Date.now() + 150000;
    while (Date.now() < d1) { ok = await readyEval(); if (ok && ok.ok) break; await page.waitForTimeout(2000); }
    report.phases.ready = !!(ok && ok.ok);
    if (!ok) throw new Error("editor not ready after 150s");

    // ---- Phase 1: 枚举已定义模块 id → toUrl（候选：save/design/business/common/product/order）----
    report.phases.moduleCandidates = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const def = (req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined) || {};
      const ids = Object.keys(def);
      const interest = /save|design|business|product|order|third|common|head|index/i;
      const cand = ids.filter((id) => interest.test(id)).slice(0, 80).map((id) => {
        let url = null;
        try { url = req.toUrl ? req.toUrl(id) : null; } catch (e) {}
        return { id: id, url: url };
      });
      return { totalModules: ids.length, cand: cand };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // ---- Phase 2: 抓 candidate 源码片段 ----
    const urls = [];
    if (report.phases.moduleCandidates && report.phases.moduleCandidates.cand) {
      report.phases.moduleCandidates.cand.forEach((c) => { if (c.url && urls.indexOf(c.url) < 0) urls.push(c.url); });
    }
    report.phases.sources = await page.evaluate(async (p) => {
      const re = new RegExp(p.keywords.join("|"), "g");
      const out = [];
      let scanned = 0;
      for (const u of p.urls) {
        if (scanned >= 24) break;
        const rec = { url: u, status: null, hits: 0, snippets: [] };
        try {
          const ctrl = new AbortController();
          const to = setTimeout(() => ctrl.abort(), 10000);
          const r = await fetch(u, { signal: ctrl.signal });
          clearTimeout(to);
          rec.status = r.status;
          if (r.status !== 200) { out.push(rec); continue; }
          scanned += 1;
          const txt = await r.text();
          rec.len = txt.length;
          const seen = new Set();
          re.lastIndex = 0;
          let m;
          const localHit = [];
          while ((m = re.exec(txt)) !== null && localHit.length < 14) {
            const s = Math.max(0, m.index - 220);
            const e = Math.min(txt.length, m.index + m[0].length + 420);
            const seg = txt.slice(s, e);
            const key = m[0] + "|" + m.index;
            if (!seen.has(key)) { seen.add(key); localHit.push({ kw: m[0], idx: m.index, seg: seg }); }
          }
          rec.hits = localHit.length;
          const byKw = {};
          localHit.forEach((h) => { if (!byKw[h.kw]) byKw[h.kw] = h; });
          rec.snippets = Object.keys(byKw).slice(0, 6).map((k) => byKw[k]);
        } catch (e) { rec.err = String(e && e.message || e).slice(0, 120); }
        out.push(rec);
      }
      return out;
    }, { urls: urls, keywords: KEYWORDS }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.message || e).slice(0, 400));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log("STAGE-7.3-SAVE-SOURCE2 done -> " + REPORT_PATH);
  console.log("ready=" + report.phases.ready + " totalModules=" + (report.phases.moduleCandidates && report.phases.moduleCandidates.totalModules));
  const hits = (report.phases.sources || []).filter((s) => s.hits > 0).map((s) => (s.url.split("/").pop() + " hits=" + s.hits));
  console.log("hitFiles=" + JSON.stringify(hits));
  console.log("candSample=" + JSON.stringify((report.phases.moduleCandidates && report.phases.moduleCandidates.cand || []).slice(0, 12)));
})().catch((e) => { console.error("probe crashed: " + e); process.exit(1); });