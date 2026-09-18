// runtime/stage-7-3-save-unlock10.js — t4 v14：patch JSON.parse 捕获序列化失败报文原文
// 判定 R() 三连 FAIL 的最终形态：JSON.parse 语法错误 vs location/printLocation 宽高 ≤ 0。
// 做法：window.JSON.parse → 记录抛异常的调用（失败报文前 2500 字符）与最近含 printLocation 的成功调用。
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-7-3-save-unlock10.json");

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-7.3-SAVE-UNLOCK10", url: EDITOR_URL, phases: {}, dialogs: [], errors: [] };
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

    // patch JSON.parse（尽量早）
    await page.evaluate(() => {
      window.__zyParse = { fails: [], lastPL: null };
      const orig = JSON.parse;
      JSON.parse = function (s, rev) {
        const isPL = typeof s === "string" && s.indexOf('"printLocation"') >= 0;
        if (typeof s === "string" && s.length > 80 && (isPL || true)) {
          try {
            const r = orig.call(JSON, s, rev);
            if (isPL) {
              try {
                const cap = window.__zyParse;
                if (r && r.location !== undefined) {
                  cap.lastPL = { len: s.length, loc: r.location, print: r.printLocation, text: r.media && r.media.text, fontId: r.media && r.media.font && r.media.font.id, mediaType: r.media && r.media.mediaType };
                }
              } catch (e2) {}
            }
            return r;
          } catch (e) {
            try {
              const cap = window.__zyParse;
              if (cap.fails.length < 8) cap.fails.push({ err: String(e && e.message || e).slice(0, 80), s: String(s).slice(0, 2600) });
            } catch (e3) {}
            throw e;
          }
        }
        return orig.call(JSON, s, rev);
      };
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

    // 创建探针（干净，drawText 默认路径 —— 与 v9/v11/v12 一致）
    report.phases.probe = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      for (let i = 0; i < vo.totalCanvasArray.length; i++) {
        const d = vo.totalCanvasArray[i];
        if (!(d && typeof d.drawText === "function" && d.canvas && d.canvas.getObjects && d.canvasObjInfo)) continue;
        const baseLayer = d.canvasObjInfo.canvasToProductObjArr.length;
        const uid = "zlyunlock10-" + Date.now() % 1000000;
        const entry = { media: { mediaType: "text", text: uid, font: { pointSize: 24, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "556", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.3, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: 100, y: 100, width: 200, height: 40, factWidth: 200, factHeight: 40, rotation: 0 }, printLocation: { x: 100, y: 100, width: 200, height: 40, rotation: 0 }, layer: { alpha: 1 }, layerNum: baseLayer, isEdit: 1, isDisplay: 1, deleteState: 0, visitLevel: 1, multiUuid: uid, markuuid: "" };
        d.drawText(uid, null, null, null, entry, baseLayer);
        return { uid: uid };
      }
      return { err: "no live CanvasDiy" };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

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
          for (let k = 0; k < keys.length; k++) { if (joined.indexOf(keys[k]) >= 0 && !el.__filled) { el.value = val; try { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {} el.__filled = 1; log.push((el.id || "input").toString().slice(0, 20)); return; } }
        }
      };
      setByLabel(["作品", "作品名", "workName", "名称"], "样式还原OCR保存验证");
      setByLabel(["用户", "用户名", "userName", "姓名"], "样式还原测试");
      setByLabel(["备注"], "stage-7.3 unlock10");
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
    await page.waitForTimeout(8000);
    report.phases.save1.parse = await page.evaluate(() => {
      const z = window.__zyParse || {};
      return { fails: (z.fails || []).map((f) => ({ err: f.err, s: f.s.slice(0, 2400) })), lastPL: z.lastPL };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    report.phases.save1.bodySnippet = await page.evaluate(() => String(document.body.innerText || "").replace(/\n+/g, " | ").slice(0, 300)).catch(() => "");
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.message || e).slice(0, 400));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log("STAGE-7.3-SAVE-UNLOCK10 done -> " + REPORT_PATH);
  console.log("ready=" + report.phases.ready);
  console.log("probe=" + JSON.stringify(report.phases.probe));
  console.log("save1-fill=" + JSON.stringify(report.phases.save1 && report.phases.save1.fill));
  const p = report.phases.save1 && report.phases.save1.parse || {};
  console.log("parseFails=" + (p.fails || []).length);
  (p.fails || []).slice(0, 3).forEach((f, i) => { console.log("FAIL" + i + " err=" + f.err); console.log("FAIL" + i + " s=" + f.s.slice(0, 900)); });
  console.log("lastPL=" + JSON.stringify(p.lastPL));
  console.log("dialogs=" + JSON.stringify(report.dialogs));
  console.log("body=" + ((report.phases.save1 && report.phases.save1.bodySnippet) || "").slice(0, 250));
})().catch((e) => { console.error("probe crashed: " + e); process.exit(1); });