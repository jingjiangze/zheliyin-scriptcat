// ============================================================================
// extension/src/editor/page-model.js — Stage 7.6 Page Registry（只读、纯函数）
// ----------------------------------------------------------------------------
// 唯一职责：Editor Runtime → Pages。不负责 OCR / 创建 / Geometry / UI / 保存。
// 事实来源（真实运行时 252438 证据, Stage 7.4/7.5）：
//   - CanvasObjVO.currentCanvasNum（1 基）＝当前激活页序号
//   - CanvasObjVO.totalCanvasArray（动态 materialize：初始仅当前页, 切页后扩为全量）
//   - DOM .page-group.current（文本 正面/背面）＝激活页标签
//   - canvas idName（c0/c1）＋服务端模板元数据（getImgInfos.pageList[].title）
// 铁律：
//   - 禁止把裸数组 index 当唯一 identity（初始 totalCanvasArray 可能只有 1 项）
//   - side 只允许 FRONT / BACK / UNKNOWN；不允许 undefined/null/0 → FRONT 的静默降级
//   - 多个来源冲突 → PAGE_IDENTITY_CONFLICT，绝不随便选一个
// 本文件为页面世界模块：以全局命名空间暴露（与 field-core 等同模式 @require 加载）。
// 纯自视图（Node 单测可 require；浏览器侧由 ScriptCat @require 注入全局）。
// ============================================================================
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) { module.exports = factory(); }
  else { root.pageModel = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var SIDE = { FRONT: "FRONT", BACK: "BACK", UNKNOWN: "UNKNOWN" };

  function normalizeSideLabel(txt) {
    var t = String(txt == null ? "" : txt);
    if (/正面|front|fr/i.test(t)) return SIDE.FRONT;
    if (/反面|背面|back/i.test(t)) return SIDE.BACK;
    return SIDE.UNKNOWN;
  }
  // 单 canvas 条目的稳定身份：优先 idName(c0/c1)，退化用 page:N
  function identityOfPage(d, index) {
    var idName = d && d.idName ? String(d.idName) : null;
    var canvas = d && d.canvas ? d.canvas : null;
    var pageId = idName ? "canvas:" + idName : "page:" + (Number(index) + 1);
    var pageName = null;
    if (d && typeof d.pageName === "string") pageName = d.pageName;
    else if (d && typeof d.title === "string") pageName = d.title;
    return {
      pageId: pageId, pageIndex: Number(index),
      pageName: pageName, canvasId: idName, canvasIndex: Number(index),
      width: canvas && typeof canvas.getWidth === "function" ? canvas.getWidth() : null,
      height: canvas && typeof canvas.getHeight === "function" ? canvas.getHeight() : null,
      objectCount: canvas && typeof canvas.getObjects === "function" ? canvas.getObjects().length : null
    };
  }
  // 动态 materialization：当前 totalCanvasArray 全量枚举（不支持“初始化固定”假设）
  function enumeratePages(vo) {
    var total = (vo && Array.isArray(vo.totalCanvasArray)) ? vo.totalCanvasArray : [];
    var out = [];
    for (var i = 0; i < total.length; i++) out.push(identityOfPage(total[i], i));
    return out;
  }
  function getPageById(vo, pageId) {
    if (!pageId) return null;
    return enumeratePages(vo).filter(function (p) { return p.pageId === pageId; })[0] || null;
  }
  // 由 currentCanvasNum(1 基) 定位当前 canvas
  function currentByCanvasNum(vo) {
    var cv = vo && vo.currentCanvasNum;
    var total = (vo && Array.isArray(vo.totalCanvasArray)) ? vo.totalCanvasArray : [];
    if (typeof cv === "number" && cv >= 1 && cv <= total.length) {
      return { index: cv - 1, currentCanvasNum: cv, identity: identityOfPage(total[cv - 1], cv - 1) };
    }
    return { index: null, currentCanvasNum: (cv == null ? null : cv), identity: null };
  }
  // DOM 快照（页面世界直接传 document；单测传 {activePageGroupText}）
  function sideFromUi(dom) {
    var t = null;
    if (dom) {
      if (typeof dom.activePageGroupText === "string") t = dom.activePageGroupText;
      else if (typeof dom.querySelector === "function") {
        try { var el = dom.querySelector(".page-group.current"); t = el ? String(el.textContent || "").trim() : null; } catch (e) { t = null; }
      }
    }
    return normalizeSideLabel(t);
  }
  // 交叉解析当前页。
  // 层级：.page-group.current → currentCanvasNum → 业务字段(frontImgPathStr/backImgPathStr) ；
  // 若 UI side 与 canvas index 隐式 side 明确且矛盾 → PAGE_IDENTITY_CONFLICT。
  function resolvePageIdentity(vo, dom) {
    var Evidence = function (ev) { return ev; };
    var cur = currentByCanvasNum(vo);
    if (!cur.identity) {
      return { ok: false, code: "CURRENT_PAGE_UNKNOWN", pageId: null, side: SIDE.UNKNOWN,
        reason: "current canvas unresolved", evidence: Evidence({ currentCanvasNum: cur.currentCanvasNum }) };
    }
    var uiSide = sideFromUi(dom);
    var side = SIDE.UNKNOWN, sideSource = null;
    if (uiSide !== SIDE.UNKNOWN) { side = uiSide; sideSource = "page-group.current"; }
    else if (vo && vo.frontImgPathStr && cur.index === 0) { side = SIDE.FRONT; sideSource = "frontImgPathStr+index0"; }
    else if (vo && vo.backImgPathStr) { side = SIDE.BACK; sideSource = "backImgPathStr"; }
    // 交叉矛盾检测：仅当 UI 与 index 隐式值均明确且冲突
    var implicit = cur.index === 0 ? SIDE.FRONT : (cur.index === 1 ? SIDE.BACK : SIDE.UNKNOWN);
    if (uiSide !== SIDE.UNKNOWN && implicit !== SIDE.UNKNOWN && uiSide !== implicit) {
      return { ok: false, code: "PAGE_IDENTITY_CONFLICT", pageId: null, side: SIDE.UNKNOWN,
        reason: "ui side conflicts canvas index", evidence: Evidence({ currentCanvasNum: cur.currentCanvasNum, uiSide: uiSide, canvasId: cur.identity.canvasId, conflictingImplicit: implicit }) };
    }
    return { ok: true, code: "OK", pageId: cur.identity.pageId, side: side, sideSource: sideSource,
      identity: cur.identity, currentCanvasNum: cur.currentCanvasNum, pageIndex: cur.identity.pageIndex,
      canvasId: cur.identity.canvasId, canvasIndex: cur.identity.canvasIndex, width: cur.identity.width, height: cur.identity.height };
  }
  function getCurrentPage(vo, dom) { return resolvePageIdentity(vo, dom); }
  function getFrontPage(vo, dom) {
    var cur = resolvePageIdentity(vo, dom);
    if (cur.ok && cur.side === SIDE.FRONT) return cur;
    var pages = enumeratePages(vo);
    var byName = pages.filter(function (p) { return /正面|front/i.test(String(p.pageName || "")); })[0];
    if (byName) return { ok: true, code: "OK-BY-PAGENAME", pageId: byName.pageId, side: SIDE.FRONT, sideSource: "pageName", identity: byName };
    return { ok: false, code: "FRONT_UNRESOLVED", pageId: null, side: SIDE.UNKNOWN, pages: pages };
  }
  function getBackPage(vo, dom) {
    var cur = resolvePageIdentity(vo, dom);
    if (cur.ok && cur.side === SIDE.BACK) return cur;
    var pages = enumeratePages(vo);
    var byName = pages.filter(function (p) { return /反面|背面|back/i.test(String(p.pageName || "")); })[0];
    if (byName) return { ok: true, code: "OK-BY-PAGENAME", pageId: byName.pageId, side: SIDE.BACK, sideSource: "pageName", identity: byName };
    return { ok: false, code: "BACK_UNRESOLVED", pageId: null, side: SIDE.UNKNOWN, pages: pages };
  }
  function isKnownPage(vo, pageId) { return !!getPageById(vo, pageId); }
  return {
    SIDE: SIDE, normalizeSideLabel: normalizeSideLabel, identityOfPage: identityOfPage,
    enumeratePages: enumeratePages, getPageById: getPageById, currentByCanvasNum: currentByCanvasNum,
    sideFromUi: sideFromUi, resolvePageIdentity: resolvePageIdentity, getCurrentPage: getCurrentPage,
    getFrontPage: getFrontPage, getBackPage: getBackPage, isKnownPage: isKnownPage
  };
});