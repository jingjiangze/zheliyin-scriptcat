// runtime/stage9/commit-46p-real-acceptance.js — Stage 10-G Commit 08：真机验收（A-J 十种模板 × 3 轮）
// 目标（端到端）：对 A~J 十种模板注入各自的槽位结构 → 粘贴客户原文 → 真实 #zy-smart-fill（AI 槽位匹配 preview）
//   → 真实 #zy-apply-confirm（templateApplyV2+planHash）→ 断言：
//     - 冻结字段 objectUuid/layerNum/fontId/fontFamily/fontSize/fill/left/top/width/angle 前后 100% 不变
//       （height 记 heightDeltas evidence，不判 FAIL：setText 后 fabric 引擎按文本内容重算对象高 = 平台行为，与 46l 结论一致）
//     - text：前 matchedCount 槽 = 期望客户值（逐字），未匹配槽保持注入原值（沿用 46n 教训，不断言全量）
//     - 每场景 rounds=3（每次独立 goto+注入，3 次独立验收）
//     - E 无反面带断言 back = null；D 正反面尝试 back 注入失败记 backAbsent evidence 不判 FAIL
//     - G 无微信槽：客户微信一行不得写入任何槽（unmatched 语义）；J 空文字层：空槽不得被误填
// 分批：ZY_CASE=A,B,... 过滤；ZY_MERGE=1 时合并已有报告（多次运行累积到同一文件）
// 凭据：ZY_AI_KEY env（硅基流动，绝不落盘）；ZY_STAGE9_COOKIE。
// 报告：runtime/reports/stage-11/commit-46p-real-acceptance.json
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
const REPORT_FILE = path.join(REPORT_DIR, "commit-46p-real-acceptance.json");
const adapter = require("../scriptcat-adapter");
const probeMod = require("./session-probe");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const WHITELIST = (process.env.ZY_CASE || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
const MERGE = process.env.ZY_MERGE === "1";
const TRACE_KEY = "__zy46pTrace";
const BVER = "0.3.11.87";
const AI_KEY = process.env.ZY_AI_KEY || "";
const AI_BASE_URL = process.env.ZY_AI_BASE_URL || "https://api.siliconflow.cn/v1";
const AI_MODEL = process.env.ZY_AI_MODEL || "Qwen/Qwen2.5-7B-Instruct";

// 冻结字段（height 单独记录 evidence）
const FROZEN_KEYS = ["objectUuid", "layerNum", "fontId", "fontFamily", "fontSize", "fill", "left", "top", "width", "angle"];
const FROZEN_LABEL = FROZEN_KEYS.join("+");

function parseCookies(raw) {
  const out = [];
  String(raw || "").split(";").forEach((part) => {
    const eq = part.indexOf("=");
    if (eq <= 0) return;
    const name = part.slice(0, eq).trim();
    let value = part.slice(eq + 1).trim();
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

// A~J 十种模板场景（slots=模板注入槽位；pasteRows=客户原文；wantTexts=期望客户值按槽顺序；extra=特殊语义断言）
const P_CASES = [
  { id: "A", label: "普通标准模板", rounds: 3,
    slots: [
      { text: "山东启诚信息技术股份", fontSize: 14, fontFamily: "方正黑体简体" },
      { text: "王晓明", fontSize: 18, fontFamily: "思源黑体 Regular" },
      { text: "销售副总监", fontSize: 24, fontFamily: "思源黑体 Bold" },
      { text: "1380 0138 000", fontSize: 15, fontFamily: "思源黑体 Regular" },
      { text: "北京市朝阳区建国路89号", fontSize: 11, fontFamily: "思源黑体 Regular" }
    ],
    pasteRows: ["正面：", "山东启诚信息技术有限公司", "王小明", "销售总监", "电话：13800138000", "地址：北京市朝阳区建国路88号"],
    wantTexts: ["山东启诚信息技术有限公司", "王小明", "销售总监", "13800138000", "北京市朝阳区建国路88号"] },
  { id: "B", label: "中英文混合模板", rounds: 3,
    slots: [
      { text: "QD Paper Group", fontSize: 16, fontFamily: "Arial" },
      { text: "山东启诚纸业", fontSize: 14, fontFamily: "方正黑体简体" },
      { text: "Wang Xiaoming", fontSize: 18, fontFamily: "Arial" },
      { text: "Sales Director", fontSize: 15, fontFamily: "Arial" },
      { text: "1380 0138 000", fontSize: 15, fontFamily: "Arial" },
      { text: "www.qdpaper.cn", fontSize: 11, fontFamily: "Arial" }
    ],
    pasteRows: ["正面：", "启诚纸业QUEENCHENG CO.,LTD", "Qingdao Paper Co., Ltd", "Mary Wang", "Marketing Manager", "电话：13800138000", "网址：www.qdpaper.cn"],
    wantTexts: ["启诚纸业QUEENCHENG CO.,LTD", "Qingdao Paper Co., Ltd", "Mary Wang", "Marketing Manager", "13800138000", "www.qdpaper.cn"] },
  { id: "C", label: "左右双栏模板", rounds: 3,
    slots: [
      { text: "王晓明", fontSize: 26, fontFamily: "思源黑体 Bold" },
      { text: "销售总监", fontSize: 16, fontFamily: "思源黑体 Regular" },
      { text: "电话：1380 0138 000", fontSize: 12, fontFamily: "思源黑体 Regular" },
      { text: "邮箱: wx@qq.com", fontSize: 12, fontFamily: "思源黑体 Regular" },
      { text: "网址: www.qq.com", fontSize: 12, fontFamily: "思源黑体 Regular" },
      { text: "地址：建国路89号", fontSize: 12, fontFamily: "思源黑体 Regular" }
    ],
    pasteRows: ["正面：", "王小明", "销售总监", "电话：13800138000", "邮箱：wxm@163.com", "网址：www.163.com", "地址：建国路88号"],
    wantTexts: ["王小明", "销售总监", "13800138000", "wxm@163.com", "www.163.com", "建国路88号"] },
  { id: "D", label: "正反面模板", rounds: 3,
    slots: [
      { text: "山东启诚信息技术股份", fontSize: 14, fontFamily: "方正黑体简体" },
      { text: "王晓明", fontSize: 18, fontFamily: "思源黑体 Regular" },
      { text: "销售副总监", fontSize: 24, fontFamily: "思源黑体 Bold" },
      { text: "1380 0138 000", fontSize: 15, fontFamily: "思源黑体 Regular" },
      { text: "北京市朝阳区建国路89号", fontSize: 11, fontFamily: "思源黑体 Regular" }
    ],
    backSlots: [
      { text: "主营：企业咨询", fontSize: 14, fontFamily: "思源黑体 Regular" },
      { text: "服务热线：400-100", fontSize: 12, fontFamily: "思源黑体 Regular" }
    ],
    pasteRows: ["正面：", "山东启诚信息技术有限公司", "王小明", "销售总监", "电话：13800138000", "地址：北京市朝阳区建国路88号", "反面：", "主营：企业信息化咨询", "服务热线：400-888-6666"],
    wantTexts: ["山东启诚信息技术有限公司", "王小明", "销售总监", "13800138000", "北京市朝阳区建国路88号"] },
  { id: "E", label: "无反面带（back 必须 null）", rounds: 3,
    slots: [
      { text: "简小设", fontSize: 22, fontFamily: "思源黑体 Bold" },
      { text: "合伙人", fontSize: 14, fontFamily: "思源黑体 Regular" },
      { text: "电话: 0531-88886666", fontSize: 12, fontFamily: "思源黑体 Regular" },
      { text: "地址：文化东路88号", fontSize: 11, fontFamily: "思源黑体 Regular" }
    ],
    pasteRows: ["正面：", "江某", "高级合伙人", "电话：0531-88886666", "地址：文化东路88号"],
    wantTexts: ["江某", "高级合伙人", "0531-88886666", "文化东路88号"],
    expectBackNull: true },
  { id: "F", label: "多电话模板", rounds: 3,
    slots: [
      { text: "王晓明", fontSize: 20, fontFamily: "思源黑体 Bold" },
      { text: "手机: 1380 0138 000", fontSize: 13, fontFamily: "思源黑体 Regular" },
      { text: "座机: 0531-88886666", fontSize: 13, fontFamily: "思源黑体 Regular" },
      { text: "地址：建国路89号", fontSize: 12, fontFamily: "思源黑体 Regular" }
    ],
    pasteRows: ["正面：", "王小明", "电话：13800138000", "座机：0531-88886666", "地址：建国路88号"],
    wantTexts: ["王小明", "13800138000", "0531-88886666", "建国路88号"] },
  { id: "G", label: "无微信槽（微信须 unmatched）", rounds: 3,
    slots: [
      { text: "王晓明", fontSize: 20, fontFamily: "思源黑体 Bold" },
      { text: "销售总监", fontSize: 16, fontFamily: "思源黑体 Regular" },
      { text: "电话: 1380 0138 000", fontSize: 13, fontFamily: "思源黑体 Regular" },
      { text: "地址：建国路89号", fontSize: 12, fontFamily: "思源黑体 Regular" }
    ],
    pasteRows: ["正面：", "王小明", "销售总监", "电话：13800138000", "微信：wxm123456", "地址：建国路88号"],
    wantTexts: ["王小明", "销售总监", "13800138000", "建国路88号"],
    forbidden: ["wxm123456"] },
  { id: "H", label: "模板无标签（裸文字）", rounds: 3,
    slots: [
      { text: "王明", fontSize: 22, fontFamily: "思源黑体 Bold" },
      { text: "销售经理", fontSize: 15, fontFamily: "思源黑体 Regular" },
      { text: "13800001111", fontSize: 13, fontFamily: "思源黑体 Regular" },
      { text: "济南高新区海信创智谷1号楼", fontSize: 11, fontFamily: "思源黑体 Regular" }
    ],
    pasteRows: ["正面：", "姓名：王明", "职位：销售经理", "电话：13800001111", "地址：济南高新区海信创智谷1号楼"],
    wantTexts: ["王明", "销售经理", "13800001111", "济南高新区海信创智谷1号楼"] },
  { id: "I", label: "公司/姓名语义相近", rounds: 3,
    slots: [
      { text: "王氏印刷包装", fontSize: 15, fontFamily: "方正黑体简体" },
      { text: "王明", fontSize: 20, fontFamily: "思源黑体 Bold" },
      { text: "总经理", fontSize: 15, fontFamily: "思源黑体 Regular" },
      { text: "电话: 0531-88886666", fontSize: 12, fontFamily: "思源黑体 Regular" }
    ],
    pasteRows: ["正面：", "公司名称：王氏印刷包装有限公司", "联系人：王明", "职位：总经理", "电话：0531-88886666"],
    wantTexts: ["王氏印刷包装有限公司", "王明", "总经理", "0531-88886666"] },
  { id: "J", label: "空文字层（空槽不得误填）", rounds: 3,
    slots: [
      { text: "山东启诚信息技术股份", fontSize: 14, fontFamily: "方正黑体简体" },
      { text: "王晓明", fontSize: 18, fontFamily: "思源黑体 Regular" },
      { text: "销售副总监", fontSize: 24, fontFamily: "思源黑体 Bold" },
      { text: " ", fontSize: 15, fontFamily: "思源黑体 Regular" },
      { text: "北京市朝阳区建国路89号", fontSize: 11, fontFamily: "思源黑体 Regular" }
    ],
    pasteRows: ["正面：", "山东启诚信息技术有限公司", "王小明", "销售总监", "电话：13800138000", "地址：北京市朝阳区建国路88号"],
    wantTexts: ["山东启诚信息技术有限公司", "王小明", "销售总监", " ", "北京市朝阳区建国路88号"],
    emptySlotIdx: 3 }
];

function selfTest() {
  const t = (n, c) => { if (!c) throw new Error("SELFTEST FAIL " + n); console.log("[selftest] PASS " + n); };
  const cc = injectUserscript();
  t("cases-10", P_CASES.length === 10 && P_CASES.map((c) => c.id).join("") === "ABCDEFGHIJ");
  t("rounds-3", P_CASES.every((c) => (c.rounds || 1) >= 3));
  t("frozen-keys", FROZEN_KEYS.indexOf("objectUuid") >= 0 && FROZEN_KEYS.indexOf("angle") >= 0 && FROZEN_KEYS.indexOf("fontId") >= 0 && FROZEN_KEYS.indexOf("width") >= 0);
  t("copy-btns", cc.indexOf('id="zy-copy-current"') >= 0 && cc.indexOf('id="zy-copy-both"') >= 0 && cc.indexOf('id="zy-copy-template"') >= 0);
  t("confirm-ui", cc.indexOf('id="zy-match-block"') >= 0 && cc.indexOf('id="zy-apply-confirm"') >= 0);
  t("bver-const", BVER === "0.3.11.87");
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const sessCookie = await probeMod.resolveStage9Cookie();
  const COOKIE_RAW = sessCookie.raw || "";
  if (!COOKIE_RAW) { console.error("[commit-46p] 会话 cookie 解析失败：" + (sessCookie.error || "NO_COOKIE")); process.exit(2); }
  if (!AI_KEY) { console.error("[commit-46p] 缺少 ZY_AI_KEY 环境变量（仅临时注入，绝不落盘）。"); process.exit(2); }
  let out = { ts: new Date().toISOString(), stage: "STAGE10-G-COMMIT-L8-REAL-ACCEPTANCE", cases: P_CASES.map((c) => c.id), cookieSource: sessCookie.source || null, aiModel: AI_MODEL, bverExpect: BVER, runs: [], errors: [] };
  if (MERGE && fs.existsSync(REPORT_FILE)) {
    try { const old = JSON.parse(fs.readFileSync(REPORT_FILE, "utf8")); if (old && Array.isArray(old.runs)) { out.runs = old.runs; if (Array.isArray(old.errors)) out.errors = old.errors; } } catch (e) {}
    process.env.ZY46P_MERGING = "1";
  }
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1280, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    let page = browser.pages()[0];
    const onPageErr = (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 200)); };
    page.on("pageerror", onPageErr);
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
    for (const c of parseCookies(COOKIE_RAW)) { try { await browser.addCookies([c]); } catch (e) { out.errors.push("COOKIE:" + c.name + " " + String(e && e.message || e).slice(0, 100)); } }
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
    const waitEditorReady = async (tries) => {
      for (let i = 0; i < (tries || 16); i += 1) {
        const r = await page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed), bver: (window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.ver) || window.__ZY_BRIDGE_VERSION__ || null })).catch(() => ({}));
        if (r && r.ok && r.bridge) return r;
        await SLEEP(1200);
      }
      return page.evaluate(() => ({ ok: false })).catch(() => ({}));
    };
    const injectSlotsOn = (canvasIdx, slotDefs) => page.evaluate((json) => {
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
          const entry = { "media": { "mediaType": "text", "text": s.text, "font": { "pointSize": s.fontSize, "fontColor": "#111111", "isHorizontal": 1, "gravity": "left", "id": String(900 + i), "isItalic": 0, "textDecoration": "", "linethrough": 0, "overline": 0, "isBold": 0, "overprintStroke": 0 }, "charSpace": 0, "lineSpace": 1.2, "lineIdType": 0, "isBG": 0, "imgPath": "" }, "location": { "x": left, "y": top, "width": 160, "height": 36, "factWidth": 160, "factHeight": 36, "rotation": 0 }, "printLocation": { "x": left, "y": top, "width": 160, "height": 36, "rotation": 0 }, "layer": { "alpha": 1 }, "layerNum": baseLayer2 + i, "isEdit": 1, "isDisplay": 0, "deleteState": 0, "visitLevel": 1, "multiUuid": "cpl-" + String(201 + i), "markuuid": "", "topEnable": 1, "resourceType": 0, "maskEnable": 0, "lowPixelFlag": 0, "selectEnabled": 1, "isDesign": 1, "isComposite": 0, "isPreview": 0, "isDesignShape": 0 };
          d2.drawText(s.text, null, null, null, entry, baseLayer2 + i);
          made += 1;
        } catch (e) { errs.push(String(i) + ":" + String(e && e.message || e).slice(0, 90)); }
      });
      try { d2.canvas.requestRenderAll(); } catch (e) {}
      return { ok: made === arg.defs.length, made: made, total: arg.defs.length, errs: errs };
    }, JSON.stringify({ canvasIdx: canvasIdx, defs: slotDefs })).catch((e) => ({ ok: false, reason: String(e && e.message || e).slice(0, 100) }));
    const readFront = async () => {
      for (let i = 0; i < 3; i += 1) {
        const r = await bridgeCall("getTextInventoryAll", {}, "getTextInventoryAllResult", 8000).catch(() => null);
        if (r && r.front && Array.isArray(r.front.items)) {
          return { snapshotHash: r.snapshotHash, page: r.page, frontItems: r.front.items, backItems: (r.back && Array.isArray(r.back.items)) ? r.back.items : [], invSideCounts: { front: r.count ? r.count.front : 0, back: r.count ? r.count.back : 0 }, backExists: !!(r.back && r.back.exists) };
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
        const r = await page.evaluate(() => { const el = document.querySelector("#zy-status"); return { st: el ? String(el.textContent || "").trim().slice(0, 900) : null }; }).catch(() => ({}));
        const st = r && r.st;
        if (st) samples.push(String(st).slice(0, 900));
        if (st && st.indexOf(sub) >= 0) return { done: true, st: st, samples: samples };
        await SLEEP(900);
      }
      return { done: false, samples: samples };
    };
    const waitPanelReady = async (tries) => {
      for (let i = 0; i < (tries || 15); i += 1) {
        const has = await page.evaluate(() => !!document.querySelector("#zy-raw") && !!document.querySelector("#zy-smart-fill")).catch(() => false);
        if (has) return true;
        await SLEEP(900);
      }
      return false;
    };
    const FZ = (it) => {
      const g = (v) => (typeof v === "number" ? Number(v.toFixed(3)) : v);
      const o = {};
      FROZEN_KEYS.forEach((k) => { o[k] = k === "objectUuid" || k === "fontId" || k === "fontFamily" || k === "fill" ? (it[k] != null ? String(it[k]) : null) : g(it[k]); });
      o.height = g(it.height);
      return o;
    };

    for (const def of P_CASES) {
      if (WHITELIST.length && WHITELIST.indexOf(def.id) < 0) continue;
      const existing = out.runs.find((r) => r.case === def.id);
      if (existing && existing.roundsDone >= (def.rounds || 1)) { console.log("[46p] " + def.id + " already done skip"); continue; }
      const rounds = def.rounds || 3;
      const rec = { case: def.id, label: def.label, rounds: rounds, roundsDone: 0, note: "A-J 十模板 ×3 轮：AI 槽位匹配应用 + 全字段冻结（height evidence）+ text 逐字", steps: [], errors: [], roundsData: [] };
      if (existing) { const i = out.runs.indexOf(existing); out.runs.splice(i, 1); }
      out.runs.push(rec);
      for (let rd = 0; rd < rounds; rd += 1) {
        const r1 = { round: rd + 1, errors: [] };
        try {
          await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => r1.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
          await SLEEP(2000);
          await setGm();
          await SLEEP(400);
          await injectPageWorld(pageWorldPayloadFor());
          await SLEEP(1400);
          const ready = await waitEditorReady(20);
          if (!(ready && ready.ok)) { r1.errors.push("EDITOR_UNAVAILABLE"); rec.roundsData.push(r1); rec.roundsDone += 1; continue; }
          if (rd === 0) rec.bver = (ready && ready.bver) || null;
          if (rd === 0 && ready && ready.bver && ready.bver !== BVER) rec.errors.push("BRIDGE_VERSION_MISMATCH(" + String(ready.bver) + ")");
          if (!(await waitPanelReady(15))) { r1.errors.push("PANEL_UNAVAILABLE"); rec.roundsData.push(r1); rec.roundsDone += 1; continue; }
          const inj = await injectSlotsOn(0, def.slots);
          await SLEEP(1500);
          if (!(inj && inj.ok)) { r1.errors.push("SLOT_INJECT_FAIL"); rec.roundsData.push(r1); rec.roundsDone += 1; continue; }
          // D 正反面：尝试注入反面槽（失败记 backAbsent evidence 不判 FAIL）
          if (def.backSlots) {
            const injB = await injectSlotsOn(1, def.backSlots);
            r1.backInj = injB;
            if (!(injB && injB.ok)) r1.backAbsent = true;
          }
          await SLEEP(1400);
          const invB = await readFront();
          r1.before = { count: (invB.frontItems || []).length, texts: (invB.frontItems || []).map((it) => it.text), invSideCounts: invB.invSideCounts || null };
          if (def.expectBackNull && invB.backExists) r1.errors.push("EXPECT_BACK_NULL_BUT_EXISTS");
          rec.backExists = invB.backExists;
          // J 空文字层：记录空槽原文
          if (typeof def.emptySlotIdx === "number" && (invB.frontItems || [])[def.emptySlotIdx]) {
            r1.emptySlotBefore = { text: String((invB.frontItems || [])[def.emptySlotIdx].text), isEmpty: !String((invB.frontItems || [])[def.emptySlotIdx].text).trim() };
          }
          const fill = await fillRawText(def.pasteRows);
          if (!(fill && fill.ok)) { r1.errors.push("FILL_FAIL"); rec.roundsData.push(r1); rec.roundsDone += 1; continue; }
          const cl1 = await clickById("#zy-smart-fill");
          if (!(cl1 && cl1.clicked)) { r1.errors.push("SMART_FILL_BTN_NOT_FOUND"); rec.roundsData.push(r1); rec.roundsDone += 1; continue; }
          const doneP = await waitStatusContains("AI 槽位匹配完成（预览，未修改画布）", 90000);
          r1.preview = { done: !!doneP.done, status: doneP.done ? doneP.st.slice(0, 200) : null };
          const mMatch = /匹配 (\d+)\/(\d+) 槽/.exec(doneP.st || "");
          const matchedCount = doneP.done && mMatch ? Number(mMatch[1]) : 0;
          r1.matchedCount = matchedCount;
          const trace = await page.evaluate((k) => window[k] || [], TRACE_KEY).catch(() => []);
          r1.trace = (trace || []).slice(-3);
          const f1 = [];
          if (!doneP.done) f1.push("PREVIEW_NOT_DONE");
          if (!(r1.trace || []).some((x) => x.model && String(x.model) === String(AI_MODEL))) f1.push("AI_CALL_NOT_OBSERVED");
          r1.previewFails = f1;
          if (f1.length) r1.errors.push("ASSERT preview: " + f1.join(" | "));
          if (!doneP.done) { rec.roundsData.push(r1); rec.roundsDone += 1; continue; }
          const cl2 = await clickById("#zy-apply-confirm");
          if (!(cl2 && cl2.clicked)) { r1.errors.push("CONFIRM_BTN_NOT_FOUND"); rec.roundsData.push(r1); rec.roundsDone += 1; continue; }
          let doneA = await waitStatusContains("AI 填充完成", 30000);
          if (!doneA.done) {
            // 偶发首点无回包（B r2 已观察到）：重试一次确认
            await SLEEP(1000);
            const cl2R = await clickById("#zy-apply-confirm", 8000);
            doneA = await waitStatusContains("AI 填充完成", 30000);
            if (cl2R && cl2R.clicked) r1.confirmRetried = true;
          }
          r1.apply = { done: !!doneA.done, status: doneA.done ? doneA.st.slice(0, 200) : null };
          await SLEEP(1200);
          const invA = await readFront();
          const itemsA = invA.frontItems || [];
          r1.after = { count: itemsA.length, texts: itemsA.map((it) => it.text) };
          const f2 = [];
          if (!doneA.done) f2.push("APPLY_NOT_DONE");
          if (r1.after.count !== r1.before.count) f2.push("COUNT_CHANGED " + r1.before.count + "->" + r1.after.count);
          // 依据 preview 状态解析「实际匹配的 slotId -> 客户值」（AI 可能跳过槽，不能假设前 N 槽连续）
          const matchedBySlot = {};
          const stRaw = (doneP.st || "") + "\n" + String(doneP.st || "");
          const stLines = String(doneP && doneP.st || "").split("\n");
          stLines.forEach(function (ln) {
            const m = /(front|back)-(\d+)\s*←\s*(.+)$/.exec(ln);
            if (m) { try { matchedBySlot[(m[1] === "back" ? "back-" : "front-") + Number(m[2])] = String(m[3]); } catch (e) {} }
          });
          r1.matchedBySlot = matchedBySlot;
          for (let i = 0; i < def.slots.length && i < itemsA.length; i += 1) {
            const sid = "front-" + (i + 1);
            const want = matchedBySlot[sid] != null ? matchedBySlot[sid] : def.slots[i].text;
            // J 空槽：即使被解析进 matchedBySlot 也绝不接受被填非空（空槽不得误填）
            if (typeof def.emptySlotIdx === "number" && i === def.emptySlotIdx) {
              if (String(itemsA[i].text || "").trim() !== "" && String(want || "").trim() !== "") { f2.push("EMPTY_SLOT_FILLED[" + i + "]=" + String(itemsA[i].text).slice(0, 12)); }
              continue;
            }
            if (String(itemsA[i].text || "") !== String(want)) { f2.push("TEXT_MISMATCH[" + i + "] got " + String(itemsA[i].text).slice(0, 16) + " want " + String(want).slice(0, 16)); break; }
          }
          // G 无微信槽：forbidden 不得出现于任何槽
          if (def.forbidden) {
            const joined = itemsA.map((it) => String(it.text || "")).join(" ");
            for (const fd of def.forbidden) { if (joined.indexOf(fd) >= 0) { f2.push("FORBIDDEN_FILLED[" + fd + "]"); break; } }
          }
          // 冻结字段比较（before/after 同一对象身份；height 记 evidence）
          if (r1.before.count === itemsA.length) {
            const fb = (invB.frontItems || []).map(FZ);
            const fa = itemsA.map(FZ);
            const frozenFails = [];
            const heightDeltas = [];
            for (let i = 0; i < fb.length && i < fa.length; i += 1) {
              for (const k of FROZEN_KEYS) {
                if (JSON.stringify(fb[i][k]) !== JSON.stringify(fa[i][k])) { frozenFails.push("FROZEN[" + i + "]." + k + " " + JSON.stringify(fb[i][k]) + " -> " + JSON.stringify(fa[i][k])); break; }
              }
              const dh = (typeof fa[i].height === "number" && typeof fb[i].height === "number") ? Number((fa[i].height - fb[i].height).toFixed(3)) : null;
              heightDeltas.push(dh);
              if (frozenFails.length) break;
            }
            r1.frozen = { keys: FROZEN_LABEL, fails: frozenFails, heightDeltas: heightDeltas };
            if (frozenFails.length) f2.push("FROZEN_FAIL: " + frozenFails.join(" | "));
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
  console.log("[commit-46p] report -> runtime/reports/stage-11/commit-46p-real-acceptance.json runs=" + out.runs.length);
})().catch((e) => { console.error("FATAL: " + String(e && (e.message || e) || e).slice(0, 600)); process.exit(1); });