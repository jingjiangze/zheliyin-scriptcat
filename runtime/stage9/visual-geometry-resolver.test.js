// runtime/stage9/visual-geometry-resolver.test.js — Stage 9.9 Commit A 单测
"use strict";
const assert = require("assert");
const { resolveVisualSource } = require("../../extension/src/editor/visual-geometry-resolver");

let pass = 0, fail = 0;
const t = (name, cond, extra) => { if (cond) { pass += 1; console.log("PASS " + name); } else { fail += 1; console.error("FAIL " + name + (extra ? " :: " + JSON.stringify(extra) : "")); } };
const BBOX = { x: 100, y: 200, width: 176, height: 60 };

// 1) 默认关闭：给任何 ink 都用 bbox，并标记禁用原因
t("disabled-uses-bbox", (() => { const r = resolveVisualSource({ bbox: BBOX, inkCandidate: { ok: true, inkBox: { x: 150, y: 150, width: 99, height: 111 }, confidence: 1 }, enabled: false }); return r.authority === "OCR_BBOX" && r.srcBox.x === 100 && r.reason === "INK_GEOMETRY_DISABLED"; })());
// 2) 无 ink → bbox
t("no-ink-bbox", (() => { const r = resolveVisualSource({ bbox: BBOX, inkCandidate: null, enabled: true }); return r.authority === "OCR_BBOX" && r.reason === "INK_NO_VALID_CANDIDATE"; })());
// 3) ink ok 但 conf 低 → bbox
t("low-conf-bbox", (() => { const r = resolveVisualSource({ bbox: BBOX, inkCandidate: { ok: true, inkBox: { x: 100, y: 200, width: 176, height: 60 }, confidence: 0.1 }, enabled: true }); return r.authority === "OCR_BBOX" && r.reason === "INK_LOW_CONFIDENCE"; })());
// 4) 开启 + 一致性通过（中心一致）→ IMAGE_INK
t("gate-pass-ink", (() => { const r = resolveVisualSource({ bbox: BBOX, inkCandidate: { ok: true, inkBox: { x: 102, y: 198, width: 172, height: 64 }, confidence: 0.9 }, enabled: true, opts: { tolPx: 8 } }); return r.authority === "IMAGE_INK" && r.srcBox.x === 102; })());
// 5) 开启 + 一致性失败（中心右移 40px —— 真机实测 13719111188 场景）→ 回落 bbox
t("gate-fail-rollback", (() => { const r = resolveVisualSource({ bbox: BBOX, inkCandidate: { ok: true, inkBox: { x: 600, y: 200, width: 16, height: 30 }, confidence: 1 }, enabled: true, opts: { tolPx: 8 } }); return r.authority === "OCR_BBOX" && r.reason === "INK_CONSISTENCY_FAIL" && r.srcBox.x === 100 && r.delta && r.delta.dx > 30; })());
// 6) 开启 + 尺寸差异超限（跨行大团块 99×111 vs 176×60）→ 回落 bbox
t("gate-size-rollback", (() => { const r = resolveVisualSource({ bbox: BBOX, inkCandidate: { ok: true, inkBox: { x: 140, y: 190, width: 99, height: 111 }, confidence: 1 }, enabled: true, opts: { tolPx: 8 } }); return r.authority === "OCR_BBOX" && r.reason === "INK_CONSISTENCY_FAIL"; })());
// 7) 默认关闭时 candidate 仍随行返回（诊断保留）
t("disabled-keeps-candidate", (() => { const r = resolveVisualSource({ bbox: BBOX, inkCandidate: { ok: true, inkBox: { x: 150, y: 150, width: 99, height: 111 }, confidence: 0.7 }, enabled: false }); return r.candidate && r.candidate.inkBox && r.candidate.confidence === 0.7; })());

console.log("\nRESULT: pass=" + pass + " fail=" + fail);
process.exit(fail ? 1 : 0);
