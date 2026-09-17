// runtime/parity-native-probe.js — BROWSER PARITY 统一 Native E2E 探针 v2
// 纯表达式文本；两侧以相同文本执行（External=page.evaluate，Agent=browser_evaluate）。
// 最小可撤销：ocrCreate 创建 1 个明显标记的测试文字 → 验证进入当前画布+图层数组 →
// 编辑器 UI 原生撤销(.undo，复用既有测试的 jQuery visible+trigger 方式，最多 3 次，1400ms 间隔)
// → 验证移除 → 清理残留并恢复基线。
(async () => {
  const out = { env: null, steps: [], created: null, undo: null, cleanup: null, metrics: null };
  const marker = "PARITY-PROBE-" + Date.now().toString(36);
  try {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const defs = (ctx && ctx.defined) || {};
    const vo = defs.CanvasObjVO || window.CanvasObjVO;
    if (!vo || !vo.totalCanvasArray) {
      out.env = { loaded: false };
      out.steps.push({ tag: "skipped", note: "editor not loaded" });
      return out;
    }
    const total = vo.totalCanvasArray;
    const cur = typeof vo.currentCanvasNum === "number" ? vo.currentCanvasNum : null;
    const diy = (Array.isArray(total) && cur && total[cur - 1]) ? total[cur - 1] : (Array.isArray(total) && total.length ? total[0] : null);
    const c = diy && diy.canvas;
    if (!c || typeof c.getObjects !== "function" || typeof diy.drawText !== "function") {
      out.env = { loaded: true };
      out.steps.push({ tag: "skipped", note: "editor loaded but canvas/drawText unavailable" });
      return out;
    }
    out.env = { loaded: true };
    const snapshot = function () {
      const objs = c.getObjects();
      const layers = diy.canvasObjInfo && diy.canvasObjInfo.canvasToProductObjArr ? diy.canvasObjInfo.canvasToProductObjArr : [];
      const found = objs.find(function (o) { return o && typeof o.text === "string" && o.text.indexOf(marker) === 0; });
      const inLayer = found ? layers.indexOf(found) >= 0 : false;
      return {
        objectCount: objs.length,
        layerLen: layers.length,
        markerOnCanvas: !!found,
        markerInLayer: inLayer,
        markerType: found ? found.type : null,
        markerUuid: found ? (found.uuid || found.multiUuid || null) : null
      };
    };
    out.steps.push(Object.assign({ tag: "before" }, snapshot()));

    const item = { text: marker, blockIndex: 0, left: 60, top: 80, width: 140, height: 30, fontSize: 28, fontFamily: "思源黑体 Regular" };
    const ocr = await new Promise(function (resolve) {
      const to = window.setTimeout(function () { window.removeEventListener("message", on); resolve({ ok: false, timeout: true }); }, 15000);
      const on = function (e) {
        if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === "ocrCreateResult") {
          window.clearTimeout(to);
          window.removeEventListener("message", on);
          resolve(e.data);
        }
      };
      window.addEventListener("message", on);
      window.postMessage({ source: "zy-card-assistant", type: "ocrCreate", items: [item] }, location.origin);
    });
    out.created = { ok: ocr.ok === true, code: ocr.code || null, createdCount: ocr.createdCount, detectedBlocks: ocr.detectedBlocks, mode: ocr.editorIntegration ? ocr.editorIntegration.mode : null };
    out.steps.push(Object.assign({ tag: "afterCreate" }, snapshot()));

    // 原生撤销：复用既有测试已证实的点击方式（jQuery .undo :visible trigger），最多 3 次
    let undoResult = { found: false, clicksUsed: 0, removedAfterUndo: false };
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        let btn = null;
        let usedJquery = false;
        try {
          const $j = window.jQuery;
          if ($j && typeof $j === "function") {
            const $b = $j(".undo").filter(":visible").first();
            if ($b.length) { btn = $b.get(0); $b.trigger("click"); usedJquery = true; }
          }
        } catch (eJ) {}
        if (!btn) {
          const all = Array.prototype.slice.call(document.querySelectorAll(".undo"));
          btn = all.find(function (el) { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) || all[0] || null;
          if (btn) { btn.click(); }
        }
        if (btn) {
          undoResult.found = true;
          undoResult.clicksUsed += 1;
          undoResult.method = usedJquery ? "jquery-visible-trigger" : "querySelector-click";
        }
        await new Promise(function (r) { setTimeout(r, 1400); });
        const st = snapshot();
        if (!st.markerOnCanvas) { undoResult.removedAfterUndo = true; break; }
        if (!btn) break;
      }
    } catch (e) { undoResult.error = String(e && e.message || e); }
    out.undo = undoResult;
    out.steps.push(Object.assign({ tag: "afterUndo" }, snapshot()));

    let removed = 0;
    try {
      const layers = diy.canvasObjInfo && diy.canvasObjInfo.canvasToProductObjArr ? diy.canvasObjInfo.canvasToProductObjArr : [];
      c.getObjects().slice().forEach(function (o) {
        if (o && typeof o.text === "string" && o.text.indexOf(marker) === 0) {
          const li = layers.indexOf(o);
          if (li >= 0) layers.splice(li, 1);
          try { c.remove(o); } catch (eR) {}
          removed += 1;
        }
      });
    } catch (e) { out.cleanup = { error: String(e && e.message || e) }; }
    out.cleanup = Object.assign({ removed: removed }, snapshot());
    out.steps.push(Object.assign({ tag: "afterCleanup" }, snapshot()));

    out.metrics = {
      createdOne: out.created.ok === true && out.created.createdCount === 1,
      nativeMode: out.created.mode === "native",
      landedOnCanvas: out.steps[1].markerOnCanvas === true,
      registeredInLayer: out.steps[1].markerInLayer === true,
      hasUuid: typeof out.steps[1].markerUuid === "string" && out.steps[1].markerUuid.length > 0,
      undoRemoved: out.undo.removedAfterUndo === true,
      finalClean: out.cleanup.markerOnCanvas === false && out.cleanup.markerInLayer === false && out.cleanup.objectCount === out.steps[0].objectCount
    };
  } catch (e) {
    out.steps.push({ tag: "error", error: String(e && e.message || e) });
  }
  return out;
})()
