// =====================================================================
// 折立印名片套版助手 - Native Template Dimension Contract（Stage 9 方案 Commit 4）
// ---------------------------------------------------------------------
// 职责：纯数据/纯逻辑 —— 把 Native runtime 已采集的 dimension evidence 规范化成统一 contract。
// 铁律（§六/§二十）：禁止硬编码 92×56 / 507.5；禁止把 source natural size 当 canvas size；
//   禁止把 viewport display size 当设计尺寸；禁止新增第二套坐标系统；四套尺寸（physical /
//   canvas logical / source natural / viewport）各自分离；non-uniform px/mm 分别记录，禁平均。
// 本模块：禁止 DOM / window / document / canvas / GM / fetch / Playwright；node 可单测。
// =====================================================================
"use strict";

function NUM(v) { return (typeof v === "number" && isFinite(v)) ? v : null; }
function STR(v) { return (v == null ? null : String(v)); }

// ---- 尺寸 evidence 归一（primitive only；缺失字段 -> null，不注入默认值）----
function normalizeDimensionEvidence(input) {
  const o = input || {};
  const phys = o.physical || {};
  const cv = o.canvas || {};
  const src = o.sourceImage || {};
  const vp = o.viewport || {};
  return {
    physical: { widthMM: NUM(phys.widthMM), heightMM: NUM(phys.heightMM), source: STR(phys.source) },
    canvas: { widthPx: NUM(cv.widthPx), heightPx: NUM(cv.heightPx), source: STR(cv.source) || "native" },
    sourceImage: { naturalWidthPx: NUM(src.naturalWidthPx), naturalHeightPx: NUM(src.naturalHeightPx), objectWidthPx: NUM(src.objectWidthPx), objectHeightPx: NUM(src.objectHeightPx), scaleX: NUM(src.scaleX), scaleY: NUM(src.scaleY) },
    viewport: { widthPx: NUM(vp.widthPx), heightPx: NUM(vp.heightPx), zoom: NUM(vp.zoom), scale: NUM(vp.scale) },
    pageIdentity: STR(o.pageIdentity),
    canvasIdentity: STR(o.canvasIdentity)
  };
}

// ---- 方向判定（以 physical 优先，其次 canvas；无证据 -> unknown）----
function inferOrientation(n) {
  const wMM = n.physical.widthMM, hMM = n.physical.heightMM;
  const wPx = n.canvas.widthPx, hPx = n.canvas.heightPx;
  if (wMM != null && hMM != null) return wMM >= hMM ? "landscape" : "portrait";
  if (wPx != null && hPx != null) return wPx >= hPx ? "landscape" : "portrait";
  return "unknown";
}

// ---- 建契约：四套尺寸分离 + px/mm（可 non-uniform）+ 换算状态 + location->aCoords divergence ----
function buildDimensionContract(input) {
  const n = normalizeDimensionEvidence(input);
  const pxW = (n.canvas.widthPx != null && n.physical.widthMM != null && n.physical.widthMM > 0) ? n.canvas.widthPx / n.physical.widthMM : null;
  const pxH = (n.canvas.heightPx != null && n.physical.heightMM != null && n.physical.heightMM > 0) ? n.canvas.heightPx / n.physical.heightMM : null;
  const uniformScale = (pxW != null && pxH != null) ? Math.abs(pxW - pxH) < 1e-9 : null;
  const conv = input && input.conversion ? input.conversion : {};
  const conversion = {
    status: STR(conv.status) || "UNKNOWN",
    api: STR(conv.api) || null,
    confidence: STR(conv.confidence) || null,
    sample: conv.sample ? { mm: NUM(conv.sample.mm), px: NUM(conv.sample.px) } : null
  };
  const div = input && input.sizeDivergence ? input.sizeDivergence : {};
  const sizeDivergence = {
    consistency: STR(div.consistency) || "UNKNOWN",
    nativeRequestedSize: div.nativeRequestedSize || null,
    actualObjectSize: div.actualObjectSize || null,
    locationSize: div.locationSize || null,
    aCoordsSize: div.aCoordsSize || null
  };
  return {
    physical: n.physical,
    canvas: n.canvas,
    sourceImage: n.sourceImage,
    viewport: n.viewport,
    orientation: inferOrientation(n),
    pxPerMM: { width: pxW, height: pxH },
    mmPerPx: { width: (pxW != null && pxW > 0) ? 1 / pxW : null, height: (pxH != null && pxH > 0) ? 1 / pxH : null },
    uniformScale: uniformScale,
    pageIdentity: n.pageIdentity,
    canvasIdentity: n.canvasIdentity,
    conversion: conversion,
    sizeDivergence: sizeDivergence
  };
}

// ---- 对比两份 evidence（四套尺寸逐项 + 身份），返回差异清单 ----
function compareDimensionEvidence(a, b, tolerance) {
  const tol = NUM(tolerance) != null ? tolerance : 0.5;
  const A = normalizeDimensionEvidence(a);
  const B = normalizeDimensionEvidence(b);
  const diffs = [];
  const check = (path, va, vb) => {
    if (va != null && vb != null && Math.abs(va - vb) > tol) diffs.push({ path: path, a: va, b: vb, delta: Math.round((va - vb) * 1000) / 1000 });
  };
  check("physical.widthMM", A.physical.widthMM, B.physical.widthMM);
  check("physical.heightMM", A.physical.heightMM, B.physical.heightMM);
  check("canvas.widthPx", A.canvas.widthPx, B.canvas.widthPx);
  check("canvas.heightPx", A.canvas.heightPx, B.canvas.heightPx);
  check("sourceImage.naturalWidthPx", A.sourceImage.naturalWidthPx, B.sourceImage.naturalWidthPx);
  check("sourceImage.naturalHeightPx", A.sourceImage.naturalHeightPx, B.sourceImage.naturalHeightPx);
  check("viewport.widthPx", A.viewport.widthPx, B.viewport.widthPx);
  check("viewport.heightPx", A.viewport.heightPx, B.viewport.heightPx);
  if (A.pageIdentity !== B.pageIdentity && A.pageIdentity != null && B.pageIdentity != null) diffs.push({ path: "pageIdentity", a: A.pageIdentity, b: B.pageIdentity });
  return { equal: diffs.length === 0, diffs: diffs };
}

// ---- 契约等价（physical+canvas+身份 一致即等价）----
function dimensionContractEquivalent(a, b, tolerance) {
  const A = buildDimensionContract(a);
  const B = buildDimensionContract(b);
  const tol = NUM(tolerance) != null ? tolerance : 0.5;
  const near = (x, y) => (x == null && y == null) || (x != null && y != null && Math.abs(x - y) <= tol);
  const identityEquiv = A.pageIdentity === B.pageIdentity || (A.pageIdentity == null && B.pageIdentity == null);
  if (!identityEquiv) return { equivalent: false, reason: "pageIdentity", pageA: A.pageIdentity, pageB: B.pageIdentity };
  if (!near(A.canvas.widthPx, B.canvas.widthPx) || !near(A.canvas.heightPx, B.canvas.heightPx) || !near(A.physical.widthMM, B.physical.widthMM) || !near(A.physical.heightMM, B.physical.heightMM)) {
    return { equivalent: false, reason: "physical-or-canvas-differ", diff: compareDimensionEvidence(a, b).diffs };
  }
  return { equivalent: true, reason: "dimension-contract-equal" };
}

// ---- 汇总（报告/日志用）----
function summarizeDimensionContract(contract) {
  const c = contract || {};
  return {
    physicalWidthMM: c.physical && c.physical.widthMM,
    physicalHeightMM: c.physical && c.physical.heightMM,
    canvasWidthPx: c.canvas && c.canvas.widthPx,
    canvasHeightPx: c.canvas && c.canvas.heightPx,
    orientation: c.orientation || "unknown",
    pxPerMM: c.pxPerMM ? { width: c.pxPerMM.width, height: c.pxPerMM.height } : null,
    uniformScale: c.uniformScale,
    pageIdentity: c.pageIdentity,
    canvasIdentity: c.canvasIdentity,
    conversionStatus: c.conversion ? c.conversion.status : "UNKNOWN",
    sourceNatural: c.sourceImage ? { width: c.sourceImage.naturalWidthPx, height: c.sourceImage.naturalHeightPx } : null,
    viewport: c.viewport ? { width: c.viewport.widthPx, height: c.viewport.heightPx, zoom: c.viewport.zoom } : null,
    sizeDivergence: c.sizeDivergence ? c.sizeDivergence.consistency : null
  };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  normalizeDimensionEvidence, buildDimensionContract, compareDimensionEvidence,
  dimensionContractEquivalent, summarizeDimensionContract
};