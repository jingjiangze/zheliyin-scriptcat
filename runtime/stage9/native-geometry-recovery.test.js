// runtime/stage9/native-geometry-recovery.test.js — OCR-P1 Commit 2：Native Geometry Recovery 单测
// 覆盖搜索链 BAIDU LINE / BAIDU WORD、硬门（bbox/image-space/overlap/aspect）、不可猜测规则。
// 注意：word 场景必须用「line.text 不可匹配、仅 words 可用」构造，否则完整 line 优先（预期语义）。
"use strict";
const assert = require("assert");
const R = require("../../extension/src/ocr/native-geometry-recovery.js");

let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); } }

const N = (text, order) => ({ id: "n" + order, rawText: text, order: order });
const L = (text, bbox, words, lineIndex) => ({ text: text, bbox: bbox, words: words || null, lineIndex: lineIndex != null ? lineIndex : (bbox ? Math.round(bbox.y / 100) : null), sourceProvider: "BAIDU" });
const W = (text, bbox, lineIndex) => ({ text: text, bbox: bbox, lineIndex: lineIndex, sourceProvider: "BAIDU" });
const B = (x, y, w, h) => ({ x: x, y: y, width: w, height: h });

// ---- 阶段 1：BAIDU LINE ----
t("LINE: exact text sim=1.0 → recovered source=BAIDU_LINE", () => {
  const r = R.recoverNativeGeometry([N("吴健湘", 0)], { lineCandidates: [L("吴健湘", B(10, 20, 200, 24))] });
  assert.strictEqual(r.recovered.length, 1);
  assert.strictEqual(r.recovered[0].source, "BAIDU_LINE");
  assert.strictEqual(r.recovered[0].geometry.bbox.width, 200);
  assert.strictEqual(r.unresolved.length, 0);
  assert.strictEqual(r.rejected.length, 0);
});
t("LINE: containment sim=0.8 → recovered", () => {
  const r = R.recoverNativeGeometry([N("佛山盛盈包装制品有限公司", 0)], { lineCandidates: [L("佛山盛盈包装制品", B(10, 20, 300, 24))] });
  assert.strictEqual(r.recovered.length, 1);
  assert.ok(r.recovered[0].score >= 1.6);
});
t("LINE: text 仅用于匹配 —— 文本失配 → 不恢复（绝不把候选 text 当真值）", () => {
  const r = R.recoverNativeGeometry([N("手写体真值", 0)], { lineCandidates: [L("别的文字", B(10, 20, 200, 24))] });
  assert.strictEqual(r.recovered.length, 0);
  assert.strictEqual(r.unresolved.length, 1);
  assert.strictEqual(r.unresolved[0].rawText, "手写体真值");
});
t("LINE: geometry 对象不携带 text 字段（textbox.text 恒来自 Native）", () => {
  const r = R.recoverNativeGeometry([N("吴健湘", 0)], { lineCandidates: [L("吴健湘", B(10, 20, 200, 24))] });
  assert.deepStrictEqual(r.recovered[0].geometry.text, undefined);
});

// ---- 阶段 2：BAIDU WORD ----
t("WORD: 一条 native ↔ 两个 word box 合并 bbox", () => {
  const r = R.recoverNativeGeometry([N("张三董事长", 0)], {
    lineCandidates: [L("其他识别文本", B(10, 20, 220, 24), [W("张三", B(10, 22, 90, 20), 0), W("董事长", B(105, 22, 90, 20), 0)])]
  });
  assert.strictEqual(r.recovered.length, 1);
  assert.strictEqual(r.recovered[0].source, "BAIDU_WORD");
  assert.strictEqual(r.recovered[0].method, "WORD_ORDER_COVER");
  const g = r.recovered[0].geometry;
  assert.strictEqual(g.synthetic, true);
  assert.strictEqual(g.parts.length, 2);
  assert.strictEqual(g.bbox.width, 185); // union(10..100, 105..195) = 10..195 → w=185
  assert.ok(g.bbox.height >= 20);
});
t("WORD: 三词前缀拼接（地址佛山市 = 地址+佛山+市）", () => {
  const r = R.recoverNativeGeometry([N("地址佛山市", 0)], {
    lineCandidates: [L("其他文本", B(10, 20, 300, 24), [W("地址", B(10, 22, 90, 20), 0), W("佛山", B(105, 22, 90, 20), 0), W("市", B(200, 22, 40, 20), 0)])]
  });
  assert.strictEqual(r.recovered.length, 1);
  assert.strictEqual(r.recovered[0].geometry.parts.length, 3);
  assert.strictEqual(r.recovered[0].evidence[0], "words=3");
});
t("WORD: reading order —— word x 乱序时按阅读序重排", () => {
  const r = R.recoverNativeGeometry([N("张三董事长", 0)], {
    // 数据序 [董事长 x=105, 张三 x=10]；阅读序 x 排序后仍应合并成功
    lineCandidates: [L("其他文本", B(10, 20, 220, 24), [W("董事长", B(105, 22, 90, 20), 0), W("张三", B(10, 22, 90, 20), 0)])]
  });
  assert.strictEqual(r.recovered.length, 1);
  assert.strictEqual(r.recovered[0].geometry.parts.length, 2);
  assert.ok(r.recovered[0].evidence.some(e => e.indexOf("reading-order") === 0));
});
t("WORD: 噪声词不同行（lineIndex 隔离）不参与合并", () => {
  const r = R.recoverNativeGeometry([N("张三董事长", 0)], {
    lineCandidates: [L("其他文本", B(10, 20, 220, 24), [W("张三", B(10, 22, 90, 20), 0), W("董事长", B(105, 22, 90, 20), 0), W("噪", B(500, 400, 30, 20), 3)])]
  });
  assert.strictEqual(r.recovered.length, 1);
  assert.strictEqual(r.recovered[0].geometry.parts.length, 2); // 噪声词未混入
});

// ---- 硬门 / 不可恢复 ----
t("REJECT: 无 line 文本且无 word → NO_LINE_CANDIDATE → unresolved", () => {
  const r = R.recoverNativeGeometry([N("难以辨认的行", 0)], { lineCandidates: [] });
  assert.strictEqual(r.recovered.length, 0);
  assert.strictEqual(r.unresolved.length, 1);
  assert.strictEqual(r.rejected[0].reason, "NO_LINE_CANDIDATE");
});
t("REJECT: 阅读序破坏（字序与 native 失配）→ WORD_ROW_NOT_EXPLAINABLE", () => {
  // 字散为 董/事/张/三（x 序），orderedCover 无法沿 reading order 拼出「张三董事长」→ 不可解释
  const r = R.recoverNativeGeometry([N("张三董事长", 0)], {
    lineCandidates: [L("其他文本", B(10, 20, 300, 24), [W("董", B(10, 22, 40, 20), 0), W("事", B(105, 22, 40, 20), 0), W("张", B(200, 22, 40, 20), 0), W("三", B(300, 22, 40, 20), 0)])]
  });
  assert.strictEqual(r.recovered.length, 0);
  assert.strictEqual(r.rejected[0].reason, "WORD_ROW_NOT_EXPLAINABLE");
});
t("REJECT: 词行内 y 差过大 → 行结构不可解释（同 lineIndex）", () => {
  const r = R.recoverNativeGeometry([N("张三董事长", 0)], {
    lineCandidates: [L("其他文本", B(10, 20, 220, 24), [W("张三", B(10, 22, 90, 20), 0), W("董事长", B(105, 300, 90, 20), 0)])]
  });
  assert.strictEqual(r.recovered.length, 0);
  assert.strictEqual(r.rejected[0].reason, "WORD_ROW_NOT_EXPLAINABLE");
});
t("REJECT: 与已占用几何异常重叠 → OVERLAP_OCCUPIED", () => {
  const r = R.recoverNativeGeometry([N("吴健湘", 0)], {
    lineCandidates: [L("吴健湘", B(10, 20, 200, 24))],
    occupiedGeometries: [{ bbox: B(15, 22, 190, 20) }]
  });
  assert.strictEqual(r.recovered.length, 0);
  assert.strictEqual(r.rejected[0].reason, "OVERLAP_OCCUPIED");
});
t("REJECT: 完全超出 imageBounds → OUTSIDE_IMAGE", () => {
  const r = R.recoverNativeGeometry([N("吴健湘", 0)], {
    lineCandidates: [L("吴健湘", B(5000, 6000, 200, 24))],
    imageBounds: B(0, 0, 1000, 800)
  });
  assert.strictEqual(r.recovered.length, 0);
  assert.strictEqual(r.rejected[0].reason, "OUTSIDE_IMAGE");
});
t("REJECT: bbox 无效（负宽）→ GEOMETRY_INVALID", () => {
  const r = R.recoverNativeGeometry([N("吴健湘", 0)], { lineCandidates: [L("吴健湘", B(10, 20, -5, 24))] });
  assert.strictEqual(r.recovered.length, 0);
  assert.strictEqual(r.rejected[0].reason, "GEOMETRY_INVALID");
});
t("REJECT: 高宽异常（极端细长）→ GEOMETRY_ASPECT_ABNORMAL", () => {
  const r = R.recoverNativeGeometry([N("吴健湘", 0)], { lineCandidates: [L("吴健湘", B(10, 20, 4000, 1.6))] });
  assert.strictEqual(r.recovered.length, 0);
  assert.strictEqual(r.rejected[0].reason, "GEOMETRY_ASPECT_ABNORMAL");
});
t("REJECT→重试: 第一候选被占用时第二候选恢复成功", () => {
  const r = R.recoverNativeGeometry([N("吴健湘", 0)], {
    lineCandidates: [L("吴健湘", B(10, 20, 200, 24)), L("吴健湘", B(400, 20, 200, 24))],
    occupiedGeometries: [{ bbox: B(10, 20, 200, 24) }]
  });
  assert.strictEqual(r.recovered.length, 1);
  assert.strictEqual(r.recovered[0].geometry.bbox.x, 400);
});

// ---- 阶段 3：LOCAL（Commit 3b sidecar）----
t("LOCAL: line/word 失配但 local 行命中 → recovered source=LOCAL", () => {
  const r = R.recoverNativeGeometry([N("吴健湘", 0)], {
    lineCandidates: [L("别的文字", B(10, 20, 200, 24))], // BAIDU 失配
    localCandidates: [{ text: "吴健湘", bbox: B(10, 20, 180, 22), sourceProvider: "LOCAL" }]
  });
  assert.strictEqual(r.recovered.length, 1);
  assert.strictEqual(r.recovered[0].source, "LOCAL");
  assert.strictEqual(r.recovered[0].method, "LOCAL_LINE_MULTI_FACTOR");
  assert.strictEqual(r.diagnostics.localRecovered, 1);
});
t("LOCAL: local 也失配 → 保持 unresolved（绝不猜测）", () => {
  const r = R.recoverNativeGeometry([N("手写难辨行", 0)], {
    lineCandidates: [],
    localCandidates: [{ text: "完全不同的内容", bbox: B(10, 20, 180, 22), sourceProvider: "LOCAL" }]
  });
  assert.strictEqual(r.recovered.length, 0);
  assert.strictEqual(r.unresolved.length, 1);
  assert.strictEqual(r.rejected[0].reason, "NO_LOCAL_CANDIDATE");
});
t("LOCAL: BAIDU line 已恢复时不需要 local（LINE 优先）", () => {
  const r = R.recoverNativeGeometry([N("吴健湘", 0)], {
    lineCandidates: [L("吴健湘", B(10, 20, 200, 24))],
    localCandidates: [{ text: "吴健湘", bbox: B(10, 20, 180, 22), sourceProvider: "LOCAL" }]
  });
  assert.strictEqual(r.recovered[0].source, "BAIDU_LINE");
  assert.strictEqual(r.diagnostics.localRecovered, 0);
});

// ---- 混合与诊断 ----
t("混合: 2 native 行 → 1 LINE + 1 WORD 全恢复", () => {
  const r = R.recoverNativeGeometry([N("吴健湘", 0), N("张三董事长", 1)], {
    lineCandidates: [
      L("吴健湘", B(10, 20, 200, 24)),
      L("其他文本", B(10, 100, 220, 24), [W("张三", B(10, 102, 90, 20), 1), W("董事长", B(105, 102, 90, 20), 1)])
    ],
    imageBounds: B(0, 0, 1000, 800)
  });
  assert.strictEqual(r.recovered.length, 2);
  assert.strictEqual(r.unresolved.length, 0);
  assert.strictEqual(r.diagnostics.lineRecovered, 1);
  assert.strictEqual(r.diagnostics.wordRecovered, 1);
});
t("diagnostics: 可解释 —— rejected 带原因且与 unresolved 一一对应", () => {
  const r = R.recoverNativeGeometry([N("没有候选的行", 0), N("另一行", 1)], { lineCandidates: [] });
  assert.strictEqual(r.rejected.length, 2);
  assert.strictEqual(r.unresolved.length, 2);
  assert.strictEqual(r.diagnostics.unresolved, 2);
  assert.ok(r.diagnostics.rejections["NO_LINE_CANDIDATE"] === 2);
});
t("稳健: 空输入不抛", () => {
  let r = null;
  try { r = R.recoverNativeGeometry(null, null); } catch (e) { assert.fail("recoverNativeGeometry(null) 抛出"); }
  assert.strictEqual(r.recovered.length, 0);
  assert.strictEqual(r.unresolved.length, 0);
});

console.log("native-geometry-recovery.test: pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);