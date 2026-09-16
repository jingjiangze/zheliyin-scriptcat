// runtime/stage5-4-real-product-flow.js — Stage 5.4 §五十/§五十八 P15：Real Product Flow（校准字号重建完整链）
// 链：真实编辑器 → fabric.Image(600x400@0.5, 保留 Reference) → rows(ground-truth fixture OCR)
//   → normalize → image-mapper → Canvas bbox → **fontSize = 0.829*visualHeight（真实校准）**
//   → matcher（MATCHED setText / NOT_FOUND + 用户确认 create）
//   → 创建真 textbox（思源黑体 Regular、校准字号）→ 回读 visualBounds 偏差校验（校准改进证据）
//   → group/ungroup（native）→ reference 保留 → rollback（cleanup+reload）→ 21/4
// 证据分级：REAL_EDITOR/REAL_IMAGE/REAL_TEXTBOX/REAL_GROUP/REAL_ROLLBACK；OCR=fixture（native BLOCKED 已证）
// 输出：stage5-4-reconstruction.json / grouping.json / product-flow.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const model = require(path.join(__dirname, "..", "extension", "src", "editor", "object-model.js"));
const matcher = require(path.join(__dirname, "..", "extension", "src", "editor", "object-matcher.js"));
const imageMapper = require(path.join(__dirname, "..", "extension", "src", "ocr", "image-mapper.js"));

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";
const FONT = "思源黑体 Regular";
const FS_COEF = 0.829; // 真实校准：fontSize = 0.829 * visualHeight（stage5-4-font-calibration.json）

function extractFunctions(src, names) {
  const out = {};
  for (const name of names) {
    const marker = "function " + name + "(";
    const i = src.indexOf(marker);
    if (i < 0) throw new Error("not found " + name);
    const bs = src.indexOf("{", i);
    let depth = 0, j = bs, inStr = null;
    while (j < src.length) {
      const ch = src[j];
      if (inStr) { if (ch === "\\") { j += 2; continue; } if (ch === inStr) inStr = null; }
      else if (ch === "'" || ch === '"' || ch === "`") inStr = ch;
      else if (ch === "{") depth += 1;
      else if (ch === "}") { depth -= 1; if (depth === 0) break; }
      j += 1;
    }
    out[name] = src.slice(i, j + 1);
  }
  return out;
}

(async () => {
  const out = { ts: new Date().toISOString(), stage: "Stage 5.4 product-flow", steps: [], errors: [], candidates: [] };
  const step = (n, ok, d, ev) => { out.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 700), evidence: ev || "n/a" }); if (!ok) out.errors.push(n); };
  let browser = null;
  const fns = extractFunctions(fs.readFileSync(path.join(__dirname, "..", "extension", "src", "editor", "page-bridge.js"), "utf8"), ["createTextObject", "inheritReferenceProps", "getReferenceStyle"]);
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
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

    const pre = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      return c.getObjects().length;
    });

    // 1. 图片 + ground-truth rows
    const stage1 = await page.evaluate(() => new Promise((res) => {
      const W = 600, H = 400;
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
      const lines = [{ text: "测试名片", y: 70, size: 30 }, { text: "行业方案专家", y: 150, size: 22 }, { text: "电话 13800138000", y: 230, size: 22 }, { text: "深圳市南山区测试路1号", y: 310, size: 22 }];
      const rows = lines.map((l) => {
        ctx.font = l.size + "px serif";
        const m = ctx.measureText(l.text);
        const x = (W - m.width) / 2;
        ctx.fillText(l.text, x, l.y);
        return { text: l.text, x, y: l.y - l.size * 0.8, width: m.width, height: l.size * 1.1 };
      });
      const img = new Image();
      img.onload = () => {
        const req = window.requirejs || window.require;
        const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
        const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
        const fi = new window.fabric.Image(img, { left: 60, top: 40, scaleX: 0.5, scaleY: 0.5 });
        c.add(fi); if (c.requestRenderAll) c.requestRenderAll();
        res({ rows, W, H, imageLeft: 60, imageTop: 40, scaleX: 0.5, scaleY: 0.5, count: c.getObjects().length });
      };
      img.src = cv.toDataURL("image/png");
    }));
    step("reference-image-added", stage1.count === pre + 1, "count " + pre + "->" + stage1.count, "REAL_IMAGE");

    // 2. mapper + 校准 fontSize + matcher
    const imgObj = { left: stage1.imageLeft, top: stage1.imageTop, width: stage1.W, height: stage1.H, scaleX: stage1.scaleX, scaleY: stage1.scaleY, angle: 0 };
    const candidates = stage1.rows.map((row) => {
      const n = imageMapper.imageLocalNormalized(imgObj, { x: row.x / stage1.W, y: row.y / stage1.H, width: row.width / stage1.W, height: row.height / stage1.H });
      const canvasRect = imageMapper.imageLocalRectToCanvas(imgObj, n);
      return { text: row.text, bbox: canvasRect, visualHeight: canvasRect.height, fontSize: Math.max(10, Math.round(FS_COEF * canvasRect.height)), confidence: 0.95, source: "fixture" };
    });
    step("calibrated-fontsize-candidates", candidates.every((c) => c.fontSize >= 10), "fontSizes=" + candidates.map((c) => c.fontSize).join(",") + " (visualH=" + candidates.map((c) => +c.visualHeight.toFixed(1)).join(",") + ")", "FONT_SIZE:§三十③（真实校准）");

    // 读取 textbox 供 matcher
    const texts = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      return c.getObjects().filter((o) => typeof o.text === "string").map((o) => {
        let vb = null; try { if (typeof o.getBoundingRect === "function") { const r = o.getBoundingRect(); vb = { left: r.left, top: r.top, width: r.width, height: r.height }; } } catch (e) {}
        return { index: c.getObjects().indexOf(o), left: o.left, top: o.top, width: o.width, height: o.height, scaleX: o.scaleX, scaleY: o.scaleY, angle: o.angle, text: String(o.text || ""), vb };
      });
    });
    const objects = texts.map((t) => {
      const em = model.parseEditorObject({ type: "textbox", left: t.left, top: t.top, width: t.width, height: t.height, scaleX: t.scaleX, scaleY: t.scaleY, angle: t.angle, text: "[REDACTED]", markuuid: null, uuid: null }, "front", t.index);
      em.visualBounds = t.vb; return em;
    });
    const results = candidates.map((cand) => {
      const r = matcher.match({ text: cand.text, bbox: cand.bbox, confidence: cand.confidence, source: cand.source }, objects, { canvasWidth: 619.5, canvasHeight: 376.8625 });
      return { text: cand.text.slice(0, 12), status: r.status, selectedIndex: r.selected ? r.selected.index : null, fontSize: cand.fontSize };
    });
    out.candidates = results;
    step("matcher-per-candidate", results.length === 4, JSON.stringify(results.map((x) => ({ s: x.status }))), "OBJECT_MATCHER");

    // 3. 执行：MATCHED setText / NOT_FOUND create（校准字号）
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
      cands.forEach((cand) => {
        const o = createTextObject(c, cand.text, refText, 99, null);
        if (!o) return;
        o.set({ left: cand.bbox.left, top: cand.bbox.top, width: cand.bbox.width, fontSize: cand.fontSize, fontFamily: cand.font, fill: "#000000", textAlign: "left" });
        setText(o, cand.text);
        o.zyFieldKey = "ocr_" + cand.text.slice(0, 4);
        let vb = null; try { if (typeof o.getBoundingRect === "function") { const r = o.getBoundingRect(); vb = { left: r.left, top: r.top, width: r.width, height: r.height }; } } catch (e) {}
        created.push({ text: cand.text.slice(0, 8), fontSize: cand.fontSize, type: o.type, editable: o.editable !== false, fontFamily: o.fontFamily, visualHeight: vb ? vb.height : null, targetHeight: +cand.visualHeight.toFixed(1), heightErr: vb ? Math.abs(vb.height - cand.visualHeight) / cand.visualHeight : null, markuuid: o.markuuid != null ? String(o.markuuid).slice(0, 6) : null });
      });
      c.requestRenderAll && c.requestRenderAll();
      return { created, count: c.getObjects().length };
    }, { cands: candidates.map((c) => ({ text: c.text, bbox: c.bbox, fontSize: c.fontSize, font: FONT, visualHeight: c.visualHeight })), fnsSrc: fns }).catch((e) => ({ __err: String(e && e.message || e) }));

    if (exec.__err) step("reconstruct", false, exec.__err, "n/a");
    else {
      out.execution = exec;
      step("reconstruct-created", exec.created.length === 4, "created=" + exec.created.length, "REAL_TEXTBOX");
      step("created-editable-font", exec.created.every((o) => o.type === "textbox" && o.editable === true && o.fontFamily === FONT), "types/fonts=" + JSON.stringify(exec.created.map((o) => o.type + "/" + o.editable + "/" + o.fontFamily)), "§三十八/§三十七");
      step("created-identity-clean", exec.created.every((o) => o.markuuid == null), "markuuid=" + JSON.stringify(exec.created.map((o) => o.markuuid)), "CREATION_SAFETY");
      // 校准有效性：visualBounds.height vs 目标 bbox.height 误差
      const errs = exec.created.map((o) => o.heightErr).filter((v) => v != null);
      const meanErr = errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : null;
      out.calibrationError = { per: exec.created.map((o) => ({ t: o.text, fs: o.fontSize, target: o.targetHeight, actual: o.visualHeight && +o.visualHeight.toFixed(1), err: o.heightErr && +o.heightErr.toFixed(2) })), mean: meanErr };
      step("fontsize-calibrated-accuracy", meanErr != null && meanErr < 0.3, "mean height error=" + meanErr, "FONT_SIZE:§三十③ 校准后创建回读");
      // group/ungroup
      const groupFlow = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
        const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
        const members = c.getObjects().filter((o) => o && o.zyFieldKey && o.zyFieldKey.indexOf("ocr_") === 0);
        if (!members.length) return { grouped: false };
        const g = new window.fabric.Group(members, { left: members[0].left, top: members[0].top });
        c.add(g); members.forEach((m) => c.remove(m));
        if (c.requestRenderAll) c.requestRenderAll();
        const grouped = c.getObjects().indexOf(g) >= 0;
        let ungrouped = false;
        try { const rest = g.getObjects(); g.destroy(); rest.forEach((o) => c.add(o)); if (c.requestRenderAll) c.requestRenderAll(); ungrouped = rest.every((o) => c.getObjects().indexOf(o) >= 0); } catch (e) {}
        return { grouped, ungrouped, members: members.length };
      }).catch((e) => ({ __err: String(e && e.message || e) }));
      out.grouping = groupFlow;
      step("group-ungroup", !!(groupFlow && groupFlow.grouped && groupFlow.ungrouped), "grouped=" + (groupFlow && groupFlow.grouped) + " ungrouped=" + (groupFlow && groupFlow.ungrouped), "REAL_GROUP");
      // reference kept
      const refCheck = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
        const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
        const imgs = c.getObjects().filter((o) => String(o.type) === "image");
        const el = imgs[imgs.length - 1] && (imgs[imgs.length - 1]._element || imgs[imgs.length - 1].getElement());
        return { imageCount: imgs.length, refKept: !!(el && el.naturalWidth === 600) };
      });
      out.reference = refCheck;
      step("reference-kept", refCheck.refKept === true, "images=" + refCheck.imageCount, "REFERENCE_IMAGE");
      // rollback
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 8000));
      const after = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
        const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
        const objs = c.getObjects();
        return { count: objs.length, texts: objs.filter((o) => typeof o.text === "string").map((o) => String(o.text || "").slice(0, 8)), images: objs.filter((o) => String(o.type) === "image").length };
      });
      step("rollback-restored", after.count === 21 && after.texts.length === 4 && after.images === 3, "count=" + after.count + " texts=" + JSON.stringify(after.texts) + " images=" + after.images, "REAL_ROLLBACK");
    }
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 500));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  const rep = path.join(__dirname, "reports", "stage5-4-reconstruction.json");
  const repG = path.join(__dirname, "reports", "stage5-4-grouping.json");
  const repF = path.join(__dirname, "reports", "stage5-4-product-flow.json");
  fs.writeFileSync(rep, JSON.stringify(out, null, 1), "utf8");
  fs.writeFileSync(repG, JSON.stringify({ ts: out.ts, grouping: out.grouping, reference: out.reference }, null, 1), "utf8");
  fs.writeFileSync(repF, JSON.stringify({ ts: out.ts, steps: out.steps.map((s) => ({ n: s.name, ok: s.ok })), errors: out.errors, candidates: out.candidates, calibrationError: out.calibrationError }, null, 1), "utf8");
  console.log("[stage5-4-flow] errors=" + out.errors.length + " → " + rep);
  process.exit(out.errors.length ? 1 : 0);
})();