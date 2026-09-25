// P1 修复 G：versionCount 以 totalCanvasArray 为唯一真源（DOM liCount 仅作软冲突告警；避免站点额外 .pageWrapMulti 容器误判版数）
"use strict";
const fs = require("fs");

function patchFile(F, indent, label) {
  const raw = fs.readFileSync(F, "utf8");
  const crlf = raw.indexOf("\r\n") >= 0;
  let src = crlf ? raw.split("\r\n").join("\n") : raw;
  const P = (s) => s.split("\n").map((l) => (l ? indent + l : l)).join("\n");

  const OLD = P(`  const arrVersionCount = zyVersionCountOf(totalLen);
  const versionCount = liCount != null ? liCount : arrVersionCount;`);
  const NEW = P(`  const arrVersionCount = zyVersionCountOf(totalLen);
  // 版数唯一真源 = totalCanvasArray 长度（硬事实：每版占 2 个连续条目）。
  // DOM .pageWrapMulti li 数量仅作软冲突告警 —— 站点可能存在额外/隐藏的 .pageWrapMulti 容器（幽灵 li），
  // 以 DOM 优先会把单版误判为多版（P1 首版曾在真机偶发触发）。
  const versionCount = arrVersionCount;`);
  const i = src.indexOf(OLD);
  if (i < 0) throw new Error("ANCHOR MISS [" + label + "]");
  if (src.indexOf(OLD, i + 1) >= 0) throw new Error("ANCHOR NOT UNIQUE [" + label + "]");
  src = src.slice(0, i) + NEW + src.slice(i + OLD.length);

  // liCount 采集：只取第一个 .pageWrapMulti 容器（排除额外容器干扰）—— 仅 page-bridge（模块为纯函数，无 DOM 采集）
  if (label === "page-bridge.js") {
    const OLD2 = P(`    const lis = document.querySelectorAll(".pageWrapMulti li");
    liCount = lis.length;
    const curLi = document.querySelector(".pageWrapMulti li.currentLi");
    curLiIdx = curLi ? Array.prototype.indexOf.call(lis, curLi) : null;
    const gs = document.querySelectorAll(".pageWrapMulti .page-group");
    const curG = document.querySelector(".pageWrapMulti .page-group.current");
    curGroupIdx = curG ? Array.prototype.indexOf.call(gs, curG) : null;`);
    const NEW2 = P(`    // 只取第一个 .pageWrapMulti 容器（站点主 UI）；排除额外/隐藏容器的幽灵 li
    const wrapEl = document.querySelector(".pageWrapMulti");
    const lis = wrapEl ? wrapEl.querySelectorAll("li") : document.querySelectorAll(".pageWrapMulti li");
    liCount = lis.length;
    const curLi = wrapEl ? wrapEl.querySelector("li.currentLi") : document.querySelector(".pageWrapMulti li.currentLi");
    curLiIdx = curLi ? Array.prototype.indexOf.call(lis, curLi) : null;
    const gs = wrapEl ? wrapEl.querySelectorAll(".page-group") : document.querySelectorAll(".pageWrapMulti .page-group");
    const curG = wrapEl ? wrapEl.querySelector(".page-group.current") : document.querySelector(".pageWrapMulti .page-group.current");
    curGroupIdx = curG ? Array.prototype.indexOf.call(gs, curG) : null;`);
    const j = src.indexOf(OLD2);
    if (j < 0) throw new Error("ANCHOR MISS2 [" + label + "]");
    if (src.indexOf(OLD2, j + 1) >= 0) throw new Error("ANCHOR NOT UNIQUE2 [" + label + "]");
    src = src.slice(0, j) + NEW2 + src.slice(j + OLD2.length);
  }

  fs.writeFileSync(F, crlf ? src.split("\n").join("\r\n") : src, "utf8");
  console.log("  patched " + label);
}

patchFile("D:\\zheliyin-scriptcat\\extension\\src\\editor\\template-snapshot.js", "", "template-snapshot.js");
patchFile("D:\\zheliyin-scriptcat\\extension\\src\\editor\\page-bridge.js", "    ", "page-bridge.js");
console.log("P1 fix G applied.");