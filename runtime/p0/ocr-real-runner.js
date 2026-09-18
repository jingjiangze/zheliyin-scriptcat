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
// 脱敏（安全纪律）：证据可入库，但不得包含账号/凭据值。
//   netLog 里站点自身会带 userId=<账号>（batchSaveKeepMaterial.do 等），必须抹掉；
//   同时兜底抹掉环境变量里传入的账号与口令本身。
function redactEvidence(txt) {
  let t = String(txt == null ? "" : txt);
  if (USER) t = t.split(USER).join("[REDACTED_USER]");
  if (PASS) t = t.split(PASS).join("[REDACTED_PASS]");
  t = t.replace(/(userId=|userid=|userName=|username=)[^&"\s]*/gi, "$1[REDACTED]");
  t = t.replace(/"(access_token|token|password|pwd|secret|cookie|authorization)"\s*:\s*"[^"]*"/gi, '"$1":"[REDACTED]"');
  return t;
}
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
  await sleep(4000);
  // 原位等待登录层关闭（不 reload：reload 会清空未保存设计/OCR 对象）
  let closed = false;
  const tL = Date.now();
  while (Date.now() - tL < 25000) {
    const v = await ev(() => { const ua = document.querySelector("#userAccount"); return { ok: !(ua && ua.offsetParent) }; }).catch(() => ({ ok: false }));
    if (v && v.ok) { closed = true; break; }
    await sleep(1500);
  }
  await waitUntil(isReadyExpr(), "editor alive after login", 30000);
  return closed;
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
async function stagePrintCore(beforeConfirm) {
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
    if (typeof beforeConfirm === "function") { await beforeConfirm(); }
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

async function canvasTextCount() {
  const r = await ev(() => {
    const req = window.requirejs || window.require;
    const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
    const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
    if (!(d && d.canvas)) return { ok: false, count: 0, texts: [] };
    const objs = d.canvas.getObjects();
    const texts = objs.filter((o) => typeof o.text === "string" && String(o.text).trim()).map((o) => String(o.text).trim());
    return { ok: true, count: objs.length, textCount: texts.length, texts: texts.slice(0, 20) };
  });
  return (r && r.ok) ? r : { ok: false, count: 0, texts: [] };
}
async function openSiteLoginLayer() {
  return ev(() => {
    const cands = Array.from(document.querySelectorAll("a, button, span, li, div")).filter((el) => {
      if (!el.offsetParent) return false;
      const t = String(el.textContent || "").trim();
      return /^登录$|^登\s*录$/.test(t) || (t.indexOf("登录") >= 0 && t.length <= 8);
    });
    for (const el of cands) { try { el.click(); return { ok: true, clicked: String(el.textContent || "").trim().slice(0, 12) }; } catch (e) {} }
    return { ok: false, reason: "no site login entry" };
  });
}
async function bootstrapAuthSession(RUN) {
  // 站点登录会整页 reload（历史验证），故必须在创建对象前建立真实会话：
  // 用一次「印刷→设计信息→确定」触发 loginState:timeOut → 等登录弹层 → env 登录 → 校验会话
  RUN.phases.hegaoOk = await stageProofCore();
  if (!RUN.phases.hegaoOk) return { ok: false, stage: "hegao" };
  await fillOrderNo(1); await sleep(1200);
  const p = page.waitForResponse((resp) => /submitUserDesign\.do/.test(resp.url()), { timeout: 30000 }).catch(() => null);
  await stagePrintCore();
  const resp = await p;
  let body = ""; try { body = resp ? ((await resp.text().catch(() => "")) || "") : ""; } catch (e) { body = ""; }
  if (body && !/"?loginState"?\s*:\s*"?timeOut/i.test(body)) return { ok: true, stage: "already-auth", body: body.slice(0, 120) };
  const formW = await waitUntil(() => {
    const ua = document.querySelector("#userAccount");
    return { ok: !!(ua && ua.offsetParent) };
  }, "login popup", 20000, 1000);
  if (!(formW && formW.ok)) return { ok: false, stage: "no-login-form", body: body.slice(0, 120) };
  const lk = await ensureLogin();
  await waitUntil(isReadyExpr(), "editor after bootstrap login", 90000);
  const authPost = await ev(() => { const ua = document.querySelector("#userAccount"); return { loginLayerVisible: !!(ua && ua.offsetParent) }; });
  return { ok: true, stage: "logged-in", loginClosed: lk, authPost: authPost };
}
async function doSaveReload(RUN, createdObjs) {
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
    const snap = window.__p0Snap;
    if (typeof snap !== "function") return { ok: false, err: "__p0Snap missing" };
    const vo = window.CanvasObjVO; const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
    if (!(d && d.canvas)) return { ok: false, err: "no canvas" };
    const objs = d.canvas.getObjects(); const matched = [];
    for (const ss of arg.created || []) {
      const found = objs.find((o) => String(o.uuid || "") === String(ss.uuid || "") || String(o.multiUuid || "") === String(ss.multiUuid || ""));
      if (found) matched.push(snap(found, { index: objs.indexOf(found) }));
    }
    const textsAfter = objs.filter((o) => typeof o.text === "string" && String(o.text).trim()).map((o) => snap(o, { index: objs.indexOf(o) }));
    const wanted = (arg.created || []).map((c) => String(c.text || "").trim()).filter(Boolean);
    const textMatched = textsAfter.filter((t) => wanted.indexOf(String(t.text || "").trim()) >= 0);
    return { ok: true, total: objs.length, matched, textsAfter, textMatched, wanted };
  }, { created: createdObjs || [] }).catch((e) => ({ err: String(e).slice(0, 200) }));
  RUN.reloadSnapshot = reloadSnap;
  RUN.reloadTexts = (reloadSnap && reloadSnap.textsAfter) || null;
  const verdictObj = {
    identityMatched: ((reloadSnap && reloadSnap.matched) || []).length,
    textMatched: ((reloadSnap && reloadSnap.textMatched) || []).length,
    wanted: (reloadSnap && reloadSnap.wanted) || [],
    verdict: !(reloadSnap && reloadSnap.ok) ? "UNKNOWN"
      : (((reloadSnap.matched || []).length > 0) ? "PERSISTED(identity)"
        : (((reloadSnap.textMatched || []).length > 0) ? "PERSISTED(text-only, uuid changed)" : "LOST")),
  };
  RUN.phases.saveReload = verdictObj;
  try {
    fs.writeFileSync(path.join(R, "ocr-object-B-after-reload.json"), JSON.stringify({ ocrRunId: RUN.ocrRunId, reloadReady: RUN.phases.reloadReady, saveClick: RUN.saveClick, matched: (reloadSnap && reloadSnap.matched) || [], textMatched: (reloadSnap && reloadSnap.textMatched) || [], textsAfter: (reloadSnap && reloadSnap.textsAfter) || [], wanted: (reloadSnap && reloadSnap.wanted) || [], verdict: verdictObj.verdict }, null, 2));
  } catch (e) {}
  return verdictObj;
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
    // ---- P0 专项（唯一 harness 观测修复）：画布访问器对齐 ----
    // 真机证据（runtime/reports/p0/p0-path-check.json）：
    //   window.CanvasObjVO = undefined ；requirejs 上下文 defined.CanvasObjVO = true
    //   → 本文件 7 处 `window.CanvasObjVO` 读取全部静默退化为 {err:"no canvas"}，
    //     导致 canvasBefore/imgPlace/对象快照/可见性校验一律拿不到画布（前几轮 OBJECT 证据为空即此因）。
    // 修复：document-start 暴露一个惰性解析器（优先 requirejs 模块，保留 setter 以防站点自身赋值被劫持），
    //   不触碰站点对象、不改产品代码、不改 OCR 算法。仅使 harness 与生产 page-bridge 使用同一取值路径。
    await browser.addInitScript(() => {
      try {
        let fallback;
        Object.defineProperty(window, "CanvasObjVO", {
          configurable: true,
          get() {
            const req = window.requirejs || window.require;
            const v = req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO;
            return v || fallback;
          },
          set(v) { fallback = v; },
        });
      } catch (e) {}
      // 同上（§十/§十七）：对象快照原先用 `const snap = (0, eval)(SNAP_FN_SRC)` 注入。
      //   实测根因（非 CSP）：`(0, eval)("function f(){...}")` 的完成值是 undefined
      //   （函数「声明」语句没有 completion value）→ snap === undefined →
      //   `snap(o, {index})` 抛 TypeError: snap is not a function → 被 ev() 的 catch 吞掉
      //   → after.count=undefined / newTextboxes=[] / OCR 可见性无法判定
      //   → OBJECT 恒为 INVALID（即便 ocrCreateResult createdCount=4）。
      //   已另行实测站点 CSP 不拦 eval（p0-path-check.json: indirectEval=OK, newFunction=OK），
      //   故此处只修「取函数」的方式：document-start 直定义，每次导航自动重建，不依赖 eval。
      try {
        window.__p0Snap = function (o, extra) {
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
            uuid: o.uuid, multiUuid: o.multiUuid, markuuid: o.markuuid, layerNum: o.layerNum, isLineText: o.isLineText,
          }, extra || {});
        };
      } catch (e) {}
      // P0 专项（§四/§七）：OCR 目标图注入（幂等，可重复调用）。
      //   站点原生 drawText/图片层会被设计器自身的画布重建冲掉（实测：placed=true 但
      //   随后 after.count 回到 9，说明 raw fabric.Image 不在站点产品模型里，可能被清）。
      //   故本函数设计为可重复调用：已在画布 → 返回 placed:false；不在 → 重新注入。
      try {
        window.__p0HasImage = function () {
          const vo = window.CanvasObjVO;
          const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
          if (!(d && d.canvas)) return -1;
          return d.canvas.getObjects().filter((o) => String(o.type) === "image").length;
        };
        window.__p0PlaceImage = function (dataUrl, s) {
          const vo = window.CanvasObjVO;
          const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
          if (!(d && d.canvas)) return Promise.resolve({ ok: false, err: "no canvas" });
          const c = d.canvas;
          const existing = c.getObjects().filter((o) => String(o.type) === "image");
          if (existing.length) return Promise.resolve({ ok: true, placed: false, reason: "image-already-present", imageCount: existing.length });
          const fabric = window.fabric || (c.constructor && c.constructor.fabric) || null;
          return new Promise((resolve) => {
            const el = new Image();
            el.onload = () => {
              try {
                const opts = { left: 20, top: 20, scaleX: s, scaleY: s };
                const o = (fabric && fabric.Image) ? new fabric.Image(el, opts) : null;
                if (!o) return resolve({ ok: false, err: "no fabric.Image class" });
                c.add(o);
                try { c.setActiveObject(o); } catch (e) {}
                if (c.requestRenderAll) c.requestRenderAll(); else if (c.renderAll) c.renderAll();
                resolve({
                  ok: true, placed: true,
                  imageCount: c.getObjects().filter((x) => String(x.type) === "image").length,
                  left: o.left, top: o.top, width: o.width, height: o.height, scaleX: o.scaleX, scaleY: o.scaleY,
                  naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight,
                  activeIsImage: !!(c.getActiveObject && c.getActiveObject() && String(c.getActiveObject().type) === "image"),
                });
              } catch (e) { resolve({ ok: false, err: String(e && e.message || e).slice(0, 160) }); }
            };
            el.onerror = () => resolve({ ok: false, err: "image load failed" });
            el.src = dataUrl;
          });
        };
      } catch (e) {}
    });
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
    // 页面级网络钩子（fetch/XHR 脱敏，可靠捕获 submit/loginState/imgPreview 响应体）
    await browser.addInitScript(() => {
      if (window.__zyPNInit) return;
      window.__zyPNInit = true;
      window.__p0PageNet = [];
      const red = (x) => { try { return String(x).replace(/"(access_token|token|password|pwd|secret|cookie|authorization)"\s*:\s*"[^"]*"/gi, "$1:[R]").replace(/userId=|\/userId\/|\/user\//gi, "u=[R]"); } catch (e) { return x; } };
      const push = (rec) => { const a = window.__p0PageNet; if (a.length < 300) a.push(rec); };
      const of = window.fetch;
      if (of && !of.__zyPN) {
        window.fetch = function () {
          const url = String(arguments[0] && arguments[0].url || arguments[0] || "");
          const opt = arguments[1] || {};
          if (url.indexOf("zheliyin.com") >= 0) push({ t: Date.now(), k: "fetch", m: opt.method || "GET", u: url.slice(0, 300), b: opt.body ? red(opt.body).slice(0, 4000) : null });
          return of.apply(this, arguments).then((r) => {
            try { if (r && r.url && (r.url.indexOf("zheliyin.com") >= 0 || r.url.indexOf("baidubce") >= 0)) { const c = r.clone(); c.text().then((t) => push({ t: Date.now(), k: "fetchR", s: r.status, u: r.url.slice(0, 300), b: red(t).slice(0, 4000) })).catch(() => {}); } } catch (e) {}
            return r;
          });
        };
        window.fetch.__zyPN = true;
      }
      const op_ = XMLHttpRequest.prototype.open, sp_ = XMLHttpRequest.prototype.send;
      if (!op_.__zyPN) {
        XMLHttpRequest.prototype.open = function (m, u) { this.__u = String(u || ""); return op_.apply(this, arguments); };
        XMLHttpRequest.prototype.send = function (body) {
          const u0 = this.__u || "";
          try { if (u0.indexOf("zheliyin.com") >= 0) push({ t: Date.now(), k: "xhr", m: "XHR", u: u0.slice(0, 300), b: body ? red(body).slice(0, 4000) : null }); } catch (e) {}
          const self = this;
          if (u0.indexOf("zheliyin.com") >= 0 && this.addEventListener) {
            this.addEventListener("load", function () {
              try { if (self.readyState === 4) push({ t: Date.now(), k: "xhrR", s: self.status, u: u0.slice(0, 300), b: red(self.responseText || "").slice(0, 4000) }); } catch (e) {}
            });
          }
          return sp_.apply(this, arguments);
        };
        XMLHttpRequest.prototype.open.__zyPN = true;
      }
    });
    RUN.authConfigured = !!(USER && PASS);
    // request 级捕获：submit/save/imgPreview payload 必须可判定（不依赖响应流读取）
    page.on("request", (req) => {
      try {
        const u = req.url();
        if (u.indexOf("zheliyin.com") < 0) return;
        if (/submitUserDesign|saveThirdUserDesign|batchSaveKeepMaterial|imgPreviewSearch|getImgInfos|saveDiy/i.test(u)) {
          const post = req.postData() || "";
          browserNet.push({ k: "req", m: req.method(), u: u.slice(0, 220), status: null, post: post ? redactEvidence(String(post).slice(0, 8000)) : null });
        }
      } catch (e) {}
    });

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
    RUN.phases.authAtStart = { loginLayerVisible: !!(lg && lg.visible), authConfiguredEnv: !!(USER && PASS) };
    if (lg.visible) { const lk = await ensureLogin(); RUN.phases.userLogin = lk ? "PASS" : "FAIL"; await waitUntil(isReadyExpr(), "editor after login", 90000); }
    RUN.phases.authAfterStart = await ev(() => { const ua = document.querySelector("#userAccount"); return { loginLayerVisible: !!(ua && ua.offsetParent) }; });
    // 会话有效性前置检查：guest 态（无退出/欢迎标记）→ 清 cookie 强制登录后再继续（保存/提交需真实会话）
    const authProbe = await ev(() => {
      const body = String(document.body.innerText || "");
      const logout = /退出|注销|登出/.test(body);
      const loginBtn = /登录/.test(body);
      return { logout, loginBtn, hasSession: logout && !loginBtn };
    }).catch(() => ({ hasSession: false }));
    RUN.phases.authStateAtStart = authProbe;
    if (!(authProbe && authProbe.hasSession)) {
      RUN.phases.authForced = true;
      await browser.clearCookies().catch(() => {});
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      await waitUntil(isReadyExpr(), "editor after forced reload", 90000);
      const lg2 = await ev(() => { const ua = document.querySelector("#userAccount"); return !!(ua && ua.offsetParent); });
      if (lg2) { const lk = await ensureLogin(); RUN.phases.userLogin = ((RUN.phases.userLogin || "") + "|forced:" + (lk ? "PASS" : "FAIL")); await waitUntil(isReadyExpr(), "editor after login2", 90000); }
      RUN.phases.authForcedPost = await ev(() => { const ua = document.querySelector("#userAccount"); return { loginLayerVisible: !!(ua && ua.offsetParent), logout: /退出|注销|登出/.test(String(document.body.innerText || "")) }; });
    }
    // ---- 会话引导：创建对象前必须先有真实会话（登录会整页 reload, 否则 OCR 对象无法保存/提交）----
    if (USER && !(authProbe && authProbe.hasSession)) {
      RUN.phases.authBootstrap = await bootstrapAuthSession(RUN);
    } else {
      RUN.phases.authBootstrap = { ok: true, stage: "skip(already-auth)" };
    }

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
    // P0 专项（§四/§七）：模板 252438 裸载时画布 0 图片（9 个 rect/line，无 text/无 image/无背景图）
    //   → ocrPrepare 必然 IMAGE_UNAVAILABLE → 真实链路在 OCR 目标图阶段即停，永远到不了 submit/hegao/proof。
    //   历史已验证：clipboard paste / file input 均 BLOCKED，唯一可用是「原生 fabric.Image 注入」
    //   （stage5-3-image-upload.json: method=FABRIC_IMAGE_NATIVE）。此处复用该路径，仅当画布无图片时注入。
    //   这是「给 OCR 一张当前图片」= 等价于用户上传客户照片；不改产品代码、不改 OCR 算法。
    const imgPlace = await ev((arg) => {
      if (typeof window.__p0PlaceImage !== "function") return { ok: false, err: "__p0PlaceImage missing" };
      return window.__p0PlaceImage(arg.dataUrl, arg.s);
    }, { dataUrl: (fixt && fixt.dataUrl) || null, s: 0.5 }).catch((e) => ({ ok: false, err: String(e && e.message || e).slice(0, 160) }));
    RUN.upload = { method: "NATIVE_FABRIC_IMAGE", done: !!(imgPlace && imgPlace.placed), detail: imgPlace };
    RUN.phases.ocrTargetBootstrap = (imgPlace && imgPlace.ok) ? "OK" : "IMAGE_UNAVAILABLE";
    RUN.ocrSource = "CURRENT_IMAGE(active->background->first-image)";
    await sleep(1200);

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
    // 点击「识别当前图片」前再确认一次目标图（站点可能在抽屉打开期间重建画布，冲掉 raw fabric.Image）
    const pre = await ev((arg) => {
      const has = typeof window.__p0HasImage === "function" ? window.__p0HasImage() : -2;
      if (has === 0 && typeof window.__p0PlaceImage === "function") return window.__p0PlaceImage(arg.d, arg.s).then((r) => Object.assign({ preCount: has }, r));
      return { preCount: has, placed: false, reasserted: false };
    }, { d: (fixt && fixt.dataUrl) || null, s: 0.5 }).catch((e) => ({ err: String(e && e.message || e).slice(0, 160) }));
    RUN.phases.ocrTargetPreClick = pre;
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
      const snap = window.__p0Snap;
      if (typeof snap !== "function") return { ok: false, err: "__p0Snap missing (init script blocked?)" };
      const vo = window.CanvasObjVO; const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
      if (!(d && d.canvas)) return { ok: false, err: "no canvas" };
      const objs = d.canvas.getObjects();
      const snapEls = [];
      for (let i = 0; i < objs.length; i++) snapEls.push(snap(objs[i], { index: i }));
      return { ok: true, count: objs.length, objs: snapEls };
    }, {});
    RUN.after = { count: after.count, objs: after.objs, err: after && after.err ? String(after.err).slice(0, 200) : null };
    const n0 = (before && before.count) || 0;
    const n1 = (after && after.count) || 0;
    RUN.delta = n1 - n0;
    // P0 专项（§十三/§十七）：新增对象识别改「按身份」而非「按索引」。
    //   真机证据（本次运行 after.objs）：站点原生 drawText 创建的文字被插到对象列表**前部**
    //   （OCR 4 个 textbox 落在 index 2..5，模板 rect/line 被挤到 6..13），
    //   而 `index >= beforeCount(9)` 的旧判定恰好把它们全部排除 → newTextboxes=0
    //   → 即使 ocrCreateResult.createdCount=4，OBJECT 也被误判 INVALID、ocrVisible=FAIL。
    //   现以 ocrCreateResult.created[] 的 uuid（编辑器原生 uuid，唯一）为准，text 作为兜底。
    const createdRefs = (RUN.ocrCreateReply && Array.isArray(RUN.ocrCreateReply.created)) ? RUN.ocrCreateReply.created : [];
    const createdUuids = new Set(createdRefs.map((c) => String((c && c.uuid) || "")).filter(Boolean));
    const createdTexts = new Set(createdRefs.map((c) => String((c && c.text) || "").trim()).filter(Boolean));
    const newTextboxes = (after.objs || []).filter((o) => {
      if (!o || String(o.type) !== "textbox" || !o.text) return false;
      if (createdUuids.size) {
        if (o.uuid && createdUuids.has(String(o.uuid))) return true;
        if (o.multiUuid && createdUuids.has(String(o.multiUuid))) return true;
      }
      return createdTexts.has(String(o.text).trim());
    });
    RUN.newTextboxes = newTextboxes;
    RUN.objectMatch = { by: createdUuids.size ? "uuid+text" : "text", createdRefs: createdRefs.length, matched: newTextboxes.length, indices: newTextboxes.map((o) => o.index) };
    wr("ocr-object-A-create.json", { ocrRunId: RUN.ocrRunId, beforeCount: n0, afterCount: n1, delta: n1 - n0, matchBy: RUN.objectMatch.by, createdRefIndices: createdRefs.map((c) => c.objectIndex), matchedIndices: newTextboxes.map((o) => o.index), entryIsDisplayBySource: "buildTextMediaEntry(仓库 page-bridge.js)=0", objectIsDisplayValues: newTextboxes.map((o) => o.isDisplay), created: newTextboxes });

    // ---- 8. 可见性 + 带框截图 ----
    const vis = await ev((arg) => {
      const vo = window.CanvasObjVO; const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
      if (!(d && d.canvas)) return { err: "no canvas" };
      const cw = d.canvas.getWidth(), ch = d.canvas.getHeight();
      const canvasEl = d.canvas.upperCanvasEl || d.canvas.lowerCanvasEl || (d.canvas.getElement && d.canvas.getElement());
      const rect = []; const checks = [];
      for (const s of arg.created || []) {
        // 按 uuid 优先定位（索引会因原生前插/图层重排而漂移）
        let o = null;
        const all = d.canvas.getObjects();
        if (s.uuid) o = all.find((x) => x && String(x.uuid || "") === String(s.uuid)) || null;
        if (!o && s.multiUuid) o = all.find((x) => x && String(x.multiUuid || "") === String(s.multiUuid)) || null;
        if (!o) o = all[s.index] || null;
        if (!o) { checks.push({ index: s.index, uuid: s.uuid || null, missing: true }); continue; }
        const w2 = o.getScaledWidth ? o.getScaledWidth() : o.width, h2 = o.getScaledHeight ? o.getScaledHeight() : o.height;
        const inside = o.left >= 0 && o.top >= 0 && (o.left + w2) <= cw && (o.top + h2) <= ch;
        checks.push({ index: all.indexOf(o), uuid: o.uuid || null, text: String(o.text || ""), type: String(o.type || ""), visible: o.visible !== false, opacity: o.opacity, scaleX: o.scaleX, scaleY: o.scaleY, width: o.width, height: o.height, inside, pass: !!(o.visible !== false && o.opacity > 0 && o.scaleX !== 0 && o.scaleY !== 0 && o.width > 0 && o.height > 0 && inside) });
        if (canvasEl) { const rc = canvasEl.getBoundingClientRect(); rect.push({ i: all.indexOf(o), x: rc.x + o.left * (rc.width / cw), y: rc.y + o.top * (rc.height / ch), w: w2 * (rc.width / cw), h: h2 * (rc.height / ch), text: String(o.text || "").slice(0, 16) }); }
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

    // ---- 9. AUTH FIRST：核稿闸门 → 订单号 → 印刷/设计信息/确定（触发 submit）→ AUTH 状态机 ----
    RUN.phases.hegaoOk = await stageProofCore();
    if (!RUN.phases.hegaoOk) { RUN.phases.realOcrProof = "FAILED_STAGE=HEGAO"; wr("ocr-run-summary.json", RUN); await page.screenshot({ path: path.join(R, "ocr-hegao-miss.png") }).catch(() => {}); }
    const authPreOk = !!(RUN.phases.authBootstrap && RUN.phases.authBootstrap.ok);
    if (authPreOk) {
      // 已建会话：先核稿闸门 → SAVE → RELOAD（验证对象持久化）→ 再正常 订单号→印刷→提交
      RUN.phases.hegaoOk = await stageProofCore();
      RUN.phases.saveReload = await doSaveReload(RUN, newTextboxes);
      RUN.phases.orderNo = await fillOrderNo(1);
      await sleep(1200);
      const p0 = page.waitForResponse((resp) => /submitUserDesign\.do/.test(resp.url()), { timeout: 30000 }).catch(() => null);
      RUN.phases.print = await stagePrintCore();
      const resp0 = await p0;
      let b0 = ""; try { b0 = resp0 ? ((await resp0.text().catch(() => "")) || "") : ""; } catch (e) { b0 = ""; }
      const exp0 = /"?loginState"?\s*:\s*"?timeOut/i.test(b0);
      RUN.phases.submitTry = [{ round: 0, status: resp0 ? resp0.status : null, expired: exp0, body: b0.slice(0, 300) }];
      RUN.phases.submitFirstStatus = !resp0 ? "NO_SUBMIT_RESPONSE" : (exp0 ? "AUTH_EXPIRED(timeOut)" : "SUBMIT_RESPONDED");
      RUN.phases.retried = 0;
      RUN.phases.authRecovered = !exp0;
    } else if (RUN.phases.hegaoOk) {
      RUN.phases.orderNo = await fillOrderNo(1);
      await sleep(1200);
      // ---- 提交往返（waitForResponse 可靠捕获 submit 响应体, session 判定自此可靠）----
      RUN.phases.submitTry = [];
      const doSubmitRun = async (round) => {
        const p = page.waitForResponse((resp) => /submitUserDesign\.do/.test(resp.url()), { timeout: 30000 }).catch(() => null);
        RUN.phases.print = await stagePrintCore();
        const resp = await p;
        if (!resp) return { captured: false, round };
        let b = ""; try { b = await resp.text().catch(() => ""); } catch (e) { b = ""; }
        const expired = /"?loginState"?\s*:\s*"?timeOut/i.test(b);
        const rec = { round, status: resp.status(), expired: expired, body: String(b || "").slice(0, 300) };
        RUN.phases.submitTry.push(rec);
        return { captured: true, round, status: resp.status(), body: b, expired: expired };
      };
      const r1 = await doSubmitRun(0);
      const authExpired = !!(r1 && r1.captured) && !!r1.expired;
      RUN.phases.submitFirstStatus = !(r1 && r1.captured) ? "NO_SUBMIT_RESPONSE" : (authExpired ? "AUTH_EXPIRED(timeOut)" : "SUBMIT_RESPONDED");
      // ---- AUTH 恢复状态机（≤2 次）：站点自愈优先 → 手动 env 登录（原位，不 reload 保对象）----
      let recovered = !authExpired;
      let retried = 0;
      const persistBefore = await canvasTextCount();
      while (!recovered && retried < 2) {
        // 站点在 submit timeOut 后约 1~10s 弹出登录层（历史 relogin 探针 poll 验证）；先轮询等它出现
        const formW = await waitUntil(() => {
          const ua = document.querySelector("#userAccount");
          return { ok: !!(ua && ua.offsetParent) };
        }, "login popup appears", 20000, 1000);
        let lgNow = !!(formW && formW.ok);
        if (!lgNow) { const opened = await openSiteLoginLayer(); RUN.phases.authLayerOpenAttempt = opened; await sleep(1500); lgNow = await ev(() => { const ua = document.querySelector("#userAccount"); return !!(ua && ua.offsetParent); }); }
        if (!lgNow) { RUN.phases.authRecovery = "AUTH_RECOVERY_UNAVAILABLE"; break; }
        const settled = await waitUntil(() => {
          const ua = document.querySelector("#userAccount");
          if (ua && ua.offsetParent) return { ok: false };
          return { ok: true };
        }, "auth layer close", 25000, 2000);
        if (settled && settled.ok) { recovered = true; break; }
        const lk = await ensureLogin();
        retried++;
        if (!lk) break;
        RUN.phases.hegaoOk = await stageProofCore();
        if (RUN.phases.hegaoOk) { await fillOrderNo(1); await sleep(1200); }
        const r2 = await doSubmitRun(retried);
        if (r2 && r2.captured && !r2.expired) recovered = true;
      }
      RUN.phases.retried = retried;
      RUN.phases.authRecovered = recovered;
      const persistAfter = await canvasTextCount();
      RUN.phases.authObjectPersistence = { before: persistBefore, after: persistAfter,
        pass: persistAfter.count >= persistBefore.count - 1 && persistAfter.textCount >= Math.max(1, persistBefore.textCount - 1) };
      // ---- SAVE → RELOAD（登录恢复后验证持久化）----
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
        const snap = window.__p0Snap;
        if (typeof snap !== "function") return { ok: false, err: "__p0Snap missing" };
        const vo = window.CanvasObjVO; const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
        if (!(d && d.canvas)) return { ok: false, err: "no canvas" };
        const objs = d.canvas.getObjects(); const matched = [];
        for (const ss of arg.created || []) {
          const found = objs.find((o) => String(o.uuid || "") === String(ss.uuid || "") || String(o.multiUuid || "") === String(ss.multiUuid || ""));
          if (found) matched.push(snap(found, { index: objs.indexOf(found) }));
        }
        const textsAfter = objs.filter((o) => typeof o.text === "string" && String(o.text).trim()).map((o) => snap(o, { index: objs.indexOf(o) }));
        const wanted = (arg.created || []).map((c) => String(c.text || "").trim()).filter(Boolean);
        const textMatched = textsAfter.filter((t) => wanted.indexOf(String(t.text || "").trim()) >= 0);
        return { ok: true, total: objs.length, matched, textsAfter, textMatched, wanted };
      }, { created: newTextboxes }).catch((e) => ({ err: String(e).slice(0, 200) }));
      RUN.reloadSnapshot = reloadSnap;
      RUN.reloadTexts = (reloadSnap && reloadSnap.textsAfter) || null;
      RUN.phases.saveReload = {
        identityMatched: ((reloadSnap && reloadSnap.matched) || []).length,
        textMatched: ((reloadSnap && reloadSnap.textMatched) || []).length,
        wanted: (reloadSnap && reloadSnap.wanted) || [],
        verdict: !(reloadSnap && reloadSnap.ok) ? "UNKNOWN"
          : (((reloadSnap.matched || []).length > 0) ? "PERSISTED(identity)"
            : (((reloadSnap.textMatched || []).length > 0) ? "PERSISTED(text-only, uuid changed)" : "LOST")),
      };
      wr("ocr-object-B-after-reload.json", { ocrRunId: RUN.ocrRunId, reloadReady: RUN.phases.reloadReady, saveClick: RUN.saveClick, matched: (reloadSnap && reloadSnap.matched) || [], textMatched: (reloadSnap && reloadSnap.textMatched) || [], textsAfter: (reloadSnap && reloadSnap.textsAfter) || [], wanted: (reloadSnap && reloadSnap.wanted) || [], verdict: RUN.phases.saveReload.verdict });
    }

    // ---- 10. HEGAO / PROOF（按提交请求判定入口；AUTH 未闭环则如实记录层级）----
    {
      const submitFired = browserNet.filter((n) => /submitUserDesign/i.test(n.u)).length;
      RUN.phases.submitFired = submitFired;
      const subPageN = await ev(() => (window.__p0PageNet || []).filter((n) => /submitUserDesign/i.test(String(n.u || ""))).length).catch(() => 0);
      RUN.phases.submitFiredPage = subPageN;
      if (RUN.phases.reloadReady && (submitFired > 0 || subPageN > 0)) {
        const proofSurfaces = await waitUntil(() => {
          const layers = document.querySelectorAll(".layui-layer, .modal, .modal-container");
          for (let i = 0; i < layers.length; i++) {
            const el = layers[i]; const rc0 = el.getBoundingClientRect(); if (rc0.width === 0 && rc0.height === 0) continue;
            const t = String(el.innerText || "");
            if (/提交稿件（交稿）|提交稿件|顾客信息|错字检查结果|错误截图|生产稿|设计稿/.test(t)) return { ok: true, txt: t.slice(0, 80) };
          }
          return { ok: false };
        }, "proof surfaces", 45000);
        RUN.phases.proofSurfaces = proofSurfaces.ok ? proofSurfaces.data.txt : null;
        await clickByName("提交稿件");
        await sleep(1500);
        await searchSync(4);
        const previews = browserNet.filter((n) => /imgPreviewSearch/.test(n.u)).map((n) => { try { const j = JSON.parse(n.body); return { success: j.success, producestate: j.userData && j.userData.producestate, errPage: j.userData && j.userData.errPage, errInfo: j.userData && j.userData.errInfo }; } catch (e) { return null; } }).filter(Boolean);
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
          const snap = window.__p0Snap;
          if (typeof snap !== "function") return null;
          const vo = window.CanvasObjVO; const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
          if (!(d && d.canvas)) return null;
          const objs = d.canvas.getObjects(); const out = [];
          for (let i = 0; i < objs.length; i++) { const ss = snap(objs[i], { index: i }); if (ss && ss.text) out.push(ss); }
          return out;
        }, {}).catch(() => null);
        wr("ocr-object-D-before-proof.json", { ocrRunId: RUN.ocrRunId, textObjs: dSnap });
        try { await page.screenshot({ path: path.join(R, "ocr-before-proof.png") }); RUN.shots.push("ocr-before-proof.png"); } catch (e) {}
      } else {
        RUN.phases.realOcrProof = RUN.phases.reloadReady ? "FAILED_STAGE=AUTH/SUBMIT" : "SKIPPED(reload-not-ready)";
      }
    }

    // ========================================================================
    // P0 专项（§五/§十/§十一/§十二/§十三/§十七）：把笼统的「自动核稿失败」拆成
    // 独立可判定状态 AUTH / SUBMIT / HEGAO / PROOF / OBJECT，并额外输出
    // EDITOR_INTEGRATION（native|mirror）与 RED-BOX MAPPING（found|none|unknown）。
    // 纯观测：只读取已有证据（browserNet / ocrCreate reply / statusLog / DOM），
    // 不修改产品代码、不修改 OCR 算法、不新增业务行为。
    // ========================================================================
    const reply = RUN.ocrCreateReply || (RUN.ocrObs && RUN.ocrObs.reply) || null;

    // ---- AUTH：登录态（起止）+ 提交请求中的 loginState ----
    const authEnd = await ev(() => { const ua = document.querySelector("#userAccount"); return { loginLayerVisible: !!(ua && ua.offsetParent) }; }).catch(() => null);
    const pageSubmit = ((await ev(() => (window.__p0PageNet || []).filter((n) => /submitUserDesign/i.test(String(n.u || "")))).catch(() => [])) || []);
    const submitHits = browserNet.filter((n) => /submitUserDesign/i.test(n.u)).concat(pageSubmit.map((n) => ({ status: n.s || null, u: n.u, body: n.b })));
    const parseSubmit = (n) => { try { return JSON.parse(String(n.body || "{}")); } catch (e) { return null; } };
    const submitParsed = submitHits.map((n) => ({ status: n.status, u: n.u, body: parseSubmit(n) }));
    const submitTimeout = submitParsed.some((x) => x.body && x.body.loginState && /timeout|time_out/i.test(String(x.body.loginState)));
    const AUTH = (submitTimeout || (authEnd && authEnd.loginLayerVisible)) ? "EXPIRED"
      : ((lg && lg.visible && RUN.phases.userLogin === "FAIL") ? "FAIL" : "PASS");

    // ---- SUBMIT：submitUserDesign.do 的请求/响应 ----
    const submitAccepted = submitParsed.some((x) => x.body && String(x.body.result) === "true" && !(x.body.loginState && /timeout/i.test(String(x.body.loginState))));
    const submitRejected = submitParsed.some((x) => (x.status >= 400) || (x.body && String(x.body.result) === "false"));
    // SUBMIT 语义（§五/§十一）：HTTP 200 + result:true 但 loginState=timeOut 属于
    //   「请求已发出、服务端未完成业务」→ 不能算 PASS，也不能算 FAIL（无 4xx/result:false）→ UNKNOWN，
    //   并把原因显式记录为 SUBMIT_NOT_COMPLETED_AUTH。避免与 SUBMIT_REJECTED 混为一谈。
    const SUBMIT = !submitParsed.length ? "UNKNOWN" : (submitAccepted ? "PASS" : (submitRejected ? "FAIL" : "UNKNOWN"));
    const SUBMIT_CODE = !submitParsed.length ? "NO_SUBMIT_REQUEST" : (submitAccepted ? "ACCEPTED" : (submitRejected ? "REJECTED" : "NOT_COMPLETED_AUTH"));

    // ---- HEGAO：是否真正进入「交稿后的核稿阶段」（§十一）----
    //   注意区分两件事，不能混用：
    //     A) 印刷前的「核稿」弹窗（stageProofCore 的 hegaoOk 闸门）—— 这是流程前置闸门；
    //     B) 交稿提交后服务端自动核稿的结果面 / 核稿请求 —— 这才是 P0 关心的 HEGAO_ENTRY。
    //   判定只用 B 类证据（proofSurfaces 面 / 核稿相关请求），A 类单独记为 hegaoPreprintGate。
    const netHits = browserNet.filter((n) => /imgPreviewSearch|hegaocheck|proofread|checkResult|autoCheck/i.test(n.u));
    const hegaoPreprintGate = !!(RUN.phases.hegaoOk);
    const hegaoPostSubmitEvidence = !!RUN.phases.proofSurfaces || netHits.length > 0;
    const HEGAO = hegaoPostSubmitEvidence ? "ENTERED"
      : (SUBMIT === "PASS" ? "UNKNOWN" : "NOT_REACHED");

    // ---- PROOF：核稿结果（必须与「没进入核稿」严格分开，§十一）----
    const pc = RUN.phases.proofCounts || null;
    const popup = RUN.phases.autoProofreadPopup === true;
    let PROOF;
    if (popup || (pc && (pc.errAutoCheck > 0 || pc.fail > 0))) PROOF = "FAIL";
    else if (pc && pc.total > 0 && pc.pass > 0) PROOF = "PASS";
    else if (HEGAO === "ENTERED") PROOF = "UNKNOWN";
    else PROOF = "NOT_REACHED";

    // ---- OBJECT：OCR 是否真的创建了合法文字对象 ----
    const createdN = (newTextboxes || []).length;
    const replyOk = !!(reply && reply.ok);
    const replyCreated = reply ? Number(reply.createdCount || 0) : 0;
    const replyDetected = reply ? Number(reply.detectedBlocks || 0) : 0;
    let OBJECT;
    if (!reply) OBJECT = "UNKNOWN";
    else if (replyOk && replyCreated > 0 && replyCreated === replyDetected && createdN > 0 && RUN.phases.ocrVisible === "PASS") OBJECT = "VALID";
    else OBJECT = "INVALID";

    // ---- EDITOR_INTEGRATION：真实创建走 native 还是 mirror ----
    const integ = (reply && reply.editorIntegration) || null;
    const EDITOR_INTEGRATION = integ && integ.mode ? String(integ.mode).toUpperCase() : "UNKNOWN";

    // ---- RED-BOX MAPPING：核稿错误框 → 画布对象（§十二）----
    const redBox = await ev((arg) => {
      const MARK = ".text-error-check, [class*=error-check], [class*=errorCheck]";
      const marks = Array.from(document.querySelectorAll(MARK)).filter((el) => {
        const rc = el.getBoundingClientRect();
        return rc.width > 0 && rc.height > 0;
      });
      if (!marks.length) return { state: "NONE", reason: "no error-marker in DOM", markers: [], candidates: [] };
      const vo = window.CanvasObjVO; const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
      if (!(d && d.canvas)) return { state: "UNKNOWN", reason: "no canvas", markers: marks.length, candidates: [] };
      const c = d.canvas;
      const cvEl = c.upperCanvasEl || c.lowerCanvasEl || (c.getElement && c.getElement());
      if (!cvEl) return { state: "UNKNOWN", reason: "no canvas element", markers: marks.length, candidates: [] };
      const cr = cvEl.getBoundingClientRect();
      const sx = c.width / cr.width, sy = c.height / cr.height;
      const objs = c.getObjects().filter((o) => typeof o.text === "string" && String(o.text).trim());
      const outM = [], outC = [];
      marks.forEach((el, i) => {
        const rc = el.getBoundingClientRect();
        const local = { x: (rc.left - cr.left) * sx, y: (rc.top - cr.top) * sy, width: rc.width * sx, height: rc.height * sy };
        outM.push({ i: i, cls: String(el.className || "").slice(0, 60), text: String(el.textContent || "").trim().slice(0, 60), local });
        objs.forEach((o) => {
          const w2 = (o.width || 0) * (o.scaleX == null ? 1 : o.scaleX);
          const h2 = (o.height || 0) * (o.scaleY == null ? 1 : o.scaleY);
          const box = { x: o.left || 0, y: o.top || 0, width: w2, height: h2 };
          const ox = Math.max(0, Math.min(local.x + local.width, box.x + box.width) - Math.max(local.x, box.x));
          const oy = Math.max(0, Math.min(local.y + local.height, box.y + box.height) - Math.max(local.y, box.y));
          const overlap = ox * oy;
          const area = Math.max(1, Math.min(local.width * local.height, box.width * box.height));
          if (overlap > 0) outC.push({ markerIndex: i, uuid: o.uuid || o.multiUuid || null, text: String(o.text).slice(0, 24), bbox: box, overlapPx: Math.round(overlap), overlapRatio: Number((overlap / area).toFixed(3)) });
        });
      });
      outC.sort((a, b) => b.overlapPx - a.overlapPx);
      return { state: outC.length ? "FOUND" : "NONE", reason: outC.length ? "mapped" : "markers present but no object intersect", markers: outM, candidates: outC.slice(0, 8) };
    }, {}).catch((e) => ({ state: "UNKNOWN", reason: "eval error: " + String(e && e.message || e).slice(0, 120), markers: [], candidates: [] }));

    RUN.verdict = {
      AUTH: AUTH, SUBMIT: SUBMIT, SUBMIT_CODE: SUBMIT_CODE, HEGAO: HEGAO, PROOF: PROOF, OBJECT: OBJECT,
      EDITOR_INTEGRATION: EDITOR_INTEGRATION, RED_BOX_MAPPING: redBox.state,
      OCR_TARGET: RUN.phases.ocrTargetBootstrap || "UNKNOWN",
      evidence: {
        auth: { authAtStart: RUN.phases.authAtStart || null, authEnd: authEnd, submitUserDesignHits: submitParsed.map((x) => ({ status: x.status, result: x.body && x.body.result, loginState: x.body && x.body.loginState })) },
        submit: { hitCount: submitParsed.length, raw: submitParsed.map((x) => ({ status: x.status, u: x.u.slice(0, 120), body: x.body })) },
        hegao: { hegaoPreprintGate: hegaoPreprintGate, proofSurfaces: RUN.phases.proofSurfaces, postSubmitNetHits: netHits.map((n) => ({ status: n.status, u: n.u.slice(0, 120) })), hegaoPostSubmitEvidence: hegaoPostSubmitEvidence },
        proof: { proofCounts: pc, popup: popup },
        object: { replySeen: !!reply, replyOk: replyOk, createdCount: replyCreated, detectedBlocks: replyDetected, newTextboxes: createdN, ocrVisible: RUN.phases.ocrVisible, replyMessage: reply ? String(reply.message || "").slice(0, 200) : null },
        editorIntegration: integ,
        redBox: redBox,
      },
    };
    
    RUN.final = { realOcrProof: RUN.phases.realOcrProof, ocrVisible: RUN.phases.ocrVisible, ocrReplySeen: RUN.phases.ocrReplySeen, newTextCount: newTextboxes.length, scriptVersionSeen: RUN.phases.scriptVersionSeen };
    wr("real-proof-investigation.json", {
      ts: new Date().toISOString(), ocrRunId: RUN.ocrRunId, url: EDITOR_URL,
      editUrlBranch: "test", editorIntegrationMode: EDITOR_INTEGRATION,
      verdict: RUN.verdict, phases: RUN.phases, statusLog: (RUN.statusLog || []).map(redactEvidence), console: (RUN.console || []).map(redactEvidence), errors: (RUN.errors || []).map(redactEvidence),
      netLog: browserNet.map((n) => ({ status: n.status, k: n.k || "res", u: redactEvidence(n.u), body: n.body ? redactEvidence(String(n.body).slice(0, 800)) : null, post: n.post ? redactEvidence(String(n.post).slice(0, 600)) : null })),
    });
    console.log("P0-SUBMIT_CODE=" + SUBMIT_CODE + " P0-SAVERELOAD=" + ((RUN.phases.saveReload && RUN.phases.saveReload.verdict) || "?") + " AUTH=" + AUTH + " SUBMIT=" + SUBMIT + " HEGAO=" + HEGAO + " PROOF=" + PROOF + " OBJECT=" + OBJECT + " INTEG=" + EDITOR_INTEGRATION + " REDBOX=" + redBox.state + " OCR_TARGET=" + (RUN.phases.ocrTargetBootstrap || "UNKNOWN"));
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