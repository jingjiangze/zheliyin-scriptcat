// runtime/stage-8a2/geometry-diagnostic.js — Stage 8A-2B 取证（§5~§19）
// ---------------------------------------------------------------------
// 三模式（env ZY_MODE=bg|size|fail）：
//   bg  背景图位置：canvas.backgroundImage=fabric.Image(已知图) → OCR → 创建 textbox center vs 预测 center → deltaX/deltaY（angle 0/2/5/8/10 × scale 0.5/1/2）
//   size 普通图片尺寸矩阵：同一源图(1000×1000)按显示尺寸 100~500 注入 → OCR → textbox/aCoords 尺寸 → 定位 500→700 层级
//   fail 88.5×57 创建失败：1040459 + 注入图 + patch CanvasDiy.drawText 捕获 args/异常 → ocrCreateResult failedBlockIndex + native 参数 + 异常分类
// 输出 runtime/reports/stage-8a2/{background-position,direct-image-scale,canvas-88x57-create-failure}.json
// 凭据 env ZY_BAIDU_AK/SK；零生产代码修改（仅探针 patch，仅页面世界）。
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
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-8a2");
const BRANCH = "stage-8a-2-rotation-policy-geometry";
const BAIDU_AK = process.env.ZY_BAIDU_AK || "";
const BAIDU_SK = process.env.ZY_BAIDU_SK || "";
const MODE = process.env.ZY_MODE || "bg";
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

const URL_252438 = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const URL_88 = "https://diy.zheliyin.com/diyWeb/third/1040459/5368967/999/thirdDiyAdd.do";

const SZ_ROWS = [ { t: "大字标题实例文字", y: 30, s: 40 }, { t: "中号正文联系电话与邮箱地址", y: 110, s: 20 }, { t: "小字页脚版权备注行", y: 200, s: 12 } ];
const SZ_W = 1000, SZ_H = 300;

function injectUserscript() {
  let code = fs.readFileSync(USERSCRIPT_PATH, "utf8");
  ["stage-8a-1-ocr-overflow-rotation", "stage-8a-ocr-audit", "test", "demo"].forEach((b) => {
    code = code.split(b + "/extension/src/").join(BRANCH + "/extension/src/");
    code = code.replace(new RegExp(b + "\\/zheliyin-card-assistant\\.user\\.js", "g"), BRANCH + "/zheliyin-card-assistant.user.js");
  });
  const extra = "// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/" + BRANCH + "/extension/src/editor/image-transform.js?v=0.3.11.0\n";
  const anchor = "extension/src/ocr/ocr-text-safety-gate.js";
  const ai = code.indexOf(anchor);
  if (ai < 0) throw new Error("anchor not found");
  const lineEnd = code.indexOf("\n", ai);
  code = code.slice(0, lineEnd + 1) + extra + code.slice(lineEnd + 1);
  return code;
}

(async () => {
  const out = { ts: new Date().toISOString(), stage: "STAGE-8A2B-" + MODE, branch: BRANCH, mode: MODE, records: [], errors: [] };
  let browser = null, page = null;
  const ev = (fn, arg) => (arg === undefined ? page.evaluate(fn) : page.evaluate(fn, arg)).catch((e) => ({ err: String(e || "").slice(0, 200) }));
  const waitUntil = async (fnEval, desc, t0, poll) => { const t1 = Date.now(); while (Date.now() - t1 < t0) { const r = await ev(fnEval); if (r && r.ok) return { ok: true, ms: Date.now() - t1 }; await SLEEP(poll || 1500); } return { ok: false, desc }; };
  const canvasReady = () => () => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[0]) || null; return { ok: !!(d && d.canvas && typeof d.drawText === "function") }; };
  const render = () => ev((arg) => { const cv = document.createElement("canvas"); cv.width = arg.w; cv.height = arg.h; const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, arg.w, arg.h); ctx.fillStyle = "#000"; ctx.textBaseline = "top"; (arg.rows || []).forEach((r) => { ctx.font = r.s + "px SimHei, sans-serif"; ctx.fillText(r.t, 30, r.y); }); return cv.toDataURL("image/png"); }, { w: SZ_W, h: SZ_H, rows: SZ_ROWS });
  const injectImg = (ci, dataUrl, tag, tf) => ev((arg) => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[arg.ci]) || null; const c = d && d.canvas; if (!c) return { ok: false, reason: "no canvas" }; const f = (c.constructor && c.constructor.fabric) || window.fabric; return new Promise((res) => { const im = new Image(); im.onload = () => { try { const obj = new f.Image(im); obj.set({ left: arg.tf.left, top: arg.tf.top, scaleX: arg.tf.scaleX, scaleY: arg.tf.scaleY, angle: arg.tf.angle || 0, width: arg.tf.w || im.naturalWidth, height: arg.tf.h || im.naturalHeight }); obj.multiUuid = arg.tag + Date.now(); c.add(obj); try { c.setActiveObject(obj); } catch (e) {} if (d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr) d.canvasObjInfo.canvasToProductObjArr.push(obj); if (c.requestRenderAll) c.requestRenderAll(); res({ ok: true, w: obj.width, h: obj.height, nw: im.naturalWidth, nh: im.naturalHeight, sx: obj.scaleX, sy: obj.scaleY, angle: obj.angle, left: obj.left, top: obj.top }); } catch (e) { res({ ok: false, reason: String(e && e.message || e).slice(0, 100) }); } }; im.onerror = () => res({ ok: false, reason: "onerror" }); im.src = arg.dataUrl; }); }, { ci, dataUrl, tag, tf });
  const setBg = (ci, dataUrl) => ev((arg) => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[arg.ci]) || null; const c = d && d.canvas; if (!c) return { ok: false, reason: "no canvas" }; const f = (c.constructor && c.constructor.fabric) || window.fabric; return new Promise((res) => { const im = new Image(); im.onload = () => { try { const bg = new f.Image(im); bg.set({ scaleX: 1, scaleY: 1, angle: arg.angle || 0 }); c.setBackgroundImage(bg, () => { try { if (c.requestRenderAll) c.requestRenderAll(); } catch (e) {} res({ ok: true, w: bg.width, h: bg.height, nw: im.naturalWidth, nh: im.naturalHeight, left: bg.left, top: bg.top, angle: bg.angle }); }); } catch (e) { res({ ok: false, reason: String(e && e.message || e).slice(0, 100) }); } }; im.onerror = () => res({ ok: false, reason: "onerror" }); im.src = arg.dataUrl; }); }, { ci, dataUrl, angle: (process.env.ZY_BG_ANGLE ? Number(process.env.ZY_BG_ANGLE) : 0) });
  const clickOcr = () => ev(() => { const q = ["#zy-native-ocr-btn", "[data-zy-role=ocr]", ".zy-native-ocr-btn"]; for (const s of q) { const el = document.querySelector(s); if (el && el.offsetParent) { try { el.click(); return { clicked: true }; } catch (e) {} } } const all = Array.from(document.querySelectorAll("button,a,span,div")); for (const el of all) { if (!el.offsetParent) continue; if (String(el.textContent || "").trim().indexOf("识别当前图片") === 0) { try { el.click(); return { clicked: true }; } catch (e) {} } } return { clicked: false }; });
  const snapIds = () => ev(() => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const c = vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas; return c ? c.getObjects().map((o) => o.uuid || o.multiUuid) : []; });
  const readNew = (ids) => ev((arg) => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0]; const c = d && d.canvas; if (!c) return { arr: [] }; const arr = []; c.getObjects().forEach((o) => { if (typeof o.text !== "string") return; const id = o.uuid || o.multiUuid; if (arg.ids && arg.ids.length && id != null && arg.ids.indexOf(id) < 0) return; const ac = o.aCoords || null; const br = o.getBoundingRect ? o.getBoundingRect() : null; arr.push({ id: id || null, text: String(o.text || "").slice(0, 14), left: o.left, top: o.top, width: o.width, height: o.height, scaleX: o.scaleX, scaleY: o.scaleY, fontSize: o.fontSize, angle: o.angle, originX: o.originX, visible: o.visible, opacity: o.opacity, aCoords: ac && ac.tl ? { tl: [ac.tl.x, ac.tl.y], br: [ac.br.x, ac.br.y] } : null, boundingRect: br ? { left: br.left, top: br.top, width: br.width, height: br.height } : null, biz: { locationX: o.locationX, locationY: o.locationY, locationWidth: o.locationWidth, locationHeight: o.locationHeight, Rotation: o.Rotation } }); }); return { arr, canvas: { width: c.width, height: c.height, ft: c.viewportTransform ? Array.from(c.viewportTransform) : null, zoom: c.getZoom ? c.getZoom() : null, retina: c.getRetinaScaling ? c.getRetinaScaling() : null } }; }, { ids });
  const armDrawTextCap = () => ev(() => { window.__d8cap = []; const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); if (!vo || !vo.totalCanvasArray) return { ok: false }; vo.totalCanvasArray.forEach((d) => { const diy = d; if (diy && typeof diy.drawText === "function" && !diy.__zyP8wrapped) { const orig = diy.drawText.bind(diy); diy.__zyP8wrapped = true; diy.drawText = function (t, fs, l, tp, entry, ln) { let r; try { r = orig(t, fs, l, tp, entry, ln); window.__d8cap.push({ kind: "ok", text: String(t || "").slice(0, 14), entry: entry ? { media: entry.media, location: entry.location, printLocation: entry.printLocation, layerNum: entry.layerNum, isDisplay: entry.isDisplay } : null, layer: ln, args: [fs, l, tp] }); } catch (e) { window.__d8cap.push({ kind: "throw", text: String(t || "").slice(0, 14), err: String(e && e.message || e).slice(0, 400), stack: String(e && e.stack || "").slice(0, 800), entry: entry ? { location: entry.location, printLocation: entry.printLocation, media: entry.media } : null, layer: ln }); throw e; } return r; }; } }); return { ok: true }; });
  const readCap = () => ev(() => (window.__d8cap || []).slice());
  const rollback = (tag) => ev((arg) => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); let removed = 0; (vo && vo.totalCanvasArray || []).forEach((d) => { const c = d && d.canvas; if (!c) return; const objs = c.getObjects().filter((o) => o && (String(o.multiUuid || "").indexOf(arg.tag) === 0 || typeof o.text === "string")); objs.forEach((o) => { try { const li = d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr ? d.canvasObjInfo.canvasToProductObjArr.indexOf(o) : -1; if (li >= 0) d.canvasObjInfo.canvasToProductObjArr.splice(li, 1); c.remove(o); } catch (e) {} }); removed += objs.length; }); try { if (vo && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas && vo.totalCanvasArray[0].canvas.requestRenderAll) vo.totalCanvasArray[0].canvas.requestRenderAll(); } catch (e) {} return { ok: true, removed }; }, tag);
  const runOcrRound = async (tag) => { const before = await snapIds(); const cl = await clickOcr(); if (!cl.clicked) return { click: false }; let last = null, done = false; const t0 = Date.now(); for (;;) { const r = await ev(() => { const el = document.querySelector("#zy-native-status"); const st = el ? String(el.textContent || "").trim() : null; return { st: st ? st.slice(0, 160) : null }; }); const st = r && r.st; if (st && st !== last) { last = st; out.records[out.records.length - 1].status = (out.records[out.records.length - 1].status || []).concat([st]); } if (st && /已生成 \d+ 个文字|未识别到文字|失败|滚/.test(st)) { done = true; break; } if (Date.now() - t0 > 120000) break; await SLEEP(900); } const after = await snapIds(); const ids = (after || []).filter((id) => (before || []).indexOf(id) < 0); const rd = await readNew(ids); await rollback(tag); return { click: true, done, ids, rd }; };

  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1440, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    const opts = browser.pages()[0];
    await opts.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await SLEEP(2000);
    const all = await adapter.getAllScripts(opts);
    for (const s of (all || []).filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(opts, s.uuid); } catch (e) {} }
    await adapter.installByCode(opts, { uuid: "zheliyin-a2b-" + Date.now(), code: injectUserscript(), upsertBy: "user" });
    await SLEEP(1400);
    page = opts;
    out.console = [];
    page.on("console", (m) => { const t = m.text(); if (/\[zy-ocr\]/.test(t)) out.console.push(t.slice(0, 300)); });
    await opts.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await SLEEP(1200);
    if (BAIDU_AK && BAIDU_SK) { await ev((a) => { const ai = document.querySelector("#zy-baidu-ak-native") || document.querySelector("#zy-baidu-ak"); const si = document.querySelector("#zy-baidu-sk-native") || document.querySelector("#zy-baidu-sk"); const sb = document.querySelector("#zy-baidu-save-native") || document.querySelector("#zy-baidu-save"); if (!ai || !si || !sb) return { ok: false }; ai.value = a.ak; si.value = a.sk; try { sb.click(); } catch (e) {} return { ok: true }; }, { ak: BAIDU_AK, sk: BAIDU_SK }); await SLEEP(3000); }
    const URL = MODE === "fail" ? URL_88 : URL_252438;
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const w = await waitUntil(canvasReady(), "ready", 150000);
    if (!(w && w.ok)) throw new Error("editor not ready");
    await SLEEP(4000);

    if (MODE === "bg") {
      const du = await render();
      const dataUrl = typeof du === "string" ? du : du.dataUrl;
      const angles = [0, 2, 5, 8, 10].map((a) => ({ a })); // scale 1
      for (const x of angles) {
        process.env.ZY_BG_ANGLE = String(x.a);
        const bg = await setBg(0, dataUrl);
        const rec = { mode: "bg", angle: x.a, bg, rd: null };
        out.records.push(rec);
        const r = await runOcrRound("p8b-");
        rec.rd = r.rd && r.rd.arr ? r.rd.rd : r; // keep simple
        if (r.rd && r.rd.arr) rec.objects = r.rd.arr;
        rec.canvasInfo = (r.rd && r.rd.canvas) || null;
        try { await ev(() => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0]; const c = d && d.canvas; if (c) c.setBackgroundImage(null); }); } catch (e) {}
        await SLEEP(1200);
      }
    } else if (MODE === "size") {
      const du = await render();
      const dataUrl = typeof du === "string" ? du : du.dataUrl;
      for (const size of [100, 200, 300, 400, 500]) {
        const img = await injectImg(0, dataUrl, "p8s-", { left: 20, top: 20, scaleX: 1, scaleY: 1, w: size, h: Math.round(size * SZ_H / SZ_W) });
        const rec = { mode: "size", displaySize: size, img, rd: null };
        out.records.push(rec);
        const r = await runOcrRound("p8s-");
        if (r.rd && r.rd.arr) rec.objects = r.rd.arr;
        rec.canvasInfo = (r.rd && r.rd.canvas) || null;
        await SLEEP(1000);
      }
    } else if (MODE === "fail") {
      await armDrawTextCap();
      const du = await render();
      const dataUrl = typeof du === "string" ? du : du.dataUrl;
      const img = await injectImg(0, dataUrl, "p8f-", { left: 20, top: 20, scaleX: 1, scaleY: 1 });
      const rec = { mode: "fail", url: URL, img, rd: null, cap: null };
      out.records.push(rec);
      const r = await runOcrRound("p8f-");
      rec.rd = { click: r.click, done: r.done, ids: r.ids };
      if (r.rd && r.rd.arr) rec.objects = r.rd.arr;
      rec.cap = await readCap();
      rec.canvasInfo = (r.rd && r.rd.canvas) || null;
    }
  } catch (e) { out.errors.push(String(e && e.message || e).slice(0, 400)); }
  finally { try { page && await page.close(); } catch (e) {} try { browser && await browser.close(); } catch (e) {} }
  const name = MODE === "bg" ? "background-position.json" : MODE === "size" ? "direct-image-scale.json" : "canvas-88x57-create-failure.json";
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, name), JSON.stringify(out, null, 2));
  console.log("STAGE-8A2B " + MODE + " done records=" + out.records.length + " errors=" + out.errors.length + " -> " + path.join(REPORT_DIR, name));
})();