// =====================================================================
// 折立印名片套版助手 - 本地优先 Fallback 策略（Stage 5.5B P5，§47）
// ---------------------------------------------------------------------
// 纯决策函数：本地 OCR 失败后是否切换到百度云端。
// 由调用方传入分类后的 failCode（不能在此虚构错误），返回 action：
//   "baidu"           → 切换百度云端
//   "notify-config"   → 提示"本地失败但百度未配置"（不发起网络请求）
//   "stop"            → 不切换（仅本地模式 / 非 fallback 类错误 / 用户取消）
// 约束：PREPARING 阶段的输入错误（IMAGE_UNAVAILABLE/CROSS_ORIGIN 等）不走本模块，
//       它们在任何模式下都直接失败并给出可操作提示，不触发云端上传（§36/§55）。
// =====================================================================
"use strict";

// 可触发云端 fallback 的本地失败分类（其余视为不可恢复/不该换路）
var FALLBACK_ABLE = {
  LOCAL_ENGINE_LOAD_FAILED: true,
  LOCAL_ENGINE_NETWORK_ERROR: true,
  LOCAL_WORKER_FAILED: true,
  LOCAL_OCR_FAILED: true,
  LOCAL_OCR_PARSE_FAIL: true,
  LOCAL_OCR_EMPTY: true,
  LOCAL_OCR_TIMEOUT: true
};

// input: {mode: "auto"|"local"|"baidu", baiduEnabled: boolean, failCode: string, userCancelled: boolean}
function decideFallback(input) {
  var mode = input && input.mode || "auto";
  if (mode !== "auto") return { action: "stop", reason: "mode=" + mode };
  if (input.userCancelled) return { action: "stop", reason: "user cancelled" };
  if (!input.baiduEnabled) return { action: "notify-config", reason: "baidu not configured", failCode: input.failCode };
  if (FALLBACK_ABLE[input.failCode]) return { action: "baidu", reason: "fallback", failCode: input.failCode };
  return { action: "stop", reason: "not fallback-able: " + input.failCode };
}

if (typeof module !== "undefined" && module.exports) module.exports = { decideFallback, FALLBACK_ABLE };