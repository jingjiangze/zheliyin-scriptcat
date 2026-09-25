// P0-X 第三轮修复：驱动识别「预览」通配（AI 分支 / 本地规则库降级分支均可）；补完成终止文案
"use strict";
const fs = require("fs");
const F = "D:/zheliyin-scriptcat/runtime/stage9/commit-46h-content-similar-real.js";
function readNorm(p) { const raw = fs.readFileSync(p, "utf8"); const crlf = raw.indexOf("\r\n") >= 0; return { crlf: crlf, src: crlf ? raw.split("\r\n").join("\n") : raw }; }
function writeNorm(p, src, crlf) { fs.writeFileSync(p, crlf ? src.split("\n").join("\r\n") : src, "utf8"); }
function replaceOnce(src, anchor, replacement, label) {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error("ANCHOR MISS [" + label + "]");
  if (src.indexOf(anchor, i + 1) >= 0) throw new Error("ANCHOR NOT UNIQUE [" + label + "]");
  return src.slice(0, i) + replacement + src.slice(i + anchor.length);
}
const got = readNorm(F);
let src = got.src;

// 1) 预览识别 → 通配（AI 完成 / 本地规则库降级 两种预览文案）
src = replaceOnce(src,
  "        if (st && /AI 槽位匹配完成（预览，未修改画布）/.test(st) && !confirmed && r && r.confirmReady) {",
  "        // P0-X 第三轮：预览文案有两种 —— AI 分支「AI 槽位匹配完成（预览，未修改画布）」与\n        // 本地规则库降级分支「…已改用本地规则库匹配（预览，未修改画布）…」；统一以「（预览，未修改画布）」通配识别。\n        if (st && /（预览，未修改画布）/.test(st) && !confirmed && r && r.confirmReady) {",
  "1/preview-generic");

// 2) 完成/终止文案补充（本地降级路径确认后的完成文案）
src = replaceOnce(src,
  "        if (st && /正面更新 \\d+ 槽|智能套版完成|智能套版失败|请先粘贴客户文字|AI 填充完成：更新 \\d+ 槽|没有可填槽位|无匹配/.test(st)) return { done: true, st, samples, confirmed };",
  "        if (st && /正面更新 \\d+ 槽|智能套版完成|智能套版失败|请先粘贴客户文字|更新 \\d+ 槽|没有可填槽位|无匹配|未找到匹配|无需匹配/.test(st)) return { done: true, st, samples, confirmed };",
  "2/terminal-msgs");

writeNorm(F, src, got.crlf);
const chk = fs.readFileSync(F, "utf8");
const cnt = (s) => (chk.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
console.log("patched commit-46h  genericPreview=" + cnt("（预览，未修改画布）") + " terminalMsgs=" + cnt("更新 \\d+ 槽"));
