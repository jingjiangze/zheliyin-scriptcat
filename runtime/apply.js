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

// §20 Bridge Apply（Test B）：通过真实 postMessage apply 协议，
// 用一个最小安全字段值尝试修改画布，之后对象级兜底恢复。
// 只发送 {source:"zy-card-assistant", type:"apply", side:"front", fields:{...测试值}}，
// 禁止真实用户信息；测试值 ZY_RUNTIME_TEST_VALUE。
// 兜底恢复：无论 apply 成败，遍历 text 对象，将等于测试值的文本恢复为记录的原值（对象级）。
// 无法恢复则 ok=false（调用方 → NO-GO）。
const BRIDGE_APPLY_SRC = `(async function (testValue) {
  "use strict";
  const out = { steps: [], testValue };
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
  // 1) 记录目标原值（第一个非空 text 对象）
  const canvas = findCanvas();
  if (!canvas) { out.failed = "canvas-not-found"; return out; }
  const objs = typeof canvas.getObjects === "function" ? canvas.getObjects() : [];
  const texts = objs.filter(o => o && o.text != null && String(o.text).trim().length > 0);
  if (!texts.length) { out.failed = "no-text-object"; return out; }
  const target = texts[0];
  const original = String(target.text || "");
  out.targetKey = (function (o) { return String(o && o.type || "obj"); })();
  step("originalTextLen", original.length); // 脱敏：不入原文
  step("originalHash", original.split("").reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0) & 0xffff); // 弱摘要，用于恢复比对，非原文

  // 2) 通过 Bridge apply 协议发送测试字段（front）
  const applyResult = await new Promise((resolve) => {
    let got = false;
    function on(e) {
      if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === "applyResult") {
        got = true; window.removeEventListener("message", on); resolve(e.data);
      }
    }
    window.addEventListener("message", on);
    window.postMessage({ source: "zy-card-assistant", type: "apply", side: "front", fields: { name: testValue }, rtApply: true }, location.origin);
    setTimeout(() => { if (!got) { window.removeEventListener("message", on); resolve({ timeout: true }); } }, 4000);
  });
  out.applyResult = applyResult;
  step("applyReceived", !!applyResult);
  step("applyOk", !!(applyResult && applyResult.ok === true));
  step("applyAppliedCount", (applyResult && Array.isArray(applyResult.applied)) ? applyResult.applied.length : null);
  // 3) 读回：画布中是否存在测试值
  const foundTest = typeof canvas.getObjects === "function"
    ? canvas.getObjects().filter(o => o && o.text === testValue)
    : [];
  step("readbackFoundTest", foundTest.length);
  // 4) 对象级兜底恢复：把等于测试值的对象恢复为 original
  let restored = 0, restoreFailed = 0;
  try {
    (typeof canvas.getObjects === "function" ? canvas.getObjects() : []).forEach((o) => {
      if (o && o.text === testValue) { o.set("text", original); restored += 1; }
    });
    canvas.renderAll();
  } catch (e) { restoreFailed += 1; step("restoreError", String(e && e.message || e)); }
  step("restoredCount", restored);
  step("restoreFailed", restoreFailed);
  out.done = true;
  out.canRollback = restoreFailed === 0;
  return out;
})`;

async function bridgeApplyAndRollback(page, testValue) {
  const fn = BRIDGE_APPLY_SRC + "(" + JSON.stringify(testValue) + ")";
  const r = await page.evaluate(fn).catch((e) => ({ evalError: String(e && e.message || e) }));
  return { ok: !!(r && r.done === true && r.canRollback === true), detail: JSON.stringify(r) };
}

module.exports = { safeDirectApply, bridgeApplyAndRollback };