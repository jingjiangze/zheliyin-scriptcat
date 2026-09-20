// runtime/stage8d/candidate-normalizer-p3.test.js — Stage 8D P3 回归
// fixture：真实名片 97 words（v16 rawDump 固化）。断言：
//  1) 跨视觉行碎片不再合并到同一行（yTol 用 min 高度，离群高词不再撑大容差）
//  2) 正常紧凑行保持合并（防过度拆分的核心口径）
"use strict";
const assert = require("assert");
const path = require("path");
const CN = require("../../extension/src/ocr/candidate-normalizer.js");
const fx = JSON.parse(require("fs").readFileSync(path.join(__dirname, "fixtures", "real-card-words-97.json"), "utf8"));

let passed = 0, failed = 0;
function t(name, fn) { try { fn(); passed += 1; } catch (e) { failed += 1; console.error("FAIL:", name, "\n  ", e.message); } }

const words = fx.words.map((w) => ({ text: w.text, bbox: w.bbox, confidence: w.conf }));
const lines = CN.groupWordsToLines(words, { tessLines: fx.rawLines });

// 1) 跨 48px 的碎片堆（原 L16：yb=405..453）必须被拆分：不再存在 405 与 453 同行的 cluster
t("跨行碎片不合并（yb 405 与 453 不同行）", () => {
  const inSame = lines.filter((l) => {
    const ys = (l.wordBoxes || []).map((b) => b.y + b.height / 2);
    return ys.some((y) => Math.abs(y - 405) < 3) && ys.some((y) => Math.abs(y - 453) < 3);
  });
  assert.strictEqual(inSame.length, 0, "发现跨 48px 碎片仍同行的行：" + JSON.stringify(inSame.map((l) => ({ t: String(l.text || "").slice(0, 10), ys: (l.wordBoxes || []).map((b) => Math.round(b.y + b.height / 2)) }))));
});

// 2) 同一视觉行（y 差 ≤ 一行高）保持合并：Telephone 行（yb=109..119）应单行
t("Telephone 行保持单行合并", () => {
  const tel = lines.find((l) => String(l.text || "").indexOf("Telephone") >= 0);
  assert.ok(tel, "未找到 Telephone 行");
  const ys = (tel.wordBoxes || []).map((b) => Math.round(b.y));
  assert.ok(Math.max(...ys) - Math.min(...ys) <= 14, "Telephone 词 y 跨度=" + (Math.max(...ys) - Math.min(...ys)));
});

// 3) 地址行（yb≈275..299）不再与上段合并成大行，但 y 差 ≤ 一行高的词保持聚合
t("地址行聚合正常（非极离群单字）", () => {
  const addr = lines.filter((l) => String(l.text || "").indexOf("广东省佛山") >= 0);
  assert.ok(addr.length === 1, "地址被拆多份=" + addr.length);
  assert.ok((addr[0].wordBoxes || []).length >= 5, "地址行词数不足");
});

// 4) yTol 用 min（修复核心）：无 cluster 内含 y 跨度 > 2.5×minWordH 的行（防离群拉远）
t("行内 y 跨度受限（容差用 min 高度）", () => {
  const bad = lines.filter((l) => {
    const ws = l.wordBoxes || [];
    if (ws.length < 2) return false;
    const hs = ws.map((b) => b.height).sort((a, b) => a - b);
    const minH = Math.max(6, hs[0]);
    const ys = ws.map((b) => b.y);
    return (Math.max(...ys) - Math.min(...ys)) > 2.5 * minH;
  });
  assert.strictEqual(bad.length, 0, "含异常 y 跨度的行：" + JSON.stringify(bad.map((l) => ({ t: String(l.text).slice(0, 10), ys: (l.wordBoxes || []).map((b) => Math.round(b.y)) }))));
});

console.log("candidate-normalizer-p3.test: lines=" + lines.length + " pass=" + passed + " fail=" + failed);
process.exit(failed ? 1 : 0);