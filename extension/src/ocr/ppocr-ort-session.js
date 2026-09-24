// =====================================================================
// 折立印名片套版助手 - onnxruntime-web 会话适配（Stage 12 M3b-1：ORT session）
// ---------------------------------------------------------------------
// 职责（单一职责）：把 ORT 的 InferenceSession 包成 ppocr-provider 需要的 session 接口：
//   det.run({data,dims}) → {probMap: Float32Array, dims:{width,height}}
//   rec.run({data,dims}) → {data: Float32Array, timeSteps, classes}
//   cls.run({data,dims}) → {data: Float32Array(2)}
// 环境解耦：ort 由调用方注入（页面世界 window.ort / 沙箱 / node 单测 mock 皆可）；
//   本模块不做网络、不做缓存、不读 DOM —— 模型字节由 ppocr-engine-loader 提供。
// ORT 环境（可选，opts.ortEnv）：
//   { wasmPaths: string|{wasm,mjs}, numThreads: number, simd: boolean, proxy: boolean }
//   —— 离线场景可把 wasmPaths 指向由缓存字节创建的 blob URL。
// 失败不 throw：createOrtSessions 返回 {ok:false, errorCode, errors}；run 由 provider 统一 try/catch。
// 纯逻辑、自包含（无 require）；node 可单测（mock ort）。
// =====================================================================
"use strict";

function zyOrtNum(v) { return typeof v === "number" && isFinite(v); }

// ORT 环境设置（仅在提供时写入，避免覆盖调用方既有配置）
function applyOrtEnv(ort, ortEnv) {
  if (!ort || !ort.env || !ort.env.wasm || !ortEnv) return false;
  var applied = false;
  if (ortEnv.wasmPaths != null) { ort.env.wasm.wasmPaths = ortEnv.wasmPaths; applied = true; }
  if (zyOrtNum(ortEnv.numThreads)) { ort.env.wasm.numThreads = ortEnv.numThreads; applied = true; }
  if (typeof ortEnv.simd === "boolean") { ort.env.wasm.simd = ortEnv.simd; applied = true; }
  if (typeof ortEnv.proxy === "boolean") { ort.env.wasm.proxy = ortEnv.proxy; applied = true; }
  if (typeof ortEnv.logLevel === "string") { ort.env.logLevel = ortEnv.logLevel; applied = true; }
  return applied;
}

// 把 provider 的 {data,dims:{channels,width,height}} 变成 ORT Tensor（NCHW）
function toNchwTensor(ort, input) {
  var dims = (input && input.dims) || {};
  var c = zyOrtNum(dims.channels) ? dims.channels : 3;
  var w = dims.width, h = dims.height;
  if (!input || !input.data || !zyOrtNum(w) || !zyOrtNum(h)) throw new Error("ORT_TENSOR_INPUT_INVALID");
  if (typeof ort.Tensor !== "function") throw new Error("ORT_TENSOR_UNAVAILABLE");
  return new ort.Tensor("float32", input.data, [1, c, h, w]);
}

function firstOutput(session, results) {
  var names = (session && session.outputNames) || [];
  for (var i = 0; i < names.length; i += 1) {
    if (results[names[i]] != null) return results[names[i]];
  }
  var keys = results ? Object.keys(results) : [];
  return keys.length ? results[keys[0]] : null;
}

function asFloat32Array(x) {
  if (x instanceof Float32Array) return x;
  return Float32Array.from(x || []);
}

// 单会话包装：rerun 形状归一（det 1x1xHxW / rec 1xTxC / cls 1x2）
function wrapSession(ort, session, role) {
  var run = function (input) {
    var tensor = toNchwTensor(ort, input);
    var feeds = {};
    var inName = (session.inputNames && session.inputNames[0]) || "x";
    feeds[inName] = tensor;
    return Promise.resolve(session.run(feeds)).then(function (results) {
      var out = firstOutput(session, results);
      if (!out || !out.dims) throw new Error("ORT_OUTPUT_INVALID:" + role);
      var d = out.dims;
      if (role === "det") {
        var h = d.length === 4 ? d[2] : (d.length === 3 ? d[1] : 0);
        var w = d.length === 4 ? d[3] : (d.length === 3 ? d[2] : 0);
        return { probMap: asFloat32Array(out.data), dims: { width: w, height: h }, rawDims: Array.prototype.slice.call(d) };
      }
      if (role === "rec") {
        var t = d.length === 3 ? d[1] : (d.length === 2 ? d[0] : 0);
        var c = d.length === 3 ? d[2] : (d.length === 2 ? d[1] : 0);
        return { data: asFloat32Array(out.data), timeSteps: t, classes: c, rawDims: Array.prototype.slice.call(d) };
      }
      // cls：1x2 或 2
      return { data: asFloat32Array(out.data), rawDims: Array.prototype.slice.call(d) };
    });
  };
  return {
    role: role,
    inputNames: (session.inputNames || []).slice(),
    outputNames: (session.outputNames || []).slice(),
    run: run,
    release: function () { try { if (typeof session.release === "function") session.release(); } catch (e) { /* 释放失败不影响主链 */ } }
  };
}

// opts: {
//   ort,                              // 必需：onnxruntime-web 命名空间
//   assets: {det: Uint8Array, rec: Uint8Array, cls?: Uint8Array},   // 必需 det/rec
//   executionProviders: ["wasm"],     // 默认 wasm（WebGPU 需 ort 构建版支持，调用方可传）
//   sessionOptions: {...},            // 透传（graphOptimizationLevel 等）
//   ortEnv: {...},                    // 见 applyOrtEnv
//   onStatus: (stage, detail) => void
// }
function createOrtSessions(opts) {
  var o = opts || {};
  var t0 = Date.now();
  var ort = o.ort || (typeof globalThis !== "undefined" && globalThis.ort ? globalThis.ort : null);
  var onStatus = o.onStatus || function () {};
  var errors = [];
  if (!ort || typeof ort.InferenceSession !== "object" && typeof ort.InferenceSession !== "function") {
    return Promise.resolve({ ok: false, errorCode: "ORT_MISSING", errors: ["onnxruntime-web 未加载"], sessions: {}, meta: {} });
  }
  var assets = o.assets || {};
  var roles = ["det", "rec"].concat(assets.cls ? ["cls"] : []);
  for (var i = 0; i < roles.length; i += 1) {
    if (!assets[roles[i]] || !assets[roles[i]].length) errors.push("MODEL_BYTES_MISSING:" + roles[i]);
  }
  if (errors.length) return Promise.resolve({ ok: false, errorCode: "MODEL_BYTES_MISSING", errors: errors, sessions: {}, meta: {} });
  applyOrtEnv(ort, o.ortEnv);
  var providers = Array.isArray(o.executionProviders) && o.executionProviders.length ? o.executionProviders : ["wasm"];
  var sessionOptions = Object.assign({ graphOptimizationLevel: "all" }, o.sessionOptions || {}, { executionProviders: providers });
  var sessions = {};
  var meta = { ortVersion: (ort.env && ort.env.versions && ort.env.versions.common) || null, providers: providers, roles: [], elapsed: 0 };
  var chain = Promise.resolve();
  roles.forEach(function (role) {
    chain = chain.then(function () {
      onStatus("creating", { role: role, bytes: assets[role].length });
      return Promise.resolve()
        .then(function () { return ort.InferenceSession.create(assets[role], sessionOptions); })
        .then(function (session) {
          sessions[role] = wrapSession(ort, session, role);
          meta.roles.push({ role: role, inputNames: sessions[role].inputNames, outputNames: sessions[role].outputNames, bytes: assets[role].length });
          onStatus("ready", { role: role });
        })
        .catch(function (e) {
          errors.push("ORT_SESSION_CREATE_FAILED:" + role + ":" + String(e && (e.message || e) || e).slice(0, 160));
        });
    });
  });
  return chain.then(function () {
    meta.elapsed = Date.now() - t0;
    if (errors.length) return { ok: false, errorCode: "ORT_SESSION_CREATE_FAILED", errors: errors, sessions: sessions, meta: meta };
    return { ok: true, errorCode: null, errors: [], sessions: sessions, meta: meta };
  });
}

function disposeOrtSessions(sessions) {
  var s = sessions || {};
  Object.keys(s).forEach(function (k) { if (s[k] && typeof s[k].release === "function") s[k].release(); });
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  createOrtSessions: createOrtSessions,
  disposeOrtSessions: disposeOrtSessions,
  applyOrtEnv: applyOrtEnv,
  toNchwTensor: toNchwTensor,
  wrapSession: wrapSession
};