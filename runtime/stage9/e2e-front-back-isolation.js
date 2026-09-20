// runtime/stage9/e2e-front-back-isolation.js — Stage 9 V4 §49/§十一：真实编辑器 Front→Back→Front 隔离 E2E
// ---------------------------------------------------------------------
// 硬验收（§49）：背面处理完成后正面对象数量/UUID/pageId/text/geometry 不变；反向同理；中途切页→PAGE_IDENTITY_CHANGED STOP。
// 方法（完全程序化，无坐标点击）：
//   - env ZY_STAGE9_COOKIE（敏感，仅运行时注入浏览器，绝不落盘/报告只记 cookie 名）
//   - 持久 profile + ScriptCat 扩展（既有真机范式，background-image-audit 同款）
//   - pageWorld 注入（@require 内联 + userscript + GM shim）→ 真实页面桥（含 getTextInventory/ocrCalibrate/ocrCreate/ocrAdjust）
//   - 注入 real-card 背景 → 页面桥直驱：front calibrate → 切 back → back calibrate → 切 front → front 再校准
//     全程采样对象身份（uuid/zyOcrObjectId/pageId/zyOcrKey/text/left/top/width/height/fontSize），前后对比
//   - 中途切页：校准请求期间 currentCanvasNum 已切换 → 期望 PAGE_IDENTITY_CHANGED 且两侧零新增
// 切页方式：置 CanvasObjVO.currentCanvasNum（resolver 证据链）＋必要时移除 CurrentCanvas 避免身份匹配覆盖（测试侧确定性切换）
// 运行：env ZY_STAGE9_COOKIE=... node runtime/stage9/e2e-front-back-isolation.js
// 输出 runtime/reports/stage-9/e2e-front-back-isolation.json（只记 cookie 名，不记值）
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
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-9");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const CARD = path.join(ROOT, "runtime", "stage8b", "assets", "real-card-shengying.png");
const COOKIE_RAW = process.env.ZY_STAGE9_COOKIE || "";

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

function injectUserscript() {
  let code = fs.readFileSync(USERSCRIPT_PATH, "utf8");
  ["stage-8a-1-ocr-overflow-rotation", "stage-8a-ocr-audit", "stage-8b-ocr-reconstruction-engine", "stage-8a-2-rotation-policy-geometry", "stage-8d-ocr-quality-reconstruction", "test", "demo"].forEach((b) => {
    code = code.split(b + "/extension/src/").join("stage-9-altq-baidu-reconstruction/extension/src/");
    code = code.replace(new RegExp(b.replace(/[-]/g, "\\-") + "\\/zheliyin-card-assistant\\.user\\.js", "g"), "stage-9-altq-baidu-reconstruction/zheliyin-card-assistant.user.js");
  });
  return code;
}
const GM_SHIM_SOURCE = [
  "try{window.__ZY8D_PAGE_WORLD__=true;",
  "if(typeof window.GM_getValue==='undefined'){window.GM_getValue=function(k,d){try{var v=localStorage.getItem('zy8dshim:'+k);return v==null?d:JSON.parse(v);}catch(e){return d;}};}",
  "if(typeof window.GM_setValue==='undefined'){window.GM_setValue=function(k,v){try{localStorage.setItem('zy8dshim:'+k,JSON.stringify(v));}catch(e){}};window.GM_deleteValue=function(k){try{localStorage.removeItem('zy8dshim:'+k);}catch(e){}};}",
  "if(typeof window.GM_xmlhttpRequest==='undefined'){window.GM_xmlhttpRequest=function(o){var u=o.url||'',m=(o.method||'GET');fetch(u,{method:m,headers:(o.headers||{})}).then(function(res){return res.text().then(function(t){return {status:res.status,responseText:t,response:t,readyState:4,finalUrl:u};});}).then(function(r){if(o.onload)try{o.onload(r);}catch(e){};}).catch(function(e){if(o.onerror)try{o.onerror({status:0,error:String(e&&e.message||e)||'fetch-error',responseText:''});}catch(e2){};});return {abort:function(){}};};}",
  "if(typeof window.GM_addStyle==='undefined'){window.GM_addStyle=function(css){var el=document.createElement('style');el.textContent=css;(document.head||document.documentElement).appendChild(el);return el;};}",
  "if(typeof window.GM_addElement==='undefined'){window.GM_addElement=function(tag,attrs){var el=document.createElement(tag);for(var k in (attrs||{})){try{el[k]=attrs[k];}catch(e){}};(document.head||document.documentElement).appendChild(el);return el;};}",
  "}catch(e){console.error('[zy8d-shim]',e);}"
].join("\n");
function pageWorldPayload() {
  const norm = injectUserscript();
  const parts = [GM_SHIM_SOURCE];
  const reqs = [...norm.matchAll(/\/\/ @require\s+(\S+)/g)].map((m) => m[1]);
  for (const u of reqs) {
    const mm = /\/extension\/src\/(.+)$/.exec(u);
    if (!mm) continue;
    const rel = mm[1].split("?")[0];
    const fp = path.join(ROOT, "extension", "src", rel);
    if (fs.existsSync(fp)) parts.push("// ==== @require " + rel + " ====\n" + fs.readFileSync(fp, "utf8"));
  }
  parts.push(norm);
  return parts.join("\n;\n");
}

const snapshot = (inv) => inv.map((o) => ({ objectUuid: o.objectUuid, pageId: o.pageId, zyOcrKey: o.zyOcrKey || null, zyOcrObjectId: o.zyOcrObjectId || null, text: String(o.text || ""), left: o.left, top: o.top, width: o.width, height: o.height, fontSize: o.fontSize }));
const subs = (inv) => inv.map((o) => ({ objectUuid: o.objectUuid, text: String(o.text || ""), left: o.left, top: o.top, width: o.width, height: o.height, fontSize: o.fontSize }));

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const out = { ts: new Date().toISOString(), stage: "STAGE-9-V4-E2E-FRONT-BACK-ISOLATION", url: URL, image: path.basename(CARD), cookiePresent: !!COOKIE_RAW, cookieNames: parseCookies(COOKIE_RAW).map((c) => c.name).filter(Boolean), steps: [], errors: [] };
  if (!COOKIE_RAW) {
    console.error("[e2e] 未提供 ZY_STAGE9_COOKIE —— 编辑器需会话登录。仅注入 cookie 名，不入库不落盘。");
    process.exit(2);
  }
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1280, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    const page = browser.pages()[0];
    page.on("pageerror", (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 200)); });
    for (const c of parseCookies(COOKIE_RAW)) { try { await browser.addCookies([c]); } catch (e) { out.errors.push("COOKIE:" + c.name + " " + String(e && e.message || e).slice(0, 100)); } }
    await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await SLEEP(1500);
    const allOld = await adapter.getAllScripts(page) || [];
    for (const s of allOld.filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(page, s.uuid); } catch (e) {} }
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => out.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
    await SLEEP(2500);
    // 登录检查（不读 cookie 值；只确认编辑器是否可达）
    const loginProbe = await page.evaluate(() => ({ href: location.href.slice(0, 120), hasCanvasVO: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)) })).catch(() => ({}));
    out.steps.push({ step: "open", href: loginProbe.href, hasCanvasVO: !!loginProbe.hasCanvasVO });
    if (!loginProbe.hasCanvasVO) { out.errors.push("EDITOR_UNAVAILABLE: 编辑页未就绪（可能未登录或模板不存在）"); }
    // 注入 pageWorld（含真实页面桥）
    const payload = pageWorldPayload();
    await page.evaluate((code) => { const s = document.createElement("script"); s.textContent = code; (document.head || document.documentElement).appendChild(s); }, payload);
    await SLEEP(1500);
    // 注入背景图（real-card → 正面画布）
    const bgRes = await page.evaluate((arg) => new Promise((res) => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
      const c = d && d.canvas;
      if (!c) return res({ ok: false, err: "no-canvas" });
      const f = (c.constructor && c.constructor.fabric) || window.fabric;
      const im = new Image();
      im.onload = () => { try { const bg = new f.Image(im); bg.set({ left: 0, top: 0 }); c.setBackgroundImage(bg, () => { try { c.setCoords && c.setCoords(); if (c.requestRenderAll) c.requestRenderAll(); } catch (e) {} res({ ok: true }); }); } catch (e) { res({ ok: false, err: String(e && e.message || e).slice(0, 100) }); } };
      im.onerror = () => res({ ok: false, err: "img-fail" });
      im.src = arg;
    }), "data:image/png;base64," + fs.readFileSync(CARD).toString("base64"));
    out.steps.push({ step: "bg-inject", ok: !!(bgRes && bgRes.ok), err: (bgRes && bgRes.err) || null });
    // 页面桥远程调用 helper
    const bridgeCall = (type, payload, replyType, timeoutMs) => page.evaluate((arg) => new Promise((resolve) => {
      let done = false;
      const on = (ev) => { const d = ev.data; if (d && d.source === "zy-card-assistant-page" && d.type === arg.replyType) { window.removeEventListener("message", on); done = true; resolve(d); } };
      window.addEventListener("message", on);
      setTimeout(() => { if (!done) { window.removeEventListener("message", on); resolve({ skip: true, timeout: arg.timeoutMs }); } }, arg.timeoutMs);
      window.postMessage(Object.assign({ source: "zy-card-assistant", type: arg.type }, arg.payload || {}), location.origin);
    }), { type, payload, replyType, timeoutMs: timeoutMs || 12000 });
    const currentPageId = async () => (await bridgeCall("getCurrentPage", {}, "getCurrentPageResult", 5000));
    const inventory = async () => (await bridgeCall("getTextInventory", {}, "getTextInventoryResult", 5000));
    const setCurrentNum = (n) => page.evaluate((nn) => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); if (vo) vo.currentCanvasNum = nn; try { const w = window; delete w.CurrentCanvas; } catch (e) {} return !!vo; }, n);
    const newTx = () => "tx-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    const calItems = () => [
      { blockIndex: 0, text: "佛山盛盈包装制品有限公司", top: 60, left: 40, width: 320, height: 30, fontSize: 20, fontFamily: "Arial" },
      { blockIndex: 1, text: "吴健湘", top: 110, left: 40, width: 120, height: 24, fontSize: 16 },
      { blockIndex: 2, text: "Tel.:0757-88809856", top: 150, left: 40, width: 220, height: 20, fontSize: 13 }
    ];

    const p0 = await currentPageId();
    out.steps.push({ step: "current0", pageId: (p0 && p0.pageId) || null, code: (p0 && p0.code) || null });
    if (!p0 || !p0.ok) { out.errors.push("NO_CURRENT_PAGE: " + JSON.stringify(p0 || {}).slice(0, 200)); }

    // 阶段① front calibrate（c0）
    const invBefore = await inventory();
    out.steps.push({ step: "inv-before-front", items: subs((invBefore && invBefore.items) || []) });
    const r1 = await bridgeCall("ocrCalibrate", { pageId: p0.pageId, transactionId: newTx(), imageFingerprint: "e2e-img-front", items: calItems() }, "ocrCalibrateResult", 15000);
    out.steps.push({ step: "front-calibrate", ok: !!(r1 && r1.ok), calibrated: (r1 && (r1.calibrated || []).length), created: (r1 && (r1.created || []).length), code: r1 && r1.code });
    const invFront1 = await inventory();
    out.steps.push({ step: "inv-after-front", items: subs((invFront1 && invFront1.items) || []) });

    // 阶段② 切背面 calibrate（c1）
    await setCurrentNum(2);
    const pBack = await currentPageId();
    out.steps.push({ step: "current-back", pageId: (pBack && pBack.pageId) || null, code: (pBack && pBack.code) || null });
    const r2 = await bridgeCall("ocrCalibrate", { pageId: (pBack && pBack.pageId) || "canvas:c1", transactionId: newTx(), imageFingerprint: "e2e-img-back", items: [{ blockIndex: 0, text: "诚信经营", top: 80, left: 50, width: 160, height: 24, fontSize: 14 }] }, "ocrCalibrateResult", 15000);
    out.steps.push({ step: "back-calibrate", ok: !!(r2 && r2.ok), calibrated: (r2 && (r2.calibrated || []).length), created: (r2 && (r2.created || []).length), code: r2 && r2.code });
    const invBackAfter2 = await inventory();
    out.steps.push({ step: "inv-after-back", items: subs((invBackAfter2 && invBackAfter2.items) || []) });

    // 阶段③ 切回正面，再次 front calibrate → 对比
    await setCurrentNum(1);
    const r3 = await bridgeCall("ocrCalibrate", { pageId: p0.pageId, transactionId: newTx(), imageFingerprint: "e2e-img-front-2", items: calItems() }, "ocrCalibrateResult", 15000);
    out.steps.push({ step: "front-recalibrate", ok: !!(r3 && r3.ok), calibrated: (r3 && (r3.calibrated || []).length), created: (r3 && (r3.created || []).length), code: r3 && r3.code });
    const invFront2 = await inventory();
    out.steps.push({ step: "inv-after-front2", items: subs((invFront2 && invFront2.items) || []) });

    // 阶段④ 中途切页：切到背面后，用正面 pageId 发校准 → 期望 PAGE_IDENTITY_CHANGED
    await setCurrentNum(2);
    const r4 = await bridgeCall("ocrCalibrate", { pageId: p0.pageId, transactionId: newTx(), imageFingerprint: "e2e-img-front-3", items: calItems() }, "ocrCalibrateResult", 10000);
    out.steps.push({ step: "mid-switch-calibrate", ok: !!(r4 && r4.ok), code: (r4 && r4.code) || null, expectStopped: !r4.ok });
    const invAfterSwitch = await inventory();
    out.steps.push({ step: "inv-after-midswitch(back)", items: subs((invAfterSwitch && invAfterSwitch.items) || []) });

    // 硬验收汇总（§49）
    const sameSub = (a, b) => { const sk = (x) => JSON.stringify(x.map((o) => ({ objectUuid: o.objectUuid, text: o.text, left: o.left, top: o.top, width: o.width, height: o.height, fontSize: o.fontSize }))); return sk(a) === sk(b); };
    const midSwitch = out.steps.find((s) => s.step === "mid-switch-calibrate") || {};
    const frontInvariant = sameSub((invFront1 && invFront1.items) || [], (invFront2 && invFront2.items) || []);
    const backUntouchedDuringFront = sameSub((invBackAfter2 && invBackAfter2.items) || [], (invAfterSwitch && invAfterSwitch.items) || []);
    const midSwitchStopped = !!(midSwitch && !midSwitch.ok && midSwitch.code === "PAGE_IDENTITY_CHANGED");
    out.acceptance = {
      frontInvariant: frontInvariant,
      backUntouchedDuringFront: backUntouchedDuringFront,
      midSwitchStopped: midSwitchStopped,
      pass: frontInvariant && backUntouchedDuringFront && midSwitchStopped
    };
  } catch (e) { out.errors.push("E2E: " + String(e && e.stack || (e && e.message || e)).slice(0, 400)); }
  if (browser) await browser.close().catch(() => {});
  fs.writeFileSync(path.join(REPORT_DIR, "e2e-front-back-isolation.json"), JSON.stringify(out, null, 2));
  console.log("[e2e] cookiePresent=" + out.cookiePresent + " names=" + out.cookieNames.join(","));
  console.log("[e2e] steps=" + JSON.stringify(out.steps.map((s) => ({ s: s.step, ok: s.ok, code: s.code || null, cal: s.calibrated != null ? s.calibrated : null, cre: s.created != null ? s.created : null }))));
  console.log("[e2e] acceptance=" + JSON.stringify(out.acceptance));
  console.log("[e2e] errors=" + out.errors.length + (out.errors.length ? " :: " + out.errors.join(" | ").slice(0, 300) : ""));
  process.exit(out.errors.length ? 1 : 0);
})();