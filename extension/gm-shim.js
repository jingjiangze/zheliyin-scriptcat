// 折立印名片套版助手 v0.3.0.0 —— 浏览器扩展版兼容层
// 本文件把油猴（脚本猫/Tampermonkey）的 GM_* 接口替换为扩展可用的实现：
//   - 配置存储 -> 页面 origin 的 localStorage（同步读写，与 GM_* 体验一致）
//   - 跨域请求 -> fetch + host_permissions（manifest 已声明 diy.zheliyin.com / volces / raw.githubusercontent）
// 核心逻辑在 assistant.js，与脚本猫版完全一致（只把 GM 换成这层 shim）。
"use strict";

function GM_getValue(key, def) {
  try {
    const raw = localStorage.getItem("zyext_" + key);
    if (raw === null) return def;
    return JSON.parse(raw);
  } catch (_e) {
    return def;
  }
}

function GM_setValue(key, val) {
  try {
    localStorage.setItem("zyext_" + key, JSON.stringify(val));
  } catch (_e) {
    /* 忽略：localStorage 不可用时静默失败 */
  }
}

function GM_addStyle(css) {
  const el = document.createElement("style");
  el.textContent = css;
  (document.head || document.documentElement).appendChild(el);
  return el;
}

function GM_setClipboard(_text) {
  /* 脚本未使用，这里仅作兼容占位 */
}

// 兼容 GM_xmlhttpRequest 的回调式调用约定（onload / onerror / ontimeout）。
function GM_xmlhttpRequest(opts) {
  const controller = new AbortController();
  const timeoutMs = opts.timeout || 30000;
  const timer = setTimeout(function () {
    controller.abort();
    if (typeof opts.ontimeout === "function") opts.ontimeout();
  }, timeoutMs);

  fetch(opts.url, {
    method: opts.method || "GET",
    headers: Object.assign({}, opts.headers || {}),
    body: opts.data || undefined,
    signal: controller.signal,
    credentials: opts.credentials || "omit"
  })
    .then(function (resp) {
      clearTimeout(timer);
      return resp.text().then(function (text) {
        if (typeof opts.onload === "function") {
          opts.onload({ status: resp.status, responseText: text });
        }
      });
    })
    .catch(function (_error) {
      clearTimeout(timer);
      if (typeof opts.onerror === "function") opts.onerror(_error);
    });
}