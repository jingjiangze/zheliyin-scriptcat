// =====================================================================
// 折立印名片套版助手 - OCR Provider Adapter（Stage 5.5 §十/§十一）
// ---------------------------------------------------------------------
// 统一 provider 接口：recognize(image, ctx) -> Promise<{provider, candidates, meta}>
// candidates: [{text, bbox{x,y,width,height}, confidence, rotation?, coordinateSpace:"image-pixel"}]
// Provider 与 mapper/matcher/reconstruction 解耦（§十）；换 Native/Local/Remote 不改重建代码。
// 实现：
//   - createTesseractProvider()：Local OCR（页面内 Tesseract.js 引擎，调用方传入 ctx.engine=window.Tesseract
//     及已加载的 worker-lang；引擎加载与 CSP 注入策略（GM_addElement / CDN script）由调用层负责）
//   - createFixtureProvider(list)：确定性回归（保留，§十一）
// 约束：不负责网络/密钥上传；bbox 为图片像素坐标（coordinateSpace="image-pixel"，由 ImageMapper 再转 Canvas）。
// =====================================================================
"use strict";

// tesseract word {text, confidence, bbox:{x0,y0,x1,y1}} → OCRCandidate
function normalizeBBox(wordObj, imageW, imageH) {
  const b = wordObj && wordObj.bbox;
  if (!b || [b.x0, b.y0, b.x1, b.y1].some((v) => typeof v !== "number" || !isFinite(v))) return null;
  const x = Math.min(b.x0, b.x1);
  const y = Math.min(b.y0, b.y1);
  const rect = { x: x, y: y, width: Math.abs(b.x1 - b.x0), height: Math.abs(b.y1 - b.y0) };
  if (rect.width <= 0 || rect.height <= 0) return null;
  const confidence = typeof wordObj.confidence === "number" ? Math.min(1, Math.max(0, wordObj.confidence / 100)) : null;
  return {
    text: String(wordObj.text || "").trim(),
    bbox: rect,
    confidence: confidence,
    rotation: typeof wordObj.rotation === "number" ? wordObj.rotation : null,
    coordinateSpace: "image-pixel",
    imageSize: { width: imageW, height: imageH }
  };
}

// Local OCR provider（调用方需保证 ctx.engine=window.Tesseract、ctx.worker 已创建；lang 默认 chi_sim）
function createTesseractProvider(opts) {
  const o = opts || {};
  const lang = o.lang || "chi_sim";
  return {
    provider: "tesseract-" + lang,
    providerType: "LOCAL",
    recognize: async function (image, ctx) {
      const engine = (ctx && ctx.engine) || (typeof window !== "undefined" && window.Tesseract) || null;
      if (!engine) return { provider: this.provider, providerType: "LOCAL", error: { errorCode: "ENGINE_NOT_LOADED", errorMessage: "Tesseract 未加载（需要 GM_addElement/CDN 注入）" }, candidates: [], meta: {} };
      const t0 = Date.now();
      let worker = ctx && ctx.worker;
      let owned = false;
      if (!worker) {
        worker = await engine.createWorker(lang, 1, o.workerOptions || {});
        owned = true;
      }
      const { data } = await worker.recognize(image);
      if (owned) await worker.terminate();
      const imageW = (data && data.imageWidth) || (o.imageWidth) || 0;
      const imageH = (data && data.imageHeight) || (o.imageHeight) || 0;
      const words = data && data.words ? data.words : [];
      const lines = data && data.lines ? data.lines : [];
      const candidates = words.map((w) => normalizeBBox(w, imageW, imageH)).filter((c) => c && c.text && c.bbox);
      // 行级归一（§三十五：重建按行 → 每行一个 textbox）
      const lineCandidates = lines.map((l) => normalizeBBox(l, imageW, imageH)).filter((c) => c && c.text && c.bbox);
      return {
        provider: this.provider,
        providerType: "LOCAL",
        candidates: candidates,
        meta: { imageWidth: imageW, imageHeight: imageH, elapsed: Date.now() - t0, rawWordCount: words.length, lines: lineCandidates }
      };
    }
  };
}

// Fixture provider（确定性回归，§十一）
function createFixtureProvider(fixtureList) {
  const list = Array.isArray(fixtureList) ? fixtureList : [];
  return {
    provider: "fixture",
    providerType: "FIXTURE",
    recognize: async function (image, ctx) {
      return {
        provider: "fixture",
        providerType: "FIXTURE",
        candidates: list.map((c) => ({
          text: String(c.text || ""),
          bbox: { x: c.x, y: c.y, width: c.width, height: c.height },
          confidence: c.confidence != null ? c.confidence : null,
          rotation: c.rotation != null ? c.rotation : null,
          coordinateSpace: "image-pixel",
          imageSize: c.imageSize || null
        })),
        meta: { imageWidth: (ctx && ctx.imageWidth) || null, imageHeight: (ctx && ctx.imageHeight) || null, elapsed: 0, rawWordCount: list.length }
      };
    }
  };
}

if (typeof module !== "undefined" && module.exports) module.exports = { normalizeBBox, createTesseractProvider, createFixtureProvider };