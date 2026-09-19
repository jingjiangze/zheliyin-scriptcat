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

// Stage 7.8 §四/§五：Common OCR Result 候选 id —— 与 baidu-provider.candidateId 同构的确定性 hash。
function candidateId(source, index) {
  const s = String(source == null ? "cand" : source) + ":" + (index == null ? 0 : index);
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

function unifyCandidates(raw, imageSize, opts) {
  const o = opts || {};
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  list.forEach(function (it, i) {
    if (!it || !it.bbox || !it.text) return;
    const bbox = normBox(it.bbox);
    if (!bbox) return;
    const text = String(it.text).trim();
    if (!text) return;
    const sourceProvider = it.sourceProvider || o.sourceProvider || null;
    const cand = {
      text: text,
      bbox: bbox,
      confidence: typeof it.confidence === "number" ? it.confidence : null,
      rotation: typeof it.rotation === "number" ? it.rotation : null,
      coordinateSpace: "image-pixel",
      imageSize: imageSize || null,
      // Stage 7.8 §四/§五：Common OCR Result 字段（Provider 自带则透传，缺省回落）
      id: (it.id != null) ? String(it.id) : candidateId(sourceProvider || "cand", i),
      sourceProvider: sourceProvider,
      lineIndex: (it.lineIndex != null) ? it.lineIndex : i,
      wordIndex: (it.wordIndex != null) ? it.wordIndex : 0,
      rawMeta: (it.rawMeta != null) ? it.rawMeta : null
    };
    // Stage 6 P6.0：word/行信息（有则携带，缺省保持向后兼容）
    if (Array.isArray(it.words)) {
      const wb = [];
      it.words.forEach(function (w, wi) {
        if (!w || !w.text) return;
        const nb = normBox(w.bbox);
        if (!nb) return;
        wb.push({ text: String(w.text).trim(), bbox: nb, confidence: typeof w.confidence === "number" ? w.confidence : null, sourceProvider: sourceProvider, lineIndex: i, wordIndex: wi });
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
  // 真机调参（252438，stage-6）：chi_sim 逐字 bbox 同行的字高差异可达 1.5~1.8×（如 张=56px/三=36px），
  // 而行中心 y 差极小（5px）→ 以「中心 y 距」为主，字高相似度放宽（0.5），避免同一视觉行被拆成多行。
  // Stage 7.8R §十五/§十六/§十八：WORDS→LINE 阶段增加字高比 guard（相对字高差，禁绝对 px）——
  //   hSizeRatioMax 默认 2.0（= 旧行为零回归；40/20 ratio=2.0 边界处用实验值 1.8/1.9 收紧，
  //   最终阈值待 Fixture G 真机取证，§十四/§二十）。
  const hTol = o.heightTolRatio != null ? o.heightTolRatio : 0.5;
  const yTolRatio = o.yTolRatio != null ? o.yTolRatio : 0.45;
  const hSizeRatioMax = o.hSizeRatioMax != null ? o.hSizeRatioMax : 2.0;
  if (!list.length) return [];
  const sorted = list.slice().sort(function (a, b) { return (a.bbox.y - b.bbox.y) || (a.bbox.x - b.bbox.x); });
  const lines = [];
  sorted.forEach(function (w, wi) {
    const midY = w.bbox.y + w.bbox.height / 2;
    let placed = null;
    let mergeEv = null;
    let best = null; // 「最接近成功」的失败尝试（§十七 Merge Decision Evidence）
    for (let i = 0; i < lines.length; i += 1) {
      const L = lines[i];
      const lMid = L.bbox.y + L.bbox.height / 2;
      const scale = Math.max(w.bbox.height, L.bbox.height);
      const minH = Math.min(w.bbox.height, L.bbox.height);
      const ratio = minH > 0 ? scale / minH : null;
      const lastW = L.words[L.words.length - 1];
      // §十七 决策证据（数值化；baselineProxy=底部差近似基线差）
      const ev = {
        wordIndex: wi,
        heightA: lastW ? lastW.bbox.height : null,
        heightB: w.bbox.height,
        sizeRatio: ratio,
        centerYDelta: Math.abs(midY - lMid),
        verticalOverlap: (Math.min(L.bbox.y + L.bbox.height, w.bbox.y + w.bbox.height) - Math.max(L.bbox.y, w.bbox.y)) / (minH > 0 ? minH : 1),
        horizontalGap: lastW ? (w.bbox.x - (lastW.bbox.x + lastW.bbox.width)) : null,
        baselineProxy: lastW ? Math.abs((w.bbox.y + w.bbox.height) - (lastW.bbox.y + lastW.bbox.height)) : null,
        decision: "KEEP_SEPARATE"
      };
      const ok = Math.abs(midY - lMid) <= Math.max(6, scale * yTolRatio) &&
                 Math.abs(w.bbox.height - L.bbox.height) <= Math.max(6, scale * hTol) &&
                 (ratio == null || ratio <= hSizeRatioMax);
      if (ok) { placed = L; ev.decision = "MERGE"; mergeEv = ev; break; }
      if (!best) best = ev;
    }
    if (!placed) {
      placed = { words: [], bbox: null, sumC: 0, nC: 0, wordMergeEvidence: [], wordSplitEvidence: [] };
      lines.push(placed);
      if (best) placed.wordSplitEvidence.push(best);
    } else if (mergeEv) {
      placed.wordMergeEvidence = placed.wordMergeEvidence || [];
      placed.wordMergeEvidence.push(mergeEv);
    }
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
      wordBoxes: words.map(function (w) { return w.bbox; }),
      // Stage 7.8R §十七：Merge Decision Evidence（WORDS→LINE 阶段）
      wordMergeEvidence: L.wordMergeEvidence || [],
      wordSplitEvidence: L.wordSplitEvidence || []
    };
  });
  return applyTessLineText(out, o.tessLines);
}

// words → 统一 OCRCandidate 列表（bbox=行紧致包围盒，lineBBox 同 bbox，wordBoxes 全量）
// tessLines：executor 的原始 Tesseract 行（含 line.text），有则优先作最终文本（§7）。
// Stage 7.8 §五/§三十：Local 结果与 Baidu 同一 Common OCR Result schema，sourceProvider="LOCAL"。
function aggregateLineCandidates(words, imageSize, tessLines) {
  return groupWordsToLines(words, { tessLines: tessLines || null }).map(function (line, i) {
    return {
      id: candidateId("LOCAL", i),
      text: line.text,
      bbox: line.bbox,
      lineBBox: line.bbox,
      wordBoxes: line.wordBoxes,
      confidence: line.confidence,
      rotation: null,
      coordinateSpace: "image-pixel",
      imageSize: imageSize || null,
      sourceProvider: "LOCAL",
      lineIndex: i,
      wordIndex: 0,
      rawMeta: null
    };
  });
}

// ---- Stage 6.1 §3/§4/§5 + Stage 6.2 §四~§九：TextBlock 层（logical lines → logical text blocks）----
// 一个 TextBlock 最终对应一个 textbox（§8 硬规则：1 TextBlock = 1 textbox）。
// Stage 6.2 强制纠偏（拆分优先于合并，§五）：默认「每个 logical line 是独立区域」，
//   只有同时满足以下五个条件（§六 强关系，AND 语义）才允许合并：
//     1) 左边界一致：abs(L.x - block.xStart) ≤ leftAlignTolRatio × medianLineHeight（默认 0.5）
//     2) 行距合理：verticalGap / medianLineHeight ≤ gapRatioMax（默认 1.25），且 ≤ maxGapPx
//        （默认 1.5 × medianLineHeight，§八；废除固定 240px）
//     3) 横向重叠较强：overlap ≥ overlapRatioMin × min(blockW, L.w)（默认 0.5；§七 左右两列绝对禁止合并）
//     4) 尺寸关系合理：maxH/minH ≤ heightRatioMax（默认 2.0；标题大字+正文小字允许，仅距离近不允许）
//     5) 不跨越明显空白：由条件 2 的行距上限天然约束（姓名 空行 电话 → 分离）
//   旋转行（θ≠0）保留现有角度逻辑 → 独立 block。
// text 保留原始逻辑换行（§9）：lines.map(text).join("\n")，禁止重新猜测/重新分行。
// §九 诊断：每个 Block 输出 lines[{text,x,y,width,height}]、mergeReasons（为何多行合为一块）。
function groupLinesToBlocks(lines, opts) {
  const o = opts || {};
  // §八 初始参数（保守、拆分优先）；真机样本对比后按数据微调
  const gapRatioMax = o.gapRatioMax != null ? o.gapRatioMax : 1.25;
  // Stage 7.8 §二十/§二十二：Size Ratio Guard —— 明显大小不同禁止合并（宁可多拆，§二十七）。
  // Stage 7.8R §十四 校准（benchmark runtime/stage-7-8/size-ratio-benchmark.json）：
  //   1.2/1.3 → 0 FM / 0 FS；1.4/1.5 → 2 FM（B32_24、B28_20 被误并）。
  //   默认 1.3（= 旧 1.5 收紧；1.10~1.50 实验仍经 opts.sizeRatioMax / 兼容 heightRatioMax）。
  const sizeRatioMax = (o.sizeRatioMax != null) ? o.sizeRatioMax : ((o.heightRatioMax != null) ? o.heightRatioMax : 1.3);
  const overlapRatioMin = o.overlapRatioMin != null ? o.overlapRatioMin : 0.5;
  const leftAlignTolRatio = o.leftAlignTolRatio != null ? o.leftAlignTolRatio : 0.5;
  const maxGapPxOverride = o.maxGapPx != null ? o.maxGapPx : null; // null → 1.5 × medianLineHeight
  // Stage 7.8 §二十四：Vertical Overlap Guard —— y 带重叠超出阈值时视为同排续接，要求强横向覆盖。
  const vOverlapMergeMax = o.vOverlapMergeMax != null ? o.vOverlapMergeMax : 0.5;
  const vOverlapXMin = o.vOverlapXMin != null ? o.vOverlapXMin : 0.85;
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
  // 行高中位数（比均值稳健：同行内大小混排时不受极值拖累）
  function medianH(blk) {
    const hs = blk.lines.map(function (l) { return l.bbox.height; }).sort(function (a, b) { return a - b; });
    const n = hs.length;
    if (!n) return 0;
    return n % 2 ? hs[(n - 1) / 2] : (hs[n / 2 - 1] + hs[n / 2]) / 2;
  }
  function updateGeometry(blk) {
    let x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity;
    blk.lines.forEach(function (l) {
      x1 = Math.min(x1, l.bbox.x); x2 = Math.max(x2, l.bbox.x + l.bbox.width);
      y1 = Math.min(y1, l.bbox.y); y2 = Math.max(y2, l.bbox.y + l.bbox.height);
    });
    blk.xStart = x1; blk.xEnd = x2; blk.yStart = y1; blk.yEnd = y2;
    blk.bbox = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
    blk.mH = medianH(blk);
    blk.rotated = blk.lines.some(function (l) { return !isHorizontal(l); });
  }
  // Stage 7.8 §二十~§二十七：Size-Aware Merge —— 每次尝试都留下数值依据（§二十六 mergeReason 数值化），
  // 任一门禁 FAIL → KEEP_SEPARATE（§二十七 宁可多拆：容易判断→merge，明显字号冲突/无法确定→split）。
  // 门禁顺序：rotated → size-ratio(§二十二) → left-alignment → horizontal/vertical-overlap(§二十四)
  //   + baseline(§二十三) + xGap 归一化(§二十五) → vertical-gap。
  const MERGE_OK = ["height-ratio", "left-alignment", "horizontal-overlap", "vertical-gap"];
  function mergeMetrics(blk, L) {
    const m = {
      sizeRatio: (blk.mH > 0 && L.bbox.height > 0) ? Math.max(blk.mH, L.bbox.height) / Math.min(blk.mH, L.bbox.height) : null,
      baselineDelta: null,   // §二十三：行中心差 / max(mH, L.h)（正常堆叠仅记录，不作为门禁）
      verticalOverlap: null, // §二十四：y 带重叠高度 / min(mH, L.h)
      xGapRatio: null,       // §二十五：x 间距 / mH（同行续接诊断；垂直堆叠为 null）
      decision: "KEEP_SEPARATE"
    };
    const failed = [];
    if (blk.rotated || blk.mH <= 0 || L.bbox.height <= 0) return { ok: false, m: m, failed: ["rotated-or-invalid"] };
    if (m.sizeRatio > sizeRatioMax) failed.push("size-ratio");
    if (!failed.length) {
      // 1) 左边界一致（§六-1）
      if (Math.abs(L.bbox.x - blk.xStart) > leftAlignTolRatio * blk.mH) failed.push("left-alignment");
      // 3) 横向重叠较强（§六-3 / §七 左右两列防护）
      if (!failed.length) {
        const overlap = Math.min(blk.xEnd, L.bbox.x + L.bbox.width) - Math.max(blk.xStart, L.bbox.x);
        const minW = Math.min(blk.bbox.width, L.bbox.width);
        const xOk = overlap >= overlapRatioMin * minW;
        const yOverlap = (L.bbox.y + L.bbox.height > blk.yStart) && (L.bbox.y < blk.yEnd);
        if (yOverlap) {
          // 同排续接候选：记录数值诊断，并施加 §二十四 Vertical Overlap Guard / §二十三 Baseline 近似
          m.verticalOverlap = (Math.min(blk.yEnd, L.bbox.y + L.bbox.height) - Math.max(blk.yStart, L.bbox.y)) / Math.min(blk.mH, L.bbox.height);
          m.xGapRatio = ((L.bbox.x - blk.xEnd) / blk.mH);
          m.baselineDelta = Math.abs((L.bbox.y + L.bbox.height / 2) - (blk.yStart + blk.yEnd) / 2) / Math.max(blk.mH, L.bbox.height);
          if (m.verticalOverlap > vOverlapMergeMax) {
            if (overlap < vOverlapXMin * minW) failed.push("vertical-overlap");
            else if (m.baselineDelta > 0.5) failed.push("baseline-offset");
          } else if (!xOk) failed.push("horizontal-overlap");
        } else if (!xOk) {
          failed.push("horizontal-overlap");
        }
      }
      // 2)+5) 行距合理且不跨越空白区（§六-2/5；最大绝对值 = 1.5 × 中位行高，§八）
      if (!failed.length) {
        const gap = L.bbox.y - blk.yEnd;
        const maxGapPx = maxGapPxOverride != null ? maxGapPxOverride : 1.5 * blk.mH;
        if (gap > 0) {
          if (gap > maxGapPx) failed.push("vertical-gap");
          else if (gap / blk.mH > gapRatioMax) failed.push("vertical-gap");
        }
        // §二十三 baseline 记录（正常堆叠不设门禁，仅供 Fixture 分析）
        if (m.baselineDelta == null) m.baselineDelta = Math.abs((L.bbox.y + L.bbox.height / 2) - (blk.yStart + blk.yEnd) / 2) / Math.max(blk.mH, L.bbox.height);
      }
    }
    if (!failed.length) { m.decision = "MERGE"; return { ok: true, m: m, failed: [] }; }
    return { ok: false, m: m, failed: failed };
  }

  list.forEach(function (L) {
    let placed = null;
    let audit = null;
    let best = null; // 「最接近成功」的一次失败尝试（§四十一 拆分诊断）
    if (isHorizontal(L)) {
      for (let i = 0; i < blocks.length; i += 1) {
        const rc = mergeMetrics(blocks[i], L);
        if (rc.ok) { placed = blocks[i]; audit = rc.m; break; }
        if (!best || rc.failed.length < best.failed.length ||
            (rc.failed.length === best.failed.length && (rc.m.sizeRatio || 99) < (best.m.sizeRatio || 99))) best = rc;
      }
    }
    if (!placed) {
      placed = { lines: [], mergeReasons: [], mergeAudit: [], splitAudit: [] };
      blocks.push(placed);
      if (isHorizontal(L) && best) placed.splitAudit.push(Object.assign({ failed: best.failed.slice() }, best.m));
    }
    placed.lines.push(L);
    // §九：合并依据字符串记录（union，向后兼容诊断）；Stage 7.8：数值化 mergeAudit（§二十六）
    placed.mergeReasons = placed.mergeReasons || [];
    placed.mergeAudit = placed.mergeAudit || [];
    if (audit) {
      MERGE_OK.forEach(function (r) { if (placed.mergeReasons.indexOf(r) < 0) placed.mergeReasons.push(r); });
      placed.mergeAudit.push(audit);
    }
    updateGeometry(placed);
  });

  return blocks.map(function (blk, bi) {
    blk.lines.sort(function (a, b) { return (a.bbox.y - b.bbox.y) || (a.bbox.x - b.bbox.x); });
    const textLines = blk.lines.map(function (l) { return l.text; });
    let sumC = 0, nC = 0;
    const wordBoxes = [];
    blk.lines.forEach(function (l) {
      if (typeof l.confidence === "number") { sumC += l.confidence; nC += 1; }
      (l.wordBoxes || []).forEach(function (w) { wordBoxes.push(w); });
    });
    const lineGeo = blk.lines.map(function (l) {
      return { text: l.text, x: l.bbox.x, y: l.bbox.y, width: l.bbox.width, height: l.bbox.height };
    });
    return {
      blockIndex: bi,                                     // §九 / §24 Geometry
      lines: blk.lines,
      lineCount: blk.lines.length,
      lineGeometry: lineGeo,                              // §九：lines[{text,x,y,width,height}]
      mergeReasons: blk.mergeReasons || [],               // §九：合并依据（单行 block = []）
      mergeAudit: blk.mergeAudit || [],                   // Stage 7.8 §二十六：数值化合并依据[{sizeRatio,baselineDelta,verticalOverlap,xGapRatio,decision:"MERGE"}]
      splitAudit: blk.splitAudit || [],                   // §四十一：最接近成功的失败度量[{sizeRatio,…,decision:"KEEP_SEPARATE",failed:[原因]}]
      text: textLines.join("\n"),                         // §6/§9：保留原始逻辑换行
      bbox: blk.bbox,
      center: { x: blk.xStart + (blk.xEnd - blk.xStart) / 2, y: blk.yStart + (blk.yEnd - blk.yStart) / 2 },
      confidence: nC ? sumC / nC : null,
      wordBoxes: wordBoxes,
      lineBoxes: blk.lines.map(function (l) { return l.bbox; }),
      lineHeightMedian: blk.mH,
      coordinateSpace: "image-pixel"
    };
  });
}

// 中位数（构建期局部工具；不依赖 ctx 闭包）
function medianN(values) {
  const arr = (Array.isArray(values) ? values : []).filter(function (v) { return typeof v === "number" && isFinite(v) && v > 0; }).sort(function (a, b) { return a - b; });
  const n = arr.length;
  if (!n) return null;
  return n % 2 ? arr[(n - 1) / 2] : (arr[n / 2 - 1] + arr[n / 2]) / 2;
}

// 行级统一候选（任意 Provider）→ TextBlock 列表（§3 统一入口；行聚类后的候选无需再聚合 words）
// Stage 7.8：TextBlock 丰富字段 —— provider/sourceProvider（§五）、rawText/safeText +
// sanitize 诊断（§十三/§十四）、bboxHeight/estimatedTextHeight/sizeCluster/sizeConfidence/
// sizeRatio/normalizedTextHeight（§十七~§十九，经全局 classifySize，@require 注入）。
// 依赖缺省时安全降级（sanitize/size 字段跳过，不破坏既有结构）。
function buildTextBlocks(candidates, opts) {
  const list = (Array.isArray(candidates) ? candidates : []).filter(function (c) {
    return c && c.text && c.bbox && c.bbox.width > 0;
  });
  if (!list.length) return [];
  const imageSize = list[0] && list[0].imageSize ? list[0].imageSize : null;
  const o = opts || {};
  const sourceProvider = o.sourceProvider || (list[0] && list[0].sourceProvider) || null;
  const blocks = groupLinesToBlocks(list, o);
  // 页面内行高中位数（size-analyzer 的页面基准）
  const medH = medianN(blocks.map(function (b) { return b.lineHeightMedian; }));
  const sanitize = (typeof sanitizeOcrText === "function") ? sanitizeOcrText : null;
  const classify = (typeof classifySize === "function") ? classifySize : null;
  const safety = (typeof assessTextSafety === "function") ? assessTextSafety : null; // Stage 7.8R §八：Text Safety Gate
  const imageH = imageSize && typeof imageSize.height === "number" ? imageSize.height : null;
  return blocks.map(function (b) {
    const txt = String(b.text || "");
    const sr = sanitize ? sanitize(txt) : null;
    const sc = classify ? classify(b.lineHeightMedian || b.bbox.height || 0, { imageHeight: imageH, pageMedianHeight: medH }) : null;
    b.provider = sourceProvider;               // §五：Provider 来源保留（BAIDU/LOCAL）
    b.sourceProvider = sourceProvider;
    b.rawText = txt;                            // §十三：原始文本（证据/重处理）
    b.safeText = (sr && typeof sr.safeText === "string") ? sr.safeText : txt; // §十三：送 DIY 的安全文本
    b.sanitize = sr ? { changed: !!sr.changed, removed: sr.removed, normalized: sr.normalized, blockedCount: (sr.blocked || []).length, reason: sr.reason || "" } : null;
    // Stage 7.8R §八：Text Safety Gate（Sanitizer 之后兜底；依赖缺失时降级 null，不破坏既有结构）
    b.safety = safety ? safety({ text: txt, rawText: txt, safeText: b.safeText }, { blockedCount: (b.sanitize && b.sanitize.blockedCount) || 0 }) : null;
    b.bboxHeight = b.bbox ? b.bbox.height : null;    // §十七：bbox 高度
    b.estimatedTextHeight = (b.lineHeightMedian != null && b.lineHeightMedian > 0) ? b.lineHeightMedian : (b.bbox ? b.bbox.height : null); // §十七：估算字高（行高中位）
    if (sc) {                                     // §十八/§十九：相对字号信号 + numeric proxy
      b.sizeRatio = sc.sizeRatio;
      b.sizeCluster = sc.sizeCluster;
      b.sizeConfidence = sc.sizeConfidence;
      b.estimatedHeightPx = sc.estimatedHeightPx;
      b.normalizedTextHeight = sc.normalizedHeight;
    }
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
  unifyCandidates, groupWordsToLines, aggregateLineCandidates, normBox, candidateId,
  joinWordsSmart, applyTessLineText, rectOverlapArea,
  groupLinesToBlocks, buildTextBlocks,
  estimateCharWidth, estimateTextWidth, estimateTextLayout
};