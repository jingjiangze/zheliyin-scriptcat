// tests/editor-object-model/merge-guard.test.js — Stage 7.8 §二十~§二十七：Size-Aware Merge 回归
// 覆盖：明显字号差拆分（Fixture B/H 风格）、同字号合并、sizeRatioMax 实验旋钮（1.10~1.50）、
//       Vertical Overlap / Baseline Guard（Fixture G 风格同排）、xGap 归一化记录、mergeAudit/splitAudit 数值化。
"use strict";
const path = require("path");
const cn = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "candidate-normalizer.js"));
const { groupLinesToBlocks } = cn;

const results = [];
const failures = [];
function t(name, cond, detail) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "")); }

function L(text, x, y, w, h) { return { text: text, bbox: { x: x, y: y, width: w, height: h } }; }
const texts = (blocks) => blocks.map((b) => b.text);

// ---- Fixture B/H：字幕明显不同（ratio 2.22 > 1.5）→ 宁拆勿合 ----
const mixed = groupLinesToBlocks([
  L("公司名称", 10, 10, 160, 40),
  L("张三", 10, 70, 60, 18),
  L("13800138000", 10, 100, 120, 18)
]);
t("mixed.two-blocks", mixed.length === 2, JSON.stringify(texts(mixed)));
t("mixed.title-standalone", mixed[0].text === "公司名称" && mixed[0].lineCount === 1, JSON.stringify(texts(mixed)));
t("mixed.body-merged", mixed[1].text === "张三\n13800138000" && mixed[1].lineCount === 2, JSON.stringify(texts(mixed)));

// ---- 同字号/接近字号（ratio 1.44 ≤ 1.5 旧默认曾合并；Stage 7.8R §十四 校准默认 1.3 → 拆）----
// 26/18=1.44 > 1.3 → 「宁拆勿合」（§二十七）：明显不同字号不合并
const close = groupLinesToBlocks([L("标题", 10, 10, 120, 26), L("正文小字", 10, 46, 120, 18)]);
t("close.splits-at-1.3", close.length === 2, JSON.stringify(texts(close)));

// ---- sizeRatioMax 实验旋钮（§二十二 1.10~1.50）----
const knob14 = groupLinesToBlocks([L("标题", 10, 10, 120, 26), L("正文小字", 10, 46, 120, 18)], { sizeRatioMax: 1.4 });
t("knob.14-splits", knob14.length === 2, JSON.stringify(texts(knob14)));
const knob16 = groupLinesToBlocks([L("标题", 10, 10, 120, 26), L("正文小字", 10, 46, 120, 18)], { sizeRatioMax: 1.6 });
t("knob.16-merges", knob16.length === 1, JSON.stringify(texts(knob16)));
const knobCompat = groupLinesToBlocks([L("标题", 10, 10, 120, 26), L("正文小字", 10, 46, 120, 18)], { heightRatioMax: 1.3 });
t("knob.legacy-heightRatioMax-opts", knobCompat.length === 2, JSON.stringify(texts(knobCompat)));

// ---- Fixture G 风格：同一水平线 y 重叠、强 x 覆盖 —— 但 30/20=1.5 > 默认 1.3 → 拆（§二十七 宁拆勿合）----
// （§二十四 vertical-overlap guard 仍生效：显式 sizeRatioMax=1.6 时该组合可合并）
const rowCont = groupLinesToBlocks([L("大", 0, 0, 40, 30), L("小", 0, 8, 30, 20)]);
t("row.ratio15-splits-at-default", rowCont.length === 2, JSON.stringify(texts(rowCont)));
const rowCont16 = groupLinesToBlocks([L("大", 0, 0, 40, 30), L("小", 0, 8, 30, 20)], { sizeRatioMax: 1.6 });
t("row.overlapping-x-merges-at-1.6", rowCont16.length === 1, JSON.stringify(texts(rowCont16)));
// 侧边小标签：x 重叠 < 0.85×minW → vertical-overlap 拆开（标题 + 右侧小标签，§二十三/§二十四）
const rowLabel = groupLinesToBlocks([L("大标题", 0, 0, 120, 30), L("小标签", 108, 5, 20, 20)]);
t("row.label-splits", rowLabel.length === 2, JSON.stringify(texts(rowLabel)));
// y 完全重叠但 x 仅为部分重叠（0.5 边界内）→ 拆开
const rowPartial = groupLinesToBlocks([L("甲", 0, 0, 40, 30), L("乙", 20, 2, 24, 24)]);
t("row.partial-overlap-splits", rowPartial.length === 2, JSON.stringify(texts(rowPartial)));

// ---- 正常垂直堆叠（无 y 重叠、gap 合理）→ 合并（段落后项）----
const stack = groupLinesToBlocks([L("张三", 50, 20, 120, 36), L("销售经理", 50, 62, 130, 36)]);
t("stack.merges", stack.length === 1 && stack[0].lineCount === 2, JSON.stringify(texts(stack)));

// ---- 左右两列（x 不重叠）→ 分离（§七 既有）----
const cols = groupLinesToBlocks([L("左", 10, 10, 60, 20), L("右", 300, 10, 60, 20)]);
t("cols.split", cols.length === 2, JSON.stringify(texts(cols)));

// ---- mergeAudit 数值化（§二十六）：合并块含 decision=MERGE + 数值 ----
const ma = groupLinesToBlocks([L("张三", 50, 20, 120, 36), L("销售经理", 50, 62, 130, 36)])[0];
t("audit.present", Array.isArray(ma.mergeAudit) && ma.mergeAudit.length === 1, JSON.stringify(ma.mergeAudit));
t("audit.decision", ma.mergeAudit[0] && ma.mergeAudit[0].decision === "MERGE", JSON.stringify(ma.mergeAudit));
t("audit.sizeRatio", ma.mergeAudit[0] && ma.mergeAudit[0].sizeRatio === 1, JSON.stringify(ma.mergeAudit));
t("audit.has-baseline", ma.mergeAudit[0] && typeof ma.mergeAudit[0].baselineDelta === "number");

// ---- splitAudit（§四十一）：被拆候选记录最接近失败的数值 + 原因 ----
const sa = groupLinesToBlocks([
  L("公司名称", 10, 10, 160, 40),
  L("张三", 10, 70, 60, 18)
]);
t("split.present", Array.isArray(sa[1].splitAudit) && sa[1].splitAudit.length === 1, JSON.stringify(sa[1].splitAudit));
t("split.decision", sa[1].splitAudit[0] && sa[1].splitAudit[0].decision === "KEEP_SEPARATE");
t("split.reason", sa[1].splitAudit[0] && sa[1].splitAudit[0].failed.indexOf("size-ratio") >= 0, JSON.stringify(sa[1].splitAudit[0]));

// ---- single block：mergeAudit/splitAudit 为空 ----
const sg = groupLinesToBlocks([L("独行", 0, 0, 60, 20)])[0];
t("single.audits-empty", sg.mergeAudit.length === 0 && sg.splitAudit.length === 0);

console.log(results.join("\n"));
failures.forEach((f) => console.log("  > " + f));
console.log("merge-guard: " + (failures.length ? failures.length + " FAILURES" : "ALL PASS"));
process.exit(failures.length ? 1 : 0);