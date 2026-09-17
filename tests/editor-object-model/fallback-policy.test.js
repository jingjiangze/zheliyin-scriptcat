// tests/editor-object-model/fallback-policy.test.js — Stage 7.2 §8.1：Cloud Primary / Local Fallback 策略矩阵
"use strict";
const path = require("path");
const fp = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "fallback-policy.js"));

const results = [];
const failures = [];
function t(name, cond, detail) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "")); }

// ---- §8.1 Cloud Primary / Local Fallback 矩阵 ----
// auto + 每种 Cloud 失败 reason → local（换路），诊断字段完整
["timeout", "http-error", "auth-error", "empty-result", "invalid-result", "exception", "not-configured"].forEach((reason) => {
  const r = fp.decideFallback({ mode: "auto", baiduEnabled: true, failCode: "CLOUD_X", failReason: reason });
  t("auto." + reason + " → local", r.action === "local" && r.engine === "cloud" && r.attempt === "cloud-primary" && r.fallback === true && r.reasonCode === reason, JSON.stringify(r));
});
// auto + cloud 未配置（not-configured）→ 也走 local（最佳努力：云不可用直接本地）
t("auto.not-configured → local", fp.decideFallback({ mode: "auto", baiduEnabled: false, failCode: "CLOUD_NOT_CONFIGURED", failReason: "not-configured" }).action === "local");
// manual 模式 → stop（不互相切换；engine/attempt 正确标注）
const ml = fp.decideFallback({ mode: "local", baiduEnabled: true, failCode: "CLOUD_X", failReason: "http-error" });
t("manual-local.stop", ml.action === "stop" && ml.engine === "local" && ml.attempt === "manual-local" && ml.fallback === false, JSON.stringify(ml));
const mb = fp.decideFallback({ mode: "baidu", baiduEnabled: true, failCode: "CLOUD_X", failReason: "http-error" });
t("manual-baidu.stop", mb.action === "stop" && mb.engine === "cloud" && mb.attempt === "manual-baidu" && mb.fallback === false, JSON.stringify(mb));
// 用户取消 → stop（USER_CANCELLED 不换路，§59）
t("cancelled.stop", fp.decideFallback({ mode: "auto", baiduEnabled: true, failCode: "CLOUD_X", failReason: "http-error", userCancelled: true }).action === "stop");
// failReason 缺省 → 保守归 exception（仍属可换路分类）
t("no-reason.defaults-to-exception", (() => { const r = fp.decideFallback({ mode: "auto", baiduEnabled: true, failCode: "CLOUD_X" }); return r.action === "local" && r.reasonCode === "exception"; })());
// 未知 failReason 枚举 → 归一 exception
t("unknown-reason.normalized.to-exception", fp.decideFallback({ mode: "auto", baiduEnabled: true, failCode: "CLOUD_X", failReason: "whatever" }).reasonCode === "exception");

console.log("== fallback-policy ==");
console.log(results.join("\n"));
failures.forEach((f) => console.log("  > " + f));
console.log("fallback-policy: " + (failures.length ? failures.length + " FAILURES" : "ALL PASS"));
process.exit(failures.length ? 1 : 0);