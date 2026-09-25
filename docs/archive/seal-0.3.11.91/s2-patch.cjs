// 阶段2a（P0-2）：字号求解单一入口 zyPickFontSize —— 优先 M5 zyFitFontSize（单一来源），缺注入回退历史 Fusion
// 行为约束：smart 路径显式传 minFontSize=10（保持其 [10,160] 契约）；v2 路径不传（沿用 Fit 默认 0.6·base）
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = "D:/zheliyin-scriptcat";
const PB = path.join(ROOT, "extension", "src", "editor", "page-bridge.js");

function readNorm(F) { const raw = fs.readFileSync(F, "utf8"); const crlf = raw.indexOf("\r\n") >= 0; return { crlf: crlf, src: crlf ? raw.split("\r\n").join("\n") : raw }; }
function writeNorm(F, src, crlf) { fs.writeFileSync(F, crlf ? src.split("\n").join("\r\n") : src, "utf8"); }
function replaceOnce(src, anchor, replacement, label) {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error("ANCHOR MISS [" + label + "]");
  if (src.indexOf(anchor, i + 1) >= 0) throw new Error("ANCHOR NOT UNIQUE [" + label + "]");
  return src.slice(0, i) + replacement + src.slice(i + anchor.length);
}

const got = readNorm(PB);
let src = got.src;

// A) 新增单一入口 + Fusion 标注弃用
src = replaceOnce(src,
  "    // fontSize 自适应（advance-width 主路径镜像；无源图墨迹场景 → 按容器宽二分解最大不溢出字号）。\n    // 写回只允许 fontSize；lineHeight/charSpacing 由调用方只读取证（Stage 10-C 暂停约束）。\n    function zySolveFontSizeFusion(input) {",
  [
    "    // 阶段2 P0-2（2026-09-25）：字号求解【单一入口】——",
    "    //   优先使用 M5 单一来源 zyFitFontSize（由 installPageBridge 注入 page 世界，见 template-text-fit.js），",
    "    //   仅当注入缺失时回退历史 zySolveFontSizeFusion（@deprecated，待真机确认后删除）。",
    "    // 契约：调用方给 baseFontSize（当前字号）+ minFontSize（本路径策略下限；smart=10，v2 不传=0.6·base）。",
    "    // 红线不变：只写 fontSize；lineHeight/charSpacing/几何/身份/层序一律不动。",
    "    function zyPickFontSize(input) {",
    "      var o = input || {};",
    "      var fitFn = (typeof zyFitFontSize === \"function\") ? zyFitFontSize : null;",
    "      if (fitFn) {",
    "        return fitFn({ text: o.text, targetWidth: o.targetWidth, fontFamily: o.fontFamily, baseFontSize: o.baseFontSize, measurer: o.measurer, minFontSize: o.minFontSize });",
    "      }",
    "      // 回退：历史融合求解（其自身下限 10px；返回结构兼容 ok/fontSize/reason）",
    "      return zySolveFontSizeFusion({ text: o.text, targetVisualWidth: o.targetWidth, fontFamily: o.fontFamily, measurer: o.measurer });",
    "    }",
    "    // @deprecated 阶段2：新代码一律走 zyPickFontSize；本函数仅为注入缺失时的回退，确认后删除。",
    "    // fontSize 自适应（advance-width 主路径镜像；无源图墨迹场景 → 按容器宽二分解最大不溢出字号）。",
    "    // 写回只允许 fontSize；lineHeight/charSpacing 由调用方只读取证（Stage 10-C 暂停约束）。",
    "    function zySolveFontSizeFusion(input) {"
  ].join("\n"),
  "A/helper");

// B) smart 路径改用单一入口（显式 minFontSize=10 保持 [10,160] 契约）
src = replaceOnce(src,
  "            fsResult = zySolveFontSizeFusion({ text: text, targetVisualWidth: targetW, fontFamily: so.fontFamily || \"sans-serif\", measurer: measurer });",
  "            fsResult = zyPickFontSize({ text: text, targetWidth: targetW, fontFamily: so.fontFamily || \"sans-serif\", baseFontSize: fsFrom, minFontSize: 10, measurer: measurer });",
  "B/smart");

// C) v2 路径改用单一入口（不传 minFontSize → Fit 默认 0.6·base）
src = replaceOnce(src,
  "          const v2FitFn = (typeof zyFitFontSize === \"function\") ? zyFitFontSize : null;",
  "          const v2FitFn = (typeof zyPickFontSize === \"function\") ? zyPickFontSize : null;",
  "C/v2-fn");
src = replaceOnce(src,
  "                fit = v2FitFn({ text: text, targetWidth: fsTarget, fontFamily: so.fontFamily || \"sans-serif\", baseFontSize: fsFrom, measurer: v2Measurer });",
  "                fit = v2FitFn({ text: text, targetWidth: fsTarget, fontFamily: so.fontFamily || \"sans-serif\", baseFontSize: fsFrom, measurer: v2Measurer, minFontSize: null });",
  "C/v2-call");

writeNorm(PB, src, got.crlf);
const chk = fs.readFileSync(PB, "utf8");
const cnt = (s) => (chk.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
console.log("patched page-bridge.js");
console.log("  zyPickFontSize=" + cnt("zyPickFontSize") + " fusionCalls=" + cnt("zySolveFontSizeFusion(") + " deprecatedTag=" + cnt("@deprecated") + " smartMin10=" + cnt("minFontSize: 10") + " fitDirectCalls=" + cnt("zyFitFontSize({\n"));
