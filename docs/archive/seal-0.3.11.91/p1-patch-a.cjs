// P1 补丁 A：page-bridge.js —— 快照版维 + zyCanvasLayout + findCanvasForSide(vIdx) + getTextInventoryAll 版维 + getMultiVersionInfo
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

// ---------- 1) zySnapshotHashItems（全版 hash 口径）----------
src = mustReplace(src,
  N(`      return ("00000000" + h.toString(16)).slice(-8);
    }
    function zySnapshotItemWithSlot(item, side, index) {`),
  N(`      return ("00000000" + h.toString(16)).slice(-8);
    }
    // P1 多版：全版 hash 口径 —— allSidesItems = [{version, side, items}] 按 canvasIdx 顺序传入，
    // 展开后统一 hash；未提供时退化为「本版 front + 本版 back」（单版下两者等价，hash 值不变）。
    function zySnapshotHashItems(input) {
      const o = input || {};
      const all = Array.isArray(o.allSidesItems) ? o.allSidesItems : null;
      if (all) {
        const flat = [];
        all.forEach(function (g) { (g && Array.isArray(g.items) ? g.items : []).forEach(function (it) { flat.push(it); }); });
        return flat;
      }
      return (Array.isArray(o.frontItems) ? o.frontItems : []).concat(Array.isArray(o.backItems) ? o.backItems : []);
    }
    function zySnapshotItemWithSlot(item, side, index) {`),
  "zySnapshotHashItems");

// ---------- 2) zyBuildTemplateSnapshot 版维 ----------
src = mustReplace(src,
  N(`      const page = o.page || null;
      const snapshotHash = zySnapshotHashOf((frontItems || []).concat(backItems || []));
      return {
        ok: true,
        page: page,
        front: { exists: !!frontItems, side: "front", items: frontItems },
        back: { exists: !!backItems, side: "back", items: backItems },
        snapshotHash: snapshotHash,
        count: { front: frontItems ? frontItems.length : 0, back: backItems ? backItems.length : 0 }
      };
    }`),
  N(`      const page = o.page || null;
      // P1 多版：快照声明所属版 + 版本总数 + 当前版诊断；hash 口径 = 全部版按 canvasIdx 顺序展开
      const version = zyIsNum(o.version) ? o.version : 0;
      const versionCount = zyIsNum(o.versionCount) ? o.versionCount : 1;
      const snapshotHash = zySnapshotHashOf(zySnapshotHashItems(o));
      return {
        ok: true,
        page: page,
        version: version,
        versionCount: versionCount,
        multi: (o.multi != null) ? !!o.multi : (versionCount > 1),
        current: o.current || null,
        layout: o.layout || null,
        front: { exists: !!frontItems, side: "front", items: frontItems },
        back: { exists: !!backItems, side: "back", items: backItems },
        snapshotHash: snapshotHash,
        count: { front: frontItems ? frontItems.length : 0, back: backItems ? backItems.length : 0 }
      };
    }`),
  "zyBuildTemplateSnapshot version");

// ---------- 3) zyCanvasLayout + findCanvasForSide(side, vIdxOpt) ----------
src = mustReplace(src,
  N(`    function findCanvasForSide(side) {
      const CanvasObjVO = getLoadedModule("CanvasObjVO") || window.CanvasObjVO;
      const total = CanvasObjVO && CanvasObjVO.totalCanvasArray;
      const index = side === "back" ? 1 : 0;
      if (Array.isArray(total) && total[index]) {
        const selected = unwrapCanvas(total[index]) || findCanvasIn(total[index]);
        if (selected) return selected;
      }
      if (side === "back") return null; // L 阶 Commit 01：back 绝不回退 front/其它画布（曾把 front 内容冒充 back）
      const CurrentCanvas = getLoadedModule("CurrentCanvas") || window.CurrentCanvas;
      if (side !== "back" && CurrentCanvas && CurrentCanvas.getCurrentCanvas) {
        const current = CurrentCanvas.getCurrentCanvas();
        const currentCanvas = unwrapCanvas(current) || findCanvasIn(current);
        if (currentCanvas) return currentCanvas;
      }
      if (Array.isArray(total) && total.length) {
        for (let i = 0; i < total.length; i += 1) {
          const found = unwrapCanvas(total[i]) || findCanvasIn(total[i]);
          if (found) return found;
        }
      }
      return findCanvasFromGlobals();
    }`),
  N(`    // ===== P1 多版地基：版布局只读解析（真机探测结论见 runtime/reports/stage-11/multiversion-probe.json）=====
    // 站点 totalCanvasArray 为扁平数组，每版占 2 个连续条目：
    //   [v1正面c0, v1背面c1, v2正面c2, v2背面c3, ...]
    //   第 vIdx 版第 side 面 → canvasIdx = 2*vIdx + (side==='back' ? 1 : 0)
    // 版数真源 = .pageWrapMulti li 数量（真机 1=单版 / >1=多版）；CanvasObjVO.multiCanvas 真机恒为 true，无区分力。
    // 当前版三源交叉：currentCanvasNum（1 基，权威）↔ .pageWrapMulti .page-group.current 全局索引 ↔ li.currentLi 索引。
    // 冲突显式记录，不猜：currentCanvasNum 与 DOM 当前页不一致 → 硬冲突（ok=false）。
    function zyCanvasLayout() {
      const out = {
        ok: true, code: "OK", multi: false, versionCount: 1, totalLen: 0,
        current: { vIdx: 0, side: "front", canvasIdx: 0, source: null, materialized: false },
        dom: { liCount: null, currentLiIdx: null, currentGroupIdx: null },
        conflicts: [], hardConflicts: []
      };
      const CV = getLoadedModule("CanvasObjVO") || window.CanvasObjVO || null;
      const total = CV && Array.isArray(CV.totalCanvasArray) ? CV.totalCanvasArray : null;
      if (!total) { out.ok = false; out.code = "NO_CANVAS_OBJ_VO"; return out; }
      out.totalLen = total.length;
      // DOM 来源（只读；站点 UI 结构）
      let liCount = null, curLiIdx = null, curGroupIdx = null;
      try {
        const lis = document.querySelectorAll(".pageWrapMulti li");
        liCount = lis.length;
        const curLi = document.querySelector(".pageWrapMulti li.currentLi");
        curLiIdx = curLi ? Array.prototype.indexOf.call(lis, curLi) : null;
        const gs = document.querySelectorAll(".pageWrapMulti .page-group");
        const curG = document.querySelector(".pageWrapMulti .page-group.current");
        curGroupIdx = curG ? Array.prototype.indexOf.call(gs, curG) : null;
      } catch (eDom) {}
      out.dom.liCount = liCount;
      out.dom.currentLiIdx = curLiIdx;
      out.dom.currentGroupIdx = curGroupIdx;
      const domVersionCount = (liCount && liCount > 0) ? liCount : null;
      const arrVersionCount = Math.max(1, Math.ceil(total.length / 2));
      const versionCount = domVersionCount != null ? domVersionCount : arrVersionCount;
      out.versionCount = versionCount;
      out.multi = versionCount > 1;
      // 当前 canvasIdx：currentCanvasNum（1 基）为权威真值
      const cc = (CV && typeof CV.currentCanvasNum === "number" && CV.currentCanvasNum >= 1) ? (CV.currentCanvasNum - 1) : null;
      let canvasIdx = cc;
      let cs = cc != null ? "canvasObjVO.currentCanvasNum" : null;
      if (canvasIdx == null && curGroupIdx != null) { canvasIdx = curGroupIdx; cs = "domCurrentGroup"; }
      if (canvasIdx == null) { canvasIdx = 0; cs = "default0"; }
      out.current.canvasIdx = canvasIdx;
      out.current.vIdx = Math.floor(canvasIdx / 2);
      out.current.side = (canvasIdx % 2 === 1) ? "back" : "front";
      out.current.source = cs;
      out.current.materialized = (canvasIdx >= 0 && canvasIdx < total.length);
      // 硬冲突：当前页两源不一致 / 当前版未 materialize
      if (cc != null && curGroupIdx != null && cc !== curGroupIdx) out.hardConflicts.push("currentCanvasNum(" + cc + ")!=domCurrentGroup(" + curGroupIdx + ")");
      if (!out.current.materialized) out.hardConflicts.push("CURRENT_VERSION_NOT_MATERIALIZED(idx=" + canvasIdx + ",len=" + total.length + ")");
      // 软冲突（记录但不阻断读取）：li.currentLi 与 vIdx 不一致；DOM 版数与数组推算不一致（懒 materialize 常见）
      if (curLiIdx != null && curLiIdx !== out.current.vIdx) out.conflicts.push("liCurrent(" + curLiIdx + ")!=vIdx(" + out.current.vIdx + ")");
      if (domVersionCount != null && arrVersionCount !== domVersionCount) out.conflicts.push("domLiCount(" + domVersionCount + ")!=arrVersionCount(" + arrVersionCount + ")");
      if (out.hardConflicts.length) { out.ok = false; out.code = "MULTI_LAYOUT_CONFLICT:" + out.hardConflicts.join("|"); }
      return out;
    }
    // 取指定版的某一面画布。
    //   vIdxOpt 未传 → 用当前版（zyCanvasLayout().current.vIdx）
    //   仅当目标版为 0（单版/首版）时保留既有回退链（CurrentCanvas → total[0] → globals），保证单版行为逐字不变；
    //   vIdx > 0 只做精确命中，缺失即 null —— 禁止跨版冒充（多版隔离铁律）。
    function findCanvasForSide(side, vIdxOpt) {
      const explicit = (typeof vIdxOpt === "number" && isFinite(vIdxOpt) && vIdxOpt >= 0);
      let vIdx = explicit ? Math.floor(vIdxOpt) : null;
      if (vIdx == null) { const L0 = zyCanvasLayout(); vIdx = (L0.current && L0.current.vIdx >= 0) ? L0.current.vIdx : 0; }
      const CanvasObjVO = getLoadedModule("CanvasObjVO") || window.CanvasObjVO;
      const total = CanvasObjVO && CanvasObjVO.totalCanvasArray;
      const index = vIdx * 2 + (side === "back" ? 1 : 0);
      // 1) 目标版精确命中
      if (Array.isArray(total) && total[index]) {
        const selected = unwrapCanvas(total[index]) || findCanvasIn(total[index]);
        if (selected) return selected;
      }
      // 2) 非首版缺失 → 不回退（禁止跨版冒充）
      if (vIdx !== 0) return null;
      // 3) 首版（单版/首版）保持既有回退链
      if (side === "back") return null; // L 阶 Commit 01：back 绝不回退 front/其它画布（曾把 front 内容冒充 back）
      const CurrentCanvas = getLoadedModule("CurrentCanvas") || window.CurrentCanvas;
      if (side !== "back" && CurrentCanvas && CurrentCanvas.getCurrentCanvas) {
        const current = CurrentCanvas.getCurrentCanvas();
        const currentCanvas = unwrapCanvas(current) || findCanvasIn(current);
        if (currentCanvas) return currentCanvas;
      }
      if (Array.isArray(total) && total.length) {
        for (let i = 0; i < total.length; i += 1) {
          const found = unwrapCanvas(total[i]) || findCanvasIn(total[i]);
          if (found) return found;
        }
      }
      return findCanvasFromGlobals();
    }`),
  "zyCanvasLayout + findCanvasForSide");

// ---------- 4) getTextInventoryAll 版维 ----------
src = mustReplace(src,
  N(`        const frontCanvasA = findCanvasForSide("front");
        const backCanvasA = findCanvasForSide("back");
        const frontSnapItems = frontCanvasA ? getTextObjects(frontCanvasA).map(zyInventoryItem) : null;
        const backSnapItems = backCanvasA ? getTextObjects(backCanvasA).map(zyInventoryItem) : null;
        const pageA = (function () { const pi = buildCurrentPageInfo(); const c = frontCanvasA || backCanvasA; return { pageId: (pi && pi.pageId) || null, canvasId: null, width: c ? (typeof c.width === "number" ? c.width : (c.getWidth ? c.getWidth() : null)) : null, height: c ? (typeof c.height === "number" ? c.height : (c.getHeight ? c.getHeight() : null)) : null }; })();
        post("getTextInventoryAllResult", zyBuildTemplateSnapshot({ frontItems: frontSnapItems, backItems: backSnapItems, page: pageA }));`),
  N(`        // P1 多版：默认读取「当前版」；可显式传 version 指定版；hash 口径覆盖全部版（任一版变化即变化）
        const layoutA = zyCanvasLayout();
        const reqVA = (event.data.version != null && isFinite(Number(event.data.version))) ? Math.floor(Number(event.data.version)) : layoutA.current.vIdx;
        const frontCanvasA = findCanvasForSide("front", reqVA);
        const backCanvasA = findCanvasForSide("back", reqVA);
        const frontSnapItems = frontCanvasA ? getTextObjects(frontCanvasA).map(zyInventoryItem) : null;
        const backSnapItems = backCanvasA ? getTextObjects(backCanvasA).map(zyInventoryItem) : null;
        const allSidesItemsA = [];
        for (let v4 = 0; v4 < layoutA.versionCount; v4 += 1) {
          ["front", "back"].forEach(function (sd4) {
            const cvs4 = findCanvasForSide(sd4, v4);
            if (cvs4) allSidesItemsA.push({ version: v4, side: sd4, items: getTextObjects(cvs4).map(zyInventoryItem) });
          });
        }
        const pageA = (function () { const pi = buildCurrentPageInfo(); const c = frontCanvasA || backCanvasA; return { pageId: (pi && pi.pageId) || null, canvasId: null, width: c ? (typeof c.width === "number" ? c.width : (c.getWidth ? c.getWidth() : null)) : null, height: c ? (typeof c.height === "number" ? c.height : (c.getHeight ? c.getHeight() : null)) : null }; })();
        post("getTextInventoryAllResult", zyBuildTemplateSnapshot({ frontItems: frontSnapItems, backItems: backSnapItems, page: pageA, version: reqVA, versionCount: layoutA.versionCount, multi: layoutA.multi, current: layoutA.current, layout: { ok: layoutA.ok, code: layoutA.code, conflicts: layoutA.conflicts, hardConflicts: layoutA.hardConflicts, dom: layoutA.dom, totalLen: layoutA.totalLen }, allSidesItems: allSidesItemsA }));`),
  "getTextInventoryAll version-aware");

// ---------- 5) getMultiVersionInfo 只读消息 ----------
src = mustReplace(src,
  N(`      if (event.data.type === "getCurrentPage") {`),
  N(`      if (event.data.type === "getMultiVersionInfo") {
        // P1 多版只读：版布局 + 每版正反槽位计数（不修改画布）
        const L1 = zyCanvasLayout();
        const versions1 = [];
        for (let v5 = 0; v5 < L1.versionCount; v5 += 1) {
          const f5 = findCanvasForSide("front", v5);
          const b5 = findCanvasForSide("back", v5);
          versions1.push({ vIdx: v5, frontExists: !!f5, backExists: !!b5, frontCount: f5 ? getTextObjects(f5).length : null, backCount: b5 ? getTextObjects(b5).length : null });
        }
        post("getMultiVersionInfoResult", { ok: L1.ok, code: L1.code, multi: L1.multi, versionCount: L1.versionCount, totalLen: L1.totalLen, current: L1.current, dom: L1.dom, conflicts: L1.conflicts, hardConflicts: L1.hardConflicts, versions: versions1 });
        return;
      }
      if (event.data.type === "getCurrentPage") {`),
  "getMultiVersionInfo handler");

fs.writeFileSync(PB, src, "utf8");
console.log("P1 patch A applied. delta=" + src.length);