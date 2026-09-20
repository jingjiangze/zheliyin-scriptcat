// runtime/stage9/native-ocr-provider.test.js — Stage 9 P1：Native OCR Provider 单测（mock fetch）
"use strict";
const assert = require("assert");
const N = require("../../extension/src/ocr/native-ocr-provider.js");

let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); } }

const OK_BODY = JSON.stringify({ success: true, message: "0", userData: "吴健湘<br/>客户经理<br/>Telephone: +8615913171583" });
const mockFetch = (status, body, ct) => (url, opt) => Promise.resolve({ status: status, text: () => Promise.resolve(body), headers: { get: () => ct || "application/json" } });

// §十六：正常识别 → NativeOCRResult（Text Truth only, bbox=null；10 行解析）
t("recognize: success → texts 行解析 + bbox=null + provider/source", async () => {
  const r = await N.recognize("data:image/png;base64,AAAA", { fetch: mockFetch(200, OK_BODY) });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.provider, "NATIVE_OCR");
  assert.strictEqual(r.source, "OCR_TOOL_API");
  assert.strictEqual(r.texts.length, 3);
  assert.strictEqual(r.texts[0].rawText, "吴健湘");
  assert.strictEqual(r.texts[2].rawText, "Telephone: +8615913171583");
  assert.strictEqual(r.texts[0].bbox, null);
  assert.strictEqual(r.texts[0].order, 0);
  assert.ok(r.texts[2].matchText.length > 0);
  assert.strictEqual(r.meta.method, "POST");
  assert.strictEqual(r.meta.responseType, "json");
});
// §六（Stage9 V3）：rawText 绝对原样——禁止 trim/归一/改标点；只做 <br/> 行边界
t("rawText 保真（§六：禁 trim，空格原样保留）", async () => {
  const body = JSON.stringify({ success: true, message: "0", userData: " 佛山盛盈包装制品有限公司 <br/> Tel.:0757-88809856 " });
  const r = await N.recognize("data:image/png;base64,AAAA", { fetch: mockFetch(200, body) });
  assert.strictEqual(r.texts[0].rawText, " 佛山盛盈包装制品有限公司 ");
  assert.strictEqual(r.texts[1].rawText, " Tel.:0757-88809856 ");
  assert.strictEqual(r.texts.length, 2);
});
// success=false → OCR_FAILED
t("recognize: success=false → OCR_FAILED + rawHead", async () => {
  const r = await N.recognize("data:image/png;base64,AAAA", { fetch: mockFetch(200, JSON.stringify({ success: false, message: "识别失败" })) });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.errorCode, "OCR_FAILED");
  assert.ok(r.error.errorMessage.indexOf("识别失败") >= 0);
});
// 非 JSON → PARSE_FAIL
t("recognize: 非 JSON → PARSE_FAIL", async () => {
  const r = await N.recognize("data:image/png;base64,AAAA", { fetch: mockFetch(200, "<html>nope</html>") });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.errorCode, "PARSE_FAIL");
});
// HTTP 错误状态仍返回解析（若 json 则按协议）
t("recognize: HTTP 500 + JSON → httpStatus 透传", async () => {
  const r = await N.recognize("data:image/png;base64,AAAA", { fetch: mockFetch(500, JSON.stringify({ success: false, message: "server" })) });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.httpStatus, 500);
});
// 无 fetch → NO_FETCH（node 环境可测）
t("recognize: 无 fetch → NO_FETCH 不抛", async () => {
  const r = await N.recognize("data:image/png;base64,AAAA", { fetch: null });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.errorCode, "NO_FETCH");
});
// transactionId/pageId/imageFingerprint 透传 + meta.requestId
t("recognize: 上下文透传", async () => {
  const r = await N.recognize("data:image/png;base64,AAAA", { fetch: mockFetch(200, OK_BODY), pageId: "canvas:c0", transactionId: "tx-9", imageFingerprint: "img-1-895x577" });
  assert.strictEqual(r.pageId, "canvas:c0");
  assert.strictEqual(r.transactionId, "tx-9");
  assert.strictEqual(r.imageFingerprint, "img-1-895x577");
  assert.strictEqual(r.meta.requestId, "tx-9");
});
// 空 userData → ok=true texts=[]
t("recognize: userData 空 → ok=true texts=[]", async () => {
  const r = await N.recognize("data:image/png;base64,AAAA", { fetch: mockFetch(200, JSON.stringify({ success: true, message: "0", userData: "" })) });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.texts.length, 0);
});
// 单测辅助函数
t("parseNativeText / buildFormData 细节", () => {
  assert.deepStrictEqual(N.parseNativeText("a<br/>b<br>c<br />d"), ["a", "b", "c", "d"]);
  assert.deepStrictEqual(N.parseNativeText("  x "), ["  x "]); // §六：原样保留，不 trim
  assert.deepStrictEqual(N.parseNativeText(""), []);
  assert.strictEqual(N.buildFormData(null), null);
});

// ---- recognizeWithFallback：手写体优先，错误明显回退印刷体 ----
t("fallback: 主模式成功 → 不回退（modeUsed=primary）", async () => {
  const calls = [];
  const f = (u, opt) => { calls.push((opt.body && opt.body.get && opt.body.get("textType")) || null); return mockFetch(200, OK_BODY)(u, opt); };
  const r = await N.recognizeWithFallback("data:image/png;base64,AAAA", { fetch: f });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.texts.length, 3);
  assert.strictEqual(r.meta.modeUsed, "2");
  assert.strictEqual(r.meta.fallbackUsed, false);
  assert.deepStrictEqual(calls, ["2"]);
});
t("fallback: 主模式空结果 → 回退印刷体（modeUsed=1 fallbackUsed=true）", async () => {
  const seq = [JSON.stringify({ success: true, message: "0", userData: "" }), OK_BODY];
  let i = 0;
  const f = (u, opt) => { const tt = (opt.body && opt.body.get && opt.body.get("textType")) || null; return mockFetch(200, seq[i++])(u, opt); };
  const r = await N.recognizeWithFallback("data:image/png;base64,AAAA", { fetch: f, textType: "2", fallbackTo: "1" });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.meta.modeUsed, "1");
  assert.strictEqual(r.meta.fallbackUsed, true);
  assert.strictEqual(r.texts.length, 3);
});
t("fallback: 主/回退均失败 → ok=false（FALLBACK 路径不抛）", async () => {
  const f = (u, opt) => mockFetch(200, JSON.stringify({ success: false, message: "x" }))(u, opt);
  const r = await N.recognizeWithFallback("data:image/png;base64,AAAA", { fetch: f });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.texts.length, 0);
});

console.log("native-ocr-provider.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);