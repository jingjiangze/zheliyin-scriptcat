// M5 模板 Fit 引擎：纯模块 + page-bridge 接线（templateApplyV2，默认开启）+ 注入 page 世界 + @require + 单测
// repo 在 D:\zheliyin-scriptcat（非工作目录），故以本脚本（工作目录内）改写
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = "D:/zheliyin-scriptcat";
const US = path.join(ROOT, "zheliyin-card-assistant.user.js");
const PB = path.join(ROOT, "extension", "src", "editor", "page-bridge.js");
const MOD = path.join(ROOT, "extension", "src", "editor", "template-text-fit.js");
const TEST = path.join(ROOT, "runtime", "stage11", "template-text-fit.test.js");

function readNorm(F) { const raw = fs.readFileSync(F, "utf8"); const crlf = raw.indexOf("\r\n") >= 0; return { crlf: crlf, src: crlf ? raw.split("\r\n").join("\n") : raw }; }
function writeNorm(F, src, crlf) { fs.writeFileSync(F, crlf ? src.split("\n").join("\r\n") : src, "utf8"); }
function replaceOnce(src, anchor, replacement, label) {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error("ANCHOR MISS [" + label + "]");
  if (src.indexOf(anchor, i + 1) >= 0) throw new Error("ANCHOR NOT UNIQUE [" + label + "]");
  return src.slice(0, i) + replacement + src.slice(i + anchor.length);
}
const norm = (F) => fs.readFileSync(F, "utf8").split("\r\n").join("\n");

// ---------- A) 纯模块 ----------
fs.writeFileSync(MOD, norm(path.join(__dirname, "m5-fit.txt")), "utf8");
console.log("  wrote extension/src/editor/template-text-fit.js");

// ---------- B/C) page-bridge 接线 ----------
{
  const got = readNorm(PB);
  let src = got.src;
  // B) templateApplyV2 执行循环：加入 Fit（默认开启，只写 fontSize）
  const B = [
    "          const applied = [];",
    "          group.forEach(function (g) {",
    "            try {",
    "              const so = objs[g.slotIdx];",
    "              if (!so) return;",
    "              const text = String(g.customerText != null ? g.customerText : \"\");",
    "              setObjectText(so, text); // 只改内容，几何/字体/样式/身份/层序冻结",
    "              if (typeof so.setCoords === \"function\") so.setCoords();",
    "              syncBusinessFieldsFromObject(so);",
    "              applied.push({ side: sd, version: v2Version, slotId: g.slotId, slotIdx: g.slotIdx, objectUuid: so.uuid || so.multiUuid || null, text: String(text).slice(0, 24) });",
    "            } catch (eT) { v2AnyFail = true; v2Fails.push(sd + \":\" + g.slotId + \":\" + String(eT && eT.message || eT).slice(0, 80)); }",
    "          });",
    "          if (u2 && typeof u2.save === \"function\") { try { u2.save(); } catch (eU2) {} }",
    "          if (cvs.requestRenderAll) cvs.requestRenderAll();",
    "          else if (cvs.renderAll) cvs.renderAll();",
    "          v2Groups.push({ side: sd, version: v2Version, ok: true, count: applied.length, applied: applied });"
  ].join("\n");
  const B2 = [
    "          const applied = [];",
    "          // M5 模板 Fit（默认开启）：以「槽位原足迹宽」为目标真实测量客户文本，必要时缩小字号；只写 fontSize。",
    "          const v2Measurer = zyMakeCanvasMeasurerFor(cvs);",
    "          const v2FitFn = (typeof zyFitFontSize === \"function\") ? zyFitFontSize : null;",
    "          const fitEvidence = [];",
    "          group.forEach(function (g) {",
    "            try {",
    "              const so = objs[g.slotIdx];",
    "              if (!so) return;",
    "              const text = String(g.customerText != null ? g.customerText : \"\");",
    "              const fsFrom = (typeof so.fontSize === \"number\") ? so.fontSize : null;",
    "              const fsTarget = (typeof so.width === \"number\" && isFinite(so.width) && so.width > 0) ? so.width : null;",
    "              setObjectText(so, text); // 只改内容，几何/字体/样式/身份/层序冻结",
    "              if (typeof so.setCoords === \"function\") so.setCoords();",
    "              syncBusinessFieldsFromObject(so);",
    "              let fsTo = fsFrom, fit = null;",
    "              if (v2FitFn && v2Measurer && fsTarget != null && fsFrom != null) {",
    "                fit = v2FitFn({ text: text, targetWidth: fsTarget, fontFamily: so.fontFamily || \"sans-serif\", baseFontSize: fsFrom, measurer: v2Measurer });",
    "                if (fit && fit.ok && typeof fit.fontSize === \"number\" && fit.fontSize !== fsFrom) {",
    "                  try { so.set(\"fontSize\", fit.fontSize); if (typeof so.setCoords === \"function\") so.setCoords(); syncBusinessFieldsFromObject(so); fsTo = fit.fontSize; } catch (eF) { fsTo = fsFrom; }",
    "                }",
    "              }",
    "              fitEvidence.push({ side: sd, version: v2Version, slotId: g.slotId, slotIdx: g.slotIdx, from: fsFrom, to: fsTo, reason: fit ? fit.reason : \"SKIPPED\", overflow: !!(fit && fit.overflow), measured: fit ? fit.measured : null });",
    "              applied.push({ side: sd, version: v2Version, slotId: g.slotId, slotIdx: g.slotIdx, objectUuid: so.uuid || so.multiUuid || null, text: String(text).slice(0, 24), fontSizeFrom: fsFrom, fontSizeTo: fsTo });",
    "            } catch (eT) { v2AnyFail = true; v2Fails.push(sd + \":\" + g.slotId + \":\" + String(eT && eT.message || eT).slice(0, 80)); }",
    "          });",
    "          if (u2 && typeof u2.save === \"function\") { try { u2.save(); } catch (eU2) {} }",
    "          if (cvs.requestRenderAll) cvs.requestRenderAll();",
    "          else if (cvs.renderAll) cvs.renderAll();",
    "          v2Groups.push({ side: sd, version: v2Version, ok: true, count: applied.length, applied: applied, fontSizeEvidence: fitEvidence });"
  ].join("\n");
  src = replaceOnce(src, B, B2, "B/v2-loop");

  // C) 聚合 + 回执携带 fontSizeEvidence
  const C = [
    "        const v2AppliedAll = [];",
    "        v2Groups.forEach(function (g) { v2AppliedAll.push.apply(v2AppliedAll, g.applied || []); });"
  ].join("\n");
  const C2 = [
    "        const v2AppliedAll = [];",
    "        const v2FitAll = [];",
    "        v2Groups.forEach(function (g) { v2AppliedAll.push.apply(v2AppliedAll, g.applied || []); v2FitAll.push.apply(v2FitAll, g.fontSizeEvidence || []); });"
  ].join("\n");
  src = replaceOnce(src, C, C2, "C/aggregate");

  const D = "post(\"templateApplyV2Result\", { ok: !v2AnyFail, code: v2BlockedOnly ? \"SLOT_STATE_CHANGED\" : (v2AnyFail ? \"PARTIAL\" : \"OK\"), applied: v2AppliedAll, sides: v2Groups, message: v2AnyFail ? (v2BlockedOnly ? \"画布文字层与 AI 槽位应用指令不一致（可能已编辑），已停止。\" : \"AI 槽位应用部分失败（\" + v2Fails.join(\" / \") + \"）。\") : \"AI 槽位应用完成：更新 \" + v2AppliedAll.length + \" 槽（几何/字体/样式/身份/层序冻结，只改文字）。\" });";
  const D2 = "post(\"templateApplyV2Result\", { ok: !v2AnyFail, code: v2BlockedOnly ? \"SLOT_STATE_CHANGED\" : (v2AnyFail ? \"PARTIAL\" : \"OK\"), applied: v2AppliedAll, sides: v2Groups, fontSizeEvidence: v2FitAll, message: v2AnyFail ? (v2BlockedOnly ? \"画布文字层与 AI 槽位应用指令不一致（可能已编辑），已停止。\" : \"AI 槽位应用部分失败（\" + v2Fails.join(\" / \") + \"）。\") : \"AI 槽位应用完成：更新 \" + v2AppliedAll.length + \" 槽（几何/样式/身份/层序冻结；文字 + 必要时字号自适应，默认开启）。\" });";
  src = replaceOnce(src, D, D2, "D/post");

  writeNorm(PB, src, got.crlf);
  const chk = fs.readFileSync(PB, "utf8");
  const cnt = (s) => (chk.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
  console.log("  patched page-bridge.js");
  console.log("    zyFitFontSize=" + cnt("zyFitFontSize") + " v2Measurer=" + cnt("v2Measurer") + " fitEvidence=" + cnt("fitEvidence") + " fontSizeEvidence=" + cnt("fontSizeEvidence"));
}

// ---------- D/E) userscript：注入 page 世界 + @require ----------
{
  const got = readNorm(US);
  let src = got.src;
  const inj = [
    "    if (pageBridgeInstalled) return;",
    "    const script = document.createElement(\"script\");",
    "    script.id = \"zy-card-assistant-page-bridge\";",
    "    script.textContent = \"(\" + pageBridge.toString() + \")();\";"
  ].join("\n");
  const inj2 = [
    "    if (pageBridgeInstalled) return;",
    "    const script = document.createElement(\"script\");",
    "    script.id = \"zy-card-assistant-page-bridge\";",
    "    // M5 模板 Fit 引擎：page 世界无 @require 作用域，故连带注入纯函数源码（单一来源 = template-text-fit.js）",
    "    const zyFitSrc = (typeof zyFitFontSize === \"function\" && typeof zyFitMatches === \"function\")",
    "      ? \"var zyFitFontSize = \" + zyFitFontSize.toString() + \";\\nvar zyFitMatches = \" + zyFitMatches.toString() + \";\\n\"",
    "      : \"\";",
    "    script.textContent = zyFitSrc + \"(\" + pageBridge.toString() + \")();\";"
  ].join("\n");
  src = replaceOnce(src, inj, inj2, "E/inject");

  const rm = src.match(/^\/\/ @require\s+(\S*template-apply-v2\.js\S*)$/m);
  if (!rm) throw new Error("ANCHOR MISS [F/require-ref]");
  const newUrl = rm[1].replace("template-apply-v2.js", "template-text-fit.js");
  if (src.indexOf(newUrl) >= 0) throw new Error("F/require already present");
  src = src.replace(rm[0], rm[0] + "\n// @require       " + newUrl);

  writeNorm(US, src, got.crlf);
  const chk = fs.readFileSync(US, "utf8");
  const cnt = (s) => (chk.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
  console.log("  patched userscript.js");
  console.log("    zyFitSrc=" + cnt("zyFitSrc") + " requireFit=" + cnt("template-text-fit.js") + " requires=" + (chk.match(/^\/\/ @require\s+\S+/gm) || []).length);
}

// ---------- F) 单测 ----------
fs.mkdirSync(path.dirname(TEST), { recursive: true });
fs.writeFileSync(TEST, norm(path.join(__dirname, "m5-test.txt")), "utf8");
console.log("  wrote runtime/stage11/template-text-fit.test.js");
console.log("M5 patch applied.");
