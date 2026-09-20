// runtime/stage9/altq-discovery.js — Stage 9 P0-3：Alt+Q 真实逆向取证
// ---------------------------------------------------------------------
// 目的：回答 Stage 9 §九 的 12 问 —— 页面是否原生监听 Alt+Q？调用什么？触不触发网络？
//       结果写哪里（DOM/clipboard/editor object/global/module/console）？有无临时对象/结果数组？
// 原则：
//   - 不注入 userscript（干净观察页面原生行为；Alt+Q 是页面自身快捷键）
//   - 真实 keyboard.press("Alt+Q")（规格 §十：禁以"模拟事件成功"为最终证据）
//   - 探针（页面 world，单次 addScriptTag）：keydown/press/up 捕获 + MutationObserver
//     + activeElement/selection 基线 +
//     runner 侧 network(request/response)/console
//   - 变体：先 Alt+Q（无选中）→ 注入可选中图片后 Alt+Q（选中态）→ 记录差异
// 输出 runtime/reports/stage-9/altq-discovery.json（evidence，纯工具不升版）
// 用法：node runtime/stage9/altq-discovery.js   （env 同 background-image-audit）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("../../node_modules/playwright");
const adapter = require("../scriptcat-adapter");
const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const EXT_ID = adapter.EXT_ID;
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-9");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const CARD = path.join(ROOT, "runtime", "stage8b", "assets", "real-card-shengying.png");

// ---- 页面 world 探针：挂捕获 / MutationObserver / 键盘事件记录 ----
function probePayload() {
  return [
    "(function(){",
    "try{",
    "  if(window.__altqProbe) return window.__altqProbe;",
    "  var P={ok:true,startTs:Date.now(),events:[],mutations:[],globals:[]};",
    "  window.__altqProbe=P;",
    "  var rec=function(e){ if(!(e.altKey&&(e.keyCode===81||e.code&&e.code.indexOf('KeyQ')===0))) return;",
    "    P.events.push({t:e.type,key:e.key,code:e.code,alt:e.altKey,ctrl:e.ctrlKey,shift:e.shiftKey,",
    "      target:(e.target&&(e.target.tagName||e.target.nodeName))||null,phase:e.eventPhase,",
    "      defaultPrevented:e.defaultPrevented,ts:Date.now()-P.startTs});",
    "    if(P.events.length>60)P.events=P.events.slice(-60);",
    "  };",
    "  window.addEventListener('keydown',rec,true);",
    "  window.addEventListener('keypress',rec,true);",
    "  window.addEventListener('keyup',rec,true);",
    "  P.baseline={active:(document.activeElement&&(document.activeElement.tagName+'.'+String(document.activeElement.className||'').slice(0,50)))||null,",
    "    selText:(function(){try{var s=window.getSelection();return s?s.toString().slice(0,60):'';}catch(e){return '';}})()};",
    "  try{ P.mo=new MutationObserver(function(muts){ muts.slice(0,8).forEach(function(m){",
    "    P.mutations.push({type:m.type,target:(m.target&&(m.target.tagName||m.target.nodeName))||null,",
    "      added:m.addedNodes.length,removed:m.removedNodes.length,attr:m.attributeName||null});",
    "  }); if(P.mutations.length>60)P.mutations=P.mutations.slice(-60); });",
    "    P.mo.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});",
    "  }catch(e){}",
    "  /* 键盘监听器注册点取证：包装 EventTarget.addEventListener（一次性，事后移除） */",
    "  try{",
    "    var origAdd=EventTarget.prototype.addEventListener;",
    "    var patched=false;",
    "    P.keyListeners=[];",
    "    EventTarget.prototype.addEventListener=function(type,fn,opts){",
    "      if(/^key/.test(String(type||''))){",
    "        try{ P.keyListeners.push({type:type,target:(this===window||this===document)?(this===window?'window':'document'):'node',",
    "          fn:(fn&&fn.name)||'',stack:(new Error()).stack.split('\\n').slice(2,5).join(' < ').slice(0,200)});",
    "          if(P.keyListeners.length>40)P.keyListeners=P.keyListeners.slice(-40);",
    "        }catch(e){}",
    "      }",
    "      return origAdd.apply(this,arguments);",
    "    };",
    "    patched=true;",
    "    window.addEventListener('__altq_patch_done__',function(){},null);",
    "    if(patched){ EventTarget.prototype.addEventListener=origAdd; }",
    "  }catch(e){}",
    "  return P;",
    "}catch(e){ return {ok:false,err:String(e&&e.message||e).slice(0,200)}; }",
    "})()"
  ].join("\n");
}

(async () => {
  const out = { ts: new Date().toISOString(), stage: "STAGE-9-P0-ALTQ", branch: "stage-9-altq-baidu-reconstruction", url: URL, card: CARD, net: [], console: [], diag: [], steps: [], answers: {} };
  let browser = null, page = null;
  const ev = (fn, arg) => (arg === undefined ? page.evaluate(fn) : page.evaluate(fn, arg)).catch((e) => ({ err: String(e || "").slice(0, 200) }));
  const waitUntil = async (fnEval, desc, t0, poll) => { const t1 = Date.now(); while (Date.now() - t1 < t0) { const r = await ev(fnEval); if (r && r.ok) return { ok: true, ms: Date.now() - t1 }; await SLEEP(poll || 1500); } return { ok: false, desc }; };
  const canvasReady = () => () => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[0]) || null; return { ok: !!(d && d.canvas && typeof d.drawText === "function") }; };
  const setBg = (dataUrl) => ev((arg) => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[0]) || null; const c = d && d.canvas; if (!c) return { ok: false }; const f = (c.constructor && c.constructor.fabric) || window.fabric; return new Promise((res) => { const im = new Image(); im.onload = () => { try { const bg = new f.Image(im); bg.set({ left: 0, top: 0, scaleX: 1, scaleY: 1, angle: 0 }); c.setBackgroundImage(bg, () => { try { c.setCoords && c.setCoords(); if (c.requestRenderAll) c.requestRenderAll(); } catch (e) {} }); res({ ok: true, nw: im.naturalWidth, nh: im.naturalHeight }); } catch (e) { res({ ok: false, err: String(e && e.message || e).slice(0, 100) }); } }; im.onerror = () => res({ ok: false, err: "onerror" }); im.src = arg.dataUrl; }); }, { dataUrl });
  const addSelectableImg = (dataUrl) => ev((arg) => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[0]) || null; const c = d && d.canvas; if (!c) return { ok: false }; const f = (c.constructor && c.constructor.fabric) || window.fabric; return new Promise((res) => { const im = new Image(); im.onload = () => { try { const obj = new f.Image(im); obj.set({ left: 40, top: 40, scaleX: 1, scaleY: 1 }); obj.multiUuid = "s9altq-" + Date.now(); c.add(obj); try { c.setActiveObject(obj); } catch (e) {} if (d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr) d.canvasObjInfo.canvasToProductObjArr.push(obj); if (c.requestRenderAll) c.requestRenderAll(); res({ ok: true }); } catch (e) { res({ ok: false, err: String(e && e.message || e).slice(0, 100) }); } }; im.onerror = () => res({ ok: false, err: "onerror" }); im.src = arg.dataUrl; }); }, { dataUrl });
  const objSnap = () => ev(() => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const c = vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas; if (!c) return null; return c.getObjects().map((o) => ({ type: o.type, text: typeof o.text === "string" ? String(o.text).slice(0, 16) : null, uuid: o.uuid || o.multiUuid || null })); });
  const collect = () => ev((arg) => {
    const P = window.__altqProbe || null;
    const req = window.requirejs || window.require;
    const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
    const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
    const c = d && d.canvas;
    const res = { probe: P || null, activeAfter: (document.activeElement && (document.activeElement.tagName + "." + String(document.activeElement.className || "").slice(0, 50))) || null, selText: (function () { try { const s = window.getSelection(); return s ? s.toString().slice(0, 80) : ""; } catch (e) { return ""; } })() };
    if (c) { try { c.setCoords && c.setCoords(); } catch (e) {} res.objects = c.getObjects().map((o) => ({ type: o.type, text: typeof o.text === "string" ? String(o.text).slice(0, 16) : null, uuid: o.uuid || o.multiUuid || null })); }
    // 全局/模块候选（限关键词、限量）
    res.candidates = [];
    let n = 0;
    try {
      const keys = Object.keys(window).filter((k) => /ocr|text|extract|recogn|文字|提取|identify|parseImage/i.test(k));
      for (const k of keys.slice(0, 25)) { const v = window[k]; if (typeof v === "function" && n < 12) { res.candidates.push({ where: "window", name: k.slice(0, 60), kind: typeof v }); n += 1; } }
    } catch (e) {}
    try {
      if (req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined) {
        const defs = req.s.contexts._.defined;
        Object.keys(defs).slice(0, 4000).forEach((k) => {
          if (/ocr|text|extract|recogn|文字|提取|identify/i.test(k)) { if (n < 20) { res.candidates.push({ where: "reqjs", name: k.slice(0, 80), kind: typeof defs[k] }); n += 1; } }
        });
      }
    } catch (e) {}
    return res;
  }, {});
  const clipRead = () => ev(async () => { try { if (!navigator.clipboard || !navigator.clipboard.readText) return { ok: false, reason: "no-clipboard-api" }; const t = await Promise.race([navigator.clipboard.readText(), new Promise((r) => setTimeout(() => r("[timeout]"), 2500))]); return { ok: true, text: String(t || "").slice(0, 500) }; } catch (e) { return { ok: false, reason: String(e && e.message || e).slice(0, 120) }; } });

  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1440, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    page = browser.pages()[0];
    page.on("console", (m) => { const t = m.text(); out.console.push(t.slice(0, 400)); if (out.console.length > 120) out.console = out.console.slice(-120); });
    page.on("pageerror", (e) => { out.diag.push("PAGEERROR: " + String(e && e.message || e).slice(0, 300)); });
    page.on("request", (r) => { if (r.url().indexOf("diy.zheliyin.com") < 0) return; out.net.push({ dir: "req", url: r.url().slice(0, 200), method: r.method(), post: (r.postData() || "").slice(0, 160) }); if (out.net.length > 160) out.net = out.net.slice(-160); });
    page.on("response", (r) => { if (r.url().indexOf("diy.zheliyin.com") < 0) return; out.net.push({ dir: "res", url: r.url().slice(0, 200), status: r.status() }); if (out.net.length > 160) out.net = out.net.slice(-160); });
    await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await SLEEP(1800);
    const allOld = await adapter.getAllScripts(page) || [];
    for (const s of allOld.filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(page, s.uuid); } catch (e) {} }
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const w = await waitUntil(canvasReady(), "ready", 150000);
    if (!(w && w.ok)) throw new Error("editor not ready");
    await SLEEP(4000);
    // 注入真实名片为背景（Alt+Q 上下文）
    if (fs.existsSync(CARD)) { out.cardLoaded = await setBg("data:image/png;base64," + fs.readFileSync(CARD).toString("base64")); }
    await SLEEP(1500);
    // 注入探针（页面 world，单次）
    await page.addScriptTag({ content: probePayload() });
    await SLEEP(1000);
    out.beforeObjs = await objSnap();
    // 聚焦正文，避免焦点在扩展 options 页之类
    await ev(() => { try { (document.body || document.documentElement).focus(); } catch (e) {} try { window.focus(); } catch (e) {} return { ok: true }; });
    // Step 1：无选中态按 Alt+Q
    await page.bringToFront();
    await page.keyboard.press("Alt+Q");
    await SLEEP(3500);
    out.step1 = { probeAfter: await collect(), clipboard: await clipRead() };
    // Step 2：选中态（注入可选中图片对象）再按 Alt+Q
    out.selectedImg = await addSelectableImg("data:image/png;base64," + fs.readFileSync(CARD).toString("base64"));
    await SLEEP(1200);
    await page.bringToFront();
    await page.keyboard.press("Alt+Q");
    await SLEEP(3500);
    out.step2 = { probeAfter: await collect(), clipboard: await clipRead() };
    // 清理注入图片对象
    out.cleanup = await ev(() => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); let removed = 0; (vo && vo.totalCanvasArray || []).forEach((d) => { const c = d && d.canvas; if (!c) return; const objs = c.getObjects().filter((o) => o && String(o.multiUuid || "").indexOf("s9altq-") === 0); objs.forEach((o) => { try { c.remove(o); } catch (e) {} }); removed += objs.length; }); try { if (vo && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas && vo.totalCanvasArray[0].canvas.requestRenderAll) vo.totalCanvasArray[0].canvas.requestRenderAll(); } catch (e) {} return { ok: true, removed }; });
    // ---- 12 问自动归纳 ----
    const s1 = out.step1.probeAfter || {}, s2 = out.step2.probeAfter || {};
    const ev1 = (s1.probe && s1.probe.events) || [], ev2 = (s2.probe && s2.probe.events) || [];
    const anyEv = (l) => l.some((e) => e.alt && (e.code || "").indexOf("KeyQ") === 0);
    const objDelta1 = (o1, o2) => { const a = (o1 || []).length, b = (o2 || []).length; return { before: a, after: b, delta: b - a }; };
    const answers = {
      Q1_pageListensShortcut: anyEv(ev1) || anyEv(ev2),
      Q2_whichFunctionCalled: "UNKNOWN_deep_trace_见 keyListeners/network",
      Q3_networkRequest: out.net.filter((n) => n.dir === "req").length - (/script|css|js|img|png|woff/.test(out.net.map((x) => x.url).join(" ")) ? 0 : 0),
      Q4_requestUrl: out.net.map((n) => n.url).filter((u) => /ocr|recogn|text|identify|upload|ai/i.test(u)).slice(0, 10),
      Q5_whereResult: null,
      Q6_domWritten: ((s2.probe && s2.probe.mutations || []).length),
      Q7_hiddenTextarea: null,
      Q8_editorObjectWritten: objDelta1(out.beforeObjs, s2.objects),
      Q9_clipboard: (out.step2.clipboard && out.step2.clipboard.text) || (out.step1.clipboard && out.step1.clipboard.text) || null,
      Q10_globalWritten: ((s2.candidates || []).filter((c) => c.where === "window").length),
      Q11_tempTextObject: null,
      Q12_ocrResultArray: null
    };
    out.answers = answers;
    out.objDelta = { step1: objDelta1(out.beforeObjs, out.step1.probeAfter ? out.step1.probeAfter.objects : null), step2: objDelta1(out.step1.probeAfter ? out.step1.probeAfter.objects : null, s2.objects) };
  } catch (e) { out.errors = (out.errors || []).concat([String(e && e.message || e).slice(0, 400)]); }
  finally { try { page && await page.close(); } catch (e) {} try { browser && await browser.close(); } catch (e) {} }
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, "altq-discovery.json"), JSON.stringify(out, null, 2));
  console.log("STAGE-9 P0 altq-discovery done -> " + path.join(REPORT_DIR, "altq-discovery.json"));
})();