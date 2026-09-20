// runtime/stage9/baidu-geometry-benchmark.js — Stage 9 V4 §十三~§十六：百度 Standard(/general) vs Accurate(/accurate) 几何基准
// ---------------------------------------------------------------------
// 数据链（每轴独立；Native=Text Truth，Baidu=Geometry Evidence §六/§十四）：
//   A: (image) → Baidu /general   → words_result[].location + probability（原始取证，§四）
//   B: (image) → Baidu /accurate  → words_result[].location + probability（原始取证，§四）
//   C: (image) → Image Ink       → 局部自适应墨迹：读序行对共享扩展区域（union(Std,Acc)×1.2）内
//                                    局部 Otsu + 少数类前景 bbox（极性无关：深字亮底/亮字深底均可）
//   （全局行投影对本卡不可用：ink-stats-debug 证据——阈值 60~130 下 494/577 行均含墨迹，非均匀背景）
//   Std/Acc 共用同一 Ink 参考区域 → 完全同条件比较（Q1~Q4 公平）
//   指标：centerX/centerY/width/height error + MAE + p50/p90；Std vs Acc 直接差（稳定性）
//   稳定性：每模式 ≥2 轮，同一会话内交替采样（§三）
// 运行：env ZY_BAIDU_AK / ZY_BAIDU_SK（必填）；ZY_BG_FILE 可换图（默认 real-card-shengying.png）
// 零 Cookie（百度外部 API；像素分析本地页）——完全程序化。输出 runtime/reports/stage-9/baidu-geometry-benchmark.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("../../node_modules/playwright");
const ROOT = path.join(__dirname, "..", "..");
const bp = require(path.join(ROOT, "extension", "src", "ocr", "baidu-provider.js"));
const { createBaiduProvider } = bp;
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-9");
const CARD = process.env.ZY_BG_FILE || path.join(ROOT, "runtime", "stage8b", "assets", "real-card-shengying.png");
const AK = process.env.ZY_BAIDU_AK || "";
const SK = process.env.ZY_BAIDU_SK || "";
const ROUNDS = 2; // §三/§十四：每模式至少两轮，同一会话

function pct(arr) {
  const s = (arr || []).filter((v) => v != null).slice().sort((a, b) => a - b);
  const q = (p) => { if (!s.length) return null; const i = Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length))); return s[i]; };
  return { n: s.length, mean: s.length ? s.reduce((a, b) => a + b, 0) / s.length : null, p50: q(0.5), p90: q(0.9) };
}
function absErr(a, b) { return [Math.abs(a - b), Math.abs(a - b)]; }

async function baiduRecognize(dataUrl, mode) {
  const provider = createBaiduProvider({
    getConfig: () => ({ apiKey: AK, secretKey: SK }),
    http: { request: async (m, u, o) => {
      const res = await fetch(u, { method: m, headers: o.headers || {}, body: o.body, signal: AbortSignal.timeout(o.timeout || 30000) });
      return { status: res.status, responseText: await res.text() };
    } },
    storage: { get: () => "", set: () => {} },
    resizeImage: null
  });
  return provider.recognize(dataUrl, { imageWidth: null, imageHeight: null, mode: mode }).catch((e) => ({ error: { errorCode: "EXCEPTION", errorMessage: String(e && e.message || e) } }));
}

(async () => {
  if (process.argv.indexOf("--selftest") >= 0) {
    // 纯函数自检：pct / absErr（无联网）
    if (pct([2, 1, 3]).mean !== 2) { console.error("[selftest] FAIL pct"); process.exit(1); }
    const d = absErr(100, 90);
    if (!(d[0] === 10 && d[1] === 10)) { console.error("[selftest] FAIL absErr"); process.exit(1); }
    console.log("[selftest] PASS pct/absErr");
    process.exit(0);
  }
  if (!AK || !SK) { console.error("[bench] 缺少 ZY_BAIDU_AK / ZY_BAIDU_SK（不伪造凭据）；--selftest 可校验纯函数"); process.exit(1); }
  if (!fs.existsSync(CARD)) { console.error("[bench] 图片不存在: " + CARD); process.exit(1); }
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const dataUrl = "data:image/png;base64," + fs.readFileSync(CARD).toString("base64");
  const out = { ts: new Date().toISOString(), stage: "STAGE-9-V4-BAIDU-GEOMETRY-BENCH", image: path.basename(CARD), roundsPerMode: ROUNDS, method: "pair-shared-region-local-otsu-ink", caveats: ["height 指标受共享扩展区垂直并线影响（局部少数类前景 bbox 可能跨多行合并），height 轴仅作参考；width/centerX 在单列名片上可信", "Image Ink = 局部 Otsu 少数类前景 bbox（极性无关），非人工标注真值"], errors: [] };

  // 像素装载：页面 world 一次性装载灰度，注入自足 inkIn（自持 window.__zyInkState；无闭包引用）
  let browser = null;
  let pageRef = null;
  try {
    browser = await chromium.launch({ headless: true });
    pageRef = await browser.newPage();
    const injected = await pageRef.evaluate((arg) => new Promise((resolve) => {
      const im = new Image();
      im.decoding = "async";
      im.onload = () => {
        try {
          const W = im.naturalWidth, H = im.naturalHeight;
          const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
          const ctx = cv.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(im, 0, 0);
          const d = ctx.getImageData(0, 0, W, H).data;
          const gray = new Uint8Array(W * H);
          for (let i = 0; i < W * H; i += 1) { const j = i * 4; gray[i] = Math.round(0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]); }
          window.__zyInkState = { gray: gray, W: W, H: H };
          // 局部墨迹：局部 Otsu；前景 = 少数类（极性无关：深字亮底 / 亮字深底）
          window.__zyInkFun = function inkIn(x0, y0, x1, y1) {
            const S = window.__zyInkState, G = S.gray, WW = S.W, HH = S.H;
            x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
            x1 = Math.min(WW - 1, Math.ceil(x1)); y1 = Math.min(HH - 1, Math.ceil(y1));
            const ws = x1 - x0, hs = y1 - y0;
            if (ws < 4 || hs < 4) return null;
            const hist = new Array(256).fill(0); let sum = 0, total = 0;
            for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) { const gr = G[y * WW + x]; hist[gr] += 1; total += 1; sum += gr; }
            let sumB = 0, wB = 0, maxVar = 0, th = 128;
            for (let t = 0; t < 256; t += 1) { wB += hist[t]; if (wB === 0) continue; const wF = total - wB; if (wF === 0) break; sumB += t * hist[t]; const mB = sumB / wB, mF = (sum - sumB) / wF; const v = wB * wF * (mB - mF) * (mB - mF); if (v > maxVar) { maxVar = v; th = t; } }
            let dark = 0;
            for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) if (G[y * WW + x] <= th) dark += 1;
            const takeDark = dark <= total - dark;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, cnt = 0;
            for (let y = y0; y < y1; y += 1) {
              for (let x = x0; x < x1; x += 1) {
                const gr = G[y * WW + x];
                const fg = takeDark ? (gr <= th) : (gr > th);
                if (!fg) continue;
                cnt += 1;
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
              }
            }
            if (!(cnt >= 6 && maxX >= minX && maxY >= minY)) return null;
            return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, pixels: cnt };
          };
          resolve({ ok: true, W: W, H: H, fnReady: typeof window.__zyInkFun === "function" });
        } catch (e) { resolve({ ok: false, err: "threw: " + String(e && e.message || e).slice(0, 200) }); }
      };
      im.onerror = () => resolve({ ok: false, err: "image-load-fail srcHead=" + String(im.src || "").slice(0, 24) + " len=" + String(arg || "").length });
      im.src = arg;
      setTimeout(() => { try { resolve({ ok: false, err: "image-timeout" }); } catch (e) {} }, 15000);
    }), dataUrl);
    out.imageNatural = injected.ok ? { width: injected.W, height: injected.H } : null;
    if (!injected.ok) out.errors.push("INK_LOAD: " + (injected.err || "?"));
    if (injected.ok && !injected.fnReady) out.errors.push("INK_FN_NOT_READY");
  } catch (e) { out.errors.push("BROWSER: " + String(e && e.message || e).slice(0, 300)); }

  const callInk = async (x0, y0, x1, y1) => {
    try { if (!pageRef) return null; return await pageRef.evaluate((a) => (window.__zyInkFun ? window.__zyInkFun(a.x0, a.y0, a.x1, a.y1) : null), { x0: x0, y0: y0, x1: x1, y1: y1 }); }
    catch (e) { return null; }
  };

  // ---- A/B：双模式每轮交替采样（同一会话）----
  const rawRounds = {};
  for (let rd = 0; rd < ROUNDS; rd += 1) {
    for (const mode of ["standard", "accurate"]) {
      const r = await baiduRecognize(dataUrl, mode);
      if (!rawRounds[mode]) rawRounds[mode] = [];
      if (r.error) { out.errors.push(mode + " r" + rd + ": " + (r.error.errorCode || "?") + " " + String(r.error.errorMessage || "").slice(0, 120)); rawRounds[mode].push(null); continue; }
      const raw = ((r.candidates || []).map((c) => ({ words: String(c.text || ""), location: { left: c.bbox.x, top: c.bbox.y, width: c.bbox.width, height: c.bbox.height }, probability: c.confidence != null ? c.confidence : null }))).sort((a, b) => (a.location.top - b.location.top) || (a.location.left - b.location.left));
      rawRounds[mode].push({ raw, lineCount: raw.length, meta: { mode: (r.meta && r.meta.mode) || null, profile: (r.meta && r.meta.profileName) || null, endpoint: (r.meta && r.meta.endpoint) || null } });
    }
  }

  // ---- 逐行配对（Std↔Acc 读序）+ 共享扩展区 Image Ink（每轮独立）----
  const buildRows = async (rd) => {
    const rows = [];
    const sR = (rawRounds.standard && rawRounds.standard[rd] && rawRounds.standard[rd].raw) || [];
    const aR = (rawRounds.accurate && rawRounds.accurate[rd] && rawRounds.accurate[rd].raw) || [];
    const n = Math.max(sR.length, aR.length);
    for (let i = 0; i < n; i += 1) {
      const s = sR[i] || null, a = aR[i] || null;
      if (!s && !a) { rows.push(null); continue; }
      const u = { left: Math.min(s ? s.location.left : Infinity, a ? a.location.left : Infinity), top: Math.min(s ? s.location.top : Infinity, a ? a.location.top : Infinity), right: Math.max(s ? s.location.left + s.location.width : -Infinity, a ? a.location.left + a.location.width : -Infinity), bottom: Math.max(s ? s.location.top + s.location.height : -Infinity, a ? a.location.top + a.location.height : -Infinity) };
      if (!isFinite(u.left)) { rows.push(null); continue; }
      const m = 0.2 * Math.max(u.right - u.left, u.bottom - u.top, 1);
      const ink = await callInk(u.left - m, u.top - m, u.right + m, u.bottom + m);
      const ctr = (b) => ({ x: b.location.left + b.location.width / 2, y: b.location.top + b.location.height / 2 });
      rows.push({
        order: i,
        standard: s ? { words: s.words, location: s.location, probability: s.probability } : null,
        accurate: a ? { words: a.words, location: a.location, probability: a.probability } : null,
        ink: ink || null,
        err: {
          std: s && ink ? { centerX: Math.abs(ctr(s).x - (ink.x + ink.w / 2)), centerY: Math.abs(ctr(s).y - (ink.y + ink.h / 2)), width: Math.abs(s.location.width - ink.w), height: Math.abs(s.location.height - ink.h), widthRelPct: ink.w > 0 ? (Math.abs(s.location.width - ink.w) / ink.w) * 100 : null, heightRelPct: ink.h > 0 ? (Math.abs(s.location.height - ink.h) / ink.h) * 100 : null } : null,
          acc: a && ink ? { centerX: Math.abs(ctr(a).x - (ink.x + ink.w / 2)), centerY: Math.abs(ctr(a).y - (ink.y + ink.h / 2)), width: Math.abs(a.location.width - ink.w), height: Math.abs(a.location.height - ink.h), widthRelPct: ink.w > 0 ? (Math.abs(a.location.width - ink.w) / ink.w) * 100 : null, heightRelPct: ink.h > 0 ? (Math.abs(a.location.height - ink.h) / ink.h) * 100 : null } : null,
          stdVsAcc: (s && a) ? { centerX: Math.abs(ctr(s).x - ctr(a).x), centerY: Math.abs(ctr(s).y - ctr(a).y), width: Math.abs(s.location.width - a.location.width), height: Math.abs(s.location.height - a.location.height) } : null
        }
      });
    }
    return rows;
  };
  const lineRows0 = await buildRows(0);
  const perRound = [];
  for (let rd = 0; rd < ROUNDS; rd += 1) {
    const rows = lineRows0.length && rd === 0 ? lineRows0 : await buildRows(rd);
    const agg = (mode) => {
      const k = mode === "standard" ? "std" : "acc";
      const ms = rows.filter((r) => r && r.err[k]).map((r) => r.err[k]);
      return { n: ms.length, widthMAE: pct(ms.map((e) => e.width)).mean, centerXMAE: pct(ms.map((e) => e.centerX)).mean, heightMAE: pct(ms.map((e) => e.height)).mean, widthRelPct: pct(ms.map((e) => e.widthRelPct)).mean };
    };
    perRound.push({ round: rd, standard: agg("standard"), accurate: agg("accurate"), lineCount: { standard: (rawRounds.standard || [])[rd] ? rawRounds.standard[rd].lineCount : null, accurate: (rawRounds.accurate || [])[rd] ? rawRounds.accurate[rd].lineCount : null } });
  }

  // ---- 汇总（主判 = 最后轮；perRound 看稳定性）----
  const summary = { verdict: null, perAxis: {}, perRound: perRound, lines: lineRows0 };
  const collect = (mode) => {
    const k = mode === "standard" ? "std" : "acc";
    const rows = lineRows0.filter((r) => r && r.err[k]);
    return {
      n: rows.length,
      centerX: pct(rows.map((r) => r.err[k].centerX)),
      centerY: pct(rows.map((r) => r.err[k].centerY)),
      width: pct(rows.map((r) => r.err[k].width)),
      height: pct(rows.map((r) => r.err[k].height)),
      widthRelPct: pct(rows.map((r) => r.err[k].widthRelPct)),
      heightRelPct: pct(rows.map((r) => r.err[k].heightRelPct))
    };
  };
  const sStd = collect("standard"), sAcc = collect("accurate");
  const cmp = (k) => (sStd[k].mean === null || sAcc[k].mean === null) ? "n/a" : (sAcc[k].mean < sStd[k].mean ? "accurate" : (sAcc[k].mean > sStd[k].mean ? "standard" : "tie"));
  summary.verdict = {
    centerX: cmp("centerX"), centerY: cmp("centerY"),
    width: cmp("width"), height: cmp("height"),
    widthRelPct: cmp("widthRelPct"), heightRelPct: cmp("heightRelPct"),
    widthDeltaPct: sStd.width.mean != null && sStd.width.mean > 0 ? Math.round(((sAcc.width.mean - sStd.width.mean) / sStd.width.mean) * 1000) / 10 : null
  };
  summary.perAxis = {
    standard: { centerX: sStd.centerX.mean != null ? Math.round(sStd.centerX.mean * 100) / 100 : null, centerY: sStd.centerY.mean != null ? Math.round(sStd.centerY.mean * 100) / 100 : null, width: sStd.width.mean != null ? Math.round(sStd.width.mean * 100) / 100 : null, height: sStd.height.mean != null ? Math.round(sStd.height.mean * 100) / 100 : null, widthRelPct: sStd.widthRelPct.mean != null ? Math.round(sStd.widthRelPct.mean * 100) / 100 : null },
    accurate: { centerX: sAcc.centerX.mean != null ? Math.round(sAcc.centerX.mean * 100) / 100 : null, centerY: sAcc.centerY.mean != null ? Math.round(sAcc.centerY.mean * 100) / 100 : null, width: sAcc.width.mean != null ? Math.round(sAcc.width.mean * 100) / 100 : null, height: sAcc.height.mean != null ? Math.round(sAcc.height.mean * 100) / 100 : null, widthRelPct: sAcc.widthRelPct.mean != null ? Math.round(sAcc.widthRelPct.mean * 100) / 100 : null }
  };
  summary.lineCountPerMode = { standard: (rawRounds.standard || []).filter(Boolean).map((r) => r.lineCount), accurate: (rawRounds.accurate || []).filter(Boolean).map((r) => r.lineCount) };
  out.summary = summary;
  out.raw = { standard: rawRounds.standard || [], accurate: rawRounds.accurate || [] };

  if (browser) await browser.close().catch(() => {});
  const lastN = Math.max((out.summary.lineCountPerMode.standard[out.summary.lineCountPerMode.standard.length - 1] || 0), (out.summary.lineCountPerMode.accurate[out.summary.lineCountPerMode.accurate.length - 1] || 0));
  fs.writeFileSync(path.join(REPORT_DIR, "baidu-geometry-benchmark.json"), JSON.stringify(out, null, 2));
  const f1 = (v) => (v == null ? "n/a" : Number(v).toFixed(1));
  console.log("[bench] image=" + path.basename(CARD) + (out.imageNatural ? " " + out.imageNatural.width + "x" + out.imageNatural.height : "") + " lines=" + lastN + " errors=" + (out.errors.length ? out.errors.join(" | ") : "none"));
  console.log("[bench] standard : lineCount=" + (out.summary.lineCountPerMode.standard || []).join("/") + " widthMAE=" + f1(sStd.width.mean) + " centerXMAE=" + f1(sStd.centerX.mean) + " heightMAE=" + f1(sStd.height.mean) + " widthRelPct=" + f1(sStd.widthRelPct.mean) + " inkNull=" + lineRows0.filter((r) => r && !r.ink).length + "/" + lineRows0.filter(Boolean).length);
  console.log("[bench] accurate : lineCount=" + (out.summary.lineCountPerMode.accurate || []).join("/") + " widthMAE=" + f1(sAcc.width.mean) + " centerXMAE=" + f1(sAcc.centerX.mean) + " heightMAE=" + f1(sAcc.height.mean) + " widthRelPct=" + f1(sAcc.widthRelPct.mean) + " inkNull=" + lineRows0.filter((r) => r && !r.ink).length + "/" + lineRows0.filter(Boolean).length);
  console.log("[bench] perRound : " + perRound.map((p) => "r" + p.round + "[std w=" + f1(p.standard.widthMAE) + "/acc w=" + f1(p.accurate.widthMAE) + "]").join(" "));
  console.log("[bench] verdict  : " + JSON.stringify(summary.verdict));
  console.log("[bench] report   : " + path.join(REPORT_DIR, "baidu-geometry-benchmark.json"));
  process.exit(out.errors.length ? 1 : 0);
})();