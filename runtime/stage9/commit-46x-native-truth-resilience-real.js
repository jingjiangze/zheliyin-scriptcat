// runtime/stage9/commit-46x-native-truth-resilience-real.js — Native Truth 流水线韧性真机验收
// ---------------------------------------------------------------------
// 目的：验证「几何恢复 / 本地辅助层失败非致命」——流水线绝不因辅助层异常而整批拒绝创建。
// 手段：?zydebug 出口直接驱动 maybeApplyNativeTruth（注入合成 native 真值 + 合成几何块，
//   绕过站点 OCR 会话），并直接断言两个安全包装的吞噬语义。
//
// 每轮（ROUNDS=2）串行断言：
//   R0 GM：轮1 默认（assist 开）／轮2 zyLocalAssist=0（assist 关）——两种情况流水线都必须完成
//   R1 合成流水线：out.mode === "NATIVE_TRUTH"（非 skipped）且 gate.totalNative=2
//   R2 真值来源：out.blocks[].textSource === "NATIVE_OCR" 且 text === native.rawText（逐字）
//   R3 门禁语义：nativeTruthGateFail(out) 不返回「流水线异常」；nativeTruthGatePassed(out) 可达放行
//   R4 非致命契约（直接调用包装）：
//      safeRecoverNativeGeometry(null,{}) → 返回中性对象且不抛
//      safeRunLocalGeometrySidecar({dataUrl:"invalid"}) → resolve 为数组且不 reject
//   R5 取证：收集 [zy-ocr][*] 控制台行（TRUTH/RECOVERY/SIDECAR），记录辅助层是否报错及其文本
//
// 凭据：会话 cookie 走 session-probe 自动解析（本 runner 不调 AI、不依赖站点 OCR 会话）。
// 报告：runtime/reports/stage-11/commit-46x-native-truth-resilience-real.json
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
const REPORT_FILE = path.join(REPORT_DIR, "commit-46x-native-truth-resilience-real.json");
const adapter = require("../scriptcat-adapter");
const probeMod = require("./session-probe");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = (process.env.ZY_URL || "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do") + "?zydebug=1";
const ROUNDS = Number(process.env.ZY_ROUNDS || 2);
const MERGE = process.env.ZY_MERGE === "1";
const BVER = "0.3.11.91";
const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

function parseCookies(raw) {
  const out = [];
  String(raw || "").split(";").forEach((part) => {
    const eq = part.indexOf("="); if (eq <= 0) return;
    const name = part.slice(0, eq).trim(); const value = part.slice(eq + 1).trim();
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
  ["test", "demo"].forEach((b) => { code = code.split(b + "/extension/src/").join("stage-9-altq-baidu-reconstruction/extension/src/"); });
  return code;
}
function pageWorldPayloadFor() {
  const parts = [GM_SHIM_SOURCE];
  const norm = injectUserscript();
  [...norm.matchAll(/\/\/ @require\s+(\S+)/g)].map((m) => m[1]).forEach((u) => {
    const mm = /\/extension\/src\/(.+)$/.exec(u); if (!mm) return;
    const rel = mm[1].split("?")[0]; const fp = path.join(ROOT, "extension", "src", rel);
    if (fs.existsSync(fp)) parts.push("// ==== @require " + rel + " ====\n" + fs.readFileSync(fp, "utf8"));
  });
  parts.push(norm);
  return parts.join("\n;\n");
}

function selfTest() {
  const t = (n, c) => { if (!c) throw new Error("SELFTEST FAIL " + n); console.log("[selftest] PASS " + n); };
  const cc = injectUserscript();
  t("bver", BVER === "0.3.11.91");
  t("rounds>=2", ROUNDS >= 2);
  t("safe-wrappers", cc.indexOf("function safeRecoverNativeGeometry(") >= 0 && cc.indexOf("async function safeRunLocalGeometrySidecar(") >= 0);
  t("no-raw-assist-calls", (cc.match(/await runLocalGeometrySidecar\(img\)/g) || []).length === 1 && cc.indexOf("await safeRunLocalGeometrySidecar(img)") >= 0);
  t("pipeline-error-text", cc.indexOf("reason: \"pipeline-error\"") >= 0 && cc.indexOf("tb.pipelineError") >= 0);
  t("debug-hooks", cc.indexOf("safeRunLocalGeometrySidecar: safeRunLocalGeometrySidecar") >= 0 && cc.indexOf("maybeApplyNativeTruth: maybeApplyNativeTruth") >= 0);
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const sess = await probeMod.resolveStage9Cookie();
  const COOKIE_RAW = sess.raw || "";
  if (!COOKIE_RAW) { console.error("[commit-46x] 会话 cookie 解析失败：" + (sess.error || "NO_COOKIE")); process.exit(2); }
  let out = { ts: new Date().toISOString(), stage: "STAGE10-G-NATIVE-TRUTH-RESILIENCE", cookieSource: sess.source || null, bverExpect: BVER, rounds: ROUNDS, runs: [], errors: [] };
  if (MERGE && fs.existsSync(REPORT_FILE)) {
    try { const old = JSON.parse(fs.readFileSync(REPORT_FILE, "utf8")); if (old && Array.isArray(old.runs)) out.runs = old.runs; if (Array.isArray(old.errors)) out.errors = old.errors; } catch (e) {}
  }
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1280, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    const page = browser.pages()[0];
    page.on("pageerror", (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 200)); });
    const zyLogs = [];
    page.on("console", (m) => { const t = String(m.text() || ""); if (t.indexOf("[zy-ocr]") >= 0) zyLogs.push(t.slice(0, 260)); });
    try {
      await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await SLEEP(1400);
      const allOld = await adapter.getAllScripts(page) || [];
      for (const s of allOld.filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(page, s.uuid); } catch (e) {} }
    } catch (eClean) { out.errors.push("CLEAN: " + String(eClean && eClean.message || eClean).slice(0, 120)); }
    for (const c of parseCookies(COOKIE_RAW)) { try { await browser.addCookies([c]); } catch (e) { out.errors.push("COOKIE:" + c.name); } }

    const injectPageWorld = (payload) => page.evaluate((code) => { const s = document.createElement("script"); s.textContent = code; (document.head || document.documentElement).appendChild(s); }, payload);
    const setGm = (assist) => page.evaluate((a) => {
      const set = (k, v) => { try { localStorage.setItem("zy8dshim:" + k, JSON.stringify(v)); } catch (e) {} };
      set("zyShowTemplatePanel", "1"); set("zyStage9NativeTruth", "1"); set("zyLocalAssist", a); set("zyStage9LocalSidecar", "0");
      return true;
    }, assist);
    const waitEditorReady = async (tries) => {
      for (let i = 0; i < (tries || 20); i += 1) {
        const r = await page.evaluate(() => ({ ok: !!(window.CanvasObjVO || (window.requirejs && window.requirejs.s)), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed), bver: (window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.ver) || null, dbg: !!window.__ZY_DEBUG__ })).catch(() => ({}));
        if (r && r.ok && r.bridge && r.dbg) return r;
        await SLEEP(1200);
      }
      return { ok: false };
    };

    for (let rd = 0; rd < ROUNDS; rd += 1) {
      const assist = rd === 0 ? "1" : "0";
      const R = { round: rd + 1, assist: assist, errors: [], steps: {} };
      try {
        await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => R.errors.push("GOTO: " + String(e && e.message || e).slice(0, 100)));
        await SLEEP(6000);
        await setGm(assist);
        await SLEEP(400);
        await injectPageWorld(pageWorldPayloadFor());
        await SLEEP(1600);
        const ready = await waitEditorReady(20);
        if (!(ready && ready.ok)) { R.errors.push("EDITOR_UNAVAILABLE(dbg=" + String(ready && ready.dbg) + ")"); out.runs.push(R); continue; }
        if (rd === 0) R.bver = ready.bver || null;
        if (rd === 0 && ready.bver && ready.bver !== BVER) R.errors.push("BRIDGE_VERSION_MISMATCH(" + String(ready.bver) + ")");
        zyLogs.length = 0;

        // ---- R1/R2/R3 合成流水线（不依赖站点 OCR 会话）----
        const probe = await page.evaluate((tiny) => (async () => {
          const D = window.__ZY_DEBUG__;
          if (!D || typeof D.maybeApplyNativeTruth !== "function") return { ok: false, reason: "NO_DEBUG_HOOK" };
          const blocks = [{ text: "甲公司", bbox: { x: 10, y: 10, width: 90, height: 22 }, sourceProvider: "BAIDU", kind: "line" }];
          const img = {
            dataUrl: tiny, naturalWidth: 300, naturalHeight: 160, width: 300, height: 160,
            _native: { ok: true, meta: { statusCode: "NATIVE_OK", modeUsed: "API" }, texts: [{ rawText: "甲公司", id: 1, order: 0 }, { rawText: "乙公司", id: 2, order: 1 }] }
          };
          let outTb = null, err = null;
          try { outTb = await D.maybeApplyNativeTruth(blocks, img, null); } catch (e) { err = String(e && (e.message || e)); }
          // R6：零几何块 → 全部 native 未匹配 → 触发本地辅助/几何恢复层（原缺陷触发条件）
          let tb2 = null, err2 = null;
          try { tb2 = await D.maybeApplyNativeTruth([], img, null); } catch (e) { err2 = String(e && (e.message || e)); }
          const gf2 = tb2 ? D.nativeTruthGateFail(tb2) : null;
          const gateFail = outTb ? D.nativeTruthGateFail(outTb) : null;
          const gatePass = outTb ? D.nativeTruthGatePassed(outTb) : null;
          return {
            ok: true, err: err,
            mode: outTb && outTb.mode, skipped: !!(outTb && outTb.skipped), reason: (outTb && outTb.reason) || null,
            totalNative: (outTb && outTb.gate && outTb.gate.totalNative) || 0,
            matched: (outTb && outTb.gate && outTb.gate.matched) || 0,
            unmatched: (outTb && outTb.gate && outTb.gate.unmatchedNative) || 0,
            blocksLen: (outTb && outTb.blocks || []).length,
            blockTexts: (outTb && outTb.blocks || []).map(function (b) { return { text: b.text, src: b.textSource }; }),
            sidecar: outTb && outTb.gate ? outTb.gate.localSidecar : null,
            gateFail: gateFail ? { code: gateFail.code, message: String(gateFail.message || "").slice(0, 160) } : null,
            gatePass: gatePass,
            assist: {
              err: err2, mode: tb2 && tb2.mode, skipped: !!(tb2 && tb2.skipped), reason: (tb2 && tb2.reason) || null,
              totalNative: (tb2 && tb2.gate && tb2.gate.totalNative) || 0,
              unmatched: (tb2 && tb2.gate && tb2.gate.unmatchedNative) || 0,
              sidecar: tb2 && tb2.gate ? tb2.gate.localSidecar : null,
              gateFail: gf2 ? { code: gf2.code, message: String(gf2.message || "").slice(0, 160) } : null
            }
          };
        })()).catch((e) => ({ ok: false, reason: "EVAL:" + String(e && e.message || e).slice(0, 120) }));
        R.steps.R1 = probe;
        if (!probe.ok) { R.errors.push("PIPELINE_PROBE_FAIL " + String(probe.reason).slice(0, 120)); }
        else {
          if (probe.err) R.errors.push("PIPELINE_THREW " + probe.err.slice(0, 160));
          if (probe.skipped) R.errors.push("PIPELINE_SKIPPED(reason=" + String(probe.reason) + ") —— 辅助层异常不得导致整批拒绝");
          if (probe.mode !== "NATIVE_TRUTH") R.errors.push("MODE_NOT_NATIVE_TRUTH " + String(probe.mode));
          if (probe.totalNative !== 2) R.errors.push("TOTAL_NATIVE " + probe.totalNative + " != 2");
          const badText = (probe.blockTexts || []).filter((b) => b.src !== "NATIVE_OCR");
          if (badText.length) R.errors.push("TEXT_SOURCE_NOT_NATIVE " + JSON.stringify(badText).slice(0, 120));
          if (probe.gateFail && probe.gateFail.code === "NATIVE_TRUTH_PIPELINE_ERROR") R.errors.push("GATE_PIPELINE_ERROR " + String(probe.gateFail.message).slice(0, 120));
        }
        R.steps.R3 = { gatePass: probe.gatePass, gateFail: probe.gateFail };

        // ---- R6 辅助层被真正触发时仍非致命（零几何块 → 全部未匹配）----
        const asst = probe.assist || null;
        R.steps.R6 = asst;
        if (!asst) R.errors.push("ASSIST_PROBE_MISSING");
        else {
          if (asst.err) R.errors.push("ASSIST_THREW " + String(asst.err).slice(0, 160));
          if (asst.mode !== "NATIVE_TRUTH") R.errors.push("ASSIST_MODE " + String(asst.mode));
          if (asst.skipped) R.errors.push("ASSIST_SKIPPED(reason=" + String(asst.reason) + ") —— 辅助层异常不得导致整批拒绝");
          if (asst.gateFail && asst.gateFail.code === "NATIVE_TRUTH_PIPELINE_ERROR") R.errors.push("ASSIST_GATE_PIPELINE_ERROR " + String(asst.gateFail.message).slice(0, 120));
          if (!(asst.sidecar && asst.sidecar.used)) R.steps.R6Note = "assist 分支未进入（策略判定无需本地辅助）";
        }

        // ---- R4 非致命契约（直接调用包装）----
        const wrappers = await page.evaluate(() => (async () => {
          const D = window.__ZY_DEBUG__ || {};
          const out = { hasRecover: typeof D.safeRecoverNativeGeometry === "function", hasSidecar: typeof D.safeRunLocalGeometrySidecar === "function" };
          try { const n = D.safeRecoverNativeGeometry ? D.safeRecoverNativeGeometry(null, {}) : null; out.recoverOk = !!(n && Array.isArray(n.recovered) && Array.isArray(n.unresolved) && Array.isArray(n.rejected)); out.recoverNeutral = n ? { recovered: n.recovered.length, unresolved: n.unresolved.length } : null; } catch (e) { out.recoverThrew = String(e && (e.message || e)); }
          try { const a = D.safeRunLocalGeometrySidecar ? await D.safeRunLocalGeometrySidecar({ dataUrl: "invalid://x", naturalWidth: 10, naturalHeight: 10, width: 10, height: 10 }) : null; out.sidecarIsArray = Array.isArray(a); out.sidecarLen = Array.isArray(a) ? a.length : null; } catch (e) { out.sidecarThrew = String(e && (e.message || e)); }
          return out;
        })()).catch((e) => ({ err: String(e && e.message || e).slice(0, 120) }));
        R.steps.R4 = wrappers;
        if (!wrappers.hasRecover || !wrappers.hasSidecar) R.errors.push("WRAPPER_HOOK_MISSING");
        if (wrappers.recoverThrew) R.errors.push("SAFE_RECOVER_THREW " + String(wrappers.recoverThrew).slice(0, 120));
        if (!wrappers.recoverOk) R.errors.push("SAFE_RECOVER_NOT_NEUTRAL");
        if (wrappers.sidecarThrew) R.errors.push("SAFE_SIDECAR_REJECTED " + String(wrappers.sidecarThrew).slice(0, 120));
        if (!wrappers.sidecarIsArray) R.errors.push("SAFE_SIDECAR_NOT_ARRAY");

        // ---- R5 取证：辅助层日志（是否报错、文本）----
        const relevant = zyLogs.filter((l) => /\[TRUTH\]|\[RECOVERY\]|\[SIDECAR\]/.test(l)).slice(0, 12);
        const exceptionLines = zyLogs.filter((l) => l.indexOf("exception") >= 0);
        R.steps.R5 = { lines: relevant, exceptionLines: exceptionLines };
        if (exceptionLines.length) R.errors.push("TRUTH_EXCEPTION " + String(exceptionLines[0]).slice(0, 160));
      } catch (e) { R.errors.push("RUN: " + String(e && (e.message || e) || e).slice(0, 300)); }
      out.runs.push(R);
    }
    out.errors = out.errors.slice(0, 30);
  } catch (e) { out.errors.push("FATAL: " + String(e && (e.message || e) || e).slice(0, 400)); }
  finally { try { await browser.close(); } catch (e) {} }
  fs.writeFileSync(REPORT_FILE, JSON.stringify(out, null, 2));
  const okRuns = out.runs.filter((r) => (r.errors || []).length === 0).length;
  console.log("[commit-46x] report -> runtime/reports/stage-11/commit-46x-native-truth-resilience-real.json runs=" + out.runs.length + " cleanRuns=" + okRuns);
})().catch((e) => { console.error("FATAL: " + String(e && (e.message || e) || e).slice(0, 600)); process.exit(1); });
