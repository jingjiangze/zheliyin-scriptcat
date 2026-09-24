// runtime/stage9/commit-46j-ai-models-real.js — Stage 10-G Commit J：硅基流动 key 验证智能套版 + 模型下拉 真机验收
// ---------------------------------------------------------------------
// 目标验证（Commit J 验收）：
//   1. AI-SMART：正 5 槽 + 反 4 槽，粘贴含「正面:/反面:」文本 → 点真实 #zy-smart-fill →
//      env 注入的硅基流动 key 走 AI 正反分类（仅分类不改文本）→ templateApplySmart both →
//      状态必须离开「进行中」（不卡死：J-1 try/catch + 8s 超时兜底在板），text 原文逐字、
//      fontSize 自适应∈[10,160]、lineHeight/charSpacing 不变、对象数恒定；
//   2. MODELS：面板 #zy-model 为下拉（J-2 loadModels GET /models + Bearer）→
//      自动加载 + 点「加载可用模型」→ options≥2 且状态「已加载 N 个可用模型」；
//   3. 版本链：bridge bver === 0.3.11.69（page-bridge stamp 与 @require?v= 同步）。
// 凭据：ZY_AI_KEY（env 临时注入 shim localStorage zy8dshim:zyArkApiKey，绝不写盘/入库/报告全文）、
//   ZY_AI_BASE_URL（默认 https://api.siliconflow.cn/v1）、ZY_AI_MODEL（默认 Qwen/Qwen2.5-7B-Instruct）、
//   ZY_STAGE9_COOKIE（会话）。套版路径不经百度 OCR，无需 AK/SK。
// 报告：runtime/reports/stage-11/commit-46j-ai-models-real.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("../../node_modules/playwright");
const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const EXT_ID = "ndcooeababalnlpkfedmmbbbgkljhpjf";
const USERSCRIPT_PATH = path.join(ROOT, "zheliyin-card-assistant.user.js");
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-11");
const adapter = require("../scriptcat-adapter");
const probeMod = require("./session-probe");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const WHITELIST = (process.env.ZY_CASE || "").split(",").map((s) => s.trim()).filter(Boolean);
const DIAG_KEY = process.env.ZY_DIAG_KEY || "__zyStage9VisualDiag";
const TRACE_KEY = "__zy7AiTrace"; // Commit J: 页面 fetch 拦截取证（只记 url/model，绝不记 Authorization）
const BVER = "0.3.11.69";
// ---- Commit J：AI key 仅经启动环境变量临时注入（绝不写入任何文件/报告全文；报告只记 keyPresent）----
const AI_KEY = process.env.ZY_AI_KEY || "";
const AI_BASE_URL = process.env.ZY_AI_BASE_URL || "https://api.siliconflow.cn/v1";
const AI_MODEL = process.env.ZY_AI_MODEL || "Qwen/Qwen2.5-7B-Instruct";

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
  "if(typeof window.GM_xmlhttpRequest==='undefined'){window.GM_xmlhttpRequest=function(o){var u=o.url||'',m=(o.method||'POST');fetch(u,{method:m,headers:(o.headers||{}),body:o.data}).then(function(res){return res.text().then(function(t){return {status:res.status,responseText:t,response:t,readyState:4,finalUrl:u};});}).then(function(r){if(o.onload)try{o.onload(r);}catch(e){};}).catch(function(e){if(o.onerror)try{o.onerror({status:0,error:String(e&&e.message||e)||'fetch-error',responseText:''});}catch(e2){};});return {abort:function(){}};};}",
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
  const cc = conditionCode();
  const payload = pageWorldPayloadFor();
  t("cases-2", CONTENT_CASES.length === 2 && CONTENT_CASES.map((c) => c.id).join() === "AI-SMART,MODELS");
  t("require-planner", cc.indexOf("content-similar-planner.js?v=" + BVER) >= 0 && cc.indexOf("planContentSimilar") >= 0);
  t("smart-fill-html", cc.indexOf('id="zy-smart-fill"') >= 0 && cc.indexOf('#zy-smart-fill").addEventListener("click", contentApplyFromPanel)') >= 0);
  t("smart-dispatch", cc.indexOf('type: "templateApplySmart", plans: plans, side: "both"') >= 0);
  t("select-model", cc.indexOf('<select class="zy-input" id="zy-model"') >= 0 && cc.indexOf('id="zy-load-models"') >= 0 && cc.indexOf('id="zy-model-status"') >= 0);
  t("load-models-fn", cc.indexOf("async function loadModels(panel)") >= 0 && cc.indexOf('operation: "loadModels"') >= 0 && (cc.match(/\/models/g) || []).length >= 1);
  t("timeout-guard", cc.indexOf("smSmartTimeout") >= 0 && cc.indexOf("setTimeout(function () {") >= 0 && cc.indexOf("8000") >= 0);
  t("bridge-try-catch", payload.indexOf("TEMPLATE_APPLY_SMART_THREW") >= 0 && payload.indexOf("} catch (smErr) {") >= 0);
  t("classify-verbatim", cc.indexOf("绝对禁止修改") >= 0 && cc.indexOf("splitLinesByMarkers") >= 0);
  t("bver-const", BVER === "0.3.11.69");
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

// 场景：AI-SMART（硅基流动 key 走 AI 分类 + 不卡死）+ MODELS（模型下拉加载）。
const CONTENT_CASES = [
  {
    id: "AI-SMART", rounds: 1, note: "AI 分类正反（硅基流动 key, env 注入）+ 内容相似 both 套版：状态离开「进行中」不卡死；正面更新>=3 槽；text 原文逐字 + fontSize 自适应 + lineHeight/charSpacing 不变 + 不新建",
    pasteRows: [
      "正面：",
      "山东启诚信息技术有限公司",
      "Shandong Qicheng Info Tech Co., Ltd.",
      "王小明",
      "销售总监",
      "电话：13800138000",
      "微信：qicheng_wx",
      "网址：www.qicheng.cn",
      "地址：北京市朝阳区建国路88号",
      "反面：",
      "主营范围：企业信息化咨询、软件定制开发服务",
      "企业优势：十年行业深耕经验，服务客户超千家企业，欢迎新老客户合作。"
    ],
    slots: [
      { text: "山东启诚信息技术股份", fontSize: 14, fontFamily: "方正黑体简体" },
      { text: "王晓明", fontSize: 18, fontFamily: "思源黑体 Regular" },
      { text: "销售副总监", fontSize: 24, fontFamily: "思源黑体 Bold" },
      { text: "1380 0138 000", fontSize: 15, fontFamily: "思源黑体 Regular" },
      { text: "北京市朝阳区建国路89号", fontSize: 11, fontFamily: "思源黑体 Regular" }
    ],
    minFrontApplied: 3, expectPossibleFrontTexts: ["山东启诚信息技术有限公司", "王小明", "销售总监", "电话：13800138000", "地址：北京市朝阳区建国路88号"]
  },
  {
    id: "MODELS", rounds: 1, note: "模型下拉：面板 #zy-model 为 select；自动加载 + 点「加载可用模型」→ options>=2 且状态「已加载 N 个可用模型」",
    pasteRows: [], slots: null, none: true, minModelOptions: 2
  }
];

if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const sessCookie = await probeMod.resolveStage9Cookie();
  const COOKIE_RAW = sessCookie.raw || "";
  if (!COOKIE_RAW) { console.error("[commit-46j] 会话 cookie 解析失败：" + (sessCookie.error || "NO_COOKIE")); process.exit(2); }
  if (!AI_KEY) { console.error("[commit-46j] 缺少 ZY_AI_KEY 环境变量（硅基流动 key 仅临时注入，绝不落盘）。"); process.exit(2); }
  const out = { ts: new Date().toISOString(), stage: "STAGE10-G-COMMIT-J-AI-MODELS-REAL", cases: CONTENT_CASES.map((c) => c.id), cookiePresent: !!COOKIE_RAW, cookieSource: sessCookie.source || null, cookieWarning: sessCookie.warning || null, cookieNote: sessCookie.note || null, aiKeyPresent: true, aiBaseUrlHost: (() => { try { return new URL(AI_BASE_URL).host; } catch (e) { return null; } })(), aiModel: AI_MODEL, bverExpect: BVER, runs: [], errors: [] };
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1280, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    let page = browser.pages()[0];
    const onPageErr = (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 200)); };
    page.on("pageerror", onPageErr);
    // Commit J：初始页也安装 fetch 拦截取证（主循环直接 goto 复用该 page）
    await page.addInitScript(({ key }) => {
      const arr = []; window[key] = arr;
      const oF = window.fetch;
      window.fetch = function (input, init) {
        try {
          const url = (typeof input === "string" ? input : (input && input.url)) || "";
          if (url.indexOf("chat/completions") >= 0 || url.indexOf("/models") >= 0) {
            let model = null;
            try { model = JSON.parse(String(init && init.body || "{}")).model || null; } catch (e) {}
            arr.push({ kind: url.indexOf("chat/completions") >= 0 ? "chat" : "models", url: String(url).slice(-70), model: model, ts: Date.now() });
          }
        } catch (e) {}
        return oF.apply(this, arguments);
      };
    }, { key: TRACE_KEY });
    try {
      await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await SLEEP(1400);
      const allOld = await adapter.getAllScripts(page) || [];
      for (const s of allOld.filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(page, s.uuid); } catch (e) {} }
      out.errors = out.errors.filter((x) => x.indexOf("PAGEERROR") < 0);
      console.log("[commit-46j] scriptcat cleaned");
    } catch (eClean) { out.errors.push("CLEAN: " + String(eClean && eClean.message || eClean).slice(0, 120)); }
    for (const c of parseCookies(COOKIE_RAW)) { try { await browser.addCookies([c]); } catch (e) { out.errors.push("COOKIE:" + c.name + " " + String(e && e.message || e).slice(0, 100)); } }
    const newRunPage = async (payload) => {
      await page.close().catch(() => {});
      page = await browser.newPage();
      page.on("pageerror", onPageErr);
      // Commit J：fetch 拦截取证（先于用户脚本安装；只记 chat/completions 与 /models 的 url/model，绝不记请求头）
      await page.addInitScript(({ key }) => {
        const arr = []; window[key] = arr;
        const oF = window.fetch;
        window.fetch = function (input, init) {
          try {
            const url = (typeof input === "string" ? input : (input && input.url)) || "";
            let kind = null;
            if (url.indexOf("chat/completions") >= 0) kind = "chat";
            else if (url.indexOf("/models") >= 0) kind = "models";
            if (kind) {
              let model = null;
              try { model = JSON.parse(String(init && init.body || "{}")).model || null; } catch (e) {}
              arr.push({ kind, url: String(url).slice(-70), model: model, ts: Date.now() });
            }
          } catch (e) {}
          return oF.apply(this, arguments);
        };
      }, { key: TRACE_KEY });
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
    const setGm = async () => page.evaluate(({ key, baseUrl, model }) => {
      const set = (k, v) => { try { localStorage.setItem("zy8dshim:" + k, JSON.stringify(v)); } catch (e) {} };
      set("zyBaiduOcrMode", "standard");
      set("zyStage9NativeOcrMode", "2");
      set("zyStage9NativeTruth", "1");
      set("zyStage9LocalSidecar", "0");
      set("zyOcrMode", "baidu");
      set("zyStage9InkGeometry", "0");
      set("zyShowTemplatePanel", "1");
      // Commit J：AI key/baseUrl/model 仅此处临时注入（shim），不写文件/不入库
      set("zyArkApiKey", key);
      set("zyArkBaseUrl", baseUrl);
      set("zyArkModel", model);
      return true;
    }, { key: AI_KEY, baseUrl: AI_BASE_URL, model: AI_MODEL });
    const injectPageWorld = (payload) => page.evaluate((code) => { const s = document.createElement("script"); s.textContent = code; (document.head || document.documentElement).appendChild(s); }, payload);
    const waitEditorReady = async (tries) => {
      for (let i = 0; i < (tries || 16); i += 1) {
        const r = await page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed), bver: (window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.ver) || window.__ZY_BRIDGE_VERSION__ || null })).catch(() => ({}));
        if (r && r.ok && r.bridge) return r;
        await SLEEP(1200);
      }
      return page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed), bver: (window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.ver) || window.__ZY_BRIDGE_VERSION__ || null })).catch(() => ({}));
    };
    const canvasCountNow = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      return (vo && vo.totalCanvasArray || []).length;
    }).catch(() => 0);
    const injectSlotsOn = (canvasIdx, slotDefs) => page.evaluate((json) => {
      const arg = JSON.parse(json);
      const req2 = window.requirejs || window.require;
      const vo2 = ((req2 && req2.s && req2.s.contexts && req2.s.contexts._ && req2.s.contexts._.defined && req2.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d2 = vo2 && vo2.totalCanvasArray && vo2.totalCanvasArray[arg.canvasIdx];
      if (!d2 || !d2.canvas || !d2.canvasObjInfo || typeof d2.drawText !== "function") return { ok: false, reason: arg.canvasIdx === 1 ? "NO_BACK_CANVAS" : "NO_CANVASDIY", absent: arg.canvasIdx === 1 };
      const cw = d2.canvas.getWidth ? d2.canvas.getWidth() : (d2.canvas.width || 300);
      const ch = d2.canvas.getHeight ? d2.canvas.getHeight() : (d2.canvas.height || 210);
      const baseLayer2 = (d2.canvasObjInfo.canvasToProductObjArr || []).length;
      let made = 0;
      const errs = [];
      arg.defs.forEach(function (s, i) {
        try {
          const left = cw * 0.12 + (i % 3) * 8;
          const top = ch * 0.1 + i * (ch * 0.075);
          const entry = { "media": { "mediaType": "text", "text": s.text, "font": { "pointSize": s.fontSize, "fontColor": "#111111", "isHorizontal": 1, "gravity": "left", "id": String(900 + i), "isItalic": 0, "textDecoration": "", "linethrough": 0, "overline": 0, "isBold": 0, "overprintStroke": 0 }, "charSpace": 0, "lineSpace": 1.2, "lineIdType": 0, "isBG": 0, "imgPath": "" }, "location": { "x": left, "y": top, "width": 160, "height": 36, "factWidth": 160, "factHeight": 36, "rotation": 0 }, "printLocation": { "x": left, "y": top, "width": 160, "height": 36, "rotation": 0 }, "layer": { "alpha": 1 }, "layerNum": baseLayer2 + i, "isEdit": 1, "isDisplay": 0, "deleteState": 0, "visitLevel": 1, "multiUuid": "cpl-" + String(201 + i), "markuuid": "", "topEnable": 1, "resourceType": 0, "maskEnable": 0, "lowPixelFlag": 0, "selectEnabled": 1, "isDesign": 1, "isComposite": 0, "isPreview": 0, "isDesignShape": 0 };
          d2.drawText(s.text, null, null, null, entry, baseLayer2 + i);
          made += 1;
        } catch (e) { errs.push(String(i) + ":" + String(e && e.message || e).slice(0, 90)); }
      });
      try { d2.canvas.requestRenderAll(); } catch (e) {}
      return { ok: made === arg.defs.length, made: made, total: arg.defs.length, errs: errs };
    }, JSON.stringify({ canvasIdx: canvasIdx, defs: slotDefs })).catch((e) => ({ ok: false, reason: String(e && e.message || e).slice(0, 100), absent: canvasIdx === 1 }));
    const invAllNow = () => bridgeCall("getTextInventoryAll", {}, "getTextInventoryAllResult", 8000).catch(() => null);
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
    const fillRawText = (rawLines) => page.evaluate((t) => {
      const ta = document.querySelector("#zy-raw");
      if (!ta) return { ok: false, reason: "NO_RAW_TEXTAREA" };
      ta.value = t;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      return { ok: true };
    }, rawLines.join("\n"));
    const clickSmartFill = async (timeoutMs) => {
      const t0 = Date.now();
      while (Date.now() - t0 < (timeoutMs || 20000)) {
        const r = await page.evaluate(() => {
          const btn = document.querySelector("#zy-smart-fill");
          if (btn && btn.offsetParent) { try { btn.click(); return { clicked: true }; } catch (e) {} }
          return { clicked: false };
        }).catch(() => ({ clicked: false }));
        if (r && r.clicked) return r;
        await SLEEP(900);
      }
      return { clicked: false };
    };
    // Commit J：等待最终态 —— 离开「进行中」即可（成功/失败/超时兜底都算回包，绝不永久卡）
    const waitApplyDone = async (timeoutMs) => {
      const t0 = Date.now();
      const samples = [];
      let sawInProgress = false; let sawAiClassified = false; let sawLocalClassified = false;
      while (Date.now() - t0 < timeoutMs) {
        const r = await page.evaluate(() => {
          const el = document.querySelector("#zy-native-status") || document.querySelector("#zy-status") || document.querySelector(".zy-status");
          return { st: el ? String(el.textContent || "").trim().slice(0, 400) : null };
        }).catch(() => ({}));
        const st = r && r.st;
        if (st) {
          samples.push(String(st).slice(0, 400));
          if (st.indexOf("AI 已分类正反") >= 0) sawAiClassified = true;
          if (st.indexOf("本地标记分类") >= 0) sawLocalClassified = true;
          if (st.indexOf("进行中") >= 0) sawInProgress = true;
        }
        if (st && /智能套版：正面更新 \d+ 槽|智能套版完成|智能套版失败|智能套版执行异常|智能套版部分失败|智能套版未见画布回执|请先粘贴客户文字|画布文字层与智能套版规划不一致/.test(st)) return { done: true, st, samples, sawInProgress, sawAiClassified, sawLocalClassified };
        await SLEEP(900);
      }
      return { done: false, samples, sawInProgress, sawAiClassified, sawLocalClassified };
    };
    const waitPanel = async (tries) => {
      for (let i = 0; i < (tries || 15); i += 1) {
        const has = await page.evaluate(() => !!document.querySelector("#zy-raw") && !!document.querySelector("#zy-smart-fill")).catch(() => false);
        if (has) return true;
        await SLEEP(900);
      }
      return false;
    };
    // Commit J：模型下拉取证（自动加载 + 手动按钮路径）
    const readModelSelect = () => page.evaluate(() => {
      const sel = document.querySelector("#zy-model");
      const statusEl = document.querySelector("#zy-model-status");
      const cur = sel ? sel.value : null;
      return { ok: !!sel, tag: sel ? sel.tagName : null, options: sel ? Array.from(sel.options).map((o) => String(o.value || "")) : [], statusText: statusEl ? String(statusEl.textContent || "").trim() : null, current: cur };
    }).catch(() => ({}));
    const clickLoadModels = async (timeoutMs) => {
      const t0 = Date.now();
      while (Date.now() - t0 < (timeoutMs || 8000)) {
        const r = await page.evaluate(() => {
          const btn = document.querySelector("#zy-load-models");
          if (btn && btn.offsetParent) { try { btn.click(); return { clicked: true }; } catch (e) {} }
          return { clicked: false };
        }).catch(() => ({ clicked: false }));
        if (r && r.clicked) return r;
        await SLEEP(700);
      }
      return { clicked: false };
    };

    for (const def of CONTENT_CASES) {
      if (WHITELIST.length && WHITELIST.indexOf(def.id) < 0) continue;
      const rec = { case: def.id, note: def.note, steps: [], errors: [], runs: [], asserts: [], status: null };
      out.runs.push(rec);
      try {
        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => rec.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
        await SLEEP(2000);
        await setGm();
        await SLEEP(400);
        await injectPageWorld(pageWorldPayloadFor());
        await SLEEP(1400);
        await page.evaluate((dk) => { try { window[dk] = []; } catch (e) {} }, DIAG_KEY);
        const ready = await waitEditorReady(20);
        if (!(ready && ready.ok)) { rec.errors.push("EDITOR_UNAVAILABLE"); continue; }
        rec.bver = (ready && ready.bver) || null;
        if (ready && ready.bver && ready.bver !== BVER) rec.errors.push("BRIDGE_VERSION_MISMATCH(" + String(ready.bver).slice(0, 40) + ")");
        const panelOk = await waitPanel(15);
        if (!panelOk) { rec.errors.push("PANEL_UNAVAILABLE"); continue; }
        if (def.id === "MODELS") {
          // 模型下拉：自动加载（renderPanel 末尾 loadModels）→ 取证 → 点按钮再取证
          let ms1 = await readModelSelect();
          rec.steps.push({ step: "model-select-auto", sample: ms1 });
          await SLEEP(1500);
          ms1 = await readModelSelect();
          rec.steps.push({ step: "model-select-after-wait", sample: ms1 });
          const clicked = await clickLoadModels();
          rec.steps.push({ step: "model-load-clicked", clicked: !!clicked.clicked });
          await SLEEP(2000);
          const ms2 = await readModelSelect();
          rec.steps.push({ step: "model-select-manual", sample: ms2 });
          const fails = [];
          if (!(ms1 && ms1.ok && ms1.tag === "SELECT")) fails.push("NOT_SELECT " + JSON.stringify(ms1).slice(0, 120));
          const minOpts = def.minModelOptions || 2;
          const optsNow = (ms2 && ms2.options) ? ms2.options.length : 0;
          if (optsNow < minOpts) fails.push("OPTIONS " + minOpts + "->" + optsNow);
          const stText = (ms2 && ms2.statusText) || "";
          if (!new RegExp("已加载 \\d+ 个可用模型").test(stText) && !new RegExp("正在加载可用模型").test(stText)) fails.push("STATUS_NOT_LOADED[" + stText.slice(0, 80) + "]");
          if (fails.length) { rec.asserts.push({ fails: fails }); rec.errors.push("ASSERT_FAIL MODELS: " + fails.join(" | ")); }
          rec.steps.push({ step: "done" });
          continue;
        }
        if (def.slots && def.slots.length) {
          const inj = await injectSlotsOn(0, def.slots);
          if (!(inj && inj.ok)) { rec.errors.push("SLOT_INJECT_FAIL " + JSON.stringify(inj).slice(0, 200)); continue; }
          await SLEEP(1400);
        }
        const baseInv = await invAllNow();
        rec.baseCount = { front: (baseInv && baseInv.front && baseInv.front.items) ? baseInv.front.items.length : 0, back: (baseInv && baseInv.back && baseInv.back.items) ? baseInv.back.items.length : 0 };
        for (let rnd = 1; rnd <= def.rounds; rnd += 1) {
          const runRec = { rnd: rnd, status: null };
          rec.runs.push(runRec);
          const fill = await fillRawText(def.pasteRows);
          if (!(fill && fill.ok)) { runRec.error = "FILL_FAIL " + JSON.stringify(fill); continue; }
          const cl = await clickSmartFill();
          if (!(cl && cl.clicked)) { runRec.error = "BTN_NOT_FOUND"; continue; }
          const doneW = await waitApplyDone(75000);
          runRec.status = doneW.st || null;
          runRec.samples = (doneW.samples || []).slice(-10);
          runRec.sawInProgress = doneW.sawInProgress;
          runRec.sawAiClassified = doneW.sawAiClassified;
          runRec.sawLocalClassified = doneW.sawLocalClassified;
          if (!doneW.done) { rec.errors.push("STUCK: 60s+ 未离开「进行中」，无回包（J-1 兜底应提示「未见画布回执」）"); runRec.stuck = true; continue; }
          await SLEEP(1600);
          const trace = await page.evaluate((k) => window[k] || [], TRACE_KEY).catch(() => []);
          runRec.trace = (trace || []).slice(0, 8);
          const invNow = await invAllNow();
          const front = (invNow && invNow.front && invNow.front.items) || [];
          runRec.frontCount = front.length;
          runRec.invFront = front;
          const fails = [];
          // 对象数恒等（绝不新建/删除）
          if (front.length !== (def.slots || []).length) fails.push("COUNT " + (def.slots || []).length + "->" + front.length);
          // 原文逐字：正面任一槽匹配客户原文行即可（AI 分类可能把"Shandong..."分到反面），全部槽必须是原文行
          const expectSet = def.expectPossibleFrontTexts || [];
          for (let i = 0; i < front.length; i += 1) {
            const it = front[i];
            if (expectSet.indexOf(String(it.text)) < 0) fails.push("TEXT@" + i + " 非客户端原文 [" + String(it.text).slice(0, 24) + "]");
            if (!(it.fontSize >= 10 && it.fontSize <= 160)) fails.push("FONT_SIZE@" + i + " 越界 " + it.fontSize);
          }
          // lineHeight/charSpacing 只取证不改（对比注入前快照）
          const bf = (baseInv && baseInv.front && baseInv.front.items) || [];
          for (let i = 0; i < front.length && i < bf.length; i += 1) {
            const b = bf[i], it = front[i];
            if (b && it && it.lineHeight != null && b.lineHeight != null && Math.abs(it.lineHeight - b.lineHeight) > 0.0001) fails.push("LINE_HEIGHT_CHANGED@" + i + " " + b.lineHeight + "->" + it.lineHeight);
            if (b && it && it.charSpacing != null && b.charSpacing != null && Math.abs(it.charSpacing - b.charSpacing) > 0.0001) fails.push("CHAR_SPACING_CHANGED@" + i + " " + b.charSpacing + "->" + it.charSpacing);
          }
          // 不卡死 + 至少更新 minFrontApplied 槽（宽松：状态含「正面更新 X 槽」且 X>=min）
          if (!runRec.status || !/智能套版/.test(runRec.status)) fails.push("STATUS_FINAL[" + String(runRec.status || "").slice(0, 80) + "]");
          const ap = /正面更新 (\d+) 槽/.exec(runRec.status || "");
          if (ap && Number(ap[1]) < (def.minFrontApplied || 3)) fails.push("APPLIED < " + (def.minFrontApplied || 3) + " got " + ap[1]);
          // Commit J 铁证：AI 分类调用确实发出（chat/completions 且 model===AI_MODEL）
          const traceChat = (trace || []).filter((x) => x.kind === "chat");
          const aiCallOk = traceChat.some((x) => x.model && String(x.model) === String(AI_MODEL));
          runRec.aiCallOk = aiCallOk;
          runRec.aiCallModels = [...new Set(traceChat.map((x) => x.model).filter(Boolean))];
          if (!aiCallOk) fails.push("AI_CALL_NOT_OBSERVED(model=" + AI_MODEL + " trace=" + JSON.stringify((trace || []).map((x) => x.kind + ":" + (x.model || "?")).slice(0, 6)) + ")");
          if (!fails.length && runRec.sawInProgress && runRec.sawAiClassified) rec.aiClassifiedOk = true;
          runRec.assertFails = fails;
          if (fails.length) { rec.asserts.push({ rnd: rnd, fails: fails }); rec.errors.push("ASSERT_FAIL r" + rnd + ": " + fails.join(" | ")); }
        }
        rec.steps.push({ step: "rollback", ok: true });
        await rollback();
      } catch (e) { rec.errors.push("RUN: " + String(e && (e.message || e) || e).slice(0, 300)); }
    }
    out.errors = out.errors.slice(0, 20);
  } catch (e) { out.errors.push("FATAL: " + String(e && (e.message || e) || e).slice(0, 400)); }
  finally { try { await browser.close(); } catch (e) {} }
  fs.writeFileSync(path.join(REPORT_DIR, "commit-46j-ai-models-real.json"), JSON.stringify(out, null, 2));
  console.log("[commit-46j] report -> runtime/reports/stage-11/commit-46j-ai-models-real.json");
})().catch((e) => { console.error("FATAL: " + String(e && (e.message || e) || e).slice(0, 600)); process.exit(1); });