// runtime/stage12/m3c-wiring.test.js — Stage 12 M3c：userscript 接线静态护栏
// 目的：M3c 的接线全在 userscript（无法 node 运行），故用源码级不变量断言守住关键契约：
//   引擎开关默认值 / @require 齐备且同版本 / 双引擎共用同一桥属性与下游 / ppocr 失败必回退 Tesseract /
//   文字真值仍为 Native（不得由本地引擎直出） / 版本五处统一。
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const US = fs.readFileSync(path.join(ROOT, "zheliyin-card-assistant.user.js"), "utf8");
const BRIDGE = fs.readFileSync(path.join(ROOT, "extension/src/editor/page-bridge.js"), "utf8");
const LICENSE_RUNNER_DIR = path.join(ROOT, "runtime/stage9");

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed += 1; }
  catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); }
}
const count = (hay, needle) => hay.split(needle).length - 1;
const VERSION = (/^\/\/ @version\s+([0-9.]+)\s*$/m.exec(US) || [])[1];

// ---- T1 引擎开关（默认关：tesseract）----
t("T1 zyOcrEngine 默认 tesseract（ppocr 为显式开启的实验引擎）", () => {
  assert.ok(VERSION, "@version 未解析到");
  assert.ok(US.indexOf('GM_getValue("zyOcrEngine", "tesseract")') >= 0, "默认值必须为 tesseract");
  assert.ok(US.indexOf('GM_getValue("zyPpocrTier", "tiny")') >= 0, "档位默认 tiny（≈6.3MB，先打通链路）");
  assert.ok(US.indexOf('return GM_getValue("zyOcrEngine", "tesseract") === "ppocr" ? "ppocr" : "tesseract";') >= 0, "只认 ppocr 为开启，其余（含脏值）回落 tesseract");
});

// ---- T2 @require 齐备且与 @version 同版本 ----
t("T2 7 个 ppocr 运行时模块 + 桥模块均 @require 且 ?v= 与 @version 一致", () => {
  const need = [
    "db-det-postprocess.js", "det-params.js", "ppocr-image-ops.js", "ppocr-rec-decode.js",
    "ppocr-engine-loader.js", "ppocr-ort-session.js", "ppocr-provider.js", "ppocr-bridge.js"
  ];
  need.forEach((f) => {
    const re = new RegExp("/extension/src/ocr/" + f.replace(/\./g, "\\.") + "\\?v=" + VERSION.replace(/\./g, "\\.") + "\\b");
    assert.ok(re.test(US), "缺少或版本不符的 @require：" + f);
  });
});

// ---- T3 双引擎分派 + ppocr 失败必回退（本地为末端，绝不中断）----
t("T3 runLocalOcr / sidecar 均按引擎分派，且 ppocr 不可用 → 回退 Tesseract", () => {
  assert.strictEqual(count(US, 'if (getLocalOcrEngineKind() === "ppocr") {'), 2, "主链与 sidecar 各一处分派");
  assert.ok(US.indexOf("ppocr unavailable → tesseract（本地为末端，继续识别）") >= 0, "主链回退");
  assert.ok(US.indexOf("ppocr unavailable → tesseract sidecar") >= 0, "sidecar 回退");
  assert.ok(US.indexOf('{ engineFallback: "ppocr→tesseract" }') >= 0, "回退写入诊断（可复盘）");
  assert.ok(US.indexOf("const handed = await runLocalOcrPpocr(img, diag);") >= 0, "返回值即「是否已交接」");
});

// ---- T4 共用桥属性与下游（ppocr 不得另起一套结果管道）----
t("T4 桥属性与既有本地链一致，且两引擎共用同一解析/轮询", () => {
  assert.ok(US.indexOf('const PPOCR_MAIN_ATTR = "data-zy-ocr-result";') >= 0);
  assert.ok(US.indexOf('const PPOCR_SIDE_ATTR = "data-zy-sidecar-result";') >= 0);
  assert.ok(US.indexOf('const PPOCR_READY_ATTR = "data-zy-ppocr-ready";') >= 0, "幂等注入标记");
  assert.strictEqual(count(US, "function pollLocalOcrResult(img, diag, engineLabel) {"), 1, "轮询函数唯一");
  assert.strictEqual(count(US, 'pollLocalOcrResult(img, diag, "'), 2, "ppocr 与 tesseract 共用同一轮询（两处调用）");
  assert.ok(US.indexOf('pollLocalOcrResult(img, diag, "ppocr")') >= 0);
  assert.ok(US.indexOf('pollLocalOcrResult(img, diag, "tesseract")') >= 0);
  assert.ok(US.indexOf("const out = document.documentElement.getAttribute(PPOCR_MAIN_ATTR);") >= 0);
});
t("T5 下游单一：结果统一交 handleLocalOcrResult（质量门 → TextBlock → Native Truth）", () => {
  assert.strictEqual(count(US, "async function handleLocalOcrResult(rawOut, img, diag) {"), 1);
  assert.ok(US.indexOf("handleLocalOcrResult(out, img, diag)") >= 0);
  assert.ok(US.indexOf("const tb = await maybeApplyNativeTruth(blocks, img, diag);") >= 0, "Native Truth 仍是创建前必经门");
  assert.ok(US.indexOf("if (!nativeTruthGatePassed(tb)) {") >= 0);
});

// ---- T5 执行器由模块生成（不手写长字符串），且注入前做语法自检 ----
t("T6 页面世界执行器由 ppocr-bridge 生成 + new Function 语法自检（防脚本不执行死等）", () => {
  assert.ok(US.indexOf("buildPpocrExecutorSource({") >= 0, "必须调用桥模块生成");
  assert.ok(US.indexOf("new Function(driver);") >= 0, "注入前语法自检");
  assert.strictEqual(count(US, "var SESS=null;"), 0, "不得再有手写执行器残留");
  assert.ok(US.indexOf("if (typeof buildPpocrExecutorSource !== \"function\")") >= 0, "桥模块缺失要明确失败（不回退静默）");
  assert.ok(US.indexOf("if (typeof buildPpocrRequest !== \"function\") throw new Error(\"ppocr-bridge 未加载\");") >= 0);
  assert.strictEqual(count(US, "var T=module.exports;"), 2, "仅 Tesseract 主链 + sidecar 各一处手写执行器");
});

// ---- T6 资产完整性：清单 + SHA-256 + 缓存（无校验不加载）----
t("T7 模型资产走清单 + SHA-256 校验 + CacheStorage（不可用仅内存，不假装持久化）", () => {
  assert.ok(US.indexOf('assets/ocr/ppocrv6/ppocrv6-models.json') >= 0, "清单同源分发");
  assert.ok(US.indexOf("parseModelManifest(manifestRaw)") >= 0);
  assert.ok(US.indexOf("resolveModelPlan(parsed.manifest, { tier: tier, needCls: true })") >= 0, "cls 必需（方向）");
  assert.ok(US.indexOf("sha256: ppocrSha256") >= 0, "WebCrypto SHA-256 注入 loadModelAssets");
  assert.ok(US.indexOf("crypto.subtle.digest(\"SHA-256\", bytes)") >= 0);
  assert.ok(US.indexOf('caches.open("zy-ppocr-v1")') >= 0, "CacheStorage 缓存");
  assert.ok(US.indexOf("const ppocrMemCache = new Map();") >= 0, "会话内内存回落");
  assert.ok(US.indexOf("responseType: \"arraybuffer\"") >= 0, "GM_xmlhttpRequest 二进制（绕 CSP/同源限制）");
  assert.ok(US.indexOf("fetchBytes: gmFetchBytes") >= 0);
});

// ---- T7 版本五处统一 ----
t("T8 版本五处统一：@version / VERSION / 全部 @require?v= / page-bridge stamp×2 / runner BVER", () => {
  assert.ok(US.indexOf('const VERSION = "' + VERSION + '";') >= 0, "VERSION 常量未同步");
  const requires = US.match(/@require\s+\S+\?v=([0-9.]+)/g) || [];
  assert.ok(requires.length > 40, "@require 数量异常：" + requires.length);
  requires.forEach((r) => assert.ok(r.endsWith("?v=" + VERSION), "旧版 @require：" + r));
  assert.ok(BRIDGE.indexOf("window.__ZY_BRIDGE_VERSION__ = '" + VERSION + "';") >= 0, "page-bridge stamp 未同步");
  assert.ok(BRIDGE.indexOf("ver: '" + VERSION + "'") >= 0, "page-bridge marker ver 未同步");
  const runners = fs.readdirSync(LICENSE_RUNNER_DIR).filter((f) => /^commit-46.*\.js$/.test(f));
  assert.ok(runners.length >= 10, "runner 数量异常：" + runners.length);
  runners.forEach((f) => {
    const src = fs.readFileSync(path.join(LICENSE_RUNNER_DIR, f), "utf8");
    const m = /const BVER = "([0-9.]+)";/.exec(src);
    if (m) assert.strictEqual(m[1], VERSION, f + " BVER 未同步");
  });
});

console.log("m3c-wiring.test: pass=" + passed + " fail=" + failed + " (version=" + VERSION + ")");
process.exit(failed ? 1 : 0);
