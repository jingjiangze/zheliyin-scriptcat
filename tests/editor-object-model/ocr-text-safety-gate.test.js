// tests/editor-object-model/ocr-text-safety-gate.test.js — Stage 7.8R §八/§二十五/§二十六：Text Safety Gate 单测
// 覆盖：SAFE 中文标点不阻断、blocked>0 但已清洗不阻断（§二十五）、空 safeText / 非法 surrogate /
//       残留控制字符 / 零宽 / 变体选择器 → BLOCK、assessBlockSafety 便捷入口。
"use strict";
const path = require("path");
const g = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "ocr-text-safety-gate.js"));
const s = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "ocr-text-sanitizer.js"));
const { assessTextSafety, assessBlockSafety, isLoneSurrogate } = g;

const results = [];
const failures = [];
function t(name, cond, detail) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "")); }

// ---- 普通中文标点 / 结构字符：SAFE 不阻断 ----
const ok1 = assessTextSafety({ text: "联系电话：13800138000；邮箱：a@b.com", safeText: "联系电话：13800138000；邮箱：a@b.com" });
t("gate.punct-safe", ok1.status === "SAFE" && ok1.ok && ok1.issues.length === 0, JSON.stringify(ok1));
const ok2 = assessTextSafety({ text: "《设计》——张三·经理", safeText: "《设计》——张三·经理" });
t("gate.cjk-punct-safe", ok2.status === "SAFE", JSON.stringify(ok2));
const ok3 = assessTextSafety({ text: "http://a.b/c?d=1&e=2", safeText: "http://a.b/c?d=1&e=2" });
t("gate.structural-safe", ok3.status === "SAFE", JSON.stringify(ok3));

// ---- blocked>0 但 safeText 已清洗：不阻断（§二十五）----
const san = s.sanitizeOcrText("联\u200b系");
t("gate.pre-sanitized", san.safeText === "联系" && san.blocked.length === 1);
const g4 = assessTextSafety({ text: "联\u200b系", rawText: "联\u200b系", safeText: san.safeText }, { blockedCount: san.blocked.length });
t("gate.cleaned-not-blocked", g4.status === "SAFE" && g4.sanitized === true && g4.blockedCount === 1, JSON.stringify(g4));

// ---- 空 safeText → BLOCK ----
const g5 = assessTextSafety({ text: "\u200b\u200b", safeText: "" });
t("gate.empty-blocks", g5.status === "BLOCK" && g5.issues.indexOf("empty") >= 0, JSON.stringify(g5));

// ---- 残留不可见字符（sanitizer 未启用时）→ BLOCK ----
const g6 = assessTextSafety({ text: "张\u200b三", safeText: "张\u200b三" });
t("gate.invisible-blocks", g6.status === "BLOCK" && g6.issues.indexOf("invisible-char") >= 0, JSON.stringify(g6));

// ---- 残留控制字符 → BLOCK ----
const g7 = assessTextSafety({ text: "张\u0000三", safeText: "张\u0000三" });
t("gate.control-blocks", g7.status === "BLOCK" && g7.issues.indexOf("control-char") >= 0, JSON.stringify(g7));

// ---- 变体选择器残留 → BLOCK ----
const g8 = assessTextSafety({ text: "名\uFE0F片", safeText: "名\uFE0F片" });
t("gate.variation-blocks", g8.status === "BLOCK" && g8.issues.indexOf("variation-selector") >= 0, JSON.stringify(g8));

// ---- 非法 surrogate → BLOCK ----
const lone = String.fromCharCode(0xd800) + "三";
const g9 = assessTextSafety({ text: lone, safeText: lone });
t("gate.lone-surrogate-blocks", g9.status === "BLOCK" && g9.issues.indexOf("lone-surrogate") >= 0, JSON.stringify(g9));
t("gate.isLoneSurrogate-helper", isLoneSurrogate([0xd800, 0x4e09], 0) === true && isLoneSurrogate([0xd83d, 0xde00], 0) === false && isLoneSurrogate([0x4e09, 0xdc00], 0) === false);

// ---- 合法代理对（emoji）不是 lone surrogate：默认 SAFE（§三 不因特殊就删；BLOCK 需真机证据）----
const emojiOk = assessTextSafety({ text: "VIP🎉", safeText: "VIP🎉" });
t("gate.emoji-surrogate-pair-ok", emojiOk.status === "SAFE" && emojiOk.issues.length === 0, JSON.stringify(emojiOk));

// ---- 直接传字符串 ----
const g10 = assessTextSafety("普通文本");
t("gate.string-input", g10.status === "SAFE" && g10.rawText === "普通文本" && g10.safeText === "普通文本", JSON.stringify(g10));

// ---- assessBlockSafety（TextBlock 便捷入口）----
const blk = { text: "VIP\u200b俱乐部", rawText: "VIP\u200b俱乐部", safeText: "VIP俱乐部", sanitize: { changed: true, blockedCount: 1 } };
const g11 = assessBlockSafety(blk);
t("gate.block-safe-after-clean", g11.status === "SAFE" && g11.sanitized === true && g11.blockedCount === 1, JSON.stringify(g11));
const blkBad = { text: "a", rawText: "a", safeText: "" };
t("gate.block-empty", assessBlockSafety(blkBad).status === "BLOCK");

console.log(results.join("\n"));
failures.forEach((f) => console.log("  > " + f));
console.log("ocr-text-safety-gate: " + (failures.length ? failures.length + " FAILURES" : "ALL PASS"));
process.exit(failures.length ? 1 : 0);