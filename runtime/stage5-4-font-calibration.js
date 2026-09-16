// runtime/stage5-4-font-calibration.js — Stage 5.4 §二十九~§三十三 P8：Font Calibration（真实测量，非猜测比例）
// 真实编辑器：同源 createTextObject 创建「思源黑体 Regular」textbox（fontSize 12..72；短/中/长文本），
// 逐个测量 fabric visualBounds → 校准表（visualHeight/fontSize ratio）+ 反推公式。
// 测量对象立即清理（rollback 零残留）。
// 输出：reports/stage5-4-font-calibration.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";
const FONT = "思源黑体 Regular";
const SIZES = [12, 16, 20, 24, 28, 32, 36, 48, 60, 72];
const SHORT = "测试";
const MID = "华创科技有限公司";
const LONG = "深圳市南山区深南大道9988号科技大厦A座12层";

function extractFunctions(src, names) {
  const out = {};
  for (const name of names) {
    const marker = "function " + name + "(";
    const i = src.indexOf(marker);
    if (i < 0) throw new Error("not found " + name);
    const bs = src.indexOf("{", i);
    let depth = 0, j = bs, inStr = null;
    while (j < src.length) {
      const ch = src[j];
      if (inStr) { if (ch === "\\") { j += 2; continue; } if (ch === inStr) inStr = null; }
      else if (ch === "'" || ch === '"' || ch === "`") inStr = ch;
      else if (ch === "{") depth += 1;
      else if (ch === "}") { depth -= 1; if (depth === 0) break; }
      j += 1;
    }
    out[name] = src.slice(i, j + 1);
  }
  return out;
}

(async () => {
  const out = { ts: new Date().toISOString(), stage: "Stage 5.4 font-calibration", steps: [], errors: [], samples: [] };
  const step = (n, ok, d, ev) => { out.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 700), evidence: ev || "n/a" }); if (!ok) out.errors.push(n); };
  let browser = null;
  const fns = extractFunctions(fs.readFileSync(path.join(__dirname, "..", "extension", "src", "editor", "page-bridge.js"), "utf8"), ["createTextObject", "inheritReferenceProps", "getReferenceStyle"]);
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    const page = browser.pages()[0];
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => step("nav", false, String(e && e.message || e)));
    step("nav", true, "真实编辑器已打开", "REAL_EDITOR");
    const deadline = Date.now() + 150000;
    let ready = false;
    while (Date.now() < deadline) {
      ready = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const vo = req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO;
        return !!vo;
      }).catch(() => false);
      if (ready) break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    step("editor-ready", ready, "CanvasObjVO 就绪", "REAL_EDITOR");
    if (!ready) return;

    const before = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      return c.getObjects().length;
    });

    // 页面内测量器：逐个 size × text 创建 → 测量 → 删除
    const samples = await page.evaluate(({ fnsSrc, font, sizes, short, mid, long }) => {
      const srcJoin = Object.keys(fnsSrc).map((k) => fnsSrc[k]).join("\n");
      let createTextObject;
      try { const factory = new Function("return (function(){ " + srcJoin + "\nreturn { createTextObject: createTextObject, getReferenceStyle: getReferenceStyle }; })();")(); createTextObject = factory.createTextObject; } catch (e) { return { __err: String(e && e.message || e) }; }
      const req = window.requirejs || window.require;
      const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      const ref = c.getObjects().find((o) => o && typeof o.text === "string");
      const setText = (o, t) => { if (typeof o.setText === "function") o.setText(t); else o.text = t; o.text = t; o.dirty = true; if (typeof o.initDimensions === "function") o.initDimensions(); };
      const samplesOut = [];
      let cursor = 5;
      sizes.forEach((fs) => {
        [["short", short], ["mid", mid], ["long", long]].forEach(([cls, text]) => {
          const o = createTextObject(c, text, ref, 99, null);
          if (!o) return;
          o.set({ left: 30, top: cursor, width: 420, fontSize: fs, fontFamily: font, textAlign: "left" });
          setText(o, text);
          cursor += 40;
          let vb = null;
          try { if (typeof o.getBoundingRect === "function") { const r = o.getBoundingRect(); vb = { left: r.left, top: r.top, width: r.width, height: r.height }; } } catch (e) {}
          samplesOut.push({ fontSize: fs, textLenClass: cls, textLen: text.length, objHeight: o.height, visualHeight: vb ? vb.height : null, visualWidth: vb ? vb.width : null, ratio: vb && vb.height ? +(vb.height / fs).toFixed(3) : null });
        });
      });
      // 清理测量对象（zyFieldKey 打标后删除）
      c.getObjects().slice().forEach((o) => { if (o.zyCreatedByAssistant) { c.remove(o); } });
      if (c.requestRenderAll) c.requestRenderAll();
      return { samples: samplesOut, count: c.getObjects().length };
    }, { fnsSrc: fns, font: FONT, sizes: SIZES, short: SHORT, mid: MID, long: LONG }).catch((e) => ({ __err: String(e && e.message || e) }));

    if (samples.__err) { step("calibration", false, samples.__err, "n/a"); }
    else {
      out.samples = samples.samples;
      // 单行样本 = short（2 字必单行）；mid 6 字在 420px 宽下通常单行；long 会换行 → 单独标记 multiLine
      const singleLine = samples.samples.filter((s) => s.textLenClass !== "long");
      const multiLine = samples.samples.filter((s) => s.textLenClass === "long");
      const withVis = singleLine.filter((s) => s.visualHeight != null);
      const ratios = withVis.map((s) => s.ratio);
      const shortOnes = withVis.filter((s) => s.textLenClass === "short");
      const shortMean = shortOnes.length ? shortOnes.reduce((a, s) => a + s.ratio, 0) / shortOnes.length : null;
      out.summary = {
        singleLineCount: withVis.length,
        multiLineCount: multiLine.length,
        ratioMin: ratios.length ? Math.min.apply(null, ratios) : null,
        ratioMax: ratios.length ? Math.max.apply(null, ratios) : null,
        ratioMean: ratios.length ? +(ratios.reduce((a, b) => a + b, 0) / ratios.length).toFixed(3) : null,
        // 短中文单行（2 字必单行）专用：最可靠校准段
        shortRatioMean: shortMean ? +shortMean.toFixed(3) : null,
        shortInvertFormula: shortMean ? "fontSize = " + (1 / shortMean).toFixed(3) + " * visualHeight" : null,
        // 反推公式（单行）：fontSize ≈ visualHeight / ratio
        invertFormula: ratios.length ? "fontSize = " + (1 / (ratios.reduce((a, b) => a + b, 0) / ratios.length)).toFixed(3) + " * visualHeight" : null,
        multiLineNote: "多行（long）高度随行数增长，不做单行反推；需行数估计（wide-box 检测）"
      };
      step("calibration-short", withVis.filter((s) => s.textLenClass === "short").length >= 8, "short samples=" + withVis.filter((s) => s.textLenClass === "short").length, "REAL_EDITOR");
      step("calibration-mean-ratio", !!(out.summary.ratioMean && out.summary.ratioMean > 0.9 && out.summary.ratioMean < 1.7), "mean(single-line)=" + out.summary.ratioMean + " min=" + out.summary.ratioMin + " max=" + out.summary.ratioMax + " invert=" + out.summary.invertFormula, "§三十② 真实测量");
      step("cleanup", samples.count === before, samples.count + " vs before " + before, "§36 rollback");
    }
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 500));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.writeFileSync(path.join(__dirname, "reports", "stage5-4-font-calibration.json"), JSON.stringify(out, null, 1), "utf8");
  console.log("[stage5-4-font-cal] errors=" + out.errors.length + " → reports/stage5-4-font-calibration.json");
  process.exit(out.errors.length ? 1 : 0);
})();