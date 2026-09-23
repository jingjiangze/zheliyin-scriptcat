// runtime/stage9/image-containment-audit.js — Stage 9 Commit 7：True Image Transform + Image Containment 真机审计
// ---------------------------------------------------------------------
// 模板 1234075（默认）。页面世界内联 image-space / image-containment 纯模块（唯一事实 = node 侧同源文件），
// 采集：图片 aCoords/natural/object 尺寸、effective source scale（真实模板 ≈0.5849，禁止用 geo.scaleX=1 当 truth）、
//       OCR block 内/外/部分越界 containment 判定、旋转图片 inverse-transform 判定、
//       targetQuad → 原生 drawText → 实测 aCoords 对比（创建前 requested / 创建后 actual placement error；创建后清理恢复）。
// 凭据：ZY_STAGE9_COOKIE 仅运行时注入（本 Commit 不需要 Baidu）。
// 报告：runtime/reports/stage-9/image-containment-audit.json（version=0.3.11.47）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("../../node_modules/playwright");
const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const EXT_ID = "ndcooeababalnlpkfedmmbbbgkljhpjf";
const USERSCRIPT_PATH = path.join(ROOT, "zheliyin-card-assistant.user.js");
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-9");
const adapter = require("../scriptcat-adapter");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const DEFAULT_URL = "https://diy.zheliyin.com/diyWeb/third/1234075/2114747/999/thirdDiyAdd.do";
const URL = process.env.ZY_URL || DEFAULT_URL;
const COOKIE_RAW = process.env.ZY_STAGE9_COOKIE || "";
const USERSCRIPT_VERSION = (/\/\/ @version\s+([\d.]+)/.exec(fs.readFileSync(USERSCRIPT_PATH, "utf8")) || [])[1] || "unknown";

function parseCookies(raw) {
  const out = [];
  String(raw || "").split(";").forEach((part) => {
    const eq = part.indexOf("=");
    if (eq <= 0) return;
    const name = part.slice(0, eq).trim();
    let value = part.slice(eq + 1).trim();
    if (!name || !value) return;
    value = value.replace(/^"|"$/g, "");
    out.push({ name, value, domain: ".diy.zheliyin.com", path: "/", expires: -1 });
  });
  return out;
}
function selfTest() {
  const t = (n, c) => { if (!c) throw new Error("SELFTEST FAIL " + n); console.log("[selftest] PASS " + n); };
  t("cookie-parse", parseCookies("a=1; b=2; c").length === 2);
  t("version-47", USERSCRIPT_VERSION === "0.3.11.47");
  const IC = require(path.join(ROOT, "extension", "src", "editor", "image-containment.js"));
  const T3 = [621.745 / 1063, 0, 0, 373.164 / 638, 0, 0];
  const es = IC.effectiveScaleOf(T3);
  t("selftest-scale-5849", es && Math.abs(es.effectiveScaleX - 0.5848) < 1e-3 && Math.abs(es.effectiveScaleY - 0.5849) < 1e-3);
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }
if (!COOKIE_RAW) console.warn("[image-containment] 未注入 ZY_STAGE9_COOKIE —— 回退持久 profile（可能过期）；cookiePresent=false");

const PAGE_MODULES = [
  fs.readFileSync(path.join(ROOT, "extension", "src", "editor", "image-space.js"), "utf8"),
  fs.readFileSync(path.join(ROOT, "extension", "src", "editor", "image-containment.js"), "utf8")
].join("\n;\n");
const RESOLVE_ENTRY = `
function resolveEntry() {
  const req = window.requirejs || window.require;
  const ctx = req && req.s && req.s.contexts && req.s.contexts._;
  const defs = (ctx && ctx.defined) || {};
  const CV = defs.CanvasObjVO || window.CanvasObjVO || null;
  if (!CV || !Array.isArray(CV.totalCanvasArray)) return { ok: false, reason: "no-canvasobjvo" };
  const total = CV.totalCanvasArray;
  if (!total.length) return { ok: false, reason: "empty-totalCanvasArray" };
  const unwrap = (v) => { if (!v) return null; if (typeof v.getObjects === "function") return v; return (v && v.canvas) || null; };
  let idx = -1;
  const CC = defs.CurrentCanvas || window.CurrentCanvas || null;
  if (CC && typeof CC.getCurrentCanvas === "function") { try { const cur = unwrap(CC.getCurrentCanvas()); if (cur) { for (let i = 0; i < total.length; i += 1) { if (unwrap(total[i]) === cur) { idx = i; break; } } } } catch (e) {} }
  if (idx < 0 && typeof CV.currentCanvasNum === "number" && CV.currentCanvasNum >= 1 && CV.currentCanvasNum <= total.length) idx = CV.currentCanvasNum - 1;
  if (idx < 0 && total.length === 1) idx = 0;
  if (idx < 0) return { ok: false, reason: "unresolved-current" };
  const entry = total[idx];
  const canvas = unwrap(entry) || null;
  return { ok: true, idx: idx, entry: entry, canvas: canvas, canvasDiy: (entry && typeof entry.drawText === "function") ? entry : null };
}
`;
// 图片侦察 + 有效缩放 + containment 四场景 + 受控创建对比（一次 evaluate 完成；对象创建后立即清理）
const PAGE_AUDIT = `
const r = resolveEntry();
const c = r.canvas;
const out = { image: null, effectiveScale: null, sourceScaleObjectProps: null, textboxCount: null, toolFields: { buildImageTransform: typeof buildImageTransform, isQuadInsideImage: typeof isQuadInsideImage, repairQuadCentered: typeof repairQuadCentered, quadTextGeometry: typeof quadTextGeometry, effectiveScaleOf: typeof effectiveScaleOf }, scenarios: [] };
if (!c) return { ok: false, reason: "no-canvas", out: out };
try { if (typeof c.setCoords === "function") c.setCoords(); } catch (e) {}
const imgs = (c.getObjects() || []).filter(function (o) { return o && String(o.type) === "image"; });
const tboxes = (c.getObjects() || []).filter(function (o) { return o && (String(o.type) === "textbox" || String(o.type) === "i-text" || String(o.type) === "text"); });
out.textboxCount = tboxes.length;
if (!imgs.length) return { ok: false, reason: "no-image-object", out: out };
const img = imgs[0];
const el = typeof img.getElement === "function" ? img.getElement() : (img._element || null);
out.image = { objectCount: imgs.length, index: 0, left: img.left, top: img.top, width: img.width, height: img.height, scaleX: img.scaleX, scaleY: img.scaleY, naturalWidth: el && el.naturalWidth, naturalHeight: el && el.naturalHeight, angle: img.angle };
out.sourceScaleObjectProps = { scaleX: img.scaleX, scaleY: img.scaleY };
const nw = out.image.naturalWidth, nh = out.image.naturalHeight, w = img.width, h = img.height;
if (!(nw > 0) || !(nh > 0) || typeof buildImageTransform !== "function") return { ok: false, reason: "missing-natural-or-transform", out: out };
try { if (typeof img.setCoords === "function") img.setCoords(); } catch (e) {}
const T = buildImageTransform({ naturalWidth: nw, naturalHeight: nh, width: w, height: h, aCoords: img.aCoords });
if (!T) return { ok: false, reason: "affine-singular", out: out };
out.imageTransform = { affine: T.map(function (v) { return Math.round(v * 1e6) / 1e6; }) };
out.effectiveScale = effectiveScaleOf(T);
const record = function (name, res, extra) {
  const s = { case: name, verdict: res.verdict, reason: res.reason, passed: null };
  if (res.evidence) s.evidence = { outsideCount: res.evidence.outsideCount, aabbImage: res.evidence.aabbImage, margin: res.evidence.marginPx };
  if (extra) Object.keys(extra).forEach(function (k) { s[k] = extra[k]; });
  out.scenarios.push(s);
  return s;
};
// S1: OCR block 在图片内部（natural rect 250,150,300,64）
{
  const rect = { x: 250, y: 150, width: 300, height: 64 };
  const mq = mapRectToCanvas(rect, T);
  const res = isQuadInsideImage(mq.corners, T, nw, nh);
  const g = quadTextGeometry(mq.corners);
  record("S1-inside", res, { ocrBBox: rect, targetQuad: mq.corners.map(function (p) { return { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 }; }), requestedGeometry: g ? { left: Math.round(g.left * 100) / 100, top: Math.round(g.top * 100) / 100, width: Math.round(g.width * 100) / 100, height: Math.round(g.height * 100) / 100, angle: Math.round(g.angle * 100) / 100 } : null }).passed = res.verdict === "CONTAINED";
}
// S2: OCR block 在图片外（natural rect 大幅越界 / 完全在外）
{
  const rectOut = { x: nw + 400, y: nh + 400, width: 160, height: 40 };
  const mq = mapRectToCanvas(rectOut, T);
  const res = isQuadInsideImage(mq.corners, T, nw, nh);
  record("S2-outside", res, { ocrBBox: rectOut }).passed = res.verdict === "OUT_OF_IMAGE";
}
// S3: 部分越界 → NEEDS_REPAIR → repair → CONTAINED（repair 后不得越过图片）
{
  const rectPart = { x: nw - 120, y: 40, width: 260, height: 60 }; // 右缘越出 nw
  const mq = mapRectToCanvas(rectPart, T);
  const res = isQuadInsideImage(mq.corners, T, nw, nh);
  const rp = repairQuadCentered(mq.corners, T, nw, nh);
  const post = rp ? isQuadInsideImage(rp.quad, T, nw, nh) : null;
  record("S3-partial-repair", res, { repair: rp ? { imageShift: rp.evidence.imageShift, afterVerdict: rp.evidence.afterVerdict } : null }).passed = res.verdict === "NEEDS_REPAIR" && !!rp && post && post.verdict === "CONTAINED";
}
// S4: rotated image —— 构造旋转 aCoords（不改画布，纯计算；中心 (200,150)，旋转 30°）
{
  const cx = 200, cy = 150, rad = Math.PI * 30 / 180, co = Math.cos(rad), si = Math.sin(rad);
  const corners = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }].map(function (p) {
    const dx = p.x + img.left - cx, dy = p.y + img.top - cy;
    return { x: cx + dx * co - dy * si, y: cy + dx * si + dy * co };
  });
  const TR = buildImageTransform({ naturalWidth: nw, naturalHeight: nh, width: w, height: h, aCoords: { tl: corners[0], tr: corners[1], br: corners[2], bl: corners[3] } });
  if (TR) {
    const er = effectiveScaleOf(TR);
    const rectC = { x: nw / 2 - 80, y: nh / 2 - 20, width: 160, height: 40 };
    const mq = mapRectToCanvas(rectC, TR);
    const res = isQuadInsideImage(mq.corners, TR, nw, nh);
    out.rotatedEffectiveScale = er;
    record("S4-rotated-center-contained", res, { canvasAABB: (function () { let xs = [0,0,0,0], ys = [0,0,0,0]; mq.corners.forEach(function (p, i) { xs[i] = p.x; ys[i] = p.y; }); return { left: Math.round(Math.min.apply(null, xs) * 100) / 100, top: Math.round(Math.min.apply(null, ys) * 100) / 100, right: Math.round(Math.max.apply(null, xs) * 100) / 100, bottom: Math.round(Math.max.apply(null, ys) * 100) / 100 }; })() }).passed = res.verdict === "CONTAINED";
    // 旋转图片的 Canvas AABB 外但图片外的块（避开旋转形状）→ OUT_OF_IMAGE
    const farPt = corners[0];
    const rectFar = { x: nw - 120, y: -160, width: 60, height: 25 };
    const mq2 = mapRectToCanvas(rectFar, TR);
    const res2 = isQuadInsideImage(mq2.corners, TR, nw, nh);
    record("S4-rotated-corner-outside", res2, { ocrBBox: rectFar }).passed = res2.verdict === "OUT_OF_IMAGE";
  } else { record("S4-rotated-center-contained", { verdict: "GEOMETRY_INVALID", reason: "affine-singular" }).passed = false; }
}
// S5: targetQuad → 原生 drawText → aCoords 实测对比（创建后清理；placement error 记录 requested/actual）
if (r.canvasDiy) {
  const rectC = { x: 300, y: 200, width: 260, height: 50 }; // natural 内
  const mq = mapRectToCanvas(rectC, T);
  const res = isQuadInsideImage(mq.corners, T, nw, nh);
  if (res.verdict === "CONTAINED" && mq && mq.corners) {
    const g = quadTextGeometry(mq.corners);
    const label = "ZY_IC77_" + Date.now().toString(36).slice(-8);
    const diy = r.canvasDiy;
    let created = null;
    try {
      const regBefore = (diy.canvasObjInfo && diy.canvasObjInfo.canvasToProductObjArr ? diy.canvasObjInfo.canvasToProductObjArr.length : 0);
      const idOf = function (o) { return String((o && (o.multiUuid || o.uuid || o.id)) || ""); };
      const beforeIds = (c.getObjects() || []).map(idOf);
      let maxLayer = -1;
      try { c.getObjects().forEach(function (o) { if (o && typeof o.layerNum === "number" && o.layerNum > maxLayer) maxLayer = o.layerNum; }); } catch (e) {}
      const layerNum = maxLayer + 1;
      const media = {
        media: { mediaType: "text", text: label, font: { pointSize: 20, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "1", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.2, lineIdType: 0, isBG: 0, imgPath: "" },
        location: { x: g.left, y: g.top, width: g.width, height: g.height, factWidth: g.width, factHeight: g.height, rotation: g.angle || 0 },
        printLocation: { x: g.left, y: g.top, width: g.width, height: g.height, rotation: g.angle || 0 },
        layer: { alpha: 1 }, layerNum: layerNum, isEdit: 1, isDisplay: 0, deleteState: 0, visitLevel: 1,
        multiUuid: "zy-ic77-" + Date.now().toString(36), markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0
      };
      const nObj = diy.drawText(label, 20, g.left, g.top, media, layerNum);
      const afterObjs = c.getObjects() || [];
      let identityMethod = (typeof nObj === "object" && nObj !== null) ? "NATIVE_RETURN" : "OBJECT_DELTA";
      let obj = (typeof nObj === "object" && nObj !== null) ? nObj : null;
      if (!obj) { obj = afterObjs.filter(function (o) { return beforeIds.indexOf(idOf(o)) < 0; }).find(function (o) { return String(o.type) === "textbox" || String(o.type) === "i-text" || String(o.type) === "text"; }) || null; }
      if (!obj) { obj = afterObjs.filter(function (o) { return (o && String(o.text || "").indexOf("ZY_IC77") >= 0); })[0] || null; }
      identityMethod = (!obj) ? "TEXT_FALLBACK" : (typeof nObj === "object" && nObj !== null ? "NATIVE_RETURN" : "OBJECT_DELTA");
      try { if (typeof c.setCoords === "function") c.setCoords(); if (obj && typeof obj.setCoords === "function") obj.setCoords(); } catch (e) {}
      const ac = obj && obj.aCoords;
      const acCenter = ac && ac.tl ? { x: (ac.tl.x + ac.tr.x + ac.br.x + ac.bl.x) / 4, y: (ac.tl.y + ac.tr.y + ac.br.y + ac.bl.y) / 4 } : null;
      const acBB = (function () { if (!ac) return null; const xs = [ac.tl.x, ac.tr.x, ac.br.x, ac.bl.x], ys = [ac.tl.y, ac.tr.y, ac.br.y, ac.bl.y]; return { left: Math.round(Math.min.apply(null, xs) * 100) / 100, top: Math.round(Math.min.apply(null, ys) * 100) / 100, right: Math.round(Math.max.apply(null, xs) * 100) / 100, bottom: Math.round(Math.max.apply(null, ys) * 100) / 100 }; })();
      const centerError = (g && acCenter) ? Math.round(Math.hypot(g.center.x - acCenter.x, g.center.y - acCenter.y) * 100) / 100 : null;
      const sizeError = (g && acBB) ? { w: Math.round(Math.abs((acBB.right - acBB.left) - g.width) * 100) / 100, h: Math.round(Math.abs((acBB.bottom - acBB.top) - g.height) * 100) / 100 } : null;
      const topLeftError = (g && acBB) ? { x: Math.round((acBB.left - g.left) * 100) / 100, y: Math.round((acBB.top - g.top) * 100) / 100 } : null;
      created = { ok: true, identityMethod: identityMethod, requested: { left: g.left, top: g.top, width: g.width, height: g.height, angle: g.angle, center: g.center }, actual: { aCoordsBB: acBB, aCoordsCenter: acCenter, fontSize: obj && obj.fontSize }, placementError: { centerError: centerError, topLeftError: topLeftError, sizeError: sizeError }, nativeReturnObject: !!(typeof nObj === "object" && nObj !== null) };
      // cleanup
      try {
        const regIdx = diy.canvasObjInfo && diy.canvasObjInfo.canvasToProductObjArr ? diy.canvasObjInfo.canvasToProductObjArr.indexOf(obj) : -1;
        if (regIdx >= 0) diy.canvasObjInfo.canvasToProductObjArr.splice(regIdx, 1);
        if (obj && typeof c.remove === "function") c.remove(obj);
        try { if (typeof c.requestRenderAll === "function") c.requestRenderAll(); } catch (e) {}
        created.cleaned = true;
      } catch (eCl) { created.cleanupError = String(eCl && eCl.message || eCl).slice(0, 100); }
    } catch (eCr) { created = { ok: false, error: String(eCr && eCr.message || eCr).slice(0, 160) }; }
    out.scenarios.push({ case: "S5-create-measure-placement", verdict: created && created.ok ? "CREATED" : "CREATE_FAILED", created: created, containmentVerdict: res.verdict, passed: !!(created && created.ok && created.placementError && created.placementError.centerError != null && created.cleaned) });
  } else { out.scenarios.push({ case: "S5-create-measure-placement", verdict: "SKIPPED", reason: "inside-rect-not-contained", passed: false }); }
} else { out.scenarios.push({ case: "S5-create-measure-placement", verdict: "SKIPPED", reason: "no-canvasDiy", passed: false }); }
return { ok: true, out: out };
`;

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const out = { ts: new Date().toISOString(), stage: "STAGE-9-V11-IMAGE-CONTAINMENT", version: USERSCRIPT_VERSION, url: URL.split("?")[0], cookiePresent: !!COOKIE_RAW, note: "只读审计 + 受控 create-measure 对比（创建后立即清理恢复）；containment 一律 inverse(imageTransform) 在 IMAGE_PIXEL 系判定", scenarios: [], errors: [] };
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1280, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    let page = browser.pages()[0];
    const onPageErr = (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 140)); };
    page.on("pageerror", onPageErr);
    try {
      await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await SLEEP(1400);
      const allOld = await adapter.getAllScripts(page) || [];
      let removed = 0;
      for (const s of allOld.filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(page, s.uuid); removed += 1; } catch (e) {} }
      out.errors = out.errors.filter((x) => x.indexOf("PAGEERROR") < 0);
    } catch (eClean) { out.errors.push("CLEAN: " + String(eClean && eClean.message || eClean).slice(0, 120)); }
    for (const c of parseCookies(COOKIE_RAW)) { try { await browser.addCookies([c]); } catch (e) { out.errors.push("COOKIE:" + c.name + " " + String(e && e.message || e).slice(0, 100)); } }
    page = await (async () => { await page.close().catch(() => {}); const p = await browser.newPage(); p.on("pageerror", onPageErr); return p; })();
    const injectPageWorld = (payload) => page.evaluate((code) => { const s = document.createElement("script"); s.textContent = code; (document.head || document.documentElement).appendChild(s); }, payload);
    const waitEditorReady = async (tries) => {
      for (let i = 0; i < (tries || 18); i += 1) {
        const r = await page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)) })).catch(() => ({}));
        if (r && r.ok) return r;
        await SLEEP(1200);
      }
      return page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)) })).catch(() => ({}));
    };
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => out.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
    await SLEEP(4000);
    await injectPageWorld(PAGE_MODULES + "\n;\n" + RESOLVE_ENTRY + "\n;window.__zyC7Audit = (function(){\n" + PAGE_AUDIT + "\n})();");
    await SLEEP(1200);
    const ready = await waitEditorReady(18);
    if (!(ready && ready.ok)) out.errors.push("EDITOR_UNAVAILABLE");
    await SLEEP(2500);
    const audit = await page.evaluate("window.__zyC7Audit").catch((e) => ({ ok: false, reason: "read:" + String(e && e.message || e).slice(0, 140), out: null }));
    if (audit && audit.ok && audit.out) {
      out.audit = audit.out;
      out.scenarios = audit.out.scenarios || [];
      out.image = audit.out.image;
      out.effectiveScale = audit.out.effectiveScale;
      out.sourceScaleObjectProps = audit.out.sourceScaleObjectProps;
      out.textboxCount = audit.out.textboxCount;
      out.toolFields = audit.out.toolFields;
      if (audit.out.imageTransform) out.imageTransform = audit.out.imageTransform;
    } else { out.errors.push("AUDIT: " + JSON.stringify(audit).slice(0, 300)); }
    await SLEEP(1200);
    const finalState = await page.evaluate(() => {
      const req = window.requirejs; const ctx = req && req.s && req.s.contexts && req.s.contexts._; const defs = (ctx && ctx.defined) || {};
      const CV = defs.CanvasObjVO || window.CanvasObjVO || null;
      const c = CV && CV.totalCanvasArray && CV.totalCanvasArray[0] && CV.totalCanvasArray[0].canvas;
      return { objectCount: c ? c.getObjects().length : null, zyLeftovers: c ? (c.getObjects() || []).filter(function (o) { return o && String(o.zyOcrKey || "").indexOf("zy-ocr-") === 0; }).length : null };
    }).catch(() => ({ objectCount: null, zyLeftovers: null }));
    out.finalState = finalState;
  } catch (e) { out.errors.push("MAIN: " + String(e && e.stack || (e && e.message || e)).slice(0, 300)); }
  if (browser) await browser.close().catch(() => {});
  fs.writeFileSync(path.join(REPORT_DIR, "image-containment-audit.json"), JSON.stringify(out, null, 2));
  console.log("[image-containment] report=" + path.join(REPORT_DIR, "image-containment-audit.json") + " version=" + out.version);
  out.scenarios.forEach((s) => console.log("[image-containment] " + s.case + " -> " + (s.passed === true ? "PASS" : "FAIL") + " " + (JSON.stringify(Object.assign({}, s, { passed: undefined })).slice(0, 260))));
  if (out.effectiveScale) console.log("[image-containment] effectiveScale=" + JSON.stringify(out.effectiveScale) + " objectProps=" + JSON.stringify(out.sourceScaleObjectProps));
  console.log("[image-containment] textboxCount=" + out.textboxCount + " finalObjectCount=" + (out.finalState && out.finalState.objectCount));
  out.errors.forEach((e) => console.log("[image-containment] ERR " + e));
  const allPass = out.scenarios.length > 0 && out.scenarios.every((s) => s.passed === true);
  process.exit((out.errors.length || !allPass) ? 1 : 0);
})();