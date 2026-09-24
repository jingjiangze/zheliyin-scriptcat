// =====================================================================
// 折立印名片套版助手 - PP-OCRv6 Provider（Stage 12 M3-4：provider 装配）
// ---------------------------------------------------------------------
// 职责（单一职责）：把「检测 → 方向 → 识别」编排成一个符合本项目既有契约的 Provider：
//   recognize(image, ctx) → Promise<{provider, providerType:"LOCAL", candidates[], meta}>
//   candidates: [{id, text, bbox{x,y,width,height}, confidence, rotation, coordinateSpace:"image-pixel",
//                 imageSize, rawMeta:{detScore, angle, polygon, recMinProb}}]
//   —— 与 extension/src/ocr/ocr-provider.js 的候选形状一致（下游 unify/mapper/质量门零改动）。
//
// 编排（参数来自 det-params.resolveDetParams，模型/张量运算全部走注入或沙箱内同名函数）：
//   1. resolveDetParams（tier + 场景 + 小字提示）→ 2. planDetResize → 3. buildDetTensor
//   4. session.det.run → 5. dbDetPostprocess → 6. mapDetBoxesToImage（→ 原图像素）
//   7. 逐框：cls（0/180°）→ 旋转感知裁切 → session.rec.run → ctcGreedyDecode → 候选
//
// session 接口（M4 由 onnxruntime-web 适配器实现；本模块只依赖此接口，便于离线单测）：
//   det: { run(input:{data:Float32Array,dims}) → {probMap:Float32Array, dims:{width,height}} }
//   rec: { run(input) → {data, timeSteps, classes, applySoftmax?} }
//   cls: { run(input) → {data:Float32Array(2)} }（可选）
//
// 边界与纪律（与 layout-provider Rule 2 一致）：
//   - 本 Provider 提供 text + 几何；**最终文字真值仍由 Native OCR 决定**（接入主链时按既有 gate 走）；
//   - 不 throw：任何失败返回 {error:{errorCode, errorMessage}, candidates:[]}（与 createTesseractProvider 同风格）；
//   - 不做网络/不做缓存/不读 DOM —— 模型字节由 ppocr-engine-loader 负责，本模块只消费 session。
// 纯逻辑、自包含（无 require）；node 可单测（注入 ops + 假 session）。
// =====================================================================
"use strict";

function zyPpIsNum(v) { return typeof v === "number" && isFinite(v); }

// 依赖解析：优先注入（node 单测），否则取沙箱内同名全局（@require 同 scope）
function ppocrResolveDeps(injected) {
  var o = injected || {};
  var pick = function (key, globalName) {
    if (o[key] && typeof o[key] === "function") return o[key];
    // eslint-disable-next-line no-eval
    if (typeof globalThis !== "undefined" && typeof globalThis[globalName] === "function") return globalThis[globalName];
    return null;
  };
  return {
    resolveDetParams: pick("resolveDetParams", "resolveDetParams"),
    planDetResize: pick("planDetResize", "planDetResize"),
    dbDetPostprocess: pick("dbDetPostprocess", "dbDetPostprocess"),
    mapDetBoxesToImage: pick("mapDetBoxesToImage", "mapDetBoxesToImage"),
    buildDetTensor: pick("buildDetTensor", "buildDetTensor"),
    buildRecTensor: pick("buildRecTensor", "buildRecTensor"),
    buildClsTensor: pick("buildClsTensor", "buildClsTensor"),
    rectFromPolygon: pick("rectFromPolygon", "rectFromPolygon"),
    ctcGreedyDecode: pick("ctcGreedyDecode", "ctcGreedyDecode"),
    clsDecode: pick("clsDecode", "clsDecode")
  };
}

function ppocrError(code, message, extra) {
  return {
    provider: (extra && extra.provider) || "ppocrv6",
    providerType: "LOCAL",
    candidates: [],
    error: { errorCode: code, errorMessage: message || code },
    meta: extra && extra.meta ? extra.meta : {}
  };
}

// opts: {
//   session: {det, rec, cls?},          // 必需（det/rec）
//   charset: string[],                  // 必需（buildRecCharset().charset）
//   tier: "tiny"|"small"|"medium",      // 默认 small
//   params: object|null,                // det 参数（缺省由 resolveDetParams 派生）
//   ops: object|null,                   // 注入依赖（node 单测）
//   minRecScore: number,                // rec 置信度下限（默认 0 = 不过滤）
//   applySoftmax: boolean,              // rec 输出是 logits 时置 true
//   channelOrder: "bgr"|"rgb",          // 默认 bgr（PaddleOCR 惯例）
//   onStatus: (stage, detail) => void
// }
function createPaddleOcrProvider(opts) {
  var o = opts || {};
  var deps = ppocrResolveDeps(o.ops);
  var tier = o.tier || "small";
  var charset = Array.isArray(o.charset) ? o.charset : null;
  var minRecScore = zyPpIsNum(o.minRecScore) ? o.minRecScore : 0;
  var providerName = "ppocrv6-" + tier + "-det-rec";
  return {
    provider: providerName,
    providerType: "LOCAL",
    engine: "onnxruntime-web",
    recognize: function (image, ctx) {
      var c = ctx || {};
      var t0 = Date.now();
      return Promise.resolve().then(function () {
        // ---- 前置校验 ----
        var sess = o.session || (c.session || null);
        if (!sess || !sess.det || typeof sess.det.run !== "function" || !sess.rec || typeof sess.rec.run !== "function") {
          return ppocrError("ENGINE_NOT_READY", "session.det/session.rec 缺失（模型未加载）", { provider: providerName });
        }
        if (!charset || !charset.length) return ppocrError("CHARSET_MISSING", "rec charset 缺失（字典未加载/未组装）", { provider: providerName });
        if (!image || !image.data || !image.width || !image.height) return ppocrError("IMAGE_INVALID", "图片像素数据缺失（需要 {data,width,height}）", { provider: providerName });
        var need = ["resolveDetParams", "planDetResize", "dbDetPostprocess", "mapDetBoxesToImage", "buildDetTensor", "buildRecTensor", "rectFromPolygon", "ctcGreedyDecode"];
        for (var i = 0; i < need.length; i += 1) {
          if (typeof deps[need[i]] !== "function") return ppocrError("DEPS_MISSING", "缺少依赖函数 " + need[i], { provider: providerName });
        }
        var imageSize = { width: image.width, height: image.height };
        // ---- 1. det 参数 ----
        var params = o.params || c.params || null;
        var tuned = null;
        if (!params) {
          tuned = deps.resolveDetParams({
            tier: c.tier || tier,
            scenario: c.scenario || "card",
            imageWidth: imageSize.width,
            imageHeight: imageSize.height,
            expectedTextHeight: c.expectedTextHeight,
            lowContrast: c.lowContrast,
            qrNoise: c.qrNoise,
            override: c.detOverride
          });
          params = tuned.params;
        }
        // ---- 2/3/4. 预处理 → det 推理 ----
        var resize = deps.planDetResize(imageSize.width, imageSize.height, params);
        if (!resize.ok) return ppocrError("IMAGE_INVALID", "planDetResize 失败: " + resize.errorCode, { provider: providerName });
        var detTensor = deps.buildDetTensor(image, resize, { channelOrder: o.channelOrder });
        if (!detTensor.ok) return ppocrError("IMAGE_INVALID", "buildDetTensor 失败: " + detTensor.errorCode, { provider: providerName });
        var detOut = sess.det.run(detTensor);
        if (!detOut || !detOut.probMap || !detOut.dims) return ppocrError("DET_FAILED", "det 输出为空（probMap/dims 缺失）", { provider: providerName });
        // ---- 5/6. 后处理 → 原图像素坐标 ----
        var detRes = deps.dbDetPostprocess(detOut.probMap, detOut.dims, params);
        if (!detRes.ok) return ppocrError("DET_FAILED", "det 后处理失败: " + detRes.errorCode, { provider: providerName });
        // det 实际输出尺寸可能与规划不同（动态 shape）→ 以实际输出为准计算反变换比例
        var effResize = detOut.dims.width === resize.width ? resize : { scale: imageSize.width / detOut.dims.width, width: detOut.dims.width, height: detOut.dims.height };
        var mapped = deps.mapDetBoxesToImage(detRes.boxes, effResize, imageSize);
        // ---- 7. 逐框：cls → 裁切 → rec → 解码 ----
        var candidates = [];
        var skipped = [];
        for (var k = 0; k < mapped.length; k += 1) {
          var box = mapped[k];
          var rect = deps.rectFromPolygon(box.polygon);
          if (!rect) { skipped.push({ order: box.order, reason: "no-rect" }); continue; }
          var rotation = 0;
          if (sess.cls && typeof sess.cls.run === "function" && typeof deps.buildClsTensor === "function" && typeof deps.clsDecode === "function") {
            var clsTensor = deps.buildClsTensor(image, rect, { channelOrder: o.channelOrder });
            if (clsTensor.ok) {
              var clsOut = sess.cls.run(clsTensor);
              var cls = deps.clsDecode(clsOut);
              if (cls.ok) rotation = cls.rotation;
            }
          }
          var recTensor = deps.buildRecTensor(image, rect, { flip180: rotation === 180, channelOrder: o.channelOrder });
          if (!recTensor.ok) { skipped.push({ order: box.order, reason: "crop-failed:" + recTensor.errorCode }); continue; }
          var recOut = sess.rec.run(recTensor);
          if (!recOut) { skipped.push({ order: box.order, reason: "rec-empty" }); continue; }
          var decoded = deps.ctcGreedyDecode(recOut, { charset: charset, applySoftmax: !!(recOut.applySoftmax || o.applySoftmax) });
          if (!decoded.ok) { skipped.push({ order: box.order, reason: "decode-failed:" + decoded.errorCode }); continue; }
          if (!decoded.text) { skipped.push({ order: box.order, reason: "empty-text", confidence: decoded.confidence }); continue; }
          if (decoded.confidence < minRecScore) { skipped.push({ order: box.order, reason: "low-score", confidence: decoded.confidence }); continue; }
          candidates.push({
            id: providerName + "-" + box.order,
            text: decoded.text,
            bbox: box.bbox,
            confidence: decoded.confidence,
            rotation: rotation,
            coordinateSpace: "image-pixel",
            imageSize: imageSize,
            rawMeta: {
              sourceProvider: providerName,
              detScore: box.score,
              angle: box.angle,
              polygon: box.polygon,
              recMinProb: decoded.minCharProb
            }
          });
        }
        return {
          provider: providerName,
          providerType: "LOCAL",
          engine: "onnxruntime-web",
          candidates: candidates,
          meta: {
            tier: c.tier || tier,
            imageWidth: imageSize.width,
            imageHeight: imageSize.height,
            params: params,
            paramsReasons: tuned ? tuned.reasons : [],
            resize: { scale: effResize.scale, width: effResize.width, height: effResize.height },
            det: { boxes: detRes.boxes.length, components: detRes.meta.components, dropped: detRes.dropped.length, droppedReasons: detRes.dropped.map(function (d) { return d.reason; }) },
            rec: { count: candidates.length, skipped: skipped },
            channelOrder: detTensor.normalization ? detTensor.normalization.channelOrder : null,
            elapsed: Date.now() - t0
          }
        };
      }).catch(function (e) {
        return ppocrError("PPOCR_THREW", String(e && (e.message || e) || e).slice(0, 200), { provider: providerName, meta: { elapsed: Date.now() - t0 } });
      });
    }
  };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  createPaddleOcrProvider: createPaddleOcrProvider,
  ppocrResolveDeps: ppocrResolveDeps
};