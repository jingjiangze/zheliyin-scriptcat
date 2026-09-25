// 判定实验：是 payload 结构（customer.lines 数组）还是 token 上限导致只处理 4 条
//  W1: V2 prompt + customer 用 rawText 字符串（V1 形态）
//  W2: V2 prompt + customer.lines 数组 + 显式行数提示 + max_tokens=2048
//  W3: V2 prompt + customer.lines 数组 + max_tokens=4096（排除截断）
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
const SYS = plan.zyTemplateMatchSystemPrompt();

const slotCtx = (side) => (snapshot[side].items || []).map((it) => ({ slotId: it.slotId, templateText: it.text, fontSize: it.fontSize, layerNum: it.layerNum, x: it.left, y: it.top, w: it.width, h: it.height }));
const contentLines = plan.zyCustomerContentLines(RAW);

const USER_STR = JSON.stringify({ template: { front: { exists: true, slots: slotCtx("front") }, back: { exists: true, slots: slotCtx("back") } }, customer: { rawText: RAW } }, null, 1);
const USER_ARR = JSON.stringify({ template: { front: { exists: true, slots: slotCtx("front") }, back: { exists: true, slots: slotCtx("back") } }, customer: { lineCount: contentLines.length, lines: contentLines.map((l) => ({ lineNo: l.lineNo, side: l.side, text: l.text })) } }, null, 1);

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
async function run(label, user, maxTokens) {
  const body = { model: MODEL, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYS }, { role: "user", content: user }] };
  if (maxTokens) body.max_tokens = maxTokens;
  const r = await post(BASE + "/chat/completions", body, { Authorization: "Bearer " + KEY });
  let content = null, fr = null, usage = null;
  try { const j = JSON.parse(r.body); const c = j.choices && j.choices[0]; content = c && c.message && c.message.content; fr = c && c.finish_reason; usage = j.usage; } catch (e) {}
  console.log("\n##### " + label + " (userLen=" + user.length + ", maxTokens=" + (maxTokens || "default") + ", http=" + r.status + ", finish=" + fr + ", completion=" + (usage && usage.completion_tokens) + ") #####");
  if (!content) { console.log("NULL: " + String(r.body).slice(0, 300)); return; }
  const ext = plan.zyExtractPlanJson(content);
  if (!ext.ok) { console.log("EXTRACT FAIL " + ext.error + " :: " + content.slice(0, 200)); return; }
  const norm = plan.zyNormalizePlanShape(ext.plan);
  const ref = val.zyValidateTemplateMatchPlan({ plan: norm, snapshot: snapshot, rawText: RAW, minConfidence: 0.5, typeDetector: rule.zyDetectType });
  console.log("blocks=" + norm.customerBlocks.length + " matches=" + norm.matches.length + " unmatchedIds=" + JSON.stringify(norm.unmatchedBlockIds));
  console.log("validator ok=" + ref.ok + " matched=" + ref.summary.matched + " sem=" + ref.summary.semanticallyVerified + " unmatched=" + ref.summary.unmatched + " unaccounted=" + ref.summary.unaccounted);
  console.log("slots=" + JSON.stringify(ref.matches.map((m) => m.slotId + "=" + m.customerText)));
  if (ref.unmatchedCustomer.length) console.log("unmatched=" + JSON.stringify(ref.unmatchedCustomer.map((u) => u.text + "[" + u.reason + "]")));
}
(async () => {
  await run("W1 rawText 字符串形态", USER_STR);
  await run("W2 lines 数组 + lineCount + max_tokens=2048", USER_ARR, 2048);
  await run("W3 lines 数组 + max_tokens=4096", JSON.stringify({ template: { front: { exists: true, slots: slotCtx("front") }, back: { exists: true, slots: slotCtx("back") } }, customer: { lines: contentLines.map((l) => ({ lineNo: l.lineNo, side: l.side, text: l.text })) } }, null, 1), 4096);
})();
