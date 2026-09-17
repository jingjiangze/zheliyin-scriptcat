// runtime/stage5-6-font-calibration-full.js — Stage 6 P6.1 全字号标定（真实编辑器，供 estimate~ 模型）
// 覆盖：fontSize ∈ {24,28,32,36,40,44,48,56,64,72} × content ∈ {中文, 英文, 数字, 中英数字混合}。
// 每格测量（真实 ScriptCat+编辑器）：
//   targetFontPx = 图像内真实字号 × scale（画布像素）
//   readbackFs   = 生成的 textbox.fontSize（当前 = round(OCR bbox.height·scale)）
//   tbHeight/tbWidth = 渲染后 textbox 高度/宽度（取内容已定宽后的 auto 高度）
// 输出回归用数据：{fs, ratio=readbackFs/targetFontPx, heightRatio=tbHeight/targetFontPx}
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const adapter = require("./scriptcat-adapter");

const EXT_ID = adapter.EXT_ID;
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const UUID = "rt-fc2-" + Date.now().toString(36);
const USERSCRIPT_PATH = path.join(__dirname, "..", "zheliyin-card-assistant.user.js");

const SIZES = [24, 28, 32, 36, 40, 44, 48, 56, 64, 72];
const CONTENTS = {
  zh: "中文公司全称测试公司",
  en: "Design Company Limited",
  num: "13800138000 4001234567",
  mix: "深圳ABC科技 13800138000"
};
const CELLS = [];
SIZES.forEach((fs) => CELLS.push({ id: "zh-" + fs, fs: fs, content: "zh" }));
[28, 40, 48, 64, 72].forEach((fs) => {
  CELLS.push({ id: "en-" + fs, fs: fs, content: "en" });
  CELLS.push({ id: "num-" + fs, fs: fs, content: "num" });
  CELLS.push({ id: "mix-" + fs, fs: fs, content: "mix" });
});

(async () => {
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  const report = { ts: new Date().toISOString(), stage: "STAGE-6-P6.1-FONT-CALIBRATION-FULL", cells: [], infra: [] };
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

    const setupCell = (cell) => page.evaluate((cell) => new Promise((resolve) => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const total = vo && vo.totalCanvasArray;
      const c = (Array.isArray(total) && total[0] && ((total[0].canvas) || total[0])) || null;
      if (!c) return resolve({ ok: false, err: "no canvas" });
      const W = 900, H = 420, scale = 0.8;
      const cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      const g = cv.getContext("2d");
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, W, H);
      g.font = "bold " + cell.fs + "px 'Microsoft YaHei', sans-serif";
      g.fillStyle = "#111111";
      const text = CONTENTS[cell.content];
      g.fillText(text, 40, Math.floor(H / 2 + cell.fs / 2 - 8));
      const url = cv.toDataURL("image/png");
      const img = document.createElement("img");
      img.onload = () => {
        try {
          const F = window.fabric || c.fabric || (c.constructor && c.constructor.fabric);
          c.getObjects().slice().forEach((o) => { const k = String(o.zyFieldKey || ""); if (k.indexOf("ocr_demo_") === 0 || k === "fc2-target") c.remove(o); });
          const fi = new F.Image(img, { width: W, height: H, left: 40, top: 60, scaleX: scale, scaleY: scale, originX: "left", originY: "top", zyFieldKey: "fc2-target" });
          c.add(fi);
          c.setActiveObject(fi);
          if (c.requestRenderAll) c.requestRenderAll();
          resolve({ ok: true, scale: scale });
        } catch (e) { resolve({ ok: false, err: String(e && e.message || e) }); }
      };
      img.onerror = () => resolve({ ok: false, err: "img fail" });
      img.src = url;
    }), cell);

    const runFlow = async () => {
      await page.evaluate(() => { const n = document.getElementById("zy-native-status"); if (n) n.textContent = ""; });
      await page.evaluate(() => { const b = document.getElementById("zy-native-ocr-btn"); if (b) b.click(); }).catch(() => {});
      const t0 = Date.now();
      let term = "";
      const TERM = /已生成 \d+ 个文字|生成失败|未识别到文字|OCR 失败|失败|超时|异常|无效|未找到|跨域/;
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
        return c.getObjects().filter((o) => o && String(o.zyFieldKey || "").indexOf("ocr_demo_") === 0).map((o) => ({ fs: o.fontSize, h: o.height, w: o.width, text: String(o.text || "").slice(0, 18) }));
      });
      await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
        const total = vo && vo.totalCanvasArray;
        const c = (Array.isArray(total) && total[0] && ((total[0].canvas) || total[0])) || null;
        if (!c) return;
        c.getObjects().slice().forEach((o) => { const k = String(o.zyFieldKey || ""); if (k.indexOf("ocr_demo_") === 0 || k === "fc2-target") c.remove(o); });
        if (c.requestRenderAll) c.requestRenderAll();
      });
      return { term: term, boxes: boxes };
    };

    for (const cell of CELLS) {
      const entry = { id: cell.id, fs: cell.fs, content: cell.content, result: "PENDING" };
      try {
        const setup = await setupCell(cell);
        if (!setup.ok) { entry.result = "FAIL"; entry.note = setup.err; report.cells.push(entry); continue; }
        const flow = await runFlow();
        const m = /已生成 (\d+) 个文字/.exec(flow.term);
        if (!(m && Number(m[1]) > 0)) { entry.result = "FAIL"; entry.note = flow.term.slice(0, 80); report.cells.push(entry); continue; }
        const targetPx = cell.fs * setup.scale;
        const rows = flow.boxes.map((b) => ({
          ratio: +(b.fs / targetPx).toFixed(3),
          heightRatio: +(b.h / targetPx).toFixed(3),
          w: +b.w.toFixed(1), fs: b.fs, h: +b.h.toFixed(1), text: b.text
        }));
        entry.rows = rows;
        entry.meanRatio = +(rows.reduce((s, r) => s + r.ratio, 0) / rows.length).toFixed(3);
        entry.meanHeightRatio = +(rows.reduce((s, r) => s + r.heightRatio, 0) / rows.length).toFixed(3);
        entry.result = "MEASURED";
      } catch (e) { entry.result = "FAIL"; entry.note = String(e && e.message || e).slice(0, 160); }
      report.cells.push(entry);
    }
    try { await adapter.removeScript(optsPage, UUID); inf("cleanup", true, "removed " + UUID); } catch (e) { inf("cleanup", false, String(e.message || e)); }
  } catch (e) {
    inf("fatal", false, String(e && e.stack || e).slice(0, 500));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  const rs = report.cells.filter((c) => c.meanRatio != null);
  report.allMeanRatio = rs.length ? +(rs.reduce((a, b) => a + b.meanRatio, 0) / rs.length).toFixed(3) : null;
  report.allMeanHeightRatio = rs.length ? +(rs.reduce((a, b) => a + b.meanHeightRatio, 0) / rs.length).toFixed(3) : null;
  const reportPath = path.join(__dirname, "reports", "stage5-6-font-calibration-full.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 1), "utf8");
  fs.mkdirSync(path.join(__dirname, "..", "docs", "evidence", "stage-6"), { recursive: true });
  fs.copyFileSync(reportPath, path.join(__dirname, "..", "docs", "evidence", "stage-6", "stage5-6-font-calibration-full.json"));
  console.log("[zy-fc2] cells=" + report.cells.length + " meanRatio=" + report.allMeanRatio + " meanHeightRatio=" + report.allMeanHeightRatio);
  console.log(JSON.stringify(report.cells.filter((c) => c.meanRatio != null).map((c) => ({ id: c.id, ratio: c.meanRatio, hRatio: c.meanHeightRatio })), null, 0));
  process.exit(0);
})();