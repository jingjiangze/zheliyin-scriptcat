// runtime/stage11/rule-match.test.js — Stage 10-G Commit 08 增强：本地规则匹配库单测
// 覆盖：内容类型识别 / 标签剥离 / 手机↔座机区分 / 邮箱 / 网址 / 地址（含 88 vs 89 相似不硬绑）/
// 公司 vs 姓名语义相近区分 / 无微信槽 → unmatched / 空槽不匹配 / 唯一绑定 / 多电话分槽
"use strict";
const assert = require("assert");
const M = require("../../extension/src/ai/rule-match");
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass += 1; console.log("[rule-match] PASS " + name); }
  catch (e) { fail += 1; console.log("[rule-match] FAIL " + name + " :: " + String(e && e.message || e)); }
}
const slotOf = (side, arr) => ({ side: side, items: arr.map((x, i) => Object.assign({ slotId: side + "-" + (i + 1), objectUuid: "uuid-" + i, text: x.text, top: 10 + i * 20, left: 5, width: 160, height: 36 }, x)) });

// ---- 类型识别 ----
t("detect-phone-mobile", () => { assert.strictEqual(M.zyDetectType("13800138000").type, "phone-mobile"); });
t("detect-mobile-with-label", () => { assert.strictEqual(M.zyDetectType("手机：13800138000").type, "phone-mobile"); });
t("detect-phone-with-label", () => { assert.strictEqual(M.zyDetectType("电话：13800138000").type, "phone-mobile"); });
t("detect-landline", () => { assert.strictEqual(M.zyDetectType("0531-88886666").type, "phone-landline"); });
t("detect-email", () => { assert.strictEqual(M.zyDetectType("wx@163.com").type, "email"); });
t("detect-email-label", () => { assert.strictEqual(M.zyDetectType("邮箱：zhangsan@qq.com").type, "email"); });
t("detect-url", () => { assert.strictEqual(M.zyDetectType("www.jiansheji.cn").type, "url"); });
t("detect-address", () => { assert.strictEqual(M.zyDetectType("济南市高新区工业南路").type, "address"); });
t("detect-address-label", () => { assert.strictEqual(M.zyDetectType("地址：文化东路88号").type, "address"); });
t("detect-wechat", () => { assert.strictEqual(M.zyDetectType("微信：wxm123456").type, "wechat"); });
t("detect-company", () => { assert.strictEqual(M.zyDetectType("山东启诚信息技术有限公司").type, "company"); });
t("detect-name", () => { assert.strictEqual(M.zyDetectType("王明").type, "name"); });
t("detect-title", () => { assert.strictEqual(M.zyDetectType("销售总监").type, "title"); });
t("detect-blank", () => { assert.strictEqual(M.zyDetectType("  ").type, "blank"); });

// ---- 标签剥离 ----
t("split-label-value", () => { const s = M.zySplitLabel("电话：13800138000"); assert.strictEqual(s.label, "电话"); assert.strictEqual(s.value, "13800138000"); });
t("split-no-label", () => { const s = M.zySplitLabel("王明"); assert.strictEqual(s.label, null); assert.strictEqual(s.value, "王明"); });
t("split-email-colon", () => { const s = M.zySplitLabel("邮箱: wx@163.com"); assert.strictEqual(s.value, "wx@163.com"); });
t("split-address-full", () => { const s = M.zySplitLabel("地址：文化东路88号"); assert.strictEqual(s.value, "文化东路88号"); });

// ---- A 普通标准模板（5 槽全匹配；地址 88 vs 89 允许 textScore 兜底但类型弱）----
t("A-standard-5slots", () => {
  const slots = slotOf("front", [
    { text: "山东启诚信息技术股份" }, { text: "王晓明" }, { text: "销售副总监" },
    { text: "1380 0138 000" }, { text: "北京市朝阳区建国路89号" }
  ]);
  const rows = ["山东启诚信息技术有限公司", "王小明", "销售总监", "电话：13800138000", "地址：北京市朝阳区建国路88号"];
  const r = M.zyBuildLocalRuleMatch({ slotData: slots, rows: rows });
  assert.strictEqual(r.source, "LOCAL_RULE");
  const texts = r.matches.map((m) => m.customerText);
  assert.ok(texts.indexOf("山东启诚信息技术有限公司") >= 0, "company matched, got " + JSON.stringify(texts));
  assert.ok(texts.indexOf("王小明") >= 0, "name matched");
  assert.ok(texts.indexOf("销售总监") >= 0, "title matched");
  assert.ok(texts.indexOf("13800138000") >= 0, "mobile matched");
  assert.ok(texts.indexOf("北京市朝阳区建国路88号") >= 0 || r.unmatchedCustomer.length >= 1, "address ok or unmatched");
});

// ---- B 中英文混合 ----
t("B-bilingual", () => {
  const slots = slotOf("front", [
    { text: "QD Paper Group" }, { text: "山东启诚纸业" }, { text: "Wang Xiaoming" },
    { text: "Sales Director" }, { text: "1380 0138 000" }, { text: "www.qdpaper.cn" }
  ]);
  const rows = ["启诚纸业QUEENCHENG CO.,LTD", "Qingdao Paper Co., Ltd", "Mary Wang", "Marketing Manager", "电话：13800138000", "网址：www.qdpaper.cn"];
  const r = M.zyBuildLocalRuleMatch({ slotData: slots, rows: rows });
  const texts = r.matches.map((m) => m.customerText);
  assert.ok(texts.indexOf("Mary Wang") >= 0, "en name");
  assert.ok(texts.indexOf("13800138000") >= 0, "mobile");
  assert.ok(texts.indexOf("www.qdpaper.cn") >= 0, "url");
});

// ---- C 左右双栏（按 y 序 rank 不破坏）----
t("C-twocolumns-rank", () => {
  const slots = slotOf("front", [
    { text: "王晓明", top: 20 }, { text: "销售总监", top: 60 },
    { text: "电话：1380 0138 000", top: 100 }, { text: "邮箱: wx@qq.com", top: 140 },
    { text: "网址: www.qq.com", top: 180 }, { text: "地址：建国路89号", top: 220 }
  ]);
  const rows = ["王小明", "销售总监", "电话：13800138000", "邮箱：wxm@163.com", "网址：www.163.com", "地址：建国路88号"];
  const r = M.zyBuildLocalRuleMatch({ slotData: slots, rows: rows });
  assert.ok(r.matches.length >= 4, "至少 4 匹配, got " + r.matches.length);
  assert.strictEqual(new Set(r.matches.map((m) => m.slotIdx)).size, r.matches.length, "唯一槽");
});

// ---- E 无反面：仅 front，back 不涉及 ----
t("E-front-only", () => {
  const slots = slotOf("front", [{ text: "简小设" }, { text: "合伙人" }, { text: "电话: 0531-88886666" }, { text: "地址：文化东路88号" }]);
  const rows = ["江某", "高级合伙人", "电话：0531-88886666", "地址：文化东路88号"];
  const r = M.zyBuildLocalRuleMatch({ slotData: slots, rows: rows });
  const texts = r.matches.map((m) => m.customerText);
  assert.ok(texts.indexOf("江某") >= 0);
  assert.ok(texts.indexOf("0531-88886666") >= 0);
});

// ---- F 多电话：手机+座机分槽 ----
t("F-multi-phone", () => {
  const slots = slotOf("front", [{ text: "王晓明" }, { text: "手机: 1380 0138 000" }, { text: "座机: 0531-88886666" }, { text: "地址：建国路89号" }]);
  const rows = ["王小明", "电话：13800138000", "座机：0531-88886666", "地址：建国路88号"];
  const r = M.zyBuildLocalRuleMatch({ slotData: slots, rows: rows });
  const mIdx = r.matches.map((m) => m.slotIdx);
  assert.ok(mIdx.indexOf(1) >= 0 && mIdx.indexOf(2) >= 0, "手机与座机分别绑定, got " + JSON.stringify(mIdx));
  assert.ok(!(mIdx.indexOf(1) >= 0 && mIdx.indexOf(1) >= 0 && new Set(r.matches.map((m) => m.customerText)).size !== r.matches.length), "无重复文本");
});

// ---- G 无微信槽：微信不得写入任何槽 ----
t("G-no-wechat-slot", () => {
  const slots = slotOf("front", [{ text: "王晓明" }, { text: "销售总监" }, { text: "电话: 1380 0138 000" }, { text: "地址：建国路89号" }]);
  const rows = ["王小明", "销售总监", "电话：13800138000", "微信：wxm123456", "地址：建国路88号"];
  const r = M.zyBuildLocalRuleMatch({ slotData: slots, rows: rows });
  const joined = r.matches.map((m) => String(m.customerText)).join(" ");
  assert.ok(joined.indexOf("wxm123456") < 0, "微信未写入");
  const hasUnmatchedWechat = r.unmatchedCustomer.some((u) => String(u.text).indexOf("wxm123456") >= 0);
  assert.ok(hasUnmatchedWechat, "微信在 unmatched");
});

// ---- H 模板无标签（裸文字）----
t("H-no-label", () => {
  const slots = slotOf("front", [{ text: "王明" }, { text: "销售经理" }, { text: "13800001111" }, { text: "济南高新区海信创智谷1号楼" }]);
  const rows = ["姓名：王明", "职位：销售经理", "电话：13800001111", "地址：济南高新区海信创智谷1号楼"];
  const r = M.zyBuildLocalRuleMatch({ slotData: slots, rows: rows });
  const texts = r.matches.map((m) => m.customerText);
  assert.ok(texts.indexOf("王明") >= 0 && texts.indexOf("13800001111") >= 0, "无标签也按类型+相似匹配");
});

// ---- I 公司/姓名语义相近：王氏印刷 vs 王明 必须区分 ----
t("I-company-vs-name", () => {
  const slots = slotOf("front", [{ text: "王氏印刷包装" }, { text: "王明" }, { text: "总经理" }, { text: "电话: 0531-88886666" }]);
  const rows = ["公司名称：王氏印刷包装有限公司", "联系人：王明", "职位：总经理", "电话：0531-88886666"];
  const r = M.zyBuildLocalRuleMatch({ slotData: slots, rows: rows });
  const texts = r.matches.map((m) => m.customerText);
  assert.ok(texts.indexOf("王氏印刷包装有限公司") >= 0, "公司行配公司槽");
  assert.ok(texts.indexOf("王明") >= 0, "姓名称配姓名槽（未串）");
});

// ---- J 空文字层：不匹配 ----
t("J-empty-slot-skip", () => {
  const slots = slotOf("front", [{ text: "山东启诚信息技术股份" }, { text: "王晓明" }, { text: "销售副总监" }, { text: "  " }, { text: "北京市朝阳区建国路89号" }]);
  const rows = ["山东启诚信息技术有限公司", "王小明", "销售总监", "电话：13800138000", "地址：北京市朝阳区建国路88号"];
  const r = M.zyBuildLocalRuleMatch({ slotData: slots, rows: rows });
  assert.ok(!r.matches.some((m) => m.slotIdx === 3), "空槽(3)未被使用");
});

// ---- 唯一绑定：一条客户文本只绑一槽 ----
t("unique-bind", () => {
  const slots = slotOf("front", [{ text: "1380 0138 000" }, { text: "1380 0138 000" }]);
  const rows = ["13800138000"];
  const r = M.zyBuildLocalRuleMatch({ slotData: slots, rows: rows });
  assert.ok(r.matches.length <= 1, "一条文本至多一槽, got " + r.matches.length);
});

console.log("[rule-match] RESULT pass=" + pass + " fail=" + fail);
process.exit(fail ? 1 : 0);