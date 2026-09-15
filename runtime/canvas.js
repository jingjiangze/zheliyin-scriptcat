// runtime/canvas.js — RUNTIME-4 Canvas Runtime 验证
// 语义探测（requirejs 模块 + fabric API），不依赖固定 className / webpack hash。
// 只读 snapshot + 对象 introspection 摘要（脱敏）。
"use strict";

// 只读：发现 canvas 并输出最小对象摘要（§十九/§二十）
const CANVAS_SNAPSHOT_SRC = `(() => {
  "use strict";
  function klass(o) { return o && o.constructor && o.constructor.name || "unknown"; }
  function mod(name) {
    try {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      return (ctx && ctx.defined && ctx.defined[name]) || null;
    } catch (e) { return null; }
  }
  const report = { canvasCount: 0, canvases: [], objectsTotal: 0, textObjects: [], globalHits: {} };
  ["CanvasObjVO", "CurrentCanvas", "CanvasDiy"].forEach(n => { report.globalHits[n] = !!(mod(n) || window[n]); });

  const vo = mod("CanvasObjVO") || window.CanvasObjVO;
  const cc = mod("CurrentCanvas") || window.CurrentCanvas;
  const total = vo && vo.totalCanvasArray;

  if (Array.isArray(total) && total.length) {
    report.canvasCount = total.length;
    total.forEach((entry, i) => {
      const c = (entry && entry.canvas) || entry;
      if (!c) return;
      const objs = (typeof c.getObjects === "function") ? c.getObjects() : [];
      const texts = Array.isArray(objs) ? objs.filter(o => o && (o.text != null || String(o.type || "").toLowerCase().indexOf("text") >= 0)) : [];
      const t = texts.length ? texts[0] : null;
      report.canvases.push({
        index: i,
        ctor: klass(c),
        width: c.width || (c.getWidth && c.getWidth()) || null,
        height: c.height || (c.getHeight && c.getHeight()) || null,
        objects: objs.length,
        textObjects: texts.length,
        sample: t ? {
          ctor: klass(t),
          text: String(t.text || "").slice(0, 24),
          left: t.left, top: t.top, width: t.width, height: t.height,
          fontSize: t.fontSize, fill: t.fill, angle: t.angle,
          scaleX: t.scaleX, scaleY: t.scaleY,
          originX: t.originX, originY: t.originY,
          hasSet: typeof t.set === "function",
          hasSetCoords: typeof t.setCoords === "function",
          canvasRenderAll: !!(c && typeof c.renderAll === "function")
        } : null
      });
      report.objectsTotal += Array.isArray(objs) ? objs.length : 0;
    });
  } else if (cc && typeof cc.getCurrentCanvas === "function") {
    try {
      const c = cc.getCurrentCanvas();
      if (c) {
        const objs = typeof c.getObjects === "function" ? c.getObjects() : [];
        report.canvasCount = 1;
        report.canvases.push({ index: 0, ctor: klass(c), viaCC: true,
          width: c.width, height: c.height, objects: Array.isArray(objs) ? objs.length : 0 });
        report.objectsTotal = Array.isArray(objs) ? objs.length : 0;
      }
    } catch (e) { report.ccError = String(e && e.message || e); }
  } else {
    report.reason = "no CanvasObjVO.totalCanvasArray and no CurrentCanvas.getCurrentCanvas";
  }
  return report;
})()`;

async function canvasSnapshot(page) {
  return page.evaluate(CANVAS_SNAPSHOT_SRC).catch((e) => ({ evalError: String(e && e.message || e) }));
}

// 与 Stage 4.1 基准 949.15×577.40 / 21 对象 对照（仅多对象场景；首家 21 可能因模板而异）
const BASELINE = { width: 949.15, height: 577.4, objects: 21 };

function assertSnapshot(snap) {
  const c = snap.canvases && snap.canvases[0];
  if (!c) return { ok: false, detail: "canvas not found: " + JSON.stringify(snap) };
  const checks = {
    width: Math.abs(c.width - BASELINE.width) < 3,
    height: Math.abs(c.height - BASELINE.height) < 3,
    objects: c.objects >= 1,
    textCtor: !!c.sample,
    fabricApi: !!(c.sample && c.sample.hasSet && c.sample.hasSetCoords && c.sample.canvasRenderAll)
  };
  return {
    ok: checks.width && checks.height && checks.objects && checks.fabricApi,
    detail: JSON.stringify({ canvas: c, checks })
  };
}

module.exports = { canvasSnapshot, assertSnapshot, BASELINE };