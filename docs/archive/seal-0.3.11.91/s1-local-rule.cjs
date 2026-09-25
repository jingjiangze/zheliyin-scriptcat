// 阶段 1（P0-0）：本地 OCR 专用几何匹配规则（默认关，可回滚）
// 落点：extension/src/ocr/native-geometry-recovery.js 阶段 3 LOCAL + userscript 开关接线
// 默认行为零变化：仅当 ctx.localRule === "geometry-only" 时启用新规则
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = "D:/zheliyin-scriptcat";
const REC = path.join(ROOT, "extension", "src", "ocr", "native-geometry-recovery.js");
const US = path.join(ROOT, "zheliyin-card-assistant.user.js");
const TEST = path.join(ROOT, "runtime", "stage9", "local-geometry-match.test.js");

function readNorm(F) { const raw = fs.readFileSync(F, "utf8"); const crlf = raw.indexOf("\r\n") >= 0; return { crlf: crlf, src: crlf ? raw.split("\r\n").join("\n") : raw }; }
function writeNorm(F, src, crlf) { fs.writeFileSync(F, crlf ? src.split("\n").join("\r\n") : src, "utf8"); }
function replaceOnce(src, anchor, replacement, label) {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error("ANCHOR MISS [" + label + "]");
  if (src.indexOf(anchor, i + 1) >= 0) throw new Error("ANCHOR NOT UNIQUE [" + label + "]");
  return src.slice(0, i) + replacement + src.slice(i + anchor.length);
}
const norm = (F) => fs.readFileSync(F, "utf8").split("\r\n").join("\n");

// ---------- A) 恢复模块：新增 helper + 阶段 3 分支 ----------
{
  const HELPER = [
    "// =====================================================================",
    "// P0-0（2026-09-25）：本地引擎专用匹配规则（默认关：仅 ctx.localRule === \"geometry-only\" 时启用）",
    "// ---------------------------------------------------------------------",
    "// 背景（审计结论）：LOCAL 引擎识别的是印刷体像素，而 Native 真值为手写体 textType=2，",
    "//   同一行文本串天然差异大 → 沿用 BAIDU 的 sim>=0.8 硬门会 100% 落空 → 本地几何永不被采用",
    "//   → Completeness Gate 判 UNRESOLVED/INCOMPLETE → 本批不创建。",
    "// 规则（只「选」已检出的 bbox，绝不猜位置/间距/居中）：",
    "//   L2 几何硬门沿用 gateCheck（INVALID/TOO_SMALL/ASPECT/OVERLAP/OUTSIDE 一律淘汰）",
    "//   L5 禁用已被消费几何（occupied，调用方维护）",
    "//   L6 文字降权为弱因子：sim 不再设硬门；sim>=0.8 仍加分（保留既有高分路径）",
    "//   L4 唯一性硬门：最优弱分 - 次优弱分 < localMargin（默认 0.2）且最优非高相似 → NONE（宁缺勿滥）",
    "//   L7 结果记为 LOCAL_GEOMETRY_ONLY，score 上限 0.7，evidence 全量可审计",
    "// 红线不变：本地只提供 geometry；textbox.text 恒为 native.rawText（调用方保证）。",
    "// =====================================================================",
    "function matchLocalGeometryOnly(nativeLine, cands, occupied, T, gateCheck, source) {",
    "  var th = T || {};",
    "  var margin = (typeof th.localMargin === \"number\") ? th.localMargin : 0.2;",
    "  var overlapMax = (typeof th.overlapMax === \"number\") ? th.overlapMax : 0.5;",
    "  var occ = Array.isArray(occupied) ? occupied : [];",
    "  var picks = [];",
    "  for (var i = 0; i < (cands || []).length; i += 1) {",
    "    var c = cands[i];",
    "    if (!c || !c.bbox) continue;",
    "    var r = bboxToRect(c.bbox);",
    "    if (!r) continue;",
    "    var blocked = false;",
    "    for (var oi = 0; oi < occ.length; oi += 1) {",
    "      var or = bboxToRect(occ[oi] && occ[oi].bbox);",
    "      if (or && overlapAreaRatio(r, or) > overlapMax) { blocked = true; break; }",
    "    }",
    "    if (blocked) continue;",
    "    var sim = textSimilarity(nativeLine.rawText, c.text);",
    "    var sType = (c.text != null && scriptType(nativeLine.rawText) === scriptType(c.text)) ? 1 : 0;",
    "    var sLen = (c.text != null && Math.abs(String(nativeLine.rawText).length - String(c.text).length) <= 2) ? 1 : 0;",
    "    var high = sim >= 0.8;",
    "    var w = (high ? 1.6 : sim * 0.6) + sType * 0.6 + sLen * 0.3;",
    "    picks.push({ c: c, sim: sim, sType: sType, sLen: sLen, high: high, w: w });",
    "  }",
    "  if (!picks.length) return { ok: false, fail: { reason: \"NO_LOCAL_CANDIDATE\", detail: { candidates: (cands || []).length } } };",
    "  picks.sort(function (a, b) { return b.w - a.w; });",
    "  var best = picks[0];",
    "  var second = picks.length > 1 ? picks[1] : null;",
    "  var gap = second ? (best.w - second.w) : best.w;",
    "  if (!best.high && gap < margin) {",
    "    return { ok: false, fail: { reason: \"LOCAL_AMBIGUOUS\", detail: { candidates: picks.length, uniqGap: Number(gap.toFixed(3)) } } };",
    "  }",
    "  var gR = gateCheck(best.c.bbox, source);",
    "  if (!gR.ok) return { ok: false, fail: { reason: gR.reason, detail: gR.detail } };",
    "  return {",
    "    ok: true, bbox: gR.rect, source: source, geo: best.c,",
    "    method: \"LOCAL_GEOMETRY_ONLY\",",
    "    score: Math.min(0.7, best.w / 2.5),",
    "    evidence: [\"rule=geometry-only\", \"text-sim=\" + best.sim.toFixed(2), \"len=\" + best.sLen, \"type=\" + best.sType, \"uniq-gap=\" + Number(gap.toFixed(3))]",
    "  };",
    "}",
    ""
  ].join("\n");

  const got = readNorm(REC);
  let src = got.src;
  src = replaceOnce(src, "function recoverNativeGeometry(unmatchedNative, ctx) {", HELPER + "function recoverNativeGeometry(unmatchedNative, ctx) {", "A1/helper");

  // 阶段 3：默认（off）保持原逻辑；geometry-only 走新规则
  const OLD_STAGE3 = [
    "    if (!made && localCands.length) {",
    "      var lBest = null, lBestScore = 0, lEv = [];",
    "      for (var li = 0; li < localCands.length; li += 1) {",
    "        var lg = localCands[li];",
    "        if (!lg || !lg.bbox || lg.text == null) continue;",
    "        var lsim = textSimilarity(n.rawText, lg.text);",
    "        if (lsim < T.minSim) continue;",
    "        var lLen = Math.abs(String(n.rawText).length - String(lg.text).length) <= 2 ? 1 : 0;",
    "        var lType = scriptType(n.rawText) === scriptType(lg.text) ? 1 : 0;",
    "        var ls = lsim * 2 + lLen * 0.4 + lType * 0.4;",
    "        if (ls > lBestScore) { lBestScore = ls; lBest = lg; lEv = [\"text-sim=\" + lsim.toFixed(2), \"len=\" + lLen, \"type=\" + lType]; }",
    "      }",
    "      if (lBest) {",
    "        var lR = gateCheck(lBest.bbox, SOURCE_LOCAL);",
    "        if (lR.ok) {",
    "          made = { bbox: lR.rect, source: SOURCE_LOCAL, _geo: lBest };",
    "          method = \"LOCAL_LINE_MULTI_FACTOR\";",
    "          score = lBestScore;",
    "          evidence = lEv;",
    "          occupied.push({ bbox: lR.rect });",
    "        } else {",
    "          lastFail = { reason: lR.reason, detail: lR.detail };",
    "        }",
    "      } else if (!(lastFail && lastFail.reason && lastFail.reason !== \"NO_LINE_CANDIDATE\")) {",
    "        lastFail = { reason: \"NO_LOCAL_CANDIDATE\", detail: { candidates: localCands.length } };",
    "      }",
    "    }"
  ].join("\n");
  const NEW_STAGE3 = [
    "    if (!made && localCands.length) {",
    "      if (ctx.localRule === \"geometry-only\") {",
    "        // P0-0：本地专用规则（默认关；仅显式开启时生效，不影响历史行为）",
    "        var lgo = matchLocalGeometryOnly(n, localCands, occupied, T, gateCheck, SOURCE_LOCAL);",
    "        if (lgo.ok) {",
    "          made = { bbox: lgo.bbox, source: lgo.source, _geo: lgo.geo };",
    "          method = lgo.method;",
    "          score = lgo.score;",
    "          evidence = lgo.evidence;",
    "          occupied.push({ bbox: lgo.bbox });",
    "        } else if (lgo.fail && !(lastFail && lastFail.reason && lastFail.reason !== \"NO_LINE_CANDIDATE\")) {",
    "          lastFail = lgo.fail;",
    "        }",
    "      } else {",
    "      var lBest = null, lBestScore = 0, lEv = [];",
    "      for (var li = 0; li < localCands.length; li += 1) {",
    "        var lg = localCands[li];",
    "        if (!lg || !lg.bbox || lg.text == null) continue;",
    "        var lsim = textSimilarity(n.rawText, lg.text);",
    "        if (lsim < T.minSim) continue;",
    "        var lLen = Math.abs(String(n.rawText).length - String(lg.text).length) <= 2 ? 1 : 0;",
    "        var lType = scriptType(n.rawText) === scriptType(lg.text) ? 1 : 0;",
    "        var ls = lsim * 2 + lLen * 0.4 + lType * 0.4;",
    "        if (ls > lBestScore) { lBestScore = ls; lBest = lg; lEv = [\"text-sim=\" + lsim.toFixed(2), \"len=\" + lLen, \"type=\" + lType]; }",
    "      }",
    "      if (lBest) {",
    "        var lR = gateCheck(lBest.bbox, SOURCE_LOCAL);",
    "        if (lR.ok) {",
    "          made = { bbox: lR.rect, source: SOURCE_LOCAL, _geo: lBest };",
    "          method = \"LOCAL_LINE_MULTI_FACTOR\";",
    "          score = lBestScore;",
    "          evidence = lEv;",
    "          occupied.push({ bbox: lR.rect });",
    "        } else {",
    "          lastFail = { reason: lR.reason, detail: lR.detail };",
    "        }",
    "      } else if (!(lastFail && lastFail.reason && lastFail.reason !== \"NO_LINE_CANDIDATE\")) {",
    "        lastFail = { reason: \"NO_LOCAL_CANDIDATE\", detail: { candidates: localCands.length } };",
    "      }",
    "      }",
    "    }"
  ].join("\n");
  src = replaceOnce(src, OLD_STAGE3, NEW_STAGE3, "A2/stage3");
  writeNorm(REC, src, got.crlf);
  const chk = fs.readFileSync(REC, "utf8");
  console.log("  patched native-geometry-recovery.js");
  console.log("    helper=" + ((chk.match(/function matchLocalGeometryOnly/g) || []).length) + " ruleBranch=" + ((chk.match(/ctx\.localRule === "geometry-only"/g) || []).length) + " exports=" + ((chk.match(/matchLocalGeometryOnly/g) || []).length));
}

// ---------- B) userscript：开关 + 两处调用点接线 ----------
{
  const got = readNorm(US);
  let src = got.src;
  src = replaceOnce(src,
    "  const STAGE12_LOCAL_ASSIST = GM_getValue(\"zyLocalAssist\", \"1\") === \"1\";",
    "  const STAGE12_LOCAL_ASSIST = GM_getValue(\"zyLocalAssist\", \"1\") === \"1\";\n  // P0-0（2026-09-25）：本地 OCR 专用匹配规则开关（默认 off=历史行为；设为 geometry-only 启用本地几何弱文字匹配）\n  const LOCAL_MATCH_RULE = GM_getValue(\"zyLocalMatchRule\", \"off\") === \"geometry-only\" ? \"geometry-only\" : \"off\";",
    "B1/flag");
  src = replaceOnce(src,
    "        recovery = safeRecoverNativeGeometry(matched.unmatchedNative, {",
    "        recovery = safeRecoverNativeGeometry(matched.unmatchedNative, {\n          localRule: LOCAL_MATCH_RULE,",
    "B2/call1");
  src = replaceOnce(src,
    "          const rec2 = safeRecoverNativeGeometry(matched.unmatchedNative, {",
    "          const rec2 = safeRecoverNativeGeometry(matched.unmatchedNative, {\n            localRule: LOCAL_MATCH_RULE,",
    "B3/call2");
  writeNorm(US, src, got.crlf);
  const chk = fs.readFileSync(US, "utf8");
  console.log("  patched userscript.js");
  console.log("    flag=" + ((chk.match(/LOCAL_MATCH_RULE/g) || []).length) + " zyLocalMatchRule=" + ((chk.match(/zyLocalMatchRule/g) || []).length));
}

// ---------- C) 单测 ----------
{
  const T = [
    "\"use strict\";",
    "// runtime/stage9/local-geometry-match.test.js — 阶段1 P0-0：本地 OCR 专用几何匹配规则",
    "// 真源：extension/src/ocr/native-geometry-recovery.js（阶段 3 LOCAL）",
    "// 契约：默认 off 行为逐字不变；geometry-only 启用弱文字+唯一性规则；宁缺勿滥；只选已检出 bbox。",
    "const assert = require(\"assert\");",
    "const REC = require(\"D:/zheliyin-scriptcat/extension/src/ocr/native-geometry-recovery.js\");",
    "const recover = REC.recoverNativeGeometry;",
    "if (typeof recover !== \"function\") { console.error(\"recoverNativeGeometry 未导出\"); process.exit(1); }",
    "const BOUNDS = { x: 0, y: 0, width: 400, height: 300 };",
    "const native = [{ id: 1, rawText: \"甲公司\", order: 0 }];",
    "const localCand = (text, x, y) => ({ text: text, bbox: { x: x, y: y, width: 80, height: 20 }, sourceProvider: \"LOCAL\" });",
    "let pass = 0, fail = 0;",
    "const t = (name, fn) => { try { fn(); pass++; console.log(\"[local-match] PASS \" + name); } catch (e) { fail++; console.log(\"[local-match] FAIL \" + name + \" :: \" + String(e && e.message || e)); } };",
    "",
    "// 1 默认 off：本地文本相似度低（<minSim 0.8）→ 不恢复（历史行为不变）",
    "t(\"1 off 默认：低相似本地候选被拒（历史行为）\", () => {",
    "  const r = recover(native, { localCandidates: [localCand(\"甲公旬\", 10, 10)], imageBounds: BOUNDS });",
    "  assert.strictEqual(r.recovered.length, 0, \"off 时不得恢复\");",
    "  assert.strictEqual(r.unresolved.length, 1);",
    "});",
    "",
    "// 2 geometry-only：同「同脚本类型 + 长度带 + 唯一」→ 恢复，方法具名，score 上限 0.7",
    "t(\"2 geometry-only：弱文字 + 唯一 → 恢复且 method/score/evidence 合规\", () => {",
    "  const r = recover(native, { localCandidates: [localCand(\"甲公旬\", 10, 10)], imageBounds: BOUNDS, localRule: \"geometry-only\" });",
    "  assert.strictEqual(r.recovered.length, 1, \"应恢复 1 行\");",
    "  const m = r.recovered[0];",
    "  assert.strictEqual(m.source, \"LOCAL\");",
    "  assert.strictEqual(m.method, \"LOCAL_GEOMETRY_ONLY\");",
    "  assert.ok(m.score <= 0.7 + 1e-9, \"score 必须 <= 0.7，实际 \" + m.score);",
    "  assert.ok(String(m.evidence.join(\"|\")).indexOf(\"rule=geometry-only\") >= 0);",
    "  assert.ok(m.geometry && m.geometry.bbox && m.geometry.bbox.width === 80);",
    "});",
    "",
    "// 3 唯一性硬门：两个同分候选 → NONE（宁缺勿滥，不许乱配）",
    "t(\"3 geometry-only：唯一性不足 → NONE\", () => {",
    "  const r = recover(native, { localCandidates: [localCand(\"甲公旬\", 10, 10), localCand(\"甲公甸\", 10, 120)], imageBounds: BOUNDS, localRule: \"geometry-only\" });",
    "  assert.strictEqual(r.recovered.length, 0, \"歧义时必须不恢复\");",
    "});",
    "",
    "// 4 高相似仍走加分路径（保留既有语义）",
    "t(\"4 geometry-only：高相似候选优先并被采用\", () => {",
    "  const r = recover(native, { localCandidates: [localCand(\"甲公旬\", 10, 10), localCand(\"甲公司\", 10, 120)], imageBounds: BOUNDS, localRule: \"geometry-only\" });",
    "  assert.strictEqual(r.recovered.length, 1);",
    "  assert.strictEqual(r.recovered[0].geometry.bbox.x, 10);",
    "});",
    "",
    "// 5 几何硬门仍生效：越界候选被 OUTSIDE_IMAGE 拒（规则不放宽几何）",
    "t(\"5 geometry-only：几何硬门不放宽（越界拒绝）\", () => {",
    "  const r = recover(native, { localCandidates: [localCand(\"甲公旬\", 380, 290)], imageBounds: { x: 0, y: 0, width: 100, height: 60 }, localRule: \"geometry-only\" });",
    "  assert.strictEqual(r.recovered.length, 0, \"越界不得恢复\");",
    "});",
    "",
    "// 6 已占用几何不得复用（占位约束）",
    "t(\"6 geometry-only：已占用几何不被重复采用\", () => {",
    "  const r = recover(native, { localCandidates: [localCand(\"甲公旬\", 10, 10)], occupiedGeometries: [{ bbox: { x: 10, y: 10, width: 80, height: 20 } }], imageBounds: BOUNDS, localRule: \"geometry-only\" });",
    "  assert.strictEqual(r.recovered.length, 0, \"已占用不得复用\");",
    "});",
    "",
    "console.log(\"[local-match] pass=\" + pass + \" fail=\" + fail);",
    "process.exit(fail ? 1 : 0);"
  ].join("\n") + "\n";
  fs.mkdirSync(path.dirname(TEST), { recursive: true });
  fs.writeFileSync(TEST, T, "utf8");
  console.log("  wrote runtime/stage9/local-geometry-match.test.js");
}
console.log("阶段 1（P0-0）patch applied.");
