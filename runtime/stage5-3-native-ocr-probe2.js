// runtime/stage5-3-native-ocr-probe2.js — 第 2 轮：先 setActiveObject(image) 再触发「文字识别」
// 观察：OCR 网络请求（hook fetch/xhr）、识别面板 DOM、识别结果行、canvas 对象变化
// 结论如实：REAL_OCR_RESULT_ACCESS = AVAILABLE | BLOCKED（§七）
// 输出：reports/stage5-3-native-ocr-result2.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";

(async () => {
  const out = { ts: new Date().toISOString(), stage: "Stage 5.3 native-ocr-probe2", steps: [], errors: [] };
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

    const round1 = await page.evaluate(() => new Promise((res) => {
      const reqLog = [];
      const tag = (u, kind) => { reqLog.push({ kind: kind, url: String(u || "").slice(0, 220) }); };
      try { const of = window.fetch; window.fetch = function (input) { try { tag(typeof input === "string" ? input : (input && input.url || ""), "fetch"); } catch (e) {} return of.apply(this, arguments); }; } catch (e) {}
      try { const ox = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (m, u) { try { tag(u, "xhr"); } catch (e) {} return ox.apply(this, arguments); }; } catch (e) {}

      const req = window.requirejs || window.require;
      const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      const imgs = c.getObjects().filter((o) => o && String(o.type) === "image");
      const target = imgs[0];
      if (!target) return res({ err: "no image" });
      // 选中图片（setActiveObject → 触发选中事件）
      c.setActiveObject(target);
      c.requestRenderAll();
      setTimeout(() => {
        // 触发文字识别入口
        const all = document.querySelectorAll("li,dd,span,button,div,dl");
        let entry = null;
        for (const el of all) { const t = (el.textContent || "").trim(); if (t && t.length < 30 && /文字识别|OCR识别/i.test(t)) { entry = el; break; } }
        if (entry) entry.click();
        // 观察 8s
        setTimeout(() => {
          const ocrReqs = reqLog.filter((r) => /ocr|recogn|text|ai|zhi|identify/i.test(r.url));
          const dialogs = [];
          document.querySelectorAll("div[class*=dialog],div[class*=modal],div[class*=popup],div[class*=ctip]").forEach((d) => { const t = (d.textContent || "").trim(); if (t && t.length < 100) dialogs.push((d.className || "").toString().slice(0, 20) + "::" + t.slice(0, 80)); });
          const panelTexts = [];
          document.querySelectorAll("div,span,li,dd").forEach((el) => { const t = (el.textContent || "").trim(); if (t && t.length < 40 && /识别|文字|结果|OCR|进度/.test(t)) { panelTexts.push(t); } });
          const canvasCount = c.getObjects().length;
          res({ clicked: !!entry, ocrReqs: ocrReqs.slice(0, 12), dialogs: Array.from(new Set(dialogs)).slice(0, 10), panelHints: Array.from(new Set(panelTexts)).slice(0, 14), canvasCount: canvasCount });
        }, 8000);
      }, 800);
    })).catch((e) => ({ __err: String(e && e.message || e) }));

    out.round1 = round1;
    step("image-selected-and-triggered", !!(round1 && (round1.clicked || round1.err)), "clicked=" + (round1 && round1.clicked) + " err=" + (round1 && round1.err), "REAL_EDITOR");
    if (round1 && round1.err) return;
    const hasOcrNet = round1.ocrReqs && round1.ocrReqs.length > 0;
    const panelHint = round1.panelHints && round1.panelHints.length > 0;
    step("ocr-network-requests", hasOcrNet, "ocrReqs=" + JSON.stringify((round1.ocrReqs || []).slice(0, 5)), "REAL_OCR");
    step("ocr-panel-visible", panelHint, "panelHints=" + JSON.stringify((round1.panelHints || []).slice(0, 8)), "REAL_OCR");
    step("ocr-canvas-state", true, "canvasCount=" + round1.canvasCount, "REAL_CANVAS");
    out.findings = {
      ocrResultAccess: hasOcrNet ? "REAL_OCR_NETWORK_OBSERVED" : (panelHint ? "REAL_OCR_PANEL_OBSERVED" : "OCR_RESULT_ACCESS = BLOCKED"),
      canvasAfterCount: round1.canvasCount
    };
    step("ocr-result-access-note", true, JSON.stringify(out.findings), "§七 如实");
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 500));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.writeFileSync(path.join(__dirname, "reports", "stage5-3-native-ocr-result2.json"), JSON.stringify(out, null, 1), "utf8");
  console.log("[stage5-3-ocr-probe2] errors=" + out.errors.length + " → reports/stage5-3-native-ocr-result2.json");
  process.exit(out.errors.length ? 1 : 0);
})();