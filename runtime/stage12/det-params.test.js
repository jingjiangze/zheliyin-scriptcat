// runtime/stage12/det-params.test.js — Stage 12 M2：det 参数派生/校验/网格调优单测
"use strict";
const assert = require("assert");
const P = require("../../extension/src/ocr/det-params.js");
const D = require("../../extension/src/ocr/db-det-postprocess.js");

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed += 1; }
  catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); }
}
const CH_VAL = { "#": 0.9, "+": 0.6, x: 0.62, ".": 0.05 };
function emptyGrid(w, h) { const g = []; for (let y = 0; y < h; y += 1) g.push(new Array(w).fill(".")); return g; }
function paint(g, x, y, w, h, ch) { for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) g[y + j][x + i] = ch; }
function gridWith(ch, bw, bh, gw, gh) {
  const g = emptyGrid(gw, gh);
  paint(g, 2, 2, bw, bh, ch);
  const w = gw, h = gh;
  // 夹具用 float64：阈值边界（0.6 vs 0.62）判定需精确可比
  const probMap = new Float64Array(w * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) probMap[y * w + x] = CH_VAL[g[y][x]] != null ? CH_VAL[g[y][x]] : 0.05;
  return { id: ch, probMap, dims: { width: w, height: h }, truth: ch === "+" ? [] : [{ x: 1.5, y: 1.5, width: 8, height: 4 }] };
}

// ---- T1 档位基线 ----
t("T1 tier 基线：tiny boxThresh 0.55 < small 0.60；medium unclipRatio 1.6", () => {
  assert.strictEqual(P.validateDetParams({ tier: "tiny" }).params.boxThresh, 0.55);
  assert.strictEqual(P.validateDetParams({ tier: "small" }).params.boxThresh, 0.6);
  assert.strictEqual(P.validateDetParams({ tier: "medium" }).params.unclipRatio, 1.6);
  assert.deepStrictEqual(P.DET_PARAM_BOUNDS.limitSideLen, [320, 1536]);
});

// ---- T2 小字放大派生（limitSideLen / unclip / boxThresh）+ 理由可解释 ----
t("T2 expectedTextHeight=12 → limitSideLen 按 16px 目标放大到 533、unclip 1.7、boxThresh 0.55", () => {
  const r = P.resolveDetParams({ tier: "small", imageWidth: 600, imageHeight: 400, expectedTextHeight: 12 });
  assert.strictEqual(r.params.limitSideLen, 533);
  assert.strictEqual(r.params.unclipRatio, 1.7);
  assert.strictEqual(r.params.boxThresh, 0.55);
  const rules = r.reasons.map((x) => x.rule);
  assert.ok(rules.indexOf("small-text-upscale") >= 0, "rules=" + rules.join(","));
  assert.ok(rules.indexOf("small-text-unclip") >= 0);
  assert.ok(rules.indexOf("small-text-box-thresh") >= 0);
});

// ---- T3 长边预算夹紧 ----
t("T3 5000x700 → limitSideLen 下调到 560（max-side-limit-fit），避免静默降级", () => {
  const r = P.resolveDetParams({ imageWidth: 5000, imageHeight: 700 });
  assert.strictEqual(r.params.limitSideLen, 560);
  assert.ok(r.reasons.map((x) => x.rule).indexOf("max-side-limit-fit") >= 0);
});

// ---- T4 大比例放大 → minSize 抬高 ----
t("T4 expectedTextHeight=6（需 2.5x 放大）→ minSize 抬到 4，limitSideLen 750", () => {
  const r = P.resolveDetParams({ imageWidth: 400, imageHeight: 300, expectedTextHeight: 6 });
  assert.strictEqual(r.params.minSize, 4);
  assert.strictEqual(r.params.limitSideLen, 750);
  assert.ok(r.reasons.map((x) => x.rule).indexOf("heavy-upscale-min-size") >= 0);
});

// ---- T5 场景增量 ----
t("T5 场景：lowContrast→thresh 0.25；qrNoise→thresh 0.35/boxThresh 0.65；dense/tilted 各自增量", () => {
  assert.strictEqual(P.resolveDetParams({ scenario: "lowContrast" }).params.thresh, 0.25);
  const qr = P.resolveDetParams({ scenario: "qrNoise" });
  assert.strictEqual(qr.params.thresh, 0.35);
  assert.strictEqual(qr.params.boxThresh, 0.65);
  const dense = P.resolveDetParams({ scenario: "dense" }).params;
  assert.strictEqual(dense.limitSideLen, 960);
  assert.strictEqual(dense.unclipRatio, 1.6);
  const tilted = P.resolveDetParams({ scenario: "tilted" }).params;
  assert.strictEqual(tilted.unclipRatio, 1.7);
  assert.strictEqual(tilted.minSize, 4);
});

// ---- T6 校验与夹紧 ----
t("T6 越界夹紧 + 非数值报错（NOT_NUMBER）", () => {
  const v = P.validateDetParams({ thresh: 2, unclipRatio: 9, minSize: 0 });
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.params.thresh, 0.9);
  assert.strictEqual(v.params.unclipRatio, 2.5);
  assert.strictEqual(v.params.minSize, 1);
  assert.strictEqual(v.clamped.length, 3);
  const bad = P.validateDetParams({ thresh: "x" });
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.errors[0].param, "thresh");
  assert.strictEqual(bad.errors[0].error, "NOT_NUMBER");
});

// ---- T7 人工覆盖（override） ----
t("T7 override 生效并同样过界夹紧（override / override-clamped）", () => {
  const r = P.resolveDetParams({ tier: "small", override: { boxThresh: 0.8, unclipRatio: 5 } });
  assert.strictEqual(r.params.boxThresh, 0.8);
  assert.strictEqual(r.params.unclipRatio, 2.5);
  const rules = r.reasons.map((x) => x.rule);
  assert.ok(rules.indexOf("override") >= 0);
  assert.ok(rules.indexOf("override-clamped") >= 0);
});

// ---- T8 IoU 与指标 ----
t("T8 detBoxIoU：同框=1 / 不相交=0 / 半重叠=0.333；scoreDetBoxes 计数正确", () => {
  assert.strictEqual(P.detBoxIoU({ x: 0, y: 0, width: 10, height: 10 }, { x: 0, y: 0, width: 10, height: 10 }), 1);
  assert.strictEqual(P.detBoxIoU({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 20, width: 5, height: 5 }), 0);
  assert.ok(Math.abs(P.detBoxIoU({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 0, width: 10, height: 10 }) - 1 / 3) < 1e-9);
  const s = P.scoreDetBoxes([{ bbox: { x: 0, y: 0, width: 10, height: 10 } }, { bbox: { x: 50, y: 50, width: 4, height: 4 } }], [{ x: 0, y: 0, width: 10, height: 10 }]);
  assert.strictEqual(s.tp, 1);
  assert.strictEqual(s.fp, 1);
  assert.strictEqual(s.fn, 0);
  assert.strictEqual(s.f1, 0.67);
  // 形状兼容：det 内核 {aabb} 与裸矩形同样可评分
  assert.strictEqual(P.scoreDetBoxes([{ aabb: { x: 0, y: 0, width: 10, height: 10 } }], [{ x: 0, y: 0, width: 10, height: 10 }]).tp, 1);
  assert.strictEqual(P.scoreDetBoxes([{ x: 0, y: 0, width: 10, height: 10 }], [{ x: 0, y: 0, width: 10, height: 10 }]).tp, 1);
});

// ---- T9 网格调优：唯一最优解 ----
t("T9 tuneDetParams：噪声块 + 弱真块混合 → 唯一最优 {thresh:0.6, boxThresh:0.5}（F1=1）", () => {
  const samples = [
    gridWith("#", 8, 4, 12, 8),   // 强真块
    gridWith("+", 8, 4, 12, 8),   // 纯噪声（真值空）
    gridWith("x", 8, 4, 12, 8)    // 弱真块（0.62，需 thresh≤0.6 才能二值化命中，且 boxThresh 不可高于 0.62）
  ];
  const r = P.tuneDetParams({
    samples,
    space: { thresh: [0.3, 0.6], boxThresh: [0.5, 0.65] },
    base: { tier: "small", thresh: 0.3, boxThresh: 0.5, unclipRatio: 0, minSize: 3 },
    postprocess: D.dbDetPostprocess
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.evaluated, 4);
  assert.strictEqual(r.best.params.thresh, 0.6);
  assert.strictEqual(r.best.params.boxThresh, 0.5);
  assert.strictEqual(r.best.f1, 1);
  assert.strictEqual(r.best.tp, 2);
  assert.strictEqual(r.best.fp, 0);
  assert.strictEqual(r.best.fn, 0);
  for (let i = 1; i < r.ranked.length; i += 1) {
    assert.ok(r.ranked[i - 1].f1 >= r.ranked[i].f1, "ranked 未按 f1 降序: " + JSON.stringify(r.ranked.map((x) => x.f1)));
  }
  const weak = r.ranked.filter((x) => x.params.boxThresh === 0.65);
  assert.ok(weak.every((x) => x.fn >= 1), "boxThresh 过高应产生漏检: " + JSON.stringify(weak.map((x) => x.fn)));
});

// ---- T10 空输入稳健 ----
t("T10 tuneDetParams 空样本/空空间 → TUNE_INPUT_EMPTY", () => {
  const r = P.tuneDetParams({ samples: [], space: { thresh: [0.3] } });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errorCode, "TUNE_INPUT_EMPTY");
  const r2 = P.tuneDetParams({ samples: [gridWith("#", 8, 4, 12, 8)], space: {} });
  assert.strictEqual(r2.ok, false);
});

console.log("det-params.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);