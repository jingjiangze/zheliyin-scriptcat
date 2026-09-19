// tests/editor-object-model/image-transform.test.js — Stage 8A-1 §四十一：变换工具单测
// 覆盖：rotation 0/2/5/10、scale 0.5/1/2、translate、scale+rotate、translate+rotate、scale+translate+rotate；
//       BBox 四角→AABB（旋转不丢角）；invert/compose 互逆性。
"use strict";
const path = require("path");
const it = require(path.join(__dirname, "..", "..", "extension", "src", "editor", "image-transform.js"));
const { transformPoint, transformBBox, transformCorners, invertTransform, composeTransform, rotationMatrix, affineMatrix } = it;

const results = [];
const failures = [];
function t(name, cond, detail) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "")); }
function near(a, b, eps) { return Math.abs(a - b) < (eps || 1e-6); }
function nearP(p1, p2, eps) { return near(p1.x, p2.x, eps) && near(p1.y, p2.y, eps); }

const B = { left: 10, top: 20, width: 100, height: 40 };
const C = { x: 60, y: 40 };

// ---- translate ----
const mTrans = affineMatrix(1, 1, 5, 7);
const rc = transformBBox(B, mTrans);
t("t.translate", nearP(rc, { left: 15, top: 27, width: 100, height: 40 }) || (near(rc.left, 15) && near(rc.top, 27) && near(rc.width, 100) && near(rc.height, 40)), JSON.stringify(rc));

// ---- scale 0.5 / 1 / 2（绕中心，AABB 尺寸成比例且中心不变）----
[0.5, 1, 2].forEach((s) => {
  const m = [s, 0, 0, s, C.x * (1 - s), C.y * (1 - s)]; // 绕 (C.x,C.y) 缩放
  const r = transformBBox(B, m);
  t("t.scale-" + s, near(r.width, B.width * s) && near(r.height, B.height * s) && nearP({ x: r.left, y: r.top }, { x: B.left * s + C.x * (1 - s), y: B.top * s + C.y * (1 - s) }), JSON.stringify(r));
});

// ---- rotation 0 / 2 / 5 / 10：AABB 高随旋转增大，中心保持 ----
[0, 2, 5, 10].forEach((deg) => {
  const m = rotationMatrix(deg, C);
  const r = transformBBox(B, m);
  const mr = transformPoint(C, m);
  t("t.rot-" + deg + "-center", nearP(mr, C), JSON.stringify(mr));
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  t("t.rot-" + deg + "-aabb-center", nearP({ x: cx, y: cy }, C, 1e-3), JSON.stringify({ cx, cy }));
  if (deg > 0) t("t.rot-" + deg + "-h-grows", r.height > B.height + 0.1, "h=" + r.height);
  if (deg === 0) t("t.rot-0-identity", near(r.width, B.width) && near(r.height, B.height), JSON.stringify(r));
});
// 旋转 0° 四角顺序
const c0 = transformCorners(B, rotationMatrix(0, C));
t("t.corners-order", c0.length === 4 && nearP(c0[0], { x: 10, y: 20 }) && nearP(c0[3], { x: 10, y: 60 }), JSON.stringify(c0));

// ---- scale + rotate / translate + rotate / scale + translate + rotate ----
const mSR = composeTransform(rotationMatrix(8, C), affineMatrix(2, 2, 0, 0));
const rSR = transformBBox(B, mSR);
t("t.scale-rot", rSR.width > B.width * 2 && rSR.width < B.width * 2 * 1.15 && rSR.height > B.height * 2, JSON.stringify(rSR));
// 预期：compose(rot, trans) = 先 trans 后 rot（compose(m1,m2)=先 m2 后 m1）
const rot0 = rotationMatrix(5, { x: 0, y: 0 });
const ptsT = [{ x: 40, y: 60 }, { x: 140, y: 60 }, { x: 140, y: 100 }, { x: 40, y: 100 }].map((p) => transformPoint(p, rot0));
const expL = Math.min(ptsT[0].x, ptsT[3].x), expT = Math.min(ptsT[0].y, ptsT[1].y);
const mTR = composeTransform(rotationMatrix(5, { x: 0, y: 0 }), affineMatrix(1, 1, 30, 40));
const rTR = transformBBox(B, mTR);
t("t.trans-rot", nearP({ x: rTR.left, y: rTR.top }, { x: expL, y: expT }, 1e-6), JSON.stringify({ r: rTR, exp: { expL, expT } }));
const mSTR = composeTransform(composeTransform(rotationMatrix(10, { x: 10, y: 20 }), affineMatrix(0.5, 0.5, 0, 0)), affineMatrix(1, 1, 12, -8));
const rSTR = transformBBox(B, mSTR);
t("t.scale-trans-rot", near(rSTR.width, B.width * 0.5 * 1.1) || Math.abs(rSTR.width - B.width * 0.5) < B.width * 0.3, "w=" + rSTR.width);

// ---- invert / compose 互逆 ----
const mAny = composeTransform(rotationMatrix(7, C), affineMatrix(1.3, 1.3, 15, -9));
const inv = invertTransform(mAny);
const id = composeTransform(mAny, inv);
t("t.invert-identity", id && near(id[0], 1, 1e-6) && near(id[3], 1, 1e-6) && near(id[4], 0, 1e-6) && near(id[5], 0, 1e-6), JSON.stringify(id));
const p = transformPoint({ x: 33, y: 44 }, mAny);
const pBack = invertTransform(mAny) ? transformPoint(p, invertTransform(mAny)) : null;
t("t.invert-roundtrip", pBack && nearP(pBack, { x: 33, y: 44 }, 1e-6), JSON.stringify(pBack));

console.log(results.join("\n"));
failures.forEach((f) => console.log("  > " + f));
console.log("image-transform: " + (failures.length ? failures.length + " FAILURES" : "ALL PASS"));
process.exit(failures.length ? 1 : 0);