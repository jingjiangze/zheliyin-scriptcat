// runtime/p0-relogin-probe.v5.js — 印刷核稿页：连点「搜索」同步核稿 + 处理「印刷稿件生成中」弹层
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "p0-relogin-v5.json");
const USER = "17606256193";
const PASS = "tengyun666";

(async () => {
  const report = { ts: new Date().toISOString(), stage: "P0-RELOGIN-V5", url: EDITOR_URL, phases: {}, resp: [], dialogs: [], searchClicks: [], genDialogs: [], errors: [] };
  let browser = null, page = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    browser.on("dialog", (d) => { report.dialogs.push(String(d.message() || "").slice(0, 200)); d.accept().catch(() => {}); });
    browser.on("page", (p) => {
      try { report.phases.newPage = report.phases.newPage || []; report.phases.newPage.push({ url: p.url().slice(0, 260), ts: new Date().toISOString().slice(11, 19) }); p.on("request", (r) => { const u = r.url(); if (u.indexOf("zheliyin.com") >= 0 && /search|order|hegao|check|submit|save/i.test(u) && report.resp.length < 200) { try { const rec = { m: r.method(), u: u.slice(0, 200) }; const pd = r.postData(); if (pd) rec.body = String(pd).slice(0, 1500); report.resp.push(rec); } catch (e) {} } }); } catch (e) {}
    });
    page = browser.pages()[0];
    page.on("response", async (r) => {
      try { const u = r.url(); if (u.indexOf("zheliyin.com") < 0) return; const ct = r.headers()["content-type"] || ""; if (ct.indexOf("json") < 0 && ct.indexOf("text") < 0) return; let b = ""; try { b = await r.text().catch(() => ""); } catch (e) {} if (report.resp.length < 200) report.resp.push({ status: r.status(), u: u.slice(0, 200), body: String(b).slice(0, 2500) }); } catch (e) {}
    });

    const readyEval = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[0]);
      return { ok: !!(d && d.canvas && typeof d.drawText === "function") };
    }).catch(() => ({ ok: false }));
    const waitReady = async (ms) => { const dd = Date.now() + ms; while (Date.now() < dd) { const r = await readyEval(); if (r && r.ok) return true; await page.waitForTimeout(2000); } return false; };
    const evalPage = (fn) => page.evaluate(fn).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    const clickHegao = () => evalPage(() => {
      const cands = document.querySelectorAll(".hegao-preview, li[class*=hegao], [class*=hegao]");
      let best = null;
      for (let i = 0; i < cands.length; i++) { if (cands[i].offsetParent) { const t = String(cands[i].textContent || "").trim(); if (/核稿/.test(t)) { best = cands[i]; break; } } }
      if (!best) { const all = document.querySelectorAll("li,a,button,span,div"); for (let i = 0; i < all.length; i++) { if (String(all[i].textContent || "").trim() === "核稿" && all[i].offsetParent) { best = all[i]; break; } } }
      if (best) { try { best.click(); return { clicked: true }; } catch (e) {} }
      return { clicked: false };
    });
    const closeLayers = () => evalPage(() => {
      let closed = 0;
      document.querySelectorAll(".close-btn, a.close, .layui-layer-close, .layui-layer-close2, [class*=close]").forEach((el) => {
        if (closed > 8 || !el.offsetParent) return;
        if (/close/.test(String(el.className || ""))) { try { el.click(); closed++; } catch (e) {} }
      });
      return { closed };
    });
    const clickPrint = () => evalPage(() => {
      const cands = document.querySelectorAll(".btn.print, li.print, [class*=' print'], .rightBtn li, .rightBtn a");
      let best = null;
      for (let i = 0; i < cands.length; i++) { const el = cands[i]; const tx = String(el.textContent || "").trim(); const cls = String(el.className || ""); if (/印刷/.test(tx) && /print/i.test(cls)) { best = el; break; } if (/印刷/.test(tx) && !best) best = el; }
      if (!best) { const all = document.querySelectorAll("li,a,button,span,div"); for (let i = 0; i < all.length; i++) { if (String(all[i].textContent || "").trim() === "印刷" && all[i].offsetParent) { best = all[i]; break; } } }
      if (best) { try { best.click(); return { clicked: true }; } catch (e) {} }
      return { clicked: false };
    });
    const fillForm = () => evalPage(() => {
      const layers = document.querySelectorAll(".layui-layer, .modal");
      let host = null;
      for (let i = 0; i < layers.length; i++) { const el = layers[i]; if (el.offsetParent && String(el.innerText || "").indexOf("作品名") >= 0) { host = el; break; } }
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
      setByLabel(["备注"], "p0 relogin v5");
      return { ok: true };
    });
    const clickConfirm = () => evalPage(() => {
      const btns = document.querySelectorAll(".layui-layer button, .layui-layer a, .layui-layer-btn0, .modal button, .modal a");
      for (let i = 0; i < btns.length; i++) {
        const tx = String(btns[i].textContent || "").trim();
        if (/^确定$|^保存$/.test(tx) && !/印刷|提交|生产|下单/.test(tx)) {
          const host = btns[i].closest(".layui-layer, .modal") || document;
          if (/确定进行印刷|提交生产|提交制作|确认提交|确定印刷|下单/i.test(String(host.textContent || ""))) continue;
          try { btns[i].click(); return { clicked: true }; } catch (e) {}
          break;
        }
      }
      return { clicked: false };
    });
    // 印刷核稿页：连点「搜索」按钮（限弹层内）
    const clickSearch = (n) => evalPage((arg) => {
      const hits = [];
      for (let i = 0; i < arg.n; i++) {
        // 优先弹层内按钮
        const layers = document.querySelectorAll(".layui-layer, .modal");
        let btn = null;
        const scan = (root) => {
          const cands = root.querySelectorAll("a, button, input[type=button], input[type=submit], span");
          for (let j = 0; j < cands.length; j++) {
            const el = cands[j];
            if (!el.offsetParent) continue;
            const tx = String(el.textContent || el.value || "").trim();
            const cls = String(el.className || "");
            if (/^搜索$|查 询|查询|搜 索/.test(tx) || (/search/i.test(cls) && /button|btn|a/.test(el.tagName))) { btn = el; break; }
          }
          return btn;
        };
        for (let li = 0; li < layers.length && !btn; li++) { if (layers[li].offsetParent) btn = scan(layers[li]); }
        if (!btn) {
          // 兜底：输入框带 order/search 命名旁的按钮
          const inp = Array.from(document.querySelectorAll("input")).find((el) => /order|search/i.test(String(el.className) + String(el.id)));
          if (inp) {
            const wrap = inp.parentElement;
            if (wrap) btn = scan(wrap);
          }
        }
        if (!btn) { hits.push({ i, clicked: false }); continue; }
        try { btn.click(); hits.push({ i, clicked: true, cls: String(btn.className || "").slice(0, 40), tx: String(btn.textContent || btn.value || "").trim().slice(0, 10) }); } catch (e) { hits.push({ i, clicked: false, err: String(e) }); }
      }
      return { hits };
    }, { n });
    const readLayers = () => evalPage(() => {
      const layers = [];
      document.querySelectorAll(".layui-layer, .modal, [class*=hegao], [class*=check_wrap], [class*=proof]").forEach((el) => {
        const rc = el.getBoundingClientRect(); if (rc.width === 0 && rc.height === 0) return;
        const t = String(el.innerText || el.textContent || "").trim();
        if (t) layers.push({ cls: String(el.className).slice(0, 50), txt: t.slice(0, 400) });
      });
      return layers;
    });

    // 1) 打开 + 登录
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    report.phases.ready = await waitReady(150000);
    let loginVisible = await evalPage(() => { const ua = document.querySelector("#userAccount"); return !!(ua && ua.offsetParent); });
    if (!loginVisible) {
      await evalPage(() => {
        const req = window.requirejs || window.require;
        const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
        for (let i = 0; i < vo.totalCanvasArray.length; i++) {
          const d = vo.totalCanvasArray[i];
          if (!(d && typeof d.drawText === "function" && d.canvas && d.canvasObjInfo)) continue;
          const base = d.canvasObjInfo.canvasToProductObjArr.length;
          const entry = { media: { mediaType: "text", text: "P0_LG0", font: { pointSize: 24, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "556", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.3, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: 100, y: 100, width: 220, height: 40, factWidth: 220, factHeight: 40, rotation: 0 }, printLocation: { x: 100, y: 100, width: 220, height: 40, rotation: 0 }, layer: { alpha: 1 }, layerNum: base, isEdit: 1, isDisplay: 1, deleteState: 0, visitLevel: 1, multiUuid: "p0l0" + Date.now() % 10000, markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0, lowPixelFlag: 0, selectEnabled: 1, isDesign: 1, isComposite: 0, isPreview: 0, isDesignShape: 0 };
          d.drawText("P0_LG0", null, null, null, entry, base);
          d.canvas.requestRenderAll && d.canvas.requestRenderAll();
        }
      });
      await clickPrint(); await page.waitForTimeout(4000); await fillForm(); await page.waitForTimeout(1200); await clickConfirm();
    }
    const dLg = Date.now() + 20000;
    while (Date.now() < dLg) { loginVisible = await evalPage(() => { const ua = document.querySelector("#userAccount"); return !!(ua && ua.offsetParent); }); if (loginVisible) break; await page.waitForTimeout(1000); }
    report.phases.loginVisible = loginVisible;
    if (loginVisible) {
      report.phases.login = await evalPage((arg) => {
        const u = document.querySelector("#userAccount") || Array.from(document.querySelectorAll("input")).find((el) => /手机|账号|用户名|账户/.test(String(el.placeholder || "") + String(el.id || "")));
        const p = document.querySelector("#userPassword") || Array.from(document.querySelectorAll("input")).find((el) => String(el.type || "").toLowerCase() === "password");
        if (!u || !p) return { ok: false, reason: "no inputs" };
        u.value = arg.u; p.value = arg.p;
        try { u.dispatchEvent(new Event("input", { bubbles: true })); u.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
        try { p.dispatchEvent(new Event("input", { bubbles: true })); p.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
        let btn = document.querySelector(".btn-register") || Array.from(document.querySelectorAll("a, button")).find((el) => { const t = String(el.textContent || "").trim(); return (/登录|确定/.test(t)) && el.offsetParent && el.closest(".login-tab, .register-area"); });
        if (!btn) return { ok: false, reason: "no login btn" };
        btn.click(); return { ok: true };
      }, { u: USER, p: PASS });
      await page.waitForTimeout(12000);
    }
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    report.phases.ready2 = await waitReady(120000);

    // 2) 创建 → 核稿 → 关窗
    if (report.phases.ready2) {
      await evalPage(() => {
        const req = window.requirejs || window.require;
        const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
        for (let i = 0; i < vo.totalCanvasArray.length; i++) {
          const d = vo.totalCanvasArray[i];
          if (!(d && typeof d.drawText === "function" && d.canvas && d.canvasObjInfo)) continue;
          const base = d.canvasObjInfo.canvasToProductObjArr.length;
          const entry = { media: { mediaType: "text", text: "P0_V5", font: { pointSize: 24, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "556", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.3, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: 100, y: 100, width: 220, height: 40, factWidth: 220, factHeight: 40, rotation: 0 }, printLocation: { x: 100, y: 100, width: 220, height: 40, rotation: 0 }, layer: { alpha: 1 }, layerNum: base, isEdit: 1, isDisplay: 1, deleteState: 0, visitLevel: 1, multiUuid: "p0v5" + Date.now() % 10000, markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0, lowPixelFlag: 0, selectEnabled: 1, isDesign: 1, isComposite: 0, isPreview: 0, isDesignShape: 0 };
          d.drawText("P0_V5", null, null, null, entry, base);
          const o = d.canvas.getObjects().filter((ob) => String(ob.text || "") === "P0_V5")[0];
          if (o) { o.topEnable = 1; o.resourceType = 0; o.maskEnable = 0; o.lowPixelFlag = 0; o.selectEnabled = 1; o.isDesign = 1; o.isComposite = 0; o.isPreview = 0; o.isDesignShape = 0; }
          d.canvas.requestRenderAll && d.canvas.requestRenderAll();
        }
      });
      await page.waitForTimeout(1500);
      report.phases.hegaoClick = await clickHegao();
      await page.waitForTimeout(6000);
      await closeLayers();
      await page.waitForTimeout(1500);
      // 3) 点印刷
      report.phases.printClick = await clickPrint();
      await page.waitForTimeout(4000);
      const hasForm = await evalPage(() => { const layers = document.querySelectorAll(".layui-layer, .modal"); for (let i = 0; i < layers.length; i++) { if (layers[i].offsetParent && String(layers[i].innerText || "").indexOf("作品名") >= 0) return true; } return false; });
      if (hasForm) { await fillForm(); await page.waitForTimeout(1200); await clickConfirm(); }

      // 4) 印刷核稿阶段：多轮 点搜索 → 处理生成中弹层 → 观察
      const t0 = Date.now();
      let foundFail = null;
      let sawGenerating = 0;
      while (Date.now() - t0 < 75000) {
        const layers = await readLayers();
        const allTxt = layers.map((l) => l.txt).join("\n");
        // 印刷稿件生成中 → 确认/关闭
        if (/印刷稿件生成中|请耐心等待|生成中|正在生成/.test(allTxt)) {
          sawGenerating++;
          report.genDialogs.push({ t: new Date().toISOString().slice(11, 19), layers: layers.slice(0, 5) });
          // 点确认/确定/关闭 或 closeLayers
          const done = await evalPage(() => {
            const btns = document.querySelectorAll(".layui-layer button, .layui-layer a, .layui-layer-btn0");
            for (let i = 0; i < btns.length; i++) {
              const tx = String(btns[i].textContent || "").trim();
              if (/确认|确定|关闭|知道了|好/.test(tx) && btns[i].offsetParent) { try { btns[i].click(); return { clicked: tx.slice(0, 10) }; } catch (e) {} break; }
            }
            return { clicked: false };
          });
          if (!done || !done.clicked) await closeLayers();
        } else if (/自动核稿失败|生产文件与设计稿|标记正常|去检查/.test(allTxt)) { foundFail = layers; break; }
        else {
          // 每轮点一次「搜索」（共 4 次内）
          if (sawGenerating === 0 && report.searchClicks.length < 4) {
            const sc = await evalPage(() => {
              const layers = document.querySelectorAll(".layui-layer, .modal");
              let btn = null;
              const scan = (root) => { const cs = root.querySelectorAll("a, button, input[type=button], input[type=submit], span"); for (let j = 0; j < cs.length; j++) { const el = cs[j]; if (!el.offsetParent) continue; const tx = String(el.textContent || el.value || "").trim(); const cls = String(el.className || ""); if (/^搜索$|查 询|查询|搜 索/.test(tx) || (/search/i.test(cls) && /button|btn|a|span/.test(el.tagName))) return el; } return null; };
              for (let li = 0; li < layers.length && !btn; li++) { if (layers[li].offsetParent) btn = scan(layers[li]); }
              if (!btn) { const inp = Array.from(document.querySelectorAll("input")).find((el) => /order|search/i.test(String(el.className) + String(el.id))); if (inp && inp.parentElement) btn = scan(inp.parentElement); }
              if (!btn) return { clicked: false };
              try { btn.click(); return { clicked: true, cls: String(btn.className || "").slice(0, 40) }; } catch (e) { return { clicked: false, err: String(e) }; }
            });
            report.searchClicks.push({ t: new Date().toISOString().slice(11, 19), ...sc });
            await page.waitForTimeout(2000);
          }
        }
        await page.waitForTimeout(1500);
      }
      report.phases.foundFail = foundFail;
      report.phases.genDialogCount = sawGenerating;
      report.phases.finalLayers = await readLayers();
      report.phases.saveResp = (report.resp || []).filter((x) => /save|submit/i.test(x.u)).map((x) => ({ u: x.u.slice(0, 130), b: String(x.body).slice(0, 300) }));
    }
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