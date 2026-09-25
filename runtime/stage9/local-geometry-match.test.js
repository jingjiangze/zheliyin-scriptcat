"use strict";
// runtime/stage9/local-geometry-match.test.js — 阶段1 P0-0：本地 OCR 专用几何匹配规则
// 真源：extension/src/ocr/native-geometry-recovery.js（阶段 3 LOCAL）
// 契约：默认 off 行为逐字不变；geometry-only 启用弱文字+唯一性规则；宁缺勿滥；只选已检出 bbox。
const assert = require("assert");
const REC = require("D:/zheliyin-scriptcat/extension/src/ocr/native-geometry-recovery.js");
const recover = REC.recoverNativeGeometry;
if (typeof recover !== "function") { console.error("recoverNativeGeometry 未导出"); process.exit(1); }
const BOUNDS = { x: 0, y: 0, width: 400, height: 300 };
const native = [{ id: 1, rawText: "甲公司", order: 0 }];
const localCand = (text, x, y) => ({ text: text, bbox: { x: x, y: y, width: 80, height: 20 }, sourceProvider: "LOCAL" });
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("[local-match] PASS " + name); } catch (e) { fail++; console.log("[local-match] FAIL " + name + " :: " + String(e && e.message || e)); } };

// 1 默认 off：本地文本相似度低（<minSim 0.8）→ 不恢复（历史行为不变）
t("1 off 默认：低相似本地候选被拒（历史行为）", () => {
  const r = recover(native, { localCandidates: [localCand("甲公旬", 10, 10)], imageBounds: BOUNDS });
  assert.strictEqual(r.recovered.length, 0, "off 时不得恢复");
  assert.strictEqual(r.unresolved.length, 1);
});

// 2 geometry-only：同「同脚本类型 + 长度带 + 唯一」→ 恢复，方法具名，score 上限 0.7
t("2 geometry-only：弱文字 + 唯一 → 恢复且 method/score/evidence 合规", () => {
  const r = recover(native, { localCandidates: [localCand("甲公旬", 10, 10)], imageBounds: BOUNDS, localRule: "geometry-only" });
  assert.strictEqual(r.recovered.length, 1, "应恢复 1 行");
  const m = r.recovered[0];
  assert.strictEqual(m.source, "LOCAL");
  assert.strictEqual(m.method, "LOCAL_GEOMETRY_ONLY");
  assert.ok(m.score <= 0.7 + 1e-9, "score 必须 <= 0.7，实际 " + m.score);
  assert.ok(String(m.evidence.join("|")).indexOf("rule=geometry-only") >= 0);
  assert.ok(m.geometry && m.geometry.bbox && m.geometry.bbox.width === 80);
});

// 3 唯一性硬门：两个同分候选 → NONE（宁缺勿滥，不许乱配）
t("3 geometry-only：唯一性不足 → NONE", () => {
  const r = recover(native, { localCandidates: [localCand("甲公旬", 10, 10), localCand("甲公甸", 10, 120)], imageBounds: BOUNDS, localRule: "geometry-only" });
  assert.strictEqual(r.recovered.length, 0, "歧义时必须不恢复");
});

// 4 高相似仍走加分路径（保留既有语义）
t("4 geometry-only：高相似候选优先并被采用", () => {
  const r = recover(native, { localCandidates: [localCand("甲公旬", 10, 10), localCand("甲公司", 10, 120)], imageBounds: BOUNDS, localRule: "geometry-only" });
  assert.strictEqual(r.recovered.length, 1);
  assert.strictEqual(r.recovered[0].geometry.bbox.x, 10);
});

// 5 几何硬门仍生效：越界候选被 OUTSIDE_IMAGE 拒（规则不放宽几何）
t("5 geometry-only：几何硬门不放宽（越界拒绝）", () => {
  const r = recover(native, { localCandidates: [localCand("甲公旬", 380, 290)], imageBounds: { x: 0, y: 0, width: 100, height: 60 }, localRule: "geometry-only" });
  assert.strictEqual(r.recovered.length, 0, "越界不得恢复");
});

// 6 已占用几何不得复用（占位约束）
t("6 geometry-only：已占用几何不被重复采用", () => {
  const r = recover(native, { localCandidates: [localCand("甲公旬", 10, 10)], occupiedGeometries: [{ bbox: { x: 10, y: 10, width: 80, height: 20 } }], imageBounds: BOUNDS, localRule: "geometry-only" });
  assert.strictEqual(r.recovered.length, 0, "已占用不得复用");
});

console.log("[local-match] pass=" + pass + " fail=" + fail);
process.exit(fail ? 1 : 0);
