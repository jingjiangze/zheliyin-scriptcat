// =====================================================================
// 折立印名片套版助手 - Cloud Primary / Local Fallback 策略（Stage 7.2，§8.1）
// ---------------------------------------------------------------------
// 纯决策函数：Cloud OCR 失败（分类 reason）后是否切换到本地 Tesseract。
// 由调用方传入分类后的 failReason（不能在此虚构错误），返回 action：
//   "local"           → 切换本地 OCR（auto 模式 Cloud Primary 失败后，§8.1）
//   "stop"            → 不切换（manual local / manual baidu / 用户取消）
// 诊断字段（§9，每次 OCR 完成后必须可诊断）：
//   {engine:"cloud"|"local", attempt:"cloud-primary"|"local-fallback"|"manual-local"|"manual-baidu",
//    fallback:boolean, reasonCode:"timeout"|"http-error"|"auth-error"|"empty-result"|"invalid-result"|"exception"}
// 约束：PREPARING 阶段输入错误（IMAGE_UNAVAILABLE/CROSS_ORIGIN 等）不走本模块，
//       它们在任何模式下都直接失败并给出可操作提示，不触发本轮识别（§36/§55）。
// =====================================================================
"use strict";

// reason 枚举（§9）：timeout / http-error / auth-error / empty-result / invalid-result / exception
var REASON_CODES = {
  timeout: 1,
  "http-error": 1,
  "auth-error": 1,
  "empty-result": 1,
  "invalid-result": 1,
  exception: 1,
  "not-configured": 1
};

// 可触发 Local FALLBACK 的 Cloud 失败 reason（其余视为不可恢复/不该换路）
var CLOUD_FAIL_ABLE = {
  timeout: 1,
  "http-error": 1,
  "auth-error": 1,
  "empty-result": 1,
  "invalid-result": 1,
  exception: 1,
  "not-configured": 1
};

// input: {mode:"auto"|"local"|"baidu", baiduEnabled:boolean, failCode:string, failReason:string, userCancelled:boolean}
function decideFallback(input) {
  var mode = input && input.mode || "auto";
  var failReason = (input && input.failReason) || "exception";
  if (!REASON_CODES[failReason]) failReason = "exception";
  // manual 模式：引擎由用户显式选择，任何失败都不换路（§8.1 manual local→Local / manual baidu→Cloud）
  if (mode !== "auto") {
    return { action: "stop", reason: "mode=" + mode, engine: mode === "baidu" ? "cloud" : "local", attempt: "manual-" + mode, fallback: false, reasonCode: failReason, failCode: input.failCode };
  }
  if (input.userCancelled) return { action: "stop", reason: "user cancelled", engine: "cloud", attempt: "cloud-primary", fallback: false, reasonCode: failReason, failCode: input.failCode };
  // auto → Cloud PRIMARY：cloud 失败（含未配置 reason="not-configured"）→ Local FALLBACK
  if (CLOUD_FAIL_ABLE[failReason]) {
    return { action: "local", reason: "cloud-primary failed", engine: "cloud", attempt: "cloud-primary", fallback: true, fallbackEngine: "local", reasonCode: failReason, failCode: input.failCode };
  }
  return { action: "stop", reason: "not cloud-fallback-able: " + input.failCode, engine: "cloud", attempt: "cloud-primary", fallback: false, reasonCode: failReason, failCode: input.failCode };
}

if (typeof module !== "undefined" && module.exports) module.exports = { decideFallback, REASON_CODES, CLOUD_FAIL_ABLE };