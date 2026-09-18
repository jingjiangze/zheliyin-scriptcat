// ============================================================================
// runtime/p0/ocr-real-runner.js — REAL_OCR_MODE（真实用户脚本链路）
// ----------------------------------------------------------------------------
// 唯一目标：真实 OCR userscript 自己执行 OCR → 自己 TextBlock →
//   自己 postMessage ocrCreate → page-bridge → Native Object → 编辑器显示 →
//   Save → Reload → 核稿 → 印刷 → 自动核稿不报错。
// 禁止：Runner 拼 TextBlock / 调 drawText / 构造 item。只驱动【真实 UI】。
// 环境：真实 ScriptCat（runtime/vendor/scriptcat）+ 真实 userscript（本地文件）
// 用法：node runtime/p0/ocr-real-runner.js
// 凭据：P0_LOGIN_USER / P0_LOGIN_PASS（仅环境变量，禁止入库/写入报告 value）
// 产物：runtime/reports/p0/ocr-runtime/{ocr-raw,ocr-textblocks,ocr-create-items,
//   ocr-object-A-create,ocr-object-B-after-reload,ocr-object-D-before-proof}.json
//   + ocr-*.png（含 bbox 红框）+ ocr-run-summary.json
// ============================================================================
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const adapter = require("../scriptcat-adapter");

const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(__dirname, "..", "browser", "profile-usc3");
const USER = process.env.P0_LOGIN_USER || "";
const PASS = process.env.P0_LOGIN_PASS || "";
const EXT_ID = adapter.EXT_ID;
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const USERSCRIPT_PATH = path.join(ROOT, "zheliyin-card-assistant.user.js");
const REPO_VERSION = "0.3.10.2";
const P0_DIR = path.join(ROOT, "runtime", "reports", "p0");
const R = path.join(P0_DIR, "ocr-runtime");
const FIX_DIR = path.join(ROOT, "runtime", "p0", "fixtures");
const FIX_PNG = path.join(FIX_DIR, "ocr-test.png");
const TERMINAL_RE = /已生成\s*\d+\s*个文字|生成失败|识别异常|未识别到文字|引擎加载失败|引擎网络错误|OCR 失败|OCR 超时|超时|未找到|过旧|无响应|失败/;

let OCR_RUN_SEQ = 0;
function ocrRunId() { OCR_RUN_SEQ += 1; const d = new Date(); return "OCR-" + d.toISOString().slice(0, 10).replace(/-/g, "") + "-" + String(OCR_RUN_SEQ).padStart(3, "0"); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function snapshotOcrObject(o, extra) {
  if (!o) return null;
  const media = o.media || null;
  return Object.assign({
    constructor: o.constructor ? o.constructor.name : null, type: o.type, kind: o.mediaMediaType || o.objType || null, text: o.text,
    mediaType: media && media.mediaType, mediaFont: media && media.font ? media.font : null,
    fontId: o.mediafontId, fontFamily: o.fontFamily, fontSize: o.fontSize, fill: o.fill, fontWeight: o.fontWeight, lineHeight: o.lineHeight,
    left: o.left, top: o.top, width: o.width, height: o.height, scaleX: o.scaleX, scaleY: o.scaleY, angle: o.angle,
    visible: o.visible, opacity: o.opacity, selectable: o.selectable,
    isDisplay: o.isDisplay, isEdit: o.isEdit, resourceType: o.resourceType, isComposite: o.isComposite, isPreview: o.isPreview, isDesign: o.isDesign,
    selectEnabled: o.selectEnabled, visitLevel: o.visitLevel, maskEnable: o.maskEnable, lowPixelFlag: o.lowPixelFlag, topEnable: o.topEnable,
    uuid: o.uuid, multiUuid: o.multiUuid, markuuid: o.markuuid, layerNum: o.layerNum, isLineText: o.isLineText
  }, extra || {});
}
const SNAP_FN_SRC = snapshotOcrObject.toString();

let browser = null, page = null;
const browserNet = [];
const consoleLines = [];
const ev = (fn, arg) => (arg === undefined ? page.evaluate(fn) : page.evaluate(fn, arg)).catch((e) => ({ err: String(e || "").slice(0, 240) }));
async function waitUntil(fnEval, desc, timeoutMs, pollMs = 1500) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await ev(fnEval);
    if (r && r.ok) return { ok: true, data: r, ms: Date.now() - t0 };
    await sleep(pollMs);
  }
  return { ok: false, desc, ms: Date.now() - t0 };
}
function isReadyExpr() {
  return () => {
    const req = window.requirejs || window.require;
    const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
    const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[0]);
    return { ok: !!(d && d.canvas && typeof d.drawText === "function") };
  };
}
async function ensureLogin() {
  const lg = await ev(() => { const ua = document.querySelector("#userAccount"); return { visible: !!(ua && ua.offsetParent) }; });
  if (!lg.visible) return true;
  const r = await ev((arg) => {
    const setVal = (el, v) => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      try { setter.call(el, v); } catch (e) { el.value = v; }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const u = document.querySelector("#userAccount"); const p = document.querySelector("#userPassword");
    if (!u || !p) return { ok: false, reason: "no inputs" };
    u.focus(); u.select && u.select(); setVal(u, arg.u);
    p.focus(); p.select && p.select(); setVal(p, arg.p);
    const btn = document.querySelector(".btn-register") || Array.from(document.querySelectorAll("a, button, span")).find((el) => { const t = String(el.textContent || "").trim(); return /^登录$|^登\s*录$|^确定$|登 录/.test(t) && el.offsetParent; });
    if (!btn) return { ok: false, reason: "no login btn" };
    btn.click(); return { ok: true };
  }, { u: USER, p: PASS });
  await sleep(8000);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
  return true;
}
async function clickByName(txt) {
  return ev(() => {
    const all = document.querySelectorAll("li,a,button,span,div");
    for (let i = 0; i < all.length; i++) { const el = all[i]; const t = String(el.textContent || "").trim(); if (t === txt && el.offsetParent) { try { el.click(); return { clicked: true }; } catch (e) {} break; } }
    return { clicked: false };
  });
}
async function stageProofCore() {
  let hegaoOk = false;
  for (let a = 0; a < 3 && !hegaoOk; a++) {
    await clickByName("核稿");
    const w = await waitUntil(() => {
      const ls = document.querySelectorAll(".layui-layer, .modal, .modal-container, [class*=hegao], [class*=proof]");
      for (let i = 0; i < ls.length; i++) {
        const el = ls[i]; const rc = el.getBoundingClientRect(); if (rc.width === 0 && rc.height === 0) continue;
        const t = String(el.innerText || el.textContent || "").trim();
        if (/点击图片复制|核稿|生成/.test(t) && t.length > 1) return { ok: true };
      }
      return { ok: false };
    }, "hegao", 12000);
    hegaoOk = !!(w && w.ok);
    if (!hegaoOk) await sleep(1000);
  }
  await ev(() => { document.querySelectorAll(".close-btn, .layui-layer-close, .layui-layer-close2, [class*=close], .modal .close").forEach((el) => { if (el.offsetParent) { try { el.click(); } catch (e) {} } }); return {}; });
  await sleep(700);
  return hegaoOk;
}
async function fillOrderNo(val) {
  return ev((arg) => {
    const inp = Array.from(document.querySelectorAll("input")).find((el) => {
      const probe = String(el.placeholder || "") + " " + String(el.className || "") + " " + String(el.id || "");
      return el.offsetParent && /订单号|orderNo|orderid|orderno/i.test(probe);
    });
    if (!inp) return { ok: false, reason: "no order input" };
    inp.value = arg.v;
    try { inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
    return { ok: true };
  }, { v: String(val) });
}
// 设计信息层填写 + 确定（印刷表单）
async function fillDesignInfo() {
  return ev(() => {
    const layers = document.querySelectorAll(".layui-layer, .modal, .modal-container");
    let host = null;
    for (let i = 0; i < layers.length; i++) { if (layers[i].offsetParent && /作品名/.test(String(layers[i].innerText || ""))) { host = layers[i]; break; } }
    const scope = host || document;
    const inputs = scope.querySelectorAll("input[type=text], input:not([type]), textarea");
    const setByLabel = (keys, val) => {
      for (let i = 0; i < inputs.length; i++) { const el = inputs[i]; if (el.__p0) continue; const joined = (el.previousElementSibling ? String(el.previousElementSibling.textContent || "") : "") + String(el.placeholder || "") + String(el.title || ""); for (let k = 0; k < keys.length; k++) { if (joined.indexOf(keys[k]) >= 0) { el.value = val; try { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {} el.__p0 = 1; break; } } }
    };
    setByLabel(["作品", "作品名", "workName", "名称"], "1");
    setByLabel(["用户", "用户名", "userName", "姓名"], "2");
    setByLabel(["备注"], "ocr real");
    return { ok: true };
  });
}
async function clickConfirmInLayer() {
  return ev(() => {
    const btns = document.querySelectorAll(".layui-layer button, .layui-layer a, .layui-layer-btn0, .modal button, .modal a");
    for (let i = 0; i < btns.length; i++) { const tx = String(btns[i].textContent || "").trim(); if (/^确定$|^保存$/.test(tx)) { try { btns[i].click(); return { clicked: true }; } catch (e) {} break; } }
    return { clicked: false };
  });
}
async function stagePrintCore() {
  for (let attempt = 0; attempt < 3; attempt++) {
    await ev(() => {
      const cands = document.querySelectorAll(".btn.print, li.print, [class*=' print'], .rightBtn li, .rightBtn a");
      let best = null;
      for (let i = 0; i < cands.length; i++) { const el = cands[i]; const tx = String(el.textContent || "").trim(); const cls = String(el.className || ""); if (/印刷/.test(tx) && /print/i.test(cls)) { best = el; break; } if (/印刷/.test(tx) && !best) best = el; }
      if (!best) { const all = document.querySelectorAll("li,a,button,span,div"); for (let i = 0; i < all.length; i++) { if (String(all[i].textContent || "").trim() === "印刷" && all[i].offsetParent) { best = all[i]; break; } } }
      if (best) { try { best.click(); } catch (e) {} }
    });
    await sleep(1200);
    const w = await waitUntil(() => {
      const layers = document.querySelectorAll(".layui-layer, .modal, .modal-container");
      for (let i = 0; i < layers.length; i++) {
        const el = layers[i]; const rc0 = el.getBoundingClientRect(); if (rc0.width === 0 && rc0.height === 0) continue;
        const t = String(el.innerText || "");
        if (/作品名|设计信息/.test(t) && /用户名/.test(t)) return { ok: true };
      }
      return { ok: false };
    }, "design-info", 25000);
    if (!(w && w.ok)) continue;
    await fillDesignInfo();
    await sleep(600);
    await clickConfirmInLayer();
    return { ok: true, attempt };
  }
  return { ok: false, reason: "no design-info layer" };
}
async function searchSync(maxRounds = 4) {
  const log = [];
  for (let r = 0; r < maxRounds; r++) {
    const sc = await ev(() => {
      const layers = Array.from(document.querySelectorAll(".modal, .layui-layer"));
      const scan = (root) => {
        const cands = root.querySelectorAll("a, button, span, i, em, input[type=button], input[type=submit]");
        for (let j = 0; j < cands.length; j++) {
          const el = cands[j]; const rc0 = el.getBoundingClientRect(); if (rc0.width === 0 && rc0.height === 0) continue;
          const cls = String(el.className || ""); const tx = String(el.textContent || el.value || "").trim();
          if (/icon[ -]?search|search-btn/i.test(cls) || tx === "搜索" || tx === "查 询" || tx === "查询") { if (/temp-info|hdgy|menuCont|navItem/.test(cls)) continue; return el; }
        }
        return null;
      };
      for (let i = 0; i < layers.length; i++) { if (!layers[i].offsetParent) continue; const el = scan(layers[i]); if (el) { try { el.click(); return { clicked: true, cls: String(el.className || "").slice(0, 40) }; } catch (e) {} } }
      return { clicked: false };
    });
    await sleep(1200);
    const gen = await ev(() => {
      const layers = document.querySelectorAll(".layui-layer, .modal, .modal-container");
      for (let i = 0; i < layers.length; i++) {
        if (!layers[i].offsetParent) continue;
        if (/印刷稿件生成中|请耐心等待|生成中/.test(String(layers[i].innerText || ""))) return true;
      }
      return false;
    });
    if (gen) {
      await ev(() => { document.querySelectorAll(".layui-layer button, .layui-layer a, .modal button, .modal a").forEach((el) => { const tx = String(el.textContent || "").trim(); if (/确认|确定|关闭|知道了|好/.test(tx) && el.offsetParent) { try { el.click(); } catch (e) {} } }); return {}; });
      await sleep(2000);
    }
    log.push({ r, clicked: sc && sc.clicked, cls: sc && sc.cls });
  }
  return { log };
}

(async () => {
  const RUN = { ts: new Date().toISOString(), ocrRunId: null, stage: "REAL_OCR", url: EDITOR_URL, phases: {}, statusLog: [], errors: [] };
  RUN.ocrRunId = ocrRunId();
  const wr = (name, obj) => fs.writeFileSync(path.join(R, name), JSON.stringify(obj, null, 2));
  try {
    if (!fs.existsSync(path.join(SC_DIR, "manifest.json"))) throw new Error("ScriptCat vendor missing: " + SC_DIR);
    if (!fs.existsSync(P0_DIR)) fs.mkdirSync(P0_DIR, { recursive: true });
    if (!fs.existsSync(R)) fs.mkdirSync(R, { recursive: true });
    if (!fs.existsSync(FIX_DIR)) fs.mkdirSync(FIX_DIR, { recursive: true });

    browser = await chromium.launchPersistentContext(PROFILE, {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR],
      viewport: { width: 1440, height: 900 }
    });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    page = browser.pages()[0];
    page.on("console", (m) => { const t = String(m.text() || ""); if (/zy-ocr|折立印|INIT|BUILDING|SUCCESS|ERROR|FALLBACK|RECOGNIZING|CANVAS_READY|PREPARING|LOCAL_|QUALITY|GROUP/.test(t)) consoleLines.push(t.slice(0, 300)); });
    page.on("response", async (resp) => {
      try {
        const u = resp.url();
        if (u.indexOf("zheliyin.com") < 0 && u.indexOf("aip.baidubce.com") < 0 && u.indexOf("aip.yun.baidu") < 0) return;
        const ct = resp.headers()["content-type"] || "";
        if (ct.indexOf("json") < 0 && !/imgPreviewSearch|submitUserDesign|do$/.test(u)) return;
        let b = "";
        try { if (ct.indexOf("json") >= 0) b = await resp.text().catch(() => ""); } catch (e) {}
        const rec = { status: resp.status(), u: u.slice(0, 220) };
        if (/imgPreviewSearch|submitUserDesign|ocr|baidu/gi.test(u)) { try { rec.body = String(b || "").slice(0, 4000); } catch (e) {} }
        browserNet.push(rec);
      } catch (e) {}
    });
    RUN.authConfigured = !!(USER && PASS);

    // ---- 2. ScriptCat：安装当前用户脚本（清旧 + 清 @require 资源缓存）----
    const opts = browser.pages()[0];
    await opts.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await sleep(2500);
    try {
      const all = await adapter.getAllScripts(opts);
      const mine = (all || []).filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")));
      for (const s of mine) { try { await adapter.removeScript(opts, s.uuid); } catch (e) {} }
      await opts.evaluate(async () => {
        const all2 = await chrome.storage.local.get(null);
        const targets = Object.keys(all2).filter((k) => /^compiled_resource:|^resource:/.test(k));
        for (const k of targets) { try { await chrome.storage.local.remove(k); } catch (e) {} }
      });
      const code = fs.readFileSync(USERSCRIPT_PATH, "utf8");
      RUN.scriptRegistered = await adapter.installByCode(opts, { uuid: "zheliyin-real-ocr-" + REPO_VERSION, code: code, upsertBy: "user" });
    } catch (e) { RUN.errors.push("scriptcat install: " + String(e && e.message || e).slice(0, 200)); }
    await sleep(1500);

    // ---- 3. 编辑器就绪（沿历史流程：goto → reload 一次注入）----
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const w = await waitUntil(isReadyExpr(), "editor", 120000);
    RUN.phases.editorReady = !!(w && w.ok);
    if (!(w && w.ok)) throw new Error("editor not ready");
    const lg = await ev(() => { const ua = document.querySelector("#userAccount"); return { visible: !!(ua && ua.offsetParent) }; });
    if (lg.visible) { const lk = await ensureLogin(); RUN.phases.userLogin = lk ? "PASS" : "FAIL"; await waitUntil(isReadyExpr(), "editor after login", 90000); }

    // ---- 4. 用户脚本 UI + 桥 + 版本 ----
    const uiExpr = () => {
      const tb = document.getElementById("zy-native-ocr-tool-btn");
      const br = window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed;
      return { ok: !!(tb && br), toolBtn: !!tb, bridge: !!br };
    };
    let uiw = await waitUntil(uiExpr, "userscript ui", 45000, 1500);
    if (!(uiw && uiw.ok)) {
      RUN.errors.push("userscript ui missing on first load, reload retry");
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      await waitUntil(isReadyExpr(), "editor re-ready", 60000);
      uiw = await waitUntil(uiExpr, "userscript ui retry", 45000, 1500);
    }
    RUN.phases.userscript = uiw.ok ? uiw.data : null;
    RUN.console = consoleLines.slice(-80);
    RUN.phases.scriptVersionSeen = consoleLines.map((l) => (/折立印名片套版助手已加载\s+(\S+)/.exec(l) || [])[1] || "").filter(Boolean);
    if (!(uiw && uiw.ok)) { wr("ocr-run-summary.json", RUN); throw new Error("userscript UI not present"); }

    // ---- 5. 固定测试图 + 上传 + active ----
    const fixt = await ev(() => {
      const W = 900, H = 560;
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const x = c.getContext("2d");
      x.fillStyle = "#ffffff"; x.fillRect(0, 0, W, H); x.fillStyle = "#000000"; x.textBaseline = "alphabetic";
      const lines = [
        { t: "ABC科技有限公司", y: 120, size: 52 },
        { t: "张三", y: 240, size: 46 },
        { t: "13800138000", y: 350, size: 46 },
        { t: "销售经理", y: 450, size: 46 }
      ];
      const rows = [];
      for (const L of lines) {
        x.font = "bold " + L.size + 'px "Microsoft YaHei","微软雅黑",sans-serif';
        const m = x.measureText(L.t); const lx = (W - m.width) / 2;
        x.fillText(L.t, lx, L.y);
        rows.push({ text: L.t, x: lx, top: L.y - L.size * 0.78, width: m.width, height: L.size * 1.1 });
      }
      return { width: W, height: H, dataUrl: c.toDataURL("image/png"), rows };
    }).catch(() => null);
    RUN.fixture = fixt ? { width: fixt.width, height: fixt.height, rows: fixt.rows.map((r) => r.text) } : null;
    RUN.phases.fixtureFile = FIX_PNG.replace(ROOT, ".");
    if (fixt && fixt.dataUrl) fs.writeFileSync(FIX_PNG, Buffer.from(fixt.dataUrl.split(",")[1], "base64"));

    const before = await ev(() => {
      const vo = window.CanvasObjVO; const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
      if (!(d && d.canvas)) return { ok: false, err: "no canvas" };
      const objs = d.canvas.getObjects();
      return { ok: true, count: objs.length, imageCount: objs.filter((o) => String(o.type) === "image").length };
    });
    RUN.canvasBefore = before;

    // 不触碰 file input（避免「换图」弹窗）；OCR 源 = 真实「当前图片」(active→background→首图), 与历史脚本一致
    RUN.upload = { method: "SKIP(current-image)", done: false };
    RUN.ocrSource = "CURRENT_IMAGE(active->background->first-image)";

    // ---- 6. 观测 hook（非侵入）+ 点击真实「识别当前图片」----
    await ev(() => {
      window.__p0Obs = { events: [], items: null, reply: null };
      window.addEventListener("message", (e) => {
        const d = e.data; if (!d || typeof d !== "object") return;
        if (d.source === "zy-card-assistant") { window.__p0Obs.events.push({ t: Date.now(), s: "req", y: d.type, ic: d.items && d.items.length }); if (d.type === "ocrCreate" && d.items) window.__p0Obs.items = d.items; }
        if (d.source === "zy-card-assistant-page" && d.type === "ocrCreateResult") { window.__p0Obs.reply = d; window.__p0Obs.events.push({ t: Date.now(), s: "res", y: d.type, c: d.createdCount, db: d.detectedBlocks, msg: String(d.message || "").slice(0, 160) }); }
      });
      window.__p0Status = [];
      window.__p0StatusTimer = setInterval(() => {
        const st = document.getElementById("zy-native-status");
        if (st) { const t = String(st.innerText || "").trim(); if (t && window.__p0Status[window.__p0Status.length - 1] !== t) window.__p0Status.push(t); }
      }, 800);
    });
    // 先打开 OCR 抽屉（handleOcrImage 首行检查 state.ocrPanelClosed, 未打开会被静默忽略）
    await ev(() => { const tb = document.getElementById("zy-native-ocr-tool-btn"); if (tb) { try { tb.click(); } catch (e) {} } return {}; });
    const panelW = await waitUntil(() => {
      const p = document.getElementById("zy-native-ocr-panel");
      return { ok: !!(p && p.offsetParent) };
    }, "ocr panel open", 15000, 1000);
    RUN.phases.panelOpen = !!(panelW && panelW.ok);
    const ck = await ev(() => { const b = document.getElementById("zy-native-ocr-btn"); if (!b) return { ok: false, why: "no ocr btn" }; b.click(); return { ok: true }; });
    RUN.phases.ocrClick = ck;

    const t0 = Date.now();
    let hadReply = false;
    while (Date.now() - t0 < 150000) {
      const rr = await ev(() => { const o = window.__p0Obs; return { ok: !!(o && o.reply), reply: o ? o.reply : null }; }).catch(() => ({ ok: false }));
      if (rr && rr.ok) { RUN.ocrCreateReply = rr.reply; hadReply = true; break; }
      await sleep(1500);
    }
    const stAll = await ev(() => { clearInterval(window.__p0StatusTimer); return window.__p0Status || []; }).catch(() => []);
    RUN.statusLog = stAll.slice(-60);
    RUN.ocrObs = await ev(() => { const o = window.__p0Obs; return o ? { events: o.events.slice(-50), items: o.items, reply: o.reply } : null; }).catch(() => null);
    RUN.phases.ocrReplySeen = hadReply;

    const rawAttr = await ev(() => document.documentElement.getAttribute("data-zy-ocr-result") || null).catch(() => null);
    let raw = null; try { raw = rawAttr ? JSON.parse(rawAttr) : null; } catch (e) {}
    RUN.ocrRawEl = raw;
    const cloudNet = browserNet.filter((n) => /aip\.baidubce|aip\.yun\.baidu/.test(n.u)).slice(-6);
    wr("ocr-raw.json", { ocrRunId: RUN.ocrRunId, note: "真实 OCR 引擎输出", engine: /百度|cloud|云端/i.test(stAll.join(" ")) ? "cloud" : (raw ? "local" : "unknown"), lines: raw && raw.lines, words: raw && raw.words, imageWidth: raw && raw.w, imageHeight: raw && raw.h, statusTail: stAll.slice(-8), cloudNet: cloudNet });
    const ocrItems = (RUN.ocrObs && RUN.ocrObs.items) || [];
    wr("ocr-textblocks.json", { ocrRunId: RUN.ocrRunId, note: "由 ocrCreate items（buildItemsFromOcr 真实产物）映射：1 block=1 textbox", items: ocrItems.map((it, i) => Object.assign({ blockIndex: it.blockIndex, ocrRunId: RUN.ocrRunId }, it)) });
    wr("ocr-create-items.json", { ocrRunId: RUN.ocrRunId, source: "window.postMessage(zy-card-assistant/ocrCreate) 真实观测", items: ocrItems, reply: RUN.ocrObs && RUN.ocrObs.reply });

    // ---- 7. 对象快照 A（数量差锁定新增）+ ENTRY vs OBJECT isDisplay ----
    const after = await ev((arg) => {
      const snap = (0, eval)(arg.src);
      const vo = window.CanvasObjVO; const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
      if (!(d && d.canvas)) return { ok: false, err: "no canvas" };
      const objs = d.canvas.getObjects();
      const snapEls = [];
      for (let i = 0; i < objs.length; i++) snapEls.push(snap(objs[i], { index: i }));
      return { ok: true, count: objs.length, objs: snapEls };
    }, { src: SNAP_FN_SRC });
    RUN.after = { count: after.count, objs: after.objs };
    const n0 = (before && before.count) || 0;
    const n1 = (after && after.count) || 0;
    RUN.delta = n1 - n0;
    const newTextboxes = (after.objs || []).filter((o) => o && o.index >= n0 && String(o.type) === "textbox" && o.text);
    RUN.newTextboxes = newTextboxes;
    wr("ocr-object-A-create.json", { ocrRunId: RUN.ocrRunId, beforeCount: n0, afterCount: n1, delta: n1 - n0, entryIsDisplayBySource: "buildTextMediaEntry(仓库 page-bridge.js)=0", objectIsDisplayValues: newTextboxes.map((o) => o.isDisplay), created: newTextboxes });

    // ---- 8. 可见性 + 带框截图 ----
    const vis = await ev((arg) => {
      const vo = window.CanvasObjVO; const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
      if (!(d && d.canvas)) return { err: "no canvas" };
      const cw = d.canvas.getWidth(), ch = d.canvas.getHeight();
      const canvasEl = d.canvas.upperCanvasEl || d.canvas.lowerCanvasEl || (d.canvas.getElement && d.canvas.getElement());
      const rect = []; const checks = [];
      for (const s of arg.created || []) {
        const o = d.canvas.getObjects()[s.index];
        if (!o) { checks.push({ index: s.index, missing: true }); continue; }
        const w2 = o.getScaledWidth ? o.getScaledWidth() : o.width, h2 = o.getScaledHeight ? o.getScaledHeight() : o.height;
        const inside = o.left >= 0 && o.top >= 0 && (o.left + w2) <= cw && (o.top + h2) <= ch;
        checks.push({ index: s.index, text: String(o.text || ""), visible: o.visible !== false, opacity: o.opacity, scaleX: o.scaleX, scaleY: o.scaleY, width: o.width, height: o.height, inside, pass: !!(o.visible !== false && o.opacity > 0 && o.scaleX !== 0 && o.scaleY !== 0 && o.width > 0 && o.height > 0 && inside) });
        if (canvasEl) { const rc = canvasEl.getBoundingClientRect(); rect.push({ i: s.index, x: rc.x + o.left * (rc.width / cw), y: rc.y + o.top * (rc.height / ch), w: w2 * (rc.width / cw), h: h2 * (rc.height / ch), text: String(o.text || "").slice(0, 16) }); }
      }
      return { checks, rect };
    }, { created: newTextboxes }).catch((e) => ({ err: String(e).slice(0, 200) }));
    RUN.visibility = vis && vis.checks;
    RUN.phases.ocrVisible = (vis && vis.checks && vis.checks.length > 0 && vis.checks.every((c) => c.pass)) ? "PASS" : "FAIL";
    await ev((arg) => {
      (arg.rect || []).forEach((b) => { const dv = document.createElement("div"); dv.setAttribute("style", "position:fixed;left:" + b.x + "px;top:" + b.y + "px;width:" + b.w + "px;height:" + b.h + "px;border:2px solid #ff2d2d;z-index:99999;pointer-events:none;"); dv.setAttribute("data-p0box", String(b.text || "")); document.body.appendChild(dv); });
    }, { rect: (vis && vis.rect) || [] });
    try { await page.screenshot({ path: path.join(R, "ocr-after-create.png") }); RUN.shots = ["ocr-after-create.png"]; } catch (e) {}
    await ev(() => { document.querySelectorAll("[data-p0box]").forEach((el) => el.remove()); return {}; });

    // ---- 9. SAVE → RELOAD（B 快照）----
    const saveClick = await ev(() => {
      const el = Array.from(document.querySelectorAll("li,a,button,span")).find((x) => String(x.textContent || "").trim() === "保存" && x.offsetParent);
      if (el) { try { el.click(); return { clicked: true }; } catch (e) { return { clicked: false, err: String(e) }; } }
      return { clicked: false, why: "no save btn" };
    });
    RUN.saveClick = saveClick;
    await sleep(4000);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const w3 = await waitUntil(isReadyExpr(), "editor after reload", 90000);
    RUN.phases.reloadReady = !!(w3 && w3.ok);
    await sleep(2500);
    const reloadSnap = await ev((arg) => {
      const snap = (0, eval)(arg.src);
      const vo = window.CanvasObjVO; const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
      if (!(d && d.canvas)) return { ok: false, err: "no canvas" };
      const objs = d.canvas.getObjects(); const matched = [];
      for (const s of arg.created || []) {
        const found = objs.find((o) => String(o.uuid || "") === String(s.uuid || "") || String(o.multiUuid || "") === String(s.multiUuid || ""));
        if (found) matched.push(snap(found, { index: objs.indexOf(found) }));
      }
      return { ok: true, total: objs.length, matched };
    }, { src: SNAP_FN_SRC, created: newTextboxes }).catch((e) => ({ err: String(e).slice(0, 200) }));
    RUN.reloadSnapshot = reloadSnap;
    wr("ocr-object-B-after-reload.json", { ocrRunId: RUN.ocrRunId, reloadReady: RUN.phases.reloadReady, saveClick: RUN.saveClick, matched: (reloadSnap && reloadSnap.matched) || [] });

    // ---- 10. 核稿 → 订单号 → 印刷 → 设计信息/确定 → 等核稿结果 → 交稿 → 搜索 → 自动核稿判定 ----
    if (RUN.phases.reloadReady) {
      RUN.phases.hegaoOk = await stageProofCore();
      if (!RUN.phases.hegaoOk) { RUN.phases.realOcrProof = "FAILED_STAGE=HEGAO"; wr("ocr-run-summary.json", RUN); await page.screenshot({ path: path.join(R, "ocr-hegao-miss.png") }).catch(() => {}); }
      if (RUN.phases.hegaoOk) {
      RUN.phases.orderNo = await fillOrderNo(1);
      await sleep(1200);
      RUN.phases.print = await stagePrintCore();
      // 等交稿/核稿结果面（站点侧提交+自愈，最多 45s）
      let proofSurfaces = await waitUntil(() => {
        const layers = document.querySelectorAll(".layui-layer, .modal, .modal-container");
        for (let i = 0; i < layers.length; i++) {
          const el = layers[i]; const rc0 = el.getBoundingClientRect(); if (rc0.width === 0 && rc0.height === 0) continue;
          const t = String(el.innerText || "");
          if (/提交稿件（交稿）|提交稿件|顾客信息|错字检查结果|错误截图|生产稿|设计稿/.test(t)) return { ok: true, txt: t.slice(0, 80) };
        }
        return { ok: false };
      }, "proof surfaces", 45000);
      RUN.phases.proofSurfaces = proofSurfaces.ok ? proofSurfaces.data.txt : null;
      // 登录浮层：站点自动恢复 → 手动重建（最多 2 次）
      let retried = 0;
      while (!(proofSurfaces && proofSurfaces.ok) && retried < 2) {
        const lgNow = await ev(() => { const ua = document.querySelector("#userAccount"); return !!(ua && ua.offsetParent); });
        if (!lgNow) break;
        const settled = await waitUntil(() => {
          const ua = document.querySelector("#userAccount");
          if (ua && ua.offsetParent) return { ok: false };
          const c = document.querySelector(".icon.icon-search.inputorderno, .search-btn, [class*=hegaocheck]");
          return { ok: !!(c && c.offsetParent) };
        }, "site auto-login settle", 30000, 2000);
        if (settled && settled.ok) { proofSurfaces = { ok: true }; continue; }
        await ensureLogin();
        retried++;
        await waitUntil(isReadyExpr(), "editor after manual login", 60000);
        RUN.phases.hegaoOk = await stageProofCore();
        if (RUN.phases.hegaoOk) { await fillOrderNo(1); await sleep(1200); await stagePrintCore(); }
        proofSurfaces = await waitUntil(() => {
          const layers = document.querySelectorAll(".layui-layer, .modal, .modal-container");
          for (let i = 0; i < layers.length; i++) {
            const el = layers[i]; const rc0 = el.getBoundingClientRect(); if (rc0.width === 0 && rc0.height === 0) continue;
            const t = String(el.innerText || "");
            if (/提交稿件（交稿）|提交稿件|顾客信息|错字检查结果|错误截图|生产稿|设计稿/.test(t)) return { ok: true };
          }
          return { ok: false };
        }, "proof surfaces rebuild", 45000);
      }
      RUN.phases.retried = retried;
      await clickByName("提交稿件");
      await sleep(1500);
      await searchSync(4);
      } // end if hegaoOk gate

      const previews = browserNet.filter((n) => /imgPreviewSearch/.test(n.u)).map((n) => { try { const j = JSON.parse(n.body); return { success: j.success, producestate: j.userData && j.userData.producestate, errPage: j.userData && j.userData.errPage, errInfo: j.userData && j.userData.errInfo, submitBody: null }; } catch (e) { return null; } }).filter(Boolean);
      RUN.phases.previews = previews;
      const failedCount = previews.filter((p) => p.producestate === 2 || /ERR_AUTO_CHECK/.test(String(p.errInfo || ""))).length;
      const passCount = previews.filter((p) => p.producestate === 1).length;
      const hasPopup = await ev(() => {
        const ls = document.querySelectorAll(".layui-layer, .modal, .modal-container");
        for (let i = 0; i < ls.length; i++) { if (/自动核稿失败/.test(String(ls[i].innerText || ""))) return true; }
        return false;
      }).catch(() => false);
      RUN.phases.autoProofreadPopup = hasPopup;
      RUN.phases.realOcrProof = (previews.length > 0 && failedCount === 0 && passCount > 0 && !hasPopup) ? "PASS" : "FAIL";
      RUN.phases.proofCounts = { total: previews.length, pass: passCount, errAutoCheck: failedCount, popup: hasPopup };
      const dSnap = await ev((arg) => {
        const snap = (0, eval)(arg.src);
        const vo = window.CanvasObjVO; const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
        if (!(d && d.canvas)) return null;
        const objs = d.canvas.getObjects(); const out = [];
        for (let i = 0; i < objs.length; i++) { const s = snap(objs[i], { index: i }); if (s && s.text) out.push(s); }
        return out;
      }, { src: SNAP_FN_SRC }).catch(() => null);
      wr("ocr-object-D-before-proof.json", { ocrRunId: RUN.ocrRunId, textObjs: dSnap });
      try { await page.screenshot({ path: path.join(R, "ocr-before-proof.png") }); RUN.shots.push("ocr-before-proof.png"); } catch (e) {}
    } else {
      RUN.phases.realOcrProof = "SKIPPED(reload-not-ready)";
    }
    RUN.final = { realOcrProof: RUN.phases.realOcrProof, ocrVisible: RUN.phases.ocrVisible, ocrReplySeen: RUN.phases.ocrReplySeen, newTextCount: newTextboxes.length, scriptVersionSeen: RUN.phases.scriptVersionSeen };
    wr("ocr-run-summary.json", RUN);
    console.log("OCR-REAL-DONE proof=" + RUN.phases.realOcrProof + " visible=" + RUN.phases.ocrVisible + " newText=" + newTextboxes.length + " errors=" + RUN.errors.length + " sum=" + path.join(R, "ocr-run-summary.json"));
  } catch (e) {
    RUN.errors.push(String(e && e.message || e).slice(0, 300));
    wr("ocr-run-summary.json", RUN);
    console.error("FATAL", e && (e.message || e));
  } finally {
    try { page && await page.close(); } catch (e) {}
    try { browser && await browser.close(); } catch (e) {}
  }
})();