"use strict";
// runtime/stage11/multiversion-p2.test.js — P2 多版套版（仅当前版）：zySelectCommands 版+面作用域选取
// 真源：extension/src/editor/template-apply-v2.js
// 契约：作用域 = 仅当前版；跨版指令一律拒绝（ok=false）且不入选；side 过滤仅接受 front/back。
const assert = require("assert");
const path = require("path");
const A = require(path.join(__dirname, "..", "..", "extension", "src", "editor", "template-apply-v2.js"));

const mk = (side, i, version) => ({ version: version, side: side, slotId: side + "-" + (i + 1), slotIdx: i, objectUuid: side + "-u" + i, customerText: "T" + i, confidence: 0.9 });
const cmdsV1 = [mk("front", 0, 1), mk("front", 1, 1), mk("back", 0, 1)];

// 1) 仅当前版 + 当前面
const s1 = A.zySelectCommands({ commands: cmdsV1, version: 1, side: "front" });
assert.strictEqual(s1.ok, true, JSON.stringify(s1.errors));
assert.strictEqual(s1.commands.length, 2);
assert.ok(s1.commands.every((c) => c.side === "front" && c.version === 1));
assert.strictEqual(s1.summary.picked, 2);
console.log("[multiversion-p2] PASS 1 current version + current side");

// 2) 仅当前版 + 正反面（side=null → 不按面过滤）
const s2 = A.zySelectCommands({ commands: cmdsV1, version: 1, side: null });
assert.strictEqual(s2.ok, true);
assert.strictEqual(s2.commands.length, 3);
console.log("[multiversion-p2] PASS 2 current version + both sides");

// 3) 跨版拒绝：混入第 2 版指令 → ok=false 且该条不入选（隔离每一版）
const cmdsMix = cmdsV1.concat([mk("front", 0, 2)]);
const s3 = A.zySelectCommands({ commands: cmdsMix, version: 1, side: null });
assert.strictEqual(s3.ok, false, "跨版必须拒绝");
assert.ok(s3.errors.join("|").indexOf("VERSION_OUT_OF_SCOPE") >= 0, JSON.stringify(s3.errors));
assert.strictEqual(s3.commands.length, 3, "仅保留当前版指令");
console.log("[multiversion-p2] PASS 3 cross-version rejected (version isolation)");

// 4) version=null → 不按版过滤（通用工具）；仍可按面过滤
const s4 = A.zySelectCommands({ commands: cmdsMix, version: null, side: "back" });
assert.strictEqual(s4.ok, true);
assert.strictEqual(s4.commands.length, 1);
assert.strictEqual(s4.commands[0].version, 1);
assert.strictEqual(s4.commands[0].side, "back");
console.log("[multiversion-p2] PASS 4 no-version passthrough + side filter");

// 5) 非法 side（非 front/back）→ 视为不按面过滤（防御，不误选）
const s5 = A.zySelectCommands({ commands: cmdsV1, version: 1, side: "left" });
assert.strictEqual(s5.side, null);
assert.strictEqual(s5.commands.length, 3);
console.log("[multiversion-p2] PASS 5 invalid side ignored");

// 6) 空输入不炸
const s6 = A.zySelectCommands({});
assert.strictEqual(s6.ok, true);
assert.strictEqual(s6.commands.length, 0);
assert.strictEqual(s6.summary.total, 0);
console.log("[multiversion-p2] PASS 6 empty input");

// 7) 无 version 字段的旧指令按 0 处理；当前版 0 时正常入选
const s7 = A.zySelectCommands({ commands: [{ side: "front", slotId: "front-1", slotIdx: 0, customerText: "X" }], version: 0, side: "front" });
assert.strictEqual(s7.ok, true);
assert.strictEqual(s7.commands.length, 1, "缺 version 视作 0（向后兼容单版）");
console.log("[multiversion-p2] PASS 7 legacy command defaults to version 0");

console.log("[multiversion-p2] ALL PASS");
