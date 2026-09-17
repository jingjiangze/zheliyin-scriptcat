// runtime/stage5-6-font-calibration.js — Stage 5.6 字号标定（真机证据）
// 目标：验证 mapper fontSize = round(bbox.height·scale) 是否相对「真实绘制字号」系统性偏差。
// 方法：自绘已知字号/粗细/底色图像 → 原生 OCR → 读回 textbox.fontSize → ratio = 读回/绘制。
// 输出：各组合 ratio（mean/std）；若系统性 ≠ 1 → 校正系数 k = 期望字号/读回（供 buildItemsFromOcr 使用）。
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const adapter = require("./scriptcat-adapter");

const EXT_ID = adapter.EXT_ID;
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const UUID = "rt-fcal-" + Date.now().toString(36);
const USERSCRIPT_PATH = path.join(__dirname, "..", "zheliyin-card-assistant.user.js");

const CELLS = [
  { id: "blank-canvas", fs: 48, weight: "bold", bg: "#ffffff", fg: "#111111", blank: true },
  { id: "w-24-bold",  fs: 24, weight: "bold", bg: "#ffffff", fg: "#111111" },
  { id: "w-36-bold",  fs: 36, weight: "bold", bg: "#ffffff", fg: "#111111" },
  { id: "w-48-bold",  fs: 48, weight: "bold", bg: "#ffffff", fg: "#111111" },
  { id: "w-64-bold",  fs: 64, weight: "bold", bg: "#ffffff", fg: "#111111" },
  { id: "b-48-bold",  fs: 48, weight: "bold", bg: "#111111", fg: "#ffffff" },
  { id: "w-48-regular", fs: 48, weight: "normal", bg: "#ffffff", fg: "#111111" }
];

(async () => {
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  const report = { ts: new Date().toISOString(), stage: "STAGE-5.6-FONT-CALIBRATION", cells: [], infra: [] };
  let browser = null;
  const inf = (n, ok, d) => report.infra.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 300) });
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${scDir}`, `--load-extension=${scDir}`],
      viewport: { width: 1440, height: 900 }
    });
    const optsPage = browser.pages()[0];
    await optsPage.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await optsPage.waitForTimeout(2500);
    try {
      const all = (await adapter.getAllScripts(optsPage)) || [];
      for (const s of all.filter((x) => /折立印|zheliyin/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(optsPage, s.uuid); } catch (e) {} }
    } catch (e) {}
    await optsPage.evaluate(async () => {
      const all = await chrome.storage.local.get(null);
      const targets = Object.keys(all).filter((k) => /^compiled_resource:|^resource:/.test(k));
      for (const k of targets) { try { await chrome.storage.local.remove(k); } catch (e) {} }
    }).catch(() => 0);
    const inst = await adapter.installByCode(optsPage, { uuid: UUID, code: fs.readFileSync(USERSCRIPT_PATH, "utf8"), upsertBy: "user" }).catch((e) => ({ __err: String(e && e.message || e) }));
    inf("install-userscript", !inst.__err, inst.__err || "status=" + inst.status);
    if (inst.__err) throw new Error("install failed: " + inst.__err);

    const page = await browser.newPage();
    page.on("console", (msg) => { const t = String(msg.text()); if (t.indexOf("[zy-ocr]") >= 0 && t.indexOf("SUCCESS") < 0) report.logs = report.logs || []; if (t.indexOf("[zy-ocr]") >= 0) (report.logs = report.logs || []).push(t.slice(0, 200)); });
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});

    const d0 = Date.now() + 150000;
    let ready = false;
    while (Date.now() < d0) {
      ready = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        return !!(ctx && ctx.defined && ctx.defined.CanvasObjVO) && !!document.getElementById("zy-native-ocr-panel");
      }).catch(() => false);
      if (ready) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    inf("editor-ready", ready, "ready=" + ready);
    if (!ready) throw new Error("editor not ready");

    const setupCell = async (cell) => {
      const res = await page.evaluate((cell) => new Promise((resolve) => {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
        const total = vo && vo.totalCanvasArray;
        const c = (Array.isArray(total) && total[0] && ((total[0].canvas) || total[0])) || null;
        if (!c) return resolve({ ok: false, err: "no canvas" });
        const W = 800, H = 640;
        const cv = document.createElement("canvas");
        cv.width = W; cv.height = H;
        const g = cv.getContext("2d");
        g.fillStyle = cell.bg; g.fillRect(0, 0, W, H);
        g.font = cell.weight + " " + cell.fs + "px 'Microsoft YaHei', sans-serif";
        g.fillStyle = cell.fg;
        g.fillText("字体测试文字ABC123", 60, 180);
        g.fillText("公司名与电话号码", 60, 340);
        const url = cv.toDataURL("image/png");
        const img = document.createElement("img");
        img.onload = () => {
          try {
            const F = window.fabric || c.fabric || (c.constructor && c.constructor.fabric);
            c.getObjects().slice().forEach((o) => { const k = String(o.zyFieldKey || ""); if (k.indexOf("ocr_demo_") === 0 || k === "fcal-target") c.remove(o); });
            if (cell.blank) {
              // 空白画布验证（0.3.8.4 修复）：移除全部已有对象，仅保留目标图 → 无文字层模板
              c.getObjects().slice().forEach((o) => { try { c.remove(o); } catch (e) {} });
            }
            const fi = new F.Image(img, { width: W, height: H, left: (c.width - W * 0.8) / 2, top: 40, scaleX: 0.8, scaleY: 0.8, originX: "left", originY: "top", zyFieldKey: "fcal-target" });
            c.add(fi);
            c.setActiveObject(fi);
            if (c.requestRenderAll) c.requestRenderAll();
            resolve({ ok: true, scale: 0.8 });
          } catch (e) { resolve({ ok: false, err: String(e && e.message || e) }); }
        };
        img.onerror = () => resolve({ ok: false, err: "img fail" });
        img.src = url;
      }), cell);
      return res;
    };
    const runFlow = async (cell) => {
      await page.evaluate(() => { const n = document.getElementById("zy-native-status"); if (n) n.textContent = ""; });
      await page.evaluate(() => { const b = document.getElementById("zy-native-ocr-btn"); if (b) b.click(); }).catch(() => {});
      const t0 = Date.now();
      let term = "";
      const TERM = /已生成 \d+ 个文字|生成失败|未识别到文字|OCR 失败|超时|异常|无效|未找到|跨域|导出失败/;
      while (Date.now() - t0 < 90000) {
        await new Promise((r) => setTimeout(r, 700));
        term = await page.evaluate(() => { const n = document.getElementById("zy-native-status"); return n ? n.textContent : ""; }).catch(() => "");
        if (term && TERM.test(term)) break;
      }
      const boxes = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
        const total = vo && vo.totalCanvasArray;
        const c = (Array.isArray(total) && total[0] && ((total[0].canvas) || total[0])) || null;
        if (!c) return [];
        return c.getObjects().filter((o) => o && String(o.zyFieldKey || "").indexOf("ocr_demo_") === 0).map((o) => ({ fs: o.fontSize, h: o.height, w: o.width, text: String(o.text || "").slice(0, 14) }));
      });
      // 清除本格对象
      await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
        const total = vo && vo.totalCanvasArray;
        const c = (Array.isArray(total) && total[0] && ((total[0].canvas) || total[0])) || null;
        if (!c) return;
        c.getObjects().slice().forEach((o) => { const k = String(o.zyFieldKey || ""); if (k.indexOf("ocr_demo_") === 0 || k === "fcal-target") c.remove(o); });
        if (c.requestRenderAll) c.requestRenderAll();
      });
      return { term: term, boxes: boxes };
    };

    for (const cell of CELLS) {
      const entry = { id: cell.id, fs: cell.fs, weight: cell.weight, bg: cell.bg, result: "PENDING" };
      try {
        const setup = await setupCell(cell);
        if (!setup.ok) { entry.result = "FAIL"; entry.note = setup.err; report.cells.push(entry); continue; }
        const flow = await runFlow(cell);
        const ratios = flow.boxes.map((b) => b.fs / (cell.fs * setup.scale));
        const mean = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;
        entry.readbackFs = flow.boxes.map((b) => b.fs);
        entry.expectedRawFs = cell.fs * setup.scale; // 画布上真实像素字号 = 图像字号×scale（mapper 以画布像素定 fontSize）
        entry.ratios = ratios.map((r) => +r.toFixed(3));
        entry.meanRatio = mean != null ? +mean.toFixed(3) : null;
        entry.term = flow.term.slice(0, 80);
        if (cell.blank) {
          entry.result = /已生成 \d+ 个文字/.test(flow.term) && !/失败|异常|timeout/i.test(flow.term) ? "PASS" : "FAIL"; // 0.3.8.4 空白模板回归
        } else {
          entry.result = entry.meanRatio != null ? "MEASURED" : "FAIL";
        }
      } catch (e) { entry.result = "FAIL"; entry.note = String(e && e.message || e).slice(0, 160); }
      report.cells.push(entry);
    }
    try { await adapter.removeScript(optsPage, UUID); inf("cleanup", true, "removed " + UUID); } catch (e) { inf("cleanup", false, String(e.message || e)); }
  } catch (e) {
    inf("fatal", false, String(e && e.stack || e).slice(0, 500));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  // 汇总：整体 meanRatio
  const rs = report.cells.filter((c) => c.meanRatio != null).map((c) => c.meanRatio);
  report.allMeanRatio = rs.length ? +(rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(3) : null;
  const reportPath = path.join(__dirname, "reports", "stage5-6-font-calibration.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 1), "utf8");
  fs.mkdirSync(path.join(__dirname, "..", "docs", "evidence", "stage-5.6"), { recursive: true });
  fs.copyFileSync(reportPath, path.join(__dirname, "..", "docs", "evidence", "stage-5.6", "stage5-6-font-calibration.json"));
  console.log("[zy-fcal] allMeanRatio=" + report.allMeanRatio);
  console.log(JSON.stringify(report.cells.map((c) => ({ id: c.id, mean: c.meanRatio, fs: c.readbackFs })), null, 0));
  process.exit(0);
})();