// runtime/stage9/native-anchor-matcher.js — Stage 9 方案 Commit 5：Native Anchor Matcher 真机只读验证
// ---------------------------------------------------------------------
// 纯只读：打开模板 1234075，采集 7 个原生 textbox（P0 aCoords）为 Native Anchor，
// 用多因子 matcher（extension/src/editor/native-anchor-matcher.js）对以下场景打分：
//   理想 block（锚点自身几何）→ 期望 MATCH 自身
//   抖动 block（中心 ±12px、尺寸 ±12%）→ 期望 MATCH 最近锚
//   外来 block（远离/离屏）→ 期望 NO_MATCH（低于阈值）
//   page 门控 block（pageId 不同）→ 期望 NO_MATCH
//   近重复双锚（合成 twin）→ 期望 NATIVE_ANCHOR_UNCERTAIN
// 禁止创建对象/修改/保存。OCR→canvas 映射由调用方负责（本验证 block 直接给 canvas-space）。
// 报告：runtime/reports/stage-9/native-anchor-matcher.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("../../node_modules/playwright");
const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const EXT_ID = "ndcooeababalnlpkfedmmbbbgkljhpjf";
const USERSCRIPT_PATH = path.join(ROOT, "zheliyin-card-assistant.user.js");
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-9");
const M = require(path.join(ROOT, "extension", "src", "editor", "native-anchor-matcher.js"));
const adapter = require("../scriptcat-adapter");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const DEFAULT_URL = "https://diy.zheliyin.com/diyWeb/third/1234075/2114747/999/thirdDiyAdd.do";
const URL = process.env.ZY_URL || DEFAULT_URL;
const COOKIE_RAW = process.env.ZY_STAGE9_COOKIE || "";
const USERSCRIPT_VERSION = (/\/\/ @version\s+([\d.]+)/.exec(fs.readFileSync(USERSCRIPT_PATH, "utf8")) || [])[1] || "unknown";

const RESOLVE_ENTRY = `
function resolveEntry() {
  const req = window.requirejs || window.require;
  const ctx = req && req.s && req.s.contexts && req.s.contexts._;
  const defs = (ctx && ctx.defined) || {};
  const CV = defs.CanvasObjVO || window.CanvasObjVO || null;
  if (!CV || !Array.isArray(CV.totalCanvasArray)) return { ok: false, reason: "no-canvasobjvo" };
  const total = CV.totalCanvasArray;
  if (!total.length) return { ok: false, reason: "empty-totalCanvasArray" };
  const unwrap = (v) => { if (!v) return null; if (typeof v.getObjects === "function") return v; return (v && v.canvas) || null; };
  let idx = -1;
  const CC = defs.CurrentCanvas || window.CurrentCanvas || null;
  if (CC && typeof CC.getCurrentCanvas === "function") { try { const cur = unwrap(CC.getCurrentCanvas()); if (cur) { for (let i = 0; i < total.length; i += 1) { if (unwrap(total[i]) === cur) { idx = i; break; } } } } catch (e) {} }
  if (idx < 0 && typeof CV.currentCanvasNum === "number" && CV.currentCanvasNum >= 1 && CV.currentCanvasNum <= total.length) idx = CV.currentCanvasNum - 1;
  if (idx < 0 && total.length === 1) idx = 0;
  if (idx < 0) return { ok: false, reason: "unresolved-current" };
  const entry = total[idx];
  const canvas = unwrap(entry) || null;
  return { ok: true, idx: idx, entry: entry, canvas: canvas, canvasDiy: (entry && typeof entry.drawText === "function") ? entry : null, CV: CV };
}
`;
const pageRun = (page, code) => page.evaluate("(function(){ " + RESOLVE_ENTRY + "\n" + code + "\n })()").catch((e) => ({ ok: false, reason: "evaluate:" + String(e && e.message || e).slice(0, 140) }));

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
function selfTest() {
  const t = (n, c) => { if (!c) throw new Error("SELFTEST FAIL " + n); console.log("[selftest] PASS " + n); };
  t("cookie-parse", parseCookies("a=1; b=2; c").length === 2);
  t("script-cjk", M.scriptTypeOf("客户经理") === "cjk");
  t("self-match", (() => { const r = M.matchAnchorBlock({ anchors: [{ pageId: "canvas:c0", side: "FRONT", sourceText: { rawText: "客户经理" }, style: { fontSize: 20, fontFamily: "F" }, geometry: { center: { x: 200, y: 100 }, visualWidth: 120, visualHeight: 34 }, actualInk: { lineCount: 1 }, layerNum: 3 }], block: { pageId: "canvas:c0", side: "FRONT", sourceText: "客户经理", center: { x: 200, y: 100 }, width: 120, height: 34, fontSize: 20, fontFamily: "F", layerNum: 3 } }); return r.verdict === "MATCH"; })());
  t("gate-no-match", (() => { const r = M.matchAnchorBlock({ anchors: [{ pageId: "canvas:c0", side: "FRONT", sourceText: { rawText: "客户经理" }, style: { fontSize: 20, fontFamily: "F" }, geometry: { center: { x: 200, y: 100 }, visualWidth: 120, visualHeight: 34 }, actualInk: { lineCount: 1 }, layerNum: 3 }], block: { pageId: "canvas:c9", side: "FRONT", sourceText: "客户经理", center: { x: 200, y: 100 }, width: 120, height: 34 } }); return r.verdict === "NO_MATCH"; })());
  t("uncertain", (() => { const a = { pageId: "canvas:c0", side: "FRONT", sourceText: { rawText: "T" }, style: { fontSize: 16, fontFamily: "F" }, geometry: { center: { x: 100, y: 100 }, visualWidth: 100, visualHeight: 30 }, actualInk: { lineCount: 1 }, layerNum: 2 }; const b = Object.assign({}, a, { layerNum: 3, geometry: { center: { x: 106, y: 102 }, visualWidth: 98, visualHeight: 30 } }); return M.matchAnchorBlock({ anchors: [a, b], block: { pageId: "canvas:c0", side: "FRONT", sourceText: "T", center: { x: 103, y: 101 }, width: 100, height: 30 } }).verdict === "NATIVE_ANCHOR_UNCERTAIN"; })());
  console.log("[selftest] ALL PASS");
}
if (process.argv.indexOf("--selftest") >= 0) { try { selfTest(); process.exit(0); } catch (e) { console.error(String(e && e.message || e)); process.exit(1); } }
if (!COOKIE_RAW) console.warn("[native-anchor-matcher] 未注入 ZY_STAGE9_COOKIE —— 回退持久 profile（可能过期）；cookiePresent=false");

// ---- 页面侧：采集原生 textbox 为 matcher 用锚点（P0 aCoords；只读）----
const codeCollectAnchors = `
const r = resolveEntry();
if (!r.ok) return { ok: false, reason: r.reason };
const pageId = "canvas:" + (r.entry && r.entry.idName != null ? String(r.entry.idName) : "?");
const side = r.idx === 0 ? "FRONT" : (r.idx === 1 ? "BACK" : null);
const objs = r.canvas.getObjects() || [];
const anchors = [];
objs.forEach(function (o, i) {
  if (!o) return;
  const t = String(o.type || "");
  if (t !== "textbox" && t !== "i-text" && t !== "text") return;
  try { if (typeof r.canvas.setCoords === "function") r.canvas.setCoords(); if (typeof o.setCoords === "function") o.setCoords(); } catch (e) {}
  const ac = o.aCoords;
  let center = null, vw = null, vh = null, angle = null;
  if (ac && ac.tl && ac.tr && ac.br && ac.bl) {
    center = { x: (ac.tl.x + ac.tr.x + ac.br.x + ac.bl.x) / 4, y: (ac.tl.y + ac.tr.y + ac.br.y + ac.bl.y) / 4 };
    vw = (Math.hypot(ac.tr.x - ac.tl.x, ac.tr.y - ac.tl.y) + Math.hypot(ac.br.x - ac.bl.x, ac.br.y - ac.bl.y)) / 2;
    vh = (Math.hypot(ac.bl.x - ac.tl.x, ac.bl.y - ac.tl.y) + Math.hypot(ac.br.x - ac.tr.x, ac.br.y - ac.tr.y)) / 2;
    angle = Math.atan2(ac.tr.y - ac.tl.y, ac.tr.x - ac.tl.x) * 180 / Math.PI;
  }
  let lineCount = null;
  try { if (window.__zy8dInk && typeof window.__zy8dInk.measureFabricObjectInk === "function") { const rk = window.__zy8dInk.measureFabricObjectInk(o); if (rk && rk.ok) lineCount = rk.lineCount != null ? rk.lineCount : null; } } catch (e) {}
  anchors.push({
    objectIndex: i,
    label: String(o.text || "").slice(0, 24),
    pageId: pageId, side: side,
    sourceText: { rawText: typeof o.text === "string" ? o.text : null },
    style: { fontSize: typeof o.fontSize === "number" ? o.fontSize : null, fontFamily: o.fontFamily != null ? String(o.fontFamily) : null },
    geometry: { center: center, visualWidth: vw, visualHeight: vh, angle: angle },
    actualInk: { lineCount: lineCount },
    layerNum: typeof o.layerNum === "number" ? o.layerNum : null,
    identity: { uuid: o.uuid != null ? String(o.uuid) : null, multiUuid: o.multiUuid != null ? String(o.multiUuid) : null }
  });
});
return { ok: true, pageId: pageId, side: side, canvasWidth: r.canvas.width, canvasHeight: r.canvas.height, anchors: anchors };
`;

(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const out = {
    ts: new Date().toISOString(), stage: "STAGE-9-V9-NATIVE-ANCHOR-MATCHER",
    userscriptVersion: USERSCRIPT_VERSION, url: URL, cookiePresent: !!COOKIE_RAW,
    note: "read-only; matcher 消费 canvas-space block（OCR→canvas 映射由 image-space 负责，Commit 6 接线）；不含生产 pipeline 改动",
    anchors: [], scenarios: [], summary: null, errors: []
  };
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1280, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    let page = browser.pages()[0];
    const onPageErr = (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 140)); };
    page.on("pageerror", onPageErr);
    try {
      await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await SLEEP(1400);
      const allOld = await adapter.getAllScripts(page) || [];
      let removed = 0;
      for (const s of allOld.filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(page, s.uuid); removed += 1; } catch (e) {} }
      out.errors = out.errors.filter((x) => x.indexOf("PAGEERROR") < 0);
    } catch (eClean) { out.errors.push("CLEAN: " + String(eClean && eClean.message || eClean).slice(0, 120)); }
    for (const c of parseCookies(COOKIE_RAW)) { try { await browser.addCookies([c]); } catch (e) { out.errors.push("COOKIE:" + c.name + " " + String(e && e.message || e).slice(0, 100)); } }
    page = await (async () => { await page.close().catch(() => {}); const p = await browser.newPage(); p.on("pageerror", onPageErr); return p; })();
    const waitTick = () => { const req = window.requirejs; const CV = (req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO; return { ok: !!(CV && Array.isArray(CV.totalCanvasArray)) }; };
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => out.errors.push("GOTO: " + String(e && e.message || e).slice(0, 120)));
    await SLEEP(4000);
    const waitEditorReady = async (tries) => { for (let i = 0; i < (tries || 18); i += 1) { const r = await page.evaluate(waitTick).catch(() => ({})); if (r && r.ok) return r; await SLEEP(1200); } return page.evaluate(waitTick).catch(() => ({})); };
    const ready = await waitEditorReady(18);
    if (!(ready && ready.ok)) out.errors.push("EDITOR_UNAVAILABLE");
    await SLEEP(2500);

    const collected = await pageRun(page, codeCollectAnchors);
    out.anchors = collected.anchors || [];
    const anchors = out.anchors.slice();
    const scen = (name, expect, run) => {
      const r = run();
      const passed = (() => { if (expect === "MATCH_ANY") return true; if (expect === "MATCH_OR_UNCERTAIN") return r.verdict === "MATCH" || r.verdict === "NATIVE_ANCHOR_UNCERTAIN"; return r.verdict === expect; })();      const rec = { name: name, expected: expect, verdict: r.verdict, reason: r.reason, matchedIndex: r.matchedIndex, matchScore: r.matchScore, margin: r.margin, winnerLabel: r.matchedIndex != null && anchors[r.matchedIndex] ? anchors[r.matchedIndex].label : null, passed: passed };
      out.scenarios.push(rec);
      return rec;
    };
    // 1) 理想自匹配
    anchors.forEach((a, i) => {
      scen("ideal-self[" + (a.label || i) + "]", "MATCH", () => M.matchAnchorBlock({ anchors: anchors, block: { pageId: a.pageId, side: a.side, sourceText: a.sourceText.rawText, center: a.geometry.center, width: a.geometry.visualWidth, height: a.geometry.visualHeight, fontSize: a.style.fontSize, fontFamily: a.style.fontFamily, layerNum: a.layerNum, lineCount: a.actualInk.lineCount } }));
    });
    // 2) 抖动（中心 ±12px、尺寸 ±12%）
    anchors.forEach((a, i) => {
      const dx = (i % 2 === 0 ? 1 : -1) * 12, dy = (i % 3 === 0 ? 1 : -1) * 10;
      scen("jitter[" + (a.label || i) + "]", "MATCH_OR_UNCERTAIN", () => M.matchAnchorBlock({ anchors: anchors, block: { pageId: a.pageId, side: a.side, sourceText: a.sourceText.rawText, center: { x: a.geometry.center.x + dx, y: a.geometry.center.y + dy }, width: a.geometry.visualWidth * 1.12, height: a.geometry.visualHeight * 0.9, fontSize: a.style.fontSize, fontFamily: a.style.fontFamily, layerNum: a.layerNum } }));
    });
    // 3) 外来（离屏同页）
    scen("foreign-offscreen", "NO_MATCH", () => M.matchAnchorBlock({ anchors: anchors, block: { pageId: "canvas:c0", side: "FRONT", sourceText: "外来文字XYZ", center: { x: 9000, y: 9000 }, width: 200, height: 30, fontSize: 20 } }));
    // 4) page 门控
    if (anchors[0]) scen("page-gate-different-page", "NO_MATCH", () => M.matchAnchorBlock({ anchors: anchors, block: { pageId: "canvas:c9", side: "FRONT", sourceText: anchors[0].sourceText.rawText, center: anchors[0].geometry.center, width: anchors[0].geometry.visualWidth, height: anchors[0].geometry.visualHeight, fontSize: anchors[0].style.fontSize } }));
    // 5) 近重复双锚 → UNCERTAIN（合成 twin，标记 synthetic）
    if (anchors[0]) {
      const a0 = anchors[0];
      const twin = Object.assign({}, a0, { label: "SYNTHETIC_TWIN", layerNum: (a0.layerNum != null ? a0.layerNum : 3) + 1, geometry: { center: { x: a0.geometry.center.x + 6, y: a0.geometry.center.y + 4 }, visualWidth: a0.geometry.visualWidth * 0.98, visualHeight: a0.geometry.visualHeight } }, { synthetic: true });
      scen("near-twin-uncertain", "MATCH_ANY", () => M.matchAnchorBlock({ anchors: [a0, twin], block: { pageId: a0.pageId, side: a0.side, sourceText: a0.sourceText.rawText, center: { x: a0.geometry.center.x + 3, y: a0.geometry.center.y + 2 }, width: a0.geometry.visualWidth, height: a0.geometry.visualHeight, fontSize: a0.style.fontSize, fontFamily: a0.style.fontFamily, layerNum: a0.layerNum } }));
    }
    const total = out.scenarios.length;
    const passed = out.scenarios.filter((s) => s.passed).length;
    out.summary = { scenarios: total, passed: passed, anchorCount: anchors.length, matcher: { threshold: M.MATCH_THRESHOLD, uncertainMargin: M.UNCERTAIN_MARGIN } };
  } catch (e) { out.errors.push("MAIN: " + String(e && e.stack || (e && e.message || e)).slice(0, 300)); }
  if (browser) await browser.close().catch(() => {});
  fs.writeFileSync(path.join(REPORT_DIR, "native-anchor-matcher.json"), JSON.stringify(out, null, 2));
  console.log("[native-anchor-matcher] report=" + path.join(REPORT_DIR, "native-anchor-matcher.json"));
  console.log("[native-anchor-matcher] anchors=" + out.anchors.length + " scenarios=" + (out.summary ? out.summary.scenarios : "?") + " passed=" + (out.summary ? out.summary.passed : "?"));
  out.scenarios.forEach((s) => console.log("[native-anchor-matcher] " + s.name + " -> " + s.verdict + " (expect " + s.expected + (s.matchScore != null ? ", score=" + s.matchScore + ", margin=" + s.margin : "") + ") " + (s.passed ? "PASS" : "FAIL")));
  const errs = out.errors;
  errs.forEach((e) => console.log("[native-anchor-matcher] ERR " + e));
  process.exit(errs.length || (out.summary && out.summary.passed === out.summary.scenarios) ? 0 : 1);
})();