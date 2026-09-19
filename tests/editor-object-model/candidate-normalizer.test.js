// tests/editor-object-model/candidate-normalizer.test.js — Stage 5.5B P3：OCR 候选统一边界单测
//                                             + Stage 6 P6.0：行聚类 / wordBoxes / lineBBox
//                                             + Stage 6.1：TextBlock 层（§3~§9）、智能拼接（§7）、
//                                               文本宽度与换行诊断（§10~§13、§18）、回归用例 §19 A–J
"use strict";
const path = require("path");
const {
  unifyCandidates, groupWordsToLines, aggregateLineCandidates, normBox,
  joinWordsSmart, applyTessLineText,
  groupLinesToBlocks, buildTextBlocks,
  estimateTextWidth, estimateTextLayout
} = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "candidate-normalizer.js"));

const results = [];
const failures = [];
function t(name, cond, detail) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "")); }

// executor 私有 lines{x0,y0,x1,y1} → 统一候选
const lines = [
  { text: "测试公司", bbox: { x0: 61, y0: 79, x1: 168, y1: 142 } },
  { text: "13800138000", bbox: { x0: 20, y0: 300, x1: 220, y1: 330 } },
  { text: "", bbox: { x0: 5, y0: 5, x1: 50, y1: 20 } },          // 空文本剔除
  { text: "B", bbox: { x0: 5, y0: 5, x1: 5, y1: 20 } },          // 零宽剔除
  { text: "C" }                                                  // 无 bbox 剔除
];
const img = { width: 900, height: 1200 };
const u1 = unifyCandidates(lines, img);
t("executor-lines->unified", u1.length === 2 && u1[0].text === "测试公司" && u1[0].bbox.x === 61 && u1[0].bbox.y === 79 && u1[0].bbox.width === 107 && u1[0].bbox.height === 63, JSON.stringify(u1));
t("unified.coordinateSpace", u1.every((c) => c.coordinateSpace === "image-pixel" && c.imageSize.width === 900), JSON.stringify(u1[0]));
t("unified.confidence-null", u1[0].confidence === null, "conf=" + u1[0].confidence);
t("unified.reversed-bbox", unifyCandidates([{ text: "X", bbox: { x0: 100, y0: 90, x1: 10, y1: 5 } }], null)[0].bbox.x === 10 && unifyCandidates([{ text: "X", bbox: { x0: 100, y0: 90, x1: 10, y1: 5 } }], null)[0].bbox.width === 90, "reversed normalized");

// 统一候选直通（Baidu Provider 输出）
const uni = [{ text: "折立印", bbox: { x: 100, y: 200, width: 300, height: 40 }, confidence: 0.98, coordinateSpace: "image-pixel" }];
const u2 = unifyCandidates(uni, img);
t("unified-passthrough", u2.length === 1 && u2[0].bbox.x === 100 && u2[0].bbox.width === 300 && u2[0].confidence === 0.98 && u2[0].imageSize.width === 900, JSON.stringify(u2));

// 非数组 / null / 噪声
t("non-array", unifyCandidates(null, img).length === 0 && unifyCandidates(undefined, null).length === 0);
t("noise", unifyCandidates([{ text: "a", bbox: { x: 0, y: 0, width: -5, height: 10 } }], null).length === 0, "negative width filtered");

// ---- Stage 6 P6.0：executor v2 行级携带 words → 统一候选带 wordBoxes/lineBBox ----
const v2 = [
  { text: "姓名 张三", bbox: { x0: 40, y0: 60, x1: 220, y1: 110 },
    words: [
      { text: "姓名", bbox: { x0: 40, y0: 60, x1: 110, y1: 110 }, confidence: 0.98 },
      { text: "张三", bbox: { x0: 140, y0: 60, x1: 220, y1: 110 }, confidence: 0.95 }
    ] }
];
const u3 = unifyCandidates(v2, img);
t("v2-words-carried", u3.length === 1 && u3[0].wordBoxes.length === 2 && u3[0].lineBBox.x === 40, JSON.stringify(u3[0]));
t("v2-bbox-compat", u3[0].bbox.width === 180 && u3[0].coordinateSpace === "image-pixel", "bbox stays line box by default");

// ---- Stage 6 P6.0：轻量行聚类（Case A：水平中文两行；Case B：中英混合；Case C：手机号）----
// Stage 6.1 §7：中文+中文 / 数字+数字 无空格（修复「中文之间被错误加入空格」）
const wordsA = [
  { text: "张", bbox: { x: 10, y: 20, width: 40, height: 40 } }, { text: "三", bbox: { x: 55, y: 20, width: 40, height: 40 } },
  { text: "经理", bbox: { x: 100, y: 20, width: 80, height: 40 } },
  { text: "测试", bbox: { x: 10, y: 120, width: 80, height: 40 } }, { text: "公司", bbox: { x: 95, y: 120, width: 80, height: 40 } }
];
const linesA = groupWordsToLines(wordsA);
t("group-A-2lines", linesA.length === 2, JSON.stringify(linesA.map((l) => l.text)));
t("group-A-text-no-spaces", linesA[0].text === "张三经理" && linesA[1].text === "测试公司", JSON.stringify(linesA.map((l) => l.text)));
// executor 形状 {x0,y0,x1,y1} 的 word bbox 也必须能聚合（P6.0 空聚合根因回归）
const wordsX01 = [
  { text: "张", bbox: { x0: 10, y0: 20, x1: 50, y1: 60 } },
  { text: "三", bbox: { x0: 55, y0: 20, x1: 95, y1: 60 } },
  { text: "经理", bbox: { x0: 100, y0: 20, x1: 180, y1: 60 } }
];
const linesX01 = groupWordsToLines(wordsX01);
t("group-executor-x01-words", linesX01.length === 1 && linesX01[0].text === "张三经理" && linesX01[0].bbox.width === 170, JSON.stringify(linesX01));
t("group-A-tight-bbox", linesA[0].bbox.x === 10 && linesA[0].bbox.width === 170 && linesA[0].bbox.y === 20 && linesA[0].bbox.height === 40, JSON.stringify(linesA[0].bbox));
t("group-A-wordBoxes", linesA[0].wordBoxes.length === 3, "wb=" + linesA[0].wordBoxes.length);

// Case B：中英混合单行（y 相近、字高相近 → 1 行；§7 中英贴近无空格）
const wordsB = [
  { text: "北京", bbox: { x: 30, y: 200, width: 80, height: 34 } },
  { text: "BeiJing", bbox: { x: 120, y: 203, width: 110, height: 32 } },
  { text: "科技", bbox: { x: 240, y: 200, width: 80, height: 34 } }
];
const linesB = groupWordsToLines(wordsB);
t("group-B-1line", linesB.length === 1 && linesB[0].text === "北京BeiJing科技", JSON.stringify(linesB));
t("group-B-bbox", linesB[0].bbox.x === 30 && linesB[0].bbox.width === 290, JSON.stringify(linesB[0].bbox));

// Case C：数字/手机号 单行（§19-D 手机号不得插入空格）
const wordsC = [
  { text: "138", bbox: { x: 50, y: 400, width: 90, height: 36 } },
  { text: "0013", bbox: { x: 145, y: 400, width: 120, height: 36 } },
  { text: "8000", bbox: { x: 270, y: 400, width: 120, height: 36 } }
];
const linesC = groupWordsToLines(wordsC);
t("group-C-1line", linesC.length === 1 && linesC[0].text === "13800138000", JSON.stringify(linesC));

// 字高差异大 → 不合并（同一 row 内大小混排视为两行，供混合字号识别）
const wordsMixed = [
  { text: "标题", bbox: { x: 10, y: 20, width: 90, height: 60 } },
  { text: "小字", bbox: { x: 110, y: 34, width: 46, height: 26 } }
];
const linesMixed = groupWordsToLines(wordsMixed);
t("group-mixed-height-split", linesMixed.length === 2, JSON.stringify(linesMixed.map((l) => l.text)));

// aggregateLineCandidates：统一候选形状
const agg = aggregateLineCandidates(wordsA, img);
t("aggregate-shape", agg.length === 2 && agg[0].bbox.width === 170 && agg[0].wordBoxes.length === 3 && agg[0].imageSize.width === 900 && agg[0].coordinateSpace === "image-pixel", JSON.stringify(agg[0]));
t("aggregate-confidence-mean", Math.abs(agg[0].confidence - null) < 0.001 || typeof agg[0].confidence === "number", "conf=" + agg[0].confidence);
t("aggregate-empty", aggregateLineCandidates([], img).length === 0);

// ---- Stage 6.1 §7：line.text 优先（tessLines 传入 → 聚合行文本被原始行文本替换；word bbox 仅作几何）----
const tessLines = [
  { text: "张三经理", bbox: { x0: 10, y0: 20, x1: 180, y1: 60 } },
  { text: "测试公司", bbox: { x0: 10, y0: 120, x1: 170, y1: 160 } }
];
const aggTess = aggregateLineCandidates(wordsA, img, tessLines);
t("aggregate-tess-text-priority", aggTess[0].text === "张三经理" && aggTess[1].text === "测试公司", JSON.stringify(aggTess.map((l) => l.text)));
t("aggregate-tess-keeps-geometry", aggTess[0].wordBoxes.length === 3 && aggTess[0].bbox.width === 170, "geometry from words, text from tess line");
// §5 修正：Tesseract 中文行带空格（"张 三"）不得覆盖智能拼接（避免中文间空格回潮）
const tessCJKSpaced = [{ text: "张 三 经理", bbox: { x0: 10, y0: 20, x1: 180, y1: 60 } }];
const aggCJKNospace = aggregateLineCandidates(wordsA.slice(0, 3), img, tessCJKSpaced);
t("tess-cjk-space-not-applied", aggCJKNospace.length === 1 && aggCJKNospace[0].text === "张三经理", JSON.stringify(aggCJKNospace.map((l) => l.text)));
// 含英文行仍采用 tess 原文本（保留英文结构）
const wordsEn = [{ text: "BeiJing", bbox: { x: 30, y: 200, width: 110, height: 32 } }, { text: "Office", bbox: { x: 150, y: 200, width: 100, height: 32 } }];
const tessEn = [{ text: "Beijing Office", bbox: { x0: 30, y0: 200, x1: 250, y1: 232 } }];
const aggEn = aggregateLineCandidates(wordsEn, img, tessEn);
t("tess-en-text-applied", aggEn.length === 1 && aggEn[0].text === "Beijing Office", JSON.stringify(aggEn.map((l) => l.text)));

// ---- Stage 6.1 joinWordsSmart（§7）----
t("join-cjk-no-space", joinWordsSmart([{ text: "张" }, { text: "三" }, { text: "经理" }]) === "张三经理", joinWordsSmart([{ text: "张" }, { text: "三" }, { text: "经理" }]));
t("join-phone-continuous", joinWordsSmart([{ text: "138" }, { text: "0013" }, { text: "8000" }]) === "13800138000", joinWordsSmart([{ text: "138" }, { text: "0013" }, { text: "8000" }]));
t("join-cjk-plus-digits", joinWordsSmart([{ text: "电话" }, { text: "13800138000" }]) === "电话13800138000", joinWordsSmart([{ text: "电话" }, { text: "13800138000" }]));
t("join-email-structure", joinWordsSmart([{ text: "john.doe" }, { text: "@" }, { text: "gmail.com" }]) === "john.doe@gmail.com", joinWordsSmart([{ text: "john.doe" }, { text: "@" }, { text: "gmail.com" }]));
t("join-english-space-kept", joinWordsSmart([{ text: "Beijing" }, { text: "Office" }]) === "Beijing Office", joinWordsSmart([{ text: "Beijing" }, { text: "Office" }]));
t("join-empty", joinWordsSmart([]) === "" && joinWordsSmart(null) === "");
t("join-single", joinWordsSmart([{ text: "张三" }]) === "张三");

// ---- Stage 6.1 §3/§19：TextBlock 聚类（groupLinesToBlocks）----
// A：单行中文 → 1 block / 1 line
const blkA = groupLinesToBlocks([{ text: "张三", bbox: { x: 50, y: 20, width: 120, height: 40 } }]);
t("block-A-single", blkA.length === 1 && blkA[0].lineCount === 1 && blkA[0].text === "张三", JSON.stringify(blkA));
// B：多行中文（张三/销售经理 相邻同行）→ 1 block / 2 lines / text 含 \n（§8 同一 textbox）
const blkB = groupLinesToBlocks([
  { text: "张三", bbox: { x: 50, y: 20, width: 120, height: 40 } },
  { text: "销售经理", bbox: { x: 50, y: 65, width: 130, height: 36 } }
]);
t("block-B-merged", blkB.length === 1 && blkB[0].lineCount === 2 && blkB[0].text === "张三\n销售经理", JSON.stringify(blkB));
t("block-B-bbox", blkB[0].bbox.y === 20 && blkB[0].bbox.height === 81 && blkB[0].center.x > 100, JSON.stringify(blkB[0]));
// I：三行同一块 → 1 block / 3 lines / 1 textbox 语义
const blkI = groupLinesToBlocks([
  { text: "张三", bbox: { x: 50, y: 20, width: 120, height: 40 } },
  { text: "销售经理", bbox: { x: 50, y: 66, width: 130, height: 36 } },
  { text: "电话：13800138000", bbox: { x: 50, y: 108, width: 240, height: 36 } }
]);
t("block-I-three-lines", blkI.length === 1 && blkI[0].lineCount === 3 && blkI[0].text.split("\n").length === 3, JSON.stringify(blkI));
// G：左右两列 → 2 独立 blocks（§5 禁止错误合并）
const blkG = groupLinesToBlocks([
  { text: "张", bbox: { x: 20, y: 20, width: 80, height: 36 } },
  { text: "Man", bbox: { x: 220, y: 24, width: 80, height: 36 } },
  { text: "三", bbox: { x: 20, y: 60, width: 80, height: 36 } },
  { text: "ager", bbox: { x: 220, y: 64, width: 80, height: 36 } }
]);
t("block-G-two-columns", blkG.length === 2, JSON.stringify(blkG.map((b) => b.text)));
// H：上下两独立区（垂直距离过大）→ 2 独立 blocks
const blkH = groupLinesToBlocks([
  { text: "张三", bbox: { x: 50, y: 20, width: 120, height: 40 } },
  { text: "总经理", bbox: { x: 50, y: 240, width: 120, height: 40 } }
]);
t("block-H-far-gap", blkH.length === 2 && blkH[1].text === "总经理", JSON.stringify(blkH.map((b) => b.text)));
// 字高悬殊 → 不合并（小注脚独立 block）
const blkBigSmall = groupLinesToBlocks([
  { text: "大标题", bbox: { x: 30, y: 20, width: 120, height: 80 } },
  { text: "小注脚", bbox: { x: 30, y: 110, width: 90, height: 22 } }
]);
t("block-height-ratio-split", blkBigSmall.length === 2, JSON.stringify(blkBigSmall.map((b) => b.text)));

// ---- Stage 6.1 buildTextBlocks：行级统一候选（任意 Provider）→ TextBlock ----
const bt = buildTextBlocks([
  { text: "张三", bbox: { x: 50, y: 20, width: 120, height: 40 }, confidence: 0.97, coordinateSpace: "image-pixel", imageSize: { width: 800, height: 600 } },
  { text: "销售经理", bbox: { x: 50, y: 65, width: 130, height: 36 }, confidence: 0.95 }
]);
t("buildTextBlocks-merge", bt.length === 1 && bt[0].lineCount === 2 && bt[0].text === "张三\n销售经理", JSON.stringify(bt));
t("buildTextBlocks-coordinateSpace", bt[0].coordinateSpace === "image-pixel" && bt[0].imageSize.width === 800, JSON.stringify(bt[0]));
t("buildTextBlocks-empty", buildTextBlocks([]).length === 0 && buildTextBlocks(null).length === 0);

// ---- Stage 6.1 §11/§12/§18：文本宽度估算 + 换行诊断 ----
// C：长中文单行 → 宽度足够 → 不换行（forced wrap=false，estimatedFinalLineCount=1）
const layoutLong = estimateTextLayout(["这是一个非常长的中文公司名称用于测试排版稳定性"], 40, { minWidth: 60, maxWidth: 4000, margin: 14 });
t("layout-long-no-wrap", !layoutLong.forcedWrapDetected && layoutLong.estimatedFinalLineCount === 1 && layoutLong.layoutWidth > 400, JSON.stringify(layoutLong));
// §18：源单行在过窄空间下放不下 → forcedWrapDetected=true（测试必须暴露问题）
const layoutNarrow = estimateTextLayout(["ABCDEFGHIJK"], 28, { minWidth: 60, maxWidth: 90, margin: 10 });
t("layout-narrow-forced-wrap", layoutNarrow.forcedWrapDetected === true && layoutNarrow.estimatedFinalLineCount > 1, JSON.stringify(layoutNarrow));
// 多行 3 行 → 正常不换行时 estimatedFinalLineCount = 3
const layout3 = estimateTextLayout(["张三", "销售经理", "电话：13800138000"], 32, { minWidth: 60, maxWidth: 4000, margin: 12 });
t("layout-3-lines", layout3.estimatedFinalLineCount === 3 && !layout3.forcedWrapDetected, JSON.stringify(layout3));

// ---- Stage 6.2 §五~§九/§十/§十一：TextBlock 拆分优先回归 ----
// 1) 真实名片布局（§十一 样本）：姓名/职位/电话 紧邻 → 1 block；公司名跨空白行 → 独立；
//    地址/邮箱 紧邻 → 1 block。禁止「空行相隔仍合并」。
const blkLayout = groupLinesToBlocks([
  { text: "张三", bbox: { x: 50, y: 20, width: 120, height: 40 } },
  { text: "销售经理", bbox: { x: 50, y: 65, width: 130, height: 36 } },
  { text: "电话：13800138000", bbox: { x: 50, y: 106, width: 300, height: 36 } },
  { text: "北京折立印科技", bbox: { x: 50, y: 190, width: 220, height: 36 } },   // gap=48 > 1.25×36 → 独立
  { text: "地址：北京市朝阳区", bbox: { x: 50, y: 280, width: 260, height: 36 } }, // gap=54 → 独立
  { text: "邮箱：zhangsan@zly.com", bbox: { x: 50, y: 321, width: 280, height: 36 } } // gap=5 → 并入地址
]);
t("s62-layout-real-card-3blocks", blkLayout.length === 3, JSON.stringify(blkLayout.map((b) => b.text)));
t("s62-block1-3lines", blkLayout[0].lineCount === 3 && blkLayout[0].text.split("\n").join("|") === "张三|销售经理|电话：13800138000", JSON.stringify(blkLayout[0].text));
t("s62-block2-single", blkLayout[1].lineCount === 1 && blkLayout[1].text === "北京折立印科技", JSON.stringify(blkLayout[1].text));
t("s62-block3-merged", blkLayout[2].lineCount === 2 && blkLayout[2].text.indexOf("地址：北京市朝阳区\n邮箱：") === 0, JSON.stringify(blkLayout[2].text));
// 2) §七：左右两列完整名片 → 严格 2 blocks（左/右各 3 行），即使 Y 交织也禁止合并
const blkTwoCol = groupLinesToBlocks([
  { text: "公司名称", bbox: { x: 30, y: 20, width: 120, height: 32 } },
  { text: "地址", bbox: { x: 400, y: 20, width: 120, height: 32 } },
  { text: "电话", bbox: { x: 30, y: 60, width: 140, height: 32 } },
  { text: "邮箱", bbox: { x: 400, y: 60, width: 160, height: 32 } },
  { text: "微信", bbox: { x: 30, y: 100, width: 120, height: 32 } },
  { text: "网站", bbox: { x: 400, y: 100, width: 160, height: 32 } }
]);
t("s62-twocol-2blocks", blkTwoCol.length === 2, JSON.stringify(blkTwoCol.map((b) => b.text)));
t("s62-twocol-left-lines", blkTwoCol[0].lineCount === 3 && blkTwoCol[0].text.indexOf("公司名称\n电话\n微信") === 0, JSON.stringify(blkTwoCol[0].text));
t("s62-twocol-right-lines", blkTwoCol[1].lineCount === 3 && blkTwoCol[1].text.indexOf("地址\n邮箱\n网站") === 0, JSON.stringify(blkTwoCol[1].text));
// 3) §九：合并依据诊断 —— 已合并 block 纪录全部四条原因；单行 block 为空数组
t("s62-mergeReasons-recorded", blkLayout[0].mergeReasons.indexOf("left-alignment") >= 0 && blkLayout[0].mergeReasons.indexOf("vertical-gap") >= 0 && blkLayout[0].mergeReasons.indexOf("horizontal-overlap") >= 0 && blkLayout[0].mergeReasons.indexOf("height-ratio") >= 0, JSON.stringify(blkLayout[0].mergeReasons));
t("s62-mergeReasons-single-empty", blkLayout[1].mergeReasons.length === 0, JSON.stringify(blkLayout[1].mergeReasons));
// 4) §九：lineGeometry 输出 lines[{text,x,y,width,height}]
const lg = blkLayout[0].lineGeometry;
t("s62-lineGeometry-shape", Array.isArray(lg) && lg.length === 3 && lg[0].text === "张三" && lg[0].x === 50 && lg[0].y === 20 && lg[0].width === 120 && lg[0].height === 40, JSON.stringify(lg));
// 5) blockIndex 连续编号（§24 Geometry 产出可对拍）
t("s62-blockIndex-seq", blkLayout.map((b) => b.blockIndex).join(",") === "0,1,2", JSON.stringify(blkLayout.map((b) => b.blockIndex)));
// 6) §八 新默认：gapRatioMax=1.25 / leftAlignTolRatio=0.5 / overlapRatioMin=0.5 / heightRatioMax=2.0
t("s62-defaults-tight", groupLinesToBlocks([
  { text: "姓名", bbox: { x: 40, y: 20, width: 80, height: 36 } },
  { text: "电话", bbox: { x: 40, y: 64, width: 120, height: 36 } }
]).length === 1, "gap 8/36=0.22 应合并");
t("s62-blank-line-separates", groupLinesToBlocks([
  { text: "姓名", bbox: { x: 40, y: 20, width: 80, height: 36 } },
  { text: "电话", bbox: { x: 40, y: 130, width: 120, height: 36 } }
]).length === 2, "gap 74/36=2.06 应拆分");
// 7) 标题大字 + 正文小字：Stage 7.8R §十四 校准默认 sizeRatioMax=1.3 → 60/40=1.5 应拆（宁拆勿合）
const blkTitleBody = groupLinesToBlocks([
  { text: "大标题", bbox: { x: 30, y: 20, width: 120, height: 60 } },
  { text: "正文小字", bbox: { x: 30, y: 86, width: 160, height: 40 } }
]);
t("s62-title-body-ratio150-splits", blkTitleBody.length === 2, JSON.stringify(blkTitleBody.map((b) => b.text)));
// 8) 左边界宽容度：轻微缩进（偏移 ≤ 0.5×行高中位）仍算同块
const blkIndent = groupLinesToBlocks([
  { text: "张三", bbox: { x: 50, y: 20, width: 120, height: 40 } },
  { text: "经理", bbox: { x: 68, y: 65, width: 100, height: 36 } }
]);
t("s62-left-align-tolerance", blkIndent.length === 1, JSON.stringify(blkIndent.map((b) => b.text)));

console.log("== candidate-normalizer ==");
console.log(results.join("\n"));
failures.forEach((f) => console.log("  > " + f));
console.log("candidate-normalizer: " + (failures.length ? failures.length + " FAILURES" : "ALL PASS"));
process.exit(failures.length ? 1 : 0);