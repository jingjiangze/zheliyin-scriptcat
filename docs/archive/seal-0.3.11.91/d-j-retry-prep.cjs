// 保存 demo 轨验收报告证据 + 生成仅重跑 J 的合并基线
"use strict";
const fs = require("fs");
const ROOT = "D:/zheliyin-scriptcat";
const REPORT = ROOT + "/runtime/reports/stage-11/commit-46p-real-acceptance.json";
const EV = ROOT + "/runtime/reports/stage-11/commit-46p-demo-real-acceptance.json";

const raw = fs.readFileSync(REPORT, "utf8");
const r = JSON.parse(raw);

// 1) 固化 demo 轨首次验收证据（含 J 偶发失败）
r.stage = "STAGE10-G-COMMIT-L8-DEMO-REAL-ACCEPTANCE";
r.demoTrack = true;
r.note = "demo 轨（0.3.11.74）真机验收：A-J 十模板 ×3 轮；J r1 AI provider 超时 PREVIEW_NOT_DONE（偶发，r2/r3 全绿）";
fs.writeFileSync(EV, JSON.stringify(r, null, 2));
console.log("evidence -> " + EV + " runs=" + (r.runs || []).length);

// 2) 生成仅重跑 J 的基线：移除 J run，其余保留（供 ZY_MERGE=1 ZY_CASE=J 使用）
const base = JSON.parse(raw);
base.runs = (base.runs || []).filter((x) => x.case !== "J");
base.errors = [];
fs.writeFileSync(REPORT, JSON.stringify(base, null, 2));
console.log("baseline (J removed) runs=" + base.runs.length + " -> " + REPORT);
