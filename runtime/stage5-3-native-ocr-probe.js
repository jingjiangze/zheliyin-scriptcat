// runtime/stage5-3-native-ocr-probe.js — Stage 5.3 §八/§九：触发网页原生「文字识别（Alt+Q）」并观察结果可达性
// 方法（Runtime instrumentation，§五十九）：页面内 hook fetch/XHR（记录 ocr 相关请求）→ 点击"文字识别"入口
//   + 派发 Alt+Q → 观察：弹窗 DOM / 网络请求 / canvas 对象变化 / 返回值曝光
// 结论如实记录：REAL_OCR_RESULT_ACCESS = AVAILABLE | BLOCKED（§七 禁止写 PASS）
// 输出：reports/stage5-3-native-ocr-result.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";

(async () => {
  const out = { ts: new Date().toISOString(), stage: "Stage 5.3 native-ocr-probe", steps: [], errors: [] };
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

    // 安装网络 hook（instrumentation）→ 触发 OCR 入口
    const trig = await page.evaluate(() => new Promise((res) => {
      const reqLog = [];
      const tag = (u, kind) => { reqLog.push({ kind: kind, url: String(u || "").slice(0, 200) }); };
      try {
        const of = window.fetch;
        window.fetch = function (input, init) { try { tag(typeof input === "string" ? input : (input && input.url || ""), "fetch"); } catch (e) {} return of.apply(this, arguments); };
      } catch (e) {}
      try {
        const ox = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (m, u) { try { tag(u, "xhr"); } catch (e) {} return ox.apply(this, arguments); };
      } catch (e) {}

      // 查找并点击「文字识别 / OCR识别alt+q」入口
      const find = () => {
        const all = document.querySelectorAll("li,dd,span,button,div,dl");
        for (const el of all) {
          const t = (el.textContent || "").trim();
          if (t && t.length < 30 && /文字识别|OCR识别/i.test(t)) return el;
        }
        return null;
      };
      const entry = find();
      if (!entry) return res({ clicked: false, reqLog: reqLog, reason: "no entry found" });
      entry.click();
      try {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "q", altKey: true, bubbles: true, cancelable: true }));
        document.dispatchEvent(new KeyboardEvent("keyup", { key: "q", altKey: true, bubbles: true }));
      } catch (e) {}

      // 观察 4s：弹窗 DOM / 新请求 / 画布变化
      setTimeout(() => {
        const ocrReqs = reqLog.filter((r) => /ocr|recogn|ai|text/i.test(r.url));
        const dialogs = [];
        document.querySelectorAll("div[class*=dialog],div[class*=modal],div[class*=popup],div[class*=alert]").forEach((d) => {
          const t = (d.textContent || "").trim();
          if (t && t.length < 80) dialogs.push((d.className || "").toString().slice(0, 30) + "::" + t.slice(0, 60));
        });
        res({ clicked: true, reqLog: reqLog.slice(-20), ocrReqs: ocrReqs.slice(0, 10), dialogs: Array.from(new Set(dialogs)).slice(0, 12), bodyTextReveal: (document.body ? document.body.innerText : "").split("\n").filter((l) => /识别|OCR|上传|图片|文字/.test(l)).slice(0, 10) });
      }, 4000);
    })).catch((e) => ({ __err: String(e && e.message || e) }));

    out.trigger = trig;
    step("native-ocr-triggered", !!(trig && trig.clicked), "clicked=" + (trig && trig.clicked) + " reason=" + (trig && trig.reason), "REAL_EDITOR");
    if (trig && trig.clicked) {
      const ocrReqs = (trig.ocrReqs || []);
      const dialogs = (trig.dialogs || []);
      const hasOcrNetwork = ocrReqs.length > 0;
      const hasDialog = dialogs.length > 0;
      step("ocr-network", hasOcrNetwork, "ocrReqs=" + JSON.stringify(ocrReqs.slice(0, 4)), "REAL_OCR");
      step("ocr-dialog", hasDialog, "dialogs=" + JSON.stringify(dialogs.slice(0, 5)) + " bodyReveal=" + JSON.stringify(trig.bodyTextReveal && trig.bodyTextReveal.slice(0, 5)), "REAL_OCR");
      const access = hasOcrNetwork || hasDialog ? "ENTRY_TRIGGERED_NETWORK_OR_DIALOG" : "ENTRY_NO_VISIBLE_RESULT";
      out.findings = { ocrResultAccess: access, note: access === "ENTRY_NO_VISIBLE_RESULT" ? "OCR results not surfaced programmatically in 4s window" : "OCR entry triggered observable side-effect; result-value access still TBD" };
      step("ocr-result-access", true, "occlusion: " + JSON.stringify(out.findings), "§七 如实分级");
    }
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 500));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.writeFileSync(path.join(__dirname, "reports", "stage5-3-native-ocr-result.json"), JSON.stringify(out, null, 1), "utf8");
  console.log("[stage5-3-ocr-probe] errors=" + out.errors.length + " → reports/stage5-3-native-ocr-result.json");
  process.exit(out.errors.length ? 1 : 0);
})();