// ============================================================================
// runtime/p0/runner.js — P0 Fast Runtime Runner
// ----------------------------------------------------------------------------
// 目标：Agent 自主完成 P0 复现（编辑器→核稿→印刷→去检查→红框→对象映射→diff），
//       每阶段可验证/可重试/可恢复，不用大量固定 sleep。
// 用法：
//   node runtime/p0/runner.js                 # 全流程
//   node runtime/p0/runner.js --from-proof    # 从核稿阶段开始（需已创建对象）
//   node runtime/p0/runner.js --from-print    # 从印刷阶段开始
//   node runtime/p0/runner.js --from-check    # 直接从「去检查」+红框定位开始
//   node runtime/p0/runner.js --case-font-schema  # A/B 对象 schema 对照（不印刷）
// 状态文件：runtime/reports/p0/resume-state.json（各阶段进度）
// 输出：runtime/reports/p0/{run-summary,proof-result,suspect-object,manual-vs-script-diff,object-lifecycle}.json
// ============================================================================
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const P0_DIR = path.join(__dirname, "..", "reports", "p0");
const RESUME = path.join(P0_DIR, "resume-state.json");
const PROFILE = path.join(__dirname, "..", "browser", "profile-usc3");
// 安全：账号密码只从环境变量读取，禁止硬编码/写入报告
const USER = process.env.P0_LOGIN_USER || "";
const PASS = process.env.P0_LOGIN_PASS || "";
const PROBE_TEXT = "P0_FONT_TEST";

// ---------- CLI ----------
const args = process.argv.slice(2);
const FLAG = { fromProof: args.includes("--from-proof"), fromPrint: args.includes("--from-print"), fromCheck: args.includes("--from-check"), caseFontSchema: args.includes("--case-font-schema"), adoptSession: args.includes("--adopt-session"), sessionParity: args.includes("--session-parity"), submitProbe: args.includes("--submit-probe") };
const resumeArg = (args.find((a) => a.startsWith("--resume=")) || "").split("=")[1];

// ---------- 报告 ----------
const report = { ts: new Date().toISOString(), stage: "P0-RUNNER", url: EDITOR_URL, flags: FLAG, authConfigured: !!(USER && PASS), sessionSource: null, phases: {}, events: [], pages: [], errors: [] };
function writeJson(name, obj) { if (!fs.existsSync(P0_DIR)) fs.mkdirSync(P0_DIR, { recursive: true }); fs.writeFileSync(path.join(P0_DIR, name), JSON.stringify(obj, null, 2)); }
function saveResume(stage, extra) { writeJson("resume-state.json", { ts: new Date().toISOString(), stage, url: page && page.url ? page.url().slice(0, 200) : null, ...extra }); }
const evt = (s) => report.events.push({ t: new Date().toISOString().slice(11, 19), s: s.slice(0, 200) });

// ---------- 浏览器 ----------
let browser = null, page = null;
async function launch(runHeadless = false) {
  browser = await chromium.launchPersistentContext(PROFILE, {
    channel: "chromium", headless: runHeadless,
    ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
    args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
    viewport: { width: 1440, height: 900 }
  });
  // ---- pre-navigation instrumentation：必须在任何 goto 之前注入 ----
  // 收集到 window.__p0Net（请求/响应红acted、JSON 序列化、console/error、DOM 变化）
  await browser.addInitScript(() => {
    if (window.__zyP0Init) return;
    window.__zyP0Init = true;
    window.__p0Net = { reqs: [], jsons: [], logs: [], errors: [], mutations: 0, start: Date.now() };
    const push = (rec) => { const a = window.__p0Net.reqs; if (a.length < 400) a.push(rec); };
    const redact = (s) => { try { return String(s).replace(/"(access_token|token|password|pwd|secret|cookie|authorization)"\s*:\s*"[^"]*"/gi, '"$1":"[REDACTED]"'); } catch (e) { return "[ERR]"; } };
    // fetch
    const of = window.fetch;
    if (of && !of.__zyP0) {
      window.fetch = function () {
        const url = String(arguments[0] && arguments[0].url || arguments[0] || "");
        const opt = arguments[1] || {};
        if (url.indexOf("zheliyin.com") >= 0) push({ t: Date.now(), k: "fetch", m: opt.method || "GET", u: url.slice(0, 300), b: opt.body ? redact(opt.body).slice(0, 2000) : null });
        return of.apply(this, arguments).then((r) => { try { if (r && r.url && r.url.indexOf("zheliyin.com") >= 0) { const clone = r.clone(); clone.text().then((t) => push({ t: Date.now(), k: "fetchR", s: r.status, u: r.url.slice(0, 300), b: redact(t).slice(0, 2000) })).catch(() => {}); } } catch (e) {} return r; });
      };
      window.fetch.__zyP0 = true;
    }
    // XHR
    const op_ = XMLHttpRequest.prototype.open, sp_ = XMLHttpRequest.prototype.send;
    if (!op_.__zyP0) {
      XMLHttpRequest.prototype.open = function (m, u) { this.__u = String(u || ""); return op_.apply(this, arguments); };
      XMLHttpRequest.prototype.send = function (body) {
        try { if (this.__u && this.__u.indexOf("zheliyin.com") >= 0) push({ t: Date.now(), k: "xhr", m: "XHR", u: this.__u.slice(0, 300), b: body ? redact(body).slice(0, 2000) : null }); } catch (e) {}
        return sp_.apply(this, arguments);
      };
      XMLHttpRequest.prototype.open.__zyP0 = true;
    }
    // JSON.stringify（捕获提交 payload，脱敏）
    const os = JSON.stringify;
    if (!os.__zyP0) {
      JSON.stringify = function (v) {
        const r = os.apply(this, arguments);
        try { if (typeof r === "string" && r.indexOf('"printLocation"') >= 0 && r.indexOf('"mediaType":"text"') >= 0 && window.__p0Net.jsons.length < 6) window.__p0Net.jsons.push({ t: Date.now(), len: r.length, b: redact(r).slice(0, 8000) }); } catch (e) {}
        return r;
      };
      JSON.stringify.__zyP0 = true;
    }
    // console.error / window error
    window.addEventListener("error", (e) => { try { window.__p0Net.errors.push({ t: Date.now(), s: String(e.message || "").slice(0, 200) }); } catch (x) {} });
    // MutationObserver（DOM 变化计数，限制频率）
    try {
      const mo = new MutationObserver(() => { window.__p0Net.mutations++; });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  });
  browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
  browser.on("page", (p) => { try { report.pages.push({ url: p.url().slice(0, 200), count: browser.pages().length }); } catch (e) {} });
  page = browser.pages()[0];
  page.on("response", async (r) => {
    try { const u = r.url(); if (u.indexOf("zheliyin.com") < 0) return; const ct = r.headers()["content-type"] || ""; if (ct.indexOf("json") < 0) return; let b = ""; try { b = await r.text().catch(() => ""); } catch (e) {} const rec = { status: r.status(), u: u.slice(0, 200) }; if (/search|order|hegao|check|proof|save|submit|proofread/i.test(u)) rec.body = String(b).slice(0, 1500); report.phases.net = report.phases.net || []; report.phases.net.push(rec); } catch (e) {}
  });
}
async function close() { try { page && await page.close(); } catch (e) {} try { browser && await browser.close(); } catch (e) {} }

// ---------- 通用 ----------
const ev = (fn) => page.evaluate(fn).catch((e) => ({ err: String(e || "").slice(0, 240) }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
async function ensureEditor(timeoutMs = 150000) {
  if (FLAG.fromCheck) { report.phases.editor = { ok: true, skip: "from-check" }; return true; }
  await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
  const w = await waitUntil(isReadyExpr(), "editor ready", timeoutMs);
  report.phases.editor = w;
  return w.ok;
}
async function ensureLogin() {
  const lg = await ev(() => { const ua = document.querySelector("#userAccount"); return { ok: !!(ua && ua.offsetParent), visible: !!(ua && ua.offsetParent) }; });
  if (!lg.visible) return true;
  evt("login-required");
  const r = await ev((arg) => {
    const u = document.querySelector("#userAccount"); const p = document.querySelector("#userPassword");
    if (!u || !p) return { ok: false };
    u.value = arg.u; p.value = arg.p;
    try { u.dispatchEvent(new Event("input", { bubbles: true })); u.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
    try { p.dispatchEvent(new Event("input", { bubbles: true })); p.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
    const btn = document.querySelector(".btn-register") || Array.from(document.querySelectorAll("a, button")).find((el) => { const t = String(el.textContent || "").trim(); return /登录|确定/.test(t) && el.offsetParent && el.closest(".login-tab, .register-area"); });
    if (!btn) return { ok: false, reason: "no login btn" };
    btn.click(); return { ok: true };
  }, { u: USER, p: PASS });
  evt("login-clicked");
  await sleep(10000);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
  const w = await waitUntil(isReadyExpr(), "editor after login", 90000);
  return w.ok;
}

// ---------- 弹窗管理 ----------
// 已知弹窗：登录超时 / 设计信息(表单) / 印刷稿件生成中 / 自动核稿失败提醒 / 核稿图 / 未知
async function scanLayers() {
  return ev(() => {
    const out = [];
    document.querySelectorAll(".layui-layer, .modal, .modal-container, [class*=hegao], [class*=check_wrap], [class*=proof]").forEach((el) => {
      const rc = el.getBoundingClientRect(); if (rc.width === 0 && rc.height === 0) return;
      const t = String(el.innerText || el.textContent || "").trim();
      if (t) out.push({ cls: String(el.className).slice(0, 60), txt: t.slice(0, 500) });
    });
    return { ok: true, layers: out };
  });
}
// 处理已知弹窗；返回 {handled, kind}
async function handleKnownDialog(scopeTxt) {
  // 1) 登录超时
  if (/登录超时|重新登录|账户登录/.test(scopeTxt)) { evt("dialog-login-timeout"); }
  // 2) 印刷稿件生成中
  if (/印刷稿件生成中|请耐心等待|生成中|正在生成/.test(scopeTxt)) {
    evt("dialog-generating");
    const r = await ev(() => {
      const btns = document.querySelectorAll(".layui-layer button, .layui-layer a, .layui-layer-btn0, .modal-container button, .modal-container a");
      for (let i = 0; i < btns.length; i++) { const tx = String(btns[i].textContent || "").trim(); if (/确认|确定|关闭|知道了|好/.test(tx) && btns[i].offsetParent) { try { btns[i].click(); return { pressed: tx.slice(0, 10) }; } catch (e) {} break; } }
      return { pressed: null };
    });
    if (!r || !r.pressed) await ev(() => { let c = 0; document.querySelectorAll(".close-btn, .layui-layer-close, .layui-layer-close2, [class*=close]").forEach((el) => { if (c < 4 && el.offsetParent && /close/.test(String(el.className || ""))) { try { el.click(); c++; } catch (e) {} } }); return { closed: c }; });
    return { handled: true, kind: "generating" };
  }
  // 4) 自动核稿失败提醒 → 记录但不关闭，点击「去检查」
  if (/自动核稿失败|生产文件与设计稿|标记正常|去检查/.test(scopeTxt)) {
    evt("dialog-proof-fail");
    const r = await ev(() => {
      let btn = null;
      const all = document.querySelectorAll("button, a, span, div");
      for (let i = 0; i < all.length; i++) { const el = all[i]; if (String(el.textContent || "").trim() === "去检查" && el.offsetParent) { btn = el; break; } }
      if (btn) { try { btn.click(); return { goto: true }; } catch (e) {} }
      return { goto: false };
    });
    return { handled: true, kind: "proof-fail", goto: !!(r && r.goto) };
  }
  return { handled: false, kind: null };
}
// 扫描所有可见弹层并统一处理一轮；返回处理记录
async function dialogPass() {
  const s = await scanLayers();
  if (!s.ok) return { handled: false, layers: [] };
  const handled = [];
  for (const l of s.layers) { const h = await handleKnownDialog(l.txt); if (h.handled) handled.push(h); }
  return { handled, layers: s.layers };
}

// ---------- 核稿：创建→核稿→关窗 ----------
async function createProbeObject() {
  evt("create-object");
  await ev((arg) => {
    const req = window.requirejs || window.require;
    const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
    for (let i = 0; i < vo.totalCanvasArray.length; i++) {
      const d = vo.totalCanvasArray[i];
      if (!(d && typeof d.drawText === "function" && d.canvas && d.canvasObjInfo)) continue;
      const base = d.canvasObjInfo.canvasToProductObjArr.length;
      const entry = { media: { mediaType: "text", text: arg.t, font: { pointSize: 24, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "556", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.3, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: 100, y: 100, width: 220, height: 40, factWidth: 220, factHeight: 40, rotation: 0 }, printLocation: { x: 100, y: 100, width: 220, height: 40, rotation: 0 }, layer: { alpha: 1 }, layerNum: base, isEdit: 1, isDisplay: 1, deleteState: 0, visitLevel: 1, multiUuid: "p0rn" + Date.now() % 1000000, markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0, lowPixelFlag: 0, selectEnabled: 1, isDesign: 1, isComposite: 0, isPreview: 0, isDesignShape: 0 };
      d.drawText(arg.t, null, null, null, entry, base);
      const o = d.canvas.getObjects().filter((ob) => String(ob.text || "") === arg.t)[0];
      if (o) { o.topEnable = 1; o.resourceType = 0; o.maskEnable = 0; o.lowPixelFlag = 0; o.selectEnabled = 1; o.isDesign = 1; o.isComposite = 0; o.isPreview = 0; o.isDesignShape = 0; }
      d.canvas.requestRenderAll && d.canvas.requestRenderAll();
      return { ok: true, total: d.canvas.getObjects().length };
    }
    return { ok: false, err: "no canvas" };
  }, { t: PROBE_TEXT });
}
async function clickByName(txt, clsRe) {
  return ev((arg) => {
    const all = document.querySelectorAll("li,a,button,span,div");
    let best = null;
    for (let i = 0; i < all.length; i++) { const el = all[i]; const t = String(el.textContent || "").trim(); const c = String(el.className || ""); if (t === arg.tx && (!arg.cls || new RegExp(arg.cls, "i").test(c)) && el.offsetParent) { best = el; break; } }
    if (!best && arg.cls) { const byCls = document.querySelectorAll(arg.cls); for (let i = 0; i < byCls.length; i++) { if (byCls[i].offsetParent) { best = byCls[i]; break; } } }
    if (best) { try { best.click(); return { clicked: true }; } catch (e) {} }
    return { clicked: false };
  }, { tx: txt, cls: clsRe || "" });
}
async function stageProof() {
  evt("stage-proof");
  // 核稿
  await clickByName("核稿");
  await waitUntil(() => {
    const ls = document.querySelectorAll(".layui-layer, .modal, .modal-container, [class*=hegao], [class*=check_wrap], [class*=proof]");
    for (let i = 0; i < ls.length; i++) {
      const el = ls[i]; const rc = el.getBoundingClientRect(); if (rc.width === 0 && rc.height === 0) continue;
      const t = String(el.innerText || el.textContent || "").trim();
      if (/点击图片复制|核稿|生成/.test(t) && t.length > 1) return { ok: true, txt: t.slice(0, 80) };
    }
    return { ok: false };
  }, "hegao dialog", 20000);
  await dialogPass(); // 若核稿弹「生成中」→ 处理
  await sleep(2500);
  // 关闭核稿窗（含 核稿图 弹窗）
  await ev(() => { let c = 0; document.querySelectorAll(".close-btn, .layui-layer-close, .layui-layer-close2, [class*=close], .modal .close").forEach((el) => { if (c < 6 && el.offsetParent && /close/.test(String(el.className || ""))) { try { el.click(); c++; } catch (e) {} } }); return { closed: c }; });
  await sleep(1500);
  return true;
}
async function stagePrint() {
  evt("stage-print");
  // 双点击策略：class 优先 + 文本兜底；出现设计信息层为止（最多重试 3 次）
  let w1 = null;
  for (let attempt = 0; attempt < 3 && !(w1 && w1.ok); attempt++) {
    const hit = await ev(() => {
      const cands = document.querySelectorAll(".btn.print, li.print, [class*=' print'], .rightBtn li, .rightBtn a");
      let best = null;
      for (let i = 0; i < cands.length; i++) { const el = cands[i]; const tx = String(el.textContent || "").trim(); const cls = String(el.className || ""); if (/印刷/.test(tx) && /print/i.test(cls)) { best = el; break; } if (/印刷/.test(tx) && !best) best = el; }
      if (!best) { const all = document.querySelectorAll("li,a,button,span,div"); for (let i = 0; i < all.length; i++) { if (String(all[i].textContent || "").trim() === "印刷" && all[i].offsetParent) { best = all[i]; break; } } }
      if (!best) return { clicked: false };
      try { best.click(); return { clicked: true, cls: String(best.className).slice(0, 50), tag: best.tagName }; } catch (e) { return { clicked: false, err: String(e) }; }
    });
    evt("print-click " + attempt + " " + JSON.stringify(hit));
    await sleep(3000);
    const diag = await ev(() => {
      const out = [];
      document.querySelectorAll(".layui-layer, .modal, .modal-container, [class*=hegao]").forEach((el) => {
        if (!el.offsetParent) return;
        const rc = el.getBoundingClientRect(); if (rc.width < 3) return;
        const t = String(el.innerText || el.textContent || "").trim().slice(0, 120);
        if (t) out.push({ cls: String(el.className).slice(0, 50), t });
      });
      return { ok: true, layers: out };
    });
    evt("print-diag " + attempt + " " + JSON.stringify(diag && diag.layers).slice(0, 600));
    w1 = await waitUntil(() => {
      const layers = document.querySelectorAll(".layui-layer, .modal, .modal-container");
      for (let i = 0; i < layers.length; i++) {
        const el = layers[i]; const rc0 = el.getBoundingClientRect(); if (rc0.width === 0 && rc0.height === 0) continue;
        const t = String(el.innerText || "");
        if (/作品名|设计信息/.test(t) && /用户名/.test(t)) return { ok: true, txt: t.slice(0, 120) };
      }
      return { ok: false };
    }, "design-info layer", 25000);
  }
  if (!(w1 && w1.ok)) { evt("no-design-info-layer"); return { ok: false, reason: "no design-info layer" }; }
  // 2) 填 1/2 → 确定
  await ev(() => {
    const layers = document.querySelectorAll(".layui-layer, .modal, .modal-container");
    let host = null;
    for (let i = 0; i < layers.length; i++) { const el = layers[i]; if (el.offsetParent && /作品名/.test(String(el.innerText || ""))) { host = el; break; } }
    const scope = host || document;
    const inputs = scope.querySelectorAll("input[type=text], input:not([type]), textarea");
    const setByLabel = (keys, val) => {
      for (let i = 0; i < inputs.length; i++) { const el = inputs[i]; if (el.__p0) continue; const joined = (el.previousElementSibling ? String(el.previousElementSibling.textContent || "") : "") + String(el.placeholder || "") + String(el.title || ""); for (let k = 0; k < keys.length; k++) { if (joined.indexOf(keys[k]) >= 0) { el.value = val; try { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {} el.__p0 = 1; break; } } }
    };
    setByLabel(["作品", "作品名", "workName", "名称"], "1");
    setByLabel(["用户", "用户名", "userName", "姓名"], "2");
    setByLabel(["备注"], "p0 runner");
    return { ok: true };
  });
  await sleep(1200);
  const d = await ev(() => {
    const btns = document.querySelectorAll(".layui-layer button, .layui-layer a, .layui-layer-btn0, .modal button, .modal a");
    for (let i = 0; i < btns.length; i++) { const tx = String(btns[i].textContent || "").trim(); if (/^确定$|^保存$/.test(tx)) { const host = btns[i].closest(".layui-layer, .modal, .modal-container") || document; if (/确定进行印刷|提交生产|提交制作|确认提交|确定印刷|下单/i.test(String(host.textContent || ""))) continue; try { btns[i].click(); return { clicked: true }; } catch (e) {} break; } }
    return { clicked: false };
  });
  evt("design-info-submit " + JSON.stringify(d));
  // 诊断：确定后 5s 可见层全景
  await sleep(5000);
  const diag2 = await ev(() => {
    const out = [];
    document.querySelectorAll(".layui-layer, .modal, .modal-container, [class*=hegao], .progress, [class*=check_wrap]").forEach((el) => {
      if (!el.offsetParent) return;
      const rc = el.getBoundingClientRect(); if (rc.width < 3) return;
      const t = String(el.innerText || el.textContent || "").trim().slice(0, 200);
      if (t) out.push({ cls: String(el.className).slice(0, 60), t });
    });
    // 顶部按钮禁用态
    const btns = [];
    document.querySelectorAll(".rightBtn li, .rightBtn a, #submitProduct").forEach((el) => { const tx = String(el.textContent || "").trim(); if (tx && tx.length <= 6) btns.push({ txt: tx, vis: !!el.offsetParent }); });
    return { ok: true, layers: out, btns };
  });
  evt("after-submit-diag " + JSON.stringify(diag2 && { layers: diag2.layers, btns: diag2.btns }).slice(0, 900));
  // 3) 等「提交稿件（交稿）」层
  const w2 = await waitUntil(() => {
    const layers = document.querySelectorAll(".layui-layer, .modal, .modal-container");
    for (let i = 0; i < layers.length; i++) {
      const el = layers[i]; const rc0 = el.getBoundingClientRect(); if (rc0.width === 0 && rc0.height === 0) continue;
      const t = String(el.innerText || "");
      if (/提交稿件（交稿）|提交稿件|顾客信息|错字检查结果/.test(t)) return { ok: true, txt: t.slice(0, 120) };
    }
    return { ok: false };
  }, "jiaogao layer", 40000);
  if (!w2.ok) { evt("no-jiaogao-layer"); return { ok: false, reason: "no jiaogao layer" }; }
  // 4) 点「提交稿件」（交稿层核心按钮，排除取消）
  await sleep(1500);
  const jt = await ev(() => {
    const all = document.querySelectorAll("button, a, .layui-layer-btn0, .modal button, .modal a");
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      const tx = String(el.textContent || "").trim();
      if (/^提交稿件$|提交稿件|确认交稿|交稿/.test(tx) && !/取消|关闭/.test(tx) && el.offsetParent) {
        try { el.click(); return { clicked: true, tx: tx.slice(0, 12) }; } catch (e) { return { clicked: false, err: String(e) }; }
      }
    }
    return { clicked: false };
  });
  evt("jiaogao-submit " + JSON.stringify(jt));
  await sleep(2500);
  return { ok: true, jt };
}

// ---------- 搜索同步机制（核心）----------
// 读取当前核稿关键状态：hegaocheckid / 错字检查结果 / 核稿失败文本 / 请求数
async function readProofState() {
  const r = await ev(() => {
    const hegao = document.querySelector("#hegaocheckid");
    const layers = [];
    document.querySelectorAll(".layui-layer, .modal, .modal-container").forEach((el) => { if (el.offsetParent) { const t = String(el.innerText || "").trim(); if (t && /核稿|错字|生产稿|设计稿|搜索|订单号/.test(t) && layers.length < 12) layers.push(t.slice(0, 300)); } });
    return { ok: true, hegaocheckid: hegao ? hegao.value : null, layers };
  });
  const reqCount = ((report.phases.net || []).length);
  return { state: r && r.ok ? r : { ok: false }, reqCount };
}
// 在交稿/核稿区域内点击搜索（限 .modal/.layui-layer；icon-search.inputorderno → .search-btn → 文本"搜索"）
async function clickSearchOnce() {
  return ev(() => {
    const layers = Array.from(document.querySelectorAll(".modal, .layui-layer"));
    const scan = (root) => {
      const cands = root.querySelectorAll("a, button, span, i, em, input[type=button], input[type=submit]");
      for (let j = 0; j < cands.length; j++) {
        const el = cands[j];
        const rc0 = el.getBoundingClientRect(); if (rc0.width === 0 && rc0.height === 0) continue;
        const cls = String(el.className || "");
        const tx = String(el.textContent || el.value || "").trim();
        if (/icon[ -]?search|search-btn/i.test(cls) || tx === "搜索" || tx === "查 询" || tx === "查询") {
          // 排除顶部工具栏（交稿/核稿相关容器之外）
          if (/temp-info|hdgy|menuCont|navItem/.test(cls)) continue;
          return el;
        }
      }
      return null;
    };
    for (let i = 0; i < layers.length; i++) { if (!layers[i].offsetParent) continue; const el = scan(layers[i]); if (el) { try { el.click(); return { clicked: true, cls: String(el.className || "").slice(0, 50) }; } catch (e) { return { clicked: false, err: String(e) }; } } }
    // 兜底：全局找（仅限弹层内或 class 含 search，避免误点顶部"搜索"菜单）
    const all = document.querySelectorAll("a, button, span, i, em");
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      const rc0 = el.getBoundingClientRect(); if (rc0.width === 0 && rc0.height === 0) continue;
      const cls = String(el.className || "");
      const tx = String(el.textContent || "").trim();
      const inLayer = !!(el.closest && el.closest(".modal, .layui-layer"));
      if ((/search/i.test(cls) || tx === "搜索") && (inLayer || /search/i.test(cls)) && !/temp-info|hdgy|menuCont/.test(cls)) {
        try { el.click(); return { clicked: true, cls: cls.slice(0, 50), fallback: true }; } catch (e) { return { clicked: false }; }
      }
    }
    return { clicked: false };
  });
}
// 搜索 × N（最多5），每次记录 before/after 状态；出现生成中→确认；核稿失败→去检查
async function searchSync(maxRounds = 5) {
  const log = [];
  let prevReq = (report.phases.net || []).length;
  let failGoto = false;
  let generatingHandled = 0;
  for (let r = 0; r < maxRounds; r++) {
    const before = await readProofState();
    const sc = await clickSearchOnce();
    await sleep(2500);
    const after = await readProofState();
    const reqDelta = (report.phases.net || []).length - prevReq;
    prevReq = (report.phases.net || []).length;
    log.push({ r, clicked: sc && sc.clicked, cls: sc && sc.cls, beforeHegao: before.state && before.state.hegaocheckid, afterHegao: after.state && after.state.hegaocheckid, reqDelta });
    // 生成中 → 处理
    const layers = after.state && after.state.layers ? after.state.layers.join("\n") : "";
    if (/印刷稿件生成中|请耐心等待|生成中/.test(layers)) {
      const d = await dialogPass();
      if (d.handled.some((h) => h.kind === "generating")) { generatingHandled++; await sleep(3000); }
    }
    // 核稿失败 → 去检查（一次）
    if (/自动核稿失败|生产文件与设计稿/.test(layers)) {
      const d = await dialogPass();
      const g = d.handled.find((h) => h.kind === "proof-fail");
      if (g && g.goto) { failGoto = true; evt("goto-check-clicked"); break; }
    }
  }
  return { log, failGoto, generatingHandled };
}
// 刷新同步策略：优先仅检查页/当前页 reload（不重开编辑器）
async function refreshSync() {
  evt("refresh-sync");
  await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
  const w = await waitUntil(isReadyExpr(), "editor after refresh", 90000);
  return w.ok;
}

// ---------- 检查页：红框定位 ----------
async function detectCheckPage() {
  return ev(() => {
    const body = String((document.body && document.body.innerText) || "");
    const url = location.href;
    const hasP1 = /生产稿|设计稿|错误截图|错字检查|提交稿件|顾客信息/.test(body);
    const hasP2 = /check|proof|hegao|核稿/i.test(url);
    return { ok: hasP1 || hasP2, url: url.slice(0, 200), hasP1, hasP2 };
  });
}
async function locateRedBox() {
  const r = await ev(() => {
    const rects = [];
    // 1) DOM 层：红/黄/警告边框或覆盖层
    document.querySelectorAll("[class*=red], [class*=warn], [class*=error], [class*=tips], [style*=border], [style*=outline]").forEach((el) => {
      if (rects.length >= 40) return;
      if (!el.offsetParent) return;
      const rc = el.getBoundingClientRect();
      if (rc.width < 2 || rc.height < 2) return;
      const cls = String(el.className || "");
      const st = String(el.getAttribute("style") || "");
      const likely = /red|warn|error|border|outline/i.test(cls + st);
      rects.push({ src: "dom", cls: cls.slice(0, 50), x: rc.x, y: rc.y, w: rc.width, h: rc.height, likely });
    });
    // 2) Canvas 区域容器（红框可能画在 canvas 覆盖层）
    document.querySelectorAll("canvas, .canvas-container, .canvasWrap, [class*=canvas]").forEach((el) => {
      if (rects.length >= 60) return;
      const rc = el.getBoundingClientRect();
      if (rc.width < 50) return;
      rects.push({ src: "canvas", cls: String(el.className || "").slice(0, 40), x: rc.x, y: rc.y, w: rc.width, h: rc.height, likely: false });
    });
    const vw = window.innerWidth, vh = window.innerHeight;
    return { ok: true, rects: rects.slice(0, 60), vw, vh };
  });
  return r.ok ? r : { ok: false, rects: [] };
}
// 将红框（viewport 坐标）映射到 Canvas 对象：取 canvas 容器 rect → 相对比例 → CanvasObjVO 对象 bbox
async function mapRedBoxToObject(rects) {
  const rectsIn = Array.isArray(rects) ? rects : [];
  const m = await ev((arg) => {
    const rectsArg = Array.isArray(arg && arg.rects) ? arg.rects : [];
    const req = window.requirejs || window.require;
    const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
    const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
    if (!d || !d.canvas) return { ok: false, err: "no canvas" };
    // canvas 容器 rect（画布实际渲染区域，坐标 = canvas 像素 = 对象 left/top 单位）
    const canvasEl = d.canvas.upperCanvasEl || d.canvas.lowerCanvasEl || d.canvas.getElement && d.canvas.getElement();
    let cRect = null;
    if (canvasEl) { const rc = canvasEl.getBoundingClientRect(); cRect = { x: rc.x, y: rc.y, w: rc.width, h: rc.height }; }
    const objs = d.canvas.getObjects ? d.canvas.getObjects() : [];
    const suspects = [];
    for (const rct of rectsArg) {
      if (!rct.likely || rct.src !== "dom") continue;
      if (!cRect) continue;
      // 红框中心点相对画布的比例 → 画布坐标
      const cx = rct.x + rct.w / 2;
      const cy = rct.y + rct.h / 2;
      const px = cRect.w > 0 ? (cx - cRect.x) / cRect.w * d.canvas.getWidth() : null;
      const py = cRect.h > 0 ? (cy - cRect.y) / cRect.h * d.canvas.getHeight() : null;
      if (px == null || py == null) continue;
      // 遍历对象 bbox 匹配
      let hit = null;
      for (let i = objs.length - 1; i >= 0; i--) {
        const o = objs[i];
        if (!o) continue;
        const aabb = o.getBoundingRect ? o.getBoundingRect(true, true) : { left: o.left, top: o.top, width: o.width || 10, height: o.height || 10 };
        const ox = aabb.left, oy = aabb.top, ow = aabb.width, oh = aabb.height;
        if (px >= ox && px <= ox + ow && py >= oy && py <= oy + oh) {
          hit = { index: i, uuid: o.uuid || o.multiUuid || null, type: o.type || o.mediaMediaType, text: o.text || o.mediaText || null, fontId: o.mediafontId, fontFamily: o.fontFamily, mediaFont: o.media && o.media.font ? o.media.font : null, bbox: { left: ox, top: oy, w: ow, h: oh } };
          if (o.mediaMediaType === "text" || o.type === "textbox") break;
        }
      }
      suspects.push({ redRect: { x: rct.x, y: rct.y, w: rct.w, h: rct.h }, canvasXY: { px, py }, hit });
    }
    return { ok: true, cRect, suspects };
  }, { rects: rectsIn.filter((r) => r.src === "dom") });
  if (!m.ok) { evt("map-fail " + (m.err || "")); }
  return m;
}
async function stageCheck() {
  evt("stage-check");
  // 在检查页再搜索 3 次
  const sc = await searchSync(3);
  report.phases.checkSearch = sc;
  // 必要时刷新（若搜索无变化）
  if (!sc.log.some((l) => l.reqDelta > 0) && !sc.failGoto) {
    evt("search-no-sync-refresh");
    await refreshSync();
    await sleep(3000);
  }
  // 定位红框
  const rects = await locateRedBox();
  const mapped = await mapRedBoxToObject((rects && rects.rects) || []);
  const suspect = {
    located: mapped.ok && mapped.suspects && mapped.suspects.length > 0,
    ts: new Date().toISOString(),
    mapped: mapped.ok ? mapped : null,
    redRects: (rects.rects || []).filter((r) => r.likely)
  };
  writeJson("suspect-object.json", suspect);
  report.phases.suspect = suspect;
  return suspect;
}

// ---------- Schema 对照（--case-font-schema）----------
async function caseFontSchema() {
  evt("case-font-schema");
  await ensureEditor(150000);
  await ensureLogin();
  const r = await ev(() => {
    const req = window.requirejs || window.require;
    const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
    const out = { a: null, b: null };
    for (let i = 0; i < vo.totalCanvasArray.length; i++) {
      const d = vo.totalCanvasArray[i];
      if (!(d && typeof d.drawText === "function" && typeof d.addText === "function" && d.canvas && d.canvasObjInfo)) continue;
      const base = d.canvasObjInfo.canvasToProductObjArr.length;
      d.addText("A_MANUAL_TEXT");
      const a = d.canvas.getObjects().filter((o) => String(o.text || "") === "A_MANUAL_TEXT")[0];
      const uid = "p0cf" + Date.now() % 1000000;
      const entry = { media: { mediaType: "text", text: "B_SCRIPT_TEXT", font: { pointSize: 24, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "556", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.3, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: 220, y: 220, width: 220, height: 40, factWidth: 220, factHeight: 40, rotation: 0 }, printLocation: { x: 220, y: 220, width: 220, height: 40, rotation: 0 }, layer: { alpha: 1 }, layerNum: base + 1, isEdit: 1, isDisplay: 1, deleteState: 0, visitLevel: 1, multiUuid: uid, markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0, lowPixelFlag: 0, selectEnabled: 1, isDesign: 1, isComposite: 0, isPreview: 0, isDesignShape: 0 };
      d.drawText("B_SCRIPT_TEXT", null, null, null, entry, base + 1);
      const b = d.canvas.getObjects().filter((o) => String(o.text || "") === "B_SCRIPT_TEXT")[0];
      if (b) { b.topEnable = 1; b.resourceType = 0; b.maskEnable = 0; b.lowPixelFlag = 0; b.selectEnabled = 1; b.isDesign = 1; b.isComposite = 0; b.isPreview = 0; b.isDesignShape = 0; }
      const pick = (o) => o ? { type: o.type, mediaMediaType: o.mediaMediaType, mediafontId: o.mediafontId, fontFamily: o.fontFamily, fontSize: o.fontSize, fontWeight: o.fontWeight, fill: o.fill, uuid: o.uuid, multiUuid: o.multiUuid, topEnable: o.topEnable, resourceType: o.resourceType, maskEnable: o.maskEnable, lowPixelFlag: o.lowPixelFlag, selectEnabled: o.selectEnabled, isDesign: o.isDesign, isComposite: o.isComposite, isPreview: o.isPreview, isDesignShape: o.isDesignShape, visitLevel: o.visitLevel, lineHeight: o.lineHeight } : null;
      out.a = pick(a); out.b = pick(b);
      d.canvas.requestRenderAll && d.canvas.requestRenderAll();
      break;
    }
    return { ok: true, a: out.a, b: out.b };
  });
  // diff（含 typeof）
  const diff = [];
  const keys = new Set([...Object.keys(r.a || {}), ...Object.keys(r.b || {})]);
  for (const k of keys) { const va = r.a && r.a[k], vb = r.b && r.b[k]; if (JSON.stringify(va) !== JSON.stringify(vb)) diff.push({ key: k, manual: { v: va, t: va === null ? "null" : typeof va }, script: { v: vb, t: vb === null ? "null" : typeof vb } }); }
  writeJson("manual-vs-script-diff.json", { ts: new Date().toISOString(), manual: r.a, script: r.b, diff });
  report.phases.schemaDiff = diff;
  return { ok: true, diff };
}

// ---------- session parity / submit probe ----------
// 采集 MANAGED 会话的环境指纹（脱敏），与 REAL 会话（disc）对比输出 session-parity.json
async function parityCollect(disc) {
  evt("session-parity-collect");
  await launch();
  const okE = await ensureEditor(120000);
  if (!okE) { report.errors.push("editor not ready"); return; }
  const lgE = await ev(() => {
    const ua = document.querySelector("#userAccount");
    return { loginVisible: !!(ua && ua.offsetParent), cookieKeys: Object.keys(document.cookie.split("; ").reduce((o, c) => { const k = c.split("=")[0]; if (k) o[k] = 1; return o; }, {})).sort(), storageKeys: Object.keys(localStorage).sort().slice(0, 80), sessionKeys: Object.keys(sessionStorage).sort().slice(0, 40) };
  });
  const globalsProbe = await ev(() => {
    const names = Object.getOwnPropertyNames(window).sort();
    return { ok: true, count: names.length, sample: names.filter((n) => /zy|diy|product|canvas|order|user|token|login/i.test(n)).slice(0, 60) };
  });
  const managed = { loginVisible: lgE.loginVisible, cookieKeys: (lgE.cookieKeys || []).slice(0, 80), storageKeys: lgE.storageKeys, sessionKeys: lgE.sessionKeys, globalsCount: globalsProbe.count, globalsSample: (globalsProbe.sample || []), submitResp: null };
  report.phases.managedEnv = { loginVisible: managed.loginVisible, cookieCount: (managed.cookieKeys || []).length, storageCount: (managed.storageKeys || []).length, sessionCount: (managed.sessionKeys || []).length };
  evt("managed-env captured");
  writeJson("session-parity.json", {
    ts: new Date().toISOString(),
    realSession: disc.source === "EXISTING_REAL_BROWSER" ? { source: disc.source, pages: (disc.pages || []).length, editorPages: (disc.pages || []).filter((p) => p.isEditor).length, cookieNames: disc.cookieNames || [] } : null,
    managedSession: managed,
    note: "敏感值已脱敏：仅记录 cookie/storage key 名称，不含 value"
  });
}
// managed 提交探测：创建对象→核稿→印刷→设计信息→确定，抓 submitUserDesign.do 响应
async function submitProbe() {
  evt("submit-probe");
  await launch();
  await ensureEditor(120000);
  const lgE = await ev(() => { const ua = document.querySelector("#userAccount"); return !!(ua && ua.offsetParent); });
  if (lgE) { const lk = await ensureLogin(); if (!lk) { report.errors.push("AUTH_REQUIRED"); return; } }
  await createProbeObject();
  await stageProof();
  const pr = await stagePrint();
  report.phases.submitProbe = { print: pr };
  // 抓 submit 响应
  const sub = (report.phases.net || []).filter((n) => /submitUserDesign|saveThirdUserDesign/.test(n.u)).map((n) => ({ u: n.u.slice(0, 140), status: n.status, body: String(n.body || "").slice(0, 200) }));
  report.phases.submitResp = sub;
  writeJson("submit-probe.json", { ts: new Date().toISOString(), printOk: !!(pr && pr.ok), submitResp: sub });
}
async function main() {
  evt("runner-start " + JSON.stringify(FLAG));
  const adopt = require("./session-adopt");
  const disc = await adopt.discover();
  report.sessionSource = disc.source;
  report.disc = { source: disc.source, cdpUrl: disc.cdpUrl || null, pages: disc.pages || [], cookieNames: disc.cookieNames || [] };
  if (disc.source === "EXISTING_REAL_BROWSER") {
    evt("REAL-BROWSER-FOUND cdp=" + (disc.cdpUrl || ""));
    const ep = (disc.pages || []).find((p) => p.isEditor);
    if (ep) evt("REAL-EDITOR-PAGE ready=" + ep.editorReady + " " + ep.url.slice(0, 100));
  } else {
    evt("SESSION-SOURCE=MANAGED_PERSISTENT_PROFILE");
  }
  // 模式：仅 session 相关
  if (FLAG.adoptSession) {
    writeJson("session-parity.json", { mode: "adopt", ts: new Date().toISOString(), sessionSource: report.sessionSource, pages: disc.pages || [], cookieNames: disc.cookieNames || [] });
    writeSummary();
    return;
  }
  if (FLAG.sessionParity) { await parityCollect(disc); writeSummary(); return; }
  if (FLAG.submitProbe) { await submitProbe(); writeSummary(); return; }

  await launch();
  const resumeFrom = resumeArg || (FLAG.fromCheck ? "check" : FLAG.fromPrint ? "print" : FLAG.fromProof ? "proof" : null);
  report.phases.resumeFrom = resumeFrom;
  saveResume("start", { resumeFrom });

  if (FLAG.caseFontSchema) {
    await caseFontSchema();
    writeSummary();
    return;
  }

  if (resumeFrom === "check") {
    // 从检查页开始：当前页面即为检查页（或编辑器页有失败弹层）→ 直接 stageCheck
    evt("from-check: detect check page");
    const cp = await detectCheckPage();
    report.phases.checkPageDetected = cp;
    await stageCheck();
    writeSummary();
    return;
  }

  // 通用前置：editor + login
  const okE = await ensureEditor(150000);
  if (!okE) { report.errors.push("editor not ready"); writeSummary(); return; }
  const lg = await ev(() => { const ua = document.querySelector("#userAccount"); return { visible: !!(ua && ua.offsetParent) }; });
  if (lg.visible) {
    const lk = await ensureLogin();
    if (!lk) { report.errors.push("AUTH_REQUIRED"); saveResume("auth-required"); writeSummary(); return; }
  }
  saveResume("editor");
  // 对象存在性（画布不跨会话保留 → from-* 都补建）
  const hasObj = await ev((arg) => {
    const req = window.requirejs || window.require;
    const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
    const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
    return { ok: !!d, has: !!(d && d.canvas && d.canvas.getObjects().some((o) => String(o.text || "") === arg.t)) };
  }, { t: PROBE_TEXT });
  if (!(hasObj && hasObj.has)) {
    evt("object-missing-create");
    await createProbeObject();
    saveResume("editor+object");
  }
  // 核稿阶段（from-proof 也执行：已有对象直接核稿）
  if (resumeFrom !== "print") {
    const okP = await stageProof();
    saveResume("proof", okP);
    report.phases.proofDone = !!okP;
  }
  // 印刷
  const pr = await stagePrint();
  saveResume("print", pr);
  report.phases.printDone = !!pr;
  // 交稿/核稿同步（搜索×5 + 生成中处理 + 去检查）
  evt("sync-search-start");
  const sync = await searchSync(5);
  writeJson("proof-result.json", { ts: new Date().toISOString(), searchLog: sync.log, generatingHandled: sync.generatingHandled, failGoto: sync.failGoto });
  report.phases.sync = sync;
  if (!sync.failGoto) { const d = await dialogPass(); report.phases.dialogPassAfterSync = d; }
  await sleep(2000);
  // 检查阶段
  await stageCheck();
  saveResume("check", { located: report.phases.suspect && report.phases.suspect.located });
  writeSummary();
}
function writeSummary() {
  writeJson("run-summary.json", {
    ts: new Date().toISOString(),
    flags: FLAG,
    authConfigured: !!(USER && PASS),
    sessionSource: report.sessionSource,
    disc: report.disc,
    resumeFrom: report.phases.resumeFrom || null,
    phases: Object.keys(report.phases).reduce((o, k) => { o[k] = report.phases[k]; return o; }, {}),
    events: report.events,
    pages: report.pages,
    errors: report.errors
  });
  evt("runner-done errors=" + report.errors.length);
  console.log("runner done. summary=" + path.join(P0_DIR, "run-summary.json") + " errors=" + report.errors.length);
}
main().catch((e) => { report.errors.push(String(e && e.message || e).slice(0, 500)); writeSummary(); console.error("FATAL", e); }).then(() => close());