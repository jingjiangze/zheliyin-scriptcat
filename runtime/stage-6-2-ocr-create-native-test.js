// runtime/stage-6-2-ocr-create-native-test.js — Stage 6.2 s62-5 核心：生产 bridge 原生 OCR 创建端到端
// 验证（真实 252438 页面 + 生产 pageBridge 代码，不经过 userscript）：
//   1) ocrCreate → editorIntegration.mode === "native"（drawText 原生路径生效）
//   2) createdTextboxes == textBlocks（3 blocks → 3 created）
//   3) canvasTextCount == layerTextCount（图层注册一致性）
//   4) 原生撤销：3 个 OCR 对象移除、模板保留；重做恢复同一批对象（§十八/§十九）
//   5) 批量 + 后续编辑的历史边界（§二十：undo 先撤销编辑，不直接删整批）
//   6) 清理：恢复初始状态（hook 无残留、测试对象移除、undo/redo 栈截断回基线）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const BRIDGE_FILE = path.join(__dirname, "..", "extension", "src", "editor", "page-bridge.js");
const REPORT_PATH = path.join(__dirname, "reports", "stage-6-2-ocr-create-native-test.json");

const TEST_ITEMS = [
  { text: "张三", blockIndex: 0, left: 60, top: 80, width: 140, height: 30, fontSize: 28, fontFamily: "思源黑体 Regular" },
  { text: "销售经理", blockIndex: 1, left: 60, top: 118, width: 160, height: 26, fontSize: 22, fontFamily: "思源黑体 Regular" },
  { text: "电话：13800138000", blockIndex: 2, left: 60, top: 152, width: 240, height: 24, fontSize: 18, fontFamily: "思源黑体 Regular" }
];

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-6-2-OCR-CREATE-NATIVE-TEST", url: EDITOR_URL, phases: {}, errors: [] };
  let browser = null;
  try {
    const bridgeSrc = fs.readFileSync(BRIDGE_FILE, "utf8");
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    const page = browser.pages()[0];
    // 注入生产 pageBridge：addInitScript 走 CDP Page.addScriptToEvaluateOnNewDocument，
    // 与调试器同级、不受页面 CSP 限制（页面 CSP 无 unsafe-eval/unsafe-inline，DOM script 与 eval 均会被拦截）。
    // 在 document-start 于页面主世界安装 bridge（安装期零依赖），随每次导航自动重装，marker 幂等。
    const bridgeStart = (bridgeSrc || "").trim() + "\n;if (typeof pageBridge === 'function' && !window.__ZY_CARD_ASSISTANT_BRIDGE__) { try { pageBridge(); } catch (e) { window.__zyBridgeInstallErr = String((e && e.message) || e).slice(0, 300); } }";
    await page.addInitScript(bridgeStart);
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    let rd = null;
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
      rd = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
        const t = vo && vo.totalCanvasArray;
        const d = (Array.isArray(t) && t[0]) || null;
        const c = d && (d.canvas || d);
        return { ok: !!(d && c && c.getObjects && typeof d.drawText === "function"), objs: c ? c.getObjects().length : 0 };
      }).catch(() => ({ ok: false }));
      if (rd && rd.ok) break;
      await page.waitForTimeout(2000);
    }
    report.phases.ready = rd || { ok: false };
    if (!(rd && rd.ok)) throw new Error("editor not ready");
    await page.waitForTimeout(4000);

    // 注入后核对：bridge marker 幂等安装（addInitScript 每次导航已自动重装）
    const injected = await page.evaluate(() => {
      const m = window.__ZY_CARD_ASSISTANT_BRIDGE__;
      return { ok: !!(m && m.installed), marker: !!(m && m.installed), typeofPageBridge: typeof pageBridge, installErr: window.__zyBridgeInstallErr || null };
    }).catch((e) => ({ ok: false, err: String(e || "").slice(0, 300) }));
    report.phases.bridgeInject = injected;
    if (!(injected && injected.ok)) throw new Error("bridge inject failed: " + JSON.stringify(injected));

    // 基线
    const pre = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const defs = (ctx && ctx.defined) || {};
      const vo = defs.CanvasObjVO || window.CanvasObjVO;
      const diy = vo.totalCanvasArray[0];
      const pageIdx = vo.currentCanvasNum - 1;
      return { canvas: diy.canvas.getObjects().length, layer: diy.canvasObjInfo.canvasToProductObjArr.length, undoLen: (vo.undoAndRedo.undo[pageIdx] || []).length, redoLen: (vo.undoAndRedo.redo[pageIdx] || []).length };
    }).catch((e) => ({ err: String(e || "").slice(0, 300) }));
    report.phases.pre = pre;

    // 发送真实 ocrCreate 消息（同 userscript 路径），等待 ocrCreateResult
    const ocrRes = await page.evaluate((items) => new Promise((resolve) => {
      const to = window.setTimeout(() => { window.removeEventListener("message", on); resolve({ ok: false, timeout: true }); }, 18000);
      const on = (e) => {
        if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === "ocrCreateResult") {
          window.clearTimeout(to); window.removeEventListener("message", on); resolve(e.data);
        }
      };
      window.addEventListener("message", on);
      window.postMessage({ source: "zy-card-assistant", type: "ocrCreate", items: items }, location.origin);
    }), TEST_ITEMS).catch((e) => ({ err: String(e || "").slice(0, 400) }));
    report.phases.ocrCreateResult = ocrRes;

    // 创建后状态（canvas / layer / 对象身份）
    const postCreate = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const defs = (ctx && ctx.defined) || {};
      const vo = defs.CanvasObjVO || window.CanvasObjVO;
      const diy = vo.totalCanvasArray[0];
      const coins = ["张三", "销售经理", "电话：13800138000"];
      const objs = diy.canvas.getObjects();
      const hit = coins.map((t) => objs.find((o) => o.text === t));
      const layers = diy.canvasObjInfo.canvasToProductObjArr;
      const layerHit = coins.map((t) => layers.find((o) => o.text === t));
      const pageIdx = vo.currentCanvasNum - 1;
      return {
        canvas: objs.length, layer: layers.length,
        textObjs: objs.filter((o) => o.type === "textbox" || o.type === "text").length,
        layerTextObjs: layers.filter((o) => o.type === "textbox" || o.type === "text").length,
        identity: hit.map((o, i) => o ? { layerIdx: layers.indexOf(o), layerNum: o.layerNum, uuid: o.uuid, multiUuid: o.multiUuid, mediaMediaType: o.mediaMediaType, fontSize: o.fontSize, left: Math.round(o.left), top: Math.round(o.top) } : null),
        undoLen: (vo.undoAndRedo.undo[pageIdx] || []).length, redoLen: (vo.undoAndRedo.redo[pageIdx] || []).length
      };
    }).catch((e) => ({ err: String(e || "").slice(0, 300) }));
    report.phases.postCreate = postCreate;

    // §二十 历史边界：OCR 批次后模拟一次用户编辑（改文本 + 原生 Undo.save 提交快照，模拟属性提交）
    const editBoundary = await page.evaluate(async () => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const defs = (ctx && ctx.defined) || {};
      const vo = defs.CanvasObjVO || window.CanvasObjVO;
      const diy = vo.totalCanvasArray[0];
      const pageIdx = vo.currentCanvasNum - 1;
      const U = defs.Undo ? defs.Undo.getInstance() : null;
      const obj = diy.canvas.getObjects().find((o) => o.text === "张三");
      let edited = null;
      if (obj) {
        try { obj.set({ text: "张三-编辑" }); } catch (e) { edited = "setErr " + String(e).slice(0, 120); }
        try { if (U && typeof U.save === "function") U.save(); } catch (e) { edited = "saveErr " + String(e).slice(0, 120); }
        edited = edited || obj.text;
      }
      await new Promise((r) => window.setTimeout(r, 600));
      return { editedOn: edited, undoLen: (vo.undoAndRedo.undo[pageIdx] || []).length, redoLen: (vo.undoAndRedo.redo[pageIdx] || []).length };
    }).catch((e) => ({ err: String(e || "").slice(0, 300) }));
    report.phases.editBoundary = editBoundary;

    // 原生撤销/重做（§二十：先撤销编辑、再撤销批次；§十八/§十九：批次撤销与整批重做）
    const undoRedo = await page.evaluate(async () => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const defs = (ctx && ctx.defined) || {};
      const vo = defs.CanvasObjVO || window.CanvasObjVO;
      const diy = vo.totalCanvasArray[0];
      const pageIdx = vo.currentCanvasNum - 1;
      const coins = ["张三", "销售经理", "电话：13800138000"];
      const editedTag = "张三-编辑";
      const snap = (tag) => {
        const objs = diy.canvas.getObjects();
        const layers = diy.canvasObjInfo.canvasToProductObjArr;
        return { tag, canvas: objs.length, ocrOnCanvas: coins.filter((t) => objs.some((o) => o.text === t)).length, editOnCanvas: objs.some((o) => o.text === editedTag), layer: layers.length, ocrInLayer: coins.filter((t) => layers.some((o) => o.text === t)).length, undoLen: (vo.undoAndRedo.undo[pageIdx] || []).length, redoLen: (vo.undoAndRedo.redo[pageIdx] || []).length };
      };
      const clickBtn = (sel) => { const $b = window.jQuery(sel).filter(":visible").first(); if ($b.length) { $b.trigger("click"); return "clicked"; } return "no-btn"; };
      const res = [snap("beforeUndo")];
      res.push({ tag: "undoClick", action: clickBtn(".undo") });
      await new Promise((r) => window.setTimeout(r, 1400));
      res.push(snap("afterUndo1"));          // 期望：编辑被撤销（张三-编辑→张三），批次仍在（画布 12）
      res.push({ tag: "undoClick2", action: clickBtn(".undo") });
      await new Promise((r) => window.setTimeout(r, 1400));
      res.push(snap("afterUndo2"));          // 期望：批次整体撤销（画布 9，模板保留）
      res.push({ tag: "redoClick", action: clickBtn(".redo") });
      await new Promise((r) => window.setTimeout(r, 1400));
      res.push(snap("afterRedo1"));          // 期望：批次整批恢复（画布 12、图层、身份）
      res.push({ tag: "redoClick2", action: clickBtn(".redo") });
      await new Promise((r) => window.setTimeout(r, 1400));
      res.push(snap("afterRedo2"));          // 期望：编辑重放（张三→张三-编辑）
      return res;
    });
    report.phases.undoRedo = undoRedo;

    await page.waitForTimeout(1000);
    // 清理：恢复基线
    const cleanup = await page.evaluate((args) => {
      const pre = args.pre;
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const defs = (ctx && ctx.defined) || {};
      const vo = defs.CanvasObjVO || window.CanvasObjVO;
      const diy = vo.totalCanvasArray[0];
      const pageIdx = vo.currentCanvasNum - 1;
      const coins = ["张三", "销售经理", "电话：13800138000", "张三-编辑"];
      const out = {};
      let removed = 0;
      diy.canvas.getObjects().filter((o) => coins.indexOf(o.text) >= 0).forEach((o) => {
        const i = diy.canvasObjInfo.canvasToProductObjArr.indexOf(o);
        if (i >= 0) diy.canvasObjInfo.canvasToProductObjArr.splice(i, 1);
        diy.canvas.remove(o); removed += 1;
      });
      diy.canvas.requestRenderAll();
      out.removed = removed;
      out.final = { canvas: diy.canvas.getObjects().length, layer: diy.canvasObjInfo.canvasToProductObjArr.length };
      try {
        const ua = vo.undoAndRedo.undo[pageIdx]; if (Array.isArray(ua) && ua.length > pre.undoLen) ua.length = pre.undoLen;
        const ra = vo.undoAndRedo.redo[pageIdx]; if (Array.isArray(ra) && ra.length > pre.redoLen) ra.length = pre.redoLen;
        out.undoRestored = { undoLen: (vo.undoAndRedo.undo[pageIdx] || []).length, redoLen: (vo.undoAndRedo.redo[pageIdx] || []).length };
      } catch (e) { out.undoRestored = "err " + String(e).slice(0, 120); }
      return out;
    }, { pre }).catch((e) => ({ err: String(e || "").slice(0, 300) }));
    report.phases.cleanup = cleanup;

    // 指标
    const r = ocrRes;
    const pc = postCreate;
    const ur = undoRedo || [];
    const eb = editBoundary;
    report.metrics = {
      modeNative: !!(r && r.editorIntegration && r.editorIntegration.mode === "native"),
      ok: !!(r && r.ok),
      createdEqualsBlocks: !!(r && r.createdCount === TEST_ITEMS.length && r.detectedBlocks === TEST_ITEMS.length),
      canvasTextEqualsLayerText: !!(pc && pc.textObjs === pc.layerTextObjs),
      allRegisteredAsLayer: !!(pc && pc.identity && pc.identity.every((x) => x && x.layerIdx >= 0)),
      // §二十（1）undo1 先撤编辑：张三-编辑→张三，批次保留（画布 12、3 对象全在图层）
      undo1ReversesEdit: !!(ur[2] && ur[2].canvas === 12 && ur[2].ocrOnCanvas === 3 && ur[2].ocrInLayer === 3 && ur[2].editOnCanvas === false && ur[2].undoLen === 2 && ur[2].redoLen === 1),
      // §十八 undo2 撤批次：画布 9 = 模板基线，图层 1，模板保留
      undo2RemovesBatch: !!(ur[4] && ur[4].canvas === 9 && ur[4].ocrOnCanvas === 0 && ur[4].layer === 1 && ur[4].ocrInLayer === 0),
      // §十九 redo1 恢复同一批：画布 12、3 对象与图层一致
      redoRestoresBatch: !!(ur[6] && ur[6].canvas === 12 && ur[6].ocrOnCanvas === 3 && ur[6].ocrInLayer === 3 && ur[6].redoLen === 1),
      // §二十（2）redo2 编辑重放（原生语义：再 undo 先撤编辑、批次仍整体）
      editBoundaryHooked: !!(eb && eb.editedOn === "张三-编辑" && eb.undoLen === 3),
      templateIntact: !!(cleanup && cleanup.final && cleanup.final.canvas === pre.canvas && cleanup.final.layer === pre.layer)
    };
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.stack || e).slice(0, 700));
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1));
    console.log("report -> " + REPORT_PATH);
    console.log("  [inject] " + JSON.stringify(report.phases.bridgeInject || {}).slice(0, 220));
    console.log("  [ocrRes] " + JSON.stringify(report.phases.ocrCreateResult || {}).slice(0, 520));
    console.log("  [postCreate] " + JSON.stringify(report.phases.postCreate || {}).slice(0, 520));
    console.log("  [undoRedo] " + JSON.stringify(report.phases.undoRedo || {}).slice(0, 700));
    console.log("  [cleanup] " + JSON.stringify(report.phases.cleanup || {}).slice(0, 300));
    console.log("  [metrics] " + JSON.stringify(report.metrics));
    if (report.errors && report.errors.length) console.log("  [errors] " + report.errors.join(" ;; "));
  }
})();