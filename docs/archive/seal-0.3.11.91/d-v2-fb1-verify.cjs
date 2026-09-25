// V2 协议真机 AI 验证：FB1 场景（front 4 + back 3），确认「反面不再被整面跳过」
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

(async () => {
  const messages = plan.zyBuildTemplateMatchMessages({ front: snapshot.front, back: snapshot.back, customerRawText: RAW });
  console.log("systemPromptLen=" + messages[0].content.length);
  console.log("=== user payload ===");
  console.log(messages[1].content);
  const r = await post(BASE + "/chat/completions", { model: MODEL, temperature: 0, response_format: { type: "json_object" }, messages: messages }, { Authorization: "Bearer " + KEY });
  let content = null;
  try { const j = JSON.parse(r.body); content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content; } catch (e) {}
  console.log("=== http " + r.status + " ===");
  if (!content) { console.log("NULL: " + String(r.body).slice(0, 500)); return; }
  console.log(content);
  const ext = plan.zyExtractPlanJson(content);
  console.log("extract ok=" + ext.ok + (ext.ok ? "" : " " + ext.error));
  if (!ext.ok) return;
  const norm = plan.zyNormalizePlanShape(ext.plan);
  console.log("blocks=" + norm.customerBlocks.length + " matches=" + norm.matches.length + " unmatchedBlockIds=" + JSON.stringify(norm.unmatchedBlockIds) + " uncertain=" + norm.uncertain.length);
  const ref = val.zyValidateTemplateMatchPlan({ plan: norm, snapshot: snapshot, rawText: RAW, minConfidence: 0.5, typeDetector: rule.zyDetectType });
  console.log("=== validator V2 ===");
  console.log("ok=" + ref.ok + " summary=" + JSON.stringify(ref.summary));
  console.log("errors=" + JSON.stringify(ref.errors));
  console.log("warnings=" + JSON.stringify(ref.warnings));
  console.log("refined=" + JSON.stringify(ref.matches.map((m) => m.slotId + "=" + m.customerText + "[sem=" + m.semanticVerified + "]")));
  console.log("unmatchedCustomer=" + JSON.stringify(ref.unmatchedCustomer));
})();
