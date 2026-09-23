// =====================================================================
// extension/src/editor/post-create-stabilizer.js — Stage 9.9 Commit C
// ---------------------------------------------------------------------
// 单一职责：创建后「站点异步命令位移」的稳定化裁定（纯函数，禁止副作用）。
// 背景（2026-09-22 真机 setEvents 证据）：
//   每次 Native 创建后，站点 CreateLayerThumbnailCommand（缩略图命令）都会
//   异步执行 setPositionByOrigin → toCanvasElement/toDataURL：
//     - 先临时移动对象（left≈0 附近），渲染缩略图；
//     - 再恢复 left 回 afterDraw 原值。
//   恢复写回与 readActualInk 采样存在时序竞态 → 偶发残留位移（dx=-5.4~-27 实测）。
//   19:52 run（无本保护）final=173（dx=-14）；有保护后全行收敛（devLeft<0.5）。
// 本模块裁定：|devLeft|>tolPx 或 |devTop|>tolPx 时，应把对象拨回 requested（唯一权威），
//   否则 NOOP。禁止固定 multiplier / 经验修正；拨回值必须等于 OCR bbox → targetQuad 的请求值。
// 页面 world 镜像：page-bridge ocrCreate native 分支（同构手写，逐字一致）。
// =====================================================================
"use strict";

var STAB_DEFAULT_TOL_PX = 6;
var STAB_WAIT_MS = 1200;

// input: { requested:{left,top}, actual:{left,top}, opts:{tolPx?:Number=6} }
// return: { shouldCorrect:Boolean, devLeft:Number, devTop:Number, action:"RESTORE_REQUESTED"|"NOOP", reason:String|null }
function decideStabilize(input) {
  var o = input || {};
  var req = o.requested || {};
  var act = o.actual || {};
  var tolPx = (o.opts && typeof o.opts.tolPx === "number" && o.opts.tolPx > 0) ? o.opts.tolPx : STAB_DEFAULT_TOL_PX;
  var devLeft = Math.round((act.left - req.left) * 100) / 100;
  var devTop = Math.round((act.top - req.top) * 100) / 100;
  var dL = Math.abs(devLeft), dT = Math.abs(devTop);
  if (dL > tolPx || dT > tolPx) {
    return { shouldCorrect: true, devLeft: devLeft, devTop: devTop, action: "RESTORE_REQUESTED", reason: "SITE_ASYNC_GEOMETRY_DRIFT" };
  }
  return { shouldCorrect: false, devLeft: devLeft, devTop: devTop, action: "NOOP", reason: null };
}

if (typeof module !== "undefined" && module.exports) module.exports = { decideStabilize: decideStabilize, STAB_DEFAULT_TOL_PX: STAB_DEFAULT_TOL_PX, STAB_WAIT_MS: STAB_WAIT_MS };
