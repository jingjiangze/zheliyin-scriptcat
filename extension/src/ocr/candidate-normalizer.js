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

// ---- Stage 6.1 §7：智能拼接（禁止无条件 words.join(" ")）----
// 规则：中文+中文 无空格；数字+数字 无空格；中文标点/结构字符（@ . : / # - 等）边界无空格；
//       中英混合贴近无空格；其余才用空格。手机号/邮箱/网址天然保持原结构。
// 重要原则：Tesseract 的 line.text 优先作为最终文本（见 applyTessLineText）；
//           words 的 bbox 才是几何，本函数仅作为无 line.text 时的兜底拼接。
const RE_CJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;
const RE_CJK_PUNC = /[\u3000-\u303f\uff00-\uffef\u2014\u2018\u2019\u201c\u201d\u2026\u00b7]/;
// 邮箱/网址/结构字符集（用 indexOf 而非字符类正则，避免 `\-` 之类意外构造范围）
const STRUCT_BOUND_CHARS = "@._:/#\\-|,;+~=&%^$!?'\"()[]{}<>*";
function isStructBoundaryChar(ch) { return STRUCT_BOUND_CHARS.indexOf(ch) >= 0; }
function joinWordsSmart(words) {
  const parts = (Array.isArray(words) ? words : [])
    .map(function (w) {
      if (typeof w === "string") return w.trim();
      return String((w && w.text) != null ? w.text : "").trim();
    })
    .filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];
  let out = parts[0];
  for (let i = 1; i < parts.length; i += 1) {
    const prev = out[out.length - 1];
    const next = parts[i][0];
    let needSpace = true;
    if (RE_CJK.test(prev) && RE_CJK.test(next)) needSpace = false;                 // 中文+中文
    else if (/\d/.test(prev) && /\d/.test(next)) needSpace = false;                 // 数字+数字（手机号连续）
    else if (RE_CJK_PUNC.test(prev) || RE_CJK_PUNC.test(next)) needSpace = false;   // 中文标点边界
    else if (isStructBoundaryChar(next) || isStructBoundaryChar(prev)) needSpace = false; // 邮箱/网址/结构字符
    else if ((RE_CJK.test(prev) && /\w/.test(next)) || (RE_CJK.test(next) && /\w/.test(prev))) needSpace = false; // 中英混合贴近
    out += (needSpace ? " " : "") + parts[i];
  }
  return out;
}

// 矩形交集面积（用于行 ↔ Tesseract line 文本匹配）
function rectOverlapArea(a, b) {
  if (!a || !b) return 0;
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width), y1 = Math.min(a.y + a.height, b.y + b.height);
  const w = x1 - x0, h = y1 - y0;
  return (w > 0 && h > 0) ? w * h : 0;
}

// 文本优先：用交集面积把各个聚合行的文本替换为 Tesseract 原始 line.text（§7 核心原则）。
// words 的 bbox 继续作为几何（行聚类/紧致包围盒），不猜测完整文本。
// §5 修正（2026-09-17 真机）：Tesseract chi_sim 的 line.text 会给中文词间加空格（「张 三」/「销售 经 理」），
//   与「中文之间被错误加入空格」问题冲突 → 仅当智能拼接结果含有 ASCII 字母（英文/邮箱/网址结构）时才采用
//   line.text（保留英文空格与结构），纯中文/数字行保留 joinWordsSmart 的无空格结果。
function applyTessLineText(lineList, tessLines) {
  if (!lineList || !lineList.length || !Array.isArray(tessLines) || !tessLines.length) return lineList;
  const tl = tessLines
    .map(function (l) {
      const b = normBox(l && l.bbox);
      const t = l && String(l.text || "").trim();
      return (t && b) ? { text: t, bbox: b } : null;
    })
    .filter(Boolean);
  if (!tl.length) return lineList;
  lineList.forEach(function (L) {
    if (!L || !L.bbox) return;
    if (!/[A-Za-z]/.test(L.text || "")) return; // 纯中文/数字行：保留智能拼接（无中文间空格）
    let best = null, bestScore = -1;
    tl.forEach(function (t) {
      const ov = rectOverlapArea(L.bbox, t.bbox);
      if (ov > bestScore) { bestScore = ov; best = t; }
    });
    if (best) L.text = best.text;
  });
  return lineList;
}

// ---- Stage 6 P6.0：轻量业务级行聚类（words → logical lines → tight bbox）----
// 纯函数；合并依据：中心 y 距离 ≤ max(4, h*0.35)、字高差 ≤ max(3, h*0.30)；行内按 x 阅读顺序。
// Stage 6.1 §7：文本拼接改用 joinWordsSmart；opts.tessLines 提供 Tesseract 原 line.text 时优先采用。
function groupWordsToLines(words, opts) {
  // 先归一化再过滤：executor 的 word bbox 是 {x0,y0,x1,y1}，必须经 normBox 转 {x,y,width,height}（否则空聚合→回退行级）
  const list = (Array.isArray(words) ? words : [])
    .map(function (w) {
      if (!w || !w.text) return null;
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
  const out = lines.map(function (L) {
    const words = L.words.slice().sort(function (a, b) { return a.bbox.x - b.bbox.x; });
    return {
      text: joinWordsSmart(words.map(function (w) { return w.text; })),
      bbox: L.bbox,
      confidence: L.nC ? L.sumC / L.nC : null,
      wordBoxes: words.map(function (w) { return w.bbox; })
    };
  });
  return applyTessLineText(out, o.tessLines);
}

// words → 统一 OCRCandidate 列表（bbox=行紧致包围盒，lineBBox 同 bbox，wordBoxes 全量）
// tessLines：executor 的原始 Tesseract 行（含 line.text），有则优先作最终文本（§7）。
function aggregateLineCandidates(words, imageSize, tessLines) {
  return groupWordsToLines(words, { tessLines: tessLines || null }).map(function (line) {
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

// ---- Stage 6.1 §3/§4/§5：TextBlock 层（logical lines → logical text blocks）----
// 一个 TextBlock 最终对应一个 textbox（§8 硬规则：1 TextBlock = 1 textbox）。
// 确定性规则（第一版不上 AI），至少计算 xStart/xEnd/centerX/yStart/yEnd/height/verticalGap/heightRatio：
//   合并条件：
//     1) 左边界相近：abs(line.x - block.xStart) ≤ leftAlignTolRatio × avgLineHeight
//     2) 行距合理：verticalGap / avgLineHeight ≤ gapRatioMax（且绝对值 ≤ maxGapPx）
//     3) 字高相近：max(h) / min(h) ≤ heightRatioMax
//     4) 阅读方向一致：默认 horizontal；旋转行（θ≠0）保留现有角度逻辑 → 独立 block
//   禁止过度合并（§5）：左右两列/多列（x 范围重叠不足）、上下两列（独立电话区/公司名与远处地址、
//     垂直距离明显过大）→ 必须为空间独立 TextBlock。
// text 保留原始逻辑换行（§9）：lines.map(text).join("\n")，禁止重新猜测/重新分行。
function groupLinesToBlocks(lines, opts) {
  const o = opts || {};
  const gapRatioMax = o.gapRatioMax != null ? o.gapRatioMax : 1.6;
  const heightRatioMax = o.heightRatioMax != null ? o.heightRatioMax : 2.4;
  const overlapRatioMin = o.overlapRatioMin != null ? o.overlapRatioMin : 0.25;
  const leftAlignTolRatio = o.leftAlignTolRatio != null ? o.leftAlignTolRatio : 0.9;
  const maxGapPx = o.maxGapPx != null ? o.maxGapPx : 240;
  const isHorizontal = function (l) {
    const a = typeof l.angle === "number" ? ((l.angle % 360) + 360) % 360 : 0;
    return Math.min(a, Math.abs(a - 360)) < 1e-6;
  };
  const list = (Array.isArray(lines) ? lines : [])
    .map(function (l) {
      if (!l || !l.text) return null;
      const b = normBox(l.bbox);
      let t = String(l.text || "").replace(/\r\n/g, "\n");
      if (!b || !t.trim()) return null;
      return {
        text: t,
        bbox: b,
        confidence: typeof l.confidence === "number" ? l.confidence : null,
        wordBoxes: Array.isArray(l.wordBoxes) ? l.wordBoxes : [],
        angle: typeof l.angle === "number" ? l.angle : (typeof l.rotation === "number" ? l.rotation : null)
      };
    })
    .filter(Boolean);
  if (!list.length) return [];
  list.sort(function (a, b) { return (a.bbox.y - b.bbox.y) || (a.bbox.x - b.bbox.x); });

  const blocks = [];
  function updateGeometry(blk) {
    let x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity, sumH = 0;
    blk.lines.forEach(function (l) {
      x1 = Math.min(x1, l.bbox.x); x2 = Math.max(x2, l.bbox.x + l.bbox.width);
      y1 = Math.min(y1, l.bbox.y); y2 = Math.max(y2, l.bbox.y + l.bbox.height);
      sumH += l.bbox.height;
    });
    blk.xStart = x1; blk.xEnd = x2; blk.yStart = y1; blk.yEnd = y2;
    blk.bbox = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
    blk.avgH = sumH / blk.lines.length;
    blk.rotated = blk.lines.some(function (l) { return !isHorizontal(l); });
  }
  function lineCanMerge(blk, L) {
    if (!blk.lines.length) return true;
    if (blk.rotated) return false;
    if (blk.avgH <= 0) return true;
    // 3) 字高相近
    const hRatio = Math.max(blk.avgH, L.bbox.height) / Math.min(blk.avgH, L.bbox.height);
    if (hRatio > heightRatioMax) return false;
    // 1) 左边界相近 + 5) 多列防护：x 范围须有重叠（左右两列不得合并）
    const leftAlignOk = Math.abs(L.bbox.x - blk.xStart) <= leftAlignTolRatio * blk.avgH;
    const overlap = Math.min(blk.xEnd, L.bbox.x + L.bbox.width) - Math.max(blk.xStart, L.bbox.x);
    const overlapOk = overlap >= overlapRatioMin * Math.min(blk.bbox.width, L.bbox.width);
    if (!leftAlignOk && !overlapOk) return false;
    // 2) 行距合理 + 5) 垂直距离明显过大（y 已按升序处理，L 在 blk 下方或同带）
    const gap = L.bbox.y - blk.yEnd;
    if (gap > 0) {
      if (gap > maxGapPx) return false;
      if (blk.avgH > 0 && gap / blk.avgH > gapRatioMax) return false;
    }
    return true;
  }

  list.forEach(function (L) {
    let placed = null;
    if (!isHorizontal(L)) { placed = null; } // 旋转行 → 独立 block（§4 保留现有角度逻辑）
    else {
      for (let i = 0; i < blocks.length; i += 1) {
        if (lineCanMerge(blocks[i], L)) { placed = blocks[i]; break; }
      }
    }
    if (!placed) { placed = { lines: [] }; blocks.push(placed); }
    placed.lines.push(L);
    updateGeometry(placed);
  });

  return blocks.map(function (blk) {
    blk.lines.sort(function (a, b) { return (a.bbox.y - b.bbox.y) || (a.bbox.x - b.bbox.x); });
    const textLines = blk.lines.map(function (l) { return l.text; });
    let sumC = 0, nC = 0;
    const wordBoxes = [];
    blk.lines.forEach(function (l) {
      if (typeof l.confidence === "number") { sumC += l.confidence; nC += 1; }
      (l.wordBoxes || []).forEach(function (w) { wordBoxes.push(w); });
    });
    return {
      lines: blk.lines,
      text: textLines.join("\n"),                             // §6/§9：保留原始逻辑换行
      bbox: blk.bbox,
      center: { x: blk.xStart + (blk.xEnd - blk.xStart) / 2, y: blk.yStart + (blk.yEnd - blk.yStart) / 2 },
      confidence: nC ? sumC / nC : null,
      wordBoxes: wordBoxes,
      lineBoxes: blk.lines.map(function (l) { return l.bbox; }),
      lineCount: blk.lines.length,
      coordinateSpace: "image-pixel"
    };
  });
}

// 行级统一候选（任意 Provider）→ TextBlock 列表（§3 统一入口；行聚类后的候选无需再聚合 words）
function buildTextBlocks(candidates, opts) {
  const list = (Array.isArray(candidates) ? candidates : []).filter(function (c) {
    return c && c.text && c.bbox && c.bbox.width > 0;
  });
  if (!list.length) return [];
  const imageSize = list[0] && list[0].imageSize ? list[0].imageSize : null;
  return groupLinesToBlocks(list, opts).map(function (b) {
    b.imageSize = imageSize;
    return b;
  });
}

// ---- Stage 6.1 §10/§11/§12：文本宽度估算（editor font calibration + 文本测量 + 安全余量）----
// 禁止「OCR bbox width = textbox width」作为唯一依据；优先让单行宽度容纳完整文本，防止提前换行。
function estimateCharWidth(ch, fs) {
  if (RE_CJK.test(ch) || RE_CJK_PUNC.test(ch)) return fs;      // 方块字/全角 ≈ 1 字宽
  if (/\s/.test(ch)) return fs * 0.32;                          // 空格
  if (/[A-Z]/.test(ch)) return fs * 0.72;                       // 大写
  if (/[0-9a-z]/.test(ch)) return fs * 0.55;                    // 小写/数字
  return fs * 0.6;
}
function estimateTextWidth(text, fontSize, opts) {
  const o = opts || {};
  const fs = fontSize > 0 ? fontSize : 16;
  const str = String(text || "");
  let w = 0;
  for (let i = 0; i < str.length; i += 1) w += estimateCharWidth(str[i], fs);
  return Math.ceil(w * (o.safetyRatio != null ? o.safetyRatio : 1.0));
}

// 多行 text → textbox 布局宽度 + 换行诊断（§11 硬约束：OCR 原始单行不得因宽度不足再换行；§18 诊断字段）。
// 返回：
//   { layoutWidth, perLine:[{text, estimatedWidth, needsWrap}], forcedWrapDetected, estimatedFinalLineCount }
// layoutWidth = clamp(max(60, 最长行估计宽 + margin, minWidth), 60, maxWidth)
// forcedWrapDetected：存在 needsWrap=true 的逻辑行（即单行在给定 maxWidth 下仍放不下）。
function estimateTextLayout(textLines, fontSize, opts) {
  const o = opts || {};
  const fs = fontSize > 0 ? fontSize : 16;
  const margin = o.margin != null ? o.margin : Math.max(12, fs * 0.4);
  const minWidth = o.minWidth != null ? o.minWidth : 60;
  const maxWidth = o.maxWidth != null ? o.maxWidth : 4000;
  const lines = (Array.isArray(textLines) ? textLines : []).map(function (l) { return String(l || ""); });
  const perLine = lines.map(function (text) {
    return { text: text, estimatedWidth: estimateTextWidth(text, fs) };
  }).filter(function (p) {
    return p.text !== "";
  });
  const wMax = perLine.reduce(function (m, p) { return Math.max(m, p.estimatedWidth); }, 0);
  let layoutWidth = Math.min(Math.max(minWidth, wMax + margin, 60), maxWidth);
  let forcedWrapDetected = false;
  perLine.forEach(function (p) {
    p.needsWrap = p.estimatedWidth + margin > layoutWidth;
    if (p.needsWrap) forcedWrapDetected = true;
  });
  return {
    layoutWidth: layoutWidth,
    perLine: perLine,
    forcedWrapDetected: forcedWrapDetected,
    estimatedFinalLineCount: perLine.length + perLine.reduce(function (n, p) {
      return n + (p.needsWrap ? Math.ceil((p.estimatedWidth + margin) / layoutWidth) - 1 : 0);
    }, 0)
  };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  unifyCandidates, groupWordsToLines, aggregateLineCandidates, normBox,
  joinWordsSmart, applyTessLineText, rectOverlapArea,
  groupLinesToBlocks, buildTextBlocks,
  estimateCharWidth, estimateTextWidth, estimateTextLayout
};