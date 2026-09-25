// P1 补丁 E：page-bridge zyCanvasLayout 改为「采集 + 内联纯函数判定」（与 template-snapshot.js 逐字一致，可单测）
"use strict";
const fs = require("fs");
const PB = "D:\\zheliyin-scriptcat\\extension\\src\\editor\\page-bridge.js";
const raw = fs.readFileSync(PB, "utf8");
const crlf = raw.indexOf("\r\n") >= 0;
let src = crlf ? raw.split("\r\n").join("\n") : raw;

const START = "    // ===== P1 多版地基：版布局只读解析（真机探测结论见";
const END = "    function findCanvasForSide(side, vIdxOpt) {";
const i0 = src.indexOf(START);
const i1 = src.indexOf(END);
if (i0 < 0) throw new Error("START anchor miss");
if (i1 < 0 || i1 <= i0) throw new Error("END anchor miss");

const BLOCK = `    // ===== P1 多版地基 =====
    // 站点 totalCanvasArray 为扁平数组，每版占 2 个连续条目（真机探测，见 runtime/reports/stage-11/multiversion-probe.json）：
    //   [v1正面c0, v1背面c1, v2正面c2, v2背面c3, ...]
    //   第 vIdx 版第 side 面 → canvasIdx = 2*vIdx + (side==='back' ? 1 : 0)
    // 以下 5 个函数为 extension/src/editor/template-snapshot.js 同名纯函数的**逐字内联镜像**
    // （页面 world 无法 require；镜像保持逐字一致，node 单测以模块为真源）。
    function zyCanvasIndexOf(version, side) {
      return Math.max(0, Math.floor(Number(version) || 0)) * 2 + (side === "back" ? 1 : 0);
    }
    function zyVersionOfCanvasIndex(canvasIdx) {
      return Math.max(0, Math.floor((Number(canvasIdx) || 0) / 2));
    }
    function zySideOfCanvasIndex(canvasIdx) {
      return ((Number(canvasIdx) || 0) % 2 === 1) ? "back" : "front";
    }
    function zyVersionCountOf(totalLen) {
      return Math.max(1, Math.ceil((Number(totalLen) || 0) / 2));
    }
    function zyDecideLayout(input) {
      const o = input || {};
      const out = {
        ok: true, code: "OK", multi: false, versionCount: 1, totalLen: 0,
        current: { vIdx: 0, side: "front", canvasIdx: 0, source: null, materialized: false },
        dom: { liCount: null, currentLiIdx: null, currentGroupIdx: null },
        conflicts: [], hardConflicts: []
      };
      const totalLen = (zyIsNum(o.totalLen) && o.totalLen >= 0) ? o.totalLen : 0;
      out.totalLen = totalLen;
      const liCount = zyIsNum(o.domLiCount) && o.domLiCount > 0 ? o.domLiCount : null;
      const curLiIdx = zyIsNum(o.domCurrentLiIdx) && o.domCurrentLiIdx >= 0 ? o.domCurrentLiIdx : null;
      const curGroupIdx = zyIsNum(o.domCurrentGroupIdx) && o.domCurrentGroupIdx >= 0 ? o.domCurrentGroupIdx : null;
      out.dom.liCount = liCount;
      out.dom.currentLiIdx = curLiIdx;
      out.dom.currentGroupIdx = curGroupIdx;
      const arrVersionCount = zyVersionCountOf(totalLen);
      const versionCount = liCount != null ? liCount : arrVersionCount;
      out.versionCount = versionCount;
      out.multi = versionCount > 1;
      const cc = (zyIsNum(o.currentCanvasNum) && o.currentCanvasNum >= 1) ? (o.currentCanvasNum - 1) : null;
      let canvasIdx = cc;
      let cs = cc != null ? "canvasObjVO.currentCanvasNum" : null;
      if (canvasIdx == null && curGroupIdx != null) { canvasIdx = curGroupIdx; cs = "domCurrentGroup"; }
      if (canvasIdx == null) { canvasIdx = 0; cs = "default0"; }
      out.current.canvasIdx = canvasIdx;
      out.current.vIdx = zyVersionOfCanvasIndex(canvasIdx);
      out.current.side = zySideOfCanvasIndex(canvasIdx);
      out.current.source = cs;
      out.current.materialized = (canvasIdx >= 0 && canvasIdx < totalLen);
      if (cc != null && curGroupIdx != null && cc !== curGroupIdx) out.hardConflicts.push("currentCanvasNum(" + cc + ")!=domCurrentGroup(" + curGroupIdx + ")");
      if (!out.current.materialized) out.hardConflicts.push("CURRENT_VERSION_NOT_MATERIALIZED(idx=" + canvasIdx + ",len=" + totalLen + ")");
      if (curLiIdx != null && curLiIdx !== out.current.vIdx) out.conflicts.push("liCurrent(" + curLiIdx + ")!=vIdx(" + out.current.vIdx + ")");
      if (liCount != null && arrVersionCount !== liCount) out.conflicts.push("domLiCount(" + liCount + ")!=arrVersionCount(" + arrVersionCount + ")");
      if (out.hardConflicts.length) { out.ok = false; out.code = "MULTI_LAYOUT_CONFLICT:" + out.hardConflicts.join("|"); }
      return out;
    }
    // 采集现场值（CanvasObjVO + 站点 UI DOM）→ 交纯函数判定；冲突显式记录，不猜。
    function zyCanvasLayout() {
      const CV = getLoadedModule("CanvasObjVO") || window.CanvasObjVO || null;
      if (!CV || !Array.isArray(CV.totalCanvasArray)) { const e0 = zyDecideLayout({ totalLen: 0 }); e0.ok = false; e0.code = "NO_CANVAS_OBJ_VO"; return e0; }
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
      return zyDecideLayout({
        totalLen: CV.totalCanvasArray.length,
        currentCanvasNum: (typeof CV.currentCanvasNum === "number") ? CV.currentCanvasNum : null,
        domLiCount: liCount,
        domCurrentLiIdx: (curLiIdx != null && curLiIdx >= 0) ? curLiIdx : null,
        domCurrentGroupIdx: (curGroupIdx != null && curGroupIdx >= 0) ? curGroupIdx : null
      });
    }
`;

src = src.slice(0, i0) + BLOCK + src.slice(i1);
fs.writeFileSync(PB, crlf ? src.split("\n").join("\r\n") : src, "utf8");
console.log("P1 patch E applied (zyCanvasLayout -> collect + decide).");