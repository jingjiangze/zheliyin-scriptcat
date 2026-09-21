// =====================================================================
// 折立印名片套版助手 - Geometry Occupancy（OCR-P1 Commit 4.3, §十一/§十二）
// ---------------------------------------------------------------------
// occupiedGeometry：recovery candidate 的占用登记与验收。
//   1. 任何 candidate：already occupied → reject；
//   2. 防止：一个 Baidu bbox 被两个 Native 行复用 / 一个 Local bbox 被多行复用 /
//      ImageInk 重复补到同一对象 / 已创建对象再次生成对象；
//   3. Page/Canvas/Transaction 隔离：candidate 必须与 Native OCR 行属于同一
//      pageId + side + canvasId + imageFingerprint，禁止 front→back / 上一张图→当前。
// 输出统一 { accepted, rejected, rejectionReason }。
// 纯函数、自包含（无 require）。
// =====================================================================
"use strict";

function isNum(v) { return typeof v === "number" && isFinite(v); }
function rectOf(g) {
  if (!g) return null;
  var b = g.bbox || g;
  if (!b) return null;
  var x = isNum(b.x) ? b.x : b.x0, y = isNum(b.y) ? b.y : b.y0;
  var x2 = isNum(b.width) ? x + b.width : (isNum(b.x1) ? b.x1 : NaN);
  var y2 = isNum(b.height) ? y + b.height : (isNum(b.y1) ? b.y1 : NaN);
  if (!(isFinite(x) && isFinite(y) && isFinite(x2) && isFinite(y2) && x2 > x && y2 > y)) return null;
  return { x: x, y: y, width: x2 - x, height: y2 - y };
}
function overlapRatio(a, b) {
  var ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  var iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  if (!(ix > 0 && iy > 0)) return 0;
  var ia = ix * iy;
  var minA = Math.min(a.width * a.height, b.width * b.height);
  return minA > 0 ? ia / minA : 0;
}

// target：{ pageId, side, canvasId, imageFingerprint } —— candidate 必须同事务同页
function scopeMatches(target, c) {
  if (!target || !c) return false;
  if (target.pageId != null && c.pageId != null && String(target.pageId) !== String(c.pageId)) return false;
  if (target.side != null && c.side != null && String(target.side) !== String(c.side)) return false;
  if (target.canvasId != null && c.canvasId != null && String(target.canvasId) !== String(c.canvasId)) return false;
  if (target.imageFingerprint != null && c.imageFingerprint != null && String(target.imageFingerprint) !== String(c.imageFingerprint)) return false;
  return true;
}

// createOccupancy(target)：返回占用管理器 { occupy(candidate), list() }
function createOccupancy(target) {
  var occupied = [];
  return {
    target: target || null,
    // candidate: { bbox, pageId, side, canvasId, imageFingerprint, source? }
    // opts: { overlapMax }
    occupy: function (candidate, opts) {
      var o = opts || {};
      var overlapMax = o.overlapMax != null ? o.overlapMax : 0.5;
      if (!scopeMatches(this.target, candidate)) return { accepted: false, rejected: true, rejectionReason: "SCOPE_MISMATCH", candidate: candidate };
      var r = rectOf(candidate);
      if (!r) return { accepted: false, rejected: true, rejectionReason: "GEOMETRY_INVALID", candidate: candidate };
      for (var i = 0; i < occupied.length; i += 1) {
        var or = rectOf(occupied[i]);
        if (!or) continue;
        if (overlapRatio(r, or) > overlapMax) {
          return { accepted: false, rejected: true, rejectionReason: "OVERLAP_OCCUPIED", candidate: candidate, conflictWith: occupied[i] };
        }
      }
      occupied.push(candidate);
      return { accepted: true, rejected: false, rejectionReason: null, candidate: candidate };
    },
    list: function () { return occupied.slice(); }
  };
}
// 独立调用：occupiedGeometries 数组 + candidate → 验收（不登记）
function tryOccupy(occupiedGeometries, candidate, opts) {
  var o = opts || {};
  var overlapMax = o.overlapMax != null ? o.overlapMax : 0.5;
  var r = rectOf(candidate);
  if (!r) return { accepted: false, rejectionReason: "GEOMETRY_INVALID" };
  for (var i = 0; i < (Array.isArray(occupiedGeometries) ? occupiedGeometries.length : 0); i += 1) {
    var or = rectOf(occupiedGeometries[i]);
    if (!or) continue;
    if (overlapRatio(r, or) > overlapMax) return { accepted: false, rejectionReason: "OVERLAP_OCCUPIED", conflictWith: occupiedGeometries[i] };
  }
  return { accepted: true, rejectionReason: null };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  createOccupancy: createOccupancy,
  tryOccupy: tryOccupy,
  scopeMatches: scopeMatches,
  overlapRatio: overlapRatio,
  rectOf: rectOf
};
