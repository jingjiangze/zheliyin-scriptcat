// 验证瘦身假设：V2 prompt + 精简槽位上下文（去掉 x/y/w/h）是否能恢复「反面不被跳过」
//  X1 精简槽位（slotId/templateText/fontSize）+ customer.lines
//  X2 精简槽位 + customer.rawText 字符串
//  X3 极简槽位（slotId/templateText）+ customer.lines
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

const FRONT = [{ text: "山东启诚信息技术股份", fontSize: 14, layerNum: 0 }, { text: "王晓明", fontSize: 18, layerNum: 1 }, { text: "销售副总监", fontSize: 24, layerNum: 2 }, { text: "1380 0138 000", fontSize: 15, layerNum: 3 }];
const BACK = [{ text: "主营：企业咨询", fontSize: 14, layerNum: 500 }, { text: "服务热线：400-100", fontSize: 12, layerNum: 501 }, { text: "地址：建国路89号", fontSize: 11, layerNum: 502 }];
const RAW = ["正面：", "山东启诚信息技术有限公司", "王小明", "销售总监", "电话：13800138000",
  "反面：", "主营：企业信息化咨询", "服务热线：400-888-6666", "地址：建国路88号"].join("\n");
const mk = (arr, side) => arr.map((s, i) => ({ slotId: side + "-" + (i + 1), objectUuid: "u-" + side + "-" + (i + 1), text: s.text, layerNum: s.layerNum, fontSize: s.fontSize }));
const snapshot = { front: { exists: true, items: mk(FRONT, "front") }, back: { exists: true, items: mk(BACK, "back") } };
const SYS = plan.zyTemplateMatchSystemPrompt();
const contentLines = plan.zyCustomerContentLines(RAW);

const slim = (side, withFont) => (snapshot[side].items || []).map((it) => (withFont ? { slotId: it.slotId, templateText: it.text, fontSize: it.fontSize } : { slotId: it.slotId, templateText: it.text }));
const U1 = JSON.stringify({ template: { front: { exists: true, slots: slim("front", true) }, back: { exists: true, slots: slim("back", true) } }, customer: { lines: contentLines.map((l) => ({ lineNo: l.lineNo, side: l.side, text: l.text })) } }, null, 1);
const U2 = JSON.stringify({ template: { front: { exists: true, slots: slim("front", true) }, back: { exists: true, slots: slim("back", true) } }, customer: { rawText: RAW } }, null, 1);
const U3 = JSON.stringify({ template: { front: { exists: true, slots: slim("front", false) }, back: { exists: true, slots: slim("back", false) } }, customer: { lines: contentLines.map((l) => ({ lineNo: l.lineNo, side: l.side, text: l.text })) } }, null, 1);

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
async function run(label, user) {
  const r = await post(BASE + "/chat/completions", { model: MODEL, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYS }, { role: "user", content: user }] }, { Authorization: "Bearer " + KEY });
  let content = null, fr = null, usage = null;
  try { const j = JSON.parse(r.body); const c = j.choices && j.choices[0]; content = c && c.message && c.message.content; fr = c && c.finish_reason; usage = j.usage; } catch (e) {}
  console.log("\n##### " + label + " (userLen=" + user.length + ", promptTokens=" + (usage && usage.prompt_tokens) + ", completion=" + (usage && usage.completion_tokens) + ", finish=" + fr + ") #####");
  if (!content) { console.log("NULL: " + String(r.body).slice(0, 300)); return; }
  const ext = plan.zyExtractPlanJson(content);
  if (!ext.ok) { console.log("EXTRACT FAIL " + ext.error); return; }
  const norm = plan.zyNormalizePlanShape(ext.plan);
  const ref = val.zyValidateTemplateMatchPlan({ plan: norm, snapshot: snapshot, rawText: RAW, minConfidence: 0.5, typeDetector: rule.zyDetectType });
  console.log("blocks=" + norm.customerBlocks.length + " matches=" + norm.matches.length + " unmatchedIds=" + JSON.stringify(norm.unmatchedBlockIds));
  console.log("validator ok=" + ref.ok + " matched=" + ref.summary.matched + " sem=" + ref.summary.semanticallyVerified + " unmatched=" + ref.summary.unmatched + " unaccounted=" + ref.summary.unaccounted);
  console.log("slots=" + JSON.stringify(ref.matches.map((m) => m.slotId + "=" + m.customerText)));
  if (ref.unmatchedCustomer.length) console.log("unmatched=" + JSON.stringify(ref.unmatchedCustomer.map((u) => u.text + "[" + u.reason + "]")));
}
(async () => {
  await run("X1 精简槽位+lines", U1);
  await run("X2 精简槽位+rawText", U2);
  await run("X3 极简槽位+lines", U3);
})();
