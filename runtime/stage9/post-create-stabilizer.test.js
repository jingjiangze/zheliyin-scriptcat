// runtime/stage9/post-create-stabilizer.test.js — Commit C 稳定化裁定单测
"use strict";
const { decideStabilize, STAB_DEFAULT_TOL_PX, STAB_WAIT_MS } = require("../../extension/src/editor/post-create-stabilizer.js");
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) { pass += 1; console.log("  ok  " + name); } else { fail += 1; console.log("  FAIL " + name); } };

// 1. 无位移 → NOOP
{
  const r = decideStabilize({ requested: { left: 187, top: 9 }, actual: { left: 187, top: 9 } });
  t("within-tol noop", r.action === "NOOP" && r.shouldCorrect === false && r.reason === null);
}
// 2. 亚像素噪声（<0.5）→ NOOP 记录 dev
{
  const r = decideStabilize({ requested: { left: 187, top: 9 }, actual: { left: 187.3, top: 9.4 } });
  t("subpixel noise noop with dev", r.action === "NOOP" && r.devLeft === 0.3 && r.devTop === 0.4);
}
// 3. 旧系统性 -5.4 残差：已在 tolPx=6 内（当前体系真机已收敛到 ±0.5，5.4 视为容差内）→ NOOP
{
  const r = decideStabilize({ requested: { left: 378, top: 40 }, actual: { left: 372.6, top: 40 } });
  t("legacy -5.4 within tol noop", r.action === "NOOP" && r.devLeft === -5.4 && r.devTop === 0);
}
// 4. 大偏移 -27.3（YOUR LOGO 站点缩略图命令竞态残差）→ RESTORE_REQUESTED
{
  const r = decideStabilize({ requested: { left: 325, top: 20 }, actual: { left: 297.7, top: 20 } });
  t("big -27.3 drift restores", r.action === "RESTORE_REQUESTED" && r.devLeft === -27.3);
}
// 5. 简 dx=-20.9（同源竞态）→ RESTORE_REQUESTED
{
  const r = decideStabilize({ requested: { left: 424, top: 100 }, actual: { left: 403.1, top: 100 } });
  t("jian -20.9 drift restores", r.action === "RESTORE_REQUESTED" && r.devLeft === -20.9);
}
// 6. 19:52 run 夏祝莲 -14（无保护时 final=173 vs requested 187）→ RESTORE_REQUESTED
{
  const r = decideStabilize({ requested: { left: 187, top: 9 }, actual: { left: 173, top: 9 } });
  t("xiazhu -14 drift restores", r.action === "RESTORE_REQUESTED" && r.devLeft === -14);
}
// 7. tol 边界：-6 恰好等于 tolPx → NOOP（严格大于）
{
  const r = decideStabilize({ requested: { left: 100, top: 10 }, actual: { left: 94, top: 10 } });
  t("tol boundary ==tol no drift", r.action === "NOOP");
}
// 8. -6.1 超过 tolPx → RESTORE
{
  const r = decideStabilize({ requested: { left: 100, top: 10 }, actual: { left: 93.9, top: 10 } });
  t("tol boundary >tol restores", r.action === "RESTORE_REQUESTED" && r.devLeft === -6.1);
}
// 9. 纵向漂移触发（top 超上限 while left 内）→ RESTORE_REQUESTED
{
  const r = decideStabilize({ requested: { left: 50, top: 30 }, actual: { left: 50, top: 38 } });
  t("top drift triggers restore", r.action === "RESTORE_REQUESTED" && r.devTop === 8);
}
// 10. 自定义 tolPx
{
  const r = decideStabilize({ requested: { left: 100, top: 10 }, actual: { left: 96, top: 10 }, opts: { tolPx: 3 } });
  t("custom tolPx=3 triggers", r.action === "RESTORE_REQUESTED" && r.devLeft === -4);
}
// 11. 常量导出
t("const tol=6", STAB_DEFAULT_TOL_PX === 6);
t("const wait=1200", STAB_WAIT_MS === 1200);

console.log("post-create-stabilizer.test: " + pass + " pass, " + fail + " fail");
process.exit(fail ? 1 : 0);