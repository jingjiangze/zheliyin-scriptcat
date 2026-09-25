// 决定性实验：在 system prompt 中补充「正面：/反面：分段标记 + 客户行必须全部交代」后，
// 观察 AI 是否开始匹配 back 槽。用于确认根因是 prompt 未告知分段约定。
"use strict";
const path = require("path");
const ROOT = "D:/zheliyin-scriptcat";
const plan = require(path.join(ROOT, "extension/src/ai/template-match-plan.js"));
const val = require(path.join(ROOT, "extension/src/ai/template-match-validator.js"));
const https = require("https");

const KEY = process.env.ZY_AI_KEY || "";
const BASE = process.env.ZY_AI_BASE_URL || "https://api.siliconflow.cn/v1";
const MODEL = process.env.ZY_AI_MODEL || "Qwen/Qwen2.5-7B-Instruct";

const FRONT = [
  { text: "山东启诚信息技术股份", fontSize: 14, layerNum: 0 },
  { text: "王晓明", fontSize: 18, layerNum: 1 },
  { text: "销售副总监", fontSize: 24, layerNum: 2 },
  { text: "1380 0138 000", fontSize: 15, layerNum: 3 }
];
const BACK = [
  { text: "主营：企业咨询", fontSize: 14, layerNum: 500 },
  { text: "服务热线：400-100", fontSize: 12, layerNum: 501 },
  { text: "地址：建国路89号", fontSize: 11, layerNum: 502 }
];
const RAW = ["正面：", "山东启诚信息技术有限公司", "王小明", "销售总监", "电话：13800138000",
  "反面：", "主营：企业信息化咨询", "服务热线：400-888-6666", "地址：建国路88号"].join("\n");

const mkItems = (arr, side) => arr.map((s, i) => ({ slotId: side + "-" + (i + 1), objectUuid: "uuid-" + side + "-" + (i + 1), text: s.text, layerNum: s.layerNum, fontSize: s.fontSize }));
const snapshot = { front: { exists: true, items: mkItems(FRONT, "front") }, back: { exists: true, items: mkItems(BACK, "back") } };

const EXTRA_RULES = [
  "",
  "15. 客户原文可能用单独成行的「正面：」「反面：」标记正反两面：标记行本身不是客户内容；",
  "    出现在「正面：」与「反面：」之间的行属于正面，出现在「反面：」之后的行属于反面；",
  "    没有任何标记时，全部行视为正面。front 槽位只能取正面的行，back 槽位只能取反面的行。",
  "16. 客户原文的每一条内容行都必须被交代：要么出现在 matches 中，要么出现在 unmatchedCustomer 中；",
  "    严禁静默丢弃任何客户内容行（漏项必须显式列出）。",
  "17. 若模板 back.exists 为 true 且客户原文含反面内容，必须为 back 槽位逐一尝试匹配，不得整面跳过。"
].join("\n");

function post(urlStr, body, headers) {
  return new Promise((resolve) => {
    const u = new URL(urlStr);
    const data = JSON.stringify(body);
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: "POST", headers: Object.assign({ "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }, headers) }, (res) => {
      let buf = "";
      res.on("data", (c) => { buf += c; });
      res.on("end", () => resolve({ status: res.statusCode, body: buf }));
    });
    req.on("error", (e) => resolve({ status: 0, body: String(e && e.message || e) }));
    req.write(data); req.end();
  });
}

async function run(label, systemPrompt) {
  const messages = [{ role: "system", content: systemPrompt }, { role: "user", content: plan.zySnapshotToAiInput({ front: snapshot.front, back: snapshot.back, customerRawText: RAW }) }];
  const r = await post(BASE + "/chat/completions", { model: MODEL, temperature: 0, response_format: { type: "json_object" }, messages: messages }, { Authorization: "Bearer " + KEY });
  let content = null;
  try { const j = JSON.parse(r.body); content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content; } catch (e) {}
  console.log("\n########## " + label + " (http " + r.status + ") ##########");
  if (!content) { console.log("NO CONTENT: " + String(r.body).slice(0, 400)); return; }
  const ext = plan.zyExtractPlanJson(content);
  if (!ext.ok) { console.log("EXTRACT FAIL " + ext.error + " :: " + content.slice(0, 300)); return; }
  const norm = plan.zyNormalizePlanShape(ext.plan);
  const ref = val.zyValidateTemplateMatchPlan({ plan: norm, snapshot: snapshot, rawText: RAW, minConfidence: 0.5 });
  const backM = ref.matches.filter((m) => m.side === "back");
  console.log("AI raw: " + content.replace(/\s+/g, " ").slice(0, 600));
  console.log("refined=" + ref.matches.length + "/7  backMatched=" + backM.length + "  unmatched=" + ref.summary.unmatched + " uncertain=" + ref.summary.uncertain + " errors=" + JSON.stringify(ref.errors));
  console.log("slots: " + JSON.stringify(ref.matches.map((m) => m.slotId + "=" + m.customerText)));
}

(async () => {
  await run("A. 现网 prompt（对照）", plan.zyTemplateMatchSystemPrompt());
  await run("B. 现网 prompt + 分段/完整性规则", plan.zyTemplateMatchSystemPrompt() + EXTRA_RULES);
})();
