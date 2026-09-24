// =====================================================================
// 折立印名片套版助手 - PP-OCR 模型清单与加载（Stage 12 M3-3：engine loader）
// ---------------------------------------------------------------------
// 职责（单一职责）：把「模型清单」变成「可用于 ORT 的字节」，含缓存与完整性校验：
//   1. parseModelManifest(raw)   清单解析 + Schema 校验（对象或 JSON 字符串）
//   2. resolveModelPlan(...)     按档位/需求解析出待加载条目（det/rec/cls/dict）
//   3. loadModelAssets(...)      逐条目：缓存命中 → SHA-256 校验 → 下载 → 校验 → 回写缓存
// 环境解耦（依赖全部注入，本模块自身无网络/无正则表达式解析/无 DOM）：
//   fetchBytes(url) → Promise<Uint8Array|null>   （浏览器侧：GM_xmlhttpRequest responseType=arraybuffer）
//   sha256(bytes)   → Promise<string hex>        （浏览器侧：crypto.subtle.digest；node：createHash）
//   cache           → { get(key)→Promise<Uint8Array|null>, put(key, bytes)→Promise }（CacheStorage/IndexedDB 适配器）
//   decodeText(bytes) → string                   （默认 TextDecoder("utf-8")）
// 清单 Schema（与 runtime 生成脚本一致；sha256 由真实下载字节计算，禁止手填）：
//   {
//     "schemaVersion": 1, "engine": "onnxruntime-web", "ortVersion": "1.23.0",
//     "tiers": { "tiny": { "det": {id,url,bytes,sha256}, "rec": {id,url,bytes,sha256,dictUrl,dictSha256} }, "small": {...} },
//     "cls": {id,url,bytes,sha256}
//   }
// 错误码：MANIFEST_INVALID / MODEL_PLAN_INVALID / MODEL_FETCH_FAILED / MODEL_HASH_MISMATCH
// 纯逻辑、自包含（无 require）；node 可单测（mock fetch/sha256/cache）。
// =====================================================================
"use strict";

var PPOCR_MANIFEST_SCHEMA_VERSION = 1;
var PPOCR_ROLE_ORDER = ["det", "rec", "cls", "dict"];

function zyLoadIsNum(v) { return typeof v === "number" && isFinite(v); }

// ---- 1. 清单解析与校验 ----
function parseModelManifest(raw) {
  var errors = [];
  var m = raw;
  if (typeof raw === "string") {
    try { m = JSON.parse(raw); } catch (e) { return { ok: false, errorCode: "MANIFEST_INVALID", errors: ["JSON_PARSE_FAILED: " + String(e && e.message || e).slice(0, 120)], manifest: null }; }
  }
  if (!m || typeof m !== "object") return { ok: false, errorCode: "MANIFEST_INVALID", errors: ["NOT_OBJECT"], manifest: null };
  if (m.schemaVersion != null && m.schemaVersion !== PPOCR_MANIFEST_SCHEMA_VERSION) errors.push("SCHEMA_VERSION_UNSUPPORTED: " + m.schemaVersion);
  if (!m.tiers || typeof m.tiers !== "object") errors.push("TIERS_MISSING");
  var tiers = m.tiers && typeof m.tiers === "object" ? m.tiers : {};
  var tierNames = Object.keys(tiers);
  if (tierNames.length === 0) errors.push("TIERS_EMPTY");
  tierNames.forEach(function (name) {
    var tier = tiers[name] || {};
    ["det", "rec"].forEach(function (role) {
      var e = tier[role];
      if (!e || typeof e !== "object") { errors.push("TIER_" + name + "_" + role.toUpperCase() + "_MISSING"); return; }
      if (!e.id) errors.push("TIER_" + name + "_" + role.toUpperCase() + "_ID_MISSING");
      if (!e.url) errors.push("TIER_" + name + "_" + role.toUpperCase() + "_URL_MISSING");
      if (e.bytes != null && !zyLoadIsNum(e.bytes)) errors.push("TIER_" + name + "_" + role.toUpperCase() + "_BYTES_INVALID");
      if (e.sha256 != null && !/^[0-9a-f]{64}$/i.test(String(e.sha256))) errors.push("TIER_" + name + "_" + role.toUpperCase() + "_SHA256_INVALID");
    });
  });
  if (m.cls != null && (typeof m.cls !== "object" || !m.cls.url)) errors.push("CLS_INVALID");
  if (errors.length) return { ok: false, errorCode: "MANIFEST_INVALID", errors: errors, manifest: null };
  return { ok: true, errors: [], manifest: m };
}

// ---- 2. 解析待加载条目 ----
function resolveModelPlan(manifest, opts) {
  var o = opts || {};
  var tierName = o.tier || "small";
  var tier = manifest && manifest.tiers ? manifest.tiers[tierName] : null;
  if (!tier) return { ok: false, errorCode: "MODEL_PLAN_INVALID", errors: ["TIER_NOT_FOUND: " + tierName], plan: null };
  var entries = [];
  var pushEntry = function (role, e, kind) {
    entries.push({
      role: role,
      kind: kind || "binary",
      id: e.id || null,
      url: e.url,
      bytes: zyLoadIsNum(e.bytes) ? e.bytes : null,
      sha256: e.sha256 ? String(e.sha256).toLowerCase() : null,
      cacheKey: "ppocr:" + (e.id || url) + ":" + (e.sha256 ? String(e.sha256).slice(0, 16) : "nohash")
    });
  };
  pushEntry("det", tier.det);
  pushEntry("rec", tier.rec);
  if (o.needCls && manifest.cls) pushEntry("cls", manifest.cls);
  if (o.needDict !== false && tier.rec && tier.rec.dictUrl) {
    pushEntry("dict", { id: (tier.rec.id || "rec") + "-dict", url: tier.rec.dictUrl, bytes: tier.rec.dictBytes, sha256: tier.rec.dictSha256 }, "text");
  }
  entries.sort(function (a, b) { return PPOCR_ROLE_ORDER.indexOf(a.role) - PPOCR_ROLE_ORDER.indexOf(b.role); });
  return { ok: true, errors: [], plan: { tier: tierName, entries: entries, engine: manifest.engine || null, ortVersion: manifest.ortVersion || null } };
}

// ---- 3. 加载（缓存 → 校验 → 下载 → 校验 → 回写） ----
function defaultDecodeText(bytes) {
  if (typeof TextDecoder === "undefined") return null;
  return new TextDecoder("utf-8").decode(bytes);
}

function loadModelAssets(opts) {
  var o = opts || {};
  var t0 = o.now ? o.now() : Date.now();
  var plan = o.plan;
  var fetchBytes = o.fetchBytes;
  var sha256 = o.sha256;
  var cache = o.cache || null;
  var decodeText = typeof o.decodeText === "function" ? o.decodeText : defaultDecodeText;
  var onStatus = o.onStatus || function () {};
  if (!plan || !Array.isArray(plan.entries) || plan.entries.length === 0) {
    return Promise.resolve({ ok: false, errorCode: "MODEL_PLAN_INVALID", errors: ["PLAN_EMPTY"], assets: {}, meta: {} });
  }
  if (typeof fetchBytes !== "function") {
    return Promise.resolve({ ok: false, errorCode: "MODEL_FETCH_FAILED", errors: ["FETCH_FN_MISSING"], assets: {}, meta: {} });
  }
  var assets = {};
  var statuses = [];
  var downloaded = 0;
  var cachedHits = 0;
  var totalBytes = 0;

  function verify(entry, bytes) {
    if (!entry.sha256 || typeof sha256 !== "function") return Promise.resolve({ ok: true, skipped: !entry.sha256 });
    return Promise.resolve()
      .then(function () { return sha256(bytes); })
      .then(function (hex) {
        var got = String(hex || "").toLowerCase();
        return { ok: got === entry.sha256, got: got, skipped: false };
      })
      .catch(function (e) { return { ok: false, got: null, error: String(e && e.message || e) }; });
  }

  function loadEntry(entry, index) {
    onStatus("loading", { role: entry.role, index: index, total: plan.entries.length, url: entry.url, cacheKey: entry.cacheKey });
    var fromCache = cache && typeof cache.get === "function" ? Promise.resolve().then(function () { return cache.get(entry.cacheKey); }).catch(function () { return null; }) : Promise.resolve(null);
    return fromCache.then(function (hit) {
      if (hit && hit.length) {
        return verify(entry, hit).then(function (v) {
          if (v.ok) return { source: "cache", bytes: hit };
          onStatus("cache-stale", { role: entry.role, sha256: v.got });
          return null;
        });
      }
      return null;
    }).then(function (fromCacheResult) {
      if (fromCacheResult) return fromCacheResult;
      return Promise.resolve()
        .then(function () { return fetchBytes(entry.url); })
        .then(function (bytes) {
          if (!bytes || !bytes.length) return { source: "download", error: "FETCH_EMPTY" };
          return verify(entry, bytes).then(function (v) {
            if (!v.ok) return { source: "download", error: "HASH_MISMATCH", got: v.got };
            return { source: "download", bytes: bytes };
          });
        })
        .catch(function (e) { return { source: "download", error: "FETCH_THREW: " + String(e && e.message || e).slice(0, 120) }; });
    }).then(function (res) {
      if (res.error) {
        statuses.push({ role: entry.role, id: entry.id, source: res.source, error: res.error, got: res.got || null, elapsed: (o.now ? o.now() : Date.now()) - t0 });
        return { ok: false, errorCode: res.error === "HASH_MISMATCH" ? "MODEL_HASH_MISMATCH" : "MODEL_FETCH_FAILED", role: entry.role, error: res.error };
      }
      if (res.source === "download") {
        downloaded += 1;
        totalBytes += res.bytes.length;
        if (cache && typeof cache.put === "function") {
          Promise.resolve().then(function () { return cache.put(entry.cacheKey, res.bytes); }).catch(function () {});
        }
      } else {
        cachedHits += 1;
        totalBytes += res.bytes.length;
      }
      var payload = res.bytes;
      if (entry.kind === "text") {
        var text = decodeText(payload);
        if (text == null) return { ok: false, errorCode: "DICT_DECODE_FAILED", role: entry.role };
        assets[entry.role] = text;
      } else {
        assets[entry.role] = payload;
      }
      statuses.push({ role: entry.role, id: entry.id, source: res.source, bytes: payload.length, skippedVerify: false, elapsed: (o.now ? o.now() : Date.now()) - t0 });
      onStatus("loaded", { role: entry.role, source: res.source, bytes: payload.length });
      return { ok: true };
    });
  }

  var chain = Promise.resolve();
  var failure = null;
  plan.entries.forEach(function (entry, index) {
    chain = chain.then(function () {
      if (failure) return null;
      return loadEntry(entry, index).then(function (r) {
        if (r && !r.ok) failure = r;
        return null;
      });
    });
  });
  return chain.then(function () {
    if (failure) {
      return { ok: false, errorCode: failure.errorCode, errors: [failure.role + ":" + failure.error], assets: assets, meta: { statuses: statuses, downloaded: downloaded, cached: cachedHits, elapsed: (o.now ? o.now() : Date.now()) - t0 } };
    }
    return {
      ok: true,
      errorCode: null,
      assets: assets,
      meta: {
        statuses: statuses,
        downloaded: downloaded,
        cached: cachedHits,
        totalBytes: totalBytes,
        elapsed: (o.now ? o.now() : Date.now()) - t0,
        plan: plan
      }
    };
  });
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  PPOCR_MANIFEST_SCHEMA_VERSION: PPOCR_MANIFEST_SCHEMA_VERSION,
  parseModelManifest: parseModelManifest,
  resolveModelPlan: resolveModelPlan,
  loadModelAssets: loadModelAssets
};