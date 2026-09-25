// 诊断：把「正面4 + 反面3」快照按 userscript 同口径喂给 AI，抓 AI 原始 JSON 返回
// 目的：确认反面槽未被匹配是 AI 行为还是协议/输入问题（纯函数，无需浏览器）
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

const messages = plan.zyBuildTemplateMatchMessages({ front: snapshot.front, back: snapshot.back, customerRawText: RAW });

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

(async () => {
  console.log("=== user message sent to AI ===");
  console.log(messages[1].content);
  console.log("=== calling AI ===");
  const r = await post(BASE + "/chat/completions", {
    model: MODEL, temperature: 0,
    response_format: { type: "json_object" },
    messages: messages
  }, { Authorization: "Bearer " + KEY });
  console.log("http status = " + r.status);
  let content = null;
  try { const j = JSON.parse(r.body); content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content; } catch (e) {}
  if (!content) { console.log("RAW BODY: " + String(r.body).slice(0, 800)); return; }
  console.log("=== AI raw content ===");
  console.log(content);
  const ext = plan.zyExtractPlanJson(content);
  console.log("=== extract ok=" + ext.ok + (ext.ok ? "" : " err=" + ext.error) + " ===");
  if (!ext.ok) return;
  const norm = plan.zyNormalizePlanShape(ext.plan);
  console.log("norm matches=" + norm.matches.length + " unmatched=" + norm.unmatchedCustomer.length + " uncertain=" + norm.uncertain.length + " unusedSlots=" + JSON.stringify(norm.unusedSlots));
  const ref = val.zyValidateTemplateMatchPlan({ plan: norm, snapshot: snapshot, rawText: RAW, minConfidence: 0.5 });
  console.log("=== validator ===");
  console.log("refined=" + ref.matches.length + " summary=" + JSON.stringify(ref.summary));
  console.log("errors=" + JSON.stringify(ref.errors));
  console.log("refinedSlots=" + JSON.stringify(ref.matches.map((m) => m.side + ":" + m.slotId + "=" + m.customerText)));
})();
