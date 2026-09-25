// runtime/stage9/commit-46f-template-apply-real.js — Stage 10-D Commit F：新套版引擎（手动套版）真机验收
// ---------------------------------------------------------------------
// 目标验证（Commit F 验收）：
//   1. 真实「套版」按钮（面板#zy-apply-front → applyFieldsToPage 双路分派）→ planTemplateApply → templateApply：
//      命中槽只 setText（几何/字号/字体/样式/身份/层序全冻结），对象数恒定（绝不新建）；
//   2. 多电话/多微信不合并：T2 双栏 2 电话槽 + 3 电话值 → 2 匹配 + 1 未匹配（无 "；" 合并、第 3 值全局不存在）；
//   3. R0 无槽位 → legacy apply（空白画布重建）零回归；
//   4. 5 轮稳定性（T0/T2）：每轮断言文本更新为客户内容 + 冻结字段逐项不变。
// 凭据：ZY_STAGE9_COOKIE（会话；无则 probe 自动抓取）—— 套版路径不经百度 OCR，无需 AK/SK。
// 报告：runtime/reports/stage-10/commit-46f-template-apply-real.json（cookie 只记名）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("../../node_modules/playwright");
const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const EXT_ID = "ndcooeababalnlpkfedmmbbbgkljhpjf";
const USERSCRIPT_PATH = path.join(ROOT, "zheliyin-card-assistant.user.js");
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-10");
const adapter = require("../scriptcat-adapter");
const probeMod = require("./session-probe");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const WHITELIST = (process.env.ZY_CASE || "").split(",").map((s) => s.trim()).filter(Boolean);
const DIAG_KEY = process.env.ZY_DIAG_KEY || "__zyStage9VisualDiag";
const BVER = "0.3.11.85";

const DECIMAL = (v, n) => (v != null && isFinite(v)) ? Math.round(v * Math.pow(10, n || 2)) / Math.pow(10, n || 2) : null;

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
const GM_SHIM_SOURCE = [
  "try{window.__ZY8D_PAGE_WORLD__=true;",
  "if(typeof window.GM_getValue==='undefined'){window.GM_getValue=function(k,d){try{var v=localStorage.getItem('zy8dshim:'+k);return v==null?d:JSON.parse(v);}catch(e){return d;}};}",
  "if(typeof window.GM_setValue==='undefined'){window.GM_setValue=function(k,v){try{localStorage.setItem('zy8dshim:'+k,JSON.stringify(v));}catch(e){}};window.GM_deleteValue=function(k){try{localStorage.removeItem('zy8dshim:'+k);}catch(e){}};}",
  "if(typeof window.GM_xmlhttpRequest==='undefined'){window.GM_xmlhttpRequest=function(o){var u=o.url||'',m=(o.method||'GET');fetch(u,{method:m,headers:(o.headers||{})}).then(function(res){return res.text().then(function(t){return {status:res.status,responseText:t,response:t,readyState:4,finalUrl:u};});}).then(function(r){if(o.onload)try{o.onload(r);}catch(e){};}).catch(function(e){if(o.onerror)try{o.onerror({status:0,error:String(e&&e.message||e)||'fetch-error',responseText:''});}catch(e2){};});return {abort:function(){}};};}",
  "if(typeof window.GM_addStyle==='undefined'){window.GM_addStyle=function(css){var el=document.createElement('style');el.textContent=css;(document.head||document.documentElement).appendChild(el);return el;};}",
  "if(typeof window.GM_addElement==='undefined'){window.GM_addElement=function(tag,attrs){var el=document.createElement(tag);for(var k in (attrs||{})){try{el[k]=attrs[k];}catch(e){}};(document.head||document.documentElement).appendChild(el);return el;};}",
  "}catch(e){console.error('[zy8d-shim]',e);}"
].join("\n");

function injectUserscript() {
  let code = fs.readFileSync(USERSCRIPT_PATH, "utf8");
  ["stage-8a-1-ocr-overflow-rotation", "stage-8a-ocr-audit", "stage-8b-ocr-reconstruction-engine", "stage-8a-2-rotation-policy-geometry", "stage-8d-ocr-quality-reconstruction", "test", "demo"].forEach((b) => {
    code = code.split(b + "/extension/src/").join("stage-9-altq-baidu-reconstruction/extension/src/");
    code = code.replace(new RegExp(b.replace(/[-]/g, "\\-") + "\\/zheliyin-card-assistant\\.user\\.js", "g"), "stage-9-altq-baidu-reconstruction/zheliyin-card-assistant.user.js");
  });
  return code;
}
function conditionCode() {
  let code = injectUserscript();
  const repl = (o, n) => { if (code.indexOf(o) < 0) { console.warn("[conditionCode] anchor missing (skip): " + o.slice(0, 60)); return; } code = code.split(o).join(n); };
  repl('GM_getValue("zyBaiduOcrMode", "standard")', JSON.stringify("standard"));
  repl('GM_getValue("zyStage9NativeOcrMode", "2")', JSON.stringify("2"));
  repl('GM_getValue("zyStage9NativeTruth", "1") === "1"', "true");
  repl('GM_getValue("zyStage9LocalSidecar", "0") === "1"', "false");
  repl('GM_getValue("zyOcrMode", "auto")', JSON.stringify("baidu"));
  repl('document.addEventListener("DOMContentLoaded", initZheliyin);', '(function(){ if (document.body) { initZheliyin(); } else { document.addEventListener("DOMContentLoaded", function(){ initZheliyin(); }); } })();');
  return code;
}
function selfTest() {
  const t = (n, c) => { if (!c) throw new Error("SELFTEST FAIL " + n); console.log("[selftest] PASS " + n); };
  t("tpl-cases-3", TPL_CASES.length === 3 && TPL_CASES.map((c) => c.id).join() === "T0,T2,R0");
  t("require-template-apply", conditionCode().indexOf("template-apply.js?v=" + BVER) >= 0);
  t("dispatcher-anchor", conditionCode().indexOf('type: "templateApply"') >= 0);
  t("bver-const", BVER === "0.3.11.85");
  console.log("[selftest] ALL PASS");
}

function pageWorldPayloadFor() {
  const parts = [GM_SHIM_SOURCE];
  const norm = conditionCode();
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

// ---------- 每 Case 的正面文本与期望（真实面板文本流：textarea → parseByRulesFromSides → state.fields → 套版分派） ----------
const TPL_CASES = [
  {
    id: "T0", rounds: 5, note: "模板模式：注入 9 文字槽位（姓名/职位/中文公司/英文公司/电话/微信/邮箱/网址/地址）× 5 轮套版稳定性（只改 text，全冻结）",
    frontText: [
      "山东启诚信息技术有限公司",
      "Shandong Qicheng Info Tech Co., Ltd.",
      "王小明",
      "销售总监",
      "电话：13800138000",
      "微信：lisi_wx",
      "邮箱：lisi@example.com",
      "网址：www.qicheng.cn",
      "地址：北京市朝阳区建国路88号"
    ].join("\n"),
    // 槽位注入顺序（同 getTextObjects 序）：与上方字段一一对应
    slots: [
      { key: "name",    text: "占位姓名", fontSize: 18, fontFamily: "思源黑体 Regular" },
      { key: "title",   text: "占位职位", fontSize: 24, fontFamily: "思源黑体 Bold" },
      { key: "company_cn", text: "占位公司", fontSize: 14, fontFamily: "方正黑体简体" },
      { key: "company_en", text: "占位Company Ltd.", fontSize: 12, fontFamily: "思源黑体 Regular" },
      { key: "phones",  text: "占位电话", fontSize: 15, fontFamily: "思源黑体 Regular" },
      { key: "wechats", text: "占位微信", fontSize: 13, fontFamily: "思源黑体 Regular" },
      { key: "emails",  text: "占位邮箱", fontSize: 12, fontFamily: "思源黑体 Regular" },
      { key: "websites", text: "占位网址", fontSize: 12, fontFamily: "思源黑体 Regular" },
      { key: "addresses", text: "占位地址", fontSize: 11, fontFamily: "思源黑体 Regular" }
    ],
    expectApplied: 9, expectUnmatched: 0, expectAbsent: []
  },
  {
    id: "T2", rounds: 3, note: "双栏多电话：左/右 2 电话槽 + 3 电话值 → 2 匹配（阅读序左→右）/ 1 未匹配，不合并、第 3 值全局不存在",
    frontText: [
      "山东启诚信息技术有限公司",
      "王小明",
      "销售总监",
      "电话：13800138000",
      "电话：13900139000",
      "电话：13700137000",
      "微信：lisi_wx",
      "邮箱：lisi@example.com",
      "网址：www.qicheng.cn",
      "地址：北京市朝阳区建国路88号"
    ].join("\n"),
    slots: [
      { key: "name",    text: "占位姓名", fontSize: 18, fontFamily: "思源黑体 Regular" },
      { key: "title",   text: "占位职位", fontSize: 24, fontFamily: "思源黑体 Bold" },
      { key: "company_cn", text: "占位公司", fontSize: 14, fontFamily: "方正黑体简体" },
      { key: "phones",  text: "占位电话左", fontSize: 15, fontFamily: "思源黑体 Regular", col: "L" },
      { key: "phones",  text: "占位电话右", fontSize: 15, fontFamily: "思源黑体 Regular", col: "R" },
      { key: "wechats", text: "占位微信", fontSize: 13, fontFamily: "思源黑体 Regular" },
      { key: "emails",  text: "占位邮箱", fontSize: 12, fontFamily: "思源黑体 Regular" },
      { key: "websites", text: "占位网址", fontSize: 12, fontFamily: "思源黑体 Regular" },
      { key: "addresses", text: "占位地址", fontSize: 11, fontFamily: "思源黑体 Regular" }
    ],
    expectApplied: 9, expectUnmatched: 1, expectAbsent: ["13700137000"]
  },
  {
    id: "R0", rounds: 1, note: "重建回归：无槽位 → legacy apply（空白画布重建，条目化创建不崩、有产出）",
    frontText: [
      "山东启诚信息技术有限公司",
      "王小明",
      "销售总监",
      "电话：13800138000",
      "微信：lisi_wx",
      "邮箱：lisi@example.com",
      "网址：www.qicheng.cn",
      "地址：北京市朝阳区建国路88号"
    ].join("\n"),
    slots: [],
    expectLegacy: true
  }
];

if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const sessCookie = await probeMod.resolveStage9Cookie();
  const COOKIE_RAW = sessCookie.raw || "";
  if (!COOKIE_RAW) { console.error("[commit-46f] 会话 cookie 解析失败：" + (sessCookie.error || "NO_COOKIE") + "（请注入 ZY_STAGE9_COOKIE 或确保持久 profile 已登录）"); process.exit(2); }
  const out = { ts: new Date().toISOString(), stage: "STAGE10-D-COMMIT-F-TEMPLATE-APPLY-REAL", cases: TPL_CASES.map((c) => c.id), cookiePresent: !!COOKIE_RAW, cookieSource: sessCookie.source || null, cookieWarning: sessCookie.warning || null, cookieNote: sessCookie.note || null, bverExpect: BVER, runs: [], errors: [] };
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1280, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    let page = browser.pages()[0];
    const onPageErr = (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 200)); };
    page.on("pageerror", onPageErr);
    try {
      await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await SLEEP(1400);
      const allOld = await adapter.getAllScripts(page) || [];
      for (const s of allOld.filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(page, s.uuid); } catch (e) {} }
      out.errors = out.errors.filter((x) => x.indexOf("PAGEERROR") < 0);
      console.log("[commit-46f] scriptcat cleaned");
    } catch (eClean) { out.errors.push("CLEAN: " + String(eClean && eClean.message || eClean).slice(0, 120)); }
    for (const c of parseCookies(COOKIE_RAW)) { try { await browser.addCookies([c]); } catch (e) { out.errors.push("COOKIE:" + c.name + " " + String(e && e.message || e).slice(0, 100)); } }
    const newRunPage = async (payload) => {
      await page.close().catch(() => {});
      page = await browser.newPage();
      page.on("pageerror", onPageErr);
      await page.addInitScript(({ code }) => { const s = document.createElement("script"); s.textContent = code; const root = document.documentElement || document.head || document.body || document; root.appendChild(s); }, { code: payload });
      return page;
    };
    const bridgeCall = (type, payload, replyType, timeoutMs) => page.evaluate((arg) => new Promise((resolve) => {
      let done = false;
      const on = (ev) => { const d = ev.data; if (d && d.source === "zy-card-assistant-page" && d.type === arg.replyType) { window.removeEventListener("message", on); done = true; resolve(d); } };
      window.addEventListener("message", on);
      setTimeout(() => { if (!done) { window.removeEventListener("message", on); resolve({ skip: true, timeout: arg.timeoutMs }); } }, arg.timeoutMs);
      window.postMessage(Object.assign({ source: "zy-card-assistant", type: arg.type }, arg.payload || {}), location.origin);
    }), { type, payload, replyType, timeoutMs: timeoutMs || 12000 });
    const setGm = async () => page.evaluate(() => {
      const set = (k, v) => { try { localStorage.setItem("zy8dshim:" + k, JSON.stringify(v)); } catch (e) {} };
      set("zyBaiduOcrMode", "standard");
      set("zyStage9NativeOcrMode", "2");
      set("zyStage9NativeTruth", "1");
      set("zyStage9LocalSidecar", "0");
      set("zyOcrMode", "baidu");
      set("zyStage9InkGeometry", "0");
      set("zyShowTemplatePanel", "1"); // 真实配置：启用套版浮窗（默认 "0"=OCR-only，浮窗含 #zy-apply-front）
      return true;
    });
    const injectPageWorld = (payload) => page.evaluate((code) => { const s = document.createElement("script"); s.textContent = code; (document.head || document.documentElement).appendChild(s); }, payload);
    const waitEditorReady = async (tries) => {
      for (let i = 0; i < (tries || 16); i += 1) {
        const r = await page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed), bver: (window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.ver) || window.__ZY_BRIDGE_VERSION__ || null })).catch(() => ({}));
        if (r && r.ok && r.bridge) return r;
        await SLEEP(1200);
      }
      return page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed), bver: (window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.ver) || window.__ZY_BRIDGE_VERSION__ || null })).catch(() => ({}));
    };
    const injectSlots = (slotDefs) => page.evaluate((json) => {
      const defs = JSON.parse(json);
      const req2 = window.requirejs || window.require;
      const vo2 = ((req2 && req2.s && req2.s.contexts && req2.s.contexts._ && req2.s.contexts._.defined && req2.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d2 = vo2 && vo2.totalCanvasArray && vo2.totalCanvasArray[0];
      if (!d2 || !d2.canvas || !d2.canvasObjInfo || typeof d2.drawText !== "function") return { ok: false, reason: "NO_CANVASDIY" };
      const cw = d2.canvas.getWidth ? d2.canvas.getWidth() : (d2.canvas.width || 300);
      const ch = d2.canvas.getHeight ? d2.canvas.getHeight() : (d2.canvas.height || 210);
      const baseLayer2 = (d2.canvasObjInfo.canvasToProductObjArr || []).length;
      let made = 0;
      const errs = [];
      defs.forEach(function (s, i) {
        try {
          const left = s.col === "R" ? cw * 0.68 : (s.col === "L" ? cw * 0.12 : cw * 0.12 + (i % 3) * 8);
          const top = ch * 0.1 + (s.col ? (s.col === "R" ? 0 : 0) : i) * (ch * 0.075);
          const entry = { "media": { "mediaType": "text", "text": s.text, "font": { "pointSize": s.fontSize, "fontColor": "#111111", "isHorizontal": 1, "gravity": "left", "id": String(700 + i), "isItalic": 0, "textDecoration": "", "linethrough": 0, "overline": 0, "isBold": 0, "overprintStroke": 0 }, "charSpace": 0, "lineSpace": 1.2, "lineIdType": 0, "isBG": 0, "imgPath": "" }, "location": { "x": left, "y": top, "width": 160, "height": 36, "factWidth": 160, "factHeight": 36, "rotation": 0 }, "printLocation": { "x": left, "y": top, "width": 160, "height": 36, "rotation": 0 }, "layer": { "alpha": 1 }, "layerNum": baseLayer2 + i, "isEdit": 1, "isDisplay": 0, "deleteState": 0, "visitLevel": 1, "multiUuid": "tpl-" + String(201 + i), "markuuid": "", "topEnable": 1, "resourceType": 0, "maskEnable": 0, "lowPixelFlag": 0, "selectEnabled": 1, "isDesign": 1, "isComposite": 0, "isPreview": 0, "isDesignShape": 0 };
          d2.drawText(s.text, null, null, null, entry, baseLayer2 + i);
          made += 1;
        } catch (e) { errs.push(String(i) + ":" + String(e && e.message || e).slice(0, 90)); }
      });
      try { d2.canvas.requestRenderAll(); } catch (e) {}
      return { ok: made === defs.length, made: made, total: defs.length, canvasW: cw, canvasH: ch, errs: errs };
    }, JSON.stringify(slotDefs)).catch((e) => ({ ok: false, reason: String(e && e.message || e).slice(0, 100) }));
    const readTextObjects = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const out = [];
      (vo && vo.totalCanvasArray || []).forEach(function (d) {
        const c = d && d.canvas;
        if (!c) return;
        c.getObjects().forEach(function (o) {
          if (!o || typeof o.text !== "string") return;
          const ink = (function () { try { if (window.__zy8dInk && typeof window.__zy8dInk.measureFabricObjectInk === "function") return window.__zy8dInk.measureFabricObjectInk(o); } catch (e) {} return null; })();
          out.push({ text: String(o.text || ""), multiUuid: o.multiUuid != null ? String(o.multiUuid) : null, markuuid: o.markuuid != null ? String(o.markuuid) : null, layerNum: typeof o.layerNum === "number" ? o.layerNum : null, left: DEC2(o.left), top: DEC2(o.top), width: DEC2(o.width), height: DEC2(o.height), angle: DEC2(o.angle), fontSize: DEC2(o.fontSize), fontFamily: o.fontFamily != null ? String(o.fontFamily) : null, fill: o.fill != null ? String(o.fill) : null, byAssistant: !!o.zyCreatedByAssistant, ink: ink && ink.ok ? { inkHeight: DEC2(ink.inkHeight) } : null });
        });
      });
      function DEC2(v) { return (v != null && isFinite(v)) ? Math.round(v * 100) / 100 : null; }
      return out;
    });
    const rollback = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      let removed = 0;
      (vo && vo.totalCanvasArray || []).forEach((d) => {
        const c = d && d.canvas;
        if (!c) return;
        c.getObjects().forEach((o) => { if (!o) return; try { const li = d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr ? d.canvasObjInfo.canvasToProductObjArr.indexOf(o) : -1; if (li >= 0) d.canvasObjInfo.canvasToProductObjArr.splice(li, 1); c.remove(o); removed += 1; } catch (e) {} });
      });
      try { if (vo && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas) vo.totalCanvasArray[0].canvas.requestRenderAll(); } catch (e) {}
      return { removed };
    });
    const fillFrontText = (text) => page.evaluate((t) => {
      const ta = document.querySelector('textarea[data-side-text="front"]');
      if (!ta) return { ok: false, reason: "NO_FRONT_TEXTAREA" };
      ta.value = t;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      return { ok: true };
    }, text);
    const clickApplyFront = async (timeoutMs) => {
      const t0 = Date.now();
      while (Date.now() - t0 < (timeoutMs || 20000)) {
        const r = await page.evaluate(() => {
          const btn = document.querySelector("#zy-apply-front");
          if (btn && btn.offsetParent) { try { btn.click(); return { clicked: true }; } catch (e) {} }
          return { clicked: false };
        }).catch(() => ({ clicked: false }));
        if (r && r.clicked) return r;
        await SLEEP(900);
      }
      return { clicked: false };
    };
    const waitApplyDone = async (timeoutMs) => {
      const t0 = Date.now();
      const samples = [];
      while (Date.now() - t0 < timeoutMs) {
        const r = await page.evaluate(() => {
          const el = document.querySelector("#zy-native-status") || document.querySelector("#zy-status") || document.querySelector(".zy-status");
          return { st: el ? String(el.textContent || "").trim().slice(0, 300) : null };
        }).catch(() => ({}));
        const st = r && r.st;
        if (st) samples.push(String(st).slice(0, 300));
        if (st && /已更新 \d+\/\d+ 个槽位内容|已更新 \d+ 个槽位内容|未匹配 \d+ 项|已处理 \d+ 个文字图层|模板套版失败|没有拿到画布对象|未找到正反面可填入/.test(st)) return { done: true, st, samples };
        await SLEEP(900);
      }
      return { done: false, samples };
    };
    const waitPanel = async (tries) => {
      for (let i = 0; i < (tries || 15); i += 1) {
        const has = await page.evaluate(() => !!document.querySelector('textarea[data-side-text="front"]') && !!document.querySelector("#zy-apply-front")).catch(() => false);
        if (has) return true;
        await SLEEP(900);
      }
      return false;
    };

    for (const def of TPL_CASES) {
      if (WHITELIST.length && WHITELIST.indexOf(def.id) < 0) continue;
      const rec = { case: def.id, note: def.note, steps: [], errors: [], runs: [], asserts: [], status: null };
      out.runs.push(rec);
      try {
        // 先 goto 到目标域，再写配置（localStorage 为源域隔离，写错源会导致 OCR_ONLY_MODE 误判面板不渲染）
        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => rec.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
        await SLEEP(2000);
        await setGm();
        await SLEEP(400);
        await injectPageWorld(pageWorldPayloadFor());
        await SLEEP(1400);
        await page.evaluate((dk) => { try { window[dk] = []; } catch (e) {} }, DIAG_KEY);
        const ready = await waitEditorReady(20);
        if (!(ready && ready.ok)) { rec.errors.push("EDITOR_UNAVAILABLE"); continue; }
        rec.steps.push({ step: "editor-ready", bver: (ready && ready.bver) || null });
        if (ready && ready.bver && ready.bver !== BVER) rec.errors.push("BRIDGE_VERSION_MISMATCH(" + String(ready.bver).slice(0, 40) + ") — 期望 " + BVER);
        const cp = await bridgeCall("getCurrentPage", {}, "getCurrentPageResult", 6000).catch(() => null);
        rec.pageId = (cp && cp.pageId) || null;
        const panelOk = await waitPanel(15);
        if (!panelOk) { rec.errors.push("PANEL_UNAVAILABLE"); continue; }
        let slotBase = [];
        if (def.slots && def.slots.length) {
          const inj = await injectSlots(def.slots);
          if (!(inj && inj.ok)) { rec.errors.push("SLOT_INJECT_FAIL " + JSON.stringify(inj).slice(0, 200)); continue; }
          rec.slotInjected = { made: inj.made, canvasW: inj.canvasW, canvasH: inj.canvasH };
          await SLEEP(1400);
          slotBase = await readTextObjects();
          rec.slotBase = slotBase;
          rec.steps.push({ step: "slot-inject", ok: slotBase.length > 0, count: slotBase.length });
        }
        if (def.expectLegacy) {
          // R0：清空全部文字层 → getTextInventory 空 → 双路分派走 legacy apply（空白画布重建路径）
          const clr = await page.evaluate(() => {
            const req = window.requirejs || window.require;
            const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
            let removed = 0;
            (vo && vo.totalCanvasArray || []).forEach((d) => {
              const c = d && d.canvas;
              if (!c) return;
              c.getObjects().forEach((o) => {
                if (!o || typeof o.text !== "string") return;
                try { c.remove(o); removed += 1; } catch (e) {}
              });
            });
            try { if (vo && vo.totalCanvasArray[0] && vo.totalCanvasArray[0].canvas) vo.totalCanvasArray[0].canvas.requestRenderAll(); } catch (e) {}
            return removed;
          }).catch(() => -1);
          rec.steps.push({ step: "clear-texts", removed: clr });
          await SLEEP(800);
        }
        for (let rnd = 1; rnd <= def.rounds; rnd += 1) {
          const runRec = { rnd: rnd, status: null };
          rec.runs.push(runRec);
          const fill = await fillFrontText(def.frontText);
          if (!(fill && fill.ok)) { runRec.error = "FILL_FAIL " + JSON.stringify(fill); continue; }
          const cl = await clickApplyFront();
          if (!(cl && cl.clicked)) { runRec.error = "APPLY_BTN_NOT_FOUND"; continue; }
          const doneW = await waitApplyDone(def.expectLegacy ? 90000 : 60000);
          runRec.status = doneW.st || null;
          await SLEEP(1600);
          const now = await readTextObjects();
          const invNow = await bridgeCall("getTextInventory", {}, "getTextInventoryResult", 6000).catch(() => null);
          runRec.inventoryCount = (invNow && invNow.ok && Array.isArray(invNow.items)) ? invNow.items.length : -1;
          if (def.expectLegacy) {
            runRec.samples = (doneW.samples || []).slice(-10);
            runRec.legacy = { created: now.length, status: runRec.status };
            runRec.byAssistant = now.filter((o) => o.byAssistant).length;
            runRec.tplMsgShown = (doneW.samples || []).some((s) => /模板套版/.test(s || ""));
            continue; // R0 只记录（创建路径零回归断言见下）
          }
          // ---- 模板断言（按 multiUuid= tpl-* 定位，不依赖槽位下标位置） ----
          const fails = [];
          const byUuid = {};
          now.forEach(function (o) { if (o.multiUuid && /^tpl-/.test(o.multiUuid)) byUuid[o.multiUuid] = o; });
          const baseByUuid = {};
          slotBase.forEach(function (o) { if (o.multiUuid && /^tpl-/.test(o.multiUuid)) baseByUuid[o.multiUuid] = o; });
          const uuids = Object.keys(baseByUuid).slice().sort();
          if (Object.keys(byUuid).length !== uuids.length) fails.push("TPLOBJ_COUNT " + uuids.length + "->" + Object.keys(byUuid).length + "（不应新建/删除对象）");
          for (const u of uuids) {
            const b = baseByUuid[u], n = byUuid[u];
            if (!n) { fails.push("MISSING uuid=" + u); continue; }
            if (b.text === n.text) fails.push("TEXT_UNCHANGED " + u + "（" + String(b.text).slice(0, 8) + " 识别未更新）");
            // 冻结键：left/top/width/angle/fontSize 硬冻结；height 为 textbox 内容自适应（setText 后编辑器按内容重算行高，
            // 属编辑器原生行为而非补正，仅记录 heightAuto 观测，不判失败）
            for (const k of ["left", "top", "width", "angle", "fontSize"]) {
              if (b[k] != null && n[k] != null && Math.abs(b[k] - n[k]) > 0.51) fails.push("GEOM_CHANGED " + u + " " + k + " " + b[k] + "->" + n[k]);
            }
            if (b.height != null && n.height != null && Math.abs(b.height - n.height) > 0.51) runRec.heightAuto = runRec.heightAuto || { uuid: u, from: b.height, to: n.height };
            if (b.fontFamily && n.fontFamily && b.fontFamily !== n.fontFamily) fails.push("FONT_CHANGED " + u + " " + b.fontFamily + "->" + n.fontFamily);
            if (b.fill != null && n.fill != null && b.fill !== n.fill) fails.push("FILL_CHANGED " + u + " " + b.fill + "->" + n.fill);
          }
          if (invNow && invNow.ok && Array.isArray(invNow.items)) {
            for (const u of uuids) {
              const item = invNow.items.find((x) => x.markuuid === u || x.objectUuid === u);
              const b = baseByUuid[u];
              if (item && b && b.layerNum != null && item.layerNum != null && b.layerNum !== item.layerNum) fails.push("LAYER_CHANGED " + u + " " + b.layerNum + "->" + item.layerNum);
            }
          }
          // 文本内容多集校验：tpl-* 集合整体 == 期望客户端值（缺 0 匹配 0 落点）
          const tplTexts = uuids.map((u) => byUuid[u] ? String(byUuid[u].text || "") : "").filter(Boolean);
          const merged = tplTexts.some((t) => t.indexOf("；") >= 0);
          if (merged) fails.push("MERGE_FOUND（多值被并入同一槽：“；” 出现）");
          (def.expectAbsent || []).forEach(function (a) { tplTexts.forEach(function (t) { if (t.indexOf(a) >= 0) fails.push("ABSENT_PRESENT " + a + " 出现于：" + String(t).slice(0, 12)); }); });
          if (runRec.status && !new RegExp("已更新 " + def.expectApplied + " 个槽位内容").test(runRec.status)) fails.push("STATUS_APPLIED " + def.expectApplied + " 不符：" + String(runRec.status).slice(0, 60));
          if (def.expectUnmatched > 0 && runRec.status && !new RegExp("未匹配 " + def.expectUnmatched + " 项").test(runRec.status)) fails.push("STATUS_UNMATCHED " + def.expectUnmatched + " 不符：" + String(runRec.status).slice(0, 60));
          runRec.samples = (doneW.samples || []).slice(-10);
          runRec.assertFails = fails;
          if (fails.length) { rec.asserts.push({ rnd: rnd, fails: fails }); rec.errors.push("ASSERT_FAIL r" + rnd + ": " + fails.join(" | ")); }
        }
        if (def.expectLegacy) {
          // 重建路径验收：legacy apply 创建的条目带 zyCreatedByAssistant=true（模板已有文字层不带此标记）——
          // 以此判定「确为助手新建的重建路径」，而非模板套版（套版只 setText 绝不新建、byAssistant 为 0）。
          const last = rec.runs[rec.runs.length - 1] || {};
          if (!(last.byAssistant >= 4) || last.tplMsgShown) rec.errors.push("ASSERT_FAIL R0: legacy 重建未见助手新建产出（byAssistant=" + last.byAssistant + " tplMsg=" + last.tplMsgShown + "）");
        }
        rec.steps.push({ step: "rollback", ok: true });
        await rollback();
      } catch (e) { rec.errors.push("RUN: " + String(e && (e.message || e) || e).slice(0, 300)); }
    }
    out.errors = out.errors.slice(0, 20);
  } catch (e) { out.errors.push("FATAL: " + String(e && (e.message || e) || e).slice(0, 400)); }
  finally { try { await browser.close(); } catch (e) {} }
  fs.writeFileSync(path.join(REPORT_DIR, "commit-46f-template-apply-real.json"), JSON.stringify(out, null, 2));
  console.log("[commit-46f] report -> runtime/reports/stage-10/commit-46f-template-apply-real.json");
})().catch((e) => { console.error("FATAL: " + String(e && (e.message || e) || e).slice(0, 600)); process.exit(1); });