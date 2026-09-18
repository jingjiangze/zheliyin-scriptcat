// 诊断: 运行时 addText/drawText2 原型形态 + 报错栈
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";

(async () => {
  const report = { diag: {} };
  let browser = null, page = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    page = browser.pages()[0];
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const readyEval = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = (req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO;
      const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
      return { ok: !!(d && d.canvas && typeof d.drawText === "function") };
    }).catch(() => ({ ok: false }));
    let ok = false;
    const d1 = Date.now() + 150000;
    while (Date.now() < d1) { ok = await readyEval(); if (ok && ok.ok) break; await page.waitForTimeout(2000); }
    report.ready = !!(ok && ok.ok);

    report.diag = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = (req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO;
      const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
      const out = { hasDraw: typeof d.drawText, hasAddText: typeof d.addText, hasDrawText2: typeof d.drawText2, drawTextStr: null, addTextStr: null, drawText2Str: null, callAddErr: null, callDraw2Err: null, drawTextErr: null, canvasStr: (typeof d.canvas.add) };
      try { out.drawTextStr = String(d.drawText).slice(0, 220); } catch (e) { out.drawTextStr = "ERR " + e; }
      try { out.addTextStr = String(d.addText).slice(0, 220); } catch (e) { out.addTextStr = "ERR " + e; }
      try { out.drawText2Str = String(d.drawText2).slice(0, 220); } catch (e) { out.drawText2Str = "ERR " + e; }
      try { d.addText("DIAG_ADD_TEXT"); out.addTextOk = true; } catch (e) { out.callAddErr = String(e && e.message || e).slice(0, 240) + " || " + String(e && e.stack || "").slice(0, 400); }
      try { d.drawText2("DIAG_DT2", 18, 0, 0, null, null, null, null, null, true); out.draw2Ok = true; } catch (e) { out.callDraw2Err = String(e && e.message || e).slice(0, 240) + " || " + String(e && e.stack || "").slice(0, 400); }
      try {
        const entry = { media: { mediaType: "text", text: "DIAG_DT", font: { pointSize: 18, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "556", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.3, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: 50, y: 50, width: 180, height: 34, factWidth: 180, factHeight: 34, rotation: 0 }, printLocation: { x: 50, y: 50, width: 180, height: 34, rotation: 0 }, layer: { alpha: 1 }, layerNum: d.canvasObjInfo.canvasToProductObjArr.length, isEdit: 1, isDisplay: 1, deleteState: 0, visitLevel: 1, multiUuid: "diag" + Date.now() % 1000, markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0, lowPixelFlag: 0, selectEnabled: 1, isDesign: 1, isComposite: 0, isPreview: 0, isDesignShape: 0 };
        d.drawText("DIAG_DT", null, null, null, entry, d.canvasObjInfo.canvasToProductObjArr.length);
        out.drawTextOk = true;
      } catch (e) { out.drawTextErr = String(e && e.message || e).slice(0, 240) + " || " + String(e && e.stack || "").slice(0, 400); }
      return out;
    }).catch((e) => ({ evalErr: String(e || "").slice(0, 300) }));
  } catch (e) {
    report.fatal = String(e && e.message || e).slice(0, 300);
  } finally {
    try { page && await page.close(); } catch (e) {}
    try { browser && await browser.close(); } catch (e) {}
  }
  fs.writeFileSync(path.join(__dirname, "reports", "p0-diag-addtext.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2).slice(0, 3500));
})().catch((e) => { console.error("FATAL", e); process.exit(1); });