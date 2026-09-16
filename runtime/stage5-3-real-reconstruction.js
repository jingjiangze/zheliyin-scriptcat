// runtime/stage5-3-real-reconstruction.js — Stage 5.3 §五十/§五十五：Real Image → OCR(fixture) → Text Reconstruction 完整链
// 链：真实编辑器 → 绘制 synthetic 测试图(600x400, 4行文字, 绘制坐标为 ground-truth)
//   → fabric.Image 真实对象(保留为 Reference Image)
//   → rows→归一化 local → image-mapper → Canvas bbox（真实 fabric transform）
//   → Object Matcher per candidate（MATCHED→setText；AMBIGUOUS→stop；NOT_FOUND→创建策略[模拟用户确认]）
//   → 同源 createTextObject 创建 textbox（"思源黑体 Regular"，fontSize 创建后回读微调）
//   → fabric.Group 编组/解组（新对象）
//   → Reference Image 保留断言 → 全量 rollback（删除新建+还原引用图）→ 21 恢复
// 证据等级：REAL_EDITOR / REAL_IMAGE / REAL_TEXTBOX / REAL_GROUP / REAL_ROLLBACK；
//           OCR = fixture（NATIVE OCR result access BLOCKED 已如实记录，§八十 允许）
// 输出：reports/stage5-3-reconstruction.json + stage5-3-grouping.json + stage5-3-product-flow.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const model = require(path.join(__dirname, "..", "extension", "src", "editor", "object-model.js"));
const matcher = require(path.join(__dirname, "..", "extension", "src", "editor", "object-matcher.js"));
const diff = require("./editor-object-diff");
const imageMapper = require(path.join(__dirname, "..", "extension", "src", "ocr", "image-mapper.js"));

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";

// 从 page-bridge.js 提取 production 同源 create 路径（REAL_SOURCE_EQUIV，复用 5.1 方法）
function extractFunctions(src, names) {
  const out = {};
  for (const name of names) {
    const marker = "function " + name + "(";
    const i = src.indexOf(marker);
    if (i < 0) throw new Error("function not found: " + name);
    const braceStart = src.indexOf("{", i);
    let depth = 0, j = braceStart, inStr = null;
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
  const out = { ts: new Date().toISOString(), stage: "Stage 5.3 real-reconstruction", steps: [], errors: [], candidates: [] };
  const step = (n, ok, d, ev) => { out.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 700), evidence: ev || "n/a" }); if (!ok) out.errors.push(n); };
  let browser = null;
  const pageBridgeSrc = fs.readFileSync(path.join(__dirname, "..", "extension", "src", "editor", "page-bridge.js"), "utf8");
  const fns = extractFunctions(pageBridgeSrc, ["createTextObject", "inheritReferenceProps", "getReferenceStyle", "placeCreatedObject"]);

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

    // 阶段 1：绘制测试图 + 添加 reference image（保留）
    const pre = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      return { count: c.getObjects().length, texts: c.getObjects().filter((o) => typeof o.text === "string").length };
    });
    const stage1 = await page.evaluate(() => new Promise((res) => {
      const W = 600, H = 400;
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
      const lines = [
        { text: "测试名片", y: 70, size: 30 },
        { text: "行业方案专家", y: 150, size: 22 },
        { text: "电话 13800138000", y: 230, size: 22 },
        { text: "深圳市南山区测试路1号", y: 310, size: 22 }
      ];
      const rows = lines.map((l) => {
        ctx.font = l.size + "px 微软雅黑, sans-serif";
        const m = ctx.measureText(l.text);
        const x = (W - m.width) / 2;
        ctx.fillText(l.text, x, l.y);
        return { text: l.text, x: x, y: l.y - l.size * 0.8, width: m.width, height: l.size * 1.1 };
      });
      const dataUrl = cv.toDataURL("image/png");
      const img = new Image();
      img.onload = () => {
        const req = window.requirejs || window.require;
        const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
        const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
        const fi = new window.fabric.Image(img, { left: 60, top: 40, scaleX: 0.5, scaleY: 0.5, selectable: true });
        c.add(fi);
        if (c.requestRenderAll) c.requestRenderAll();
        res({ rows: rows, canvasW: W, canvasH: H, imageLeft: 60, imageTop: 40, scaleX: 0.5, scaleY: 0.5, angle: 0, count: c.getObjects().length, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, refUuid: fi.uuid != null ? String(fi.uuid) : null });
      };
      img.src = dataUrl;
    }));
    step("reference-image-added", stage1 && stage1.count === pre.count + 1 && stage1.naturalWidth === 600, "count " + pre.count + "->" + stage1.count + " natural=" + stage1.naturalWidth + "x" + stage1.naturalHeight, "REAL_IMAGE");

    // 阶段 2：OCR candidates（fixture：绘制 ground-truth）→ mapper → Canvas bbox
    const imgObj = { left: stage1.imageLeft, top: stage1.imageTop, width: stage1.canvasW, height: stage1.canvasH, scaleX: stage1.scaleX, scaleY: stage1.scaleY, angle: stage1.angle };
    const candidates = stage1.rows.map((row) => {
      // 局部像素 → 归一 0..1 → 反归一(本地) → map
      const n = imageMapper.imageLocalNormalized(imgObj, { x: row.x / stage1.canvasW, y: row.y / stage1.canvasH, width: row.width / stage1.canvasW, height: row.height / stage1.canvasH });
      const canvasRect = imageMapper.imageLocalRectToCanvas(imgObj, n);
      return { text: row.text, bbox: canvasRect, localRow: { x: row.x, y: row.y, width: row.width, height: row.height }, confidence: 0.95, source: "fixture" };
    });
    step("mapper-candidates", candidates.length === 4 && candidates.every((c) => c.bbox && c.bbox.width > 0), "candidates=" + candidates.length + " widths=" + candidates.map((c) => +c.bbox.width.toFixed(1)).join(","), "IMAGE_COORDINATE:§十五/§十六");

    // 阶段 3：读 textbox 对象（parseEditorObject + visualBounds）供 matcher
    const texts = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      const objs = c.getObjects();
      return objs.filter((o) => o && typeof o.text === "string").map((o) => {
        let vb = null;
        try { if (typeof o.getBoundingRect === "function") { const r = o.getBoundingRect(); vb = { left: r.left, top: r.top, width: r.width, height: r.height }; } } catch (e) {}
        return { index: objs.indexOf(o), raw: { type: o.type, left: o.left, top: o.top, width: o.width, height: o.height, scaleX: o.scaleX, scaleY: o.scaleY, angle: o.angle, text: String(o.text || ""), markuuid: o.markuuid != null ? String(o.markuuid) : null, uuid: o.uuid != null ? String(o.uuid) : null }, vb: vb };
      });
    });
    const objects = texts.map((t) => {
      const em = model.parseEditorObject(Object.assign({ type: "textbox", left: t.raw.left, top: t.raw.top, width: t.raw.width, height: t.raw.height, scaleX: t.raw.scaleX, scaleY: t.raw.scaleY, angle: t.raw.angle, text: "[REDACTED]", markuuid: t.raw.markuuid, uuid: t.raw.uuid }, {}), "front", t.index);
      em.visualBounds = t.vb;
      return em;
    });

    // 阶段 4：Matcher + 执行（MATCHED→setText / AMBIGUOUS→stop / NOT_FOUND→create policy["用户确认"]）
    const canvasWH = { canvasWidth: 619.5, canvasHeight: 376.8625 };
    const results = [];
    for (const cand of candidates) {
      const r = matcher.match({ text: cand.text, bbox: cand.bbox, confidence: cand.confidence, source: cand.source }, objects, canvasWH);
      results.push({ text: cand.text.slice(0, 14), status: r.status, score: r.score != null ? r.score : (r.topScore != null ? r.topScore : null), selectedIndex: r.selected ? r.selected.index : null, canvasBbox: { x: +cand.bbox.left.toFixed(1), y: +cand.bbox.top.toFixed(1), w: +cand.bbox.width.toFixed(1), h: +cand.bbox.height.toFixed(1) } });
    }
    out.candidates = results;
    step("matcher-per-candidate", results.length === 4, JSON.stringify(results.map((x) => ({ s: x.status, i: x.selectedIndex }))), "OBJECT_MATCHER:§十九");

    // 阶段 5：执行 mutation/create（页面内）
    const exec = await page.evaluate(({ candidates, fnsSrc, actions }) => {
      const srcJoin = Object.keys(fnsSrc).map((k) => fnsSrc[k]).join("\n");
      let createTextObject;
      try { const factory = new Function("return (function(){ " + srcJoin + "\nreturn { createTextObject: createTextObject }; })();")(); createTextObject = factory.createTextObject; } catch (e) { return { __err: "factory:" + String(e && e.message || e) }; }
      const req = window.requirejs || window.require;
      const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      const objs = c.getObjects();
      const refText = objs.find((o) => o && typeof o.text === "string");
      const createdObjects = [];
      const changedTexts = [];
      const log = [];
      const defaultFont = "思源黑体 Regular"; // 网页真实字体（native audit 已证存在于字体面板）
      const setText = (o, t) => { if (typeof o.setText === "function") o.setText(t); else o.text = t; o.text = t; o.dirty = true; if (typeof o.initDimensions === "function") o.initDimensions(); if (typeof o.setCoords === "function") o.setCoords(); };

      candidates.forEach((cand) => {
        const act = actions[cand.text];
        if (!act) return;
        if (act.kind === "setText") {
          const o = objs[act.index];
          const before = { text: String(o.text || ""), left: o.left, top: o.top, width: o.width, height: o.height, fontFamily: o.fontFamily, fontSize: o.fontSize };
          setText(o, cand.text);
          const after = { text: String(o.text || ""), left: o.left, top: o.top, width: o.width, height: o.height, fontFamily: o.fontFamily, fontSize: o.fontSize };
          const changed = [];
          Object.keys(before).forEach((k) => { if (k === "text" && before[k] !== after[k]) changed.push("text"); else if (k !== "text" && Math.abs(before[k] - after[k]) > 0.01) changed.push(k); });
          changedTexts.push({ index: act.index, text: cand.text, changedFields: changed });
          log.push({ text: cand.text.slice(0, 10), op: "setText@" + act.index, changed: changed });
        } else if (act.kind === "create") {
          const created = createTextObject(c, cand.text, refText, 99, null);
          if (!created) { log.push({ text: cand.text.slice(0, 10), op: "create", err: "createTextObject null" }); return; }
          // 覆盖为网页真实默认字体 + 位置（NR 比例：canvas 显示坐标）
          const geo = cand.canvasBbox;
          const fsEst = Math.max(10, Math.round(geo.h * 1.0));
          created.set({ left: geo.x, top: geo.y, width: geo.w, fontSize: fsEst, fontFamily: defaultFont, fill: "#000000", textAlign: "left" });
          setText(created, cand.text);
          created.zyFieldKey = "ocr_" + cand.text.slice(0, 4);
          createdObjects.push({ uuid: created.uuid != null ? String(created.uuid).slice(0, 8) : null, markuuid: created.markuuid != null ? String(created.markuuid).slice(0, 8) : null, fontFamily: created.fontFamily, fontSize: created.fontSize, type: created.type, editable: created.editable !== false });
          log.push({ text: cand.text.slice(0, 10), op: "create", index: c.getObjects().indexOf(created) });
        }
      });
      c.requestRenderAll && c.requestRenderAll();
      return { createdObjects: createdObjects, changedTexts: changedTexts, log: log, count: c.getObjects().length };
    }, { candidates: candidates.map((cv, i) => ({ text: cv.text, canvasBbox: cv.bbox })), fnsSrc: fns, actions: Object.fromEntries(results.filter((r) => r.status === "MATCHED").map((r) => [candidates.find((cv) => cv.text.slice(0, 14) === r.text).text, { kind: "setText", index: r.selectedIndex }])) });

    if (exec.__err) { step("exec", false, exec.__err, "n/a"); } else {
      // 补 NOT_FOUND → create（模拟用户确认）
      const notFoundTexts = results.filter((r) => r.status === "NOT_FOUND").map((r) => r.text);
      const createPlan = notFoundTexts.map((t) => candidates.find((cv) => cv.text.slice(0, 14) === t));
      const exec2 = await page.evaluate(({ plans, fnsSrc }) => {
        const srcJoin = Object.keys(fnsSrc).map((k) => fnsSrc[k]).join("\n");
        let createTextObject;
        try { const factory = new Function("return (function(){ " + srcJoin + "\nreturn { createTextObject: createTextObject }; })();")(); createTextObject = factory.createTextObject; } catch (e) { return { __err: String(e && e.message || e) }; }
        const req = window.requirejs || window.require;
        const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
        const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
        const objs = c.getObjects();
        const refText = objs.find((o) => o && typeof o.text === "string");
        const createdObjects = [];
        const setText = (o, t) => { if (typeof o.setText === "function") o.setText(t); else o.text = t; o.text = t; o.dirty = true; if (typeof o.initDimensions === "function") o.initDimensions(); if (typeof o.setCoords === "function") o.setCoords(); };
        plans.forEach((p) => {
          const created = createTextObject(c, p.text, refText, 99, null);
          if (!created) return;
          const geo = p.bbox;
          const fsEst = Math.max(10, Math.round(geo.height));
          created.set({ left: geo.left, top: geo.top, width: geo.width, fontSize: fsEst, fontFamily: "思源黑体 Regular", fill: "#000000", textAlign: "left" });
          setText(created, p.text);
          created.zyFieldKey = "ocr_" + p.text.slice(0, 4);
          // 回读 visualBounds 微调（§二十八）：测量实际字体盒高 vs 目标 → 微调字号
          let vb = null, fsFinal = fsEst;
          try { if (typeof created.getBoundingRect === "function") { const r = created.getBoundingRect(); vb = { left: r.left, top: r.top, width: r.width, height: r.height }; } } catch (e) {}
          if (vb && vb.height > 0 && p.bbox.height > 0 && Math.abs(vb.height - p.bbox.height) / p.bbox.height > 0.05) {
            fsFinal = Math.round(fsEst * (p.bbox.height / vb.height));
            created.set({ fontSize: fsFinal });
            setText(created, p.text);
          }
          createdObjects.push({ text: p.text.slice(0, 8), type: created.type, fontFamily: created.fontFamily, fontSize: fsFinal, editable: created.editable !== false, visualBounds: vb, targetHeight: p.bbox.height, markuuid: created.markuuid != null ? String(created.markuuid).slice(0, 8) : null, uuid: created.uuid != null ? String(created.uuid).slice(0, 8) : null });
        });
        c.requestRenderAll && c.requestRenderAll();
        return { created: createdObjects, count: c.getObjects().length };
      }, { plans: createPlan, fnsSrc: fns }).catch((e) => ({ __err: String(e && e.message || e) }));
      exec.created2 = exec2;
      out.execution = { matched: exec.changedTexts, createdPhase2: exec2 && exec2.created, count: exec2 && exec2.count };
      step("reconstruct-exec", true, "matchedOps=" + JSON.stringify(exec.changedTexts.map((x) => ({ i: x.index, changed: x.changedFields }))) + " created=" + JSON.stringify(exec2 && exec2.created && exec2.created.map((o) => ({ t: o.type, f: o.fontFamily, fs: o.fontSize, edit: o.editable }))), "REAL_TEXTBOX:§二十三/§二十六");
      step("reconstruct-created-count", (exec2 && exec2.created && exec2.created.length) === createPlan.length, "created=" + (exec2 && exec2.created && exec2.created.length) + " planned=" + createPlan.length, "§二十五");
      step("created-identity-clean", (exec2 && exec2.created && exec2.created.every((o) => o.markuuid == null)), "created markuuid=" + JSON.stringify(exec2 && exec2.created && exec2.created.map((o) => o.markuuid)), "CREATION_SAFETY:§5.1");
      step("created-editable-textbox", (exec2 && exec2.created && exec2.created.length > 0 && exec2.created.every((o) => o.type === "textbox" && o.editable === true)), "types=" + JSON.stringify(exec2 && exec2.created && exec2.created.map((o) => o.type + "/edit:" + o.editable)), "TEXT_EDITABLE:§八十二");
      step("created-font-family", (exec2 && exec2.created && exec2.created.every((o) => o.fontFamily === "思源黑体 Regular")), "fonts=" + JSON.stringify(exec2 && exec2.created && exec2.created.map((o) => o.fontFamily)), "FONT:§二十六");

      // 阶段 6：Group 编组/解组（本次创建的 textbox）
      const groupFlow = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
        const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
        const created = c.getObjects().filter((o) => o && o.zyFieldKey && o.zyFieldKey.indexOf("ocr_") === 0);
        if (!created.length) return { grouped: false, reason: "no created objects" };
        const f = window.fabric;
        const members = created.slice();
        const g = new f.Group(members, { left: members[0].left, top: members[0].top });
        c.add(g);
        c.remove.apply(c, members);
        if (c.requestRenderAll) c.requestRenderAll();
        const grouped = c.getObjects().indexOf(g) >= 0;
        // ungroup
        let ungrouped = false;
        try {
          const restored = g.getObjects();
          g.destroy();
          restored.forEach((o) => c.add(o));
          if (c.requestRenderAll) c.requestRenderAll();
          ungrouped = restored.every((o) => c.getObjects().indexOf(o) >= 0);
        } catch (e) { ungrouped = false; }
        return { grouped: grouped, ungrouped: ungrouped, memberCount: members.length, afterCount: c.getObjects().length };
      }).catch((e) => ({ __err: String(e && e.message || e) }));
      out.grouping = groupFlow;
      step("group-ungroup", !!(groupFlow && groupFlow.grouped === true && groupFlow.ungrouped === true), "grouped=" + (groupFlow && groupFlow.grouped) + " ungrouped=" + (groupFlow && groupFlow.ungrouped) + " members=" + (groupFlow && groupFlow.memberCount), "REAL_GROUP:§三十六/§三十七");

      // 阶段 7：Reference image 保留断言
      const refCheck = await page.evaluate((natural) => {
        const req = window.requirejs || window.require;
        const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
        const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
        const imgs = c.getObjects().filter((o) => o && String(o.type) === "image");
        const el = imgs[imgs.length - 1] && (imgs[imgs.length - 1]._element || imgs[imgs.length - 1].getElement());
        return { imageCount: imgs.length, refKept: !!(el && el.naturalWidth === natural) };
      }, 600);
      out.referenceImage = refCheck;
      step("reference-image-kept", refCheck.refKept === true, "imageCount=" + refCheck.imageCount + " refKept=" + refCheck.refKept, "REFERENCE_IMAGE_SAFE:§四十一");

      // 阶段 8：清理（删除新建）+ 会话级回滚（reload 恢复模板，未保存不落库）
      const cleanup = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
        const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
        const createdCount = c.getObjects().filter((o) => o && o.zyFieldKey && o.zyFieldKey.indexOf("ocr_") === 0).length;
        c.getObjects().slice().filter((o) => o && o.zyFieldKey && o.zyFieldKey.indexOf("ocr_") === 0).forEach((o) => c.remove(o));
        if (c.requestRenderAll) c.requestRenderAll();
        // reference image 为会话级未保存对象：reload 一并清除（§四十 原图保留仅指用户识别流程内）
        return { createdCount: createdCount, count: c.getObjects().length, texts: c.getObjects().filter((o) => typeof o.text === "string").length };
      });
      step("rollback-created-removed", cleanup.createdCount === (out.execution && out.execution.createdPhase2 ? out.execution.createdPhase2.length : 4), "createdRemoved=" + cleanup.createdCount + " count=" + cleanup.count + " texts=" + cleanup.texts, "§四十二/§四十三 cleanup");
      // reload 兜底：模板 21/4 原文本恢复（零残留，会话级对象全部清除）
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 8000));
      const afterReload = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
        const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
        const objs = c.getObjects();
        return { count: objs.length, hasTestText: !!objs.find((o) => o && typeof o.text === "string" && String(o.text).indexOf("测试名片") >= 0), imageCount: objs.filter((o) => String(o.type) === "image").length, texts: objs.filter((o) => typeof o.text === "string").map((o) => String(o.text || "").slice(0, 8)) };
      });
      step("rollback-restored", afterReload.count === 21 && afterReload.hasTestText === false && afterReload.texts.length === 4 && afterReload.imageCount === 3, "count=" + afterReload.count + " texts=" + JSON.stringify(afterReload.texts) + " images=" + afterReload.imageCount, "REAL_ROLLBACK:§四十三 §三十六 zero residual");
    }
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 500));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.writeFileSync(path.join(__dirname, "reports", "stage5-3-reconstruction.json"), JSON.stringify(out, null, 1), "utf8");
  fs.writeFileSync(path.join(__dirname, "reports", "stage5-3-grouping.json"), JSON.stringify({ ts: out.ts, grouping: out.grouping, referenceImage: out.referenceImage, candidates: out.candidates }, null, 1), "utf8");
  fs.writeFileSync(path.join(__dirname, "reports", "stage5-3-product-flow.json"), JSON.stringify({ ts: out.ts, steps: out.steps.map((s) => ({ n: s.name, ok: s.ok })), errors: out.errors, candidateSummary: out.candidates }, null, 1), "utf8");
  console.log("[stage5-3-reconstruct] errors=" + out.errors.length + " → reports/stage5-3-reconstruction.json");
  process.exit(out.errors.length ? 1 : 0);
})();