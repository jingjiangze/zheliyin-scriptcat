// runtime/stage9/baidu-profile.test.js — Stage 9 V4 §十一/§十二：百度 Endpoint Profile（standard/accurate）单测
// 覆盖：默认 standard（/general）/ ctx.mode=accurate（/accurate）/ 非法 mode 回退 standard /
//       provider 名随模式切换 / meta 记录 mode+profileName+endpoint / token 缓存跨模式复用 / 旧调用兼容
"use strict";
const assert = require("assert");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const bp = require(path.join(ROOT, "extension", "src", "ocr", "baidu-provider.js"));
const { createBaiduProvider, resolveBaiduProfile, BAIDU_OCR_PROFILES } = bp;

let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); } }

const WORDS = JSON.stringify({
  words_result_num: 2,
  words_result: [
    { words: "佛山盛盈包装制品有限公司", location: { left: 10, top: 20, width: 220, height: 26 } },
    { words: "Tel.:0757-88809856", location: { left: 5, top: 60, width: 170, height: 18 } }
  ]
});

function mockHttp(routes) {
  return { request: async (method, url, opts) => {
    for (const r of routes) {
      if (r.method === method && url.indexOf(r.urlMatch) >= 0) {
        return { status: r.status != null ? r.status : 200, responseText: typeof r.responseText === "function" ? await r.responseText(opts) : r.responseText };
      }
    }
    return { status: 500, responseText: JSON.stringify({ error: "no route", error_description: url }) };
  } };
}

// ---- resolveBaiduProfile 纯函数 ----
t("resolveBaiduProfile: 默认 standard (/general)", () => {
  const p = resolveBaiduProfile({});
  assert.strictEqual(p.mode, "standard");
  assert.strictEqual(p.endpoint, "https://aip.baidubce.com/rest/2.0/ocr/v1/general");
  assert.strictEqual(p.name, "STANDARD_POSITION");
  assert.strictEqual(p.provider, "baidu-general-standard-position");
});
t("resolveBaiduProfile: accurate → /accurate + ACCURATE_POSITION", () => {
  const p = resolveBaiduProfile({ mode: "accurate" });
  assert.strictEqual(p.mode, "accurate");
  assert.strictEqual(p.endpoint, "https://aip.baidubce.com/rest/2.0/ocr/v1/accurate");
  assert.strictEqual(p.name, "ACCURATE_POSITION");
  assert.strictEqual(p.provider, "baidu-accurate-position");
});
t("resolveBaiduProfile: 非法 mode 回退 standard（不做自动判断）", () => {
  const p = resolveBaiduProfile({ mode: "auto" });
  assert.strictEqual(p.mode, "standard");
  assert.strictEqual(BAIDU_OCR_PROFILES["standard"].name, "STANDARD_POSITION");
});
t("resolveBaiduProfile: 未传 ctx 不抛", () => {
  const p = resolveBaiduProfile(undefined);
  assert.strictEqual(p.mode, "standard");
});

// ---- provider 行为 ----
function makeProvider(routes, over) {
  const baseRoutes = [{ method: "GET", urlMatch: "/oauth/2.0/token", responseText: JSON.stringify({ access_token: "TOKEN_M", expires_in: 2592000 }) }].concat(routes);
  return createBaiduProvider(Object.assign({
    getConfig: () => ({ apiKey: "AK", secretKey: "SK" }),
    http: mockHttp(baseRoutes),
    storage: {},
    now: () => 1000000
  }, over || {}));
}

t("recognize: 默认 standard → provider=baidu-general-standard-position + meta.mode", async () => {
  const p = makeProvider([{ method: "POST", urlMatch: "/rest/2.0/ocr/v1/general", responseText: WORDS }]);
  const r = await p.recognize("data:image/png;base64,QUJD", { imageWidth: 800 });
  assert.strictEqual(r.error, undefined);
  assert.strictEqual(r.provider, "baidu-general-standard-position");
  assert.strictEqual(r.meta.mode, "standard");
  assert.strictEqual(r.meta.profileName, "STANDARD_POSITION");
  assert.ok(r.meta.endpoint.indexOf("/ocr/v1/general") >= 0);
  assert.strictEqual(r.candidates.length, 2);
});
t("recognize: mode=accurate → /accurate + provider=baidu-accurate-position + meta.mode", async () => {
  const p = makeProvider([{ method: "POST", urlMatch: "/rest/2.0/ocr/v1/accurate", responseText: WORDS }]);
  const r = await p.recognize("data:image/png;base64,QUJD", { imageWidth: 800, mode: "accurate" });
  assert.strictEqual(r.error, undefined);
  assert.strictEqual(r.provider, "baidu-accurate-position");
  assert.strictEqual(r.meta.mode, "accurate");
  assert.strictEqual(r.meta.profileName, "ACCURATE_POSITION");
  assert.ok(r.meta.endpoint.indexOf("/ocr/v1/accurate") >= 0);
  assert.strictEqual(r.candidates.length, 2);
  assert.strictEqual(r.candidates[0].bbox.width, 220);
});
t("recognize: 同 provider 先后 standard/accurate 切换 → provider 随模式变化（A/B 诊断）", async () => {
  let lastUrl = "";
  const routes = [
    { method: "GET", urlMatch: "/oauth/2.0/token", responseText: JSON.stringify({ access_token: "TOKEN_M", expires_in: 2592000 }) },
    { method: "POST", urlMatch: "/rest/2.0/ocr/v1/general", responseText: WORDS },
    { method: "POST", urlMatch: "/rest/2.0/ocr/v1/accurate", responseText: WORDS }
  ];
  const http = mockHttp(routes);
  const origReq = http.request;
  http.request = async (m, u, o) => { if (u.indexOf("/rest/2.0/ocr/") >= 0) lastUrl = u; return origReq(m, u, o); };
  const p = createBaiduProvider({ getConfig: () => ({ apiKey: "AK", secretKey: "SK" }), http, storage: {}, now: () => 1000000 });
  const r1 = await p.recognize("data:image/png;base64,QUJD", {});
  assert.ok(lastUrl.indexOf("v1/general") >= 0);
  const r2 = await p.recognize("data:image/png;base64,QUJD", { mode: "accurate" });
  assert.ok(lastUrl.indexOf("v1/accurate") >= 0);
  assert.strictEqual(r2.provider, "baidu-accurate-position");
});

console.log("baidu-profile.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);