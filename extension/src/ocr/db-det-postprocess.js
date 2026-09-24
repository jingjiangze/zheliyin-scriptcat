// =====================================================================
// 折立印名片套版助手 - PP-OCRv6 DB 检测后处理（Stage 12 M1：det 后处理内核）
// ---------------------------------------------------------------------
// 职责（单一职责）：把 PP-OCRv6 det 的 **概率图**（prob map, 1x1xHxW 的 HxW 单通道）
// 转成**行级文字框**，全部参数可调（见 det-params.js 的调优逻辑）：
//
//   1. planDetResize      输入尺寸规划（limit_type min/max + max_side_limit）→ 缩放比例与反变换
//   2. dbBinarize         概率图二值化（> thresh）
//   3. dbConnectedComponents 8 邻域连通域 + 边界点采集（等价于 findContours 的外轮廓语义）
//   4. zyConvexHull       凸包（Andrew monotone chain）
//   5. zyMinAreaRect      最小面积外接矩形（旋转卡壳）→ 4 点多边形 + 角度
//   6. zyBoxScoreFast     框内概率均值评分（PaddleOCR box_score_fast 语义）
//   7. zyUnclipRect       外扩：d = area * unclip_ratio / perimeter（矩形等价 Clipper offset）
//   8. dbDetPostprocess   主入口：二值化→连通域→最小外接矩形→minSize→评分→boxThresh→unclip→输出
//   9. mapDetBoxesToImage 检测坐标系 → 原图像素坐标系（÷scale + 图内 clamp）
//
// 参数（与 PaddleOCR DBPostProcess 同名同义）：
//   thresh         二值化阈值（默认 0.30）
//   boxThresh      框评分阈值（默认 0.60；低于则丢弃）
//   unclipRatio    外扩比例（默认 1.5；0 = 不外扩，仅测试用）
//   minSize        最短边下限（默认 3）
//   maxCandidates  候选上限（默认 1000，超出按评分保留高分）
//   scoreMode      "fast"（框内均值，默认）
//
// 与 PaddleOCR 的差异（如实声明，非等价处）：
//   - 轮廓：用连通域 + 凸包替代 cv2.findContours（外轮廓语义等价；不做孔洞/内轮廓）
//   - 外扩：矩形解析式（A*r/P）替代 pyclipper 多边形 offset——对矩形/近矩形文字行等价
//   - 评分：仅实现 box_score_fast（slow 需掩码采样，本项目名片场景不需要）
//   - 像素语义：连通域为像素中心点集，最小外接矩形加 0.5px 半径补偿 → 与像素外框对齐
//
// 纯函数、自包含（无 require、无 DOM/网络）；node 可单测（runtime/stage12/*.test.js）。
// =====================================================================
"use strict";

var DET_PIXEL_PAD = 0.5; // 像素中心 → 像素外框的半像素补偿

function zyDetIsNum(v) { return typeof v === "number" && isFinite(v); }
function zyDetClamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

// ---------------------------------------------------------------------
// 1. 输入尺寸规划：limit_type "min"（放大短边）/ "max"（压缩长边）+ max_side_limit 兜底
//    + alignTo（默认 32：DBNet 内部按 32 下采样，非 32 倍数会在 ORT 内触发
//      "Shape mismatch attempting to re-use buffer" 真机错误，RapidOCR 同款对齐策略）
//    返回 {scale（规划比例，仅报告）、scaleX/scaleY（按轴反变换比例）、width/height}
//    反变换 = 坐标 × scaleX/scaleY（对齐使两轴比例略有差异，禁止只用单比例）
// ---------------------------------------------------------------------
function planDetResize(imageWidth, imageHeight, opts) {
  var o = opts || {};
  var w = zyDetIsNum(imageWidth) && imageWidth > 0 ? imageWidth : 0;
  var h = zyDetIsNum(imageHeight) && imageHeight > 0 ? imageHeight : 0;
  if (!w || !h) return { ok: false, errorCode: "IMAGE_SIZE_INVALID", scale: 1, width: 0, height: 0 };
  var limitSideLen = zyDetIsNum(o.limitSideLen) && o.limitSideLen > 0 ? o.limitSideLen : 736;
  var limitType = o.limitType === "max" ? "max" : "min";
  var maxSideLimit = zyDetIsNum(o.maxSideLimit) && o.maxSideLimit > 0 ? o.maxSideLimit : 4000;
  var align = o.alignTo === 0 ? 0 : (zyDetIsNum(o.alignTo) && o.alignTo > 0 ? o.alignTo : 32);
  var minSide = Math.min(w, h);
  var maxSide = Math.max(w, h);
  var scale = 1;
  var reason = "NO_RESIZE";
  if (limitType === "min" && minSide < limitSideLen) {
    scale = limitSideLen / minSide;
    reason = "UPSCALE_MIN_SIDE";
  } else if (limitType === "max" && maxSide > limitSideLen) {
    scale = limitSideLen / maxSide;
    reason = "DOWNSCALE_MAX_SIDE";
  }
  var maxClamped = false;
  if (maxSide * scale > maxSideLimit) {
    scale = maxSideLimit / maxSide;
    maxClamped = true;
    reason += "+MAX_SIDE_CLAMP";
  }
  var alignUp = function (v) { return align ? Math.max(align, Math.round(v / align) * align) : Math.max(1, Math.round(v)); };
  var outW = alignUp(w * scale);
  var outH = alignUp(h * scale);
  if (align && Math.max(outW, outH) > maxSideLimit) { // 对齐可能略微越界 → 回退到向下取整对齐
    outW = Math.max(align, Math.floor(w * scale / align) * align);
    outH = Math.max(align, Math.floor(h * scale / align) * align);
    reason += "+ALIGN_FIT";
  }
  return {
    ok: true,
    scale: scale,
    scaleX: w / outW,
    scaleY: h / outH,
    width: outW,
    height: outH,
    alignTo: align,
    limitSideLen: limitSideLen,
    limitType: limitType,
    maxSideLimit: maxSideLimit,
    maxClamped: maxClamped,
    reason: reason
  };
}

// ---------------------------------------------------------------------
// 2. 二值化（PaddleOCR: bitmap = prob > thresh —— 严格大于，prob === thresh 不算前景）
//    注：真实模型输出是 float32（ORT），「恰好等于阈值」不做 epsilon 宽容（与官方一致）。
// ---------------------------------------------------------------------
function dbBinarize(probMap, dims, thresh) {
  var w = dims && dims.width, h = dims && dims.height;
  if (!probMap || !w || !h || probMap.length < w * h) return null;
  var t = zyDetIsNum(thresh) ? thresh : 0.3;
  var mask = new Uint8Array(w * h);
  for (var i = 0; i < w * h; i += 1) mask[i] = probMap[i] > t ? 1 : 0;
  return mask;
}

// ---------------------------------------------------------------------
// 3. 连通域（8 邻域）+ 边界点采集（外轮廓语义）
// ---------------------------------------------------------------------
function dbConnectedComponents(mask, dims, opts) {
  var o = opts || {};
  var w = dims && dims.width, h = dims && dims.height;
  if (!mask || !w || !h) return [];
  var maxComponents = zyDetIsNum(o.maxComponents) && o.maxComponents > 0 ? o.maxComponents : 2000;
  var maxPointsPerComponent = zyDetIsNum(o.maxPointsPerComponent) && o.maxPointsPerComponent > 0 ? o.maxPointsPerComponent : 8000;
  var visited = new Uint8Array(w * h);
  var stack = new Int32Array(w * h);
  var out = [];
  for (var start = 0; start < w * h; start += 1) {
    if (!mask[start] || visited[start]) continue;
    if (out.length >= maxComponents) break;
    var sp = 0;
    stack[sp] = start; sp += 1;
    visited[start] = 1;
    var size = 0;
    var minX = w, minY = h, maxX = -1, maxY = -1;
    var boundary = [];
    while (sp > 0) {
      sp -= 1;
      var idx = stack[sp];
      var x = idx % w, y = (idx - x) / w;
      size += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      // 边界判定：4 邻域存在背景/越界（外轮廓点）
      var isBoundary = (x === 0) || (y === 0) || (x === w - 1) || (y === h - 1) ||
        !mask[idx - 1] || !mask[idx + 1] || !mask[idx - w] || !mask[idx + w];
      if (isBoundary && boundary.length < maxPointsPerComponent) boundary.push({ x: x, y: y });
      for (var dy = -1; dy <= 1; dy += 1) {
        for (var dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          var nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          var ni = ny * w + nx;
          if (!mask[ni] || visited[ni]) continue;
          visited[ni] = 1;
          stack[sp] = ni; sp += 1;
        }
      }
    }
    out.push({
      id: out.length,
      size: size,
      minX: minX, minY: minY, maxX: maxX, maxY: maxY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      boundary: boundary
    });
  }
  return out;
}

// ---------------------------------------------------------------------
// 4. 凸包（Andrew monotone chain；输入 [{x,y}]，输出逆时针 [{x,y}]）
// ---------------------------------------------------------------------
function zyConvexHull(points) {
  var pts = (points || []).slice().sort(function (a, b) { return a.x === b.x ? a.y - b.y : a.x - b.x; });
  if (pts.length <= 2) return pts;
  var cross = function (o, a, b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); };
  var lower = [];
  for (var i = 0; i < pts.length; i += 1) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0) lower.pop();
    lower.push(pts[i]);
  }
  var upper = [];
  for (var j = pts.length - 1; j >= 0; j -= 1) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[j]) <= 0) upper.pop();
    upper.push(pts[j]);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

// ---------------------------------------------------------------------
// 5. 最小面积外接矩形（旋转卡壳）
//    返回 { center, width, height, angle, u, n, polygon:[{x,y}x4], area }
//    - width = 沿 u（长轴候选）方向尺寸；angle 归一化到 (-PI/4, PI/4]
//    - pixelPad：像素中心 → 像素外框（默认 0.5）
// ---------------------------------------------------------------------
function zyMinAreaRect(hull, opts) {
  var o = opts || {};
  var pad = zyDetIsNum(o.pixelPad) ? o.pixelPad : DET_PIXEL_PAD;
  var pts = hull || [];
  if (pts.length === 1) {
    var c0 = { x: pts[0].x, y: pts[0].y };
    var one = 1 + pad * 2;
    return { center: c0, width: one, height: one, angle: 0, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, area: one * one, polygon: rectPolygon(c0, { x: 1, y: 0 }, { x: 0, y: 1 }, one, one) };
  }
  if (pts.length < 2) return null;
  var best = null;
  for (var i = 0; i < pts.length; i += 1) {
    var a = pts[i], b = pts[(i + 1) % pts.length];
    var ex = b.x - a.x, ey = b.y - a.y;
    var len = Math.sqrt(ex * ex + ey * ey);
    if (len === 0) continue;
    var ux = ex / len, uy = ey / len;
    var nx = -uy, ny = ux;
    var minU = Infinity, maxU = -Infinity, minN = Infinity, maxN = -Infinity;
    for (var k = 0; k < pts.length; k += 1) {
      var pu = pts[k].x * ux + pts[k].y * uy;
      var pn = pts[k].x * nx + pts[k].y * ny;
      if (pu < minU) minU = pu;
      if (pu > maxU) maxU = pu;
      if (pn < minN) minN = pn;
      if (pn > maxN) maxN = pn;
    }
    var w0 = (maxU - minU) + pad * 2;
    var h0 = (maxN - minN) + pad * 2;
    var area0 = w0 * h0;
    if (!best || area0 < best.area - 1e-9) {
      var cU = (minU + maxU) / 2, cN = (minN + maxN) / 2;
      best = {
        center: { x: cU * ux + cN * nx, y: cU * uy + cN * ny },
        width: w0, height: h0, angle: Math.atan2(uy, ux),
        u: { x: ux, y: uy }, n: { x: nx, y: ny }, area: area0
      };
    }
  }
  if (!best) return null;
  // 角度归一化：|angle| > 45° → 转置（宽高互换、方向轴旋转 90°）
  if (Math.abs(best.angle) > Math.PI / 4) {
    var swap = best.width; best.width = best.height; best.height = swap;
    var u2 = { x: best.n.x, y: best.n.y };
    var n2 = { x: -best.u.x, y: -best.u.y };
    best.u = u2; best.n = n2;
    best.angle = best.angle > 0 ? best.angle - Math.PI / 2 : best.angle + Math.PI / 2;
    best.area = best.width * best.height;
  }
  best.polygon = rectPolygon(best.center, best.u, best.n, best.width, best.height);
  return best;
}

function rectPolygon(center, u, n, w, h) {
  var hw = w / 2, hh = h / 2;
  var corner = function (su, sn) {
    return {
      x: center.x + u.x * hw * su + n.x * hh * sn,
      y: center.y + u.y * hw * su + n.y * hh * sn
    };
  };
  return [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
}

function rectAabb(rect) {
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (var i = 0; i < rect.polygon.length; i += 1) {
    var p = rect.polygon[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// 点是否在矩形内（u/n 基下投影判断，等价于矩形多边形包含测试）
function zyPointInRect(px, py, rect) {
  var dx = px - rect.center.x, dy = py - rect.center.y;
  var du = dx * rect.u.x + dy * rect.u.y;
  var dn = dx * rect.n.x + dy * rect.n.y;
  return Math.abs(du) <= rect.width / 2 && Math.abs(dn) <= rect.height / 2;
}

// ---------------------------------------------------------------------
// 6. 框评分（fast：框内概率均值）
// ---------------------------------------------------------------------
function zyBoxScoreFast(probMap, dims, rect) {
  var w = dims.width, h = dims.height;
  var aabb = rectAabb(rect);
  var x0 = Math.max(0, Math.floor(aabb.x)), x1 = Math.min(w - 1, Math.ceil(aabb.x + aabb.width));
  var y0 = Math.max(0, Math.floor(aabb.y)), y1 = Math.min(h - 1, Math.ceil(aabb.y + aabb.height));
  var sum = 0, count = 0;
  for (var y = y0; y <= y1; y += 1) {
    for (var x = x0; x <= x1; x += 1) {
      if (!zyPointInRect(x, y, rect)) continue;
      sum += probMap[y * w + x];
      count += 1;
    }
  }
  return { score: count ? sum / count : 0, count: count };
}

// ---------------------------------------------------------------------
// 7. 外扩（矩形解析式）：d = area * ratio / perimeter
// ---------------------------------------------------------------------
function zyUnclipRect(rect, ratio) {
  var r = zyDetIsNum(ratio) ? ratio : 1.5;
  if (r <= 0) {
    return { center: rect.center, width: rect.width, height: rect.height, angle: rect.angle, u: rect.u, n: rect.n,
      area: rect.width * rect.height, polygon: rectPolygon(rect.center, rect.u, rect.n, rect.width, rect.height), delta: 0 };
  }
  var perimeter = 2 * (rect.width + rect.height);
  var delta = perimeter > 0 ? (rect.width * rect.height * r) / perimeter : 0;
  var nw = rect.width + 2 * delta;
  var nh = rect.height + 2 * delta;
  return {
    center: rect.center, width: nw, height: nh, angle: rect.angle, u: rect.u, n: rect.n,
    area: nw * nh, polygon: rectPolygon(rect.center, rect.u, rect.n, nw, nh), delta: delta
  };
}

// ---------------------------------------------------------------------
// 8. 主入口
//    params: {thresh, boxThresh, unclipRatio, minSize, maxCandidates, scoreMode}
//    返回 {ok, boxes:[{order, polygon, aabb, rect{center,width,height,angle}, score, area, delta}], dropped, meta}
// ---------------------------------------------------------------------
function dbDetPostprocess(probMap, dims, params) {
  var t0 = Date.now();
  var p = params || {};
  var thresh = zyDetIsNum(p.thresh) ? p.thresh : 0.3;
  var boxThresh = zyDetIsNum(p.boxThresh) ? p.boxThresh : 0.6;
  var unclipRatio = zyDetIsNum(p.unclipRatio) ? p.unclipRatio : 1.5;
  var minSize = zyDetIsNum(p.minSize) ? p.minSize : 3;
  var maxCandidates = zyDetIsNum(p.maxCandidates) && p.maxCandidates > 0 ? p.maxCandidates : 1000;
  var scoreMode = p.scoreMode === "slow" ? "fast" : (p.scoreMode || "fast"); // 仅实现 fast
  var out = {
    ok: false, boxes: [], dropped: [],
    provider: "PPOCR_DET",
    coordinateSpace: "det-input",
    meta: { params: { thresh: thresh, boxThresh: boxThresh, unclipRatio: unclipRatio, minSize: minSize, maxCandidates: maxCandidates, scoreMode: scoreMode } }
  };
  if (!probMap || !dims || !dims.width || !dims.height || probMap.length < dims.width * dims.height) {
    out.errorCode = "PROB_MAP_INVALID";
    out.meta.elapsed = Date.now() - t0;
    return out;
  }
  var mask = dbBinarize(probMap, dims, thresh);
  var comps = dbConnectedComponents(mask, dims, { maxComponents: maxCandidates * 4 });
  out.meta.components = comps.length;
  var kept = [];
  for (var i = 0; i < comps.length; i += 1) {
    var comp = comps[i];
    var shortSide = Math.min(comp.width, comp.height);
    if (shortSide < minSize) { out.dropped.push({ reason: "too-small", componentId: comp.id, size: comp.size, aabb: { x: comp.minX, y: comp.minY, width: comp.width, height: comp.height } }); continue; }
    var hull = zyConvexHull(comp.boundary);
    var rect = zyMinAreaRect(hull);
    if (!rect) { out.dropped.push({ reason: "no-rect", componentId: comp.id, size: comp.size }); continue; }
    var minSide = Math.min(rect.width, rect.height);
    if (minSide < minSize) { out.dropped.push({ reason: "too-small", componentId: comp.id, size: comp.size, aabb: rectAabb(rect) }); continue; }
    var scored = zyBoxScoreFast(probMap, dims, rect);
    if (scored.score < boxThresh) { out.dropped.push({ reason: "low-score", componentId: comp.id, score: scored.score, aabb: rectAabb(rect) }); continue; }
    var un = zyUnclipRect(rect, unclipRatio);
    var sside = Math.sqrt(un.width * un.height);
    if (sside < minSize + 2) { out.dropped.push({ reason: "unclip-too-small", componentId: comp.id, score: scored.score, aabb: rectAabb(un) }); continue; }
    kept.push({
      order: 0,
      polygon: un.polygon,
      aabb: rectAabb(un),
      rect: { center: un.center, width: un.width, height: un.height, angle: un.angle },
      score: scored.score,
      area: un.area,
      delta: un.delta,
      componentSize: comp.size
    });
  }
  // 上限：超出按评分从高到低保留，随后恢复阅读顺序排序（y → x）
  if (kept.length > maxCandidates) {
    kept.sort(function (a, b) { return b.score - a.score; });
    for (var d = maxCandidates; d < kept.length; d += 1) out.dropped.push({ reason: "max-candidates", score: kept[d].score, aabb: kept[d].aabb });
    kept = kept.slice(0, maxCandidates);
  }
  kept.sort(function (a, b) { return a.aabb.y === b.aabb.y ? a.aabb.x - b.aabb.x : a.aabb.y - b.aabb.y; });
  for (var k = 0; k < kept.length; k += 1) kept[k].order = k;
  out.boxes = kept;
  out.ok = true;
  out.meta.kept = kept.length;
  out.meta.dropped = out.dropped.length;
  out.meta.elapsed = Date.now() - t0;
  return out;
}

// ---------------------------------------------------------------------
// 9. 检测坐标系 → 原图像素坐标系（按轴 × scaleX/scaleY + 图内 clamp）
//    按轴而非单一比例：对齐（alignTo=32）后两轴比例略有差异，用单比例会造成
//    长边方向系统性偏移（真机表现：右侧文字框整体左/右移）。
//    imageSize: {width, height}（原图自然尺寸）
// ---------------------------------------------------------------------
function mapDetBoxesToImage(boxes, resize, imageSize) {
  var sx = resize && zyDetIsNum(resize.scaleX) && resize.scaleX > 0 ? resize.scaleX
    : (resize && zyDetIsNum(resize.scale) && resize.scale > 0 ? resize.scale : 1);
  var sy = resize && zyDetIsNum(resize.scaleY) && resize.scaleY > 0 ? resize.scaleY : sx;
  var iw = imageSize && imageSize.width ? imageSize.width : 0;
  var ih = imageSize && imageSize.height ? imageSize.height : 0;
  var clampX = function (v) { return iw ? zyDetClamp(v, 0, iw) : v; };
  var clampY = function (v) { return ih ? zyDetClamp(v, 0, ih) : v; };
  return (boxes || []).map(function (b) {
    var poly = b.polygon.map(function (pt) { return { x: clampX(pt.x * sx), y: clampY(pt.y * sy) }; });
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < poly.length; i += 1) {
      var q = poly[i];
      if (q.x < minX) minX = q.x;
      if (q.x > maxX) maxX = q.x;
      if (q.y < minY) minY = q.y;
      if (q.y > maxY) maxY = q.y;
    }
    return {
      order: b.order,
      polygon: poly,
      bbox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      angle: b.rect ? b.rect.angle : 0,
      score: b.score,
      area: b.area,
      coordinateSpace: "image-pixel",
      imageSize: iw && ih ? { width: iw, height: ih } : null
    };
  });
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  DET_PIXEL_PAD: DET_PIXEL_PAD,
  planDetResize: planDetResize,
  dbBinarize: dbBinarize,
  dbConnectedComponents: dbConnectedComponents,
  zyConvexHull: zyConvexHull,
  zyMinAreaRect: zyMinAreaRect,
  zyBoxScoreFast: zyBoxScoreFast,
  zyUnclipRect: zyUnclipRect,
  dbDetPostprocess: dbDetPostprocess,
  mapDetBoxesToImage: mapDetBoxesToImage,
  rectAabb: rectAabb,
  rectPolygon: rectPolygon
};