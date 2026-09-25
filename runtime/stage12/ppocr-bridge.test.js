// runtime/stage12/ppocr-bridge.test.js — Stage 12 M3c：页面世界桥契约（请求/校验/执行器源码/结果归一）
// 目的：把「执行器是字符串代码」这件事纳入离线护栏 —— 语法必须可解析、字段必须与沙箱同源、
//       桥属性必须与既有本地桥一致（同一 data-zy-ocr-result 才能共用下游）。
"use strict";
const assert = require("assert");
const B = require("../../extension/src/ocr/ppocr-bridge.js");

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed += 1; }
  catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); }
}
const u8 = (n) => new Uint8Array(n);

// ---- T1 请求构造：字段/桥目标/字节 ----
t("T1 buildPpocrRequest：默认 target=main、source 常量、assets → ArrayBuffer、cls 缺省 null", () => {
  const req = B.buildPpocrRequest({ dataUrl: "data:image/png;base64,AAAA", dict: "a\nb", tier: "tiny", ortDist: "https://x/dist/", assets: { det: u8(4), rec: u8(4), cls: null } });
  assert.strictEqual(req.source, "zy-ppocr-req");
  assert.strictEqual(req.target, "main");
  assert.strictEqual(req.tier, "tiny");
  assert.ok(req.det instanceof ArrayBuffer);
  assert.strictEqual(req.det.byteLength, 4);
  assert.strictEqual(req.cls, null);
});
t("T2 buildPpocrRequest：target=sidecar 透传；非法 target 回落 main", () => {
  assert.strictEqual(B.buildPpocrRequest({ target: "sidecar" }).target, "sidecar");
  assert.strictEqual(B.buildPpocrRequest({ target: "nope" }).target, "main");
});

// ---- T2 请求解析（与构造同源字段表）----
t("T3 parsePpocrRequest：构造 → 解析 往返一致（含 sidecar）", () => {
  const req = B.buildPpocrRequest({ target: "sidecar", dataUrl: "d", dict: "x", tier: "small", ortDist: "u", assets: { det: u8(2), rec: u8(2), cls: u8(2) } });
  const p = B.parsePpocrRequest(req);
  assert.strictEqual(p.ok, true);
  assert.strictEqual(p.target, "sidecar");
  assert.strictEqual(p.tier, "small");
  assert.strictEqual(p.det.byteLength, 2);
  assert.strictEqual(p.cls.byteLength, 2);
});
t("T4 parsePpocrRequest：来源/必填/载荷 校验（不静默通过）", () => {
  assert.strictEqual(B.parsePpocrRequest({ source: "other" }).ok, false);
  assert.strictEqual(B.parsePpocrRequest({ source: B.PPOCR_REQUEST_SOURCE }).code, "REQUEST_MISSING_DATAURL");
  const base = { source: B.PPOCR_REQUEST_SOURCE, dataUrl: "d", dict: "x", tier: "tiny", ortDist: "u" };
  assert.strictEqual(B.parsePpocrRequest(base).code, "REQUEST_MISSING_DET");
  assert.strictEqual(B.parsePpocrRequest(Object.assign({}, base, { det: u8(1), rec: u8(1) })).ok, true);
  assert.strictEqual(B.parsePpocrRequest(Object.assign({}, base, { dataUrl: "", det: u8(1), rec: u8(1) })).code, "REQUEST_EMPTY_PAYLOAD");
});

// ---- T3 结果归一（沙箱侧）----
t("T5 parsePpocrResult：成功 → lines 归一 + 尺寸/耗时；脏行剔除", () => {
  const raw = JSON.stringify({
    ok: true, engine: "ppocr", w: 700, h: 300, boxes: 4, ms: 812,
    lines: [
      { text: "佛山盛盈包装制品有限公司", bbox: { x: 40, y: 55, width: 420, height: 32 }, confidence: 0.98, rotation: 0 },
      { text: "", bbox: { x: 1, y: 1, width: 2, height: 2 } },
      { bbox: { x: 1, y: 1, width: 2, height: 2 } }
    ]
  });
  const r = B.parsePpocrResult(raw);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.lines.length, 1);
  assert.strictEqual(r.lines[0].text, "佛山盛盈包装制品有限公司");
  assert.strictEqual(r.lines[0].confidence, 0.98);
  assert.strictEqual(r.width, 700);
  assert.strictEqual(r.elapsed, 812);
});
t("T6 parsePpocrResult：失败/非法 → ok=false（含 code/message，供回退决策）", () => {
  const f = B.parsePpocrResult(JSON.stringify({ ok: false, code: "engine", message: "sessions:ORT_SESSION_CREATE_FAILED" }));
  assert.strictEqual(f.ok, false);
  assert.strictEqual(f.code, "engine");
  assert.ok(f.message.indexOf("ORT_SESSION") >= 0);
  assert.strictEqual(B.parsePpocrResult("not-json").code, "RESULT_NOT_JSON");
  assert.strictEqual(B.parsePpocrResult(null).code, "RESULT_INVALID");
});

// ---- T4 执行器源码（页面世界）----
const ORT_STUB = "var ortStub={};";
const MODS_STUB = "function createOrtSessions(){}function createPaddleOcrProvider(){}function buildRecCharset(){}";
function build(extra) {
  return B.buildPpocrExecutorSource(Object.assign({ ortText: ORT_STUB, modulesText: MODS_STUB }, extra || {}));
}
t("T7 buildPpocrExecutorSource：输入缺失抛错；正常生成且语法可解析（new Function）", () => {
  assert.throws(() => B.buildPpocrExecutorSource({}), /PPOCR_EXECUTOR_INPUT_INVALID/);
  const src = build();
  // eslint-disable-next-line no-new-func
  new Function(src); // 括号/引号不平衡会在此抛错（历史上曾因不平衡导致脚本不执行 → 死等超时）
  assert.ok(src.indexOf("(function(){") === 0);
});
t("T8 执行器内联要素：ORT 捕获 + 模块注入 + 会话单次创建（单线程/无 worker）", () => {
  const src = build();
  assert.ok(src.indexOf("ZY_ORT=(module.exports&&module.exports.InferenceSession)") >= 0, "ORT 命名空间捕获");
  assert.ok(src.indexOf("module={exports:{}};exports=module.exports;") >= 0, "模块前重置 exports");
  assert.ok(src.indexOf("createOrtSessions({ort:ZY_ORT") >= 0);
  assert.ok(src.indexOf("numThreads:1") >= 0, "单线程（避免 worker CSP 限制）");
  assert.ok(src.indexOf("proxy:false") >= 0, "不建 worker");
  assert.ok(src.indexOf("ZY_SESS?Promise.resolve(ZY_SESS)") >= 0, "会话同页复用（不重复 create）");
  assert.ok(src.indexOf("wasmPaths:d.ortDist") >= 0);
});
t("T9 执行器识别契约：useSpaceChar=false + bgr + scenario=card + cls 旋转透传", () => {
  const src = build();
  assert.ok(src.indexOf("buildRecCharset(d.dict,{useSpaceChar:false})") >= 0, "PP-OCRv6 字典第617行含全角空格 → 必须 false");
  assert.ok(src.indexOf("channelOrder:'bgr'") >= 0);
  assert.ok(src.indexOf("{scenario:'card'}") >= 0);
  assert.ok(src.indexOf("rotation:c.rotation") >= 0, "cls 方向透传（既有链 P0-4 缺失项）");
});
t("T10 桥属性：与既有本地桥一致（data-zy-ocr-result / data-zy-sidecar-result）+ ready 标记", () => {
  const src = build();
  assert.strictEqual(B.PPOCR_DEFAULT_ATTRS.mainAttr, "data-zy-ocr-result");
  assert.strictEqual(B.PPOCR_DEFAULT_ATTRS.sideAttr, "data-zy-sidecar-result");
  assert.ok(src.indexOf("data-zy-ocr-result") >= 0);
  assert.ok(src.indexOf("data-zy-sidecar-result") >= 0);
  assert.ok(src.indexOf("d.target==='sidecar'") >= 0, "按 target 分桥");
  assert.ok(src.indexOf("setAttribute(\"data-zy-ppocr-ready\",'1')") >= 0, "ready 标记（幂等注入依据）");
});
t("T11 执行器：自定义属性名生效（调用方传参不被忽略）", () => {
  const src = build({ mainAttr: "data-a", sideAttr: "data-b", readyAttr: "data-c", requestSource: "src-x" });
  assert.ok(src.indexOf("data-a") >= 0 && src.indexOf("data-b") >= 0 && src.indexOf("data-c") >= 0);
  assert.ok(src.indexOf("src-x") >= 0);
  assert.ok(src.indexOf("data-zy-ocr-result") < 0, "自定义后不得再残留默认桥名");
});
t("T12 执行器：请求校验覆盖全部必填键（与 PPOCR_REQUEST_KEYS 同源）", () => {
  const src = build();
  const required = B.PPOCR_REQUEST_KEYS.filter((k) => k !== "cls");
  required.forEach((k) => {
    assert.ok(src.indexOf('"' + k + '"') >= 0, "必填键未进校验：" + k);
  });
  assert.ok(src.indexOf("request-missing:") >= 0);
  assert.ok(src.indexOf("modules-missing") >= 0, "模块缺失需明确失败（不静默）");
});
t("T13 执行器：失败结果带 code/message/err（兼容既有本地失败分支读 r.err）", () => {
  const src = build();
  assert.ok(src.indexOf("err:String(c)+': '") >= 0);
  assert.ok(src.indexOf("ok:true,engine:'ppocr'") >= 0);
});

t("T14 执行器：provider 依赖经 ops 显式注入（IIFE 内函数声明对 globalThis 不可见）", () => {
  const src = build();
  assert.strictEqual(B.PPOCR_DEP_NAMES.length, 10, "与 ppocr-provider.ppocrResolveDeps 的 10 个 pick 键同源");
  B.PPOCR_DEP_NAMES.forEach((n) => {
    assert.ok(src.indexOf("ZY_OPS." + n + "=(typeof " + n + "==='function')?" + n + ":null;") >= 0, "依赖未注入：" + n);
  });
  assert.ok(src.indexOf("ops:ZY_OPS") >= 0, "provider 必须拿到注入 ops（M3c 实测：空 ops → 页面世界 DEPS_MISSING）");
  assert.ok(src.indexOf("ops:{}") < 0, "不得残留空 ops");
  assert.ok(B.buildOpsSource().indexOf("eval") < 0, "无 eval（CSP 安全）");
});

console.log("ppocr-bridge.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);
