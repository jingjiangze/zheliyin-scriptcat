// tests/editor-object-model/ocr-size-analyzer.test.js — Stage 7.8 §十七~§十九：相对字号分析单测
// 覆盖：归一化、聚类分级、尺度无关性（分辨率加倍不改变 cluster）、无 imageHeight 时不硬猜、单样本兜底。
"use strict";
const path = require("path");
const sa = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "ocr-size-analyzer.js"));
const { sizeAnalyze, classifySize, CLUSTER_NAMES } = sa;

const results = [];
const failures = [];
function t(name, cond, detail) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "")); }

function mkCand(text, x, y, w, h) {
  return { text: text, bbox: { x: x, y: y, width: w, height: h }, confidence: 0.9 };
}

// ---- Fixture B 风格：大标题 40px + 小正文 18px×3（imageHeight=600）----
// 中位数 px = 18 → 标题 ratio 40/18≈2.22 → XLARGE；正文 ratio 1 → MEDIUM
const fb = [mkCand("公司名称", 10, 10, 160, 40), mkCand("张三", 10, 70, 60, 18), mkCand("13800138000", 10, 100, 120, 18), mkCand("市场部经理", 10, 130, 90, 18)];
const ra = sizeAnalyze(fb, { imageHeight: 600 });
t("B.normalized", ra.candidates[0].normalizedHeight === 0.07 && ra.candidates[1].normalizedHeight === 0.03, JSON.stringify(ra.candidates.map((c) => c.normalizedHeight)));
t("B.title-xl", ra.candidates[0].sizeCluster === "XLARGE", JSON.stringify(ra.candidates[0]));
t("B.body-med", ra.candidates[1].sizeCluster === "MEDIUM" && ra.candidates[2].sizeCluster === "MEDIUM" && ra.candidates[3].sizeCluster === "MEDIUM");
t("B.distinct-title-body", ra.candidates[0].sizeCluster !== ra.candidates[1].sizeCluster);
t("B.median", ra.medianHeightPx === 18, JSON.stringify(ra.medianHeightPx));

// ---- 尺度无关性：同一版面 2× 分辨率 → 相同的 cluster ----
const fb2 = fb.map((c) => mkCand(c.text, c.bbox.x * 2, c.bbox.y * 2, c.bbox.width * 2, c.bbox.height * 2));
const ra2 = sizeAnalyze(fb2, { imageHeight: 1200 });
t("scale.clusters-identical", ra2.candidates.map((c) => c.sizeCluster).join(",") === ra.candidates.map((c) => c.sizeCluster).join(","), JSON.stringify(ra2.candidates.map((c) => c.sizeCluster)));
t("scale.normalized-identical", ra2.candidates.every((c, i) => c.normalizedHeight === ra.candidates[i].normalizedHeight));

// ---- Fixture G 风格：同一水平线上 大字 30 + 小字 12，另一个 20（中位 20）----
const fg = [mkCand("大", 0, 0, 30, 30), mkCand("小", 40, 8, 12, 12), mkCand("中", 60, 5, 20, 20)];
const rg = sizeAnalyze(fg, { imageHeight: 200 });
t("G.big-large", rg.candidates[0].sizeCluster === "LARGE", JSON.stringify(rg.candidates[0]));
t("G.small-small", rg.candidates[1].sizeCluster === "SMALL", JSON.stringify(rg.candidates[1]));
t("G.mid-med", rg.candidates[2].sizeCluster === "MEDIUM", JSON.stringify(rg.candidates[2]));
t("G.distinct-all", new Set(rg.candidates.map((c) => c.sizeCluster)).size === 3);

// ---- 无 imageHeight：不硬猜 normalizedHeight（null），cluster 仍可算 ----
const rn = sizeAnalyze(fb, {});
t("noimg.normalized-null", rn.candidates.every((c) => c.normalizedHeight === null), JSON.stringify(rn.candidates.map((c) => c.normalizedHeight)));
t("noimg.cluster-still", rn.candidates[0].sizeCluster === "XLARGE" && rn.candidates[1].sizeCluster === "MEDIUM");
t("noimg.median-px", rn.medianHeightPx === 18);

// ---- 单样本：ratio 兜底 1 → MEDIUM ----
const one = sizeAnalyze([mkCand("独", 0, 0, 20, 20)], { imageHeight: 100 });
t("single.med", one.candidates[0].sizeCluster === "MEDIUM" && one.candidates[0].sizeRatio === 1, JSON.stringify(one.candidates[0]));

// ---- classifySize 直接调用：numeric proxy 保留 ----
const cs = classifySize(37.4, { imageHeight: 600, pageMedianHeight: 20 }); // ratio 1.87 → LARGE
t("cs.proxy", cs.estimatedHeightPx === 37.4 && typeof cs.estimatedHeightPx === "number");
t("cs.cluster", cs.sizeCluster === "LARGE", JSON.stringify(cs));
t("cs.confidence-range", cs.sizeConfidence >= 0.35 && cs.sizeConfidence <= 1);
const csNull = classifySize(null, { imageHeight: 600 });
t("cs.null-safe", csNull.sizeCluster === null && csNull.sizeConfidence === 0);

// ---- CLUSTER_NAMES 四档 ----
t("names", CLUSTER_NAMES.join(",") === "SMALL,MEDIUM,LARGE,XLARGE");

console.log(results.join("\n"));
failures.forEach((f) => console.log("  > " + f));
console.log("ocr-size-analyzer: " + (failures.length ? failures.length + " FAILURES" : "ALL PASS"));
process.exit(failures.length ? 1 : 0);