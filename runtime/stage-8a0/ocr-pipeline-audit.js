// runtime/stage-8a0/ocr-pipeline-audit.js — Stage 8A-0 真机 OCR Pipeline 运行时审计（§四~§四十九）
// ---------------------------------------------------------------------
// 复用 7.8R 已验证完整流程（ScriptCat install → goto → reload → waitUntil canvasReady →
//   百度凭据 DOM 注入 → 每轮 OCR → 回滚）。
// 每 fixture 捕获：
//   1) 页面/画布：currentCanvasNum/pageId/side/canvasWidth/Height(Fabric 单位)
//   2) 图片来源对象线性审计：image / backgroundImage 的 element natural 尺寸、fabric width/height、
//      scaleX/scaleY/left/top/angle、crop 存在性、src 长度（四尺寸链 evidence）
//   3) OCR 一次：PREPARING(kind/WxH/dataUrl 长度)、provider、识别行数、quality6、created texts、
//      SOURCE_PAGE → 坐标空间证据
// 输出 runtime/reports/stage-8a0/*.json（route/source-image/provider-route）
// 凭据：env ZY_BAIDU_AK / ZY_BAIDU_SK（禁硬编码）。零生产代码修改。
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
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-8a0");
const BRANCH = "stage-8a-ocr-audit";
const BAIDU_AK = process.env.ZY_BAIDU_AK || "";
const BAIDU_SK = process.env.ZY_BAIDU_SK || "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FIXTURES = [
  { id: "ctl-252438", url: "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do", note: "已知对照组（Stage7/8 全链路已验证）" },
  { id: "fx-a-92x56", url: "https://diy.zheliyin.com/diyWeb/third/1065075/2114747/999/thirdDiyAdd.do", note: "Fixture A 92×56（规格 §四）" },
  { id: "fx-b-88_5x57", url: "https://diy.zheliyin.com/diyWeb/third/1040459/5368967/999/thirdDiyAdd.do", note: "Fixture B 88.5×57（规格 §四）" }
];

function injectUserscript() {
  let code = fs.readFileSync(USERSCRIPT_PATH, "utf8");
  code = code.split("test/extension/src/").join(BRANCH + "/extension/src/");
  code = code.split("demo/extension/src/").join(BRANCH + "/extension/src/");
  code = code.replace(/test\/zheliyin-card-assistant\.user\.js/g, BRANCH + "/zheliyin-card-assistant.user.js");
  code = code.replace(/demo\/zheliyin-card-assistant\.user\.js/g, BRANCH + "/zheliyin-card-assistant.user.js");
  return code;
}

(async () => {
  const out = { ts: new Date().toISOString(), stage: "STAGE-8A0-OCR-PIPELINE-AUDIT", branch: BRANCH, fixtures: [], errors: [] };
  let browser = null, page = null;
  const ev = (fn, arg) => (arg === undefined ? page.evaluate(fn) : page.evaluate(fn, arg)).catch((e) => ({ err: String(e || "").slice(0, 200) }));
  const waitUntil = async (fnEval, desc, timeoutMs, pollMs = 1500) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) { const r = await ev(fnEval); if (r && r.ok) return { ok: true, data: r, ms: Date.now() - t0 }; await sleep(pollMs); }
    return { ok: false, desc };
  };
  const canvasReady = () => () => {
    const req = window.requirejs || window.require;
    const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
    const d = (vo && Array.isArray(vo.totalCanvasArray) && vo.totalCanvasArray[0]) || null;
    return { ok: !!(d && d.canvas && typeof d.drawText === "function") };
  };

  const auditPage = () => ev(() => {
    const req = window.requirejs || window.require;
    const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
    const out = { ok: false };
    if (!vo || !Array.isArray(vo.totalCanvasArray)) return out;
    const pages = [];
    (vo.totalCanvasArray || []).forEach((d, ci) => {
      const c = d && d.canvas;
      if (!c) return;
      const rec = { canvasIndex: ci, pageId: d.pageId || null, side: ci === 0 ? "FRONT" : ci === 1 ? "BACK" : "UNKNOWN" };
      rec.canvasWidth = c.width; rec.canvasHeight = c.height;
      const objs = c.getObjects ? c.getObjects() : [];
      rec.objectCount = objs.length;
      rec.images = objs.filter((o) => o && String(o.type) === "image").map((o) => {
        const el = o._element || (o.getElement && o.getElement()) || null;
        return {
          x: o.left, y: o.top, angle: o.angle || 0,
          width: o.width, height: o.height, scaleX: o.scaleX, scaleY: o.scaleY,
          element: el ? { node: el.nodeName, naturalWidth: el.naturalWidth || null, naturalHeight: el.naturalHeight || null, srcLen: String(el.src || (el.getAttribute && el.getAttribute("src")) || "").length, srcHead: String(el.src || "").slice(0, 50) } : null
        };
      });
      const bg = c.backgroundImage || null;
      rec.backgroundImage = null;
      if (bg) {
        const bel = bg._element || (bg.getElement && bg.getElement()) || null;
        rec.backgroundImage = {
          width: bg.width, height: bg.height,
          scaleX: bg.scaleX, scaleY: bg.scaleY,
          left: bg.left, top: bg.top, angle: bg.angle || 0,
          element: bel ? { naturalWidth: bel.naturalWidth || null, naturalHeight: bel.naturalHeight || null, srcLen: String(bel.src || "").length } : null,
          cropX: bg.cropX != null ? bg.cropX : (bg.crop ? bg.crop.x : null),
          cropY: bg.cropY != null ? bg.cropY : (bg.crop ? bg.crop.y : null)
        };
      }
      pages.push(rec);
    });
    out.ok = true; out.currentCanvasNum = vo.currentCanvasNum != null ? vo.currentCanvasNum : null; out.pages = pages;
    return out;
  });

  const getCurrentPage = () => ev(() => new Promise((resolve) => {
    const on = (e) => { if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === "getCurrentPageResult") { window.removeEventListener("message", on); resolve({ ok: e.data.ok, code: e.data.code, pageId: e.data.pageId, side: e.data.side, cc: e.data.currentCanvasNum }); } };
    window.addEventListener("message", on);
    window.postMessage({ source: "zy-card-assistant", type: "getCurrentPage", _t: Date.now() }, location.origin);
    setTimeout(() => { window.removeEventListener("message", on); resolve({ timeout: true }); }, 4000);
  }));
  const clickOcrBtn = () => ev(() => {
    const q = ["#zy-native-ocr-btn", "[data-zy-role=ocr]", ".zy-native-ocr-btn"];
    for (const sel of q) { const el = document.querySelector(sel); if (el && el.offsetParent) { try { el.click(); return { clicked: true, via: sel }; } catch (e) { return { clicked: false, err: String(e).slice(0, 80) }; } } }
    const all = Array.from(document.querySelectorAll("button, a, span, div"));
    for (const el of all) { if (!el.offsetParent) continue; const t = String(el.textContent || "").trim(); if (t.indexOf("识别当前图片") >= 0 && t.length <= 12) { try { el.click(); return { clicked: true, via: "text" }; } catch (e) { return { clicked: false, err: String(e).slice(0, 80) }; } } }
    return { clicked: false };
  });
  const canvasInfo = () => ev(() => {
    const req = window.requirejs || window.require;
    const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
    const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[0]) || null;
    const c = d && d.canvas;
    if (!c) return { n: -1, texts: [] };
    return { n: c.getObjects().length, texts: c.getObjects().filter((o) => o && typeof o.text === "string").map((o) => String(o.text || "").slice(0, 14)) };
  });
  const rollbackAll = (tag) => ev((arg) => {
    const req = window.requirejs || window.require;
    const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
    let removed = 0;
    (vo && vo.totalCanvasArray || []).forEach((d) => {
      const c = d && d.canvas;
      if (!c) return;
      const objs = c.getObjects().filter((o) => o && (String(o.multiUuid || "").indexOf(arg.tag) === 0 || (typeof o.text === "string" && String(o.text).length > 0 && o.businessType === undefined && String(o.multiUuid || "").indexOf("audit-") === 0)));
      objs.forEach((o) => { try { const li = d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr ? d.canvasObjInfo.canvasToProductObjArr.indexOf(o) : -1; if (li >= 0) d.canvasObjInfo.canvasToProductObjArr.splice(li, 1); c.remove(o); } catch (e) {} });
      removed += objs.length;
    });
    try { if (vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas && vo.totalCanvasArray[0].canvas.requestRenderAll) vo.totalCanvasArray[0].canvas.requestRenderAll(); } catch (e) {}
    return { ok: true, removed };
  }, tag);

  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    browser = await chromium.launchPersistentContext(PROFILE, {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR],
      viewport: { width: 1440, height: 900 }
    });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    const opts = browser.pages()[0];
    await opts.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await sleep(2000);
    try {
      const all = await adapter.getAllScripts(opts);
      for (const s of (all || []).filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(opts, s.uuid); } catch (e) {} }
      await adapter.installByCode(opts, { uuid: "zheliyin-audit-" + Date.now(), code: injectUserscript(), upsertBy: "user" });
      out.install = "ok";
    } catch (e) { out.errors.push("scriptcat install: " + String(e && e.message || e).slice(0, 200)); }
    await sleep(1500);
    page = opts;
    out.console = [];
    page.on("console", (m) => { try { const txt = m.text(); if (/\[zy-ocr\]/.test(txt)) out.console.push(txt.slice(0, 400)); } catch (e) {} });
    // 强制重游 options 页，让 ScriptCat 刷新脚本注册（debug 实证：installByCode 后需重新导航才注入页面）
    await opts.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await sleep(1500);

    // 百度凭据 DOM 注入（env → native 面板表单 → 加密落库）
    if (BAIDU_AK && BAIDU_SK) {
      out.baiduInject = await ev((arg) => {
        const akIn = document.querySelector("#zy-baidu-ak-native") || document.querySelector("#zy-baidu-ak");
        const skIn = document.querySelector("#zy-baidu-sk-native") || document.querySelector("#zy-baidu-sk");
        const saveBtn = document.querySelector("#zy-baidu-save-native") || document.querySelector("#zy-baidu-save");
        if (!akIn || !skIn || !saveBtn) return { skipped: "inputs not found" };
        akIn.value = arg.ak; skIn.value = arg.sk;
        try { saveBtn.click(); } catch (e) { return { skipped: String(e && e.message || e).slice(0, 80) }; }
        return { triggered: true };
      }, { ak: BAIDU_AK, sk: BAIDU_SK });
      await sleep(3000);
    } else { out.baiduInject = { skipped: "no ZY_BAIDU_AK/ZY_BAIDU_SK" }; }

    for (const fx of FIXTURES) {
      const rec = { id: fx.id, url: fx.url, note: fx.note, pageAudit: null, pageInfo: null, ocr: null, errors: [] };
      out.fixtures.push(rec);
      try {
        // 每轮前强制 options 兜底导航（ScriptCat 注入稳定性；debug 实证需要）
        await opts.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
        await sleep(1000);
        await page.goto(fx.url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => rec.errors.push("goto: " + String(e).slice(0, 120)));
        await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
        const w = await waitUntil(canvasReady(), "editor+script bridge", 150000);
        if (!(w && w.ok)) { rec.errors.push("editor not ready"); continue; }
        await sleep(4000);
        rec.pageAudit = await auditPage();
        rec.pageInfo = await getCurrentPage();
        const before = await canvasInfo();
        const cl = await clickOcrBtn();
        rec.click = cl;
        if (!cl.clicked) { rec.errors.push("ocr btn not found"); continue; }
        let last = null, done = false;
        const t0 = Date.now();
        for (;;) {
          const r = await ev(() => { const el = document.querySelector("#zy-native-status"); const st = el ? String(el.textContent || "").trim() : null; return { st: st ? st.slice(0, 150) : null }; });
          const st = r && r.st;
          if (st && st !== last) { last = st; rec.statusFlow = (rec.statusFlow || []).concat([{ t: Math.round((Date.now() - t0) / 1000) + "s", s: st }]); }
          if (st && /已生成 \d+ 个文字|未识别到文字|失败|无法确定当前图片/.test(st)) { rec.finalStatus = st; done = true; break; }
          if (Date.now() - t0 > 180000) break;
          await sleep(900);
        }
        const after = await canvasInfo();
        const cTail = out.console.slice(-30).join("\n");
        rec.ocr = {
          done,
          createdDelta: (after.n || 0) - (before.n || 0),
          createdTexts: (after.texts || []).slice(-(after.n - before.n)),
          provider: /BAIDU_RECOGNIZING/.test(cTail) ? "baidu" : (/LOCAL_RECOGNIZING/.test(cTail) ? "local" : "unknown"),
          preparing: (function () { const m = cTail.match(/\[zy-ocr\]\[PREPARING\] ([^\n]*)/); return m ? m[1].slice(0, 160) : null; })(),
          baiduLines: (function () { const m = cTail.match(/BAIDU_RECOGNIZING\] lines=(\d+)/); return m ? Number(m[1]) : null; })(),
          sourcePage: (function () { const m = cTail.match(/SOURCE_PAGE\] pageId=([^\s]+) side=([^\s]+)/); return m ? { pageId: m[1], side: m[2] } : null; })(),
          quality6: (function () { const m = cTail.match(/"quality6":\{[^}]+\}/); return m ? m[0] : null; })(),
          consoleTail: out.console.slice(-14)
        };
        rec.accessible = done;
        await rollbackAll("audit-");
        await sleep(1500);
      } catch (e) {
        rec.errors.push(String(e && e.message || e).slice(0, 200));
      }
    }
  } catch (e) {
    out.errors.push(String(e && e.message || e).slice(0, 300));
  } finally {
    try { page && await page.close(); } catch (e) {}
    try { browser && await browser.close(); } catch (e) {}
  }
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, "ocr-runtime-route.json"), JSON.stringify({ generatedAt: new Date().toISOString(), install: out.install, baiduInject: out.baiduInject, fixtures: out.fixtures.map((f) => ({ id: f.id, url: f.url, accessible: f.accessible || null, pageInfo: f.pageInfo || null, click: f.click || null, finalStatus: f.finalStatus || null, errors: f.errors })), errors: out.errors }, null, 2));
  fs.writeFileSync(path.join(REPORT_DIR, "ocr-source-image.json"), JSON.stringify({ generatedAt: new Date().toISOString(), fixtures: out.fixtures.map((f) => ({ id: f.id, pageAudit: f.pageAudit })) }, null, 2));
  fs.writeFileSync(path.join(REPORT_DIR, "ocr-provider-route.json"), JSON.stringify({ generatedAt: new Date().toISOString(), fixtures: out.fixtures.map((f) => ({ id: f.id, ocr: f.ocr })) }, null, 2));
  console.log("STAGE-8A0 audit done fixtures=" + out.fixtures.length + " accessible=" + out.fixtures.filter((f) => f.accessible).length + " errors=" + out.errors.length + " -> " + REPORT_DIR);
  out.fixtures.forEach((f) => console.log("  " + f.id + " accessible=" + f.accessible + " provider=" + (f.ocr && f.ocr.provider) + " status=" + String(f.finalStatus || "").slice(0, 44)));
})();