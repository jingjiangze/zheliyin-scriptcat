// ==UserScript==
// @name         折立印 Bridge 注入兼容性探针（RUNTIME-8）
// @namespace    https://github.com/jingjiangze/zheliyin-scriptcat
// @version      0.0.1
// @description  只读取证：验证 GM_addElement 能否绕过折立印编辑器页 CSP，把 pageBridge 注入 page world。不改任何对象。
// @author       jingjiangze
// @match        https://diy.zheliyin.com/diyWeb/third/*
// @match        https://diy.zheliyin.com/diyWeb/*thirdLoginDiyEdit.do*
// @match        https://diy.zheliyin.com/diyWeb/*thirdDiyAdd.do*
// @grant        GM_addElement
// @run-at       document-idle
// ==/UserScript==
(function () {
  "use strict";
  // RUNTIME-8：ScriptCat GM_addElement 注入路径探针（§5/§6/§7）
  // 只读取证：注入一个最小 pageBridge 测试桩，随后发 probe 验证往返。
  // 不改画布、不产生业务副作用；完成后打印结果 JSON。
  const MARKER = "__ZY_CARD_ASSISTANT_BRIDGE__";
  const BRIDGE_SOURCE = "zy-card-assistant";
  const PAGE_SOURCE = "zy-card-assistant-page";

  function report(tag, payload) {
    console.log("[zy-runtime8]", tag, JSON.stringify(payload));
  }

  // 最小 pageBridge 测试桩（真实协议形态：监听 probe → 回 probeResult）
  const TEST_BRIDGE_SRC = `(function () {
    "use strict";
    if (window.${MARKER} && window.${MARKER}.installed) return;
    function post(type, payload) { window.postMessage(Object.assign({ source: "${PAGE_SOURCE}", type: type }, payload), location.origin); }
    window.addEventListener("message", function (e) {
      if (e.source !== window || !e.data || e.data.source !== "${BRIDGE_SOURCE}") return;
      if (e.data.type === "probe") {
        post("probeResult", { ok: true, href: location.href, rt8: true, canvases: [] });
      }
    });
    window.${MARKER} = { installed: true, ts: Date.now(), via: "gm-add-element-probe" };
  })()`;

  // 1) 用 GM_addElement 注入 script（官方 API：可绕过 CSP）
  let gmAddOk = false;
  try {
    if (typeof GM_addElement === "function") {
      GM_addElement("script", { textContent: TEST_BRIDGE_SRC });
      gmAddOk = true;
    }
  } catch (e) {
    report("gm-add-element-threw", { error: String(e && e.message || e) });
  }
  report("gm-add-element-called", { available: typeof GM_addElement === "function", called: gmAddOk });

  // 2) 等注入后检查 marker
  setTimeout(function () {
    const cb = window[MARKER];
    report("marker-after-gm-add-element", { installed: !!(cb && cb.installed === true), via: cb && cb.via });
  }, 500);

  // 3) 发 probe 验证往返（无论 marker 是否由本探针装，都验证现存桥是否响应）
  setTimeout(function () {
    let responses = 0;
    const onMsg = function (e) {
      if (e.data && e.data.source === PAGE_SOURCE && e.data.type === "probeResult") responses += 1;
    };
    window.addEventListener("message", onMsg);
    window.postMessage({ source: BRIDGE_SOURCE, type: "probe", rt8: true }, location.origin);
    setTimeout(function () {
      window.removeEventListener("message", onMsg);
      const cb = window[MARKER];
      report("result", {
        gmAddElementAvailable: typeof GM_addElement === "function",
        markerInstalled: !!(cb && cb.installed === true),
        markerVia: cb && cb.via || null,
        probeResponses: responses,
        verdict: (responses >= 1) ? "REAL_SCRIPT_CAT_BRIDGE=PASS(probe roundtrip ok)" : "NO_RESPONSE",
        note: "若 markerInstalled=true 且 probeResponses>=1 → GM_addElement 成功绕过 CSP；若 marker false → 仍被拦"
      });
    }, 1500);
  }, 800);
})();