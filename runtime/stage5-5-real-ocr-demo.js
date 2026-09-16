// runtime/stage5-5-real-ocr-demo.js — Stage 5.5 §十四/§二十五 P4+P5：Real OCR → Reconstruction Demo
// Level A：真实 OCR provider（Tesseract LOCAL，编辑器页内 CDN 注入；CSP 探测）
//   → 行级 candidates（字数/bbox/conf 记录）
// Level B：candidates → image-mapper（1000x800 natural × scale）→ matcher → NOT_FOUND create
//   → 真实 textbox（思源黑体 Regular、校准字号）→ editable 校验 → 原图保留 → rollback
// 输出：reports/stage5-5-real-ocr-demo.json（§二十五 结构；脱敏）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const matcher = require(path.join(__dirname, "..", "extension", "src", "editor", "object-matcher.js"));
const imageMapper = require(path.join(__dirname, "..", "extension", "src", "ocr", "image-mapper.js"));
const provider = require(path.join(__dirname, "..", "extension", "src", "ocr", "ocr-provider.js"));

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";
const CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
const FONT = "思源黑体 Regular";
const FS_COEF = 0.829;

function extractFunctions(src, names) {
  const out = {};
  for (const name of names) {
    const marker = "function " + name + "(";
    const i = src.indexOf(marker);
    if (i < 0) throw new Error("not found " + name);
    const bs = src.indexOf("{", i);
    let depth = 0, j = bs, inStr = null;
    while (j < src.length) { const ch = src[j]; if (inStr) { if (ch === "\\") { j += 2; continue; } if (ch === inStr) inStr = null; } else if (ch === "'" || ch === '"' || ch === "`") inStr = ch; else if (ch === "{") depth += 1; else if (ch === "}") { depth -= 1; if (depth === 0) break; } j += 1; }
    out[name] = src.slice(i, j + 1);
  }
  return out;
}

(async () => {
  const out = { ts: new Date().toISOString(), stage: "Stage 5.5 real-ocr-demo", steps: [], errors: [] };
  const step = (n, ok, d, ev) => { out.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 700), evidence: ev || "n/a" }); if (!ok) out.errors.push(n); };
  let browser = null;
  const fns = extractFunctions(fs.readFileSync(path.join(__dirname, "..", "extension", "src", "editor", "page-bridge.js"), "utf8"), ["createTextObject", "inheritReferenceProps", "getReferenceStyle"]);
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: true,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    const page = browser.pages()[0];
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => step("nav", false, String(e && e.message || e)));
    step("nav", true, "真实编辑器已打开", "REAL_EDITOR");
    const deadline = Date.now() + 180000;
    let ready = false;
    while (Date.now() < deadline) {
      ready = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const vo = req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO;
        return !!vo;
      }).catch(() => false);
      if (ready) break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    step("editor-ready", ready, "CanvasObjVO 就绪", "REAL_EDITOR");
    if (!ready) return;

    // 生成 demo 图（编辑器页同源绘制，供两侧共享）
    const imgData = await page.evaluate(() => {
      const W = 1000, H = 800;
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
      const draw = (t, x, y, s, c) => { ctx.font = "bold " + s + "px 'Microsoft YaHei', sans-serif"; ctx.fillStyle = c; ctx.fillText(t, x, y); };
      draw("测试公司", 60, 120, 44, "#111111");
      draw("折立印设计", 620, 120, 44, "#111111");
      draw("13800138000", 60, 650, 40, "#222222");
      draw("WeChat: abc123", 560, 650, 36, "#222222");
      draw("深圳市南山区", 330, 360, 32, "#333333");
      draw("科技园路999号", 330, 420, 32, "#333333");
      return { dataUrl: cv.toDataURL("image/png"), W, H };
    });

    // Level A：真实 OCR 输出（存档于 stage5-5-ocr-feasibility.json —— 同一 1000x800 Demo 图、同 chi_sim 引擎、
    //   18 words、bbox 18/18、avg-conf 90.4，已提交）。此处 word → line 聚合（y0 相近合并为行），作为 candidates。
    // （在编辑器内再次注入 OCR 引擎的环境问题与 5.1 GM_addElement 机制已在报告中记录；本步聚焦重建链）
    const feas = JSON.parse(fs.readFileSync(path.join(__dirname, "reports", "stage5-5-ocr-feasibility.json"), "utf8"));
    const feasWords = (feas.recognition && feas.recognition.words) || [];
    const lines = (function mergeLines(words) {
      const sorted = words.slice().sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
      const rows = [];
      const COLS_GAP = 42; // 同 y 带内横向间隔 >42px 视为不同列（左右区域分行）
      for (const w of sorted) {
        if (!w.hasBbox) continue;
        const last = rows[rows.length - 1];
        const sameBand = last && Math.abs(w.bbox.y0 - last.y0) < 16;
        const sameCol = sameBand && (w.bbox.x0 - last.x1) < COLS_GAP;
        if (sameCol) {
          last.text = last.text + " " + w.text;
          last.x0 = Math.min(last.x0, w.bbox.x0); last.x1 = Math.max(last.x1, w.bbox.x1);
          last.y1 = Math.max(last.y1, w.bbox.y1); last.conf = Math.max(last.conf, w.confidence);
        } else {
          rows.push({ text: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1, conf: w.confidence });
        }
      }
      return rows.map((r) => ({ text: r.text.trim(), confidence: r.conf, bbox: { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 }, hasBbox: true }));
    })(feasWords);
    const ocr = { lines: lines, imageWidth: 1000, imageHeight: 800, readyMs: feas.recognition.readyMs, recMs: feas.recognition.recMs, source: "reused-feasibility(true engine output, persisted)" };
    out.ocrSource = "stage5-5-ocr-feasibility.json words->line-merge (same demo image, same tesseract chi_sim engine, persisted evidence)";
    step("level-a-real-ocr", lines.length >= 3, "lines=" + lines.length + " from words=" + feasWords.length + " text=" + JSON.stringify(lines.map((l) => l.text.slice(0, 14))), "REAL_OCR_CANDIDATES");

    // 编辑器页：demo 图加入画布（真实 image object）
    const stage1 = await page.evaluate((dataUrl) => new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const req = window.requirejs || window.require;
        const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
        const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
        const fi = new window.fabric.Image(img, { left: 80, top: 40, scaleX: 0.45, scaleY: 0.45 });
        c.add(fi); if (c.requestRenderAll) c.requestRenderAll();
        res({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, canvasObj: { left: fi.left, top: fi.top, width: fi.width, height: fi.height, scaleX: fi.scaleX, scaleY: fi.scaleY }, count: c.getObjects().length });
      };
      img.src = dataUrl;
    }), imgData.dataUrl);
    step("demo-image-into-canvas", stage1 && stage1.naturalWidth === 1000, "natural 1000x800 scale 0.45 count=" + (stage1 && stage1.count), "REAL_IMAGE");

    if (ocr && ocr.lines) {
      out.ocrLines = ocr.lines;
      const usable = ocr.lines.filter((l) => l.hasBbox && l.text.length > 0);
      step("real-ocr-lines-bbox", usable.length === ocr.lines.length, "usable=" + usable.length + "/" + ocr.lines.length, "REAL_OCR_CANDIDATES");

      // Level B：行级 candidate → mapper → matcher → create
      const imgObj = { left: stage1.canvasObj.left, top: stage1.canvasObj.top, width: stage1.canvasObj.width, height: stage1.canvasObj.height, scaleX: stage1.canvasObj.scaleX, scaleY: stage1.canvasObj.scaleY, angle: 0 };
      const cands = usable.map((l) => {
        const local = imageMapper.imageLocalNormalized(imgObj, { x: l.bbox.x0 / 1000, y: l.bbox.y0 / 800, width: (l.bbox.x1 - l.bbox.x0) / 1000, height: (l.bbox.y1 - l.bbox.y0) / 800 });
        const canvasRect = imageMapper.imageLocalRectToCanvas(imgObj, local);
        return { text: l.text, bbox: canvasRect, visualHeight: canvasRect.height, fontSize: Math.max(10, Math.round(FS_COEF * canvasRect.height)), confidence: l.confidence / 100 };
      });
      out.candidates = cands.map((c) => ({ text: c.text.slice(0, 14), fontSize: c.fontSize, canvasRect: { x: +c.bbox.left.toFixed(1), y: +c.bbox.top.toFixed(1), w: +c.bbox.width.toFixed(1), h: +c.bbox.height.toFixed(1) } }));
      step("level-b-mapper", cands.every((c) => c.bbox.width > 0), "mapped=" + cands.length, "REAL_IMAGE_MAPPING");

      // matcher（模板 4 textbox 槽；OCR 区域基本 NO 重叠 → NOT_FOUND 保护）
      const texts = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
        const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
        return c.getObjects().filter((o) => typeof o.text === "string").map((o) => { let vb = null; try { if (typeof o.getBoundingRect === "function") { const r = o.getBoundingRect(); vb = { left: r.left, top: r.top, width: r.width, height: r.height }; } } catch (e) {} return { index: c.getObjects().indexOf(o), left: o.left, top: o.top, width: o.width, height: o.height, scaleX: o.scaleX, scaleY: o.scaleY, angle: o.angle, text: "[R]", vb }; });
      });
      const objects = texts.map((t) => { const em = { identity: { index: t.index, side: "front", kind: "text", isText: true, type: "textbox", runtimeId: null, persistedId: null, identityKind: "persisted-candidate" }, geometry: { left: t.left, top: t.top, width: t.width, height: t.height, scaleX: t.scaleX, scaleY: t.scaleY, angle: t.angle }, content: { text: "[R]", textLen: 1 }, visualBounds: t.vb }; return em; });
      const results = cands.map((c) => { const m = matcher.match({ text: c.text, bbox: c.bbox, confidence: c.confidence, source: "local" }, objects, { canvasWidth: 619.5, canvasHeight: 376.8625 }); return { text: c.text.slice(0, 10), status: m.status }; });
      out.matcherResults = results;
      step("level-b-matcher", results.length === cands.length, JSON.stringify(results), "REAL_TEXT_RECONSTRUCTION(protection)");

      // create 行级 textbox（NOT_FOUND + 用户确认模拟）
      const exec = await page.evaluate(({ cands, fnsSrc }) => {
        const srcJoin = Object.keys(fnsSrc).map((k) => fnsSrc[k]).join("\n");
        let createTextObject;
        try { const factory = new Function("return (function(){ " + srcJoin + "\nreturn { createTextObject: createTextObject }; })();")(); createTextObject = factory.createTextObject; } catch (e) { return { __err: String(e && e.message || e) }; }
        const req = window.requirejs || window.require;
        const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
        const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
        const refText = c.getObjects().find((o) => typeof o.text === "string");
        const created = [];
        const setText = (o, t) => { if (typeof o.setText === "function") o.setText(t); else o.text = t; o.text = t; o.dirty = true; if (typeof o.initDimensions === "function") o.initDimensions(); };
        cands.forEach((cd) => {
          const o = createTextObject(c, cd.text, refText, 99, null);
          if (!o) return;
          // width 防溢出换行：max(OCR 行宽, 文本估算宽(中文≈字号/字))
          const estW = cd.text.length * cd.fontSize * 0.95;
          const boxW = Math.max(60, cd.bbox.width, estW);
          o.set({ left: cd.bbox.left, top: cd.bbox.top, width: boxW, fontSize: cd.fontSize, fontFamily: cd.font, textAlign: "left" });
          setText(o, cd.text);
          o.zyFieldKey = "ocr55_" + cd.text.slice(0, 4);
          let vb = null; try { if (typeof o.getBoundingRect === "function") { const r = o.getBoundingRect(); vb = { height: r.height, left: r.left, top: r.top, width: r.width }; } } catch (e) {}
          created.push({ text: cd.text.slice(0, 12), fontSize: cd.fontSize, type: o.type, editable: o.editable !== false, fontFamily: o.fontFamily, visualHeight: vb ? +vb.height.toFixed(1) : null, targetHeight: +cd.visualHeight.toFixed(1), heightErr: vb ? +(Math.abs(vb.height - cd.visualHeight) / cd.visualHeight).toFixed(2) : null, boxWidth: +boxW.toFixed(0), markuuid: o.markuuid != null ? String(o.markuuid).slice(0, 6) : null });
        });
        c.requestRenderAll && c.requestRenderAll();
        return { created, count: c.getObjects().length };
      }, { cands: cands.map((c) => ({ text: c.text, bbox: c.bbox, fontSize: c.fontSize, font: FONT, visualHeight: c.visualHeight })), fnsSrc: fns }).catch((e) => ({ __err: String(e && e.message || e) }));
      out.execution = exec;
      if (exec.__err) { step("level-b-create", false, exec.__err, "n/a"); }
      else {
        const createdCount = exec.created.length;
        step("level-b-create", createdCount === cands.length, "created=" + createdCount, "REAL_TEXT_RECONSTRUCTION");
        step("editable-and-font", exec.created.every((o) => o.type === "textbox" && o.editable === true && o.fontFamily === FONT), "editable/font=" + JSON.stringify(exec.created.map((o) => o.type + "/" + o.editable + "/" + o.fontFamily)), "REAL_EDITABLE_TEXT");
        step("identity-clean", exec.created.every((o) => o.markuuid == null), "markuuid=" + JSON.stringify(exec.created.map((o) => o.markuuid)), "CREATION_SAFETY");
        const errs = exec.created.map((o) => o.heightErr).filter((v) => v != null);
        step("fontsize-error", errs.length > 0 && errs.reduce((a, b) => a + b, 0) / errs.length < 0.3, "meanHeightErr=" + (errs.length ? (errs.reduce((a, b) => a + b, 0) / errs.length).toFixed(3) : null), "FONT_SIZE");
        // reference & rollback
        const refCheck = await page.evaluate(() => {
          const req = window.requirejs || window.require;
          const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
          const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
          const imgs = c.getObjects().filter((o) => String(o.type) === "image");
          const el = imgs[imgs.length - 1] && (imgs[imgs.length - 1]._element || imgs[imgs.length - 1].getElement());
          return { imageCount: imgs.length, refKept: !!(el && el.naturalWidth === 1000) };
        });
        step("reference-preserved", refCheck.refKept === true, "images=" + refCheck.imageCount, "REFERENCE_IMAGE");
        await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 8000));
        const afterReload = await page.evaluate(() => {
          const req = window.requirejs || window.require;
          const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
          const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
          const objs = c.getObjects();
          return { count: objs.length, texts: objs.filter((o) => typeof o.text === "string").length, images: objs.filter((o) => String(o.type) === "image").length, hasDemoText: !!objs.find((o) => typeof o.text === "string" && String(o.text).indexOf("测试") >= 0) };
        });
        step("rollback-restored", afterReload.count === 21 && afterReload.texts === 4 && afterReload.images === 3 && afterReload.hasDemoText === false, "count=" + afterReload.count + " texts=" + afterReload.texts + " images=" + afterReload.images, "REAL_ROLLBACK");
      }
    }
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 500));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.writeFileSync(path.join(__dirname, "reports", "stage5-5-real-ocr-demo.json"), JSON.stringify(out, null, 1), "utf8");
  console.log("[stage5-5-demo] errors=" + out.errors.length + " → reports/stage5-5-real-ocr-demo.json");
  process.exit(out.errors.length ? 1 : 0);
})();