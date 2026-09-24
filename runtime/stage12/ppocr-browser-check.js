// runtime/stage12/ppocr-browser-check.js — Stage 12 M3b/V2：真实浏览器内跑通 PP-OCRv6
// ---------------------------------------------------------------------------
// 目的（证据等级：REAL_BROWSER_LOCAL，非站点真机）：
//   1) 在真实 Chrome 内加载 onnxruntime-web（CDN）+ 本仓库 6 个 OCR 模块
//   2) 用真实模型字节（本地 assets）经 ppocr-engine-loader 加载（fetch+sha256 校验+缓存）
//   3) 在 canvas 上绘制名片样张 → provider.recognize 端到端 → 输出候选文本/框
//   4) 用真实模型定参：对比 channelOrder(bgr/rgb) × useSpaceChar(false/true) 的识别准确率
// 隔离：独立 user-data-dir（runtime/browser/profile-ocr12），不触碰真机 profile-usc3；
//      模型/页面走 Playwright route 本地回放，ORTH 运行时走 CDN（与现状 Tesseract 同源）。
// 用法：node runtime/stage12/ppocr-browser-check.js
// =====================================================================
"use strict";
const path = require("path");
const fs = require("fs");
const { launchDedicated } = require("../browser-launcher.js");

const ROOT = path.resolve(__dirname, "../..");
const ASSET_DIR = path.join(ROOT, "assets/ocr/ppocrv6");
const MANIFEST_PATH = path.join(ASSET_DIR, "ppocrv6-models.json");
const MANIFEST = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const MODULES = [
  "db-det-postprocess.js", "det-params.js", "ppocr-image-ops.js",
  "ppocr-rec-decode.js", "ppocr-engine-loader.js", "ppocr-ort-session.js", "ppocr-provider.js"
];
const ORT_URL = process.env.ZY_ORT_URL || "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort.min.js";
const ORT_DIST = ORT_URL.replace(/ort(\.min)?\.js.*$/, "");
const PROFILE_DIR = path.join(ROOT, "runtime/browser/profile-ocr12");
const REPORT_PATH = path.join(ROOT, "runtime/reports/stage-12/ppocr-browser-check.json");

// 名片样张（真实绘制）：文案 + 位置 + 字号
const LINES = [
  { text: "佛山盛盈包装制品有限公司", x: 40, y: 60, font: 34 },
  { text: "王晓明", x: 40, y: 120, font: 30 },
  { text: "销售总监", x: 40, y: 175, font: 26 },
  { text: "电话：13800138000", x: 40, y: 225, font: 24 }
];
const IMG_W = 700, IMG_H = 300;

function toLocalPath(url) {
  // https://raw.githubusercontent.com/<owner>/<repo>/<branch>/assets/ocr/ppocrv6/xxx → 本地 assets 路径
  const m = /\/assets\/ocr\/ppocrv6\/(.+)$/.exec(url);
  return m ? path.join(ASSET_DIR, m[1]) : null;
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

(async () => {
  const report = { ts: new Date().toISOString(), ortUrl: ORT_URL, profile: path.basename(PROFILE_DIR), lines: LINES.map((l) => l.text), variants: [], picked: null, ok: false };
  const { browser, page, exe } = await launchDedicated({ profileDir: PROFILE_DIR, headless: true });
  report.browserExe = exe;
  try {
    page.on("console", (msg) => {
      const t = msg.text();
      if (/error|fail|exception/i.test(t)) console.log("  [page]", t.slice(0, 300));
    });
    // 本地回放：页面 origin 用 https://local.test（安全上下文 → crypto.subtle 可用）
    await page.route("https://local.test/**", (route) => {
      route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: "<!doctype html><html><head><meta charset='utf-8'></head><body></body></html>" });
    });
    // 资产回放：把清单里的 URL 映射到本地真实字节
    await page.route("https://raw.githubusercontent.com/**", (route) => {
      const local = toLocalPath(route.request().url());
      if (!local || !fs.existsSync(local)) return route.fulfill({ status: 404, body: "" });
      return route.fulfill({ status: 200, contentType: "application/octet-stream", body: fs.readFileSync(local) });
    });
    await page.goto("https://local.test/blank.html", { waitUntil: "load" });
    console.log("[1/5] 页面就绪 origin=", await page.evaluate(() => location.origin));
    await page.addScriptTag({ url: ORT_URL });
    const ortVersion = await page.evaluate(() => (window.ort && window.ort.env && window.ort.env.versions && window.ort.env.versions.common) || null);
    report.ortVersion = ortVersion;
    console.log("[2/5] ort 加载版本 =", ortVersion);
    for (const m of MODULES) await page.addScriptTag({ path: path.join(ROOT, "extension/src/ocr", m) });
    console.log("[3/5] 模块注入完成 =", await page.evaluate(() => MODULES_LOADED = ["dbDetPostprocess", "resolveDetParams", "buildDetTensor", "ctcGreedyDecode", "createOrtSessions", "createPaddleOcrProvider"].every((n) => typeof globalThis[n] === "function")));

    // 4) 真实加载：loader（fetch + sha256 + IndexedDB 简化缓存）→ ORT sessions
    const loadResult = await page.evaluate(async ({ manifest, ortDist }) => {
      const fetchBytes = async (url) => {
        const r = await fetch(url);
        if (!r.ok) return null;
        return new Uint8Array(await r.arrayBuffer());
      };
      const sha256 = async (bytes) => {
        const d = await crypto.subtle.digest("SHA-256", bytes);
        return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
      };
      const cacheMap = new Map();
      const cache = { get: async (k) => cacheMap.get(k) || null, put: async (k, v) => { cacheMap.set(k, v); } };
      const parsed = parseModelManifest(manifest);
      if (!parsed.ok) return { ok: false, stage: "manifest", errors: parsed.errors };
      const plan = resolveModelPlan(parsed.manifest, { tier: "tiny", needCls: true });
      if (!plan.ok) return { ok: false, stage: "plan", errors: plan.errors };
      const t0 = performance.now();
      const loaded = await loadModelAssets({ plan: plan.plan, fetchBytes, sha256, cache });
      const loadMs = Math.round(performance.now() - t0);
      if (!loaded.ok) return { ok: false, stage: "load", errors: loaded.errors, meta: loaded.meta };
      // 第二次（缓存命中）验证
      const t1 = performance.now();
      const second = await loadModelAssets({ plan: plan.plan, fetchBytes, sha256, cache });
      const cacheMs = Math.round(performance.now() - t1);
      const sess = await createOrtSessions({
        ort: window.ort,
        assets: { det: loaded.assets.det, rec: loaded.assets.rec, cls: loaded.assets.cls },
        ortEnv: { numThreads: 1, wasmPaths: ortDist }
      });
      if (!sess.ok) return { ok: false, stage: "ort", errors: sess.errors, loadMeta: loaded.meta };
      window.__zySessions = sess.sessions; // 供后续变体对比复用（同一页面上下文）
      return {
        ok: true,
        loadMs, cacheMs,
        dict: loaded.assets.dict,
        dictSize: loaded.assets.dict.length,
        downloaded: loaded.meta.downloaded,
        cached: second.meta.cached,
        roles: sess.meta.roles,
        ortVersion: sess.meta.ortVersion
      };
    }, { manifest: MANIFEST, ortDist: ORT_DIST });
    if (!loadResult.ok) { report.loadError = loadResult; throw new Error("加载/会话失败: " + JSON.stringify(loadResult)); }
    report.load = { loadMs: loadResult.loadMs, cacheHitMs: loadResult.cacheMs, downloadedFirst: loadResult.downloaded, cachedSecond: loadResult.cached, roles: loadResult.roles };
    console.log("[4/5] 模型加载 loadMs=", loadResult.loadMs, "角色=", loadResult.roles.map((r) => r.role + "(" + r.inputNames + "→" + r.outputNames + ")").join(" "));

    // 5) 真实绘制 + 多组合跑通
    const variants = await page.evaluate(async ({ lines, imgW, imgH, dict }) => {
      const cv = document.createElement("canvas");
      cv.width = imgW; cv.height = imgH;
      const ctx = cv.getContext("2d");
      // 彩色样张：奶白底 + 深蓝字（BGR/RGB 通道序在灰度图下无差异，必须用彩色才能定参）
      ctx.fillStyle = "#fdf6e3"; ctx.fillRect(0, 0, imgW, imgH);
      ctx.fillStyle = "#1a3e8c";
      for (const l of lines) { ctx.font = l.font + "px 'Microsoft YaHei', sans-serif"; ctx.fillText(l.text, l.x, l.y); }
      const imgData = ctx.getImageData(0, 0, imgW, imgH);
      const image = { data: imgData.data, width: imgW, height: imgH, channels: 4 };
      const outs = [];
      for (const channelOrder of ["bgr", "rgb"]) {
        for (const useSpaceChar of [false, true]) {
          const cs = buildRecCharset(dict, { useSpaceChar });
          const provider = createPaddleOcrProvider({
            session: window.__zySessions, charset: cs.charset, tier: "tiny", channelOrder, ops: {}
          });
          const t0 = performance.now();
          const r = await provider.recognize(image, { scenario: "card" });
          outs.push({
            channelOrder, useSpaceChar,
            charsetSize: cs.size,
            ms: Math.round(performance.now() - t0),
            boxes: (r.meta && r.meta.det && r.meta.det.boxes) || 0,
            candidates: (r.candidates || []).map((c) => ({ text: c.text, conf: Math.round(c.confidence * 1000) / 1000, y: Math.round(c.bbox.y), x: Math.round(c.bbox.x), w: Math.round(c.bbox.width), h: Math.round(c.bbox.height) })),
            error: r.error ? { code: r.error.errorCode, message: r.error.errorMessage } : null,
            params: r.meta && r.meta.params ? { thresh: r.meta.params.thresh, boxThresh: r.meta.params.boxThresh, unclipRatio: r.meta.params.unclipRatio, limitSideLen: r.meta.params.limitSideLen, minSize: r.meta.params.minSize } : null,
            reasons: (r.meta && r.meta.paramsReasons || []).map((x) => x.rule)
          });
        }
      }
      return { imageSize: [imgW, imgH], outs };
    }, { lines: LINES, imgW: IMG_W, imgH: IMG_H, dict: loadResult.dict });
    // 计算每条期望文案与「按 y 最近候选」的字符准确率
    report.imageSize = variants.imageSize;
    for (const v of variants.outs) {
      const accs = LINES.map((l) => {
        const expectedY = l.y - l.font * 0.35;
        let best = null, bestDy = Infinity;
        for (const c of v.candidates) { const dy = Math.abs(c.y - expectedY); if (dy < bestDy) { bestDy = dy; best = c; } }
        return { expect: l.text, got: best ? best.text : "", acc: best ? Math.round(charAcc(best.text, l.text) * 1000) / 1000 : 0 };
      });
      v.accuracy = accs;
      v.meanAcc = Math.round(accs.reduce((s, x) => s + x.acc, 0) / accs.length * 1000) / 1000;
      report.variants.push(v);
    }
    report.variants.sort((a, b) => b.meanAcc - a.meanAcc);
    report.picked = report.variants[0];
    report.ok = report.picked.meanAcc >= 0.6 && report.picked.boxes >= 2;
    console.log("[5/5] 组合对比（按字符准确率降序）：");
    for (const v of report.variants) {
      console.log("   channelOrder=" + v.channelOrder + " useSpaceChar=" + v.useSpaceChar + " 框=" + v.boxes + " 平均字符准确率=" + v.meanAcc + " 耗时=" + v.ms + "ms 文本=" + JSON.stringify(v.candidates.map((c) => c.text)));
    }
    for (const a of report.picked.accuracy) console.log("     期望[" + a.expect + "] 实得[" + a.got + "] acc=" + a.acc);
  } catch (e) {
    report.error = String(e && (e.message || e)).slice(0, 400);
    console.error("FAIL:", report.error);
  } finally {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    await browser.close().catch(() => {});
  }
  console.log("报告 →", REPORT_PATH, "ok=" + report.ok);
  process.exit(report.ok ? 0 : 1);
})();