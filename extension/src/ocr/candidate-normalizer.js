// =====================================================================
// 折立印名片套版助手 - OCR 候选统一归一化（Stage 5.5B P3, §六/§七 + Stage 6 P6.0）
// ---------------------------------------------------------------------
// 数据边界收口：无论 OCR 来自哪个 Provider/executor，都归一为统一 OCRCandidate：
//   {text, bbox{x,y,width,height}, center{x,y}, confidence, rotation,
//    lineBBox, wordBoxes, coordinateSpace:"image-pixel", imageSize}
// 输入形态（自动识别）：
//   1) executor v2 行级：{text, bbox{x0,y0,x1,y1}, words:[{text,bbox,confidence}]}
//   2) executor 行级（旧）：{text, bbox{x0,y0,x1,y1}}
//   3) 统一候选（Baidu Provider 等）：{text, bbox{x,y,width,height}}
// Stage 6 P6.0：
//   - lineBBox：原始行 bbox（如有 words 时为行包围盒）
//   - wordBoxes：原始 word bbox 数组（归一化后）
//   - bbox：项目自身几何聚合后的最终紧致 bbox（行聚类后为行内 words 的紧致包围盒；
//     无聚合输入时与 lineBBox 等价）
//   - groupWordsToLines / aggregateLineCandidates：轻量业务级行聚类（y 重叠/中心 y 距/
//     字高相似/阅读顺序），不做 OCR 研究级系统。
// 后续 Mapper（buildItemsFromOcr）只消费统一字段（bbox/center），兼容旧字段。
// 本模块为 @require 注入，纯函数可单测。
// =====================================================================
"use strict";

// bbox 归一化：{x0,y0,x1,y1}（executor）或 {x,y,width,height}（unified）→ {x,y,width,height}
function normBox(b) {
  if (b == null) return null;
  if (typeof b.x0 === "number" && typeof b.x1 === "number") {
    const x = Math.min(b.x0, b.x1);
    const y = Math.min(b.y0, b.y1);
    const width = Math.abs(b.x1 - b.x0);
    const height = Math.abs(b.y1 - b.y0);
    if (width <= 0 || height <= 0) return null;
    return { x: x, y: y, width: width, height: height };
  }
  if (typeof b.x === "number" && typeof b.width === "number") {
    if (b.width <= 0 || !(b.height > 0)) return null;
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  }
  return null;
}

function unifyCandidates(raw, imageSize) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  list.forEach(function (it) {
    if (!it || !it.bbox || !it.text) return;
    const bbox = normBox(it.bbox);
    if (!bbox) return;
    const text = String(it.text).trim();
    if (!text) return;
    const cand = {
      text: text,
      bbox: bbox,
      confidence: typeof it.confidence === "number" ? it.confidence : null,
      rotation: typeof it.rotation === "number" ? it.rotation : null,
      coordinateSpace: "image-pixel",
      imageSize: imageSize || null
    };
    // Stage 6 P6.0：word/行信息（有则携带，缺省保持向后兼容）
    if (Array.isArray(it.words)) {
      const wb = [];
      it.words.forEach(function (w) {
        if (!w || !w.text) return;
        const nb = normBox(w.bbox);
        if (!nb) return;
        wb.push({ text: String(w.text).trim(), bbox: nb, confidence: typeof w.confidence === "number" ? w.confidence : null });
      });
      if (wb.length) { cand.wordBoxes = wb; cand.lineBBox = bbox; }
    }
    out.push(cand);
  });
  return out;
}

// ---- Stage 6 P6.0：轻量业务级行聚类（words → logical lines → tight bbox）----
// 纯函数；合并依据：中心 y 距离 ≤ max(4, h*0.35)、字高差 ≤ max(3, h*0.30)；行内按 x 阅读顺序。
function groupWordsToLines(words, opts) {
  const list = (Array.isArray(words) ? words : [])
    .filter(function (w) { return w && w.text && w.bbox && typeof w.bbox.x === "number" && w.bbox.width > 0; })
    .map(function (w) {
      const b = normBox(w.bbox);
      return b ? { text: String(w.text).trim(), bbox: b, confidence: typeof w.confidence === "number" ? w.confidence : null } : null;
    })
    .filter(Boolean)
    .filter(function (w) { return w.text; });
  const o = opts || {};
  const hTol = o.heightTolRatio != null ? o.heightTolRatio : 0.3;
  const yTolRatio = o.yTolRatio != null ? o.yTolRatio : 0.35;
  if (!list.length) return [];
  const sorted = list.slice().sort(function (a, b) { return (a.bbox.y - b.bbox.y) || (a.bbox.x - b.bbox.x); });
  const lines = [];
  sorted.forEach(function (w) {
    const midY = w.bbox.y + w.bbox.height / 2;
    let placed = null;
    for (let i = 0; i < lines.length; i += 1) {
      const L = lines[i];
      const lMid = L.bbox.y + L.bbox.height / 2;
      const scale = Math.max(w.bbox.height, L.bbox.height);
      if (Math.abs(midY - lMid) <= Math.max(4, scale * yTolRatio) &&
          Math.abs(w.bbox.height - L.bbox.height) <= Math.max(3, scale * hTol)) { placed = L; break; }
    }
    if (!placed) { placed = { words: [], bbox: null, sumC: 0, nC: 0 }; lines.push(placed); }
    placed.words.push(w);
    if (!placed.bbox) {
      placed.bbox = { x: w.bbox.x, y: w.bbox.y, width: w.bbox.width, height: w.bbox.height };
    } else {
      const x2 = Math.max(placed.bbox.x + placed.bbox.width, w.bbox.x + w.bbox.width);
      const y2 = Math.max(placed.bbox.y + placed.bbox.height, w.bbox.y + w.bbox.height);
      placed.bbox.x = Math.min(placed.bbox.x, w.bbox.x);
      placed.bbox.y = Math.min(placed.bbox.y, w.bbox.y);
      placed.bbox.width = x2 - placed.bbox.x;
      placed.bbox.height = y2 - placed.bbox.y;
    }
    if (typeof w.confidence === "number") { placed.sumC += w.confidence; placed.nC += 1; }
  });
  return lines.map(function (L) {
    const words = L.words.slice().sort(function (a, b) { return a.bbox.x - b.bbox.x; });
    return {
      text: words.map(function (w) { return w.text; }).join(" "),
      bbox: L.bbox,
      confidence: L.nC ? L.sumC / L.nC : null,
      wordBoxes: words.map(function (w) { return w.bbox; })
    };
  });
}

// words → 统一 OCRCandidate 列表（bbox=行紧致包围盒，lineBBox 同 bbox，wordBoxes 全量）
function aggregateLineCandidates(words, imageSize) {
  return groupWordsToLines(words).map(function (line) {
    return {
      text: line.text,
      bbox: line.bbox,
      lineBBox: line.bbox,
      wordBoxes: line.wordBoxes,
      confidence: line.confidence,
      rotation: null,
      coordinateSpace: "image-pixel",
      imageSize: imageSize || null
    };
  });
}

if (typeof module !== "undefined" && module.exports) module.exports = { unifyCandidates, groupWordsToLines, aggregateLineCandidates, normBox };