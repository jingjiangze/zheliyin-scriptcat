// 审计修复：Native 文字真值流水线异常（内部错误）
// 根因：demo 与 test 的 maybeApplyNativeTruth 仅差 Stage 12 本地辅助块；该分支主体在 demo 因
//   STAGE9_LOCAL_SIDECAR 默认关而「从未执行」，test 因 STAGE12_LOCAL_ASSIST 默认开而首次执行，
//   其中 recoverNativeGeometry / runLocalGeometrySidecar 无 try 防护 → 任一抛出即冒泡为
//   「Native 文字真值流水线异常」→ 整批不创建（违反 Stage 12 文档「本地为末端，绝不中断识别」）。
// 修复：几何恢复 / 本地辅助层一律非致命降级（失败仅记录证据，交由 Completeness Gate 判定）；
//   流水线异常时把真实异常文本透出到状态与证据；新增 ?zydebug 出口便于真机取证。
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

const HELPERS = [
  "  // 审计修复（2026-09-24）：几何恢复 / 本地辅助属「可选增强层」，任一步失败一律非致命降级",
  "  // —— 绝不冒泡为「Native 文字真值流水线异常」而阻断整批创建（对齐 Stage 12 文档：本地为末端，绝不中断识别）。",
  "  // 语义：失败不产生任何几何猜测，仅记录证据；最终是否创建仍由 Completeness Gate 判定。",
  "  function safeRecoverNativeGeometry(unmatched, ctx) {",
  "    var neutral = { recovered: [], unresolved: Array.isArray(unmatched) ? unmatched : [], rejected: [], diag: { error: null } };",
  "    try {",
  "      if (typeof recoverNativeGeometry !== \"function\") { neutral.diag.error = \"MISSING_DEP\"; return neutral; }",
  "      return recoverNativeGeometry(unmatched, ctx) || neutral;",
  "    } catch (e) {",
  "      var m = String(e && (e.message || e)).slice(0, 160);",
  "      neutral.diag.error = m;",
  "      ocrLog(\"RECOVERY\", \"recoverNativeGeometry failed (non-fatal): \" + m);",
  "      pipelineEvidence({ stage: \"GEOMETRY_RECOVERY\", ok: false, error: m });",
  "      return neutral;",
  "    }",
  "  }",
  "  async function safeRunLocalGeometrySidecar(img) {",
  "    try {",
  "      if (typeof runLocalGeometrySidecar !== \"function\") return [];",
  "      var r = await runLocalGeometrySidecar(img);",
  "      return Array.isArray(r) ? r : [];",
  "    } catch (e) {",
  "      var m = String(e && (e.message || e)).slice(0, 160);",
  "      ocrLog(\"SIDECAR\", \"local sidecar failed (non-fatal): \" + m);",
  "      pipelineEvidence({ stage: \"LOCAL_SIDECAR\", ok: false, error: m });",
  "      return [];",
  "    }",
  "  }",
  ""
].join("\n");

// ---------- A) userscript ----------
{
  const got = readNorm(US);
  let src = got.src;

  // A1) 注入两个非致命包装函数
  src = replaceOnce(src, "  async function maybeApplyNativeTruth(blocks, img, diag) {", HELPERS + "  async function maybeApplyNativeTruth(blocks, img, diag) {", "A1/helpers");

  // A2/A3) 两处 recoverNativeGeometry 调用改为安全包装
  src = replaceOnce(src, "        recovery = recoverNativeGeometry(matched.unmatchedNative, {", "        recovery = safeRecoverNativeGeometry(matched.unmatchedNative, {", "A2/recovery-1");
  src = replaceOnce(src, "          const rec2 = recoverNativeGeometry(matched.unmatchedNative, {", "          const rec2 = safeRecoverNativeGeometry(matched.unmatchedNative, {", "A3/recovery-2");

  // A4) 本地辅助 sidecar 调用改为安全包装
  src = replaceOnce(src, "                const localCands = await runLocalGeometrySidecar(img);", "                const localCands = await safeRunLocalGeometrySidecar(img);", "A4/sidecar");

  // A5) 流水线异常：透出真实异常文本 + 证据
  src = replaceOnce(src,
    [
      "    } catch (e) {",
      "      ocrLog(\"TRUTH\", \"exception \" + String(e && (e.message || e) || \"\").slice(0, 160));",
      "      return { blocks: blocks || [], mode: \"OFF\", skipped: true };",
      "    }"
    ].join("\n"),
    [
      "    } catch (e) {",
      "      const peMsg = String(e && (e.message || e) || \"\").slice(0, 200);",
      "      ocrLog(\"TRUTH\", \"exception \" + peMsg);",
      "      pipelineEvidence({ stage: \"NATIVE_TRUTH\", ok: false, code: \"NATIVE_TRUTH_PIPELINE_ERROR\", error: peMsg });",
      "      return { blocks: blocks || [], mode: \"OFF\", skipped: true, reason: \"pipeline-error\", pipelineError: peMsg };",
      "    }"
    ].join("\n"),
    "A5/catch");

  // A6) userscript 兜底镜像：reason=pipeline-error 时透出异常文本
  src = replaceOnce(src,
    "    if (tb.skipped === true && !tb.native) return { code: \"NATIVE_TRUTH_PIPELINE_ERROR\", message: \"Native 文字真值流水线异常（内部错误或依赖未就绪，非“无真值”），本批不创建；请重试，若持续出现请反馈该提示。\", missingTexts: [] };",
    [
      "    if (tb.reason === \"pipeline-error\") return { code: \"NATIVE_TRUTH_PIPELINE_ERROR\", message: \"Native 文字真值流水线异常（内部错误\" + (tb.pipelineError ? \"：\" + String(tb.pipelineError).slice(0, 200) : \"\") + \"），本批不创建；请重试，若持续出现请把本提示反馈给我。\", missingTexts: [] };",
      "    if (tb.skipped === true && !tb.native) return { code: \"NATIVE_TRUTH_PIPELINE_ERROR\", message: \"Native 文字真值流水线异常（依赖未就绪，非“无真值”），本批不创建；请刷新页面后重试，若持续出现请反馈该提示。\", missingTexts: [] };"
    ].join("\n"),
    "A6/mirror");

  // A7) ?zydebug 出口：暴露流水线与辅助层，便于真机直接驱动/取证
  src = replaceOnce(src,
    [
      "      mergeTwoFields: mergeTwoFields,",
      "      setStatus: setStatus",
      "    };"
    ].join("\n"),
    [
      "      mergeTwoFields: mergeTwoFields,",
      "      setStatus: setStatus,",
      "      // 审计/回归出口（仅 ?zydebug）：Native Truth 流水线与几何辅助层，供真机直接驱动与取证",
      "      maybeApplyNativeTruth: maybeApplyNativeTruth,",
      "      nativeTruthGatePassed: nativeTruthGatePassed,",
      "      nativeTruthGateFail: nativeTruthGateFail,",
      "      runLocalGeometrySidecar: runLocalGeometrySidecar,",
      "      safeRunLocalGeometrySidecar: safeRunLocalGeometrySidecar,",
      "      safeRecoverNativeGeometry: safeRecoverNativeGeometry,",
      "      pipelineEvidence: pipelineEvidence",
      "    };"
    ].join("\n"),
    "A7/debug");

  writeNorm(US, src, got.crlf);
  const chk = fs.readFileSync(US, "utf8");
  const cnt = (s) => (chk.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
  console.log("  patched userscript.js");
  console.log("    safeRecover=" + cnt("safeRecoverNativeGeometry") + " safeSidecar=" + cnt("safeRunLocalGeometrySidecar") + " rawSidecarCall=" + cnt("await runLocalGeometrySidecar(img)") + " pipelineError=" + cnt("pipeline-error") + " debugHooks=" + cnt("safeRecoverNativeGeometry: safeRecoverNativeGeometry"));
}

// ---------- B) 纯门禁模块：pipeline-error 文本透出 ----------
{
  const got = readNorm(GATE);
  let src = got.src;
  src = replaceOnce(src,
    "  if (tb.skipped === true && !tb.native) return { ok: false, code: \"NATIVE_TRUTH_PIPELINE_ERROR\", message: \"Native 文字真值流水线异常（内部错误或依赖未就绪，非“无真值”），本批不创建；请重试，若持续出现请反馈该提示。\", matched: 0, unresolved: 0, totalNative: 0, missingTexts: [] };",
    [
      "  if (tb.reason === \"pipeline-error\") return { ok: false, code: \"NATIVE_TRUTH_PIPELINE_ERROR\", message: \"Native 文字真值流水线异常（内部错误\" + (tb.pipelineError ? \"：\" + String(tb.pipelineError).slice(0, 200) : \"\") + \"），本批不创建；请重试，若持续出现请把本提示反馈给我。\", matched: 0, unresolved: 0, totalNative: 0, missingTexts: [], pipelineError: tb.pipelineError || null };",
      "  if (tb.skipped === true && !tb.native) return { ok: false, code: \"NATIVE_TRUTH_PIPELINE_ERROR\", message: \"Native 文字真值流水线异常（依赖未就绪，非“无真值”），本批不创建；请刷新页面后重试，若持续出现请反馈该提示。\", matched: 0, unresolved: 0, totalNative: 0, missingTexts: [] };"
    ].join("\n"),
    "B/gate-pipeline-error");
  writeNorm(GATE, src, got.crlf);
  console.log("  patched native-completeness-gate.js (pipeline-error 文本透出)");
}

// ---------- C) 门禁测试：补 G5 ----------
{
  const got = readNorm(GTEST);
  let src = got.src;
  const anchor = "console.log(\"native-gate-every-path: pass=\" + passed + \" fail=\" + failed);";
  const add = [
    "t(\"G5: reason=pipeline-error → NATIVE_TRUTH_PIPELINE_ERROR 且透出内部异常文本\", () => {",
    "  const r = G.resolveGate({ blocks: [], mode: \"OFF\", skipped: true, reason: \"pipeline-error\", pipelineError: \"runLocalGeometrySidecar is not defined\" });",
    "  if (r.ok) throw new Error(\"must stop\");",
    "  if (r.code !== \"NATIVE_TRUTH_PIPELINE_ERROR\") throw new Error(\"code=\" + r.code);",
    "  if (String(r.message).indexOf(\"runLocalGeometrySidecar is not defined\") < 0) throw new Error(\"message 未透出异常文本: \" + r.message);",
    "});",
    anchor
  ].join("\n");
  src = replaceOnce(src, anchor, add, "C/gate-G5");
  writeNorm(GTEST, src, got.crlf);
  console.log("  patched native-gate-every-path.test.js (+G5)");
}
console.log("审计修复 patch applied.");
