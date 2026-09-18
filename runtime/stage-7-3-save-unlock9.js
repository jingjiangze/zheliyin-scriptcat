// runtime/stage-7-3-save-unlock9.js — t4 v13：canvasToProductObjArr 结构对比（drawText 探针 vs 原生 rect）
// 判定序列化对象源：若 R() 校验的其实是 canvasToProductObjArr 中 media 条目的 location，
// 则 drawText 存入的条目与原生（LoadFromProductJsonCommand 填充）条目必存在结构差异 → 根因第二层闭环。
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-7-3-save-unlock9.json");

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-7.3-SAVE-UNLOCK9", url: EDITOR_URL, phases: {}, errors: [] };
  let browser = null;
  let page = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    browser.on("dialog", (d) => { d.accept().catch(() => {}); });
    page = browser.pages()[0];
    const readyEval = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = (vo && Array.isArray(vo.totalCanvasArray) && vo.totalCanvasArray[0]) || null;
      const c = d && (d.canvas || d);
      return { ok: !!(d && c && c.getObjects && typeof d.drawText === "function") };
    }).catch(() => ({ ok: false }));
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    let ok = false;
    const d1 = Date.now() + 150000;
    while (Date.now() < d1) { ok = await readyEval(); if (ok && ok.ok) break; await page.waitForTimeout(2000); }
    report.phases.ready = !!(ok && ok.ok);
    if (!ok) throw new Error("editor not ready after 150s");

    report.phases.dump = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const out = { probe: null, nativeRect: null, nativeLine: null, count: null };
      for (let i = 0; i < vo.totalCanvasArray.length; i++) {
        const d = vo.totalCanvasArray[i];
        if (!(d && d.canvasObjInfo && Array.isArray(d.canvasObjInfo.canvasToProductObjArr))) continue;
        const arr = d.canvasObjInfo.canvasToProductObjArr;
        out.count = arr.length;
        // 创建探针
        const baseLayer = arr.length;
        const uid = "zlyunlock9-" + Date.now() % 1000000;
        const entry = { media: { mediaType: "text", text: uid, font: { pointSize: 24, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "556", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.3, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: 100, y: 100, width: 200, height: 40, factWidth: 200, factHeight: 40, rotation: 0 }, printLocation: { x: 100, y: 100, width: 200, height: 40, rotation: 0 }, layer: { alpha: 1 }, layerNum: baseLayer, isEdit: 1, isDisplay: 1, deleteState: 0, visitLevel: 1, multiUuid: uid, markuuid: "" };
        if (typeof d.drawText === "function") d.drawText(uid, null, null, null, entry, baseLayer);
        const after = d.canvasObjInfo.canvasToProductObjArr;
        const pick = (o, tag) => {
          if (!o) return { tag: tag, err: "null" };
          const r = { tag: tag, keys: Object.keys(o), location: o.location, printLocation: o.printLocation, mediaKeys: o.media ? Object.keys(o.media) : null, mediaIsBG: o.media && o.media.isBG, layerNum: o.layerNum, layer: o.layer, isEdit: o.isEdit, isDisplay: o.isDisplay, deleteState: o.deleteState, visitLevel: o.visitLevel, multiUuid: o.multiUuid, uuid: o.uuid, markuuid: o.markuuid, text: o.media && o.media.text, fontId: o.media && o.media.font && o.media.font.id, imgPath: o.media && o.media.imgPath };
          return r;
        };
        // 探针条目 = after 最后一个
        out.probe = pick(after[after.length - 1], "probe");
        // 原生条目：找 media 里有 rect/mediaType 非 text 的（取第 1 个非 text 且含 location 的）
        for (let j = 0; j < after.length; j++) {
          const a = after[j];
          if (!a || !a.media) continue;
          if (a.media.mediaType === "text" || a.media.mediaType == null) continue;
          if (!out.nativeRect) out.nativeRect = pick(a, "native(" + String(a.media.mediaType).slice(0, 12) + ")");
        }
        break;
      }
      return out;
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.message || e).slice(0, 400));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log("STAGE-7.3-SAVE-UNLOCK9 done -> " + REPORT_PATH);
  console.log("ready=" + report.phases.ready);
  console.log(JSON.stringify(report.phases.dump, null, 1));
})().catch((e) => { console.error("probe crashed: " + e); process.exit(1); });