// runtime/stage9/native-ocr-provider.test.js — Stage 9 P1：Native OCR Provider 单测（mock fetch）
"use strict";
const assert = require("assert");
const N = require("../../extension/src/ocr/native-ocr-provider.js");

let passed = 0, failed = 0, failures = [];
// 注意：async 用例必须被 await，否则 rejected promise 会吞掉断言异常导致假 PASS。
function t(name, fn) {
  return Promise.resolve().then(fn).then(
    () => { passed += 1; },
    (e) => { failed += 1; failures.push(name + " :: " + (e && e.message || e)); }
  );
}

const OK_BODY = JSON.stringify({ success: true, message: "0", userData: "吴健湘<br/>客户经理<br/>Telephone: +8615913171583" });
const mockFetch = (status, body, ct) => (url, opt) => Promise.resolve({ status: status, text: () => Promise.resolve(body), headers: { get: () => ct || "application/json" } });

const RUN = [];

// §十六：正常识别 → NativeOCRResult（Text Truth only, bbox=null；10 行解析）
RUN.push(t("recognize: success → texts 行解析 + bbox=null + provider/source", async () => {
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
  assert.strictEqual(r.statusCode, "NATIVE_OK"); // OCR-P0.2-C
}));
// §六（Stage9 V3）：rawText 绝对原样——禁止 trim/归一/改标点；只做 <br/> 行边界
RUN.push(t("rawText 保真（§六：禁 trim，空格原样保留）", async () => {
  const body = JSON.stringify({ success: true, message: "0", userData: " 佛山盛盈包装制品有限公司 <br/> Tel.:0757-88809856 " });
  const r = await N.recognize("data:image/png;base64,AAAA", { fetch: mockFetch(200, body) });
  assert.strictEqual(r.texts[0].rawText, " 佛山盛盈包装制品有限公司 ");
  assert.strictEqual(r.texts[1].rawText, " Tel.:0757-88809856 ");
  assert.strictEqual(r.texts.length, 2);
}));
// success=false → OCR_FAILED + statusCode=NATIVE_PARSE_FAILED（成功结构外）
RUN.push(t("recognize: success=false → OCR_FAILED + NATIVE_PARSE_FAILED + rawHead", async () => {
  const r = await N.recognize("data:image/png;base64,AAAA", { fetch: mockFetch(200, JSON.stringify({ success: false, message: "识别失败" })) });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.errorCode, "OCR_FAILED");
  assert.strictEqual(r.statusCode, "NATIVE_PARSE_FAILED"); // OCR-P0.2-C
  assert.ok(r.error.errorMessage.indexOf("识别失败") >= 0);
}));
// 非 JSON → PARSE_FAIL（普通 HTML 非登录页）
RUN.push(t("recognize: 非 JSON（普通内容）→ PARSE_FAIL + NATIVE_PARSE_FAILED", async () => {
  const r = await N.recognize("data:image/png;base64,AAAA", { fetch: mockFetch(200, "<div>nope</div>") });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.errorCode, "PARSE_FAIL");
  assert.strictEqual(r.statusCode, "NATIVE_PARSE_FAILED"); // OCR-P0.2-C
}));
// OCR-P0.2-C：登录跳转 HTML（会话过期）→ SESSION_EXPIRED
RUN.push(t("recognize: 登录跳转 HTML → NATIVE_SESSION_EXPIRED（OCR-P0.2-C）", async () => {
  const html = "<script>window.open('http://diy.zheliyin.com:443/siteWeb/jsj/index.do')</script>";
  const r = await N.recognize("data:image/png;base64,AAAA", { fetch: mockFetch(200, html) });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.statusCode, "NATIVE_SESSION_EXPIRED");
  assert.strictEqual(r.error.errorCode, "SESSION_EXPIRED");
}));
// OCR-P0.2-C：HTTP >= 400 → NATIVE_HTTP_FAILED
RUN.push(t("recognize: HTTP 500 → NATIVE_HTTP_FAILED", async () => {
  const r = await N.recognize("data:image/png;base64,AAAA", { fetch: mockFetch(500, "oops") });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.statusCode, "NATIVE_HTTP_FAILED");
  assert.strictEqual(r.httpStatus, 500);
}));
// 无 fetch → NO_FETCH + NATIVE_UPLOAD_FAILED（node 24 有全局 fetch 无法触达；用例改为直接断言 statusCode 常量路径已在以上心电）
// 移除（全局 fetch 存在时该分支不可达，避免用真实网络请求）
// transactionId/pageId/imageFingerprint 透传 + meta.requestId
RUN.push(t("recognize: 上下文透传", async () => {
  const r = await N.recognize("data:image/png;base64,AAAA", { fetch: mockFetch(200, OK_BODY), pageId: "canvas:c0", transactionId: "tx-9", imageFingerprint: "img-1-895x577" });
  assert.strictEqual(r.pageId, "canvas:c0");
  assert.strictEqual(r.transactionId, "tx-9");
  assert.strictEqual(r.imageFingerprint, "img-1-895x577");
  assert.strictEqual(r.meta.requestId, "tx-9");
}));
// 空 userData → ok=true texts=[] + NATIVE_EMPTY（OCR-P0.2-C：≠ 图片未交付）
RUN.push(t("recognize: userData 空 → ok=true texts=[] + NATIVE_EMPTY", async () => {
  const r = await N.recognize("data:image/png;base64,AAAA", { fetch: mockFetch(200, JSON.stringify({ success: true, message: "0", userData: "" })) });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.texts.length, 0);
  assert.strictEqual(r.statusCode, "NATIVE_EMPTY"); // OCR-P0.2-C
}));
// 单测辅助函数（同步）
RUN.push(t("parseNativeText / buildFormData 细节", () => {
  assert.deepStrictEqual(N.parseNativeText("a<br/>b<br>c<br />d"), ["a", "b", "c", "d"]);
  assert.deepStrictEqual(N.parseNativeText("  x "), ["  x "]); // §六：原样保留，不 trim
  assert.deepStrictEqual(N.parseNativeText(""), []);
  assert.strictEqual(N.buildFormData(null), null);
}));

// ---- OCR-P0.1-B：buildFormPayload 诊断 + IMAGE_PAYLOAD_MISMATCH 完整性校验 ----
RUN.push(t("payload: dataURL → diagnostics(mime/filename/blobSize/fileSize/textType/decodedBytes)", () => {
  const p = N.buildFormPayload("data:image/png;base64,AAAA", { textType: "2" });
  assert.strictEqual(p.ok, true);
  assert.ok(p.diagnostics);
  assert.strictEqual(p.diagnostics.mime, "image/png");
  assert.strictEqual(p.diagnostics.filename, "native-ocr.png");
  assert.strictEqual(p.diagnostics.textType, "2");
  // "AAAA" base64 → 3 解码字节
  assert.strictEqual(p.diagnostics.decodedBytes, 3);
  assert.strictEqual(p.errorCode, null);
  const file = p.formData.get("file");
  assert.strictEqual(file.size, p.diagnostics.decodedBytes);
  assert.strictEqual(p.formData.get("textType"), "2");
}));
RUN.push(t("payload: File.size === decodedBytes（解码后原样封装，零截断）", () => {
  const p = N.buildFormPayload("data:image/png;base64,AAAA", {});
  assert.strictEqual(p.ok, true);
  assert.strictEqual(p.diagnostics.fileSize, 3);
  assert.strictEqual(p.diagnostics.fileSize, p.diagnostics.decodedBytes);
  assert.strictEqual(p.diagnostics.transformPolicy, "pass-through");
}));
RUN.push(t("payload: 无法构建 / 非法入参 → IMAGE_INVALID formData=null", () => {
  const p1 = N.buildFormPayload(null, {});
  assert.strictEqual(p1.ok, false);
  assert.strictEqual(p1.errorCode, "IMAGE_INVALID");
  const p2 = N.buildFormPayload("not-a-dataurl", {});
  assert.strictEqual(p2.ok, false);
  assert.strictEqual(p2.errorCode, "IMAGE_INVALID");
}));
RUN.push(t("payload: recognize 对 payload 失败携带 errorCode=IMAGE_INVALID + payload.diagnostics + NATIVE_IMAGE_INVALID", async () => {
  const r = await N.recognize("not-a-dataurl", { fetch: mockFetch(200, OK_BODY) });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.errorCode, "IMAGE_INVALID");
  assert.strictEqual(r.statusCode, "NATIVE_IMAGE_INVALID"); // OCR-P0.2-C
  assert.ok(r.payload && r.payload.mime === "image/png"); // diagnostics 透传
}));

// ---- recognizeWithFallback：OCR-P0.2-B —— textType=2 唯一生产真值 ----
RUN.push(t("fallback: 主模式(textType=2)成功 → 不回退（modeUsed=2, productionTextType=2）", async () => {
  const calls = [];
  const f = (u, opt) => { calls.push((opt.body && opt.body.get && opt.body.get("textType")) || null); return mockFetch(200, OK_BODY)(u, opt); };
  const r = await N.recognizeWithFallback("data:image/png;base64,AAAA", { fetch: f });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.texts.length, 3);
  assert.strictEqual(r.meta.modeUsed, "2");
  assert.strictEqual(r.meta.fallbackUsed, false);
  assert.strictEqual(r.meta.productionTextType, "2");
  assert.deepStrictEqual(calls, ["2"]); // 主识别必调 "2"（生产真值）；成功时无需补调 "1"
  assert.strictEqual(r.meta.diagnosticType1, null); // 成功分支不执行 type=1 诊断
  // 生产内容仍来自 type=2（3 行）——calls 证明只调 1 次 "2"（productionTextType=2）
  assert.strictEqual(r.statusCode, "NATIVE_OK");
}));
RUN.push(t("fallback: 主模式(textType=2)空 → type=1 仅诊断，生产结果仍为 type=2 空（不把 1 当 truth）", async () => {
  const seq = [JSON.stringify({ success: true, message: "0", userData: "" }), OK_BODY];
  let i = 0;
  const f = (u, opt) => { const tt = (opt.body && opt.body.get && opt.body.get("textType")) || null; return mockFetch(200, seq[i++])(u, opt); };
  const r = await N.recognizeWithFallback("data:image/png;base64,AAAA", { fetch: f, textType: "2", fallbackTo: "1" });
  assert.strictEqual(r.ok, true);
  // OCR-P0.2-B：modeUsed 保持 "2"（生产模式），texts 保持 type=2 的空结果
  assert.strictEqual(r.meta.modeUsed, "2");
  assert.strictEqual(r.meta.productionTextType, "2");
  assert.strictEqual(r.meta.fallbackUsed, true);
  assert.strictEqual(r.texts.length, 0);
  assert.strictEqual(r.statusCode, "NATIVE_EMPTY");
  // diagnosticType1 承载 type=1 证据（不进生产 texts）
  assert.ok(r.meta.diagnosticType1);
  assert.strictEqual(r.meta.diagnosticType1.textType, "1");
  assert.strictEqual(r.meta.diagnosticType1.ok, true);
  assert.strictEqual(r.meta.diagnosticType1.lines, 3);
}));
RUN.push(t("fallback: 主/诊断均失败 → ok=false（type=1 不覆盖 type=2 失败）", async () => {
  const f = (u, opt) => mockFetch(200, JSON.stringify({ success: false, message: "x" }))(u, opt);
  const r = await N.recognizeWithFallback("data:image/png;base64,AAAA", { fetch: f });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.texts.length, 0);
  assert.strictEqual(r.meta.statusCode, "NATIVE_PARSE_FAILED");
}));
// OCR-P0.2-C：classifyNativeStatus
RUN.push(t("classifyNativeStatus: 七态映射", () => {
  assert.strictEqual(N.classifyNativeStatus({ ok: true, texts: [{ rawText: "a" }] }), "NATIVE_OK");
  assert.strictEqual(N.classifyNativeStatus({ ok: true, texts: [] }), "NATIVE_EMPTY");
  assert.strictEqual(N.classifyNativeStatus({ ok: false, statusCode: "NATIVE_SESSION_EXPIRED" }), "NATIVE_SESSION_EXPIRED");
  assert.strictEqual(N.classifyNativeStatus({ ok: false, statusCode: "NATIVE_IMAGE_INVALID" }), "NATIVE_IMAGE_INVALID");
  assert.strictEqual(N.classifyNativeStatus({ ok: false, statusCode: "NATIVE_UPLOAD_FAILED" }), "NATIVE_UPLOAD_FAILED");
  assert.strictEqual(N.classifyNativeStatus({ ok: false, statusCode: "NATIVE_HTTP_FAILED" }), "NATIVE_HTTP_FAILED");
  assert.strictEqual(N.classifyNativeStatus({ ok: false, statusCode: "NATIVE_PARSE_FAILED" }), "NATIVE_PARSE_FAILED");
  assert.strictEqual(N.classifyNativeStatus(null), "NATIVE_HTTP_FAILED");
}));

Promise.all(RUN).then(() => {
  console.log("native-ocr-provider.test: pass=" + passed + " fail=" + failed);
  if (failures.length) { console.error(failures.join("\n")); }
  process.exit(failed ? 1 : 0);
});