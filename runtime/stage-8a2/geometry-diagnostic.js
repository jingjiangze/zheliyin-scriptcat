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
const TRANSFORM_ON = process.env.ZY_TRANSFORM !== "0"; // 默认注入 image-transform（A 双轨：0=模拟生产未接线路径）
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

const URL_252438 = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const URL_88 = "https://diy.zheliyin.com/diyWeb/third/1040459/5368967/999/thirdDiyAdd.do";
const FIX_URL = process.env.ZY_FIX_URL || URL_88;

const SZ_ROWS = [ { t: "大字标题实例文字", y: 30, s: 40 }, { t: "中号正文联系电话与邮箱地址", y: 110, s: 20 }, { t: "小字页脚版权备注行", y: 200, s: 12 } ];
const SZ_W = 1000, SZ_H = 300;

function injectUserscript() {
  let code = fs.readFileSync(USERSCRIPT_PATH, "utf8");
  ["stage-8a-1-ocr-overflow-rotation", "stage-8a-ocr-audit", "test", "demo"].forEach((b) => {
    code = code.split(b + "/extension/src/").join(BRANCH + "/extension/src/");
    code = code.replace(new RegExp(b + "\\/zheliyin-card-assistant\\.user\\.js", "g"), BRANCH + "/zheliyin-card-assistant.user.js");
  });
  if (TRANSFORM_ON) {
    const extra = "// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/" + BRANCH + "/extension/src/editor/image-transform.js?v=0.3.11.2\n";
    const anchor = "extension/src/ocr/ocr-text-safety-gate.js";
    const ai = code.indexOf(anchor);
    if (ai < 0) throw new Error("anchor not found");
    const lineEnd = code.indexOf("\n", ai);
    code = code.slice(0, lineEnd + 1) + extra + code.slice(lineEnd + 1);
  }
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
  const armDrawTextCap = () => ev(() => { window.__d8cap = []; const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); if (!vo || !vo.totalCanvasArray) return { ok: false };
  const findProductState = () => {
    let holder = null, key = null;
    const scan = (root, name) => { try { if (root && Array.isArray(root.pageList)) { holder = root; key = name; return true; } } catch (e) {} return false; };
    if (scan(window, "window") || scan(vo, "vo")) { /* found */ }
    else if (vo) { try { Object.keys(vo).slice(0, 200).forEach((k) => { if (!holder) scan(vo[k], "vo." + k); }); } catch (e) {} }
    if (!holder && req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined) { try { Object.keys(req.s.contexts._.defined).slice(0, 300).forEach((k) => { if (!holder) { try { const m = req.s.contexts._.defined[k]; if (m && Array.isArray(m.pageList)) { holder = m; key = "mod:" + k; } } catch (e) {} } }); } catch (e) {} }
    let itemListLen = null, objLen2 = null, cc = null;
    if (holder && Array.isArray(holder.pageList)) {
      cc = holder.currentCanvasNum != null ? holder.currentCanvasNum : null;
      const eIdx = cc != null ? Math.max(0, cc - 1) : 0;
      const page = holder.pageList[eIdx] || null;
      const il = page && page.content && Array.isArray(page.content.itemList) ? page.content.itemList : null;
      if (il) { itemListLen = il.length; }
    }
    const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
    const c = d && d.canvas;
    objLen2 = c ? c.getObjects().length : null;
    return { holderKey: key, itemListLen, objLen: objLen2, cc };
  };
  vo.totalCanvasArray.forEach((d) => { const diy = d; if (diy && typeof diy.drawText === "function" && !diy.__zyP8wrapped) { const orig = diy.drawText.bind(diy); diy.__zyP8wrapped = true; diy.drawText = function (t, fs, l, tp, entry, ln) { let r; try { r = orig(t, fs, l, tp, entry, ln); window.__d8cap.push({ kind: "ok", text: String(t || "").slice(0, 14), layer: ln, entry: entry ? { media: entry.media, location: entry.location, printLocation: entry.printLocation, isDisplay: entry.isDisplay } : null }); } catch (e) { window.__d8cap.push({ kind: "throw", text: String(t || "").slice(0, 14), err: String(e && e.message || e).slice(0, 300), stack: String(e && e.stack || "").slice(0, 600), layer: ln, snapshot: findProductState(), entry: entry ? { location: entry.location, printLocation: entry.printLocation } : null }); throw e; } return r; }; } }); return { ok: true }; });
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
    const URL = (MODE === "fail" || MODE === "ctrig") ? URL_88 : (MODE === "reg" ? FIX_URL : ((MODE === "drawitem-probe" || MODE === "native-image-inventory") ? URL_88 : URL_252438));
    // D2-C itemlist-source：页面早期 hook（模板初始化前）追 itemList 构建 + 模板 JSON 响应
    if (MODE === "itemlist-source") {
      await page.addInitScript(() => {
        if (!/diy\.zheliyin\.com/.test(String(location ? location.hostname : ""))) return;
        window.__arrCap = { enabled: true, recs: [], ids: new WeakMap(), seq: 0 };
        const cap = (m, args, arr) => {
          if (!window.__arrCap.enabled) return;
          if (window.__arrCap.recs.length >= 300) return;
          let id = window.__arrCap.ids.get(arr);
          if (!id) { id = ++window.__arrCap.seq; window.__arrCap.ids.set(arr, id); }
          window.__arrCap.recs.push({ t: Date.now(), m, arrId: id, len: arr ? arr.length : -1, arg0Keys: args && args[0] && typeof args[0] === "object" ? Object.keys(args[0]).slice(0, 10) : null, stackTop: new Error().stack ? String(new Error().stack).split("\n").slice(2, 7).map((s) => s.trim().slice(0, 140)) : null });
        };
        ["push", "splice", "unshift", "pop"].forEach((m) => {
          const orig = Array.prototype[m];
          Array.prototype[m] = function () { cap(m, arguments, this); return orig.apply(this, arguments); };
        });
        // 模板 JSON 响应（含 itemList 的接口）
        window.__tplJson = { hits: [] };
        const seen = (url, txt) => { if (window.__tplJson.hits.length < 10 && String(txt || "").indexOf("itemList") >= 0) { window.__tplJson.hits.push({ url: String(url).slice(0, 160), len: String(txt || "").length, head: String(txt || "").slice(0, 120) }); } };
        const of = window.fetch ? window.fetch.bind(window) : null;
        if (of) { window.fetch = function (u, o) { const p = of(u, o); p.then((r) => { try { r.clone().text().then((t) => seen(u, t)).catch(() => {}); } catch (e) {} }).catch(() => {}); return p; }; }
        const oX = window.XMLHttpRequest;
        if (oX) { const np = oX.prototype.open, ns = oX.prototype.send; oX.prototype.open = function (m, u) { this.__u = u; return np.apply(this, arguments); }; oX.prototype.send = function (b) { this.addEventListener("load", () => { try { seen(this.__u, this.responseText); } catch (e) {} }); return ns.apply(this, arguments); }; }
      });
    }
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const w = await waitUntil(canvasReady(), "ready", 150000);
    if (!(w && w.ok)) throw new Error("editor not ready");
    await SLEEP(4000);

    if (MODE === "itemlist-source") {
      // D2-C：匹配 itemList 构建记录 + 模板 JSON 来源
      const rec = await ev(() => {
        const req = window.requirejs || window.require;
        const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
        const PV = (function () { try { return req.s.contexts._.defined.ProductVO; } catch (e) { return null; } })() || (window.ProductVO || null);
        const eIdx = PV && PV.currentCanvasNum != null ? Math.max(0, PV.currentCanvasNum - 1) : 0;
        const page = PV && PV.pageList && PV.pageList[eIdx];
        const il = page && page.content && Array.isArray(page.content.itemList) ? page.content.itemList : null;
        const cap = window.__arrCap || { recs: [] };
        let itemListId = null;
        if (il && cap.ids) { itemListId = cap.ids.get(il) || null; }
        return {
          itemListLen: il ? il.length : null,
          itemListArrId: itemListId,
          matchedRecs: itemListId ? cap.recs.filter((r) => r.arrId === itemListId) : [],
          sampleRecs: cap.recs.slice(0, 40),
          tplJson: (window.__tplJson && window.__tplJson.hits) || [],
          pvCc: PV ? PV.currentCanvasNum : null
        };
      });
      out.records.push(rec);
      out.special = "itemlist-source";
    }
    if (MODE === "bg") {
      const du = await render();
      const dataUrl = typeof du === "string" ? du : du.dataUrl;
      const angles = [0, 2, 5, 8, 10].map((a) => ({ a })); // scale 1
      for (const x of angles) {
        process.env.ZY_BG_ANGLE = String(x.a);
        const bg = await setBg(0, dataUrl);
        const rec = { mode: "bg", transformLoaded: TRANSFORM_ON, angle: x.a, bg, rd: null };
        out.records.push(rec);
        const r = await runOcrRound("p8b-");
        rec.rd = r.rd && r.rd.arr ? r.rd.rd : r;
        if (r.rd && r.rd.arr) rec.objects = r.rd.arr;
        rec.canvasInfo = (r.rd && r.rd.canvas) || null;
        try { await ev(() => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0]; const c = d && d.canvas; if (c) c.setBackgroundImage(null); }); } catch (e) {}
        await SLEEP(1200);
      }
    } else if (MODE === "ctrig") {
      // D1：C Trigger Audit —— 1040459 完整 OCR 链路 + product itemList/画布三列采样 + 时序对照（delay0 vs delay8s）
      await armDrawTextCap();
      const DU = await render();
      const dataUrl = typeof DU === "string" ? DU : DU.dataUrl;
      for (const delay of [0, 8000]) {
        const rec = { mode: "ctrig", delayMs: delay, img: null, samples: [], rd: null, cap: null, errors: [] };
        out.records.push(rec);
        try {
          rec.img = await injectImg(0, dataUrl, "p8t-", { left: 20, top: 20, scaleX: 1, scaleY: 1 });
          // 周期性采样（页面世界找 product pageList）
          const sampler = setInterval(async () => {
            const s = await ev(() => {
              const req = window.requirejs || window.require;
              const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
              const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
              const c = d && d.canvas;
              // 找 pageList 持有者
              let holder = null;
              const cands = [window, vo, vo && vo.totalCanvasArray && vo.totalCanvasArray[0], window.p, (function () { try { return vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvasObjInfo; } catch (e) { return null; } })()];
              for (const cand of cands) { if (cand && Array.isArray(cand.pageList)) { holder = cand; break; } }
              let itemList = null, itemListLen = null, g = null;
              if (holder && holder.pageList && Array.isArray(holder.pageList)) {
                const eIdx = holder.currentCanvasNum != null ? Math.max(0, holder.currentCanvasNum - 1) : 0;
                const page = holder.pageList[eIdx] || null;
                itemList = (page && page.content && Array.isArray(page.content.itemList)) ? page.content.itemList : null;
                if (itemList) { itemListLen = itemList.length; g = itemList.length >= 1 ? itemList[itemList.length - 1] : null; }
              }
              return {
                t: Date.now(), cc: vo && vo.currentCanvasNum,
                pageListLen: holder && holder.pageList ? holder.pageList.length : null,
                itemListLen, itemListLastOk: !!(itemList && itemList.length && itemList[itemList.length - 1]),
                objLen: c ? c.getObjects().length : null,
                regLen: d && d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr ? d.canvasObjInfo.canvasToProductObjArr.length : null
              };
            });
            rec.samples.push(s);
          }, 600);
          if (delay) await SLEEP(delay);
          const before = await snapIds();
          const cl = await clickOcr();
          if (!cl.clicked) { rec.errors.push("btn"); clearInterval(sampler); continue; }
          let last = null, done = false;
          const t0 = Date.now();
          for (;;) {
            const r = await ev(() => { const el = document.querySelector("#zy-native-status"); const st = el ? String(el.textContent || "").trim() : null; return { st: st ? st.slice(0, 160) : null }; });
            const st = r && r.st;
            if (st && st !== last) { last = st; rec.status = (rec.status || []).concat([st]); }
            if (st && /已生成 \d+ 个文字|未识别到文字|失败|滚/.test(st)) { done = true; break; }
            if (Date.now() - t0 > 120000) break;
            await SLEEP(900);
          }
          clearInterval(sampler);
          const after = await snapIds();
          rec.ids = (after || []).filter((id) => (before || []).indexOf(id) < 0);
          const rd = await readNew(rec.ids);
          rec.created = rd.arr || [];
          rec.canvasInfo = rd.canvas || null;
          rec.cap = await readCap();
          await rollback("p8t-");
          rec.done = done;
        } catch (e) { clearInterval(sampler); rec.errors.push(String(e && e.message || e).slice(0, 200)); }
      }
    } else if (MODE === "reg") {
      // D2-C：原生 itemList 注册机制取证（clean page）—— 临时 wrapper 抓 itemList.push/splice 调用栈（诊断后恢复）
      const URL = FIX_URL; // env ZY_FIX_URL
      const armItemListCap = () => ev(() => {
        const req = window.requirejs || window.require;
        const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
        const PV = (function () { try { return req.s.contexts._.defined.ProductVO; } catch (e) { return null; } })() || (window.ProductVO || null);
        window.__ilcap = [];
        const wrap = (arr) => {
          if (!arr || arr.__zyWrapped) return arr;
          ["push", "splice", "unshift"].forEach((m) => {
            const orig = arr[m];
            if (typeof orig !== "function") return;
            arr[m] = function () {
              try { window.__ilcap.push({ m, len: arguments.length, stack: new Error().stack ? String(new Error().stack).split("\n").slice(1, 8).map((s) => s.trim().slice(0, 120)) : null }); } catch (e) {}
              return orig.apply(this, arguments);
            };
          });
          arr.__zyWrapped = true;
          return arr;
        };
        const pageList = PV && PV.pageList;
        if (pageList && Array.isArray(pageList)) pageList.forEach((pg) => wrap(pg.content && pg.content.itemList));
        return { ok: true, found: !!(pageList && Array.isArray(pageList)), mod: !!PV };
      });
      const readRegState = () => ev(() => {
        const req = window.requirejs || window.require;
        const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
        const PV = (function () { try { return req.s.contexts._.defined.ProductVO; } catch (e) { return null; } })() || (window.ProductVO || null);
        const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
        const c = d && d.canvas;
        const eIdx = PV && PV.currentCanvasNum != null ? Math.max(0, PV.currentCanvasNum - 1) : 0;
        const il = PV && PV.pageList && PV.pageList[eIdx] && PV.pageList[eIdx].content ? PV.pageList[eIdx].content.itemList : null;
        return {
          cc: vo && vo.currentCanvasNum, pvCc: PV ? PV.currentCanvasNum : null,
          itemListLen: il && Array.isArray(il) ? il.length : (il ? "no-arr" : null),
          itemLastOk: !!(il && Array.isArray(il) && il.length && il[il.length - 1]),
          objLen: c ? c.getObjects().length : null,
          regLen: d && d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr ? d.canvasObjInfo.canvasToProductObjArr.length : null,
          itemKeys: il && Array.isArray(il) && il.length ? Object.keys(il[0]).slice(0, 20) : null
        };
      });
      const rec = { mode: "reg", url: URL, armIl: null, directDraw: null, directState: null, ocrCap: null, ocrState: null, errors: [] };
      out.records.push(rec);
      try {
        await armItemListCap();
        rec.armIl = "ok";
        rec.preState = await readRegState();
        // A. 直接 drawText（不注入图；空模板直接建文字）
        const du = await render();
        const dd = await ev((arg) => {
          const req = window.requirejs || window.require;
          const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
          const diy = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
          if (!diy || typeof diy.drawText !== "function") return { skipped: "no drawText" };
          const entry = { media: { mediaType: "text", text: "测试文字AB", font: { pointSize: 30, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "1", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.2, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: 40, y: 40, width: 120, height: 40, factWidth: 120, factHeight: 40, rotation: 0 }, printLocation: { x: 40, y: 40, width: 120, height: 40, rotation: 0 }, layer: { alpha: 1 }, layerNum: 1, isEdit: 1, isDisplay: 0, deleteState: 0, visitLevel: 1, multiUuid: "reg-" + Date.now(), markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0, lowPixelFlag: 0, selectEnabled: 1, isDesign: 1, isComposite: 0, isPreview: 0, isDesignShape: 0 };
          try { diy.drawText(String(entry.media.text), null, null, null, entry, 1); return { ok: true }; }
          catch (e) { return { ok: false, err: String(e && e.message || e).slice(0, 200) }; }
        }, {});
        rec.directDraw = dd;
        rec.directState = await readRegState();
        rec.ilCap = await ev(() => (window.__ilcap || []).slice());
        await rollback("reg-");
        // B. OCR 完整链路
        const du2 = await render();
        const dataUrl2 = typeof du2 === "string" ? du2 : du2.dataUrl;
        rec.ocrImg = await injectImg(0, dataUrl2, "p8g-", { left: 20, top: 20, scaleX: 1, scaleY: 1 });
        await armDrawTextCap();
        window.__ilcap = [];
        rec.ocrPre = await readRegState();
        const before = await snapIds();
        const cl = await clickOcr();
        let last = null, done = false;
        const t0 = Date.now();
        for (;;) {
          const r = await ev(() => { const el = document.querySelector("#zy-native-status"); const st = el ? String(el.textContent || "").trim() : null; return { st: st ? st.slice(0, 160) : null }; });
          const st = r && r.st;
          if (st && st !== last) { last = st; rec.status = (rec.status || []).concat([st]); }
          if (st && /已生成 \d+ 个文字|未识别到文字|失败|滚/.test(st)) { done = true; break; }
          if (Date.now() - t0 > 120000) break;
          await SLEEP(900);
        }
        rec.ocrDone = done;
        rec.ocrAfter = await readRegState();
        rec.ocrIlCap = await ev(() => (window.__ilcap || []).slice());
        rec.ocrCap = await readCap();
        await rollback("p8g-");
      } catch (e) { rec.errors.push(String(e && e.message || e).slice(0, 300)); }
    } else if (MODE === "native-add-text") {
      // Case D：1040459 原生“新增文字”按钮 → itemList 初始化机制取证（§D2-C1）
      const rec = { mode: "native-add-text", templateId: FIX_URL.indexOf("1040459") >= 0 ? "1040459" : "other", button: null, before: null, timeline: [], mutations: [], createdObject: null, after: null, nativeMechanism: null, conclusion: null, errors: [] };
      out.records.push(rec);
      const readState = (tag) => ev((arg) => {
        const req = window.requirejs || window.require;
        const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
        const PV = (function () { try { return req.s.contexts._.defined.ProductVO; } catch (e) { return null; } })() || (window.ProductVO || null);
        const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
        const c = d && d.canvas;
        const eIdx = PV && PV.currentCanvasNum != null ? Math.max(0, PV.currentCanvasNum - 1) : 0;
        const page = PV && PV.pageList && PV.pageList[eIdx];
        const il = page && page.content ? page.content.itemList : null;
        const objs = c ? c.getObjects() : [];
        const textObjs = objs.filter((o) => o && typeof o.text === "string").map((o) => ({ t: String(o.text).slice(0, 12), uuid: String(o.uuid || o.multiUuid || "").slice(0, 16), l: o.left, tp: o.top, w: o.width, h: o.height, fs: o.fontSize }));
        const sig = il && Array.isArray(il) ? il.slice(0, 3).map((it) => (it ? Object.keys(it).slice(0, 12).join(",") : "null")) : null;
        return { tag: arg.tag,
          cc: vo && vo.currentCanvasNum, pvCc: PV ? PV.currentCanvasNum : null,
          itemListLen: il && Array.isArray(il) ? il.length : (il ? "no-arr" : null),
          regLen: d && d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr ? d.canvasObjInfo.canvasToProductObjArr.length : null,
          objLen: objs.length, sig: sig, textObjs: textObjs.slice(-3) };
      }, { tag });
      // 临时 wrapper：仅对目标 itemList 的 push/splice 捕获（含 stack）
      const armItemListWatch = () => ev(() => {
        const req = window.requirejs || window.require;
        const PV = (function () { try { return req.s.contexts._.defined.ProductVO; } catch (e) { return null; } })() || (window.ProductVO || null);
        const il = PV && PV.pageList && PV.pageList[0] && PV.pageList[0].content ? PV.pageList[0].content.itemList : null;
        if (!il || !Array.isArray(il)) return { ok: false, reason: "no itemList" };
        window.__ilWatch = [];
        ["push", "splice", "unshift"].forEach((m) => {
          const orig = Array.prototype[m];
          Array.prototype[m] = function () {
            if (this === il) {
              try { window.__ilWatch.push({ t: Date.now(), m, args: arguments.length, stack: new Error().stack ? String(new Error().stack).split("\n").slice(1, 8).map((s) => s.trim().slice(0, 140)) : null, argKeys: arguments[0] ? Object.keys(arguments[0]).slice(0, 16) : null }); } catch (e) {}
            }
            return orig.apply(this, arguments);
          };
        });
        return { ok: true };
      });
      const restoreArrayProto = () => ev(() => {
        // 恢复：重载页面即可（本流程末尾 reload）；此处仅记录
        return { ok: true };
      });
      try {
        // 按钮定位（§3）
        rec.button = await ev(() => {
          const cands = [];
          const all = Array.from(document.querySelectorAll("button,a,div,span,li,i,[class*='text'],[class*='font'],[class*='add']"));
          const kws = ["文字", "添加文字", "新增文字", "文本"];
          for (const el of all) {
            if (!el.offsetParent) continue;
            const txt = String(el.textContent || "").trim();
            if (txt.length > 0 && txt.length <= 8 && kws.some((k) => txt.indexOf(k) >= 0)) {
              const r = el.getBoundingClientRect();
              cands.push({ tag: el.tagName, cls: String(el.className || "").slice(0, 60), id: el.id || null, text: txt, aria: el.getAttribute("aria-label"), title: el.getAttribute("title"), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
              if (cands.length >= 6) break;
            }
          }
          return { found: cands.length > 0, cands };
        });
        await armItemListWatch();
        rec.before = await readState("before");
        // 点击候选按钮（优先文本恰为“添加文字/新增文字/文字”且尺寸小的）
        if (rec.button.found) {
          const target = await ev((arg) => {
            const kws = ["添加文字", "新增文字", "文字", "文本"];
            const all = Array.from(document.querySelectorAll("button,a,div,span,li,i,[class*='text'],[class*='font'],[class*='add']"));
            let hit = null;
            for (const el of all) {
              if (!el.offsetParent) continue;
              const txt = String(el.textContent || "").trim();
              if (txt.length > 0 && txt.length <= 8 && kws.some((k) => txt === k || txt.indexOf(k) === 0)) { hit = el; break; }
            }
            if (!hit) return { clicked: false };
            try { hit.click(); } catch (e) { return { clicked: false, err: String(e && e.message || e).slice(0, 80) }; }
            return { clicked: true, tag: hit.tagName, cls: String(hit.className || "").slice(0, 60), text: String(hit.textContent || "").trim().slice(0, 8) };
          }, {});
          rec.clicked = target;
          // 时间线采样（§6）
          for (const ms of [0, 50, 100, 250, 500, 1000, 2000, 5000]) {
            if (ms) await SLEEP(ms - (rec.timeline.length ? rec.timeline[rec.timeline.length - 1].ms : 0));
            rec.timeline.push(Object.assign({ ms }, await readState("t" + ms)));
          }
        } else {
          rec.timeline.push(Object.assign({ ms: 0 }, await readState("no-btn")));
        }
        rec.mutations = await ev(() => (window.__ilWatch || []).slice());
        // 新建 textbox 识别（点击后新增的 text 对象）
        const afterState = await readState("after");
        rec.after = afterState;
        rec.createdObject = (rec.after.textObjs || []).filter((o) => !(rec.before.textObjs || []).some((b) => b.uuid && b.uuid === o.uuid));
        const ilNow = rec.after.itemListLen;
        rec.nativeMechanism = { mutation: rec.mutations, itemListAfter: ilNow, conclusion: null };
        if (rec.mutations && rec.mutations.length) {
          rec.nativeMechanism.conclusion = "itemList 被 push/splice 写入（stack 见 mutations）";
        } else if (ilNow > 0 && rec.before.itemListLen === 0) {
          rec.nativeMechanism.conclusion = "itemList 0→" + ilNow + " 但未走 push/splice wrapper（可能是下标写或原生从别处重建）";
        }
        rec.conclusion = (rec.mutations && rec.mutations.length) ? "C_NATIVE_INIT=CONFIRMED(见 stack)" : ((ilNow > 0 && rec.before.itemListLen === 0) ? "C_NATIVE_INIT=STRONG_EVIDENCE(长度变化但写入点未捕获)" : (rec.mutations && !rec.mutations.length && ilNow === 0 ? "C_NATIVE_INIT=UNKNOWN(itemList 未变化)" : "C_NATIVE_INIT=UNKNOWN"));
        // 清理：reload fresh（§11）
        rec.cleanup = "reload";
        await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      } catch (e) { rec.errors.push(String(e && e.message || e).slice(0, 300)); }
    } else if (MODE === "itemlist-lifecycle") {
      // D2-C1.5R：三实验各 fresh（A 纯 fabric / B injectImg / C OCR 链）；修复跨 evaluate identity（window 级）；高频采样；ProductVO vs CanvasDiy 双状态对照
      const rec = { mode: "itemlist-lifecycle-r", templateId: "1040459", experiments: [], errors: [] };
      out.records.push(rec);
      // window 级 identity（跨 evaluate 持久）
      const ensureIdMap = () => ev(() => { window.__lcIdentityMap = window.__lcIdentityMap || new WeakMap(); window.__lcIdentitySeq = window.__lcIdentitySeq || 0; if (typeof window.__lcIdOf !== "function") { window.__lcIdOf = function (v) { if (!v || (typeof v !== "object" && typeof v !== "function")) return null; let id = window.__lcIdentityMap.get(v); if (!id) { id = ++window.__lcIdentitySeq; window.__lcIdentityMap.set(v, id); } return id; }; } return { ok: true }; });
      const state = (tag) => ev((arg) => {
        const req = window.requirejs || window.require;
        const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
        const PV = (function () { try { return req.s.contexts._.defined.ProductVO; } catch (e) { return null; } })() || (window.ProductVO || null);
        const idOf = window.__lcIdOf || (() => null);
        const diy = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
        const c = diy && diy.canvas;
        const eIdx = PV && PV.currentCanvasNum != null ? Math.max(0, PV.currentCanvasNum - 1) : 0;
        const page = PV && PV.pageList && PV.pageList[eIdx];
        const content = page && page.content;
        const il = content && Array.isArray(content.itemList) ? content.itemList : null;
        // CanvasDiy 闭包态候选：canvasObjInfo.productJson / productPageList
        let diyPL = null;
        if (diy && diy.canvasObjInfo) { try { if (Array.isArray(diy.canvasObjInfo.productPageList)) diyPL = diy.canvasObjInfo.productPageList; else if (diy.canvasObjInfo.productJson && Array.isArray(diy.canvasObjInfo.productJson.pageList)) diyPL = diy.canvasObjInfo.productJson.pageList; } catch (e) {} }
        const ee = diyPL && diyPL[eIdx] != null ? eIdx : 0;
        const diyPage = diyPL && diyPL[ee];
        const diyIl = diyPage && diyPage.content && Array.isArray(diyPage.content.itemList) ? diyPage.content.itemList : null;
        return {
          tag: arg.tag, t: Date.now(),
          pv: { pageListId: idOf(PV && PV.pageList), page0Id: idOf(page), contentId: idOf(content), itemListId: idOf(il), itemListLen: il ? il.length : null },
          diy: { pageListId: idOf(diyPL), itemListId: idOf(diyIl), itemListLen: diyIl ? diyIl.length : null },
          sameRef: PV && PV.pageList === diyPL ? "SAME" : "DIFFERENT",
          objLen: c ? c.getObjects().length : null,
          regLen: diy && diy.canvasObjInfo && diy.canvasObjInfo.canvasToProductObjArr ? diy.canvasObjInfo.canvasToProductObjArr.length : null,
          txt: c ? c.getObjects().filter((o) => o && typeof o.text === "string").length : null,
          item0: il && il.length && il[0] ? { id: idOf(il[0]), keys: Object.keys(il[0]).slice(0, 8), mediaType: il[0].media && il[0].media.mediaType, uuid: String(il[0].uuid || "").slice(0, 10), layerNum: il[0].layerNum } : null
        };
      }, { tag });
      const capS = (fn) => async () => { try { return await fn(); } catch (e) { return { err: String(e && e.message || e).slice(0, 160) }; } };
      const freshOnce = async () => { await page.goto(FIX_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {}); await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {}); const w = await waitUntil(canvasReady(), "ready", 150000); if (!(w && w.ok)) throw new Error("editor not ready"); await SLEEP(3000); await ensureIdMap(); };
      const DU = await render();
      const dataUrl = typeof DU === "string" ? DU : (DU && DU.dataUrl);
      try {
        // Experiment A
        await freshOnce();
        const A = { id: "A-pure-fabric", steps: [] };
        rec.experiments.push(A);
        A.steps.push(await state("A0-base"));
        await ev((arg) => new Promise((res) => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0]; const c = d && d.canvas; const f = (c.constructor && c.constructor.fabric) || window.fabric; const im = new Image(); im.onload = () => { try { const obj = new f.Image(im); obj.multiUuid = "lcA-" + Date.now(); window.__lcA = obj; res({ ok: true }); } catch (e) { res({ ok: false }); } }; im.onerror = () => res({ ok: false }); im.src = arg.d; }), { d: dataUrl });
        A.steps.push(await state("A1-ctor"));
        await ev(() => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0]; const c = d && d.canvas; if (c && window.__lcA) { c.add(window.__lcA); if (c.requestRenderAll) c.requestRenderAll(); } return { ok: true }; });
        A.steps.push(await state("A2-add"));
        await SLEEP(300);
        A.steps.push(await state("A3-after"));
        await ev(() => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0]; const c = d && d.canvas; if (c) c.getObjects().filter((o) => o && String(o.multiUuid || "").indexOf("lcA-") === 0).forEach((o) => { try { c.remove(o); } catch (e) {} }); window.__lcA = null; return { ok: true }; });
        // Experiment B
        await freshOnce();
        const B = { id: "B-injectImg", steps: [] };
        rec.experiments.push(B);
        B.steps.push(await state("B0-base"));
        await injectImg(0, dataUrl, "p8l-", { left: 20, top: 20, scaleX: 1, scaleY: 1, w: 500, h: 150 });
        B.steps.push(await state("B1-injected"));
        for (const ms of [100, 250, 500, 1000, 3000]) { await SLEEP(ms - (B.steps[B.steps.length - 1].ms ? 0 : 0)); B.steps.push(await state("B+" + ms)); }
        await rollback("p8l-");
        // Experiment C
        await freshOnce();
        const C = { id: "C-ocr-chain", steps: [], samples: [], cap: null, status: null };
        rec.experiments.push(C);
        C.steps.push(await state("C0-base"));
        await injectImg(0, dataUrl, "p8l-", { left: 20, top: 20, scaleX: 1, scaleY: 1, w: 500, h: 150 });
        C.steps.push(await state("C1-injected"));
        await armDrawTextCap();
        C.steps.push(await state("C2-preClick"));
        const sampler = setInterval(() => { state("C-s").then((s) => { if (C.samples.length < 200) C.samples.push(s); }).catch(() => {}); }, 100);
        const before = await snapIds();
        const cl = await clickOcr();
        let last = null, done = false;
        const t0 = Date.now();
        for (;;) {
          const r = await ev(() => { const el = document.querySelector("#zy-native-status"); const st = el ? String(el.textContent || "").trim() : null; return { st: st ? st.slice(0, 160) : null }; });
          const st = r && r.st;
          if (st && st !== last) { last = st; C.status = (C.status || []).concat([st]); }
          if (st && /已生成 \d+ 个文字|未识别到文字|失败|滚/.test(st)) { done = true; break; }
          if (Date.now() - t0 > 120000) break;
          await SLEEP(900);
        }
        clearInterval(sampler);
        C.done = done;
        C.steps.push(await state("C3-afterOcr"));
        C.cap = await readCap();
        await rollback("p8l-");
      } catch (e) { rec.errors.push(String(e && e.message || e).slice(0, 400)); }
    } else if (MODE === "drawitem-probe") {
      // D2-C2：验证「真实对象序列化 setItemListJson → concat（Paste 等价）→ itemList=1 → drawText」链路（页面世界诊断）
      const rec = { mode: "drawitem-probe", steps: [], errors: [] };
      out.records.push(rec);
      const st = (tag) => ev((arg) => {
        const req = window.requirejs || window.require;
        const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
        const PV = (function () { try { return req.s.contexts._.defined.ProductVO; } catch (e) { return null; } })() || (window.ProductVO || null);
        const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
        const c = d && d.canvas;
        const eIdx = PV && PV.currentCanvasNum != null ? Math.max(0, PV.currentCanvasNum - 1) : 0;
        const il = PV && PV.pageList && PV.pageList[eIdx] && PV.pageList[eIdx].content ? PV.pageList[eIdx].content.itemList : null;
        return { tag: arg.tag, itemListLen: il ? il.length : null, objLen: c ? c.getObjects().length : null, regLen: d && d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr ? d.canvasObjInfo.canvasToProductObjArr.length : null, txt: c ? c.getObjects().filter((o) => o && typeof o.text === "string").length : null };
      }, { tag });
      try {
        const DU = await render();
        const dataUrl = typeof DU === "string" ? DU : DU.dataUrl;
        rec.steps.push(await st("base"));
        await injectImg(0, dataUrl, "p8d-", { left: 20, top: 20, scaleX: 1, scaleY: 1, w: 500, h: 150 });
        rec.steps.push(await st("afterInject"));
        // 序列化 + concat（Paste 等价；诊断用）
        const ser = await ev((arg) => {
          const req = window.requirejs || window.require;
          const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
          const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
          const c = d && d.canvas;
          const PV = (function () { try { return req.s.contexts._.defined.ProductVO; } catch (e) { return null; } })() || (window.ProductVO || null);
          const ea = (function () { try { return req.s.contexts._.defined[arg.mod] || (window[arg.mod]); } catch (e) { return null; } })();
          // 找 ea：包含 setItemListJson 的模块
          let holder = null;
          if (req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined) {
            try { Object.keys(req.s.contexts._.defined).forEach((k) => { if (!holder) { const m = req.s.contexts._.defined[k]; if (m && typeof m.setItemListJson === "function") holder = m; } }); } catch (e) {}
          }
          const eIdx = PV && PV.currentCanvasNum != null ? Math.max(0, PV.currentCanvasNum - 1) : 0;
          const page = PV && PV.pageList && PV.pageList[eIdx];
          const content = page && page.content;
          const imgObj = c ? c.getObjects().filter((o) => o && String(o.type) === "image" && String(o.multiUuid || "").indexOf("p8d-") === 0)[0] : null;
          if (!holder) return { ok: false, reason: "no setItemListJson holder" };
          if (!content || !imgObj) return { ok: false, reason: "no content or image" };
          try {
            const res = holder.setItemListJson([imgObj], c);
            const items = res && Array.isArray(res.itemList) ? res.itemList : null;
            if (!items || !items.length) return { ok: false, reason: "empty serialized" };
            content.itemList = (Array.isArray(content.itemList) ? content.itemList : []).concat(items);
            return { ok: true, nItems: items.length, keys: Object.keys(items[0]).slice(0, 14), mediaType: items[0].media && items[0].media.mediaType, hasLocation: !!items[0].location, hasLayer: !!items[0].layer, itemObjLen: Object.keys(items[0]).length };
          } catch (e) { return { ok: false, reason: String(e && e.message || e).slice(0, 200) }; }
        }, {});
        rec.serialized = ser;
        rec.steps.push(await st("afterConcat"));
        // drawText（与四象限相同 payload）
        const dt = await ev(() => {
          const req = window.requirejs || window.require;
          const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
          const diy = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
          if (!diy || typeof diy.drawText !== "function") return { skipped: "no drawText" };
          const entry = { media: { mediaType: "text", text: "验证文字AB", font: { pointSize: 30, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "1", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.2, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: 40, y: 40, width: 120, height: 40, factWidth: 120, factHeight: 40, rotation: 0 }, printLocation: { x: 40, y: 40, width: 120, height: 40, rotation: 0 }, layer: { alpha: 1 }, layerNum: 1, isEdit: 1, isDisplay: 0, deleteState: 0, visitLevel: 1, multiUuid: "dp-" + Date.now(), markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0, lowPixelFlag: 0, selectEnabled: 1, isDesign: 1, isComposite: 0, isPreview: 0, isDesignShape: 0 };
          try { diy.drawText(String(entry.media.text), null, null, null, entry, 1); return { ok: true }; }
          catch (e) { return { ok: false, err: String(e && e.message || e).slice(0, 300), stack: String(e && e.stack || "").slice(0, 500) }; }
        });
        rec.drawText = dt;
        rec.steps.push(await st("afterDrawText"));
        await rollback("p8d-");
      } catch (e) { rec.errors.push(String(e && e.message || e).slice(0, 300)); }
    } else if (MODE === "native-image-inventory") {
      // PHASE C1/C2：站点原生「添加图片」path 取证（禁 fabric.Image；Playwright file input 上传真实图片）
      const rec = { mode: "native-image-inventory", steps: [], ui: null, created: null, serialized: null, errors: [] };
      out.records.push(rec);
      try {
        const DU = await render();
        const dataUrl = typeof DU === "string" ? DU : DU.dataUrl;
        // 临时 PNG（真实文件，供上传）
        const b64 = String(dataUrl).replace(/^data:[^;]+;base64,/, "");
        const tmpPng = path.join(REPORT_DIR, "native-upload-input.png");
        fs.writeFileSync(tmpPng, Buffer.from(b64, "base64"));
        rec.tmpPng = tmpPng;
        // Step1 基线
        const base = await ev(() => {
          const req = window.requirejs || window.require;
          const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
          const PV = (function () { try { return req.s.contexts._.defined.ProductVO; } catch (e) { return null; } })() || (window.ProductVO || null);
          const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
          const c = d && d.canvas;
          const eIdx = PV && PV.currentCanvasNum != null ? Math.max(0, PV.currentCanvasNum - 1) : 0;
          const il = PV && PV.pageList && PV.pageList[eIdx] && PV.pageList[eIdx].content ? PV.pageList[eIdx].content.itemList : null;
          const files = Array.from(document.querySelectorAll('input[type="file"]')).map((f, i) => ({ i, accept: f.accept || null, cls: String(f.className || "").slice(0, 60) }));
          const btns = Array.from(document.querySelectorAll("li,a,button,span,i")).filter((el) => /图片|上传|素材|插图/.test(String(el.textContent || "").trim()) && String(el.textContent || "").trim().length <= 10).slice(0, 8).map((el) => ({ tag: el.tagName, cls: String(el.className || "").slice(0, 60), text: String(el.textContent || "").trim().slice(0, 12) }));
          const imgs = c ? c.getObjects().map((o) => ({ type: o.type, multiUuid: o.multiUuid || null })) : null;
          return { fileInputs: files, imageButtons: btns, objLen: c ? c.getObjects().length : null, regLen: d && d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr ? d.canvasObjInfo.canvasToProductObjArr.length : null, itemListLen: il ? il.length : null, objs: imgs };
        });
        rec.ui = { fileInputs: base.fileInputs, imageButtons: base.imageButtons };
        rec.steps.push({ tag: "base", objLen: base.objLen, regLen: base.regLen, itemListLen: base.itemListLen, objs: base.objs });
        // Step2 找目标 file input（优先带图片语义；否则第一个）
        let sel = null;
        const fsel = await ev(() => {
          const files = Array.from(document.querySelectorAll('input[type="file"]'));
          if (!files.length) return { found: false };
          let pick = files[0];
          for (const f of files) { if (/image|img|pic|upload/i.test(String(f.accept || "") + " " + String(f.className || ""))) { pick = f; break; } }
          return { found: true, id: pick.id || "", cls: String(pick.className || "").slice(0, 80), counts: files.length };
        });
        rec.fileInputPick = fsel;
        if (fsel && fsel.found) {
          // 若图片按钮存在先点击展开（采样）
          if (base.imageButtons && base.imageButtons.length) { try { await ev((t) => { const w = Array.from(document.querySelectorAll("li,a,button,span,i")); const el = w.filter((x) => String(x.textContent || "").trim() === t && String(x.className || "").indexOf("img") >= 0)[0] || w.filter((x) => String(x.textContent || "").trim() === t)[0]; if (el && el.offsetParent) { try { el.click(); } catch (e) {} return true; } return false; }, base.imageButtons[0].text); await SLEEP(1200); } catch (e) {} }
          const beforeIds = await snapIds();
          try {
            await page.setInputFiles('input[type="file"]', tmpPng);
          } catch (e) { rec.errors.push("setInputFiles:" + String(e && e.message || e).slice(0, 120)); }
          // 等待对象增加
          let created = null;
          const t0 = Date.now();
          for (;;) {
            await SLEEP(900);
            const r = await ev(() => {
              const req = window.requirejs || window.require;
              const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
              const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
              const c = d && d.canvas;
              const PV = (function () { try { return req.s.contexts._.defined.ProductVO; } catch (e) { return null; } })() || (window.ProductVO || null);
              const eIdx = PV && PV.currentCanvasNum != null ? Math.max(0, PV.currentCanvasNum - 1) : 0;
              const il = PV && PV.pageList && PV.pageList[eIdx] && PV.pageList[eIdx].content ? PV.pageList[eIdx].content.itemList : null;
              const newObs = c ? c.getObjects().filter((o) => o && String(o.type) === "image").map((o) => ({ multiUuid: o.multiUuid || null, uuid: o.uuid || null })) : [];
              return { objLen: c ? c.getObjects().length : null, regLen: d && d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr ? d.canvasObjInfo.canvasToProductObjArr.length : null, itemListLen: il ? il.length : null, lastItem: il && il.length ? { keys: Object.keys(il[il.length - 1]).slice(0, 16), loc: il[il.length - 1].location, mediaType: il[il.length - 1].media && il[il.length - 1].media.mediaType } : null, newObs: newObs };
            });
            const grew = r.objLen !== null && base.objLen !== null && r.objLen > base.objLen;
            if (grew || Date.now() - t0 > 30000) { created = r; break; }
          }
          rec.steps.push({ tag: "afterUpload", ...created });
          // Step3 新对象详情 + setItemListJson(native)
          const detail = await ev((arg) => {
            const req = window.requirejs || window.require;
            const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
            const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
            const c = d && d.canvas;
            const newOne = c ? c.getObjects().filter((o) => o && String(o.type) === "image" && String(o.multiUuid || "").indexOf(arg.prevBase.loggedUuid || "__none__") < 0).slice(-1)[0] || null : null;
            const o = newOne;
            const out = { found: !!o };
            if (o) {
              const res = {};
              ["type", "width", "height", "scaleX", "scaleY", "left", "top", "angle", "originX", "originY", "id", "name"].forEach((k) => { try { res[k] = o[k]; } catch (e) {} });
              res.multiUuid = o.multiUuid || null; res.uuid = o.uuid || null; res.markuuid = o.markuuid || null;
              try { res.media = { mediaType: o.media && o.media.mediaType, hasMedia: !!o.media }; } catch (e) {}
              try { res.location = o.location || null; res.printLocation = o.printLocation || null; } catch (e) {}
              try { res.layer = o.layer || null; res.layerNum = o.layerNum; } catch (e) {}
              res.bizFields = Object.keys(o).filter((k) => /uuid|markuuid|media|location|print|layer|product|origin|container/i.test(k)).slice(0, 20);
              out.obj = res;
            }
            // serializer on native object
            let holder = null;
            if (req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined) {
              try { Object.keys(req.s.contexts._.defined).forEach((k) => { if (!holder) { const m = req.s.contexts._.defined[k]; if (m && typeof m.setItemListJson === "function") holder = m; } }); } catch (e) {}
            }
            if (holder && o) { try { const sr = holder.setItemListJson([o], c); out.serialized = { n: sr && Array.isArray(sr.itemList) ? sr.itemList.length : -1, firstKeys: sr && sr.itemList && sr.itemList[0] ? Object.keys(sr.itemList[0]).slice(0, 14) : null, mediaType: sr && sr.itemList && sr.itemList[0] && sr.itemList[0].media && sr.itemList[0].media.mediaType }; } catch (e) { out.serialized = { err: String(e && e.message || e).slice(0, 120) }; } }
            else out.serialized = { n: -1, reason: o ? "no holder" : "no object" };
            return out;
          }, { prevBase: {} });
          rec.created = detail;
          // 清理（删除新增对象）
          await ev(() => {
            const req = window.requirejs || window.require;
            const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
            const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
            const c = d && d.canvas;
            let removed = 0;
            if (c) { const before = c.getObjects().length; c.getObjects().slice().forEach((o) => { if (o && String(o.type) === "image") { try { c.remove(o); removed += 1; } catch (e) {} } }); }
            return { removed, before: rec.steps[rec.steps.length - 1].objLen, events: [] };
          });
        } else {
          rec.uiFound = false;
        }
        const after = await ev(() => {
          const req = window.requirejs || window.require;
          const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
          const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
          const c = d && d.canvas;
          return { objLen: c ? c.getObjects().length : null };
        });
        rec.afterCleanup = after;
      } catch (e) { rec.errors.push(String(e && e.message || e).slice(0, 300)); }
    } else if (MODE === "quad") {
      // C 四象限：页面世界直接调 diy.drawText，font.id × width 组合（同一模板 1040459）
      await armDrawTextCap();
      const quad = [
        { id: "A-248x493", font: "248", width: 493 },
        { id: "B-1x493", font: "1", width: 493 },
        { id: "C-248x200", font: "248", width: 200 },
        { id: "D-1x200", font: "1", width: 200 }
      ];
      for (const q of quad) {
        const rec = { mode: "quad", case: q.id, font: q.font, width: q.width, result: null, err: null, stack: null };
        out.records.push(rec);
        const r = await ev((arg) => {
          const req = window.requirejs || window.require;
          const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
          const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
          const diy = d;
          if (!diy || typeof diy.drawText !== "function") return { skipped: "no drawText" };
          const entry = {
            media: { mediaType: "text", text: "大字标题实例文字", font: { pointSize: 59, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: arg.font, isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.2, lineIdType: 0, isBG: 0, imgPath: "" },
            location: { x: 20, y: 20, width: arg.width, height: 85, factWidth: arg.width, factHeight: 85, rotation: 0 },
            printLocation: { x: 20, y: 20, width: arg.width, height: 85, rotation: 0 },
            layer: { alpha: 1 }, layerNum: 1, isEdit: 1, isDisplay: 0, deleteState: 0, visitLevel: 1,
            multiUuid: "quad-" + Date.now() + "-" + arg.font + "-" + arg.width, markuuid: "",
            topEnable: 1, resourceType: 0, maskEnable: 0, lowPixelFlag: 0, selectEnabled: 1, isDesign: 1, isComposite: 0, isPreview: 0, isDesignShape: 0
          };
          try { diy.drawText(String(entry.media.text), null, null, null, entry, 1); return { ok: true }; }
          catch (e) { return { ok: false, err: String(e && e.message || e).slice(0, 300), stack: String(e && e.stack || "").slice(0, 500) }; }
        }, { font: q.font, width: q.width });
        rec.result = r;
        rec.canvas = { width: (await ev(() => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const c = vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas; return c ? { w: c.width, h: c.height } : null; })) };
        await rollback("quad-");
      }
      // 原生方法源码特征
      const src = await ev(() => {
        const req = window.requirejs || window.require;
        const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
        const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
        let dt = null, ck = null;
        try { dt = d && d.drawText && String(d.drawText.toString()).slice(0, 1200); } catch (e) {}
        try { const proto = Object.getPrototypeOf(d); ck = proto && proto.checkObjsInProductJson && String(proto.checkObjsInProductJson.toString()).slice(0, 1500); } catch (e) {}
        const fontLi = Array.from(document.querySelectorAll(".fontFamily li")).slice(0, 3).map((li) => ({ fontid: li.getAttribute("fontid"), text: String(li.textContent || "").trim().slice(0, 20) }));
        return { drawTextSrc: dt, checkObjsSrc: ck, fontFamilyLis: fontLi };
      });
      out.nativeSrc = src;
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
  const name = MODE === "bg" ? "background-position.json" : MODE === "size" ? "direct-image-scale.json" : MODE === "native-add-text" ? "native-add-text-1040459.json" : MODE === "itemlist-lifecycle" ? "itemlist-lifecycle-1040459.json" : MODE === "itemlist-source" ? "itemlist-source-1040459.json" : MODE === "drawitem-probe" ? "drawitem-probe-1040459.json" : MODE === "native-image-inventory" ? "c-native-inventory-1040459.json" : "canvas-88x57-create-failure.json";
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, name), JSON.stringify(out, null, 2));
  console.log("STAGE-8A2B " + MODE + " done records=" + out.records.length + " errors=" + out.errors.length + " -> " + path.join(REPORT_DIR, name));
})();