// runtime/parity-core-probe.js — BROWSER PARITY 统一核心探针（只读）
// 本文件是【纯表达式文本】，不是 Node 模块。由两侧 harness 以相同文本执行：
//   - External Chrome：playwright page.evaluate(fs.readFileSync(本文件))
//   - Agent Browser ：browser_evaluate(fs.readFileSync(本文件))（内容一致）
// 覆盖：env 环境层 + editor 编辑器运行时层 + bridge RPC 只读层。
// 只读，不创建/修改任何对象；脱敏，不输出 cookie/token/完整图数据。
(async () => {
  const out = { env: null, editor: null, bridge: null, errors: [] };

  // ---- 环境层 ----
  try {
    const mod = function (name) {
      try {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        return !!(ctx && ctx.defined && ctx.defined[name]);
      } catch (e) { return false; }
    };
    const cv = function () {
      try {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
        const total = vo && vo.totalCanvasArray;
        const d = (Array.isArray(total) && total[0]) || null;
        const c = d && (d.canvas && typeof d.canvas.getObjects === "function" ? d.canvas : null);
        return {
          canvasCount: Array.isArray(total) ? total.length : 0,
          firstW: c ? c.width : null,
          firstH: c ? c.height : null,
          firstObjs: c ? c.getObjects().length : null
        };
      } catch (e) { return { error: String(e && e.message || e) }; }
    };
    const cb = window.__ZY_CARD_ASSISTANT_BRIDGE__;
    out.env = {
      url: String(location.href).slice(0, 300),
      title: String(document.title || "").slice(0, 120),
      isTop: window === top,
      frames: window.frames.length,
      bridgeMarker: !!(cb && cb.installed === true),
      panelCount: document.querySelectorAll("#zy-card-assistant").length,
      fabric: typeof window.fabric === "object",
      requirejs: !!(window.requirejs || window.require),
      canvasObjVO: mod("CanvasObjVO") || !!window.CanvasObjVO,
      currentCanvas: mod("CurrentCanvas") || !!window.CurrentCanvas,
      canvasDiy: mod("CanvasDiy") || !!window.CanvasDiy,
      canvas: cv(),
      ua: String(navigator.userAgent).slice(0, 160)
    };
  } catch (e) { out.errors.push("env:" + String(e && e.message || e)); }

  // ---- 编辑器运行时层 ----
  try {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const defs = (ctx && ctx.defined) || {};
    const vo = defs.CanvasObjVO || window.CanvasObjVO;
    if (!vo || !vo.totalCanvasArray) {
      out.editor = { loaded: false };
    } else {
      const total = vo.totalCanvasArray;
      const cur = typeof vo.currentCanvasNum === "number" ? vo.currentCanvasNum : null;
      const diy = (Array.isArray(total) && cur && total[cur - 1]) ? total[cur - 1] : (Array.isArray(total) && total.length ? total[0] : null);
      const c = diy && (diy.canvas && typeof diy.canvas.getObjects === "function" ? diy.canvas : (typeof diy.getObjects === "function" ? diy : null));
      const objs = c ? c.getObjects() : [];
      const dist = {};
      objs.forEach(function (o) { const t = o.type || "unknown"; dist[t] = (dist[t] || 0) + 1; });
      out.editor = {
        loaded: true,
        totalCanvasArrayLength: Array.isArray(total) ? total.length : 0,
        currentCanvasNum: cur,
        canvasPagesNum: vo.canvasPagesNum != null ? vo.canvasPagesNum : null,
        frontImgPathStr: typeof vo.frontImgPathStr === "string",
        backImgPathStr: typeof vo.backImgPathStr === "string",
        objectCount: objs.length,
        textboxCount: objs.filter(function (o) { return o.type === "textbox" || o.type === "text"; }).length,
        objectTypeDistribution: dist,
        canvasWidth: c ? c.width : null,
        canvasHeight: c ? c.height : null,
        hasDrawText: !!(diy && typeof diy.drawText === "function"),
        hasCanvasObjInfo: !!(diy && diy.canvasObjInfo),
        layerArrLen: diy && diy.canvasObjInfo && diy.canvasObjInfo.canvasToProductObjArr ? diy.canvasObjInfo.canvasToProductObjArr.length : null
      };
    }
  } catch (e) { out.editor = { loaded: false, error: String(e && e.message || e) }; }

  // ---- Bridge RPC 只读层（probe / getCanvasInfo / ocrPrepare）----
  try {
    const call = function (type) {
      return new Promise(function (resolve) {
        const to = window.setTimeout(function () { window.removeEventListener("message", on); resolve({ ok: false, timeout: true, type: type }); }, 10000);
        const on = function (e) {
          if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === type + "Result") {
            window.clearTimeout(to);
            window.removeEventListener("message", on);
            const d = e.data || {};
            const sum = { ok: d.ok === true };
            if (type === "probe") sum.canvases = (d.canvases || []).map(function (cc) { return { side: cc.side, found: cc.found, ctor: cc.ctor, width: cc.width, height: cc.height, textObjects: cc.textObjects }; });
            if (type === "getCanvasInfo") { sum.width = d.width; sum.height = d.height; sum.objs = d.objs; sum.textTotal = d.textTotal; sum.imageTotal = d.imageTotal; sum.bgImage = d.bgImage; sum.activeType = d.activeType; }
            if (type === "ocrPrepare") { sum.code = d.code; sum.kind = d.kind; sum.width = d.width; sum.height = d.height; sum.left = d.left; sum.top = d.top; }
            if (d.message) sum.message = String(d.message).slice(0, 120);
            resolve(sum);
          }
        };
        window.addEventListener("message", on);
        window.postMessage({ source: "zy-card-assistant", type: type }, location.origin);
      });
    };
    out.bridge = {
      probe: await call("probe"),
      getCanvasInfo: await call("getCanvasInfo"),
      ocrPrepare: await call("ocrPrepare")
    };
  } catch (e) { out.bridge = { error: String(e && e.message || e) }; }

  return out;
})()
