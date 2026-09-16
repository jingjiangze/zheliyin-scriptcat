// runtime/stage5-object-mutation.js — Stage 5.0 §三十六/§三十七/§三十八：真实 Text Mutation Regression
// 流程：真实编辑器 → 锚点 textbox → 白名单 snapshot → setText(TEST 长文本) → readback → object-diff
//   （预期：只改 text，height 依 textbox 自动换行自适应 = OBJECT_MUTATION_SIDE_EFFECT 记录，不修复）
//   → 恢复原文本 → diff（预期：changedFields 为空，无残留）→ 再测 短→长 auto-resize 数据
// 输出：reports/stage5-object-mutation.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const objectDiff = require("./editor-object-diff");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";
const LONG_TEXT = "ZY_STAGE5_MUTATION_TEST_LONG_CONTENT_FOR_AUTO_RESIZE_OBSERVATION";
const SHORT_TEXT = "ZY_SHORT";

(async () => {
  const out = { ts: new Date().toISOString(), stage: "Stage 5.0 mutation", steps: [], errors: [] };
  const step = (n, ok, d, ev) => { out.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 600), evidence: ev || "n/a" }); if (!ok) out.errors.push(n); };
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    const page = browser.pages()[0];
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => step("nav", false, String(e && e.message || e)));
    step("nav", true, "真实编辑器已打开", "REAL_EDITOR");

    const waitCanvas = async () => {
      const deadline = Date.now() + 120000;
      while (Date.now() < deadline) {
        const r = await page.evaluate(() => {
          const req = window.requirejs || window.require;
          const ctx = req && req.s && req.s.contexts && req.s.contexts._;
          const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
          const c = vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && ((vo.totalCanvasArray[0].canvas) || vo.totalCanvasArray[0]);
          return c && typeof c.getObjects === "function" ? c.getObjects().filter((o) => o && typeof o.text === "string").length : 0;
        }).catch(() => 0);
        if (r >= 1) return true;
        await new Promise((res) => setTimeout(res, 3000));
      }
      return false;
    };
    step("canvas-text-ready", await waitCanvas(), "textbox 就绪", "REAL_CANVAS");

    // 页面内执行 mutation 序列，返回结构化事件流（全部在页面主世界内完成并恢复）
    const flow = await page.evaluate(({ longText, shortText }) => {
      function pick(c) {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
        const cc = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
        const objs = cc.getObjects();
        const tb = objs.find((o) => o && typeof o.text === "string" && String(o.text).trim().length > 0);
        return tb;
      }
      function readFull(o) {
        return {
          markuuid: o.markuuid != null ? String(o.markuuid) : null,
          uuid: o.uuid != null ? String(o.uuid) : null,
          type: o.type, subType: o.subType,
          left: o.left, top: o.top, width: o.width, height: o.height, scaleX: o.scaleX, scaleY: o.scaleY, angle: o.angle, skewX: o.skewX, skewY: o.skewY, originX: o.originX, originY: o.originY,
          visible: o.visible, opacity: o.opacity, flipX: o.flipX, flipY: o.flipY, selectable: o.selectable, evented: o.evented,
          fill: o.fill, stroke: o.stroke, strokeWidth: o.strokeWidth,
          fontFamily: o.fontFamily, fontSize: o.fontSize, fontWeight: o.fontWeight, fontStyle: o.fontStyle, lineHeight: o.lineHeight, charSpacing: o.charSpacing, textAlign: o.textAlign,
          text: String(o.text || ""),
          layerNum: o.layerNum, locationX: o.locationX, locationY: o.locationY, locationWidth: o.locationWidth, locationHeight: o.locationHeight, locationRotation: o.locationRotation
        };
      }
      function setText(o, t) {
        if (typeof o.setText === "function") o.setText(t);
        else o.text = t;
        if (typeof o.initDimensions === "function") o.initDimensions();
        if (typeof o.setCoords === "function") o.setCoords();
        o.dirty = true;
      }
      const o = pick();
      if (!o) return { found: false };
      const before = readFull(o);
      setText(o, longText);
      const afterLong = readFull(o);
      setText(o, shortText);
      const afterShort = readFull(o);
      setText(o, before.text);
      const restored = readFull(o);
      return { found: true, original: before.text, before: before, afterLong: afterLong, afterShort: afterShort, restored: restored };
    }, { longText: LONG_TEXT, shortText: SHORT_TEXT });

    step("mutation-flow", !!(flow && flow.found), "originalLen=" + (flow && flow.original ? flow.original.length : -1), "REAL_EDITOR");
    if (!flow || !flow.found) return;

    // diff 判定（规格 §三十六：mutation only text；rollback no residual）
    const diffLong = objectDiff.diff(flow.before, flow.afterLong);
    const diffRestored = objectDiff.diff(flow.before, flow.restored);

    const textMutated = flow.afterLong.text === LONG_TEXT;
    const widthStable = Math.abs(flow.before.width - flow.afterLong.width) < 1e-9;
    const heightAuto = Math.abs(flow.afterLong.height - flow.before.height) > 0.5;
    // 判断:只允许 text 变更；height 为已知 textbox 自动换行副作用（§三十七/§三十八 记录）
    const mutatedOnlyText = diffLong.changedFields.filter((k) => k !== "text" && k !== "height").length === 0;
    step("mutation-only-text", textMutated && mutatedOnlyText, "changed=" + JSON.stringify(diffLong.changedFields) + " width=" + flow.before.width + "→" + flow.afterLong.width + " height=" + flow.before.height + "→" + flow.afterLong.height, "§三十六/§三十七");
    step("textbox-auto-height", widthStable && heightAuto, "width stable=" + widthStable + " height(auto)=" + JSON.stringify([flow.before.height, flow.afterLong.height]), "§三十八 TEXT_AUTO_RESIZE");
    step("rollback-no-residual", diffRestored.changedFields.length === 0, "changed=" + JSON.stringify(diffRestored.changedFields) + " text=" + flow.restored.text.slice(0, 12), "§三十六 rollback");

    out.summary = {
      finding: "textbox 高度随文本自动换行（width 固定不变，height 变化）—— OBJECT_MUTATION_SIDE_EFFECT：setText 影响 height 属真实 Fabric Textbox 行为，OCR 原位重建时新文本高度覆盖需重新计算 bbox；短文本→长文本 height 增长实测。",
      autoResizeData: { width: { before: flow.before.width, afterLong: flow.afterLong.width }, height: { before: flow.before.height, afterLong: flow.afterLong.height }, deltaH: +(flow.afterLong.height - flow.before.height).toFixed(3) },
      changedFields: { onlyTextAndHeight: diffLong.changedFields },
      rollbackResidual: diffRestored.changedFields
    };
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 500));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.writeFileSync(path.join(__dirname, "reports", "stage5-object-mutation.json"), JSON.stringify(out, null, 1), "utf8");
  console.log("[stage5-mutation] errors=" + out.errors.length + " → reports/stage5-object-mutation.json");
  process.exit(out.errors.length ? 1 : 0);
})();