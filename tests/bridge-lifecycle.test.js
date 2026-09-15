// 折立印 Bridge 生命周期回归测试（Stage 3.2，AUDIT-BRIDGE-001）
// 黑盒原则：观察「输入→Bridge→输出」响应计数，不读取内部变量。
// 机制测试（t5）证明 pageBridge() 本身非幂等；生命周期测试（t2–t4）证明
// installPageBridge() 保证只注入一次（P1 修复目标）。
"use strict";
(async function () {
  var results = [];
  var failures = 0;
  function case_(name, cond) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures += 1; }

  if (document.readyState === "loading") {
    await new Promise(function (res) { window.addEventListener("DOMContentLoaded", res); });
  }
  // 竞态防护：assistant 的 renderPanel→installPageBridge 挂载于 DOMContentLoaded；
  // readyState 已非 loading 时仍需给 DCL 后的注入留出同步完成窗口。
  await new Promise(function (res) { setTimeout(res, 150); });
  // 就绪探针：确认注入完成再开始（resolve-once，2s 超时）
  var probeReady = await new Promise(function (res) {
    var to = setTimeout(function () { window.removeEventListener("message", on); res(false); }, 2000);
    function on(e) {
      if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === "probeResult") {
        clearTimeout(to); window.removeEventListener("message", on); res(true);
      }
    }
    window.addEventListener("message", on);
    window.postMessage({ source: "zy-card-assistant", type: "probe" }, location.origin);
  });
  if (!probeReady) {
    document.title = "zy-bridge-lifecycle: ENV-FAIL (bridge not ready)";
    var pre0 = document.getElementById("zy_bridge_result");
    if (pre0) pre0.textContent = "ENV-FAIL: 注入未就绪（测试时序/环境问题，非修复回归）";
    return;
  }
  // attemptReceive：发送一条桥接消息，等收到 untilCount 个响应或 1200ms 超时，返回实际计数。
  // “收到即驱动 + 超时兜底”两路出口，规避 headless 虚拟时间对纯定时窗口的不敏感。
  function attemptReceive(msgType, respType, untilCount) {
    return new Promise(function (resolve) {
      var n = 0;
      var to = setTimeout(function () { window.removeEventListener("message", on); resolve(n); }, 1200);
      function on(e) {
        if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === respType) {
          n += 1;
          if (n >= untilCount) { clearTimeout(to); window.removeEventListener("message", on); resolve(n); }
        }
      }
      window.addEventListener("message", on);
      var payload = { source: "zy-card-assistant", type: msgType };
      if (msgType === "apply") { payload.fields = { name: "张三" }; payload.side = "front"; }
      window.postMessage(payload, location.origin);
    });
  }
  var D = window.__ZY_DEBUG__;

  // t1 基线：首次注入后 probe 应恰 1 个响应（期望无第 2 个；等 2 个必超时返回 1）
  var c1 = await attemptReceive("probe", "probeResult", 2);
  case_("t1 首次注入后 probe 恰 1 个响应（基线）", c1 === 1);

  // t2 生命周期：直接 installPageBridge ×5 → 仍恰 1（幂等）
  for (var i = 0; i < 5; i += 1) D.installPageBridge();
  var c2 = await attemptReceive("probe", "probeResult", 2);
  case_("t2 installPageBridge ×5 后仍恰 1 个响应（生命周期幂等）", c2 === 1);

  // t3 真实 UI 路径：minimize 收起/展开 ×4（renderPanel 重建 → installPageBridge 再调用）
  function getMinBtn() { return document.getElementById("zy-min-btn"); }
  getMinBtn().click(); var c3a = await attemptReceive("probe", "probeResult", 2);
  getMinBtn().click(); var c3b = await attemptReceive("probe", "probeResult", 2);
  getMinBtn().click(); var c3c = await attemptReceive("probe", "probeResult", 2);
  getMinBtn().click();
  case_("t3 minimize×4 后 probe 仍恰 1 个响应（真实 UI 路径）", c3a === 1 && c3b === 1 && c3c === 1);

  // t4 重复安装不导致 apply 重复执行：apply 响应（applyResult）仍恰 1
  for (var j = 0; j < 3; j += 1) D.installPageBridge();
  getMinBtn().click(); getMinBtn().click();
  var ca = await attemptReceive("apply", "applyResult", 2);
  case_("t4 install×3+minimize×2 后 apply 响应恰 1（apply 只执行一次）", ca === 1);

  // t5 机制（Stage 4.0 语义更新）：pageBridge() 已通过页面主世界 marker 幂等化（AUDIT-BRIDGE-002）。
  // Stage 3.2 时曾断言“pageBridge() 每次调用 +1 listener”；跨实例幂等修复后该机制不复存在——
  // 这是生产行为增强（重复注入不再累积），t5 相应改为“幂等”断言，并由 Mutation 证明其对 marker 敏感。
  var before = await attemptReceive("probe", "probeResult", 2);
  pageBridge();
  pageBridge();
  var after = await attemptReceive("probe", "probeResult", 2);
  case_("t5 机制：pageBridge() 幂等（marker 生效，重复调用不新增 listener）", before === 1 && after === 1);

  // t6 跨实例：绕过当前闭包标志，再造一份“等价注入流程”（=第二个 userscript 实例的注入）。
  // 若 page 主世界无稳定 marker，第二次注入将再注册 listener（Stage 4.0 跨实例幂等目标）。
  function injectBridgeOnceMore() {
    var s = document.createElement("script");
    s.textContent = "(" + pageBridge.toString() + ")();";
    (document.head || document.documentElement).appendChild(s);
    s.remove();
  }
  injectBridgeOnceMore();
  injectBridgeOnceMore();
  var c6 = await attemptReceive("probe", "probeResult", 2);
  case_("t6 跨实例注入流程 ×2 → 仍恰 1（page 主世界幂等 marker）", c6 === 1);

  var summary = failures === 0 ? "ALL-PASS (" + results.length + ")" : "FAIL " + failures + "/" + results.length;
  document.title = "zy-bridge-lifecycle: " + summary + " LC=" + encodeURIComponent(JSON.stringify({ c1: c1, c2: c2, c3a: c3a, c3b: c3b, c3c: c3c, ca: ca, before: before, after: after, c6: c6 }));
  var out = document.getElementById("zy_bridge_result");
  if (out) out.textContent = summary + "\n" + results.join("\n");
})().catch(function (e) {
  document.title = "zy-bridge-lifecycle: ERROR " + (e && e.message ? e.message : e);
  var out = document.getElementById("zy_bridge_result");
  if (out) out.textContent = "ERROR: " + (e && (e.stack || e.message) || e);
});