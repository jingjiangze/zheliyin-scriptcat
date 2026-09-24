// runtime/stage12/db-det-postprocess.test.js — Stage 12 M1：PP-OCRv6 det 后处理内核单测
// 覆盖：尺寸规划/反变换、二值化严格大于语义、连通域、最小外接矩形、评分门、minSize 门、
//       unclip 解析式外扩、阅读顺序排序、候选上限、45° 斜行角度、空图稳健。
"use strict";
const assert = require("assert");
const D = require("../../extension/src/ocr/db-det-postprocess.js");

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed += 1; }
  catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); }
}
const CH_VAL = { "#": 0.9, "+": 0.6, x: 0.62, ".": 0.05 };
function emptyGrid(w, h) { const g = []; for (let y = 0; y < h; y += 1) g.push(new Array(w).fill(".")); return g; }
function paint(g, x, y, w, h, ch) { for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) g[y + j][x + i] = ch; }
function toProb(g) {
  const h = g.length, w = g[0].length;
  // 夹具用 float64：使「prob === thresh」边界可被精确验证（float32 存储会引入表示误差）
  const map = new Float64Array(w * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) map[y * w + x] = CH_VAL[g[y][x]] != null ? CH_VAL[g[y][x]] : 0.05;
  return { probMap: map, dims: { width: w, height: h } };
}
function gridWith(ch, x, y, bw, bh, gw, gh) { const g = emptyGrid(gw, gh); paint(g, x, y, bw, bh, ch); return toProb(g); }
const P = (ov) => Object.assign({ thresh: 0.3, boxThresh: 0.6, unclipRatio: 0, minSize: 3, maxCandidates: 1000 }, ov || {});
const near = (a, b, eps) => Math.abs(a - b) < (eps == null ? 1e-6 : eps);

// ---- T1 单矩形：几何/评分/角度 ----
t("T1 单矩形 → 1 框，aabb 与像素外框一致、score≈0.9、angle=0", () => {
  const { probMap, dims } = gridWith("#", 2, 2, 8, 4, 12, 8);
  const r = D.dbDetPostprocess(probMap, dims, P());
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.boxes.length, 1);
  const b = r.boxes[0];
  assert.deepStrictEqual(b.aabb, { x: 1.5, y: 1.5, width: 8, height: 4 });
  assert.ok(near(b.score, 0.9), "score=" + b.score);
  assert.strictEqual(b.polygon.length, 4);
  assert.ok(near(b.rect.angle, 0), "angle=" + b.rect.angle);
  assert.strictEqual(r.meta.kept, 1);
});

// ---- T2 评分门（boxThresh） ----
t("T2 弱信号块（0.6）在 boxThresh=0.7 下被剔除（low-score）", () => {
  const { probMap, dims } = gridWith("+", 2, 2, 8, 4, 12, 8);
  const r = D.dbDetPostprocess(probMap, dims, P({ boxThresh: 0.7 }));
  assert.strictEqual(r.boxes.length, 0);
  assert.ok(r.dropped.some((d) => d.reason === "low-score"));
  assert.ok(near(r.dropped[0].score, 0.6), "droppedScore=" + r.dropped[0].score);
});

// ---- T3 minSize 门 ----
t("T3 2x2 小块在 minSize=3 下被剔除（too-small）", () => {
  const { probMap, dims } = gridWith("#", 2, 2, 2, 2, 8, 8);
  const r = D.dbDetPostprocess(probMap, dims, P());
  assert.strictEqual(r.boxes.length, 0);
  assert.ok(r.dropped.some((d) => d.reason === "too-small"));
});

// ---- T4 unclip 解析式外扩：d = A*r/P ----
t("T4 unclipRatio=1.5 → 8x4 块外扩 d=(32*1.5)/24=2 → 12x8", () => {
  const { probMap, dims } = gridWith("#", 2, 2, 8, 4, 14, 10);
  const r = D.dbDetPostprocess(probMap, dims, P({ unclipRatio: 1.5 }));
  assert.strictEqual(r.boxes.length, 1);
  const b = r.boxes[0];
  assert.ok(near(b.delta, 2), "delta=" + b.delta);
  assert.ok(near(b.aabb.width, 12), "w=" + b.aabb.width);
  assert.ok(near(b.aabb.height, 8), "h=" + b.aabb.height);
  assert.ok(near(b.aabb.x, -0.5) && near(b.aabb.y, -0.5), "origin=" + JSON.stringify(b.aabb));
});

// ---- T5 阅读顺序排序（y → x）+ 多连通域 ----
t("T5 两块 → 2 框并按 y 排序（order 0/1）", () => {
  const g = emptyGrid(12, 14);
  paint(g, 2, 2, 8, 4, "#");
  paint(g, 2, 8, 8, 4, "#");
  const { probMap, dims } = toProb(g);
  const r = D.dbDetPostprocess(probMap, dims, P());
  assert.strictEqual(r.boxes.length, 2);
  assert.ok(near(r.boxes[0].aabb.y, 1.5) && near(r.boxes[1].aabb.y, 7.5));
  assert.deepStrictEqual([r.boxes[0].order, r.boxes[1].order], [0, 1]);
  assert.strictEqual(r.meta.components, 2);
});

// ---- T6 45° 斜行：最小外接矩形给角度，AABB 近似正方 ----
t("T6 45° 斜带 → angle≈±45°，aabb 近似正方（宽度受旋转影响）", () => {
  const g = emptyGrid(14, 14);
  for (let y = 0; y < 14; y += 1) for (let x = 0; x < 14; x += 1) if (Math.abs(x - y) <= 1) g[y][x] = "#";
  const { probMap, dims } = toProb(g);
  const r = D.dbDetPostprocess(probMap, dims, P({ minSize: 1, unclipRatio: 1.5 }));
  assert.strictEqual(r.boxes.length, 1);
  const b = r.boxes[0];
  assert.ok(Math.abs(Math.abs(b.rect.angle) - Math.PI / 4) < 0.05, "angle=" + b.rect.angle);
  assert.ok(b.aabb.width > 15, "width=" + b.aabb.width);
  assert.ok(Math.abs(b.aabb.width - b.aabb.height) < 3, "w=" + b.aabb.width + " h=" + b.aabb.height);
});

// ---- T7 尺寸规划 + 反变换 ----
t("T7 planDetResize(600,400,min 736) → scale 1.84 / 1104x736；mapDetBoxesToImage 还原原图坐标", () => {
  const rs = D.planDetResize(600, 400, { limitSideLen: 736, limitType: "min" });
  assert.strictEqual(rs.ok, true);
  assert.ok(near(rs.scale, 1.84), "scale=" + rs.scale);
  assert.strictEqual(rs.width, 1104);
  assert.strictEqual(rs.height, 736);
  assert.strictEqual(rs.reason, "UPSCALE_MIN_SIDE");
  const boxes = [{ order: 0, polygon: [{ x: 184, y: 92 }, { x: 920, y: 92 }, { x: 920, y: 184 }, { x: 184, y: 184 }], rect: { angle: 0 }, score: 0.9, area: 1 }];
  const mapped = D.mapDetBoxesToImage(boxes, rs, { width: 600, height: 400 });
  assert.deepStrictEqual(mapped[0].bbox, { x: 100, y: 50, width: 400, height: 50 });
  assert.strictEqual(mapped[0].coordinateSpace, "image-pixel");
  assert.deepStrictEqual(mapped[0].imageSize, { width: 600, height: 400 });
});

// ---- T8 max_side_limit 兜底压缩 ----
t("T8 planDetResize(6000,1000) → 长边受 maxSideLimit 压缩到 4000，maxClamped=true", () => {
  const rs = D.planDetResize(6000, 1000, { limitSideLen: 736, limitType: "min" });
  assert.strictEqual(rs.maxClamped, true);
  assert.strictEqual(rs.width, 4000);
  assert.strictEqual(rs.height, 667);
  assert.ok(rs.reason.indexOf("MAX_SIDE_CLAMP") >= 0);
});

// ---- T9 候选上限（按评分保留高分） ----
t("T9 maxCandidates=2 → 4 块只保留 2，其余进 dropped(max-candidates)", () => {
  const g = emptyGrid(20, 12);
  paint(g, 1, 1, 8, 4, "#");
  paint(g, 11, 1, 8, 4, "#");
  paint(g, 1, 7, 8, 4, "#");
  paint(g, 11, 7, 8, 4, "#");
  const { probMap, dims } = toProb(g);
  const r = D.dbDetPostprocess(probMap, dims, P({ maxCandidates: 2 }));
  assert.strictEqual(r.boxes.length, 2);
  assert.strictEqual(r.dropped.filter((d) => d.reason === "max-candidates").length, 2);
});

// ---- T10 二值化严格大于（prob === thresh 不算前景） ----
t("T10 thresh=0.6 时 prob=0.6 的块不入选（严格 > 语义）", () => {
  const { probMap, dims } = gridWith("+", 2, 2, 8, 4, 12, 8);
  const r = D.dbDetPostprocess(probMap, dims, P({ thresh: 0.6, boxThresh: 0.5 }));
  assert.strictEqual(r.boxes.length, 0);
  assert.strictEqual(r.meta.components, 0);
});

// ---- T11 空图/非法输入稳健 ----
t("T11 空图 ok=true/0 框；probMap 非法 → PROB_MAP_INVALID", () => {
  const { probMap, dims } = toProb(emptyGrid(10, 10));
  const r = D.dbDetPostprocess(probMap, dims, P());
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.boxes.length, 0);
  assert.strictEqual(r.meta.components, 0);
  const bad = D.dbDetPostprocess(null, dims, P());
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.errorCode, "PROB_MAP_INVALID");
});

console.log("db-det-postprocess.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);