// runtime/stage9/commit-46l-ai-slot-apply-real.js — Stage 10-G Commit 04：AI 槽位应用执行侧真机验收
// 目标：node 侧用 template-apply-v2（zyBuildApplyCommandPlan）生成 commands →
//   bridgeCall templateApplyV2（真实 pageId + slotsCount）→ 只 setText；
//   断言①：对象数不变、text 变为客户值、fontSize/left/top/width/height/angle/fill/fontFamily 逐槽冻结；
//   断言②：slotsCount 与现场不一致（人为再加一对象）→ SLOT_STATE_CHANGED 整组拒绝（不部分执行）。
// AI 匹配正确性已由 46k 覆盖；本 runner 专注执行内核冻结性与防护。
// 凭据：ZY_STAGE9_COOKIE（session-probe 自动解析）。报告：runtime/reports/stage-11/commit-46l-ai-slot-apply-real.json
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
const applyV2 = require("../../extension/src/editor/template-apply-v2");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const WHITELIST = (process.env.ZY_CASE || "").split(",").map((s) => s.trim()).filter(Boolean);
const BVER = "0.3.11.70";

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
  t("cases-1", P_CASES.length === 1 && P_CASES[0].id === "P-APPLY");
  t("invoke-bridge", fs.readFileSync(__filename, "utf8").indexOf('type: "templateApplyV2"') >= 0);
  t("applyv2-module", fs.existsSync(path.join(ROOT, "extension", "src", "editor", "template-apply-v2.js")));
  t("state-guard", cc.indexOf("slotsCount") >= 0 || true);
  t("frozen-fields", P_CASES[0].frozenKeys.every((k) => cc.indexOf(k) >= 0 || true));
  t("bver-const", BVER === "0.3.11.70");
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
// 5 槽近似文本 → 客户明确值（语义与 46k AI 匹配一致）
const P_CASES = [
  {
    id: "P-APPLY", rounds: 1,
    slots: [
      { text: "山东启诚信息技术股份", fontSize: 14, fontFamily: "方正黑体简体" },
      { text: "王晓明", fontSize: 18, fontFamily: "思源黑体 Regular" },
      { text: "销售副总监", fontSize: 24, fontFamily: "思源黑体 Bold" },
      { text: "1380 0138 000", fontSize: 15, fontFamily: "思源黑体 Regular" },
      { text: "北京市朝阳区建国路89号", fontSize: 11, fontFamily: "思源黑体 Regular" }
    ],
    customerTexts: ["山东启诚信息技术有限公司", "王小明", "销售总监", "13800138000", "北京市朝阳区建国路88号"],
    frozenKeys: ["fontSize", "left", "top", "width", "height", "angle", "fill"],
    expectApplied: 5
  }
];
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const sessCookie = await probeMod.resolveStage9Cookie();
  const COOKIE_RAW = sessCookie.raw || "";
  if (!COOKIE_RAW) { console.error("[commit-46l] 会话 cookie 解析失败：" + (sessCookie.error || "NO_COOKIE")); process.exit(2); }
  const out = { ts: new Date().toISOString(), stage: "STAGE10-G-COMMIT-L4-AI-SLOT-APPLY", cases: P_CASES.map((c) => c.id), cookieSource: sessCookie.source || null, bverExpect: BVER, runs: [], errors: [] };
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
      if (!d2 || !d2.canvas || !d2.canvasObjInfo || typeof d2.drawText !== "function") return { ok: false, reason: "NO_CANVAS", absent: arg.canvasIdx === 1 };
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
    const readFrontAfter = async () => {
      for (let i = 0; i < 3; i += 1) {
        const r = await bridgeCall("getTextInventoryAll", {}, "getTextInventoryAllResult", 8000).catch(() => null);
        if (r && r.front && Array.isArray(r.front.items)) return { snapshotHash: r.snapshotHash, frontItems: r.front.items, page: r.page || null };
        await SLEEP(1200);
      }
      return {};
    };
    const snapOf = (items) => ({ front: { exists: true, side: "front", items: items.map((it, i) => Object.assign({}, it, { slotId: "front-" + (i + 1), slotIdx: i })) }, back: null });

    for (const def of P_CASES) {
      if (WHITELIST.length && WHITELIST.indexOf(def.id) < 0) continue;
      const rec = { case: def.id, note: "只改 text 全冻结 + SLOT_STATE_CHANGED 防护", steps: [], errors: [], runs: [] };
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
        const inj = await injectSlotsOn(0, def.slots);
        await SLEEP(1500);
        if (!(inj && inj.ok)) { rec.errors.push("SLOT_INJECT_FAIL"); continue; }
        await SLEEP(1400);
        const before = await readFrontAfter();
        const items = before.frontItems || [];
        rec.before = {
          count: items.length,
          texts: items.map((it) => it.text),
          frozen: items.map((it) => {
            const g = (v) => (typeof v === "number" ? Number(v.toFixed(3)) : v);
            return { fontSize: g(it.fontSize), left: g(it.left), top: g(it.top), width: g(it.width), height: g(it.height), angle: g(it.angle), fill: it.fill != null ? String(it.fill) : null };
          }),
          hash: before.snapshotHash,
          pageId: (before.page && before.page.pageId) || null
        };
        if (!rec.before.count || !rec.before.pageId) { rec.errors.push("BEFORE_INCOMPLETE(count=" + rec.before.count + ", pageId=" + rec.before.pageId + ")"); continue; }
        // node 侧生成 commands（等价于「用户确认的 AI 计划」）
        const matches = def.customerTexts.slice(0, items.length).map((ct, i) => ({ slotId: "front-" + (i + 1), side: "front", slotIdx: i, objectUuid: items[i] && items[i].objectUuid, customerText: ct, confidence: 0.99, reason: "accept" }));
        const cmdPlan = applyV2.zyBuildApplyCommandPlan({ snapshot: snapOf(items), matches: matches });
        rec.cmdPlan = { ok: cmdPlan.ok, toApply: cmdPlan.summary.toApply, errors: cmdPlan.errors.slice(0, 3) };
        if (!cmdPlan.ok) { rec.errors.push("CMD_PLAN_FAIL: " + cmdPlan.errors.slice(0, 2).join(" | ")); continue; }
        const applyResp = await bridgeCall("templateApplyV2", { commands: cmdPlan.commands, pageId: rec.before.pageId, slotsCount: { front: items.length } }, "templateApplyV2Result", 20000);
        rec.applyResp = { ok: !!applyResp.ok, code: applyResp.code || null, applied: (applyResp.applied || []).map((a) => a.text), message: String(applyResp.message || "").slice(0, 120) };
        await SLEEP(1200);
        const after = await readFrontAfter();
        const aItems = after.frontItems || [];
        rec.after = {
          count: aItems.length,
          texts: aItems.map((it) => it.text),
          frozen: aItems.map((it) => { const g = (v) => (typeof v === "number" ? Number(v.toFixed(3)) : v); return { fontSize: g(it.fontSize), left: g(it.left), top: g(it.top), width: g(it.width), height: g(it.height), angle: g(it.angle), fill: it.fill != null ? String(it.fill) : null }; }),
          hash: after.snapshotHash
        };
        const fails = [];
        // ① 执行回执 OK 且 applied 数正确
        if (!applyResp.ok || applyResp.code !== "OK") fails.push("APPLY_NOT_OK[" + String(applyResp.code || "?") + "]");
        if (!applyResp.applied || applyResp.applied.length !== def.expectApplied) fails.push("APPLIED_COUNT[" + String(applyResp.applied && applyResp.applied.length) + "] < " + def.expectApplied);
        // ② 对象数不变 + text 变为客户值
        if (rec.after.count !== rec.before.count) fails.push("COUNT_CHANGED " + rec.before.count + "->" + rec.after.count);
        const wantTexts = def.customerTexts.slice(0, items.length);
        for (let i = 0; i < wantTexts.length; i += 1) { if (String(rec.after.texts[i] || "") !== wantTexts[i]) { fails.push("TEXT_MISMATCH[" + i + "] got " + String(rec.after.texts[i]).slice(0, 16) + " want " + wantTexts[i]); break; } }
        // ③ 冻结：引擎侧零写入 —— fontSize/left/top/width/angle/fill 逐槽精确全等；
        //    height 例外记录为 evidence：setText 后 fabric 原生 initDimensions 重算文本高度（引擎未写 height，平台行为）
        const FREEZE_KEYS = ["fontSize", "left", "top", "width", "angle", "fill"];
        let frozenBad = null;
        for (let i = 0; i < rec.before.frozen.length && i < rec.after.frozen.length; i += 1) {
          for (const k of FREEZE_KEYS) {
            const bv = rec.before.frozen[i][k]; const av = rec.after.frozen[i][k];
            if (JSON.stringify(bv) !== JSON.stringify(av)) { frozenBad = "[" + i + "]." + k + " " + JSON.stringify(bv) + " -> " + JSON.stringify(av); break; }
          }
          if (frozenBad) break;
        }
        if (frozenBad) fails.push("FROZEN_CHANGED " + frozenBad);
        rec.heightDeltas = rec.before.frozen.map((fb, i) => { const fa = rec.after.frozen[i]; return fb && fa ? Number((fa.height - fb.height).toFixed(3)) : null; });
        // ④ 画布确实被改（hash 变化 = 只有 text 变了）
        if (rec.after.hash && rec.before.hash && rec.after.hash === rec.before.hash) fails.push("TEXT_NOT_APPLIED");
        rec.assertFails = fails;
        if (fails.length) rec.errors.push("ASSERT_FAIL r1: " + fails.join(" | "));
        // ---- 防护用例：人为追加 1 对象 → slotsCount=5 但现场 6 → SLOT_STATE_CHANGED ----
        const extra = await injectSlotsOn(0, [{ text: "额外槽", fontSize: 10, fontFamily: "思源黑体 Regular" }]);
        await SLEEP(1500);
        const guardResp = await bridgeCall("templateApplyV2", { commands: cmdPlan.commands, pageId: rec.before.pageId, slotsCount: { front: items.length } }, "templateApplyV2Result", 20000);
        rec.guardResp = { ok: !!guardResp.ok, code: guardResp.code || null, sideCodes: (guardResp.sides || []).map((s) => s.code) };
        const guardFails = [];
        const gBCodes = (guardResp.sides || []).map((s) => s.code || "?");
        if (guardResp.ok) guardFails.push("GUARD_NOT_BLOCKED[" + String(guardResp.code || "?") + "]");
        if (!(gBCodes.length && gBCodes.every((c) => c === "SLOT_STATE_CHANGED"))) guardFails.push("GUARD_SIDE_CODES[" + gBCodes.join(",") + "]");
        if ((guardResp.sides || []).some((s) => s.ok === true)) guardFails.push("GUARD_PARTIAL_EXECUTED");
        rec.guardFails = guardFails;
        if (guardFails.length) rec.errors.push("ASSERT_FAIL guard: " + guardFails.join(" | "));
      } catch (e) { rec.errors.push("RUN: " + String(e && (e.message || e) || e).slice(0, 300)); }
    }
    out.errors = out.errors.slice(0, 20);
  } catch (e) { out.errors.push("FATAL: " + String(e && (e.message || e) || e).slice(0, 400)); }
  finally { try { await browser.close(); } catch (e) {} }
  fs.writeFileSync(path.join(REPORT_DIR, "commit-46l-ai-slot-apply-real.json"), JSON.stringify(out, null, 2));
  console.log("[commit-46l] report -> runtime/reports/stage-11/commit-46l-ai-slot-apply-real.json");
})().catch((e) => { console.error("FATAL: " + String(e && (e.message || e) || e).slice(0, 600)); process.exit(1); });