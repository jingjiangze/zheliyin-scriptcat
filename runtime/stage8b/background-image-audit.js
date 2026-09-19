// runtime/stage8b/background-image-audit.js — Stage 8B STEP 5：background-image 专项审计
// ---------------------------------------------------------------------
// 单一运行 = 一个 (route=background, angle, scale)。真实模板 252438。
// 流程：注入背景图(给定 angle/scale) → 捕获 ocrPrepareResult.geometry（含 aCoords，验证 Phase 0）
//       → 真实 OCR → 捕获 ocrCreate items（含 zy8bTargetQuad，验证 Phase A）
//       → 观察 ocrAdjust 校正流量与 ocrCreateResult.created[].geometry（验证 Phase B/C/D/E）
//       → 读回创建后 textbox 全 aCoords quad → runner 侧独立 compareTextGeometry → PASS/FAIL
//       → 记录 canvas/图片全字段 + viewport/zoom/retina（坐标合同 §1/§6）。
// 每 case 内嵌 3 个 OCR 块（大字标题/中号正文/小字页脚，行距分离）。
// env: ZY_CASES 默认 "A0,B10,C30,D45s05"；ZY_TARGET=252438|_ 。凭据 env ZY_BAIDU_AK/SK。
// 输出 runtime/reports/stage-8b/background-image-audit-{case}.json
// 零生产代码修改（仅页面世界探针/injectUserscript 的 @require 分支重写）。
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("../../node_modules/playwright");
const adapter = require("../scriptcat-adapter");
const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const EXT_ID = adapter.EXT_ID;
const USERSCRIPT_PATH = path.join(ROOT, "zheliyin-card-assistant.user.js");
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-8b");
const BRANCH = "stage-8b-ocr-reconstruction-engine";
const BAIDU_AK = process.env.ZY_BAIDU_AK || "";
const BAIDU_SK = process.env.ZY_BAIDU_SK || "";
const TARGET = process.env.ZY_TARGET || "252438";
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

const URL = TARGET === "88" || TARGET === "1040459"
  ? "https://diy.zheliyin.com/diyWeb/third/1040459/5368967/999/thirdDiyAdd.do"
  : "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";

// Case 矩阵（STEP 5 规格：B=10°，C=30°，D=45°×0.5；A=0° 基准）
const CASE_DEFS = [
  { id: "A0", angle: 0, scale: 1 },
  { id: "B10", angle: 10, scale: 1 },
  { id: "C30", angle: 30, scale: 1 },
  { id: "D45s05", angle: 45, scale: 0.5 }
];

const SZ_ROWS = [
  { t: "大字标题实例文字", y: 30, s: 40 },
  { t: "中号正文联系电话与邮箱地址", y: 110, s: 20 },
  { t: "小字页脚版权备注行", y: 200, s: 12 }
];
const SZ_W = 1000, SZ_H = 300;

function injectUserscript() {
  let code = fs.readFileSync(USERSCRIPT_PATH, "utf8");
  ["stage-8a-1-ocr-overflow-rotation", "stage-8a-ocr-audit", "stage-8b-ocr-reconstruction-engine", "stage-8a-2-rotation-policy-geometry", "test", "demo"].forEach((b) => {
    if (b === BRANCH) return;
    code = code.split(b + "/extension/src/").join(BRANCH + "/extension/src/");
    code = code.replace(new RegExp(b.replace(/[-]/g, "\\-") + "\\/zheliyin-card-assistant\\.user\\.js", "g"), BRANCH + "/zheliyin-card-assistant.user.js");
  });
  return code;
}

// runner 侧独立 compare（忠实复刻 text-fit.compareTextGeometry 阈值语义；页面世界无模块可直接引用）
function quadCenter(q) { let sx = 0, sy = 0; q.forEach((p) => { sx += p.x; sy += p.y; }); return { x: sx / q.length, y: sy / q.length }; }
function quadSize(q) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  return { width: (d(q[0], q[1]) + d(q[2], q[3])) / 2, height: (d(q[0], q[3]) + d(q[1], q[2])) / 2 };
}
function quadAngle(q) { return (Math.atan2(q[1].y - q[0].y, q[1].x - q[0].x) * 180) / Math.PI; }
function compareQuad(target, actual) {
  const centerTol = 2, widthTol = 3, heightTol = 3, angleTol = 0.5;
  const cT = quadCenter(target), cA = quadCenter(actual);
  const sT = quadSize(target), sA = quadSize(actual);
  const centerError = Math.hypot(cT.x - cA.x, cT.y - cA.y);
  const widthError = Math.abs(sT.width - sA.width);
  const heightError = Math.abs(sT.height - sA.height);
  const aT = quadAngle(target), aA = quadAngle(actual);
  const angleError = Math.abs(((aT - aA + 180) % 360 + 360) % 360 - 180);
  const failures = [];
  if (centerError > centerTol) failures.push("center");
  if (widthError > widthTol) failures.push("width");
  if (heightError > heightTol) failures.push("height");
  if (angleError > angleTol) failures.push("angle");
  return { pass: failures.length === 0, failures, centerError, widthError, heightError, angleError,
    target: { center: cT, size: sT, angle: aT }, actual: { center: cA, size: sA, angle: aA } };
}

(async () => {
  const out = { ts: new Date().toISOString(), stage: "STAGE-8B-STEP5", branch: BRANCH, url: URL, cases: [], errors: [] };
  let browser = null, page = null, opts = null;
  const ev = (fn, arg) => (arg === undefined ? page.evaluate(fn) : page.evaluate(fn, arg)).catch((e) => ({ err: String(e || "").slice(0, 200) }));
  const waitUntil = async (fnEval, desc, t0, poll) => { const t1 = Date.now(); while (Date.now() - t1 < t0) { const r = await ev(fnEval); if (r && r.ok) return { ok: true, ms: Date.now() - t1 }; await SLEEP(poll || 1500); } return { ok: false, desc }; };
  const canvasReady = () => () => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[0]) || null; return { ok: !!(d && d.canvas && typeof d.drawText === "function") }; };
  const render = () => ev((arg) => { const cv = document.createElement("canvas"); cv.width = arg.w; cv.height = arg.h; const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, arg.w, arg.h); ctx.fillStyle = "#000"; ctx.textBaseline = "top"; (arg.rows || []).forEach((r) => { ctx.font = r.s + "px SimHei, sans-serif"; ctx.fillText(r.t, 30, r.y); }); return cv.toDataURL("image/png"); }, { w: SZ_W, h: SZ_H, rows: SZ_ROWS });
  // 背景图注入（含 scale/angle），并先清活动选择（确保 ocrPrepare 命中 background route）
  const setBg = (ci, dataUrl, tf) => ev((arg) => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[arg.ci]) || null; const c = d && d.canvas; if (!c) return { ok: false, reason: "no canvas" }; try { if (c.discardActiveObject) c.discardActiveObject(); } catch (e) {} const f = (c.constructor && c.constructor.fabric) || window.fabric; return new Promise((res) => { const im = new Image(); im.onload = () => { try { const bg = new f.Image(im); bg.set({ scaleX: arg.tf.scaleX || 1, scaleY: arg.tf.scaleY || 1, angle: arg.tf.angle || 0, left: 0, top: 0 }); c.setBackgroundImage(bg, () => { try { c.setCoords && c.setCoords(); if (c.requestRenderAll) c.requestRenderAll(); } catch (e) {} res({ ok: true, w: bg.width, h: bg.height, nw: im.naturalWidth, nh: im.naturalHeight, left: bg.left, top: bg.top, scaleX: bg.scaleX, scaleY: bg.scaleY, angle: bg.angle, ac: bg.aCoords ? { tl: [bg.aCoords.tl.x, bg.aCoords.tl.y], tr: [bg.aCoords.tr.x, bg.aCoords.tr.y], br: [bg.aCoords.br.x, bg.aCoords.br.y], bl: [bg.aCoords.bl.x, bg.aCoords.bl.y] } : null }); }); } catch (e) { res({ ok: false, reason: String(e && e.message || e).slice(0, 100) }); } }; im.onerror = () => res({ ok: false, reason: "onerror" }); im.src = arg.dataUrl; }); }, { ci, dataUrl, tf });
  const bgSnap = () => ev(() => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0]; const c = d && d.canvas; if (!c) return null; try { c.setCoords && c.setCoords(); } catch (e) {} const bg = c.backgroundImage || null; let image = null; if (bg && String(bg.type) === "image") { const el = bg.getElement ? bg.getElement() : null; image = { naturalWidth: el ? el.naturalWidth : null, naturalHeight: el ? el.naturalHeight : null, width: bg.width, height: bg.height, scaleX: bg.scaleX, scaleY: bg.scaleY, left: bg.left, top: bg.top, angle: bg.angle, originX: bg.originX, originY: bg.originY, aCoords: bg.aCoords ? { tl: [bg.aCoords.tl.x, bg.aCoords.tl.y], tr: [bg.aCoords.tr.x, bg.aCoords.tr.y], br: [bg.aCoords.br.x, bg.aCoords.br.y], bl: [bg.aCoords.bl.x, bg.aCoords.bl.y] } : null }; }
    return { image, canvas: { width: c.width, height: c.height, viewportTransform: c.viewportTransform ? Array.from(c.viewportTransform) : null, zoom: c.getZoom ? c.getZoom() : null, retina: c.getRetinaScaling ? c.getRetinaScaling() : null }, diy: { currentFactWidth: d.currentFactWidth, currentFactHeight: d.currentFactHeight, currentSize: d.currentSize }, registry: d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr ? d.canvasObjInfo.canvasToProductObjArr.length : null }; });
  const clickOcr = () => ev(() => { const q = ["#zy-native-ocr-btn", "[data-zy-role=ocr]", ".zy-native-ocr-btn"]; for (const s of q) { const el = document.querySelector(s); if (el && el.offsetParent) { try { el.click(); return { clicked: true }; } catch (e) {} } } const all = Array.from(document.querySelectorAll("button,a,span,div")); for (const el of all) { if (!el.offsetParent) continue; if (String(el.textContent || "").trim().indexOf("识别当前图片") === 0) { try { el.click(); return { clicked: true }; } catch (e) {} } } return { clicked: false }; });
  const snapObjs = () => ev(() => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const c = vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas; return c ? c.getObjects().map((o) => o.uuid || o.multiUuid) : []; });
  // 读新建文字对象：全 aCoords quad + 业务字段
  const readNew = (ids) => ev((arg) => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0]; const c = d && d.canvas; if (!c) return { arr: [], canvas: null }; try { c.setCoords && c.setCoords(); } catch (e) {} const arr = []; c.getObjects().forEach((o) => { if (typeof o.text !== "string") return; const id = o.uuid || o.multiUuid; if (arg.ids && arg.ids.length && id != null && arg.ids.indexOf(id) < 0) return; if (!(String(o.zyOcrKey || "").indexOf("zy-ocr-") === 0 || o.zyOcrDiagnostics || o.zy8bTargetQuad || (arg.ids && arg.ids.length && id != null))) return; const ac = o.aCoords || null; const quad = ac && ac.tl ? [ac.tl, ac.tr, ac.br, ac.bl].map((p) => ({ x: p.x, y: p.y })) : null; arr.push({ id: id || null, text: String(o.text || "").slice(0, 14), zyOcrKey: o.zyOcrKey || null, left: o.left, top: o.top, width: o.width, height: o.height, scaleX: o.scaleX, scaleY: o.scaleY, fontSize: o.fontSize, angle: o.angle, originX: o.originX, quad: quad, biz: { locationX: o.locationX, locationY: o.locationY, locationWidth: o.locationWidth, locationHeight: o.locationHeight, locationRotation: o.locationRotation, loc: o.location ? { x: o.location.x, y: o.location.y, width: o.location.width, height: o.location.height, factWidth: o.location.factWidth, factHeight: o.location.factHeight, rotation: o.location.rotation } : null, pointSize: o.media && o.media.font ? o.media.font.pointSize : null } }); }); return { arr, canvas: { width: c.width, height: c.height, viewportTransform: c.viewportTransform ? Array.from(c.viewportTransform) : null, zoom: c.getZoom ? c.getZoom() : null, retina: c.getRetinaScaling ? c.getRetinaScaling() : null } }; }, { ids });
  const armHook = () => ev(() => {
    window.__b8cap = { prep: [], msg: [], adjust: [], adjustResult: [], createResult: null };
    const on = (e) => {
      if (!e.data) return;
      try {
        if (e.data.source === "zy-card-assistant-page" && e.data.type === "ocrPrepareResult") window.__b8cap.prep.push({ geo: e.data.geometry || null, pageOk: !!(e.data.page && e.data.page.ok) });
        if (e.data.source === "zy-card-assistant" && e.data.type === "ocrCreate") window.__b8cap.msg.push({ items: (e.data.items || []).map((it) => ({ blockIndex: it.blockIndex, text: String(it.text || "").slice(0, 10), left: it.left, top: it.top, fontSize: it.fontSize, width: it.width, height: it.height, angle: it.angle, hasTargetQuad: !!it.zy8bTargetQuad, targetQuad: it.zy8bTargetQuad || null })) });
        if (e.data.source === "zy-card-assistant" && e.data.type === "ocrAdjust") window.__b8cap.adjust.push({ items: (e.data.items || []).map((a) => ({ blockIndex: a.blockIndex, corrections: a.corrections || null })) });
        if (e.data.source === "zy-card-assistant-page" && e.data.type === "ocrCreateResult") window.__b8cap.createResult = { ok: e.data.ok, detectedBlocks: e.data.detectedBlocks, createdCount: e.data.createdCount, created: (e.data.created || []).map((c) => ({ blockIndex: c.blockIndex, geometry: c.geometry || null, text: String(c.text || "").slice(0, 10) })) };
        if (e.data.source === "zy-card-assistant-page" && e.data.type === "ocrAdjustResult") window.__b8cap.adjustResult.push({ items: (e.data.items || []).map((r) => ({ blockIndex: r.blockIndex, ok: r.ok, error: r.error, geometry: r.geometry || null })) });
      } catch (e2) {}
    };
    window.addEventListener("message", on);
    window.__b8capOn = on;
    return { ok: true };
  });
  const readHook = () => ev(() => (window.__b8cap || { prep: [], msg: [], adjust: [], adjustResult: [], createResult: null }));
  const rollback = (tag) => ev((arg) => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); let removed = 0; (vo && vo.totalCanvasArray || []).forEach((d) => { const c = d && d.canvas; if (!c) return; const objs = c.getObjects().filter((o) => o && (String(o.multiUuid || "").indexOf(arg.tag) === 0 || String(o.zyOcrKey || "").indexOf("zy-ocr-") === 0)); objs.forEach((o) => { try { const li = d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr ? d.canvasObjInfo.canvasToProductObjArr.indexOf(o) : -1; if (li >= 0) d.canvasObjInfo.canvasToProductObjArr.splice(li, 1); c.remove(o); } catch (e) {} }); removed += objs.length; }); try { if (vo && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas && vo.totalCanvasArray[0].canvas.requestRenderAll) vo.totalCanvasArray[0].canvas.requestRenderAll(); } catch (e) {} return { ok: true, removed }; }, tag);

  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1440, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    opts = browser.pages()[0];
    await opts.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await SLEEP(2000);
    const all = await adapter.getAllScripts(opts);
    for (const s of (all || []).filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(opts, s.uuid); } catch (e) {} }
    await adapter.installByCode(opts, { uuid: "zheliyin-8b-step5-" + Date.now(), code: injectUserscript(), upsertBy: "user" });
    await SLEEP(1400);
    page = opts;
    out.console = [];
    page.on("console", (m) => { const t = m.text(); if (/\[zy-ocr\]/.test(t)) out.console.push(t.slice(0, 400)); });
    await opts.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await SLEEP(1200);
    if (BAIDU_AK && BAIDU_SK) { await ev((a) => { const ai = document.querySelector("#zy-baidu-ak-native") || document.querySelector("#zy-baidu-ak"); const si = document.querySelector("#zy-baidu-sk-native") || document.querySelector("#zy-baidu-sk"); const sb = document.querySelector("#zy-baidu-save-native") || document.querySelector("#zy-baidu-save"); if (!ai || !si || !sb) return { ok: false }; ai.value = a.ak; si.value = a.sk; try { sb.click(); } catch (e) {} return { ok: true }; }, { ak: BAIDU_AK, sk: BAIDU_SK }); await SLEEP(3000); }
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const w = await waitUntil(canvasReady(), "ready", 150000);
    if (!(w && w.ok)) throw new Error("editor not ready");
    await SLEEP(4000);
    const DU = await render();
    const dataUrl = typeof DU === "string" ? DU : DU.dataUrl;

    const cases = process.env.ZY_CASES ? process.env.ZY_CASES.split(",") : CASE_DEFS.map((c) => c.id);
    for (const cid of cases) {
      const def = CASE_DEFS.find((c) => c.id === cid) || { id: cid, angle: 0, scale: 1 };
      const rec = { id: def.id, angle: def.angle, scale: def.scale, steps: [], rows: [], hook: null, created: null, compare: [], errors: [] };
      out.cases.push(rec);
      try {
        const bg = await setBg(0, dataUrl, { angle: def.angle, scaleX: def.scale, scaleY: def.scale });
        rec.bgInjected = bg;
        await SLEEP(1500);
        const snap = await bgSnap();
        rec.bgSnap = snap;
        await armHook();
        rec.steps.push(await bgSnap());
        const before = await snapObjs();
        rec.beforeObjCount = (before || []).length;
        const cl = await clickOcr();
        if (!cl.clicked) { rec.errors.push("ocr button"); continue; }
        let last = null, done = false;
        const t0 = Date.now();
        for (;;) {
          await SLEEP(900);
          const r = await ev(() => { const el = document.querySelector("#zy-native-status"); const st = el ? String(el.textContent || "").trim() : null; return { st: st ? st.slice(0, 220) : null }; });
          const st = r && r.st;
          if (st && st !== last) { last = st; rec.status = (rec.status || []).concat([st]); }
          if (st && /已生成 \d+ 个文字|几何校验完成|未识别到文字|失败|滚/.test(st)) { done = true; break; }
          if (Date.now() - t0 > 120000) break;
          await SLEEP(900);
        }
        rec.done = done;
        await SLEEP(2000); // 让闭环校正（ocrAdjust）异步完成
        rec.hook = await readHook();
        // 创建对象（keep zy-ocr keyed）+ 独立 compare vs expected targetQuad
        const after = await snapObjs();
        const ids = (after || []).filter((id) => (before || []).indexOf(id) < 0);
        const rd = await readNew(ids);
        rec.created = rd.arr || [];
        rec.canvasSnap = rd.canvas || null;
        // runner 侧独立 compare：expected = ocrCreate item.zy8bTargetQuad；actual = created quad
        const items = (rec.hook.msg && rec.hook.msg.length ? rec.hook.msg[0].items : []) || [];
        items.forEach((it) => {
          const created = rec.created.find((o) => (o.zyOcrKey || "").indexOf("zy-ocr-" + it.blockIndex) === 0);
          if (it.hasTargetQuad && created && created.quad) {
            const cmp = compareQuad(it.targetQuad, created.quad);
            rec.compare.push({ blockIndex: it.blockIndex, text: created.text, pass: cmp.pass, failures: cmp.failures, errors: { center: Math.round(cmp.centerError * 100) / 100, width: Math.round(cmp.widthError * 100) / 100, height: Math.round(cmp.heightError * 100) / 100, angle: Math.round(cmp.angleError * 100) / 100 }, expected: { center: cmp.target.center, size: cmp.target.size, angle: cmp.target.angle }, actual: { center: cmp.actual.center, size: cmp.actual.size, angle: cmp.actual.angle } });
          }
        });
        rec.passSummary = { blocks: rec.compare.length, pass: rec.compare.filter((c) => c.pass).length, fail: rec.compare.filter((c) => !c.pass).length };
        const rb = await rollback("b8-");
        rec.rollback = rb;
        // 清背景图
        await ev(() => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const c = vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas; if (c) { try { c.setBackgroundImage(null); if (c.requestRenderAll) c.requestRenderAll(); } catch (e) {} } return { ok: true }; });
        await SLEEP(1500);
      } catch (e) { rec.errors.push(String(e && e.message || e).slice(0, 300)); }
    }
  } catch (e) { out.errors.push(String(e && e.message || e).slice(0, 400)); }
  finally { try { page && await page.close(); } catch (e) {} try { browser && await browser.close(); } catch (e) {} }
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const name = "background-image-audit-" + (process.env.ZY_CASES || "A0,B10,C30,D45s05").replace(/[,\/]/g, "-") + ".json";
  fs.writeFileSync(path.join(REPORT_DIR, name), JSON.stringify(out, null, 2));
  console.log("STAGE-8B STEP5 done cases=" + out.cases.length + " errors=" + out.errors.length + " -> " + path.join(REPORT_DIR, name));
  console.log("summary: " + out.cases.map((c) => c.id + "=" + (c.passSummary ? (c.passSummary.pass + "/" + c.passSummary.blocks) : "n/a")).join(" "));
})();