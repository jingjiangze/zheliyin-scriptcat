// tests/editor-object-model/baidu-provider.test.js — Stage 5.5B P4：百度 OCR Provider 单测（无浏览器，mock transport）
// 覆盖：未配置 / 令牌获取与缓存 / 过期刷新 / 识别标准化 / 位置 bbox / 大数据压缩触发 / 参数错误 / token 失效重试
"use strict";
const path = require("path");
const bp = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "baidu-provider.js"));
const { createBaiduProvider, fromDataUrl } = bp;

const results = [];
const failures = [];
function t(name, cond, detail) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "")); }

function mockHttp(routes) {
  // routes: [{method, urlMatch(substr), status, responseText}]
  return {
    request: async (method, url, opts) => {
      for (const r of routes) {
        if (r.method === method && url.indexOf(r.urlMatch) >= 0) {
          const txt = typeof r.responseText === "function" ? await r.responseText(opts) : r.responseText;
          return { status: r.status != null ? r.status : 200, responseText: txt };
        }
      }
      return { status: 500, responseText: JSON.stringify({ error: "no route", error_description: url }) };
    }
  };
}

const fallbackRes = async (opts) => JSON.stringify({ ok: "ok", words: opts.body ? opts.body.length : 0 });

(async () => {
  // ---- fromDataUrl ----
  t("dataurl.strip", fromDataUrl("data:image/png;base64,QUJD") === "QUJD", fromDataUrl("data:image/png;base64,QUJD"));
  t("dataurl.none", fromDataUrl("hello") === null);

  // ---- 未配置：BAIDU_NOT_CONFIGURED（不 throw）----
  const nc = createBaiduProvider({ getConfig: () => ({ apiKey: "", secretKey: "" }) });
  const ncR = await nc.recognize("data:image/png;base64,QUJD", {});
  t("not-configured", ncR.error && ncR.error.errorCode === "BAIDU_NOT_CONFIGURED" && ncR.candidates.length === 0, JSON.stringify(ncR.error));
  t("not-configured.provider-type", ncR.providerType === "REMOTE");

  // ---- 令牌：首次获取 + 缓存（不重复请求）----
  let tokenCalls = 0;
  const memStore = {};
  const http = mockHttp([
    { method: "GET", urlMatch: "/oauth/2.0/token", responseText: JSON.stringify({ access_token: "TOKEN_A", expires_in: 2592000 }) },
    { method: "POST", urlMatch: "/rest/2.0/ocr/v1/general", responseText: JSON.stringify({ words_result_num: 2, words_result: [
      { words: "测试公司", location: { left: 10, top: 20, width: 100, height: 24 } },
      { words: "13800138000", location: { left: 5, top: 60, width: 160, height: 20 } }
    ] }) }
  ]);
  const wrap = { request: async (m, u, o) => { if (u.indexOf("/oauth/2.0/token") >= 0) tokenCalls += 1; return http.request(m, u, o); } };
  const p = createBaiduProvider({ getConfig: () => ({ apiKey: "AK1", secretKey: "SK1" }), http: wrap, storage: memStore, now: () => 1000000 });
  const cfgR = await p.recognize("data:image/png;base64,QUJD", { imageWidth: 800, imageHeight: 600 });
  t("recognize.ok", cfgR.error == null && cfgR.candidates.length === 2, JSON.stringify(cfgR.candidates));
  t("recognize.bbox-standard", cfgR.candidates[0].bbox.x === 10 && cfgR.candidates[0].bbox.y === 20 && cfgR.candidates[0].bbox.width === 100 && cfgR.candidates[0].bbox.height === 24, JSON.stringify(cfgR.candidates[0].bbox));
  t("recognize.imageSize", cfgR.candidates[0].imageSize.width === 800 && cfgR.candidates[0].coordinateSpace === "image-pixel", JSON.stringify(cfgR.candidates[0]));
  t("token.cached", memStore.zyBaiduToken === "TOKEN_A" && Number(memStore.zyBaiduTokenExpiryAt) > 1000000, JSON.stringify(memStore));
  t("token.single-call", tokenCalls === 1, "tokenCalls=" + tokenCalls);
  // 第二次识别复用缓存
  const r2 = await p.recognize("data:image/png;base64,QUJD", {});
  t("token.cache-hit", tokenCalls === 1 && r2.error == null && r2.candidates.length === 2, "tokenCalls=" + tokenCalls);

  // ---- 令牌过期：缓存过期 → 自动重新获取 ----
  const p2 = createBaiduProvider({ getConfig: () => ({ apiKey: "AK1", secretKey: "SK1" }), http: wrap, storage: memStore, now: () => 1000000 + 2592000 * 1000 + 100000 });
  const r3 = await p2.recognize("data:image/png;base64,QUJD", {});
  t("token.expired-refetch", tokenCalls === 2 && r3.error == null, "tokenCalls=" + tokenCalls);

  // ---- token 失效(110) → 清缓存强制刷新重试一次 ----
  let failFirst = true;
  const http110 = mockHttp([
    { method: "GET", urlMatch: "/oauth/2.0/token", responseText: JSON.stringify({ access_token: "TOKEN_B", expires_in: 2592000 }) },
    { method: "POST", urlMatch: "/rest/2.0/ocr/v1/general", responseText: () => { if (failFirst) { failFirst = false; return JSON.stringify({ error_code: 110, error_msg: "access token invalid" }); } return JSON.stringify({ words_result_num: 1, words_result: [{ words: "RETRY", location: { left: 0, top: 0, width: 40, height: 12 } }] }); } }
  ]);
  const store110 = { zyBaiduToken: "STALE", zyBaiduTokenExpiryAt: String(Date.now() + 99999999) };
  const p3 = createBaiduProvider({ getConfig: () => ({ apiKey: "AK1", secretKey: "SK1" }), http: http110, storage: store110 });
  const r110 = await p3.recognize("data:image/png;base64,QUJD", {});
  t("token.invalid-refresh-retry", r110.error == null && r110.candidates.length === 1 && r110.candidates[0].text === "RETRY", JSON.stringify({ err: r110.error, candidates: r110.candidates }));
  t("token.invalid-cache-cleared", store110.zyBaiduToken === "TOKEN_B", JSON.stringify(store110));

  // ---- 图像过大 → resizeImage 触发；resize 后仍超 → BAIDU_IMAGE_TOO_LARGE ----
  const bigB64 = "A".repeat(bp.MAX_BYTES + 1);
  let resized = 0;
  const p4 = createBaiduProvider({
    getConfig: () => ({ apiKey: "AK1", secretKey: "SK1" }),
    http: fallbackRes, storage: memStore,
    resizeImage: async (d) => { resized += 1; return d; } // resize 无效（仍超限）
  });
  const rBig1 = await p4.recognize("data:image/png;base64," + bigB64, {});
  t("image.resize-triggered", resized === 1 && rBig1.error && rBig1.error.errorCode === "BAIDU_IMAGE_TOO_LARGE", JSON.stringify({ resized, err: rBig1.error }));
  const p4b = createBaiduProvider({
    getConfig: () => ({ apiKey: "AK1", secretKey: "SK1" }),
    http: mockHttp([
      { method: "GET", urlMatch: "/oauth/2.0/token", responseText: JSON.stringify({ access_token: "T_OK", expires_in: 2592000 }) },
      { method: "POST", urlMatch: "general", responseText: JSON.stringify({ words_result: [] }) }
    ]), storage: {},
    resizeImage: async (d) => { resized += 1; return "data:image/png;base64," + "B".repeat(200); } // resize 成功
  });
  const rBig2 = await p4b.recognize("data:image/png;base64," + bigB64, {});
  t("image.resized-proceeds", resized === 2 && rBig2.error == null && Array.isArray(rBig2.candidates), JSON.stringify({ resized, err: rBig2.error, cands: rBig2.candidates ? rBig2.candidates.length : -1 }));

  // ---- 远程错误映射：17 / 216201 ----
  const http17 = mockHttp([
    { method: "GET", urlMatch: "/oauth/2.0/token", responseText: JSON.stringify({ access_token: "T1", expires_in: 2592000 }) },
    { method: "POST", urlMatch: "general", responseText: JSON.stringify({ error_code: 17, error_msg: "Open api daily request limit reached" }) }
  ]);
  const p5 = createBaiduProvider({ getConfig: () => ({ apiKey: "AK", secretKey: "SK" }), http: http17, storage: {} });
  const r17 = await p5.recognize("data:image/png;base64,QUJD", {});
  t("err.17-human", r17.error && /配额|限/.test(r17.error.errorMessage) && r17.error.errorCode === "BAIDU_REMOTE_17", JSON.stringify(r17.error));

  // ---- token 错误映射（AK/SK 不正确 → invalid_client）----
  const httpBad = mockHttp([{ method: "GET", urlMatch: "/oauth/2.0/token", responseText: JSON.stringify({ error: "invalid_client", error_description: "unknown client id" }) }]);
  const p6 = createBaiduProvider({ getConfig: () => ({ apiKey: "BAD", secretKey: "BAD" }), http: httpBad, storage: {} });
  const rBad = await p6.recognize("data:image/png;base64,QUJD", {});
  t("token.bad-aksk", rBad.error && rBad.error.errorCode === "BAIDU_TOKEN_FAILED" && /无效|未知|unknown/i.test(rBad.error.errorMessage), JSON.stringify(rBad.error));

  // ---- 无字识别（words_result 空数组）→ 空 candidates 而非错误 ----
  const httpEmpty = mockHttp([
    { method: "GET", urlMatch: "/oauth/2.0/token", responseText: JSON.stringify({ access_token: "T", expires_in: 2592000 }) },
    { method: "POST", urlMatch: "general", responseText: JSON.stringify({ words_result_num: 0, words_result: [] }) }
  ]);
  const p7 = createBaiduProvider({ getConfig: () => ({ apiKey: "AK", secretKey: "SK" }), http: httpEmpty, storage: {} });
  const rEmpty = await p7.recognize("data:image/png;base64,QUJD", {});
  t("recognize.empty", rEmpty.error == null && rEmpty.candidates.length === 0, JSON.stringify(rEmpty));

  console.log(results.join("\n"));
  failures.forEach((f) => console.log("  > " + f));
  console.log("baidu-provider: " + (failures.length ? failures.length + " FAILURES" : "ALL PASS"));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error("test runner error", e); process.exit(1); });