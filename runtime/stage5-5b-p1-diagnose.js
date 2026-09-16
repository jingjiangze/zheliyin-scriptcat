// runtime/stage5-5b-p1-diagnose.js — Stage 5.5B P1：背景图“点按钮无反应”真机聚焦诊断
// 场景（对应产品规格 §52/§55）：
//   A. 背景图：画布填充背景图 + 未选中任何对象（用户真实操作“图片填充进来作为背景后”）
//      → 点「识别图片文字」必须立刻有状态反应（PREPARING 成功），不应“请先选中图片”静默
//   B. 选中图：选中画布已有 image → 点按钮 → 走 active-image 路径
// 每个场景断言：状态进入“正在加载/正在识别”（证明 resolved target + extractImageDataUrl 通过），
// 并尽量等到生成文字（SUCCESS）或真实 OCR 失败（ERROR 但非“请先选中图片”）。
// 结束前回滚：删除本次 OCR 生成的文字（zyFieldKey=ocr_demo_*），恢复背景图，清理 userscript。
// 证据：runtime/reports/stage5-5b-p1-diagnose-report.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const adapter = require("./scriptcat-adapter");

const EXT_ID = adapter.EXT_ID;
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";
const P1_UUID = "rt5-5b-p1-diag-uuid";
const USERSCRIPT_PATH = path.join(__dirname, "..", "zheliyin-card-assistant.user.js");

(async () => {
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  const report = { ts: new Date().toISOString(), stage: "STAGE-5.5B-P1", steps: [], errors: [] };
  const step = (n, ok, d, ev) => { report.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 700), evidence: ev || "n/a" }); if (!ok) report.errors.push(n); };
  const statusLog = [];
  const userScriptSrc = fs.readFileSync(USERSCRIPT_PATH, "utf8");
  step("userscript-loaded", userScriptSrc.length > 5000 && userScriptSrc.indexOf("resolveOcrTarget") >= 0, "chars=" + userScriptSrc.length + " hasResolveOcrTarget=true", "P1_CODE");

  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${scDir}`, `--load-extension=${scDir}`],
      viewport: { width: 1440, height: 900 }
    });
    step("launch+scriptcat", true, "Playwright Chromium + 真实 ScriptCat(" + EXT_ID + ")", "REAL_SCRIPT_CAT_EXTENSION");

    // 安装生产 userscript（P1 版，installByCode 会 upsertBy:user 覆盖旧版）
    const optsPage = browser.pages()[0];
    await optsPage.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch((e) => step("options", false, String(e && e.message || e)));
    await optsPage.waitForTimeout(3000);
    const inst = await adapter.installByCode(optsPage, { uuid: P1_UUID, code: userScriptSrc, upsertBy: "user" }).catch((e) => ({ __err: String(e && e.message || e) }));
    step("install-userscript", !inst.__err, inst.__err || "status=" + inst.status, "REAL_SCRIPT_CAT_INSTALL");
    if (inst.__err) return;

    const page = await browser.newPage();
    const cn = [];
    const pageErrors = [];
    page.on("console", (msg) => { const t = String(msg.text()); if (t.indexOf("[zy-ocr]") >= 0 || /error|exception/i.test(t)) cn.push(t); });
    page.on("pageerror", (e) => pageErrors.push(String(e && e.message || e).slice(0, 300)));
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => step("nav-editor", false, String(e && message || e)));
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => step("reload-editor", false, String(e && message || e)));

    const deadline = Date.now() + 150000;
    let canvas = null, panel = null;
    while (Date.now() < deadline) {
      const st = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
        const total = vo && vo.totalCanvasArray;
        let c = null;
        if (Array.isArray(total) && total[0]) c = (total[0].canvas) || total[0];
        const panelEl = document.getElementById("zy-card-assistant");
        return { width: c ? c.width : null, height: c ? c.height : null, objs: c && typeof c.getObjects === "function" ? c.getObjects().length : null, panel: !!panelEl, bgImage: !!(c && c.backgroundImage), images: c && typeof c.getObjects === "function" ? c.getObjects().filter((o) => String(o.type) === "image").length : null };
      }).catch(() => null);
      if (st && st.panel && st.width > 0) { canvas = st; panel = true; break; }
      await new Promise((r) => setTimeout(r, 3000));
    }
    step("panel+canvas-ready", !!(canvas && canvas.panel && canvas.width > 0), JSON.stringify(canvas), "REAL_CANVAS+ZY_PANEL");
    // UI 存在性证据：面板数量、OCR 按钮、状态容器（P1 根因：按钮绑定被前置 TypeError 拖垮）
    const uiInfo = await page.evaluate(() => {
      return {
        panels: document.querySelectorAll("#zy-card-assistant").length,
        ocrBtn: !!document.getElementById("zy-ocr-btn"),
        ocrBtnText: document.getElementById("zy-ocr-btn") ? document.getElementById("zy-ocr-btn").textContent : null,
        statusNode: !!document.getElementById("zy-status"),
        probeBtn: !!document.getElementById("zy-probe")
      };
    }).catch(() => null);
    step("ui-ocr-btn-present", !!(uiInfo && uiInfo.ocrBtn && uiInfo.panels >= 1), JSON.stringify(uiInfo), "P1_UI_SANITY");

    // ---- 场景 A：背景图（用户原话“图片填充进来作为背景后”）----
    const setBg = await page.evaluate(() => new Promise((res) => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const total = vo && vo.totalCanvasArray;
      const c = (Array.isArray(total) && total[0] && ((total[0].canvas) || total[0])) || null;
      if (!c) return res({ ok: false, err: "no canvas" });
      // 在画布中生成一张含中文文本的位图（真实用户“填充背景”的等价物）
      const cv = document.createElement("canvas");
      cv.width = 900; cv.height = 1200;
      const g = cv.getContext("2d");
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, 900, 1200);
      g.fillStyle = "#111111";
      g.font = "bold 64px 'Microsoft YaHei', sans-serif";
      g.fillText("测试公司", 100, 180);
      g.fillText("折立印设计", 100, 320);
      g.fillText("13800138000", 100, 520);
      g.fillText("WeChat: abc123", 100, 660);
      g.fillText("深圳市南山区科技园路999号", 100, 860);
      const dataUrl = cv.toDataURL("image/png");
      const imgEl = document.createElement("img");
      imgEl.onload = () => {
        try {
          // fabric 命名空间探测（不同设计器版本暴露位置不同）
          const F = window.fabric || c.fabric || (c.constructor && c.constructor.fabric) || null;
          if (!F) { return res({ ok: false, err: "fabric ns not found" }); }
          const fi = new F.Image(imgEl, { width: 900, height: 1200 });
          c.setBackgroundImage(fi, c.requestRenderAll.bind(c), { left: 0, top: 0, originX: "left", originY: "top" });
          c.discardActiveObject();
          if (c.requestRenderAll) c.requestRenderAll();
          const bg = c.backgroundImage;
          const el = bg._element || (bg.getElement && bg.getElement());
          return res({ ok: true, bgType: bg.type, hasElement: !!el, elTag: el ? el.tagName : null, elNatW: el ? (el.naturalWidth || el.width) : null, left: bg.left, top: bg.top, imagesOnCanvas: c.getObjects().filter((o) => String(o.type) === "image").length });
        } catch (e) { return res({ ok: false, err: String(e && e.message || e) }); }
      };
      imgEl.onerror = () => res({ ok: false, err: "img load fail" });
      imgEl.src = dataUrl;
    }));
    step("scenario-A-bg-set", !!(setBg && setBg.ok && setBg.bgType === "image" && setBg.hasElement), JSON.stringify(setBg), "BACKGROUND_IMAGE_SET");

    async function clickOcrAndObserve(tag, maxMs) {
      await page.evaluate(() => {
        const btn = document.getElementById("zy-ocr-btn");
        if (btn) btn.click(); // 真实 DOM 点击 → 用户脚本 handleOcrImage
      }).catch(() => {});
      const t0 = Date.now();
      const seen = [];
      let final = null;
      while (Date.now() - t0 < maxMs) {
        await new Promise((r) => setTimeout(r, 700));
        const st = await page.evaluate(() => {
          const node = document.getElementById("zy-status");
          return node ? node.textContent : "";
        }).catch(() => "");
        const key = st.replace(/\u2026|…/g, "").slice(0, 60);
        if (st && !seen.some((s) => s.replace(/\u2026|…/g, "").slice(0, 60) === key)) seen.push(st);
        if (/已生成|生成失败|失败|超时|未识别到文字|未找到|请先在画布|引擎网络错误|引擎加载失败|跨域|导出失败/.test(st)) { final = st; break; }
        if (seen.some((s) => /正在识别|正在加载/.test(s)) && Date.now() - t0 > Math.min(maxMs, 25000)) break; // 已证明“有反应”且进入识别，不必然等待完成
      }
      return { seen: seen, final: final, elapsedMs: Date.now() - t0 };
    }

    const obsA = await clickOcrAndObserve("A-bg", 150000);
    const reactedA = obsA.seen.some((s) => /正在加载|正在识别|识别到|已生成|失败|超时/.test(s));
    const rejectedA = obsA.seen.some((s) => /请先选中图片/.test(s));
    statusLog.push({ scenario: "A-background", seen: obsA.seen, elapsedMs: obsA.elapsedMs });
    step("scenario-A-reacted", reactedA && !rejectedA, "status=" + JSON.stringify(obsA.seen.slice(0, 6)), "P1_NO_SILENT_ACTION|bg=" + JSON.stringify(setBg));
    // 等待完整闭环（最多再 60s）
    let createdA = null;
    const tA0 = Date.now();
    while (Date.now() - tA0 < 65000) {
      await new Promise((r) => setTimeout(r, 1000));
      const st = await page.evaluate(() => {
        const node = document.getElementById("zy-status");
        const txt = node ? node.textContent : "";
        const m = txt.match(/已生成 (\d+) 个文字/);
        return m ? { created: Number(m[1]), txt: txt } : (txt.indexOf("生成失败") >= 0 || txt.indexOf("未识别到文字") >= 0 ? { created: -1, txt: txt } : null);
      }).catch(() => null);
      if (st) { createdA = st; break; }
    }
    step("scenario-A-e2e", !!(createdA && createdA.created > 0), JSON.stringify(createdA), "BACKGROUND_OCR_TEXTCREATE");

    // 读取生成结果（真实 textbox 证据）
    const readA = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const total = vo && vo.totalCanvasArray;
      const c = (Array.isArray(total) && total[0] && ((total[0].canvas) || total[0])) || null;
      if (!c) return null;
      const objs = c.getObjects();
      const ocr = objs.filter((o) => o && String(o.zyFieldKey || "").indexOf("ocr_demo_") === 0);
      return { ocrCount: ocr.length, samples: ocr.slice(0, 5).map((o) => ({ text: String(o.text || "").slice(0, 24), type: o.type, editable: typeof o.enterEditing === "function" })), total: objs.length };
    });
    step("scenario-A-readable-textbox", !!(readA && readA.ocrCount > 0 && readA.samples.every((s) => s.editable)), JSON.stringify(readA), "REAL_EDITABLE_TEXTBOX");

    // ---- 场景 B：选中已有 image（active-image 路径回归）----
    const selB = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const total = vo && vo.totalCanvasArray;
      const c = (Array.isArray(total) && total[0] && ((total[0].canvas) || total[0])) || null;
      if (!c) return { ok: false, err: "no canvas" };
      const img = c.getObjects().find((o) => String(o.type) === "image");
      if (!img) return { ok: false, err: "no image on canvas" };
      c.setActiveObject(img);
      if (c.requestRenderAll) c.requestRenderAll();
      const act = c.getActiveObject();
      return { ok: true, activeType: act && act.type, hasElement: !!(act && (act._element || (act.getElement && act.getElement()))) };
    });
    step("scenario-B-select-image", !!(selB && selB.ok && selB.activeType === "image"), JSON.stringify(selB), "ACTIVE_IMAGE");

    await page.evaluate(() => { const el = document.getElementById("zy-status"); if (el) el.textContent = ""; });
    const obsB = await clickOcrAndObserve("B-active", 120000);
    const reactedB = obsB.seen.some((s) => /正在加载|正在识别|识别到|已生成|失败|超时/.test(s));
    const silentB = obsB.seen.length === 0;
    statusLog.push({ scenario: "B-activeImage", seen: obsB.seen, elapsedMs: obsB.elapsedMs });
    step("scenario-B-reacted", reactedB && !silentB, "status=" + JSON.stringify(obsB.seen.slice(0, 6)), "P1_ACTIVE_IMAGE_NO_REGRESSION");

    // ---- 回滚：删除本次 OCR 生成对象 + 恢复背景图 ----
    const rollback = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const total = vo && vo.totalCanvasArray;
      const c = (Array.isArray(total) && total[0] && ((total[0].canvas) || total[0])) || null;
      if (!c) return { ok: false, err: "no canvas" };
      let removed = 0;
      c.getObjects().slice().forEach((o) => { if (o && String(o.zyFieldKey || "").indexOf("ocr_demo_") === 0) { c.remove(o); removed += 1; } });
      try { if (c.backgroundImage) { c.setBackgroundImage(null, c.requestRenderAll.bind(c)); } } catch (e) {}
      if (c.discardActiveObject) c.discardActiveObject();
      if (c.requestRenderAll) c.requestRenderAll();
      return { ok: true, removed: removed, totalAfter: c.getObjects().length, bgAfter: !!c.backgroundImage };
    });
    const preTotal = canvas ? canvas.objs : null;
    step("rollback", !!(rollback && rollback.ok && rollback.bgAfter === false), JSON.stringify(rollback) + " preTotal=" + preTotal, "P1_ROLLBACK");

    // 卸载诊断 userscript（保留环境干净）
    try { await adapter.removeScript(optsPage, P1_UUID); step("cleanup-userscript", true, "removed " + P1_UUID); } catch (e) { step("cleanup-userscript", false, String(e && e.message || e)); }
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 600));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  report.statusLog = statusLog;
  report.console = cn.slice(0, 80);
  report.pageErrors = pageErrors.slice(0, 40);
  const reportPath = path.join(__dirname, "reports", "stage5-5b-p1-diagnose-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 1), "utf8");
  console.log("[zy-p1-diag] errors=" + report.errors.length + " → " + reportPath);
  console.log(JSON.stringify(statusLog, null, 1));
  process.exit(report.errors.length ? 1 : 0);
})();