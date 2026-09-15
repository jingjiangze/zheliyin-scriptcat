// 折立印 Runtime 只读取证脚本（Stage 4.1）
// 用法：登录折立印并打开「真实设计器」页面后，打开 DevTools Console，粘贴本文件全部内容回车。
// 作用：仅读取并打印运行时拓扑/对象摘要，不修改任何页面对象——请把输出回传给维护者。
// 敏感信息脱敏：URL 中的 token/key 会被掩码；不输出 cookie/账号/API Key。
(() => {
  "use strict";
  function sameOrigin(f) {
    try { return !!f.contentWindow && !!f.contentWindow.location && (f.contentWindow.location.origin === location.origin); } catch (_e) { return false; }
  }
  function maskUrl(u) {
    return String(u || "").replace(/([?&](?:token|key|secret|sign)=)[^&#]*/gi, "$1***").slice(0, 200);
  }
  var cb = window.__ZY_CARD_ASSISTANT_BRIDGE__;
  // 同源 iframe 才能读取其内容（跨域 iframe 受 SOP 限制，仅记录存在性）
  function frameSummary(f, i) {
    var s = { index: i, src: maskUrl(f.src), sameOrigin: sameOrigin(f) };
    if (s.sameOrigin) {
      try {
        var fw = f.contentWindow, fd = fw.document;
        s.editorGlobals = {
          CanvasObjVO: !!fw.CanvasObjVO,
          CurrentCanvas: !!fw.CurrentCanvas,
          fabric: !!fw.fabric,
          requirejs: !!(fw.requirejs || fw.require)
        };
        s.canvasCount = fd.querySelectorAll("canvas").length;
        s.textLayerCount = fd.querySelectorAll('[class*="text"], [class*="layer"], [class*="item"]').length;
      } catch (_e) {
        s.frameReadError = String(_e && _e.message || _e);
      }
    }
    return s;
  }
  var out = {
    ts: new Date().toISOString(),
    topWindow: {
      isTop: window === top,
      selfIsTop: window.self === window.top,
      href: maskUrl(location.href),
      origin: location.origin,
      framesCount: window.frames.length,
      iframeTags: Array.from(document.querySelectorAll("iframe")).map(frameSummary),
      zyBridgeMarker: !!cb && cb.installed === true,
      zyPanelCount: document.querySelectorAll("#zy-card-assistant").length
    },
    editorGlobals: {
      CanvasObjVO: !!window.CanvasObjVO,
      CurrentCanvas: !!window.CurrentCanvas,
      fabric: !!window.fabric,
      requirejs: !!(window.requirejs || window.require)
    }
  };
  // §十五 安全边界取证（只读，不改对象）：向本页发送一条「格式合法但非助手发起」的 probe，
  // 统计 pageBridge 是否响应——判断同页其他 script 能否伪造触发（不改画布，pure probe）。
  try {
    var spoofCount = 0;
    var spoofTimer = setTimeout(function () { window.removeEventListener("message", onSpoof); out.messageSpoof = { probeSpoofed: true, probeResponses: spoofCount, verdict: spoofCount > 0 ? "CAN_TRIGGER (P2 CONFIRMED)" : "NO_RESPONSE" }; console.log("[zy-forensics]", "spoof-probe", JSON.stringify(out.messageSpoof)); }, 1800);
    function onSpoof(e) {
      if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === "probeResult") { spoofCount += 1; }
    }
    window.addEventListener("message", onSpoof);
    window.postMessage({ source: "zy-card-assistant", type: "probe", spoofProbe: true }, location.origin);
  } catch (_e) {
    out.messageSpoofError = String(_e && _e.message || _e);
  }
  // 画布探测（只读）：尝试经 findCanvas 逻辑定位（若已在注入桥接中）
  try {
    var CanvasVO = window.CanvasObjVO || (window.requirejs && window.requirejs.s && window.requirejs.s.contexts && window.requirejs.s.contexts._ && window.requirejs.s.contexts._.defined && window.requirejs.s.contexts._.defined.CanvasObjVO);
    var total = CanvasVO && CanvasVO.totalCanvasArray;
    out.canvas = {
      totalCount: Array.isArray(total) ? total.length : 0,
      topLevelEntries: Array.isArray(total) ? total.length : "n/a"
    };
    if (Array.isArray(total) && total.length) {
      var first = total[0];
      var c = (first && first.canvas) || first || null;
      out.canvas.firstEntry = {
        type: (c && (c.type || c.constructor && c.constructor.name)) || null,
        objects: (c && typeof c.getObjects === "function") ? c.getObjects().length : null,
        width: (c && (c.width || (c.getWidth && c.getWidth()))) || null,
        height: (c && (c.height || (c.getHeight && c.getHeight()))) || null
      };
      if (c && typeof c.getObjects === "function") {
        var textObjs = c.getObjects().filter(function (o) {
          return o && (String(o.type || "").toLowerCase().indexOf("text") >= 0 || o.text != null);
        }).slice(0, 3).map(function (o) {
          var proto = o.constructor && o.constructor.name;
          return {
            constructor: proto,
            text: String(o.text || "").slice(0, 24),
            left: o.left, top: o.top, width: o.width, height: o.height,
            fontSize: o.fontSize, fontFamily: o.fontFamily, fill: o.fill,
            rotation: o.angle, scaleX: o.scaleX, scaleY: o.scaleY,
            originX: o.originX, originY: o.originY,
            zyCreatedByAssistant: !!o.zyCreatedByAssistant, zyFieldKey: o.zyFieldKey || null
          };
        });
        out.canvas.sampleTextObjects = textObjs;
      }
    }
  } catch (e) {
    out.canvasError = String(e && e.message || e);
  }
  console.log("[zy-forensics]", JSON.stringify(out, null, 1));
  return out;
})();