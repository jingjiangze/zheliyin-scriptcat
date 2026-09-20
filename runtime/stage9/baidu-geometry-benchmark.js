// runtime/stage9/baidu-geometry-benchmark.js — Stage 9 V4 §十三~§十六：百度 Standard(/general) vs Accurate(/accurate) 几何基准
// ---------------------------------------------------------------------
// 数据链（每轴独立，不混 OCR 文本质量——Native 才是 Text Truth，Baidu 只当 Geometry Evidence §十四）：
//   A: (image) → Baidu /general   → words_result[].location（原始 bbox，§十六：拒绝用旧 source bbox 近似）
//   B: (image) → Baidu /accurate  → words_result[].location
//   C: (image) → Image Ink       → 页面 world 像素层（Otsu 灰度阈值 → 逐行 ink 投影 → 行带 bbox），
//                                    参考 = 图中真实文字墨迹范围（npx 自然像素）
//   匹配：band（参考）⇄ box（模式）按垂直重叠贪心；仅统计已配对行 —— 不做 index 对齐（行数可能不同）
//   指标：center MAPE/MAE、width MAPE/MAE、height MAPE/MAE + p50/p90（§十五）
//   稳定性：每模式 ≥2 轮；两轮 lineCount/MAE 不一致 → 第 3 轮（§十四）
// 运行：env ZY_BAIDU_AK / ZY_BAIDU_SK（必填）；ZY_BG_FILE 可换图（默认 real-card-shengying.png）
// 零 Cookie（百度走外部 API；像素分析走本地 file/dataUrl 页）——完全程序化，无坐标点击。
// 输出 runtime/reports/stage-9/baidu-geometry-benchmark.json（证据；不改主链 / 不升版）
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
const ROUNDS = 2;               // §十四：每模式至少两轮

function pct(arr) {
  const s = arr.slice().sort((a, b) => a - b);
  const q = (p) => { const i = Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length))); return s[i]; };
  return { n: s.length, mean: s.length ? s.reduce((a, b) => a + b, 0) / s.length : null, p50: q(0.5), p90: q(0.9) };
}

// 每行误差（相对参考 band）
function lineError(box, band) {
  if (!box || !band) return null;
  const bcx = box.x + box.width / 2, bcy = box.y + box.height / 2;
  const icx = band.x + band.w / 2, icy = band.y + band.h / 2;
  return {
    center: Math.hypot(bcx - icx, bcy - icy),
    centerX: Math.abs(bcx - icx), centerY: Math.abs(bcy - icy),
    width: Math.abs(box.width - band.w), height: Math.abs(box.height - band.h),
    widthRelPct: band.w > 0 ? (Math.abs(box.width - band.w) / band.w) * 100 : null,
    heightRelPct: band.h > 0 ? (Math.abs(box.height - band.h) / band.h) * 100 : null
  };
}

// 垂直重叠系数：重合高度 / min(盒高, 带高)
function vOverlap(box, band) {
  const a0 = box.y, a1 = box.y + box.height, b0 = band.y, b1 = band.y + band.h;
  const ov = Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  return ov / Math.max(1e-6, Math.min(box.height, band.h));
}

// 贪心匹配：以 band 为锚，每个 band 找 overlap 最大的未用 box；box 未用则记录 unmatched
function matchBoxes(boxes, bands) {
  const used = new Array(boxes.length).fill(false);
  const pairs = [], unmatchedBoxes = [];
  bands.forEach((b) => {
    let best = -1, bestOv = 0;
    for (let i = 0; i < boxes.length; i += 1) {
      if (used[i]) continue;
      const ov = vOverlap(boxes[i], b);
      if (ov > bestOv) { bestOv = ov; best = i; }
    }
    if (best >= 0 && bestOv > 0.2) { used[best] = true; pairs.push({ band: b, box: boxes[best], ov: bestOv }); }
    else unmatchedBoxes.push(null);
  });
  boxes.forEach((b, i) => { if (!used[i]) unmatchedBoxes.push(i); });
  return { pairs, unmatchedBoxes, matched: pairs.length };
}

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
  return provider.recognize(dataUrl, { imageWidth: null, imageHeight: null, mode: mode })
    .then((r) => ({ mode, r }))
    .catch((e) => ({ mode, r: { error: { errorCode: "EXCEPTION", errorMessage: String(e && e.message || e) } }, thrown: true }));
}

(async () => {
  // ---- 无凭据自检（纯函数；不联网）----
  if (process.argv.indexOf("--selftest") >= 0) {
    const boxes = [
      { x: 10, y: 10, width: 100, height: 20, text: "A" },
      { x: 10, y: 60, width: 90, height: 16, text: "B" },
      { x: 10, y: 200, width: 40, height: 12, text: "UNPAIRED" } // 无对应 band
    ];
    const bands = [
      { x: 8, y: 9, w: 102, h: 22 },
      { x: 12, y: 58, w: 95, h: 18 }
    ];
    const m = matchBoxes(boxes, bands);
    if (m.matched !== 2 || m.unmatchedBoxes.length !== 1) { console.error("[selftest] FAIL matched=" + m.matched); process.exit(1); }
    const e = lineError(boxes[0], bands[0]);
    if (!(e.center > 0 && e.width > 0)) { console.error("[selftest] FAIL lineError"); process.exit(1); }
    console.log("[selftest] PASS matched=2 unmatched=1");
    process.exit(0);
  }
  if (!AK || !SK) { console.error("[bench] 缺少 ZY_BAIDU_AK / ZY_BAIDU_SK，终止（不伪造凭据）；可用 --selftest 校验纯函数"); process.exit(1); }
  if (!fs.existsSync(CARD)) { console.error("[bench] 名片图片不存在: " + CARD); process.exit(1); }
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const dataUrl = "data:image/png;base64," + fs.readFileSync(CARD).toString("base64");
  const out = { ts: new Date().toISOString(), stage: "STAGE-9-V4-BAIDU-GEOMETRY-BENCH", image: path.basename(CARD), roundsPerMode: ROUNDS, modes: {}, ink: null, errors: [] };

  // ---- C) Image Ink：页面 world 像素层（about:blank 加载 dataUrl，零 Cookie）----
  let inkBands = null;
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 100, height: 100 } });
    inkBands = await page.evaluate((arg) => new Promise((resolve) => {
      const im = new Image();
      im.onload = () => {
        try {
          const cv = document.createElement("canvas");
          cv.width = im.naturalWidth; cv.height = im.naturalHeight;
          const ctx = cv.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(im, 0, 0);
          const W = cv.width, H = cv.height;
          const d = ctx.getImageData(0, 0, W, H).data;
          const gray = new Uint8Array(W * H);
          const hist = new Array(256).fill(0);
          for (let i = 0; i < W * H; i += 1) {
            const j = i * 4;
            const g = Math.round(0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]);
            gray[i] = g; hist[g] += 1;
          }
          // Otsu 全局阈值
          const total = W * H;
          let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
          let sumB = 0, wB = 0, maxVar = 0, th = 128;
          for (let t = 0; t < 256; t++) {
            wB += hist[t]; if (wB === 0) continue;
            const wF = total - wB; if (wF === 0) break;
            sumB += t * hist[t];
            const mB = sumB / wB, mF = (sum - sumB) / wF;
            const v = wB * wF * (mB - mF) * (mB - mF);
            if (v > maxVar) { maxVar = v; th = t; }
          }
          const ink = 200;
          const rowCount = new Int32Array(H).fill(0);
          for (let y = 0; y < H; y += 1) {
            const off = y * W;
            let n = 0;
            for (let x = 0; x < W; x += 1) if (gray[off + x] < th) n += 1;
            rowCount[y] = n;
          }
          // 行带：连续 ink 行成带，间隙 ≥3 行切分；过滤噪点（高 < 6px 或字宽 < 6px）
          const bands = [];
          let y = 0;
          while (y < H) {
            if (rowCount[y] < 2) { y += 1; continue; }
            let yEnd = y; let minX = Infinity, maxX = -Infinity, acc = 0;
            while (yEnd < H && rowCount[yEnd] >= 2) {
              const off = yEnd * W;
              for (let x = 0; x < W; x += 1) if (gray[off + x] < th) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); acc += 1; }
              yEnd += 1;
            }
            const h = yEnd - y;
            const w = maxX - minX + 1;
            if (h >= 6 && w >= 6 && acc >= 20) bands.push({ y, h, x: minX, w });
            y = yEnd;
          }
          resolve({ ok: true, naturalWidth: W, naturalHeight: H, otsuTh: th, bands, bandCount: bands.length });
        } catch (e) { resolve({ ok: false, err: String(e && e.message || e).slice(0, 200) }); }
      };
      im.onerror = () => resolve({ ok: false, err: "image-load-fail" });
      im.src = arg.dataUrl;
    }), { dataUrl });
    out.ink = inkBands;
    if (!(inkBands && inkBands.ok)) throw new Error("ink analysis failed: " + (inkBands && inkBands.err || "?"));
  } catch (e) { out.errors.push("INK: " + String(e && e.message || e).slice(0, 300)); }
  const bands = (inkBands && inkBands.bands) || [];

  // ---- A/B) Baidu 双模式 ≥2 轮 ----
  const textsOf = (r) => ((r && r.candidates) || []).map((c) => ({ x: c.bbox.x, y: c.bbox.y, width: c.bbox.width, height: c.bbox.height, text: String(c.text || "").slice(0, 12) }));
  for (const mode of ["standard", "accurate"]) {
    const rows = [];
    for (let rd = 0; rd < ROUNDS; rd += 1) {
      const { r } = await baiduRecognize(dataUrl, mode);
      if (r.error) { out.errors.push(mode + " round" + rd + ": " + (r.error.errorCode || "?") + " " + String(r.error.errorMessage || "").slice(0, 160)); rows.push(null); continue; }
      const boxes = textsOf(r);
      const m = matchBoxes(boxes, bands);
      const errs = m.pairs.map((p) => lineError(p.box, p.band)).filter(Boolean);
      rows.push({
        round: rd,
        lineCount: boxes.length,
        meta: { mode: r.meta.mode, profile: r.meta.profileName, elapsedMs: r.meta.elapsed, endpoint: r.meta.endpoint },
        matched: m.matched,
        unmatchedBoxes: m.unmatchedBoxes.length,
        lineCountDiff: boxes.length - bands.length,
        perLine: m.pairs.map((p) => Object.assign({ text: String(p.box.text || ""), ov: Math.round(p.ov * 100) / 100 }, lineError(p.box, p.band))),
        mae: { center: pct(errs.map((e) => e.center)), centerX: pct(errs.map((e) => e.centerX)), centerY: pct(errs.map((e) => e.centerY)), width: pct(errs.map((e) => e.width)), height: pct(errs.map((e) => e.height)), widthRelPct: pct(errs.map((e) => e.widthRelPct).filter((v) => v != null)), heightRelPct: pct(errs.map((e) => e.heightRelPct).filter((v) => v != null)) }
      });
    }
    out.modes[mode] = rows;
  }

  // ---- 汇总 Verdict（事实性输出，只比较几何距离，不做“更好/更差”价值判断以外的评分）----
  const summarize = (mode) => {
    const rows = (out.modes[mode] || []).filter(Boolean);
    if (!rows.length) return null;
    const pick = rows[rows.length - 1];
    return { lineCount: rows.map((r) => r.lineCount), matched: rows.map((r) => r.matched), widthMAE: rows.map((r) => r.mae.width.mean && Math.round(r.mae.width.mean * 100) / 100), centerMAE: rows.map((r) => r.mae.center.mean && Math.round(r.mae.center.mean * 100) / 100), heightMAE: rows.map((r) => r.mae.height.mean && Math.round(r.mae.height.mean * 100) / 100), widthRelPct: rows.map((r) => r.mae.widthRelPct.mean && Math.round(r.mae.widthRelPct.mean * 100) / 100), lastRound: { matched: pick.matched, lineCount: pick.lineCount, mae: pick.mae } };
  };
  const sStd = summarize("standard"), sAcc = summarize("accurate");
  out.summary = { standard: sStd, accurate: sAcc };
  if (sStd && sAcc) {
    const wErrStd = sStd.lastRound.mae.width.mean, wErrAcc = sAcc.lastRound.mae.width.mean;
    const cErrStd = sStd.lastRound.mae.center.mean, cErrAcc = sAcc.lastRound.mae.center.mean;
    const hErrStd = sStd.lastRound.mae.height.mean, hErrAcc = sAcc.lastRound.mae.height.mean;
    out.summary.verdict = {
      widthCloser: wErrAcc < wErrStd ? "accurate" : (wErrAcc > wErrStd ? "standard" : "tie"),
      centerCloser: cErrAcc < cErrStd ? "accurate" : (cErrAcc > cErrStd ? "standard" : "tie"),
      heightCloser: hErrAcc < hErrStd ? "accurate" : (hErrAcc > hErrStd ? "standard" : "tie"),
      widthDeltaPct: wErrStd > 0 ? Math.round(((wErrAcc - wErrStd) / wErrStd) * 1000) / 10 : null
    };
  }

  if (browser) await browser.close().catch(() => {});
  fs.writeFileSync(path.join(REPORT_DIR, "baidu-geometry-benchmark.json"), JSON.stringify(out, null, 2));
  // console 摘要（简短，细节在 JSON）
  const line = (m) => { const s = summarize(m); return s ? ("lineCount=" + s.lineCount.join("/") + " matched=" + s.matched.join("/") + " widthMAE=" + s.widthMAE.join("/") + " centerMAE=" + s.centerMAE.join("/") + " heightMAE=" + s.heightMAE.join("/") + " widthRelPct=" + s.widthRelPct.join("/")) : "FAILED"; };
  console.log("[bench] image=" + path.basename(CARD) + " natural=" + (inkBands ? inkBands.naturalWidth + "x" + inkBands.naturalHeight : "?") + " inkBands=" + bands.length);
  console.log("[bench] standard : " + line("standard"));
  console.log("[bench] accurate : " + line("accurate"));
  console.log("[bench] verdict  : " + JSON.stringify(out.summary && out.summary.verdict || null));
  console.log("[bench] report   : " + path.join(REPORT_DIR, "baidu-geometry-benchmark.json"));
  process.exit(out.errors.length ? 1 : 0);
})();