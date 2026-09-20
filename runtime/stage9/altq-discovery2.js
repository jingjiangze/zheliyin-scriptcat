// runtime/stage9/altq-discovery2.js — Stage 9 P0-3D：Alt+Q 深度键盘取证（早期 patch + 状态变体矩阵）
// 目的：确定 diy 编辑器里 Alt+Q 是否绑定处理器、等价功能是什么、如何调用。
// 取证手段（规格 §十/§十一）：
//   A. addInitScript 早期 patch EventTarget.addEventListener → 捕获全部 keydown 处理器源码/栈
//   B. 编辑器 UI 文本扫描（识别/文字/OCR 按钮、工具栏项）
//   C. 真实 keyboard.press("Alt+Q") 状态变体：无选中 / 选中模板文字 / 双击文字编辑态
//   D. network/DOM/编辑器对象变化对比
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

// 早期 patch（addInitScript 一次性，标志位防多实例）
const EARLY_PATCH = [
  "(function(){",
  "try{",
  "  if(window.__s9kbDone) return; window.__s9kbDone=true;",
  "  window.__s9kb={listeners:[],scripts:[]};",
  "  var orig=EventTarget.prototype.addEventListener;",
  "  EventTarget.prototype.addEventListener=function(type,fn,opts){",
  "    if(/^key/.test(String(type||''))){",
  "      try{",
  "        var s=String(fn||'');",
  "        window.__s9kb.listeners.push({type:type,target:(this===window?'window':this===document?'document':(this.nodeName||'node')),",
  "          name:(fn&&fn.name)||'',src:s.slice(0,500),stack:((new Error()).stack.split('\\n').slice(2,5).join(' < ')||'').slice(0,180)});",
  "        if(window.__s9kb.listeners.length>80) window.__s9kb.listeners=window.__s9kb.listeners.slice(-80);",
  "      }catch(e){}",
  "    }",
  "    return orig.apply(this,arguments);",
  "  };",
  "  window.__s9kb.captureEvents=[];",
  "  ['keydown','keypress','keyup'].forEach(function(t){",
  "    window.addEventListener(t,function(e){",
  "      if(!(e.altKey&&(e.keyCode===81))) return;",
  "      window.__s9kb.captureEvents.push({t:t,code:e.code,defaultPrevented:e.defaultPrevented,ts:Date.now()});",
  "      if(window.__s9kb.captureEvents.length>20) window.__s9kb.captureEvents=window.__s9kb.captureEvents.slice(-20);",
  "    },true);",
  "  });",
  "}catch(e){}",
  "})();"
].join("\n");

(async () => {
  const out = { ts: new Date().toISOString(), stage: "STAGE-9-P0D-ALTQ-DEEP", branch: "stage-9-altq-baidu-reconstruction", url: URL, net: [], variants: [] };
  let browser = null, page = null;
  const ev = (fn, arg) => (arg === undefined ? page.evaluate(fn) : page.evaluate(fn, arg)).catch((e) => ({ err: String(e || "").slice(0, 200) }));
  const canvasReady = () => () => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[0]) || null; return { ok: !!(d && d.canvas && typeof d.drawText === "function") }; };
  const waitUntil = async (fnEval, desc, t0, poll) => { const t1 = Date.now(); while (Date.now() - t1 < t0) { const r = await ev(fnEval); if (r && r.ok) return { ok: true, ms: Date.now() - t1 }; await SLEEP(poll || 1500); } return { ok: false, desc }; };
  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1440, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    page = browser.pages()[0];
    page.on("request", (r) => { const u = r.url(); if (u.indexOf("diy.zheliyin.com") < 0) return; out.net.push({ dir: "req", method: r.method(), url: u.slice(0, 200) }); if (out.net.length > 200) out.net = out.net.slice(-200); });
    page.on("response", (r) => { const u = r.url(); if (u.indexOf("ocr") >= 0 || /\.do($|\?)/.test(u)) out.net.push({ dir: "res", status: r.status(), url: u.slice(0, 200) }); if (out.net.length > 200) out.net = out.net.slice(-200); });
    await page.addInitScript(EARLY_PATCH);
    await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await SLEEP(1500);
    const allOld = await adapter.getAllScripts(page) || [];
    for (const s of allOld.filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(page, s.uuid); } catch (e) {} }
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const w = await waitUntil(canvasReady(), "ready", 150000);
    if (!(w && w.ok)) throw new Error("editor not ready");
    await SLEEP(4000);
    // B. UI 文本扫描（找 识别/文字/OCR 入口）
    out.uiScan = await ev(() => {
      const tags = Array.from(document.querySelectorAll("button, a, span, div, li, label")).filter((el) => el.offsetParent !== null);
      const hits = tags.map((el) => String(el.textContent || "").trim()).filter((t) => t && t.length <= 14 && /识别|文字|提取|OCR|AI|智能/i.test(t));
      const scriptSrcs = Array.from(document.scripts).map((s) => s.src).filter((s) => s).slice(0, 80);
      const req = window.requirejs || window.require;
      const included = [];
      try { if (req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined) { Object.keys(req.s.contexts._.defined).forEach((k) => { if (/key|short|hot|ocr|recogn/i.test(k)) included.push(k.slice(0, 80)); }); } } catch (e) {}
      return { uiHits: hits.slice(0, 30), scriptSrcs: scriptSrcs, reqKeyHits: included.slice(0, 30).filter((x, i) => included.indexOf(x) === i) };
    });
    // 编辑器对象清单
    const objs = () => ev(() => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const c = vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas; if (!c) return []; return c.getObjects().map((o, i) => ({ i: i, type: o.type, text: typeof o.text === "string" ? String(o.text).slice(0, 10) : null, left: Math.round(o.left), top: Math.round(o.top), w: Math.round(o.width), h: Math.round(o.height || o.width * o.scaleY || 0) })); });
    out.objsBefore = await objs();
    const kb = () => ev(() => { const k = window.__s9kb || null; return k ? { listeners: k.listeners.map((x) => ({ type: x.type, target: x.target, name: x.name, src: x.src.slice(0, 260), stack: x.stack })).slice(0, 60), captureEvents: k.captureEvents } : null; });
    const runAltQ = async (label, prepareFn) => {
      if (prepareFn) { try { await prepareFn(); } catch (e) {} await SLEEP(800); }
      try { await page.bringToFront(); } catch (e) {}
      const n0 = (out.net || []).length;
      try { await page.keyboard.press("Alt+Q"); } catch (e) {}
      await SLEEP(2600);
      const after = await objs();
      const n1 = (out.net || []).length;
      const v = { label: label, objsDelta: after.length - (out.objsBefore || []).length, netDelta: n1 - n0, netSlice: out.net.slice(Math.max(0, n0 - 2), n1 + 2).map((x) => x.url.slice(0, 140)), kbCapture: (await kb()) };
      out.variants.push(v);
      out.objsBefore = after;
      return v;
    };
    // C1 无选中
    await ev(() => { try { document.body.focus(); } catch (e) {} return { ok: true }; });
    await runAltQ("no-selection");
    // C2 选中模板文字对象（第一个 text）
    await runAltQ("select-first-text", () => ev(() => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const c = vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas; if (!c) return { ok: false }; const t = c.getObjects().find((o) => typeof o.text === "string"); if (!t) return { ok: false }; try { c.discardActiveObject(); c.setActiveObject(t); c.requestRenderAll(); } catch (e) {} return { ok: true, has: !!t }; }));
    // C3 双击文字进入编辑态
    await runAltQ("dblclick-text-edit", () => ev(() => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const c = vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas; if (!c) return { ok: false }; const t = c.getObjects().find((o) => typeof o.text === "string"); if (!t) return { ok: false }; try { if (t.enterEditing) t.enterEditing(); else { c.setActiveObject(t); } if (c.requestRenderAll) c.requestRenderAll(); } catch (e) {} return { ok: true }; }));
    out.kbListeners = await kb();
    out.objsFinal = await objs();
  } catch (e) { out.errors = (out.errors || []).concat([String(e && e.message || e).slice(0, 400)]); }
  finally { try { page && await page.close(); } catch (e) {} try { browser && await browser.close(); } catch (e) {} }
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, "altq-deep.json"), JSON.stringify(out, null, 2));
  console.log("STAGE-9 P0D altq-deep done -> " + path.join(REPORT_DIR, "altq-deep.json"));
})();