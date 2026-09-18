// tests/editor-object-model/textblock-fields.test.js — Stage 7.8 §五/§十三/§十七~§十九：TextBlock 富字段单测
// 覆盖：provider/sourceProvider、rawText/safeText（经 sanitizer）、sanitize 诊断、
//       bboxHeight/estimatedTextHeight/sizeCluster/sizeConfidence（经 size-analyzer）、
//       依赖缺失时安全降级（safeText=text、无 size 字段）。
"use strict";
const path = require("path");
const cn = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "candidate-normalizer.js"));
const st = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "ocr-text-sanitizer.js"));
const sa = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "ocr-size-analyzer.js"));
const { buildTextBlocks } = cn;

const results = [];
const failures = [];
function t(name, cond, detail) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "")); }

function C(text, x, y, w, h) {
  return { text: text, bbox: { x: x, y: y, width: w, height: h }, confidence: 0.92, sourceProvider: "BAIDU", imageSize: { width: 800, height: 600 } };
}

// ---- 降级模式（无全局 sanitize/size 依赖）----
const deg = buildTextBlocks([C("纯文本", 10, 10, 120, 36), C("第二行", 10, 60, 120, 36)]);
t("deg.safeText-fallback", deg[0].safeText === "纯文本\n第二行" && deg[0].rawText === "纯文本\n第二行", JSON.stringify(deg[0]));
t("deg.sanitize-null", deg[0].sanitize === null);
t("deg.no-size-fields", deg[0].sizeCluster === undefined && deg[0].sizeConfidence === undefined);
t("deg.provider", deg[0].provider === "BAIDU" && deg[0].sourceProvider === "BAIDU");
t("deg.bboxHeight", deg[0].bboxHeight === 86 && deg[0].estimatedTextHeight === 36, JSON.stringify(deg[0]));

// ---- 富字段模式（挂全局 sanitize/classifySize）----
const prevSan = global.sanitizeOcrText;
const prevCls = global.classifySize;
global.sanitizeOcrText = st.sanitizeOcrText;
global.classifySize = sa.classifySize;
try {
  const rich = buildTextBlocks([
    C("VIP\u200b俱乐部", 10, 10, 160, 40),   // 含零宽字符（将被清洗）
    C("普通正文", 10, 70, 120, 18),
    C("小字标注", 10, 100, 80, 18)
  ]);
  t("rich.safeText-cleaned", rich[0].safeText === "VIP俱乐部" && rich[0].rawText === "VIP\u200b俱乐部", JSON.stringify(rich[0]));
  t("rich.sanitize-detail", rich[0].sanitize && rich[0].sanitize.changed === true && rich[0].sanitize.removed === 1 && rich[0].sanitize.blockedCount === 1, JSON.stringify(rich[0].sanitize));
  t("rich.changed-candidates", rich[1].safeText === "普通正文\n小字标注" && rich[1].sanitize.changed === false, JSON.stringify(rich[1]));
  // size：标题 40 vs 块中位（块级 median([40,18])≈29）→ ratio 1.38 → LARGE；正文 18 → SMALL（像素无关相对分类）
  t("rich.size-cluster-title", rich[0].sizeCluster === "LARGE" && rich[0].sizeRatio > 1, JSON.stringify(rich[0]));
  t("rich.size-cluster-body", rich[1].sizeCluster === "SMALL", JSON.stringify(rich[1]));
  t("rich.distinct-title-body", rich[0].sizeCluster !== rich[1].sizeCluster);
  t("rich.size-fields", typeof rich[0].sizeRatio === "number" && typeof rich[0].sizeConfidence === "number" && rich[0].estimatedHeightPx === 40, JSON.stringify(rich[0]));
  t("rich.normalizedTextHeight", rich[0].normalizedTextHeight === 0.07, JSON.stringify(rich[0].normalizedTextHeight));
  t("rich.estimatedTextHeight-vs-bbox", rich[0].estimatedTextHeight === 40 && rich[0].bboxHeight === 40);
  // merged block 两行（同字号 18）：estimatedTextHeight = 行高中位 18
  const mergedTall = buildTextBlocks([C("甲", 10, 10, 120, 36), C("乙", 10, 60, 120, 36)]);
  t("rich.merged-med-height", mergedTall[0].estimatedTextHeight === 36 && mergedTall[0].sizeCluster === "MEDIUM");

  // ---- LOCAL 打标（unifyCandidates opts.sourceProvider → buildTextBlocks 透传）----
  const localUnified = cn.unifyCandidates([{ text: "本地文本", bbox: { x0: 0, y0: 0, x1: 80, y1: 24 } }], { width: 200, height: 150 }, { sourceProvider: "LOCAL" });
  const lb = buildTextBlocks(localUnified);
  t("local.tag-passthrough", lb[0].provider === "LOCAL" && lb[0].sourceProvider === "LOCAL", JSON.stringify(lb[0]));
} finally {
  if (prevSan === undefined) delete global.sanitizeOcrText; else global.sanitizeOcrText = prevSan;
  if (prevCls === undefined) delete global.classifySize; else global.classifySize = prevCls;
}

// ---- 恢复降级（清理后不再有 size 字段）----
const deg2 = buildTextBlocks([C("结算", 10, 10, 80, 24)]);
t("deg.cleanup", deg2[0].safeText === "结算" && deg2[0].sizeCluster === undefined);

console.log(results.join("\n"));
failures.forEach((f) => console.log("  > " + f));
console.log("textblock-fields: " + (failures.length ? failures.length + " FAILURES" : "ALL PASS"));
process.exit(failures.length ? 1 : 0);