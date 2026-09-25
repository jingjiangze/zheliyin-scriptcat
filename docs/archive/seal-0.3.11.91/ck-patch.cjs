// 用户需求（2026-09-24）：脚本设置自动定期更新原生 OCR 会话（默认读取使用者浏览器 cookie）
// repo 位于 D:\zheliyin-scriptcat（非工作目录），故以本脚本（工作目录内）改写该文件
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = "D:/zheliyin-scriptcat";
const US = path.join(ROOT, "zheliyin-card-assistant.user.js");

function readNorm(F) {
  const raw = fs.readFileSync(F, "utf8");
  const crlf = raw.indexOf("\r\n") >= 0;
  return { crlf: crlf, src: crlf ? raw.split("\r\n").join("\n") : raw };
}
function writeNorm(F, src, crlf) {
  fs.writeFileSync(F, crlf ? src.split("\n").join("\r\n") : src, "utf8");
}
function insertAfter(src, anchor, addition, label) {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error("ANCHOR MISS [" + label + "]");
  if (src.indexOf(anchor, i + 1) >= 0) throw new Error("ANCHOR NOT UNIQUE [" + label + "]");
  return src.slice(0, i + anchor.length) + addition + src.slice(i + anchor.length);
}
function replaceOnce(src, anchor, replacement, label) {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error("ANCHOR MISS [" + label + "]");
  if (src.indexOf(anchor, i + 1) >= 0) throw new Error("ANCHOR NOT UNIQUE [" + label + "]");
  return src.slice(0, i) + replacement + src.slice(i + anchor.length);
}

const got = readNorm(US);
let src = got.src;

const MODULE = fs.readFileSync(path.join(__dirname, "ck-module.txt"), "utf8").split("\r\n").join("\n").replace(/\s+$/, "");

// A. 模块本体：插在 setBaiduStatus 之后、凭据加密段之前
const A = [
  "  function setBaiduStatus(node, text) {",
  "    const n = node || document.getElementById(\"zy-baidu-status\");",
  "    if (n) n.textContent = text;",
  "  }"
].join("\n");
src = insertAfter(src, A, "\n\n" + MODULE, "A/module");

// B. renderPanel 设置区：客户文字之前插入会话设置（浮窗 suffix=""）
const B = [
  "        </details>",
  "        <div class=\"zy-row\">",
  "          <label class=\"zy-label\" for=\"zy-raw\">客户文字（自动拆正反面）</label>"
].join("\n");
const B2 = [
  "        </details>",
  "        ${ocrSessionSettingsHtml(\"\")}",
  "        <div class=\"zy-row\">",
  "          <label class=\"zy-label\" for=\"zy-raw\">客户文字（自动拆正反面）</label>"
].join("\n");
src = replaceOnce(src, B, B2, "B/renderPanel");

// C. bindPanel：绑定浮窗会话控件
const C = [
  "    bindOcrControls(panel, \"\", () => { renderPanel(); });",
  "  }"
].join("\n");
const C2 = [
  "    bindOcrControls(panel, \"\", () => { renderPanel(); });",
  "    bindOcrSessionControls(panel, \"\");",
  "  }"
].join("\n");
src = replaceOnce(src, C, C2, "C/bindPanel");

// D1. renderNativeOcrDrawer html：原生抽屉内插入会话设置（suffix="-native"）
const D = [
  "            <div class=\"zy-note\" id=\"zy-baidu-status-native\">凭据为客户端可访问凭据，仅存本机脚本配置；请勿使用高权限/长期/不可撤销的 Key。</div>",
  "          </div>",
  "        </details>",
  "      </div>`;"
].join("\n");
const D2 = [
  "            <div class=\"zy-note\" id=\"zy-baidu-status-native\">凭据为客户端可访问凭据，仅存本机脚本配置；请勿使用高权限/长期/不可撤销的 Key。</div>",
  "          </div>",
  "        </details>",
  "        ${ocrSessionSettingsHtml(\"-native\")}",
  "      </div>`;"
].join("\n");
src = replaceOnce(src, D, D2, "D1/drawerHtml");

// D2. bindOcrControls(drawer, ...) 之后绑定抽屉会话控件
const D3 = [
  "    bindOcrControls(drawer, \"-native\", null);",
  "    return drawer;"
].join("\n");
const D4 = [
  "    bindOcrControls(drawer, \"-native\", null);",
  "    bindOcrSessionControls(drawer, \"-native\");",
  "    return drawer;"
].join("\n");
src = replaceOnce(src, D3, D4, "D2/drawerBind");

// E. initZheliyin：启动会话保活
const E = [
  "    renderPanel();",
  "    checkForUpdateSoon();",
  "  }"
].join("\n");
const E2 = [
  "    renderPanel();",
  "    checkForUpdateSoon();",
  "    // 用户需求（2026-09-24）：脚本设置自动定期更新原生 OCR 会话（默认读取使用者本机浏览器 cookie）",
  "    startOcrSessionKeeper();",
  "  }"
].join("\n");
src = replaceOnce(src, E, E2, "E/init");

// F. runNativeTruth：会话过期 → 触发一次会话刷新
const F = [
  "      img._native = native;",
  "      const ok = !!(native && native.ok);",
  "      pipelineEvidence({ stage: \"NATIVE\", nativeLines: (native && native.texts) ? native.texts.length : 0, ok: ok, code: (native && native.error && native.error.errorCode) || null, httpStatus: (native && native.httpStatus != null) ? native.httpStatus : null });"
].join("\n");
const F2 = [
  "      img._native = native;",
  "      const ok = !!(native && native.ok);",
  "      pipelineEvidence({ stage: \"NATIVE\", nativeLines: (native && native.texts) ? native.texts.length : 0, ok: ok, code: (native && native.error && native.error.errorCode) || null, httpStatus: (native && native.httpStatus != null) ? native.httpStatus : null });",
  "      // 会话过期 → 触发一次同域会话刷新（校验登录态），并提示重新登录",
  "      const _nativeCode = (native && native.error && native.error.errorCode) || null;",
  "      if (!ok && (_nativeCode === \"SESSION_EXPIRED\" || _nativeCode === \"NATIVE_SESSION_EXPIRED\")) {",
  "        try { touchNativeOcrSession(\"识别过期触发\"); } catch (e) { /* noop */ }",
  "      }"
].join("\n");
src = replaceOnce(src, F, F2, "F/runNativeTruth");

writeNorm(US, src, got.crlf);

const chk = fs.readFileSync(US, "utf8");
const cnt = (s) => (chk.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
console.log("patch done. crlf=" + got.crlf);
console.log("  touchNativeOcrSession refs=" + cnt("touchNativeOcrSession"));
console.log("  ocrSessionSettingsHtml refs=" + cnt("ocrSessionSettingsHtml"));
console.log("  bindOcrSessionControls refs=" + cnt("bindOcrSessionControls"));
console.log("  startOcrSessionKeeper refs=" + cnt("startOcrSessionKeeper"));
