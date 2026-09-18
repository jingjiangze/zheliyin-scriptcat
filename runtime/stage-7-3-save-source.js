// runtime/stage-7-3-save-source.js — t4 v3：抓取保存链路上游前端源码（真机登录态同源 fetch）
// 目标：读清 1) IfDiyOrderidExit 调用条件与失败分支 2) saveThirdUserDesign.do payload 组装
//      3) getShopAndWangWangInfo 触发字段（tbOrderNo vs thirdOrderNo）4) 对象序列化（mediafontId 是否入 payload）
// 同时还原 v2 探测误勾选的主界面 checkbox（zidongcaiqie/uploadCheckBox/aixieyi-checkbox 等）。
// 输出：runtime/reports/stage-7-3-save-source.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-7-3-save-source.json");
const BASE = "https://diy.zheliyin.com/diyWeb/";
const KEYWORDS = ["IfDiyOrderidExit", "saveThirdUserDesign", "getShopAndWangWangInfo", "thirdOrderNo", "tbOrderNo", "Orderid", "workName", "saveThirdUser", "thirdDiyEdit"];
const KEYRE = new RegExp("IfDiyOrderidExit|saveThirdUserDesign|getShopAndWangWangInfo|thirdOrderNo|tbOrderNo|Orderid|workName|saveThirdUser|thirdDiyEdit", "g");

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-7.3-SAVE-SOURCE", url: EDITOR_URL, phases: {}, errors: [] };
  let browser = null;
  let page = null;
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

    // ---- Phase 0: 还原 v2 误勾选 checkbox（仅还原、不再新勾）----
    report.phases.checkboxRevert = await page.evaluate(() => {
      const touches = ["zidongcaiqie", "uploadCheckBox", "aixieyi-checkbox", "hiddenExistsFill", "hiddenFill", "aiFangzhiSymmetric", "setBLChange"];
      const out = [];
      document.querySelectorAll("input[type=checkbox]").forEach((cb, i) => {
        const cls = String(cb.className || "");
        const id = String(cb.id || "");
        if (touches.some((t) => cls.indexOf(t) >= 0 || id.indexOf(t) >= 0)) {
          if (cb.checked) { try { cb.click(); out.push("reverted:" + (id || cls.slice(0, 30))); } catch (e) {} }
          else out.push("already-unchecked:" + (id || cls.slice(0, 30)));
        }
      });
      return { reverted: out };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // ---- Phase 1: 抓保存链路源码（重点文件）----
    const files = [
      "js/mulitCanvas/v2/design/business/CustomerIndexThird.js",
      "js/mulitCanvas/v2/util/designAi.js",
      "js/mulitCanvas/v2/design/business/config.js",
      "js/mulitCanvas/v2/design/public/view/moreCanvas/MultiCanvasDiy.js",
      "js/mulitCanvas/v2/design/public/model/ParseJsonModel.js",
      "js/mulitCanvas/v2/design/public/view/public/HeadPublic.js",
      "js/mulitCanvas/v2/design/public/view/CustomerLeftNavigationBar.js",
      "js/mulitCanvas/v2/design/public/command/LoadFromProductJsonCommand.js",
      "js/mulitCanvas/v2/design/public/model/DesignVO.js"
    ];
    report.phases.sources = await page.evaluate(async (p) => {
      const re = new RegExp(p.keywords.join("|"), "g");
      const out = [];
      for (const f of p.files) {
        const rec = { file: f, status: null, hits: null, snippets: [] };
        try {
          const ctrl = new AbortController();
          const to = setTimeout(() => ctrl.abort(), 15000);
          const r = await fetch(p.base + f, { signal: ctrl.signal });
          clearTimeout(to);
          rec.status = r.status;
          const txt = await r.text();
          rec.len = txt.length;
          if (txt.length < 1200) { rec.fullText = txt.slice(0, 1100); out.push(rec); continue; }
          // 关键词命中段（去重、每段前后各 ~350/550 字符）
          const seen = new Set();
          re.lastIndex = 0;
          let m;
          const localHit = [];
          while ((m = re.exec(txt)) !== null && localHit.length < 40) {
            const s = Math.max(0, m.index - 350);
            const e = Math.min(txt.length, m.index + m[0].length + 550);
            const seg = txt.slice(s, e);
            const key = m[0] + "|" + m.index;
            if (!seen.has(key)) { seen.add(key); localHit.push({ kw: m[0], idx: m.index, seg: seg }); }
          }
          rec.hits = localHit.length;
          // 聚合每关键词首段（控制体积）
          const byKw = {};
          localHit.forEach((h) => { if (!byKw[h.kw]) byKw[h.kw] = h; });
          rec.snippets = Object.keys(byKw).slice(0, 9).map((k) => byKw[k]);
        } catch (e) {
          rec.err = String(e && e.message || e).slice(0, 140);
        }
        out.push(rec);
      }
      return out;
    }, { base: BASE, files: files, keywords: KEYWORDS }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.message || e).slice(0, 400));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log("STAGE-7.3-SAVE-SOURCE done -> " + REPORT_PATH);
  console.log("ready=" + report.phases.ready + " sources=" + (report.phases.sources && report.phases.sources.map ? report.phases.sources.map((s) => (s.file.split("/").pop() + ":" + s.status + ":" + s.len + "hits=" + s.hits)).join(" ") : JSON.stringify(report.phases.sources).slice(0, 300)));
})().catch((e) => { console.error("probe crashed: " + e); process.exit(1); });