// =====================================================================
// 折立印名片套版助手 - 百度云 OCR Provider（Stage 5.5B P4）
// ---------------------------------------------------------------------
// 接口对齐 ocr-provider.js：recognize(image, ctx) -> Promise<{provider, providerType, candidates, meta, error?}>
//  - image: dataUrl 字符串（调用方已从所选图片提取，§10）
//  - candidates: [{text, bbox{x,y,width,height}, confidence, rotation?, coordinateSpace:"image-pixel", imageSize?}]
//
// 官方接口（2026-06 文档实时核对 §8/§31/§46）：
//  - 鉴权：GET https://aip.baidubce.com/oauth/2.0/token
//           ?grant_type=client_credentials&client_id=AK&client_secret=SK
//           → {access_token, expires_in: 2592000}（30 天，本地缓存）
//  - 识别：POST https://aip.baidubce.com/rest/2.0/ocr/v1/general?access_token=TOKEN
//           Content-Type: application/x-www-form-urlencoded，body: image=<urlencode(base64 去头)>
//           通用文字识别（标准含位置版）→ words_result[].words + location{left,top,width,height}
//  - 图片限制：base64 urlencode 后 ≤4M；最短边 ≥15px；最长边 ≤4096px（超限需先等比压缩）
//
// 约束：不处理密钥日志（脱敏在 UI / 日志层）；不触碰 DOM；transport/storage/resize 均可注入（单测友好）。
// =====================================================================
"use strict";

var TOKEN_URL = "https://aip.baidubce.com/oauth/2.0/token";
var OCR_URL = "https://aip.baidubce.com/rest/2.0/ocr/v1/general";
var MAX_BYTES = 4 * 1024 * 1024; // base64 字符串长度上限（官方 ≤4M）
var MAX_SIDE = 4096;             // 最长边 ≤4096px（官方）
var TOKEN_SKEW_MS = 60 * 1000;   // 过期前 1 分钟视为失效，主动刷新

// 官方错误码 → 人话（§29：错误翻译人话，不裸抛 code；来源：百度文字识别 错误码）
var BAIDU_ERR_MAP = {
  4: "百度 OCR：集群请求量超限额，请稍后重试",
  6: "百度 OCR：应用无权限调用该接口，请确认已开通文字识别服务",
  13: "百度 OCR：获取访问令牌失败，请检查 API Key / Secret Key",
  17: "百度 OCR：当日免费配额已用尽，请稍后或升级套餐",
  18: "百度 OCR：请求频率超限，请稍后重试",
  100: "百度 OCR：请求参数错误（图片数据不合法）",
  110: "百度 OCR：访问令牌无效或已过期，请重新测试连接",
  111: "百度 OCR：访问令牌已过期，请重新测试连接",
  216100: "百度 OCR：图片为空或不完整",
  216101: "百度 OCR：图片格式不支持（仅支持 PNG/JPG/JPEG/BMP/TIFF/PNM/WebP）",
  216102: "百度 OCR：图片不可识别（过小/模糊）",
  216103: "百度 OCR：图片非本人或包含违规内容",
  216110: "百度 OCR：识别失败，请更换更清晰的图片",
  216200: "百度 OCR：服务平台异常，请稍后重试",
  216201: "百度 OCR：图片格式错误",
  216202: "百度 OCR：图片太大（编码后超过 4M），已尝试压缩仍超限",
  216203: "百度 OCR：图片像素过大（最长边超过 4096px）",
  216630: "百度 OCR：识别错误，请重试",
  282003: "百度 OCR：图片中未检测到文字"
};

function fromDataUrl(dataUrl) {
  var m = /^data:[^;]+;base64,(.*)$/i.exec(String(dataUrl || ""));
  return m ? m[1] : null;
}

// Stage 7.8 §四/§五：Common OCR Result 候选 id —— 稳定确定性 hash（sourceProvider:源行号）。
// 下游 OCRCandidate.id 唯一标识该候选（跨 Provider 唯一），用于诊断映射与质量门禁去重。
function candidateId(source, index) {
  var s = String(source == null ? "cand" : source) + ":" + (index == null ? 0 : index);
  var h = 5381;
  for (var i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

function mapBaiduError(res) {
  var errno = res && res.error_code != null ? Number(res.error_code) : null;
  if (errno != null && BAIDU_ERR_MAP[errno]) return { errorCode: "BAIDU_REMOTE_" + errno, errorMessage: BAIDU_ERR_MAP[errno], errno: errno };
  var desc = res && res.error_msg ? (" " + String(res.error_msg).slice(0, 80)) : "";
  return { errorCode: "BAIDU_REMOTE", errorMessage: "百度 OCR 识别失败" + desc, errno: errno };
}

function mapTokenError(res) {
  // token 接口失败形态：{error, error_description} 或 {errno?...}
  if (res && res.error) {
    var d = String(res.error_description || "").slice(0, 80);
    var msg = "百度 OCR 配置无效：" + (d || ("error=" + String(res.error).slice(0, 40)));
    return { errorCode: "BAIDU_TOKEN_FAILED", errorMessage: msg };
  }
  var e = mapBaiduError(res);
  return { errorCode: "BAIDU_TOKEN_FAILED", errorMessage: "百度 OCR 获取令牌失败：" + e.errorMessage.replace("百度 OCR：", "") };
}

// 创建百度 OCR provider。
// opts:
//   getConfig(): () -> {apiKey, secretKey}（可为空 → BAIDU_NOT_CONFIGURED）
//   http: {request(method, url, {headers, body, timeout}) -> Promise<{status, responseText}>}
//   storage: {get(key), set(key, val)} —— 令牌缓存（userscript 用 GM_getValue/GM_setValue）
//   now: () -> ms（默认 Date.now）
//   resizeImage(dataUrl, {maxSide, maxBytes}) -> Promise<dataUrl>（默认恒等；userscript 注入 canvas 压缩）
function createBaiduProvider(opts) {
  var o = opts || {};
  // storage 兼容两种形态：{get(), set()} 或纯属性对象（单测便捷）
  var storage = o.storage || { get: function () { return undefined; }, set: function () {} };
  var getVal = typeof storage.get === "function" ? function (k) { return storage.get(k); } : function (k) { var v = storage[k]; return v === undefined ? undefined : v; };
  var setVal = typeof storage.set === "function" ? function (k, v) { storage.set(k, v); } : function (k, v) { storage[k] = v; };
  var now = o.now || function () { return Date.now(); };
  return {
    provider: "baidu-general-standard-position",
    providerType: "REMOTE",
    // 令牌获取（缓存 30 天，过期自动刷新；token 无效 → 强制刷新一次）
    getToken: async function () {
      var cached = getVal("zyBaiduToken");
      var expAt = Number(getVal("zyBaiduTokenExpiryAt") || 0);
      if (cached && expAt > now() + TOKEN_SKEW_MS) return { ok: true, token: cached, cached: true };
      var cfg = o.getConfig ? (o.getConfig() || {}) : {};
      if (!cfg.apiKey || !cfg.secretKey) return { ok: false, error: { errorCode: "BAIDU_NOT_CONFIGURED", errorMessage: "百度 OCR 未配置（缺少 API Key / Secret Key）" } };
      var url = TOKEN_URL + "?grant_type=client_credentials&client_id=" + encodeURIComponent(cfg.apiKey) + "&client_secret=" + encodeURIComponent(cfg.secretKey);
      var r;
      try {
        r = await o.http.request("GET", url, { headers: { Accept: "application/json" }, timeout: 15000 });
      } catch (e) {
        return { ok: false, error: { errorCode: "BAIDU_TOKEN_NETWORK_ERROR", errorMessage: "百度 OCR：无法连接百度服务器（网络错误）" } };
      }
      var parsed = null;
      try { parsed = JSON.parse(r.responseText || "{}"); } catch (e) { parsed = null; }
      if (!parsed || !parsed.access_token) return { ok: false, error: mapTokenError(parsed) };
      setVal("zyBaiduToken", parsed.access_token);
      setVal("zyBaiduTokenExpiryAt", String(now() + Number(parsed.expires_in || 2592000) * 1000));
      return { ok: true, token: parsed.access_token, cached: false };
    },
    recognize: async function (image, ctx) {
      var cfg = o.getConfig ? (o.getConfig() || {}) : {};
      if (!cfg.apiKey || !cfg.secretKey) return { provider: this.provider, providerType: "REMOTE", error: { errorCode: "BAIDU_NOT_CONFIGURED", errorMessage: "百度 OCR 未配置：请先在面板设置 API Key / Secret Key" }, candidates: [], meta: {} };
      var t0 = now();
      // 图片尺寸/大小保护（§P4：>4096px 或 >4M 等比压缩）
      var dataUrl = image;
      var b64 = fromDataUrl(dataUrl);
      var side = (ctx && ctx.imageWidth) || (ctx && ctx.imageHeight) || 0;
      var tooLarge = !b64 || b64.length > MAX_BYTES || side > MAX_SIDE;
      if (tooLarge && o.resizeImage) {
        try { dataUrl = await o.resizeImage(dataUrl, { maxSide: MAX_SIDE, maxBytes: MAX_BYTES }); } catch (e) { dataUrl = image; }
        b64 = fromDataUrl(dataUrl);
      }
      if (!b64) return { provider: this.provider, providerType: "REMOTE", error: { errorCode: "BAIDU_IMAGE_INVALID", errorMessage: "百度 OCR：图片数据无效" }, candidates: [], meta: {} };
      if (b64.length > MAX_BYTES) return { provider: this.provider, providerType: "REMOTE", error: { errorCode: "BAIDU_IMAGE_TOO_LARGE", errorMessage: BAIDU_ERR_MAP[216202] }, candidates: [], meta: {} };
      var tok = await this.getToken();
      if (!tok.ok) return { provider: this.provider, providerType: "REMOTE", error: tok.error, candidates: [], meta: {} };
      var result = await this._recognizeWithToken(tok.token, b64, dataUrl, ctx, t0, 0);
      return result;
    },
    _recognizeWithToken: async function (token, b64, dataUrl, ctx, t0, retried) {
      var body = "image=" + encodeURIComponent(b64);
      var r;
      try {
        r = await o.http.request("POST", OCR_URL + "?access_token=" + encodeURIComponent(token), {
          headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
          body: body,
          timeout: 30000
        });
      } catch (e) {
        return { provider: this.provider, providerType: "REMOTE", error: { errorCode: "BAIDU_NETWORK_ERROR", errorMessage: "百度 OCR：网络错误，无法连接百度服务器" }, candidates: [], meta: {} };
      }
      var parsed = null;
      try { parsed = JSON.parse(r.responseText || "{}"); } catch (e) { parsed = { error_msg: "非 JSON 响应（HTTP " + r.status + "）" }; }
      // token 失效（110/111）→ 清缓存强制刷新重试一次
      if (parsed && (parsed.error_code === 110 || parsed.error_code === 111) && !retried) {
        setVal("zyBaiduToken", "");
        setVal("zyBaiduTokenExpiryAt", "0");
        var tok2 = await this.getToken();
        if (tok2.ok) return this._recognizeWithToken(tok2.token, b64, dataUrl, ctx, t0, 1);
        return { provider: this.provider, providerType: "REMOTE", error: tok2.error, candidates: [], meta: {} };
      }
      if (!parsed || !Array.isArray(parsed.words_result)) {
        var err = mapBaiduError(parsed);
        return { provider: this.provider, providerType: "REMOTE", error: err, candidates: [], meta: { elapsed: now() - t0 } };
      }
      var imageW = (ctx && ctx.imageWidth) || null;
      var imageH = (ctx && ctx.imageHeight) || null;
      // Stage 7.8 §四/§五/§二十八：Common OCR Result —— 候选必须带 id/sourceProvider/rawMeta，
      // 不丢失百度 words_result 原始结构（words + location + probability），供下游 normalizer/诊断复用。
      var candidates = parsed.words_result
        .map(function (w, wi) {
          var loc = w && w.location;
          if (!loc || !w.words) return null;
          if ([loc.left, loc.top, loc.width, loc.height].some(function (v) { return typeof v !== "number" || !isFinite(v); })) return null;
          if (loc.width <= 0 || loc.height <= 0) return null;
          var line = { words: String(w.words).trim(), location: { left: loc.left, top: loc.top, width: loc.width, height: loc.height } };
          if (w.probability != null) line.probability = w.probability;
          return {
            id: candidateId("BAIDU", wi),
            text: line.words,
            bbox: { x: loc.left, y: loc.top, width: loc.width, height: loc.height },
            confidence: w.probability != null ? w.probability : null,
            rotation: null,
            coordinateSpace: "image-pixel",
            imageSize: imageW != null ? { width: imageW, height: imageH } : null,
            sourceProvider: "BAIDU",
            lineIndex: wi,
            wordIndex: 0,
            rawMeta: line
          };
        })
        .filter(Boolean)
        .filter(function (c) { return c.text; });
      return {
        provider: this.provider,
        providerType: "REMOTE",
        candidates: candidates,
        meta: { imageWidth: imageW, imageHeight: imageH, elapsed: now() - t0, rawWordCount: parsed.words_result.length, lineCount: candidates.length, httpStatus: r.status }
      };
    }
  };
}

if (typeof module !== "undefined" && module.exports) module.exports = { createBaiduProvider, BAIDU_ERR_MAP, fromDataUrl, candidateId, TOKEN_URL, OCR_URL, MAX_BYTES, MAX_SIDE };