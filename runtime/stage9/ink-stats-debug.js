// runtime/stage9/ink-stats-debug.js — Stage 9 V4：real-card 行墨迹分布诊断（不联网、纯像素；零生产影响）
// 输出：灰度分布、多阈值下逐行 ink 计数统计、多种间隙参数下的行带数 —— 用于校准 baidu-geometry-benchmark 的 Ink 行带判据。
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("../../node_modules/playwright");
const ROOT = path.join(__dirname, "..", "..");
const CARD = path.join(ROOT, "runtime", "stage8b", "assets", "real-card-shengying.png");

(async () => {
  const dataUrl = "data:image/png;base64," + fs.readFileSync(CARD).toString("base64");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const stats = await page.evaluate((arg) => new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
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
      const total = W * H;
      const cum = []; let acc = 0;
      for (let t = 0; t < 256; t++) { acc += hist[t]; cum[t] = acc; }
      const quant = (q) => { for (let t = 0; t < 256; t++) if (cum[t] >= q * total) return t; return 255; };
      // Otsu
      let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
      let sumB = 0, wB = 0, maxVar = 0, otsu = 128;
      for (let t = 0; t < 256; t++) {
        wB += hist[t]; if (wB === 0) continue;
        const wF = total - wB; if (wF === 0) break;
        sumB += t * hist[t];
        const mB = sumB / wB, mF = (sum - sumB) / wF;
        const v = wB * wF * (mB - mF) * (mB - mF);
        if (v > maxVar) { maxVar = v; otsu = t; }
      }
      const rowInk = (th, minN) => {
        const r = new Int32Array(H);
        for (let y = 0; y < H; y += 1) {
          const off = y * W; let n = 0;
          for (let x = 0; x < W; x += 1) if (gray[off + x] < th) n += 1;
          r[y] = n;
        }
        return r;
      };
      const bandsOf = (th, minN, gap) => {
        const r = rowInk(th, minN);
        const bands = []; let y = 0;
        while (y < H) {
          if (r[y] < minN) { y += 1; continue; }
          let yE = y, minX = Infinity, maxX = -Infinity, acc = 0;
          while (yE < H && r[yE] >= minN) {
            const off = yE * W;
            for (let x = 0; x < W; x += 1) if (gray[off + x] < th) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); acc += 1; }
            yE += 1;
          }
          const h = yE - y, w = maxX - minX + 1;
          if (h >= 6 && w >= 6 && acc >= 20) bands.push({ y, h, x: minX, w, yEnd: yE });
          else bands.push({ y, h, x: minX, w, yEnd: yE, skip: !(h >= 6 && w >= 6 && acc >= 20) });
          y = yE;
        }
        return bands; // 注意：此实现不处理 gap —— 仅在 r<minN 处断带
      };
      // 带 gap 的行带（gap 行 ≥2 即断带；即断带阈值 = minN）
      const thresholds = [otsu, 100, 80, 60];
      const byTh = thresholds.map((th) => {
        const r = rowInk(th, 2);
        const rowStats = { max: Math.max.apply(null, r), p50: r.slice().sort((a, b) => a - b)[Math.floor(H / 2)], rowsGt0: r.filter((v) => v > 0).length, rowsGt5: r.filter((v) => v > 5).length, rowsGt20: r.filter((v) => v > 20).length };
        return { th, rowStats, bandCount1: bandsOf(th, 2, 2).filter((b) => !b.skip).length, bandCount5: bandsOf(th, 5, 2).filter((b) => !b.skip).length, bandCount20: bandsOf(th, 20, 2).filter((b) => !b.skip).length };
      });
      resolve({ W, H, grayMin: quant(0.001), p10: quant(0.1), p50: quant(0.5), p90: quant(0.9), otsu, byTh });
    };
    im.onerror = () => resolve({ err: "load-fail" });
    im.src = arg;
  }), dataUrl);
  console.log(JSON.stringify(stats, null, 2));
  await browser.close();
})();