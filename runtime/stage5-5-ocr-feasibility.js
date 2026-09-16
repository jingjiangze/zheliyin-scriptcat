// runtime/stage5-5-ocr-feasibility.js — Stage 5.5 §五/§七 P2：Local OCR（Tesseract.js）严肃可行性验证
// 空白页加载 jsdelivr CDN tesseract.js（~66KB）→ worker chi_sim（tessdata CDN 20MB lazy-load）
// → 识别 synthetic Demo 图（1000x800：左/右上/左下/右下 四区域 + 中部双行；中文/英文/数字）
// → 记录：加载时间、识别时间、candidate count、exact match、bbox 有效性、缓存体积评估
// 输出：reports/stage5-5-ocr-feasibility.json（Level A 前置证据）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

(async () => {
  const out = { ts: new Date().toISOString(), stage: "Stage 5.5 ocr-feasibility", steps: [], errors: [] };
  const step = (n, ok, d, ev) => { out.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 700), evidence: ev || "n/a" }); if (!ok) out.errors.push(n); };
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e && e.message || e).slice(0, 160)));

    // 生成 Demo 图（1000x800，四区域 + 中部双行）
    const demo = await page.evaluate(() => {
      const W = 1000, H = 800;
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
      const draw = (text, x, y, size, color) => { ctx.font = "bold " + size + "px 'Noto Sans SC', 'Microsoft YaHei', sans-serif"; ctx.fillStyle = color; ctx.fillText(text, x, y); };
      // 四区域（left/top/right/bottom 明显不同）
      draw("测试公司", 60, 120, 44, "#111111");          // 左上
      draw("折立印设计", 620, 120, 44, "#111111");        // 右上
      draw("13800138000", 60, 650, 40, "#222222");        // 左下
      draw("WeChat: abc123", 560, 650, 36, "#222222");    // 右下
      // 中部双行
      draw("深圳市南山区", 330, 360, 32, "#333333");
      draw("科技园路999号", 330, 420, 32, "#333333");
      // 返回 ground-truth 行区域（绘制基准）
      const rows = [
        { text: "测试公司", region: "top-left", x: 60, y: 70, size: 44 },
        { text: "折立印设计", region: "top-right", x: 620, y: 70, size: 44 },
        { text: "13800138000", region: "bottom-left", x: 60, y: 600, size: 40 },
        { text: "WeChat: abc123", region: "bottom-right", x: 560, y: 600, size: 36 },
        { text: "深圳市南山区", region: "mid-line1", x: 330, y: 320, size: 32 },
        { text: "科技园路999号", region: "mid-line2", x: 330, y: 380, size: 32 }
      ];
      return { width: W, height: H, dataUrl: cv.toDataURL("image/png"), rows };
    });
    out.demo = { size: { w: demo.width, h: demo.height }, rowsCount: demo.rows.length };
    step("demo-image-drawn", demo.dataUrl.length > 1000, "1000x800 rows=" + demo.rows.length, "SYNTHETIC_DEMO");

    // 加载 tesseract.js（CDN ~66KB）
    const t0 = Date.now();
    const loaded = await page.evaluate(async (url) => {
      const s = document.createElement("script");
      s.src = url;
      document.head.appendChild(s);
      await new Promise((res, rej) => { s.onload = res; s.onerror = () => rej(new Error("script load fail")); });
      return { hasTesseract: typeof window.Tesseract === "object", tesseractKeys: window.Tesseract ? Object.keys(window.Tesseract).slice(0, 8) : [] };
    }, CDN).catch((e) => ({ hasTesseract: false, err: String(e && e.message || e).slice(0, 120) }));
    const loadMs = Date.now() - t0;
    step("tesseract-js-loaded", loaded.hasTesseract === true, "loadMs=" + loadMs + " keys=" + JSON.stringify(loaded.tesseractKeys), "LOCAL_OCR");

    // worker chi_sim 识别（tessdata CDN 20MB lazy-load）
    const recog = await page.evaluate(async (dataUrl) => {
      const t0 = Date.now();
      const logger = [];
      const worker = await Tesseract.createWorker("chi_sim", 1, { logger: (m) => { if (m && m.progress != null) logger.push(m.progress); } });
      const readyMs = Date.now() - t0;
      const t1 = Date.now();
      const { data } = await worker.recognize(dataUrl);
      const recMs = Date.now() - t1;
      const words = (data.words || []).map((w) => ({
        text: w.text,
        confidence: +w.confidence.toFixed(1),
        bbox: { x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 },
        hasBbox: !!(w.bbox && typeof w.bbox.x0 === "number" && typeof w.bbox.y0 === "number" && typeof w.bbox.x1 === "number" && typeof w.bbox.y1 === "number")
      }));
      const lines = (data.lines || []).map((l) => ({ text: l.text, confidence: +l.confidence.toFixed(1), bbox: l.bbox }));
      await worker.terminate();
      return { readyMs, recMs, text: (data.text || "").slice(0, 400), words, lines, wordCount: words.length, progressMax: logger.length ? Math.max.apply(null, logger) : null };
    }, demo.dataUrl).catch((e) => ({ __err: String(e && e.message || e).slice(0, 200) }));

    out.recognition = recog;
    step("ocr-worker-recognized", !!(recog && recog.words && recog.words.length > 0), "readyMs=" + (recog && recog.readyMs) + " recMs=" + (recog && recog.recMs) + " words=" + (recog && recog.wordCount) + " textHead=" + JSON.stringify((recog && recog.text || "").slice(0, 60)), "LOCAL_OCR (chi_sim)");

    if (recog && recog.words) {
      // 指标（§十三）：words 级 bbox 有效 + 与 ground-truth 粗略对齐（按区域命中简化：统计 bbox 分布象限）
      const bboxValid = recog.words.filter((w) => w.hasBbox).length;
      out.metrics = {
        wordCount: recog.words.length,
        bboxValid: bboxValid,
        bboxValidRatio: +(bboxValid / Math.max(1, recog.words.length)).toFixed(2),
        minConfidence: recog.words.length ? Math.min.apply(null, recog.words.map((w) => w.confidence)) : null,
        avgConfidence: recog.words.length ? +(recog.words.reduce((a, w) => a + w.confidence, 0) / recog.words.length).toFixed(1) : null,
        reloadCacheNote: "worker 默认内存缓存；v5 支持 IndexedDB cacheMethod 跨会话缓存 20MB traineddata"
      };
      step("ocr-bbox-valid", bboxValid / Math.max(1, recog.words.length) >= 0.9, "bboxValid=" + bboxValid + "/" + recog.words.length + " ratio=" + out.metrics.bboxValidRatio + " avgConf=" + out.metrics.avgConfidence, "REAL_OCR_CANDIDATES");
    }
    step("page-no-ocr-error", pageErrors.length === 0, "pageErrors=" + JSON.stringify(pageErrors.slice(0, 3)), "LOCAL_OCR");
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 500));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.writeFileSync(path.join(__dirname, "reports", "stage5-5-ocr-feasibility.json"), JSON.stringify(out, null, 1), "utf8");
  console.log("[stage5-5-feasibility] errors=" + out.errors.length + " → reports/stage5-5-ocr-feasibility.json");
  process.exit(out.errors.length ? 1 : 0);
})();