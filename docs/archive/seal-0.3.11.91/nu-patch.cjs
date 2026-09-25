// UI 精简（用户指令 2026-09-24）：
//  ① 去掉诊断 UI（#zy-probe 按钮 + 绑定）
//  ② 「追加信息」原地改为「识别图片文字」（并删除下方重复的 OCR/诊断行）
//  ③ 复制行改为 [复制正反面][复制全部文字]（去掉 复制当前面 / 复制套版结构）
// 同步：zyBuildCopyText 新增 all 模式；46o/46p 两个 runner 断言更新
// repo 在 D:\zheliyin-scriptcat（非工作目录），故以本脚本（工作目录内）改写
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = "D:/zheliyin-scriptcat";
const US = path.join(ROOT, "zheliyin-card-assistant.user.js");
const R46O = path.join(ROOT, "runtime", "stage9", "commit-46o-copy-layer-modes-real.js");
const R46P = path.join(ROOT, "runtime", "stage9", "commit-46p-real-acceptance.js");

function readNorm(F) { const raw = fs.readFileSync(F, "utf8"); const crlf = raw.indexOf("\r\n") >= 0; return { crlf: crlf, src: crlf ? raw.split("\r\n").join("\n") : raw }; }
function writeNorm(F, src, crlf) { fs.writeFileSync(F, crlf ? src.split("\n").join("\r\n") : src, "utf8"); }
function replaceOnce(src, anchor, replacement, label) {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error("ANCHOR MISS [" + label + "]");
  if (src.indexOf(anchor, i + 1) >= 0) throw new Error("ANCHOR NOT UNIQUE [" + label + "]");
  return src.slice(0, i) + replacement + src.slice(i + anchor.length);
}

// ---------- A) userscript ----------
{
  const got = readNorm(US);
  let src = got.src;

  // A1) 追加信息 → 识别图片文字（原地）
  src = replaceOnce(src,
    '          <button class="zy-btn secondary" id="zy-append">追加信息</button>\n',
    '          <button class="zy-btn zy-ocr" id="zy-ocr-btn">识别图片文字</button>\n',
    "A1/append->ocr");

  // A2) 删除原 [识别图片文字][诊断] 整行
  src = replaceOnce(src,
    '        <div class="zy-actions">\n          <button class="zy-btn zy-ocr" id="zy-ocr-btn">识别图片文字</button>\n          <button class="zy-btn secondary" id="zy-probe" title="检测画布与桥接状态">诊断</button>\n        </div>\n',
    "",
    "A2/drop-probe-row");

  // A3) 复制行 → [复制正反面][复制全部文字]
  src = replaceOnce(src,
    '        <div class="zy-actions three">\n          <button class="zy-btn secondary" id="zy-copy-current" title="仅复制当前正/反面文字图层内容">复制当前面</button>\n          <button class="zy-btn secondary" id="zy-copy-both" title="复制正反面全部文字图层内容">复制正反面</button>\n          <button class="zy-btn secondary" id="zy-copy-template" title="复制模板套版结构（槽位/文本/几何/字号/颜色）">复制套版结构</button>\n        </div>\n',
    '        <div class="zy-actions two">\n          <button class="zy-btn secondary" id="zy-copy-both" title="复制正反面文字图层内容（带正反面标题）">复制正反面</button>\n          <button class="zy-btn secondary" id="zy-copy-all" title="复制正反面全部文字（纯文本逐行，不带标题）">复制全部文字</button>\n        </div>\n',
    "A3/copy-row");

  // A4) 删除 #zy-append 绑定
  src = replaceOnce(src,
    '    panel.querySelector("#zy-append").addEventListener("click", () => parseFields({ append: true, apply: false }));\n',
    "",
    "A4/drop-append-bind");

  // A5) 防御性绑定块：去 copy-current / probe；copy-template → copy-all("all")
  src = replaceOnce(src,
    [
      "    // P1 根因修复：模板曾移除 #zy-probe 按钮但绑定仍在 → querySelector null → TypeError → 后续绑定全部失效。",
      "    // 防御性绑定：单按钮缺失不再拖垮整块面板（优先绑定 OCR，诊断其次）。",
      "    const ocrBtn = panel.querySelector(\"#zy-ocr-btn\");",
      "    if (ocrBtn) ocrBtn.addEventListener(\"click\", handleOcrImage);",
      "    const copyCurBtn = panel.querySelector(\"#zy-copy-current\");",
      "    if (copyCurBtn) copyCurBtn.addEventListener(\"click\", function () { copyLayerTexts(\"current\"); });",
      "    const copyBothBtn = panel.querySelector(\"#zy-copy-both\");",
      "    if (copyBothBtn) copyBothBtn.addEventListener(\"click\", function () { copyLayerTexts(\"both\"); });",
      "    const copyTplBtn = panel.querySelector(\"#zy-copy-template\");",
      "    if (copyTplBtn) copyTplBtn.addEventListener(\"click\", function () { copyLayerTexts(\"template\"); });",
      "    const probeBtn = panel.querySelector(\"#zy-probe\");",
      "    if (probeBtn) probeBtn.addEventListener(\"click\", probeCanvas);"
    ].join("\n"),
    [
      "    // 防御性绑定：单按钮缺失不再拖垮整块面板（优先绑定 OCR）。",
      "    // 用户指令（2026-09-24）：去掉诊断 UI；复制行改为 [复制正反面][复制全部文字]。",
      "    const ocrBtn = panel.querySelector(\"#zy-ocr-btn\");",
      "    if (ocrBtn) ocrBtn.addEventListener(\"click\", handleOcrImage);",
      "    const copyBothBtn = panel.querySelector(\"#zy-copy-both\");",
      "    if (copyBothBtn) copyBothBtn.addEventListener(\"click\", function () { copyLayerTexts(\"both\"); });",
      "    const copyAllBtn = panel.querySelector(\"#zy-copy-all\");",
      "    if (copyAllBtn) copyAllBtn.addEventListener(\"click\", function () { copyLayerTexts(\"all\"); });"
    ].join("\n"),
    "A5/bind-block");

  // A6) zyBuildCopyText：新增 all 模式（正反面全部文字，纯文本逐行、不带标题）
  src = replaceOnce(src,
    '    if (mode === "template") {\n',
    [
      '    if (mode === "all") {',
      '      // 复制全部文字：正反面全部文字图层内容，纯文本逐行（不带标题、不做结构化字段）',
      '      const flat = [];',
      '      [frontItems, backItems].forEach(function (items) {',
      '        (Array.isArray(items) ? items : []).forEach(function (it) {',
      '          const t = String(it && it.text != null ? it.text : "").trim();',
      '          if (t) flat.push(t);',
      '        });',
      '      });',
      '      return flat.length ? flat.join("\\n") : null;',
      '    }',
      '    if (mode === "template") {',
      ''
    ].join("\n"),
    "A6/all-mode");

  // A7) 复制状态标签：all → 全部文字
  src = replaceOnce(src,
    '      const label = mode === "current" ? "当前面" : mode === "template" ? "套版结构" : "正反面";',
    '      const label = mode === "all" ? "全部文字" : mode === "current" ? "当前面" : mode === "template" ? "套版结构" : "正反面";',
    "A7/label");

  writeNorm(US, src, got.crlf);
  const chk = fs.readFileSync(US, "utf8");
  const cnt = (s) => (chk.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
  console.log("  patched userscript.js");
  console.log("    zy-append=" + cnt('id="zy-append"') + " zy-probe=" + cnt('id="zy-probe"') + " zy-copy-current=" + cnt('id="zy-copy-current"') + " zy-copy-template=" + cnt('id="zy-copy-template"') + " zy-copy-both=" + cnt('id="zy-copy-both"') + " zy-copy-all=" + cnt('id="zy-copy-all"') + " zy-ocr-btn=" + cnt('id="zy-ocr-btn"') + " modeAll=" + cnt('mode === "all"'));
}

// ---------- B) 46o runner ----------
{
  const got = readNorm(R46O);
  let src = got.src;
  src = replaceOnce(src,
    "// 目标（端到端）：注入 5 槽正面文字层 → 分别点真实 #zy-copy-current/#zy-copy-both/#zy-copy-template →",
    "// 目标（端到端）：注入 5 槽正面文字层 → 分别点真实 #zy-copy-both/#zy-copy-all →",
    "B1/header");
  src = replaceOnce(src,
    '  t("html-3btns", cc.indexOf(\'id="zy-copy-current"\') >= 0 && cc.indexOf(\'id="zy-copy-both"\') >= 0 && cc.indexOf(\'id="zy-copy-template"\') >= 0);',
    '  t("html-2btns", cc.indexOf(\'id="zy-copy-both"\') >= 0 && cc.indexOf(\'id="zy-copy-all"\') >= 0 && cc.indexOf(\'id="zy-copy-current"\') < 0 && cc.indexOf(\'id="zy-copy-template"\') < 0 && cc.indexOf(\'id="zy-probe"\') < 0 && cc.indexOf(\'id="zy-append"\') < 0);',
    "B2/selftest-btns");
  src = replaceOnce(src,
    '      const rec = { case: def.id, note: "复制三模式（current/both/template）拦截剪贴板断言 + 画布零变化", steps: [], errors: [], runs: [] };',
    '      const rec = { case: def.id, note: "复制两模式（both/all）拦截剪贴板断言 + 画布零变化", steps: [], errors: [], runs: [] };',
    "B3/note");
  src = replaceOnce(src,
    '        const has = await page.evaluate(() => !!document.querySelector("#zy-copy-current") && !!document.querySelector("#zy-copy-both") && !!document.querySelector("#zy-copy-template")).catch(() => false);',
    '        const has = await page.evaluate(() => !!document.querySelector("#zy-copy-both") && !!document.querySelector("#zy-copy-all") && !document.querySelector("#zy-copy-current") && !document.querySelector("#zy-copy-template") && !document.querySelector("#zy-probe") && !document.querySelector("#zy-append")).catch(() => false);',
    "B4/panel-ready");
  // 删除 ① 复制当前面 用例
  const case1 = [
    "        // ---- ① 复制当前面 ----",
    "        await page.evaluate(() => { try { window.__zyLastCopy = null; } catch (e) {} });",
    "        const cl1 = await clickById(\"#zy-copy-current\");",
    "        if (!(cl1 && cl1.clicked)) { rec.errors.push(\"CURRENT_BTN_NOT_FOUND\"); continue; }",
    "        const st1 = await waitStatusContains(\"已复制当前面\", 12000);",
    "        await SLEEP(600);",
    "        const cp1 = await readCopy();",
    "        rec.current = { clicked: !!(cl1 && cl1.clicked), done: !!st1.done, status: st1.done ? st1.st.slice(0, 120) : null, copied: cp1 ? String(cp1).slice(0, 300) : null, lines: cp1 ? String(cp1).split(\"\\n\").filter(Boolean).length : 0 };",
    "        const f1 = [];",
    "        if (!st1.done) f1.push(\"STATUS_MISSING_当前面\");",
    "        if (!cp1) { f1.push(\"CLIP_EMPTY\"); } else {",
    "          if (cp1.indexOf(\"【正面】\") < 0) f1.push(\"NO_FRONT_MARKER\");",
    "          if (cp1.indexOf(\"【反面】\") >= 0) f1.push(\"HAS_BACK_MARKER\");",
    "          for (let i = 0; i < def.slots.length; i += 1) { if (cp1.indexOf(def.slots[i].text) < 0) { f1.push(\"MISSING_TEXT[\" + i + \"]\"); break; } }",
    "        }",
    "        rec.currentFails = f1;",
    "        if (f1.length) rec.errors.push(\"ASSERT_FAIL current: \" + f1.join(\" | \"));",
    "",
    ""
  ].join("\n");
  src = replaceOnce(src, case1, "", "B5/drop-case1");
  // 替换 ③ 复制套版结构 → 复制全部文字
  const case3head = '        // ---- ③ 复制套版结构 ----';
  const i3 = src.indexOf(case3head);
  if (i3 < 0) throw new Error("ANCHOR MISS [B6/case3-head]");
  const endMarker = '        if (f3.length) rec.errors.push("ASSERT_FAIL template: " + f3.join(" | "));\n';
  const j3 = src.indexOf(endMarker, i3);
  if (j3 < 0) throw new Error("ANCHOR MISS [B6/case3-end]");
  const newCase3 = [
    "        // ---- ③ 复制全部文字（#zy-copy-all：正反面全部文字，纯文本逐行、不带标题/结构字段）----",
    "        await page.evaluate(() => { try { window.__zyLastCopy = null; } catch (e) {} });",
    "        const cl3 = await clickById(\"#zy-copy-all\");",
    "        if (!(cl3 && cl3.clicked)) { rec.errors.push(\"ALL_BTN_NOT_FOUND\"); continue; }",
    "        const st3 = await waitStatusContains(\"已复制全部文字\", 12000);",
    "        await SLEEP(600);",
    "        const cp3 = await readCopy();",
    "        rec.allText = { clicked: !!(cl3 && cl3.clicked), done: !!st3.done, status: st3.done ? st3.st.slice(0, 120) : null, copied: cp3 ? String(cp3).slice(0, 500) : null, lines: cp3 ? String(cp3).split(\"\\n\").filter(Boolean).length : 0 };",
    "        const f3 = [];",
    "        if (!st3.done) f3.push(\"STATUS_MISSING_全部文字\");",
    "        if (!cp3) { f3.push(\"CLIP_EMPTY\"); } else {",
    "          if (cp3.indexOf(\"【正面】\") >= 0 || cp3.indexOf(\"【反面】\") >= 0) f3.push(\"HAS_SIDE_MARKER\");",
    "          if (cp3.indexOf(\"字号=\") >= 0 || cp3.indexOf(\"位置=(\") >= 0) f3.push(\"HAS_STRUCT_FIELDS\");",
    "          for (let i = 0; i < def.slots.length; i += 1) { if (cp3.indexOf(def.slots[i].text) < 0) { f3.push(\"MISSING_TEXT[\" + i + \"]\"); break; } }",
    "        }",
    "        rec.allTextFails = f3;",
    "        if (f3.length) rec.errors.push(\"ASSERT_FAIL allText: \" + f3.join(\" | \"));",
    ""
  ].join("\n");
  src = src.slice(0, i3) + newCase3 + src.slice(j3 + endMarker.length);
  writeNorm(R46O, src, got.crlf);
  const chk = fs.readFileSync(R46O, "utf8");
  console.log("  patched commit-46o-copy-layer-modes-real.js");
  console.log("    copy-current=" + (chk.match(/zy-copy-current/g) || []).length + " copy-template=" + (chk.match(/zy-copy-template/g) || []).length + " copy-all=" + (chk.match(/zy-copy-all/g) || []).length + " allText=" + (chk.match(/allText/g) || []).length);
}

// ---------- C) 46p runner ----------
{
  const got = readNorm(R46P);
  let src = got.src;
  src = replaceOnce(src,
    '  t("copy-btns", cc.indexOf(\'id="zy-copy-current"\') >= 0 && cc.indexOf(\'id="zy-copy-both"\') >= 0 && cc.indexOf(\'id="zy-copy-template"\') >= 0);',
    '  t("copy-btns", cc.indexOf(\'id="zy-copy-both"\') >= 0 && cc.indexOf(\'id="zy-copy-all"\') >= 0 && cc.indexOf(\'id="zy-copy-current"\') < 0 && cc.indexOf(\'id="zy-copy-template"\') < 0);',
    "C1/46p-copy-btns");
  writeNorm(R46P, src, got.crlf);
  console.log("  patched commit-46p-real-acceptance.js (copy-btns)");
}
console.log("UI 精简 patch applied.");
