// =====================================================================
// 折立印名片套版助手 - Tesseract Lazy Loader（Stage 5.5A §四~§七）
// ---------------------------------------------------------------------
// 生产 OCR 引擎注入与缓存管理：
//   - isolated world（ScriptCat）通过 GM_addElement 注入 CDN script 到 page world
//     （CSP 安全，机制与 5.1 pageBridge 注入同源；extension 侧可用 DOM script 注入）
//   - worker + language data lazy-load：首次点击才下载（~66KB 脚本 + ~20MB traineddata）
//   - 缓存策略：v5 worker cacheMethod=indexeddb（语言数据二次命中，不重复下载）
//   - 状态回调（loading-engine/loading-data/ready/error）供 UI 反馈（§七）
// 调用方提供 injector（GM_addElement 或 DOM），本模块不依赖 GM_* 本身（可单测）。
// =====================================================================
"use strict";

var TESSERACT_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
var TESS_LANG = "chi_sim";

// 注入 CDN script 到 page world（ctx.inject 自定义；默认浏览器页面世界 DOM 注入）
function injectScriptPage(src, ctx, opts) {
  var inject = (ctx && ctx.inject) || function (url) {
    if (typeof document === "undefined") return;
    var s = document.createElement("script");
    s.src = url;
    (document.head || document.documentElement).appendChild(s);
  };
  return Promise.resolve().then(function () {
    inject(src);
    return waitForTesseract(ctx, (opts && opts.timeout) || 45000);
  });
}

function waitForTesseract(ctx, timeoutMs) {
  var limit = timeoutMs || 45000;
  var start = Date.now();
  return new Promise(function (resolve, reject) {
    var tick = function () {
      var T = (typeof window !== "undefined" && window.Tesseract) || (ctx && ctx.engine) || null;
      if (T) return resolve(T);
      if (Date.now() - start > limit) return reject(new Error("tesseract load timeout"));
      setTimeout(tick, 200);
    };
    tick();
  });
}

// 确保引擎可达：已存在（内存缓存）→ 直接返回；否则注入并等待（firstLoadMs）
function ensureEngine(ctx, opts) {
  var o = opts || {};
  var onStatus = o.onStatus || function () {};
  var start = Date.now();
  var cached = (typeof window !== "undefined" && typeof window.Tesseract === "object") || !!(ctx && ctx.engine);
  onStatus(cached ? "ready-cached" : "loading-engine");
  return Promise.resolve()
    .then(function () {
      if (cached) return (ctx && ctx.engine) || window.Tesseract;
      return injectScriptPage(o.cdn || TESSERACT_CDN, ctx, o);
    })
    .then(function (T) {
      onStatus("engine-ready");
      return { engine: T, engineCached: cached, engineLoadMs: Date.now() - start };
    })
    .catch(function (e) { onStatus("error"); throw e; });
}

// 创建 worker（语言数据 lazy-load + indexeddb 缓存）。
// 返回 { worker, dataLoadMs }；recognize 完成后可选 keep（复用）或 terminate。
function createWorker(engine, lang, ctx, opts) {
  var o = opts || {};
  var onStatus = o.onStatus || function () {};
  var start = Date.now();
  onStatus("loading-data");
  var workerOpts = Object.assign({ cacheMethod: "indexeddb" }, o.workerOptions || {});
  return engine.createWorker(lang || TESS_LANG, 1, workerOpts).then(function (worker) {
    onStatus("data-ready");
    return { worker: worker, dataLoadMs: Date.now() - start };
  });
}

// 从页面/对象提取图片二进制入口（供 OCR）：
//  - fabric Image object：element（IMG）→ natural 尺寸 + element（可转 dataURL/File 给 tesseract）
// 返回 { element, naturalWidth, naturalHeight, dataUrl? }
function imageSourceFromObject(rawObj) {
  if (!rawObj) return null;
  var el = rawObj._element || (rawObj.getElement && rawObj.getElement()) || null;
  if (!el || !el.tagName || el.tagName.toLowerCase() !== "img") return null;
  var out = { element: el, naturalWidth: el.naturalWidth || 0, naturalHeight: el.naturalHeight || 0 };
  try {
    if (typeof el.toDataURL === "function") out.dataUrl = el.toDataURL();
    else {
      var cv = document.createElement("canvas");
      cv.width = el.naturalWidth; cv.height = el.naturalHeight;
      var c2 = cv.getContext && cv.getContext("2d");
      if (c2 && el.naturalWidth > 0) { c2.drawImage(el, 0, 0); out.dataUrl = cv.toDataURL("image/png"); }
    }
  } catch (e) { out.dataUrl = null; }
  return out;
}

if (typeof module !== "undefined" && module.exports) module.exports = { TESSERACT_CDN: TESSERACT_CDN, TESS_LANG: TESS_LANG, ensureEngine: ensureEngine, createWorker: createWorker, injectScriptPage: injectScriptPage, imageSourceFromObject: imageSourceFromObject };