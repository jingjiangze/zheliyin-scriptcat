// 折立印 Runtime 取证脚本（Stage 7.1 Current Page Resolver 运行时调查）
// 用法：登录折立印并打开「真实设计器」页面后，在 DevTools Console 粘贴本文件全部内容回车。
// 作用：仅读取并打印运行时拓扑/对象摘要，不修改任何页面对象，不点击任何 UI，不保存。
// 敏感信息脱敏：URL 中 token/key/sign 掩码；不输出 cookie/账号/API Key；文本只截 24 字符。
(() => {
  "use strict";
  function maskUrl(u) {
    return String(u || "").replace(/([?&](?:token|key|secret|sign)=)[^&#]*/gi, "$1***").slice(0, 200);
  }
  function safe(v, max) {
    try {
      if (v === undefined || v === null) return v;
      var t = typeof v;
      if (t === "string") return v.slice(0, max || 200);
      if (t === "number" || t === "boolean") return v;
      if (t === "function") return "[function]";
      var s = String(v);
      return s.length > (max || 200) ? s.slice(0, max || 200) + "…" : s;
    } catch (e) { return "[err:" + (e && e.message || e) + "]"; }
  }
  function keysOf(v, maxKeys) {
    try {
      if (!v || (typeof v !== "object" && typeof v !== "function")) return [];
      var ks = Object.getOwnPropertyNames(v);
      return ks.slice(0, maxKeys || 40);
    } catch (e) { return ["[err]"]; }
  }
  function moduleOf(name) {
    try {
      var req = window.requirejs || window.require;
      var ctx = req && req.s && req.s.contexts && req.s.contexts._;
      return (ctx && ctx.defined && ctx.defined[name]) || null;
    } catch (e) { return null; }
  }
  function describe(args) { return Array.prototype.slice.call(args).map(function (a) { return safe(a, 30); }).join(" | "); }
  var out = {
    ts: new Date().toISOString(),
    href: maskUrl(location.href),
    topWindow: { isTop: window === top, framesCount: window.frames.length, iframeTags: document.querySelectorAll("iframe").length },
    globals: {
      CanvasObjVO: !!window.CanvasObjVO,
      CurrentCanvas: !!window.CurrentCanvas,
      fabric: !!window.fabric,
      requirejs: !!(window.requirejs || window.require)
    }
  };
  var req = window.requirejs || window.require;
  var ctx = req && req.s && req.s.contexts && req.s.contexts._;
  var defined = (ctx && ctx.defined) || {};
  out.definedModules = {
    total: Object.keys(defined).length,
    has: ["CanvasObjVO", "CanvasDiy", "CurrentCanvas", "Undo", "sundry", "DesignVO", "DesignPageVO", "layer", "SimpleCommandManager"].map(function (n) { return n + "=" + !!defined[n]; })
  };
  var CanvasObjVO = defined.CanvasObjVO || window.CanvasObjVO;
  if (CanvasObjVO) {
    var total = CanvasObjVO.totalCanvasArray;
    var entries = Array.isArray(total) ? total : null;
    out.canvasObjVO = {
      ownKeys: keysOf(CanvasObjVO, 30),
      totalCanvasArray: entries ? entries.length : safe(total),
      hasCanvasObjInfo: !!CanvasObjVO.canvasObjInfo,
      hasCurrCanvasObjInfo: !!CanvasObjVO.currCanvasObjInfo
    };
    if (entries) {
      out.totalEntries = entries.map(function (d, i) {
        var dk = {};
        try {
          Object.getOwnPropertyNames(d).forEach(function (k) { dk[k] = "…"; });
        } catch (e) {}
        var c = d && d.canvas;
        var info = d && d.canvasObjInfo;
        var rez = {
          index: i,
          entryOwnKeys: Object.keys(dk),
          ctor: d && d.constructor ? String(d.constructor.name || "") : null,
          drawTextFn: !!(d && typeof d.drawText === "function"),
          canvas: c ? {
            objs: (c.getObjects && c.getObjects().length) || null,
            w: c.width || null, h: c.height || null,
            isSameAsCurrent: null
          } : null,
          canvasObjInfo: info ? {
            listLen: (info.canvasToProductObjArr && info.canvasToProductObjArr.length) || null
          } : null
        };
        // 与 CurrentCanvas.getCurrentCanvas() 比对（当前编辑画布标识）
        try {
          var CC = defined.CurrentCanvas || window.CurrentCanvas;
          if (CC && typeof CC.getCurrentCanvas === "function") {
            var cur = CC.getCurrentCanvas();
            var curC = cur && (cur.canvas || cur);
            if (curC && c) rez.canvas.isSameAsCurrent = curC === c;
          }
        } catch (e) { rez.currentCompareErr = safe(e && e.message || e, 80); }
        return rez;
      });
    }
    // 单条对象的身份字段样例（脱敏）— 判断 front/back 是否为真实业务字段
    try {
      var first = entries && entries[0];
      var fc = first && (first.canvas || first);
      if (fc && fc.getObjects) {
        var sample = fc.getObjects().slice(0, 2).map(function (o) {
          if (!o) return null;
          var picked = {};
          ["multiUuid", "markuuid", "layerNum", "mediaMediaType", "isDesign", "isBack", "pageId", "pageIndex", "side", "version", "locationY", "printLocationX"].forEach(function (k) {
            if (o[k] !== undefined) picked[k] = safe(o[k], 24);
          });
          picked.type = safe(o.type || "", 16);
          picked.text = o.text != null ? String(o.text).slice(0, 24) : undefined;
          picked.ownKeys = keysOf(o, 16);
          return picked;
        });
        out.sampleObjects = sample;
      }
    } catch (e) { out.sampleErr = safe(e && e.message || e, 80); }
    // 侧面/页面 UI 入口探测（只读 DOM，不点击）
    try {
      var sideUi = [];
      document.querySelectorAll("[class*='side'], [class*='page'], [class*='back'], [class*='front'], [class*='tab'], [id*='side'], [id*='page']").forEach(function (el) {
        var cls = String(el.className || "").slice(0, 60);
        var id = String(el.id || "").slice(0, 40);
        var txt = String(el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24);
        sideUi.push("cls=" + cls + " id=" + id + " txt=" + txt);
      });
      out.sideUiProbe = { found: sideUi.length, samples: sideUi.slice(0, 6) };
      // 是否有「背面/反面/添加页面」文本入口
      var pageTxt = [];
      ["背面", "反面", "正面", "添加页面", "下一页"].forEach(function (kw) {
        pageTxt.push(kw + "=" + document.body.innerHTML.indexOf(kw));
      });
      out.pageKeywordProbe = pageTxt;
    } catch (e) { out.sideUiErr = safe(e && e.message || e, 80); }
  } else {
    out.canvasObjVO = null;
  }
  try {
    var CU = defined.CurrentCanvas || window.CurrentCanvas;
    out.currentCanvasApi = CU ? { getCurrentCanvas: typeof CU.getCurrentCanvas } : null;
  } catch (e) {}
  try {
    var U2 = defined.Undo;
    out.undoApi = U2 ? { hasGetInstance: typeof U2.getInstance } : null;
  } catch (e) {}
  console.log("[zy-forensics-7.1]", JSON.stringify(out, null, 1));
  return out;
})();