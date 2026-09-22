// runtime/stage9/native-geometry-aligner.test.js — OCR-P0.3：Native/Geometry 多因素匹配
"use strict";
const assert = require("assert");
const A = require("../../extension/src/ocr/native-geometry-aligner.js");

let passed = 0, failed = 0, failures = [];
function t(name, fn) {
  return Promise.resolve().then(fn).then(
    () => { passed += 1; },
    (e) => { failed += 1; failures.push(name + " :: " + (e && e.message || e)); }
  );
}
const RUN = [];

const nat = (raw, order) => ({ id: "n" + order, rawText: raw, order: order, bbox: null });
const geo = (text, bbox, provider) => ({ text: text, bbox: bbox, sourceProvider: provider || "BAIDU" });

// ---- OCR-P0.3-A：禁止 index-only，同文本多行（顺序错配也靠多因素）----
RUN.push(t("对齐: 8=8 exact text（D 型）→ 8/8 matched 无 leftover", async () => {
  const ns = ["吴健湘", "客户经理", "Telephone: +8615913171583", "佛山盛盈包装制品有限公司", "Tel.:0757-88809856", "张三", "董事长", "abc123"].map((t0, i) => nat(t0, i));
  const gs = ns.map((n0, i) => geo(n0.rawText, { x: 10 + i, y: 100 + i * 30, width: 100, height: 20 }));
  const r = A.alignNativeGeometry(ns, gs);
  assert.strictEqual(r.gate.matched, 8);
  assert.strictEqual(r.gate.unmatchedNative, 0);
  assert.strictEqual(r.gate.unusedGeometry, 0);
}));

// ---- OCR-P0.3-A：乱序几何（geometry 行倒序）→ 仍 8/8（靠文本相似+类型+长度，非 index）----
RUN.push(t("对齐: geometry 行乱序 → 8/8（非 index 配对）", async () => {
  const ns = ["吴健湘", "客户经理", "Telephone: +8615913171583", "佛山盛盈包装制品有限公司", "Tel.:0757-88809856", "张三", "董事长", "abc123"].map((t0, i) => nat(t0, i));
  const texts = ns.map((n0) => n0.rawText).reverse();
  const gs = texts.map((t0, i) => geo(t0, { x: 10, y: 200 - i * 30, width: 100, height: 20 }));
  const r = A.alignNativeGeometry(ns, gs);
  assert.strictEqual(r.gate.matched, 8, "乱序后仍应全部匹配");
  assert.strictEqual(r.gate.unmatchedNative, 0);
}));

// ---- OCR-P0.3-B：一对多 —— native「张三 董事长」↔ geo 两行【张三】【董事长】----
RUN.push(t("一对多: native 聚合行 ↔ 相邻两 geo 行（y 紧邻拆行）", async () => {
  const ns = [nat("张三 董事长", 0), nat("佛山盛盈", 1)];
  const gs = [
    geo("佛山盛盈", { x: 20, y: 200, width: 80, height: 20 }),
    geo("张三", { x: 20, y: 60, width: 50, height: 20 }),
    geo("董事长", { x: 80, y: 65, width: 50, height: 20 })
  ];
  const r = A.alignNativeGeometry(ns, gs);
  assert.strictEqual(r.gate.matched, 2);
  assert.strictEqual(r.gate.matchedGeometry, 3);
  assert.strictEqual(r.gate.unmatchedNative, 0);
  assert.ok(r.matchedNative.some((m) => m.match.method === "ONE_TO_MANY_LINES"));
  assert.strictEqual(r.gate.oneToMany, 1);
}));

// ---- OCR-P0.3-B：多对一 —— native 两行【张三】【董事长】↔ geo 一行「张三 董事长」----
RUN.push(t("多对一: 两 native 行 ↔ 单 geo 聚合行（MANY_TO_ONE_SHARED）", async () => {
  const ns = [nat("张三", 0), nat("董事长", 1)];
  const gs = [geo("张三 董事长", { x: 20, y: 60, width: 150, height: 20 })];
  const r = A.alignNativeGeometry(ns, gs);
  assert.strictEqual(r.gate.matched, 2);
  assert.strictEqual(r.gate.unmatchedNative, 0);
  assert.strictEqual(r.gate.matchedGeometry, 1);
  assert.strictEqual(r.gate.manyToOne, 2);
  assert.ok(r.matchedNative.every((m) => m.match.method === "MANY_TO_ONE_SHARED"));
}));

// ---- OCR-P0.3-C：Native 有、Baidu 无 → unmatchedNative（不伪造位置，不静默）、unusedGeometry 审计 ----
RUN.push(t("Native 有 Baidu 无 → unmatchedNative 记录 + NATIVE_TRUTH 审计字段", async () => {
  const ns = [nat("第一行", 0), nat("第二行", 1), nat("第三行", 2), nat("第四行", 3), nat("第五行", 4)];
  const gs = [geo("第一行", { x: 10, y: 100, width: 90, height: 20 }), geo("第三行", { x: 10, y: 160, width: 90, height: 20 })];
  const r = A.alignNativeGeometry(ns, gs);
  assert.strictEqual(r.gate.totalNative, 5);
  assert.strictEqual(r.gate.geometryCandidates, 2);
  assert.strictEqual(r.gate.matched, 2);
  assert.strictEqual(r.gate.unmatchedNative, 3);
  assert.strictEqual(r.gate.matchedGeometry, 2);
  assert.strictEqual(r.gate.unusedGeometry, 0);
  // 顺序敏感：y 序匹配（第一行↔y100，第三行↔y160）
  const lines = r.matchedNative.map((m) => m.native.rawText);
  assert.deepStrictEqual(lines, ["第一行", "第三行"]);
}));

// ---- OCR-P0.3-E：N 行几何不完整 → gate 提供 unmatchedNative 计数，上层据此判定 INCOMPLETE ----
RUN.push(t("NATIVE 有 5、几何只有 3 → matched=3 unmatchedNative=2（INCOMPLETE 判据）", async () => {
  const ns = [0, 1, 2, 3, 4].map((i) => nat("行" + (i + 1), i));
  const gs = [0, 1, 2].map((i) => geo("行" + (i + 1), { x: 10, y: 100 + i * 30, width: 80, height: 20 }));
  const r = A.alignNativeGeometry(ns, gs);
  assert.strictEqual(r.gate.matched, 3);
  assert.strictEqual(r.gate.unmatchedNative, 2);
  assert.strictEqual(r.gate.unusedGeometry, 0);
  assert.strictEqual(r.gate.totalNative, 5);
}));

// ---- 空 native / 空 geometry ----
RUN.push(t("空 native → 全 unused（geometry-only audit）", async () => {
  const r = A.alignNativeGeometry([], [geo("x", { x: 1, y: 1, width: 5, height: 5 })]);
  assert.strictEqual(r.gate.totalNative, 0);
  assert.strictEqual(r.gate.unusedGeometry, 1);
  assert.strictEqual(r.matchedNative.length, 0);
}));
RUN.push(t("空 geometry → 全 unmatchedNative", async () => {
  const r = A.alignNativeGeometry([nat("a", 0), nat("b", 1)], []);
  assert.strictEqual(r.gate.unmatchedNative, 2);
  assert.strictEqual(r.gate.matched, 0);
}));

// ---- 相似但非相同文本：多因素高阶匹配（sim 0.8 包含关系）----
RUN.push(t("包含关系: native「佛山盛盈包装制品有限公司」↔ geo「佛山盛盈包装制品有限公司 佛山」→ sim 0.8 命中", async () => {
  const ns = [nat("佛山盛盈包装制品有限公司", 0)];
  const gs = [geo("佛山盛盈包装制品有限公司 佛山", { x: 10, y: 100, width: 200, height: 20 })];
  const r = A.alignNativeGeometry(ns, gs);
  assert.strictEqual(r.gate.matched, 1);
  assert.strictEqual(r.gate.unmatchedNative, 0);
}));

// ---- words 展开未被用作最终 text：provider 只给位置（OCR-P0.3-C）----
RUN.push(t("geometry words 存在时仅作 sub-geometry，text 恒来自 native", async () => {
  const ns = [nat("张三", 0), nat("董事长", 1)];
  const gs = [Object.assign(geo("张三 董事长", { x: 20, y: 60, width: 150, height: 20 }), { words: [{ text: "张三", bbox: { x: 20, y: 60, width: 60, height: 20 } }, { text: "董事长", bbox: { x: 80, y: 60, width: 90, height: 20 } }] })];
  const r = A.alignNativeGeometry(ns, gs);
  assert.strictEqual(r.gate.matched, 2);
  r.matchedNative.forEach((m) => { assert.ok(m.native.rawText === "张三" || m.native.rawText === "董事长"); });
  assert.strictEqual(r.gate.unmatchedNative, 0);
}));

// ---- Commit A2 后继：SINGLE_LINE_CONTAINMENT（真机回归：盈通启富卡 理财顾问）----
// native「理财顾问」⊂ geo「理财顾问18888886666」应匹配单行（y200 h24）；
// 禁止 Phase 2 把相邻行「1」(y67)+该行 join 合成巨型 union 盒（x52 y67 w661 h157）→ dy=+35。
RUN.push(t("SINGLE_LINE_CONTAINMENT: native⊂单行 geo（理财顾问⊂理财顾问18888886666）→ 命中单行几何", async () => {
  const ns = [nat("理财顾问", 0)];
  const gs = [
    geo("1", { x: 689, y: 67, width: 24, height: 30 }),
    geo("理财顾问18888886666", { x: 52, y: 200, width: 327, height: 24 })
  ];
  const r = A.alignNativeGeometry(ns, gs);
  assert.strictEqual(r.gate.matched, 1, "native⊂geo 应命中（单行包含）");
  assert.strictEqual(r.gate.unmatchedNative, 0);
  const m = r.matchedNative[0];
  assert.strictEqual(m.match.method, "SINGLE_LINE_CONTAINMENT", "method=" + m.match.method);
  // 几何必须是单行（non-union），位置在 理财顾问 行（y≈200），不是巨型 union（y67 h157）
  assert.strictEqual(m.geometry.bbox.union, undefined, "禁止合成 union 盒");
  assert.strictEqual(m.geometry.bbox.y, 200);
  assert.strictEqual(m.geometry.bbox.height, 24);
  assert.ok(m.geometry.bbox.width < 400, "宽度应为单行 327，而非巨型 union");
}));

// 反向 sanity：native 长、geo 短（native 包含 geo，如「张三 董事长」⊃「张三」）不属于本阶段 → 仍交 Phase 2 join
RUN.push(t("SINGLE_LINE_CONTAINMENT 反向不抢：native 长 geo 短 → 不匹配单行包含（留给 one-to-many）", async () => {
  const ns = [nat("张三 董事长", 0)];
  const gs = [geo("张三", { x: 20, y: 60, width: 50, height: 20 }), geo("董事长", { x: 80, y: 65, width: 50, height: 20 })];
  const r = A.alignNativeGeometry(ns, gs);
  assert.strictEqual(r.gate.matched, 1);
  assert.ok(r.matchedNative[0].match.method === "ONE_TO_MANY_LINES", "method=" + r.matchedNative[0].match.method);
  assert.strictEqual(r.gate.unmatchedNative, 0);
}));

// 兼容：exact text 仍优先（Phase 1 不受影响）
RUN.push(t("Phase 1 优先: 存在 exact 行时不用 containment", async () => {
  const ns = [nat("盈通启富证券", 0)];
  const gs = [geo("盈通启富证券", { x: 706, y: 68, width: 184, height: 29 }), geo("盈通启富证券 深圳分公司", { x: 10, y: 300, width: 200, height: 20 })];
  const r = A.alignNativeGeometry(ns, gs);
  assert.strictEqual(r.gate.matched, 1);
  assert.strictEqual(r.matchedNative[0].match.method, "EXACT_TEXT", "method=" + r.matchedNative[0].match.method);
  assert.strictEqual(r.matchedNative[0].geometry.bbox.y, 68);
}));

Promise.all(RUN).then(() => {
  console.log("native-geometry-aligner.test: pass=" + passed + " fail=" + failed);
  if (failures.length) console.error(failures.join("\n"));
  process.exit(failed ? 1 : 0);
});