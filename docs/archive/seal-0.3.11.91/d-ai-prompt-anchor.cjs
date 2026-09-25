// 验证假设：现网 prompt 的 JSON 示例/说明全是 front 示例 → 模型被锚定在正面
//  H: 现网 prompt，仅把「输入」的 back 行改为强约束
//  I: 现网 prompt，JSON 示例加入 back 匹配示例
//  J: 现网 prompt，H+I 同时
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
const P = plan.zyTemplateMatchSystemPrompt();

const H = P.replace(
  "2. template.back：设计画布反面全部文字图层（可能有，可能缺省）",
  "2. template.back：设计画布反面全部文字图层（exists 为 true 时必须处理；exists 为 false 才跳过）"
);
const I = P.replace(
  '{ "matches": [ { "slotId": "front-1", "customerText": "客户原文中的某一行或该行的值部分", "confidence": 0.95, "reason": "简短理由" } ],',
  '{ "matches": [ { "slotId": "front-1", "customerText": "正面段的某一行或该行的值部分", "confidence": 0.95, "reason": "简短理由" }, { "slotId": "back-1", "customerText": "反面段的某一行或该行的值部分", "confidence": 0.95, "reason": "简短理由" } ],'
);
const J = H.replace(
  '{ "matches": [ { "slotId": "front-1", "customerText": "客户原文中的某一行或该行的值部分", "confidence": 0.95, "reason": "简短理由" } ],',
  '{ "matches": [ { "slotId": "front-1", "customerText": "正面段的某一行或该行的值部分", "confidence": 0.95, "reason": "简短理由" }, { "slotId": "back-1", "customerText": "反面段的某一行或该行的值部分", "confidence": 0.95, "reason": "简短理由" } ],'
);

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
  console.log("refined=" + ref.matches.length + "/7 backMatched=" + ref.matches.filter((m) => m.side === "back").length + " unmatched=" + ref.summary.unmatched + " errors=" + JSON.stringify(ref.errors));
  console.log("slots: " + JSON.stringify(ref.matches.map((m) => m.slotId + "=" + m.customerText)));
}
(async () => {
  await run("A. 对照", P);
  await run("H. 仅改 back 输入说明", H);
  await run("I. 仅 JSON 示例加 back", I);
  await run("J. H + I", J);
})();
