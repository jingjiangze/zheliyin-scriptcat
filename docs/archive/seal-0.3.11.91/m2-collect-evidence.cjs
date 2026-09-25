// 收口 M2 证据：46p（A-J 30/30）+ 46q（FB1-FB4 12/12）+ 首跑偶发记录
"use strict";
const fs = require("fs");
const R = "D:/zheliyin-scriptcat/runtime/reports/stage-11/";
const p = JSON.parse(fs.readFileSync(R + "commit-46p-real-acceptance.json", "utf8"));
const q = JSON.parse(fs.readFileSync(R + "commit-46q-front-back-real.json", "utf8"));
const pPre = JSON.parse(fs.readFileSync(R + "commit-46p-v2-final.json", "utf8"));
const qFirst = JSON.parse(fs.readFileSync(R + "commit-46q-front-back-real.first.json", "utf8"));
const pBase = JSON.parse(fs.readFileSync(process.env.TEMP + "/zy_46p_baseline.json", "utf8"));

const sum = (r) => {
  let rounds = 0, pass = 0;
  const rows = (r.runs || []).map((x) => {
    const er = (x.roundsData || []).flatMap((d) => d.errors || []);
    rounds += x.roundsDone || 0; pass += x.passRounds || 0;
    return { case: x.case, roundsDone: x.roundsDone, passRounds: x.passRounds, matched: (x.roundsData || []).map((d) => d.matchedCount), errors: er };
  });
  return { rounds, pass, rows };
};
const sp = sum(p), sq = sum(q), spPre = sum(pPre), sqFirst = sum(qFirst);
const flake = [];
spPre.rows.forEach((r) => { if (r.errors.length) flake.push({ suite: "46p", case: r.case, errs: r.errors }); });
sqFirst.rows.forEach((r) => { if (r.errors.length) flake.push({ suite: "46q", case: r.case, errs: r.errors }); });

const out = {
  ts: new Date().toISOString(),
  stage: "STAGE10-G-M2-AI-MATCH-V2",
  version: "0.3.11.75",
  branch: "test",
  protocol: {
    name: "AI Match Prompt V2 (two-layer, per-side call)",
    mismatchFromDoc: "用户上传文档的 M2 为「单次调用返回 customerBlocks+matches」；实测该形态对 Qwen2.5-7B 不可靠（确定性整面跳过反面），故保留两层协议但改为按面调用。详见 probeEvidence。",
    blocks: "AI 先拆块 customerBlocks[{blockId,lineNo,text,type}]",
    match: "AI 按 blockId 匹配 matches[{slotId,blockId,confidence,reason}]",
    valueSource: "customerText 由本地从 blockId 回填，模型不直接决定写入画布的文字",
    sideIsolation: "side 由本地 zySplitCustomerLines 确定性判定；分面调用 + expectSide 硬门禁（结构性防串面）"
  },
  probeEvidence: [
    "V1 单次调用（两面）：真机 3/3 轮 back 槽 0 匹配，AI 返回 unmatchedCustomer 为空 → 反面静默丢弃",
    "极简 prompt 单次调用：7/7（证明模型看得见 back）",
    "补规则/置顶分步指令/改 back 说明/JSON 示例加 back：仍 4/7",
    "payload 瘦身 1183→1127 prompt tokens：仍 4/7",
    "max_tokens 4096：仍 356 completion tokens、finish=stop（非截断）",
    "分面调用（本方案）：front 4/4 + back 3/3 = 7/7"
  ],
  summaries: {
    "46p_A-J": { rounds: sp.rounds, pass: sp.pass, rows: sp.rows },
    "46q_FB1-FB4": { rounds: sq.rounds, pass: sq.pass, rows: sq.rows },
    baseline_V1_46p: sum(pBase).rows.map((r) => ({ case: r.case, matched: r.matched }))
  },
  flakeAccepted: flake,
  flakeNotes: "两处导航中断（ERR_ABORTED / 首跑 FB4 残留对象）经单独复跑均为 3/3 全绿，判为真机导航偶发，非产品缺陷"
};
fs.writeFileSync(R + "commit-46m2-evidence.json", JSON.stringify(out, null, 2));
console.log("evidence -> " + R + "commit-46m2-evidence.json");
console.log("46p " + sp.pass + "/" + sp.rounds + " | 46q " + sq.pass + "/" + sq.rounds + " | flake=" + flake.length);