// P0-X 收尾：46h 现代化到「预览→确认套版」新契约（templateApplySmart 已无 UI 入口）
// 1) waitApplyDone 升级为驱动：识别预览消息后自动点 #zy-apply-confirm，并接受新完成文案
// 2) 状态计数断言放宽为 (正面更新|更新) N 槽，且仅在 expectApplied>0 时强制
// 3) 字号下界按 M5 契约放宽为 [8,160]
// 4) 头部加 SUPERSEDED 说明
"use strict";
const fs = require("fs");
const path = require("path");
const F = "D:/zheliyin-scriptcat/runtime/stage9/commit-46h-content-similar-real.js";

function readNorm(p) { const raw = fs.readFileSync(p, "utf8"); const crlf = raw.indexOf("\r\n") >= 0; return { crlf: crlf, src: crlf ? raw.split("\r\n").join("\n") : raw }; }
function writeNorm(p, src, crlf) { fs.writeFileSync(p, crlf ? src.split("\n").join("\r\n") : src, "utf8"); }
function replaceOnce(src, anchor, replacement, label) {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error("ANCHOR MISS [" + label + "]");
  if (src.indexOf(anchor, i + 1) >= 0) throw new Error("ANCHOR NOT UNIQUE [" + label + "]");
  return src.slice(0, i) + replacement + src.slice(i + anchor.length);
}

const got = readNorm(F);
let src = got.src;

// 1) waitApplyDone → 驱动式（预览→确认）
const OLD_WAIT = [
  "    const waitApplyDone = async (timeoutMs) => {",
  "      const t0 = Date.now();",
  "      const samples = [];",
  "      while (Date.now() - t0 < timeoutMs) {",
  "        const r = await page.evaluate(() => {",
  "          const el = document.querySelector(\"#zy-native-status\") || document.querySelector(\"#zy-status\") || document.querySelector(\".zy-status\");",
  "          return { st: el ? String(el.textContent || \"\").trim().slice(0, 300) : null };",
  "        }).catch(() => ({}));",
  "        const st = r && r.st;",
  "        if (st) samples.push(String(st).slice(0, 300));",
  "        if (st && /智能套版：正面更新 \\d+ 槽|智能套版完成|智能套版失败|请先粘贴客户文字/.test(st)) return { done: true, st, samples };",
  "        await SLEEP(900);",
  "      }",
  "      return { done: false, samples };",
  "    };"
].join("\n");
const NEW_WAIT = [
  "    // P0-X（2026-09-25）：新契约驱动 —— 「一键智能填充」现为 AI 槽位匹配【预览】，需再点「确认套版」才改画布；",
  "    // 故本等待器同时承担驱动职责（识别预览文案后自动点 #zy-apply-confirm），并接受新旧两种完成文案。",
  "    const waitApplyDone = async (timeoutMs) => {",
  "      const t0 = Date.now();",
  "      const samples = [];",
  "      let confirmed = false;",
  "      while (Date.now() - t0 < timeoutMs) {",
  "        const r = await page.evaluate(() => {",
  "          const el = document.querySelector(\"#zy-native-status\") || document.querySelector(\"#zy-status\") || document.querySelector(\".zy-status\");",
  "          const cf = document.querySelector(\"#zy-apply-confirm\");",
  "          return { st: el ? String(el.textContent || \"\").trim().slice(0, 300) : null, confirmReady: !!(cf && cf.offsetParent) };",
  "        }).catch(() => ({}));",
  "        const st = r && r.st;",
  "        if (st) samples.push(String(st).slice(0, 300));",
  "        if (st && /AI 槽位匹配完成（预览，未修改画布）/.test(st) && !confirmed && r && r.confirmReady) {",
  "          const c = await page.evaluate(() => { const b = document.querySelector(\"#zy-apply-confirm\"); if (b && b.offsetParent) { try { b.click(); return true; } catch (e) {} } return false; }).catch(() => false);",
  "          if (c) { confirmed = true; samples.push(\"[drive] clicked #zy-apply-confirm\"); }",
  "        }",
  "        if (st && /正面更新 \\d+ 槽|智能套版完成|智能套版失败|请先粘贴客户文字|AI 填充完成：更新 \\d+ 槽|没有可填槽位|无匹配/.test(st)) return { done: true, st, samples, confirmed };",
  "        await SLEEP(900);",
  "      }",
  "      return { done: false, samples, confirmed };",
  "    };"
].join("\n");
src = replaceOnce(src, OLD_WAIT, NEW_WAIT, "1/wait-driver");

// 2) 状态计数断言：接受新契约文案；仅 expectApplied>0 强制
src = replaceOnce(src,
  [
    "          // applied 数以状态消息「正面更新 X 槽」为准（内容相同也算已套版）",
    "          const appliedReg = new RegExp(\"正面更新 \" + def.expectApplied + \" 槽\");",
    "          if (def.expectApplied >= 0 && !(runRec.status && appliedReg.test(runRec.status))) fails.push(\"STATUS_APPLIED \" + def.expectApplied + \" 不符：\" + String(runRec.status || \"\").slice(0, 60));"
  ].join("\n"),
  [
    "          // P0-X：applied 数以状态文案为准，兼容旧「正面更新 N 槽」与新「AI 填充完成：更新 N 槽」；",
    "          // 仅在 expectApplied>0 时强制（expectApplied=0 用例以画布断言为准，避免文案差异误报）。",
    "          const appliedReg = new RegExp(\"(正面更新|更新) \" + def.expectApplied + \" 槽\");",
    "          if (def.expectApplied > 0 && !(runRec.status && appliedReg.test(runRec.status))) fails.push(\"STATUS_APPLIED \" + def.expectApplied + \" 不符：\" + String(runRec.status || \"\").slice(0, 60));",
    "          if (def.expectApplied > 0) runRec.statusConfirmed = !!(runRec.confirmed);"
  ].join("\n"),
  "2/status-gate");

// 3) 字号下界放宽到 M5 契约
src = replaceOnce(src,
  "            if (!(it.fontSize >= 10 && it.fontSize <= 160)) fails.push(\"FONT_SIZE@\" + i + \" 越界 \" + it.fontSize);",
  "            if (!(it.fontSize >= 8 && it.fontSize <= 160)) fails.push(\"FONT_SIZE@\" + i + \" 越界 \" + it.fontSize); // P0-X：下界按 M5 契约（min=max(8,0.6*base)）放宽",
  "3/font-bound");

// 4) 头部 SUPERSEDED 说明
src = replaceOnce(src,
  "//      粘贴原文（含无格式电话\"13800138000\"）→ 点真实 #zy-smart-fill → 内容相似套版：",
  [
    "// P0-X（2026-09-25）SUPERSEDED 说明：",
    "//   「一键智能填充」(#zy-smart-fill) 自 M2/M4 起已改为 AI 槽位匹配【预览】→「确认套版」(#zy-apply-confirm)，",
    "//   原 templateApplySmart 协议（内容相似）已无 UI 入口 → 本 runner 已现代化到新契约（预览→确认套版）驱动，",
    "//   断言核心（原文逐字 / 不新建 / lineHeight·charSpacing 冻结）保留；46t/46v/46n 覆盖同一新契约。",
    "//      粘贴原文（含无格式电话\"13800138000\"）→ 点真实 #zy-smart-fill → 内容相似套版："
  ].join("\n"),
  "4/header-note");

writeNorm(F, src, got.crlf);
const chk = fs.readFileSync(F, "utf8");
const cnt = (s) => (chk.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
console.log("patched commit-46h");
console.log("  driver=" + cnt("[drive] clicked") + " confirmHook=" + cnt("zy-apply-confirm") + " newGate=" + cnt("(正面更新|更新)") + " fontBound8=" + cnt("it.fontSize >= 8") + " supersededNote=" + cnt("SUPERSEDED"));
