// P2 多版套版（仅当前版）：userscript 模块 + 接线 + template-apply-v2 纯函数 + 单测
// repo 在 D:\zheliyin-scriptcat（非工作目录），故以本脚本（工作目录内）改写
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = "D:/zheliyin-scriptcat";
const US = path.join(ROOT, "zheliyin-card-assistant.user.js");
const AV2 = path.join(ROOT, "extension", "src", "editor", "template-apply-v2.js");
const TEST = path.join(ROOT, "runtime", "stage11", "multiversion-p2.test.js");

function readNorm(F) {
  const raw = fs.readFileSync(F, "utf8");
  const crlf = raw.indexOf("\r\n") >= 0;
  return { crlf: crlf, src: crlf ? raw.split("\r\n").join("\n") : raw };
}
function writeNorm(F, src, crlf) {
  fs.writeFileSync(F, crlf ? src.split("\n").join("\r\n") : src, "utf8");
}
function replaceOnce(src, anchor, replacement, label) {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error("ANCHOR MISS [" + label + "]");
  if (src.indexOf(anchor, i + 1) >= 0) throw new Error("ANCHOR NOT UNIQUE [" + label + "]");
  return src.slice(0, i) + replacement + src.slice(i + anchor.length);
}
const L = (arr) => arr.join("\n");

// ---------- A) template-apply-v2.js：新增 zySelectCommands ----------
{
  const got = readNorm(AV2);
  let src = got.src;
  const SELECT = fs.readFileSync(path.join(__dirname, "p2-select.txt"), "utf8").split("\r\n").join("\n").replace(/\s+$/, "");
  const A_SEL = L([
    "if (typeof module !== \"undefined\" && module.exports) {",
    "  module.exports = { zySlotPrefixOf: zySlotPrefixOf, zySnapshotSlotRegistry: zySnapshotSlotRegistry, zyBuildApplyCommandPlan: zyBuildApplyCommandPlan };",
    "}"
  ]);
  const A_SEL_NEW = L([
    SELECT,
    "",
    "if (typeof module !== \"undefined\" && module.exports) {",
    "  module.exports = { zySlotPrefixOf: zySlotPrefixOf, zySnapshotSlotRegistry: zySnapshotSlotRegistry, zyBuildApplyCommandPlan: zyBuildApplyCommandPlan, zySelectCommands: zySelectCommands };",
    "}"
  ]);
  src = replaceOnce(src, A_SEL, A_SEL_NEW, "A/select");
  writeNorm(AV2, src, got.crlf);
  console.log("  patched template-apply-v2.js (+zySelectCommands)");
}

// ---------- B) userscript ----------
{
  const got = readNorm(US);
  let src = got.src;
  const MODULE = fs.readFileSync(path.join(__dirname, "p2-module.txt"), "utf8").split("\r\n").join("\n").replace(/\s+$/, "");

  // E2. renderPanel：新增「多版套版」设置区（放在最后一块 details 之后、OCR 按钮之前）
  const E2 = L([
    "        </details>",
    "        <div class=\"zy-actions\">",
    "          <button class=\"zy-btn zy-ocr\" id=\"zy-ocr-btn\">识别图片文字</button>"
  ]);
  const E2NEW = L([
    "        </details>",
    "        ${mvSettingsHtml()}",
    "        <div class=\"zy-actions\">",
    "          <button class=\"zy-btn zy-ocr\" id=\"zy-ocr-btn\">识别图片文字</button>"
  ]);
  src = replaceOnce(src, E2, E2NEW, "E2/renderPanel");

  // E3. bindPanel：绑定多版控件
  const E3 = L([
    "    bindOcrControls(panel, \"\", () => { renderPanel(); });",
    "    bindOcrSessionControls(panel, \"\");",
    "  }"
  ]);
  const E3NEW = L([
    "    bindOcrControls(panel, \"\", () => { renderPanel(); });",
    "    bindOcrSessionControls(panel, \"\");",
    "    bindMvControls(panel);",
    "  }"
  ]);
  src = replaceOnce(src, E3, E3NEW, "E3/bindPanel");

  // E4. initZheliyin：启动切版跟切轮询
  const E4 = L([
    "    renderPanel();",
    "    checkForUpdateSoon();",
    "    // 用户需求（2026-09-24）：脚本设置自动定期更新原生 OCR 会话（默认读取使用者本机浏览器 cookie）",
    "    startOcrSessionKeeper();",
    "  }"
  ]);
  const E4NEW = L([
    "    renderPanel();",
    "    checkForUpdateSoon();",
    "    // 用户需求（2026-09-24）：脚本设置自动定期更新原生 OCR 会话（默认读取使用者本机浏览器 cookie）",
    "    startOcrSessionKeeper();",
    "    // P2 多版套版：切版跟切（只读轮询版布局，版/面变化即刷新标识并使冻结匹配失效）",
    "    startVersionWatcher();",
    "  }"
  ]);
  src = replaceOnce(src, E4, E4NEW, "E4/init");

  // E5. refreshMatchBlock：失效标记
  const E5 = L([
    "    const vTagR = (lastAiMatch && lastAiMatch.versionCount > 1) ? (\"第\" + ((lastAiMatch.version || 0) + 1) + \"版 ｜ \") : \"\";",
    "    summaryEl.textContent = vTagR + \"匹配结果（预览，未修改画布）：正面 \" + fM + \"/\" + f + (b > 0 ? \" / 反面 \" + bM + \"/\" + b : \"\") + \"（语义校验 \" + semN + \"）｜未匹配 \" + (sm.unmatched != null ? sm.unmatched : 0) + \" ｜不确定 \" + (sm.uncertain != null ? sm.uncertain : 0);"
  ]);
  const E5NEW = L([
    "    const vTagR = (lastAiMatch && lastAiMatch.versionCount > 1) ? (\"第\" + ((lastAiMatch.version || 0) + 1) + \"版 ｜ \") : \"\";",
    "    const staleTag = lastAiMatch.stale ? \"⚠ 版已切换，本匹配已失效（请重新匹配）｜ \" : \"\";",
    "    summaryEl.textContent = staleTag + vTagR + \"匹配结果（预览，未修改画布）：正面 \" + fM + \"/\" + f + (b > 0 ? \" / 反面 \" + bM + \"/\" + b : \"\") + \"（语义校验 \" + semN + \"）｜未匹配 \" + (sm.unmatched != null ? sm.unmatched : 0) + \" ｜不确定 \" + (sm.uncertain != null ? sm.uncertain : 0);"
  ]);
  src = replaceOnce(src, E5, E5NEW, "E5/refreshMatchBlock");

  // E6. confirmTemplateApply：失效守卫
  const E6 = L([
    "  async function confirmTemplateApply() {",
    "    if (!lastAiMatch) { setStatus(\"没有可确认的 AI 匹配结果，请先「一键智能填充」。\"); return; }"
  ]);
  const E6NEW = L([
    "  async function confirmTemplateApply() {",
    "    if (!lastAiMatch) { setStatus(\"没有可确认的 AI 匹配结果，请先「一键智能填充」。\"); return; }",
    "    if (lastAiMatch.stale) { setStatus(\"版已切换，原匹配已失效，请重新「一键智能填充」后再确认。\"); return; }"
  ]);
  src = replaceOnce(src, E6, E6NEW, "E6/confirmTemplateApply");

  // E7. 多版模块本体：插在 cancelTemplateApply 之后
  const E7 = L([
    "  function cancelTemplateApply() {",
    "    lastAiMatch = null;",
    "    refreshMatchBlock();",
    "    setStatus(\"已取消 AI 填充预览。\");",
    "  }"
  ]);
  src = replaceOnce(src, E7, E7 + "\n\n" + MODULE, "E7/module");

  writeNorm(US, src, got.crlf);

  const chk = fs.readFileSync(US, "utf8");
  const cnt = (s) => (chk.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
  console.log("  patched userscript.js");
  console.log("    mvSettingsHtml=" + cnt("mvSettingsHtml") + " bindMvControls=" + cnt("bindMvControls") + " startVersionWatcher=" + cnt("startVersionWatcher") + " zySelectCommands=" + cnt("zySelectCommands") + " mvExecCommands=" + cnt("mvExecCommands"));
}

// ---------- C) 单测 ----------
{
  const content = fs.readFileSync(path.join(__dirname, "p2-test.txt"), "utf8").split("\r\n").join("\n");
  fs.mkdirSync(path.dirname(TEST), { recursive: true });
  fs.writeFileSync(TEST, content, "utf8");
  console.log("  wrote runtime/stage11/multiversion-p2.test.js");
}

console.log("P2 patch applied.");
