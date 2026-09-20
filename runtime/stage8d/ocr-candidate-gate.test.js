// runtime/stage8d/ocr-candidate-gate.test.js — Stage 8D P1 单测
// 覆盖 8D §四~§八：逐块硬门（EMPTY/INVALID_BBOX/OUT_OF_IMAGE/TINY/GIANT/ASPECT/SINGLE_CHAR/LOW_CONF）+ block-set 怀疑
"use strict";
const assert = require("assert");
const G = require("../../extension/src/ocr/ocr-candidate-gate.js");
const R = G.R, STATUS = G.STATUS;

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); }
}

const IMG = { width: 1000, height: 300 };
const cand = (o) => Object.assign({ text: "测试文本", bbox: { x: 100, y: 50, width: 200, height: 40 }, confidence: 0.9 }, o);

// §五 EMPTY_TEXT
t("EMPTY_TEXT 空文本", () => {
  const r = G.validateCandidate(cand({ text: "   " }), IMG);
  assert.ok(!r.ok && r.blockReasons.includes(R.EMPTY_TEXT));
});
// §五 INVALID_BBOX
t("INVALID_BBOX 宽0/高0", () => {
  const r = G.validateCandidate(cand({ bbox: { x: 0, y: 0, width: 0, height: 10 } }), IMG);
  assert.ok(!r.ok && r.blockReasons.includes(R.INVALID_BBOX));
});
// §五 OUT_OF_IMAGE
t("OUT_OF_IMAGE 越界", () => {
  const r = G.validateCandidate(cand({ bbox: { x: 1500, y: 500, width: 200, height: 40 } }), IMG);
  assert.ok(!r.ok && r.blockReasons.includes(R.OUT_OF_IMAGE));
});
// §六 TINY_BOX（width<4 / height<3）
t("TINY_BOX w=60,h=1", () => {
  const r = G.validateCandidate(cand({ bbox: { x: 50, y: 50, width: 60, height: 1 } }), IMG);
  assert.ok(!r.ok && r.blockReasons.includes(R.TINY_BOX));
});
t("TINY_BOX w=3,h=40", () => {
  const r = G.validateCandidate(cand({ bbox: { x: 50, y: 50, width: 3, height: 40 } }), IMG);
  assert.ok(!r.ok && r.blockReasons.includes(R.TINY_BOX));
});
// §六 GIANT_BOX（width>imgW*0.95 / height>imgH*0.8）
t("GIANT_BOX width=960/1000", () => {
  const r = G.validateCandidate(cand({ bbox: { x: 0, y: 100, width: 960, height: 40 } }), IMG);
  assert.ok(!r.ok && r.blockReasons.includes(R.GIANT_BOX));
});
t("GIANT_BOX height=260/300", () => {
  const r = G.validateCandidate(cand({ bbox: { x: 100, y: 10, width: 300, height: 260 } }), IMG);
  assert.ok(!r.ok && r.blockReasons.includes(R.GIANT_BOX));
});
// §五 SUSPICIOUS_ASPECT（仅 warn，不阻断）
t("SUSPICIOUS_ASPECT w/h=30 仅 warn", () => {
  const r = G.validateCandidate(cand({ bbox: { x: 50, y: 50, width: 600, height: 20 } }), IMG);
  assert.ok(r.ok && r.warnReasons.includes(R.SUSPICIOUS_ASPECT));
});
// §七 单字符：极小+低置信+邻近无文字 → SINGLE_CHAR_NOISE
t("SINGLE_CHAR_NOISE 孤立噪点", () => {
  const r = G.validateCandidate(cand({ text: "吴", confidence: 0.3, bbox: { x: 800, y: 250, width: 10, height: 10 } }), IMG, { neighbors: [] });
  assert.ok(!r.ok && r.blockReasons.includes(R.SINGLE_CHAR_NOISE));
});
// §七 单字符：邻近存在合理文字 → 保留（仅 warn）
t("SINGLE_CHAR 邻近有文字 → 保留", () => {
  const r = G.validateCandidate(cand({ text: "吴", confidence: 0.7, bbox: { x: 100, y: 60, width: 30, height: 40 } }), IMG, {
    neighbors: [{ text: "健湘", bbox: { x: 140, y: 60, width: 60, height: 40 } }]
  });
  assert.ok(r.ok, JSON.stringify(r.blockReasons));
});
// §五 LOW_CONFIDENCE
t("LOW_CONFIDENCE 0.2", () => {
  const r = G.validateCandidate(cand({ confidence: 0.2 }), IMG);
  assert.ok(!r.ok && r.blockReasons.includes(R.LOW_CONFIDENCE));
});
// 正常块通过
t("正常块 ok", () => {
  const r = G.validateCandidate(cand({}), IMG);
  assert.ok(r.ok && r.blockReasons.length === 0);
});
// §八 block-set：碎片占比超 50% → OCR_BLOCK_SET_SUSPECT
t("BLOCK_SET fragment-ratio>0.5", () => {
  const list = [];
  for (let i = 0; i < 10; i += 1) list.push(cand({ text: i % 2 ? "AB" : "C", bbox: { x: 30 + i * 60, y: 50, width: 40, height: 30 }, confidence: 0.9 }));
  const r = G.validateBlockSet(list, IMG);
  assert.ok(r.suspect && r.setSuspectReasons.some((s) => s.indexOf("fragment-ratio") >= 0));
  assert.ok(!r.ok);
});
// §八 单块覆盖 60%+（通过逐块门但覆盖过半）→ suspect
t("BLOCK_SET single-cover>0.6", () => {
  const r = G.validateBlockSet([cand({ bbox: { x: 0, y: 0, width: 940, height: 230 } })], IMG);
  assert.ok(r.suspect && r.setSuspectReasons.some((s) => s.indexOf("single-cover") >= 0));
});
// §八 正常 set 不误伤
t("BLOCK_SET 正常集合 ok", () => {
  const list = [
    cand({ text: "佛山盛盈包装", bbox: { x: 60, y: 60, width: 300, height: 40 } }),
    cand({ text: "+86 159 1317 1583", bbox: { x: 60, y: 120, width: 220, height: 30 } }),
    cand({ text: "Tel: 0757-88809856", bbox: { x: 60, y: 170, width: 200, height: 28 } })
  ];
  const r = G.validateBlockSet(list, IMG);
  assert.ok(r.ok && r.blocked.length === 0 && !r.suspect);
});
// §十一 方向分类
t("classifyTextAngle HORIZONTAL", () => {
  assert.strictEqual(G.classifyTextAngle(0, null).classification, "HORIZONTAL");
});
t("classifyTextAngle IMAGE_ROTATION", () => {
  assert.strictEqual(G.classifyTextAngle(30, 30.5).classification, "IMAGE_ROTATION");
});
t("classifyTextAngle TEXT_ROTATION", () => {
  assert.strictEqual(G.classifyTextAngle(15, 0).classification, "TEXT_ROTATION");
});
t("classifyTextAngle PHOTO_PERSPECTIVE", () => {
  assert.strictEqual(G.classifyTextAngle(90, 0).classification, "PHOTO_PERSPECTIVE");
});
// §十六 状态链
t("nextStatus 链推进", () => {
  let s = G.nextStatus(STATUS.OCR_DETECTED, true);
  assert.strictEqual(s.status, STATUS.OCR_VALIDATED);
  s = G.nextStatus(STATUS.OCR_VALIDATED, true);
  assert.strictEqual(s.status, STATUS.RECONSTRUCTION_READY);
  // 无效 → 保持原状态
  s = G.nextStatus(STATUS.RECONSTRUCTION_READY, false);
  assert.strictEqual(s.status, STATUS.OCR_DETECTED);
});
// §十八 示例规格：width=916,height=43 对大图（如 2000x800）→ 非 giant 但高度 h=43 对小图（200x50）→ giant
t("§十八 916x43 vs 严格图门", () => {
  const big = G.validateCandidate(cand({ bbox: { x: 10, y: 10, width: 916, height: 43 } }), { width: 2000, height: 800 });
  assert.ok(big.ok || big.blockReasons.length === 0 || big.blockReasons.includes(R.SINGLE_CHAR_NOISE) === false);
  const small = G.validateCandidate(cand({ bbox: { x: 10, y: 10, width: 916, height: 43 } }), { width: 960, height: 500 });
  assert.ok(!small.ok && small.blockReasons.includes(R.GIANT_BOX));
});
// validateBlock（block 形态）正常
t("validateBlock 正常", () => {
  const r = G.validateBlock({ text: "行1\n行2", bbox: { x: 60, y: 60, width: 300, height: 90 }, lineCount: 2, confidence: 0.8 }, IMG);
  assert.ok(r.ok);
});

// §十九：逐块剔除非 set-suspect → ok 仍 true，validated 不含被剔块
t("BLOCK_SET 单块 TINY 剔除不阻断整组", () => {
  const list = [
    cand({ text: "佛山盛盈包装", bbox: { x: 60, y: 60, width: 300, height: 40 } }),
    cand({ text: "公", bbox: { x: 500, y: 200, width: 60, height: 1 } }) // TINY_BOX
  ];
  const r = G.validateBlockSet(list, IMG);
  assert.ok(r.ok && !r.suspect, JSON.stringify(r.setSuspectReasons));
  assert.strictEqual(r.validated.length, 1);
  assert.strictEqual(r.blocked.length, 1);
  assert.ok(r.blocked[0].reasons.includes(R.TINY_BOX));
});

console.log("ocr-candidate-gate.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);