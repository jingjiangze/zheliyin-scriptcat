// runtime/p0-goto-check-probe.js — 点击「去检查」抓核稿红框页面与对象清单
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "p0-goto-check.json");
const PROBE_TEXT = "P0_FONT_TEST";

(async () => {
  const report = { ts: new Date().toISOString(), stage: "P0-GOTO-CHECK", url: EDITOR_URL, phases: {}, reqs: [], resp: [], dialogs: [], scripts: [], errors: [] };
  let browser = null, page = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    browser.on("dialog", (d) => { report.dialogs.push(String(d.message() || "").slice(0, 200)); d.accept().catch(() => {}); });
    browser.on("page", (p) => { try { report.phases.newWindow = report.phases.newWindow || []; report.phases.newWindow.push({ url: p.url().slice(0, 300) }); } catch (e) {} });
    page = browser.pages()[0];
    page.on("request", (r) => {
      const u = r.url();
      if (u.indexOf("zheliyin.com") < 0 || report.reqs.length > 700) return;
      const rec = { m: r.method(), u: u.slice(0, 240) };
      if (/hegao|check|proof|proofread|print|submit|save|auto|proof|核稿|design/i.test(u)) {
        try { const pd = r.postData(); if (pd) rec.body = String(pd).slice(0, 2500); } catch (e) {}
      }
      if (/\.js(\?|$)/i.test(u)) { report.scripts.push(u.slice(0, 220)); if (report.scripts.length > 200) report.scripts.shift(); }
      report.reqs.push(rec);
    });
    page.on("response", async (r) => {
      const u = r.url();
      if (u.indexOf("zheliyin.com") < 0) return;
      if (!/hegao|check|proof|proofread|print|submit|save|auto|核稿|design|unified|validation/i.test(u)) return;
      try {
        const ct = r.headers()["content-type"] || "";
        if (ct.indexOf("json") < 0 && ct.indexOf("text") < 0) return;
        let b = ""; try { b = await r.text(); } catch (e) {}
        report.resp.push({ status: r.status(), u: u.slice(0, 240), body: String(b).slice(0, 4000) });
      } catch (e) {}
    });

    const readyEval = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = (vo && Array.isArray(vo.totalCanvasArray) && vo.totalCanvasArray[0]) || null;
      return { ok: !!(d && d.canvas && typeof d.drawText === "function") };
    }).catch(() => ({ ok: false }));
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    let ok = false;
    const d1 = Date.now() + 150000;
    while (Date.now() < d1) { ok = await readyEval(); if (ok && ok.ok) break; await page.waitForTimeout(2000); }
    report.phases.ready = !!(ok && ok.ok);
    if (!ok) throw new Error("editor not ready");

    // 创建单 textbox P0_FONT_TEST（drawText, id=556）
    report.phases.create = await page.evaluate((arg) => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      for (let i = 0; i < vo.totalCanvasArray.length; i++) {
        const d = vo.totalCanvasArray[i];
        if (!(d && typeof d.drawText === "function" && d.canvas && d.canvasObjInfo)) continue;
        const base = d.canvasObjInfo.canvasToProductObjArr.length;
        const uid = "p0fc-" + Date.now() % 1000000;
        const entry = { media: { mediaType: "text", text: arg.t, font: { pointSize: arg.fs, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: arg.fid, isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.3, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: arg.x, y: arg.y, width: 220, height: 40, factWidth: 220, factHeight: 40, rotation: 0 }, printLocation: { x: arg.x, y: arg.y, width: 220, height: 40, rotation: 0 }, layer: { alpha: 1 }, layerNum: base, isEdit: 1, isDisplay: 1, deleteState: 0, visitLevel: 1, multiUuid: uid, markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0, lowPixelFlag: 0, selectEnabled: 1, isDesign: 1, isComposite: 0, isPreview: 0, isDesignShape: 0 };
        d.drawText(arg.t, null, null, null, entry, base);
        const o = d.canvas.getObjects().filter((ob) => String(ob.text || "") === arg.t)[0];
        if (o) { o.topEnable = 1; o.resourceType = 0; o.maskEnable = 0; o.lowPixelFlag = 0; o.selectEnabled = 1; o.isDesign = 1; o.isComposite = 0; o.isPreview = 0; o.isDesignShape = 0; }
        d.canvas.requestRenderAll && d.canvas.requestRenderAll();
        return { ok: true, total: d.canvas.getObjects().length, fontId: o && o.mediafontId };
      }
      return { err: "no live CanvasDiy" };
    }, { t: PROBE_TEXT, fs: 24, fid: "556", x: 100, y: 100 }).catch((e) => ({ err: String(e || "").slice(0, 300) }));

    // 点「印刷」
    await page.evaluate(() => {
      const cands = document.querySelectorAll(".btn.print, li.print, [class*=' print'], .rightBtn li, .rightBtn a");
      let best = null;
      for (let i = 0; i < cands.length; i++) { const el = cands[i]; const tx = String(el.textContent || "").trim(); const cls = String(el.className || ""); if (/印刷/.test(tx) && /print/i.test(cls)) { best = el; break; } if (/印刷/.test(tx) && !best) best = el; }
      if (!best) { const all = document.querySelectorAll("li,a,button,span,div"); for (let i = 0; i < all.length; i++) { const el = all[i]; if (String(el.textContent || "").trim() === "印刷" && el.offsetParent) { best = el; break; } } }
      if (best) { try { best.click(); } catch (e) {} }
    }).catch(() => {});
    await page.waitForTimeout(4000);
    // 填保存弹层 1/2
    await page.evaluate(() => {
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
      setByLabel(["备注"], "p0 check");
    }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const btns = document.querySelectorAll(".layui-layer button, .layui-layer a, .layui-layer-btn0");
      for (let i = 0; i < btns.length; i++) {
        const tx = String(btns[i].textContent || "").trim();
        if (/确定|保存/.test(tx) && !/取消|删除|印刷|提交|生产/.test(tx)) {
          const host = btns[i].closest(".layui-layer") || document;
          if (/确定进行印刷|提交生产|提交制作|确认提交|确定印刷|下单/i.test(String(host.textContent || ""))) continue;
          try { btns[i].click(); return; } catch (e) {}
          break;
        }
      }
    }).catch(() => {});

    // 轮询找「自动核稿失败提醒」弹层（最多 60s）
    let found = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      const res = await page.evaluate(() => {
        const layers = [];
        document.querySelectorAll(".layui-layer, [class*=hegao], [class*=check_wrap], [class*=proof]").forEach((el) => {
          const rc = el.getBoundingClientRect();
          if (rc.width === 0 && rc.height === 0) return;
          const t = String(el.innerText || el.textContent || "").trim();
          if (t && /自动核稿|核稿|生产文件与设计稿|标记正常|去检查/.test(t)) layers.push({ cls: String(el.className).slice(0, 60), txt: t.slice(0, 800) });
        });
        return layers;
      }).catch(() => []);
      if (res && res.length) { found = res; break; }
      await page.waitForTimeout(1500);
    }
    report.phases.proofDialog = found;

    // 点「去检查」
    const navBefore = page.url();
    await page.evaluate(() => {
      let btn = null;
      const all = document.querySelectorAll("button, a, span, div");
      for (let i = 0; i < all.length; i++) { const el = all[i]; if (String(el.textContent || "").trim() === "去检查" && el.offsetParent) { btn = el; break; } }
      if (btn) { try { btn.click(); } catch (e) {} }
    }).catch(() => {});
    report.phases.gotoClicked = true;
    // 等待跳转/新页面 20s
    await page.waitForTimeout(8000);
    report.phases.urlAfter = page.url().slice(0, 300);
    // 新页面 DOM dump（红框/问题对象区域）
    const domDump = await page.evaluate(() => {
      const out = { title: document.title, url: location.href, texts: [], redFrames: 0, reds: [] };
      document.querySelectorAll("[class*=red], [class*=warn], [class*=error], [class*=check], [style*='border'], canvas").forEach((el) => {
        if (out.texts.length > 40) return;
        const rc = el.getBoundingClientRect();
        if (rc.width === 0 && rc.height === 0) return;
        const cls = String(el.className || "").slice(0, 60);
        const t = String(el.innerText || el.textContent || "").trim().slice(0, 300);
        if (/red/i.test(cls)) out.reds.push({ cls, t: t.slice(0, 200) });
        if (t) out.texts.push({ tag: el.tagName, cls, t });
      });
      const bodyTxt = String((document.body && document.body.innerText) || "").slice(0, 3000);
      out.bodyText = bodyTxt;
      return out;
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    report.phases.checkPage = domDump;
    report.phases.navChanged = navBefore !== page.url();
  } catch (e) {
    report.errors.push(String(e && e.message || e).slice(0, 400));
  } finally {
    try { page && await page.close(); } catch (e) {}
    try { browser && await browser.close(); } catch (e) {}
  }
  const dir = path.dirname(REPORT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log("written: " + REPORT_PATH + " reqs=" + report.reqs.length + " resp=" + report.resp.length + " scripts=" + report.scripts.length);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });