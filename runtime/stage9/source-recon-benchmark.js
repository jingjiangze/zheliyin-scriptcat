// runtime/stage9/source-recon-benchmark.js — Stage 9 P2-A：SOURCE-vs-RECONSTRUCTION 基准
// ---------------------------------------------------------------------
// 目的（§五十三）：回答 问题A（OCR bbox 与真实文字区域差多少）与 问题B（target 下 Editor 重建差多少）。
// 方法：
//   1. 读 v23 报告（created 10 块：quad/ink/字体 四层数据已含 raw/normalize/gate/ink）
//   2. 打开编辑器 → 注入真实名片背景 → 页面 world 对每块 OCR 区域做 Image Ink 像素分析
//      （灰度 → Otsu 阈值 → 暗像素投影 → ink bbox + density），不动 OCR/不点按钮
//   3. node 侧合并四层几何：OCR块bbox(=quad AABB) / ImageInk / EditorInk(=records)
//   4. 计算 sourceGeometryError / reconstructionError / finalError + MAE + 归因
// 输出 runtime/reports/stage-9/source-vs-reconstruction.json（evidence，不改主链/不升版）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("../../node_modules/playwright");
const adapter = require("../scriptcat-adapter");
const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const EXT_ID = adapter.EXT_ID;
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-9");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const CARD = path.join(ROOT, "runtime", "stage8b", "assets", "real-card-shengying.png");
const BASE_REPORT = path.join(ROOT, "runtime", "reports", "stage-8b", "real-card-gate-a0-v03211223.json");

function quadAABB(quad) {
  if (!quad || !quad.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  quad.forEach((p) => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

(async () => {
  const out = { ts: new Date().toISOString(), stage: "STAGE-9-P2A-BENCHMARK", branch: "stage-9-altq-baidu-reconstruction", baseReport: path.basename(BASE_REPORT), blocks: [], summary: {}, errors: [] };
  let browser = null, page = null;
  try {
    // 读基线报告（v23：created 含 quad/ink；inkRows 含 source/target/actual）
    const base = JSON.parse(fs.readFileSync(BASE_REPORT, "utf8"));
    const rec = base.cases[0];
    const createdByKey = {};
    (rec.created || []).forEach((c) => { if (c.zyOcrKey) createdByKey[c.zyOcrKey] = c; });
    const rows = (rec.inkRows || []).map((r) => {
      const c = createdByKey["zy-ocr-" + r.blockIndex] || null;
      const quad = c && c.quad ? c.quad : null;
      return { blockIndex: r.blockIndex, text: r.text, ocrBBox: quadAABB(quad), source: r.source || null, target: r.target || null, editorInk: r.actual ? { inkWidth: r.actual.inkWidth, inkHeight: r.actual.inkHeight } : null, fontSize: r.target && r.target.fontSize, usedFont: c ? c.fontFamily : (r.usedFont || null) };
    }).filter((x) => x.ocrBBox);
    fs.writeFileSync(path.join(REPORT_DIR, "bench-blocks-input.json"), JSON.stringify(rows, null, 2));
    // 浏览器：注入背景图 → 页面 world Image Ink
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1280, height: 800 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    page = browser.pages()[0];
    page.on("pageerror", (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 300)); });
    await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await SLEEP(1500);
    const allOld = await adapter.getAllScripts(page) || [];
    for (const s of allOld.filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(page, s.uuid); } catch (e) {} }
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const canvasReady = () => () => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[0]) || null; return { ok: !!(d && d.canvas && typeof d.drawText === "function") }; };
    const t0 = Date.now();
    for (;;) {
      const r = await page.evaluate(canvasReady()).catch(() => ({ ok: false }));
      if (r && r.ok) break;
      if (Date.now() - t0 > 150000) throw new Error("editor not ready");
      await SLEEP(1500);
    }
    await SLEEP(3000);
    // 注入名片为背景图（用 fabric canvas 的 backgroundImage.getElement 作像素源）
    await page.evaluate((arg) => new Promise((res) => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
      const c = d && d.canvas;
      if (!c) return res({ ok: false });
      const f = (c.constructor && c.constructor.fabric) || window.fabric;
      const im = new Image();
      im.onload = () => { try { const bg = new f.Image(im); bg.set({ left: 0, top: 0, scaleX: 1, scaleY: 1 }); c.setBackgroundImage(bg, () => { try { c.setCoords && c.setCoords(); if (c.requestRenderAll) c.requestRenderAll(); } catch (e) {} res({ ok: true, nw: im.naturalWidth, nh: im.naturalHeight }); }); } catch (e) { res({ ok: false, err: String(e && e.message || e).slice(0, 100) }); } };
      im.onerror = () => res({ ok: false });
      im.src = arg.dataUrl;
    }), { dataUrl: "data:image/png;base64," + fs.readFileSync(CARD).toString("base64") });
    await SLEEP(2500);
    // 对每块做 Image Ink（页面 world，Otsu + 投影；区域 = ocrBBox 外扩 margin）
    const inkResults = await page.evaluate((argList) => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const c = vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas;
      if (!c || !c.backgroundImage) return { err: "no bg" };
      const el = c.backgroundImage.getElement();
      const cv = document.createElement("canvas");
      cv.width = el.naturalWidth; cv.height = el.naturalHeight;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(el, 0, 0);
      const out = [];
      const otsu = (hist, total) => {
        let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
        let sumB = 0, wB = 0, maxVar = 0, th = 1;
        for (let t = 0; t < 256; t++) {
          wB += hist[t]; if (wB === 0) continue;
          const wF = total - wB; if (wF === 0) break;
          sumB += t * hist[t];
          const mB = sumB / wB, mF = (sum - sumB) / wF;
          const v = wB * wF * (mB - mF) * (mB - mF);
          if (v > maxVar) { maxVar = v; th = t; }
        }
        return th;
      };
      argList.forEach((blk) => {
        const margin = 12;
        const sx0 = Math.max(0, Math.floor(blk.ocrBBox.x - margin));
        const sy0 = Math.max(0, Math.floor(blk.ocrBBox.y - margin));
        const sx1 = Math.min(el.naturalWidth, Math.ceil(blk.ocrBBox.x + blk.ocrBBox.w + margin));
        const sy1 = Math.min(el.naturalHeight, Math.ceil(blk.ocrBBox.y + blk.ocrBBox.h + margin));
        const w = sx1 - sx0, h = sy1 - sy0;
        if (w <= 0 || h <= 0) { out.push({ blockIndex: blk.blockIndex, err: "empty-region" }); return; }
        const im = ctx.getImageData(sx0, sy0, w, h);
        const hist = new Array(256).fill(0), gray = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) {
          const r = im.data[i * 4], g = im.data[i * 4 + 1], b = im.data[i * 4 + 2];
          const v = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
          gray[i] = v; hist[v]++;
        }
        const th = otsu(hist, w * h);
        let nInk = 0, minX = w, minY = h, maxX = -1, maxY = -1;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (gray[y * w + x] <= th) {
              nInk++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
          }
        }
        out.push({
          blockIndex: blk.blockIndex,
          imageInk: nInk ? { x: sx0 + minX, y: sy0 + minY, w: maxX - minX + 1, h: maxY - minY + 1, density: Math.round((nInk / (w * h)) * 1000) / 1000, threshold: th, region: { x: sx0, y: sy0, w: w, h: h } } : null
        });
      });
      return out;
    }, rows.map((r) => ({ blockIndex: r.blockIndex, ocrBBox: r.ocrBBox })));
    // node 侧合并 + 误差归因
    rows.forEach((r) => {
      const ii = (inkResults || []).find((x) => x.blockIndex === r.blockIndex) || {};
      const imgInk = ii.imageInk || null;
      const editorInk = r.editorInk;
      const srcB = r.ocrBBox;
      const srcC = { x: srcB.x + srcB.w / 2, y: srcB.y + srcB.h / 2 };
      const inkC = imgInk ? { x: imgInk.x + imgInk.w / 2, y: imgInk.y + imgInk.h / 2 } : null;
      const ediC = editorInk ? { x: undefined, y: undefined } : null;
      const rec2 = {
        blockIndex: r.blockIndex, text: r.text, fontSize: r.fontSize, usedFont: r.usedFont,
        sourceGeometry: { bbox: srcB, center: srcC },
        imageInk: imgInk ? { bbox: { x: imgInk.x, y: imgInk.y, w: imgInk.w, h: imgInk.h }, center: inkC, density: imgInk.density } : null,
        editorInk: editorInk
      };
      // sourceGeometryError：OCR 块 bbox vs Image Ink（问题A）
      if (imgInk) {
        rec2.sourceGeometryError = {
          center: Math.round(Math.hypot(srcC.x - inkC.x, srcC.y - inkC.y) * 100) / 100,
          width: Math.round(Math.abs(srcB.w - imgInk.w) * 100) / 100,
          height: Math.round(Math.abs(srcB.h - imgInk.h) * 100) / 100
        };
      }
      // reconstructionError：EditorInk vs ImageInk 目标（问题B；中心以 ImageInk 区域为目标）
      if (imgInk && editorInk) {
        const inkW = editorInk.inkWidth, inkH = editorInk.inkHeight;
        rec2.reconstructionError = {
          width: Math.round(Math.abs(inkW - imgInk.w) * 100) / 100,
          widthPct: imgInk.w ? Math.round((Math.abs(inkW - imgInk.w) / imgInk.w) * 1000) / 10 : null,
          height: Math.round(Math.abs(inkH - imgInk.h) * 100) / 100,
          heightPct: imgInk.h ? Math.round((Math.abs(inkH - imgInk.h) / imgInk.h) * 1000) / 10 : null
        };
      }
      out.blocks.push(rec2);
    });
    // MAE 汇总
    const sErr = out.blocks.filter((b) => b.sourceGeometryError);
    const rErr = out.blocks.filter((b) => b.reconstructionError);
    out.summary = {
      blocks: out.blocks.length,
      withImageInk: out.blocks.filter((b) => b.imageInk).length,
      withEditorInk: out.blocks.filter((b) => b.editorInk).length,
      sourceCenterMAE: sErr.length ? Math.round((sErr.reduce((a, b) => a + b.sourceGeometryError.center, 0) / sErr.length) * 100) / 100 : null,
      sourceWidthMAE: sErr.length ? Math.round((sErr.reduce((a, b) => a + b.sourceGeometryError.width, 0) / sErr.length) * 100) / 100 : null,
      sourceHeightMAE: sErr.length ? Math.round((sErr.reduce((a, b) => a + b.sourceGeometryError.height, 0) / sErr.length) * 100) / 100 : null,
      reconWidthMAE: rErr.length ? Math.round((rErr.reduce((a, b) => a + b.reconstructionError.width, 0) / rErr.length) * 100) / 100 : null,
      reconWidthMAEnt: rErr.length ? Math.round((rErr.reduce((a, b) => a + (b.reconstructionError.widthPct || 0), 0) / rErr.length) * 100) / 10 : null,
      reconHeightMAE: rErr.length ? Math.round((rErr.reduce((a, b) => a + b.reconstructionError.height, 0) / rErr.length) * 100) / 100 : null,
      attribution: null
    };
    if (sErr.length && rErr.length) {
      const sc = out.summary.sourceCenterMAE, rw = out.summary.reconWidthMAEnt;
      out.summary.attribution = sc != null && rw != null ? (sc > rw ? "SOURCE_GEOMETRY_PRIMARY" : "RECONSTRUCTION_PRIMARY") : "INSUFFICIENT";
    }
  } catch (e) { out.errors.push(String(e && e.message || e).slice(0, 400)); }
  finally { try { page && await page.close(); } catch (e) {} try { browser && await browser.close(); } catch (e) {} }
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, "source-vs-reconstruction.json"), JSON.stringify(out, null, 2));
  console.log("STAGE-9 P2A benchmark done -> " + path.join(REPORT_DIR, "source-vs-reconstruction.json"));
  console.log("summary:", JSON.stringify(out.summary));
})();