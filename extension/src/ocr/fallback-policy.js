// =====================================================================
// 折立印名片套版助手 - Cloud Primary / Local Fallback 策略（Stage 7.2，§8.1）
// ---------------------------------------------------------------------
// 纯决策函数（单一决策点，三段语义）：
//
// ① Stage 12 主路由 decideOcrRoute(input) —— 谁作首选引擎
//    未输入/未配置云端 API Key（baiduEnabled=false）→ 本地直出（不再发起注定失败的云端请求）
//    manual local → 本地；已配置云端 → 云端（cloud-primary / manual-baidu）
//
// ② Stage 12 本地辅助 decideLocalAssist(input) —— 云端未返回结果或结果不全时用本地补齐
//    cloud 0 行（cloud-empty）/ 质量门失败（cloud-quality-fail）→ scope="all"（本地几何全量接管）
//    cloud 有结果但仍有 Native 行未定位（native-unmatched）→ scope="unmatched"（本地几何补位）
//    cloud 完整覆盖 → assist=false（不跑本地，零额外开销）
//
// ③ Stage 7.2 云端失败换路 decideFallback(input) —— Cloud 失败（分类 reason）后是否切换到本地
//    action: "local" → 切换本地 OCR（auto 模式 Cloud Primary 失败后，§8.1）
//    action: "stop"  → 不切换（manual local / manual baidu / 用户取消）
//    由调用方传入分类后的 failReason（不能在此虚构错误）。
//
// 诊断字段（§9，每次 OCR 完成后必须可诊断）：
//   {engine:"cloud"|"local",
//    attempt:"cloud-primary"|"local-fallback"|"manual-local"|"manual-baidu"|"local-no-cloud"|"local-assist",
//    fallback:boolean, reasonCode:"timeout"|"http-error"|"auth-error"|"empty-result"|"invalid-result"|"exception"|"not-configured"}
// 约束：PREPARING 阶段输入错误（IMAGE_UNAVAILABLE/CROSS_ORIGIN 等）不走本模块，
//       它们在任何模式下都直接失败并给出可操作提示，不触发本轮识别（§36/§55）。
// =====================================================================
"use strict";

function zyFbIsNum(v) { return typeof v === "number" && isFinite(v); }

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

// =====================================================================
// Stage 12 —— 主路由：本轮 OCR 的首选引擎（未配置云端 → 本地直出）
// 输入：{mode:"auto"|"local"|"baidu", baiduEnabled:boolean}
// 返回：{action:"local"|"cloud", route:"local-no-cloud"|"manual-local"|"cloud-primary"|"manual-baidu",
//        engine:"local"|"cloud", reason:string}
// 规则（确定性）：
//   manual local                → local（manual-local）
//   未配置云端 Key（未输入）      → local（local-no-cloud：不发起注定失败的云端请求）
//   其余（auto/baidu + 已配置）   → cloud（cloud-primary / manual-baidu）
// =====================================================================
function decideOcrRoute(input) {
  var o = input || {};
  var mode = (o.mode === "local" || o.mode === "baidu") ? o.mode : "auto";
  var enabled = !!(o.baiduEnabled);
  if (mode === "local") return { action: "local", route: "manual-local", engine: "local", reason: "manual-local" };
  if (!enabled) return { action: "local", route: "local-no-cloud", engine: "local", reason: "cloud not configured" };
  return { action: "cloud", route: mode === "baidu" ? "manual-baidu" : "cloud-primary", engine: "cloud", reason: mode === "baidu" ? "manual-baidu" : "cloud-primary" };
}

// =====================================================================
// Stage 12 —— 本地辅助决策：云端未返回结果或结果不全时用本地补齐
// 输入：{mode:"auto"|"local"|"baidu", cloudRows:number, cloudQualityOk:boolean,
//        nativeTotal:number, nativeUnmatched:number}
// 返回：{assist:boolean, scope:"none"|"all"|"unmatched", reason:string,
//        cloudEmpty:boolean, cloudQualityFail:boolean, nativeIncomplete:boolean}
// 规则（确定性，只作用于已配置云端的 auto 模式；manual 模式返回 scope="none"）：
//   cloud 0 行（未返回结果）        → scope="all"（本地几何全量接管，geometries 归一化后进 recovery）
//   cloud 质量门失败                → scope="all"（本地几何全量接管）
//   cloud 有结果但 Native 未全定位   → scope="unmatched"（本地几何补位 unmatched）
//   云完整覆盖                      → assist=false（零额外开销）
// =====================================================================
function decideLocalAssist(input) {
  var o = input || {};
  var mode = (o.mode === "local" || o.mode === "baidu") ? o.mode : "auto";
  if (mode !== "auto") return { assist: false, scope: "none", reason: "manual-mode", cloudEmpty: false, cloudQualityFail: false, nativeIncomplete: false };
  var cloudRows = zyFbIsNum(o.cloudRows) ? Math.max(0, Math.round(o.cloudRows)) : 0;
  var nativeTotal = zyFbIsNum(o.nativeTotal) ? Math.max(0, Math.round(o.nativeTotal)) : 0;
  var nativeUnmatched = zyFbIsNum(o.nativeUnmatched) ? Math.max(0, Math.round(o.nativeUnmatched)) : 0;
  var qualityOk = o.cloudQualityOk !== false;
  if (cloudRows === 0) return { assist: true, scope: "all", reason: "cloud-empty", cloudEmpty: true, cloudQualityFail: !qualityOk, nativeIncomplete: nativeTotal > 0 && nativeUnmatched > 0 };
  if (!qualityOk) return { assist: true, scope: "all", reason: "cloud-quality-fail", cloudEmpty: false, cloudQualityFail: true, nativeIncomplete: nativeTotal > 0 && nativeUnmatched > 0 };
  if (nativeTotal > 0 && nativeUnmatched > 0) return { assist: true, scope: "unmatched", reason: "native-unmatched", cloudEmpty: false, cloudQualityFail: false, nativeIncomplete: true };
  return { assist: false, scope: "none", reason: "complete", cloudEmpty: false, cloudQualityFail: false, nativeIncomplete: false };
}

if (typeof module !== "undefined" && module.exports) module.exports = { decideFallback, decideOcrRoute, decideLocalAssist, REASON_CODES, CLOUD_FAIL_ABLE };