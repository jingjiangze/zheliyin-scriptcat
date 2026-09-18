// runtime/p0-font-print-probe.js — P0 复现探针（安全只读）
// 目标：单 textbox P0_FONT_TEST（font.id=556 思源黑 Regular）
//   Editor visible -> Save payload 捕获 -> 点击印刷候选按钮 -> 捕获:
//   - 所有请求/响应摘要（含非 diy 域名, 找 print/check/material 服务）
//   - layer.msg / l.open 弹层与标题文案（找「自动核稿失败提醒」及可能原因文案）
//   - 保存前后对象状态（是否被删）
// 安全：出现印刷/提交确认弹层时【只记录不确认】，绝不真实下单。
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "p0-font-print-probe.json");
const REAL_ORDER = "5115522170112153822";
const PROBE_TEXT = "P0_FONT_TEST";

(async () => {
  const report = { ts: new Date().toISOString(), stage: "P0-FONT-PRINT-PROBE", url: EDITOR_URL, probeText: PROBE_TEXT, order: REAL_ORDER, phases: {}, reqs: [], dialogs: [], logs: [], windows: [], errors: [] };
  let browser = null, page = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    browser.on("dialog", (d) => { report.dialogs.push({ kind: "native", msg: String(d.message() || "").slice(0, 300) }); d.accept().catch(() => {}); });
    browser.on("page", (p) => { try { report.windows.push({ event: "page-created", url: p.url().slice(0, 200) }); } catch (e) {} });
    page = browser.pages()[0];
    page.on("request", (r) => {
      const u = r.url();
      if (u.indexOf("zheliyin.com") < 0 || report.reqs.length > 400) return;
      const rec = { seq: report.reqs.length, m: r.method(), u: u.slice(0, 260) };
      // 只记录关键请求的 payload（print/check/material/font/save/proof 相关）
      try {
        if (/print|check|material|font|save|proof|submit|work|order|validate|product/i.test(u)) {
          const pd = r.postData();
          if (pd) rec.bodyHead = String(pd).slice(0, 3000);
        }
      } catch (e) {}
      report.reqs.push(rec);
    });
    page.on("response", async (r) => {
      const u = r.url();
      if (u.indexOf("zheliyin.com") < 0) return;
      if (!/print|check|material|font|save|proof|submit|work|order|validate|product|preview/i.test(u)) return;
      try {
        const ct = r.headers()["content-type"] || "";
        if (ct.indexOf("json") < 0 && ct.indexOf("text") < 0) return;
        let b = "";
        try { b = await r.text(); } catch (e) { b = ""; }
        report.resp = report.resp || [];
        if (report.resp.length < 40) report.resp.push({ status: r.status(), u: u.slice(0, 260), body: String(b).slice(0, 4000) });
      } catch (e) {}
    });
    page.on("console", (m) => { const t = String(m.text() || ""); if (/error|素材|核稿|字体|font/i.test(t)) report.logs.push({ type: m.type(), text: t.slice(0, 300) }); });
    page.on("pageerror", (e) => report.errors.push(String(e && e.message || e).slice(0, 300)));

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

    // 安装捕获: JSON.parse patch + layer/l.open 弹层钩子 + ax 记录
    report.phases.capture = await page.evaluate(() => {
      const out = { layerMsg: [], layerOpen: [], serialize: [], parseFails: [], calls: 0, topButtons: [] };
      // layer.msg / l.msg / l.open 钩子
      const hookMsg = (fnName) => {
        try {
          const l = window.layer || window.l;
          if (!l) return;
          const orig = l[fnName];
          if (!orig || orig.__zyHook) return;
          l[fnName] = function () {
            try { const a0 = arguments[0]; if (a0 && (typeof a0 === "string" || a0.content)) { const txt = typeof a0 === "string" ? a0 : (a0.title || "") + " | " + String(a0.content).slice(0, 200); out[fnName === "msg" && fnName === "open" ? "layerMsg" : "layerMsg"].length < 60 && out.layerMsg.push({ fn: fnName, txt: String(txt).slice(0, 300) }); } } catch (e) {}
            return orig.apply(this, arguments);
          };
          l[fnName].__zyHook = true;
        } catch (e) {}
      };
      hookMsg("msg"); hookMsg("open");
      // JSON.parse patch: 捕获含 printLocation/含本探针文字的序列化
      window.__p0Parse = out;
      const origParse = JSON.parse;
      if (!origParse.__zyP0) {
        JSON.parse = function (s, rev) {
          const isS = typeof s === "string" && s.length > 40;
          if (isS && out.calls < 30) {
            // 只探测含 printLocation 的 product json
            if (s.indexOf('"printLocation"') >= 0) {
              try {
                out.calls++;
                const r = origParse.call(JSON, s, rev);
                // 搜索本探针文字的 textbox 序列化片段
                if (String(s).indexOf("P0_FONT_TEST") >= 0) {
                  const small = s.slice(0, 4000);
                  out.serialize.push({ len: s.length, head: small });
                }
                return r;
              } catch (e) {
                try { out.parseFails.push({ err: String(e && e.message || e).slice(0, 80), s: String(s).slice(0, 1500) }); } catch (e2) {}
                throw e;
              }
            }
          }
          return origParse.call(JSON, s, rev);
        };
        JSON.parse.__zyP0 = true;
      }
      // 顶部导出/保存/印刷/核稿按钮候选
      try {
        const cand = [];
        document.querySelectorAll("a, button, .rightBtn li, .rightBtn div, .rightBtn span").forEach((el) => {
          const tx = String(el.textContent || "").trim();
          if (tx && tx.length <= 6 && /保存|印刷|打印|核稿|印前|导出|提交|预览/.test(tx) && cand.length < 20) cand.push({ tag: el.tagName, cls: String(el.className).slice(0, 40), txt: tx });
        });
        out.topButtons = cand;
      } catch (e) {}
      return { ok: true, layerMsg: out.layerMsg.length, topButtons: out.topButtons };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // 创建单 textbox P0_FONT_TEST（font.id=556 思源黑 Regular），补齐 Q() 裸拼接 9 字段
    report.phases.probe = await page.evaluate((text) => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      for (let i = 0; i < vo.totalCanvasArray.length; i++) {
        const d = vo.totalCanvasArray[i];
        if (!(d && typeof d.drawText === "function" && d.canvas && d.canvas.getObjects && d.canvasObjInfo)) continue;
        const baseLayer = d.canvasObjInfo.canvasToProductObjArr.length;
        const uid = "p0fonttest-" + Date.now() % 1000000;
        const entry = { media: { mediaType: "text", text: text, font: { pointSize: 24, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "556", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.3, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: 100, y: 100, width: 220, height: 40, factWidth: 220, factHeight: 40, rotation: 0 }, printLocation: { x: 100, y: 100, width: 220, height: 40, rotation: 0 }, layer: { alpha: 1 }, layerNum: baseLayer, isEdit: 1, isDisplay: 1, deleteState: 0, visitLevel: 1, multiUuid: uid, markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0, lowPixelFlag: 0, selectEnabled: 1, isDesign: 1, isComposite: 0, isPreview: 0, isDesignShape: 0 };
        d.drawText(text, null, null, null, entry, baseLayer);
        const o = d.canvas.getObjects().filter((ob) => String(ob.text || "") === text)[0];
        const snap = o ? {
          uuid: o.uuid, multiUuid: o.multiUuid, topEnable: o.topEnable, resourceType: o.resourceType, maskEnable: o.maskEnable, lowPixelFlag: o.lowPixelFlag, selectEnabled: o.selectEnabled, isDesign: o.isDesign, mediaMediaType: o.mediaMediaType, mediafontId: o.mediafontId, fontFamily: o.fontFamily, fontSize: o.fontSize, fontWeight: o.fontWeight, fontStyle: o.fontStyle, fill: o.fill, charSpacing: o.charSpacing, lineHeight: o.lineHeight, textAlign: o.textAlign, left: o.left, top: o.top, width: o.width, height: o.height, angle: o.angle, media: o.media } : null;
        d.canvas.requestRenderAll && d.canvas.requestRenderAll();
        return { uid: uid, text: text, total: d.canvas.getObjects().length, obj: snap };
      }
      return { err: "no live CanvasDiy" };
    }, PROBE_TEXT).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    await page.waitForTimeout(3000);
    report.phases.postCreate = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
      if (!d) return { err: "no canvas" };
      const o = d.canvas.getObjects().filter((ob) => String(ob.text || "") === "P0_FONT_TEST")[0];
      return { exists: !!o, canvasCount: d.canvas.getObjects().length, listCount: d.canvasObjInfo.canvasToProductObjArr.length };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // 点击保存（只触发弹层，不点确认）
    report.phases.saveClick = await page.evaluate(() => {
      const btn = document.querySelector(".rightBtn .save") || document.querySelector("a.save") || null;
      if (!btn) return { clicked: false };
      try { btn.click(); return { clicked: true }; } catch (e) { return { err: String(e) }; }
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    await page.waitForTimeout(4000);
    report.phases.afterSaveClick = await page.evaluate(() => {
      const layers = document.querySelectorAll(".layui-layer");
      const txts = [];
      for (let i = 0; i < layers.length; i++) { const t = String(layers[i].textContent || "").trim().slice(0, 200); if (t && txts.length < 20) txts.push(t); }
      // 输入框列表
      const inputs = [];
      document.querySelectorAll(".layui-layer input[type=text], .layui-layer input:not([type]), .layui-layer textarea").forEach((el) => { inputs.push({ label: el.previousElementSibling ? String(el.previousElementSibling.textContent || "").slice(0, 20) : "", id: String(el.id || el.className || "").slice(0, 24) }); });
      return { layerTexts: txts, inputs: inputs.slice(0, 12) };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // 填表 + 点确定 -> 之后静默观察 25s（捕获请求/弹窗），确认类弹层只记录不点
    report.phases.fill = await page.evaluate((o) => {
      const layers = document.querySelectorAll(".layui-layer");
      let host = null;
      for (let i = 0; i < layers.length; i++) { if (layers[i].offsetParent || layers[i].style.display !== "none") { host = layers[i]; break; } }
      const scope = host || document;
      const inputs = scope.querySelectorAll("input[type=text], input:not([type]), textarea");
      const setByLabel = (keys, val) => {
        for (let i = 0; i < inputs.length; i++) {
          const el = inputs[i]; if (el.__p0) continue;
          const label = el.previousElementSibling ? String(el.previousElementSibling.textContent || "") : "";
          const joined = label + String(el.placeholder || "") + String(el.title || "");
          for (let k = 0; k < keys.length; k++) { if (joined.indexOf(keys[k]) >= 0) { el.value = val; try { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {} el.__p0 = 1; break; } }
        }
      };
      setByLabel(["作品", "作品名", "workName", "名称"], "P0字体印刷探针");
      setByLabel(["用户", "用户名", "userName", "姓名"], "P0测试");
      setByLabel(["备注"], "p0 print probe");
      let orderFilled = 0;
      document.querySelectorAll("input").forEach((el) => { const c = String(el.className || ""); const id = String(el.id || ""); if (/search|order/i.test(c + id)) { el.value = o.order; try { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {} orderFilled++; } });
      return { orderFilled: orderFilled };
    }, { order: REAL_ORDER }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    await page.waitForTimeout(2500);
    report.phases.confirmClicked = await page.evaluate(() => {
      const logs = [];
      const layui = window.layer;
      // 点击「确定」按钮（若存在且非印刷确认类）
      const btns = document.querySelectorAll(".layui-layer button, .layui-layer a, .layui-layer-btn0");
      let clicked = null;
      for (let i = 0; i < btns.length; i++) {
        const tx = String(btns[i].textContent || "").trim();
        if (/确定|保存/.test(tx) && !/取消|删除|印刷|提交|生产/.test(tx)) {
          // 检查所在层是否包含印刷/提交确认语
          const layerHost = btns[i].closest(".layui-layer") || document;
          const ht = String(layerHost.textContent || "");
          const dangerous = /确定进行印刷|提交生产|提交制作|确认提交|确定印刷|下单|产生订单/i.test(ht);
          if (dangerous) { logs.push({ skip: true, layerText: ht.slice(0, 200) }); continue; }
          try { btns[i].click(); clicked = tx.slice(0, 16); } catch (e) {}
          break;
        }
      }
      return { clicked: clicked, skipped: logs };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // 静默观察 30s：抓自动核稿/印刷相关请求与弹窗
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) { await page.waitForTimeout(1500); }
    report.phases.observe = await page.evaluate(() => {
      const z = window.__p0Parse || {};
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
      const o = d && d.canvas && d.canvas.getObjects().filter((ob) => String(ob.text || "") === "P0_FONT_TEST")[0];
      return { objExists: !!o, canvasCount: d && d.canvas ? d.canvas.getObjects().length : -1, listCount: d && d.canvasObjInfo ? d.canvasObjInfo.canvasToProductObjArr.length : -1, layerMsg: (z.layerMsg || []).slice(0, 40), serialize: (z.serialize || []).slice(0, 2), parseFails: (z.parseFails || []).slice(0, 10) };
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
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});