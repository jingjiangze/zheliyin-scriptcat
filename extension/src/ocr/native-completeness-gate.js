// =====================================================================
// 折立印名片套版助手 - Native Completeness Gate（OCR-P0.3-C/D/E, §10~§13, §16）
// ---------------------------------------------------------------------
// 定位：Native/Geometry Alignment（native-geometry-aligner）之后的硬门禁。
// 语义（生产硬规则，§11/§12）：
//   Native Text exists + Geometry exists = eligible（创建候选）
//   Native Text exists + Geometry missing → NATIVE_GEOMETRY_UNRESOLVED（§11）
//     禁止用 Baidu 原文字段顶替，禁止随便居中/随机位置/固定偏移/固定纵向间距。
//   Native 识别 N 行、仅 N-2 行有可靠 geometry → NATIVE_GEOMETRY_INCOMPLETE
//     （§12）本批不进入创建 —— 杜绝「识别 8 行画布 6 行却报成功」的部分成功假象。
// 搜索链（§10，OCR-P0.3-C）：native 行找不到 Baidu line geometry 时，依次寻求：
//   Baidu line → Baidu word → Local line → Native Anchor → ImageInk（P1 扩展位）。
//   各 Provider 只提供 position/bbox/rotation/line grouping，绝不提供最终 text。
// 本模块：
//   1. evaluateCompleteness(alignResult) —— 由 aligner 输出计算门禁结论。
//   2. resolveGeometryCandidates(blocks, extras) —— 把 line+word+local 候选
//      摊平成 aligner 可用候选集（仅几何，不写 text）。
//   3. resolveUnmatchedGeometry(alignResult) —— 为 unmatchedNative 逐行寻找
//      其它几何证据（word/local/anchor 优先级），产出解析记录。
// 纯函数，node 可测。
// =====================================================================
"use strict";

var CODE_COMPLETE = "COMPLETE";
var CODE_INCOMPLETE = "NATIVE_GEOMETRY_INCOMPLETE";
var CODE_UNRESOLVED = "NATIVE_GEOMETRY_UNRESOLVED";

// ---- §10：摊平候选（line + wordBoxes + 外部 local/ink 候选）----
// blocks: 主几何候选（Baidu unified，1 block=1 line，含 bbox）
// extras: [{ bbox, sourceProvider, kind:"word"|"line"|"ink"|"anchor", text? }]
// 返回 aligner 输入候选（仅保留几何属性与 source；text 仅用于匹配因子，不作最终文字）
function resolveGeometryCandidates(blocks, extras) {
  var out = [];
  (Array.isArray(blocks) ? blocks : []).forEach(function (b) {
    if (!b || !b.bbox) return;
    out.push({ sourceProvider: b.sourceProvider || "BAIDU", kind: "line", bbox: b.bbox, text: b.text != null ? String(b.text) : null, _raw: b });
    var wb = b.wordBoxes || b.words || null;
    if (Array.isArray(wb)) {
      wb.forEach(function (w) { if (w && w.bbox) out.push({ sourceProvider: b.sourceProvider || "BAIDU", kind: "word", bbox: w.bbox, text: w.text != null ? String(w.text) : null, lineIndex: b.lineIndex != null ? b.lineIndex : null }); });
    }
  });
  (Array.isArray(extras) ? extras : []).forEach(function (x) {
    if (!x || !x.bbox) return;
    out.push({ sourceProvider: x.sourceProvider || "LOCAL", kind: x.kind || "line", bbox: x.bbox, text: x.text != null ? String(x.text) : null });
  });
  return out;
}

// ---- §12：完整性评估（核心门禁）----
// alignResult: alignNativeGeometry 输出 { matchedNative[], unmatchedNative[], matchedGeometry[], unusedGeometry[], gate }
// opts: { requireComplete?: boolean（默认 true=本批不创建）}
// out: { ok, code, matched, unresolved, message }
function evaluateCompleteness(alignResult) {
  var ar = alignResult || {};
  var matched = (ar.matchedNative || []).length;
  var unmatched = (ar.unmatchedNative || []).length;
  var totalNative = (ar.gate && ar.gate.totalNative != null) ? ar.gate.totalNative : matched + unmatched;
  if (matched === totalNative && totalNative > 0) {
    return { ok: true, code: CODE_COMPLETE, matched: matched, unresolved: 0, totalNative: totalNative, message: "Native " + totalNative + "/" + totalNative + " 行全部获得 geometry" };
  }
  if (unmatched > 0 && matched > 0) {
    return { ok: false, code: CODE_INCOMPLETE, matched: matched, unresolved: unmatched, totalNative: totalNative, message: "Native 识别 " + totalNative + " 行，仅 " + matched + " 行有可靠 geometry（unmatched=" + unmatched + "），本批不进入创建（NATIVE_GEOMETRY_INCOMPLETE）" };
  }
  if (unmatched > 0 && matched === 0) {
    return { ok: false, code: CODE_UNRESOLVED, matched: 0, unresolved: unmatched, totalNative: totalNative, message: "Native 识别 " + totalNative + " 行，全部无可靠 geometry（NATIVE_GEOMETRY_UNRESOLVED），本批不进入创建" };
  }
  return { ok: false, code: CODE_UNRESOLVED, matched: matched, unresolved: unmatched, totalNative: totalNative, message: "无 Native 文本，无创建（geometry-only 场景不产生 textbox.text）" };
}

// ---- §10/§11：为 unmatchedNative 寻找替代几何证据（word/local/anchor/ink 搜索链）----
// 返回每行: { native, geometry|null, source, code: "WORD"|"LOCAL"|"ANCHOR"|"INK"|"NONE" }
// 只定位 geometry；绝不产出 text（Provider 禁写最终 text，§10）。
function resolveUnmatchedGeometry(alignResult, candidates) {
  var ar = alignResult || {};
  var unmatched = (ar.unmatchedNative || []).slice();
  var cands = (Array.isArray(candidates) ? candidates : []).slice();
  var used = {};
  var out = [];
  var cjkMatch = (a, b) => { var ka = String(a||"").toLowerCase().replace(/[\s\u3000\u00a0]+/g,""), kb = String(b||"").toLowerCase().replace(/[\s\u3000\u00a0]+/g,""); return ka && kb && (ka===kb || ka.indexOf(kb)>=0 || kb.indexOf(ka)>=0); };
  unmatched.forEach(function (n) {
    var raw = n && n.rawText != null ? String(n.rawText) : "";
    var hit = null;
    // 优先级：word（Baidu wordBoxes）→ local → anchor → ink
    var orderP = ["word", "line", "anchor", "ink"];
    for (var p = 0; p < orderP.length && !hit; p += 1) {
      for (var i = 0; i < cands.length; i += 1) {
        if (used[i]) continue;
        var c = cands[i];
        if (c.kind !== orderP[p]) continue;
        if (c.text != null && (c.text !== "" && cjkMatch(raw, c.text))) {
          hit = { geometry: c, source: c.sourceProvider || "Baidu", code: c.kind.toUpperCase() === "WORD" ? "WORD" : "LINE" };
          used[i] = 1;
          break;
        }
      }
    }
    if (hit && hit.geometry && hit.geometry.bbox) {
      out.push({ native: n, geometry: hit.geometry, source: hit.source, code: hit.code === "WORD" ? "BaiduWord" : "Local", ok: true });
    } else {
      out.push({ native: n, geometry: null, source: null, code: "NONE", ok: false });
    }
  });
  return out;
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  evaluateCompleteness, resolveGeometryCandidates, resolveUnmatchedGeometry,
  CODE_COMPLETE, CODE_INCOMPLETE, CODE_UNRESOLVED
};