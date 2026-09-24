// runtime/stage9/commit-46o-copy-layer-modes-real.js — Stage 10-G Commit 07：图层文字复制三模式真机验收
// 目标（端到端）：注入 5 槽正面文字层 → 分别点真实 #zy-copy-current/#zy-copy-both/#zy-copy-template →
//   拦截 navigator.clipboard.writeText / document.execCommand 到 window.__zyLastCopy 读取复制内容断言：
//   - current（当前面）：含【正面】块 + 注入文本行，不含【反面】；状态「已复制当前面 N 行到剪贴板」
//   - both（正反面）：含【正面】块（若反面存在则含【反面】块）；状态「已复制正反面 N 行到剪贴板」
//   - template（套版结构）：含页面 pageId + [front-N] "text" 字号=fs 位置=(x,y) 尺寸=w x h 颜色=fill；状态「已复制套版结构 N 行到剪贴板」
//   三模式全部来自 TemplateSnapshot（只读，不触画布，前后 count/texts 全等）。
// 凭据：ZY_STAGE9_COOKIE。报告：runtime/reports/stage-11/commit-46o-copy-layer-modes-real.json
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
const BVER = "0.3.11.79";

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
    id: "P-COPY-MODES", rounds: 1,
    slots: [
      { text: "山东启诚信息技术股份", fontSize: 14, fontFamily: "方正黑体简体" },
      { text: "王晓明", fontSize: 18, fontFamily: "思源黑体 Regular" },
      { text: "销售副总监", fontSize: 24, fontFamily: "思源黑体 Bold" },
      { text: "1380 0138 000", fontSize: 15, fontFamily: "思源黑体 Regular" },
      { text: "北京市朝阳区建国路89号", fontSize: 11, fontFamily: "思源黑体 Regular" }
    ]
  }
];
function selfTest() {
  const t = (n, c) => { if (!c) throw new Error("SELFTEST FAIL " + n); console.log("[selftest] PASS " + n); };
  const cc = injectUserscript();
  t("cases-1", P_CASES.length === 1 && P_CASES[0].id === "P-COPY-MODES");
  t("html-3btns", cc.indexOf('id="zy-copy-current"') >= 0 && cc.indexOf('id="zy-copy-both"') >= 0 && cc.indexOf('id="zy-copy-template"') >= 0);
  t("side-block", cc.indexOf("function zySideTextBlock(") >= 0 && cc.indexOf("【正面】") >= 0 && cc.indexOf("【反面】") >= 0);
  t("build-copy", cc.indexOf("function zyBuildCopyText(") >= 0 && cc.indexOf('mode === "template"') >= 0);
  t("copy-fn", cc.indexOf("async function copyLayerTexts(") >= 0 && cc.indexOf("getCurrentPage") >= 0 && cc.indexOf("GM_setClipboard") >= 0);
  t("template-row", cc.indexOf('" 字号=" + fsV') >= 0 && cc.indexOf('" 位置=(" + x') >= 0 && cc.indexOf('") 尺寸=" + w') >= 0 && cc.indexOf('" 颜色=" + fill') >= 0);
  t("bver-const", BVER === "0.3.11.79");
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const sessCookie = await probeMod.resolveStage9Cookie();
  const COOKIE_RAW = sessCookie.raw || "";
  if (!COOKIE_RAW) { console.error("[commit-46o] 会话 cookie 解析失败：" + (sessCookie.error || "NO_COOKIE")); process.exit(2); }
  const out = { ts: new Date().toISOString(), stage: "STAGE10-G-COMMIT-L7-COPY-LAYER-MODES", cases: P_CASES.map((c) => c.id), cookieSource: sessCookie.source || null, bverExpect: BVER, runs: [], errors: [] };
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1280, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    let page = browser.pages()[0];
    const onPageErr = (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 200)); };
    page.on("pageerror", onPageErr);
    // 拦截剪贴板写入 → window.__zyLastCopy（navigator.clipboard 与 execCommand 双路兜底）
    await page.addInitScript(() => {
      try {
        window.__zyLastCopy = null;
        const origWrite = window.navigator.clipboard && window.navigator.clipboard.writeText;
        if (origWrite) {
          window.navigator.clipboard.writeText = function (text) {
            window.__zyLastCopy = String(text);
            return Promise.resolve();
          };
        }
        const origExec = document.execCommand;
        if (typeof origExec === "function") {
          document.execCommand = function (cmd) {
            try {
              if (String(cmd) === "copy") {
                let v = null;
                const el = document.activeElement;
                if (el && (el.value != null)) v = el.value;
                if (v == null) { const ta = document.querySelector("textarea"); v = ta ? ta.value : null; }
                if (v != null) window.__zyLastCopy = String(v);
              }
            } catch (e) {}
            return origExec.apply(this, arguments);
          };
        }
      } catch (e) {}
    });
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
    const setGm = async () => page.evaluate(() => {
      const set = (k, v) => { try { localStorage.setItem("zy8dshim:" + k, JSON.stringify(v)); } catch (e) {} };
      set("zyBaiduOcrMode", "standard"); set("zyStage9NativeOcrMode", "2"); set("zyStage9NativeTruth", "1"); set("zyStage9LocalSidecar", "0"); set("zyOcrMode", "baidu"); set("zyStage9InkGeometry", "0"); set("zyShowTemplatePanel", "1");
      return true;
    });
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
          return { snapshotHash: r.snapshotHash, page: r.page, frontItems: r.front.items, backItems: (r.back && Array.isArray(r.back.items)) ? r.back.items : [], invSideCounts: { front: r.count ? r.count.front : 0, back: r.count ? r.count.back : 0 } };
        }
        await SLEEP(1200);
      }
      return {};
    };
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
    const readCopy = () => page.evaluate(() => window.__zyLastCopy || null).catch(() => null);
    const waitPanelReady = async (tries) => {
      for (let i = 0; i < (tries || 15); i += 1) {
        const has = await page.evaluate(() => !!document.querySelector("#zy-copy-current") && !!document.querySelector("#zy-copy-both") && !!document.querySelector("#zy-copy-template")).catch(() => false);
        if (has) return true;
        await SLEEP(900);
      }
      return false;
    };

    for (const def of P_CASES) {
      if (WHITELIST.length && WHITELIST.indexOf(def.id) < 0) continue;
      const rec = { case: def.id, note: "复制三模式（current/both/template）拦截剪贴板断言 + 画布零变化", steps: [], errors: [], runs: [] };
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
        const invB = await readFront();
        rec.before = { count: (invB.frontItems || []).length, texts: (invB.frontItems || []).map((it) => it.text) };
        rec.invSideCounts = invB.invSideCounts || null;
        rec.pageOf = invB.page || null;
        if (rec.before.count !== def.slots.length) rec.errors.push("INJECT_COUNT " + rec.before.count + "!=" + def.slots.length);

        // ---- ① 复制当前面 ----
        await page.evaluate(() => { try { window.__zyLastCopy = null; } catch (e) {} });
        const cl1 = await clickById("#zy-copy-current");
        if (!(cl1 && cl1.clicked)) { rec.errors.push("CURRENT_BTN_NOT_FOUND"); continue; }
        const st1 = await waitStatusContains("已复制当前面", 12000);
        await SLEEP(600);
        const cp1 = await readCopy();
        rec.current = { clicked: !!(cl1 && cl1.clicked), done: !!st1.done, status: st1.done ? st1.st.slice(0, 120) : null, copied: cp1 ? String(cp1).slice(0, 300) : null, lines: cp1 ? String(cp1).split("\n").filter(Boolean).length : 0 };
        const f1 = [];
        if (!st1.done) f1.push("STATUS_MISSING_当前面");
        if (!cp1) { f1.push("CLIP_EMPTY"); } else {
          if (cp1.indexOf("【正面】") < 0) f1.push("NO_FRONT_MARKER");
          if (cp1.indexOf("【反面】") >= 0) f1.push("HAS_BACK_MARKER");
          for (let i = 0; i < def.slots.length; i += 1) { if (cp1.indexOf(def.slots[i].text) < 0) { f1.push("MISSING_TEXT[" + i + "]"); break; } }
        }
        rec.currentFails = f1;
        if (f1.length) rec.errors.push("ASSERT_FAIL current: " + f1.join(" | "));

        // ---- ② 复制正反面 ----
        await page.evaluate(() => { try { window.__zyLastCopy = null; } catch (e) {} });
        const cl2 = await clickById("#zy-copy-both");
        if (!(cl2 && cl2.clicked)) { rec.errors.push("BOTH_BTN_NOT_FOUND"); continue; }
        const st2 = await waitStatusContains("已复制正反面", 12000);
        await SLEEP(600);
        const cp2 = await readCopy();
        rec.both = { clicked: !!(cl2 && cl2.clicked), done: !!st2.done, status: st2.done ? st2.st.slice(0, 120) : null, copied: cp2 ? String(cp2).slice(0, 500) : null, lines: cp2 ? String(cp2).split("\n").filter(Boolean).length : 0 };
        const f2 = [];
        if (!st2.done) f2.push("STATUS_MISSING_正反面");
        if (!cp2) { f2.push("CLIP_EMPTY"); } else {
          if (cp2.indexOf("【正面】") < 0) f2.push("NO_FRONT_MARKER");
          for (let i = 0; i < def.slots.length; i += 1) { if (cp2.indexOf(def.slots[i].text) < 0) { f2.push("MISSING_TEXT[" + i + "]"); break; } }
          // 反面可能不存在（无背面画布）——存在时要求含【反面】，不存在时不作要求
          const backExists = rec.invSideCounts && rec.invSideCounts.back > 0;
          if (backExists && cp2.indexOf("【反面】") < 0) f2.push("NO_BACK_MARKER_EXPECTED");
        }
        rec.bothFails = f2;
        if (f2.length) rec.errors.push("ASSERT_FAIL both: " + f2.join(" | "));

        // ---- ③ 复制套版结构 ----
        await page.evaluate(() => { try { window.__zyLastCopy = null; } catch (e) {} });
        const cl3 = await clickById("#zy-copy-template");
        if (!(cl3 && cl3.clicked)) { rec.errors.push("TEMPLATE_BTN_NOT_FOUND"); continue; }
        const st3 = await waitStatusContains("已复制套版结构", 12000);
        await SLEEP(600);
        const cp3 = await readCopy();
        rec.template = { clicked: !!(cl3 && cl3.clicked), done: !!st3.done, status: st3.done ? st3.st.slice(0, 120) : null, copied: cp3 ? String(cp3).slice(0, 900) : null, lines: cp3 ? String(cp3).split("\n").filter(Boolean).length : 0 };
        const f3 = [];
        if (!st3.done) f3.push("STATUS_MISSING_套版结构");
        if (!cp3) { f3.push("CLIP_EMPTY"); } else {
          if (cp3.indexOf("页面：") < 0) f3.push("NO_PAGE_ID");
          if (cp3.indexOf("【正面】") < 0) f3.push("NO_FRONT_MARKER");
          for (let i = 0; i < def.slots.length; i += 1) {
            const tag = "front-" + (i + 1);
            if (cp3.indexOf("[" + tag + "]") < 0) { f3.push("NO_SLOT[" + tag + "]"); break; }
          }
          if (cp3.indexOf("字号=") < 0) f3.push("NO_FONTSIZE");
          if (cp3.indexOf("位置=(") < 0) f3.push("NO_POSITION");
          if (cp3.indexOf("尺寸=") < 0) f3.push("NO_SIZE");
          if (cp3.indexOf("颜色=") < 0) f3.push("NO_COLOR");
          const hasFs14 = cp3.indexOf("字号=14 ") >= 0 || cp3.indexOf("字号=14 位置") >= 0;
          if (!hasFs14) f3.push("NO_FS_14_VALUE");
        }
        rec.templateFails = f3;
        if (f3.length) rec.errors.push("ASSERT_FAIL template: " + f3.join(" | "));

        // ---- ④ 画布零变化 ----
        const invE = await readFront();
        rec.after = { count: (invE.frontItems || []).length, texts: (invE.frontItems || []).map((it) => it.text) };
        const f4 = [];
        if (rec.after.count !== rec.before.count) f4.push("COUNT_CHANGED " + rec.before.count + "->" + rec.after.count);
        for (let i = 0; i < rec.before.texts.length && i < (rec.after.texts || []).length; i += 1) {
          if (String(rec.before.texts[i]) !== String(rec.after.texts[i])) { f4.push("TEXT_CHANGED[" + i + "]"); break; }
        }
        rec.canvasFails = f4;
        if (f4.length) rec.errors.push("ASSERT_FAIL canvas-stable: " + f4.join(" | "));
      } catch (e) { rec.errors.push("RUN: " + String(e && (e.message || e) || e).slice(0, 300)); }
    }
    out.errors = out.errors.slice(0, 20);
  } catch (e) { out.errors.push("FATAL: " + String(e && (e.message || e) || e).slice(0, 400)); }
  finally { try { await browser.close(); } catch (e) {} }
  fs.writeFileSync(path.join(REPORT_DIR, "commit-46o-copy-layer-modes-real.json"), JSON.stringify(out, null, 2));
  console.log("[commit-46o] report -> runtime/reports/stage-11/commit-46o-copy-layer-modes-real.json");
})().catch((e) => { console.error("FATAL: " + String(e && (e.message || e) || e).slice(0, 600)); process.exit(1); });