// =====================================================================
// extension/src/editor/visual-geometry-resolver.js — Stage 9.9 Commit A
// ---------------------------------------------------------------------
// 单一职责：裁定「文字最终目标几何的唯一 source」。
// 背景（STAGE9_GEOMETRY_AUTHORITY_AUDIT §7，2026-09-22）：
//   - 4.6-A 曾允许 ImageInk 墨迹盒（conf≥0.30）直接改写 target 映射源，
//     实测墨迹盒几何错误（数字行 16×30 单字形碎片、姓名行 99×111 跨行团块）
//     → target.left 确定性 +1.6~94px 偏移；且墨迹 confidence 为自评，无外部一致性校验。
// 决策（Commit A）：
//   - 墨迹位置接管**默认关闭**（enabled=false）：Ink 只保留 confidence / region / mask 供诊断与门禁。
//   - 几何唯一权威 = OCR bbox（srcBox=bbox）→ imgT → targetQuad（= demo 同模型）。
//   - enabled=true（zyStage9InkGeometry=1，仅未来 Commit E 复用开关）时，
//     必须通过一致性门禁（inkBox 与 bbox 中心/尺度差 ≤ tolPx）才允许 IMAGE_INK 接管，否则仍回落 bbox。
// 纯函数，node 可测；禁止写 position/size/rotation 之外的任何副作用。
// =====================================================================
"use strict";

// 中心距离（图像像素系，两 box 需同坐标系）
function boxCenter(box) {
  return { x: (box.x || 0) + (box.width || 0) / 2, y: (box.y || 0) + (box.height || 0) / 2 };
}
function absDelta(a, b) { return Math.abs(a - b); }

// 解析目标几何源
// input: { bbox:{x,y,width,height}, inkCandidate:{ok,inkBox:{x,y,width,height},confidence}|null,
//          enabled:Boolean, opts:{tolPx:Number=8} }
// return: { srcBox, authority:"OCR_BBOX"|"IMAGE_INK", reason:String|null, candidate }
function resolveVisualSource(input) {
  var o = input || {};
  var bbox = o.bbox || {};
  var bbx = { x: Number(bbox.x) || 0, y: Number(bbox.y) || 0, width: Number(bbox.width) || 0, height: Number(bbox.height) || 0 };
  var ink = o.inkCandidate || null;
  var tolPx = (o.opts && typeof o.opts.tolPx === "number" && o.opts.tolPx > 0) ? o.opts.tolPx : 8;
  var fallback = { srcBox: { x: bbx.x, y: bbx.y, width: bbx.width, height: bbx.height }, authority: "OCR_BBOX", reason: null, candidate: ink ? { inkBox: ink.inkBox || null, confidence: typeof ink.confidence === "number" ? ink.confidence : null } : null };
  // 默认关闭接管：Ink 仅作 candidate（诊断），永不写位置
  if (!o.enabled) return Object.assign({}, fallback, { reason: "INK_GEOMETRY_DISABLED" });
  // 开启路径（Commit E 复用）：须同时满足 ok/inkBox/confidence + 一致性门禁
  if (!ink || !ink.ok || !ink.inkBox || !(ink.inkBox.width > 0) || !(ink.inkBox.height > 0)) return Object.assign({}, fallback, { reason: "INK_NO_VALID_CANDIDATE" });
  if (typeof ink.confidence !== "number" || ink.confidence < 0.30) return Object.assign({}, fallback, { reason: "INK_LOW_CONFIDENCE" });
  var ib = ink.inkBox;
  var cc = boxCenter(bbx), ic = boxCenter(ib);
  var dCx = absDelta(cc.x, ic.x), dCy = absDelta(cc.y, ic.y);
  var wDev = ib.width - bbx.width, hDev = ib.height - bbx.height;
  if (dCx > tolPx || dCy > tolPx || Math.abs(wDev) > Math.max(tolPx * 3, bbx.width * 0.5) || Math.abs(hDev) > Math.max(tolPx * 3, bbx.height * 0.5)) {
    return Object.assign({}, fallback, { reason: "INK_CONSISTENCY_FAIL", candidate: { inkBox: ib, confidence: ink.confidence } , delta: { dx: Math.round(dCx * 100) / 100, dy: Math.round(dCy * 100) / 100, dw: Math.round(wDev * 100) / 100, dh: Math.round(hDev * 100) / 100 } });
  }
  return { srcBox: { x: ib.x, y: ib.y, width: ib.width, height: ib.height }, authority: "IMAGE_INK", reason: null, candidate: { inkBox: ib, confidence: ink.confidence } };
}

if (typeof module !== "undefined" && module.exports) module.exports = { resolveVisualSource: resolveVisualSource, boxCenter: boxCenter };
