// runtime/stage-7-3-save-unlock8.js — t4 v12：校准 location + 补选印刷格式/色彩模式 → 完整请求流诊断
// 继承 v10 的修复路径（修 4 个 location* 属性后素材错误消失），本次补全面板选择（印刷格式/色彩模式），
// 并记录「确定」后 8s 内全部请求（不限关键字），定位写库入口（saveThirdUserDesign.do 或其它）。
// 输出：runtime/reports/stage-7-3-save-unlock8.json + reqs.jsonl（全量请求）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-7-3-save-unlock8.json");
const REQS_LOG = path.join(__dirname, "reports", "stage-7-3-save-unlock8-reqs.jsonl");

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-7.3-SAVE-UNLOCK8", url: EDITOR_URL, phases: {}, console: [], dialogs: [], errors: [] };
  let browser = null;
  let page = null;
  const reqLog = [];
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    browser.on("dialog", (d) => { report.dialogs.push(String(d.message() || "").slice(0, 200)); d.accept().catch(() => {}); });
    page = browser.pages()[0];
    page.on("console", (msg) => { const t = msg.type(); if (t === "error" || t === "warning") report.console.push({ type: t, text: String(msg.text() || "").slice(0, 300) }); });
    page.on("pageerror", (e) => report.console.push({ type: "pageerror", text: String(e && e.message || e).slice(0, 300) }));
    page.on("request", (r) => {
      const u = r.url();
      if (!/diy\.zheliyin\.com/.test(u)) return;
      const rec = { ts: Date.now(), m: r.method(), u: u };
      try { const pd = r.postData(); if (pd) rec.body = String(pd).slice(0, 4000); } catch (e) {}
      reqLog.push(rec);
      if (/saveThirdUserDesign|saveUserDesign|IfDiyOrderidExit|getShopAndWangWangInfo/i.test(u)) fs.appendFileSync(REQS_LOG, JSON.stringify(rec) + "\n");
    });
    page.on("response", async (r) => {
      const u = r.url();
      if (!/IfDiyOrderidExit|saveThirdUserDesign|saveUserDesign|getShopAndWangWangInfo/i.test(u)) return;
      try { report.resp = report.resp || []; report.resp.push({ status: r.status(), u: u, body: String(await r.text()).slice(0, 2000) }); } catch (e) {}
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

    await page.evaluate(() => {
      window.__zyLayers = [];
      const L = window.layer;
      if (L && !window.__zyLayerHooked) {
        const orig = L.open;
        window.__zyLayerHooked = true;
        L.open = function (opts) {
          try { const o = opts || {}; window.__zyLayers.push({ title: String(o.title || "").slice(0, 60), text: String((typeof o.content === "string" ? o.content : "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 280) }); } catch (e) {}
          return orig.apply(this, arguments);
        };
      }
    }).catch(() => {});

    // 创建探针 + 校准 4 个 location*（v10 路径）
    report.phases.probe = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      for (let i = 0; i < vo.totalCanvasArray.length; i++) {
        const d = vo.totalCanvasArray[i];
        if (!(d && typeof d.drawText === "function" && d.canvas && d.canvas.getObjects && d.canvasObjInfo)) continue;
        const baseLayer = d.canvasObjInfo.canvasToProductObjArr.length;
        const uid = "zlyunlock8-" + Date.now() % 1000000;
        const entry = { media: { mediaType: "text", text: uid, font: { pointSize: 24, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "556", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.3, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: 100, y: 100, width: 200, height: 40, factWidth: 200, factHeight: 40, rotation: 0 }, printLocation: { x: 100, y: 100, width: 200, height: 40, rotation: 0 }, layer: { alpha: 1 }, layerNum: baseLayer, isEdit: 1, isDisplay: 1, deleteState: 0, visitLevel: 1, multiUuid: uid, markuuid: "" };
        d.drawText(uid, null, null, null, entry, baseLayer);
        const o = d.canvas.getObjects().filter((ob) => String(ob.text || "") === uid)[0];
        const sw = o.getScaledWidth ? o.getScaledWidth() : o.width * o.scaleX;
        const sh = o.getScaledHeight ? o.getScaledHeight() : o.height * o.scaleY;
        if (!o.uuid) { o.uuid = o.multiUuid; }
        o.locationWidth = sw; o.locationHeight = sh; o.locationFactWidth = sw; o.locationFactHeight = sh;
        o.mediafactWidth = sw; o.mediafactHeight = sh;
        return { uid: uid, before: { w: o.width, h: o.height, locW: 200, locH: 40 }, after: { locW: o.locationWidth, locH: o.locationHeight, uuid: o.uuid } };
      }
      return { err: "no live CanvasDiy" };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    const clickSave = () => page.evaluate(() => {
      const btn = document.querySelector(".rightBtn .save") || document.querySelector("a.save") || null;
      if (!btn) return { clicked: false };
      try { btn.click(); return { clicked: true }; } catch (e) { return { err: String(e) }; }
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    const fillPanel = () => page.evaluate(() => {
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
          for (let k = 0; k < keys.length; k++) { if (joined.indexOf(keys[k]) >= 0 && !el.__filled) { el.value = val; try { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {} el.__filled = 1; log.push("set:" + (el.id || "input").toString().slice(0, 24)); return; } }
        }
      };
      setByLabel(["作品", "作品名", "workName", "名称"], "样式还原OCR保存验证");
      setByLabel(["用户", "用户名", "userName", "姓名"], "样式还原测试");
      setByLabel(["备注"], "stage-7.3 unlock8");
      // 印刷格式/色彩模式（radio）
      const pickRadio = (txt) => {
        const radios = scope.querySelectorAll("input[type=radio], input[name*=print], input[name*=color], input[name*=printingtype], input[name*=colorspace]");
        for (let i = 0; i < radios.length; i++) {
          const el = radios[i];
          const lab = String((el.parentElement ? el.parentElement.textContent : "") || "").trim();
          const val = String(el.value || "");
          if (lab.indexOf(txt) >= 0 || val.toUpperCase().indexOf(txt.toUpperCase()) >= 0) { try { el.click(); log.push("radio:" + txt + "(" + (el.name || "") + "=" + val.slice(0, 12) + ")"); return true; } catch (e) {} }
        }
        return false;
      };
      pickRadio("PDF");
      pickRadio("CMYK");
      const selects = scope.querySelectorAll("select");
      for (let i = 0; i < selects.length; i++) { try { const s = selects[i]; if (s && s.options && s.options.length) { s.selectedIndex = 0; s.dispatchEvent(new Event("change", { bubbles: true })); log.push("select:" + (s.name || s.id) + "->" + s.value); } } catch (e) {} }
      return { log: log };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    const clickCommit = () => page.evaluate(() => {
      const layers = document.querySelectorAll(".layui-layer");
      let host = null;
      for (let i = 0; i < layers.length; i++) { if (layers[i].offsetParent || layers[i].style.display !== "none") { host = layers[i]; break; } }
      const scope = host || document;
      const btns = scope.querySelectorAll("button, a, .layui-layer-btn0, .modal-btn-commit, input[type=button]");
      let clicked = null;
      for (let i = 0; i < btns.length; i++) {
        const tx = String(btns[i].textContent || btns[i].value || "").trim();
        if (/确定|保存|提交|确认|下一步/.test(tx) && !/取消|关闭|删除/.test(tx)) { try { btns[i].click(); clicked = tx.slice(0, 20); break; } catch (e) {} }
      }
      return { clicked: clicked };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    report.phases.save1 = {};
    report.phases.save1.click = await clickSave();
    await page.waitForTimeout(3500);
    report.phases.save1.fill = await fillPanel();
    report.phases.save1.commit = await clickCommit();
    await page.waitForTimeout(8000);
    report.phases.save1.layers = await page.evaluate(() => { const L = window.__zyLayers || []; window.__zyLayers = []; return L; }).catch(() => []);
    report.phases.save1.bodySnippet = await page.evaluate(() => String(document.body.innerText || "").replace(/\n+/g, " | ").slice(0, 500)).catch((e) => String(e || "").slice(0, 200));
    report.phases.save1.objCount = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      return vo.totalCanvasArray.map((d) => (d.canvas && d.canvas.getObjects ? d.canvas.getObjects().length : -1));
    }).catch(() => null);
    // 写库/关键请求最后快照
    report.phases.save1.keyReqs = reqLog.filter((r) => /saveThirdUserDesign|saveUserDesign|IfDiyOrderidExit|getShopAndWangWangInfo|third.*order/i.test(r.u)).map((r) => ({ m: r.m, u: r.u, b: r.body ? r.body.slice(0, 160) : null }));
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.message || e).slice(0, 400));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log("STAGE-7.3-SAVE-UNLOCK8 done -> " + REPORT_PATH);
  console.log("ready=" + report.phases.ready);
  console.log("probe=" + JSON.stringify(report.phases.probe));
  console.log("fill=" + JSON.stringify(report.phases.save1 && report.phases.save1.fill));
  console.log("commit=" + JSON.stringify(report.phases.save1 && report.phases.save1.commit));
  console.log("layers=" + JSON.stringify((report.phases.save1 && report.phases.save1.layers || []).map((l) => ({ t: l.title, txt: (l.text || "").slice(0, 70) }))));
  console.log("console=" + JSON.stringify(report.console.slice(0, 15)));
  console.log("keyReqs=" + JSON.stringify(report.phases.save1 && report.phases.save1.keyReqs));
  console.log("dialogs=" + JSON.stringify(report.dialogs));
  console.log("allReqsTail=" + JSON.stringify(reqLog.slice(-20).map((r) => r.u.slice(-90))));
})().catch((e) => { console.error("probe crashed: " + e); process.exit(1); });