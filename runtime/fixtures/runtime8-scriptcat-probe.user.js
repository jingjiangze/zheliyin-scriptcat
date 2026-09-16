// ==UserScript==
// @name         Zheliyin Runtime 8 Probe
// @namespace    https://github.com/jingjiangze/zheliyin-scriptcat
// @description  RUNTIME-8 probe: GM_addElement -> production pageBridge -> marker -> probe. 极小包装，不实现第二套 Bridge。
// @match        https://diy.zheliyin.com/*
// @grant        GM_addElement
// @run-at       document-idle
// ==/UserScript==
(function () {
  "use strict";
  // RUNTIME-8.2 probe：把 production pageBridge（由 harness 注入 __ZY_RUNTIME8_BRIDGE_SRC__）经 GM_addElement 注入 page world。
  const MARKER = "__ZY_CARD_ASSISTANT_BRIDGE__";
  const BRIDGE_SRC = "__ZY_RUNTIME8_BRIDGE_SRC__";

  function report(tag, payload) {
    try { console.log("[zy-runtime8]", tag, JSON.stringify(payload)); } catch (e) { console.log("[zy-runtime8]", tag, String(payload)); }
    try { document.documentElement.setAttribute("data-zy-rt8-" + tag.replace(/[^a-z0-9-]/gi, "-"), "1"); } catch (e) {}
  }

  // 用 production pageBridge 源码（占位符由 harness 替换），包成自执行注入主世界
  const injectable = "(function(){" + BRIDGE_SRC + "\n})();";

  try {
    GM_addElement("script", { textContent: injectable });
    report("gm-add-element-called", { available: typeof GM_addElement === "function" });
  } catch (e) {
    report("gm-add-element-threw", { error: String(e && e.message || e) });
  }

  setTimeout(function () {
    const cb = window[MARKER];
    report("marker-after-gm", { installed: !!(cb && cb.installed === true), via: cb && cb.via || null });
  }, 700);

  setTimeout(function () {
    let responses = 0;
    const onMsg = function (e) {
      if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === "probeResult") responses += 1;
    };
    window.addEventListener("message", onMsg);
    window.postMessage({ source: "zy-card-assistant", type: "probe", rt8: true }, location.origin);
    setTimeout(function () {
      window.removeEventListener("message", onMsg);
      const cb = window[MARKER];
      report("result", {
        gmAddElementAvailable: typeof GM_addElement === "function",
        markerInstalled: !!(cb && cb.installed === true),
        probeResponses: responses,
        verdict: responses >= 1 ? "REAL_SCRIPT_CAT_BRIDGE=PASS" : "NO_RESPONSE",
        url: (location.href || "").slice(0, 120)
      });
    }, 1500);
  }, 1000);
})();