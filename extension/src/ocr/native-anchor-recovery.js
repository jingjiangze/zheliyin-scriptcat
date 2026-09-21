// =====================================================================
// 折立印名片套版助手 - Native Anchor Recovery（OCR-P1 Commit 4.2, §四/§五/§十）
// ---------------------------------------------------------------------
// 定位：recovery 搜索链首位 —— Native OCR 行在「当前画布已有原生 textbox」中
//   优先定位 Anchor（复用对象 identity/位置），替代从 Baidu/Local/Image 猜几何。
// 硬规则（任务书 §四/§十/§十一）：
//   - 输入 anchor 必须同 page/side（跨 front/back 或跨 canvas 候选直接 NO_MATCH）；
//   - 多因素打分，禁止 text===text 粗暴直配、禁止 score>=0.5 单阈值接受；
//   - acceptance 必须满足「最低证据」（text 直接证据 或 顺序+邻域 结构性证据）；
//   - 输出可审计 factors：textScore / orderScore / neighborScore / sizeScore /
//     angleScore / totalScore 与逐项 reason；
//   - 本模块只消费纯数据（anchors 为快照），不触碰 DOM/canvas，绝不产出 text；
//     最终 text 恒由 Native OCR 提供（与 recovery 协议一致）。
// 纯函数、自包含（无 require）。
// =====================================================================
"use strict";

function isNum(v) { return typeof v === "number" && isFinite(v); }
function normAngle(a) { return isNum(a) ? (((a % 360) + 540) % 360) - 180 : null; }
function normText(s) {
  if (s == null) return "";
  return String(s).toLowerCase()
    .replace(/[\s\u3000\u00a0]+/g, "")
    .replace(/[·•．。，，、；》＇“”‘’（）【】［］《》：：-]/g, "");
}
function scriptType(t) {
  var s = String(t == null ? "" : t);
  var cjk = 0, latin = 0, digit = 0, i, c;
  for (i = 0; i < s.length; i += 1) {
    c = s.charCodeAt(i);
    if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3040 && c <= 0x30ff)) cjk += 1;
    else if (c >= 0x30 && c <= 0x39) digit += 1;
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) latin += 1;
    else if (c > 0x20 && c !== 0x2e && c !== 0x3a && c !== 0x2d && c !== 0x40 && c !== 0x2f) latin += 1;
  }
  if (!s.trim()) return "empty";
  if (cjk && !latin && !digit) return "cjk";
  if (latin && !cjk && !digit) return "latin";
  if (digit && !cjk && !latin) return "digit";
  return "mixed";
}
// normalized 文本相似度（0..1）：1=完全一致；0.8=一方包含（长侧>=3）；否则字符重叠率。
function textScore(a, b) {
  var ka = normText(a), kb = normText(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  var longer = ka.length >= kb.length ? ka : kb;
  var shorter = ka.length >= kb.length ? kb : ka;
  if (shorter.length >= 3 && longer.indexOf(shorter) >= 0) return 0.8;
  var set = {}, hit = 0, i;
  for (i = 0; i < longer.length; i += 1) set[longer[i]] = 1;
  for (i = 0; i < shorter.length; i += 1) if (set[shorter[i]]) hit += 1;
  return hit / longer.length;
}
// token/script 兼容（0..1）：script 相同 1，不同 0.3；空文本 0.5。
function tokenScriptScore(a, b) {
  var ta = scriptType(a), tb = scriptType(b);
  if (ta === "empty" || tb === "empty") return 0.5;
  return ta === tb ? 1 : 0.3;
}
// 长度兼容（0..1）：|Δlen|<=1 → 1；≤4 → 0.6；≤8 → 0.3；else 0。
function lengthScore(a, b) {
  var la = String(a == null ? "" : a).length, lb = String(b == null ? "" : b).length;
  var d = Math.abs(la - lb);
  if (d <= 1) return 1;
  if (d <= 4) return 0.6;
  if (d <= 8) return 0.3;
  return 0;
}
// 归一（0..1）：两个 rank 的距离（0=同 rank；≥3 视为远）。
function rankScore(x, y) {
  var d = Math.abs((x == null ? 0 : x) - (y == null ? 0 : y));
  if (d === 0) return 1;
  if (d <= 1) return 0.6;
  if (d <= 2) return 0.3;
  return 0;
}
// 邻域距离（0..1）：与相邻 anchor 的间距一致性（供「顺序与邻域」结构性证据）。
function neighborScore(aCenter, bCenter, expectedDist) {
  if (!aCenter || !bCenter) return 0.5;
  var d = Math.hypot(bCenter.x - aCenter.x, bCenter.y - aCenter.y);
  var ref = (isNum(expectedDist) && expectedDist > 0) ? expectedDist : Math.max(1, d);
  return 1 / (1 + d / ref);
}
// 尺寸兼容（0..1）：宽高各 min/max 交叠比例的均值；未知给中性 0.5。
function sizeScore(a, b) {
  var aw = isNum(a && a.width) ? a.width : null, ah = isNum(a && a.height) ? a.height : null;
  var bw = isNum(b && b.width) ? b.width : null, bh = isNum(b && b.height) ? b.height : null;
  if (aw == null || ah == null || bw == null || bh == null || aw <= 0 || ah <= 0 || bw <= 0 || bh <= 0) return 0.5;
  var rw = Math.min(aw, bw) / Math.max(aw, bw);
  var rh = Math.min(ah, bh) / Math.max(ah, bh);
  return (rw + rh) / 2;
}
// 旋转兼容（0..1）：仅有可靠双方角度时计算；任一无角度 → 0.5（中性，不惩罚）；
// 角度差 ≤5° → 1；≤15° → 0.8；≤45° → 0.5；否则 0.1。
function angleScore(a, b) {
  var aa = normAngle(a), ba = normAngle(b);
  if (aa == null || ba == null) return 0.5;
  var d = Math.abs(normAngle(aa - ba));
  if (d <= 5) return 1;
  if (d <= 15) return 0.8;
  if (d <= 45) return 0.5;
  return 0.1;
}

// ---- 单 anchor 综合评分（无单阈值粗暴接受；acceptance 见 resolveAnchor）----
function scoreAnchor(native, anchor, context) {
  var ctx = context || {};
  var ts = textScore(native.nativeNormalizedText != null ? native.nativeNormalizedText : native.nativeText, anchor.normalizedText != null ? anchor.normalizedText : anchor.text);
  var tk = tokenScriptScore(native.nativeText, anchor.text);
  var ln = lengthScore(native.nativeText, anchor.text);
  var textFac = (ts * 0.7 + tk * 0.2 + ln * 0.1);
  // 顺序：native.expectedOrder vs anchor.yIndex/order
  var oy = rankScore(native.expectedOrder, (anchor.yIndex != null ? anchor.yIndex : (isNum(anchor.order) ? anchor.order : null)));
  var oxVal = (anchor.center && isNum(anchor.center.x)) ? 0.5 : null;
  var ox = (typeof ctx.xOrderScore === "function" && anchor.center) ? Math.min(1, ctx.xOrderScore(anchor.center)) : (oxVal == null ? 0.5 : oxVal);
  var orderFac = (oy * 0.7) + (ox == null ? 0 : ox * 0.3);
  // 邻域：与上一锚点（按 canvas y 序）中心距
  var neigh = 0.5;
  if (anchor.center && ctx.prevCenters && ctx.prevCenters.length) {
    var pc = ctx.prevCenters[0];
    neigh = neighborScore(pc, anchor.center, isNum(ctx.expectDist) ? ctx.expectDist : null);
  }
  var sz = sizeScore({ width: anchor.width, height: anchor.height }, { width: native.width, height: native.height });
  var ag = angleScore(native.angle, anchor.angle);
  var total = textFac * 0.5 + orderFac * 0.22 + neigh * 0.08 + sz * 0.12 + ag * 0.08;
  return {
    textScore: Math.round(ts * 10000) / 10000,
    tokenScore: Math.round(tk * 10000) / 10000,
    lengthScore: Math.round(ln * 10000) / 10000,
    textFac: Math.round(textFac * 10000) / 10000,
    orderScore: Math.round(orderFac * 10000) / 10000,
    yOrderScore: Math.round(oy * 10000) / 10000,
    xOrderScore: ox == null ? null : Math.round(ox * 10000) / 10000,
    neighborScore: Math.round(neigh * 10000) / 10000,
    sizeScore: Math.round(sz * 10000) / 10000,
    angleScore: Math.round(ag * 10000) / 10000,
    totalScore: Math.round(total * 10000) / 10000
  };
}

// ---- 主入口 ----
// input: {
//   nativeText,            // Native OCR 行的原始文本（唯一 text truth；此处仅用于匹配）
//   nativeNormalizedText,  // 可选：已规范化文本（缺省内部再算）
//   expectedOrder,         // 行在 Native 阅读序中的序号（0-based）
//   width, height, angle,  // 可选：Native 行几何提示（canvas 系或 image 系需同 anchor 系，缺省 null）
//   existingAnchors,       // [{ pageId, side, text, normalizedText?, center{x,y}, yIndex/order,
//                          //    width, height, angle|null, identity:{uuid,multiUuid}|null, raw? }]
//   geometryCandidates     // 可选忽略（geometry 由调用方以 anchor.geometry 提供；保留字段兼容）
// }
// opts: { pageId, side, thresholds:{ textMin, orderMin, totalMin, margin }, expectDist }
// out: {
//   matched: true|false, anchor: 命中的 anchor（快照副本）, score, factors, reason,
//   verdict: "MATCH"|"UNCERTAIN"|"NO_MATCH"
// }
function resolveAnchor(input, opts) {
  var o = opts || {};
  var native = input || {};
  var anchors = (Array.isArray(native.existingAnchors) ? native.existingAnchors : []);
  var T = o.thresholds || {};
  var textMin = T.textMin != null ? T.textMin : 0.8;        // text 直接证据门槛
  var orderMin = T.orderMin != null ? T.orderMin : 0.6;     // 顺序+邻域 结构性证据门槛（orderFac）
  var totalMin = T.totalMin != null ? T.totalMin : 0.62;    // 综合最低
  var margin = T.margin != null ? T.margin : 0.12;          // 唯一胜者裕度
  var expectDist = o.expectDist != null ? o.expectDist : null;
  var wantPage = o.pageId != null ? o.pageId : native.pageId;
  var wantSide = o.side != null ? o.side : native.side;
  if (!native.nativeText) return { matched: false, verdict: "NO_MATCH", reason: "no-native-text", score: 0, factors: null, anchor: null };
  // 同 page/side 硬门（跨 front/back / 跨 canvas 候选直接拒绝）
  var inScope = anchors.filter(function (a) {
    if (wantPage != null && a.pageId != null && String(a.pageId) !== String(wantPage)) return false;
    if (wantSide != null && a.side != null && String(a.side) !== String(wantSide)) return false;
    return true;
  });
  if (!inScope.length) return { matched: false, verdict: "NO_MATCH", reason: "no-anchor-in-page-slide-scope", score: 0, factors: null, anchor: null };
    {
    var scored = [];
    var prevCenters = [];
    var sortedA = inScope.slice().sort(function (a, b) {
      var ay = (a.yIndex != null ? a.yIndex : (isNum(a.order) ? a.order : Infinity));
      var by = (b.yIndex != null ? b.yIndex : (isNum(b.order) ? b.order : Infinity));
      return ay - by || ((a.center && isNum(a.center.y)) ? a.center.y : 0) - ((b.center && isNum(b.center.y)) ? b.center.y : 0);
    });
    sortedA.forEach(function (a) {
      var f = scoreAnchor({
        nativeText: native.nativeText,
        nativeNormalizedText: native.nativeNormalizedText,
        expectedOrder: native.expectedOrder != null ? native.expectedOrder : 0,
        width: native.width, height: native.height, angle: native.angle
      }, a, { prevCenters: prevCenters, expectDist: expectDist, xOrderScore: function (c) { return 0.5; } });
      scored.push({ anchor: a, factors: f });
      if (a.center) prevCenters.unshift(a.center);
    });
    scored.sort(function (x, y) { return y.factors.totalScore - x.factors.totalScore; });
    var best = scored[0], second = scored[1] || null;
    var mg = second ? best.factors.totalScore - second.factors.totalScore : 1;
    // 最低证据 acceptance（杜绝宽松阈值）：
    //   evidence-A：text 直接证据 —— textFac >= textMin（含 ts>=0.8 强一致或包含级）
    //   evidence-B：结构性证据 —— orderFac >= orderMin 且 sizeScore >= 0.5（避免纯编号猜测）
    var evA = best.factors.textFac >= textMin && best.factors.textScore >= 0.8;
    var evB = best.factors.orderScore >= orderMin && best.factors.sizeScore >= 0.5;
    var reasons = [];
    if (!evA && !evB) reasons.push("evidence-insufficient");
    if (best.factors.totalScore < totalMin) reasons.push("below-total-min");
    if (mg < margin) reasons.push("runner-up-too-close");
    if (reasons.length) {
      var reason = reasons.join("|");
      var verdict = (reasons.indexOf("runner-up-too-close") >= 0) ? "UNCERTAIN" : "NO_MATCH";
      return { matched: false, verdict: verdict, reason: reason, score: best.factors.totalScore, factors: best.factors, anchor: null };
    }
    return { matched: true, verdict: "MATCH", reason: "multi-factor-evidence", score: best.factors.totalScore, factors: best.factors, anchor: best.anchor };
  }
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  resolveAnchor: resolveAnchor,
  scoreAnchor: scoreAnchor,
  textScore: textScore,
  tokenScriptScore: tokenScriptScore,
  lengthScore: lengthScore,
  rankScore: rankScore,
  neighborScore: neighborScore,
  sizeScore: sizeScore,
  angleScore: angleScore,
  scriptType: scriptType,
  normText: normText
};
