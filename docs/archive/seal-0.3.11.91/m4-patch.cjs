// M4 可编辑匹配工作台：纯模块 + userscript 渲染/交互/接线 + 删除 legacy 面板区 + 单测 + @require
// repo 在 D:\zheliyin-scriptcat（非工作目录），故以本脚本（工作目录内）改写
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = "D:/zheliyin-scriptcat";
const US = path.join(ROOT, "zheliyin-card-assistant.user.js");
const WB = path.join(ROOT, "extension", "src", "ai", "template-match-workbench.js");
const TEST = path.join(ROOT, "runtime", "stage11", "template-match-workbench.test.js");
const V = "0.3.11.81";

function readNorm(F) { const raw = fs.readFileSync(F, "utf8"); const crlf = raw.indexOf("\r\n") >= 0; return { crlf: crlf, src: crlf ? raw.split("\r\n").join("\n") : raw }; }
function writeNorm(F, src, crlf) { fs.writeFileSync(F, crlf ? src.split("\n").join("\r\n") : src, "utf8"); }
function replaceOnce(src, anchor, replacement, label) {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error("ANCHOR MISS [" + label + "]");
  if (src.indexOf(anchor, i + 1) >= 0) throw new Error("ANCHOR NOT UNIQUE [" + label + "]");
  return src.slice(0, i) + replacement + src.slice(i + anchor.length);
}
const txt = (f) => fs.readFileSync(path.join(__dirname, f), "utf8").split("\r\n").join("\n").replace(/\s+$/, "");
const L = (a) => a.join("\n");

// ---------- A) 新纯模块 ----------
fs.writeFileSync(WB, txt("m4-wb.txt") + "\n", "utf8");
console.log("  wrote extension/src/ai/template-match-workbench.js");

// ---------- B) 单测 ----------
fs.writeFileSync(TEST, txt("m4-test.txt") + "\n", "utf8");
console.log("  wrote runtime/stage11/template-match-workbench.test.js");

// ---------- C) userscript ----------
{
  const got = readNorm(US);
  let src = got.src;

  // C0. @require 新增模块（版本占位 = 当前版本，随后由 bump 脚本统一升）
  const R_OLD = "// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/ai/template-match-validator.js?v=" + V;
  const R_NEW = R_OLD + "\n// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/ai/template-match-workbench.js?v=" + V;
  src = replaceOnce(src, R_OLD, R_NEW, "C0/require");

  // C1. CSS
  const CSS_ANCHOR = L([
    "      #zy-native-ocr-tool-btn:hover { background: #1f6feb; }",
    "    `);"
  ]);
  const CSS = [
    "      .zy-match-block { border: 1px solid #d7e2f5; border-radius: 6px; padding: 8px; background: #f7faff; display: grid; gap: 8px; }",
    "      .zy-match-summary { font-size: 12px; font-weight: 700; color: #1f3b63; }",
    "      .zy-wb-cols { display: grid; grid-template-columns: 1.35fr 1fr; gap: 8px; }",
    "      .zy-wb-col { display: grid; gap: 6px; align-content: start; }",
    "      .zy-wb-h { font-size: 11px; color: #667085; font-weight: 700; }",
    "      .zy-wb-row { border: 1px solid #e4e7ec; border-radius: 6px; padding: 6px; background: #fff; display: grid; gap: 4px; }",
    "      .zy-wb-head { display: flex; justify-content: space-between; align-items: center; gap: 6px; }",
    "      .zy-wb-sid { font-size: 12px; font-weight: 700; color: #1f2937; }",
    "      .zy-wb-badge { font-size: 10px; padding: 1px 6px; border-radius: 8px; background: #eef2f7; color: #475467; }",
    "      .zy-wb-badge.ok { background: #e6f4ea; color: #1b7a3d; }",
    "      .zy-wb-badge.edit { background: #fff4e5; color: #b25e00; }",
    "      .zy-wb-badge.unclear { background: #fdecef; color: #b42318; }",
    "      .zy-wb-tpl { font-size: 11px; color: #667085; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
    "      .zy-wb-ops { display: grid; grid-template-columns: auto auto 1fr; gap: 4px; }",
    "      .zy-wb-mini { min-height: 26px !important; padding: 0 6px; font-size: 11px; }",
    "      .zy-wb-blocks { display: grid; gap: 4px; max-height: 260px; overflow: auto; }",
    "      .zy-wb-chip { display: grid; gap: 2px; border: 1px solid #e4e7ec; border-radius: 6px; padding: 5px 6px; background: #fff; cursor: pointer; }",
    "      .zy-wb-chip.sel { border-color: #1f6feb; box-shadow: 0 0 0 2px rgba(31,111,235,.18); }",
    "      .zy-wb-chip-id { font-size: 10px; color: #667085; }",
    "      .zy-wb-chip-tx { font-size: 12px; color: #172033; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
    "      .zy-wb-chip-st { font-size: 10px; color: #1f6feb; }"
  ].join("\n");
  src = replaceOnce(src, CSS_ANCHOR, L(["      #zy-native-ocr-tool-btn:hover { background: #1f6feb; }", CSS, "    `);"]), "C1/css");

  // C2. renderPanel：工作台标记 + 删除 legacy「正反面与字段」区
  const WB_OLD = L([
    "        <div class=\"zy-match-block\" id=\"zy-match-block\" style=\"display:none\">",
    "          <div class=\"zy-match-summary\" id=\"zy-match-summary\"></div>",
    "          <div class=\"zy-match-rows\" id=\"zy-match-rows\"></div>",
    "          <div class=\"zy-actions two\">",
    "            <button class=\"zy-btn\" id=\"zy-apply-confirm\">确认填充</button>",
    "            <button class=\"zy-btn secondary\" id=\"zy-apply-cancel\">取消</button>",
    "          </div>",
    "        </div>",
    "        <details class=\"zy-settings\">",
    "          <summary>正反面与字段（可编辑）</summary>",
    "          <div class=\"zy-settings-body\">",
    "            <div class=\"zy-side-grid\" id=\"zy-side-texts\">${renderSideTextInputs()}</div>",
    "            <div class=\"zy-grid\" id=\"zy-fields\">${renderFieldInputs(state.fields)}</div>",
    "            <div class=\"zy-actions two\">",
    "              <button class=\"zy-btn\" id=\"zy-apply-front\">填正面</button>",
    "              <button class=\"zy-btn secondary\" id=\"zy-apply-back\">填反面</button>",
    "            </div>",
    "          </div>",
    "        </details>"
  ]);
  const WB_NEW = L([
    "        <div class=\"zy-match-block\" id=\"zy-match-block\" style=\"display:none\">",
    "          <div class=\"zy-match-summary\" id=\"zy-match-summary\"></div>",
    "          <div class=\"zy-wb-cols\">",
    "            <div class=\"zy-wb-col\">",
    "              <div class=\"zy-wb-h\">模板槽位（原模板只读 ／ 客户值可编辑）</div>",
    "              <div class=\"zy-match-rows\" id=\"zy-match-rows\"></div>",
    "            </div>",
    "            <div class=\"zy-wb-col\">",
    "              <div class=\"zy-wb-h\">客户文字块（点选后到左侧点「分配所选块」）</div>",
    "              <div class=\"zy-wb-blocks\" id=\"zy-wb-blocks\"></div>",
    "            </div>",
    "          </div>",
    "          <div class=\"zy-note\" id=\"zy-wb-unmatched\"></div>",
    "          <div class=\"zy-actions\">",
    "            <button class=\"zy-btn\" id=\"zy-apply-confirm\">确认套版</button>",
    "            <button class=\"zy-btn secondary\" id=\"zy-apply-cancel\">取消</button>",
    "            <button class=\"zy-btn secondary\" id=\"zy-wb-rematch\" type=\"button\">重新 AI 匹配</button>",
    "          </div>",
    "        </div>"
  ]);
  src = replaceOnce(src, WB_OLD, WB_NEW, "C2/renderPanel");

  // C3. bindPanel：移除 legacy 填正面/填反面绑定
  const BF_OLD = L([
    "    panel.querySelector(\"#zy-apply-front\").addEventListener(\"click\", () => {",
    "      rebuildFieldsFromSideText();",
    "      applyFieldsToPage(state.fields, \"front\");",
    "    });",
    "    panel.querySelector(\"#zy-apply-back\").addEventListener(\"click\", () => {",
    "      rebuildFieldsFromSideText();",
    "      applyFieldsToPage(state.fields, \"back\");",
    "    });",
    "    // P1 根因修复"
  ]);
  src = replaceOnce(src, BF_OLD, "    // P1 根因修复", "C3/bindPanelRemoveLegacy");

  // C4. bindPanel：绑定工作台 + 重新匹配
  const BM_OLD = L(["    bindMvControls(panel);", "  }"]);
  const BM_NEW = L([
    "    bindMvControls(panel);",
    "    bindWorkbench(panel);",
    "    const wbRematchBtn = panel.querySelector(\"#zy-wb-rematch\");",
    "    if (wbRematchBtn) wbRematchBtn.addEventListener(\"click\", mwRematch);",
    "  }"
  ]);
  src = replaceOnce(src, BM_OLD, BM_NEW, "C4/bindPanelWorkbench");

  // C5. refreshMatchBlock → 工作台渲染（含 mwStatusCn/mwSyncPlan）
  const RF_OLD = L([
    "  function refreshMatchBlock() {",
    "    const block = document.getElementById(\"zy-match-block\");",
    "    const summaryEl = document.getElementById(\"zy-match-summary\");",
    "    const rowsEl = document.getElementById(\"zy-match-rows\");",
    "    if (!block || !summaryEl || !rowsEl) return;",
    "    if (!lastAiMatch) { block.style.display = \"none\"; return; }",
    "    block.style.display = \"block\";",
    "    const ref = lastAiMatch.ref || {};",
    "    const f = lastAiMatch.sideCounts ? lastAiMatch.sideCounts.front : 0;",
    "    const b = lastAiMatch.sideCounts ? lastAiMatch.sideCounts.back : 0;",
    "    const fM = (ref.matches || []).filter(function (m) { return m.side === \"front\"; }).length;",
    "    const bM = (ref.matches || []).filter(function (m) { return m.side === \"back\"; }).length;",
    "    const sm = ref.summary || {};",
    "    const semN = (sm.semanticallyVerified != null) ? sm.semanticallyVerified : 0;",
    "    const vTagR = (lastAiMatch && lastAiMatch.versionCount > 1) ? (\"第\" + ((lastAiMatch.version || 0) + 1) + \"版 ｜ \") : \"\";",
    "    const staleTag = lastAiMatch.stale ? \"⚠ 版已切换，本匹配已失效（请重新匹配）｜ \" : \"\";",
    "    summaryEl.textContent = staleTag + vTagR + \"匹配结果（预览，未修改画布）：正面 \" + fM + \"/\" + f + (b > 0 ? \" / 反面 \" + bM + \"/\" + b : \"\") + \"（语义校验 \" + semN + \"）｜未匹配 \" + (sm.unmatched != null ? sm.unmatched : 0) + \" ｜不确定 \" + (sm.uncertain != null ? sm.uncertain : 0);",
    "    rowsEl.innerHTML = (ref.matches || []).slice(0, 12).map(function (m) { return \"<div class=\\\"zy-note\\\">\" + escapeHtml((m.side === \"back\" ? \"[反] \" : \"\") + m.slotId + \" ← \" + String(m.customerText).slice(0, 24)) + \"</div>\"; }).join(\"\");",
    "  }"
  ]);
  src = replaceOnce(src, RF_OLD, txt("m4-refresh.txt"), "C5/refreshMatchBlock");

  // C6. cancelTemplateApply：清空 mw + 追加 M4 交互模块
  const CT_OLD = L([
    "  function cancelTemplateApply() {",
    "    lastAiMatch = null;",
    "    refreshMatchBlock();",
    "    setStatus(\"已取消 AI 填充预览。\");",
    "  }"
  ]);
  src = replaceOnce(src, CT_OLD, CT_OLD.replace("    lastAiMatch = null;", "    lastAiMatch = null;\n    mw = null;") + "\n\n" + txt("m4-ops.txt"), "C6/ops");

  // C7. confirmTemplateApply 成功 → 清空 mw
  src = replaceOnce(src, "        lastAiMatch = null; refreshMatchBlock();", "        lastAiMatch = null; mw = null; refreshMatchBlock();", "C7/confirm");

  // C8. P2 mvExecCommands 成功 → 清空 mw
  src = replaceOnce(src, "        lastAiMatch = null; mvStatusMsg = \"\"; refreshMatchBlock(); mvRenderInto();", "        lastAiMatch = null; mw = null; mvStatusMsg = \"\"; refreshMatchBlock(); mvRenderInto();", "C8/mvExec");

  // C9. aiTemplateSlotMatch：累计 blocks/uncertain/unmatched
  src = replaceOnce(src, L(["      const merged = [];", "      const reports = [];", "      const sideErrors = [];"]),
    L(["      const merged = [];", "      const reports = [];", "      const sideErrors = [];", "      const allBlocks = [];", "      const allUncertain = [];", "      const allUnmatched = [];"]), "C9/acc");

  src = replaceOnce(src, L(["          (ref.matches || []).forEach(function (m) { merged.push(m); });", "        } catch (eSide) {"]),
    L(["          (ref.matches || []).forEach(function (m) { merged.push(m); });", "          (ref.blocks || []).forEach(function (b) { allBlocks.push(b); });", "          (ref.uncertain || []).forEach(function (u) { allUncertain.push(u); });", "          (ref.unmatchedCustomer || []).forEach(function (u) { allUnmatched.push(u); });", "        } catch (eSide) {"]), "C10/capture");

  // C11. aiTemplateSlotMatch：构建 mw
  const LM_OLD = L([
    "          ref: { matches: ordered, summary: { matched: ordered.length, semanticallyVerified: verifiedN, uncertain: uncertainN, unmatched: unmatchedN } },",
    "          ts: Date.now()",
    "        };",
    "      } else {",
    "        lastAiMatch = null;",
    "      }"
  ]);
  const LM_NEW = L([
    "          ref: { matches: ordered, summary: { matched: ordered.length, semanticallyVerified: verifiedN, uncertain: uncertainN, unmatched: unmatchedN } },",
    "          ts: Date.now()",
    "        };",
    "        mw = zyBuildWorkbench({ slots: snapshot, version: vMeta, versionCount: vCount, multi: !!snapshot.multi, sideCounts: { front: frontItems.length, back: backItems.length }, pageId: v2PageId, planHash: snapHash, matches: ordered, blocks: allBlocks, uncertain: allUncertain, unmatched: allUnmatched, snapshot: snapshot });",
    "      } else {",
    "        lastAiMatch = null;",
    "        mw = null;",
    "      }"
  ]);
  src = replaceOnce(src, LM_OLD, LM_NEW, "C11/buildMw");

  // C12. runLocalRulePreview：构建 mw
  const LR_OLD = "        lastAiMatch = { ok: true, commands: cmdPlan.commands.slice(), planHash: snapHash, pageId: v2PageId, version: vMetaL, versionCount: vCountL, sideCounts: { front: frontItems.length, back: backItems.length }, total: frontItems.length + backItems.length, ref: { matches: localMatches, summary: { matched: localMatches.length, uncertain: 0, unmatched: 0 } }, localRule: true, ts: Date.now() };";
  const LR_NEW = LR_OLD + "\n        mw = zyBuildWorkbench({ slots: snapshot, version: vMetaL, versionCount: vCountL, multi: !!snapshot.multi, sideCounts: { front: frontItems.length, back: backItems.length }, pageId: v2PageId, planHash: snapHash, matches: localMatches, blocks: [], uncertain: [], unmatched: [], snapshot: snapshot });";
  src = replaceOnce(src, LR_OLD, LR_NEW, "C12/localMw");

  const LE_OLD = "        setStatus(\"AI 槽位匹配不可用（\" + why + \"），本地规则计划无效：未自动修改模板。\");";
  src = replaceOnce(src, LE_OLD, LE_OLD + "\n        mw = null;", "C13/localElse");

  // C14. 声明 mw（紧随 lastAiMatch）
  src = replaceOnce(src, "  let lastAiMatch = null;", "  let lastAiMatch = null;\n  let mw = null; // M4 可编辑匹配工作台状态", "C14/declare");

  writeNorm(US, src, got.crlf);

  const chk = fs.readFileSync(US, "utf8");
  const cnt = (s) => (chk.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
  console.log("  patched userscript.js");
  console.log("    mw decl=" + cnt("let mw = null;") + " zyBuildWorkbench=" + cnt("zyBuildWorkbench") + " bindWorkbench=" + cnt("bindWorkbench") + " mwDoAssign=" + cnt("mwDoAssign") + " zy-wb-blocks=" + cnt("zy-wb-blocks") + " legacyDetails=" + cnt("正反面与字段（可编辑）") + " requireWB=" + cnt("template-match-workbench.js"));
}
console.log("M4 patch applied.");
