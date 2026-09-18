// runtime/p0-relogin-probe.v4.js — 修正流程：登录(完整表单) → 点核稿 → 关核稿窗 → 印刷
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "p0-relogin-v4.json");
const USER = process.env.P0_LOGIN_USER || "";
const PASS = process.env.P0_LOGIN_PASS || "";

(async () => {
  const report = { ts: new Date().toISOString(), stage: "P0-RELOGIN-V4", url: EDITOR_URL, phases: {}, resp: [], dialogs: [], errors: [] };
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
      try { const u = r.url(); if (u.indexOf("zheliyin.com") < 0) return; const ct = r.headers()["content-type"] || ""; if (ct.indexOf("json") < 0 && ct.indexOf("text") < 0) return; let b = ""; try { b = await r.text().catch(() => ""); } catch (e) {} if (report.resp.length < 150) report.resp.push({ status: r.status(), u: u.slice(0, 220), body: String(b).slice(0, 3000) }); } catch (e) {}
    });
    const readyEval = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[0]);
      return { ok: !!(d && d.canvas && typeof d.drawText === "function") };
    }).catch(() => ({ ok: false }));
    const waitReady = async (ms) => { const dd = Date.now() + ms; while (Date.now() < dd) { const r = await readyEval(); if (r && r.ok) return true; await page.waitForTimeout(2000); } return false; };

    const clickByText = (re, clsRe) => page.evaluate((arg) => {
      const all = document.querySelectorAll("li,a,button,span,div");
      let best = null;
      for (let i = 0; i < all.length; i++) {
        const el = all[i];
        const tx = String(el.textContent || "").trim();
        const cls = String(el.className || "");
        if (tx === arg.tx && (!arg.cls || new RegExp(arg.cls, "i").test(cls)) && el.offsetParent) { best = el; break; }
      }
      if (!best && arg.cls) {
        const byCls = document.querySelectorAll(arg.cls);
        for (let i = 0; i < byCls.length; i++) { if (byCls[i].offsetParent) { best = byCls[i]; break; } }
      }
      if (best) { try { best.click(); return { clicked: true, cls: String(best.className).slice(0, 60) }; } catch (e) {} }
      return { clicked: false };
    }, { tx: arg_tx, cls: arg_cls }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    const clickHegao = () => page.evaluate(() => {
      const cands = document.querySelectorAll(".hegao-preview, li[class*=hegao], [class*=hegao]");
      let best = null;
      for (let i = 0; i < cands.length; i++) { if (cands[i].offsetParent) { const t = String(cands[i].textContent || "").trim(); if (/核稿/.test(t)) { best = cands[i]; break; } } }
      if (!best) { const all = document.querySelectorAll("li,a,button,span,div"); for (let i = 0; i < all.length; i++) { if (String(all[i].textContent || "").trim() === "核稿" && all[i].offsetParent) { best = all[i]; break; } } }
      if (best) { try { best.click(); return { clicked: true }; } catch (e) {} }
      return { clicked: false };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    const closeLayers = () => page.evaluate(() => {
      let closed = 0;
      // 关闭弹层：点击 .close-btn / .layui-layer-close / [class*=close] / 右上角关闭
      document.querySelectorAll(".close-btn, a.close, .layui-layer-close, .layui-layer-close2, [class*=close]").forEach((el) => {
        if (closed > 6) return;
        if (!el.offsetParent) return;
        const cls = String(el.className || "");
        if (/close/.test(cls) && el.offsetParent) { try { el.click(); closed++; } catch (e) {} }
      });
      return { closed };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    const clickPrint = () => page.evaluate(() => {
      const cands = document.querySelectorAll(".btn.print, li.print, [class*=' print'], .rightBtn li, .rightBtn a");
      let best = null;
      for (let i = 0; i < cands.length; i++) { const el = cands[i]; const tx = String(el.textContent || "").trim(); const cls = String(el.className || ""); if (/印刷/.test(tx) && /print/i.test(cls)) { best = el; break; } if (/印刷/.test(tx) && !best) best = el; }
      if (!best) { const all = document.querySelectorAll("li,a,button,span,div"); for (let i = 0; i < all.length; i++) { if (String(all[i].textContent || "").trim() === "印刷" && all[i].offsetParent) { best = all[i]; break; } } }
      if (best) { try { best.click(); return { clicked: true }; } catch (e) {} }
      return { clicked: false };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    const fillForm = () => page.evaluate(() => {
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
      setByLabel(["备注"], "p0 relogin v4");
      return { ok: true };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    const clickConfirm = () => page.evaluate(() => {
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
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // 打开
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    report.phases.ready = await waitReady(150000);

    // 登录浮层完整 dump
    report.phases.loginDump = await page.evaluate(() => {
      const out = { forms: [] };
      document.querySelectorAll(".login-tab form, .login-tab, .zLoginOut form, [class*=login] form").forEach((f) => {
        const inputs = [];
        f.querySelectorAll("input").forEach((el) => inputs.push({ id: el.id, type: el.type, ph: el.placeholder, cls: String(el.className).slice(0, 30) }));
        const btns = [];
        f.querySelectorAll("a, button, input[type=submit], input[type=button]").forEach((b) => btns.push({ tag: b.tagName, txt: String(b.textContent || b.value || "").trim().slice(0, 16), cls: String(b.className).slice(0, 40) }));
        out.forms.push({ cls: String(f.className).slice(0, 40), inputs, btns, visible: !!f.offsetParent });
      });
      return out;
    }).catch((e) => ({ err: String(e || "").slice(0, 300) }));
    // 若已过期 → 触发登录浮层
    const loginVisible0 = await page.evaluate(() => { const ua = document.querySelector("#userAccount"); return !!(ua && ua.offsetParent); }).catch(() => false);
    if (!loginVisible0) {
      // 创建对象 → 点印刷 → 填 → 确定 触发 timeOut 浮层
      await page.evaluate(() => {
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
      }).catch(() => {});
      await clickPrint();
      await page.waitForTimeout(4000);
      await fillForm();
      await page.waitForTimeout(1200);
      await clickConfirm();
    }
    let loginVisible = false;
    const d2s = Date.now() + 20000;
    while (Date.now() < d2s) { loginVisible = await page.evaluate(() => { const ua = document.querySelector("#userAccount"); return !!(ua && ua.offsetParent); }).catch(() => false); if (loginVisible) break; await page.waitForTimeout(1000); }
    report.phases.loginVisible = loginVisible;
    if (loginVisible) {
      report.phases.loginDump2 = await page.evaluate(() => {
        const forms = [];
        document.querySelectorAll("form").forEach((f) => {
          if (!f.offsetParent) return;
          if (f.querySelector("#userAccount, [placeholder*=手机], [placeholder*=账号], [placeholder*=用户名]") || f.querySelector("input[type=password]")) {
            const inputs = [];
            f.querySelectorAll("input").forEach((el) => inputs.push({ id: el.id, type: el.type, ph: el.placeholder, cls: String(el.className).slice(0, 30) }));
            const btns = [];
            f.querySelectorAll("a, button, input[type=submit], input[type=button]").forEach((b) => btns.push({ tag: b.tagName, txt: String(b.textContent || b.value || "").trim().slice(0, 16), cls: String(b.className).slice(0, 40) }));
            forms.push({ cls: String(f.className).slice(0, 40), inputs, btns });
          }
        });
        return forms;
      }).catch((e) => ({ err: String(e || "").slice(0, 300) }));
      report.phases.login = await page.evaluate((arg) => {
        const log = [];
        // 用户名输入：id=userAccount 或 placeholder 含 手机/账号/用户名
        const u = document.querySelector("#userAccount") || Array.from(document.querySelectorAll("input")).find((el) => /手机|账号|用户名|账户/.test(String(el.placeholder || "") + String(el.id || "")));
        const p = document.querySelector("#userPassword") || Array.from(document.querySelectorAll("input")).find((el) => String(el.type || "").toLowerCase() === "password");
        if (!u || !p) return { ok: false, reason: "no inputs", ua: !!u, pw: !!p };
        u.value = arg.u; p.value = arg.p;
        try { u.dispatchEvent(new Event("input", { bubbles: true })); u.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
        try { p.dispatchEvent(new Event("input", { bubbles: true })); p.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
        log.push("filled:" + (u.id || "u") + " + " + (p.id || "p"));
        // 登录按钮：btn-register / btn-login / 文本 确定|登录
        let btn = document.querySelector(".btn-register") || document.querySelector(".btn-login") || null;
        if (!btn) {
          const cands = document.querySelectorAll("a, button, input[type=button], input[type=submit]");
          for (let i = 0; i < cands.length; i++) { const el = cands[i]; const t = String(el.textContent || el.value || "").trim(); if ((/登录|确定|提交/.test(t)) && el.offsetParent && el.closest(".login-tab, .register-area, .zLoginOut")) { btn = el; break; } }
        }
        if (!btn) return { ok: false, reason: "no login btn", log };
        btn.click();
        log.push("clicked:" + String(btn.textContent || btn.value || "").trim().slice(0, 12));
        return { ok: true, log };
      }, { u: USER, p: PASS }).catch((e) => ({ err: String(e || "").slice(0, 300) }));
      await page.waitForTimeout(12000);
    }
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    report.phases.ready2 = await waitReady(120000);

    // ===== 正确流程：创建 → 核稿 → 关闭核稿窗 → 印刷 =====
    if (report.phases.ready2) {
      await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
        for (let i = 0; i < vo.totalCanvasArray.length; i++) {
          const d = vo.totalCanvasArray[i];
          if (!(d && typeof d.drawText === "function" && d.canvas && d.canvasObjInfo)) continue;
          const base = d.canvasObjInfo.canvasToProductObjArr.length;
          const entry = { media: { mediaType: "text", text: "P0_FINAL", font: { pointSize: 24, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "556", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.3, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: 100, y: 100, width: 220, height: 40, factWidth: 220, factHeight: 40, rotation: 0 }, printLocation: { x: 100, y: 100, width: 220, height: 40, rotation: 0 }, layer: { alpha: 1 }, layerNum: base, isEdit: 1, isDisplay: 1, deleteState: 0, visitLevel: 1, multiUuid: "p0fn" + Date.now() % 10000, markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0, lowPixelFlag: 0, selectEnabled: 1, isDesign: 1, isComposite: 0, isPreview: 0, isDesignShape: 0 };
          d.drawText("P0_FINAL", null, null, null, entry, base);
          const o = d.canvas.getObjects().filter((ob) => String(ob.text || "") === "P0_FINAL")[0];
          if (o) { o.topEnable = 1; o.resourceType = 0; o.maskEnable = 0; o.lowPixelFlag = 0; o.selectEnabled = 1; o.isDesign = 1; o.isComposite = 0; o.isPreview = 0; o.isDesignShape = 0; }
          d.canvas.requestRenderAll && d.canvas.requestRenderAll();
        }
      }).catch(() => {});
      await page.waitForTimeout(1500);
      // 1) 点核稿
      report.phases.hegaoClick = await clickHegao();
      await page.waitForTimeout(8000);
      report.phases.afterHegao = await page.evaluate(() => {
        const layers = [];
        document.querySelectorAll(".layui-layer, [class*=hegao], [class*=check], .hegao-preview").forEach((el) => {
          const rc = el.getBoundingClientRect(); if (rc.width === 0 && rc.height === 0) return;
          const t = String(el.innerText || el.textContent || "").trim();
          if (t) layers.push({ cls: String(el.className).slice(0, 50), txt: t.slice(0, 300) });
        });
        return { layers: layers.slice(0, 12) };
      }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
      // 2) 关闭核稿窗口（如弹出了）
      report.phases.closeLayers = await closeLayers();
      await page.waitForTimeout(2000);
      // 3) 点印刷
      report.phases.printClick = await clickPrint();
      await page.waitForTimeout(4000);
      // 若印刷弹保存表单 → 填 1/2 → 确定
      const hasForm = await page.evaluate(() => { const layers = document.querySelectorAll(".layui-layer, .modal"); for (let i = 0; i < layers.length; i++) { if (layers[i].offsetParent && String(layers[i].innerText || "").indexOf("作品名") >= 0) return true; } return false; }).catch(() => false);
      if (hasForm) { await fillForm(); await page.waitForTimeout(1200); report.phases.finalConfirm = await clickConfirm(); }
      // 观察 50s
      const t0 = Date.now();
      let dialog = null;
      while (Date.now() - t0 < 50000) {
        dialog = await page.evaluate(() => {
          const layers = [];
          document.querySelectorAll(".layui-layer, [class*=hegao]").forEach((el) => {
            const rc = el.getBoundingClientRect(); if (rc.width === 0 && rc.height === 0) return;
            const t = String(el.innerText || el.textContent || "").trim();
            if (t && /自动核稿|核稿失败|生产文件与设计稿|标记正常|去检查/.test(t)) layers.push(t.slice(0, 700));
          });
          return layers;
        }).catch(() => []);
        if (dialog && dialog.length) break;
        await page.waitForTimeout(1500);
      }
      report.phases.dialog = dialog;
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