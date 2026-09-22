// =====================================================================
// extension/src/editor/image-ink-visual.js — OCR-P1 Commit 4.6-A
// ---------------------------------------------------------------------
// 单一职责：从源图像素提取 OCR block 区域的「防污染视觉墨迹 bbox」。
// 与 image-ink-target.js（整 bbox min/max）不同：本模块对目标文字带做
// 局部 Otsu + morphology + 行/列投影聚合，避免邻近文字/纹理/离散噪点
// 把 bbox 撑大或污染位置。
// 概念（Commit 4.6 任务书 §2/§3）：
//   OCR_BBOX          = 识别/初始搜索区域（不直接当最终视觉位置）
//   SOURCE_INK_BOX    = 本模块视觉墨迹（前景带优先 OCR bbox 中心）
//   VISUAL_TARGET_BOX = 文字最终视觉目标
// 铁律：
//   - 纯函数，node 可测；@require 沙箱同 scope 声明
//   - 不依赖 OCR text；不调用 AI；无固定倍率；无固定 offset
//   - 前景不足/全背景 → 显式 reason，禁伪造 inkBox
//   - 与 page-bridge.js inkMeasure 内联镜像逐逻辑一致（同一算法真源）
// =====================================================================
"use strict";

// 区域内局部 Otsu（与 image-ink-target 同构，双类方差最大）
function visualOtsu(gray, width, height, x0, y0, x1, y1) {
  var hist = new Array(256).fill(0);
  var sum = 0, total = 0;
  for (var y = y0; y < y1; y += 1) for (var x = x0; x < x1; x += 1) { var g = gray[y * width + x]; hist[g] += 1; total += 1; sum += g; }
  if (total < 24) return null;
  var sumB = 0, wB = 0, maxVar = 0, th = 128, found = false;
  for (var t = 0; t < 256; t += 1) {
    wB += hist[t]; if (wB === 0) continue;
    var wF = total - wB; if (wF === 0) break;
    sumB += t * hist[t];
    var mB = sumB / wB, mF = (sum - sumB) / wF;
    var v = wB * wF * (mB - mF) * (mB - mF);
    if (v > maxVar) { maxVar = v; th = t; found = true; }
  }
  return found ? th : null;
}

// 3x3 中位数/多数滤波（去离散噪点；边缘零填充）
function morphClean(fg, width, height, x0, y0, x1, y1) {
  var out = new Uint8Array(width * height);
  for (var y = y0; y < y1; y += 1) {
    for (var x = x0; x < x1; x += 1) {
      var n = 0, cnt = 0;
      for (var dy = -1; dy <= 1; dy += 1) for (var dx = -1; dx <= 1; dx += 1) {
        var ny = y + dy, nx = x + dx;
        if (ny < y0 || ny >= y1 || nx < x0 || nx >= x1) continue;
        n += fg[ny * width + nx]; cnt += 1;
      }
      out[y * width + x] = (cnt > 0 && n >= Math.ceil(cnt / 2)) ? 1 : 0;
    }
  }
  return out;
}

// 行投影找主文字带：每行前景计数 → 连续行段（允许最多 maxGap 个连续空行）；
// 取前景总量最大的带。返回 { bands:[{y0,y1,count}], best:{y0,y1,count}, rowBandConfidence }
function rowBands(rowCount, y0, y1, minBandH, maxGap) {
  maxGap = (maxGap != null) ? maxGap : 2;
  var bands = [];
  var curY0 = null, lastY = null, emptyRun = 0;
  for (var y = y0; y < y1; y += 1) {
    var c = rowCount[y] > 0;
    if (c) {
      if (curY0 === null) curY0 = y;
      lastY = y;
      emptyRun = 0;
    } else if (curY0 !== null) {
      emptyRun += 1;
      if (emptyRun > maxGap) { bands.push({ y0: curY0, y1: lastY + 1, count: 0 }); curY0 = null; lastY = null; emptyRun = 0; }
    }
  }
  if (curY0 !== null && lastY !== null) bands.push({ y0: curY0, y1: lastY + 1, count: 0 });
  // 计算每带前景计数
  bands.forEach(function (b) { var n = 0; for (var yy = b.y0; yy < b.y1; yy += 1) n += rowCount[yy]; b.count = n; });
  var best = null;
  bands.forEach(function (b) { if (!best || b.count > best.count) best = b; });
  var total = 0;
  bands.forEach(function (b) { total += b.count; });
  return { bands: bands, best: best, total: total, rowBandConfidence: (best && total > 0) ? best.count / total : 0 };
}

// 列投影（在目标带内）：前景计数 → 连续列段（gap≤2 合并）；取主段
function colSpan(colCount, x0, x1) {
  var segs = [];
  var curX0 = null, lastX = null;
  for (var x = x0; x < x1; x += 1) {
    var c = colCount[x];
    if (c > 0) {
      if (curX0 === null) curX0 = x;
      if (lastX === null || (x - lastX) <= 2) { /* same span or small gap */ } else { segs.push({ x0: curX0, x1: lastX + 1, count: colCount[x] }); curX0 = x; }
      lastX = x;
    } else if (curX0 !== null && lastX !== null && (x - lastX) > 2) {
      segs.push({ x0: curX0, x1: lastX + 1, count: 0 }); curX0 = null; lastX = null;
    }
  }
  if (curX0 !== null && lastX !== null) segs.push({ x0: curX0, x1: lastX + 1, count: 0 });
  var best = null;
  segs.forEach(function (s) { if (!best || (s.x1 - s.x0) > (best.x1 - best.x0)) best = s; });
  return best;
}

// 连通分量统计（简化：4/8 邻域 BFS，用于 componentCount/dominantRatio）
// 只统计带内主带；component 数量用于判断多文字组件
function connectedCount(binary, width, height, bx0, by0, bx1, by1, region) {
  var visited = new Uint8Array(width * height);
  var sizes = [];
  for (var y = by0; y < by1; y += 1) {
    for (var x = bx0; x < bx1; x += 1) {
      if (!binary[y * width + x] || visited[y * width + x]) continue;
      var q = [[x, y]], head = 0, size = 0;
      visited[y * width + x] = 1;
      while (head < q.length) {
        var p = q[head]; head += 1; size += 1;
        var px = p[0], py = p[1];
        for (var dy = -1; dy <= 1; dy += 1) for (var dx = -1; dx <= 1; dx += 1) {
          var nx2 = px + dx, ny2 = py + dy;
          if (nx2 < region.x0 || nx2 >= region.x1 || ny2 < region.y0 || ny2 >= region.y1) continue;
          if (nx2 >= bx0 && nx2 < bx1 && ny2 >= by0 && ny2 < by1 && binary[ny2 * width + nx2] && !visited[ny2 * width + nx2]) {
            visited[ny2 * width + nx2] = 1; q.push([nx2, ny2]);
          }
        }
      }
      sizes.push(size);
    }
  }
  var total = 0; sizes.forEach(function (s) { total += s; });
  var max = 0; sizes.forEach(function (s) { if (s > max) max = s; });
  return { componentCount: sizes.length, dominantComponentRatio: total > 0 ? max / total : 0, sizes: sizes };
}

// 主入口：防污染视觉墨迹测量
// input: { gray: Uint8Array(width*height), width, height, region:{x,y,width,height} }
// 返回: { ok, inkWidth, inkHeight, inkBox, coverage, confidence, threshold, method,
//         componentCount, dominantComponentRatio, rowBandConfidence, reason }
function measureVisualInk(gray, width, height, region) {
  var r = region || {};
  var x0 = Math.max(0, Math.floor(r.x || 0));
  var y0 = Math.max(0, Math.floor(r.y || 0));
  var x1 = Math.min(width - 1, Math.ceil((r.x || 0) + (r.width || 0)));
  var y1 = Math.min(height - 1, Math.ceil((r.y || 0) + (r.height || 0)));
  var ws = x1 - x0, hs = y1 - y0;
  if (!gray || ws < 4 || hs < 4 || x1 < x0 || y1 < y0) {
    return { ok: false, reason: "NO_REGION", inkWidth: null, inkHeight: null, inkBox: null, coverage: null, threshold: null, confidence: null, componentCount: null, dominantComponentRatio: null, rowBandConfidence: null, method: "VISUAL_MORPH_PROJECTION" };
  }
  var th = visualOtsu(gray, width, height, x0, y0, x1, y1);
  if (th == null) return { ok: false, reason: "NO_INK_OTSU", inkWidth: null, inkHeight: null, inkBox: null, coverage: null, threshold: null, confidence: null, componentCount: null, dominantComponentRatio: null, rowBandConfidence: null, method: "VISUAL_MORPH_PROJECTION" };
  // binary foreground（极性无关：少数类 = 前景）
  var bin = new Uint8Array(width * height);
  var dark = 0, total = ws * hs;
  for (var y = y0; y < y1; y += 1) for (var x = x0; x < x1; x += 1) if (gray[y * width + x] <= th) dark += 1;
  var takeDark = dark <= total - dark;
  for (var yy = y0; yy < y1; yy += 1) for (var xx = x0; xx < x1; xx += 1) {
    var g = gray[yy * width + xx];
    bin[yy * width + xx] = takeDark ? ((g <= th) ? 1 : 0) : ((g > th) ? 1 : 0);
  }
  var fgCnt = 0;
  for (var yy2 = y0; yy2 < y1; yy2 += 1) for (var xx2 = x0; xx2 < x1; xx2 += 1) fgCnt += bin[yy2 * width + xx2] ? 1 : 0;
  if (fgCnt < 8) return { ok: false, reason: "NO_INK", inkWidth: null, inkHeight: null, inkBox: null, coverage: null, threshold: th, confidence: 0, componentCount: null, dominantComponentRatio: null, rowBandConfidence: null, method: "VISUAL_MORPH_PROJECTION" };
  // 形态学清理（3x3 多数滤波）
  var clean = morphClean(bin, width, height, x0, y0, x1, y1);
  var cCnt = 0;
  for (var yy3 = y0; yy3 < y1; yy3 += 1) for (var xx3 = x0; xx3 < x1; xx3 += 1) cCnt += clean[yy3 * width + xx3] ? 1 : 0;
  if (cCnt < 8) return { ok: false, reason: "NO_INK_AFTER_CLEAN", inkWidth: null, inkHeight: null, inkBox: null, coverage: null, threshold: th, confidence: 0, componentCount: null, dominantComponentRatio: null, rowBandConfidence: null, method: "VISUAL_MORPH_PROJECTION" };
  // 行投影 → 主文字带
  var rowCount = new Array(height).fill(0);
  for (var ry = y0; ry < y1; ry += 1) for (var rx = x0; rx < x1; rx += 1) if (clean[ry * width + rx]) rowCount[ry] += 1;
  var rb = rowBands(rowCount, y0, y1, 2);
  if (!rb.best) return { ok: false, reason: "NO_BAND", inkWidth: null, inkHeight: null, inkBox: null, coverage: null, threshold: th, confidence: 0, componentCount: null, dominantComponentRatio: null, rowBandConfidence: null, method: "VISUAL_MORPH_PROJECTION" };
  var band0 = rb.best.y0, band1 = rb.best.y1;
  // 列投影（带内）→ 主列段
  var colCount = new Array(width).fill(0);
  for (var cy = band0; cy < band1; cy += 1) for (var cx = x0; cx < x1; cx += 1) if (clean[cy * width + cx]) colCount[cx] += 1;
  var cs = colSpan(colCount, x0, x1);
  if (!cs) return { ok: false, reason: "NO_SPAN", inkWidth: null, inkHeight: null, inkBox: null, coverage: null, threshold: th, confidence: 0, componentCount: null, dominantComponentRatio: null, rowBandConfidence: null, method: "VISUAL_MORPH_PROJECTION" };
  // 最终视觉 bbox（主带 × 主列段）
  var vx0 = cs.x0, vx1 = cs.x1, vy0 = band0, vy1 = band1;
  // 连通分量统计（在视觉 bbox 内）
  var cc = connectedCount(clean, width, height, vx0, vy0, vx1, vy1, { x0: x0, y0: y0, x1: x1, y1: y1 });
  var inkW = vx1 - vx0, inkH = vy1 - vy0;
  var vCnt = 0;
  for (var yy4 = vy0; yy4 < vy1; yy4 += 1) for (var xx4 = vx0; xx4 < vx1; xx4 += 1) vCnt += clean[yy4 * width + xx4] ? 1 : 0;
  return {
    ok: true,
    inkWidth: inkW,
    inkHeight: inkH,
    inkBox: { x: vx0, y: vy0, width: inkW, height: inkH },
    coverage: Math.round((vCnt / cbTotal(clean, width, height, x0, y0, x1, y1)) * 10000) / 10000,
    confidence: Math.round(Math.min(1, cc.dominantComponentRatio * 0.6 + rb.rowBandConfidence * 0.4) * 100) / 100,
    threshold: th,
    method: "VISUAL_MORPH_PROJECTION",
    componentCount: cc.componentCount,
    dominantComponentRatio: Math.round(cc.dominantComponentRatio * 10000) / 10000,
    rowBandConfidence: Math.round(rb.rowBandConfidence * 10000) / 10000,
    reason: "OK"
  };
}
function cbTotal(bin, width, height, x0, y0, x1, y1) {
  var n = 0;
  for (var y = y0; y < y1; y += 1) for (var x = x0; x < x1; x += 1) n += bin[y * width + x] ? 1 : 0;
  return n > 0 ? n : 1;
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  measureVisualInk: measureVisualInk,
  visualOtsu: visualOtsu,
  morphClean: morphClean,
  rowBands: rowBands,
  colSpan: colSpan,
  connectedCount: connectedCount
};
