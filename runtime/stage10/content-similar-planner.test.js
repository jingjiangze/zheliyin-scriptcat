// runtime/stage10/content-similar-planner.test.js — Stage 10-G Commit I-1：内容相似智能套版 纯逻辑单测
"use strict";
const { planContentSimilar, normText, textScore, lengthScore, rankScore } = require("../../extension/src/ocr/content-similar-planner.js");
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) { pass += 1; console.log("  ok  " + name); } else { fail += 1; console.log("  FAIL " + name); } };
const S = (text, uuid, top) => ({ objectUuid: uuid || null, text: text, top: top != null ? top : (pass * 10), height: 14 });

// 1. 逐行对位 MATCH 且 text=原文逐字
{
  const p = planContentSimilar({ slots: [S("张三", "a", 10), S("13800000000", "b", 40)], rows: ["张三", "13800000000"], side: "front" });
  t("对位: 2 MATCH", p.matches.length === 2 && p.matches.every((m) => m.reason === "MATCH"));
  t("对位: text 原文逐字", p.matches.map((m) => m.text).join("|") === "张三|13800000000");
  t("对位: objectUuid 对应", p.matches.map((m) => m.objectUuid).join() === "a,b");
  t("对位: 无 unmatched", p.unmatched.length === 0);
  t("对位: 无 unusedSlots", p.unusedSlots.length === 0);
  t("对位: score 记录", p.matches.every((m) => m.score >= 0.9));
}
// 2. 占位字不相似 → BELOW_THRESHOLD（宁丢不硬绑）
{
  const p = planContentSimilar({ slots: [S("电话", "a", 10)], rows: ["13800000000"], side: "front" });
  t("占位: 无 MATCH", p.matches.length === 0);
  t("占位: BELOW_THRESHOLD", p.unmatched.length === 1 && p.unmatched[0].reason === "BELOW_THRESHOLD");
  t("占位: 原文保全", p.unmatched[0].text === "13800000000");
}
// 3. 歧义（两槽过近 margin 不足）→ AMBIGUOUS
{
  const p = planContentSimilar({ slots: [S("上海市浦西区", "a", 10), S("上海市浦东区", "b", 40)], rows: ["上海市浦东区"], side: "front" });
  t("歧义: 不硬绑", p.matches.length === 0);
  t("歧义: AMBIGUOUS", p.unmatched.length === 1 && p.unmatched[0].reason === "AMBIGUOUS");
}
// 4. 重复内容竞争唯一槽 → 高分绑、低分 DUPLICATE
{
  const p = planContentSimilar({ slots: [S("13800000000", "a", 10)], rows: ["13800000000", "13900000000"], side: "front" });
  t("重复: 绑定 1 个", p.matches.length === 1 && p.matches[0].objectUuid === "a");
  t("重复: 另一个 DUPLICATE", p.unmatched.length === 1 && p.unmatched[0].reason === "DUPLICATE");
}
// 5. 空行跳过 / 槽>行 → unusedSlots
{
  const p = planContentSimilar({ slots: [S("张三", "a", 10), S("公司", "b", 40)], rows: ["", "张三", "  "], side: "front" });
  t("空行: EMPTY_ROW 被忽略（不入 unmatched）", p.matches.length === 1 && p.unmatched.length === 0);
  t("槽>行: unusedSlots=[1]", JSON.stringify(p.unusedSlots) === "[1]");
}
// 6. 无槽 → NO_SLOT
{
  const p = planContentSimilar({ slots: [], rows: ["张三"], side: "front" });
  t("无槽: NO_SLOT", p.unmatched.length === 1 && p.unmatched[0].reason === "NO_SLOT" && p.matches.length === 0);
}
// 7. 空 rows / 空 slots 边界
{
  const p1 = planContentSimilar({ slots: [S("张三", "a", 10)], rows: [], side: "front" });
  t("空行集: matches=0 unusedSlots=[0]", p1.matches.length === 0 && JSON.stringify(p1.unusedSlots) === "[0]");
}
// 8. 原文保全：带「电话：」前缀的行逐字进 → 不剥前缀（槽位取弱相似占位 + 精确电话槽，避免歧义门禁覆盖）
{
  const p = planContentSimilar({ slots: [S("占位姓名", "a", 10), S("13800000000", "b", 40)], rows: ["电话：13800000000"], side: "front" });
  t("保真: MATCH 1 条", p.matches.length === 1);
  t("保真: text 含前缀逐字", p.matches.length === 1 && p.matches[0].text === "电话：13800000000");
}
// 9. 空间顺序辅助：rows 序与槽 y 序对齐时对位仍成立
{
  const p = planContentSimilar({ slots: [S("张三", "a", 10), S("13800000000", "b", 60)], rows: ["张三", "13800000000"], side: "front" });
  t("顺序: 2 MATCH（内容相似主导）", p.matches.length === 2);
}
// 10. 文本相似打分函数（与 native-anchor-recovery 同源语义）
{
  t("textScore: 相等=1", textScore("abc", "abc") === 1);
  t("textScore: 包含=0.8（短侧>=3）", textScore("北京市朝阳区", "朝阳区") === 0.8 && textScore("朝阳区", "北京市朝阳区") === 0.8);
  t("textScore: 无重叠=0", textScore("abc", "xyz") === 0);
  t("lengthScore: 差1=1", lengthScore("ab", "abc") === 1);
  t("lengthScore: 差5=0.3", lengthScore("ab", "abcdefg") === 0.3);
  t("rankScore: 同rank=1 差1=0.6", rankScore(0, 0) === 1 && rankScore(0, 1) === 0.6 && rankScore(0, 5) === 0);
  t("normText: 去空白/标点", normText(" 北 京，朝阳：区- ") === "北京朝阳区");
}
// 11. 唯一边界：两行同内容竞争唯一槽 → 只绑一个（先序行胜），另一 DUPLICATE
{
  const p = planContentSimilar({ slots: [S("上海分公司", "a", 10)], rows: ["上海分公司", "上海分公司"], side: "front" });
  t("唯一: 仅 1 MATCH", p.matches.length === 1);
  t("唯一: 1 DUPLICATE", p.unmatched.length === 1 && p.unmatched[0].reason === "DUPLICATE");
}

const res = { pass: pass, fail: fail };
console.log("content-similar-planner.test: pass=" + res.pass + " fail=" + res.fail);
process.exit(res.fail > 0 ? 1 : 0);