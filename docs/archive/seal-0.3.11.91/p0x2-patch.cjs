// P0-X 收尾：46h 添加「点击后探针」——判定点击是否生效 / 面板与按钮可见性 / 点击瞬间状态
"use strict";
const fs = require("fs");
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

// 1) 探针变量
src = replaceOnce(src,
  "    const clickSmartFill = async (timeoutMs) => {",
  "    let lastClickDiag = null; // P0-X 探针：点击生效性/可见性/瞬间状态\n    const clickSmartFill = async (timeoutMs) => {",
  "1/diag-var");

// 2) 点击函数内采集并回传诊断
src = replaceOnce(src,
  [
    "        const r = await page.evaluate(() => {",
    "          const btn = document.querySelector(\"#zy-smart-fill\");",
    "          if (btn && btn.offsetParent) { try { btn.click(); return { clicked: true }; } catch (e) {} }",
    "          return { clicked: false };",
    "        }).catch(() => ({ clicked: false }));"
  ].join("\n"),
  [
    "        const r = await page.evaluate(() => {",
    "          // P0-X 探针：面板/按钮可见性 + 点击瞬间状态（判定点击是否真正生效）",
    "          const panel = document.getElementById(\"zy-card-assistant\");",
    "          const btn = document.querySelector(\"#zy-smart-fill\");",
    "          const cf = document.querySelector(\"#zy-apply-confirm\");",
    "          const st = document.querySelector(\"#zy-status\");",
    "          const diag = {",
    "            panel: !!panel,",
    "            panelMinimized: !!(panel && panel.querySelector(\".zy-body\") && !panel.querySelector(\".zy-body\").offsetParent),",
    "            btn: !!btn, btnVisible: !!(btn && btn.offsetParent),",
    "            confirm: !!cf, confirmVisible: !!(cf && cf.offsetParent),",
    "            statusBefore: st ? String(st.textContent || \"\").trim().slice(0, 120) : null",
    "          };",
    "          if (btn && btn.offsetParent) { try { btn.click(); return Object.assign({ clicked: true }, diag, { statusAfterClick: st ? String(st.textContent || \"\").trim().slice(0, 120) : null }); } catch (e) { return Object.assign({ clicked: false, clickErr: String(e && (e.message || e)) }, diag); } }",
    "          return Object.assign({ clicked: false }, diag);",
    "        }).catch(() => ({ clicked: false }));",
    "        lastClickDiag = r;"
  ].join("\n"),
  "2/diag-collect");

// 3) 断言块记录诊断
src = replaceOnce(src,
  "          runRec.assertFails = fails;",
  "          runRec.assertFails = fails;\n          runRec.clickDiag = lastClickDiag; // P0-X 探针取证",
  "3/diag-record");

writeNorm(F, src, got.crlf);
const chk = fs.readFileSync(F, "utf8");
const cnt = (s) => (chk.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
console.log("patched commit-46h (probe)  lastClickDiag=" + cnt("lastClickDiag") + " btnVisible=" + cnt("btnVisible") + " clickDiag=" + cnt("runRec.clickDiag"));
