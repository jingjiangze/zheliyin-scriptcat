// runtime/stage-7-3-save-unlock12.js — t4 v16：修复字段版探针
// 根因（v15）：Q() 裸拼接 a.topEnable/resourceType/maskEnable/lowPixelFlag/selectEnabled/
//   isDesign/isComposite/isPreview/isDesignShape，drawText 对象缺这些字段 -> ":undefined" -> JSON 非法 -> 素材错误 gate
// 本次：drawText 后补齐上述字段（数字合法值），复测全链路（弹窗?写库?），并用真实单号填订单输入框。
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-7-3-save-unlock12.json");
const REAL_ORDER = "5115522170112153822";

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-7.3-SAVE-UNLOCK12", url: EDITOR_URL, order: REAL_ORDER, phases: {}, reqs: [], dialogs: [], errors: [] };
  let browser = null;
  let page = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    browser.on("dialog", (d) => { report.dialogs.push(String(d.message() || "").slice(0, 200)); d.accept().catch(() => {}); });
    page = browser.pages()[0];
    page.on("request", (r) => { const u = r.url(); if (!/diy\.zheliyin\.com/.test(u)) return; const rec = { seq: report.reqs.length, m: r.method(), u: u }; try { const pd = r.postData(); if (pd) rec.body = String(pd).slice(0, 2600); } catch (e) {} report.reqs.push(rec); });
    page.on("response", async (r) => { const u = r.url(); if (!/IfDiyOrderidExit|saveThirdUserDesign|saveUserDesign|getShopAndWangWangInfo/i.test(u)) return; try { const b = await r.text(); report.resp = report.resp || []; if (report.resp.length < 10) report.resp.push({ status: r.status(), u: u, body: String(b).slice(0, 3000) }); } catch (e) {} });

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

    // ready 后安装 JSON.parse patch（完整捕获序列化报文）
    report.phases.patchInstalled = await page.evaluate(() => {
      window.__zyParse = { fails: [], lastPL: null, calls: 0 };
      const orig = JSON.parse;
      if (orig.__zyPatched) return { already: true };
      JSON.parse = function (s, rev) {
        const isPL = typeof s === "string" && s.indexOf('"printLocation"') >= 0 && s.length > 60;
        if ((isPL || typeof s === "string") && window.__zyParse.calls < 6) {
          try {
            const r = orig.call(JSON, s, rev);
            if (isPL) { window.__zyParse.calls++; if (r && r.location !== undefined) window.__zyParse.lastPL = { len: s.length, loc: r.location, print: r.printLocation, text: r.media && r.media.text ? String(r.media.text).slice(0, 20) : null, fontId: r.media && r.media.font && r.media.font.id, mediaType: r.media && r.media.mediaType }; }
            return r;
          } catch (e) {
            if (isPL) { try { window.__zyParse.fails.push({ err: String(e && e.message || e).slice(0, 60), s: String(s).slice(0, 2600) }); } catch (e2) {} }
            throw e;
          }
        }
        return orig.call(JSON, s, rev);
      };
      JSON.parse.__zyPatched = true;
      return { ok: true };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // 创建探针（修复版：画后补齐 Q() 裸拼接字段）
    report.phases.probe = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      for (let i = 0; i < vo.totalCanvasArray.length; i++) {
        const d = vo.totalCanvasArray[i];
        if (!(d && typeof d.drawText === "function" && d.canvas && d.canvas.getObjects && d.canvasObjInfo)) continue;
        const baseLayer = d.canvasObjInfo.canvasToProductObjArr.length;
        const uid = "zlyunlock12-" + Date.now() % 1000000;
        const entry = { media: { mediaType: "text", text: uid, font: { pointSize: 24, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "556", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.3, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: 100, y: 100, width: 200, height: 40, factWidth: 200, factHeight: 40, rotation: 0 }, printLocation: { x: 100, y: 100, width: 200, height: 40, rotation: 0 }, layer: { alpha: 1 }, layerNum: baseLayer, isEdit: 1, isDisplay: 1, deleteState: 0, visitLevel: 1, multiUuid: uid, markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0, lowPixelFlag: 0, selectEnabled: 1, isDesign: 1, isComposite: 0, isPreview: 0, isDesignShape: 0 };
        d.drawText(uid, null, null, null, entry, baseLayer);
        // 画后强制补齐对象字段（双保险）
        const o = d.canvas.getObjects().filter((ob) => String(ob.text || "") === uid)[0];
        if (o) { o.topEnable = 1; o.resourceType = 0; o.maskEnable = 0; o.lowPixelFlag = 0; o.selectEnabled = 1; o.isDesign = 1; o.isComposite = 0; o.isPreview = 0; o.isDesignShape = 0; d.canvas.requestRenderAll && d.canvas.requestRenderAll(); }
        return { uid: uid, fields: o ? { topEnable: o.topEnable, resourceType: o.resourceType, maskEnable: o.maskEnable, lowPixelFlag: o.lowPixelFlag, selectEnabled: o.selectEnabled, isDesign: o.isDesign, isComposite: o.isComposite, isPreview: o.isPreview, isDesignShape: o.isDesignShape, mediafontId: o.mediafontId } : null, total: d.canvas.getObjects().length };
      }
      return { err: "no live CanvasDiy" };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    const clickSave = () => page.evaluate(() => {
      const btn = document.querySelector(".rightBtn .save") || document.querySelector("a.save") || null;
      if (!btn) return { clicked: false };
      try { btn.click(); return { clicked: true }; } catch (e) { return { err: String(e) }; }
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    const fillAndSubmit = () => page.evaluate((o) => {
      const log = [];
      const layers = document.querySelectorAll(".layui-layer");
      let host = null;
      for (let i = 0; i < layers.length; i++) { if (layers[i].offsetParent || layers[i].style.display !== "none") { host = layers[i]; break; } }
      const scope = host || document;
      const inputs = scope.querySelectorAll("input[type=text], input:not([type]), textarea");
      const setByLabel = (keys, val) => {
        for (let i = 0; i < inputs.length; i++) {
          const el = inputs[i]; if (el.__filled) continue;
          const label = el.previousElementSibling ? String(el.previousElementSibling.textContent || "") : "";
          const joined = label + String(el.placeholder || "") + String(el.title || "");
          for (let k = 0; k < keys.length; k++) { if (joined.indexOf(keys[k]) >= 0) { el.value = val; try { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {} el.__filled = 1; log.push(String(el.id || el.className || "input").slice(0, 24)); break; } }
        }
      };
      setByLabel(["作品", "作品名", "workName", "名称"], "样式还原OCR保存验证v16");
      setByLabel(["用户", "用户名", "userName", "姓名"], "样式还原测试");
      setByLabel(["备注"], "stage-7.3 v16 real-order");
      // 真实单号填所有 order 类输入
      let orderFilled = 0;
      document.querySelectorAll("input").forEach((el) => { const c = String(el.className || ""); const id = String(el.id || ""); if (/search|order/i.test(c + id)) { el.value = o.order; try { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {} orderFilled++; } });
      const btns = scope.querySelectorAll("button, a, .layui-layer-btn0, input[type=button]");
      let clicked = null;
      for (let i = 0; i < btns.length; i++) {
        const tx = String(btns[i].textContent || btns[i].value || "").trim();
        if (/确定|保存|提交|确认/.test(tx) && !/取消|关闭|删除/.test(tx)) { try { btns[i].click(); clicked = tx.slice(0, 20); break; } catch (e) {} }
      }
      return { log: log, orderFilled: orderFilled, clicked: clicked };
    }, { order: REAL_ORDER }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // ---- 保存流程 ----
    report.phases.save1 = {};
    report.phases.save1.click = await clickSave();
    await page.waitForTimeout(3500);
    report.phases.save1.fill = await fillAndSubmit();
    await page.waitForTimeout(9000);
    report.phases.save1.parse = await page.evaluate(() => {
      const z = window.__zyParse || {};
      // 素材错误弹窗检测
      let errLayer = null;
      document.querySelectorAll(".layui-layer-title, .layui-layer-content").forEach((el) => { const t = String(el.textContent || ""); if (t.indexOf("素材错误") >= 0) { errLayer = errLayer || t.replace(/\s+/g, " ").slice(0, 120); } });
      let errImg = null;
      document.querySelectorAll(".layui-layer img").forEach((img) => { if (!errImg && img.src && /^data:image/.test(img.src)) errImg = img.src.slice(0, 200); });
      return { fails: (z.fails || []).map((f) => ({ err: f.err, s: f.s.slice(0, 2600) })), lastPL: z.lastPL, calls: z.calls, errLayer: errLayer, errImgPrefix: errImg };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    // 若素材错误弹窗出现，落盘 PNG
    const imgData = (report.phases.save1.parse || {}).errImgPrefix;
    if (imgData && imgData.indexOf("base64") >= 0) {
      try { const i = imgData.indexOf(","); const buf = Buffer.from(imgData.slice(i + 1), "base64"); fs.mkdirSync(path.join(__dirname, "reports", "err-png"), { recursive: true }); fs.writeFileSync(path.join(__dirname, "reports", "err-png", "err-01.png"), buf); report.phases.save1.errPngSaved = "err-01.png " + buf.length + "B"; } catch (e) { report.phases.save1.errPngErr = String(e); }
    }
    report.phases.save1.bodySnippet = await page.evaluate(() => String(document.body.innerText || "").replace(/\n+/g, " | ").slice(0, 260)).catch(() => "");
    report.phases.save1.reqsTail = report.reqs.slice(-18).map((r) => ({ m: r.m, u: r.u.slice(0, 120) }));
    report.phases.save1.writeReqs = report.reqs.filter((r) => /saveThirdUserDesign|saveUserDesign/i.test(r.u)).map((r) => ({ m: r.m, u: r.u.slice(0, 140) }));
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.message || e).slice(0, 400));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log("STAGE-7.3-SAVE-UNLOCK12 done -> " + REPORT_PATH);
  console.log("ready=" + report.phases.ready);
  console.log("probe.fields=" + JSON.stringify((report.phases.probe || {}).fields || (report.phases.probe || {}).err));
  console.log("fill=" + JSON.stringify(report.phases.save1 && report.phases.save1.fill));
  const p = (report.phases.save1 && report.phases.save1.parse) || {};
  console.log("calls=" + p.calls + " fails=" + (p.fails || []).length + " errLayer=" + (p.errLayer || "NONE"));
  (p.fails || []).slice(0, 2).forEach((f, i) => { console.log("FAIL" + i + " err=" + f.err); console.log("FAIL" + i + " s=" + f.s.slice(0, 800)); });
  console.log("lastPL=" + JSON.stringify(p.lastPL));
  console.log("writeReqs=" + JSON.stringify((report.phases.save1 || {}).writeReqs || []));
  console.log("body=" + ((report.phases.save1 && report.phases.save1.bodySnippet) || "").slice(0, 240));
})().catch((e) => { console.error("probe crashed: " + e); process.exit(1); });