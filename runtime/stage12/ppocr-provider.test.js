// runtime/stage12/ppocr-provider.test.js — Stage 12 M3-4：provider 装配（假 session 端到端）
// 覆盖：完整编排（det→后处理→映射→rec→候选契约）、cls 180°、minRecScore 过滤、
//       参数注入 vs 派生、错误码路径（ENGINE_NOT_READY/CHARSET_MISSING/IMAGE_INVALID/DET_FAILED/PPOCR_THREW）。
"use strict";
const assert = require("assert");
const DET = require("../../extension/src/ocr/db-det-postprocess.js");
const PARAMS = require("../../extension/src/ocr/det-params.js");
const OPS = require("../../extension/src/ocr/ppocr-image-ops.js");
const REC = require("../../extension/src/ocr/ppocr-rec-decode.js");
const { createPaddleOcrProvider } = require("../../extension/src/ocr/ppocr-provider.js");

let passed = 0, failed = 0;
const failures = [];
function t(name, fn) {
  return Promise.resolve().then(fn).then(
    () => { passed += 1; },
    (e) => { failed += 1; failures.push(name + " :: " + (e && e.message || e)); }
  );
}
const near = (a, b, eps) => Math.abs(a - b) < (eps == null ? 1e-6 : eps);
const OPS_BUNDLE = {
  resolveDetParams: PARAMS.resolveDetParams,
  planDetResize: DET.planDetResize,
  dbDetPostprocess: DET.dbDetPostprocess,
  mapDetBoxesToImage: DET.mapDetBoxesToImage,
  buildDetTensor: OPS.buildDetTensor,
  buildRecTensor: OPS.buildRecTensor,
  buildClsTensor: OPS.buildClsTensor,
  rectFromPolygon: OPS.rectFromPolygon,
  ctcGreedyDecode: REC.ctcGreedyDecode,
  clsDecode: REC.clsDecode
};
const IMG_W = 120, IMG_H = 60;
const BAND = { x: 10, y: 20, width: 100, height: 20 };
const PARAMS_FIXED = { thresh: 0.3, boxThresh: 0.6, unclipRatio: 0, minSize: 3, maxCandidates: 100, limitSideLen: 320, limitType: "min", maxSideLimit: 4000 };
const CHARSET = ["blank", " ", "测", "试"];

function makeImage() {
  const data = new Uint8ClampedArray(IMG_W * IMG_H * 4);
  for (let y = 0; y < IMG_H; y += 1) {
    for (let x = 0; x < IMG_W; x += 1) {
      const i = (y * IMG_W + x) * 4;
      const inBand = x >= BAND.x && x < BAND.x + BAND.width && y >= BAND.y && y < BAND.y + BAND.height;
      const v = inBand ? 30 : 240;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return { data, width: IMG_W, height: IMG_H, channels: 4 };
}
// 假 det：按输入尺寸把「文字带」映射成概率图块（0.95，背景 0.02）
function makeFakeDet() {
  return {
    run(input) {
      const w = input.dims.width, h = input.dims.height;
      const sx = w / IMG_W, sy = h / IMG_H;
      const x0 = Math.round(BAND.x * sx), x1 = Math.round((BAND.x + BAND.width) * sx);
      const y0 = Math.round(BAND.y * sy), y1 = Math.round((BAND.y + BAND.height) * sy);
      const probMap = new Float32Array(w * h);
      probMap.fill(0.02);
      for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) probMap[y * w + x] = 0.95;
      return { probMap, dims: { width: w, height: h } };
    }
  };
}
// 假 rec：与输入无关的固定输出（charset 4 类 → "测试"，置信度 0.85）
const REC_PROBS = Float32Array.from([0.05, 0.05, 0.85, 0.05, 0.05, 0.05, 0.05, 0.85, 0.9, 0.03, 0.04, 0.03]);
const RUN = [];

// ---- T1 端到端：候选契约 + 坐标回到原图 + rec 张量形状 ----
RUN.push(t("T1 端到端：1 候选 text=测试 conf≈0.85、bbox≈文字带、coordinateSpace=image-pixel", () => {
  const recInputs = [];
  const provider = createPaddleOcrProvider({
    session: { det: makeFakeDet(), rec: { run: (input) => { recInputs.push(input); return { data: REC_PROBS, timeSteps: 3, classes: 4 }; } } },
    charset: CHARSET,
    tier: "tiny",
    params: PARAMS_FIXED,
    ops: OPS_BUNDLE
  });
  return provider.recognize(makeImage(), {}).then((r) => {
    assert.ok(!r.error, JSON.stringify(r.error));
    assert.strictEqual(r.providerType, "LOCAL");
    assert.strictEqual(r.candidates.length, 1, JSON.stringify(r.meta.rec));
    const c = r.candidates[0];
    assert.strictEqual(c.text, "测试");
    assert.ok(near(c.confidence, 0.85, 1e-6), "conf=" + c.confidence);
    assert.strictEqual(c.rotation, 0);
    assert.strictEqual(c.coordinateSpace, "image-pixel");
    assert.deepStrictEqual(c.imageSize, { width: IMG_W, height: IMG_H });
    assert.ok(near(c.bbox.x, 10, 1) && near(c.bbox.y, 20, 1), "bbox=" + JSON.stringify(c.bbox));
    assert.ok(near(c.bbox.width, 100, 2) && near(c.bbox.height, 20, 1.5), "bbox=" + JSON.stringify(c.bbox));
    assert.strictEqual(c.rawMeta.sourceProvider, "ppocrv6-tiny-det-rec");
    // rec 张量：3x48x240（48 高、按长宽比 5 展开）
    assert.strictEqual(recInputs.length, 1);
    assert.strictEqual(recInputs[0].dims.channels, 3);
    assert.strictEqual(recInputs[0].dims.height, 48);
    assert.ok(recInputs[0].dims.width > 230 && recInputs[0].dims.width < 250, "recW=" + recInputs[0].dims.width);
    // meta 诊断
    assert.strictEqual(r.meta.det.boxes, 1);
    assert.ok(near(r.meta.resize.scale, 320 / 60, 1e-3), "scale=" + r.meta.resize.scale);
    assert.strictEqual(r.meta.channelOrder, "bgr");
  });
}));

// ---- T2 cls 180° → rotation 标注 + 翻转裁切 ----
RUN.push(t("T2 cls 判定 180° → candidate.rotation=180；翻转裁切 ≈ 正常裁切旋转 180°（强断言）", () => {
  const recInputs = [];
  const provider = createPaddleOcrProvider({
    session: {
      det: makeFakeDet(),
      rec: { run: (input) => { recInputs.push(input); return { data: REC_PROBS, timeSteps: 3, classes: 4 }; } },
      cls: { run: () => ({ data: Float32Array.from([0.2, 0.8]) }) }
    },
    charset: CHARSET, tier: "tiny", params: PARAMS_FIXED, ops: OPS_BUNDLE
  });
  return provider.recognize(makeImage(), {}).then((r) => {
    assert.strictEqual(r.candidates.length, 1);
    assert.strictEqual(r.candidates[0].rotation, 180);
    assert.strictEqual(recInputs.length, 1);
    // 用同一候选框几何复算「翻转裁切」与「正常裁切」，验证 flip 已生效且取值与翻转裁切一致
    const boxRect = OPS.rectFromPolygon(r.candidates[0].rawMeta.polygon);
    const flipped = OPS.buildRecTensor(makeImage(), boxRect, { flip180: true, channelOrder: "bgr" });
    const normal = OPS.buildRecTensor(makeImage(), boxRect, { channelOrder: "bgr" });
    const got = recInputs[0].data;
    assert.strictEqual(got.length, flipped.data.length);
    for (let i = 0; i < got.length; i += 1) {
      assert.ok(Math.abs(got[i] - flipped.data[i]) < 1e-9, "flip 裁切与期望不一致 at " + i + " got=" + got[i] + " exp=" + flipped.data[i]);
    }
    assert.ok(Math.abs(flipped.data[0] - normal.data[0]) > 0.1, "翻转与正常裁切应有显著差异");
  });
}));

// ---- T3 minRecScore 过滤 ----
RUN.push(t("T3 minRecScore=0.9 → 候选被过滤（skipped=low-score）", () => {
  const provider = createPaddleOcrProvider({
    session: { det: makeFakeDet(), rec: () => ({ data: REC_PROBS, timeSteps: 3, classes: 4 }) },
    charset: CHARSET, tier: "tiny", params: PARAMS_FIXED, ops: OPS_BUNDLE, minRecScore: 0.9
  });
  // 注意：session.rec 需为对象（{run}）；上面传函数仅为反例，这里改回正确形状
  const p2 = createPaddleOcrProvider({
    session: { det: makeFakeDet(), rec: { run: () => ({ data: REC_PROBS, timeSteps: 3, classes: 4 }) } },
    charset: CHARSET, tier: "tiny", params: PARAMS_FIXED, ops: OPS_BUNDLE, minRecScore: 0.9
  });
  return provider.recognize(makeImage(), {}).then((bad) => {
    assert.strictEqual(bad.error.errorCode, "ENGINE_NOT_READY"); // session.rec 非对象 → 前置校验拦截
    return p2.recognize(makeImage(), {});
  }).then((r) => {
    assert.strictEqual(r.candidates.length, 0);
    assert.strictEqual(r.meta.rec.skipped[0].reason, "low-score");
    assert.ok(near(r.meta.rec.skipped[0].confidence, 0.85, 1e-6));
  });
}));

// ---- T4 参数派生路径（不注入 params → 走 resolveDetParams） ----
RUN.push(t("T4 未注入 params → 走 resolveDetParams（含小字提示 reason）并完成识别", () => {
  const provider = createPaddleOcrProvider({
    session: { det: makeFakeDet(), rec: { run: () => ({ data: REC_PROBS, timeSteps: 3, classes: 4 }) } },
    charset: CHARSET, tier: "tiny", ops: OPS_BUNDLE
  });
  return provider.recognize(makeImage(), { expectedTextHeight: 12, scenario: "card" }).then((r) => {
    assert.strictEqual(r.candidates.length, 1, JSON.stringify(r.meta.det));
    assert.ok(r.meta.paramsReasons.some((x) => x.rule === "small-text-unclip"), "reasons=" + JSON.stringify(r.meta.paramsReasons));
    assert.strictEqual(r.meta.params.boxThresh, 0.5); // tiny 基线 0.55 − 0.05（小字）
  });
}));

// ---- T5 错误码路径（不 throw） ----
RUN.push(t("T5 错误路径：无 session→ENGINE_NOT_READY；无 charset→CHARSET_MISSING；无图→IMAGE_INVALID；det 抛错→PPOCR_THREW", () => {
  const mk = (o) => createPaddleOcrProvider(Object.assign({ ops: OPS_BUNDLE, params: PARAMS_FIXED, tier: "tiny", charset: CHARSET }, o));
  return Promise.resolve()
    .then(() => mk({ session: null }).recognize(makeImage(), {}))
    .then((r) => {
      assert.strictEqual(r.error.errorCode, "ENGINE_NOT_READY");
      return mk({ session: { det: makeFakeDet(), rec: { run: () => null } }, charset: [] }).recognize(makeImage(), {});
    })
    .then((r) => {
      assert.strictEqual(r.error.errorCode, "CHARSET_MISSING");
      return mk({ session: { det: makeFakeDet(), rec: { run: () => null } } }).recognize(null, {});
    })
    .then((r) => {
      assert.strictEqual(r.error.errorCode, "IMAGE_INVALID");
      return mk({ session: { det: { run: () => null }, rec: { run: () => null } } }).recognize(makeImage(), {});
    })
    .then((r) => {
      assert.strictEqual(r.error.errorCode, "DET_FAILED");
      return mk({ session: { det: { run: () => { throw new Error("ort boom"); } }, rec: { run: () => null } } }).recognize(makeImage(), {});
    })
    .then((r) => {
      assert.strictEqual(r.error.errorCode, "PPOCR_THREW");
      assert.ok(r.error.errorMessage.indexOf("ort boom") >= 0, r.error.errorMessage);
    });
}));

// ---- T6 异步 session（真实 ORT 形状：run 返回 Promise）回归护栏 ----
RUN.push(t("T6 异步 session（run 返回 Promise）→ 与同步等价（真机 bug 回归护栏）", () => {
  const asyncDet = { run: (input) => Promise.resolve(makeFakeDet().run(input)) };
  const asyncRec = { run: () => Promise.resolve({ data: REC_PROBS, timeSteps: 3, classes: 4 }) };
  const asyncCls = { run: () => Promise.resolve({ data: Float32Array.from([0.9, 0.1]) }) };
  const provider = createPaddleOcrProvider({
    session: { det: asyncDet, rec: asyncRec, cls: asyncCls },
    charset: CHARSET, tier: "tiny", params: PARAMS_FIXED, ops: OPS_BUNDLE
  });
  return provider.recognize(makeImage(), {}).then((r) => {
    assert.ok(!r.error, JSON.stringify(r.error));
    assert.strictEqual(r.candidates.length, 1);
    assert.strictEqual(r.candidates[0].text, "测试");
    assert.strictEqual(r.candidates[0].rotation, 0);
    assert.ok(near(r.candidates[0].confidence, 0.85, 1e-6));
  });
}));

Promise.all(RUN).then(() => {
  failures.forEach((f) => console.error("FAIL:", f));
  console.log("ppocr-provider.test: pass=" + passed + " fail=" + failed);
  process.exit(failed ? 1 : 0);
});