// 修复输出 bug（无 Native 文字真值误报）+ 去掉「原生 OCR 会话(自动更新 Cookie)」UI
// repo 在 D:\zheliyin-scriptcat（非工作目录），故以本脚本（工作目录内）改写
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = "D:/zheliyin-scriptcat";
const US = path.join(ROOT, "zheliyin-card-assistant.user.js");
const GATE = path.join(ROOT, "extension", "src", "ocr", "native-completeness-gate.js");
const GTEST = path.join(ROOT, "runtime", "stage9", "native-gate-every-path.test.js");

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

const NEW_TAIL = [
  "  // 输出 bug 修复（2026-09-24）：totalNative=0 必须区分「真值缺失」/「流水线内部异常」/「原生识别 0 行」，",
  "  // 不得一律报「无 Native 文字真值」（后者会让用户无法得知真实原因）。",
  "  if (tb.skipped === true && !tb.native) return { ok: false, code: \"NATIVE_TRUTH_PIPELINE_ERROR\", message: \"Native 文字真值流水线异常（内部错误或依赖未就绪，非“无真值”），本批不创建；请重试，若持续出现请反馈该提示。\", matched: 0, unresolved: 0, totalNative: 0, missingTexts: [] };",
  "  if (tb.native && tb.native.ok === true) return { ok: false, code: \"NATIVE_EMPTY\", message: \"Native OCR 请求成功但未识别到文字（0 行），本批不创建。请确认图片内确有文字，并使用手写体真值通道（textType=2）；若刚更新脚本请刷新页面后重试。\", matched: 0, unresolved: 0, totalNative: 0, missingTexts: [] };",
  "  return { ok: false, code: \"NATIVE_NO_TRUTH\", message: \"无 Native 文字真值，本批不创建\", matched: 0, unresolved: 0, totalNative: 0, missingTexts: [] };",
  "}"
].join("\n");

// ---------- A) 纯门禁模块：兜底三分支 ----------
{
  const got = readNorm(GATE);
  let src = got.src;
  src = replaceOnce(src,
    "  return { ok: false, code: \"NATIVE_NO_TRUTH\", message: \"无 Native 文字真值，本批不创建\", matched: 0, unresolved: 0, totalNative: 0, missingTexts: [] };\n}",
    NEW_TAIL, "A/gate-tail");
  writeNorm(GATE, src, got.crlf);
  console.log("  patched native-completeness-gate.js (NATIVE_EMPTY / NATIVE_TRUTH_PIPELINE_ERROR 细分)");
}

// ---------- B) userscript 兜底镜像 + C/D/E) 去掉会话 UI ----------
{
  const got = readNorm(US);
  let src = got.src;
  // B) 兜底镜像（resolveGate 缺失时）
  src = replaceOnce(src,
    "    return { code: \"NATIVE_NO_TRUTH\", message: \"无 Native 文字真值，本批不创建\", missingTexts: [] };\n  }",
    [
      "    // 输出 bug 修复（2026-09-24）：与纯模块同语义，禁止把「内部异常/识别 0 行」误报为「无真值」",
      "    if (tb.skipped === true && !tb.native) return { code: \"NATIVE_TRUTH_PIPELINE_ERROR\", message: \"Native 文字真值流水线异常（内部错误或依赖未就绪，非“无真值”），本批不创建；请重试，若持续出现请反馈该提示。\", missingTexts: [] };",
      "    if (tb.native && tb.native.ok === true) return { code: \"NATIVE_EMPTY\", message: \"Native OCR 请求成功但未识别到文字（0 行），本批不创建。请确认图片内确有文字，并使用手写体真值通道（textType=2）；若刚更新脚本请刷新页面后重试。\", missingTexts: [] };",
      "    return { code: \"NATIVE_NO_TRUTH\", message: \"无 Native 文字真值，本批不创建\", missingTexts: [] };",
      "  }"
    ].join("\n"), "B/fallback-mirror");
  // C) 去掉设置区 UI 插入
  src = replaceOnce(src, "        ${ocrSessionSettingsHtml(\"\")}\n", "", "C/ui-insert");
  // D) 去掉绑定调用
  src = replaceOnce(src, "    bindOcrSessionControls(panel, \"\");\n", "", "D/bind-call");
  // E) 删除已成为死代码的两个 UI 函数
  src = removeRange(src,
    "  function bindOcrSessionControls(scope, suffix) {",
    "      </details>`;\n  }\n",
    "", "E/ui-fns");
  // 状态元素列表简化（-native 抽屉已移除）
  src = replaceOnce(src,
    "    [\"zy-ocr-session-status\", \"zy-ocr-session-status-native\"].forEach((id) => {",
    "    [\"zy-ocr-session-status\"].forEach((id) => {",
    "F/status-ids");
  writeNorm(US, src, got.crlf);
  const chk = fs.readFileSync(US, "utf8");
  const cnt = (s) => (chk.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
  console.log("  patched userscript.js");
  console.log("    ocrSessionSettingsHtml=" + cnt("ocrSessionSettingsHtml") + " bindOcrSessionControls=" + cnt("bindOcrSessionControls") + " zy-ocr-session-status=" + cnt("zy-ocr-session-status") + " startOcrSessionKeeper=" + cnt("startOcrSessionKeeper") + " NATIVE_EMPTY=" + cnt("NATIVE_EMPTY") + " PIPELINE_ERROR=" + cnt("NATIVE_TRUTH_PIPELINE_ERROR"));
}

// ---------- F) 门禁测试：补 G3/G4 ----------
{
  const got = readNorm(GTEST);
  let src = got.src;
  const anchor = "console.log(\"native-gate-every-path: pass=\" + passed + \" fail=\" + failed);";
  const add = [
    "// ---- 输出 bug 修复（2026-09-24）：totalNative=0 三分支不得互相混淆 ----",
    "t(\"G3: native 请求成功但 0 行 → NATIVE_EMPTY（不再误报“无 Native 文字真值”）\", () => {",
    "  const tb = { blocks: [], mode: \"NATIVE_TRUTH\", native: { ok: true, texts: [], meta: { statusCode: \"NATIVE_EMPTY\" } }, gate: { totalNative: 0, matched: 0, unmatchedNative: 0, matchedGeometry: 0, unusedGeometry: 0 }, matched: { matchedNative: [], unmatchedNative: [], matchedGeometry: [], unusedGeometry: [] } };",
    "  const r = G.resolveGate(tb);",
    "  if (r.ok) throw new Error(\"must stop\");",
    "  if (r.code !== \"NATIVE_EMPTY\") throw new Error(\"code=\" + r.code);",
    "});",
    "t(\"G4: 流水线内部异常（skipped）→ NATIVE_TRUTH_PIPELINE_ERROR（不再误报“无真值”）\", () => {",
    "  const r = G.resolveGate({ blocks: [], mode: \"OFF\", skipped: true });",
    "  if (r.ok) throw new Error(\"must stop\");",
    "  if (r.code !== \"NATIVE_TRUTH_PIPELINE_ERROR\") throw new Error(\"code=\" + r.code);",
    "});",
    anchor
  ].join("\n");
  src = replaceOnce(src, anchor, add, "F/gate-tests");
  writeNorm(GTEST, src, got.crlf);
  console.log("  patched native-gate-every-path.test.js (+G3/G4)");
}
console.log("bugfix + session-ui removal applied.");
