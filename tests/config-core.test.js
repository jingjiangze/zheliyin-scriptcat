// 折立印 config-core 单元测试（无框架，浏览器/Node 双跑）
"use strict";
(function () {
  var results = [];
  var failures = 0;
  function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function case_(name, cond) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures += 1; }

  // 默认值
  var def = resolveConfig({});
  case_("resolve defaults baseUrl", def.baseUrl === DEFAULT_BASE_URL);
  case_("resolve defaults model", def.model === DEFAULT_MODEL);
  case_("resolve defaults apiKey empty", def.apiKey === "");
  case_("resolve defaults usedLegacy false", def.usedLegacy === false);

  // 完整配置
  var full = resolveConfig({ zyArkApiKey: " k1 ", zyArkBaseUrl: "https://x.example/v2", zyArkModel: "m1" });
  case_("resolve full trims", full.apiKey === "k1" && full.baseUrl === "https://x.example/v2" && full.model === "m1");
  case_("resolve full usedLegacy false", full.usedLegacy === false);

  // 部分配置
  var partial = resolveConfig({ zyArkApiKey: "k1" });
  case_("resolve partial keeps defaults", partial.baseUrl === DEFAULT_BASE_URL && partial.model === DEFAULT_MODEL);

  // 历史 key 兼容
  var legacy = resolveConfig({ zyBaseUrl: "https://legacy.example/v1" });
  case_("resolve historical zyBaseUrl wins over default", legacy.baseUrl === "https://legacy.example/v1");
  case_("resolve historical marks usedLegacy", legacy.usedLegacy === true);

  // 优先级：zyArkBaseUrl > zyBaseUrl
  var both = resolveConfig({ zyArkBaseUrl: "https://new.example/v3", zyBaseUrl: "https://legacy.example/v1" });
  case_("resolve priority ark over legacy", both.baseUrl === "https://new.example/v3" && both.usedLegacy === false);

  // 模型默认回退
  case_("resolve empty model falls back", resolveConfig({ zyArkModel: "  " }).model === DEFAULT_MODEL);

  // configToStorage 双 key 同步 + 往返幂等
  var snap = configToStorage({ apiKey: "k1", baseUrl: "https://b.example/v2", model: "m1" });
  case_("toStorage writes both base keys", snap.zyArkBaseUrl === "https://b.example/v2" && snap.zyBaseUrl === "https://b.example/v2");
  case_("toStorage empty base falls back", configToStorage({}).zyArkBaseUrl === DEFAULT_BASE_URL);

  // 迁移闭环：历史配置 → resolve → toStorage → resolve 结果稳定（迁移后不漂移）
  var after = resolveConfig(configToStorage(resolveConfig({ zyBaseUrl: "https://legacy.example/v1" })));
  case_("migration round-trip stable", after.baseUrl === "https://legacy.example/v1" && after.usedLegacy === false);

  // 保存后重读（模拟 storage 往返）
  var store = {};
  function write(snap) { Object.keys(snap).forEach(function (k) { store[k] = snap[k]; }); }
  write(configToStorage(resolveConfig({ zyBaseUrl: "https://legacy.example/v1" })));
  case_("save then reload same", resolveConfig(store).baseUrl === "https://legacy.example/v1");

  var summary = failures === 0 ? "ALL-PASS (" + results.length + ")" : "FAIL " + failures + "/" + results.length;
  try { document.title = "zy-config: " + summary; var o = document.getElementById("zy_config_result"); if (o) o.textContent = summary + "\n" + results.join("\n"); } catch (_e) {}
})();