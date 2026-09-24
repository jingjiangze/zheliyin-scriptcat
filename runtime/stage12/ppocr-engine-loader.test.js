// runtime/stage12/ppocr-engine-loader.test.js — Stage 12 M3-3：模型清单/加载/校验/缓存单测
"use strict";
const assert = require("assert");
const L = require("../../extension/src/ocr/ppocr-engine-loader.js");

let passed = 0, failed = 0;
const failures = [];
function t(name, fn) {
  return Promise.resolve().then(fn).then(
    () => { passed += 1; },
    (e) => { failed += 1; failures.push(name + " :: " + (e && e.message || e)); }
  );
}
function fakeSha(bytes) {
  let h = 5381;
  for (let i = 0; i < bytes.length; i += 1) h = ((h * 33) ^ bytes[i]) >>> 0;
  return h.toString(16).padStart(8, "0").repeat(8);
}
function makeBytes(seed, len) { const a = new Uint8Array(len); for (let i = 0; i < len; i += 1) a[i] = (seed + i * 7) & 0xff; return a; }
function makeCache() {
  const m = new Map();
  return {
    get: (k) => Promise.resolve(m.has(k) ? m.get(k) : null),
    put: (k, v) => { m.set(k, v); return Promise.resolve(); },
    size: () => m.size
  };
}
const tick = () => new Promise((res) => setTimeout(res, 0));
const utf8 = (s) => new TextEncoder().encode(s);

const DET = makeBytes(1, 64), REC = makeBytes(2, 96), DICT = utf8("测\n试\n"), CLS = makeBytes(4, 32);
const FETCH_MAP = { "https://cdn/det_tiny.onnx": DET, "https://cdn/rec_tiny.onnx": REC, "https://cdn/dict_tiny.txt": DICT, "https://cdn/cls.onnx": CLS };
const MANIFEST = {
  schemaVersion: 1, engine: "onnxruntime-web", ortVersion: "1.23.0",
  tiers: {
    tiny: {
      det: { id: "ppocrv6-det-tiny", url: "https://cdn/det_tiny.onnx", bytes: DET.length, sha256: fakeSha(DET) },
      rec: { id: "ppocrv6-rec-tiny", url: "https://cdn/rec_tiny.onnx", bytes: REC.length, sha256: fakeSha(REC), dictUrl: "https://cdn/dict_tiny.txt", dictBytes: DICT.length, dictSha256: fakeSha(DICT) }
    }
  },
  cls: { id: "ppocr-cls", url: "https://cdn/cls.onnx", bytes: CLS.length, sha256: fakeSha(CLS) }
};
const fetchOk = (url) => Promise.resolve(FETCH_MAP[url] || null);
const shaOk = (b) => Promise.resolve(fakeSha(b));
const RUN = [];

// ---- T1 清单解析 ----
RUN.push(t("T1 parseModelManifest：对象/JSON 字符串均可；缺 tiers / 坏 sha256 报错", () => {
  assert.strictEqual(L.parseModelManifest(JSON.stringify(MANIFEST)).ok, true);
  assert.strictEqual(L.parseModelManifest(MANIFEST).ok, true);
  const bad = L.parseModelManifest({ schemaVersion: 1 });
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.errorCode, "MANIFEST_INVALID");
  assert.ok(bad.errors.indexOf("TIERS_MISSING") >= 0);
  const badHash = L.parseModelManifest({ schemaVersion: 1, tiers: { tiny: { det: { id: "d", url: "u", sha256: "xy" }, rec: { id: "r", url: "u2" } } } });
  assert.ok(badHash.errors.some((x) => x.indexOf("SHA256_INVALID") >= 0), "errors=" + badHash.errors.join(","));
  assert.strictEqual(L.parseModelManifest("{bad json").errorCode, "MANIFEST_INVALID");
}));

// ---- T2 计划解析 ----
RUN.push(t("T2 resolveModelPlan：tier tiny → det/rec/dict；needCls 加 cls；缺档位 → MODEL_PLAN_INVALID", () => {
  const p = L.resolveModelPlan(MANIFEST, { tier: "tiny" });
  assert.strictEqual(p.ok, true);
  assert.deepStrictEqual(p.plan.entries.map((e) => e.role), ["det", "rec", "dict"]);
  assert.strictEqual(p.plan.entries[2].kind, "text");
  const p2 = L.resolveModelPlan(MANIFEST, { tier: "tiny", needCls: true });
  assert.deepStrictEqual(p2.plan.entries.map((e) => e.role), ["det", "rec", "cls", "dict"]);
  const p3 = L.resolveModelPlan(MANIFEST, { tier: "large" });
  assert.strictEqual(p3.ok, false);
  assert.strictEqual(p3.errorCode, "MODEL_PLAN_INVALID");
}));

// ---- T3 冷启动：下载 + 校验 + dict 解码 + 回写缓存 ----
RUN.push(t("T3 冷启动：2 binary + 1 dict 下载、SHA-256 校验、dict 解码、回写缓存", () => {
  const cache = makeCache();
  const fetched = [];
  return L.loadModelAssets({
    plan: L.resolveModelPlan(MANIFEST, { tier: "tiny" }).plan,
    fetchBytes: (url) => { fetched.push(url); return fetchOk(url); },
    sha256: shaOk, cache
  }).then((r) => {
    assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
    assert.strictEqual(fetched.length, 3);
    assert.strictEqual(r.meta.downloaded, 3);
    assert.deepStrictEqual(Array.from(r.assets.det), Array.from(DET));
    assert.strictEqual(r.assets.dict, "测\n试\n");
    return tick();
  }).then(() => { assert.strictEqual(cache.size(), 3, "缓存应写入 3 条"); });
}));

// ---- T4 热启动：全部命中缓存，零下载 ----
RUN.push(t("T4 热启动：缓存全命中 → downloaded=0 / cached=3，且不再发起下载", () => {
  const cache = makeCache();
  const plan = L.resolveModelPlan(MANIFEST, { tier: "tiny" }).plan;
  return L.loadModelAssets({ plan, fetchBytes: fetchOk, sha256: shaOk, cache })
    .then(() => L.loadModelAssets({ plan, fetchBytes: () => { throw new Error("不应发生下载"); }, sha256: shaOk, cache }))
    .then((r2) => {
      assert.strictEqual(r2.ok, true);
      assert.strictEqual(r2.meta.downloaded, 0);
      assert.strictEqual(r2.meta.cached, 3);
      assert.strictEqual(r2.assets.dict, "测\n试\n");
      assert.deepStrictEqual(Array.from(r2.assets.rec), Array.from(REC));
    });
}));

// ---- T5 哈希不匹配：拒绝且不写缓存 ----
RUN.push(t("T5 SHA-256 不匹配 → MODEL_HASH_MISMATCH，且不污染缓存", () => {
  const cache = makeCache();
  const bad = { schemaVersion: 1, tiers: { tiny: {
    det: { id: "d", url: "https://cdn/det_tiny.onnx", sha256: "0".repeat(64) },
    rec: { id: "r", url: "https://cdn/rec_tiny.onnx", sha256: fakeSha(REC) } } } };
  return L.loadModelAssets({ plan: L.resolveModelPlan(bad, { tier: "tiny" }).plan, fetchBytes: fetchOk, sha256: shaOk, cache })
    .then((r) => {
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.errorCode, "MODEL_HASH_MISMATCH");
      assert.strictEqual(r.errors[0].indexOf("det:"), 0, "errors=" + r.errors.join(","));
      return tick();
    })
    .then(() => { assert.strictEqual(cache.size(), 0, "校验失败不得写缓存"); });
}));

// ---- T6 下载失败 / 缓存脏数据回退重下 ----
RUN.push(t("T6 下载返回空 → MODEL_FETCH_FAILED；缓存脏数据（哈希不符）→ 回退重下成功", () => {
  const plan = L.resolveModelPlan(MANIFEST, { tier: "tiny" }).plan;
  return L.loadModelAssets({ plan, fetchBytes: () => Promise.resolve(null), sha256: shaOk })
    .then((r) => {
      assert.strictEqual(r.errorCode, "MODEL_FETCH_FAILED");
      const dirty = makeCache();
      dirty.put(plan.entries[0].cacheKey, makeBytes(9, 64));
      let refetched = 0;
      return L.loadModelAssets({
        plan, sha256: shaOk, cache: dirty,
        fetchBytes: (url) => { refetched += 1; return fetchOk(url); }
      }).then((r2) => {
        assert.strictEqual(r2.ok, true, JSON.stringify(r2.errors));
        assert.strictEqual(refetched, 3);
        assert.strictEqual(r2.meta.statuses[0].source, "download");
      });
    });
}));

// ---- T7 状态回调与空计划 ----
RUN.push(t("T7 onStatus 收到 loading/loaded；空计划 → MODEL_PLAN_INVALID", () => {
  const events = [];
  return L.loadModelAssets({ plan: { tier: "tiny", entries: [] }, fetchBytes: fetchOk, sha256: shaOk })
    .then((r) => {
      assert.strictEqual(r.errorCode, "MODEL_PLAN_INVALID");
      return L.loadModelAssets({ plan: L.resolveModelPlan(MANIFEST, { tier: "tiny" }).plan, fetchBytes: fetchOk, sha256: shaOk, onStatus: (stage, d) => events.push(stage + ":" + d.role) });
    })
    .then((r2) => {
      assert.strictEqual(r2.ok, true);
      assert.ok(events.indexOf("loading:det") >= 0 && events.indexOf("loaded:rec") >= 0, "events=" + events.join(","));
      assert.ok(r2.meta.statuses.every((s) => s.bytes > 0));
    });
}));

Promise.all(RUN).then(() => {
  failures.forEach((f) => console.error("FAIL:", f));
  console.log("ppocr-engine-loader.test: pass=" + passed + " fail=" + failed);
  process.exit(failed ? 1 : 0);
});