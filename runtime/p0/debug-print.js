// runtime/p0/debug-print.js — 诊断：点印刷后 40s 内可见层/按钮逐帧变化
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const OUT = path.join(__dirname, "..", "reports", "p0", "debug-print.json");

(async () => {
  const report = { frames: [], errors: [] };
  let browser = null, page = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "..", "browser", "profile-usc3"), {
      channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"], viewport: { width: 1440, height: 900 }
    });
    page = browser.pages()[0];
    const readyEval = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[0]);
      return { ok: !!(d && d.canvas && typeof d.drawText === "function") };
    }).catch(() => ({ ok: false }));
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    let ok = false;
    const d1 = Date.now() + 120000;
    while (Date.now() < d1) { ok = await readyEval(); if (ok && ok.ok) break; await page.waitForTimeout(2000); }
    report.ready = !!(ok && ok.ok);
    const ev = (fn) => page.evaluate(fn).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    // 登录兜底
    const lg = await ev(() => { const ua = document.querySelector("#userAccount"); return !!(ua && ua.offsetParent); });
    if (lg) {
      await ev((arg) => {
        const u = document.querySelector("#userAccount"); const p = document.querySelector("#userPassword");
        if (!u || !p) return { ok: false };
        u.value = arg.u; p.value = arg.p;
        try { u.dispatchEvent(new Event("input", { bubbles: true })); u.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
        try { p.dispatchEvent(new Event("input", { bubbles: true })); p.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
        const btn = document.querySelector(".btn-register") || Array.from(document.querySelectorAll("a, button")).find((el) => { const t = String(el.textContent || "").trim(); return /登录|确定/.test(t) && el.offsetParent && el.closest(".login-tab,.register-area"); });
        if (!btn) return { ok: false };
        btn.click(); return { ok: true };
      }, { u: "17606256193", p: "tengyun666" });
      await page.waitForTimeout(10000);
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      const d2 = Date.now() + 90000;
      while (Date.now() < d2) { ok = await readyEval(); if (ok && ok.ok) break; await page.waitForTimeout(2000); }
    }
    // 创建对象
    await ev(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      for (let i = 0; i < vo.totalCanvasArray.length; i++) {
        const d = vo.totalCanvasArray[i];
        if (!(d && typeof d.drawText === "function" && d.canvas && d.canvasObjInfo)) continue;
        const base = d.canvasObjInfo.canvasToProductObjArr.length;
        const entry = { media: { mediaType: "text", text: "DEBUG_PRINT", font: { pointSize: 24, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "556", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.3, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: 100, y: 100, width: 220, height: 40, factWidth: 220, factHeight: 40, rotation: 0 }, printLocation: { x: 100, y: 100, width: 220, height: 40, rotation: 0 }, layer: { alpha: 1 }, layerNum: base, isEdit: 1, isDisplay: 1, deleteState: 0, visitLevel: 1, multiUuid: "dbg" + Date.now() % 10000, markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0, lowPixelFlag: 0, selectEnabled: 1, isDesign: 1, isComposite: 0, isPreview: 0, isDesignShape: 0 };
        d.drawText("DEBUG_PRINT", null, null, null, entry, base);
        d.canvas.requestRenderAll && d.canvas.requestRenderAll();
      }
    });
    const frame = async (tag) => {
      const f = await ev(() => {
        const layers = [];
        document.querySelectorAll(".layui-layer, .modal, .modal-container, [class*=hegao], [class*=design]").forEach((el) => {
          if (!el.offsetParent) return;
          const rc = el.getBoundingClientRect(); if (rc.width < 3) return;
          const t = String(el.innerText || el.textContent || "").trim().slice(0, 200);
          if (t) layers.push({ cls: String(el.className).slice(0, 50), txt: t });
        });
        // 顶部按钮 enabled 状态
        const btns = [];
        document.querySelectorAll(".rightBtn li, .rightBtn a, #submitProduct, .hegao-preview").forEach((el) => {
          const t = String(el.textContent || "").trim();
          if (t && t.length <= 6) btns.push({ tag: el.tagName, txt: t, cls: String(el.className).slice(0, 40), vis: !!el.offsetParent });
        });
        // 全屏遮罩
        const masks = [];
        document.querySelectorAll("[class*=mask], [class*=shade]").forEach((el) => { if (el.offsetParent) masks.push(String(el.className).slice(0, 40)); });
        return { layers, btns, masks };
      });
      report.frames.push({ t: new Date().toISOString().slice(11, 19), tag, ...f });
    };
    // 点核稿
    await ev(() => { const all = document.querySelectorAll("li,a,button,span,div"); for (let i = 0; i < all.length; i++) { if (String(all[i].textContent || "").trim() === "核稿" && all[i].offsetParent) { try { all[i].click(); return; } catch (e) {} break; } } });
    await page.waitForTimeout(5000);
    await frame("after-hegao");
    // 关核稿窗
    await ev(() => { let c = 0; document.querySelectorAll(".close-btn, a.close, .layui-layer-close, .layui-layer-close2, [class*=close]").forEach((el) => { if (c < 6 && el.offsetParent && /close/.test(String(el.className || ""))) { try { el.click(); c++; } catch (e) {} } }); return { closed: c }; });
    await page.waitForTimeout(1500);
    await frame("after-close");
    // 点印刷
    const hit = await ev(() => {
      const cands = document.querySelectorAll(".btn.print, li.print, [class*=' print'], .rightBtn li, .rightBtn a");
      let best = null;
      for (let i = 0; i < cands.length; i++) { const el = cands[i]; const tx = String(el.textContent || "").trim(); const cls = String(el.className || ""); if (/印刷/.test(tx) && /print/i.test(cls)) { best = el; break; } if (/印刷/.test(tx) && !best) best = el; }
      if (!best) { const all = document.querySelectorAll("li,a,button,span,div"); for (let i = 0; i < all.length; i++) { if (String(all[i].textContent || "").trim() === "印刷" && all[i].offsetParent) { best = all[i]; break; } } }
      if (best) { const rc = best.getBoundingClientRect(); best.click(); return { clicked: true, tag: best.tagName, cls: String(best.className).slice(0, 50), tx: String(best.textContent || "").trim(), rect: { x: rc.x, y: rc.y, w: rc.width, h: rc.height } }; }
      return { clicked: false };
    });
    report.printHit = hit;
    for (let i = 1; i <= 10; i++) { await page.waitForTimeout(3500); await frame("print+" + (i * 3.5) + "s"); }
  } catch (e) {
    report.errors.push(String(e && e.message || e).slice(0, 400));
  } finally {
    try { page && await page.close(); } catch (e) {}
    try { browser && await browser.close(); } catch (e) {}
  }
  if (!fs.existsSync(path.dirname(OUT))) fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log("written: " + OUT + " frames=" + report.frames.length);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });