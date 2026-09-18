// runtime/p0-relogin-probe.v7.js — 去检查页：点搜索同步核稿 + 抓红框对象 + 处理生成中
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "p0-relogin-v7.json");

(async () => {
  const report = { ts: new Date().toISOString(), stage: "P0-RELOGIN-V7", url: EDITOR_URL, phases: {}, resp: [], pages: [], events: [], errors: [] };
  let browser = null, page = null;
  const pushResp = (u, status, b) => { try { if (u.indexOf("zheliyin.com") < 0) return; if (report.resp.length < 150) report.resp.push({ status, u: u.slice(0, 200), body: String(b).slice(0, 2500) }); } catch (e) {} };
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    browser.on("page", (p) => {
      try {
        report.pages.push({ url: p.url().slice(0, 260), ts: new Date().toISOString().slice(11, 19), count: browser.pages().length });
        p.on("response", async (r) => { try { if (r.url().indexOf("zheliyin.com") < 0) return; const ct = r.headers()["content-type"] || ""; if (ct.indexOf("json") < 0) return; let b = ""; try { b = await r.text().catch(() => ""); } catch (e) {} pushResp(r.url(), r.status(), b); } catch (e) {} });
      } catch (e) {}
    });
    page = browser.pages()[0];
    page.on("response", async (r) => { try { if (r.url().indexOf("zheliyin.com") < 0) return; const ct = r.headers()["content-type"] || ""; if (ct.indexOf("json") < 0) return; let b = ""; try { b = await r.text().catch(() => ""); } catch (e) {} pushResp(r.url(), r.status(), b); } catch (e) {} });

    const readyEval = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[0]);
      return { ok: !!(d && d.canvas && typeof d.drawText === "function") };
    }).catch(() => ({ ok: false }));
    const waitReady = async (ms) => { const dd = Date.now() + ms; while (Date.now() < dd) { const r = await readyEval(); if (r && r.ok) return true; await page.waitForTimeout(2000); } return false; };
    const ev = (fn) => page.evaluate(fn).catch((e) => ({ err: String(e || "").slice(0, 240) }));
    const clickHegao = () => ev(() => {
      let best = null;
      const cands = document.querySelectorAll(".hegao-preview, li[class*=hegao], [class*=hegao]");
      for (let i = 0; i < cands.length; i++) { if (cands[i].offsetParent && /核稿/.test(String(cands[i].textContent || ""))) { best = cands[i]; break; } }
      if (!best) { const all = document.querySelectorAll("li,a,button,span,div"); for (let i = 0; i < all.length; i++) { if (String(all[i].textContent || "").trim() === "核稿" && all[i].offsetParent) { best = all[i]; break; } } }
      if (best) { try { best.click(); return { clicked: true }; } catch (e) {} }
      return { clicked: false };
    });
    const closeLayers = () => ev(() => {
      let closed = 0;
      document.querySelectorAll(".close-btn, a.close, .layui-layer-close, .layui-layer-close2, [class*=close]").forEach((el) => { if (closed > 8 || !el.offsetParent) return; if (/close/.test(String(el.className || ""))) { try { el.click(); closed++; } catch (e) {} } });
      return { closed };
    });
    const clickPrint = () => ev(() => {
      const cands = document.querySelectorAll(".btn.print, li.print, [class*=' print'], .rightBtn li, .rightBtn a");
      let best = null;
      for (let i = 0; i < cands.length; i++) { const el = cands[i]; const tx = String(el.textContent || "").trim(); const cls = String(el.className || ""); if (/印刷/.test(tx) && /print/i.test(cls)) { best = el; break; } if (/印刷/.test(tx) && !best) best = el; }
      if (!best) { const all = document.querySelectorAll("li,a,button,span,div"); for (let i = 0; i < all.length; i++) { if (String(all[i].textContent || "").trim() === "印刷" && all[i].offsetParent) { best = all[i]; break; } } }
      if (best) { try { best.click(); return { clicked: true }; } catch (e) {} }
      return { clicked: false };
    });
    const fillForm = () => ev(() => {
      const layers = document.querySelectorAll(".layui-layer, .modal");
      let host = null;
      for (let i = 0; i < layers.length; i++) { const el = layers[i]; if (el.offsetParent && String(el.innerText || "").indexOf("作品名") >= 0) { host = el; break; } }
      const scope = host || document;
      const inputs = scope.querySelectorAll("input[type=text], input:not([type]), textarea");
      const setByLabel = (keys, val) => {
        for (let i = 0; i < inputs.length; i++) { const el = inputs[i]; if (el.__p0) continue; const joined = (el.previousElementSibling ? String(el.previousElementSibling.textContent || "") : "") + String(el.placeholder || "") + String(el.title || ""); for (let k = 0; k < keys.length; k++) { if (joined.indexOf(keys[k]) >= 0) { el.value = val; try { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {} el.__p0 = 1; break; } } }
      };
      setByLabel(["作品", "作品名", "workName", "名称"], "1");
      setByLabel(["用户", "用户名", "userName", "姓名"], "2");
      setByLabel(["备注"], "p0 v7");
      return { ok: true };
    });
    const clickConfirm = () => ev(() => {
      const btns = document.querySelectorAll(".layui-layer button, .layui-layer a, .layui-layer-btn0");
      for (let i = 0; i < btns.length; i++) { const tx = String(btns[i].textContent || "").trim(); if (/^确定$|^保存$/.test(tx) && !/印刷|提交|生产|下单/.test(tx)) { const host = btns[i].closest(".layui-layer, .modal") || document; if (/确定进行印刷|提交生产|提交制作|确认提交|确定印刷|下单/i.test(String(host.textContent || ""))) continue; try { btns[i].click(); return { clicked: true }; } catch (e) {} break; } }
      return { clicked: false };
    });

    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    report.phases.ready = await waitReady(120000);
    const lg = await ev(() => { const ua = document.querySelector("#userAccount"); return !!(ua && ua.offsetParent); });
    if (lg) {
      await ev((arg) => {
        const u = document.querySelector("#userAccount"); const p = document.querySelector("#userPassword");
        if (!u || !p) return { ok: false };
        u.value = arg.u; p.value = arg.p;
        try { u.dispatchEvent(new Event("input", { bubbles: true })); u.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
        try { p.dispatchEvent(new Event("input", { bubbles: true })); p.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
        const btn = document.querySelector(".btn-register") || Array.from(document.querySelectorAll("a, button")).find((el) => { const t = String(el.textContent || "").trim(); return /登录|确定/.test(t) && el.offsetParent && el.closest(".login-tab, .register-area"); });
        if (!btn) return { ok: false };
        btn.click(); return { ok: true };
      }, { u: "17606256193", p: "tengyun666" });
      await page.waitForTimeout(10000);
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      report.phases.ready = await waitReady(90000);
    }
    if (!report.phases.ready) throw new Error("not ready");

    await ev(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      for (let i = 0; i < vo.totalCanvasArray.length; i++) {
        const d = vo.totalCanvasArray[i];
        if (!(d && typeof d.drawText === "function" && d.canvas && d.canvasObjInfo)) continue;
        const base = d.canvasObjInfo.canvasToProductObjArr.length;
        const entry = { media: { mediaType: "text", text: "P0_V7", font: { pointSize: 24, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "556", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.3, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: 100, y: 100, width: 220, height: 40, factWidth: 220, factHeight: 40, rotation: 0 }, printLocation: { x: 100, y: 100, width: 220, height: 40, rotation: 0 }, layer: { alpha: 1 }, layerNum: base, isEdit: 1, isDisplay: 1, deleteState: 0, visitLevel: 1, multiUuid: "p0v7" + Date.now() % 10000, markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0, lowPixelFlag: 0, selectEnabled: 1, isDesign: 1, isComposite: 0, isPreview: 0, isDesignShape: 0 };
        d.drawText("P0_V7", null, null, null, entry, base);
        d.canvas.requestRenderAll && d.canvas.requestRenderAll();
      }
    });
    await page.waitForTimeout(1500);
    await clickHegao();
    await page.waitForTimeout(6000);
    await closeLayers();
    await page.waitForTimeout(1500);
    await clickPrint();
    await page.waitForTimeout(4000);
    const hasForm = await ev(() => { const layers = document.querySelectorAll(".layui-layer, .modal"); for (let i = 0; i < layers.length; i++) { if (layers[i].offsetParent && String(layers[i].innerText || "").indexOf("作品名") >= 0) return true; } return false; });
    if (hasForm) { await fillForm(); await page.waitForTimeout(1200); await clickConfirm(); }

    // 等「自动核稿失败提醒」出现 → 记录 → 点「去检查」
    let gocheck = null;
    const tW = Date.now() + 60000;
    while (Date.now() < tW) {
      const r = await ev(() => {
        const out = [];
        document.querySelectorAll(".layui-layer, .modal").forEach((el) => { if (!el.offsetParent) return; const t = String(el.innerText || "").trim(); if (/自动核稿失败|生产文件与设计稿|去检查/.test(t)) out.push({ cls: String(el.className).slice(0, 60), txt: t.slice(0, 400) }); });
        return out;
      });
      if (r && r.some((l) => /自动核稿失败/.test(l.txt))) {
        report.phases.failDialog = r;
        // 点「去检查」
        gocheck = await ev(() => {
          let btn = null;
          const all = document.querySelectorAll("button, a, span, div");
          for (let i = 0; i < all.length; i++) { const el = all[i]; if (String(el.textContent || "").trim() === "去检查" && el.offsetParent) { btn = el; break; } }
          if (btn) { try { btn.click(); return { clicked: true }; } catch (e) {} }
          return { clicked: false };
        });
        report.phases.gocheck = gocheck;
        break;
      }
      await page.waitForTimeout(1500);
    }

    // 进入检查页后：等待新页面/新内容 → dump 红框对象 + 搜索按钮 → 点搜索×3 + 处理生成中
    await page.waitForTimeout(6000);
    report.phases.pages = report.pages;
    const pagesForOp = browser.pages();
    let activePage = pagesForOp[pagesForOp.length - 1] || page;
    report.phases.activeUrl = activePage.url().slice(0, 260);
    const dumpCheck = await evOn(activePage, () => {
      const out = { title: document.title, url: location.href, body: String((document.body && document.body.innerText) || "").slice(0, 3000), inputs: [], btns: [], reds: [] };
      document.querySelectorAll("input").forEach((el) => { if (el.offsetParent) out.inputs.push({ id: el.id, cls: String(el.className).slice(0, 40), ph: el.placeholder }); });
      document.querySelectorAll("a, button, input[type=button], input[type=submit], span, i, em").forEach((el) => {
        if (!el.offsetParent || out.btns.length > 60) return;
        const tx = String(el.textContent || el.value || "").trim().slice(0, 16);
        const cls = String(el.className || "").slice(0, 50);
        if (tx || cls) out.btns.push({ tag: el.tagName, tx, cls });
      });
      document.querySelectorAll("[class*=red], [class*=warn], [class*=error], [style*='border']").forEach((el) => { if (el.offsetParent && out.reds.length < 30) out.reds.push({ cls: String(el.className).slice(0, 60), t: String(el.innerText || "").trim().slice(0, 120) }); });
      return out;
    });
    report.phases.checkPageDump = dumpCheck;
    // 在检查页连点搜索
    const searchHits = [];
    for (let rk = 0; rk < 4; rk++) {
      const sc = await evOn(activePage, () => {
        const all = document.querySelectorAll("a, button, input[type=button], input[type=submit], span, i, em");
        let best = null;
        for (let j = 0; j < all.length; j++) {
          const el = all[j];
          if (!el.offsetParent) continue;
          const cls = String(el.className || "");
          const tx = String(el.textContent || el.value || "").trim();
          if (/search|search-btn/.test(cls) || tx === "搜索" || /icon-search|fa-search/i.test(cls)) { best = el; break; }
        }
        if (!best) { const inp = Array.from(document.querySelectorAll("input")).find((el) => /order|search/i.test(String(el.className) + String(el.id)) && el.offsetParent); if (inp) { const wrap = inp.parentElement || inp.parentElement.parentElement; if (wrap) { const cs = wrap.querySelectorAll("a, button, span, i"); for (let k = 0; k < cs.length; k++) { if (cs[k].offsetParent) { best = cs[k]; break; } } } } }
        if (!best) return { clicked: false };
        try { best.click(); return { clicked: true, cls: String(best.className || "").slice(0, 50), tx: String(best.textContent || "").trim().slice(0, 10) }; } catch (e) { return { clicked: false, err: String(e) }; }
      });
      searchHits.push({ r: rk, ...sc });
      await activePage.waitForTimeout(2500);
      const gen = await evOn(activePage, () => {
        const mods = document.querySelectorAll(".modal, .layui-layer");
        for (let i = 0; i < mods.length; i++) { const el = mods[i]; if (el.offsetParent && /印刷稿件生成中|请耐心等待|生成中|正在生成/.test(String(el.innerText || ""))) { const bs = el.querySelectorAll("button, a"); for (let b = 0; b < bs.length; b++) { const t = String(bs[b].textContent || "").trim(); if (/确认|确定|关闭|知道了/.test(t)) { try { bs[b].click(); return { handled: true, pressed: t.slice(0, 10) }; } catch (e) {} } } return { handled: false, near: el.innerText.slice(0, 100) }; } }
        return { handled: false };
      });
      if (gen.handled) { report.events.push({ r: rk, gen }); await activePage.waitForTimeout(2000); }
    }
    report.phases.searchHits = searchHits;
    // 最终检查页快照
    await activePage.waitForTimeout(4000);
    report.phases.finalCheck = await evOn(activePage, () => {
      const out = { url: location.href, body: String((document.body && document.body.innerText) || "").slice(0, 3500), reds: [], layers: [] };
      document.querySelectorAll("[class*=red], [class*=warn], [class*=error]").forEach((el) => { if (el.offsetParent && out.reds.length < 30) out.reds.push({ cls: String(el.className).slice(0, 60), t: String(el.innerText || "").trim().slice(0, 150) }); });
      document.querySelectorAll(".layui-layer, .modal").forEach((el) => { if (el.offsetParent) { const t = String(el.innerText || "").trim(); if (t) out.layers.push(t.slice(0, 300)); } });
      return out;
    });
    report.phases.saveResp = (report.resp || []).filter((x) => /save|submit|hegao|check/i.test(x.u)).map((x) => ({ u: x.u.slice(0, 130), b: String(x.body).slice(0, 300) }));
  } catch (e) {
    report.errors.push(String(e && e.message || e).slice(0, 400));
  } finally {
    try { page && await page.close(); } catch (e) {}
    try { browser && await browser.close(); } catch (e) {}
  }
  const dir = path.dirname(REPORT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log("written: " + REPORT_PATH + " errors=" + report.errors.length + " resp=" + report.resp.length);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });

function evOn(pg, fn) { return pg.evaluate(fn).catch((e) => ({ err: String(e || "").slice(0, 240) })); }