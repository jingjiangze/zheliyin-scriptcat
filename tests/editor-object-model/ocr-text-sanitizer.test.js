// tests/editor-object-model/ocr-text-sanitizer.test.js — Stage 7.8 §十~§十六：Special Character Sanitizer 单测
// 覆盖：默认放行（不误删中文/标点/结构字符）、三级分级、控制/零宽/变体/全角处理、keepBlocked 探测模式。
"use strict";
const path = require("path");
const s = require(path.join(__dirname, "..", "..", "extension", "src", "ocr", "ocr-text-sanitizer.js"));
const { sanitizeOcrText, classifyChar } = s;

const results = [];
const failures = [];
function t(name, cond, detail) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures.push(name + (detail ? " :: " + detail : "")); }

// ---- 默认放行：正常文本零改动 ----
const plain = sanitizeOcrText("武汉折立印科技有限公司 张三 13800138000 市场部经理");
t("plain.identity", plain.safeText === plain.rawText && !plain.changed, plain.safeText);
t("plain.counts-zero", plain.removed === 0 && plain.normalized === 0 && plain.blocked.length === 0);

// ---- 中文标点/结构字符保留（SAFE）----
const punct = sanitizeOcrText("联系人：张三；电话：+86 138-0013-8000；邮箱：z@a.com——备用");
t("punct.cjk-kept", punct.safeText.indexOf("：") >= 0 && punct.safeText.indexOf("；") >= 0 && punct.safeText.indexOf("——") >= 0, punct.safeText);
t("punct.structural-kept", punct.safeText.indexOf("+86") >= 0 && punct.safeText.indexOf("@") >= 0 && punct.safeText.indexOf(".com") >= 0, punct.safeText);
t("punct.unchanged", !punct.changed);
t("punct.no-blocked", punct.blocked.length === 0);

// ---- 全角字母/数字 → 半角；全角中文标点保留（NORMALIZABLE 仅针对错位 ASCII 内容）----
const fw = sanitizeOcrText("ＡＢＣ１２３（）");
t("fw.to-halfwidth", fw.safeText === "ABC123（）", JSON.stringify(fw.safeText));
t("fw.normalized-count", fw.normalized === 6, "normalized=" + fw.normalized);
t("fw.changed", fw.changed);
t("fw.reason-recorded", /fullwidth-alnum-to-halfwidth/.test(fw.reason), fw.reason);
t("fw.cjk-punct-fullwidth-kept", fw.safeText.indexOf("（）") >= 0);
const yuan = sanitizeOcrText("￥100");
t("fw.yen", yuan.safeText === "¥100", yuan.safeText);

// ---- 换行/制表规范化 ----
const nl = sanitizeOcrText("公司名\r\n职位\r姓名");
t("nl.crlf", nl.safeText === "公司名\n职位\n姓名", JSON.stringify(nl.safeText));
const tab = sanitizeOcrText("a\tb");
t("tab.to-space", tab.safeText === "a b" && tab.normalized === 1, JSON.stringify(tab.safeText));

// ---- 控制字符删除（BLOCKED）----
const ctrl = sanitizeOcrText("张\u0000三\u0007");
t("ctrl.removed", ctrl.safeText === "张三" && ctrl.removed === 2, JSON.stringify(ctrl.safeText) + " removed=" + ctrl.removed);
t("ctrl.blocked-listed", ctrl.blocked.length === 2 && ctrl.blocked.every((b) => b.reason === "control-char"), JSON.stringify(ctrl.blocked));

// ---- 零宽/不可见删除 ----
const zw = sanitizeOcrText("张\u200b三\u200d\uFEFF");
t("zw.removed", zw.safeText === "张三", JSON.stringify(zw.safeText));
t("zw.blocked-reason", zw.blocked.length === 3 && zw.blocked.every((b) => b.reason === "zero-width-invisible"), JSON.stringify(zw.blocked));

// ---- Variation Selector 删除 ----
const vs = sanitizeOcrText("名\uFE0F片");
t("vs.removed", vs.safeText === "名片", JSON.stringify(vs.safeText));

// ---- Bidi 控制删除 ----
const bidi = sanitizeOcrText("张\u202e三");
t("bidi.removed", bidi.safeText === "张三", JSON.stringify(bidi.safeText));

// ---- emoji/未验证字符：保留（§十五 不因特殊就删，升级 BLOCKED 需真机证明）----
const emoji = sanitizeOcrText("VIP🎉");
t("emoji.kept", emoji.safeText === "VIP🎉" && emoji.blocked.length === 0 && emoji.changed === false, JSON.stringify(emoji.safeText));

// ---- keepBlocked 探测模式（§十一：原样送 DIY 做单变量实验）----
const probe = sanitizeOcrText("名\u0000片", { keepBlocked: true });
t("probe.keeps", probe.safeText === "名\u0000片", JSON.stringify(probe.safeText));
t("probe.still-recorded", probe.blocked.length === 1 && probe.removed === 0, JSON.stringify(probe.blocked));

// ---- 空/null ----
const empty = sanitizeOcrText("");
t("empty.zero", empty.safeText === "" && !empty.changed);
const nul = sanitizeOcrText(null);
t("null.handled", nul.safeText === "" && nul.rawText === "", JSON.stringify(nul));

// ---- NFKC 可选：默认不启用；启用后不影响中文字符 ----
const nfkc = sanitizeOcrText("①张三②", { normalizeUnicode: true }); // ①→1 ②→2（NFKC 行为）
t("nfkc.enabled-works", nfkc.safeText === "1张三2", JSON.stringify(nfkc.safeText));
const nfkcOff = sanitizeOcrText("①张三②");
t("nfkc.off-by-default", nfkcOff.safeText === "①张三②", JSON.stringify(nfkcOff.safeText));

// ---- classifyChar 分级 ----
t("classify.zero-width", classifyChar("\u200b").level === "BLOCKED", JSON.stringify(classifyChar("\u200b")));
t("classify.fullwidth", classifyChar("Ａ").level === "NORMALIZABLE" && classifyChar("Ａ").to === "A", JSON.stringify(classifyChar("Ａ")));
t("classify.cjk-punct-safe", classifyChar("。").level === "SAFE", JSON.stringify(classifyChar("。")));
t("classify.default-keep", classifyChar("😀").level === "SAFE", JSON.stringify(classifyChar("😀")));

console.log(results.join("\n"));
failures.forEach((f) => console.log("  > " + f));
console.log("ocr-text-sanitizer: " + (failures.length ? failures.length + " FAILURES" : "ALL PASS"));
process.exit(failures.length ? 1 : 0);