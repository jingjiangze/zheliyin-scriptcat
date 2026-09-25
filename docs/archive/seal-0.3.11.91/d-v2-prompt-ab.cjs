// 定位 V2 prompt 失效原因：变体对比（含 finish_reason / usage）
//  V2a 现网 V2 prompt（两层：blocks+matches）
//  V2b 同输入 + 极简「只返回扁平 matches」（不带 blocks 层）
//  V2c 同输入 + 极简两层 prompt（blocks+matches，尽量短）
"use strict";
const path = require("path");
const ROOT = "D:/zheliyin-scriptcat";
const plan = require(path.join(ROOT, "extension/src/ai/template-match-plan.js"));
const val = require(path.join(ROOT, "extension/src/ai/template-match-validator.js"));
const rule = require(path.join(ROOT, "extension/src/ai/rule-match.js"));
const https = require("https");

const KEY = process.env.ZY_AI_KEY || "";
const BASE = process.env.ZY_AI_BASE_URL || "https://api.siliconflow.cn/v1";
const MODEL = process.env.ZY_AI_MODEL || "Qwen/Qwen2.5-7B-Instruct";

const FRONT = [{ text: "山东启诚信息技术股份", fontSize: 14, left: 61, top: 31, width: 160, height: 20, layerNum: 0 },
  { text: "王晓明", fontSize: 18, left: 61, top: 54, width: 160, height: 24, layerNum: 1 },
  { text: "销售副总监", fontSize: 24, left: 61, top: 77, width: 160, height: 30, layerNum: 2 },
  { text: "1380 0138 000", fontSize: 15, left: 61, top: 100, width: 160, height: 20, layerNum: 3 }];
const BACK = [{ text: "主营：企业咨询", fontSize: 14, left: 61, top: 31, width: 160, height: 20, layerNum: 500 },
  { text: "服务热线：400-100", fontSize: 12, left: 61, top: 54, width: 160, height: 18, layerNum: 501 },
  { text: "地址：建国路89号", fontSize: 11, left: 61, top: 77, width: 160, height: 16, layerNum: 502 }];
const RAW = ["正面：", "山东启诚信息技术有限公司", "王小明", "销售总监", "电话：13800138000",
  "反面：", "主营：企业信息化咨询", "服务热线：400-888-6666", "地址：建国路88号"].join("\n");
const mk = (arr, side) => arr.map((s, i) => ({ slotId: side + "-" + (i + 1), objectUuid: "u-" + side + "-" + (i + 1), text: s.text, layerNum: s.layerNum, fontSize: s.fontSize, left: s.left, top: s.top, width: s.width, height: s.height }));
const snapshot = { front: { exists: true, items: mk(FRONT, "front") }, back: { exists: true, items: mk(BACK, "back") } };
const USER = plan.zySnapshotToAiInput({ front: snapshot.front, back: snapshot.back, customerRawText: RAW });

const P_FLAT = '你是名片模板匹配器。template.front.slots 是正面槽位、template.back.slots 是反面槽位；customer.lines 每行已带 side（front/back）。把每一行客户内容匹配到 side 相同的槽位，逐字复制客户原文，一行配一槽。所有行都必须交代（匹配或列入 unmatchedCustomer）。返回严格 JSON：{"matches":[{"slotId":"front-1","customerText":"...","confidence":0.9,"reason":"..."}],"unmatchedCustomer":[{"text":"...","reason":"..."}]}';

const P_LAYER_SHORT = '你是名片模板匹配器。两步，都要做完。1) 把 customer.lines 每行拆成信息块 {blockId,lineNo,text,type}，text 逐字来自该行。2) 把块匹配到 side 相同的槽位（front-N 配 front 块，back-N 配 back 块），一槽一块。所有块都要交代：匹配或列入 unmatchedBlockIds。返回严格 JSON：{"customerBlocks":[{"blockId":"c-1","lineNo":2,"text":"...","type":"company"}],"matches":[{"slotId":"front-1","blockId":"c-1","confidence":0.9,"reason":"..."}],"unmatchedBlockIds":[]}';

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
  let content = null, fr = null, usage = null;
  try { const j = JSON.parse(r.body); const c = j.choices && j.choices[0]; content = c && c.message && c.message.content; fr = c && c.finish_reason; usage = j.usage; } catch (e) {}
  console.log("\n##### " + label + " (len=" + system.length + ", http=" + r.status + ", finish=" + fr + ", usage=" + JSON.stringify(usage) + ") #####");
  if (!content) { console.log("NULL: " + String(r.body).slice(0, 300)); return; }
  const ext = plan.zyExtractPlanJson(content);
  if (!ext.ok) { console.log("EXTRACT FAIL " + ext.error + " :: " + content.slice(0, 200)); return; }
  const norm = plan.zyNormalizePlanShape(ext.plan);
  const ref = val.zyValidateTemplateMatchPlan({ plan: norm, snapshot: snapshot, rawText: RAW, minConfidence: 0.5, typeDetector: rule.zyDetectType });
  console.log("blocks=" + norm.customerBlocks.length + " matches=" + norm.matches.length + " unmatchedIds=" + JSON.stringify(norm.unmatchedBlockIds));
  console.log("V2 validator: ok=" + ref.ok + " matched=" + ref.summary.matched + " sem=" + ref.summary.semanticallyVerified + " unmatched=" + ref.summary.unmatched + " errors=" + JSON.stringify(ref.errors).slice(0, 200));
  console.log("slots=" + JSON.stringify(ref.matches.map((m) => m.slotId + "=" + m.customerText)));
  if (ref.unmatchedCustomer.length) console.log("unmatchedTexts=" + JSON.stringify(ref.unmatchedCustomer.map((u) => u.text + "[" + u.reason + "]")));
}
(async () => {
  await run("V2a 现网 V2 prompt", plan.zyTemplateMatchSystemPrompt());
  await run("V2b 极简扁平 matches", P_FLAT);
  await run("V2c 极简两层", P_LAYER_SHORT);
})();
