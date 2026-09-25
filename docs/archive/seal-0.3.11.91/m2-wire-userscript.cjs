// M2-3 补丁：userscript 接线 V2 分面调用
// 1) 替换 aiTemplateSlotMatch 为「按面调用 + 逐面异常隔离」
// 2) refreshMatchBlock 摘要加「语义校验」
"use strict";
const fs = require("fs");
const US = "D:\\zheliyin-scriptcat\\zheliyin-card-assistant.user.js";
let src = fs.readFileSync(US, "utf8");
const nl = src.indexOf("\r\n") >= 0 ? "\r\n" : "\n";

const NEW_FN = [
'  // Stage 10-G L 阶 M2（AI Match Prompt V2）：按面调用 —— 每次只把「该面槽位 + 该面客户行」交给 AI，',
'  // side 由 zySplitCustomerLines 本地确定性判定（不交给模型）。',
'  // 真机 46q 定位：单次调用同时给两面时，Qwen2.5-7B 确定性整面跳过反面（3/3 轮 back 槽 0 匹配）；',
'  // 分面调用后 front 4/4 + back 3/3 = 7/7 全中。两层协议：AI 拆块(customerBlocks) → 按 blockId 匹配；',
'  // customerText 由本地从 blockId 回填，模型不直接决定写入画布的文字。',
'  async function aiTemplateSlotMatch(rawText) {',
'    if (!String(rawText || "").trim()) { setStatus("请先粘贴客户文字。"); return; }',
'    const config = getConfig();',
'    if (!config.apiKey) { runLocalRulePreview(rawText, "no-key"); return; }',
'    const raw = String(rawText || "");',
'    setBusy(true);',
'    try {',
'      setStatus("正在读取正反面图层…");',
'      const invAll = await bridgeCall("getTextInventoryAll", 2500).catch(function () { return null; });',
'      const snapshot = { front: (invAll && invAll.front) || null, back: (invAll && invAll.back) || null };',
'      const frontItems = snapshot.front && Array.isArray(snapshot.front.items) ? snapshot.front.items : [];',
'      const backItems = snapshot.back && Array.isArray(snapshot.back.items) ? snapshot.back.items : [];',
'      const total = frontItems.length + backItems.length;',
'      if (!total) { setStatus("已读取：正面 0 / 反面 0（画布无文字图层），无需匹配。"); return; }',
'',
'      const merged = [];',
'      const reports = [];',
'      const sideErrors = [];',
'      const SIDES = ["front", "back"];',
'      for (let si = 0; si < SIDES.length; si += 1) {',
'        const sd = SIDES[si];',
'        const sec = snapshot[sd];',
'        const items = (sec && Array.isArray(sec.items)) ? sec.items : [];',
'        if (!sec || !sec.exists || !items.length) continue;',
'        const rows = zySideLines(raw, sd);',
'        const label = (sd === "front" ? "正面" : "反面");',
'        if (!rows.length) { reports.push({ side: sd, slots: items.length, rows: 0, matched: 0, verified: 0, uncertain: 0, unmatched: 0, unaccounted: 0, skipped: "无该面客户内容" }); continue; }',
'        // 逐面异常隔离：某一面失败不得丢弃另一面已得结果',
'        try {',
'          setStatus("AI 匹配中（" + label + " " + items.length + " 槽 / " + rows.length + " 行）…");',
'          const result = await aiRequest({',
'            url: buildChatUrl(config.baseUrl),',
'            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + config.apiKey },',
'            data: JSON.stringify({',
'              model: config.model,',
'              temperature: 0,',
'              response_format: { type: "json_object" },',
'              messages: zyBuildTemplateMatchMessages({ side: sd, section: sec, customerRawText: raw })',
'            }),',
'            timeout: 45000,',
'            operation: "aiSlotMatch"',
'          });',
'          if (!result.ok) throwAiError(result);',
'          const content = result.body && result.body.choices && result.body.choices[0] && result.body.choices[0].message && result.body.choices[0].message.content;',
'          const ext = zyExtractPlanJson(content || "");',
'          if (!ext || !ext.ok) throw new Error(ext && ext.error ? ext.error : "AI 未返回有效 JSON");',
'          const norm = zyNormalizePlanShape(ext.plan);',
'          const sideSnap = {}; sideSnap[sd] = sec;',
'          const ref = zyValidateTemplateMatchPlan({ plan: norm, snapshot: sideSnap, rawText: raw, minConfidence: 0.5, typeDetector: zyDetectType, expectSide: sd });',
'          reports.push({ side: sd, slots: items.length, rows: rows.length, matched: ref.matches.length, verified: ref.summary.semanticallyVerified, uncertain: ref.summary.uncertain, unmatched: ref.summary.unmatched, unaccounted: ref.summary.unaccounted, errors: ref.errors.length });',
'          if (ref.errors.length) sideErrors.push(label + "：" + ref.errors.slice(0, 3).join("; "));',
'          (ref.matches || []).forEach(function (m) { merged.push(m); });',
'        } catch (eSide) {',
'          sideErrors.push(label + " AI 调用失败：" + String(eSide && eSide.message ? eSide.message : eSide).slice(0, 60));',
'          reports.push({ side: sd, slots: items.length, rows: rows.length, matched: 0, verified: 0, uncertain: 0, unmatched: 0, unaccounted: 0, failed: true });',
'        }',
'      }',
'',
'      const ordered = zyMergeSideMatches([merged]);',
'      const verifiedN = ordered.filter(function (m) { return m.semanticVerified === true; }).length;',
'      const sum = function (k) { return reports.reduce(function (a, r) { return a + (r[k] || 0); }, 0); };',
'      const uncertainN = sum("uncertain");',
'      const unmatchedN = sum("unmatched");',
'      const unaccountedN = sum("unaccounted");',
'',
'      const lines = [',
'        "AI 槽位匹配完成（预览，未修改画布）：",',
'        "匹配 " + ordered.length + "/" + total + " 槽（语义校验 " + verifiedN + "）" + (uncertainN ? "；不确定 " + uncertainN + " 项" : "") + "；未匹配 " + unmatchedN + " 项"',
'      ];',
'      reports.forEach(function (r) {',
'        const tag = (r.side === "back" ? "[反] " : "[正] ");',
'        lines.push(tag + "槽 " + r.slots + " / 行 " + r.rows + " → 匹配 " + r.matched + (r.failed ? "（调用失败）" : (r.skipped ? "（" + r.skipped + "）" : "")));',
'      });',
'      ordered.slice(0, 8).forEach(function (m) { lines.push((m.side === "back" ? "[反] " : "") + m.slotId + " ← " + String(m.customerText).slice(0, 30)); });',
'      if (unaccountedN) lines.push("⚠ 有 " + unaccountedN + " 条客户内容未被 AI 交代（已显式列为未匹配）");',
'      if (sideErrors.length) lines.push("校验拦截 " + sideErrors.length + " 项（该项不执行）：" + sideErrors.slice(0, 2).join(" | "));',
'      setStatus(lines.join("\\n"));',
'',
'      const cmdPlan = zyBuildApplyCommandPlan({ snapshot: snapshot, matches: ordered });',
'      const snapHash = (invAll && invAll.snapshotHash) || null;',
'      const v2PageId = (invAll && invAll.page && invAll.page.pageId) || null;',
'      if (cmdPlan.ok && cmdPlan.commands.length && snapHash && v2PageId) {',
'        lastAiMatch = {',
'          ok: true, commands: cmdPlan.commands.slice(), planHash: snapHash, pageId: v2PageId,',
'          sideCounts: { front: frontItems.length, back: backItems.length }, total: total,',
'          ref: { matches: ordered, summary: { matched: ordered.length, semanticallyVerified: verifiedN, uncertain: uncertainN, unmatched: unmatchedN } },',
'          ts: Date.now()',
'        };',
'      } else {',
'        lastAiMatch = null;',
'      }',
'      refreshMatchBlock();',
'    } catch (e) {',
'      try { runLocalRulePreview(rawText, "ai-fail-" + String(e && e.message ? e.message : e).slice(0, 40)); } catch (e2) { setStatus("AI 槽位匹配失败且本地规则回退异常：" + String(e2 && e2.message ? e2.message : e2) + "（未自动修改模板）"); }',
'    } finally {',
'      setBusy(false);',
'    }',
'  }'
].join(nl);

const fnRe = /  async function aiTemplateSlotMatch\(rawText\) \{[\s\S]*?\r?\n  \}\r?\n  function contentApplyFromPanel\(\)/;
if (!fnRe.test(src)) { console.error("FATAL: aiTemplateSlotMatch 锚点未命中"); process.exit(1); }
const before = src.length;
src = src.replace(fnRe, NEW_FN + nl + "  function contentApplyFromPanel()");

// refreshMatchBlock 摘要加语义校验
const oldSummary = '    summaryEl.textContent = "匹配结果（预览，未修改画布）：正面 " + fM + "/" + f + (b > 0 ? " / 反面 " + bM + "/" + b : "") + "｜未匹配 " + (sm.unmatched != null ? sm.unmatched : 0) + " ｜不确定 " + (sm.uncertain != null ? sm.uncertain : 0);';
const newSummary = '    const semN = (sm.semanticallyVerified != null) ? sm.semanticallyVerified : 0;\n    summaryEl.textContent = "匹配结果（预览，未修改画布）：正面 " + fM + "/" + f + (b > 0 ? " / 反面 " + bM + "/" + b : "") + "（语义校验 " + semN + "）｜未匹配 " + (sm.unmatched != null ? sm.unmatched : 0) + " ｜不确定 " + (sm.uncertain != null ? sm.uncertain : 0);';
if (src.indexOf(oldSummary) < 0) { console.error("FATAL: refreshMatchBlock 锚点未命中"); process.exit(1); }
src = src.replace(oldSummary, newSummary);

fs.writeFileSync(US, src, "utf8");
console.log("patched " + US + " delta=" + (src.length - before));
