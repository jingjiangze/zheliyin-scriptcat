// runtime/stage9/commit-46q-front-back-real.js — Stage 10-G L 阶真机验收：正反面（双面）套版填充
// ---------------------------------------------------------------------
// 背景：46p 中 case D「正反面模板」实测 backExists=false（该产品初始 totalCanvasArray 仅 1 页，
//   反面画布懒创建）→ 反面填充路径从未被真机验证。本 runner 先通过 UI「背面」页入口 materialize
//   第二画布（DOM 交互，非坐标点击），再对 front/back 两侧注入槽位，跑完整「一键智能填充 → 确认填充」。
//
// 硬验收（每场景 3 轮）：
//   1. back 画布 materialize 成功（totalCanvasArray.length>=2）且 getTextInventoryAll 返回 back.exists=true
//   2. 正反面槽位数量前后不变（对象不增不减）
//   3. text：匹配到的槽 = 该槽客户值（逐字）；未匹配槽保持注入原值
//   4. 侧向隔离：正面槽新文本不得来自「反面」段客户值，反之亦然（AI 串面必须被抓出）
//   5. 冻结字段 objectUuid/layerNum/fontId/fontFamily/fontSize/fill/left/top/width/angle 两侧 0 fails
//      （height 记 heightDeltas evidence，不判 FAIL：fabric setText 后重算高度 = 平台行为）
//   6. 反面路径必须真实生效：FB1/FB2 至少 1 个 back-* 槽被匹配（BACK_NOT_MATCHED 否则 FAIL）
//
// 凭据：ZY_AI_KEY（硅基流动，仅 env 临时注入，绝不落盘）；会话 cookie 走 session-probe 自动解析。
// 报告：runtime/reports/stage-11/commit-46q-front-back-real.json
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
const REPORT_FILE = path.join(REPORT_DIR, "commit-46q-front-back-real.json");
const adapter = require("../scriptcat-adapter");
const probeMod = require("./session-probe");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const WHITELIST = (process.env.ZY_CASE || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
const MERGE = process.env.ZY_MERGE === "1";
const TRACE_KEY = "__zy46qTrace";
const BVER = "0.3.11.90";
const AI_KEY = process.env.ZY_AI_KEY || "";
const AI_BASE_URL = process.env.ZY_AI_BASE_URL || "https://api.siliconflow.cn/v1";
const AI_MODEL = process.env.ZY_AI_MODEL || "Qwen/Qwen2.5-7B-Instruct";

const FROZEN_KEYS = ["objectUuid", "layerNum", "fontId", "fontFamily", "fontSize", "fill", "left", "top", "width", "angle"];
const FROZEN_LABEL = FROZEN_KEYS.join("+");

function parseCookies(raw) {
  const out = [];
  String(raw || "").split(";").forEach((part) => {
    const eq = part.indexOf("=");
    if (eq <= 0) return;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!name || !value) return;
    out.push({ name: name, value: value.replace(/^"|"$/g, ""), domain: ".diy.zheliyin.com", path: "/", expires: -1 });
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
function pageWorldPayloadFor() {
  const parts = [GM_SHIM_SOURCE];
  const norm = injectUserscript();
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

// 侧向分段（与 userscript splitLinesByMarkers 同语义）
function splitSides(lines) {
  const front = [], back = [];
  let side = "front";
  (lines || []).forEach((ln) => {
    const t = String(ln || "");
    if (/^正面[:：]?$/.test(t)) { side = "front"; return; }
    if (/^(反面|背面)[:：]?$/.test(t)) { side = "back"; return; }
    (side === "back" ? back : front).push(t);
  });
  return { front: front, back: back };
}
// 「标签：值」→ 值（与 AI prompt 规则一致：返回逐字值部分）
function valueOfLine(ln) {
  const t = String(ln || "").trim();
  const m = /^[^：:]{1,8}[：:]\s*(.+)$/.exec(t);
  return String(m ? m[1] : t).trim();
}
const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, "");

// FB 场景：slots=正面注入槽；backSlots=反面注入槽
const FB_CASES = [
  {
    id: "FB1", label: "双面标准（正面4 + 反面3）", rounds: 3,
    slots: [
      { text: "山东启诚信息技术股份", fontSize: 14, fontFamily: "方正黑体简体" },
      { text: "王晓明", fontSize: 18, fontFamily: "思源黑体 Regular" },
      { text: "销售副总监", fontSize: 24, fontFamily: "思源黑体 Bold" },
      { text: "1380 0138 000", fontSize: 15, fontFamily: "思源黑体 Regular" }
    ],
    backSlots: [
      { text: "主营：企业咨询", fontSize: 14, fontFamily: "思源黑体 Regular" },
      { text: "服务热线：400-100", fontSize: 12, fontFamily: "思源黑体 Regular" },
      { text: "地址：建国路89号", fontSize: 11, fontFamily: "思源黑体 Regular" }
    ],
    pasteRows: ["正面：", "山东启诚信息技术有限公司", "王小明", "销售总监", "电话：13800138000",
      "反面：", "主营：企业信息化咨询", "服务热线：400-888-6666", "地址：建国路88号"],
    requireBackMatched: true
  },
  {
    id: "FB2", label: "反面独有类型（正面姓名/职位/手机，反面公司/网址/地址）", rounds: 3,
    slots: [
      { text: "王晓明", fontSize: 22, fontFamily: "思源黑体 Bold" },
      { text: "销售总监", fontSize: 15, fontFamily: "思源黑体 Regular" },
      { text: "1380 0138 000", fontSize: 13, fontFamily: "思源黑体 Regular" }
    ],
    backSlots: [
      { text: "启诚纸业有限公司", fontSize: 16, fontFamily: "方正黑体简体" },
      { text: "www.qdpaper.cn", fontSize: 12, fontFamily: "Arial" },
      { text: "北京市朝阳区建国路89号", fontSize: 11, fontFamily: "思源黑体 Regular" }
    ],
    pasteRows: ["正面：", "姓名：王小明", "职位：销售总监", "电话：13800138000",
      "反面：", "公司：启诚纸业有限公司", "网址：www.qdpaper.cn", "地址：北京市朝阳区建国路88号"],
    requireBackMatched: true
  },
  {
    id: "FB3", label: "侧向隔离反例（客户只有正面内容 → 反面槽不得被填）", rounds: 3,
    slots: [
      { text: "王晓明", fontSize: 22, fontFamily: "思源黑体 Bold" },
      { text: "销售总监", fontSize: 15, fontFamily: "思源黑体 Regular" }
    ],
    backSlots: [
      { text: "电话：1380 0138 000", fontSize: 13, fontFamily: "思源黑体 Regular" },
      { text: "邮箱：wx@qq.com", fontSize: 12, fontFamily: "思源黑体 Regular" }
    ],
    pasteRows: ["正面：", "王小明", "销售总监", "电话：13800138000", "邮箱：wxm@163.com"],
    requireBackMatched: false,
    forbidBackFilled: true
  },
  {
    id: "FB4", label: "反面空槽（反面含空文字层 → 不得误填）", rounds: 3,
    slots: [
      { text: "王晓明", fontSize: 22, fontFamily: "思源黑体 Bold" },
      { text: "销售总监", fontSize: 15, fontFamily: "思源黑体 Regular" }
    ],
    backSlots: [
      { text: " ", fontSize: 15, fontFamily: "思源黑体 Regular" },
      { text: "服务热线：400-100", fontSize: 12, fontFamily: "思源黑体 Regular" }
    ],
    pasteRows: ["正面：", "王小明", "销售总监",
      "反面：", "服务热线：400-888-6666"],
    requireBackMatched: true,
    backEmptySlotIdx: 0
  }
];

function selfTest() {
  const t = (n, c) => { if (!c) throw new Error("SELFTEST FAIL " + n); console.log("[selftest] PASS " + n); };
  const cc = injectUserscript();
  t("cases-4", FB_CASES.length === 4 && FB_CASES.map((c) => c.id).join("") === "FB1FB2FB3FB4");
  t("all-have-back", FB_CASES.every((c) => Array.isArray(c.backSlots) && c.backSlots.length > 0));
  t("rounds-3", FB_CASES.every((c) => (c.rounds || 1) >= 3));
  t("frozen-keys", FROZEN_KEYS.indexOf("objectUuid") >= 0 && FROZEN_KEYS.indexOf("angle") >= 0 && FROZEN_KEYS.indexOf("fontId") >= 0);
  t("split-sides", JSON.stringify(splitSides(["正面：", "a", "反面：", "b"])) === JSON.stringify({ front: ["a"], back: ["b"] }));
  t("value-of-line", valueOfLine("电话：13800138000") === "13800138000" && valueOfLine("王小明") === "王小明");
  t("confirm-ui", cc.indexOf('id="zy-match-block"') >= 0 && cc.indexOf('id="zy-apply-confirm"') >= 0);
  t("bver-const", BVER === "0.3.11.90");
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const sessCookie = await probeMod.resolveStage9Cookie();
  const COOKIE_RAW = sessCookie.raw || "";
  if (!COOKIE_RAW) { console.error("[commit-46q] 会话 cookie 解析失败：" + (sessCookie.error || "NO_COOKIE")); process.exit(2); }
  if (!AI_KEY) { console.error("[commit-46q] 缺少 ZY_AI_KEY 环境变量（仅临时注入，绝不落盘）。"); process.exit(2); }
  let out = { ts: new Date().toISOString(), stage: "STAGE10-G-L9-FRONT-BACK-REAL-ACCEPTANCE", cases: FB_CASES.map((c) => c.id), cookieSource: sessCookie.source || null, aiModel: AI_MODEL, bverExpect: BVER, runs: [], errors: [] };
  if (MERGE && fs.existsSync(REPORT_FILE)) {
    try { const old = JSON.parse(fs.readFileSync(REPORT_FILE, "utf8")); if (old && Array.isArray(old.runs)) { out.runs = old.runs; if (Array.isArray(old.errors)) out.errors = old.errors; } } catch (e) {}
  }
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1280, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    let page = browser.pages()[0];
    page.on("pageerror", (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 200)); });
    await page.addInitScript(({ key }) => {
      const arr = []; window[key] = arr;
      const oF = window.fetch;
      window.fetch = function (input, init) {
        try {
          const url = (typeof input === "string" ? input : (input && input.url)) || "";
          if (url.indexOf("chat/completions") >= 0) {
            let model = null;
            try { model = JSON.parse(String(init && init.body || "{}")).model || null; } catch (e) {}
            arr.push({ url: String(url).slice(-60), model: model, ts: Date.now() });
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
    } catch (eClean) { out.errors.push("CLEAN: " + String(eClean && eClean.message || eClean).slice(0, 120)); }
    for (const c of parseCookies(COOKIE_RAW)) { try { await browser.addCookies([c]); } catch (e) { out.errors.push("COOKIE:" + c.name); } }

    const bridgeCall = (type, payload, replyType, timeoutMs) => page.evaluate((arg) => new Promise((resolve) => {
      let done = false;
      const on = (ev) => { const d = ev.data; if (d && d.source === "zy-card-assistant-page" && d.type === arg.replyType) { window.removeEventListener("message", on); done = true; resolve(d); } };
      window.addEventListener("message", on);
      setTimeout(() => { if (!done) { window.removeEventListener("message", on); resolve({ skip: true, timeout: arg.timeoutMs }); } }, arg.timeoutMs);
      window.postMessage(Object.assign({ source: "zy-card-assistant", type: arg.type }, arg.payload || {}), location.origin);
    }), { type: type, payload: payload, replyType: replyType, timeoutMs: timeoutMs || 12000 });

    const setGm = async () => page.evaluate(({ baseUrl, model, key }) => {
      const set = (k, v) => { try { localStorage.setItem("zy8dshim:" + k, JSON.stringify(v)); } catch (e) {} };
      set("zyBaiduOcrMode", "standard"); set("zyStage9NativeOcrMode", "2"); set("zyStage9NativeTruth", "1"); set("zyStage9LocalSidecar", "0"); set("zyOcrMode", "baidu"); set("zyStage9InkGeometry", "0"); set("zyShowTemplatePanel", "1");
      set("zyArkApiKey", key); set("zyArkBaseUrl", baseUrl); set("zyArkModel", model);
      return true;
    }, { baseUrl: AI_BASE_URL, model: AI_MODEL, key: AI_KEY });

    const injectPageWorld = (payload) => page.evaluate((code) => { const s = document.createElement("script"); s.textContent = code; (document.head || document.documentElement).appendChild(s); }, payload);

    const canvasState = () => page.evaluate(() => {
      try {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const CV = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO || null;
        if (!CV) return { ok: false, reason: "NO_CanvasObjVO" };
        const total = Array.isArray(CV.totalCanvasArray) ? CV.totalCanvasArray : [];
        return { ok: true, count: total.length, currentCanvasNum: CV.currentCanvasNum != null ? CV.currentCanvasNum : null, idNames: total.map((e) => e && e.idName ? String(e.idName) : null) };
      } catch (e) { return { ok: false, reason: String(e && e.message || e).slice(0, 120) }; }
    }).catch((e) => ({ ok: false, reason: String(e && e.message || e).slice(0, 120) }));

    const clickPageSide = async (want, timeoutMs) => {
      const t0 = Date.now();
      while (Date.now() - t0 < (timeoutMs || 20000)) {
        const r = await page.evaluate((w) => {
          const els = Array.from(document.querySelectorAll(".page-group, .pageNum"));
          const hit = els.find((el) => String(el.textContent || "").trim() === w && el.offsetParent);
          if (hit) { try { hit.click(); return { clicked: true, cls: String(hit.className || "").slice(0, 40) }; } catch (e) {} }
          return { clicked: false };
        }, want).catch(() => ({ clicked: false }));
        if (r && r.clicked) return r;
        await SLEEP(700);
      }
      return { clicked: false };
    };
    const waitCanvasCount = async (n, timeoutMs) => {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        const c = await canvasState();
        if (c && c.ok && c.count >= n) return c;
        await SLEEP(900);
      }
      return null;
    };
    const waitEditorReady = async (tries) => {
      for (let i = 0; i < (tries || 20); i += 1) {
        const r = await page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed), bver: (window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.ver) || window.__ZY_BRIDGE_VERSION__ || null })).catch(() => ({}));
        if (r && r.ok && r.bridge) return r;
        await SLEEP(1200);
      }
      return { ok: false };
    };
    const waitPanelReady = async (tries) => {
      for (let i = 0; i < (tries || 15); i += 1) {
        const has = await page.evaluate(() => !!document.querySelector("#zy-raw") && !!document.querySelector("#zy-smart-fill")).catch(() => false);
        if (has) return true;
        await SLEEP(900);
      }
      return false;
    };
    const injectSlotsOn = (canvasIdx, slotDefs, layerBase) => page.evaluate((json) => {
      const arg = JSON.parse(json);
      const req2 = window.requirejs || window.require;
      const vo2 = ((req2 && req2.s && req2.s.contexts && req2.s.contexts._ && req2.s.contexts._.defined && req2.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d2 = vo2 && vo2.totalCanvasArray && vo2.totalCanvasArray[arg.canvasIdx];
      if (!d2 || !d2.canvas || !d2.canvasObjInfo || typeof d2.drawText !== "function") return { ok: false, reason: "NO_CANVAS" };
      const cw = d2.canvas.getWidth ? d2.canvas.getWidth() : (d2.canvas.width || 300);
      const ch = d2.canvas.getHeight ? d2.canvas.getHeight() : (d2.canvas.height || 210);
      const baseLayer2 = (d2.canvasObjInfo.canvasToProductObjArr || []).length;
      let made = 0; const errs = [];
      arg.defs.forEach(function (s, i) {
        try {
          const left = cw * 0.12 + (i % 3) * 8;
          const top = ch * 0.1 + i * (ch * 0.075);
          const entry = { "media": { "mediaType": "text", "text": s.text, "font": { "pointSize": s.fontSize, "fontColor": "#111111", "isHorizontal": 1, "gravity": "left", "id": String(900 + arg.layerBase + i), "isItalic": 0, "textDecoration": "", "linethrough": 0, "overline": 0, "isBold": 0, "overprintStroke": 0 }, "charSpace": 0, "lineSpace": 1.2, "lineIdType": 0, "isBG": 0, "imgPath": "" }, "location": { "x": left, "y": top, "width": 160, "height": 36, "factWidth": 160, "factHeight": 36, "rotation": 0 }, "printLocation": { "x": left, "y": top, "width": 160, "height": 36, "rotation": 0 }, "layer": { "alpha": 1 }, "layerNum": arg.layerBase + baseLayer2 + i, "isEdit": 1, "isDisplay": 0, "deleteState": 0, "visitLevel": 1, "multiUuid": "cplq-" + String(arg.layerBase + 201 + i), "markuuid": "", "topEnable": 1, "resourceType": 0, "maskEnable": 0, "lowPixelFlag": 0, "selectEnabled": 1, "isDesign": 1, "isComposite": 0, "isPreview": 0, "isDesignShape": 0 };
          d2.drawText(s.text, null, null, null, entry, arg.layerBase + baseLayer2 + i);
          made += 1;
        } catch (e) { errs.push(String(i) + ":" + String(e && e.message || e).slice(0, 90)); }
      });
      try { d2.canvas.requestRenderAll(); } catch (e) {}
      return { ok: made === arg.defs.length, made: made, total: arg.defs.length, errs: errs };
    }, JSON.stringify({ canvasIdx: canvasIdx, defs: slotDefs, layerBase: layerBase || 0 })).catch((e) => ({ ok: false, reason: String(e && e.message || e).slice(0, 100) }));

    const readAll = async () => {
      for (let i = 0; i < 3; i += 1) {
        const r = await bridgeCall("getTextInventoryAll", {}, "getTextInventoryAllResult", 8000).catch(() => null);
        if (r && r.front && Array.isArray(r.front.items)) {
          return {
            version: (typeof r.version === "number") ? r.version : null,
            versionCount: (typeof r.versionCount === "number") ? r.versionCount : null,
            multi: !!r.multi,
            current: r.current || null,
            snapshotHash: r.snapshotHash, page: r.page,
            frontItems: r.front.items,
            backItems: (r.back && Array.isArray(r.back.items)) ? r.back.items : [],
            backExists: !!(r.back && r.back.exists),
            invSideCounts: { front: r.count ? r.count.front : 0, back: r.count ? r.count.back : 0 }
          };
        }
        await SLEEP(1200);
      }
      return {};
    };
    const fillRawText = (rawLines) => page.evaluate((t) => { const ta = document.querySelector("#zy-raw"); if (!ta) return { ok: false }; ta.value = t; ta.dispatchEvent(new Event("input", { bubbles: true })); return { ok: true }; }, rawLines.join("\n"));
    const clickById = async (selector, timeoutMs) => {
      const t0 = Date.now();
      while (Date.now() - t0 < (timeoutMs || 15000)) {
        const r = await page.evaluate((sel) => { const el = document.querySelector(sel); if (el && el.offsetParent) { try { el.click(); return { clicked: true }; } catch (e) {} } return { clicked: false }; }, selector).catch(() => ({ clicked: false }));
        if (r && r.clicked) return r;
        await SLEEP(800);
      }
      return { clicked: false };
    };
    const waitStatusContains = async (sub, timeoutMs) => {
      const t0 = Date.now(); const samples = [];
      while (Date.now() - t0 < timeoutMs) {
        const r = await page.evaluate(() => { const el = document.querySelector("#zy-status"); return { st: el ? String(el.textContent || "").trim().slice(0, 1200) : null }; }).catch(() => ({}));
        const st = r && r.st;
        if (st) samples.push(String(st).slice(0, 1200));
        if (st && st.indexOf(sub) >= 0) return { done: true, st: st, samples: samples };
        await SLEEP(900);
      }
      return { done: false, samples: samples };
    };
    const FZ = (it) => {
      const g = (v) => (typeof v === "number" ? Number(v.toFixed(3)) : v);
      const o = {};
      FROZEN_KEYS.forEach((k) => { o[k] = (k === "objectUuid" || k === "fontId" || k === "fontFamily" || k === "fill") ? (it[k] != null ? String(it[k]) : null) : g(it[k]); });
      o.height = g(it.height);
      return o;
    };
    const parseMatchedBySlot = (status) => {
      const map = {};
      String(status || "").split("\n").forEach((ln) => {
        const m = /(front|back)-(\d+)\s*←\s*(.+)$/.exec(ln);
        if (m) map[m[1] + "-" + Number(m[2])] = String(m[3]);
      });
      return map;
    };
    const frozenCompare = (beforeItems, afterItems) => {
      const fb = (beforeItems || []).map(FZ);
      const fa = (afterItems || []).map(FZ);
      const fails = []; const heightDeltas = [];
      for (let i = 0; i < fb.length && i < fa.length; i += 1) {
        for (const k of FROZEN_KEYS) {
          if (JSON.stringify(fb[i][k]) !== JSON.stringify(fa[i][k])) { fails.push("FROZEN[" + i + "]." + k + " " + JSON.stringify(fb[i][k]) + " -> " + JSON.stringify(fa[i][k])); break; }
        }
        const dh = (typeof fa[i].height === "number" && typeof fb[i].height === "number") ? Number((fa[i].height - fb[i].height).toFixed(3)) : null;
        heightDeltas.push(dh);
      }
      return { keys: FROZEN_LABEL, fails: fails, heightDeltas: heightDeltas };
    };

    for (const def of FB_CASES) {
      if (WHITELIST.length && WHITELIST.indexOf(def.id) < 0) continue;
      const existing = out.runs.find((r) => r.case === def.id);
      if (existing && existing.roundsDone >= (def.rounds || 1)) { console.log("[46q] " + def.id + " already done skip"); continue; }
      const rounds = def.rounds || 3;
      const rec = { case: def.id, label: def.label, rounds: rounds, roundsDone: 0, note: "正反面真机验收：UI materialize 反面画布 → 双侧注入槽位 → AI 槽位匹配 → 确认填充 → 双侧全字段冻结 + 侧向隔离", steps: [], errors: [], roundsData: [] };
      if (existing) { const i = out.runs.indexOf(existing); out.runs.splice(i, 1); }
      out.runs.push(rec);
      for (let rd = 0; rd < rounds; rd += 1) {
        const r1 = { round: rd + 1, errors: [] };
        try {
          await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => r1.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
          await SLEEP(6000);
          // 1) UI materialize 反面画布
          const c0 = await canvasState();
          r1.canvasBefore = c0;
          const cb = await clickPageSide("背面", 20000);
          r1.clickBack = cb;
          const cAfterBack = await waitCanvasCount(2, 20000);
          r1.canvasAfterBack = cAfterBack;
          if (!(cb && cb.clicked)) r1.errors.push("CLICK_BACK_FAIL");
          if (!cAfterBack) { r1.errors.push("BACK_CANVAS_NOT_MATERIALIZED"); rec.roundsData.push(r1); rec.roundsDone += 1; continue; }
          const cf = await clickPageSide("正面", 20000);
          r1.clickFront = cf;
          await SLEEP(2500);
          r1.canvasAfterFront = await canvasState();
          // 2) 注入 page world
          await setGm();
          await SLEEP(400);
          await injectPageWorld(pageWorldPayloadFor());
          await SLEEP(1400);
          const ready = await waitEditorReady(20);
          if (!(ready && ready.ok)) { r1.errors.push("EDITOR_UNAVAILABLE"); rec.roundsData.push(r1); rec.roundsDone += 1; continue; }
          if (rd === 0) rec.bver = ready.bver || null;
          if (rd === 0 && ready.bver && ready.bver !== BVER) rec.errors.push("BRIDGE_VERSION_MISMATCH(" + String(ready.bver) + ")");
          if (!(await waitPanelReady(15))) { r1.errors.push("PANEL_UNAVAILABLE"); rec.roundsData.push(r1); rec.roundsDone += 1; continue; }
          // 3) 双侧注入槽位
          const injF = await injectSlotsOn(0, def.slots, 0);
          r1.injFront = injF;
          const injB = await injectSlotsOn(1, def.backSlots, 500);
          r1.injBack = injB;
          await SLEEP(1600);
          if (!(injF && injF.ok)) { r1.errors.push("FRONT_SLOT_INJECT_FAIL " + JSON.stringify(injF).slice(0, 120)); rec.roundsData.push(r1); rec.roundsDone += 1; continue; }
          if (!(injB && injB.ok)) { r1.errors.push("BACK_SLOT_INJECT_FAIL " + JSON.stringify(injB).slice(0, 120)); rec.roundsData.push(r1); rec.roundsDone += 1; continue; }
          // 4) 读双侧快照
          const invB = await readAll();
          r1.before = { frontCount: (invB.frontItems || []).length, frontTexts: (invB.frontItems || []).map((it) => it.text), backCount: (invB.backItems || []).length, backTexts: (invB.backItems || []).map((it) => it.text), backExists: invB.backExists, invSideCounts: invB.invSideCounts || null };
          // P1 诊断：版布局（versionCount / current / conflicts）—— 定位单版场景下 versionCount 异常
          const mvInfoB = await bridgeCall("getMultiVersionInfo", {}, "getMultiVersionInfoResult", 10000).catch(() => null);
          r1.mvInfoBefore = mvInfoB ? { ok: mvInfoB.ok, code: mvInfoB.code, vc: mvInfoB.versionCount, tl: mvInfoB.totalLen, cur: mvInfoB.current, li: mvInfoB.dom && mvInfoB.dom.liCount, conflicts: mvInfoB.conflicts, hard: mvInfoB.hardConflicts } : null;
          if (!invB.backExists) r1.errors.push("BACK_NOT_EXISTS_AFTER_MATERIALIZE");
          if ((invB.frontItems || []).length !== def.slots.length) r1.errors.push("FRONT_INJECT_COUNT " + (invB.frontItems || []).length + " != " + def.slots.length);
          if ((invB.backItems || []).length !== def.backSlots.length) r1.errors.push("BACK_INJECT_COUNT " + (invB.backItems || []).length + " != " + def.backSlots.length);
          r1.snapVersion = { version: invB.version, versionCount: invB.versionCount, multi: invB.multi, current: invB.current };
          if (typeof def.backEmptySlotIdx === "number" && (invB.backItems || [])[def.backEmptySlotIdx]) {
            r1.backEmptySlotBefore = { text: String((invB.backItems || [])[def.backEmptySlotIdx].text), isEmpty: !String((invB.backItems || [])[def.backEmptySlotIdx].text).trim() };
          }
          // 5) 一键智能填充（预览）
          const fill = await fillRawText(def.pasteRows);
          if (!(fill && fill.ok)) { r1.errors.push("FILL_FAIL"); rec.roundsData.push(r1); rec.roundsDone += 1; continue; }
          const cl1 = await clickById("#zy-smart-fill");
          if (!(cl1 && cl1.clicked)) { r1.errors.push("SMART_FILL_BTN_NOT_FOUND"); rec.roundsData.push(r1); rec.roundsDone += 1; continue; }
          const doneP = await waitStatusContains("AI 槽位匹配完成（预览，未修改画布）", 90000);
          r1.preview = { done: !!doneP.done, status: doneP.done ? doneP.st.slice(0, 400) : null };
          const trace = await page.evaluate((k) => window[k] || [], TRACE_KEY).catch(() => []);
          r1.trace = (trace || []).slice(-3);
          const f1 = [];
          if (!doneP.done) f1.push("PREVIEW_NOT_DONE");
          if (!(r1.trace || []).some((x) => x.model && String(x.model) === String(AI_MODEL))) f1.push("AI_CALL_NOT_OBSERVED");
          r1.previewFails = f1;
          if (f1.length) r1.errors.push("ASSERT preview: " + f1.join(" | "));
          const matchedBySlot = parseMatchedBySlot(doneP.st || "");
          r1.matchedBySlot = matchedBySlot;
          if (!doneP.done) { rec.roundsData.push(r1); rec.roundsDone += 1; continue; }
          const backMatched = Object.keys(matchedBySlot).filter((k) => k.indexOf("back-") === 0);
          r1.backMatched = backMatched;
          // 6) 确认填充
          const cl2 = await clickById("#zy-apply-confirm");
          if (!(cl2 && cl2.clicked)) { r1.errors.push("CONFIRM_BTN_NOT_FOUND"); rec.roundsData.push(r1); rec.roundsDone += 1; continue; }
          let doneA = await waitStatusContains("AI 填充完成", 30000);
          if (!doneA.done) {
            await SLEEP(1000);
            const cl2R = await clickById("#zy-apply-confirm", 8000);
            doneA = await waitStatusContains("AI 填充完成", 30000);
            if (cl2R && cl2R.clicked) r1.confirmRetried = true;
          }
          r1.apply = { done: !!doneA.done, status: doneA.done ? doneA.st.slice(0, 300) : null, samples: doneA.done ? undefined : (doneA.samples || []).slice(-3) };
          const mvInfoA = await bridgeCall("getMultiVersionInfo", {}, "getMultiVersionInfoResult", 10000).catch(() => null);
          r1.mvInfoAfterConfirm = mvInfoA ? { ok: mvInfoA.ok, code: mvInfoA.code, vc: mvInfoA.versionCount, tl: mvInfoA.totalLen, cur: mvInfoA.current, conflicts: mvInfoA.conflicts, hard: mvInfoA.hardConflicts } : null;
          await SLEEP(1400);
          // 7) 双侧复核
          const invA = await readAll();
          const fA = invA.frontItems || []; const bA = invA.backItems || [];
          r1.after = { frontCount: fA.length, frontTexts: fA.map((it) => it.text), backCount: bA.length, backTexts: bA.map((it) => it.text), backExists: invA.backExists, snapshotHash: invA.snapshotHash };
          const f2 = [];
          if (!doneA.done) f2.push("APPLY_NOT_DONE");
          if (fA.length !== (invB.frontItems || []).length) f2.push("FRONT_COUNT_CHANGED " + (invB.frontItems || []).length + "->" + fA.length);
          if (bA.length !== (invB.backItems || []).length) f2.push("BACK_COUNT_CHANGED " + (invB.backItems || []).length + "->" + bA.length);
          if (!invA.backExists) f2.push("BACK_NOT_EXISTS_AFTER_APPLY");
          // text 断言（未匹配槽保持注入原值）
          for (let i = 0; i < def.slots.length && i < fA.length; i += 1) {
            const sid = "front-" + (i + 1);
            const want = matchedBySlot[sid] != null ? matchedBySlot[sid] : def.slots[i].text;
            if (String(fA[i].text || "") !== String(want)) { f2.push("FRONT_TEXT_MISMATCH[" + i + "] got " + String(fA[i].text).slice(0, 16) + " want " + String(want).slice(0, 16)); break; }
          }
          for (let j = 0; j < def.backSlots.length && j < bA.length; j += 1) {
            const sid = "back-" + (j + 1);
            if (typeof def.backEmptySlotIdx === "number" && j === def.backEmptySlotIdx) {
              const got = String(bA[j].text || "");
              const want = matchedBySlot[sid] != null ? matchedBySlot[sid] : def.backSlots[j].text;
              if (got.trim() !== "" && String(want || "").trim() !== "") f2.push("BACK_EMPTY_SLOT_FILLED[" + j + "]=" + got.slice(0, 12));
              continue;
            }
            const want = matchedBySlot[sid] != null ? matchedBySlot[sid] : def.backSlots[j].text;
            if (String(bA[j].text || "") !== String(want)) { f2.push("BACK_TEXT_MISMATCH[" + j + "] got " + String(bA[j].text).slice(0, 16) + " want " + String(want).slice(0, 16)); break; }
          }
          // 侧向隔离：正面槽新文本不得来自「反面」段，反之亦然
          const sides = splitSides(def.pasteRows);
          const frontVals = sides.front.map((x) => clean(valueOfLine(x))).filter(Boolean);
          const backVals = sides.back.map((x) => clean(valueOfLine(x))).filter(Boolean);
          for (let i = 0; i < fA.length; i += 1) {
            const t = clean(fA[i].text);
            if (t && backVals.indexOf(t) >= 0 && frontVals.indexOf(t) < 0) { f2.push("SIDE_LEAK_FRONT_HAS_BACK[" + i + "]=" + String(fA[i].text).slice(0, 16)); break; }
          }
          for (let j = 0; j < bA.length; j += 1) {
            const t = clean(bA[j].text);
            if (t && frontVals.indexOf(t) >= 0 && backVals.indexOf(t) < 0) { f2.push("SIDE_LEAK_BACK_HAS_FRONT[" + j + "]=" + String(bA[j].text).slice(0, 16)); break; }
          }
          // FB3：客户无反面内容 → 反面槽必须保持注入原值
          if (def.forbidBackFilled) {
            for (let j = 0; j < def.backSlots.length && j < bA.length; j += 1) {
              if (String(bA[j].text || "") !== String(def.backSlots[j].text)) { f2.push("FORBID_BACK_FILLED[" + j + "]=" + String(bA[j].text).slice(0, 16)); break; }
            }
            if (backMatched.length) f2.push("FORBID_BACK_MATCHED " + backMatched.join(","));
          }
          // 反面路径必须真实生效
          if (def.requireBackMatched && !backMatched.length) f2.push("BACK_NOT_MATCHED");
          // 冻结字段（双侧）
          if (fA.length === (invB.frontItems || []).length) {
            r1.frozenFront = frozenCompare(invB.frontItems, fA);
            if (r1.frozenFront.fails.length) f2.push("FROZEN_FRONT: " + r1.frozenFront.fails.join(" | "));
          }
          if (bA.length === (invB.backItems || []).length) {
            r1.frozenBack = frozenCompare(invB.backItems, bA);
            if (r1.frozenBack.fails.length) f2.push("FROZEN_BACK: " + r1.frozenBack.fails.join(" | "));
          }
          r1.applyFails = f2;
          if (f2.length) r1.errors.push("ASSERT apply: " + f2.join(" | "));
        } catch (e) { r1.errors.push("RUN: " + String(e && (e.message || e) || e).slice(0, 300)); }
        rec.roundsData.push(r1);
        rec.roundsDone += 1;
      }
      rec.passRounds = rec.roundsData.filter((r) => !(r.errors && r.errors.length)).length;
    }
    out.errors = out.errors.slice(0, 30);
  } catch (e) { out.errors.push("FATAL: " + String(e && (e.message || e) || e).slice(0, 400)); }
  finally { try { await browser.close(); } catch (e) {} }
  fs.writeFileSync(REPORT_FILE, JSON.stringify(out, null, 2));
  console.log("[commit-46q] report -> runtime/reports/stage-11/commit-46q-front-back-real.json runs=" + out.runs.length);
})().catch((e) => { console.error("FATAL: " + String(e && (e.message || e) || e).slice(0, 600)); process.exit(1); });
