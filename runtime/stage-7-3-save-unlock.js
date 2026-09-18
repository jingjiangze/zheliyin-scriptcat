// runtime/stage-7-3-save-unlock.js — 用真实单号解锁保存链路（Stage 7.3 t4）
// 目标：
//   1) 创建 2 个字体探针 textbox（A=模板默认 id=1 → 方正黑体简体；B=思源黑体 Regular id=556）
//      （也为 t5 字体兼容性实验铺路）
//   2) 点原生保存按钮 → 抓 IfDiyOrderidExit.do 响应
//   3) 设计信息表单 dump → 注入 workName/userName/thirdOrderNo(真实单号 5115522170112153822)
//   4) 提交 → 抓 getShopAndWangWangInfo.do 响应 + saveThirdUserDesign.do 写库 payload
//      —— payload 里的对象字段结构 = 「编辑器真正保存的是什么」（toJsonKeys 无 mediafontId 的关键核查点）
//   5) 保存成功 → 记录 diyId/designId → reload 恢复检查（尽力而为）
// 输出：runtime/reports/stage-7-3-save-unlock.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-7-3-save-unlock.json");
const REAL_ORDER = "5115522170112153822";

const findDiySrc = "(function(){var req=window.requirejs||window.require;var vo=(req&&req.s&&req.s.contexts&&req.s.contexts._&&req.s.contexts._.defined&&req.s.contexts._.defined.CanvasObjVO)||window.CanvasObjVO;if(!vo||!Array.isArray(vo.totalCanvasArray))return null;for(var i=0;i<vo.totalCanvasArray.length;i++){var d=vo.totalCanvasArray[i];if(d&&typeof d.drawText==='function'&&d.canvas&&d.canvas.getObjects&&d.canvasObjInfo)return d;}return null;})()";

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-7.3-SAVE-UNLOCK", url: EDITOR_URL, order: REAL_ORDER, phases: {}, reqSeq: [], resp: [], dialogs: [], consoleLogs: [], errors: [] };
  let browser = null;
  let page = null;
  const intUrl = (u) => /save|diy|order|wangwang|shop|design|json|upload/i.test(u) ? u : null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    browser.on("dialog", (d) => { report.dialogs.push({ t: Date.now(), msg: String(d.message() || "").slice(0, 200), type: d.type() }); d.accept().catch(() => {}); });
    page = browser.pages()[0];
    page.on("console", (m) => { const t = m.text(); if (/zy-ocr|error|warn|save|exception/i.test(t)) report.consoleLogs.push({ t: Date.now(), type: m.type(), msg: String(t).slice(0, 240) }); });
    page.on("request", (r) => {
      const u = r.url();
      if (!/diy\.zheliyin\.com/.test(u)) return;
      const rec = { seq: report.reqSeq.length, m: r.method(), u: u };
      try { const pd = r.postData(); if (pd) rec.body = String(pd).slice(0, 2400); } catch (e) {}
      report.reqSeq.push(rec);
    });
    page.on("response", async (r) => {
      const u = r.url();
      if (!/diy\.zheliyin\.com/.test(u)) return;
      let body = "";
      try { body = await r.text(); } catch (e) { body = "<no-body>"; }
      if (report.resp.length > 30) return;
      report.resp.push({ seq: report.resp.length, status: r.status(), u: u, body: String(body).slice(0, 5000) });
    });

    // ---- ready ----
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

    // ---- Phase 1: 创建 2 个字体探针 textbox ----
    report.phases.createProbes = await page.evaluate((p) => {
      const d = eval(p.src);
      if (!d) return { err: "no live CanvasDiy" };
      const out = [];
      const fonts = [
        { label: "A-default(id1)", id: "1", name: "方正黑体简体", color: "#000000", x: 120, y: 120 },
        { label: "B-siyuan-regular(556)", id: "556", name: "思源黑体 Regular", color: "#c0392b", x: 120, y: 180 }
      ];
      fonts.forEach((f, i) => {
        try {
          const baseLayer = d.canvasObjInfo.canvasToProductObjArr.length;
          const uid = "zlysave-" + Date.now() + "-" + i;
          const entry = {
            media: { mediaType: "text", text: uid, font: { pointSize: 26, fontColor: f.color, isHorizontal: 1, gravity: "left", id: f.id, isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.3, lineIdType: 0, isBG: 0, imgPath: "" },
            location: { x: f.x, y: f.y, width: 220, height: 42, factWidth: 220, factHeight: 42, rotation: 0 },
            printLocation: { x: f.x, y: f.y, width: 220, height: 42, rotation: 0 },
            layer: { alpha: 1 }, layerNum: baseLayer, isEdit: 1, isDisplay: 1, deleteState: 0, visitLevel: 1,
            multiUuid: uid, markuuid: ""
          };
          d.drawText(uid, null, null, null, entry, baseLayer);
          const o = d.canvas.getObjects().filter((ob) => String(ob.text || "") === uid)[0] || null;
          out.push({ label: f.label, uid: uid, created: !!o, fontFamily: o ? o.fontFamily : null, fontSize: o ? o.fontSize : null, fill: o ? o.fill : null, mediafontId: o ? o.mediafontId : null });
        } catch (e) { out.push({ label: f.label, err: String(e && e.message || e).slice(0, 150) }); }
      });
      return { created: out, total: d.canvas.getObjects().length };
    }, { src: findDiySrc }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // ---- Phase 2: 点保存按钮 ----
    report.phases.saveBtn = await page.evaluate(() => {
      const btns = Array.prototype.map.call(document.querySelectorAll(".rightBtn .save, a.save, .save"), (b) => ({ tag: b.tagName, cls: b.className, text: String(b.textContent || "").trim().slice(0, 20) })).slice(0, 5);
      const btn = document.querySelector(".rightBtn .save") || document.querySelector("a.save") || null;
      if (btn) { try { btn.click(); } catch (e) { return { err: String(e), btns: btns }; } return { clicked: true, btns: btns }; }
      return { clicked: false, btns: btns };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    await page.waitForTimeout(2500);

    // ---- Phase 3: 设计信息表单 dump ----
    report.phases.formDump = await page.evaluate(() => {
      const fields = Array.prototype.map.call(document.querySelectorAll("input, select, textarea"), (el) => ({
        tag: el.tagName, id: el.id || null, name: el.name || null, type: el.type || null, value: String(el.value != null ? el.value : "").slice(0, 60)
      })); 
      const btns = Array.prototype.map.call(document.querySelectorAll("button, a, input[type=button], input[type=submit]"), (el) => String(el.textContent || el.value || "").trim().slice(0, 16)).filter(Boolean).slice(0, 20);
      return { fields: fields, btns: btns, bodySnippet: String(document.body.innerText || "").slice(0, 1200) };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // ---- Phase 4: 填写表单 + 注入真实单号 + 提交 ----
    report.phases.fillForm = await page.evaluate((p) => {
      const log = [];
      const q = (sel) => { try { const el = document.querySelector(sel); return el || null; } catch (e) { return null; } };
      const setVal = (sel, val) => { const el = q(sel); if (!el) { log.push(sel + " MISSING"); return false; } el.value = val; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); log.push(sel + " = " + String(val).slice(0, 30)); return true; };
      setVal("#workName", "OCR样式还原保存验证");
      setVal("#userName", "样式还原测试");
      setVal("#remarkInfor", "stage-7.3 save-unlock probe");
      const hasThird = !!q("#thirdOrderNo");
      const thirdSet = setVal("#thirdOrderNo", p.order);
      const hasTb = !!q("#tbOrderNo");
      const tbSet = setVal("#tbOrderNo", p.order);
      // 尝试触发表单关联逻辑（blur）
      const el = q("#thirdOrderNo");
      if (el) { try { el.dispatchEvent(new Event("blur", { bubbles: true })); } catch (e) {} }
      return { log: log, hasThird: hasThird, thirdSet: thirdSet, hasTb: hasTb, tbSet: tbSet };
    }, { src: findDiySrc, order: REAL_ORDER }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    await page.waitForTimeout(3000);

    // 提交：优先点击可见的主操作按钮（保存/确定/立即保存）
    report.phases.submit = await page.evaluate(() => {
      const key = ["立即保存", "保存", "确定", "确认", "生成", "完成"];
      const els = Array.prototype.slice.call(document.querySelectorAll("button, a, input[type=button], input[type=submit]"));
      for (const k of key) {
        for (const el of els) {
          const t = String((el.textContent || el.value) || "").trim();
          if (t.indexOf(k) >= 0 && el.offsetParent !== null) { try { el.click(); return { clicked: k, cls: String(el.className).slice(0, 60) }; } catch (e) { return { err: String(e), tried: k }; } }
        }
      }
      return { clicked: null, note: "no visible submit button found" };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    await page.waitForTimeout(4000);

    // ---- Phase 5: 提交后的额外表单 / 二次确认 ----
    report.phases.afterSubmit = await page.evaluate(() => {
      const fields = Array.prototype.map.call(document.querySelectorAll("input, select, textarea"), (el) => ({ id: el.id || null, name: el.name || null, value: String(el.value != null ? el.value : "").slice(0, 60) }));
      return { fields: fields, snippet: String(document.body.innerText || "").slice(0, 800) };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    await page.waitForTimeout(5000);

    // ---- Phase 6: 保存结果判定（从请求序列推断）+ 存放 diyId ----
    report.phases.saveOutcome = await page.evaluate(() => {
      const d = document.querySelector("#diyId") || null;
      const diyId = d ? d.value : null;
      const body = document.body.innerText || "";
      return { diyId: diyId, hasSuccessText: /成功/.test(body), hasFailText: /失败|错误|异常/.test(body), snippet: String(body).slice(0, 900) };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // ---- Phase 7: reload 恢复检查（尽力而为）----
    const diyId = report.phases.saveOutcome && report.phases.saveOutcome.diyId;
    if (diyId) {
      const editUrl = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyEdit.do?designId=" + diyId;
      report.phases.reloadCheck = { url: editUrl };
      await page.goto(editUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => { report.phases.reloadCheck.gotoErr = String(e || "goto fail"); });
      await page.waitForTimeout(4000);
      report.phases.reloadCheck.after = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
        const d = vo && Array.isArray(vo.totalCanvasArray) && vo.totalCanvasArray[0];
        if (!d || !d.canvas || !d.canvas.getObjects) return { ready: false };
        const objs = d.canvas.getObjects();
        const texts = objs.filter((o) => String(o.text || "").indexOf("zlysave-") >= 0).map((o) => ({ text: String(o.text).slice(0, 24), fontFamily: o.fontFamily, fontSize: o.fontSize, fill: o.fill }));
        return { ready: true, total: objs.length, restoredProbes: texts };
      }).catch((e) => ({ err: String(e || "").slice(0, 150) }));
    } else {
      report.phases.reloadCheck = { skipped: true, note: "no diyId captured" };
    }
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.message || e).slice(0, 400));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log("STAGE-7.3-SAVE-UNLOCK done -> " + REPORT_PATH);
  console.log("ready=" + report.phases.ready + " createProbes=" + JSON.stringify(report.phases.createProbes).slice(0, 500));
  const saves = report.reqSeq.filter((r) => /saveThird|getShopAndWang|IfDiyOrderid/i.test(r.u)).map((r) => ({ m: r.m, u: r.u, body: r.body ? r.body.slice(0, 300) : null }));
  console.log("saveRelatedReq=" + JSON.stringify(saves));
})().catch((e) => { console.error("probe crashed: " + e); process.exit(1); });