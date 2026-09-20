// =====================================================================
// 折立印名片套版助手 - Native Anchor Matcher（Stage 9 方案 Commit 5）
// ---------------------------------------------------------------------
// 职责：纯数据/纯逻辑 —— 把 OCR block（canvas-space geometry）与 Native Anchor
// 做多因子匹配，禁止 text===text 直配。
// 铁律（§九 Commit 5）：
//   1. 第一条件：同 page（pageId + side 必须一致，否则 NO_MATCH）；
//   2. 多因子打分：空间接近度 + 尺寸相似度 + scriptType + 原生样式相似度 +
//      行数 + 文本长度/形态 + layer 关系；
//   3. 差异大 / 候选过近 → NATIVE_ANCHOR_UNCERTAIN；
//   4. 本模块只消费 canvas-space 几何（OCR→canvas 映射由调用方用 image-space 完成）。
// 本模块：禁止 DOM / window / document / canvas / fetch / Playwright；node 可单测。
// =====================================================================
"use strict";

function NUM(v) { return (typeof v === "number" && isFinite(v)) ? v : null; }
function STR(v) { return (v == null ? null : String(v)); }
function normAngle(a) { return NUM(a) != null ? (((a % 360) + 540) % 360) - 180 : null; }

// ---- scriptType：cjk / latin / digit / mixed / empty ----
function scriptTypeOf(text) {
  const s = STR(text) || "";
  let cjk = 0, latin = 0, digit = 0;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3040 && c <= 0x30ff)) cjk += 1;
    else if (c >= 0x30 && c <= 0x39) digit += 1;
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) latin += 1;
    else if (c > 0x20 && c !== 0x2e && c !== 0x3a && c !== 0x2d && c !== 0x40 && c !== 0x2f && c !== 0x20) latin += 1; // 其他可读字符近似 latin
  }
  if (!s.trim()) return "empty";
  if (cjk && !latin && !digit) return "cjk";
  if (latin && !cjk && !digit) return "latin";
  if (digit && !cjk && !latin) return "digit";
  return "mixed";
}

// ---- 行数估计（按文本长度与宽度粗略；仅作因子，不权威）----
function lineCountEstimate(text, fontSize, width) {
  const s = STR(text) || "";
  const fs = NUM(fontSize), w = NUM(width);
  if (!s) return 0;
  if (fs == null || w == null || w <= 0) return 1;
  const avgCharW = (() => { const sc = scriptTypeOf(s); return sc === "cjk" ? fs : sc === "digit" ? fs * 0.55 : fs * 0.5; })();
  const perLine = Math.max(1, Math.floor(w / Math.max(1, avgCharW)));
  return Math.max(1, Math.ceil(s.length / Math.max(1, perLine)));
}

// ---- 因子：空间接近度（中心距离规约）----
function spatialProximity(anchorCenter, blockCenter, refScale) {
  if (!anchorCenter || !blockCenter) return 0;
  const d = Math.hypot(blockCenter.x - anchorCenter.x, blockCenter.y - anchorCenter.y);
  const s = NUM(refScale) != null && refScale > 0 ? refScale : Math.max(1, Math.abs(d));
  return 1 / (1 + d / s);
}

// ---- 因子：尺寸相似度（宽高各取 min/max 的交叠比例）----
function sizeSimilarity(a, b) {
  const aw = NUM(a.width), ah = NUM(a.height), bw = NUM(b.width), bh = NUM(b.height);
  if (aw == null || ah == null || bw == null || bh == null || aw <= 0 || ah <= 0 || bw <= 0 || bh <= 0) return 0.5; // 未知给中性
  const rw = Math.min(aw, bw) / Math.max(aw, bw);
  const rh = Math.min(ah, bh) / Math.max(ah, bh);
  return (rw + rh) / 2;
}

// ---- 因子：字号相似度（log 比例邻近度）----
function fontSizeSimilarity(a, b) {
  const fa = NUM(a), fb = NUM(b);
  if (fa == null || fb == null || fa <= 0 || fb <= 0) return 0.5;
  const logRatio = Math.abs(Math.log(fa) - Math.log(fb));
  return 1 / (1 + logRatio * 4);
}

// ---- 因子：文本长度/形态临近（长度差规约 + 同 script 加成）----
function textShapeSimilarity(aText, bText) {
  const a = STR(aText) || "", b = STR(bText) || "";
  if (!a && !b) return 1;
  const lenSim = 1 / (1 + Math.abs(a.length - b.length) / 8);
  const scriptSim = scriptTypeOf(a) === scriptTypeOf(b) ? 1 : 0.4;
  return lenSim * 0.6 + scriptSim * 0.4;
}

// ---- 因子：style 相似度（fontSize + fontFamily 尾 token）----
function styleSimilarity(block, anchor) {
  const fsSim = fontSizeSimilarity(block.fontSize, anchor.fontSize);
  let familySim = 0.5;
  const bf = STR(block.fontFamily), af = STR(anchor.fontFamily);
  if (bf && af) {
    const bLast = bf.split(/[\s,]/).filter(Boolean).pop() || "";
    const aLast = af.split(/[\s,]/).filter(Boolean).pop() || "";
    familySim = (bLast && aLast && bLast === aLast) ? 1 : 0.3;
  } else if (!bf && !af) familySim = 0.5;
  return fsSim * 0.7 + familySim * 0.3;
}

// ---- 因子：layer 关系（layerNum 距离）----
function layerSimilarity(block, anchor) {
  const b = NUM(block.layerNum), a = NUM(anchor.layerNum);
  if (b == null || a == null) return 0.5;
  return 1 / (1 + Math.abs(b - a) * 2);
}

// ---- 单个 block ↔ 单个 anchor 打分 ----
function scoreCandidate(block, anchor, refScale) {
  const spatial = spatialProximity(anchor.geometry.center, block.center, refScale);
  const size = sizeSimilarity({ width: anchor.geometry.visualWidth, height: anchor.geometry.visualHeight }, block);
  const shape = textShapeSimilarity(block.sourceText, anchor.sourceText.rawText);
  const style = styleSimilarity(block, anchor);
  const lines = (() => { const al = anchor.actualInk && anchor.actualInk.lineCount != null ? anchor.actualInk.lineCount : lineCountEstimate(anchor.sourceText.rawText, anchor.style.fontSize, anchor.geometry.visualWidth); const bl = block.lineCount != null ? block.lineCount : lineCountEstimate(block.sourceText, block.fontSize, block.width); return 1 / (1 + Math.abs(al - bl) * 0.8); })();
  const layer = layerSimilarity(block, anchor);
  const total = spatial * 0.35 + size * 0.15 + style * 0.12 + shape * 0.15 + lines * 0.08 + layer * 0.15;
  return {
    total: Math.round(total * 10000) / 10000,
    factors: {
      spatial: Math.round(spatial * 10000) / 10000,
      size: Math.round(size * 10000) / 10000,
      shape: Math.round(shape * 10000) / 10000,
      style: Math.round(style * 10000) / 10000,
      lines: Math.round(lines * 10000) / 10000,
      layer: Math.round(layer * 10000) / 10000
    }
  };
}

const MATCH_THRESHOLD = 0.55;
const UNCERTAIN_MARGIN = 0.15;

// ---- 主入口：block ↔ anchors 多因子匹配 ----
// anchors: [{ pageId, side, sourceText:{rawText}, style:{fontSize,fontFamily}, geometry:{center,visualWidth,visualHeight}, actualInk:{lineCount}, layerNum }]
// block:   { pageId, side, sourceText, center:{x,y}, width, height, angle?, fontSize?, fontFamily?, layerNum?, lineCount? }
// 产出：MATCH（唯一胜者 + 裕度足够）/ NATIVE_ANCHOR_UNCERTAIN（次近过近或过弱）/ NO_MATCH（无候选或全部过弱）
function matchAnchorBlock(opts) {
  const o = opts || {};
  const anchors = Array.isArray(o.anchors) ? o.anchors : [];
  const block = o.block || {};
  const refScale = NUM(o.refScale);
  const c = anchors[0] && anchors[0].geometry && anchors[0].geometry.center;
  const s = refScale != null ? refScale : (c && anchors[0].geometry ? Math.max(1, Math.abs(c.x)) : 100);
  const scores = [];
  anchors.forEach((a, i) => {
    let gate = "PASS";
    if (!a.pageId || !block.pageId || a.pageId !== block.pageId) gate = "PAGE_MISMATCH";
    else if (!a.side || !block.side || a.side !== block.side) gate = "SIDE_MISMATCH";
    if (gate === "PASS") scores.push(Object.assign({ anchorIndex: i }, scoreCandidate(block, a, s)));
  });
  if (!scores.length) return { ok: true, verdict: "NO_MATCH", reason: "page-gate: no candidate", matchedIndex: null, matchScore: null, scores: scores };
  const sorted = scores.slice().sort((x, y) => y.total - x.total);
  const best = sorted[0], second = sorted[1];
  const margin = second ? best.total - second.total : 1;
  let verdict, reason;
  if (best.total < MATCH_THRESHOLD) { verdict = "NO_MATCH"; reason = "below-threshold"; }
  else if (best.total >= MATCH_THRESHOLD && margin >= UNCERTAIN_MARGIN) { verdict = "MATCH"; reason = "unique-winner-with-margin"; }
  else { verdict = "NATIVE_ANCHOR_UNCERTAIN"; reason = "runner-up-too-close-or-ambiguous"; }
  return { ok: true, verdict: verdict, reason: reason, matchedIndex: best.anchorIndex, matchScore: best.total, margin: Math.round(margin * 10000) / 10000, scores: scores };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  scriptTypeOf, lineCountEstimate, spatialProximity, sizeSimilarity, fontSizeSimilarity,
  textShapeSimilarity, styleSimilarity, layerSimilarity, scoreCandidate, matchAnchorBlock,
  MATCH_THRESHOLD, UNCERTAIN_MARGIN
};