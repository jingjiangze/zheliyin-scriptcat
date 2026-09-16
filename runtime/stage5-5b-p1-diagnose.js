// runtime/stage5-5b-p1-diagnose.js — Stage 5.5B P1（第 2 轮）：canvas 未就绪根因修复后真机聚焦诊断
// 用户指令 §6-§12 / §25：先证据；情况 A 正常加载；情况 B（场景 C）过早点击；背景图 + no activeObject；
// 普通 Image active。记录完整时序（§6 每阶段时间）与控制台证据（§3 归档 evidence）。
// 前置清理：卸载 profile 内历史「折立印」脚本，消除双脚本面板竞争（001-execution 调查发现的干扰源）。
// 流程：清理旧脚本 → 安装当前脚本 → 载入编辑器 → A(背景图) → B(选中图) → 回滚 →
//       reload → C(过早点击) → 卸载 → 报告。
// 证据：runtime/reports/stage5-5b-p1-diagnose-report.json（并归档 docs/evidence/stage-5.5b/）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const adapter = require("./scriptcat-adapter");

const EXT_ID = adapter.EXT_ID;
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";
const P1_UUID = "rt5-5b-p1-diag-uuid-" + Date.now().toString(36);
const USERSCRIPT_PATH = path.join(__dirname, "..", "zheliyin-card-assistant.user.js");

(async () => {
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  const report = { ts: new Date().toISOString(), stage: "STAGE-5.5B-P1-V2", steps: [], errors: [] };
  const step = (n, ok, d, ev) => { report.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 900), evidence: ev || "n/a" }); if (!ok) report.errors.push(n); };
  const statusLog = [];
  const cn = [];
  const pageErrors = [];
  const timeline = { tLoad0: null, tPanelMs: null, tCanvasMs: null };
  const userScriptSrc = fs.readFileSync(USERSCRIPT_PATH, "utf8");
  step("userscript-loaded", userScriptSrc.length > 5000 && userScriptSrc.indexOf("waitForCanvasReady") >= 0 && userScriptSrc.indexOf("ocrPrepare") >= 0, "chars=" + userScriptSrc.length, "P1_V2_CODE");

  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${scDir}`, `--load-extension=${scDir}`],
      viewport: { width: 1440, height: 900 }
    });
    step("launch+scriptcat", true, "Playwright Chromium + 真实 ScriptCat(" + EXT_ID + ")", "REAL_SCRIPT_CAT_EXTENSION");

    const optsPage = browser.pages()[0];
    await optsPage.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch((e) => step("options", false, String(e && e.message || e)));
    await optsPage.waitForTimeout(3000);

    // 清理历史本仓库 userscript（双脚本面板竞争干扰，001-execution）——宽松匹配，尽力而为
    let removedOld = [];
    try {
      const all = (await adapter.getAllScripts(optsPage)) || [];
      const ours = all.filter((s) => /折立印|zheliyin/.test(String(JSON.stringify(s) || "")));
      for (const s of ours) { try { await adapter.removeScript(optsPage, s.uuid); removedOld.push(s.uuid); } catch (e) { removedOld.push(s.uuid + ":" + String(e && e.message || e)); } }
    } catch (e) { removedOld.push("err:" + String(e && e.message || e)); }
    step("cleanup-old-scripts", true, "removed=" + removedOld.length + (removedOld.length ? " (" + removedOld.join(",") + ")" : "（无历史脚本）"), "NO_DUAL_PANEL");

    const inst = await adapter.installByCode(optsPage, { uuid: P1_UUID, code: userScriptSrc, upsertBy: "user" }).catch((e) => ({ __err: String(e && e.message || e) }));
    step("install-userscript", !inst.__err, inst.__err || "status=" + inst.status, "REAL_SCRIPT_CAT_INSTALL");
    if (inst.__err) return;

    const page = await browser.newPage();
    page.on("console", (msg) => { const t = String(msg.text()); if (t.indexOf("[zy-ocr]") >= 0 || /error|exception/i.test(t)) cn.push(t); });
    page.on("pageerror", (e) => pageErrors.push(String(e && e.message || e).slice(0, 300)));

    const tLoad0 = Date.now();
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => step("nav-editor", false, String(e && message || e)));
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => step("reload-editor", false, String(e && message || e)));

    // ---- 时序记录（§6/§7）：panel / canvas ready 各阶段耗时 ----
    timeline.tLoad0 = tLoad0;
    const deadline = Date.now() + 150000;
    let canvas = null, panelSeen = false;
    while (Date.now() < deadline) {
      const st = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
        const total = vo && vo.totalCanvasArray;
        let c = null;
        if (Array.isArray(total) && total[0]) c = (total[0].canvas) || total[0];
        return { width: c ? c.width : null, height: c ? c.height : null, objs: c && typeof c.getObjects === "function" ? c.getObjects().length : null, panel: !!document.getElementById("zy-card-assistant") };
      }).catch(() => null);
      if (st && st.panel && !panelSeen) { panelSeen = true; timeline.tPanelMs = Date.now() - tLoad0; }
      if (st && st.panel && st.width > 0) { canvas = st; timeline.tCanvasMs = Date.now() - tLoad0; break; }
      await new Promise((r) => setTimeout(r, 1000));
    }
    step("panel-render", panelSeen === true, "panel@Ms=" + timeline.tPanelMs + " canvas@Ms=" + timeline.tCanvasMs + " canvas=" + JSON.stringify(canvas && { w: canvas.width, objs: canvas.objs }), "TIMELINE");
    step("panel+canvas-ready", !!(canvas && canvas.panel && canvas.width > 0), JSON.stringify(canvas), "REAL_CANVAS+ZY_PANEL");
    const uiInfo = await page.evaluate(() => ({
      panels: document.querySelectorAll("#zy-card-assistant").length,
      ocrBtn: !!document.getElementById("zy-ocr-btn"),
      statusNode: !!document.getElementById("zy-status"),
      probeBtn: !!document.getElementById("zy-probe")
    })).catch(() => null);
    step("ui-ocr-btn-present", !!(uiInfo && uiInfo.ocrBtn && uiInfo.panels === 1), JSON.stringify(uiInfo), "P1_UI_SANITY");

    // ---- 场景 A：背景图 + 无选中对象（§11/§25-C，用户原话场景）----
    const tA0 = Date.now();
    const setBg = await page.evaluate(() => new Promise((res) => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const total = vo && vo.totalCanvasArray;
      const c = (Array.isArray(total) && total[0] && ((total[0].canvas) || total[0])) || null;
      if (!c) return res({ ok: false, err: "no canvas" });
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
          const F = window.fabric || c.fabric || (c.constructor && c.constructor.fabric) || null;
          if (!F) return res({ ok: false, err: "fabric ns not found" });
          const fi = new F.Image(imgEl, { width: 900, height: 1200 });
          c.setBackgroundImage(fi, c.requestRenderAll.bind(c), { left: 0, top: 0, originX: "left", originY: "top" });
          c.discardActiveObject();
          if (c.requestRenderAll) c.requestRenderAll();
          const bg = c.backgroundImage;
          const el = bg._element || (bg.getElement && bg.getElement());
          return res({ ok: true, bgType: bg.type, left: bg.left, top: bg.top, hasElement: !!el, elNatW: el ? (el.naturalWidth || el.width) : null });
        } catch (e) { return res({ ok: false, err: String(e && e.message || e) }); }
      };
      imgEl.onerror = () => res({ ok: false, err: "img load fail" });
      imgEl.src = dataUrl;
    }));
    step("scenario-A-bg-set", !!(setBg && setBg.ok && setBg.bgType === "image" && setBg.hasElement), JSON.stringify(setBg), "BACKGROUND_IMAGE_SET|noActiveObject");

    // 观察状态序列 helper（保留占位，无需独立实现；状态直接读 #zy-status）

    async function clickAndWait(tag, maxMs, terminalRe) {
      const clicked = await page.evaluate(() => {
        const btn = document.getElementById("zy-ocr-btn");
        if (!btn) return false;
        btn.click();
        return true;
      }).catch(() => false);
      const t0 = Date.now();
      const seen = [];
      let terminal = null;
      while (Date.now() - t0 < maxMs) {
        await new Promise((r) => setTimeout(r, 700));
        const st = await page.evaluate(() => { const n = document.getElementById("zy-status"); return n ? n.textContent : ""; }).catch(() => "");
        const key = st.replace(/\u2026|…/g, "").slice(0, 60);
        if (st && !seen.some((x) => x.s.replace(/\u2026|…/g, "").slice(0, 60) === key)) seen.push({ t: Date.now() - t0, s: st });
        if (st && terminalRe.test(st)) { terminal = st; break; }
      }
      return { clicked, seen, terminal, elapsedMs: Date.now() - t0 };
    }
    const TERMINAL = /已生成|生成失败|失败|超时|未识别到文字|未找到|引擎网络错误|引擎加载失败|跨域|导出失败|无效|异常/;

    const obsA = await clickAndWait("A-bg", 120000, TERMINAL);
    const reactedA = obsA.seen.some((x) => /正在等待|正在准备|正在加载|正在识别|识别到|已生成|失败|超时|未识别|跨域|导出|无效|异常/.test(x.s));
    const rejectedA = obsA.seen.some((x) => /请先选中图片|画布未就绪/.test(x.s));
    statusLog.push({ scenario: "A-background", kind: null, seen: obsA.seen, elapsedMs: obsA.elapsedMs });
    step("scenario-A-reacted", reactedA && !rejectedA, "firstStatus=" + JSON.stringify(obsA.seen.slice(0, 3)), "P1_V2_BG_IMG_FLOW");
    // 等待 textbox 生成（最多 60s）
    let createdA = null;
    const tA1 = Date.now();
    while (Date.now() - tA1 < 65000) {
      await new Promise((r) => setTimeout(r, 1000));
      createdA = await page.evaluate(() => {
        const node = document.getElementById("zy-status");
        const txt = node ? node.textContent : "";
        const m = txt.match(/已生成 (\d+) 个文字/);
        return m ? { created: Number(m[1]) } : (/(生成失败|未识别到文字|失败|超时|异常|无效)/.test(txt) ? { created: -1, txt: txt } : null);
      }).catch(() => null);
      if (createdA) break;
    }
    step("scenario-A-e2e", !!(createdA && createdA.created > 0), JSON.stringify(createdA) + " elapsed=" + (createdA ? Date.now() - tA0 : "n/a"), "BACKGROUND_OCR_TEXTCREATE");

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

    // ---- 场景 B：选中普通 Image（§12）----
    const selB = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const total = vo && vo.totalCanvasArray;
      const c = (Array.isArray(total) && total[0] && ((total[0].canvas) || total[0])) || null;
      if (!c) return { ok: false, err: "no canvas" };
      const img = c.getObjects().find((o) => String(o.type) === "image");
      if (!img) return { ok: false, err: "no image" };
      c.setActiveObject(img);
      if (c.requestRenderAll) c.requestRenderAll();
      const act = c.getActiveObject();
      return { ok: true, activeType: act && act.type };
    });
    step("scenario-B-select-image", !!(selB && selB.ok && selB.activeType === "image"), JSON.stringify(selB), "ACTIVE_IMAGE");
    await page.evaluate(() => { const el = document.getElementById("zy-status"); if (el) el.textContent = ""; });
    const obsB = await clickAndWait("B-active", 100000, TERMINAL);
    const reactedB = obsB.seen.some((x) => /正在等待|正在准备|正在加载|正在识别|识别到|已生成|失败|超时|未识别|跨域|导出|无效|异常/.test(x.s));
    statusLog.push({ scenario: "B-activeImage", kind: null, seen: obsB.seen, elapsedMs: obsB.elapsedMs });
    step("scenario-B-reacted", reactedB, "status=" + JSON.stringify(obsB.seen.slice(0, 4)), "P1_V2_ACTIVE_IMAGE");

    // ---- 回滚（§27）：仅清理 OCR 生成对象 + 恢复背景图 ----
    const rollback = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const total = vo && vo.totalCanvasArray;
      const c = (Array.isArray(total) && total[0] && ((total[0].canvas) || total[0])) || null;
      if (!c) return { ok: false, err: "no canvas" };
      let removed = 0;
      c.getObjects().slice().forEach((o) => { if (o && String(o.zyFieldKey || "").indexOf("ocr_demo_") === 0) { c.remove(o); removed += 1; } });
      try { if (c.backgroundImage) c.setBackgroundImage(null, c.requestRenderAll.bind(c)); } catch (e) {}
      if (c.discardActiveObject) c.discardActiveObject();
      if (c.requestRenderAll) c.requestRenderAll();
      return { ok: true, removed: removed, totalAfter: c.getObjects().length, bgAfter: !!c.backgroundImage };
    });
    step("rollback", !!(rollback && rollback.ok && rollback.bgAfter === false), JSON.stringify(rollback), "P1_ROLLBACK");

    // ---- 场景 C：过早点击（§9 情况 B）：刷新后仅等 panel（canvas 未必 ready）立即点击 ----
    const tC0 = Date.now();
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    while (Date.now() - tC0 < 60000) {
      const hasPanel = await page.evaluate(() => !!document.getElementById("zy-card-assistant")).catch(() => false);
      if (hasPanel) break;
      await new Promise((r) => setTimeout(r, 700));
    }
    await page.evaluate(() => { const el = document.getElementById("zy-status"); if (el) el.textContent = ""; });
    const pageErrorsBeforeC = pageErrors.length;
    const obsC = await clickAndWait("C-early", 90000, TERMINAL);
    const earlyStateSeen = obsC.seen.some((x) => /正在等待编辑器加载/.test(x.s));
    const rejectedC = obsC.seen.some((x) => /画布未就绪|请先选中图片/.test(x.s));
    const progressedC = obsC.seen.some((x) => /正在准备|正在加载|正在识别|识别到|已生成|失败|超时|未识别|无效|异常/.test(x.s));
    // 只对「我们注入脚本」相关的 pageError 敏感（executor/appendChild 语法类），忽略编辑器自身噪音
    const errC = pageErrors.slice(pageErrorsBeforeC || 0).filter((x) => /appendChild|Unexpected token|zy-ocr|executor/i.test(x)).length;
    statusLog.push({ scenario: "C-earlyClick", kind: null, seen: obsC.seen, elapsedMs: obsC.elapsedMs });
    step("scenario-C-early-click", earlyStateSeen && progressedC && !rejectedC && errC <= 0, "earlyState=" + earlyStateSeen + " progressed=" + progressedC + " status=" + JSON.stringify(obsC.seen.slice(0, 5)), "CANVAS_EARLY_CLICK");

    // 卸载诊断 userscript
    try { await adapter.removeScript(optsPage, P1_UUID); step("cleanup-userscript", true, "removed " + P1_UUID); } catch (e) { step("cleanup-userscript", false, String(e && e.message || e)); }
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 600));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  report.timeline = timeline;
  report.statusLog = statusLog;
  report.console = cn.slice(0, 80);
  report.pageErrors = pageErrors.slice(0, 40);
  const reportPath = path.join(__dirname, "reports", "stage5-5b-p1-diagnose-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 1), "utf8");
  fs.copyFileSync(reportPath, path.join(__dirname, "..", "docs", "evidence", "stage-5.5b", "stage5-5b-p1-diagnose-report-v4.json"));
  console.log("[zy-p1-diag-v2] errors=" + report.errors.length + " → " + reportPath);
  console.log(JSON.stringify(statusLog, null, 1));
  process.exit(report.errors.length ? 1 : 0);
})();