// runtime/stage9/rotation-recovery.test.js — OCR-P1 Commit 4.3（§九，0/90/-90/15/45/105）
const path = require("path");
const assert = require("assert");
const GS = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "geometry-space.js"));

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass += 1; } catch (e) { fail += 1; console.error("FAIL " + name + ": " + String(e && e.message || e)); } }
function near(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-6); }
const ANGLES = [0, 90, -90, 15, 45, 105];
const IMG = { width: 895, height: 577 };

t("all angles center invariant in image space", () => {
  const bbox = { x: 100, y: 80, width: 200, height: 40 };
  const cx = bbox.x + bbox.width / 2, cy = bbox.y + bbox.height / 2;
  ANGLES.forEach((a) => {
    const q = GS.rotateRectAroundCenter(bbox, a);
    const mx = (q.tl.x + q.tr.x + q.br.x + q.bl.x) / 4;
    const my = (q.tl.y + q.tr.y + q.br.y + q.bl.y) / 4;
    assert.ok(near(mx, cx, 1e-6) && near(my, cy, 1e-6), "center@" + a);
  });
});
t("rotate around image center then chain to canvas", () => {
  const bbox = { x: 100, y: 80, width: 200, height: 40 };
  ANGLES.forEach((a) => {
    // image-space：绕图片中心旋转（Baidu 返回 bbox 与图片同系）
    const rad = (a * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    const icx = IMG.width / 2, icy = IMG.height / 2;
    const rot = (p) => ({ x: icx + (p.x - icx) * cos - (p.y - icy) * sin, y: icy + (p.x - icx) * sin + (p.y - icy) * cos });
    const q = GS.rotateRectAroundCenter(bbox, a);
    // 已旋转 quad → viewport → canvas（恒等）→ 经图片对象仿射（无旋转，仅 scale）
    const viewQP = { tl: rot(q.tl), tr: rot(q.tr), br: rot(q.br), bl: rot(q.bl) };
    const m = GS.objectToCanvasAffine({ left: 0, top: 0, width: IMG.width, height: IMG.height, scaleX: 0.5849, scaleY: 0.5849, angle: 0 });
    const cv = GS.transformQuad(m, viewQP);
    // canvas 中心 = （原 bbox 中心经图像中心旋转后的位置）× scale —— 链内一致，无二次缩放
    const ec = rot({ x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 });
    const cc = { x: (cv.tl.x + cv.tr.x + cv.br.x + cv.bl.x) / 4, y: (cv.tl.y + cv.tr.y + cv.br.y + cv.bl.y) / 4 };
    assert.ok(near(cc.x, ec.x * 0.5849, 1e-6) && near(cc.y, ec.y * 0.5849, 1e-6), "canvas center@" + a + " got " + cc.x + "," + cc.y);
    // 边长缩放正确（旋转不改变边长）
    const tltr = Math.hypot(cv.tr.x - cv.tl.x, cv.tr.y - cv.tl.y);
    const tlbl = Math.hypot(cv.bl.x - cv.tl.x, cv.bl.y - cv.tl.y);
    assert.ok(near(tltr, 200 * 0.5849, 1e-6) && near(tlbl, 40 * 0.5849, 1e-6), "edge@" + a);
  });
});
t("90/-90 swap extents in canvas AABB", () => {
  const bbox = { x: 100, y: 80, width: 200, height: 40 };
  [90, -90].forEach((a) => {
    const q = GS.rotateRectAroundCenter(bbox, a);
    const aabb = GS.quadToRect(q);
    assert.ok(near(aabb.width, 40, 1e-6) && near(aabb.height, 200, 1e-6), "swap@" + a);
  });
});
t("no double-apply: rotated canvas center equals unrotated center after image rotation chain", () => {
  const bbox = { x: 100, y: 80, width: 200, height: 40 };
  const q0 = GS.rotateRectAroundCenter(bbox, 0);
  const q45 = GS.rotateRectAroundCenter(bbox, 45);
  const c0 = { x: (q0.tl.x + q0.tr.x + q0.br.x + q0.bl.x) / 4, y: (q0.tl.y + q0.tr.y + q0.br.y + q0.bl.y) / 4 };
  const c45 = { x: (q45.tl.x + q45.tr.x + q45.br.x + q45.bl.x) / 4, y: (q45.tl.y + q45.tr.y + q45.br.y + q45.bl.y) / 4 };
  assert.ok(near(c0.x, c45.x, 1e-9) && near(c0.y, c45.y, 1e-9), "rotation around rect center keeps its own center");
});
t("derived angle preserved through chain", () => {
  [15, 45, 105].forEach((a) => {
    const q = GS.rotateRectAroundCenter({ x: 100, y: 80, width: 200, height: 40 }, a);
    const ang = Math.atan2(q.tr.y - q.tl.y, q.tr.x - q.tl.x) * 180 / Math.PI;
    const want = ((a % 360) + 540) % 360 - 180;
    assert.ok(near(ang, want, 1e-6) || near(ang, want + 180, 1e-6), "angle@" + a + " got " + ang);
  });
});
t("vertical bbox transforms correctly (manual 90 center-point)", () => {
  const bbox = { x: 0, y: 0, width: 10, height: 30 };
  const q = GS.rotateRectAroundCenter(bbox, 90);
  const aabb = GS.quadToRect(q);
  // bbox(0,0,10,30) 中心 (5,15)，旋转 90°：x∈[-10,20]，y∈[0,10]
  assert.ok(near(aabb.x, -10, 1e-6) && near(aabb.y, 10, 1e-6) && near(aabb.width, 30, 1e-6) && near(aabb.height, 10, 1e-6), JSON.stringify(aabb));
});
console.log("rotation-recovery.test: pass=" + pass + " fail=" + fail);
if (fail > 0) process.exit(1);
