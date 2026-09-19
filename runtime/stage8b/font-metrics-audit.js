// runtime/stage8b/font-metrics-audit.js — Stage 8B/8C STEP A/§3/§4：字体度量真值校准
// ---------------------------------------------------------------------
// PART 1（模板字体审计）：进入真实 252438，枚举所有真实 textbox ——
//   fontFamily / fontSize / fontWeight / fontStyle / lineHeight / charSpacing /
//   textAlign / width / height / scaleX / scaleY / angle / originX / originY /
//   getBoundingRect() / aCoords —— 判定生产真实默认字体（禁止假设"思源黑体 Regular"）。
// PART 2（字体度量校正）：同页面内对候选字体 × 字号[8,10,12,16,20,24,32,40,48,60] ×
//   样本[中文/中文长/数字/英文/中英混排] 执行：
//   measureText（advanceWidth / actualBoundingBox* / fontBoundingBox*）+
//   rasterize 像素 alpha bbox（rasterInkWidth / rasterInkHeight），
//   得到 fontSize → advance → ink → fontBox → raster 五级映射，供 STEP 5 决定字号求解目标。
// 零生产代码修改；纯取证。输出 runtime/reports/stage-8b/font-metrics-audit.json。
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("../../node_modules/playwright");
const adapter = require("../scriptcat-adapter");
const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const EXT_ID = adapter.EXT_ID;
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-8b");
const URL_252438 = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

// PART 2 校准矩阵
const FONT_CANDIDATES = ["SimHei", "siyuan", "sans-serif"]; // siyuan 由 PART 1 真实 fontFamily 回填
const SIZES = [8, 10, 12, 16, 20, 24, 32, 40, 48, 60];
const SAMPLES = [
  { id: "zh", text: "吴健湘" },
  { id: "zh-long", text: "佛山盛盈包装制品有限公司" },
  { id: "num", text: "+86 15913171583" },
  { id: "en", text: "sandy.wu@shengying.ltd" },
  { id: "mix", text: "Telephone: +86 15913171583" }
];

(async () => {
  const out = { ts: new Date().toISOString(), stage: "STAGE-8B-FONT-METRICS", url: URL_252438, templateFonts: null, calibration: [], errors: [] };
  let browser = null, page = null;
  let fonts = [], realFont = null;
  const ev = (fn, arg) => (arg === undefined ? page.evaluate(fn) : page.evaluate(fn, arg)).catch((e) => ({ err: String(e || "").slice(0, 200) }));
  const waitUntil = async (fnEval, desc, t0, poll) => { const t1 = Date.now(); while (Date.now() - t1 < t0) { const r = await ev(fnEval); if (r && r.ok) return { ok: true, ms: Date.now() - t1 }; await SLEEP(poll || 1500); } return { ok: false, desc }; };
  const canvasReady = () => () => { const req = window.requirejs || window.require; const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO); const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[0]) || null; return { ok: !!(d && d.canvas && typeof d.drawText === "function") }; };
  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1440, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    page = browser.pages()[0];
    await page.goto(URL_252438, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const w = await waitUntil(canvasReady(), "ready", 150000);
    if (!(w && w.ok)) throw new Error("editor not ready");
    await SLEEP(4000);

    // ================= PART 1：真实模板 textbox 审计 =================
    out.templateFonts = await ev(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
      const c = d && d.canvas;
      if (!c) return { ok: false, reason: "no canvas" };
      try { c.setCoords && c.setCoords(); } catch (e) {}
      const textObjs = c.getObjects().filter((o) => o && typeof o.text === "string" && String(o.text || "").trim());
      const fonts = {};
      const objects = textObjs.map((o) => {
        const fm = String(o.fontFamily || "").trim();
        fonts[fm] = (fonts[fm] || 0) + 1;
        const br = o.getBoundingRect ? o.getBoundingRect() : null;
        const ac = o.aCoords || null;
        return {
          source: "REAL_TEMPLATE_TEXT",
          text: String(o.text || "").slice(0, 12),
          fontFamily: o.fontFamily != null ? o.fontFamily : null,
          fontSize: o.fontSize != null ? o.fontSize : null,
          fontWeight: o.fontWeight != null ? o.fontWeight : null,
          fontStyle: o.fontStyle != null ? o.fontStyle : null,
          strokeWidth: o.strokeWidth,
          lineHeight: o.lineHeight != null ? o.lineHeight : null,
          charSpacing: o.charSpacing != null ? o.charSpacing : null,
          textAlign: o.textAlign != null ? o.textAlign : null,
          width: o.width, height: o.height, scaleX: o.scaleX, scaleY: o.scaleY,
          angle: o.angle, originX: o.originX, originY: o.originY, left: o.left, top: o.top,
          boundingRect: br ? { left: br.left, top: br.top, width: br.width, height: br.height } : null,
          aCoords: ac && ac.tl ? { tl: [ac.tl.x, ac.tl.y], tr: [ac.tr.x, ac.tr.y], br: [ac.br.x, ac.br.y], bl: [ac.bl.x, ac.bl.y] } : null
        };
      });
      return { ok: true, textCount: textObjs.length, fontCounts: fonts, objects: objects, canvas: { width: c.width, height: c.height, viewportTransform: c.viewportTransform ? Array.from(c.viewportTransform) : null, zoom: c.getZoom ? c.getZoom() : null, retina: c.getRetinaScaling ? c.getRetinaScaling() : null }, diy: { currentFactWidth: d.currentFactWidth, currentFactHeight: d.currentFactHeight, currentSize: d.currentSize } };
    });

    // PART 2 候选字体：真实模板字体回填到 siyuan 槽 + 保留 SimHei/sans-serif 对照
    realFont = out.templateFonts && out.templateFonts.ok && out.templateFonts.fontCounts ? Object.keys(out.templateFonts.fontCounts).sort((a, b) => (out.templateFonts.fontCounts[b] - out.templateFonts.fontCounts[a]))[0] : null;
    fonts = ["SimHei"].concat(realFont ? [realFont] : []).concat(["sans-serif"]);

    // ================= PART 2：字体度量校正（measureText + raster ink） =================
    out.calibration = await ev((arg) => {
      const rows = [];
      const fs = (f) => (f === "sans-serif") ? f : f; // css font 直接用
      const rasterInk = function (ctx, text, fontSize, fontCss) {
        const pad = 8;
        ctx.font = fontSize + "px " + fontCss;
        const m = ctx.measureText(text);
        const w = Math.ceil(m.width) + pad * 2;
        const h = fontSize * 2 + pad * 2;
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        const c2 = cv.getContext("2d");
        c2.clearRect(0, 0, w, h);
        c2.fillStyle = "#000";
        c2.font = ctx.font;
        c2.textBaseline = "top";
        c2.fillText(text, pad, pad);
        const d2 = c2.getImageData(0, 0, w, h).data;
        let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1, nonZero = 0;
        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) {
            if (d2[(y * w + x) * 4 + 3] > 24) { // alpha>24 视为墨迹
              nonZero += 1;
              if (x < minX) minX = x; if (x > maxX) maxX = x;
              if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
          }
        }
        const has = nonZero > 0;
        return { has, rasterInkWidth: has ? maxX - minX + 1 : 0, rasterInkHeight: has ? maxY - minY + 1 : 0, rasterInkLeft: has ? minX - pad : null, rasterInkTop: has ? minY - pad : null };
      };
      const ctx = document.createElement("canvas").getContext("2d");
      arg.fonts.forEach((fontCss) => {
        arg.sizes.forEach((size) => {
          arg.samples.forEach((s) => {
            try {
              ctx.font = size + "px " + fontCss;
              const m = ctx.measureText(s.text);
              const r = rasterInk(ctx, s.text, size, fontCss);
              const fAsc = typeof m.fontBoundingBoxAscent === "number" ? m.fontBoundingBoxAscent : 0;
              const fDesc = typeof m.fontBoundingBoxDescent === "number" ? m.fontBoundingBoxDescent : 0;
              rows.push({
                font: fontCss, sample: s.id, textLen: s.text.length, fontSize: size,
                advanceWidth: m.width,
                actualBoundingBoxAscent: m.actualBoundingBoxAscent, actualBoundingBoxDescent: m.actualBoundingBoxDescent,
                fontBoundingBoxAscent: fAsc, fontBoundingBoxDescent: fDesc,
                actualHeight: (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0),
                fontBoxHeight: fAsc + fDesc,
                rasterInkWidth: r.rasterInkWidth, rasterInkHeight: r.rasterInkHeight, rasterHas: r.has,
                // 归一化比率（FS=1 时的倍数）—— STEP 5 判定目标度量用
                ratioInk: ((m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0)) / size,
                ratioFontBox: (fAsc + fDesc) / size,
                ratioRaster: r.has ? r.rasterInkHeight / size : null
              });
            } catch (e) { rows.push({ font: fontCss, sample: s.id, fontSize: size, err: String(e && e.message || e).slice(0, 80) }); }
          });
        });
      });
      return rows;
    }, { fonts: fonts, sizes: SIZES, samples: SAMPLES });
    out.fonts = fonts;
    out.realFont = realFont;
  } catch (e) { out.errors.push(String(e && e.message || e).slice(0, 400)); }
  finally { try { page && await page.close(); } catch (e) {} try { browser && await browser.close(); } catch (e) {} }
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, "font-metrics-audit.json"), JSON.stringify(out, null, 2));
  // 摘要：每字体×样本 的 ratio（ink/fontBox/raster）
  const by = {};
  (out.calibration || []).forEach((r) => { if (r && r.ratioRaster != null) { const k = r.font + "|" + r.sample; by[k] = by[k] || []; by[k].push(r); } });
  console.log("STAGE-8B FONT-METRICS done fonts=" + JSON.stringify(fonts) + " realFont=" + realFont + " calRows=" + (out.calibration || []).length + " -> " + path.join(REPORT_DIR, "font-metrics-audit.json"));
  if (out.templateFonts && out.templateFonts.ok) console.log("TEMPLATE FONT COUNTS: " + JSON.stringify(out.templateFonts.fontCounts));
  Object.keys(by).slice(0, 12).forEach((k) => {
    const last = by[k][by[k].length - 1];
    const ink = (by[k].reduce((a, r) => a + r.ratioInk, 0) / by[k].length).toFixed(3);
    const fbox = (by[k].reduce((a, r) => a + r.ratioFontBox, 0) / by[k].length).toFixed(3);
    const rst = (by[k].reduce((a, r) => a + (r.ratioRaster || 0), 0) / by[k].length).toFixed(3);
    console.log("   " + k + " ink/fs=" + ink + " fontBox/fs=" + fbox + " raster/fs=" + rst + " (last fs=" + last.fontSize + " rasterH=" + last.rasterInkHeight + ")");
  });
})();