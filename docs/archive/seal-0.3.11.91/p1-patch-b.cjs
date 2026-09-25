// P1 补丁 B：templateApplyV2 执行侧 —— 命令 version 一致性 + 按版定位 + 当前版校验 + hash 全版口径
"use strict";
const fs = require("fs");
const PB = "D:\\zheliyin-scriptcat\\extension\\src\\editor\\page-bridge.js";
let src = fs.readFileSync(PB, "utf8");
const nl = src.indexOf("\r\n") >= 0 ? "\r\n" : "\n";
const N = (s) => s.split("\n").join(nl);
function mustReplace(src, oldStr, newStr, label) {
  const i = src.indexOf(oldStr);
  if (i < 0) throw new Error("ANCHOR MISS: " + label);
  if (src.indexOf(oldStr, i + 1) >= 0) throw new Error("ANCHOR NOT UNIQUE: " + label);
  console.log("  ok " + label);
  return src.slice(0, i) + newStr + src.slice(i + oldStr.length);
}

// ---- 1) 命令 version 一致性 + 当前版校验（插在 pageId 校验之后、hash 重算之前）----
src = mustReplace(src,
  N(`        // Stage 10-G L 阶 Commit 05：Snapshot Concurrency Guard —— 执行前再次按 getTextInventoryAll 同口径重算快照 hash，
        // 与调用方冻结的 planHash 比对；不一致（预览期间画布被编辑/并发变化）→ SLOT_STATE_CHANGED 停止，绝不执行。
        if (v2PlanHash) {
          const frCvs3 = findCanvasForSide("front") || v2Canvas;
          const baCvs3 = findCanvasForSide("back");
          const curHash = zyBuildTemplateSnapshot({ frontItems: getTextObjects(frCvs3).map(zyInventoryItem), backItems: baCvs3 ? getTextObjects(baCvs3).map(zyInventoryItem) : null, page: null }).snapshotHash;`),
  N(`        // P1 多版：命令必须携带一致的 version（本批只允许作用于同一版），且该版必须等于「当前版」——
        // 防「预览的是 A 版、用户切到 B 版后点确认」把文字写到错误版；跨版一律拒绝。
        const v2Versions = {};
        v2Cmds.forEach(function (c) { const vv = Number(c && c.version); v2Versions[isFinite(vv) ? vv : 0] = 1; });
        const v2VerList = Object.keys(v2Versions).map(Number);
        if (v2VerList.length > 1) { post("templateApplyV2Result", { ok: false, code: "VERSION_MISMATCH", message: "AI 槽位应用指令混含多个版（" + v2VerList.join(",") + "），已停止（禁止跨版批写）。", applied: [], sides: [] }); return; }
        const v2Version = v2VerList.length ? v2VerList[0] : 0;
        const v2LayoutPre = zyCanvasLayout();
        if (v2Version !== v2LayoutPre.current.vIdx) { post("templateApplyV2Result", { ok: false, code: "VERSION_MISMATCH", message: "指令版本(" + v2Version + ")与当前版(" + v2LayoutPre.current.vIdx + ")不一致（可能已切换多版），已停止。", applied: [], sides: [] }); return; }
        // Stage 10-G L 阶 Commit 05：Snapshot Concurrency Guard —— 执行前再次按 getTextInventoryAll 同口径重算快照 hash，
        // 与调用方冻结的 planHash 比对；不一致（预览期间画布被编辑/并发变化）→ SLOT_STATE_CHANGED 停止，绝不执行。
        // P1 多版：hash 口径覆盖全部版（任一版变化 → 拦截）。
        if (v2PlanHash) {
          const v2LayoutH = zyCanvasLayout();
          const allSidesH = [];
          for (let v6 = 0; v6 < v2LayoutH.versionCount; v6 += 1) {
            ["front", "back"].forEach(function (sd6) {
              const cvs6 = findCanvasForSide(sd6, v6);
              if (cvs6) allSidesH.push({ version: v6, side: sd6, items: getTextObjects(cvs6).map(zyInventoryItem) });
            });
          }
          const frCvs3 = findCanvasForSide("front", v2Version) || v2Canvas;
          const baCvs3 = findCanvasForSide("back", v2Version);
          const curHash = zyBuildTemplateSnapshot({ frontItems: getTextObjects(frCvs3).map(zyInventoryItem), backItems: baCvs3 ? getTextObjects(baCvs3).map(zyInventoryItem) : null, page: null, version: v2Version, versionCount: v2LayoutH.versionCount, allSidesItems: allSidesH }).snapshotHash;`),
  "VERSION_MISMATCH gate + hash all-versions");

// ---- 2) 分组定位按版 ----
src = mustReplace(src,
  N(`          const cvs = findCanvasForSide(sd);
          if (!cvs) { v2AnyFail = true; v2Fails.push(sd + ":NO_CANVAS"); v2Groups.push({ side: sd, ok: false, code: "TEMPLATE_APPLY_BLOCKED_CANVAS_UNREADY", applied: [] }); return; }
          const objs = getTextObjects(cvs);`),
  N(`          const cvs = findCanvasForSide(sd, v2Version);
          if (!cvs) { v2AnyFail = true; v2Fails.push(sd + ":NO_CANVAS"); v2Groups.push({ side: sd, version: v2Version, ok: false, code: "TEMPLATE_APPLY_BLOCKED_CANVAS_UNREADY", applied: [] }); return; }
          const objs = getTextObjects(cvs);`),
  "per-version canvas lookup");

// ---- 3) group 结果带 version（两处：失败组 + 成功组）----
src = mustReplace(src,
  N(`          if (changed) { v2AnyFail = true; v2Fails.push(sd + ":SLOT_STATE_CHANGED"); v2Groups.push({ side: sd, ok: false, code: "SLOT_STATE_CHANGED", message: "画布文字层与 AI 槽位应用指令不一致（可能已编辑），已停止该面。", applied: [] }); return; }`),
  N(`          if (changed) { v2AnyFail = true; v2Fails.push(sd + ":SLOT_STATE_CHANGED"); v2Groups.push({ side: sd, version: v2Version, ok: false, code: "SLOT_STATE_CHANGED", message: "画布文字层与 AI 槽位应用指令不一致（可能已编辑），已停止该面。", applied: [] }); return; }`),
  "group fail version");

src = mustReplace(src,
  N(`          v2Groups.push({ side: sd, ok: true, count: applied.length, applied: applied });`),
  N(`          v2Groups.push({ side: sd, version: v2Version, ok: true, count: applied.length, applied: applied });`),
  "group ok version");

// ---- 4) applied 条目带 version ----
src = mustReplace(src,
  N(`              applied.push({ side: sd, slotId: g.slotId, slotIdx: g.slotIdx, objectUuid: so.uuid || so.multiUuid || null, text: String(text).slice(0, 24) });`),
  N(`              applied.push({ side: sd, version: v2Version, slotId: g.slotId, slotIdx: g.slotIdx, objectUuid: so.uuid || so.multiUuid || null, text: String(text).slice(0, 24) });`),
  "applied entry version");

fs.writeFileSync(PB, src, "utf8");
console.log("P1 patch B applied.");