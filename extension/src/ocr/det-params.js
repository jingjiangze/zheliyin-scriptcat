// =====================================================================
// 折立印名片套版助手 - PP-OCRv6 det 参数与调优逻辑（Stage 12 M2：参数调优内核）
// ---------------------------------------------------------------------
// 职责（单一职责）：det 后处理参数（thresh / boxThresh / unclipRatio / limitSideLen /
// limitType / maxSideLimit / minSize / maxCandidates）的
//   A. 校验与夹紧（validateDetParams）
//   B. 依据「模型档位 + 场景 + 图像/内容提示」确定性派生参数并给出可解释理由（resolveDetParams）
//   C. 离线网格调优（tuneDetParams）+ 评价指标（detBoxIoU / scoreDetBoxes）
// 设计原则：
//   - 参数不是拍脑袋常量：每条调整都带 reason（{param, from, to, rule}），可审计、可复现；
//   - 调优逻辑是纯函数：不读像素、不发网络；真实调优由 tuneDetParams 在离线样本上做网格搜索；
//   - 与 PaddleOCR 参数同名同义（同名参数可直接对照官方文档）。
// 依赖：本模块自包含；网格搜索的默认执行器由调用方注入 postprocess（node 测试传
//       db-det-postprocess.dbDetPostprocess；沙箱内可直接引用全局同名函数）。
// 纯函数、自包含（无 require、无 DOM/网络）。
// =====================================================================
"use strict";

// ---- A1. 模型档位基线（tier 差异：tiny 置信度整体偏低 → boxThresh 下调避免丢真行） ----
var DET_TIER_PRESETS = {
  tiny: { thresh: 0.3, boxThresh: 0.55, unclipRatio: 1.5, limitSideLen: 640, limitType: "min", maxSideLimit: 4000, minSize: 3, maxCandidates: 300 },
  small: { thresh: 0.3, boxThresh: 0.6, unclipRatio: 1.5, limitSideLen: 736, limitType: "min", maxSideLimit: 4000, minSize: 3, maxCandidates: 500 },
  medium: { thresh: 0.3, boxThresh: 0.6, unclipRatio: 1.6, limitSideLen: 736, limitType: "min", maxSideLimit: 4000, minSize: 3, maxCandidates: 1000 }
};
var DET_DEFAULT_TIER = "small";

// ---- A2. 参数取值域（越界即夹紧并记录 reason） ----
var DET_PARAM_BOUNDS = {
  thresh: [0.1, 0.9],
  boxThresh: [0.2, 0.95],
  unclipRatio: [0, 2.5],
  limitSideLen: [320, 1536],
  maxSideLimit: [1000, 4000],
  minSize: [1, 10],
  maxCandidates: [10, 3000]
};

// ---- A3. 场景增量（叠在 tier 基线之上；card 为名片默认） ----
var DET_SCENARIOS = {
  card: {},
  dense: { limitSideLen: 960, unclipRatio: 1.6, maxCandidates: 1000 },
  tilted: { unclipRatio: 1.7, minSize: 4 },
  qrNoise: { thresh: 0.35, boxThreshDelta: 0.05, maxCandidates: 1000 },
  lowContrast: { thresh: 0.25, boxThreshDelta: -0.05 }
};

function detIsNum(v) { return typeof v === "number" && isFinite(v); }
function detClamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function detRound2(v) { return Math.round(v * 100) / 100; }

// ---- B1. 校验与夹紧 ----
function validateDetParams(input) {
  var src = input || {};
  var base = DET_TIER_PRESETS[src.tier] || DET_TIER_PRESETS[DET_DEFAULT_TIER];
  var params = {};
  var errors = [];
  var clamped = [];
  var keys = ["thresh", "boxThresh", "unclipRatio", "limitSideLen", "maxSideLimit", "minSize", "maxCandidates"];
  keys.forEach(function (k) {
    var v = detIsNum(src[k]) ? src[k] : base[k];
    var b = DET_PARAM_BOUNDS[k];
    if (!b) { params[k] = v; return; }
    var c = detClamp(v, b[0], b[1]);
    if (c !== v) clamped.push({ param: k, from: v, to: c, rule: "det-bound-clamp" });
    params[k] = c;
  });
  params.limitType = src.limitType === "max" ? "max" : (src.limitType === "min" ? "min" : base.limitType);
  params.scoreMode = "fast"; // 仅实现 fast（见 db-det-postprocess 声明）
  var badType = Object.keys(src).filter(function (k) {
    return keys.indexOf(k) >= 0 && src[k] != null && !detIsNum(src[k]);
  });
  badType.forEach(function (k) { errors.push({ param: k, error: "NOT_NUMBER" }); });
  return { ok: errors.length === 0, params: params, errors: errors, clamped: clamped };
}

// ---- B2. 确定性派生（调优逻辑主体） ----
// input: {
//   tier: "tiny"|"small"|"medium",
//   scenario: "card"|"dense"|"tilted"|"qrNoise"|"lowContrast",
//   imageWidth, imageHeight,          // 原图自然尺寸（决定缩放与上限预算）
//   expectedTextHeight,               // 可选：原图内预估行高（px）；有则由「目标最小行高 16px」反推缩放
//   lowContrast, qrNoise,             // 可选布尔提示（等价于 scenario 的显式写法）
//   override                          // 可选：人工/UI 覆盖（最后应用）
// }
// 输出：{ params, reasons:[{param, from, to, rule}], tier, scenario, targetScale }
var DET_TARGET_TEXT_HEIGHT = 16; // det 输入侧期望最小行高（px）：低于此值的名片小字需放大后再检测
var DET_MAX_UPSCALE = 2.5;

function resolveDetParams(input) {
  var o = input || {};
  var tier = DET_TIER_PRESETS[o.tier] ? o.tier : DET_DEFAULT_TIER;
  var reasons = [];
  var params = Object.assign({}, DET_TIER_PRESETS[tier]);
  var put = function (param, to, rule) {
    var from = params[param];
    if (from === to) return;
    params[param] = to;
    reasons.push({ param: param, from: from, to: to, rule: rule });
  };
  // B2-1 场景增量
  var scenarioNames = [];
  if (o.scenario && DET_SCENARIOS[o.scenario]) scenarioNames.push(o.scenario);
  if (o.lowContrast) scenarioNames.push("lowContrast");
  if (o.qrNoise) scenarioNames.push("qrNoise");
  scenarioNames.forEach(function (name) {
    var sc = DET_SCENARIOS[name];
    Object.keys(sc).forEach(function (k) {
      if (k === "boxThreshDelta") put("boxThresh", detRound2(params.boxThresh + sc[k]), "scenario:" + name);
      else put(k, sc[k], "scenario:" + name);
    });
  });
  var minSide = Math.min(o.imageWidth || 0, o.imageHeight || 0);
  var maxSide = Math.max(o.imageWidth || 0, o.imageHeight || 0);
  // B2-2 小字放大：targetScale = 16 / expectedTextHeight（1 ~ 2.5），反推 limitSideLen
  var targetScale = 1;
  if (detIsNum(o.expectedTextHeight) && o.expectedTextHeight > 0) {
    targetScale = detClamp(DET_TARGET_TEXT_HEIGHT / o.expectedTextHeight, 1, DET_MAX_UPSCALE);
    if (minSide > 0) {
      put("limitSideLen", Math.round(detClamp(minSide * targetScale, DET_PARAM_BOUNDS.limitSideLen[0], DET_PARAM_BOUNDS.limitSideLen[1])), "small-text-upscale");
    }
    if (o.expectedTextHeight < 18) {
      put("unclipRatio", Math.max(params.unclipRatio, 1.7), "small-text-unclip");
      put("boxThresh", detRound2(Math.max(DET_PARAM_BOUNDS.boxThresh[0], params.boxThresh - 0.05)), "small-text-box-thresh");
    } else if (o.expectedTextHeight >= 40) {
      put("unclipRatio", Math.min(params.unclipRatio, 1.4), "large-text-unclip");
    }
  }
  // B2-3 图像尺寸预算：放大后长边不得越 maxSideLimit（提前夹紧，避免 planDetResize 静默降级）
  if (minSide > 0 && maxSide > 0 && params.limitType === "min" && minSide < params.limitSideLen) {
    var scale = params.limitSideLen / minSide;
    if (maxSide * scale > params.maxSideLimit) {
      var fit = Math.floor(params.maxSideLimit * minSide / maxSide);
      put("limitSideLen", fit, "max-side-limit-fit");
      reasons.push({ param: "maxSideLimit", from: params.maxSideLimit, to: params.maxSideLimit, rule: "max-side-limit-kept", note: "limitSideLen 已按预算下调" });
    }
  }
  // B2-4 大比例放大时抬高 minSize（放大后的噪点块也随之变大）
  if (targetScale >= 2) put("minSize", Math.max(params.minSize, 4), "heavy-upscale-min-size");
  // B2-5 人工覆盖 → 校验夹紧
  if (o.override && typeof o.override === "object") {
    Object.keys(o.override).forEach(function (k) {
      if (k === "limitType") { put("limitType", o.override[k] === "max" ? "max" : "min", "override"); return; }
      if (!detIsNum(o.override[k])) return;
      var b = DET_PARAM_BOUNDS[k];
      var v = b ? detClamp(o.override[k], b[0], b[1]) : o.override[k];
      put(k, v, b && v !== o.override[k] ? "override-clamped" : "override");
    });
  }
  var v = validateDetParams(Object.assign({}, params, { tier: tier }));
  return { params: v.params, reasons: reasons, clamped: v.clamped, errors: v.errors, tier: tier, scenario: scenarioNames, targetScale: targetScale };
}

// ---- C1. 指标：AABB IoU ----
function detBoxIoU(a, b) {
  if (!a || !b) return 0;
  var ax2 = a.x + a.width, ay2 = a.y + a.height;
  var bx2 = b.x + b.width, by2 = b.y + b.height;
  var ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  var iy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  var inter = ix * iy;
  var union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

// ---- C2. 指标：框集合 vs 真值（贪心匹配；micro 汇总） ----
function scoreDetBoxes(boxes, truth, opts) {
  var o = opts || {};
  var iouThreshold = detIsNum(o.iouThreshold) ? o.iouThreshold : 0.5;
  // 形状兼容：det 内核输出 {aabb}，下游候选用 {bbox}，也接受裸矩形 {x,y,width,height}
  var boxesArr = (boxes || []).map(function (b) {
    if (b && b.aabb) return b.aabb;
    if (b && b.bbox) return b.bbox;
    return b;
  }).filter(function (b) { return b && detIsNum(b.x) && detIsNum(b.y) && detIsNum(b.width) && detIsNum(b.height); });
  var truthArr = (truth || []).filter(Boolean);
  var pairs = [];
  boxesArr.forEach(function (bb, bi) {
    truthArr.forEach(function (tt, ti) {
      var iou = detBoxIoU(bb, tt);
      if (iou >= iouThreshold) pairs.push({ bi: bi, ti: ti, iou: iou });
    });
  });
  pairs.sort(function (p, q) { return q.iou - p.iou; });
  var usedB = {}, usedT = {}, matched = [];
  pairs.forEach(function (p) {
    if (usedB[p.bi] || usedT[p.ti]) return;
    usedB[p.bi] = 1; usedT[p.ti] = 1;
    matched.push(p);
  });
  var tp = matched.length;
  var fp = boxesArr.length - tp;
  var fn = truthArr.length - tp;
  var precision = (tp + fp) > 0 ? tp / (tp + fp) : (truthArr.length === 0 ? 1 : 0);
  var recall = (tp + fn) > 0 ? tp / (tp + fn) : 1;
  var f1 = (precision + recall) > 0 ? 2 * precision * recall / (precision + recall) : 0;
  return { tp: tp, fp: fp, fn: fn, precision: detRound2(precision), recall: detRound2(recall), f1: detRound2(f1), matched: matched };
}

// ---- C3. 离线网格调优 ----
// opts: {
//   samples: [{ id, truth:[aabb], probMap, dims, resize?:(planDetResize 结果), imageSize? }],
//   space:   { thresh:[...], boxThresh:[...], unclipRatio:[...], minSize:[...] },   // 仅列需要搜索的维度
//   base:    { tier?, ... }                                                         // 基线（默认 small 档）
//   run:     可选注入 (sample, params) => boxes（默认用 postprocess + mapDetBoxesToImage）
//   postprocess: 可选注入 dbDetPostprocess（沙箱内可省略：直接取全局同名函数）
//   iouThreshold: 默认 0.5；maxCombos: 组合上限，默认 5000
// }
// 输出：{ ok, evaluated, iouThreshold, space, best, ranked:[{params, tp, fp, fn, precision, recall, f1, perSample}] }
function tuneDetParams(opts) {
  var o = opts || {};
  var samples = (o.samples || []).filter(Boolean);
  var space = o.space || {};
  var keys = Object.keys(space).filter(function (k) { return Array.isArray(space[k]) && space[k].length; });
  if (!samples.length || !keys.length) return { ok: false, errorCode: "TUNE_INPUT_EMPTY", evaluated: 0, ranked: [], best: null, space: space };
  var maxCombos = detIsNum(o.maxCombos) ? o.maxCombos : 5000;
  var combos = [{}];
  keys.forEach(function (k) {
    var next = [];
    combos.forEach(function (c) {
      space[k].forEach(function (v) {
        var cc = Object.assign({}, c);
        cc[k] = v;
        next.push(cc);
      });
    });
    combos = next;
  });
  if (combos.length > maxCombos) return { ok: false, errorCode: "TUNE_SPACE_TOO_LARGE", evaluated: 0, space: space, combos: combos.length, ranked: [], best: null };
  var base = o.base || {};
  var post = typeof o.postprocess === "function" ? o.postprocess : (typeof dbDetPostprocess === "function" ? dbDetPostprocess : null);
  var run = typeof o.run === "function" ? o.run : function (sample, params) {
    if (!post || !sample.probMap || !sample.dims) return [];
    var r = post(sample.probMap, sample.dims, params);
    if (!r.ok) return [];
    return sample.resize ? mapDetBoxesToImage(r.boxes, sample.resize, sample.imageSize) : r.boxes;
  };
  var ranked = combos.map(function (combo) {
    var v = validateDetParams(Object.assign({}, base, combo));
    var agg = { tp: 0, fp: 0, fn: 0 };
    var perSample = samples.map(function (sample) {
      var boxes = run(sample, v.params) || [];
      var s = scoreDetBoxes(boxes, sample.truth || [], { iouThreshold: o.iouThreshold });
      agg.tp += s.tp; agg.fp += s.fp; agg.fn += s.fn;
      return { id: sample.id != null ? sample.id : null, tp: s.tp, fp: s.fp, fn: s.fn, f1: s.f1 };
    });
    var precision = (agg.tp + agg.fp) > 0 ? agg.tp / (agg.tp + agg.fp) : 1;
    var recall = (agg.tp + agg.fn) > 0 ? agg.tp / (agg.tp + agg.fn) : 1;
    var f1 = (precision + recall) > 0 ? 2 * precision * recall / (precision + recall) : 0;
    return {
      params: v.params,
      combo: combo,
      tp: agg.tp, fp: agg.fp, fn: agg.fn,
      precision: detRound2(precision), recall: detRound2(recall), f1: detRound2(f1),
      perSample: perSample,
      signature: keys.map(function (k) { return v.params[k]; }).join("|")
    };
  });
  ranked.sort(function (a, b) {
    if (b.f1 !== a.f1) return b.f1 - a.f1;
    if (b.precision !== a.precision) return b.precision - a.precision;
    if (b.recall !== a.recall) return b.recall - a.recall;
    return a.signature < b.signature ? -1 : (a.signature > b.signature ? 1 : 0);
  });
  return { ok: true, evaluated: ranked.length, iouThreshold: detIsNum(o.iouThreshold) ? o.iouThreshold : 0.5, space: space, best: ranked[0], ranked: ranked };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  DET_TIER_PRESETS: DET_TIER_PRESETS,
  DET_DEFAULT_TIER: DET_DEFAULT_TIER,
  DET_PARAM_BOUNDS: DET_PARAM_BOUNDS,
  DET_SCENARIOS: DET_SCENARIOS,
  DET_TARGET_TEXT_HEIGHT: DET_TARGET_TEXT_HEIGHT,
  validateDetParams: validateDetParams,
  resolveDetParams: resolveDetParams,
  detBoxIoU: detBoxIoU,
  scoreDetBoxes: scoreDetBoxes,
  tuneDetParams: tuneDetParams
};