// P1 补丁 C（修正版）：模块层 —— template-apply-v2.js 命令 version + template-match-validator.js 版维
// 注意：template-apply-v2.js 为 CRLF，template-match-validator.js 为 LF → 读入转 LF 处理，写回还原原换行
"use strict";
const fs = require("fs");
const ROOT = "D:\\zheliyin-scriptcat\\extension\\src\\";

function edit(F, steps) {
  const raw = fs.readFileSync(F, "utf8");
  const crlf = raw.indexOf("\r\n") >= 0;
  let src = crlf ? raw.split("\r\n").join("\n") : raw;
  for (const st of steps) {
    const i = src.indexOf(st.old);
    if (i < 0) throw new Error("ANCHOR MISS [" + F + "]: " + st.label);
    if (src.indexOf(st.old, i + 1) >= 0) throw new Error("ANCHOR NOT UNIQUE [" + F + "]: " + st.label);
    src = src.slice(0, i) + st.new + src.slice(i + st.old.length);
    console.log("  ok " + F.split("\\").pop() + " :: " + st.label);
  }
  fs.writeFileSync(F, crlf ? src.split("\n").join("\r\n") : src, "utf8");
}

// ============ 1) template-apply-v2.js ============
edit(ROOT + "editor\\template-apply-v2.js", [
  {
    label: "head comment",
    old: `//   6. 一槽至多一条指令（重复 slotId → 拒绝）。
// 本模块纯函数、自包含（无 require）；真源为 runtime/stage11/template-apply-v2.test.js。`,
    new: `//   6. 一槽至多一条指令（重复 slotId → 拒绝）。
// P1 多版（Stage 10-G P1）：
//   7. 每条指令携带 version（本批必须同一版；混版 → VERSION_MIXED 拒绝）——
//      version 来源优先级：match.version > snapshot.version > 0；
//      version 为 0 时即单版语义，行为与 P1 前逐字一致（向后兼容）。
// 本模块纯函数、自包含（无 require）；真源为 runtime/stage11/template-apply-v2.test.js。`
  },
  {
    label: "batchVersion init",
    old: `  const errors = [];
  const commands = [];
  const seen = {};

  matches.forEach((m, i) => {
    const slotId = zyStr(m && m.slotId);`,
    new: `  const errors = [];
  const commands = [];
  const seen = {};
  // P1 多版：本批只允许同一版（batchVersion 由首个 match 或 snapshot.version 确定）
  const snapVersion = zyIsNum(snapshot.version) ? snapshot.version : 0;
  let batchVersion = null;

  matches.forEach((m, i) => {
    const slotId = zyStr(m && m.slotId);`
  },
  {
    label: "per-match version check",
    old: `    const confidence = zyIsNum(m && m.confidence) ? m.confidence : 1;
    const reason = zyStr(m && m.reason);
    // a) slotId 必须真实存在`,
    new: `    const confidence = zyIsNum(m && m.confidence) ? m.confidence : 1;
    const reason = zyStr(m && m.reason);
    const mv = zyIsNum(m && m.version) ? m.version : snapVersion;
    if (batchVersion == null) batchVersion = mv;
    if (mv !== batchVersion) { errors.push("CMD[" + i + "] VERSION_MIXED[" + mv + " vs " + batchVersion + "]"); return; }
    // a) slotId 必须真实存在`
  },
  {
    label: "command version",
    old: `    commands.push({
      side: reg[slotId].side,
      slotId: slotId,`,
    new: `    commands.push({
      version: mv,
      side: reg[slotId].side,
      slotId: slotId,`
  },
  {
    label: "plan version in return",
    old: `  return {
    ok: errors.length === 0,
    commands: commands,
    sideGroups: sideGroups,`,
    new: `  return {
    ok: errors.length === 0,
    version: batchVersion == null ? snapVersion : batchVersion,
    commands: commands,
    sideGroups: sideGroups,`
  }
]);

// ============ 2) template-match-validator.js ============
edit(ROOT + "ai\\template-match-validator.js", [
  {
    label: "validator signature doc",
    old: `// input: { plan, snapshot, rawText, minConfidence?, typeDetector?, lines?, expectSide? }`,
    new: `// input: { plan, snapshot, rawText, minConfidence?, typeDetector?, lines?, expectSide?, expectVersion? }
//   expectVersion：本次校验所属版（P1 多版）；未传时取 snapshot.version，再退化 0（单版语义）`
  },
  {
    label: "validator expectVersion",
    old: `  const expectSide = (o.expectSide === "back" || o.expectSide === "front") ? o.expectSide : null;`,
    new: `  const expectSide = (o.expectSide === "back" || o.expectSide === "front") ? o.expectSide : null;
  const expectVersion = zyIsNum(o.expectVersion) ? o.expectVersion : (zyIsNum(snapshot.version) ? snapshot.version : 0);`
  },
  {
    label: "refined version",
    old: `    refined.push({
      slotId: slotId, slotIdx: slot.index, side: slot.side, objectUuid: slot.objectUuid,`,
    new: `    refined.push({
      version: expectVersion,
      slotId: slotId, slotIdx: slot.index, side: slot.side, objectUuid: slot.objectUuid,`
  }
]);
console.log("P1 patch C applied.");