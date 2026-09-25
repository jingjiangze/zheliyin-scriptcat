// runtime/stage12/m3c-browser-check.js — Stage 12 M3c：真实 Chrome 内验证「主链接线产物」
// ---------------------------------------------------------------------------
// 与 M3b（ppocr-browser-check.js）的差异：
//   M3b 直接调 provider 验证引擎本身；M3c 走 userscript 主链的真实路径：
//     1) 沙箱侧资产准备（= ensurePpocrEngine 等价物：ORT 源码 + 模块源码 + 清单→字节 + SHA-256 校验）
//     2) 执行器源码 = ppocr-bridge.buildPpocrExecutorSource（userscript @require 的同一文件）
//        + new Function 语法自检（防「内联字符串语法错 → 脚本不执行 → 死等超时」）
//     3) 请求 = ppocr-bridge.buildPpocrRequest（沙箱侧同一构造函数）→ postMessage 进页面世界
//     4) 结果从 document.documentElement[data-zy-ocr-result] 读回 → parsePpocrResult 归一
// 断言（缺一不可）：
//   ① 与 M3b 基线（ppocr-browser-check.json picked）逐行文本一致（字符准确率=1）+ 几何 ±8px
//   ② sidecar 目标分流：写 data-zy-sidecar-result 且不污染主属性
//   ③ 失败分支：非法请求必须写 ok:false（沙箱侧解析失败 → 调用方回退 Tesseract，绝不静默死等）
//   ④ 异源消息不触发引擎（属性保持空）
// 传输等价替换（harness 无 GM_*；只替换 I/O，不改契约）：
//   gmFetchText → fetch().text()   ｜ gmFetchBytes → 本地资产优先，其次 fetch().arrayBuffer()
//   ppocrSha256 → node crypto      ｜ CacheStorage → 内存 Map（durable:false，如实标注）
//   注：Playwright 边界不支持 ArrayBuffer 直传（实测到页面变 [object Object]）→ 字节字段以 Uint8Array
//       过界、页面侧 new Uint8Array(...) 复制为真 ArrayBuffer 后再 postMessage；模块源码 harness 读本地
//       文件（生产经 GM_xmlhttpRequest 从 test 分支 raw 拉取，同一份文件）。
// 隔离：独立 user-data-dir（runtime/browser/profile-ocr12-m3c），不触碰真机 profile-usc3。
// 用法：NODE_PATH=<repo>/node_modules node runtime/stage12/m3c-browser-check.js
// =====================================================================
"use strict";
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { launchDedicated } = require("../browser-launcher.js");
const B = require("../../extension/src/ocr/ppocr-bridge.js");
const L = require("../../extension/src/ocr/ppocr-engine-loader.js");

const ROOT = path.resolve(__dirname, "../..");
const ASSET_DIR = path.join(ROOT, "assets/ocr/ppocrv6");
const MANIFEST_PATH = path.join(ASSET_DIR, "ppocrv6-models.json");
const MODULES = [
  "db-det-postprocess.js", "det-params.js", "ppocr-image-ops.js",
  "ppocr-rec-decode.js", "ppocr-engine-loader.js", "ppocr-ort-session.js", "ppocr-provider.js"
];
const ORT_URL = process.env.ZY_ORT_URL || "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort.min.js";
const ORT_DIST = ORT_URL.replace(/ort(\.min)?\.js.*$/, "");
const PROFILE_DIR = path.join(ROOT, "runtime/browser/profile-ocr12-m3c");
const REPORT_PATH = path.join(ROOT, "runtime/reports/stage-12/m3c-browser-check.json");
const BASELINE_PATH = path.join(ROOT, "runtime/reports/stage-12/ppocr-browser-check.json");

// 桥属性（与 userscript 常量 PPOCR_MAIN_ATTR / PPOCR_SIDE_ATTR / PPOCR_READY_ATTR 一致）
const MAIN_ATTR = "data-zy-ocr-result";
const SIDE_ATTR = "data-zy-sidecar-result";
const READY_ATTR = "data-zy-ppocr-ready";

// 名片样张：必须与 M3b 逐字一致（同色同字同位置，几何/文本才可与基线比对）
const LINES = [
  { text: "佛山盛盈包装制品有限公司", x: 40, y: 60, font: 34 },
  { text: "王晓明", x: 40, y: 120, font: 30 },
  { text: "销售总监", x: 40, y: 175, font: 26 },
  { text: "电话：13800138000", x: 40, y: 225, font: 24 }
];
const IMG_W = 700, IMG_H = 300;
const BLANK_HTML = "<!doctype html><html><head><meta charset='utf-8'></head><body></body></html>";

// ---- 沙箱侧传输等价物 ----
function toLocalAsset(url) {
  const m = /\/assets\/ocr\/ppocrv6\/(.+)$/.exec(String(url));
  return m ? path.join(ASSET_DIR, m[1]) : null;
}
async function sandboxFetchText(url) {
  try { const r = await fetch(url); return r.ok ? await r.text() : null; } catch (e) { return null; }
}
async function sandboxFetchBytes(url) {
  const local = toLocalAsset(url);
  if (local && fs.existsSync(local)) return new Uint8Array(fs.readFileSync(local));
  try { const r = await fetch(url); return r.ok ? new Uint8Array(await r.arrayBuffer()) : null; } catch (e) { return null; }
}
const sandboxSha256 = (bytes) => Promise.resolve(crypto.createHash("sha256").update(Buffer.from(bytes)).digest("hex"));
function sandboxCache() {
  const m = new Map();
  return { durable: false, get: async (k) => m.get(k) || null, put: async (k, v) => { m.set(k, v); } };
}

// ---- 页面交互小工具 ----
const waitAttr = (page, attr, timeout) => page
  .waitForFunction((a) => document.documentElement.getAttribute(a) || null, attr, { timeout })
  .then((h) => h.jsonValue());

// 把 buildPpocrRequest 的请求送进页面世界（等价 production：清目标属性位 + window.postMessage(req, location.origin)）
async function postRequest(page, req, attr) {
  const packed = {
    source: req.source, target: req.target, dataUrl: req.dataUrl, dict: req.dict, tier: req.tier, ortDist: req.ortDist,
    det: req.det ? new Uint8Array(req.det) : null,
    rec: req.rec ? new Uint8Array(req.rec) : null,
    cls: req.cls ? new Uint8Array(req.cls) : null
  };
  await page.evaluate(({ attr, packed }) => {
    document.documentElement.setAttribute(attr, "");
    const msg = {
      source: packed.source, target: packed.target, dataUrl: packed.dataUrl, dict: packed.dict,
      tier: packed.tier, ortDist: packed.ortDist,
      det: packed.det ? new Uint8Array(packed.det).buffer : null,
      rec: packed.rec ? new Uint8Array(packed.rec).buffer : null,
      cls: packed.cls ? new Uint8Array(packed.cls).buffer : null
    };
    window.postMessage(msg, location.origin);
  }, { attr: attr, packed: packed });
}

function editDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i].concat(new Array(n).fill(0)));
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[m][n];
}
const charAcc = (got, exp) => (exp.length ? Math.max(0, 1 - editDistance(got, exp) / exp.length) : 0);
const brief = (lines) => (lines || []).map((l) => ({ text: l.text, conf: l.confidence == null ? null : Math.round(l.confidence * 1000) / 1000, x: Math.round(l.bbox.x), y: Math.round(l.bbox.y), w: Math.round(l.bbox.width), h: Math.round(l.bbox.height) }));

(async () => {
  const report = {
    ts: new Date().toISOString(), evidence: "REAL_BROWSER_LOCAL", ortUrl: ORT_URL, ortDist: ORT_DIST,
    profile: path.basename(PROFILE_DIR), imageSize: [IMG_W, IMG_H], lines: LINES.map((l) => l.text),
    engine: null, executor: null, main: null, baselineCompare: null, sidecar: null, failure: null, crossSource: null, ok: false
  };
  let browser = null;
  try {
    // ---- 1) 沙箱侧资产准备（对应 ensurePpocrEngine） ----
    const ortText = await sandboxFetchText(ORT_URL);
    if (!ortText || ortText.length < 10000) throw new Error("ORT 源码获取失败（网络/URL？）: " + ORT_URL);
    const modulesText = MODULES.map((f) => fs.readFileSync(path.join(ROOT, "extension/src/ocr", f), "utf8")).join("\n;\n");
    const parsedManifest = L.parseModelManifest(fs.readFileSync(MANIFEST_PATH, "utf8"));
    if (!parsedManifest.ok) throw new Error("清单非法: " + JSON.stringify(parsedManifest.errors));
    const plan = L.resolveModelPlan(parsedManifest.manifest, { tier: "tiny", needCls: true });
    if (!plan.ok) throw new Error("加载计划非法: " + JSON.stringify(plan.errors));
    const loaded = await L.loadModelAssets({ plan: plan.plan, fetchBytes: sandboxFetchBytes, sha256: sandboxSha256, cache: sandboxCache() });
    if (!loaded.ok) throw new Error("资产加载失败: " + JSON.stringify(loaded.errors));
    if (!loaded.assets.det || !loaded.assets.rec || !loaded.assets.cls || !loaded.assets.dict) throw new Error("资产角色缺失（det/rec/cls/dict）");
    report.engine = {
      ortBytes: ortText.length, moduleCount: MODULES.length, moduleBytes: modulesText.length,
      downloaded: loaded.meta.downloaded, cached: loaded.meta.cached, totalBytes: loaded.meta.totalBytes,
      loadMs: loaded.meta.elapsed, dictChars: loaded.assets.dict.length, durableCache: false
    };
    console.log("[1/6] 沙箱资产就绪：ORT " + ortText.length + "B ｜模块 " + MODULES.length + " 个 ｜模型 " + loaded.meta.totalBytes + "B（下载 " + loaded.meta.downloaded + "）｜字典 " + loaded.assets.dict.length + " 字符");

    // ---- 2) 执行器源码（userscript 主链同一生成器）+ 语法自检 ----
    const driver = B.buildPpocrExecutorSource({ ortText: ortText, modulesText: modulesText, mainAttr: MAIN_ATTR, sideAttr: SIDE_ATTR, readyAttr: READY_ATTR });
    // eslint-disable-next-line no-new-func
    new Function(driver);
    report.executor = { bytes: driver.length, syntaxOk: true };
    console.log("[2/6] 执行器源码生成 + 语法自检通过（" + driver.length + " 字符）");

    // ---- 3) 真实 Chrome 注入执行器 ----
    const launched = await launchDedicated({ profileDir: PROFILE_DIR, headless: true });
    browser = launched.browser;
    const page = launched.page;
    report.browserExe = launched.exe;
    page.on("console", (msg) => {
      const t = msg.text();
      if (/error|fail|exception/i.test(t)) console.log("  [page]", t.slice(0, 300));
    });
    await page.route("https://local.test/**", (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: BLANK_HTML }));
    await page.goto("https://local.test/m3c.html", { waitUntil: "load" });
    report.executor.secureContext = await page.evaluate(() => window.isSecureContext === true);
    await page.addScriptTag({ content: driver }); // 等价 GM_addElement("script", { textContent: driver })
    const ready = await page.waitForFunction((a) => document.documentElement.getAttribute(a) === "1", READY_ATTR, { timeout: 10000 }).then(() => true).catch(() => false);
    report.executor.ready = ready;
    if (!ready) throw new Error("执行器未就绪（注入被拦截 / 脚本未执行）");
    console.log("[3/6] 执行器注入就绪 ready=" + ready + " secureContext=" + report.executor.secureContext + " 页面就绪 origin=" + await page.evaluate(() => location.origin));

    // ---- 4) 样张 → 请求 → postMessage → 读属性 → 归一 ----
    const img = await page.evaluate(({ lines, imgW, imgH }) => {
      const cv = document.createElement("canvas");
      cv.width = imgW; cv.height = imgH;
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#fdf6e3"; ctx.fillRect(0, 0, imgW, imgH);
      ctx.fillStyle = "#1a3e8c";
      for (const l of lines) { ctx.font = l.font + "px 'Microsoft YaHei', sans-serif"; ctx.fillText(l.text, l.x, l.y); }
      return { dataUrl: cv.toDataURL("image/png"), width: imgW, height: imgH };
    }, { lines: LINES, imgW: IMG_W, imgH: IMG_H });
    const req = B.buildPpocrRequest({ target: "main", dataUrl: img.dataUrl, dict: loaded.assets.dict, tier: "tiny", ortDist: ORT_DIST, assets: loaded.assets });
    const t0 = Date.now();
    await postRequest(page, req, MAIN_ATTR);
    const rawMain = await waitAttr(page, MAIN_ATTR, 180000);
    const mainMs = Date.now() - t0;
    const main = B.parsePpocrResult(rawMain);
    report.main = { attrRoundTripMs: mainMs, ok: main.ok, code: main.code || null, engine: main.engine, boxes: main.boxes, width: main.width, height: main.height, lines: brief(main.lines), rawAttr: rawMain };
    if (!main.ok) throw new Error("主链失败：" + main.code + " " + main.message);
    if (!main.lines.length) throw new Error("主链 0 行候选（det/rec 未产出）");
    console.log("[4/6] 主链 ok 行=" + main.lines.length + " 框=" + main.boxes + " 属性往返=" + mainMs + "ms → " + JSON.stringify(main.lines.map((l) => l.text)));

    // ---- 4b) 与 M3b 基线比对（文本一致 + 几何 ±8px） ----
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
    const picks = (baseline.picked && baseline.picked.candidates) || [];
    const rows = picks.map((b) => {
      let best = null, bestDy = Infinity;
      for (const c of main.lines) { const dy = Math.abs(c.bbox.y - b.y); if (dy < bestDy) { bestDy = dy; best = c; } }
      return { expect: b.text, got: best ? best.text : "", acc: best ? Math.round(charAcc(best.text, b.text) * 1000) / 1000 : 0, dy: best ? Math.round(bestDy * 10) / 10 : null };
    });
    const meanAcc = rows.length ? Math.round(rows.reduce((s, r) => s + r.acc, 0) / rows.length * 1000) / 1000 : 0;
    const maxDy = rows.reduce((m, r) => Math.max(m, r.dy == null ? 1e9 : r.dy), 0);
    report.baselineCompare = { baselineTs: baseline.ts, baselinePicked: { channelOrder: baseline.picked.channelOrder, useSpaceChar: baseline.picked.useSpaceChar }, expect: picks.map((p) => p.text), rows: rows, meanAcc: meanAcc, maxDy: maxDy };
    const textOk = rows.length >= 3 && rows.every((r) => r.acc === 1);
    const geoOk = maxDy <= 8;
    console.log("[5/6] 基线比对 平均字符准确率=" + meanAcc + " 最大 y 偏移=" + maxDy + "px textOk=" + textOk + " geoOk=" + geoOk);
    for (const r of rows) console.log("     期望[" + r.expect + "] 实得[" + r.got + "] acc=" + r.acc + " dy=" + r.dy);

    // ---- 5b) sidecar 目标分流（写 sidecar 属性；主属性不得被污染） ----
    const sideReq = B.buildPpocrRequest({ target: "sidecar", dataUrl: img.dataUrl, dict: loaded.assets.dict, tier: "tiny", ortDist: ORT_DIST, assets: loaded.assets });
    const t1 = Date.now();
    await postRequest(page, sideReq, SIDE_ATTR);
    const rawSide = await waitAttr(page, SIDE_ATTR, 180000);
    const sideMs = Date.now() - t1;
    const side = B.parsePpocrResult(rawSide);
    const mainAfter = await page.evaluate((a) => document.documentElement.getAttribute(a), MAIN_ATTR);
    report.sidecar = { attrRoundTripMs: sideMs, ok: side.ok, code: side.code || null, lines: brief(side.lines), boxes: side.boxes, mainUntouched: mainAfter === rawMain };
    const sideOk = side.ok && side.lines.length >= 3 && report.sidecar.mainUntouched === true;
    console.log("      sidecar ok=" + side.ok + " 行=" + side.lines.length + " 复用会话=" + (sideMs < mainMs) + " 主属性未污染=" + report.sidecar.mainUntouched);

    // ---- 6) 失败分支（非法请求不得静默死等） + 异源消息（不得触发引擎） ----
    const badReq = B.buildPpocrRequest({ dataUrl: img.dataUrl, dict: loaded.assets.dict, tier: "tiny", ortDist: ORT_DIST, assets: {} }); // det/rec 缺失
    const t2 = Date.now();
    await postRequest(page, badReq, MAIN_ATTR);
    const rawBad = await waitAttr(page, MAIN_ATTR, 15000);
    const bad = B.parsePpocrResult(rawBad);
    report.failure = { writeMs: Date.now() - t2, ok: bad.ok, code: bad.code || null, message: bad.message || null, rawAttr: rawBad };
    const failOk = bad.ok === false && /request-missing/.test(String(bad.code));
    console.log("[6/6] 失败分支 ok=" + bad.ok + " code=" + bad.code + "（调用方据此回退 Tesseract）写回=" + report.failure.writeMs + "ms");
    await page.evaluate((a) => document.documentElement.removeAttribute(a), MAIN_ATTR);
    await page.evaluate(() => window.postMessage({ source: "not-zy-ppocr", target: "main", det: null }, location.origin));
    await page.waitForTimeout(400);
    const afterCross = await page.evaluate((a) => document.documentElement.getAttribute(a), MAIN_ATTR);
    report.crossSource = { attrAfter: afterCross, ignored: afterCross == null };
    const crossOk = report.crossSource.ignored === true;
    console.log("     异源消息 ignored=" + crossOk);

    report.ok = ready === true && report.executor.secureContext === true && textOk && geoOk && sideOk && failOk && crossOk;
  } catch (e) {
    report.error = String(e && (e.message || e)).slice(0, 400);
    console.error("FAIL:", report.error);
  } finally {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    if (browser) await browser.close().catch(() => {});
  }
  console.log("报告 →", REPORT_PATH, "ok=" + report.ok);
  process.exit(report.ok ? 0 : 1);
})();