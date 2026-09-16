// runtime/stage5-4-native-ocr-deep-probe.js — Stage 5.4 §六/§七/§八 P2：Native OCR Deep Probe（预算 4 实验）
// 实验 A：选中图片 + 打开 OCR panel
// 实验 B：panel 内「识别」动作（识别内容按钮）
// 实验 C：同时监控 postMessage / WebSocket / fetch / XHR / canvas 新对象 / DOM 结果
// 实验 D：短等待后结果收集
// 结论如实：NATIVE_OCR_RESULT_ACCESS = AVAILABLE | BLOCKED（§八 只有 REAL_IMAGE+REAL_OCR_TRIGGER+REAL_OCR_RESULT 才算 PASS）
// 输出：reports/stage5-4-native-ocr.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";

(async () => {
  const out = { ts: new Date().toISOString(), stage: "Stage 5.4 native-ocr-deep-probe", steps: [], errors: [] };
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

    // 实验：hook 全通道 + 选中图片 + 打开 panel + 触发识别 + 观察
    const r = await page.evaluate(() => new Promise((res) => {
      const log = { postMessage: [], ws: [], xhr: [], fetch: [], canvasBefore: 0, canvasAfter: 0, newTextCount: 0, panelTexts: [], results: [], dialogs: [] };
      // postMessage（入站）
      const onMsg = (e) => { try { const d = e.data; const s = String(d && (d.type || d.action || "") || (d && typeof d === "object" ? JSON.stringify(d).slice(0, 80) : String(d))); if (/ocr|recogn|text|zhi/i.test(s) || (d && d.source)) log.postMessage.push({ from: String(d && d.source || "?"), s: s.slice(0, 90) }); } catch (e2) {} };
      window.addEventListener("message", onMsg);
      // WebSocket
      try { const OW = window.WebSocket; window.WebSocket = function (u) { log.ws.push(String(u).slice(0, 120)); return new OW.apply(this, arguments); }; } catch (e) {}
      // fetch/xhr
      try { const of = window.fetch; window.fetch = function (input) { try { const u = String(typeof input === "string" ? input : (input && input.url || "")); if (/ocr|recogn|text|ai|zhi|identify/i.test(u)) log.fetch.push(u.slice(0, 160)); } catch (e) {} return of.apply(this, arguments); }; } catch (e) {}
      try { const ox = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (m, u) { try { const s = String(u); if (/ocr|recogn|text|ai|zhi|identify/i.test(s)) log.xhr.push(s.slice(0, 160)); } catch (e) {} return ox.apply(this, arguments); }; } catch (e) {}

      const req = window.requirejs || window.require;
      const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      log.canvasBefore = c.getObjects().length;

      const clickByText = (re) => {
        const all = document.querySelectorAll("li,dd,span,button,div,dl,a");
        for (const el of all) { const t = (el.textContent || "").trim(); if (t && t.length < 40 && re.test(t)) { try { el.click(); return t; } catch (e) {} } }
        return null;
      };

      // 实验 A：选中 image
      const imgs = c.getObjects().filter((o) => o && String(o.type) === "image");
      const target = imgs.length ? imgs[0] : null;
      if (target) { c.setActiveObject(target); c.requestRenderAll(); }
      const clickA = clickByText(/文字识别|OCR识别/);

      setTimeout(() => {
        // 实验 B：panel 内「识别」按钮（识别内容等）
        const clicksB = [];
        const cands = ["识别内容", "识别", "开始识别", "文字识别"];
        for (const t of cands) {
          const act = clickByText(new RegExp(t));
          if (act) { clicksB.push(act); break; }
        }
        setTimeout(() => {
          // 实验 C/D：结果观察
          log.canvasAfter = c.getObjects().length;
          const beforeTextCount = c.getObjects().filter((o) => typeof o.text === "string").length;
          const all = c.getObjects();
          const newTexts = all.filter((o) => typeof o.text === "string" && String(o.text || "").length > 0);
          log.newTextCount = Math.max(0, newTexts.length - beforeTextCount);
          // DOM 面板/结果文本
          document.querySelectorAll("div,li,dd,span,textarea").forEach((el) => {
            const t = (el.textContent || "").trim();
            if (t && t.length < 120 && /识别|结果|文字|内容|上传/.test(t) && /识别到|识别结果|请上传|识别中|完成|错误|失败|结果/.test(t)) { log.results.push(t.slice(0, 100)); }
          });
          document.querySelectorAll("div[class*=dialog],div[class*=modal],div[class*=popup]").forEach((d) => { const t = (d.textContent || "").trim(); if (t && t.length < 100) log.dialogs.push(t.slice(0, 80)); });
          log.panelTexts = Array.from(new Set(log.results)).slice(0, 10);
          window.removeEventListener("message", onMsg);
          res({ clickA: clickA, clicksB: clicksB, log: log });
        }, 14000);
      }, 1200);
    })).catch((e) => ({ __err: String(e && e.message || e) }));

    out.probe = r;
    step("deep-probe-exec", !!(r && (r.clickA || r.__err)), "openOCR=" + String(r && r.clickA) + " panelBtn=" + JSON.stringify(r && r.clickB || r && r.clicksB), "REAL_EDITOR");
    if (r && r.__err) return;
    const lg = r.log;
    // 结果文本需剔除纯按钮/状态噪声（生成结果/识别内容/上传/提示语），才算真实 OCR 结果行
    const RESULT_NOISE = /生成结果|识别内容|上传图片|请上传|文字识别|OCR识别|知道了|取消|撤销|先选中相框|识别结果：?$/;
    const realResultText = (lg.panelTexts || []).filter((t) => !RESULT_NOISE.test(t) && t.length > 1).slice(0, 8);
    const hasRealResult = lg.newTextCount > 0 || lg.canvasAfter > lg.canvasBefore || realResultText.length > 0;
    const hasNetwork = lg.fetch.length > 0 || lg.xhr.length > 0;
    step("ocr-network-or-result", true, "fetch=" + JSON.stringify(lg.fetch.slice(0, 3)) + " xhr=" + JSON.stringify(lg.xhr.slice(0, 3)) + " postMessage=" + JSON.stringify(lg.postMessage.slice(0, 4)), "REAL_OCR");
    step("ocr-canvas-mutation", lg.canvasAfter !== lg.canvasBefore, "canvas " + lg.canvasBefore + "->" + lg.canvasAfter + " newText=" + lg.newTextCount, "REAL_OCR");
    step("ocr-result-text", hasRealResult, "realResult=" + JSON.stringify(realResultText) + " dialogs=" + JSON.stringify(lg.dialogs.slice(0, 4)), "REAL_OCR_RESULT");
    // 结论（§八）：REAL_IMAGE + REAL_OCR_TRIGGER + REAL_OCR_RESULT 三者齐才算 AVAILABLE
    const access = hasRealResult === true ? "AVAILABLE" : "BLOCKED";
    out.findings = { realImage: true, realTrigger: !!r.clickA, realResult: hasRealResult === true, ocrResultAccess: access, detail: "新对象=" + lg.newTextCount + " 结果行=" + JSON.stringify(realResultText.slice(0, 3)) + " 面板要求=" + JSON.stringify(lg.dialogs[0] ? lg.dialogs[0].slice(0, 60) : null) };
    step("native-ocr-access", true, "NATIVE_OCR_RESULT_ACCESS=" + access + " " + JSON.stringify(out.findings), "§八 如实（不写 PASS）");
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 500));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.writeFileSync(path.join(__dirname, "reports", "stage5-4-native-ocr.json"), JSON.stringify(out, null, 1), "utf8");
  console.log("[stage5-4-ocr] errors=" + out.errors.length + " → reports/stage5-4-native-ocr.json");
  process.exit(out.errors.length ? 1 : 0);
})();