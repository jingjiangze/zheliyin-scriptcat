// =====================================================================
// 折立印名片套版助手 - Native OCR Provider（Stage 9 P1, §十八/§十六）
// ---------------------------------------------------------------------
// 职责（单一职责）：
//   recognize(image, ctx) → 调用站内原生 OCR（OCRTool 后端协议）→ 解析 → NativeOCRResult。
//   只负责「调用站内真实 OCR + 解析输出」；不负责 Baidu/Geometry/Font/Editor/位置校正。
// 协议（docs/STAGE_9_NATIVE_OCR_PROTOCOL.md，真实取证 + GATE-9A 直调 3/3 PASS）：
//   POST /siteWeb/userCenterJsj/uploadOCR.do
//   FormData: file=<图片 File>  textType="1"|"2"
//   响应 JSON: { success, message, userData="<行1><br/>行2..." }
// 边界（§十六/§二十）：
//   - 站内原生 OCR 返回纯文本（无 bbox）→ texts[].bbox=null（Text Truth only；
//     Geometry 由 Baidu/Layout Provider 提供）——**不是失败**。
//   - 最终 textbox.text === rawText 必须严格成立（禁止任何 Provider 修改最终文字）。
//   - 无动态 token 依赖：会话 Cookie 由页面上下文自动携带；禁止写死 Cookie/Token。
// 可测性：fetch 与 image 由 opts/ctx 注入（页面 world 用原生 fetch；node 单测用 mock）。
// =====================================================================
"use strict";

function ocrLineId(source, index, rawText) {
  var s = String(source) + ":" + index + ":" + String(rawText || "").slice(0, 8);
  var h = 5381;
  for (var i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return "no-" + ((h >>> 0).toString(16));
}

// 页面 world：dataURL → File → FormData（fetch 注入如需直接传 blob 亦可）
function buildFormData(dataUrl, opts) {
  var o = opts || {};
  var fd = new FormData();
  var blob = null;
  if (typeof Blob !== "undefined" && dataUrl != null && /^data:/i.test(dataUrl)) {
    var parts = dataUrl.split(",");
    var mime = (/data:([^;]+)/.exec(parts[0]) || [])[1] || "image/png";
    var bin = null;
    try { bin = parts[1] != null ? atob(parts[1]) : null; } catch (e) { bin = null; }
    if (bin != null) {
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
      blob = new Blob([arr], { type: mime });
    }
  } else if (dataUrl instanceof Blob) {
    blob = dataUrl;
  }
  if (!blob) return null;
  fd.append("file", new File([blob], o.fileName || "native-ocr.png", { type: blob.type || "image/png" }));
  fd.append("textType", o.textType || "1");
  return fd;
}

// 解析响应行（<br/> 分隔，HTML 实体容忍）
function parseNativeText(html) {
  if (html == null) return [];
  var s = String(html);
  return s
    .split(/<br\s*\/?\s*>/i)
    .map(function (x) { return String(x).trim(); })
    .filter(function (x) { return x !== ""; });
}

// 组装 NativeOCRResult（§十六 契约）
function toNativeResult(o) {
  var oo = o || {};
  var texts = (oo.lines || []).map(function (ln, i) {
    return {
      id: ocrLineId("NATIVE_OCR", i, ln),
      rawText: ln,
      matchText: String(ln).toLowerCase().replace(/[\s\u3000\u00a0]+/g, "").replace(/[·•．。，,、；;'"“”‘’（）()【】\[\]《》<>:：-]/g, ""),
      order: i,
      bbox: null,           // Text Truth only（站内 OCR 无 bbox；Geometry 由 Baidu）
      confidence: null,
      rotation: null,
      evidence: { source: "OCR_TOOL_API", raw: { textType: oo.textType || "1" } }
    };
  });
  return {
    provider: "NATIVE_OCR",
    source: "OCR_TOOL_API",
    pageId: oo.pageId || null,
    transactionId: oo.transactionId || null,
    imageFingerprint: oo.imageFingerprint || null,
    ok: true,
    texts: texts,
    meta: {
      requestUrl: oo.requestUrl || "/siteWeb/userCenterJsj/uploadOCR.do",
      method: "POST",
      responseType: "json",
      requestId: oo.requestId || null,
      timestamp: oo.timestamp || new Date().toISOString(),
      elapsedMs: typeof oo.elapsedMs === "number" ? oo.elapsedMs : null,
      textType: oo.textType || "1"
    }
  };
}

// ---- recognize(image, ctx)：主入口 ----
// image: dataURL 字符串（或 Blob）
// ctx: { fetch?, pageId?, transactionId?, imageFingerprint?, baseApi?, textType? }
//   ctx.fetch 缺省用全局 fetch（页面 world）
function recognize(image, ctx) {
  var c = ctx || {};
  var f = typeof c.fetch === "function" ? c.fetch : (typeof fetch === "function" ? fetch.bind(null) : null);
  var baseApi = c.baseApi != null ? c.baseApi : "/siteWeb/userCenterJsj/uploadOCR.do";
  var t0 = Date.now();
  return Promise.resolve()
    .then(function () {
      if (!f) return { provider: "NATIVE_OCR", source: "OCR_TOOL_API", ok: false, texts: [], error: { errorCode: "NO_FETCH", errorMessage: "当前环境无 fetch（node 单测应注入 ctx.fetch）" } };
      var fd = null;
      try { fd = buildFormData(image, { textType: c.textType }); } catch (e) { fd = null; }
      if (!fd) return { provider: "NATIVE_OCR", source: "OCR_TOOL_API", ok: false, texts: [], error: { errorCode: "IMAGE_INVALID", errorMessage: "图片数据无法构建上传表单" } };
      var reqId = c.transactionId || ("nat-" + Date.now().toString(36));
      return f(baseApi, { method: "POST", body: fd }).then(function (res) {
        if (!res || typeof res.status !== "number") return { provider: "NATIVE_OCR", source: "OCR_TOOL_API", ok: false, texts: [], error: { errorCode: "BAD_RESPONSE", errorMessage: "非标准 fetch 响应" } };
        return res.text().then(function (body) {
          var parsed = null;
          try { parsed = JSON.parse(body); } catch (e) { parsed = null; }
          if (!parsed || parsed.success !== true) {
            return { provider: "NATIVE_OCR", source: "OCR_TOOL_API", ok: false, texts: [], httpStatus: res.status, error: { errorCode: parsed && parsed.success === false ? "OCR_FAILED" : "PARSE_FAIL", errorMessage: (parsed && (parsed.message || parsed.errorMessage)) || "接口未返回 success=true", rawHead: String(body).slice(0, 200) } };
          }
          var lines = parseNativeText(parsed.userData);
          return toNativeResult({
            lines: lines, pageId: c.pageId, transactionId: c.transactionId,
            imageFingerprint: c.imageFingerprint, textType: c.textType,
            requestUrl: baseApi, requestId: reqId, elapsedMs: Date.now() - t0
          });
        });
      });
    });
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  recognize, buildFormData, parseNativeText, toNativeResult, ocrLineId
};