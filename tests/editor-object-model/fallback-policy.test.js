// tests/editor-object-model/fallback-policy.test.js — Stage 5.5B P5：本地优先 fallback 策略矩阵（§47）
"use strict";
const path = require("path");
const fp = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "fallback-policy.js"));

const results = [];
const failures = [];
function t(name, cond, detail) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "")); }

// ---- §47 local-first fallback 矩阵 ----
// auto 模式 + 本地失败分类 → baidu
["LOCAL_ENGINE_LOAD_FAILED", "LOCAL_ENGINE_NETWORK_ERROR", "LOCAL_WORKER_FAILED", "LOCAL_OCR_FAILED", "LOCAL_OCR_PARSE_FAIL", "LOCAL_OCR_EMPTY", "LOCAL_OCR_TIMEOUT"].forEach((code) => {
  const r = fp.decideFallback({ mode: "auto", baiduEnabled: true, failCode: code });
  t("auto.fallback." + code, r.action === "baidu", JSON.stringify(r));
});
// auto + 百度未配置 → notify-config（不发起请求）
t("auto.notify-config", fp.decideFallback({ mode: "auto", baiduEnabled: false, failCode: "LOCAL_OCR_EMPTY" }).action === "notify-config");
// 非 auto 模式 → stop（仅本地 / 仅云端不互相切换）
t("local.stop", fp.decideFallback({ mode: "local", baiduEnabled: true, failCode: "LOCAL_OCR_EMPTY" }).action === "stop");
t("baidu.stop", fp.decideFallback({ mode: "baidu", baiduEnabled: true, failCode: "LOCAL_OCR_EMPTY" }).action === "stop");
// 用户取消 → stop（USER_CANCELLED 不上传，§59）
t("cancelled.stop", fp.decideFallback({ mode: "auto", baiduEnabled: true, failCode: "LOCAL_OCR_EMPTY", userCancelled: true }).action === "stop");
// 未知/输入类错误分类 → 不触发 fallback（PREPARING 阶段已拦，§55）
t("unknown-code.stop", fp.decideFallback({ mode: "auto", baiduEnabled: true, failCode: "IMAGE_UNAVAILABLE" }).action === "stop");
t("unknown-code2.stop", fp.decideFallback({ mode: "auto", baiduEnabled: true, failCode: "WHAT_EVER" }).action === "stop");
// failCode 缺省默认 stop
t("no-code.stop", fp.decideFallback({ mode: "auto", baiduEnabled: true }).action === "stop");

console.log("== fallback-policy ==");
console.log(results.join("\n"));
failures.forEach((f) => console.log("  > " + f));
console.log("fallback-policy: " + (failures.length ? failures.length + " FAILURES" : "ALL PASS"));
process.exit(failures.length ? 1 : 0);