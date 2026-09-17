// =====================================================================
// 折立印名片套版助手 - AI Transport 边界（Stage 2）
// ---------------------------------------------------------------------
// 职责边界：只负责 HTTP 传输与错误分类，不包含 Prompt / 字段业务 / 本地规则。
// 错误模型：{ ok:false, error:{ kind, status, retryable, message, endpoint } }
//   kind ∈ NETWORK_ERROR | TIMEOUT | HTTP_ERROR | INVALID_JSON | CONFIG_ERROR
// 脱敏约束：绝不输出 API Key / Authorization / 完整请求头；错误消息只含
//   endpoint 主机名、HTTP status、≤120 字符响应体摘要。
// 可测试性：transport 可注入（默认读全局 GM_xmlhttpRequest），Mock 只替换
//   transport，业务解析仍走 field-core 纯函数。
// =====================================================================
"use strict";

function buildChatUrl(baseUrl) {
  return String(baseUrl || "").replace(/\/+$/, "") + "/chat/completions";
}

function makeAiError(kind, opts) {
  const o = opts || {};
  let message = o.message || kind;
  const retryable = o.retryable != null
    ? !!o.retryable
    : (kind === "NETWORK_ERROR" || kind === "TIMEOUT" || o.status === 429 || (o.status >= 500 && o.status < 600));
  return {
    ok: false,
    error: {
      kind: kind,
      status: o.status || null,
      retryable: retryable,
      message: message,
      endpoint: o.endpoint || null
    }
  };
}

const AI_HTTP_EXCERPT_MAX = 120;

// opts: { url, method, headers, data, timeout, operation, transport }
function aiRequest(opts) {
  return new Promise(function (resolve) {
    const transport = opts.transport || (typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : null);
    if (!transport) {
      resolve(makeAiError("CONFIG_ERROR", { message: "AI 传输通道不可用", operation: opts.operation }));
      return;
    }
    const url = opts.url;
    let endpoint = null;
    try { endpoint = url && new URL(url).host; } catch (_e) { endpoint = url; }
    let settled = false;
    function done(result) {
      if (!settled) { settled = true; resolve(result); }
    }
    transport({
      method: opts.method || "POST",
      url: url,
      headers: opts.headers || {},
      data: opts.data,
      timeout: opts.timeout || 30000,
      onload: function (response) {
        const status = Number(response && response.status) || 0;
        const bodyText = String(response && response.responseText != null ? response.responseText : "");
        if (status < 200 || status >= 300) {
          done(makeAiError("HTTP_ERROR", {
            status: status,
            endpoint: endpoint,
            message: "API HTTP " + status + (bodyText ? ": " + bodyText.slice(0, AI_HTTP_EXCERPT_MAX) : "")
          }));
          return;
        }
        let body = null;
        try {
          body = JSON.parse(bodyText);
        } catch (_e) {
          done(makeAiError("INVALID_JSON", {
            endpoint: endpoint,
            message: "AI 返回内容无法解析: " + bodyText.slice(0, AI_HTTP_EXCERPT_MAX)
          }));
          return;
        }
        done({ ok: true, status: status, body: body });
      },
      onerror: function () {
        done(makeAiError("NETWORK_ERROR", { message: "API 请求失败", endpoint: endpoint }));
      },
      ontimeout: function () {
        done(makeAiError("TIMEOUT", { message: "API 请求超时", endpoint: endpoint }));
      }
    });
  });
}

// 把错误模型转成业务可显示的 Error（消息保持与 Stage 1 前兼容）
function throwAiError(result) {
  const err = new Error(result.error.message);
  err.zyAi = result.error; // { kind, status, retryable, message, endpoint } 供诊断
  throw err;
}