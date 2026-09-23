// tests/editor-object-model/image-containment.test.js — Stage 9 Commit 7：图片 containment 纯模块单测
// 覆盖：identity / scaled / resized-but-scale=1（natural=1063 → object=621.745 ≈ 0.5849 有效缩放证明）/
//       rotated / partially outside / fully outside / edge touching / non-uniform scale /
//       inverse transform round-trip / repair（NEEDS_REPAIR → CONTAINED；放不下 → null）/ quadTextGeometry。
// 所有期望值手算（独立于模块实现的解析推导）。
"use strict";
const it = require("../../extension/src/editor/image-containment.js");
const imageSpace = require("../../extension/src/editor/image-space.js");
const {
  effectiveScaleOf, mapQuadToImage, classifyContainment, isQuadInsideImage, repairQuadCentered, quadTextGeometry
} = it;
const { buildImageTransform, tp, inv } = imageSpace;

const results = [];
const failures = [];
function t(name, cond, detail, d) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "") + (d ? " :: " + JSON.stringify(d) : "")); }
function near(a, b, eps) { return Math.abs(a - b) < (eps || 1e-6); }
function nearP(p1, p2, eps) { return near(p1.x, p2.x, eps) && near(p1.y, p2.y, eps); }
function quadT(x, y, w, h) { return [{ x: x, y: y }, { x: x + w, y: y }, { x: x + w, y: y + h }, { x: x, y: y + h }]; }

// ================= 1. identity image（natural == object，无位移缩放） =================
// natural 1000×300，画布落点 (120,50)，effectiveScaleX=1 effectiveScaleY=1
const T1 = buildImageTransform({ naturalWidth: 1000, naturalHeight: 300, width: 1000, height: 300, aCoords: { tl: { x: 120, y: 50 }, tr: { x: 1120, y: 50 }, br: { x: 1120, y: 350 }, bl: { x: 120, y: 350 } } });
{
  const es = effectiveScaleOf(T1);
  t("1.effective-scale-identity", es && near(es.effectiveScaleX, 1) && near(es.effectiveScaleY, 1), JSON.stringify(es));
  const qIn = quadT(500, 100, 100, 44);
  const r1 = isQuadInsideImage(qIn, T1, 1000, 300);
  t("1.contained", r1.verdict === "CONTAINED", JSON.stringify(r1));
  const p0 = { x: 500, y: 100 };
  const ip = tp(p0, inv(T1));
  const rp = tp(ip, T1);
  t("1.inverse-roundtrip", nearP(rp, p0, 1e-9), JSON.stringify({ ip: ip, rp: rp }));
}

// ================= 2. scaled image（object = natural × 0.5，画布 (20,10)） =================
// natural 2000×1000 → object 1000×500，有效缩放 0.5
const T2 = buildImageTransform({ naturalWidth: 2000, naturalHeight: 1000, width: 1000, height: 500, aCoords: { tl: { x: 20, y: 10 }, tr: { x: 1020, y: 10 }, br: { x: 1020, y: 510 }, bl: { x: 20, y: 510 } } });
{
  const es = effectiveScaleOf(T2);
  t("2.effective-scale-scaled", es && near(es.effectiveScaleX, 0.5) && near(es.effectiveScaleY, 0.5), JSON.stringify(es));
  const q2 = quadT(220, 110, 120, 60);
  const r2 = isQuadInsideImage(q2, T2, 2000, 1000);
  t("2.contained", r2.verdict === "CONTAINED", JSON.stringify(r2));
  const imgPts2 = mapQuadToImage(q2, T2);
  t("2.image-pixel-size", imgPts2 && near(imgPts2[2].x - imgPts2[0].x, 240) && near(imgPts2[2].y - imgPts2[0].y, 120), JSON.stringify(imgPts2));
}

// ================= 3. resized-but-scale=1 image（真实模板问题证明） =================
// natural 1063×638，object 621.745×373.164（fabric scaleX=scaleY=1，宽度/高度属性即 object 尺寸）。
// 有效缩放必须 ≈ 621.745/1063 ≈ 0.5848 / 373.164/638 ≈ 0.5849 —— 禁止用 geo.scaleX=1 当 truth。
const T3 = buildImageTransform({ naturalWidth: 1063, naturalHeight: 638, width: 621.745, height: 373.164, aCoords: { tl: { x: 0, y: 0 }, tr: { x: 621.745, y: 0 }, br: { x: 621.745, y: 373.164 }, bl: { x: 0, y: 373.164 } } });
{
  const es = effectiveScaleOf(T3);
  const expectX = 621.745 / 1063, expectY = 373.164 / 638;
  t("3.effective-scale-real-template", es && near(es.effectiveScaleX, expectX, 1e-6) && near(es.effectiveScaleY, expectY, 1e-6), JSON.stringify(es));
  t("3.prove-approx-0.5849", es && near(es.effectiveScaleX, 0.5848, 1e-3) && near(es.effectiveScaleY, 0.5849, 1e-3), JSON.stringify(es));
  const q3 = quadT(200, 100, 220, 70);
  const r3 = isQuadInsideImage(q3, T3, 1063, 638);
  t("3.contained", r3.verdict === "CONTAINED", JSON.stringify(r3));
  const img3 = mapQuadToImage(q3, T3);
  t("3.image-px-bounds", img3 && img3.every(function (p) { return p.x >= 0 && p.x <= 1063 && p.y >= 0 && p.y <= 638; }), JSON.stringify(img3));
}

// ================= 4. rotated image（inverse transform 必须正确处理旋转） =================
// natural 100×60，object 100×60，left=60,top=60，旋转 30° 绕显示中心 (110,90)
const r30 = (Math.PI * 30) / 180, c30 = Math.cos(r30), s30 = Math.sin(r30);
const cE = { x: 110, y: 90 };
const quadE = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }].map(function (q) {
  const p = { x: q.x + 60, y: q.y + 60 };
  const dx = p.x - cE.x, dy = p.y - cE.y;
  return { x: cE.x + dx * c30 - dy * s30, y: cE.y + dx * s30 + dy * c30 };
});
const T4 = buildImageTransform({ naturalWidth: 100, naturalHeight: 60, width: 100, height: 60, aCoords: { tl: quadE[0], tr: quadE[1], br: quadE[2], bl: quadE[3] } });
{
  const es = effectiveScaleOf(T4);
  t("4.effective-scale-rotated", es && near(es.effectiveScaleX, 1) && near(es.effectiveScaleY, 1), JSON.stringify(es));
  const cImg = tp(cE, inv(T4));
  t("4.center-inverse", nearP(cImg, { x: 50, y: 30 }, 1e-6), JSON.stringify(cImg));
  const q4 = [{ x: cE.x - 10, y: cE.y - 5 }, { x: cE.x + 10, y: cE.y - 5 }, { x: cE.x + 10, y: cE.y + 5 }, { x: cE.x - 10, y: cE.y + 5 }];
  const r4 = isQuadInsideImage(q4, T4, 100, 60);
  t("4.contained-center", r4.verdict === "CONTAINED", JSON.stringify(r4));
  const outPt = tp({ x: 5, y: 5 }, T4);
  const qOutside4 = quadT(outPt.x - 60, outPt.y - 20, 20, 10);
  const r4o = isQuadInsideImage(qOutside4, T4, 100, 60);
  t("4.rotated-outside-detected", r4o.verdict === "OUT_OF_IMAGE", qOutside4 + ":" + JSON.stringify(r4o));
}

// ================= 5. partially outside → NEEDS_REPAIR → repair → CONTAINED =================
{
  const q5 = quadT(1000, 100, 220, 60); // 右边越界
  const r5 = isQuadInsideImage(q5, T1, 1000, 300);
  t("5.partial-outside", r5.verdict === "NEEDS_REPAIR", JSON.stringify(r5));
  const rp = repairQuadCentered(q5, T1, 1000, 300);
  t("5.repair-ok", rp && rp.evidence.afterVerdict === "CONTAINED", JSON.stringify(rp && rp.evidence));
  t("5.repair-shift-is-image-x", rp && near(rp.evidence.imageShift.x, -100, 1e-6), JSON.stringify(rp && rp.evidence.imageShift));
  if (rp) {
    const r6 = isQuadInsideImage(rp.quad, T1, 1000, 300);
    t("5.repair-recontained", r6.verdict === "CONTAINED", JSON.stringify(r6));
  }
}

// ================= 6. fully outside → OUT_OF_IMAGE =================
{
  const q6 = quadT(2000, 2000, 50, 30);
  const r6 = isQuadInsideImage(q6, T1, 1000, 300);
  t("6.fully-outside", r6.verdict === "OUT_OF_IMAGE", JSON.stringify(r6));
}

// ================= 7. edge touching → CONTAINED（marginPx=8 时 → NEEDS_REPAIR） =================
{
  const q7 = quadT(1120 - 30, 200, 30, 40); // 右缘恰在图片右边界 x=1120
  const r7 = isQuadInsideImage(q7, T1, 1000, 300);
  t("7.edge-touching-contained", r7.verdict === "CONTAINED", JSON.stringify(r7));
  const r7m = isQuadInsideImage(q7, T1, 1000, 300, { marginPx: 8 });
  t("7.edge-touching-with-margin", r7m.verdict === "NEEDS_REPAIR", JSON.stringify(r7m));
}

// ================= 8. non-uniform scale（x≠y 拉伸；判定必须分轴） =================
// natural 2000×1000 → object 1000×300 → a=0.5, d=0.3
const T8 = buildImageTransform({ naturalWidth: 2000, naturalHeight: 1000, width: 1000, height: 300, aCoords: { tl: { x: 0, y: 0 }, tr: { x: 1000, y: 0 }, br: { x: 1000, y: 300 }, bl: { x: 0, y: 300 } } });
{
  const es = effectiveScaleOf(T8);
  t("8.effective-scale-nonuniform", es && near(es.effectiveScaleX, 0.5) && near(es.effectiveScaleY, 0.3), JSON.stringify(es));
  const q8 = quadT(100, 80, 200, 60);
  const r8 = isQuadInsideImage(q8, T8, 2000, 1000);
  t("8.contained", r8.verdict === "CONTAINED", JSON.stringify(r8));
  const q8y = quadT(100, 260, 60, 80); // y=260~340（图片高 300）
  const r8y = isQuadInsideImage(q8y, T8, 2000, 1000);
  t("8.y-only-partial", r8y.verdict === "NEEDS_REPAIR", JSON.stringify(r8y));
}

// ================= 9. quad 尺寸超图片 → 无法 repair（null） =================
{
  const q9 = quadT(500, 20, 4000, 20);
  const r9 = isQuadInsideImage(q9, T1, 1000, 300);
  t("9.wider-than-image", r9.verdict === "NEEDS_REPAIR" || r9.verdict === "OUT_OF_IMAGE", JSON.stringify(r9));
  const rp9 = repairQuadCentered(q9, T1, 1000, 300);
  t("9.repair-impossible", rp9 === null, JSON.stringify(rp9));
}

// ================= 10. quadTextGeometry 派生（left/top/angle/center） =================
{
  const g = quadTextGeometry(quadT(120, 50, 200, 60));
  t("10.unrotated-geometry", g && near(g.left, 120) && near(g.top, 50) && near(g.width, 200) && near(g.height, 60) && near(g.angle, 0) && near(g.center.x, 220) && near(g.center.y, 80), JSON.stringify(g));
  const rotQ = quadT(100, 100, 50, 20).map(function (p) {
    const dx = p.x - 125, dy = p.y - 110;
    const a = (Math.PI * 45) / 180;
    return { x: 125 + dx * Math.cos(a) - dy * Math.sin(a), y: 110 + dx * Math.sin(a) + dy * Math.cos(a) };
  });
  const g2 = quadTextGeometry(rotQ);
  t("10.rotated-angle", g2 && near(g2.angle, 45, 1), JSON.stringify(g2 && g2.angle));
}

// ================= 汇总 =================
const pass = results.filter(function (r) { return r.indexOf(" PASS") > 0; }).length;
console.log("image-containment.test: pass=" + pass + " fail=" + (results.length - pass));
if (failures.length) { console.log(failures.slice(0, 12).join("\n")); process.exit(1); }
if (!results.length) { console.error("NO TESTS RAN"); process.exit(2); }