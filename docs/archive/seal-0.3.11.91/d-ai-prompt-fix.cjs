// 定位最小有效修法：在现网长 prompt 基础上，测试「置顶分步指令 / 改写输入说明」哪个能让模型处理两面
"use strict";
const path = require("path");
const ROOT = "D:/zheliyin-scriptcat";
const plan = require(path.join(ROOT, "extension/src/ai/template-match-plan.js"));
const val = require(path.join(ROOT, "extension/src/ai/template-match-validator.js"));
const https = require("https");

const KEY = process.env.ZY_AI_KEY || "";
const BASE = process.env.ZY_AI_BASE_URL || "https://api.siliconflow.cn/v1";
const MODEL = process.env.ZY_AI_MODEL || "Qwen/Qwen2.5-7B-Instruct";

const FRONT = [{ text: "山东启诚信息技术股份", fontSize: 14 }, { text: "王晓明", fontSize: 18 }, { text: "销售副总监", fontSize: 24 }, { text: "1380 0138 000", fontSize: 15 }];
const BACK = [{ text: "主营：企业咨询", fontSize: 14 }, { text: "服务热线：400-100", fontSize: 12 }, { text: "地址：建国路89号", fontSize: 11 }];
const RAW = ["正面：", "山东启诚信息技术有限公司", "王小明", "销售总监", "电话：13800138000",
  "反面：", "主营：企业信息化咨询", "服务热线：400-888-6666", "地址：建国路88号"].join("\n");
const mk = (arr, side) => arr.map((s, i) => ({ slotId: side + "-" + (i + 1), text: s.text, layerNum: i, fontSize: s.fontSize }));
const snapshot = { front: { exists: true, items: mk(FRONT, "front") }, back: { exists: true, items: mk(BACK, "back") } };
const USER = plan.zySnapshotToAiInput({ front: snapshot.front, back: snapshot.back, customerRawText: RAW });
const BASE_PROMPT = plan.zyTemplateMatchSystemPrompt();

const HEAD = [
  "【处理顺序（必须严格执行）】",
  "第一步：处理 template.front 的槽位（slotId 形如 front-N）。",
  "第二步：若 template.back.exists 为 true，必须继续处理 template.back 的槽位（slotId 形如 back-N）——",
  "        不得只做正面就结束；客户原文中「反面：」之后的内容必须逐一尝试匹配到 back 槽。",
  "第三步：客户原文每一条内容行都必须交代（匹配进 matches 或列入 unmatchedCustomer），严禁静默丢弃。",
  "说明：客户原文用单独成行的「正面：」「反面：」分段；标记行本身不是内容；无标记时全部视为正面。",
  ""
].join("\n");

function post(urlStr, body, headers) {
  return new Promise((resolve) => {
    const u = new URL(urlStr);
    const data = JSON.stringify(body);
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: "POST", headers: Object.assign({ "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }, headers) }, (res) => {
      let buf = ""; res.on("data", (c) => { buf += c; }); res.on("end", () => resolve({ status: res.statusCode, body: buf }));
    });
    req.on("error", (e) => resolve({ status: 0, body: String(e && e.message || e) }));
    req.write(data); req.end();
  });
}
async function run(label, system) {
  const r = await post(BASE + "/chat/completions", { model: MODEL, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: USER }] }, { Authorization: "Bearer " + KEY });
  let content = null;
  try { const j = JSON.parse(r.body); content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content; } catch (e) {}
  console.log("\n##### " + label + " (len=" + system.length + ", http=" + r.status + ") #####");
  if (!content) { console.log("NULL: " + String(r.body).slice(0, 300)); return; }
  const ext = plan.zyExtractPlanJson(content);
  if (!ext.ok) { console.log("EXTRACT FAIL " + ext.error); return; }
  const norm = plan.zyNormalizePlanShape(ext.plan);
  const ref = val.zyValidateTemplateMatchPlan({ plan: norm, snapshot: snapshot, rawText: RAW, minConfidence: 0.5 });
  const backM = ref.matches.filter((m) => m.side === "back");
  console.log("refined=" + ref.matches.length + "/7 backMatched=" + backM.length + " unmatched=" + ref.summary.unmatched + " errors=" + JSON.stringify(ref.errors));
  console.log("slots: " + JSON.stringify(ref.matches.map((m) => m.slotId + "=" + m.customerText)));
}
(async () => {
  await run("A. 现网 prompt（对照）", BASE_PROMPT);
  await run("F. 置顶分步指令 + 现网 prompt", HEAD + BASE_PROMPT);
  await run("G. 置顶分步指令（更简）+ 现网 prompt 尾部截短", HEAD + BASE_PROMPT.split("\n").slice(0, 45).join("\n"));
})();
