// =====================================================================
// 折立印名片套版助手 - OCR 相对字号分析器（Stage 7.8 §十七~§十九）
// ---------------------------------------------------------------------
// 职责单一：把「OCR bbox 高度」转换为尺度无关的「相对字号」信号，供
//   buildTextBlocks 挂到 TextBlock（bboxHeight / estimatedTextHeight /
//   sizeCluster / sizeConfidence）与质量门禁使用。
//
// 核心规则（§十九）：
//   - 禁止固定 pixel 阈值（图片分辨率不同会误判）。
//   - 使用 relative size：normalizedHeight = bbox.height / sourceImageHeight；
//     以及页面内相对中位数 ratio = height / medianHeight(同页文字分布)。
//   - 绝对高度仍保留 numeric proxy（estimatedHeightPx），绝不只留 4 个类名
//     （§十八：最终不要限制成只有 4 类）。
//   - imageHeight 缺失时不硬猜：normalizedHeight 为 null（UNKNOWN），但相对
//     中位数 ratio 仍可计算（尺度无关），cluster 照常输出。
//
// sizeCluster 带（以页面高度中位数为 1.0 的相对比值）：
//   ratio < 0.75            SMALL
//   0.75 ≤ ratio < 1.25     MEDIUM
//   1.25 ≤ ratio < 2.0      LARGE
//   ratio ≥ 2.0             XLARGE
//   （边界为初期默认，按 Fixture 1.10~1.50 实验数据再校准，§二十二；阈值可经 opts 覆盖）
//
// sizeConfidence：按 ratio 到最近聚类边界距离成比例（越靠近边界越不确定），
//   范围 0.35~1.0；样本极少（<2）时压低。
//
// 本模块为 @require 注入，纯函数可单测，不触碰 DOM/网络。
// =====================================================================
"use strict";

// 聚类带边界（相对页面高度中位数）—— 数值可经 opts.clusterEdges 覆盖（Fixture 实验）
var DEFAULT_EDGES = [0.75, 1.25, 2.0];
var CLUSTER_NAMES = ["SMALL", "MEDIUM", "LARGE", "XLARGE"];

function round2(v) {
  return Math.round(v * 100) / 100;
}

function isFinitePos(v) {
  return typeof v === "number" && isFinite(v) && v > 0;
}

function median(values) {
  var arr = values.filter(isFinitePos).sort(function (a, b) { return a - b; });
  var n = arr.length;
  if (!n) return null;
  return n % 2 ? arr[(n - 1) / 2] : (arr[n / 2 - 1] + arr[n / 2]) / 2;
}

function heightRatioBand(ratio, edges) {
  if (ratio < edges[0]) return 0;
  if (ratio < edges[1]) return 1;
  if (ratio < edges[2]) return 2;
  return 3;
}

function bandRange(band, edges) {
  var lo = band === 0 ? edges[0] / 2 : edges[band - 1];
  var hi = band === edges.length ? edges[edges.length - 1] * 2 : edges[band];
  return { lo: lo, hi: hi };
}

// ratio → 置信度：越靠近聚类边界越不确定
function ratioConfidence(ratio, edges) {
  var band = heightRatioBand(ratio, edges);
  var r = bandRange(band, edges);
  var spread = r.hi - r.lo;
  if (spread <= 0) return 1;
  var dist = Math.min(ratio - r.lo, r.hi - ratio);
  return round2(Math.min(1, Math.max(0.35, 0.5 + (dist / spread) * 0.5)));
}

// 核心：把单个「字高」（像素，建议用行高中位数）转换成相对字号信号。
// opts: {imageHeight?, pageMedianHeight?/medianNormalizedHeight?, clusterEdges?}
// 返回 {normalizedHeight, sizeRatio, sizeCluster, sizeConfidence, estimatedHeightPx}
function classifySize(height, opts) {
  var o = opts || {};
  var edges = o.clusterEdges || DEFAULT_EDGES;
  var h = height;
  var out = { estimatedHeightPx: isFinitePos(h) ? h : null };
  if (!isFinitePos(h)) { out.sizeCluster = null; out.sizeRatio = null; out.sizeConfidence = 0; out.normalizedHeight = null; return out; }
  if (isFinitePos(o.imageHeight)) out.normalizedHeight = round2(h / o.imageHeight);
  else out.normalizedHeight = null;
  var base = isFinitePos(o.pageMedianHeight) ? o.pageMedianHeight : (isFinitePos(o.medianNormalizedHeight) ? o.medianNormalizedHeight * (isFinitePos(o.imageHeight) ? o.imageHeight : 1) : null);
  var ratio = null;
  if (isFinitePos(base)) ratio = round2(h / base);
  else ratio = 1; // 单样本（无基准）：默认中位
  out.sizeRatio = ratio;
  out.sizeCluster = CLUSTER_NAMES[heightRatioBand(ratio, edges)];
  var conf = ratioConfidence(ratio, edges);
  out.sizeConfidence = conf;
  return out;
}

// 整批分析：candidates（{bbox.height, imageSize?}）→ 每候选相对字号 + 页面统计。
// 返回 {imageHeight, medianHeightPx, medianNormalizedHeight, candidates:[{index, bboxHeight, ...classifySize}]}
function sizeAnalyze(candidates, opts) {
  var o = opts || {};
  var list = Array.isArray(candidates) ? candidates : [];
  var edges = o.clusterEdges || DEFAULT_EDGES;
  var imageHeight = null;
  if (isFinitePos(o.imageHeight)) imageHeight = o.imageHeight;
  else if (list[0] && list[0].imageSize && isFinitePos(list[0].imageSize.height)) imageHeight = list[0].imageSize.height;
  var heights = list.map(function (c) { return c && c.bbox ? c.bbox.height : null; }).filter(isFinitePos);
  var medPx = median(heights);
  var per = list.map(function (c, i) {
    var h = c && c.bbox ? c.bbox.height : null;
    var base = isFinitePos(medPx) ? medPx : null;
    var rec = classifySize(h, { imageHeight: imageHeight, pageMedianHeight: base, clusterEdges: edges });
    return Object.assign({ index: i, bboxHeight: isFinitePos(h) ? h : null }, rec);
  });
  return {
    imageHeight: imageHeight,
    medianHeightPx: medPx,
    medianNormalizedHeight: imageHeight && medPx ? round2(medPx / imageHeight) : null,
    candidates: per
  };
}

if (typeof module !== "undefined" && module.exports) module.exports = { sizeAnalyze, classifySize, median, CLUSTER_NAMES, DEFAULT_EDGES };