// =====================================================================
// 折立印名片套版助手 - 文本适配（text fit）：浏览器实测 → fontSize / textbox width / geometry 对比
// ---------------------------------------------------------------------
// Stage 8B STEP 3（坐标合同 docs/STAGE_8B_COORDINATE_CONTRACT.md §4/§5 F2/F3/F4）：
//   1. measureText 实测 glyph 包围盒（actualBoundingBoxAscent/Descent/Left/Right/width）。
//   2. solveFontSize：从 OCR 视觉行高（CANVAS 值）二分求解大字号，heightError≤2px / widthError≤3px。
//   3. solveTextWidth：实测行宽（advanceWidth / visualWidth），生产替换字符宽度估算（F3）。
//   4. fitTextObject：多行逐行 fit + textbox 尺寸（visualWidth vs layoutWidth 分离，F4）。
//   5. compareTextGeometry：期望 quad（image-space 映射）vs 创建后对象 aCoords → 误差/分数/阈值。
// 职责边界：只做 Typography 测量/几何对比；禁止掺入 OCR 提供商/Page Ownership/Native drawText。
// 本模块为 @require 注入 + node 单测；测量抽象可注入 provider（浏览器用真实 2d context，
//   node 测试用 syntheticTextMeasurer 的确定性模型）。
// =====================================================================
"use strict";

// ---- 测字器抽象：measureGlyph / measureLine 统一返回 ink 几何 ----
// provider.measureText(text, fontString) → {width, actualBoundingBoxLeft/Right/Ascent/Descent,…}
function createTextMeasurer(provider) {
  const measureOne = function (text, fs, fontFamily) {
    const fontString = (fs + "px ") + (fontFamily || "sans-serif");
    let m = null;
    try { m = provider && typeof provider.measureText === "function" ? provider.measureText(text, fontString) : null; } catch (e) { m = null; }
    if (!m || typeof m.width !== "number" || !(fs > 0)) return null;
    const width = m.width;
    const left = typeof m.actualBoundingBoxLeft === "number" ? m.actualBoundingBoxLeft : 0;
    const right = typeof m.actualBoundingBoxRight === "number" ? m.actualBoundingBoxRight : width;
    const ascent = typeof m.actualBoundingBoxAscent === "number" ? m.actualBoundingBoxAscent : fs * 0.8;
    const descent = typeof m.actualBoundingBoxDescent === "number" ? m.actualBoundingBoxDescent : fs * 0.2;
    return {
      text: text, fontSize: fs, font: fontString,
      advanceWidth: width,
      left: left, right: right, ascent: ascent, descent: descent,
      visualWidth: right - left,          // ink 宽度
      visualHeight: ascent + descent       // ink 高度（ascent + descent）
    };
  };
  return {
    measureGlyph: function (text, fs, fontFamily) { return measureOne(text, fs, fontFamily); },
    measureLine: function (line, fs, fontFamily) { return measureOne(line, fs, fontFamily); }
  };
}
// 无 provider 时返回空测字器（各函数得到 null，调用方自行兜底）
function emptyTextMeasurer() { return createTextMeasurer(null); }

// ---- 浏览器真测字器（CanvasRenderingContext2D.measureText）----
function browserTextMeasurer() {
  let ctx = null;
  try { if (typeof document !== "undefined") { const cv = document.createElement("canvas"); ctx = cv.getContext && cv.getContext("2d"); } } catch (e) { ctx = null; }
  const provider = ctx ? {
    measureText: function (text, fontString) {
      ctx.font = fontString;
      const m = ctx.measureText(text);
      return {
        width: m.width,
        actualBoundingBoxLeft: m.actualBoundingBoxLeft,
        actualBoundingBoxRight: m.actualBoundingBoxRight,
        actualBoundingBoxAscent: m.actualBoundingBoxAscent,
        actualBoundingBoxDescent: m.actualBoundingBoxDescent
      };
    }
  } : null;
  return { measurer: createTextMeasurer(provider), available: !!provider };
}

// ---- 合成测字器（仅测试 / 无浏览器兜底；生产必须走 browserTextMeasurer）----
// 确定性模型：CJK 一字宽=fs、字母数字=0.55fs、空格=0.32fs、其他=0.6fs；asc=0.8fs desc=0.2fs。
function syntheticTextMeasurer(opts) {
  const o = opts || {};
  const cjkW = o.cjk != null ? o.cjk : 1, alphanW = o.alphan != null ? o.alphan : 0.55,
        spaceW = o.space != null ? o.space : 0.32, otherW = o.other != null ? o.other : 0.6;
  const asc = o.ascent != null ? o.ascent : 0.8, desc = o.descent != null ? o.descent : 0.2;
  const RE_CJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;
  const RE_CJK_PUNC = /[\u3000-\u303f\uff00-\uffef\u2014\u2018\u2019\u201c\u201d\u2026\u00b7]/;
  const widthOf = function (ch) {
    if (RE_CJK.test(ch) || RE_CJK_PUNC.test(ch)) return cjkW;
    if (/\s/.test(ch)) return spaceW;
    if (/[A-Z0-9a-z]/.test(ch)) return alphanW;
    return otherW;
  };
  return createTextMeasurer({
    measureText: function (text, fontString) {
      const fsMatch = /^([\d.]+)px/.exec(fontString || "");
      const fs = fsMatch ? parseFloat(fsMatch[1]) : 16;
      let w = 0;
      for (let i = 0; i < text.length; i += 1) w += fs * widthOf(text[i]);
      return { width: w, actualBoundingBoxLeft: 0, actualBoundingBoxRight: w, actualBoundingBoxAscent: fs * asc, actualBoundingBoxDescent: fs * desc };
    }
  });
}

// ---- solveFontSize：二分 8~160 求解，使 ink visualHeight 逼近 target.height（≤heightTol）----
// 后接一轮 Newton 比例修正（measure→scale→re-measure），返回整数字号与精确浮点。
function solveFontSize(text, target, opts) {
  const o = opts || {};
  const measurer = o.measurer || emptyTextMeasurer();
  const font = o.fontFamily || "sans-serif";
  const lo = o.min != null ? o.min : 8, hi = o.max != null ? o.max : 160;
  const heightTol = o.heightTol != null ? o.heightTol : 2;
  const widthTol = o.widthTol != null ? o.widthTol : 3;
  const targetH = target && target.height;
  if (!text || !(targetH > 0)) return null;
  const heightAt = function (fs) { const m = measurer.measureGlyph(text, fs, font); return m ? m.visualHeight : null; };
  const widthAt = function (fs) { const m = measurer.measureGlyph(text, fs, font); return m ? m.visualWidth : null; };
  // 二分
  let a = lo, b = hi, exact = lo, bestErr = Infinity, iters = 0;
  for (; iters < 48; iters += 1) {
    const mid = (a + b) / 2;
    const h = heightAt(mid);
    if (h == null) break;
    const err = Math.abs(h - targetH);
    if (err < bestErr) { bestErr = err; exact = mid; }
    if (err <= heightTol) { exact = mid; bestErr = err; break; }
    if (h < targetH) a = mid; else b = mid;
    if (b - a < 0.05) break;
  }
  // Newton 修正：exact 处再量一次，按比例校正（ink 高度对 fs 近似线性）
  const h0 = heightAt(exact);
  if (h0 != null && h0 > 0) {
    const fs2 = Math.min(hi, Math.max(lo, exact * (targetH / h0)));
    const err2 = Math.abs((heightAt(fs2) || targetH + 99) - targetH);
    if (err2 < Math.abs(h0 - targetH)) { exact = fs2; bestErr = err2; }
  }
  const measured = measurer.measureGlyph(text, exact, font);
  return {
    fontSize: Math.round(exact),
    fontSizeExact: Math.round(exact * 1000) / 1000,
    heightError: measured ? Math.abs(measured.visualHeight - targetH) : null,
    widthError: measured ? Math.abs(measured.visualWidth - (target.width || 0)) : null,
    targetHeight: targetH, targetWidth: target.width || null,
    iterations: iters + 1,
    measured: measured
    // 注：widthError 仅当 target.width 提供时有意义（heightTol/widthTol 是教练条件，宽度超限由 solveTextWidth 兜底）
  };
}

// ---- solveTextWidth：实测行 ink 宽 → textbox 布局宽（visualWidth + margin，minWidth 兜底）----
function solveTextWidth(text, fs, opts) {
  const o = opts || {};
  const measurer = o.measurer || emptyTextMeasurer();
  const m = measurer.measureLine(text, fs, o.fontFamily || "sans-serif");
  if (!m) return null;
  const margin = o.margin != null ? o.margin : 0;
  const minWidth = o.minWidth != null ? o.minWidth : 0;
  return {
    text: text, fontSize: fs,
    advanceWidth: m.advanceWidth,
    visualWidth: m.visualWidth,
    left: m.left, right: m.right,
    visualHeight: m.visualHeight,
    boxWidth: Math.max(minWidth, m.visualWidth + margin)
  };
}

// ---- fitTextObject：多行逐行 fit + textbox 尺寸（visualWidth 与 layoutWidth 分离）----
// lines: [{text, targetHeight（OCR 行视觉高，CANVAS 值）}]；opts.margin 默认 max(10, fs*0.35)
function fitTextObject(lines, opts) {
  const o = opts || {};
  const measurer = o.measurer || emptyTextMeasurer();
  const font = o.fontFamily || "sans-serif";
  const list = (Array.isArray(lines) ? lines : []).filter(function (l) { return l && l.text && l.text.length > 0; });
  if (!list.length) return null;
  const perLine = list.map(function (l) {
    const r = solveFontSize(l.text, { height: l.targetHeight }, o);
    const fs = r ? r.fontSize : o.defaultFontSize || 14;
    return { text: l.text, targetHeight: l.targetHeight, fontSize: fs, fontSizeExact: r ? r.fontSizeExact : fs, heightError: r ? r.heightError : null, measure: solveTextWidth(l.text, fs, o) };
  });
  const primary = perLine[0].fontSize;
  const margin = o.margin != null ? o.margin : Math.max(10, Math.round(primary * 0.35));
  const maxLine = perLine.reduce(function (mx, p) { const w = p.measure ? p.measure.visualWidth : 0; return w > mx ? w : mx; }, 0);
  const minWidth = o.minWidth != null ? o.minWidth : 0;
  const lineSpace = o.lineSpace != null ? o.lineSpace : 0.3;   // 行距系数（× 该行 fontSize）
  const textboxWidth = Math.max(minWidth, maxLine + margin);
  let textboxHeight = 0;
  perLine.forEach(function (p, i) {
    const vh = p.measure ? p.measure.visualHeight : p.fontSize;
    textboxHeight += vh + (i < perLine.length - 1 ? p.fontSize * lineSpace : 0);
  });
  if (o.minHeight != null) textboxHeight = Math.max(textboxHeight, o.minHeight);
  return {
    perLine: perLine,
    fontSize: primary,
    margin: margin,
    textboxWidth: Math.round(textboxWidth),
    textboxHeight: Math.round(textboxHeight),
    maxVisualWidth: maxLine,
    visualWidth: maxLine,            // 文本实际视觉宽
    layoutWidth: Math.round(textboxWidth) // 布局框宽（含 margin）
  };
}

// ---- compareTextGeometry：期望 quad vs 创建后 aCoords quad ---- 
// quad 顺序 [tl,tr,br,bl]（同 image-space）。阈值默认：center 2px / width 3px / height 3px / angle 0.5°。
function quadCenter(quad) {
  let sx = 0, sy = 0;
  for (let i = 0; i < quad.length; i += 1) { sx += quad[i].x; sy += quad[i].y; }
  return { x: sx / quad.length, y: sy / quad.length };
}
function quadSize(quad) {
  if (!quad || quad.length < 4) return { width: 0, height: 0 };
  const top = Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y);
  const bot = Math.hypot(quad[2].x - quad[3].x, quad[2].y - quad[3].y);
  const left = Math.hypot(quad[3].x - quad[0].x, quad[3].y - quad[0].y);
  const right = Math.hypot(quad[2].x - quad[1].x, quad[2].y - quad[1].y);
  return { width: (top + bot) / 2, height: (left + right) / 2 };
}
function quadAngle(quad) {
  return (Math.atan2(quad[1].y - quad[0].y, quad[1].x - quad[0].x) * 180) / Math.PI;
}
function quadBounds(quad) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  quad.forEach(function (p) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });
  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
}
function angNorm(a) { return ((a + 180) % 360 + 360) % 360 - 180; }
function distP(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function compareTextGeometry(target, actual, opts) {
  const o = opts || {};
  if (!target || !actual || target.length < 4 || actual.length < 4) {
    return { pass: false, score: 0, failures: ["missing-quad"], centerError: Infinity, widthError: Infinity, heightError: Infinity, angleError: Infinity, cornerError: Infinity, aabbError: Infinity };
  }
  const centerTol = o.centerTol != null ? o.centerTol : 2;
  const widthTol = o.widthTol != null ? o.widthTol : 3;
  const heightTol = o.heightTol != null ? o.heightTol : 3;
  const angleTol = o.angleTol != null ? o.angleTol : 0.5;
  const centerTarget = quadCenter(target), centerActual = quadCenter(actual);
  const sizeT = quadSize(target), sizeA = quadSize(actual);
  const centerError = distP(centerTarget, centerActual);
  const widthError = Math.abs(sizeT.width - sizeA.width);
  const heightError = Math.abs(sizeT.height - sizeA.height);
  const angleError = Math.abs(angNorm(quadAngle(target) - quadAngle(actual)));
  // cornerError：对齐中心后 4 角平均距离
  let cornerSum = 0;
  for (let i = 0; i < 4; i += 1) {
    cornerSum += distP(
      { x: target[i].x - centerTarget.x, y: target[i].y - centerTarget.y },
      { x: actual[i].x - centerActual.x, y: actual[i].y - centerActual.y }
    );
  }
  const cornerError = cornerSum / 4;
  const tB = quadBounds(target), aB = quadBounds(actual);
  const aabbError = Math.max(Math.abs(tB.width - aB.width), Math.abs(tB.height - aB.height), distanceAABB(tB, aB));
  function distanceAABB(p, q) {
    const dx = Math.max(0, Math.max(p.left - (q.left + q.width), q.left - (p.left + p.width)));
    const dy = Math.max(0, Math.max(p.top - (q.top + q.height), q.top - (p.top + p.height)));
    return Math.hypot(dx, dy);
  }
  const failures = [];
  if (centerError > centerTol) failures.push("center");
  if (widthError > widthTol) failures.push("width");
  if (heightError > heightTol) failures.push("height");
  if (angleError > angleTol) failures.push("angle");
  // score：1 − 归一化加权误差（每个维度以 tol 为满刻度）
  const score = Math.max(0, Math.min(1, 1 - (
    (centerError / centerTol + widthError / widthTol + heightError / heightTol + angleError / angleTol) / 4
  )));
  return {
    pass: failures.length === 0,
    score: Math.round(score * 10000) / 10000,
    failures: failures,
    centerError: Math.round(centerError * 1000) / 1000,
    widthError: Math.round(widthError * 1000) / 1000,
    heightError: Math.round(heightError * 1000) / 1000,
    angleError: Math.round(angleError * 1000) / 1000,
    cornerError: Math.round(cornerError * 1000) / 1000,
    aabbError: Math.round(aabbError * 1000) / 1000
  };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  createTextMeasurer, emptyTextMeasurer, browserTextMeasurer, syntheticTextMeasurer,
  solveFontSize, solveTextWidth, fitTextObject,
  compareTextGeometry, quadCenter, quadSize, quadAngle, quadBounds, angNorm, distP
};