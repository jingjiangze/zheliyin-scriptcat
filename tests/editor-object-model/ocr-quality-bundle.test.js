// tests/editor-object-model/ocr-quality-bundle.test.js — Stage 7.8 §三十二/§三十三：六维质量门单测
// 覆盖：PASS 主路径、provider 来源、blocked-symbol（复用 sanitizer）、too-few-blocks、
//       large-overlap、size-anomaly、无 imageSize 时 UNKNOWN 不误杀、merge-conflict WARN。
"use strict";
const path = require("path");
const q = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "ocr-quality.js"));
const s = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "ocr-text-sanitizer.js"));
const { bundleOcrQuality } = q;

const results = [];
const failures = [];
function t(name, cond, detail) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "")); }

function C(text, x, y, w, h, extra) {
  return Object.assign({ text: text, bbox: { x: x, y: y, width: w, height: h }, confidence: 0.92, sourceProvider: "BAIDU" }, extra || {});
}
const img = { width: 800, height: 600 };

// ---- PASS 主路径 ----
const ok = bundleOcrQuality([
  C("公司名称", 10, 10, 160, 40),
  C("张三", 10, 70, 60, 18),
  C("13800138000", 10, 100, 120, 18),
  C("市场部经理", 10, 130, 90, 18)
], { imageSize: img }, { sanitize: s.sanitizeOcrText });
t("ok.overall", ok.overall === "PASS", JSON.stringify({ overall: ok.overall, reasonCode: ok.reasonCode }));
t("ok.dims", ok.textQuality.status === "PASS" && ok.blockQuality.status === "PASS" && ok.bboxQuality.status === "PASS" && ok.sizeQuality.status === "PASS" && ok.symbolQuality.status === "PASS", JSON.stringify(ok));
t("ok.provider-from-candidate", ok.provider === "BAIDU");
t("ok.merge-warn-null", ok.mergeQuality.status === "PASS");

// ---- provider 优先级：meta.provider 优先 ----
const cantNoSrc = bundleOcrQuality([
  { text: "无来源", bbox: { x: 0, y: 0, width: 60, height: 18 } }
], { provider: "LOCAL", imageSize: img }, { sanitize: s.sanitizeOcrText });
t("provider.meta-priority", cantNoSrc.provider === "LOCAL");

// ---- BLOCKED 符号 → symbolQuality FAIL → overall FAIL ----
const bad = bundleOcrQuality([
  C("联\u200b系", 10, 10, 80, 20),
  C("正常", 10, 60, 60, 18)
], { imageSize: img }, { sanitize: s.sanitizeOcrText });
t("symbol.fail", bad.symbolQuality.status === "FAIL" && bad.symbolQuality.reason === "blocked-symbol", JSON.stringify(bad.symbolQuality));
t("symbol.overall-fail", bad.overall === "FAIL" && bad.reasonCode === "blocked-symbol", JSON.stringify({ overall: bad.overall, rc: bad.reasonCode }));

// ---- too-few-blocks：单块覆盖 90% 面积 ----
const few = bundleOcrQuality([C("一个超大块", 0, 0, 760, 560)], { imageSize: img }, { sanitize: s.sanitizeOcrText });
t("few.fail", few.blockQuality.status === "FAIL" && few.reasonCode === "too-few-blocks", JSON.stringify(few.blockQuality));

// ---- large-overlap：三候选大面积互相重叠 ----
const ovl = bundleOcrQuality([
  C("甲", 10, 10, 200, 40),
  C("乙", 20, 20, 200, 40),
  C("丙", 30, 30, 200, 40)
], { imageSize: img }, { sanitize: s.sanitizeOcrText });
t("overlap.fail", ovl.blockQuality.status === "FAIL" && ovl.reasonCode === "large-overlap", JSON.stringify(ovl.blockQuality));

// ---- size-anomaly-huge：单字高 0.8×图高 ----
const huge = bundleOcrQuality([C("巨字", 0, 0, 400, 480)], { imageSize: img }, { sanitize: s.sanitizeOcrText });
t("huge.fail", huge.sizeQuality.status === "FAIL" && huge.reasonCode === "size-anomaly-huge", JSON.stringify(huge.sizeQuality));

// ---- 无 imageSize：size/bbox=UNKNOWN，不误杀 ----
const noSize = bundleOcrQuality([
  { text: "无图尺寸", bbox: { x: 0, y: 0, width: 60, height: 18 }, sourceProvider: "LOCAL" },
  { text: "第二行", bbox: { x: 0, y: 30, width: 60, height: 18 }, sourceProvider: "LOCAL" }
], {}, { sanitize: s.sanitizeOcrText });
t("nosize.dims-unknown", noSize.sizeQuality.status === "UNKNOWN" && noSize.bboxQuality.status === "UNKNOWN", JSON.stringify({ s: noSize.sizeQuality.status, b: noSize.bboxQuality.status }));
t("nosize.overall-pass", noSize.overall === "PASS", JSON.stringify({ overall: noSize.overall, rc: noSize.reasonCode }));

// ---- merge-conflict WARN：同排 y 重叠（不构成 heavy overlap）但字号比 2 → WARN（不 FAIL）----
const mc = bundleOcrQuality([
  C("大", 0, 0, 40, 40),
  C("小", 30, 20, 20, 20),
  C("另", 100, 100, 60, 18)
], { imageSize: img }, { sanitize: s.sanitizeOcrText });
t("mc.warn", mc.mergeQuality.status === "WARN" && mc.mergeQuality.reason === "merge-conflict-candidates", JSON.stringify(mc.mergeQuality));
t("mc.overall-warn", mc.overall === "WARN", JSON.stringify({ overall: mc.overall, rc: mc.reasonCode }));

// ---- 空列表早退 ----
const empty = bundleOcrQuality([], { imageSize: img }, { sanitize: s.sanitizeOcrText });
t("empty.fail", empty.overall === "FAIL" && empty.reasonCode === "empty-result");

// ---- sanitizer 缺失 → symbolQuality UNKNOWN ----
const noSan = bundleOcrQuality([
  { text: "x", bbox: { x: 0, y: 0, width: 10, height: 10 } },
  { text: "y", bbox: { x: 0, y: 20, width: 10, height: 10 } }
], { imageSize: img });
t("nosan.unknown", noSan.symbolQuality.status === "UNKNOWN" && noSan.symbolQuality.reason === "sanitizer-missing");

console.log(results.join("\n"));
failures.forEach((f) => console.log("  > " + f));
console.log("ocr-quality-bundle: " + (failures.length ? failures.length + " FAILURES" : "ALL PASS"));
process.exit(failures.length ? 1 : 0);