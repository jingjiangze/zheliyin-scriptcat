// 折立印 AI 边界测试（Stage 2）
// 依赖环境：gm-shim + field-core + config-core + ai-client + assistant（?zydebug=1）
// 覆盖：§二十 传输级 10 场景矩阵；§二十一/二十四 业务级 fallback 与解析回归
"use strict";
(async function () {
  var results = [];
  var failures = 0;
  function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function case_(name, cond) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures += 1; }

  // ---------- 传输级矩阵：注 transport ----------
  function tr(status, bodyText, mode) {
    return function (opts) {
      if (mode === "timeout") { if (opts.ontimeout) opts.ontimeout(); return; }
      if (mode === "error") { if (opts.onerror) opts.onerror(); return; }
      if (opts.onload) opts.onload({ status: status, responseText: bodyText });
    };
  }
  var r;
  // 1) 200 + 合法 JSON
  r = await aiRequest({ url: "https://x.example/v3/chat/completions", transport: tr(200, '{"a":1}') });
  case_("m1 200 valid JSON -> ok+body", r.ok === true && eq(r.body, { a: 1 }));
  // 2) 200 + 非法 JSON
  r = await aiRequest({ url: "https://x.example/v3/chat/completions", transport: tr(200, "not json") });
  case_("m2 200 invalid JSON -> INVALID_JSON", r.ok === false && r.error.kind === "INVALID_JSON" && r.error.retryable === false);
  // 3) 429
  r = await aiRequest({ url: "https://x.example/v3/chat/completions", headers: { Authorization: "Bearer SECRETKEY" }, transport: tr(429, "rate limit") });
  case_("m3 429 -> HTTP_ERROR retryable", r.ok === false && r.error.kind === "HTTP_ERROR" && r.error.status === 429 && r.error.retryable === true);
  case_("m3 脱敏：错误消息不含 Key/Auth", r.error.message.indexOf("SECRETKEY") < 0 && r.error.message.indexOf("Bearer") < 0);
  // 4) 500
  r = await aiRequest({ url: "https://x.example/v3/chat/completions", transport: tr(500, "boom") });
  case_("m4 500 -> HTTP_ERROR retryable", r.ok === false && r.error.kind === "HTTP_ERROR" && r.error.status === 500 && r.error.retryable === true);
  // 5) timeout
  r = await aiRequest({ url: "https://x.example/chat/completions", timeout: 10, transport: tr(0, "", "timeout") });
  case_("m5 timeout -> TIMEOUT retryable", r.ok === false && r.error.kind === "TIMEOUT" && r.error.retryable === true);
  // 6) network error
  r = await aiRequest({ url: "https://x.example/chat/completions", transport: tr(0, "", "error") });
  case_("m6 network -> NETWORK_ERROR", r.ok === false && r.error.kind === "NETWORK_ERROR" && r.error.retryable === true);
  // 7) 空 response
  r = await aiRequest({ url: "https://x.example/chat/completions", transport: tr(200, "") });
  case_("m7 empty body -> INVALID_JSON", r.ok === false && r.error.kind === "INVALID_JSON");
  // 8) 缺 choices
  r = await aiRequest({ url: "https://x.example/chat/completions", transport: tr(200, '{"foo":1}') });
  case_("m8 missing choices -> ok(transport) 内容层校验交业务", r.ok === true);
  // 9) 缺 message
  r = await aiRequest({ url: "https://x.example/chat/completions", transport: tr(200, '{"choices":[{}]}') });
  case_("m9 missing message -> ok(transport)", r.ok === true);
  // 10) 缺 content
  r = await aiRequest({ url: "https://x.example/chat/completions", transport: tr(200, '{"choices":[{"message":{}}]}') });
  case_("m10 missing content -> ok(transport)", r.ok === true);
  // endpoint 记录
  r = await aiRequest({ url: "https://x.example/chat/completions", transport: tr(500, "boom") });
  case_("m4b endpoint host recorded", r.error.endpoint === "x.example");

  // ---------- 业务级：面板驱动 parseFields（走统一 AI 通道 + 本地 fallback）----------
  // assistant 的 renderPanel 挂载在 DOMContentLoaded，此处等待面板就绪后再操作 DOM
  if (document.readyState === "loading") {
    await new Promise(function (res) { window.addEventListener("DOMContentLoaded", res); });
  }
  var apiKeyInput = document.getElementById("zy-api-key");
  var modelInput = document.getElementById("zy-model");
  var rawInput = document.getElementById("zy-raw");
  apiKeyInput.value = "test-key"; // 触发 AI 路径
  modelInput.value = "";
  var raw = "张伟\n销售经理\n深圳市华创科技有限公司\n地址：广东省深圳市南山区深南大道9988号华创大厦20楼\n电话：13800138000\n微信：zhangwei_wx\n主营业务：电子元器件";
  var refSplit = __ZY_DEBUG__.splitFrontBackText(raw);
  var localRef = __ZY_DEBUG__.parseByRulesFromSides(refSplit.front, refSplit.back);
  var D = __ZY_DEBUG__;

  function resetState() {
    D.state.fields = D.emptyFields();
    D.state.frontText = ""; D.state.backText = "";
  }
  function bodyOf(jsonObj) { return JSON.stringify(jsonObj); }
  // 关键：AI 失败会使后续调用不消费队列；每场景前先清空队列再精确喂入，杜绝错位。
  function feedQueue(items) {
    pending.length = 0;
    (items || []).forEach(function (h) { pending.push(h); });
  }

  // A) AI 429 → 本地规则 fallback（split 即失败，parse 不会被调用）
  feedQueue([{ status: 429, body: '{"error":"rate limited"}' }]);
  resetState(); rawInput.value = raw;
  await D.parseFields({ append: false, apply: false });
  case_("b1 AI 429 -> 业务最终状态=本地规则", eq(D.state.fields, localRef) && pending.length === 0);

  // B) AI 空结果（split '{}' + parse '{}'）→ 保持本地
  feedQueue([
    { status: 200, body: bodyOf({ choices: [{ message: { content: "{}" } }] }) },
    { status: 200, body: bodyOf({ choices: [{ message: { content: "{}" } }] }) }
  ]);
  resetState(); rawInput.value = raw;
  await D.parseFields({ append: false, apply: false });
  case_("b2 AI 空结果 -> 业务最终状态=本地规则", eq(D.state.fields, localRef) && pending.length === 0);

  // C) AI 正常 → merge 后业务状态与 reference 一致
  var splitContent = JSON.stringify({
    front: "张伟 销售经理 深圳市华创科技有限公司 电话：13800138000 微信：zhangwei_wx 地址：广东省深圳市南山区深南大道9988号华创大厦20楼",
    back: "主营范围：电子元器件"
  });
  var parseContent = JSON.stringify({
    name: "张伟", title: "销售经理", company_cn: "深圳市华创科技有限公司",
    phones: ["13800138000"], wechats: ["zhangwei_wx"],
    addresses: ["广东省深圳市南山区深南大道9988号华创大厦20楼"], business: ["电子元器件"]
  });
  var aiSplitObj = JSON.parse(splitContent);
  var aiFront = String(aiSplitObj.front || ""); var aiBack = String(aiSplitObj.back || "");
  var aiRuleRef = D.parseByRulesFromSides(aiFront, aiBack);
  var expectedMerge = D.mergeFields(aiRuleRef, JSON.parse(parseContent), raw);
  feedQueue([
    { status: 200, body: bodyOf({ choices: [{ message: { content: splitContent } }] }) },
    { status: 200, body: bodyOf({ choices: [{ message: { content: parseContent } }] }) }
  ]);
  resetState(); rawInput.value = raw;
  await D.parseFields({ append: false, apply: false });
  window.__AIDBG_C = { actual: D.state.fields, expected: expectedMerge, front: D.state.frontText, back: D.state.backText };
  try {
    var dbgpre = document.getElementById("zy_ai_result");
    if (dbgpre) dbgpre.textContent += "\n__DBG_C__ " + JSON.stringify({ front: D.state.frontText, back: D.state.backText, actualTitle: D.state.fields.title, actualBusiness: D.state.fields.business });
  } catch (_e) {}
  case_("b3 AI 正常 -> 业务最终状态=mergeFields(AI分面规则, ai, raw)", eq(D.state.fields, expectedMerge));
  case_("b3 AI 追加 title 生效", D.state.fields.title === "销售经理" && D.state.fields.name === "张伟");

  // D) split 正常 + parse 非法 JSON → 本地 fallback
  feedQueue([
    { status: 200, body: bodyOf({ choices: [{ message: { content: splitContent } }] }) },
    { status: 200, body: "not-a-json" }
  ]);
  resetState(); rawInput.value = raw;
  await D.parseFields({ append: false, apply: false });
  case_("b4 parse 非法 JSON -> 业务最终状态=本地规则", eq(D.state.fields, localRef) && pending.length === 0);

  // E) 追加信息（mergeTwoFields）不受 AI 影响
  feedQueue([]); // split 命中默认 500 → 本地
  resetState(); rawInput.value = "电话：13911112222";
  D.state.fields = D.mergeTwoFields(D.emptyFields(), localRef);
  await D.parseFields({ append: true, apply: false });
  case_("b5 追加后仍保留既有业务字段", D.state.fields.phones.indexOf("13911112222") >= 0 && D.state.fields.name === "张伟");

  // ---------- 汇总 ----------
  var summary = failures === 0 ? "ALL-PASS (" + results.length + ")" : "FAIL " + failures + "/" + results.length;
  if (failures > 0 && window.__AIDBG_C) {
    var a = window.__AIDBG_C.actual; var e = window.__AIDBG_C.expected;
    summary += " | C actual={t:" + a.title + ",n:" + a.name + ",b:" + JSON.stringify(a.business) +
      "} expected={t:" + e.title + ",n:" + e.name + ",b:" + JSON.stringify(e.business) + "}";
    summary += " | DBG=" + encodeURIComponent(JSON.stringify({
      front: window.__AIDBG_C.front, back: window.__AIDBG_C.back,
      actualBusiness: a.business, expectedBusiness: e.business,
      mock: window.__MOCKLOG__ ? window.__MOCKLOG__.map(function (x) { return x.status + ":" + x.body; }) : null
    }));
  }
  document.title = "zy-ai: " + summary;
  var out = document.getElementById("zy_ai_result");
  if (out) out.textContent = summary + "\n" + results.join("\n");
})().catch(function (e) {
  document.title = "zy-ai: ERROR " + (e && e.message ? e.message : e);
  var out = document.getElementById("zy_ai_result");
  if (out) out.textContent = "ERROR: " + (e && (e.stack || e.message) || e);
});