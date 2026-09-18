// runtime/p0-serial-diff-probe.js — 抓提交 payload（JSON.stringify 级）中 A/B 对象实际差
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "p0-serial-diff.json");

(async () => {
  const report = { ts: new Date().toISOString(), stage: "P0-SERIAL-DIFF", url: EDITOR_URL, phases: {}, payloads: [], dialogs: [], errors: [] };
  let browser = null, page = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    browser.on("dialog", (d) => { report.dialogs.push(String(d.message() || "").slice(0, 200)); d.accept().catch(() => {}); });
    page = browser.pages()[0];
    page.on("response", async (r) => {
      const u = r.url();
      if (u.indexOf("zheliyin.com") < 0) return;
      if (!/hegao|check|proof|print|submit|save|auto/i.test(u)) return;
      try {
        const ct = r.headers()["content-type"] || "";
        if (ct.indexOf("json") < 0 && ct.indexOf("text") < 0) return;
        let b = ""; try { b = await r.text(); } catch (e) {}
        report.resp = report.resp || [];
        report.resp.push({ status: r.status(), u: u.slice(0, 200), body: String(b).slice(0, 4000) });
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

    // hook JSON.stringify：捕获含 A/B 文本的产品 payload（保存/核稿提交)
    await page.evaluate(() => {
      if (window.__zyStrf) return { already: true };
      window.__zyStrf = { hits: [] };
      const os = JSON.stringify;
      JSON.stringify = function (v) {
        const r = os.apply(this, arguments);
        try {
          if (typeof r === "string" && r.indexOf('"printLocation"') >= 0 && r.indexOf('"mediaType":"text"') >= 0 && r.indexOf("A_MANUAL_TEXT") >= 0 && window.__zyStrf.hits.length < 2) {
            window.__zyStrf.hits.push({ len: r.length, s: r.slice(0, 60000) });
          }
        } catch (e) {}
        return r;
      };
      JSON.stringify.__zyStrf = true;
      return { ok: true };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // 创建 A(addText) 与 B(drawText id=556)
    report.phases.create = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      for (let i = 0; i < vo.totalCanvasArray.length; i++) {
        const d = vo.totalCanvasArray[i];
        if (!(d && typeof d.drawText === "function" && typeof d.addText === "function" && d.canvas && d.canvasObjInfo)) continue;
        const base = d.canvasObjInfo.canvasToProductObjArr.length;
        d.addText("A_MANUAL_TEXT");
        const a = d.canvas.getObjects().filter((o) => String(o.text || "") === "A_MANUAL_TEXT")[0];
        const uid = "p0sd-" + Date.now() % 1000000;
        const entry = { media: { mediaType: "text", text: "B_SCRIPT_TEXT", font: { pointSize: 24, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "556", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.3, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: 120, y: 120, width: 220, height: 40, factWidth: 220, factHeight: 40, rotation: 0 }, printLocation: { x: 120, y: 120, width: 220, height: 40, rotation: 0 }, layer: { alpha: 1 }, layerNum: base + 1, isEdit: 1, isDisplay: 1, deleteState: 0, visitLevel: 1, multiUuid: uid, markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0, lowPixelFlag: 0, selectEnabled: 1, isDesign: 1, isComposite: 0, isPreview: 0, isDesignShape: 0 };
        d.drawText("B_SCRIPT_TEXT", null, null, null, entry, base + 1);
        const b = d.canvas.getObjects().filter((o) => String(o.text || "") === "B_SCRIPT_TEXT")[0];
        if (b) { b.topEnable = 1; b.resourceType = 0; b.maskEnable = 0; b.lowPixelFlag = 0; b.selectEnabled = 1; b.isDesign = 1; b.isComposite = 0; b.isPreview = 0; b.isDesignShape = 0; }
        // 快照：对象存在性 + itemList 对应
        const items = (d.canvasObjInfo && d.canvasObjInfo.canvasToProductObjArr) || [];
        return { ok: true, total: d.canvas.getObjects().length, items: items.length, a: a ? { media: a.media, mediafontId: a.mediafontId, fontFamily: a.fontFamily } : null, b: b ? { media: b.media, mediafontId: b.mediafontId, fontFamily: b.fontFamily } : null };
      }
      return { err: "no live CanvasDiy" };
    }).catch((e) => ({ err: String(e || "").slice(0, 300) }));

    // 点印刷 → 填 1/2 → 确定
    await page.evaluate(() => {
      const cands = document.querySelectorAll(".btn.print, li.print, [class*=' print'], .rightBtn li, .rightBtn a");
      let best = null;
      for (let i = 0; i < cands.length; i++) { const el = cands[i]; const tx = String(el.textContent || "").trim(); const cls = String(el.className || ""); if (/印刷/.test(tx) && /print/i.test(cls)) { best = el; break; } if (/印刷/.test(tx) && !best) best = el; }
      if (!best) { const all = document.querySelectorAll("li,a,button,span,div"); for (let i = 0; i < all.length; i++) { const el = all[i]; if (String(el.textContent || "").trim() === "印刷" && el.offsetParent) { best = el; break; } } }
      if (best) { try { best.click(); } catch (e) {} }
    }).catch(() => {});
    await page.waitForTimeout(4000);
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
      setByLabel(["备注"], "p0 serial diff");
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

    // 收集 stringify 命中 + 弹层 40s
    await page.waitForTimeout(4000);
    report.phases.stringify = await page.evaluate(() => (window.__zyStrf || { hits: [] }).hits.map((h) => ({ len: h.len, s: h.s.slice(0, 30000) }))).catch(() => []);
    report.phases.proofDialog = await page.evaluate(() => {
      const layers = [];
      document.querySelectorAll(".layui-layer, [class*=hegao]").forEach((el) => {
        const rc = el.getBoundingClientRect();
        if (rc.width === 0 && rc.height === 0) return;
        const t = String(el.innerText || el.textContent || "").trim();
        if (t && /自动核稿|核稿|生产文件与设计稿|标记正常|去检查/.test(t)) layers.push(t.slice(0, 800));
      });
      return layers;
    }).catch(() => []);
    await page.waitForTimeout(36000);
    report.phases.proofDialog2 = await page.evaluate(() => {
      const layers = [];
      document.querySelectorAll(".layui-layer, [class*=hegao]").forEach((el) => {
        const rc = el.getBoundingClientRect();
        if (rc.width === 0 && rc.height === 0) return;
        const t = String(el.innerText || el.textContent || "").trim();
        if (t && /自动核稿|核稿|生产文件与设计稿|标记正常|去检查/.test(t)) layers.push(t.slice(0, 800));
      });
      return layers;
    }).catch(() => []);
  } catch (e) {
    report.errors.push(String(e && e.message || e).slice(0, 400));
  } finally {
    try { page && await page.close(); } catch (e) {}
    try { browser && await browser.close(); } catch (e) {}
  }
  const dir = path.dirname(REPORT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log("written: " + REPORT_PATH + " payloads=" + report.payloads.length + " errors=" + report.errors.length);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });