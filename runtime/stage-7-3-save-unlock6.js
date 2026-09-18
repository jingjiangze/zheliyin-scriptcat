// runtime/stage-7-3-save-unlock6.js — t4 v10：location 缺失根因验证 + 修复设置后保存解锁
// 假设（基于 ProductDataModel.js Q()）：序列化 location.width/height 取对象自有属性
//   a.locationWidth / a.locationHeight / a.locationFactWidth / a.locationFactHeight，
//   TEXT/SVG 之外不自动赋值。drawText 创建路径若未设置 → 序列化出 "width":undefined →
//   JSON.parse 失败或 width<=0 → R() catch → hc() → 「素材错误提示」gate。
// v10：1) dump 探针 vs 原生 rect/line 的这些属性差异
//      2) 手动补齐探针 locationWidth/Height/FactWidth/FactHeight（含 uuid）
//      3) 保存→填表→提交 → 观察是否还弹素材错误 + saveThirdUserDesign.do 是否发出（写库解锁）
// 输出：runtime/reports/stage-7-3-save-unlock6.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-7-3-save-unlock6.json");

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-7.3-SAVE-UNLOCK6", url: EDITOR_URL, phases: {}, reqs: [], resp: [], layers: [], dialogs: [], errors: [] };
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
      try { const pd = r.postData(); if (pd) rec.body = String(pd).slice(0, 4000); } catch (e) {}
      report.reqs.push(rec);
    });
    page.on("response", async (r) => {
      const u = r.url();
      if (!/IfDiyOrderidExit|saveThirdUserDesign|saveUserDesign|getShopAndWangWangInfo/i.test(u)) return;
      try {
        const b = await r.text();
        report.resp.push({ status: r.status(), u: u, body: String(b).slice(0, 3000) });
      } catch (e) {
        report.resp.push({ status: r.status(), u: u, body: "<unread>:" + String(e && e.message || e).slice(0, 120) });
      }
    });
    await page.evaluate(() => {
      window.__zyLayers = [];
      const L = window.layer;
      if (L && !window.__zyLayerHooked) {
        const orig = L.open;
        window.__zyLayerHooked = true;
        L.open = function (opts) {
          try {
            const o = opts || {};
            const c = typeof o.content === "string" ? o.content : "";
            window.__zyLayers.push({ title: String(o.title || "").slice(0, 60), text: String(c.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 300), hasErrImg: c.indexOf("errorDiv") >= 0 });
          } catch (e) {}
          return orig.apply(this, arguments);
        };
      }
    }).catch(() => {});

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

    // Phase 1: 创建探针 + dump 属性差异
    report.phases.probe = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      for (let i = 0; i < vo.totalCanvasArray.length; i++) {
        const d = vo.totalCanvasArray[i];
        if (!(d && typeof d.drawText === "function" && d.canvas && d.canvas.getObjects && d.canvasObjInfo)) continue;
        const baseLayer = d.canvasObjInfo.canvasToProductObjArr.length;
        const uid = "zlyunlock6-" + Date.now() % 1000000;
        const entry = { media: { mediaType: "text", text: uid, font: { pointSize: 24, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "556", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.3, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: 100, y: 100, width: 200, height: 40, factWidth: 200, factHeight: 40, rotation: 0 }, printLocation: { x: 100, y: 100, width: 200, height: 40, rotation: 0 }, layer: { alpha: 1 }, layerNum: baseLayer, isEdit: 1, isDisplay: 1, deleteState: 0, visitLevel: 1, multiUuid: uid, markuuid: "" };
        d.drawText(uid, null, null, null, entry, baseLayer);
        const objs = d.canvas.getObjects();
        const probe = objs.filter((ob) => String(ob.text || "") === uid)[0];
        const locKeys = ["locationWidth", "locationHeight", "locationFactWidth", "locationFactHeight", "uuid", "markuuid", "multiUuid", "visitLevel", "isEdit", "isDisplay", "deleteState", "selectEnabled", "isDesign", "topEnable", "opacity", "crossBoundWay", "mediaIsBG", "imgPath", "mediaImgPath"];
        const pick = (o) => {
          const r = {};
          locKeys.forEach((k) => { if (o[k] !== undefined) r[k] = o[k]; });
          r._type = o.type && (o.type.name || o.type);
          r._w = o.width; r._h = o.height; r._left = o.left; r._top = o.top; r._scaleX = o.scaleX; r._scaleY = o.scaleY;
          return r;
        };
        const native = [];
        for (let j = 0; j < objs.length; j++) { if (String(objs[j].text || "") === uid) continue; native.push(pick(objs[j])); }
        return { uid: uid, probe: pick(probe), nativeSample: native.slice(0, 4) };
      }
      return { err: "no live CanvasDiy" };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // Phase 2: 修复设置（补齐 location* 与 uuid），替换 Q() 序列化所需的缺省自有属性
    report.phases.fix = await page.evaluate((p) => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const log = [];
      for (let i = 0; i < vo.totalCanvasArray.length; i++) {
        const d = vo.totalCanvasArray[i];
        if (!(d && d.canvas && d.canvas.getObjects)) continue;
        const objs = d.canvas.getObjects();
        const probe = objs.filter((ob) => String(ob.text || "") === p.uid)[0];
        if (!probe) return { err: "probe not found" };
        const sw = probe.getScaledWidth ? probe.getScaledWidth() : probe.width * probe.scaleX;
        const sh = probe.getScaledHeight ? probe.getScaledHeight() : probe.height * probe.scaleY;
        probe.locationWidth = sw;
        probe.locationHeight = sh;
        probe.locationFactWidth = sw;
        probe.locationFactHeight = sh;
        if (probe.uuid === undefined || probe.uuid === "") { probe.uuid = probe.multiUuid || ("fx-" + Date.now()); log.push("uuid set -> " + probe.uuid); }
        ["visitLevel", "isEdit", "isDisplay", "deleteState", "selectEnabled", "isDesign", "topEnable"].forEach((k) => { if (probe[k] === undefined) { probe[k] = 1; } });
        if (probe.mediaIsBG === undefined) probe.mediaIsBG = 0;
        log.push("locationWidth=" + sw + " locationHeight=" + sh + " uuid=" + probe.uuid);
        return { log: log, sw: sw, sh: sh, uuid: probe.uuid };
      }
      return { err: "no canvas" };
    }, { uid: report.phases.probe && report.phases.probe.uid }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // Phase 3: 保存 → 填表 → 提交 → 观察
    const clickSave = () => page.evaluate(() => {
      const btn = document.querySelector(".rightBtn .save") || document.querySelector("a.save") || null;
      if (!btn) return { clicked: false };
      try { btn.click(); return { clicked: true }; } catch (e) { return { err: String(e) }; }
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    const fillAndSubmit = () => page.evaluate(() => {
      const log = [];
      const layers = document.querySelectorAll(".layui-layer");
      let host = null;
      for (let i = 0; i < layers.length; i++) { if (layers[i].offsetParent || layers[i].style.display !== "none") { host = layers[i]; break; } }
      const scope = host || document;
      const inputs = scope.querySelectorAll("input[type=text], input:not([type]), textarea");
      const setByLabel = (keys, val) => {
        for (let i = 0; i < inputs.length; i++) {
          const el = inputs[i];
          const label = el.previousElementSibling ? String(el.previousElementSibling.textContent || "") : "";
          const joined = label + String(el.placeholder || "") + String(el.title || "");
          for (let k = 0; k < keys.length; k++) { if (joined.indexOf(keys[k]) >= 0 && !el.__filled) { el.value = val; try { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {} el.__filled = 1; log.push((el.id || "input").toString().slice(0, 24)); return; } }
        }
      };
      setByLabel(["作品", "作品名", "workName", "名称"], "样式还原OCR保存验证");
      setByLabel(["用户", "用户名", "userName", "姓名"], "样式还原测试");
      setByLabel(["备注"], "stage-7.3 unlock6");
      const btns = scope.querySelectorAll("button, a, .layui-layer-btn0, input[type=button]");
      let clicked = null;
      for (let i = 0; i < btns.length; i++) {
        const tx = String(btns[i].textContent || btns[i].value || "").trim();
        if (/确定|保存|提交|确认/.test(tx) && !/取消|关闭|删除/.test(tx)) { try { btns[i].click(); clicked = tx.slice(0, 20); break; } catch (e) {} }
      }
      return { log: log, clicked: clicked };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    report.phases.save1 = {};
    report.phases.save1.click = await clickSave();
    await page.waitForTimeout(3500);
    report.phases.save1.fill = await fillAndSubmit();
    await page.waitForTimeout(4500);
    report.phases.save1.layers = await page.evaluate(() => { const L = window.__zyLayers || []; window.__zyLayers = []; return L; }).catch(() => []);
    report.phases.save1.bodySnippet = await page.evaluate(() => String(document.body.innerText || "").replace(/\n+/g, " | ").slice(0, 400)).catch((e) => String(e || "").slice(0, 200));
    report.phases.save1.objCount = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      return vo.totalCanvasArray.map((d) => (d.canvas && d.canvas.getObjects ? d.canvas.getObjects().length : -1));
    }).catch(() => null);
    report.phases.netSnapshot = report.reqs.map((r) => ({ u: r.u, m: r.m, b: r.body ? r.body.slice(0, 200) : null })).filter((r) => /save|order|wangwang|shop|IfDiy/i.test(r.u));
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.message || e).slice(0, 400));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log("STAGE-7.3-SAVE-UNLOCK6 done -> " + REPORT_PATH);
  console.log("ready=" + report.phases.ready);
  console.log("probe=" + JSON.stringify(report.phases.probe));
  console.log("fix=" + JSON.stringify(report.phases.fix));
  console.log("save1-fill=" + JSON.stringify(report.phases.save1 && report.phases.save1.fill));
  console.log("save1-layers=" + JSON.stringify((report.phases.save1 && report.phases.save1.layers || []).map((l) => ({ t: l.title, txt: (l.text || "").slice(0, 70), err: l.hasErrImg }))));
  console.log("objCount=" + JSON.stringify(report.phases.save1 && report.phases.save1.objCount));
  const writes = (report.reqs || []).filter((r) => /saveThirdUserDesign|saveUserDesign/.test(r.u));
  console.log("writeReqs=" + JSON.stringify(writes.map((r) => ({ m: r.m, u: r.u, b: r.body ? r.body.slice(0, 160) : null }))));
  console.log("resp=" + JSON.stringify(report.resp.map((r) => ({ s: r.status, u: r.u.slice(-70), b: String(r.body).slice(0, 140) }))));
  console.log("dialogs=" + JSON.stringify(report.dialogs));
})().catch((e) => { console.error("probe crashed: " + e); process.exit(1); });