// runtime/stage-7-3-save-unlock3.js — t4 v7：保存面板全状态快照 + 按钮逐个触发 + 网络监听
// 目标：1) #checkOperate/#AllOrderSelected/#worksStatus/#isAdmin/#typeid/#sourceId/#diyId/#tbOrderNo 状态
//       2) 保存面板完整 DOM（所有按钮文本+可见性+父容器）
//       3) 依次触发面板按钮，监听 saveThirdUserDesign.do / getShopAndWangWangInfo.do
// 输出：runtime/reports/stage-7-3-save-unlock3.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-7-3-save-unlock3.json");
const REAL_ORDER = "5115522170112153822";

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-7.3-SAVE-UNLOCK3", url: EDITOR_URL, order: REAL_ORDER, phases: {}, reqs: [], errors: [] };
  let browser = null;
  let page = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    browser.on("dialog", (d) => { report.dialogs = report.dialogs || []; report.dialogs.push(String(d.message() || "").slice(0, 200)); d.accept().catch(() => {}); });
    page = browser.pages()[0];
    page.on("request", (r) => { const u = r.url(); if (!/diy\.zheliyin\.com/.test(u)) return; const rec = { seq: report.reqs.length, m: r.method(), u: u }; try { const pd = r.postData(); if (pd) rec.body = String(pd).slice(0, 2600); } catch (e) {} report.reqs.push(rec); });
    page.on("response", async (r) => { const u = r.url(); if (!/IfDiyOrderidExit|saveThirdUserDesign|getShopAndWangWangInfo|saveUserDesign/i.test(u)) return; try { const b = await r.text(); if (report.resp.length > 12) return; (report.resp = report.resp || []).push({ status: r.status(), u: u, body: String(b).slice(0, 3000) }); } catch (e) {} });

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

    // ---- Phase 1: 关键隐藏字段状态 ----
    report.phases.state = await page.evaluate(() => {
      const ids = ["diyId", "worksStatus", "isAdmin", "typeid", "diyTypeNum", "sourceId", "tbOrderNo", "thirdOrderNo", "checkOperate", "AllOrderSelected", "workName", "userName", "remarkInfor", "bind-orderNo", "copyDesignNo", "orderId", "templateName", "templateState", "multiCheck", "isNoSave", "newFlag", "isNoOneKey", "hdgyMenu"];
      const out = {};
      ids.forEach((id) => { const el = document.getElementById(id); out[id] = el === null ? "MISSING" : { v: String(el.value != null ? el.value : "").slice(0, 40), vis: !!(el.offsetParent), type: el.type || el.tagName }; });
      // 搜索订单输入框（hdgyMenu search / searchOrderInput）
      const search = [];
      document.querySelectorAll("input").forEach((el) => { const c = String(el.className || ""); const id = String(el.id || ""); if (/search|order/i.test(c + id)) search.push({ id: id, cls: c.slice(0, 30), ph: String(el.placeholder || "").slice(0, 20), vis: !!(el.offsetParent) }); });
      out._searchInputs = search.slice(0, 10);
      return out;
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // ---- 创建探针对象 ----
    report.phases.createProbe = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      for (let i = 0; i < vo.totalCanvasArray.length; i++) { const d = vo.totalCanvasArray[i]; if (d && typeof d.drawText === "function" && d.canvas && d.canvas.getObjects && d.canvasObjInfo) {
        const baseLayer = d.canvasObjInfo.canvasToProductObjArr.length;
        const uid = "zlysave3-" + Date.now();
        const entry = { media: { mediaType: "text", text: uid, font: { pointSize: 24, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "556", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.3, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: 100, y: 100, width: 200, height: 40, factWidth: 200, factHeight: 40, rotation: 0 }, printLocation: { x: 100, y: 100, width: 200, height: 40, rotation: 0 }, layer: { alpha: 1 }, layerNum: baseLayer, isEdit: 1, isDisplay: 1, deleteState: 0, visitLevel: 1, multiUuid: uid, markuuid: "" };
        d.drawText(uid, null, null, null, entry, baseLayer);
        const o = d.canvas.getObjects().filter((ob) => String(ob.text || "") === uid)[0];
        return { uid: uid, mediafontId: o ? o.mediafontId : null, total: d.canvas.getObjects().length };
      } }
      return { err: "no live CanvasDiy" };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // ---- Phase 2: 点保存按钮 ----
    report.phases.saveBtn = await page.evaluate(() => { const btn = document.querySelector(".rightBtn .save") || document.querySelector("a.save") || null; if (!btn) return { clicked: false }; try { btn.click(); return { clicked: true }; } catch (e) { return { err: String(e) }; } }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    await page.waitForTimeout(3500);

    // ---- Phase 3: 保存面板完整 DOM（按钮+可见表单域+容器路径）----
    report.phases.panel = await page.evaluate(() => {
      // 找包含 workName 的可见容器链
      const w = document.getElementById("workName");
      let hosts = [];
      if (w) { let n = w; hosts.push("workName host chain:"); for (let i = 0; i < 7 && n; i++) { hosts.push(String(n.className || n.tagName || n.id).slice(0, 60)); n = n.parentElement; } }
      const btns = Array.prototype.map.call(document.querySelectorAll("button, a, input[type=button], input[type=submit], .btn, [class*=btn]"), (el) => ({ tag: el.tagName, cls: String(el.className || "").slice(0, 50), id: el.id || null, text: String(el.textContent || el.value || "").trim().slice(0, 14), vis: !!(el.offsetParent) })).filter((b) => /保存|确定|确认|提交|预览|下一步|完成|生成|绑定|查询|提交制作|检查/ .test(b.text) || /modal-btn/.test(b.cls)).slice(0, 30);
      const visibleInputs = Array.prototype.map.call(document.querySelectorAll("input, select, textarea"), (el) => { if (!el.offsetParent) return null; return { id: el.id || null, type: el.type || el.tagName, ph: String(el.placeholder || "").slice(0, 16), val: String(el.value != null ? el.value : "").slice(0, 30), cls: String(el.className).slice(0, 30) }; }).filter(Boolean).slice(0, 20);
      return { hostChain: hosts, btns: btns, visibleInputs: visibleInputs };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // ---- Phase 4: 填表（含 tbOrderNo 若存在；单号填所有 order 类输入框）+ 提交 ----
    report.phases.fill = await page.evaluate((p) => {
      const log = [];
      const set = (id, val) => { const el = document.getElementById(id); if (!el) { log.push(id + " MISSING"); return false; } el.value = val; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); log.push(id + "=" + String(val).slice(0, 22)); return true; };
      ["workName", "userName", "remarkInfor", "tbOrderNo", "thirdOrderNo", "bind-orderNo"].forEach((id) => { if (id === "workName") set(id, "OCR样式还原保存验证"); else if (id === "userName") set(id, "样式还原测试"); else if (id === "remarkInfor") set(id, "stage-7.3 save-unlock3"); else set(id, p.order); });
      // searchOrderInput / hdgyMenu search
      const searchInputs = [];
      document.querySelectorAll("input").forEach((el) => { const c = String(el.className || ""); const id = String(el.id || ""); if (/search|order/i.test(c + id)) { el.value = p.order; try { el.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {} searchInputs.push(id || c.slice(0, 20)); } });
      log.push("searchInputs=" + searchInputs.join(","));
      return { log: log };
    }, { src: null, order: REAL_ORDER }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    await page.waitForTimeout(2500);

    // 依次点击保存/确定/提交类按钮（按可见性优先，间隔 2.5s，监听写库）
    report.phases.clicks = [];
    const btnCandidates = [".modal-btn-commit", ".rightBtn .save", "a.save"];
    for (let b = 0; b < btnCandidates.length; b++) {
      const r = await page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return { sel: sel, found: false }; try { el.click(); return { sel: sel, found: true, vis: !!(el.offsetParent) }; } catch (e) { return { sel: sel, err: String(e) }; } }, btnCandidates[b]).catch((e) => ({ sel: btnCandidates[b], err: String(e || "") }));
      report.phases.clicks.push(r);
      await page.waitForTimeout(2800);
      if ((report.reqs.filter((x) => /saveThirdUserDesign/.test(x.u))).length) break;
    }
    report.phases.netSnapshot = report.reqs.map((r) => ({ u: r.u, m: r.m, b: r.body ? r.body.slice(0, 160) : null })).filter((r) => /save|order|wangwang|shop|IfDiy/i.test(r.u));
    report.phases.finalPanel = await page.evaluate(() => { const w = document.getElementById("workName"); return { workNameExists: !!w, workNameVisible: w ? !!(w.offsetParent) : null, snippet: String(document.body.innerText || "").slice(0, 500) }; }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.message || e).slice(0, 400));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log("STAGE-7.3-SAVE-UNLOCK3 done -> " + REPORT_PATH);
  console.log("ready=" + report.phases.ready);
  console.log("state-key=" + JSON.stringify({ diyId: report.phases.state && report.phases.state.diyId, checkOperate: report.phases.state && report.phases.state.checkOperate, sourceId: report.phases.state && report.phases.state.sourceId, typeid: report.phases.state && report.phases.state.typeid, tbOrderNo: report.phases.state && report.phases.state.tbOrderNo, db: report.phases.state && report.phases.state.diyId }, null, 1));
  console.log("panel-btns=" + JSON.stringify((report.phases.panel && report.phases.panel.btns || []).slice(0, 12)));
  console.log("clicks=" + JSON.stringify(report.phases.clicks));
  const saves = (report.reqs || []).filter((r) => /save|wangwang|shop/i.test(r.u)).map((r) => ({ m: r.m, u: r.u }));
  console.log("saveReqs=" + JSON.stringify(saves));
})().catch((e) => { console.error("probe crashed: " + e); process.exit(1); });