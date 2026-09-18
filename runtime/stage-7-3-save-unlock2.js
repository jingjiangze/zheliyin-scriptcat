// runtime/stage-7-3-save-unlock2.js — t4 第二轮：dump 设计信息 modal 完整结构并对齐必填项
// v1 结论：填完 workName/userName/thirdOrderNo 点确定后零网络请求 → 本地校验拦截。
// 本版：1) 抓 modal 容器 HTML 全文（fields+labels+select options+required 标记）
//       2) 尝试用表单自身 jQuery 数据校验规则补全（勾选 checkbox、select 首选项）
//       3) 再点确定，监听网络变化；抓错误提示元素
// 输出：runtime/reports/stage-7-3-save-unlock2.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-7-3-save-unlock2.json");
const REAL_ORDER = "5115522170112153822";

const findDiySrc = "(function(){var req=window.requirejs||window.require;var vo=(req&&req.s&&req.s.contexts&&req.s.contexts._&&req.s.contexts._.defined&&req.s.contexts._.defined.CanvasObjVO)||window.CanvasObjVO;if(!vo||!Array.isArray(vo.totalCanvasArray))return null;for(var i=0;i<vo.totalCanvasArray.length;i++){var d=vo.totalCanvasArray[i];if(d&&typeof d.drawText==='function'&&d.canvas&&d.canvas.getObjects&&d.canvasObjInfo)return d;}return null;})()";

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-7.3-SAVE-UNLOCK2", url: EDITOR_URL, order: REAL_ORDER, phases: {}, reqSeq: [], dialogs: [], errors: [] };
  let browser = null;
  let page = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    browser.on("dialog", (d) => { report.dialogs.push({ t: Date.now(), msg: String(d.message() || "").slice(0, 200) }); d.accept().catch(() => {}); });
    page = browser.pages()[0];
    page.on("request", (r) => {
      const u = r.url();
      if (!/diy\.zheliyin\.com/.test(u)) return;
      const rec = { seq: report.reqSeq.length, m: r.method(), u: u };
      try { const pd = r.postData(); if (pd) rec.body = String(pd).slice(0, 2500); } catch (e) {}
      report.reqSeq.push(rec);
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

    // Phase 1: 创建一个探针对象（默认字体）
    report.phases.createProbe = await page.evaluate((p) => {
      const d = eval(p.src);
      if (!d) return { err: "no live CanvasDiy" };
      const baseLayer = d.canvasObjInfo.canvasToProductObjArr.length;
      const uid = "zlysave2-" + Date.now();
      const entry = {
        media: { mediaType: "text", text: uid, font: { pointSize: 24, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "1", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.3, lineIdType: 0, isBG: 0, imgPath: "" },
        location: { x: 100, y: 100, width: 200, height: 40, factWidth: 200, factHeight: 40, rotation: 0 },
        printLocation: { x: 100, y: 100, width: 200, height: 40, rotation: 0 },
        layer: { alpha: 1 }, layerNum: baseLayer, isEdit: 1, isDisplay: 1, deleteState: 0, visitLevel: 1,
        multiUuid: uid, markuuid: ""
      };
      d.drawText(uid, null, null, null, entry, baseLayer);
      return { uid: uid, total: d.canvas.getObjects().length };
    }, { src: findDiySrc }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // Phase 2: 点保存按钮 → 等待 modal 出现
    report.phases.saveBtn = await page.evaluate(() => {
      const btn = document.querySelector(".rightBtn .save") || document.querySelector("a.save") || null;
      if (!btn) return { clicked: false };
      try { btn.click(); return { clicked: true }; } catch (e) { return { err: String(e) }; }
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    await page.waitForTimeout(3500);

    // Phase 3: 抓 modal 容器（先定位再全文）
    report.phases.modalHtml = await page.evaluate(() => {
      const cand = Array.prototype.map.call(document.querySelectorAll(".modal, .layui-layer, .design-modal, .mbox, .win-box"), (el) => el.className).slice(0, 10);
      // 找含 workName 的容器
      const w = document.getElementById("workName");
      let host = null;
      if (w) { let n = w; for (let i = 0; i < 6 && n; i++) { n = n.parentElement; if (n && /modal|layer|dialog|mbox|win/i.test(n.className || "")) { host = n; break; } } }
      const html = host ? host.outerHTML.slice(0, 9000) : (w ? (w.parentElement ? w.parentElement.parentElement ? w.parentElement.parentElement.outerHTML.slice(0, 3000) : "" : "") : "");
      // 字段+label+select options+required 概览
      const dump = (host || w ? (host || w.parentElement) : null);
      const fields = [];
      const sel = (dump || document).querySelectorAll("input, select, textarea");
      for (const el of Array.prototype.slice.call(sel)) {
        const req = !!(el.getAttribute && (el.getAttribute("required") != null || /required|must|check/.test(String((el.className || "") + " " + (el.getAttribute("validate") || "")))));
        const lbl = (() => { let p = el.closest("td, .item, .row, label"); return p ? String(p.innerText || "").replace(/[：:*\s]/g, "").slice(0, 14) : ""; })();
        fields.push({ tag: el.tagName, id: el.id || null, name: el.name || null, type: el.type || null, req: req, lbl: lbl, value: String(el.value != null ? el.value : "").slice(0, 40) });
      }
      const selects = [];
      for (const el of Array.prototype.slice.call(sel)) {
        if (el.tagName !== "SELECT") continue;
        const opts = Array.prototype.slice.call(el.options).slice(0, 14).map((o) => o.text + "=" + o.value);
        selects.push({ id: el.id || null, val: el.value, options: opts });
      }
      const checkboxes = [];
      for (const el of Array.prototype.slice.call(sel)) {
        if (el.type === "checkbox") checkboxes.push({ id: el.id || null, cls: String(el.className).slice(0, 40), checked99: el.checked, lbl: String((el.closest("td, .item, .row, label") || {}).innerText || "").replace(/[：:*\s]/g, "").slice(0, 14) });
      }
      return { cand: cand, hostFound: !!host, hostClass: host ? host.className : null, html: html, fields: fields, selects: selects, checkboxes: checkboxes };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // Phase 4: 补全必填（checkbox 勾选、select 首选项/缺省选项、必填文本）后点确定
    report.phases.completeAndSubmit = await page.evaluate((p) => {
      const log = [];
      const q = (sel) => { try { return document.querySelector(sel) || null; } catch (e) { return null; } };
      const setVal = (sel, val) => { const el = q(sel); if (!el) { log.push(sel + " MISSING"); return false; } el.value = val; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); log.push(sel + "=" + String(val).slice(0, 26)); return true; };
      // 必填文本字段（若空则填）
      const fillText = (sel, dft) => { const el = q(sel); if (el && !el.value) return setVal(sel, dft); return el ? (log.push(sel + " keep=" + String(el.value).slice(0, 16)), true) : (log.push(sel + " MISSING"), false); };
      fillText("#workName", "OCR样式还原保存验证");
      fillText("#userName", "样式还原测试");
      setVal("#remarkInfor", "stage-7.3 save-unlock2");
      setVal("#thirdOrderNo", p.order);
      setVal("#tbOrderNo", p.order);
      // 勾选未勾的 checkbox（避开通读确认之外可能导致校验失败的项，全部尝试但标注）
      const cbs = Array.prototype.slice.call(document.querySelectorAll("input[type=checkbox]"));
      cbs.forEach((cb, i) => { if (!cb.checked) { try { cb.click(); log.push("checkbox" + i + " clicked (" + String(cb.id || cb.className).slice(0, 30) + ")"); } catch (e) {} } });
      // select：把 value 为空的选择设为第二项（若存在非空选项）
      const sels = Array.prototype.slice.call(document.querySelectorAll("select"));
      sels.forEach((s2, i) => { if (!s2.value) { for (let j = 0; j < s2.options.length; j++) { if (s2.options[j].value && s2.options[j].value !== "0") { try { s2.value = s2.options[j].value; s2.dispatchEvent(new Event("change", { bubbles: true })); log.push("select" + i + "(" + (s2.id || "") + ") = " + s2.options[j].text); } catch (e) {} break; } } } });
      return { log: log };
    }, { src: findDiySrc, order: REAL_ORDER }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    await page.waitForTimeout(2500);

    // 点确定按钮
    report.phases.submit = await page.evaluate(() => {
      const btn = document.querySelector(".modal-btn-commit") || null;
      if (!btn) return { clicked: false };
      try { btn.click(); return { clicked: true, cls: btn.className, text: String(btn.textContent).trim().slice(0, 10) }; } catch (e) { return { err: String(e) }; }
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    await page.waitForTimeout(4000);

    // Phase 5: 提交后状态：modal 是否收起、错误提示、网络是否出现新请求
    report.phases.after = await page.evaluate(() => {
      const w = document.getElementById("workName");
      const modalVisible = w ? !!(w.offsetParent) : null;
      const errs = Array.prototype.map.call(document.querySelectorAll(".error, .tip, .msg, .layui-layer-msg, [class*=error]"), (el) => ({ cls: String(el.className).slice(0, 50), text: String(el.innerText || el.textContent || "").slice(0, 80) })).filter((e) => e.text).slice(0, 8);
      const bodySnippet = String(document.body.innerText || "").slice(0, 700);
      return { modalVisible: modalVisible, errs: errs, snippet: bodySnippet };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    await page.waitForTimeout(3000);
    report.phases.netCount = report.reqSeq.length;
    const relevant = report.reqSeq.map((r) => ({ m: r.m, u: r.u, body: r.body ? r.body.slice(0, 200) : null })).filter((r) => /save|order|wangwang|shop|IfDiy|design/i.test(r.u));
    report.phases.relevant = relevant;
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.message || e).slice(0, 400));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log("STAGE-7.3-SAVE-UNLOCK2 done -> " + REPORT_PATH);
  console.log("ready=" + report.phases.ready + " createProbe=" + JSON.stringify(report.phases.createProbe).slice(0, 200));
  console.log("modalHost=" + (report.phases.modalHtml && report.phases.modalHtml.hostClass) + " fields=" + (report.phases.modalHtml && report.phases.modalHtml.fields ? report.phases.modalHtml.fields.length : -1));
  console.log("completeLog=" + JSON.stringify(report.phases.completeAndSubmit).slice(0, 700));
  console.log("after=" + JSON.stringify(report.phases.after).slice(0, 500));
  console.log("relevant=" + JSON.stringify(report.phases.relevant));
})().catch((e) => { console.error("probe crashed: " + e); process.exit(1); });