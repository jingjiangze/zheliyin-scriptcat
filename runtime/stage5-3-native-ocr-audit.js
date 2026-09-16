// runtime/stage5-3-native-ocr-audit.js — Stage 5.3 §五/§六/§七 P2~P5：Native Capabilities Audit
// 真实编辑器调查四类原生能力（只读，不修改画布）：
//   A) OCR：DOM 按钮/文本、window 函数、requirejs 模块、快捷键线索（§六 问题A~E）
//   B) Image Object：raw 尺寸与 element naturalWidth/Height（ImageSource 审计，§十四）
//   C) Font：网页真实字体字符串（思源黑体 Regular 是否存在；§二十六/§六十三）
//   D) Group：fabric.FabricGroup 原生可用性 + 网页"编组"入口（§三十六/§六十四）
// 输出：reports/stage5-3-native-ocr.json（含结论：NATIVE_OCR_RESULT_ACCESS = BLOCKED|AVAILABLE 等）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";

(async () => {
  const out = { ts: new Date().toISOString(), stage: "Stage 5.3 native-capabilities-audit", steps: [], errors: [], findings: {} };
  const step = (n, ok, d, ev) => { out.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 700), evidence: ev || "n/a" }); if (!ok) out.errors.push(n); };
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
    const deadline = Date.now() + 150000;
    let ready = false;
    while (Date.now() < deadline) {
      ready = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const vo = req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO;
        return !!vo;
      }).catch(() => false);
      if (ready) break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    step("editor-ready", ready, "CanvasObjVO 就绪", "REAL_EDITOR");
    if (!ready) return;

    const scan = await page.evaluate(() => {
      const res = { ocr: {}, image: {}, font: {}, group: {} };
      // --- A. OCR 线索 ---
      const ocrTexts = [];
      document.querySelectorAll("*").forEach((el) => {
        const t = (el.textContent || "").trim();
        if (t && t.length < 40 && /识别图片|提取文字|识别文字|图片转文字|OCR|文字识别/i.test(t)) { ocrTexts.push((el.tagName + "::" + t).slice(0, 60)); }
      });
      res.ocr.domHints = Array.from(new Set(ocrTexts)).slice(0, 10);
      res.ocr.windowFn = Object.keys(window).filter((k) => /ocr|recogni|textscan|worddetect/i.test(k)).slice(0, 10);
      const req = window.requirejs || window.require;
      let defined = {};
      try { defined = req.s.contexts._.defined || {}; } catch (e) {}
      const modHints = Object.keys(defined).filter((m) => /ocr|recogni|word|text-api/i.test(m)).slice(0, 10);
      res.ocr.moduleHints = modHints.map((m) => m + ":" + typeof defined[m]);
      res.ocr.windowHasFabric = typeof window.fabric === "object";

      // --- B. Image Object audit ---
      const vo = defined.CanvasObjVO || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      const objs = c.getObjects();
      const img = objs.find((o) => o && String(o.type) === "image");
      if (img) {
        const el = img._element || img.getElement && img.getElement() || null;
        res.image.sample = {
          left: img.left, top: img.top, width: img.width, height: img.height, scaleX: img.scaleX, scaleY: img.scaleY, angle: img.angle,
          mediaImgPath: img.mediaImgPath != null ? String(img.mediaImgPath).slice(0, 40) : null,
          naturalWidth: el ? el.naturalWidth : null,
          naturalHeight: el ? el.naturalHeight : null,
          elementTag: el ? el.tagName : null,
          srcPrefix: el && el.src ? el.src.slice(0, 60) : null
        };
      } else { res.image.sample = null; }
      res.image.count = objs.filter((o) => o && String(o.type) === "image").length;

      // --- C. Font audit ---
      const fontCandidates = [];
      Object.keys(window).forEach((k) => {
        try {
          const v = window[k];
          if (typeof v === "string" && /思源|Source Han|Noto Sans/.test(v)) fontCandidates.push(k + "=" + v.slice(0, 30));
          if (Array.isArray(v)) {
            const hit = v.find((x) => typeof x === "string" && /思源黑体|Source Han Sans/i.test(x));
            if (hit) fontCandidates.push(k + "[array]=" + hit.slice(0, 40));
          }
        } catch (e) {}
      });
      // 编辑器字体面板下拉选项
      const selects = document.querySelectorAll("select, .font-select, [class*=font]");
      const optTexts = new Set();
      selects.forEach((s) => { (s.options ? Array.from(s.options) : []).forEach((o) => { if (o.text && /思源|黑体|宋体|衬线/i.test(o.text)) optTexts.add(o.text.trim().slice(0, 40)); }); });
      res.font.windowHits = Array.from(new Set(fontCandidates)).slice(0, 12);
      res.font.selectOptions = Array.from(optTexts).slice(0, 12);
      res.font.sourceHanFound = Array.from(new Set(fontCandidates.map((x) => x))).some((x) => /思源黑体/.test(x)) || Array.from(optTexts).some((x) => /思源/.test(x));

      // --- D. Group native ---
      const f = window.fabric;
      res.group.fabricGroupType = f && f.Group ? typeof f.Group : "missing";
      const groupTexts = [];
      document.querySelectorAll("*").forEach((el) => {
        const t = (el.textContent || "").trim();
        if (t && t.length < 20 && /编组|组合|成组|group/i.test(t)) groupTexts.push(el.tagName + "::" + t);
      });
      res.group.domHints = Array.from(new Set(groupTexts)).slice(0, 8);
      return res;
    }).catch((e) => ({ __err: String(e && e.message || e) }));

    out.scan = scan;
    step("native-scan", !scan.__err, "scan ok", "REAL_EDITOR");
    if (scan.__err) return;

    // 结论（§七）：原生 OCR 是否可直接复用
    const hasOcrRoute = (scan.ocr.domHints.length > 0 || scan.ocr.windowFn.length > 0 || scan.ocr.moduleHints.length > 0);
    out.findings.ocr = { domHints: scan.ocr.domHints.length, windowFn: scan.ocr.windowFn.length, moduleHints: scan.ocr.moduleHints.length, conclusion: hasOcrRoute ? "NATIVE_OCR_ENTRY_EXISTS (further result access TBD)" : "NATIVE_OCR_RESULT_ACCESS = BLOCKED (no native OCR entry observed)" };
    step("native-ocr-audit", true, JSON.stringify(out.findings.ocr) + " hints=" + JSON.stringify(scan.ocr.domHints.slice(0, 3)), "§七");
    step("native-image-audit", !!(scan.image && scan.image.sample), "images=" + JSON.stringify(scan.image && { count: scan.image.count, sample: scan.image.sample }), "§十四 ImageSource");
    step("native-font-audit", true, "sourceHanFound=" + scan.font.sourceHanFound + " windowHits=" + JSON.stringify(scan.font.windowHits.slice(0, 5)) + " selectOptions=" + JSON.stringify(scan.font.selectOptions.slice(0, 5)), "§二十六/§六十三");
    step("native-group-audit", scan.group.fabricGroupType === "function" || scan.group.fabricGroupType === "object", "fabricGroup=" + scan.group.fabricGroupType + " domHints=" + JSON.stringify(scan.group.domHints.slice(0, 3)), "§三十六/§六十四");
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 500));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.writeFileSync(path.join(__dirname, "reports", "stage5-3-native-ocr.json"), JSON.stringify(out, null, 1), "utf8");
  console.log("[stage5-3-native] errors=" + out.errors.length + " → reports/stage5-3-native-ocr.json");
  process.exit(out.errors.length ? 1 : 0);
})();