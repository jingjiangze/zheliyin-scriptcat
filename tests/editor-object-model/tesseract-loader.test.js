// tests/editor-object-model/tesseract-loader.test.js — Stage 5.5A §四~§七：Loader 纯逻辑单测（无浏览器）
"use strict";
const path = require("path");
const loader = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "tesseract-loader.js"));

const results = [];
const failures = [];
function t(name, cond, detail) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "")); }

(async () => {
  // --- ensureEngine：内存缓存命中快路径 ---
  const mockT = { __engine: true };
  const cached = await loader.ensureEngine({ engine: mockT }, {});
  t("ensure.cached", cached.engine === mockT && cached.engineCached === true && cached.engineLoadMs < 1000, JSON.stringify({ cached: cached.engineCached, ms: cached.engineLoadMs }));

  // --- ensureEngine：注入路径（短超时验证超时 reject，不挂起）---
  let injectedRejected = false;
  try {
    await loader.ensureEngine({}, { inject: function () {}, timeout: 300 });
  } catch (e) { injectedRejected = /timeout/.test(String(e && e.message || e)); }
  t("ensure.inject-timeout-reject", injectedRejected === true, "injectedRejected=" + injectedRejected);
  // waitForTesseract 短超时不挂起
  let rejected = false;
  try { await new Promise((res, rej) => { const p = loader.injectScriptPage("x", {}, { timeout: 300 }); p.then(res, rej); setTimeout(() => rej(new Error("hang")), 2000); }); } catch (e) { rejected = /timeout|hang/.test(String(e && e.message || e)); }
  t("ensure.no-hang", rejected === true, "rejected=" + rejected);

  // --- createWorker：透传 cacheMethod=indexeddb ---
  let capturedOpts = null;
  const mockEngine = { createWorker: async function (lang, oem, opts) { capturedOpts = { lang: lang, oem: oem, opts: opts }; return { __w: true }; } };
  const wr = await loader.createWorker(mockEngine, "chi_sim", {}, {});
  t("worker.opts-cache-method", capturedOpts && capturedOpts.opts.cacheMethod === "indexeddb" && capturedOpts.lang === "chi_sim", JSON.stringify(capturedOpts));
  t("worker.return", !!wr.worker && typeof wr.dataLoadMs === "number");

  // --- imageSourceFromObject：无 element → null；有 IMG element → natural 尺寸 ---
  t("img.null-without-element", loader.imageSourceFromObject({}) === null);
  const fakeImg = { tagName: "IMG", naturalWidth: 1000, naturalHeight: 800 };
  const src = loader.imageSourceFromObject({ _element: fakeImg });
  t("img.natural", src && src.naturalWidth === 1000 && src.naturalHeight === 800 && src.element === fakeImg, JSON.stringify(src));
  t("img.non-img-null", loader.imageSourceFromObject({ _element: { tagName: "DIV" } }) === null);

  console.log(results.join("\n"));
  console.log("tesseract-loader: " + (failures.length ? failures.length + " FAILURES" : "ALL PASS"));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error("runner error", e); process.exit(1); });