// 设计验证：分面调用（每次只给该面槽位 + 该面客户行，两层协议）是否可靠
//  Y1 front-only：front 槽 + front 行 → 期望 4 块 4 匹配
//  Y2 back-only：back 槽 + back 行 → 期望 3 块 3 匹配
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

// 分面 prompt：只提一个面，两层协议保留
function sidePrompt(side) {
  const other = side === "front" ? "反面" : "正面";
  return [
    "你是名片设计模板匹配器。本任务只处理【" + (side === "front" ? "正面" : "反面") + "】。",
    "输入 template.slots 是本面的模板文字图层（slotId 形如 " + side + "-N，templateText 是模板原文字，fontSize 是字号）。",
    "输入 customer.lines 是本面的客户资料行（lineNo、text）。",
    "（其它面的内容不在本次输入中，不要臆测" + other + "。）",
    "",
    "第一步 · 拆块：把 customer.lines 拆成原子信息块（一行通常一块）。",
    "  输出 { blockId, lineNo, text, type }；text 必须逐字来自该 lineNo 的行，不得改写/纠错/格式化/补全/拼接。",
    "第二步 · 匹配：把块匹配到 template.slots 的槽位，输出 { slotId, blockId, confidence, reason }。",
    "  一槽至多一块，一块至多一槽；优先按语义与内容类型匹配，其次文本相似度。",
    "  模板文字可能没有标签（裸人名/裸电话），按内容类型判断。",
    "第三步 · 交代：所有块都必须出现在 matches 或 unmatchedBlockIds 中，严禁漏块。",
    "",
    "type 取值：name/title/company/phone/landline/email/url/address/wechat/business/other。",
    "手机=1[3-9] 开头 11 位；座机=0 开头区号-号码。",
    "templateText 为空白/空格的槽位是占位/装饰，不得匹配；模板无对应槽的内容放进 unmatchedBlockIds。",
    "不输出任何样式字段；只返回严格 JSON：",
    '{"customerBlocks":[{"blockId":"c-1","lineNo":1,"text":"客户原文逐字","type":"name"}],',
    ' "matches":[{"slotId":"' + side + '-1","blockId":"c-1","confidence":0.95,"reason":"理由"}],',
    ' "unmatchedBlockIds":[],"uncertain":[],"unusedSlots":[],"warnings":[]}'
  ].join("\n");
}

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
async function runSide(side) {
  const lines = plan.zyCustomerContentLines(RAW).filter((l) => l.side === side).map((l) => ({ lineNo: l.lineNo, text: l.text }));
  const slots = (snapshot[side].items || []).map((it) => ({ slotId: it.slotId, templateText: it.text, fontSize: it.fontSize, layerNum: it.layerNum }));
  const user = JSON.stringify({ template: { side: side, slots: slots }, customer: { side: side, lines: lines } }, null, 1);
  const sys = sidePrompt(side);
  const r = await post(BASE + "/chat/completions", { model: MODEL, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: sys }, { role: "user", content: user }] }, { Authorization: "Bearer " + KEY });
  let content = null, fr = null, usage = null;
  try { const j = JSON.parse(r.body); const c = j.choices && j.choices[0]; content = c && c.message && c.message.content; fr = c && c.finish_reason; usage = j.usage; } catch (e) {}
  console.log("\n##### " + side.toUpperCase() + "-only (sysLen=" + sys.length + ", userLen=" + user.length + ", promptTokens=" + (usage && usage.prompt_tokens) + ", completion=" + (usage && usage.completion_tokens) + ", finish=" + fr + ") #####");
  console.log("inputLines=" + lines.length + " inputSlots=" + slots.length);
  if (!content) { console.log("NULL: " + String(r.body).slice(0, 300)); return null; }
  const ext = plan.zyExtractPlanJson(content);
  if (!ext.ok) { console.log("EXTRACT FAIL " + ext.error + " :: " + content.slice(0, 200)); return null; }
  const norm = plan.zyNormalizePlanShape(ext.plan);
  // 单面校验：只给该面的 snapshot 分节
  const snapSide = {}; snapSide[side] = snapshot[side];
  const ref = val.zyValidateTemplateMatchPlan({ plan: norm, snapshot: snapSide, rawText: RAW, minConfidence: 0.5, typeDetector: rule.zyDetectType });
  console.log("blocks=" + norm.customerBlocks.length + " matches=" + norm.matches.length + " unmatchedIds=" + JSON.stringify(norm.unmatchedBlockIds));
  console.log("validator ok=" + ref.ok + " matched=" + ref.summary.matched + " sem=" + ref.summary.semanticallyVerified + " unmatched=" + ref.summary.unmatched + " unaccounted=" + ref.summary.unaccounted);
  console.log("slots=" + JSON.stringify(ref.matches.map((m) => m.slotId + "=" + m.customerText)));
  if (ref.unmatchedCustomer.length) console.log("unmatched=" + JSON.stringify(ref.unmatchedCustomer.map((u) => u.text + "[" + u.reason + "]")));
  console.log("errors=" + JSON.stringify(ref.errors));
  return ref;
}
(async () => {
  const f = await runSide("front");
  const b = await runSide("back");
  const all = [].concat((f && f.matches) || [], (b && b.matches) || []);
  console.log("\n===== 合并结果 ===== total=" + all.length + "/7  " + JSON.stringify(all.map((m) => m.slotId + "=" + m.customerText)));
})();
