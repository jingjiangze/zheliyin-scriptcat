// runtime/stage9/geometry-space.test.js — OCR-P1 Commit 4.1：统一 geometry schema + 空间转换
const path = require("path");
const assert = require("assert");
const GS = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "geometry-space.js"));

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass += 1; } catch (e) { fail += 1; console.error("FAIL " + name + ": " + String(e && e.message || e)); } }
function near(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-6); }
function nearPt(p, x, y, eps) { return near(p.x, x, eps) && near(p.y, y, eps); }

// ---- normalizeGeometry ----
t("normalize xywh", () => {
  const n = GS.normalizeGeometry({ x: 10, y: 20, width: 30, height: 40 });
  assert.deepStrictEqual({ x: n.x, y: n.y, width: n.width, height: n.height }, { x: 10, y: 20, width: 30, height: 40 });
  assert.strictEqual(n.angle, 0);
  assert.strictEqual(n.coordinateSpace, GS.SPACE_UNKNOWN);
});
t("normalize x0y0x1y1", () => {
  const n = GS.normalizeGeometry({ x0: 5, y0: 6, x1: 25, y1: 46 });
  assert.deepStrictEqual({ x: n.x, y: n.y, width: n.width, height: n.height }, { x: 5, y: 6, width: 20, height: 40 });
});
t("normalize angle wrap", () => {
  assert.strictEqual(GS.normalizeGeometry({ x: 0, y: 0, width: 1, height: 1, angle: 375 }).angle, 15);
  assert.strictEqual(GS.normalizeGeometry({ x: 0, y: 0, width: 1, height: 1, angle: -90 }).angle, -90);
});
t("normalize invalid", () => {
  assert.strictEqual(GS.normalizeGeometry(null), null);
  assert.strictEqual(GS.normalizeGeometry({ x: 0, y: 0, width: 0, height: 10 }), null);
  assert.strictEqual(GS.normalizeGeometry({ x: 1, y: 1 }), null);
  assert.strictEqual(GS.normalizeGeometry({ x0: 5, y0: 5, x1: 5, y1: 9 }), null);
});
t("normalize preserve coordinateSpace", () => {
  const n = GS.normalizeGeometry({ x: 0, y: 0, width: 2, height: 3, coordinateSpace: GS.SPACE_CANVAS });
  assert.strictEqual(n.coordinateSpace, GS.SPACE_CANVAS);
});

// ---- imageNaturalToViewport / viewportToCanvas ----
t("imageNaturalToViewport identity", () => {
  const v = GS.imageNaturalToViewport({ x: 11, y: 12, width: 33, height: 44, coordinateSpace: GS.SPACE_IMAGE_NATURAL });
  assert.strictEqual(v.coordinateSpace, GS.SPACE_IMAGE_VIEWPORT);
  assert.deepStrictEqual({ x: v.x, y: v.y, width: v.width, height: v.height }, { x: 11, y: 12, width: 33, height: 44 });
});
t("imageNaturalToViewport scale+offset", () => {
  const v = GS.imageNaturalToViewport({ x: 10, y: 20, width: 100, height: 50 }, { scaleX: 0.5, scaleY: 0.25, offsetX: 2, offsetY: 4 });
  assert.deepStrictEqual({ x: v.x, y: v.y, width: v.width, height: v.height }, { x: 7, y: 9, width: 50, height: 12.5 });
});
t("viewportToCanvas identity and injected scale", () => {
  const v = GS.viewportToCanvas({ x: 3, y: 4, width: 5, height: 6 });
  assert.deepStrictEqual({ x: v.x, y: v.y, width: v.width, height: v.height }, { x: 3, y: 4, width: 5, height: 6 });
  assert.strictEqual(v.coordinateSpace, GS.SPACE_CANVAS);
  const v2 = GS.viewportToCanvas({ x: 3, y: 4, width: 5, height: 6 }, { scaleX: 2, scaleY: 2, offsetX: 1, offsetY: 1 });
  assert.deepStrictEqual({ x: v2.x, y: v2.y, width: v2.width, height: v2.height }, { x: 7, y: 9, width: 10, height: 12 });
});

// ---- objectToCanvasAffine（CANVAS ↔ EDITOR_OBJECT）----
t("object affine 0deg translate", () => {
  const m = GS.objectToCanvasAffine({ left: 50, top: 30, width: 100, height: 40, scaleX: 1, scaleY: 1, angle: 0 });
  assert.ok([0, 1, 2, 3, 4, 5].every((i) => Math.abs(m[i] - [1, 0, 0, 1, 50, 30][i]) < 1e-9), "m=" + m);
  assert.ok(nearPt(GS.transformPoint(m, { x: 0, y: 0 }), 50, 30));
  assert.ok(nearPt(GS.transformPoint(m, { x: 100, y: 40 }), 150, 70));
});
t("object affine scale center preserved", () => {
  const m = GS.objectToCanvasAffine({ left: 0, top: 0, width: 100, height: 40, scaleX: 2, scaleY: 3, angle: 0 });
  assert.ok(nearPt(GS.transformPoint(m, { x: 50, y: 20 }), 100, 60)); // 中心 =(100*2/2,40*3/2)
});
t("object affine 90deg swaps dimensions", () => {
  const m = GS.objectToCanvasAffine({ left: 0, top: 0, width: 100, height: 40, scaleX: 1, scaleY: 1, angle: 90 });
  assert.ok(nearPt(GS.transformPoint(m, { x: 0, y: 0 }), 70, -30)); // 公式验证
  assert.ok(nearPt(GS.transformPoint(m, { x: 50, y: 20 }), 50, 20)); // 中心不变
  const xs = [0, 1, 2, 3].map((i) => {
    const q = GS.rectToQuad({ x: 0, y: 0, width: 100, height: 40 });
    const pts = [q.tl, q.tr, q.br, q.bl].map((p) => GS.transformPoint(m, p));
    return pts;
    });
  // AABB 宽高互换
  const q = GS.rectToQuad({ x: 0, y: 0, width: 100, height: 40 });
  const tr = GS.transformPoint(m, q.tr), br = GS.transformPoint(m, q.br);
  assert.ok(near(Math.abs(tr.x - br.x), 40)); // 新宽 40
  assert.ok(near(Math.abs(br.y - GS.transformPoint(m, q.tl).y), 100)); // 新高 100
});
t("object affine 45deg center fixed", () => {
  const m = GS.objectToCanvasAffine({ left: 10, top: 20, width: 80, height: 30, scaleX: 1, scaleY: 1, angle: 45 });
  assert.ok(nearPt(GS.transformPoint(m, { x: 40, y: 15 }), 50, 35)); // 中心 (10+40,20+15)
});
t("canvasToEditorObject roundtrip(quad)", () => {
  const obj = { left: 12, top: 7, width: 200, height: 60, scaleX: 1, scaleY: 1, angle: 30 };
  const m = GS.objectToCanvasAffine(obj);
  const localRect = { x: 0, y: 0, width: 200, height: 60 };
  const canvasQuad = GS.transformQuad(m, GS.rectToQuad(localRect));
  const local = GS.canvasToEditorObject(canvasQuad, obj);
  assert.strictEqual(local.coordinateSpace, GS.SPACE_EDITOR_OBJECT);
  assert.ok(near(local.x, 0, 1e-6) && near(local.y, 0, 1e-6), "origin " + local.x + "," + local.y);
  assert.ok(near(local.width, 200, 1e-6) && near(local.height, 60, 1e-6), "size " + local.width + "x" + local.height);
});
t("canvasToEditorObject AABB-not-quad loses angle (documented)", () => {
  const obj = { left: 12, top: 7, width: 200, height: 60, scaleX: 1, scaleY: 1, angle: 30 };
  const m = GS.objectToCanvasAffine(obj);
  const canvasQuad = GS.transformQuad(m, GS.rectToQuad({ x: 0, y: 0, width: 200, height: 60 }));
  const aabb = GS.quadToRect(canvasQuad);
  const local = GS.canvasToEditorObject(aabb, obj); // AABB 输入 → 无 angle 信息，仅近似
  assert.ok(local.width > 200 && local.height > 60, "AABB 反解应大于原尺寸（旋转摊平）");
});

// ---- rotateRectAroundCenter（Rotation Recovery 基础）----
const ROT = [0, 90, -90, 15, 45, 105];
t("rotateRect center invariant all angles", () => {
  const r = { x: 10, y: 5, width: 100, height: 40 };
  const cx = 60, cy = 25;
  ROT.forEach(function (a) {
    const q = GS.rotateRectAroundCenter(r, a);
    const cxs = (q.tl.x + q.tr.x + q.br.x + q.bl.x) / 4;
    const cys = (q.tl.y + q.tr.y + q.br.y + q.bl.y) / 4;
    assert.ok(near(cxs, cx, 1e-6) && near(cys, cy, 1e-6), "center@" + a);
  });
});
t("rotateRect 90 swaps w/h", () => {
  const q = GS.rotateRectAroundCenter({ x: 10, y: 5, width: 100, height: 40 }, 90);
  const aabb = GS.quadToRect(q);
  assert.ok(near(aabb.width, 40, 1e-6) && near(aabb.height, 100, 1e-6), "w=" + aabb.width + " h=" + aabb.height);
});
t("rotateRect exact corners", () => {
  // 绕中心旋转 90°：tl(10,5) → (80,-25)
  const q = GS.rotateRectAroundCenter({ x: 10, y: 5, width: 100, height: 40 }, 90);
  assert.ok(nearPt(q.tl, 80, -25, 1e-6), JSON.stringify(q.tl));
  // 0° 不变
  const q0 = GS.rotateRectAroundCenter({ x: 10, y: 5, width: 100, height: 40 }, 0);
  assert.ok(nearPt(q0.tl, 10, 5, 1e-6));
});
t("rotateRect 15/45/105 direction", () => {
  const r = { x: 0, y: 0, width: 100, height: 40 };
  const mk = (a) => { const q = GS.rotateRectAroundCenter(r, a); return Math.atan2(q.tr.y - q.tl.y, q.tr.x - q.tl.x) * 180 / Math.PI; };
  ROT.slice(3).forEach(function (a) {
    const got = mk(a);
    assert.ok(near(got, a, 1e-6) || near(got, norm(a), 1e-6), "angle " + a + " got " + got);
  });
  function norm(a) { return ((a % 360) + 540) % 360 - 180; }
});

// ---- effectiveScaleOf ----
t("effectiveScale non-uniform", () => {
  const m = GS.objectToCanvasAffine({ left: 0, top: 0, width: 100, height: 40, scaleX: 1.2, scaleY: 0.9, angle: 0 });
  const ef = GS.effectiveScaleOf(m);
  assert.ok(near(ef.effectiveScaleX, 1.2, 1e-6) && near(ef.effectiveScaleY, 0.9, 1e-6));
});
t("effectiveScale rotated preserves lengths", () => {
  const m = GS.objectToCanvasAffine({ left: 0, top: 0, width: 100, height: 40, scaleX: 1.2, scaleY: 0.9, angle: 37 });
  const ef = GS.effectiveScaleOf(m);
  assert.ok(near(ef.effectiveScaleX, 1.2, 1e-6) && near(ef.effectiveScaleY, 0.9, 1e-6));
});

// ---- 链式：IMAGE_NATURAL → IMAGE_VIEWPORT → CANVAS（对象仿射）----
t("chain natural->viewport->canvas scale", () => {
  const img = { width: 895, height: 577 };
  const display = { scaleX: 0.5849, scaleY: 0.5849 }; // 真实模板 895×577 → 画布 523×337
  const bbox = { x: 100, y: 80, width: 200, height: 40, coordinateSpace: GS.SPACE_IMAGE_NATURAL };
  const vp = GS.imageNaturalToViewport(bbox, { scaleX: 1, scaleY: 1 });
  const cv = GS.viewportToCanvas(vp, { scaleX: 1, scaleY: 1 });
  // 经图片显示 affine 映射四角
  const m = GS.objectToCanvasAffine({ left: 0, top: 0, width: img.width, height: img.height, scaleX: display.scaleX, scaleY: display.scaleY, angle: 0 });
  const q = GS.transformQuad(m, GS.rectToQuad(cv));
  const aabb = GS.quadToRect(q);
  assert.ok(near(aabb.x, 100 * display.scaleX, 1e-6));
  assert.ok(near(aabb.y, 80 * display.scaleY, 1e-6));
  assert.ok(near(aabb.width, 200 * display.scaleX, 1e-6));
  assert.ok(near(aabb.height, 40 * display.scaleY, 1e-6));
});
t("chain rotated image angle preserved via quad", () => {
  // 图片旋转 105°：natural bbox 绕图片中心旋转 → canvas quad（角度从 quad 派生）
  const img = { width: 895, height: 577 };
  const cx = img.width / 2, cy = img.height / 2;
  const bbox = { x: 100, y: 80, width: 200, height: 40, coordinateSpace: GS.SPACE_IMAGE_NATURAL };
  // image-space 旋转（绕图片中心）→ viewport → canvas 尺寸等
  const rad = (105 * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  const rot = (p) => ({ x: cx + (p.x - cx) * cos - (p.y - cy) * sin, y: cy + (p.x - cx) * sin + (p.y - cy) * cos });
  const q = GS.rotateRectAroundCenter(bbox, 105);
  const a = Math.atan2(q.tr.y - q.tl.y, q.tr.x - q.tl.x) * 180 / Math.PI;
  assert.ok(near(a, 105, 1e-6) || near(a, -75, 1e-6), "derived angle " + a);
  // 中心守恒
  const c = { x: (q.tl.x + q.tr.x + q.br.x + q.bl.x) / 4, y: (q.tl.y + q.tr.y + q.br.y + q.bl.y) / 4 };
  assert.ok(near(c.x, (bbox.x + 100), 1e-6) && near(c.y, (bbox.y + 20), 1e-6));
});

console.log("geometry-space.test: pass=" + pass + " fail=" + fail);
if (fail > 0) process.exit(1);
