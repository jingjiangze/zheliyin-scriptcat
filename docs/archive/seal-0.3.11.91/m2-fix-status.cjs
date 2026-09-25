// 修复：状态区 8 行窗口把「完成标志句」挤出 → 断言取不到（功能本身已 7/7 全中）
//  1) setStatus 行数上限 8 → 16（状态区已 max-height + overflow-y auto，仅显示影响）
//  2) aiTemplateSlotMatch 状态文案压缩：头部+摘要合并为 1 行；逐面汇报合并为 1 行
"use strict";
const fs = require("fs");
const US = "D:\\zheliyin-scriptcat\\zheliyin-card-assistant.user.js";
let src = fs.readFileSync(US, "utf8");
const nl = src.indexOf("\r\n") >= 0 ? "\r\n" : "\n";

// 1) 行数上限
const oldCap = 'state.logs = String(text || "").split("\\n").filter(Boolean).slice(-8);';
const newCap = 'state.logs = String(text || "").split("\\n").filter(Boolean).slice(-16);';
if (src.indexOf(oldCap) < 0) { console.error("FATAL: setStatus 锚点未命中"); process.exit(1); }
src = src.replace(oldCap, newCap);

// 2) 状态文案压缩
const oldBlock = [
'      const lines = [',
'        "AI 槽位匹配完成（预览，未修改画布）：",',
'        "匹配 " + ordered.length + "/" + total + " 槽（语义校验 " + verifiedN + "）" + (uncertainN ? "；不确定 " + uncertainN + " 项" : "") + "；未匹配 " + unmatchedN + " 项"',
'      ];',
'      reports.forEach(function (r) {',
'        const tag = (r.side === "back" ? "[反] " : "[正] ");',
'        lines.push(tag + "槽 " + r.slots + " / 行 " + r.rows + " → 匹配 " + r.matched + (r.failed ? "（调用失败）" : (r.skipped ? "（" + r.skipped + "）" : "")));',
'      });',
'      ordered.slice(0, 8).forEach(function (m) { lines.push((m.side === "back" ? "[反] " : "") + m.slotId + " ← " + String(m.customerText).slice(0, 30)); });'
].join(nl);
const newBlock = [
'      const sideLine = reports.map(function (r) {',
'        const tag = (r.side === "back" ? "[反] " : "[正] ");',
'        return tag + "槽 " + r.slots + " / 行 " + r.rows + " → 匹配 " + r.matched + (r.failed ? "（调用失败）" : (r.skipped ? "（" + r.skipped + "）" : ""));',
'      }).join(" ｜ ");',
'      const lines = [',
'        "AI 槽位匹配完成（预览，未修改画布）：匹配 " + ordered.length + "/" + total + " 槽（语义校验 " + verifiedN + "）" + (uncertainN ? "；不确定 " + uncertainN + " 项" : "") + "；未匹配 " + unmatchedN + " 项"',
'      ];',
'      if (sideLine) lines.push(sideLine);',
'      ordered.slice(0, 10).forEach(function (m) { lines.push((m.side === "back" ? "[反] " : "") + m.slotId + " ← " + String(m.customerText).slice(0, 30)); });'
].join(nl);
if (src.indexOf(oldBlock) < 0) { console.error("FATAL: 状态文案锚点未命中"); process.exit(1); }
src = src.replace(oldBlock, newBlock);

fs.writeFileSync(US, src, "utf8");
console.log("patched: setStatus cap 8->16 + 状态文案压缩");
