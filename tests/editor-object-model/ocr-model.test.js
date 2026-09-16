// tests/editor-object-model/ocr-model.test.js — Stage 5.2 §四十~§四十四：OCR Candidate 纯数据单测（无浏览器）
"use strict";
const path = require("path");
const ocr = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "ocr-model.js"));
const fixture = require(path.join(__dirname, "..", "fixtures", "ocr", "redacted-card-01.json"));

const results = [];
const failures = [];
function t(name, cond, detail) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "")); }

// ---- createOCRCandidate 归一 ----
const c = ocr.createOCRCandidate({ text: "13800138000", bbox: { x: 10, y: 20, width: 100, height: 30 }, confidence: 0.97, source: "fixture" });
t("ocr.text", c.text === "13800138000" && c.textLen === 11 && c.textHash8.length === 8);
t("ocr.bbox", c.bbox.x === 10 && c.bbox.y === 20 && c.bbox.width === 100 && c.bbox.height === 30);
t("ocr.confidence-clamp", ocr.createOCRCandidate({ text: "x", bbox: { x: 0, y: 0, width: 1, height: 1 }, confidence: 1.5 }).confidence === 1);
t("ocr.confidence-null", ocr.createOCRCandidate({ text: "x", bbox: { x: 0, y: 0, width: 1, height: 1 } }).confidence === null);
t("ocr.source-fallback", ocr.createOCRCandidate({ text: "x", bbox: { x: 0, y: 0, width: 1, height: 1 }, source: "weird" }).source === "fixture");
t("ocr.missing-bbox", ocr.createOCRCandidate({ text: "x" }).bbox === null);
t("ocr.0-1-bbox-fallback", ocr.createOCRCandidate({ text: "x", bbox: { x: "a", y: 0, width: 1, height: 1 } }).bbox.x === null);

// ---- isUsable ----
t("ocr.usable", ocr.isUsable(c) === true);
t("ocr.usable-empty-text", ocr.isUsable(ocr.createOCRCandidate({ text: "  ", bbox: { x: 0, y: 0, width: 1, height: 1 } })) === false);
t("ocr.usable-bad-bbox", ocr.isUsable(ocr.createOCRCandidate({ text: "x", bbox: {} })) === false);

// ---- fixture 来自真实画布区域；全部可用 ----
t("ocr.fixture-usable", fixture.candidates.every((fc) => {
  const fc2 = ocr.createOCRCandidate(fc);
  return ocr.isUsable(fc2) && fc2.textHash8.length === 8 && fc2.confidence >= 0 && fc2.confidence <= 1;
}));

// ---- OCR 与 Matcher 解耦（§四十二）：candidate 可直接喂入 matcher（同一 bbox 消息） ----
const matcher = require(path.join(__dirname, "..", "..", "extension", "src", "editor", "object-matcher.js"));
const objects = require(path.join(__dirname, "..", "fixtures", "editor-objects-52.json")).objects;
const firstOcr = ocr.createOCRCandidate(fixture.candidates[0]);
const m = matcher.match({ text: firstOcr.text, bbox: { x: firstOcr.bbox.x, y: firstOcr.bbox.y, width: firstOcr.bbox.width, height: firstOcr.bbox.height }, confidence: firstOcr.confidence, source: firstOcr.source }, objects, { canvasWidth: 619.5, canvasHeight: 376.8625 });
t("ocr.fed-to-matcher", m.status === "MATCHED" || m.status === "AMBIGUOUS" || m.status === "NOT_FOUND", m.status);

console.log(results.join("\n"));
console.log("ocr-model: " + (failures.length ? failures.length + " FAILURES" : "ALL PASS"));
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }