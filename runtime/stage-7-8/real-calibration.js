// runtime/stage-7-8/real-calibration.js — Stage 7.8R 真机验收（§九/§二十七 精选轮次）
// ---------------------------------------------------------------------
// 真实 ScriptCat + 真实 userscript（@require 运行时替换 → stage-7-8-ocr-quality-calibration 分支，
//   追加 ocr-text-sanitizer / ocr-size-analyzer / ocr-text-safety-gate 三个 @require）
// 真实编辑器（252438，profile-usc3 持久会话）+ 真实百度 Key（env ZY_BAIDU_AK / ZY_BAIDU_SK，
//   运行时注入 GM，禁硬编码，不入库）
// Fixture 像素 PNG：页面 canvas fillText（系统 SimHei）渲染 → toDataURL → 注入原生 fabric.Image
//
// 轮次（--cases，逗号分隔，每轮独立回滚）：
//   fixA / fixG / fixH / fixI / fixJ / fixM   Fixture 轮（§九 A/G/H/I/J/M）
//   mtxA / mtxC / mtxO / mtxQ / mtxR / mtxT   特殊字符单变量组（§四 精选组）
//   dualFRONT / dualBACK                       双面页归属回归（§二十八）
// 输出：runtime/reports/stage-7-8r/real-calibration-{ts}.json
// 安全：始终不点保存/核稿（编辑器提交授权环境限制，SAVE/PROOF 如实 UNKNOWN，§五）
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
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-7-8r");
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const BRANCH = "stage-7-8-ocr-quality-calibration";
const BAIDU_AK = process.env.ZY_BAIDU_AK || "";
const BAIDU_SK = process.env.ZY_BAIDU_SK || "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 用户脚本注入改写：@require demo→calibration 分支 + 追加三个新模块 ----
function injectUserscript() {
  let code = fs.readFileSync(USERSCRIPT_PATH, "utf8");
  code = code.split("demo/extension/src/").join(BRANCH + "/extension/src/");
  const extraRequires = [
    "// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/" + BRANCH + "/extension/src/ocr/ocr-text-sanitizer.js?v=0.3.10.3",
    "// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/" + BRANCH + "/extension/src/ocr/ocr-size-analyzer.js?v=0.3.10.3",
    "// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/" + BRANCH + "/extension/src/ocr/ocr-text-safety-gate.js?v=0.3.10.3"
  ].join("\n");
  // 插在 ocr-quality.js @require 行之后
  const anchor = "extension/src/ocr/ocr-quality.js";
  const ai = code.indexOf(anchor);
  if (ai < 0) throw new Error("anchor ocr-quality.js not found");
  const lineEnd = code.indexOf("\n", ai);
  code = code.slice(0, lineEnd + 1) + extraRequires + "\n" + code.slice(lineEnd + 1);
  return code;
}

// ---- Fixture 定义（与 runtime/stage-7-8/fixtures golden 对齐；页面内渲染用）----
const FIX = {
  A: { w: 560, h: 300, rows: [{ t: "武汉高端科技有限公司", x: 40, y: 40, s: 32 }, { t: "张三", x: 40, y: 100, s: 32 }, { t: "13800138000", x: 40, y: 160, s: 32 }, { t: "市场部经理", x: 40, y: 220, s: 32 }] },
  G: { w: 560, h: 200, rows: [{ t: "优惠", x: 40, y: 60, s: 34 }, { t: "全场五折", x: 130, y: 76, s: 14 }] },
  H: { w: 560, h: 220, rows: [{ t: "年度盛典", x: 40, y: 36, s: 40 }, { t: "诚邀莅临指导", x: 40, y: 140, s: 16 }] },
  I: { w: 560, h: 240, rows: [{ t: "★ 至尊会员专属 ★", x: 40, y: 46, s: 30 }, { t: "◆●▲♥ 品质保证", x: 40, y: 130, s: 24 }] },
  J: { w: 560, h: 200, rows: [{ t: "联系电话：13800138000；邮箱：a@b.com", x: 40, y: 60, s: 26 }, { t: "网址：www.example.com（备用）", x: 40, y: 120, s: 26 }] },
  M: { w: 560, h: 200, rows: [{ t: "联系\u200b人：\u200b赵六", x: 40, y: 60, s: 28 }, { t: "电话：136\u200b0000\u200b1111", x: 40, y: 120, s: 28 }] }
};
const MATRIX = {
  A: { w: 620, h: 220, rows: [{ t: "你好，世界。你好！你好？", x: 40, y: 60, s: 30 }, { t: "你好、你好；你好：（）", x: 40, y: 130, s: 30 }] },
  C: { w: 620, h: 220, rows: [{ t: "《设计》「引号」『重点』", x: 40, y: 60, s: 30 }, { t: "——破折号……省略·间隔", x: 40, y: 130, s: 30 }] },
  O: { w: 620, h: 220, rows: [{ t: "ＡＢＣ１２３", x: 40, y: 60, s: 40 }, { t: "张三ａｂｃ", x: 40, y: 150, s: 30 }] },
  Q: { w: 620, h: 220, rows: [{ t: "VIP🎉服务", x: 40, y: 80, s: 40 }] },
  R: { w: 620, h: 220, rows: [{ t: "联\u200b系：\u200b赵\u200b六", x: 40, y: 80, s: 32 }] },
  T: { w: 620, h: 220, rows: [{ t: "名\uFE0F片\uFE0F", x: 40, y: 80, s: 32 }] }
};

(async () => {
  const CASES = (process.env.ZY_CASES || "fixA").split(",").map((s) => s.trim()).filter(Boolean);
  const out = { ts: new Date().toISOString(), stage: "STAGE-7.8R-REAL-CALIBRATION", branch: BRANCH, baiduKeySet: !!(BAIDU_AK && BAIDU_SK), cases: CASES, rounds: [], errors: [], scriptAt: USERSCRIPT_PATH };
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
  const renderFixtureDataUrl = (spec) => ev((arg) => {
    const W = arg.w, H = arg.h, scale = 2;
    const cv = document.createElement("canvas");
    cv.width = W * scale; cv.height = H * scale;
    const ctx = cv.getContext("2d");
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#000000";
    ctx.textBaseline = "top";
    (arg.rows || []).forEach((r) => { ctx.font = r.s + "px SimHei, Microsoft YaHei, sans-serif"; ctx.fillText(r.t, r.x, r.y); });
    return cv.toDataURL("image/png");
  }, spec);
  const ensureImageOnPage = (canvasIndex, dataUrl, tag) => ev(async (arg) => {
    const req = window.requirejs || window.require;
    const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
    const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[arg.canvasIndex]) || null;
    const c = d && d.canvas;
    if (!c) return { ok: false, reason: "no canvas" };
    const f = (c.constructor && c.constructor.fabric) || window.fabric;
    const existing = c.getObjects().filter((o) => o && String(o.type) === "image" && String(o.multiUuid || "").indexOf(arg.tag) === 0);
    if (existing.length) { existing.forEach((o) => { try { const li = d.canvasObjInfo.canvasToProductObjArr.indexOf(o); if (li >= 0) d.canvasObjInfo.canvasToProductObjArr.splice(li, 1); c.remove(o); } catch (e) {} }); }
    if (!f || !f.Image) return { ok: false, reason: "no fabric.Image" };
    // 直接用 HTMLImageElement + new fabric.Image(imgEl)（绕过 fromURL 解析差异，尺寸天然就绪）
    const inject = () => new Promise((resolve) => {
      try {
        const imgEl = new Image();
        imgEl.onload = function () {
          try {
            const im = new f.Image(imgEl);
            im.set({ left: 20, top: 20, scaleX: 1, scaleY: 1 });
            im.multiUuid = arg.tag + Date.now();
            c.add(im);
            try { if (d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr) d.canvasObjInfo.canvasToProductObjArr.push(im); } catch (e) {}
            try { c.setActiveObject(im); } catch (e) {}
            if (c.requestRenderAll) c.requestRenderAll();
            const imgs = c.getObjects().filter((o) => o && String(o.type) === "image");
            const first = imgs[imgs.length - 1] || null;
            resolve({ ok: true, uuid: im.multiUuid, n: c.getObjects().length, imgCount: imgs.length,
              img: { width: im.width, height: im.height, nw: imgEl.naturalWidth, nh: imgEl.naturalHeight, first: first ? { w: first.width, h: first.height } : null } });
          } catch (e) { resolve({ ok: false, reason: String(e && e.message || e).slice(0, 100) }); }
        };
        imgEl.onerror = function () { resolve({ ok: false, reason: "imgEl onerror" }); };
        imgEl.src = arg.dataUrl;
      } catch (e) { resolve({ ok: false, reason: String(e && e.message || e).slice(0, 100) }); }
    });
    return await inject();
  }, { canvasIndex, dataUrl, tag });
  const rollbackAllInjected = (tag) => ev((arg) => {
    const req = window.requirejs || window.require;
    const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
    let removed = 0, remaining = 0;
    (vo && vo.totalCanvasArray || []).forEach((d, ci) => {
      const c = d && d.canvas;
      if (!c) return;
      const objs = c.getObjects().filter((o) => o && (String(o.multiUuid || "").indexOf(arg.tag) === 0 || String(o.multiUuid || "").indexOf("p8r-txt-") === 0));
      objs.forEach((o) => { try { const li = d.canvasObjInfo.canvasToProductObjArr.indexOf(o); if (li >= 0) d.canvasObjInfo.canvasToProductObjArr.splice(li, 1); c.remove(o); } catch (e) {} });
      removed += objs.length; remaining += c.getObjects().length;
    });
    try { if (vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas.requestRenderAll) vo.totalCanvasArray[0].canvas.requestRenderAll(); } catch (e) {}
    return { ok: true, removed, remaining };
  }, tag);
  const clickOcrBtn = () => ev(() => {
    const q = ["#zy-native-ocr-btn", "[data-zy-role=ocr]", ".zy-native-ocr-btn"];
    for (const sel of q) { const el = document.querySelector(sel); if (el && el.offsetParent) { try { el.click(); return { clicked: true, via: sel }; } catch (e) { return { clicked: false, err: String(e).slice(0, 80) }; } } }
    const all = Array.from(document.querySelectorAll("button, a, span, div"));
    for (const el of all) { if (!el.offsetParent) continue; const t = String(el.textContent || "").trim(); if (t.indexOf("识别当前图片") >= 0 && t.length <= 12) { try { el.click(); return { clicked: true, via: "text" }; } catch (e) { return { clicked: false, err: String(e).slice(0, 80) }; } } }
    return { clicked: false };
  });
  const clickPage = (txt) => ev((arg) => {
    const all = Array.from(document.querySelectorAll("li, a, span, div, i, em, button"));
    for (const el of all) { if (!el.offsetParent) continue; const t = String(el.textContent || "").trim(); if (t === arg.txt && t.length <= 4) { try { el.click(); return { clicked: true, txt: t }; } catch (e) { return { clicked: false }; } } }
    return { clicked: false };
  }, { txt });
  const getCurrentPageByMessage = () => ev(() => new Promise((resolve) => {
    const on = (e) => { if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === "getCurrentPageResult") { window.removeEventListener("message", on); resolve({ ok: e.data.ok, code: e.data.code, pageId: e.data.pageId, side: e.data.side }); } };
    window.addEventListener("message", on);
    window.postMessage({ source: "zy-card-assistant", type: "getCurrentPage", _probeTs: Date.now() }, location.origin);
    setTimeout(() => { window.removeEventListener("message", on); resolve({ timeout: true }); }, 4000);
  }));
  const canvasTexts = (idx) => ev((arg) => {
    const req = window.requirejs || window.require;
    const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
    const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[arg.idx]) || null;
    const c = d && d.canvas;
    if (!c) return { n: -1, texts: [], display: [] };
    return {
      n: c.getObjects().length,
      texts: c.getObjects().filter((o) => o && typeof o.text === "string").map((o) => String(o.text || "").slice(0, 14)),
      display: c.getObjects().filter((o) => o && typeof o.text === "string").map((o) => ({ t: String(o.text || "").slice(0, 10), isDisplay: o.isDisplay }))
    };
  }, { idx });

  const runRound = async (caseId, idx) => {
    const rec = { caseId, idx, spec: null, render: null, imgInjected: null, click: null, statusFlow: [], createdDelta: 0, createdTexts: [], display: [], quality6: null, provider: null, ocrLines: null, safetyBlocks: 0, assert: {} };
    const consoleStart = out.console.length; // 本轮新增 console 起点（避免跨轮污染）
    if (caseId.indexOf("fix") === 0) rec.spec = FIX[caseId.replace("fix", "")];
    if (caseId.indexOf("mtx") === 0) rec.spec = MATRIX[caseId.replace("mtx", "")];
    if (rec.spec) {
      rec.render = await renderFixtureDataUrl(rec.spec); // 返回 dataUrl 字符串（ev 直接 resolve）
      rec.imgInjected = await ensureImageOnPage(idx, typeof rec.render === "string" ? rec.render : (rec.render && rec.render.dataUrl), "p8r-img-");
    }
    const before = await canvasTexts(idx);
    const cur = await getCurrentPageByMessage();
    rec.current = cur;
    rec.click = await clickOcrBtn();
    if (!rec.click.clicked) { rec.assert.blocked = "ocr button not found"; return rec; }
    const t0 = Date.now();
    let lastStatus = null, done = false;
    for (;;) {
      const r = await ev(() => {
        const el = document.querySelector("#zy-native-status");
        const st = el ? String(el.textContent || "").trim() : null;
        return { st: st ? st.slice(0, 140) : null };
      });
      const st = r && r.st;
      if (st && st !== lastStatus) { lastStatus = st; rec.statusFlow.push({ t: Math.round((Date.now() - t0) / 1000) + "s", s: st }); }
      if (st && /已生成 \d+ 个文字|未识别到文字|失败/.test(st)) { rec.finalStatus = st; done = true; break; }
      if (Date.now() - t0 > 180000) { break; }
      await sleep(900);
    }
    rec.after = await canvasTexts(idx);
    rec.createdDelta = (rec.after.n || 0) - (before.n || 0);
    rec.createdTexts = (rec.after.texts || []).slice(-rec.createdDelta);
    rec.display = (rec.after.display || []).filter((d) => d.isDisplay !== undefined);
    // 捕获 OCR 诊断（console [zy-ocr] DIAG：quality6 / provider / 识别行数 / SAFETY_GATE）——仅本轮新增
    rec.console = out.console.slice(consoleStart);
    rec.provider = /BAIDU_RECOGNIZING/.test(JSON.stringify(rec.console)) ? "baidu" : (/LOCAL_RECOGNIZING|local-fallback/.test(JSON.stringify(rec.console)) ? "local" : "unknown");
    rec.quality6 = (function () {
      const m = JSON.stringify(rec.console).match(/"quality6":\{[^}]+\}/);
      return m ? m[0] : null;
    })();
    rec.assert = {
      done, createdDelta: rec.createdDelta,
      pageId: cur && cur.pageId, side: cur && cur.side,
      pageOwned: !!(cur && cur.pageId === (idx === 1 ? "canvas:c1" : "canvas:c0")),
      hasText: (rec.createdTexts || []).length > 0,
      p0IsDisplaySafe: (rec.display || []).every((d) => d.isDisplay !== 1)
    };
    await rollbackAllInjected("p8r-");
    return rec;
  };

  try {
    if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
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
      await adapter.installByCode(opts, { uuid: "zheliyin-realcalib-" + Date.now(), code: injectUserscript(), upsertBy: "user" });
      out.install = "ok";
    } catch (e) { out.errors.push("scriptcat install: " + String(e && e.message || e).slice(0, 200)); }
    await sleep(1500);
    page = opts;
    out.console = [];
    page.on("console", (m) => { try { const txt = m.text(); if (/\[zy-ocr\]|zy-ocr|error|uncaught/i.test(txt)) out.console.push(txt.slice(0, 400)); } catch (e) {} });
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => out.errors.push(String(e).slice(0, 130)));
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const w = await waitUntil(canvasReady(), "editor+script bridge", 150000);
    out.ready = !!(w && w.ok);
    if (!out.ready) { out.errors.push("editor not ready"); throw new Error("editor_not_ready"); }
    await sleep(3000);
    const probeCur = await getCurrentPageByMessage();
    out.bridge = probeCur;
    // 百度凭据运行时注入（env → native 面板 DOM 表单 → 脚本 saveBaiduConfigPlain 加密落库；禁硬编码）
    if (BAIDU_AK && BAIDU_SK) {
      out.baiduInject = await ev((arg) => {
        const akIn = document.querySelector("#zy-baidu-ak-native") || document.querySelector("#zy-baidu-ak");
        const skIn = document.querySelector("#zy-baidu-sk-native") || document.querySelector("#zy-baidu-sk");
        const saveBtn = document.querySelector("#zy-baidu-save-native") || document.querySelector("#zy-baidu-save");
        if (!akIn || !skIn || !saveBtn) return { skipped: "inputs not found", akIn: !!akIn, skIn: !!skIn, saveBtn: !!saveBtn };
        akIn.value = arg.ak;
        skIn.value = arg.sk;
        try { saveBtn.click(); } catch (e) { return { skipped: "click err: " + String(e && e.message || e).slice(0, 80) }; }
        return { triggered: true, ak: !!arg.ak, sk: !!arg.sk };
      }, { ak: BAIDU_AK, sk: BAIDU_SK });
      await sleep(3000);
    } else {
      out.baiduInject = { skipped: "no ZY_BAIDU_AK/ZY_BAIDU_SK" };
    }
    for (const c of CASES) {
      const idx = c.indexOf("BACK") >= 0 ? 1 : 0;
      if (c === "dualBACK") { await clickPage("背面"); await sleep(2500); }
      if (c === "dualFRONT") { await clickPage("正面"); await sleep(2000); }
      const r = await runRound(c, idx);
      out.rounds.push(r);
      if (c === "dualBACK") { await clickPage("正面"); await sleep(2000); }
    }
    const finished = out.rounds.filter((r) => r.assert && !r.assert.blocked && r.assert.done);
    const createdOk = finished.filter((r) => r.assert.hasText && r.assert.pageOwned);
    out.verdict = {
      roundsDone: out.rounds.length, finished: finished.length, createdOk: createdOk.length,
      baiduSeen: out.rounds.some((r) => r.provider === "baidu"),
      pageOwnedAll: finished.every((r) => r.assert.pageOwned),
      p0IsDisplaySafeAll: finished.every((r) => r.assert.p0IsDisplaySafe)
    };
    out.RESULT = (out.ready && out.verdict.baiduSeen && out.verdict.pageOwnedAll) ? "PARTIAL" : "BLOCKED";
    const fname = path.join(REPORT_DIR, "real-calibration-" + Date.now() + ".json");
    fs.writeFileSync(fname, JSON.stringify(out, null, 2));
    console.log("STAGE-7.8R done result=" + out.RESULT + " ready=" + out.ready + " baiduKey=" + out.baiduKeySet + " rounds=" + out.rounds.length + " finished=" + finished.length + " createdOk=" + createdOk.length + " baiduSeen=" + out.verdict.baiduSeen + " report=" + fname);
  } catch (e) {
    out.errors.push(String(e && e.message || e).slice(0, 300));
    try { fs.writeFileSync(path.join(REPORT_DIR, "real-calibration-" + Date.now() + ".json"), JSON.stringify(out, null, 2)); } catch (e2) {}
    console.error("FATAL", e && (e.message || e));
    process.exitCode = 1;
  } finally {
    try { page && await page.close(); } catch (e) {}
    try { browser && await browser.close(); } catch (e) {}
  }
})();