// runtime/stage-7-3-save-unlock4.js — t4 v8：错误素材门归属对照实验（纯净 vs drawText 探针）
// 关键问题：v7 实测保存被「第1页发现错误素材，请点击【删除错误素材】继续设计！」layer 弹窗拦截。
// 该弹窗来自 ProductDataModel.js: toProductJsonErrorArray 非空 → Gc() → layer.open(title=素材错误提示)。
// R() 序列化校验 location/printLocation 宽高 >0，否则 throw "宽高异常" → hc() 收进错误素材数组。
// v8 对照：Phase A 纯净(不创建任何对象)点保存 / Phase B 创建与 v7 完全相同的 drawText 探针再点保存。
//   结论判定：A 无弹窗 & B 有弹窗 => 错误素材由 drawText 创建路径引起（OCR 文字路径问题，t6/t7 修改点）
//            A 也有弹窗        => 模板 252438 既有对象序列化即被判错误素材（模板导向 Blocker）
// 附带修复：v7 resp 数组从未写入（report.resp 未初始化即访问 .length → TypeError 被 catch 吞）。
// 附带：hook layer.open 记录弹窗 title/content（含 errorDiv 的 base64Str 快照长度）。
// 输入：真实单号 5115522170112153822（Phase 0 尝试填入搜索框触发订单查询，观察 thirdOrderNo 回填）
// 输出：runtime/reports/stage-7-3-save-unlock4.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-7-3-save-unlock4.json");
const REAL_ORDER = "5115522170112153822";

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-7.3-SAVE-UNLOCK4", url: EDITOR_URL, order: REAL_ORDER, phases: {}, reqs: [], resp: [], layers: [], dialogs: [], errors: [] };
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
    page.on("request", (r) => {
      const u = r.url();
      if (!/diy\.zheliyin\.com/.test(u)) return;
      const rec = { seq: report.reqs.length, m: r.method(), u: u };
      try { const pd = r.postData(); if (pd) rec.body = String(pd).slice(0, 2600); } catch (e) {}
      report.reqs.push(rec);
    });
    // 修复 v7 bug：先初始化 resp 再访问（v7 的 report.resp.length 在未初始化时抛 TypeError 被吞）
    page.on("response", async (r) => {
      const u = r.url();
      if (!/IfDiyOrderidExit|saveThirdUserDesign|getShopAndWangWangInfo|saveUserDesign|designId|findAllFont/i.test(u)) return;
      try {
        const b = await r.text();
        report.resp.push({ status: r.status(), u: u, body: String(b).slice(0, 3000) });
      } catch (e) {
        report.resp.push({ status: r.status(), u: u, body: "<unread>:" + String(e && e.message || e).slice(0, 120) });
      }
    });

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

    // hook layer.open：记录弹窗 title + content（含错误素材 errorDiv）
    await page.evaluate(() => {
      window.__zyLayers = [];
      const L = window.layer;
      if (L && !window.__zyLayerHooked) {
        const orig = L.open;
        window.__zyLayerHooked = true;
        L.open = function (opts) {
          try {
            const o = opts || {};
            let content = "";
            if (typeof o.content === "string") content = o.content;
            else if (o.content && o.content.jquery && o.content[0]) content = String(o.content[0].outerHTML || "").slice(0, 900);
            const imgs = [];
            (String(content).match(/<img[^>]+>/g) || []).forEach((s) => { imgs.push(s.replace(/data:[^,]+,.+$/, "data:[...]").slice(0, 100)); });
            window.__zyLayers.push({ title: String(o.title || "").slice(0, 60), text: String(content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 300), htmlLen: content.length, imgs: imgs.slice(0, 4) });
          } catch (e) {}
          return orig.apply(this, arguments);
        };
      }
    }).catch(() => {});

    const snapshotObjects = `(function(){var req=window.requirejs||window.require;var vo=(req&&req.s&&req.s.contexts&&req.s.contexts._&&req.s.contexts._.defined&&req.s.contexts._.defined.CanvasObjVO)||window.CanvasObjVO;if(!vo||!Array.isArray(vo.totalCanvasArray))return{err:"no CanvasObjVO"};var out=[];for(var i=0;i<vo.totalCanvasArray.length;i++){var d=vo.totalCanvasArray[i];if(!d||!d.canvas||!d.canvas.getObjects)continue;var o=d.canvas.getObjects();var arr=[];for(var j=0;j<o.length;j++){var ob=o[j]||{};arr.push({i:j,t:ob.type&&(ob.type.name||ob.type)||"?",txt:String(ob.text||"").slice(0,16),w:ob.width,h:ob.height,lf:ob.left,top:ob.top,mid:String(ob.mediafontId||ob.mediafontid||"").slice(0,12),uid:String(ob.multiUuid||ob.markuuid||ob.uuid||"").slice(0,20)});}out.push({ci:i,total:arr.length,objs:arr});}return{perCanvas:out};})()`;

    // ---- Phase 0: 状态快照 + hdgyMenu 搜索框（真实单号）----
    report.phases.state = await page.evaluate(() => {
      const ids = ["diyId", "worksStatus", "isAdmin", "typeid", "diyTypeNum", "sourceId", "tbOrderNo", "thirdOrderNo", "checkOperate", "workName", "userName", "remarkInfor", "copyDesignNo", "templateName", "templateState"];
      const out = {};
      ids.forEach((id) => { const el = document.getElementById(id); out[id] = el === null ? "MISSING" : { v: String(el.value != null ? el.value : "").slice(0, 40), vis: !!(el.offsetParent) }; });
      const search = [];
      document.querySelectorAll("input").forEach((el) => { const c = String(el.className || ""); const id = String(el.id || ""); if (/search|order/i.test(c + id) && el.offsetParent) search.push({ id: id, cls: c.slice(0, 30), ph: String(el.placeholder || "").slice(0, 20) }); });
      out._searchInputs = search.slice(0, 10);
      return out;
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // 尝试把真实单号填入搜索框并触发查询（观察 thirdOrderNo / 网络）
    if (report.phases.state && report.phases.state._searchInputs && report.phases.state._searchInputs.length) {
      report.phases.orderSearch = await page.evaluate((p) => {
        const log = [];
        let hit = null;
        document.querySelectorAll("input").forEach((el) => {
          const c = String(el.className || ""); const id = String(el.id || "");
          if (/search|order/i.test(c + id) && el.offsetParent && !hit) {
            el.value = p.order;
            try { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
            log.push("filled:" + (id || c.slice(0, 20)));
            hit = el;
          }
        });
        // 触发其关联按钮/回车
        if (hit) {
          try { hit.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true })); } catch (e) {}
          const sib = hit.parentElement && hit.parentElement.querySelector("a, button, input[type=button]");
          if (sib) { try { sib.click(); log.push("clickedSib:" + (sib.className || sib.tagName).slice(0, 30)); } catch (e) {} }
        }
        return { log: log };
      }, { order: REAL_ORDER }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
      await page.waitForTimeout(4000);
      report.phases.stateAfterSearch = await page.evaluate(() => {
        const third = document.getElementById("thirdOrderNo");
        const tb = document.getElementById("tbOrderNo");
        return { thirdOrderNo: third ? String(third.value || "").slice(0, 40) : "MISSING", tbOrderNo: tb ? String(tb.value || "").slice(0, 40) : "MISSING" };
      }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    }

    // ---- Phase A: 纯净模式（不创建任何对象）点保存 ----
    report.phases.clean = {};
    report.phases.clean.before = await page.evaluate(snapshotObjects).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    report.phases.clean.saveClick = await page.evaluate(() => {
      const btn = document.querySelector(".rightBtn .save") || document.querySelector("a.save") || null;
      if (!btn) return { clicked: false };
      try { btn.click(); return { clicked: true }; } catch (e) { return { err: String(e) }; }
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    await page.waitForTimeout(4000);
    report.phases.clean.layers = await page.evaluate(() => { const L = window.__zyLayers || []; window.__zyLayers = []; return L; }).catch(() => []);
    report.phases.clean.bodySnippet = await page.evaluate(() => String(document.body.innerText || "").replace(/\n+/g, " | ").slice(0, 700)).catch((e) => String(e || "").slice(0, 200));
    report.phases.clean.after = await page.evaluate(snapshotObjects).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // 关闭所有 layer 弹窗（为 Phase B 清场；不点「删除错误素材」避免破坏模板对象）
    await page.evaluate(() => {
      const cls = document.querySelectorAll(".layui-layer-close, .layui-layer-btn .layui-layer-btn1");
      for (let i = 0; i < cls.length; i++) { try { cls[i].click(); } catch (e) {} }
      const lay = document.querySelectorAll(".layui-layer");
      for (let j = 0; j < lay.length; j++) { lay[j].style.display = "none"; }
    }).catch(() => {});
    await page.waitForTimeout(1200);

    // ---- Phase B: 创建 v7 同参数 drawText 探针再点保存 ----
    report.phases.probe = {};
    report.phases.probe.create = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      for (let i = 0; i < vo.totalCanvasArray.length; i++) {
        const d = vo.totalCanvasArray[i];
        if (!(d && typeof d.drawText === "function" && d.canvas && d.canvas.getObjects && d.canvasObjInfo)) continue;
        const baseLayer = d.canvasObjInfo.canvasToProductObjArr.length;
        const uid = "zlysave4-" + Date.now() % 1000000;
        const entry = { media: { mediaType: "text", text: uid, font: { pointSize: 24, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "556", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.3, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: 100, y: 100, width: 200, height: 40, factWidth: 200, factHeight: 40, rotation: 0 }, printLocation: { x: 100, y: 100, width: 200, height: 40, rotation: 0 }, layer: { alpha: 1 }, layerNum: baseLayer, isEdit: 1, isDisplay: 1, deleteState: 0, visitLevel: 1, multiUuid: uid, markuuid: "" };
        d.drawText(uid, null, null, null, entry, baseLayer);
        const o = d.canvas.getObjects().filter((ob) => String(ob.text || "") === uid)[0];
        const mine = {};
        if (o) { ["width", "height", "left", "top"].forEach((k) => { if (o[k] !== undefined) mine[k] = o[k]; }); mine.mediafontId = o.mediafontId; mine.type = o.type && (o.type.name || o.type); }
        return { uid: uid, obj: mine, total: d.canvas.getObjects().length };
      }
      return { err: "no live CanvasDiy" };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    report.phases.probe.before = await page.evaluate(snapshotObjects).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    report.phases.probe.saveClick = await page.evaluate(() => {
      const btn = document.querySelector(".rightBtn .save") || document.querySelector("a.save") || null;
      if (!btn) return { clicked: false };
      try { btn.click(); return { clicked: true }; } catch (e) { return { err: String(e) }; }
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    await page.waitForTimeout(4000);
    report.phases.probe.layers = await page.evaluate(() => { const L = window.__zyLayers || []; window.__zyLayers = []; return L; }).catch(() => []);
    report.phases.probe.bodySnippet = await page.evaluate(() => String(document.body.innerText || "").replace(/\n+/g, " | ").slice(0, 700)).catch((e) => String(e || "").slice(0, 200));
    report.phases.probe.after = await page.evaluate(snapshotObjects).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    report.phases.netSnapshot = report.reqs.map((r) => ({ u: r.u, m: r.m, b: r.body ? r.body.slice(0, 160) : null })).filter((r) => /save|order|wangwang|shop|IfDiy|designId/i.test(r.u));
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.message || e).slice(0, 400));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log("STAGE-7.3-SAVE-UNLOCK4 done -> " + REPORT_PATH);
  console.log("ready=" + report.phases.ready);
  const cleanLayers = (report.phases.clean && report.phases.clean.layers) || [];
  const probeLayers = (report.phases.probe && report.phases.probe.layers) || [];
  console.log("clean-layers= " + JSON.stringify(cleanLayers.map((l) => ({ t: l.title, txt: (l.text || "").slice(0, 60) }))));
  console.log("probe-layers=" + JSON.stringify(probeLayers.map((l) => ({ t: l.title, txt: (l.text || "").slice(0, 60) }))));
  console.log("dialogs=" + JSON.stringify(report.dialogs));
  console.log("resp=" + JSON.stringify(report.resp.map((r) => ({ s: r.status, u: r.u, b: r.body.slice(0, 120) })).slice(0, 5)));
  console.log("reqs=" + (report.reqs || []).length);
})().catch((e) => { console.error("probe crashed: " + e); process.exit(1); });