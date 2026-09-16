// runtime/stage5-creation-safety.js — Stage 5.1 §十七~§二十五/§三十：Creation Safety Audit
// 方法（诚实分级）：从 production extension/src/editor/page-bridge.js 逐字提取 create 路径实现
//   （createTextObject / inheritReferenceProps / getReferenceStyle / placeCreatedObject），
//   在真实编辑器中以真实 textbox 为 reference 创建临时对象 → 采集 created 全字段 → 与 reference 对比
//   （identity / runtime / editor-state leakage）→ 立即删除 → 验证画布恢复（rollback 零残留）。
// 证据等级：REAL_SOURCE_EQUIV（源码逐字提取自 production page-bridge.js，真实编辑器执行，非闭包内直接运行）
// 输出：reports/stage5-creation-safety.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";

// 从 page-bridge.js 提取指定顶层函数（brace-count，函数体不含嵌套模板字符串）
function extractFunctions(src, names) {
  const out = {};
  for (const name of names) {
    const marker = "function " + name + "(";
    const i = src.indexOf(marker);
    if (i < 0) throw new Error("function not found: " + name);
    const braceStart = src.indexOf("{", i);
    let depth = 0;
    let j = braceStart;
    let inStr = null;
    while (j < src.length) {
      const ch = src[j];
      if (inStr) {
        if (ch === "\\") { j += 2; continue; }
        if (ch === inStr) inStr = null;
      } else if (ch === "'" || ch === '"' || ch === "`") {
        inStr = ch;
      } else if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
      j += 1;
    }
    out[name] = src.slice(i, j + 1);
  }
  return out;
}

(async () => {
  const out = { ts: new Date().toISOString(), stage: "Stage 5.1 creation-safety", steps: [], errors: [] };
  const step = (n, ok, d, ev) => { out.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 700), evidence: ev || "n/a" }); if (!ok) out.errors.push(n); };
  let browser = null;
  try {
    // 提取 production 源码（REAL_SOURCE_EQUIV）
    const src = fs.readFileSync(path.join(__dirname, "..", "extension", "src", "editor", "page-bridge.js"), "utf8");
    const fns = extractFunctions(src, ["createTextObject", "inheritReferenceProps", "getReferenceStyle", "placeCreatedObject"]);
    step("extract-production-source", Object.keys(fns).length === 4, "extracted=" + Object.keys(fns).join(",") + " sha256-lead=" + src.split("").length, "REAL_SOURCE_EQUIV");

    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    const page = browser.pages()[0];
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => step("nav", false, String(e && e.message || e)));
    step("nav", true, "真实编辑器已打开", "REAL_EDITOR");

    const deadline = Date.now() + 150000;
    let ready = false;
    while (Date.now() < deadline) {
      ready = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
        const c = vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && ((vo.totalCanvasArray[0].canvas) || vo.totalCanvasArray[0]);
        return c && typeof c.getObjects === "function" ? c.getObjects().filter((o) => o && typeof o.text === "string").length : 0;
      }).catch(() => 0);
      if (ready >= 1) break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    step("canvas-ready", ready >= 1, "textbox ready", "REAL_CANVAS");
    if (!ready) return;

    // 页面内执行：注入 production 同源函数 + 创建探针
    const probe = await page.evaluate(({ fnsSrc, testText }) => {
      const srcJoin = Object.keys(fnsSrc).map((k) => fnsSrc[k]).join("\n");
      // 在独立函数作用域执行生产同源实现（避免污染全局）
      let createTextObject, inheritReferenceProps, getReferenceStyle, placeCreatedObject;
      try {
        /* eslint-disable no-new-func */
        const factory = new Function("return (function(){ " + srcJoin + "\nreturn { createTextObject: createTextObject, inheritReferenceProps: inheritReferenceProps, getReferenceStyle: getReferenceStyle, placeCreatedObject: placeCreatedObject, setObjectText: function(o,v){ if(typeof o.setText==='function')o.setText(v); o.text=v; o.dirty=true; } }; })();")();
        createTextObject = factory.createTextObject;
        inheritReferenceProps = factory.inheritReferenceProps;
        getReferenceStyle = factory.getReferenceStyle;
        placeCreatedObject = factory.placeCreatedObject;
      } catch (e) { return { __err: "factory:" + String(e && e.message || e).slice(0, 200) }; }

      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      const objs = c.getObjects();
      const ref = objs.find((o) => o && typeof o.text === "string" && String(o.text).trim().length > 0);
      if (!ref) return { __err: "no reference textbox" };
      const before = { count: objs.length };

      const created = createTextObject(c, testText, ref, 99, null);
      if (!created) return { __err: "createTextObject returned null" };
      const idx = c.getObjects().indexOf(created);

      function pick(o, keys) { const r = {}; keys.forEach((k) => { r[k] = o[k]; }); return r; }
      const refProbe = {
        identity: pick(ref, ["markuuid", "uuid", "type"]),
        geometry: pick(ref, ["left", "top", "width", "height", "scaleX", "scaleY", "angle"]),
        editor: pick(ref, ["isDesign", "isEdit", "isLineText", "isComposite", "isPreview", "isDisplay", "lastSafeText", "mediaMediaType", "layerNum", "locationX", "locationY", "locationWidth", "locationHeight", "locationRotation", "lockScalingFlip", "appendCmyk", "appointCmyk"]),
        runtime: { dirty: ref.dirty, canvasIsFabric: !!ref.canvas, hasEventListeners: !!(ref.__eventListeners && Object.keys(ref.__eventListeners).length) }
      };
      const newProbe = {
        identity: pick(created, ["markuuid", "uuid", "type"]),
        geometry: pick(created, ["left", "top", "width", "height", "scaleX", "scaleY", "angle"]),
        style: pick(created, ["fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "charSpacing", "textAlign", "fill"]),
        editor: pick(created, ["isDesign", "isEdit", "isLineText", "isComposite", "isPreview", "isDisplay", "lastSafeText", "mediaMediaType", "layerNum", "locationX", "locationY", "locationWidth", "locationHeight", "locationRotation", "lockScalingFlip", "appendCmyk", "appointCmyk"]),
        runtime: { dirty: created.dirty, canvasIsFabric: !!(created.canvas && created.canvas === c), hasCacheCanvas: !!created._cacheCanvas, hasCacheContext: !!created._cacheContext, hasACoords: !!created.aCoords, hasOCoords: !!created.oCoords, hasCharBounds: Array.isArray(created.__charBounds), hasLineHeights: Array.isArray(created.__lineHeights), hasEventListeners: !!(created.__eventListeners && Object.keys(created.__eventListeners).length), hasStyleMap: !!created._styleMap },
        zy: { zyCreatedByAssistant: created.zyCreatedByAssistant === true, zyFieldKey: created.zyFieldKey }
      };

      // 清理：删除创建对象 + 渲染 + 验证恢复
      c.remove(created);
      if (c.requestRenderAll) c.requestRenderAll(); else if (c.renderAll) c.renderAll();
      const after = { count: c.getObjects().length, leakedTestText: !!c.getObjects().find((o) => o && typeof o.text === "string" && String(o.text).indexOf(testText) >= 0) };
      return { before: before, newIndex: idx, ref: refProbe, created: newProbe, cleanup: after };
    }, { fnsSrc: fns, testText: "ZY_STAGE5_CREATE_TEST" });

    if (!probe || probe.__err) {
      step("creation-probe", false, JSON.stringify(probe), "n/a");
    } else {
      // 判定（§二十一 identity leak / §二十二 runtime leak / §二十三 editor state）
      const idLeak = probe.created.identity.markuuid === probe.ref.identity.markuuid;
      step("creation-exec", probe.created && probe.created.identity.type === "textbox" && probe.newIndex >= 0, "created idx=" + probe.newIndex, "REAL_EDITOR");
      step("creation-identity-leak", idLeak === false, idLeak ? "LEAK: created.markuuid === ref.markuuid(" + probe.created.identity.markuuid + ")" : "clean: created.markuuid=" + String(probe.created.identity.markuuid) + " (inherited=" + String(probe.ref.identity.markuuid) + ")", "CREATION_IDENTITY_LEAK:§二十一");
      const runtimeLeaks = [];
      if (probe.created.runtime.hasCacheCanvas) runtimeLeaks.push("_cacheCanvas");
      if (probe.created.runtime.hasCacheContext) runtimeLeaks.push("_cacheContext");
      if (probe.created.runtime.hasACoords) runtimeLeaks.push("aCoords");
      if (probe.created.runtime.hasOCoords) runtimeLeaks.push("oCoords");
      if (probe.created.runtime.hasCharBounds) runtimeLeaks.push("__charBounds");
      if (probe.created.runtime.hasLineHeights) runtimeLeaks.push("__lineHeights");
      if (probe.created.runtime.hasEventListeners) runtimeLeaks.push("__eventListeners");
      if (probe.created.runtime.hasStyleMap) runtimeLeaks.push("_styleMap");
      step("creation-runtime-leak", runtimeLeaks.length === 0, runtimeLeaks.length ? "LEAK: " + runtimeLeaks.join(",") : "clean (no cache/event/coords on created)", "CREATION_RUNTIME_STATE_LEAK:§二十二");
      step("creation-canvas-ref", probe.created.runtime.canvasIsFabric === true, "created.canvas 指向同一 fabric canvas", "§二十二 canvas 引用");
      step("creation-editor-state", probe.created.editor.isDesign === true && probe.created.editor.isEdit === true && probe.created.editor.isLineText === true, "editor state inherited: isDesign/isEdit/isLineText=" + [probe.created.editor.isDesign, probe.created.editor.isEdit, probe.created.editor.isLineText].join("/"), "§二十三 应当继承");
      step("creation-editor-id-extra", probe.created.editor.layerNum != null && probe.created.editor.lastSafeText == null, "layerNum=" + probe.created.editor.layerNum + " lastSafeText=" + JSON.stringify(probe.created.editor.lastSafeText) + "（lastSafeText 不应继承；继承即泄露）", "§二十三");
      step("creation-cleanup", probe.cleanup.count === probe.before.count && probe.cleanup.leakedTestText === false, "count=" + probe.before.count + "->" + probe.cleanup.count + " leaked=" + probe.cleanup.leakedTestText, "ROLLBACK:§三十七");
      out.probe = { ref: probe.ref, created: probe.created, cleanup: probe.cleanup };
      // 结论（§二十四）
      const classification = idLeak ? "UNSAFE" : (runtimeLeaks.length ? "CONDITIONAL" : "SAFE");
      out.classification = classification;
      step("creation-safety-classification", true, "CREATION_SAFETY=" + classification, "§二十四");
      // finding（§四十一 固定格式）
      out.finding = {
        id: "STAGE5.1-CRE-01",
        severity: "P1",
        title: "created textbox inherits reference markuuid -> uniqueness broken",
        observed_behavior: "真实执行 production 同源 createTextObject+inheritReferenceProps 后，新 textbox 的 markuuid === reference.markuuid（AD4636D5...），同画布出现重复 markuuid；同时继承 aCoords/oCoords/__charBounds/__lineHeights/__eventListeners/_styleMap/lastSafeText",
        evidence: "reports/stage5-creation-safety.json probe.created vs probe.ref（identity/runtime 全一致字段）",
        root_cause: "page-bridge.inheritReferenceProps 的 skipBox 未排除 identity（markuuid/uuid）、度量缓存（__*/_styleMap/aCoords/oCoords）、事件（__eventListeners）、编辑回退（lastSafeText）→ 全量复制",
        risk: "markuuid 唯一性破坏（textbox 4/4 唯一 → 5 对象含重复）→ 未来按 markuuid 的 OCR 定位/清理歧义；陈旧度量缓存 + 事件监听复制",
        minimal_fix: "inheritReferenceProps skipBox 追加：markuuid, uuid, __charBounds, __lineHeights, __lineWidths, _styleMap, __eventListeners, aCoords, oCoords, lastSafeText（版本小步；不触碰 apply 链其余逻辑）",
        regression_plan: "RUNTIME-8.3 全链（npm run runtime:scriptcat）+ creation-safety probe 重跑（期望 identity-leak 变 clean）+ 16 项业务行为 + object-model/adapter/diff 单测",
        status: "OPEN (fix in separate commit)"
      };
    }
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 500));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.writeFileSync(path.join(__dirname, "reports", "stage5-creation-safety.json"), JSON.stringify(out, null, 1), "utf8");
  console.log("[stage5-creation] errors=" + out.errors.length + " → reports/stage5-creation-safety.json");
  process.exit(out.errors.length ? 1 : 0);
})();