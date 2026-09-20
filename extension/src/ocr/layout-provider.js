// =====================================================================
// 折立印名片套版助手 - Layout Provider（Stage 9 P2, §十四~§十五）
// ---------------------------------------------------------------------
// 职责（§一/§四/§十四）：
//   Baidu OCR = Geometry Evidence Provider（布局真值）。text 只作为 hintText 帮助匹配，
//   绝不参与最终 textbox.text（Rule 2）。
// 本模块定义 LayoutCandidate 统一结构（未来换 Tesseract/OpenCV/Cloud OCR 可任其成为 layout
// provider，§十五），并提供 Rule 硬断言：layout 候选永远不能成为最终 text。
// 复用：baidu-provider 已输出 Common OCR Result（id/text/bbox/confidence/sourceProvider/rawMeta），
// 本模块只做映射与职责声明，不重写 baidu-provider（§十四 禁止重写）。
// =====================================================================
"use strict";

// ---- Common OCR Result 候选 → LayoutCandidate（纯函数）----
// c: { id, text, bbox:{x,y,width,height}, confidence, sourceProvider, rawMeta }
// out: { id, pageId, hintText, bbox, confidence, geometry:{x,y,width,height,center}, rawMeta, provider }
function toLayoutCandidate(c, opts) {
  var o = opts || {};
  if (!c || !c.bbox || !c.text) return null;
  var b = c.bbox;
  if ([b.x, b.y, b.width, b.height].some(function (v) { return typeof v !== "number" || !isFinite(v); })) return null;
  if (b.width <= 0 || b.height <= 0) return null;
  var line = c.rawMeta && c.rawMeta.location ? c.rawMeta.location : b;
  return {
    id: c.id != null ? String(c.id) : null,
    pageId: o.pageId || null,
    hintText: String(c.text),
    bbox: { x: b.x, y: b.y, width: b.width, height: b.height },
    confidence: typeof c.confidence === "number" ? c.confidence : null,
    geometry: {
      x: b.x, y: b.y, width: b.width, height: b.height,
      center: { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    },
    provider: c.sourceProvider || o.sourceProvider || "BAIDU",
    rawMeta: c.rawMeta != null ? c.rawMeta : line
  };
}

// ---- 批量映射 + 元信息 ----
function buildLayoutCandidates(candidates, opts) {
  var o = opts || {};
  var list = (Array.isArray(candidates) ? candidates : []).map(function (c) { return toLayoutCandidate(c, o); }).filter(Boolean);
  return {
    provider: o.provider || "BAIDU",
    pageId: o.pageId || null,
    candidates: list,
    count: list.length
  };
}

// ---- Rule 2 硬断言：layout 候选的 hintText 永远不能成为最终 textbox.text ----
// 返回当前候选结构的「可编辑文本来源判定」：layout 永远是 false。
function canUseAsFinalText(layoutCandidate) {
  return false;
}

// ---- Rule 保障检查：把一组候选标记成「仅几何」并拒绝任何试图读取 hintText 为 text 的用法 ----
function assertGeometryOnly(candidates) {
  (Array.isArray(candidates) ? candidates : []).forEach(function (c) {
    if (c && typeof c === "object") { Object.defineProperty(c, "__geometryOnly", { value: true, enumerable: false, writable: false }); }
  });
  return (candidates || []).length;
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  toLayoutCandidate, buildLayoutCandidates, canUseAsFinalText, assertGeometryOnly
};