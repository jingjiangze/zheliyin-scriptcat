// tests/editor-object-model/ocr-provider.test.js — Stage 5.5 §十/§十一/§六十八：OCR Provider Adapter 单测（无浏览器）
"use strict";
const path = require("path");
const provider = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "ocr-provider.js"));

const results = [];
const failures = [];
function t(name, cond, detail) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "")); }

(async () => {
  // ---- normalizeBBox（tesseract word → OCRCandidate，像素坐标）----
  const n = provider.normalizeBBox({ text: "测试", confidence: 96.6, bbox: { x0: 61, y0: 79, x1: 168, y1: 142 } }, 1000, 800);
  t("norm.basic", n.text === "测试" && n.bbox.x === 61 && n.bbox.y === 79 && n.bbox.width === 107 && n.bbox.height === 63, JSON.stringify(n));
  t("norm.confidence-0-1", n.confidence === 0.966, "conf=" + n.confidence);
  t("norm.coordinateSpace", n.coordinateSpace === "image-pixel" && n.imageSize.width === 1000);
  t("norm.invalid-bbox-null", provider.normalizeBBox({ text: "x", bbox: { x0: 0 } }, 10, 10) === null);
  t("norm.zero-size-null", provider.normalizeBBox({ text: "x", bbox: { x0: 5, y0: 5, x1: 5, y1: 5 } }, 10, 10) === null);
  t("norm.reversed-coords", provider.normalizeBBox({ text: "x", bbox: { x0: 50, y0: 40, x1: 10, y1: 5 } }, 100, 100).bbox.x === 10, "reversed normalized");

  // ---- Fixture provider（确定性回归，§十一）----
  const fx = provider.createFixtureProvider([{ text: "[REDACTED_A]", x: 10, y: 20, width: 100, height: 30, confidence: 0.98 }]);
  const fxR = await fx.recognize(null, { imageWidth: 1000, imageHeight: 800 });
  t("fixture.candidates", fxR.provider === "fixture" && fxR.providerType === "FIXTURE" && fxR.candidates.length === 1, JSON.stringify(fxR.candidates));
  t("fixture.meta", fxR.meta.imageWidth === 1000 && fxR.candidates[0].coordinateSpace === "image-pixel");

  // ---- Tesseract provider：engine 缺失 → ERROR（不 throw，§六十六）----
  const tessNoEngine = await provider.createTesseractProvider().recognize("x", { engine: null });
  t("tesseract.no-engine-error", tessNoEngine.error && tessNoEngine.error.errorCode === "ENGINE_NOT_LOADED" && tessNoEngine.candidates.length === 0, JSON.stringify(tessNoEngine.error));
  t("tesseract.interface", typeof provider.createTesseractProvider().recognize === "function");

  // ---- bbox 过滤：噪音/缺框 word 被剔除，candidates 只留可用 ----
  const mockWords = [
    { text: "A", confidence: 90, bbox: { x0: 0, y0: 0, x1: 10, y1: 10 } },
    { text: "", confidence: 60, bbox: { x0: 0, y0: 0, x1: 5, y1: 5 } },
    { text: "B", confidence: 80, bbox: { x0: 0, y0: 0, x1: 0, y1: 5 } }
  ];
  const mockRecognize = async function () { return { data: { words: mockWords, imageWidth: 100, imageHeight: 100 } }; };
  const mockCreateWorker = async function () { return { recognize: mockRecognize, terminate: async function () {} }; };
  const mockEngine = { createWorker: mockCreateWorker };
  const tessMock = provider.createTesseractProvider();
  const mockResult = await tessMock.recognize("img", { engine: mockEngine });
  t("tesseract.filter", mockResult.candidates.length === 1 && mockResult.candidates[0].text === "A" && mockResult.meta.rawWordCount === 3, JSON.stringify(mockResult.candidates));

  console.log(results.join("\n"));
  console.log("ocr-provider: " + (failures.length ? failures.length + " FAILURES" : "ALL PASS"));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error("test runner error", e); process.exit(1); });