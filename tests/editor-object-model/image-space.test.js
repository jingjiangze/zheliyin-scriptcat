// tests/editor-object-model/image-space.test.js — Stage 8B STEP 2：图片运行时几何单测
// 覆盖：solveAffine2D 恢复已知仿射；aCoords 四角 → 完整仿射（平移/均匀缩放/旋转/源图拉伸 F5）；
//       mapRectToCanvas / mapCanvasPointToImage 互逆；validateQuadInsideCanvas 三类；
//       resolveImageRoute 优先级；buildImageRuntimeGeometry 缺角/缺 natural 状态。
// 所有期望值均为手算（独立于模块实现的解析推导）。
"use strict";
const path = require("path");
const it = require(path.join(__dirname, "..", "..", "extension", "src", "editor", "image-space.js"));
const {
  tp, inv, comp, solveAffine2D, aCoordsQuad, affineFromAcoordsQuad, buildImageTransform,
  imageQuadOf, quadToAABB, quadArea, mapRectToCanvas, mapCanvasPointToImage,
  resolveImageRoute, buildImageRuntimeGeometry, validateQuadInsideCanvas
} = it;

const results = [];
const failures = [];
function t(name, cond, detail, d) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "") + (d ? " :: " + JSON.stringify(d) : "")); }
function near(a, b, eps) { return Math.abs(a - b) < (eps || 1e-6); }
function nearP(p1, p2, eps) { return near(p1.x, p2.x, eps) && near(p1.y, p2.y, eps); }
function nearM(m1, m2, eps) { return m1.length === m2.length && m1.every(function (v, i) { return near(v, m2[i], eps); }); }

// ================= A: solveAffine2D 恢复已知仿射 =================
// 平移 [1,0,0,1,1,2]：(0,0)→(1,2)
const srcA = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 }];
const dstA = [{ x: 1, y: 2 }, { x: 11, y: 2 }, { x: 11, y: 7 }, { x: 1, y: 7 }];
const mA = solveAffine2D(srcA, dstA);
t("a.translate-recover", nearM(mA, [1, 0, 0, 1, 1, 2], 1e-9), JSON.stringify(mA));
// 旋转 30° 绕原点（解析构造独立期望）：
const r30 = (Math.PI * 30) / 180, c30 = Math.cos(r30), s30 = Math.sin(r30);
const rot30 = [c30, s30, -s30, c30, 0, 0];
const srcB = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }];
const dstB = srcB.map(function (p) { return tp(p, rot30); });
const mB = solveAffine2D(srcB, dstB);
t("a.rotate30-recover", nearM(mB, rot30, 1e-9), JSON.stringify(mB));

// ================= C: aCoords → 完整仿射（平移 + 均匀缩放） =================
// natural 1000×300、对象 1000×300（恒等拉伸）、canvas 落点 (120,50)：
const acC = { tl: { x: 120, y: 50 }, tr: { x: 1120, y: 50 }, br: { x: 1120, y: 350 }, bl: { x: 120, y: 350 } };
const TC = buildImageTransform({ naturalWidth: 1000, naturalHeight: 300, width: 1000, height: 300, aCoords: acC });
t("c.affine-translate-scale", nearM(TC, [1, 0, 0, 1, 120, 50], 1e-9), JSON.stringify(TC));
t("c.map-origin", TC && nearP(tp({ x: 0, y: 0 }, TC), { x: 120, y: 50 }), "", TC && tp({ x: 0, y: 0 }, TC));
t("c.map-br", TC && nearP(tp({ x: 1000, y: 300 }, TC), { x: 1120, y: 350 }), "", TC && tp({ x: 1000, y: 300 }, TC));
t("c.map-center", TC && nearP(tp({ x: 500, y: 150 }, TC), { x: 620, y: 200 }), "", TC && tp({ x: 500, y: 150 }, TC));

// ================= D: 源图 ≠ 对象 box（F5 源图拉伸因子） =================
// natural 2000×1000 塞进对象 box 1000×500，画布落点 (10,20)：
const acD = { tl: { x: 10, y: 20 }, tr: { x: 1010, y: 20 }, br: { x: 1010, y: 520 }, bl: { x: 10, y: 520 } };
const TD = buildImageTransform({ naturalWidth: 2000, naturalHeight: 1000, width: 1000, height: 500, aCoords: acD });
t("d.map-natural-br", TD && nearP(tp({ x: 2000, y: 1000 }, TD), { x: 1010, y: 520 }), "", TD && tp({ x: 2000, y: 1000 }, TD));
t("d.map-natural-tr", TD && nearP(tp({ x: 2000, y: 0 }, TD), { x: 1010, y: 20 }), "", TD && tp({ x: 2000, y: 0 }, TD));
t("d.map-natural-center", TD && nearP(tp({ x: 1000, y: 500 }, TD), { x: 510, y: 270 }), "", TD && tp({ x: 1000, y: 500 }, TD));
t("d.map-quarters", TD && nearP(tp({ x: 500, y: 250 }, TD), { x: 260, y: 145 }), "", TD && tp({ x: 500, y: 250 }, TD));
// 源图拉伸比记录在合同：
const gd = buildImageRuntimeGeometry({ width: 1000, height: 500, aCoords: acD, _element: null }, { naturalWidth: 2000, naturalHeight: 1000 });
t("d.contract-stretch", gd.status === "OK" && gd.uniformSourceScale === true, JSON.stringify(gd.coordinateContract && gd.coordinateContract.sourceStretch));

// ================= E: 旋转 30° 绕显示中心（aCoords 为旋转后四角，期望解析推导） =================
// natural 100×60、对象 100×60、left=60,top=60（显示中心 (110,90)）、旋转 30°：
// 显示角 = R30(p − center) + center，其中 p = 局部角 + left/top
const cE = { x: 110, y: 90 };
const quadE = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }].map(function (q) {
  const p = { x: q.x + 60, y: q.y + 60 };
  const dx = p.x - cE.x, dy = p.y - cE.y;
  return { x: cE.x + dx * c30 - dy * s30, y: cE.y + dx * s30 + dy * c30 };
});
const acE = { tl: quadE[0], tr: quadE[1], br: quadE[2], bl: quadE[3] };
const TE = buildImageTransform({ naturalWidth: 100, naturalHeight: 60, width: 100, height: 60, aCoords: acE });
quadE.forEach(function (exp, i) {
  const src = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }][i];
  const got = TE && tp(src, TE);
  t("e.corner-" + i, got && nearP(got, exp, 1e-6), "", got);
});
t("e.center-preserved", TE && nearP(tp({ x: 50, y: 30 }, TE), { x: 110, y: 90 }, 1e-6), "", TE && tp({ x: 50, y: 30 }, TE));
// imageQuad（4 角）应等于 aCoords quad（width==naturalWidth 时）：
const iqE = imageQuadOf(100, 60, TE);
t("e.imageQuad-equals-acoords", iqE && iqE.every(function (p, i) { return nearP(p, quadE[i], 1e-6); }), JSON.stringify(iqE));

// ================= F: mapCanvasPointToImage 互逆 =================
const invTC = inv(TC);
t("f.inverse-available", !!invTC && nearM(comp(TC, invTC), [1, 0, 0, 1, 0, 0], 1e-9), "");
const back = mapCanvasPointToImage({ x: 1120, y: 350 }, TC);
t("f.rt-br", back && nearP(back, { x: 1000, y: 300 }, 1e-9), "", back);

// ================= G: validateQuadInsideCanvas =================
const V_OK = validateQuadInsideCanvas([{ x: 10, y: 10 }, { x: 200, y: 10 }, { x: 200, y: 150 }, { x: 10, y: 150 }], 1000, 700);
t("g.inside-valid", V_OK.status === "GEOMETRY_VALID" && V_OK.valid === true && V_OK.centerInside === true, JSON.stringify(V_OK));
const V_CENTER_OUT = validateQuadInsideCanvas([{ x: 900, y: 300 }, { x: 1400, y: 300 }, { x: 1400, y: 500 }, { x: 900, y: 500 }], 1000, 700);
t("g.center-outside-invalid", V_CENTER_OUT.status === "GEOMETRY_INVALID" && V_CENTER_OUT.reason === "center-outside", JSON.stringify(V_CENTER_OUT));
// 中心 (150, 80) 在界内，但 900×140 里仅 600×140 落在界内 → 越界 ≈33% > 20%
const V_OVER = validateQuadInsideCanvas([{ x: -300, y: 10 }, { x: 600, y: 10 }, { x: 600, y: 150 }, { x: -300, y: 150 }], 1000, 700);
t("g.pct-outside-invalid", V_OVER.status === "GEOMETRY_INVALID" && V_OVER.centerInside === true && V_OVER.reason.indexOf("out-of-bounds-pct") === 0, JSON.stringify(V_OVER));
const V_SMALL_OUT = validateQuadInsideCanvas([{ x: -20, y: 10 }, { x: 220, y: 10 }, { x: 220, y: 150 }, { x: -20, y: 150 }], 1000, 700);
t("g.small-overflow-valid", V_SMALL_OUT.status === "GEOMETRY_VALID", JSON.stringify(V_SMALL_OUT));

// ================= H: resolveImageRoute 优先级 =================
const objA = { type: "image" }, objB = { type: "image" }, text = { type: "text" };
t("h.active-first", resolveImageRoute({ active: objA, backgroundImage: objB, objects: [text] }).kind === "active-image", "");
t("h.background", resolveImageRoute({ active: text, backgroundImage: objB, objects: [] }).kind === "background-image", "");
t("h.first", resolveImageRoute({ active: text, backgroundImage: null, objects: [text, objB] }).kind === "first-image", "");
t("h.none", resolveImageRoute({ active: text, backgroundImage: null, objects: [text] }).kind === null, "");

// ================= I: buildImageRuntimeGeometry 缺角/缺 natural =================
const rNoAc = buildImageRuntimeGeometry({ width: 100, height: 50, _element: null }, { naturalWidth: 200, naturalHeight: 100 });
t("i.needs-acoords", rNoAc.status === "NEEDS_ACOORDS", JSON.stringify(rNoAc));
const rNoNat = buildImageRuntimeGeometry({ width: 100, height: 50, aCoords: acC }, {});
t("i.needs-natural", rNoNat.status === "NEEDS_NATURAL_SIZE", JSON.stringify(rNoNat));
const rOk = buildImageRuntimeGeometry({ width: 1000, height: 300, aCoords: acC }, { naturalWidth: 1000, naturalHeight: 300, kind: "active-image", left: 120, top: 50, scaleX: 1, scaleY: 1, angle: 0 });
t("i.ok-shape", rOk.status === "OK" && rOk.kind === "active-image" && rOk.sourceWidth === 1000 && rOk.sourceHeight === 300 && rOk.objectWidth === 1000,
  JSON.stringify({ status: rOk.status, kind: rOk.kind, sourceWidth: rOk.sourceWidth, sourceHeight: rOk.sourceHeight, objectWidth: rOk.objectWidth }));
t("i.ok-contract-basis", rOk.coordinateContract.basis === "aCoords" && nearP(tp({ x: 0, y: 0 }, rOk.imageTransform), { x: 120, y: 50 }, 1e-9), JSON.stringify(rOk.coordinateContract));

// ================= 汇总 =================
console.log("image-space.test: " + results.length + " checks, " + failures.length + " failures");
results.forEach(function (r) { console.log("  " + r); });
if (failures.length) { console.error("FAILURES:\n" + failures.join("\n")); process.exit(1); }
console.log("ALL PASS");