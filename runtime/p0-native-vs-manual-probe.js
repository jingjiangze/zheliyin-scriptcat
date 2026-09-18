// runtime/p0-native-vs-manual-probe.js — P0 对照实验：手动 Native (drawText2) vs 脚本 Native (drawText)
// 同一 text/pos/size/color/rotation，创建两个对象 -> 全字段快照 diff -> 保存 -> 印刷（安全确认）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "p0-native-vs-manual.json");
const TEXT_A = "A_MANUAL_TEXT";
const TEXT_B = "B_SCRIPT_TEXT";
const POS = { x: 60, y: 60, fontSize: 24, rotation: 0 };

(async () => {
  const report = { ts: new Date().toISOString(), stage: "P0-NATIVE-VS-MANUAL", url: EDITOR_URL, textA: TEXT_A, textB: TEXT_B, pos: POS, phases: {}, reqs: [], dialogs: [], snapA: null, snapB: null, serialA: null, serialB: null, diff: [], errors: [] };
  let browser = null, page = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    browser.on("dialog", (d) => { report.dialogs.push(String(d.message() || "").slice(0, 200)); d.accept().catch(() => {}); });
    page = browser.pages()[0];
    page.on("request", (r) => {
      const u = r.url();
      if (u.indexOf("zheliyin.com") < 0 || report.reqs.length > 500) return;
      const rec = { m: r.method(), u: u.slice(0, 240) };
      try { if (/print|hegao|check|material|font|save|proof|submit|validate|product|getImgInfos/i.test(u)) { const pd = r.postData(); if (pd) rec.bodyHead = String(pd).slice(0, 2500); } } catch (e) {}
      report.reqs.push(rec);
    });
    page.on("response", async (r) => {
      const u = r.url();
      if (u.indexOf("zheliyin.com") < 0 || !/getImgInfos|saveThirdUserDesign|IfDiyOrderidExit|check|hegao|print|submit/i.test(u)) return;
      try {
        const ct = r.headers()["content-type"] || "";
        if (ct.indexOf("json") < 0 && ct.indexOf("text") < 0) return;
        let b = ""; try { b = await r.text(); } catch (e) {}
        report.resp = report.resp || [];
        if (report.resp.length < 30) report.resp.push({ status: r.status(), u: u.slice(0, 240), body: String(b).slice(0, 5000) });
      } catch (e) {}
    });

    const readyEval = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = (vo && Array.isArray(vo.totalCanvasArray) && vo.totalCanvasArray[0]) || null;
      const c = d && (d.canvas || d);
      return { ok: !!(d && c && c.getObjects && typeof d.drawText === "function" && typeof d.drawText2 === "function") };
    }).catch(() => ({ ok: false }));
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    let ok = false;
    const d1 = Date.now() + 150000;
    while (Date.now() < d1) { ok = await readyEval(); if (ok && ok.ok) break; await page.waitForTimeout(2000); }
    report.phases.ready = !!(ok && ok.ok);
    if (!ok) throw new Error("editor not ready (need drawText2 too)");

    // JSON.parse 序列化捕获（区分 A/B 文本）
    await page.evaluate((arg) => {
      const tA = arg.tA, tB = arg.tB;
      const op = JSON.parse;
      if (op.__zyNM) return { already: true };
      window.__zyNM = { a: [], b: [], fails: [] };
      JSON.parse = function (s, rev) {
        try {
          if (typeof s === "string" && s.indexOf('"printLocation"') >= 0) {
            if (s.indexOf(tA) >= 0 && window.__zyNM.a.length < 3) window.__zyNM.a.push({ len: s.length, head: s.slice(0, 4000) });
            if (s.indexOf(tB) >= 0 && window.__zyNM.b.length < 3) window.__zyNM.b.push({ len: s.length, head: s.slice(0, 4000) });
          }
        } catch (e) {}
        return op.call(JSON, s, rev);
      };
      JSON.parse.__zyNM = true;
      return { ok: true };
    }, { tA: TEXT_A, tB: TEXT_B }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // 创建 A（手动路径 addText）与 B（脚本路径 drawText）
    report.phases.create = await page.evaluate((arg) => {
      const tA = arg.tA, tB = arg.tB, px = arg.px;
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const out = {};
      for (let i = 0; i < vo.totalCanvasArray.length; i++) {
        const d = vo.totalCanvasArray[i];
        if (!(d && typeof d.drawText === "function" && typeof d.drawText2 === "function" && d.canvas && d.canvasObjInfo)) continue;
        const base = d.canvasObjInfo.canvasToProductObjArr.length;
        // A: 手动路径（页面「文案使用」同款 addText -> 内部 drawText2(a,18,0,0,...)，默认字体）
        d.addText(tA);
        const a = d.canvas.getObjects().filter((o) => String(o.text || "") === tA)[0];
        out.a = a ? { text: a.text, uuid: a.uuid, multiUuid: a.multiUuid, mediaMediaType: a.mediaMediaType, mediafontId: a.mediafontId, fontFamily: a.fontFamily, fontSize: a.fontSize, fontWeight: a.fontWeight, fontStyle: a.fontStyle, fill: a.fill, charSpacing: a.charSpacing, lineHeight: a.lineHeight, left: a.left, top: a.top, width: a.width, height: a.height, angle: a.angle, media: a.media && { text: a.media.text, mediaType: a.media.mediaType, font: a.media.font } } : null;
        // B: 脚本路径（OCR drawText，font.id=556 思源黑 Regular）
        const uid = "p0nm-" + Date.now() % 1000000;
        const entry = { media: { mediaType: "text", text: tB, font: { pointSize: px.fontSize, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "556", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.3, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: px.x, y: px.y, width: 220, height: 40, factWidth: 220, factHeight: 40, rotation: px.rotation }, printLocation: { x: px.x, y: px.y, width: 220, height: 40, rotation: px.rotation }, layer: { alpha: 1 }, layerNum: base + 1, isEdit: 1, isDisplay: 1, deleteState: 0, visitLevel: 1, multiUuid: uid, markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0, lowPixelFlag: 0, selectEnabled: 1, isDesign: 1, isComposite: 0, isPreview: 0, isDesignShape: 0 };
        d.drawText(tB, null, null, null, entry, base + 1);
        const b = d.canvas.getObjects().filter((o) => String(o.text || "") === tB)[0];
        if (b) { b.topEnable = 1; b.resourceType = 0; b.maskEnable = 0; b.lowPixelFlag = 0; b.selectEnabled = 1; b.isDesign = 1; b.isComposite = 0; b.isPreview = 0; b.isDesignShape = 0; }
        out.b = b ? { text: b.text, uuid: b.uuid, multiUuid: b.multiUuid, mediaMediaType: b.mediaMediaType, mediafontId: b.mediafontId, fontFamily: b.fontFamily, fontSize: b.fontSize, fontWeight: b.fontWeight, fontStyle: b.fontStyle, fill: b.fill, charSpacing: b.charSpacing, lineHeight: b.lineHeight, left: b.left, top: b.top, width: b.width, height: b.height, angle: b.angle, media: b.media && { text: b.media.text, mediaType: b.media.mediaType, font: b.media.font } } : null;
        d.canvas.requestRenderAll && d.canvas.requestRenderAll();
        return { ok: true, a: out.a, b: out.b, total: d.canvas.getObjects().length };
      }
      return { err: "no live CanvasDiy" };
    }, { tA: TEXT_A, tB: TEXT_B, px: POS }).catch((e) => ({ err: String(e && (e.stack || e.message) || e).slice(0, 800) }));
    report.phases.createA = report.phases.create && report.phases.create.a;
    report.phases.createB = report.phases.create && report.phases.create.b;

    // 点击「印刷」按钮（不再单独点保存）
    await page.evaluate(() => {
      const cands = document.querySelectorAll(".btn.print, li.print, [class*=' print'], .rightBtn li, .rightBtn a, .rightBtn span, .rightBtn div");
      let best = null;
      for (let i = 0; i < cands.length; i++) {
        const el = cands[i];
        const tx = String(el.textContent || "").trim();
        const cls = String(el.className || "");
        if (/印刷/.test(tx) && /print/i.test(cls)) { best = el; break; }
        if (/印刷/.test(tx) && !best) best = el;
      }
      if (!best) {
        const all = document.querySelectorAll("li,a,button,span,div");
        for (let i = 0; i < all.length; i++) {
          const el = all[i];
          if (String(el.textContent || "").trim() === "印刷" && el.offsetParent) { best = el; break; }
        }
      }
      if (best) { try { best.click(); } catch (e) {} }
    }).catch(() => {});
    await page.waitForTimeout(4000);
    report.phases.fill = await page.evaluate(() => {
      const layers = document.querySelectorAll(".layui-layer");
      let host = null;
      for (let i = 0; i < layers.length; i++) { if (layers[i].offsetParent || layers[i].style.display !== "none") { host = layers[i]; break; } }
      const scope = host || document;
      const inputs = scope.querySelectorAll("input[type=text], input:not([type]), textarea");
      const setByLabel = (keys, val) => {
        for (let i = 0; i < inputs.length; i++) {
          const el = inputs[i]; if (el.__p0) continue;
          const joined = (el.previousElementSibling ? String(el.previousElementSibling.textContent || "") : "") + String(el.placeholder || "") + String(el.title || "");
          for (let k = 0; k < keys.length; k++) { if (joined.indexOf(keys[k]) >= 0) { el.value = val; try { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {} el.__p0 = 1; break; } }
        }
      };
      setByLabel(["作品", "作品名", "workName", "名称"], "1");
      setByLabel(["用户", "用户名", "userName", "姓名"], "2");
      setByLabel(["备注"], "p0 native vs manual");
      return { ok: true };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    await page.waitForTimeout(1500);
    report.phases.confirm = await page.evaluate(() => {
      const btns = document.querySelectorAll(".layui-layer button, .layui-layer a, .layui-layer-btn0");
      for (let i = 0; i < btns.length; i++) {
        const tx = String(btns[i].textContent || "").trim();
        if (/确定|保存/.test(tx) && !/取消|删除|印刷|提交|生产/.test(tx)) {
          const host = btns[i].closest(".layui-layer") || document;
          if (/确定进行印刷|提交生产|提交制作|确认提交|确定印刷|下单/i.test(String(host.textContent || ""))) continue;
          try { btns[i].click(); return { clicked: tx.slice(0, 16) }; } catch (e) {}
          break;
        }
      }
      return { clicked: false };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    const t0 = Date.now();
    while (Date.now() - t0 < 45000) { await page.waitForTimeout(1500); }
    report.phases.endState = await page.evaluate(() => {
      const z = window.__zyNM || {};
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
      const ga = d && d.canvas && d.canvas.getObjects().filter((o) => String(o.text || "") === "A_MANUAL_TEXT")[0];
      const gb = d && d.canvas && d.canvas.getObjects().filter((o) => String(o.text || "") === "B_SCRIPT_TEXT")[0];
      // DOM 弹层/核稿面板文本
      const layerTexts = [];
      document.querySelectorAll(".layui-layer, .design_check_wrap, .erweima_check_wrap, .hegao-preview, [class*=hegao], [class*=check_wrap]").forEach((el) => {
        if (layerTexts.length >= 30) return;
        const rc = el.getBoundingClientRect();
        if (rc.width === 0 && rc.height === 0) return;
        const t = String(el.innerText || el.textContent || "").trim().slice(0, 600);
        if (t) layerTexts.push({ cls: String(el.className).slice(0, 50), txt: t });
      });
      return { aExists: !!ga, bExists: !!gb, canvasCount: d && d.canvas ? d.canvas.getObjects().length : -1, layerTexts: layerTexts, serialA: (z.a || []).slice(0, 1), serialB: (z.b || []).slice(0, 1), fails: (z.fails || []).slice(0, 10) };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
  } catch (e) {
    report.errors.push(String(e && e.message || e).slice(0, 400));
  } finally {
    try { page && await page.close(); } catch (e) {}
    try { browser && await browser.close(); } catch (e) {}
  }
  const dir = path.dirname(REPORT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log("report written: " + REPORT_PATH + "  reqs=" + report.reqs.length + " errors=" + report.errors.length);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });