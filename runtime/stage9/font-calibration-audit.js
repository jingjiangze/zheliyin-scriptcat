// runtime/stage9/font-calibration-audit.js — Stage 9 V4 §14~§28：Font Calibration Audit（P4-A，只诊断不改生产）
// ---------------------------------------------------------------------
// 数据源（全部既有真机报告，零新增真机）：
//   A source-vs-reconstruction.json —— 10 块四层几何（ocrBBox / imageInk / editorInk + fontSize + usedFont）
//   B baidu-geometry-benchmark.json —— Baidu /accurate 原始 location（交叉参考）
//   C native-ab.json —— Native Text Truth 10 行（文本/scriptType 分布对照；不参与字号判断 §16）
// 补缺层：advanceWidth —— 浏览器 measureText(block.text, fontSize, usedFont)（词法同源；字体不在本地→标 fontFallback）
// 指标（§18）：K1=ImageInkW/OCRBBoxW；K2=EditorInkW/ImageInkW；K3=AdvanceW/ImageInkW；K4=AdvanceW/EditorInkW；
//             K5=EditorInkH/fontSize；K6=ImageInkH/fontSize
// 稳定性分组（§23）：scriptType(zh/en/num/mix) × sizeBucket × fontFamily → median/p25/p75 + flag
// 输出 runtime/reports/stage-9/font-calibration-audit.json（不修改任何生产字号）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("../../node_modules/playwright");
const ROOT = path.join(__dirname, "..", "..");
const R9 = path.join(ROOT, "runtime", "reports", "stage-9");
const R8B = path.join(ROOT, "runtime", "reports", "stage-8b");
const REPORT_DIR = R9;
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return null; } };
const SRC = read(path.join(R9, "source-vs-reconstruction.json"));
const BENCH = read(path.join(R9, "baidu-geometry-benchmark.json"));
const NATIVE = read(path.join(R9, "native-ab.json"));

// ---- 纯函数：scriptType / sizeBucket / 分组统计 ----
function scriptTypeOf(text) {
  const s = String(text || "");
  const zh = /[\u4e00-\u9fa5]/.test(s), en = /[a-zA-Z]/.test(s), num = /[0-9]/.test(s);
  if (zh && (en || num)) return "mix";
  if (zh) return "zh";
  if (num && en) return "num-en";
  if (num) return "num";
  if (en) return "en";
  return "other";
}
function sizeBucketOf(fs) {
  if (fs >= 80) return "80+";
  if (fs >= 50) return "50-80";
  if (fs >= 30) return "30-50";
  if (fs >= 20) return "20-30";
  return "10-20";
}
function q(arr, p) {
  const s = (arr || []).filter((v) => v != null && isFinite(v)).slice().sort((a, b) => a - b);
  if (!s.length) return null;
  const i = Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)));
  return s[i];
}
function agg(vals) {
  const v = (vals || []).filter((x) => x != null && isFinite(x));
  if (!v.length) return { n: 0, median: null, p25: null, p75: null, mean: null, stable: null };
  const med = q(v, 0.5), p25 = q(v, 0.25), p75 = q(v, 0.75);
  const spread = (p75 != null && p25 != null) ? p75 - p25 : null;
  return { n: v.length, median: Math.round(med * 10000) / 10000, p25: Math.round(p25 * 10000) / 10000, p75: Math.round(p75 * 10000) / 10000, mean: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10000) / 10000, stable: spread != null && med != null && med !== 0 ? Math.round((spread / med) * 100) / 100 : null };
}

(async () => {
  if (!SRC || !Array.isArray(SRC.blocks)) { console.error("[audit] 缺少 source-vs-reconstruction.json 或 blocks"); process.exit(1); }
  const blocks = SRC.blocks.filter((b) => b && b.text != null && b.sourceGeometry && b.imageInk && b.editorInk);
  const nativeLines = ((NATIVE && Array.isArray(NATIVE.runs) && NATIVE.runs[0] && NATIVE.runs[0].lines) || []).slice(0, 10).map((l) => String(l.rawText != null ? l.rawText : l.text || ""));
  const benchAcc = ((BENCH && BENCH.raw && BENCH.raw.accurate && BENCH.raw.accurate[0] && BENCH.raw.accurate[0].raw) || []).map((c) => ({ words: c.words, location: c.location }));
  const out = { ts: new Date().toISOString(), stage: "STAGE-9-V4-FONT-CALIBRATION-AUDIT", sources: { blocks: SRC.stage || path.basename(SRC.baseReport || ""), benchmark: BENCH && BENCH.stage, native: NATIVE && NATIVE.stage }, caveats: ["行序不对齐（重建块来自 Baidu/Local 候选，Native 来自站内 uploadOCR top-down）→ K 系以重建块为准，Native 仅作 scriptType 分布对照", "advanceWidth 为浏览器 measureText（usedFont 本地缺失时标 fontFallback）"], blocks: [], grouped: {}, nativeScriptTypes: null, errors: [] };

  // 浏览器 measureText（约 5-8px 小字体图幅无关：advance 与像素缩放无关，取 fontSize=100 归一）
  let browser = null;
  let measure = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    measure = async (text, fontFamily) => {
      try {
        return await page.evaluate((a) => {
          const fs = 100;
          const fam = String(a.fontFamily || "");
          const avail = (function () {
            try { return document.fonts.check(fs + "px " + fam); } catch (e) { return false; }
          })();
          const cv = document.createElement("canvas");
          const ctx = cv.getContext("2d");
          const famUse = fam ? fam : "sans-serif";
          ctx.font = fs + "px " + famUse;
          const m = ctx.measureText(a.text);
          return { advanceAt100: m.width, fontFallback: fam && !avail ? true : false };
        }, { text: String(text || ""), fontFamily: fontFamily });
      } catch (e) { return { error: String(e && e.message || e).slice(0, 100) }; }
    };
  } catch (e) { out.errors.push("BROWSER: " + String(e && e.message || e).slice(0, 200)); }

  // ---- 每块四层 + K 系 ----
  for (const b of blocks) {
    const row = {
      blockIndex: b.blockIndex != null ? b.blockIndex : null,
      text: String(b.text || ""),
      scriptType: scriptTypeOf(b.text),
      fontFamily: b.usedFont || null,
      fontSize: b.fontSize != null ? b.fontSize : null,
      sizeBucket: sizeBucketOf(b.fontSize),
      ocrBBox: b.sourceGeometry && b.sourceGeometry.bbox ? { width: Math.round(b.sourceGeometry.bbox.w), height: Math.round(b.sourceGeometry.bbox.h) } : null,
      imageInk: b.imageInk && b.imageInk.bbox ? { width: Math.round(b.imageInk.bbox.w), height: Math.round(b.imageInk.bbox.h) } : null,
      editorInk: { width: b.editorInk && b.editorInk.inkWidth, height: b.editorInk && b.editorInk.inkHeight },
      advanceWidth: null, advanceFontFallback: null
    };
    if (measure) {
      const mt = await measure(row.text, row.fontFamily);
      if (mt && !mt.error) {
        const adv = mt.advanceAt100 / 100; // 归一单像素 advance（比例性）
        row.advanceWidth = Math.round(adv * row.fontSize * 100) / 100; // fontSize 刻度下的 advance
        row.advanceFontFallback = !!mt.fontFallback;
      } else if (mt) row.advanceError = mt.error;
    }
    const k = {};
    if (row.imageInk && row.ocrBBox && row.ocrBBox.width > 0) k.K1 = row.imageInk.width / row.ocrBBox.width;
    if (row.imageInk && row.imageInk.width > 0) k.K2 = row.editorInk.width / row.imageInk.width;
    if (row.advanceWidth != null && row.imageInk && row.imageInk.width > 0) k.K3 = row.advanceWidth / row.imageInk.width;
    if (row.advanceWidth != null && row.editorInk.width > 0) k.K4 = row.advanceWidth / row.editorInk.width;
    if (row.fontSize > 0) { k.K5 = row.editorInk.height / row.fontSize; if (row.imageInk && row.imageInk.height > 0) k.K6 = row.imageInk.height / row.fontSize; }
    row.K = k;
    out.blocks.push(row);
  }

  // ---- 分组稳定性 ----
  const groupBy = (keyFn) => {
    const map = {};
    out.blocks.forEach((b) => { const key = keyFn(b); if (!key) return; (map[key] = map[key] || []).push(b); });
    const res = {};
    Object.keys(map).forEach((key) => {
      const list = map[key];
      res[key] = { n: list.length, K1: agg(list.map((b) => b.K && b.K.K1)), K2: agg(list.map((b) => b.K && b.K.K2)), K3: agg(list.map((b) => b.K && b.K.K3)), K4: agg(list.map((b) => b.K && b.K.K4)), K5: agg(list.map((b) => b.K && b.K.K5)), K6: agg(list.map((b) => b.K && b.K.K6)) };
    });
    return res;
  };
  out.grouped.byScriptType = groupBy((b) => b.scriptType);
  out.grouped.bySizeBucket = groupBy((b) => b.sizeBucket);
  out.grouped.byFontFamily = groupBy((b) => b.fontFamily || "null");
  out.grouped.overall = groupBy(() => "all");
  out.nativeScriptTypes = (() => { const m = {}; nativeLines.forEach((t) => { const s = scriptTypeOf(t); m[s] = (m[s] || 0) + 1; }); return m; })();
  out.nativeLines = nativeLines;

  // ---- 可读归因（§19~§21 判据；纯事实输出）----
  const o = out.grouped.overall["all"] || {};
  const picks = [
    { k: "K1", note: "OCR bbox 是否大于 ImageInk（>1 → location padding 放大字号输入）" },
    { k: "K2", note: "EditorInk 相对 ImageInk（>1 → 编辑器渲染偏大；<1 偏小）" },
    { k: "K3", note: "Advance 相对 ImageInk（advance-first 是否 over-ink）" },
    { k: "K4", note: "Advance 相对 EditorInk（measureText vs 实际墨迹系统偏差）" },
    { k: "K5", note: "EditorInkH/fontSize（应≈0.7-1.0；过大/过小=高度模型偏差）" },
    { k: "K6", note: "ImageInkH/fontSize" }
  ];
  out.verdict = {};
  picks.forEach((p) => {
    const a = o[p.k];
    if (!a || a.n === 0) { out.verdict[p.k] = { n: 0, finding: "no-data" }; return; }
    const finding = a.stable != null && a.stable <= 0.15 ? "STABLE" : (a.stable != null ? "UNSTABLE" : "n/a");
    out.verdict[p.k] = { median: a.median, spreadRatio: a.stable, finding: finding, note: p.note };
  });

  if (browser) await browser.close().catch(() => {});
  fs.writeFileSync(path.join(REPORT_DIR, "font-calibration-audit.json"), JSON.stringify(out, null, 2));
  const f = (v) => (v == null ? "n/a" : Number(v).toFixed(3));
  console.log("[audit] blocks=" + out.blocks.length + " nativeLines=" + nativeLines.length + " 分布=" + JSON.stringify(out.nativeScriptTypes));
  console.log("[audit] overall K1(ink/ocr)=" + f(o.K1 && o.K1.median) + " K2(ed/ink)=" + f(o.K2 && o.K2.median) + " K3(adv/ink)=" + f(o.K3 && o.K3.median) + " K4(adv/ed)=" + f(o.K4 && o.K4.median) + " K5(edH/fs)=" + f(o.K5 && o.K5.median) + " K6(inkH/fs)=" + f(o.K6 && o.K6.median));
  console.log("[audit] byScriptType", JSON.stringify(Object.keys(out.grouped.byScriptType).map((k) => ({ s: k, n: out.grouped.byScriptType[k].n, K1: f(out.grouped.byScriptType[k].K1 && out.grouped.byScriptType[k].K1.median), K2: f(out.grouped.byScriptType[k].K2 && out.grouped.byScriptType[k].K2.median), K3: f(out.grouped.byScriptType[k].K3 && out.grouped.byScriptType[k].K3.median), K5: f(out.grouped.byScriptType[k].K5 && out.grouped.byScriptType[k].K5.median) }))));
  console.log("[audit] bySizeBucket", JSON.stringify(Object.keys(out.grouped.bySizeBucket).map((k) => ({ b: k, n: out.grouped.bySizeBucket[k].n, K1: f(out.grouped.bySizeBucket[k].K1 && out.grouped.bySizeBucket[k].K1.median), K2: f(out.grouped.bySizeBucket[k].K2 && out.grouped.bySizeBucket[k].K2.median) }))));
  console.log("[audit] verdict K1-K6: " + JSON.stringify(Object.keys(out.verdict).map((k) => k + "=" + out.verdict[k].median + "(" + out.verdict[k].finding + ")")));
  console.log("[audit] report   : " + path.join(REPORT_DIR, "font-calibration-audit.json"));
  process.exit(out.errors.length ? 1 : 0);
})();