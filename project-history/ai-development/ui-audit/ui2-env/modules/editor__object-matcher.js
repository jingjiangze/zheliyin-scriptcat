// =====================================================================
// 折立印名片套版助手 - Object Matcher（Stage 5.2）
// ---------------------------------------------------------------------
// 确定性对象匹配层（禁止 AI / OCR 网络调用；OCR 只作为 Candidate 输入）。
// 输入：Candidate{text, bbox{x,y,width,height}, confidence, source} + EditorObject[]（含 visualBounds/geometry）
// 输出：{ status: MATCHED | AMBIGUOUS | NOT_FOUND | ERROR, ... }（§二十五 协议；不直接修改对象）
// 坐标：candidate.bbox 与 object.visualBounds 必须同坐标系（默认 Canvas pixel，origin=left/top）；
//       归一化工具 normalizeRect/denormalizeRect 供 OCR 坐标接入（§十九）。
// 约束：O(n)；不 throw（错误返回 ERROR）；line/group 不进入候选池（§二十/§二十一）；
//       不伪造 persistedId（§二十四）。
// =====================================================================
"use strict";

// ---- 归一化坐标工具（§十九）----
function normalizeRect(rect, canvasW, canvasH) {
  if (!rect || !canvasW || !canvasH) return null;
  return {
    x: rect.x / canvasW,
    y: rect.y / canvasH,
    width: rect.width / canvasW,
    height: rect.height / canvasH
  };
}
function denormalizeRect(rect, canvasW, canvasH) {
  if (!rect || !canvasW || !canvasH) return null;
  return { x: rect.x * canvasW, y: rect.y * canvasH, width: rect.width * canvasW, height: rect.height * canvasH };
}
// 像素 rect 转 {x,y,width,height,right,bottom,centerX,centerY,area}
function rectUtil(r) {
  const x = r.left != null ? r.left : r.x;
  const y = r.top != null ? r.top : r.y;
  const w = r.width, h = r.height;
  return {
    x: x, y: y, right: x + w, bottom: y + h,
    centerX: x + w / 2, centerY: y + h / 2,
    area: Math.max(0, w) * Math.max(0, h)
  };
}

// ---- 纯数学 AABB（§5.1：raw geometry + scale/angle → 轴对齐包围盒；无 getBoundingRect 时兜底）----
function aabbFromGeometry(g) {
  const w = (g.width || 0) * (g.scaleX || 1);
  const h = (g.height || 0) * (g.scaleY || 1);
  const a = ((g.angle || 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const bw = w * c + h * s;
  const bh = w * s + h * c;
  const cx = g.left + w / 2;
  const cy = g.top + h / 2;
  return { left: cx - bw / 2, top: cy - bh / 2, width: bw, height: bh };
}

// ---- 文本语义分类（与 Stage 5.0 字段分类 / legacy scoreObject 词表一致；确定性）----
function textKind(text) {
  const t = String(text || "").trim();
  const lower = t.toLowerCase();
  if (/1[3-9]\d{9}/.test(t) || /电话|手机|tel|phone|mobile/i.test(lower)) return "phone";
  if (/微信|wechat|\bwx\b/i.test(lower)) return "wechat";
  if (/@|邮箱|mail|email/i.test(lower)) return "email";
  if (/网址|网站|www\.|https?:\/\//i.test(lower)) return "website";
  if (/地址|address|省|市|区|街道|路|大厦|楼|室|工业园/i.test(lower)) return "address";
  if (/^\d{9,}$/.test(t) && t.length < 14 && /^[\d\s-]+$/.test(t)) return "phone";
  if (/公司|集团|科技|贸易|有限公司|厂|co\.?|ltd|limited|company|trading|technology|group/i.test(lower)) return "company";
  if (/经理|总监|工程师|销售|主管|负责人|manager|director|engineer/i.test(lower)) return "title";
  if (/^[\u4e00-\u9fa5]{2,4}$/.test(t)) return "name";
  return "unknown";
}
function textCompatibilityScore(candText, objText) {
  const k1 = textKind(candText);
  const k2 = textKind(objText);
  if (k1 === "unknown" && k2 === "unknown") return 0.4; // 双方未知语义 → 中性（依赖几何）
  if (k1 === k2) return 1.0;
  // name/company 中文槽位可互换（模板槽位语义弱：产品实测 company 会占用 name 位）
  if ((k1 === "name" && k2 === "company") || (k1 === "company" && k2 === "name")) return 0.55;
  if (k2 === "unknown") return 0.45; // 对象语义未知 → 候选语义可落入
  return 0.15; // 语义冲突
}

// ---- 候选池过滤（§二十/§二十一：line/group 排除；group-child 需上层标记）----
function candidateObjects(objects) {
  if (!Array.isArray(objects)) return [];
  return objects.filter((o) => o && o.identity && o.identity.isText === true && o.identity.kind === "text" && o.identity.subType !== "line" && !o.groupChild);
}

// ---- 核心匹配 ---- 
function match(candidate, objects, ctx) {
  try {
    const c = ctx || {};
    const canvasW = Number(c.canvasWidth) || 0;
    const canvasH = Number(c.canvasHeight) || 0;
    const pool = candidateObjects(objects);
    if (!candidate || !candidate.bbox || typeof candidate.bbox.width !== "number" || typeof candidate.bbox.height !== "number") {
      return { status: "ERROR", errorCode: "INVALID_CANDIDATE", errorMessage: "candidate.bbox 缺失或非法", candidateCount: pool.length };
    }
    if (!pool.length) return { status: "NOT_FOUND", candidateCount: 0, score: 0, reasons: [] };

    const cRect = rectUtil(candidate.bbox);
    const diag = Math.sqrt(Math.max(canvasW * canvasW + canvasH * canvasH, 1));
    const scored = pool.map(function (obj) {
      const vb = obj.visualBounds || aabbFromGeometry(obj.geometry || {});
      const oRect = rectUtil(vb);

      // IoU（candidate vs visualBounds）
      const ix = Math.max(0, Math.min(cRect.right, oRect.right) - Math.max(cRect.x, oRect.x));
      const iy = Math.max(0, Math.min(cRect.bottom, oRect.bottom) - Math.max(cRect.y, oRect.y));
      const inter = ix * iy;
      const union = cRect.area + oRect.area - inter;
      const iou = union > 0 ? inter / union : 0;

      // center distance（canvas 归一）
      const dx = cRect.centerX - oRect.centerX;
      const dy = cRect.centerY - oRect.centerY;
      const cd = Math.sqrt(dx * dx + dy * dy) / Math.max(diag, 1);

      // size similarity
      const areaRatio = Math.min(cRect.area, oRect.area) / Math.max(Math.max(cRect.area, oRect.area), 1);

      const objText = obj.content && obj.content.text != null ? obj.content.text : "";
      const textComp = textCompatibilityScore(candidate.text || "", objText);

      const score = 0.35 * iou + 0.2 * Math.max(0, 1 - cd) + 0.1 * areaRatio + 0.35 * textComp;
      const reasons = [];
      if (textComp >= 1) reasons.push("text-compatible");
      else if (textComp > 0.5) reasons.push("text-weak-compatible");
      if (iou >= 0.25) reasons.push("bbox-overlap");
      if (cd < 0.08) reasons.push("center-near");
      if (obj.identity && obj.identity.kind === "text") reasons.push("same-object-type");
      if (obj.identity && obj.identity.persistedId) reasons.push("identity-available");
      return { obj: obj, score: score, iou: iou, cd: cd, areaRatio: areaRatio, textComp: textComp, reasons: reasons };
    });

    scored.sort(function (a, b) { return b.score - a.score; });
    const top = scored[0];
    const second = scored[1] || null;
    const MATCH_TH = 0.45;
    const AMBIGUOUS_MARGIN = 0.08;

    if (top.score >= MATCH_TH) {
      if (!second || top.score - second.score >= AMBIGUOUS_MARGIN) {
        const o = top.obj;
        return {
          status: "MATCHED",
          candidateCount: pool.length,
          selected: {
            runtimeId: o.identity.runtimeId,
            persistedId: o.identity.persistedId,
            identityKind: o.identity.identityKind,
            type: o.identity.type,
            index: o.identity.index,
            markuuid: o.identity.markuuid
          },
          score: top.score,
          components: { iou: top.iou, centerDistance: top.cd, sizeRatio: top.areaRatio, textCompatibility: top.textComp },
          reasons: top.reasons
        };
      }
      return { status: "AMBIGUOUS", candidateCount: pool.length, topScore: top.score, secondScore: second.score, candidates: scored.slice(0, 3).map(function (s) { return { index: s.obj.identity.index, score: s.score, runtimeId: s.obj.identity.runtimeId, persistedId: s.obj.identity.persistedId }; }) };
    }
    return { status: "NOT_FOUND", candidateCount: pool.length, topScore: top.score, reasons: top.reasons };
  } catch (e) {
    return { status: "ERROR", errorCode: "MATCH_ERROR", errorMessage: String(e && e.message || e), candidateCount: Array.isArray(objects) ? objects.length : 0 };
  }
}

if (typeof module !== "undefined" && module.exports) module.exports = { match, candidateObjects, textKind, textCompatibilityScore, aabbFromGeometry, normalizeRect, denormalizeRect, rectUtil };