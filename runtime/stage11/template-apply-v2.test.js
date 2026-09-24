"use strict";
const mod = require("D:/zheliyin-scriptcat/extension/src/editor/template-apply-v2.js");
const { zyBuildApplyCommandPlan, zySlotPrefixOf, zySnapshotSlotRegistry } = mod;
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log("[template-apply-v2] PASS " + name); } else { fail++; console.log("[template-apply-v2] FAIL " + name); } };

function makeSnapshot(frontTexts, backTexts) {
  const mk = (side, texts) => ({
    exists: true,
    side: side,
    items: (texts || []).map((text, i) => ({
      slotId: side + "-" + (i + 1),
      objectUuid: "uuid-" + side + "-" + (i + 1),
      text: text,
      left: 10 + i, top: 10 + i, width: 100, height: 20, angle: 0,
      fontSize: 14, fontFamily: "xx", fontWeight: "normal", fontStyle: "normal",
      fill: "#111111", layerNum: i + 1
    }))
  });
  return { front: mk("front", frontTexts || []), back: mk("back", backTexts || []), page: { pageId: "p1" } };
}
function m(side, idx, extra) {
  return Object.assign({ slotId: side + "-" + (idx + 1), side: side, slotIdx: idx, objectUuid: "uuid-" + side + "-" + (idx + 1), customerText: "客户内容" + idx, confidence: 0.99, reason: "t" }, extra || {});
}

  // 1 正常 front 5 槽
  {
    const snap = makeSnapshot(["简小设", "合伙人", "副主任律师", "电话：13800138000", "地址：济南"], []);
    const matches = [0, 1, 2].map((i) => m("front", i));
    const out = zyBuildApplyCommandPlan({ snapshot: snap, matches: matches });
    ok("valid-plan-ok", out.ok && out.errors.length === 0 && out.summary.toApply === 3);
    ok("valid-plan-sidegroup", !!out.sideGroups.front && out.sideGroups.front.count === 3 && !out.sideGroups.back);
    ok("valid-plan-cmd-shape", out.commands.every((c) => /^front-\d+$/.test(c.slotId) && typeof c.slotIdx === "number" && !!c.objectUuid && !!c.customerText));
    ok("valid-plan-frozen", out.commands.every((c) => c.frozen && c.frozen.geometry && c.frozen.typography && c.frozen.style && c.frozen.identity && c.frozen.layer));
    ok("valid-plan-no-geom-fields", out.commands.every((c) => ["fontSize", "fill", "left", "top", "width", "height", "fontFamily", "angle"].every((k) => !(k in c))));
  }
  // 2 双面 front+back
  {
    const snap = makeSnapshot(["简小设"], ["主营范围：咨询"]);
    const matches = [m("front", 0), m("back", 0, { customerText: "主营范围：企业咨询" })];
    const out = zyBuildApplyCommandPlan({ snapshot: snap, matches: matches });
    ok("both-sides-groups", out.ok && out.sideGroups.front && out.sideGroups.back && out.summary.toApply === 2);
    ok("both-sides-side-field", out.commands.find((c) => c.side === "back") && out.commands.find((c) => c.side === "back").slotId === "back-1");
  }
  // 3 排序（乱序输入 → 按 slotIdx 升序）
  {
    const snap = makeSnapshot(["a", "b", "c", "d", "e"], []);
    const matches = [m("front", 4), m("front", 0), m("front", 2)];
    const out = zyBuildApplyCommandPlan({ snapshot: snap, matches: matches });
    const idxs = out.commands.map((c) => c.slotIdx);
    ok("sorted-by-slotidx", idxs.join(",") === "0,2,4");
  }
  // 4 UNKNOWN_SLOT
  {
    const snap = makeSnapshot(["a", "b"], []);
    const out = zyBuildApplyCommandPlan({ snapshot: snap, matches: [m("front", 0, { slotId: "front-9" })] });
    ok("unknown-slot-rejected", !out.ok && out.errors.some((e) => e.indexOf("UNKNOWN_SLOT") >= 0) && out.summary.toApply === 0);
  }
  // 5 SIDE_MISMATCH（串面）
  {
    const snap = makeSnapshot(["a"], ["b"]);
    const out = zyBuildApplyCommandPlan({ snapshot: snap, matches: [m("front", 0, { side: "back", objectUuid: "uuid-back-1" })] });
    ok("side-mismatch-rejected", !out.ok && out.errors.some((e) => e.indexOf("SIDE_NOT_IN_SNAPSHOT") >= 0 || e.indexOf("SIDE_MISMATCH") >= 0));
  }
  // 6 SLOT_INDEX_MISMATCH
  {
    const snap = makeSnapshot(["a", "b"], []);
    const out = zyBuildApplyCommandPlan({ snapshot: snap, matches: [m("front", 1, { slotId: "front-1" })] });
    ok("slot-index-mismatch-rejected", !out.ok && out.errors.some((e) => e.indexOf("SLOT_INDEX_MISMATCH") >= 0));
  }
  // 7 OBJECT_UUID_MISMATCH
  {
    const snap = makeSnapshot(["a"], []);
    const out = zyBuildApplyCommandPlan({ snapshot: snap, matches: [m("front", 0, { objectUuid: "uuid-front-999" })] });
    ok("object-uuid-mismatch-rejected", !out.ok && out.errors.some((e) => e.indexOf("OBJECT_UUID_MISMATCH") >= 0));
  }
  // 8 SLOT_DUPLICATE
  {
    const snap = makeSnapshot(["a"], []);
    const out = zyBuildApplyCommandPlan({ snapshot: snap, matches: [m("front", 0), m("front", 0, { customerText: "另一个" })] });
    ok("slot-duplicate-rejected", !out.ok && out.errors.some((e) => e.indexOf("SLOT_DUPLICATE") >= 0));
  }
  // 9 EMPTY_CUSTOMER_TEXT
  {
    const snap = makeSnapshot(["a"], []);
    const out = zyBuildApplyCommandPlan({ snapshot: snap, matches: [m("front", 0, { customerText: "" })] });
    ok("empty-customer-text-rejected", !out.ok && out.errors.some((e) => e.indexOf("EMPTY_CUSTOMER_TEXT") >= 0));
  }
  // 10 BAD_SLOT_ID（无前缀）
  {
    const snap = makeSnapshot(["a"], []);
    const out = zyBuildApplyCommandPlan({ snapshot: snap, matches: [m("front", 0, { slotId: "xyz-1" })] });
    ok("bad-slot-id-rejected", !out.ok && out.errors.some((e) => e.indexOf("UNKNOWN_SLOT") >= 0 || e.indexOf("BAD_SLOT_ID") >= 0));
  }
  // 11 registry：无 slotId 字段时按 side-(i+1) 派生
  {
    const snap = { front: { exists: true, side: "front", items: [{ objectUuid: "u1", text: "x" }] }, back: null };
    const reg = zySnapshotSlotRegistry(snap);
    ok("registry-derives-id", !!reg["front-1"] && reg["front-1"].objectUuid === "u1");
  }
  // 12 zySlotPrefixOf
  ok("slot-prefix", zySlotPrefixOf("front-3") === "front" && zySlotPrefixOf("back-1") === "back" && zySlotPrefixOf("xx-1") === null);

  console.log("[template-apply-v2] RESULT pass=" + pass + " fail=" + fail);
  process.exit(fail ? 1 : 0);