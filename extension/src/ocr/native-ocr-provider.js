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

// OCR-P0.1-B：payload 构建 + 诊断 + 完整性校验（禁止静默发送截断数据）
// buildFormData(dataUrl, opts) → FormData | null（兼容旧调用；失败/失配返回 null）
// buildFormPayload(dataUrl, opts) → { ok, formData, diagnostics, errorCode }
//   diagnostics = { mime, filename, blobSize, fileSize, textType, decodedBytes }
//   errorCode: null | IMAGE_INVALID | IMAGE_PAYLOAD_MISMATCH
//   IMAGE_PAYLOAD_MISMATCH = File.size !== decoded dataURL bytes（拒绝发送）
function buildFormData(dataUrl, opts) {
  var p = buildFormPayload(dataUrl, opts);
  return p && p.ok ? p.formData : null;
}
function buildFormPayload(dataUrl, opts) {
  var o = opts || {};
  var fd = new FormData();
  var blob = null;
  var mime = "image/png";
  var decodedBytes = -1;
  if (typeof Blob !== "undefined" && dataUrl != null && /^data:/i.test(dataUrl)) {
    var parts = dataUrl.split(",");
    mime = (/data:([^;]+)/.exec(parts[0]) || [])[1] || "image/png";
    var bin = null;
    try { bin = parts[1] != null ? atob(parts[1]) : null; } catch (e) { bin = null; }
    if (bin != null) {
      decodedBytes = bin.length;
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
      blob = new Blob([arr], { type: mime });
    }
  } else if (dataUrl instanceof Blob) {
    blob = dataUrl;
    decodedBytes = typeof blob.size === "number" ? blob.size : -1;
  }
  var diagnostics = {
    mime: blob ? (blob.type || mime) : mime,
    filename: o.fileName || "native-ocr.png",
    blobSize: blob && typeof blob.size === "number" ? blob.size : -1,
    fileSize: -1,
    textType: o.textType || "1",
    decodedBytes: decodedBytes,
    transformPolicy: "pass-through" // 与 IMAGE_PREP 同：解码后原样封装，零压缩/零截断
  };
  if (!blob) return { ok: false, formData: null, diagnostics: diagnostics, errorCode: "IMAGE_INVALID" };
  var fname = o.fileName || "native-ocr.png";
  var file = new File([blob], fname, { type: blob.type || mime });
  diagnostics.fileSize = typeof file.size === "number" ? file.size : -1;
  // OCR-P0.1-B 硬校验：File.size === decoded dataURL bytes，失配 = 截断 → 拒绝发送
  if (decodedBytes >= 0 && typeof file.size === "number" && file.size !== decodedBytes) {
    return { ok: false, formData: null, diagnostics: diagnostics, errorCode: "IMAGE_PAYLOAD_MISMATCH", message: "File.size !== decoded dataURL bytes（payload 截断），拒绝发送" };
  }
  fd.append("file", file);
  fd.append("textType", o.textType || "1");
  return { ok: true, formData: fd, diagnostics: diagnostics, errorCode: null };
}

// 解析响应行（<br/> 分隔；§六 stage9-v3：rawText 绝对原样，禁止 trim/归一/改标点/删内部空格）
function parseNativeText(html) {
  if (html == null) return [];
  return String(html)
    .split(/<br\s*\/?\s*>/i)
    .map(function (x) { return String(x); })
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
    statusCode: (oo.lines || []).length ? "NATIVE_OK" : "NATIVE_EMPTY", // OCR-P0.2-C：成功但无文字 = NATIVE_EMPTY（≠ 图片未交付）
    texts: texts,
    meta: {
      requestUrl: oo.requestUrl || "/siteWeb/userCenterJsj/uploadOCR.do",
      method: "POST",
      responseType: "json",
      requestId: oo.requestId || null,
      timestamp: oo.timestamp || new Date().toISOString(),
      elapsedMs: typeof oo.elapsedMs === "number" ? oo.elapsedMs : null,
      textType: oo.textType || "1",
      statusCode: (oo.lines || []).length ? "NATIVE_OK" : "NATIVE_EMPTY"
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
      if (!f) return { provider: "NATIVE_OCR", source: "OCR_TOOL_API", ok: false, statusCode: "NATIVE_UPLOAD_FAILED", texts: [], error: { errorCode: "NO_FETCH", errorMessage: "当前环境无 fetch（node 单测应注入 ctx.fetch）" } };
      var fp = null;
      try { fp = buildFormPayload(image, { textType: c.textType }); } catch (e) { fp = null; }
      if (!fp || !fp.ok) {
        return { provider: "NATIVE_OCR", source: "OCR_TOOL_API", ok: false, statusCode: "NATIVE_IMAGE_INVALID", texts: [], payload: (fp && fp.diagnostics) || null, error: { errorCode: (fp && fp.errorCode) || "IMAGE_INVALID", errorMessage: (fp && fp.message) || "图片数据无法构建上传表单（payload 完整性校验失败，拒绝发送）" } };
      }
      var fd = fp.formData;
      var reqId = c.transactionId || ("nat-" + Date.now().toString(36));
      return f(baseApi, { method: "POST", body: fd }).then(function (res) {
        if (!res || typeof res.status !== "number") return { provider: "NATIVE_OCR", source: "OCR_TOOL_API", ok: false, statusCode: "NATIVE_HTTP_FAILED", texts: [], error: { errorCode: "BAD_RESPONSE", errorMessage: "非标准 fetch 响应" } };
        return res.text().then(function (body) {
          var parsed = null;
          try { parsed = JSON.parse(body); } catch (e) { parsed = null; }
          // OCR-P0.2-C 细分：HTTP 非 2xx 一律 NATIVE_HTTP_FAILED
          if (typeof res.status === "number" && res.status >= 400) {
            return { provider: "NATIVE_OCR", source: "OCR_TOOL_API", ok: false, statusCode: "NATIVE_HTTP_FAILED", texts: [], httpStatus: res.status, error: { errorCode: "HTTP_" + res.status, errorMessage: "上传接口返回 HTTP " + res.status, rawHead: String(body).slice(0, 200) } };
          }
          if (!parsed || parsed.success !== true) {
            // OCR-P0.2（BLOCKER 复现）：持久 profile 会话过期 → uploadOCR.do 返回登录跳转 HTML
            // （含 window.open('http://diy.zheliyin.com:443/siteWeb/jsj/index.do')），JSON 解析必失败，
            // 必须与「普通解析失败」区分：NATIVE_SESSION_EXPIRED ≠ NATIVE_PARSE_FAILED。
            var bn = String(body || "").toLowerCase();
            var isLoginPage = bn.indexOf("window.open") >= 0 || bn.indexOf("jsj/index.do") >= 0 || bn.indexOf("login") >= 0 || bn.indexOf("<html") >= 0;
            if (isLoginPage) {
              return { provider: "NATIVE_OCR", source: "OCR_TOOL_API", ok: false, statusCode: "NATIVE_SESSION_EXPIRED", texts: [], httpStatus: res.status, error: { errorCode: "SESSION_EXPIRED", errorMessage: "登录会话已过期，uploadOCR.do 返回登录页（需重新注入 ZY_STAGE9_COOKIE 或重建会话）", rawHead: String(body).slice(0, 200) } };
            }
            return { provider: "NATIVE_OCR", source: "OCR_TOOL_API", ok: false, statusCode: parsed && parsed.success === false ? "NATIVE_PARSE_FAILED" : "NATIVE_PARSE_FAILED", texts: [], httpStatus: res.status, error: { errorCode: parsed && parsed.success === false ? "OCR_FAILED" : "PARSE_FAIL", errorMessage: (parsed && (parsed.message || parsed.errorMessage)) || "接口未返回 success=true", rawHead: String(body).slice(0, 200) } };
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

// ---- recognizeWithFallback(image, ctx)：OCR-P0.2-B —— Production Truth = textType=2 only ----
// 用户硬规则：OCRTool.do textType=2（手写体）是唯一生产文字真值。
// 生产链禁止：textType=2 失败 → textType=1 → 把 type=1 当最终 truth。
// 本函数：主调用 textType=2 作为唯一生产结果返回；若 type=2 空/失败，仅额外执行
//   textType=1 作为 diagnostic evidence（meta.diagnosticType1），绝不把 type=1 的
//   texts 注入返回结构 —— 最终 textbox.text 永远来自 textType=2。
function classifyNativeStatus(r) {
  if (r && r.ok && (r.texts || []).length) return "NATIVE_OK";
  if (r && r.ok) return "NATIVE_EMPTY";               // 请求成功、成功结构、无文字
  if (r && r.statusCode) return r.statusCode;           // 已细分（IMAGE/UPLOAD/HTTP/SESSION/PARSE）
  if (!r) return "NATIVE_HTTP_FAILED";
  return "NATIVE_PARSE_FAILED";
}
function recognizeWithFallback(image, ctx) {
  var c = ctx || {};
  var primary = c.textType != null ? c.textType : "2"; // 生产真值模式（默认手写体 textType=2）
  return recognize(image, Object.assign({}, c, { textType: primary })).then(function (r1) {
    r1.meta = Object.assign({}, r1.meta || {}, {
      modeUsed: primary,
      fallbackUsed: false,
      productionTextType: "2",
      statusCode: classifyNativeStatus(r1),
      diagnosticType1: null
    });
    var emptyOrFail = !(r1 && r1.ok) || !((r1.texts || []).length);
    if (!emptyOrFail) return r1;
    // type=2 空/失败 → 执行 textType=1 仅作诊断（不进入生产 texts；不覆盖 r1）
    return recognize(image, Object.assign({}, c, { textType: "1" })).then(function (r2) {
      var diag = r2 ? {
        textType: "1", ok: !!(r2 && r2.ok), lines: ((r2 && r2.texts) || []).length,
        statusCode: classifyNativeStatus(r2),
        errorCode: (r2 && r2.error && r2.error.errorCode) || null
      } : { textType: "1", ok: false, lines: 0, statusCode: "NATIVE_HTTP_FAILED", errorCode: "FALLBACK_DIAG_FAIL" };
      r1.meta = Object.assign({}, r1.meta || {}, {
        fallbackUsed: true,
        primaryEmptyOrFail: emptyOrFail,
        diagnosticType1: diag
      });
      return r1; // 生产结果不变：textType=2 的原始结果（空/失败也原样）
    });
  });
}
if (typeof module !== "undefined" && module.exports) module.exports = {
  recognize, recognizeWithFallback, classifyNativeStatus, buildFormData, buildFormPayload, parseNativeText, toNativeResult, ocrLineId
};