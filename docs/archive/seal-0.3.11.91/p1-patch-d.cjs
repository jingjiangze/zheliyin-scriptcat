// P1 补丁 D：userscript 接线 —— 版元信息透传（expectVersion / snapshot.version / 状态版标识 / lastAiMatch.version）
"use strict";
const fs = require("fs");
const US = "D:\\zheliyin-scriptcat\\zheliyin-card-assistant.user.js";
const raw = fs.readFileSync(US, "utf8");
const crlf = raw.indexOf("\r\n") >= 0;
let src = crlf ? raw.split("\r\n").join("\n") : raw;
function must(oldStr, newStr, label) {
  const i = src.indexOf(oldStr);
  if (i < 0) throw new Error("ANCHOR MISS: " + label);
  if (src.indexOf(oldStr, i + 1) >= 0) throw new Error("ANCHOR NOT UNIQUE: " + label);
  src = src.slice(0, i) + newStr + src.slice(i + oldStr.length);
  console.log("  ok " + label);
}

// ---- 1) runLocalRulePreview：版元信息 ----
must(`      const invAll = await bridgeCall("getTextInventoryAll", 2500).catch(function () { return null; });
      const snapshot = { front: (invAll && invAll.front) || null, back: (invAll && invAll.back) || null };
      const frontItems = snapshot.front && Array.isArray(snapshot.front.items) ? snapshot.front.items : [];
      const backItems = snapshot.back && Array.isArray(snapshot.back.items) ? snapshot.back.items : [];
      if (!frontItems.length && !backItems.length) { setStatus("已读取：正面 0 / 反面 0（画布无文字图层），无需匹配。"); return; }`,
`      const invAll = await bridgeCall("getTextInventoryAll", 2500).catch(function () { return null; });
      // P1 多版：版元信息（默认读取当前版；versionCount>1 显示版标识）
      const vMetaL = (invAll && typeof invAll.version === "number") ? invAll.version : 0;
      const vCountL = (invAll && typeof invAll.versionCount === "number") ? invAll.versionCount : 1;
      const vTagL = vCountL > 1 ? ("[第" + (vMetaL + 1) + "版] ") : "";
      const snapshot = { front: (invAll && invAll.front) || null, back: (invAll && invAll.back) || null, version: vMetaL, versionCount: vCountL, multi: !!(invAll && invAll.multi) };
      const frontItems = snapshot.front && Array.isArray(snapshot.front.items) ? snapshot.front.items : [];
      const backItems = snapshot.back && Array.isArray(snapshot.back.items) ? snapshot.back.items : [];
      if (!frontItems.length && !backItems.length) { setStatus(vTagL + "已读取：正面 0 / 反面 0（画布无文字图层），无需匹配。"); return; }`,
  "runLocalRulePreview version meta");

must(`        lastAiMatch = { ok: true, commands: cmdPlan.commands.slice(), planHash: snapHash, pageId: v2PageId, sideCounts: { front: frontItems.length, back: backItems.length }, total: frontItems.length + backItems.length, ref: { matches: localMatches, summary: { matched: localMatches.length, uncertain: 0, unmatched: 0 } }, localRule: true, ts: Date.now() };
        const lines = [
          "AI 槽位匹配不可用（" + why + "），已改用本地规则库匹配（预览，未修改画布）：",`,
`        lastAiMatch = { ok: true, commands: cmdPlan.commands.slice(), planHash: snapHash, pageId: v2PageId, version: vMetaL, versionCount: vCountL, sideCounts: { front: frontItems.length, back: backItems.length }, total: frontItems.length + backItems.length, ref: { matches: localMatches, summary: { matched: localMatches.length, uncertain: 0, unmatched: 0 } }, localRule: true, ts: Date.now() };
        const lines = [
          vTagL + "AI 槽位匹配不可用（" + why + "），已改用本地规则库匹配（预览，未修改画布）：",`,
  "runLocalRulePreview lastAiMatch version");

// ---- 2) aiTemplateSlotMatch：版元信息 + expectVersion + 状态 ----
must(`      setStatus("正在读取正反面图层…");
      const invAll = await bridgeCall("getTextInventoryAll", 2500).catch(function () { return null; });
      const snapshot = { front: (invAll && invAll.front) || null, back: (invAll && invAll.back) || null };
      const frontItems = snapshot.front && Array.isArray(snapshot.front.items) ? snapshot.front.items : [];
      const backItems = snapshot.back && Array.isArray(snapshot.back.items) ? snapshot.back.items : [];
      const total = frontItems.length + backItems.length;
      if (!total) { setStatus("已读取：正面 0 / 反面 0（画布无文字图层），无需匹配。"); return; }`,
`      setStatus("正在读取正反面图层…");
      const invAll = await bridgeCall("getTextInventoryAll", 2500).catch(function () { return null; });
      // P1 多版：默认只作用于「当前版」（切版后重新读取即跟随）；versionCount>1 时状态与预览块显示版标识
      const vMeta = (invAll && typeof invAll.version === "number") ? invAll.version : 0;
      const vCount = (invAll && typeof invAll.versionCount === "number") ? invAll.versionCount : 1;
      const vTag = vCount > 1 ? ("[第" + (vMeta + 1) + "版] ") : "";
      const snapshot = { front: (invAll && invAll.front) || null, back: (invAll && invAll.back) || null, version: vMeta, versionCount: vCount, multi: !!(invAll && invAll.multi) };
      const frontItems = snapshot.front && Array.isArray(snapshot.front.items) ? snapshot.front.items : [];
      const backItems = snapshot.back && Array.isArray(snapshot.back.items) ? snapshot.back.items : [];
      const total = frontItems.length + backItems.length;
      if (!total) { setStatus(vTag + "已读取：正面 0 / 反面 0（画布无文字图层），无需匹配。"); return; }`,
  "aiTemplateSlotMatch version meta");

must(`          const norm = zyNormalizePlanShape(ext.plan);
          const sideSnap = {}; sideSnap[sd] = sec;
          const ref = zyValidateTemplateMatchPlan({ plan: norm, snapshot: sideSnap, rawText: raw, minConfidence: 0.5, typeDetector: zyDetectType, expectSide: sd });`,
`          const norm = zyNormalizePlanShape(ext.plan);
          const sideSnap = { version: vMeta, versionCount: vCount }; sideSnap[sd] = sec;
          const ref = zyValidateTemplateMatchPlan({ plan: norm, snapshot: sideSnap, rawText: raw, minConfidence: 0.5, typeDetector: zyDetectType, expectSide: sd, expectVersion: vMeta });`,
  "expectVersion in validator call");

must(`      const lines = [
        "AI 槽位匹配完成（预览，未修改画布）：匹配 " + ordered.length + "/" + total + " 槽（语义校验 " + verifiedN + "）" + (uncertainN ? "；不确定 " + uncertainN + " 项" : "") + "；未匹配 " + unmatchedN + " 项"
      ];`,
`      const lines = [
        vTag + "AI 槽位匹配完成（预览，未修改画布）：匹配 " + ordered.length + "/" + total + " 槽（语义校验 " + verifiedN + "）" + (uncertainN ? "；不确定 " + uncertainN + " 项" : "") + "；未匹配 " + unmatchedN + " 项"
      ];`,
  "status vTag");

must(`        lastAiMatch = {
          ok: true, commands: cmdPlan.commands.slice(), planHash: snapHash, pageId: v2PageId,
          sideCounts: { front: frontItems.length, back: backItems.length }, total: total,`,
`        lastAiMatch = {
          ok: true, commands: cmdPlan.commands.slice(), planHash: snapHash, pageId: v2PageId,
          version: vMeta, versionCount: vCount,
          sideCounts: { front: frontItems.length, back: backItems.length }, total: total,`,
  "lastAiMatch version");

// ---- 3) refreshMatchBlock：显示版 + 确认按钮提示 ----
must(`    summaryEl.textContent = "匹配结果（预览，未修改画布）：正面 " + fM + "/" + f + (b > 0 ? " / 反面 " + bM + "/" + b : "") + "（语义校验 " + semN + "）｜未匹配 " + (sm.unmatched != null ? sm.unmatched : 0) + " ｜不确定 " + (sm.uncertain != null ? sm.uncertain : 0);`,
`    const vTagR = (lastAiMatch && lastAiMatch.versionCount > 1) ? ("第" + ((lastAiMatch.version || 0) + 1) + "版 ｜ ") : "";
    summaryEl.textContent = vTagR + "匹配结果（预览，未修改画布）：正面 " + fM + "/" + f + (b > 0 ? " / 反面 " + bM + "/" + b : "") + "（语义校验 " + semN + "）｜未匹配 " + (sm.unmatched != null ? sm.unmatched : 0) + " ｜不确定 " + (sm.uncertain != null ? sm.uncertain : 0);`,
  "refreshMatchBlock vTag");

// ---- 4) confirmTemplateApply：被拦截时提示版本信息（保持既有成功文案不变，避免破坏既有断言）----
must(`        const errCode = (r && r.code) || "NO_REPLY";
        setStatus("AI 填充被拦截（" + errCode + "）：快照已变化或画面不一致，请重新「一键智能填充」后再确认。");`,
`        const errCode = (r && r.code) || "NO_REPLY";
        const errHint = (errCode === "VERSION_MISMATCH")
          ? "指令版本与当前版不一致（可能已切换多版），请重新「一键智能填充」后再确认。"
          : "快照已变化或画面不一致，请重新「一键智能填充」后再确认。";
        setStatus("AI 填充被拦截（" + errCode + "）：" + errHint);`,
  "confirmTemplateApply version hint");

fs.writeFileSync(US, crlf ? src.split("\n").join("\r\n") : src, "utf8");
console.log("P1 patch D applied.");