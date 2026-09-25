// 判定实验 C/D：确认模型是否「看得见」template.back 槽位
//  C: 极短 system，只要求处理反面 → 若返回 back 匹配，说明输入可见、长 prompt 是注意力/指令遵循问题
//  D: 极短 system，只要求处理正面 → 对照
"use strict";
const path = require("path");
const ROOT = "D:/zheliyin-scriptcat";
const plan = require(path.join(ROOT, "extension/src/ai/template-match-plan.js"));
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
const mkItems = (arr, side) => arr.map((s, i) => ({ slotId: side + "-" + (i + 1), text: s.text, layerNum: s.layerNum, fontSize: s.fontSize }));
const snapshot = { front: { exists: true, items: mkItems(FRONT, "front") }, back: { exists: true, items: mkItems(BACK, "back") } };
const USER = plan.zySnapshotToAiInput({ front: snapshot.front, back: snapshot.back, customerRawText: RAW });

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
  console.log("\n########## " + label + " ##########");
  console.log("systemPromptLen=" + system.length + " userLen=" + USER.length);
  const r = await post(BASE + "/chat/completions", { model: MODEL, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: USER }] }, { Authorization: "Bearer " + KEY });
  let content = null;
  try { const j = JSON.parse(r.body); content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content; } catch (e) {}
  console.log("http=" + r.status + " content=" + (content ? content.replace(/\s+/g, " ").slice(0, 700) : "NULL :: " + String(r.body).slice(0, 300)));
}
(async () => {
  await run("C. 只处理反面（极短）", '你是名片匹配器。只处理反面：把 customer.rawText 中「反面：」之后的行匹配到 template.back 的槽位（slotId 形如 back-N），逐字复制客户原文值。返回严格 JSON：{"matches":[{"slotId":"back-1","customerText":"...","confidence":0.9,"reason":"..."}],"unmatchedCustomer":[],"uncertain":[],"unusedSlots":[],"warnings":[]}');
  await run("D. 只处理正面（极短）", '你是名片匹配器。只处理正面：把 customer.rawText 中「正面：」与「反面：」之间的行匹配到 template.front 的槽位（slotId 形如 front-N），逐字复制客户原文值。返回严格 JSON：{"matches":[{"slotId":"front-1","customerText":"...","confidence":0.9,"reason":"..."}],"unmatchedCustomer":[],"uncertain":[],"unusedSlots":[],"warnings":[]}');
  await run("E. 正面+反面都要（极短）", '你是名片匹配器。template.front 是正面槽、template.back 是反面槽。customer.rawText 用单独成行的「正面：」「反面：」分段。把每段内容匹配到对应面的槽位（front-N 只配正面段、back-N 只配反面段），逐字复制客户原文值，客户每一行都必须交代。返回严格 JSON：{"matches":[{"slotId":"...","customerText":"...","confidence":0.9,"reason":"..."}],"unmatchedCustomer":[],"uncertain":[],"unusedSlots":[],"warnings":[]}');
})();
