// runtime/stage8d/ink-measure.test.js — Stage 8D P6-1：Rendered Ink 测量单测
// 纯函数核（computeAlphaInkBounds / fontDeclaration / resolveLines / buildInkDiagnostics）node 直接测；
// canvas 渲染分支在 node 无 document → 必须返回 ok:false/NO_CANVAS 且不抛异常（真机 v21 再验证实测）。
"use strict";
const assert = require("assert");
const I = require("../../extension/src/editor/ink-measure.js");

let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); } }

// 合成 RGBA：rect {x0,y0,x1,y1} 内 alpha=255，其余 0
function makeData(w, h, rect) {
  const d = new Uint8ClampedArray(w * h * 4);
  if (rect) {
    for (let y = rect.y0; y <= rect.y1; y += 1) {
      for (let x = rect.x0; x <= rect.x1; x += 1) {
        d[(y * w + x) * 4 + 3] = 255;
      }
    }
  }
  return d;
}

// ---- computeAlphaInkBounds ----
t("alpha bbox: 居中矩形", () => {
  const b = I.computeAlphaInkBounds(10, 10, makeData(10, 10, { x0: 2, y0: 3, x1: 5, y1: 6 }));
  assert.strictEqual(b.inkLeft, 2);
  assert.strictEqual(b.inkTop, 3);
  assert.strictEqual(b.inkRight, 5);
  assert.strictEqual(b.inkBottom, 6);
  assert.strictEqual(b.inkWidth, 4);
  assert.strictEqual(b.inkHeight, 4);
  assert.strictEqual(b.alphaPixels, 16);
});
t("alpha bbox: 全空 → null", () => {
  assert.strictEqual(I.computeAlphaInkBounds(8, 8, makeData(8, 8, null)), null);
});
t("alpha bbox: 单像素", () => {
  const b = I.computeAlphaInkBounds(10, 10, makeData(10, 10, { x0: 7, y0: 7, x1: 7, y1: 7 }));
  assert.strictEqual(b.inkWidth, 1);
  assert.strictEqual(b.inkHeight, 1);
});
t("alpha bbox: 非法输入 → null 不抛", () => {
  assert.strictEqual(I.computeAlphaInkBounds(0, 10, []), null);
  assert.strictEqual(I.computeAlphaInkBounds(10, 10, null), null);
  assert.strictEqual(I.computeAlphaInkBounds(10, 10, new Uint8ClampedArray(10)), null);
});
// ---- fontDeclaration ----
t("fontDeclaration: 默认与覆盖", () => {
  assert.strictEqual(I.fontDeclaration({}), "normal normal 16px sans-serif");
  assert.strictEqual(I.fontDeclaration({ fontSize: 40, fontFamily: "SimHei" }), "normal normal 40px SimHei");
  assert.strictEqual(I.fontDeclaration({ fontSize: 20, fontWeight: "bold", fontStyle: "italic", fontFamily: "Arial" }), "italic bold 20px Arial");
});
// ---- resolveLines ----
t("resolveLines: fabric _textLines 二维数组", () => {
  assert.deepStrictEqual(I.resolveLines({ _textLines: [["佛", "山"], ["盛", "盈"]] }), ["佛山", "盛盈"]);
});
t("resolveLines: 按\\n拆分 / 单行 / 空", () => {
  assert.deepStrictEqual(I.resolveLines({ text: "a\nb" }), ["a", "b"]);
  assert.deepStrictEqual(I.resolveLines({ text: "solo" }), ["solo"]);
  assert.deepStrictEqual(I.resolveLines({}), []);
});
// ---- node 无 document：canvas 分支必须优雅降级 ----
t("measureRenderedInk: node 无 canvas → NO_CANVAS 不抛", () => {
  const r = I.measureRenderedInk({ text: "测试", fontSize: 40, fontFamily: "SimHei" });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "NO_CANVAS");
});
t("measureFabricObjectInk: null → NO_OBJECT", () => {
  const r = I.measureFabricObjectInk(null);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "NO_OBJECT");
});
t("measureFabricObjectInk: 无 document 对象 → 降级 NO_CANVAS", () => {
  const r = I.measureFabricObjectInk({ text: "x", fontSize: 12, fontFamily: "Arial" });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "NO_CANVAS");
});
// ---- buildInkDiagnostics（三层对比，纯函数） ----
t("buildInkDiagnostics: 三层全齐含比例/gap/状态", () => {
  const d = I.buildInkDiagnostics({
    source: { width: 220, height: 30 },
    target: { width: 240, height: 46, fontSize: 40 },
    actual: { ok: true, inkWidth: 228, inkHeight: 38 }
  });
  assert.strictEqual(d.status, "INK_READY");
  assert.strictEqual(d.inkGap.width, 12);
  assert.strictEqual(d.inkGap.height, 8);
  assert.strictEqual(d.sourceTargetRatio.width, Math.round((220 / 240) * 1000) / 1000);
  assert.strictEqual(d.inkTargetRatio.width, Math.round((228 / 240) * 1000) / 1000);
  assert.deepStrictEqual(d.flags, []);
});
t("buildInkDiagnostics: ink 宽于 target → INK_WIDER_THAN_TARGET", () => {
  const d = I.buildInkDiagnostics({ target: { width: 100, height: 30 }, actual: { ok: true, inkWidth: 160, inkHeight: 20 } });
  assert.ok(d.flags.indexOf("INK_WIDER_THAN_TARGET") >= 0);
  assert.strictEqual(d.status, "INK_READY");
});
t("buildInkDiagnostics: 无 actual → INK_MISSING；无 target → NO_TARGET", () => {
  assert.ok(I.buildInkDiagnostics({ target: { width: 100 } }).flags.indexOf("INK_MISSING") >= 0);
  assert.ok(I.buildInkDiagnostics({ actual: { ok: true, inkWidth: 10 } }).flags.indexOf("NO_TARGET") >= 0);
  assert.strictEqual(I.buildInkDiagnostics({}).flags.indexOf("NO_TARGET") >= 0, true);
});
t("buildInkDiagnostics: 全缺不抛异常", () => {
  let d = null;
  try { d = I.buildInkDiagnostics(null); } catch (e) { assert.fail("buildInkDiagnostics(null) 抛异常"); }
  assert.strictEqual(d.status, "INK_MISSING");
});
// ---- API 存在性 ----
t("API 导出齐全", () => {
  ["computeAlphaInkBounds", "fontDeclaration", "resolveLines", "measureRenderedInk", "measureFabricObjectInk", "buildInkDiagnostics"].forEach((k) => {
    assert.strictEqual(typeof I[k], "function", "missing export " + k);
  });
});

console.log("ink-measure.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);