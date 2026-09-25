// 去掉原生 OCR 栏（不在 UI 显示；OCR 默认后台执行）
// 移除：OCR_ONLY_MODE 常量 + 原生抽屉 CSS + renderNativeOcrDrawer/mountNativeOcrPanel/observeNativeRemount + init 挂载分支
// repo 在 D:\zheliyin-scriptcat（非工作目录），故以本脚本（工作目录内）改写
"use strict";
const fs = require("fs");
const path = require("path");
const US = "D:/zheliyin-scriptcat/zheliyin-card-assistant.user.js";

function readNorm(F) { const raw = fs.readFileSync(F, "utf8"); const crlf = raw.indexOf("\r\n") >= 0; return { crlf: crlf, src: crlf ? raw.split("\r\n").join("\n") : raw }; }
function writeNorm(F, src, crlf) { fs.writeFileSync(F, crlf ? src.split("\n").join("\r\n") : src, "utf8"); }
function replaceOnce(src, anchor, replacement, label) {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error("ANCHOR MISS [" + label + "]");
  if (src.indexOf(anchor, i + 1) >= 0) throw new Error("ANCHOR NOT UNIQUE [" + label + "]");
  return src.slice(0, i) + replacement + src.slice(i + anchor.length);
}
function removeRange(src, startAnchor, endAnchor, replacement, label) {
  const i = src.indexOf(startAnchor);
  if (i < 0) throw new Error("START MISS [" + label + "]");
  if (src.indexOf(startAnchor, i + 1) >= 0) throw new Error("START NOT UNIQUE [" + label + "]");
  const j = src.indexOf(endAnchor, i);
  if (j < 0) throw new Error("END MISS [" + label + "]");
  return src.slice(0, i) + (replacement || "") + src.slice(j + endAnchor.length);
}

const got = readNorm(US);
let src = got.src;

// 1) 移除原生抽屉 + 工具按钮 CSS
src = removeRange(src,
  "      /* Stage 5.5B P2-B：原生右栏邻接抽屉（复用 zy-* 样式体系） */\n",
  "      #zy-native-ocr-tool-btn:hover { background: #1f6feb; }\n",
  "", "css");

// 2) 移除原生抽屉函数块（renderNativeOcrDrawer / mountNativeOcrPanel / observeNativeRemount + 变量）
src = removeRange(src,
  "  // ---- Stage 5.5B P2-B：原生右栏 OCR 面板",
  "    nativeObs.observe(document.body, { childList: true, subtree: true });\n  }\n\n",
  "", "functions");

// 3) 移除 OCR_ONLY_MODE 常量与旧说明
src = replaceOnce(src,
  "  // ---- Stage 5.6（用户指令 2026-09-17）：OCR-only Demo ----\n" +
  "  // Demo 主 UI = 原生右栏 OCR 抽屉；旧套版浮窗停用挂载（renderPanel 函数体与全部套版代码保留）。\n" +
  "  // GM 开关 zyShowTemplatePanel（默认空/0/1=显示浮窗；存 \"2\"=OCR-only 仅原生抽屉；历史 \"1\" 兼容）。\n" +
  "  const OCR_ONLY_MODE = GM_getValue(\"zyShowTemplatePanel\", \"0\") === \"2\"; // 默认显示套版浮窗（含一键智能填充）；显式存 \"2\" 才回到 OCR-only（仅原生抽屉）\n",
  "  // ---- 用户指令（2026-09-24）：去掉原生 OCR 栏（不在 UI 显示，OCR 默认后台执行）----\n" +
  "  // 历史「OCR-only」演示模式（GM zyShowTemplatePanel=\"2\"）已废弃：原生右栏抽屉/工具按钮不再挂载；\n" +
  "  // 识别入口统一为套版浮窗内「识别图片文字」按钮（后台执行，仅改文字，不改几何/字体/颜色/层级）。\n",
  "const");

// 4) 移除 init 挂载分支
src = replaceOnce(src,
  "    // Stage 10-F Commit H：套版浮窗与文字识别合并为单窗口（用户指定「只保留图中 UI」）。\n" +
  "    // 默认不挂原生 OCR 抽屉，识别入口 = 浮窗内「识别图片文字」按钮；显式 GM zyShowTemplatePanel=\"2\" 才回到旧 OCR-only（原生抽屉）。\n" +
  "    if (OCR_ONLY_MODE) {\n" +
  "      const nativeOkH = mountNativeOcrPanel();\n" +
  "      observeNativeRemount();\n" +
  "    }\n",
  "    // 用户指令（2026-09-24）：去掉原生 OCR 栏（不在 UI 显示，OCR 默认后台执行）。\n" +
  "    // 识别入口统一为套版浮窗内「识别图片文字」按钮；原生右栏抽屉/工具按钮及重挂 observer 已移除。\n",
  "init");

// 5) 注释同步（bindOcrControls suffix 说明）
src = replaceOnce(src,
  "  // suffix: 浮窗 \"\" / 原生抽屉 \"-native\"；onSaved: 保存后回调（浮窗需重渲染刷新占位，原生抽屉不需要）。",
  "  // suffix: 目前仅浮窗 \"\"（原生抽屉已移除）；onSaved: 保存后回调（浮窗需重渲染刷新占位）。",
  "suffix-comment");

// 6) 注释同步（setStatus 双显示目标）
src = replaceOnce(src,
  "    // 双显示目标：浮窗 #zy-status 与原生抽屉 #zy-native-status（均带 .zy-status 类）",
  "    // 状态显示目标：浮窗 #zy-status（.zy-status 类）",
  "status-comment");

writeNorm(US, src, got.crlf);

const chk = fs.readFileSync(US, "utf8");
const cnt = (s) => (chk.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
console.log("patched userscript.js");
console.log("  OCR_ONLY_MODE=" + cnt("OCR_ONLY_MODE") + " zy-native-ocr-panel=" + cnt("zy-native-ocr-panel") + " zy-native-ocr-tool-btn=" + cnt("zy-native-ocr-tool-btn") + " mountNativeOcrPanel=" + cnt("mountNativeOcrPanel") + " renderNativeOcrDrawer=" + cnt("renderNativeOcrDrawer") + " observeNativeRemount=" + cnt("observeNativeRemount") + " zy-native-status=" + cnt("zy-native-status") + " handleOcrImage=" + cnt("handleOcrImage") + " zy-ocr-btn=" + cnt("zy-ocr-btn"));
console.log("no-native-ocr patch applied.");
