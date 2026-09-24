// runtime/stage9/commit-46n-ui-confirm-apply-real.js — Stage 10-G Commit 06：一键填充 UI 真机验收
// 目标（端到端）：注入 5 槽 → 粘贴客户原文 → 点真实 #zy-smart-fill（AI 槽位匹配 preview）→
//   断言：状态「AI 槽位匹配完成（预览，未修改画布）」+ #zy-match-block 可见 + 正反统计 + 确认/取消按钮 → 画布零变化；
//   点真实 #zy-apply-confirm（templateApplyV2 + planHash）→「AI 填充完成」→ text 更新 + 冻结 + count 不变；
//   取消路径：重新匹配 → 点 #zy-apply-cancel → 结果块隐藏 +「已取消」+ 画布不被改动。
// 凭据：ZY_AI_KEY env（硅基流动，绝不落盘）；ZY_STAGE9_COOKIE。
// 报告：runtime/reports/stage-11/commit-46n-ui-confirm-apply-real.json
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
const TRACE_KEY = "__zy7AiTrace";
const BVER = "0.3.11.78";
const AI_KEY = process.env.ZY_AI_KEY || "";
const AI_BASE_URL = process.env.ZY_AI_BASE_URL || "https://api.siliconflow.cn/v1";
const AI_MODEL = process.env.ZY_AI_MODEL || "Qwen/Qwen2.5-7B-Instruct";

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
const P_CASES = [
  {
    id: "P-UI-APPLY", rounds: 1,
    pasteRows: [
      "正面：", "山东启诚信息技术有限公司", "王小明", "销售总监", "电话：13800138000", "地址：北京市朝阳区建国路88号", "反面：", "主营范围：企业信息化咨询、软件定制开发服务"
    ],
    slots: [
      { text: "山东启诚信息技术股份", fontSize: 14, fontFamily: "方正黑体简体" },
      { text: "王晓明", fontSize: 18, fontFamily: "思源黑体 Regular" },
      { text: "销售副总监", fontSize: 24, fontFamily: "思源黑体 Bold" },
      { text: "1380 0138 000", fontSize: 15, fontFamily: "思源黑体 Regular" },
      { text: "北京市朝阳区建国路89号", fontSize: 11, fontFamily: "思源黑体 Regular" }
    ],
    wantTexts: ["山东启诚信息技术有限公司", "王小明", "销售总监", "13800138000", "北京市朝阳区建国路88号"],
    expectMatchedMin: 3
  }
];
function selfTest() {
  const t = (n, c) => { if (!c) throw new Error("SELFTEST FAIL " + n); console.log("[selftest] PASS " + n); };
  const cc = injectUserscript();
  t("cases-1", P_CASES.length === 1 && P_CASES[0].id === "P-UI-APPLY");
  t("match-block-html", cc.indexOf('id="zy-match-block"') >= 0 && cc.indexOf('id="zy-apply-confirm"') >= 0);
  t("confirm-fn", cc.indexOf("async function confirmTemplateApply(") >= 0 && cc.indexOf("templateApplyV2") >= 0);
  t("cancel-fn", cc.indexOf("function cancelTemplateApply(") >= 0);
  t("plan-cache", cc.indexOf("let lastAiMatch = null") >= 0 && cc.indexOf("planHash") >= 0);
  t("bver-const", BVER === "0.3.11.78");
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const sessCookie = await probeMod.resolveStage9Cookie();
  const COOKIE_RAW = sessCookie.raw || "";
  if (!COOKIE_RAW) { console.error("[commit-46n] 会话 cookie 解析失败：" + (sessCookie.error || "NO_COOKIE")); process.exit(2); }
  if (!AI_KEY) { console.error("[commit-46n] 缺少 ZY_AI_KEY 环境变量（仅临时注入，绝不落盘）。"); process.exit(2); }
  const out = { ts: new Date().toISOString(), stage: "STAGE10-G-COMMIT-L6-ONE-CLICK-FILL-UI", cases: P_CASES.map((c) => c.id), cookieSource: sessCookie.source || null, aiModel: AI_MODEL, bverExpect: BVER, runs: [], errors: [] };
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
    const setGm = async () => page.evaluate(({ key, baseUrl, model }) => {
      const set = (k, v) => { try { localStorage.setItem("zy8dshim:" + k, JSON.stringify(v)); } catch (e) {} };
      set("zyBaiduOcrMode", "standard"); set("zyStage9NativeOcrMode", "2"); set("zyStage9NativeTruth", "1"); set("zyStage9LocalSidecar", "0"); set("zyOcrMode", "baidu"); set("zyStage9InkGeometry", "0"); set("zyShowTemplatePanel", "1");
      set("zyArkApiKey", key); set("zyArkBaseUrl", baseUrl); set("zyArkModel", model);
      return true;
    }, { key: AI_KEY, baseUrl: AI_BASE_URL, model: AI_MODEL });
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
        if (r && r.front && Array.isArray(r.front.items)) return { snapshotHash: r.snapshotHash, frontItems: r.front.items };
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
    const matchBlockState = () => page.evaluate(() => {
      const block = document.querySelector("#zy-match-block");
      const summaryEl = document.querySelector("#zy-match-summary");
      const confirmBtn = document.querySelector("#zy-apply-confirm");
      const cancelBtn = document.querySelector("#zy-apply-cancel");
      return { visible: !!(block && block.offsetParent), summary: summaryEl ? String(summaryEl.textContent || "").slice(0, 200) : null, hasConfirm: !!(confirmBtn && confirmBtn.offsetParent), hasCancel: !!(cancelBtn && cancelBtn.offsetParent) };
    }).catch(() => ({}));
    const waitPanelReady = async (tries) => {
      for (let i = 0; i < (tries || 15); i += 1) {
        const has = await page.evaluate(() => !!document.querySelector("#zy-raw") && !!document.querySelector("#zy-smart-fill")).catch(() => false);
        if (has) return true;
        await SLEEP(900);
      }
      return false;
    };

    for (const def of P_CASES) {
      if (WHITELIST.length && WHITELIST.indexOf(def.id) < 0) continue;
      const rec = { case: def.id, note: "一键填充 UI 端到端：preview 结果块 → 确认填充 → 画布更新+冻结 → 取消", steps: [], errors: [], runs: [] };
      out.runs.push(rec);
      try {
        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => rec.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
        await SLEEP(2000);
        await setGm();
        await SLEEP(400);
        await injectPageWorld(pageWorldPayloadFor());
        await SLEEP(1400);
        const ready = await waitEditorReady(20);
        if (!(ready && ready.ok)) { rec.errors.push("EDITOR_UNAVAILABLE"); continue; }
        rec.bver = (ready && ready.bver) || null;
        if (ready && ready.bver && ready.bver !== BVER) rec.errors.push("BRIDGE_VERSION_MISMATCH(" + String(ready.bver) + ")");
        if (!(await waitPanelReady(15))) { rec.errors.push("PANEL_UNAVAILABLE"); continue; }
        const inj = await injectSlotsOn(0, def.slots);
        await SLEEP(1500);
        if (!(inj && inj.ok)) { rec.errors.push("SLOT_INJECT_FAIL"); continue; }
        await SLEEP(1400);
        const fill = await fillRawText(def.pasteRows);
        if (!(fill && fill.ok)) { rec.errors.push("FILL_FAIL"); continue; }
        // ---- ① 一键智能填充（AI preview）----
        const cl1 = await clickById("#zy-smart-fill");
        if (!(cl1 && cl1.clicked)) { rec.errors.push("SMART_FILL_BTN_NOT_FOUND"); continue; }
        const doneP = await waitStatusContains("AI 槽位匹配完成（预览，未修改画布）", 90000);
        rec.preview = { done: !!doneP.done, status: doneP.done ? doneP.st.slice(0, 200) : null, samples: (doneP.samples || []).slice(-6) };
        const mMatch = /匹配 (\d+)\/(\d+) 槽/.exec(doneP.st || "");
        const matchedCount = mMatch ? Number(mMatch[1]) : 0;
        rec.matchedCount = matchedCount;
        const trace = await page.evaluate((k) => window[k] || [], TRACE_KEY).catch(() => []);
        rec.trace = (trace || []).slice(0, 4);
        const f1 = [];
        if (!doneP.done) f1.push("PREVIEW_NOT_DONE");
        const mBlk = await matchBlockState();
        rec.matchBlock1 = mBlk;
        if (!(mBlk && mBlk.visible)) f1.push("MATCH_BLOCK_HIDDEN");
        if (!(mBlk && mBlk.summary && mBlk.summary.indexOf("正面") >= 0)) f1.push("SUMMARY_MISSING_SIDE");
        if (!(mBlk && mBlk.hasConfirm && mBlk.hasCancel)) f1.push("CONFIRM_CANCEL_HIDDEN");
        if (!(rec.trace || []).some((x) => x.model && String(x.model) === String(AI_MODEL))) f1.push("AI_CALL_NOT_OBSERVED(" + AI_MODEL + ")");
        const invB = await readFront();
        const itemsB = invB.frontItems || [];
        rec.before = { count: itemsB.length, texts: itemsB.map((it) => it.text) };
        // preview 零变化（画布仍为注入原值）
        for (let i = 0; i < def.slots.length && i < itemsB.length; i += 1) { if (String(itemsB[i].text || "") !== def.slots[i].text) { f1.push("PREVIEW_CHANGED_CANVAS[" + i + "]"); break; } }
        rec.previewFails = f1;
        if (f1.length) rec.errors.push("ASSERT_FAIL preview: " + f1.join(" | "));
        // ---- ② 确认填充 ----
        const cl2 = await clickById("#zy-apply-confirm");
        if (!(cl2 && cl2.clicked)) { rec.errors.push("CONFIRM_BTN_NOT_FOUND"); continue; }
        const doneA = await waitStatusContains("AI 填充完成", 30000);
        rec.apply = { done: !!doneA.done, status: doneA.done ? doneA.st.slice(0, 200) : null };
        await SLEEP(1200);
        const invA = await readFront();
        const itemsA = invA.frontItems || [];
        const FZ = (it) => { const g = (v) => (typeof v === "number" ? Number(v.toFixed(3)) : v); return { fontSize: g(it.fontSize), left: g(it.left), top: g(it.top), width: g(it.width), angle: g(it.angle), fill: it.fill != null ? String(it.fill) : null }; };
        rec.after = { count: itemsA.length, texts: itemsA.map((it) => it.text), frozen: itemsA.map(FZ) };
        const f2 = [];
        if (!doneA.done) f2.push("APPLY_NOT_DONE");
        if (rec.after.count !== rec.before.count) f2.push("COUNT_CHANGED " + rec.before.count + "->" + rec.after.count);
        // 期望：前 matchedCount 槽更新为客户值；未匹配槽保持注入原值（与 AI 实际匹配一致）
        for (let i = 0; i < def.slots.length && i < itemsA.length; i += 1) {
          const want = i < matchedCount ? def.wantTexts[i] : def.slots[i].text;
          if (String(itemsA[i].text || "") !== want) { f2.push("TEXT_MISMATCH[" + i + "] got " + String(itemsA[i].text).slice(0, 14) + " want " + want.slice(0, 14)); break; }
        }
        if (rec.before.count === itemsA.length) {
          const frozen0 = itemsB.map(FZ);
          for (let i = 0; i < frozen0.length; i += 1) {
            for (const k of ["fontSize", "left", "top", "width", "angle", "fill"]) {
              if (JSON.stringify(frozen0[i][k]) !== JSON.stringify(rec.after.frozen[i][k])) { f2.push("FROZEN[" + i + "]." + k + " " + JSON.stringify(frozen0[i][k]) + " -> " + JSON.stringify(rec.after.frozen[i][k])); break; }
            }
            if (f2.length) break;
          }
        }
        rec.applyFails = f2;
        if (f2.length) rec.errors.push("ASSERT_FAIL apply: " + f2.join(" | "));
        // ---- ③ 取消路径：重新匹配 → 取消 → 结果块隐藏 + 画布不变 ----
        const cl3 = await clickById("#zy-smart-fill");
        if (!(cl3 && cl3.clicked)) { rec.errors.push("SMART_FILL_RECLICK_FAIL"); continue; }
        await waitStatusContains("AI 槽位匹配完成（预览，未修改画布）", 90000);
        const mBlk2 = await matchBlockState();
        rec.matchBlock2 = mBlk2;
        const cl4 = await clickById("#zy-apply-cancel");
        if (!(cl4 && cl4.clicked)) { rec.errors.push("CANCEL_BTN_NOT_FOUND"); continue; }
        const doneC = await waitStatusContains("已取消 AI 填充预览", 10000);
        await SLEEP(800);
        const mBlk3 = await matchBlockState();
        rec.matchBlock3 = mBlk3;
        const f3 = [];
        if (!doneC.done) f3.push("CANCEL_STATUS_MISSING");
        if (mBlk3 && mBlk3.visible) f3.push("BLOCK_STILL_VISIBLE_AFTER_CANCEL");
        const invE = await readFront();
        const itemsE = invE.frontItems || [];
        rec.afterCancel = { count: itemsE.length, texts: itemsE.map((it) => it.text) };
        for (let i = 0; i < def.slots.length && i < itemsE.length; i += 1) {
          const want = i < matchedCount ? def.wantTexts[i] : def.slots[i].text;
          if (String(itemsE[i].text || "") !== want) { f3.push("CANCEL_CHANGED_CANVAS[" + i + "]"); break; }
        }
        rec.cancelFails = f3;
        if (f3.length) rec.errors.push("ASSERT_FAIL cancel: " + f3.join(" | "));
      } catch (e) { rec.errors.push("RUN: " + String(e && (e.message || e) || e).slice(0, 300)); }
    }
    out.errors = out.errors.slice(0, 20);
  } catch (e) { out.errors.push("FATAL: " + String(e && (e.message || e) || e).slice(0, 400)); }
  finally { try { await browser.close(); } catch (e) {} }
  fs.writeFileSync(path.join(REPORT_DIR, "commit-46n-ui-confirm-apply-real.json"), JSON.stringify(out, null, 2));
  console.log("[commit-46n] report -> runtime/reports/stage-11/commit-46n-ui-confirm-apply-real.json");
})().catch((e) => { console.error("FATAL: " + String(e && (e.message || e) || e).slice(0, 600)); process.exit(1); });