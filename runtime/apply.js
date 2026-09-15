// runtime/apply.js — RUNTIME-5 Safe Apply / Rollback
// 真实 Canvas 最小修改 + 恢复（§二十一/§二十二 可恢复原则）。
// 只改一个已存在文本对象：记录原值 → 改测试值 → render → 读回 → 恢复 → render → 读回。
// 禁止新建对象/改位置/改字体；结束后画布与原状态一致。
"use strict";

// 页面侧严格可恢复 Apply（Test A：直接 Canvas mutation；Test B 走 Bridge apply 协议）
const SAFE_APPLY_SRC = `(function (mode, testValue) {
  "use strict";
  function klass(o) { return o && o.constructor && o.constructor.name || "unknown"; }
  const out = { mode, testValue, steps: [] };
  function step(k, v) { out.steps.push({ k, v }); }

  function findCanvas() {
    try {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const total = vo && vo.totalCanvasArray;
      if (Array.isArray(total) && total[0]) return (total[0].canvas) || total[0];
    } catch (e) { step("findCanvasError", String(e && e.message || e)); }
    return null;
  }
  const canvas = findCanvas();
  if (!canvas) { out.failed = "canvas-not-found"; return out; }
  const objs = (typeof canvas.getObjects === "function") ? canvas.getObjects() : [];
  const target = objs.find(o => o && o.text != null && String(o.text).trim().length > 0);
  if (!target) { out.failed = "no-text-object"; return out; }

  const original = String(target.text || "");
  step("targetCtor", klass(target));
  step("original", original.slice(0, 40));
  step("targetCoords", { left: target.left, top: target.top });

  if (mode === "direct") {
    // Test A：真实 Canvas mutation（fabric API）
    try {
      target.set("text", testValue);
      canvas.renderAll();
      const readA = String(target.text || "");
      step("afterSet", readA.slice(0, 40));
      step("changed", readA === testValue);
      // 恢复
      target.set("text", original);
      canvas.renderAll();
      const readB = String(target.text || "");
      step("afterRestore", readB.slice(0, 40));
      step("restored", readB === original);
      out.done = true;
    } catch (e) {
      out.failed = "mutate:" + String(e && e.message || e);
      // 失败时尽力恢复
      try { target.set("text", original); canvas.renderAll(); } catch (e2) { out.restoreFailed = String(e2 && e2.message || e2); }
    }
  } else {
    // Test B：Bridge apply 协议（发 apply 改该层文本，再发 apply 恢复）
    out.failed = "nodefaultbridge-applied-via-postMessage"; // placeholder——由调用方决定是否走此路径
  }
  return out;
})`;

async function safeDirectApply(page, testValue) {
  const fn = SAFE_APPLY_SRC + "('direct'," + JSON.stringify(testValue) + ")";
  // 直接作为表达式执行并捕获返回
  const r = await page.evaluate(fn).catch((e) => ({ evalError: String(e && e.message || e) }));
  return { ok: !!(r && r.done === true && r.steps && r.steps.some(s => s.k === "restored" && s.v === true)), detail: JSON.stringify(r) };
}

module.exports = { safeDirectApply };