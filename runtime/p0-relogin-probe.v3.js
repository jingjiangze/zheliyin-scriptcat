// runtime/p0-relogin-probe.v3.js — 登录成功后强制 reload 再走印刷全链路（验证会话是否生效）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "p0-relogin-v3.json");
const USER = process.env.P0_LOGIN_USER || "";
const PASS = process.env.P0_LOGIN_PASS || "";

(async () => {
  const report = { ts: new Date().toISOString(), stage: "P0-RELOGIN-V3", url: EDITOR_URL, phases: {}, resp: [], errors: [] };
  let browser = null, page = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    page = browser.pages()[0];
    page.on("response", async (r) => {
      try { const u = r.url(); if (u.indexOf("zheliyin.com") < 0) return; const ct = r.headers()["content-type"] || ""; if (ct.indexOf("json") < 0 && ct.indexOf("text") < 0) return; let b = ""; try { b = await r.text().catch(() => ""); } catch (e) {} if (report.resp.length < 120) report.resp.push({ status: r.status(), u: u.slice(0, 220), body: String(b).slice(0, 2500) }); } catch (e) {}
    });
    const readyEval = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[0]);
      return { ok: !!(d && d.canvas && typeof d.drawText === "function") };
    }).catch(() => ({ ok: false }));
    const waitReady = async (ms) => { const dd = Date.now() + ms; while (Date.now() < dd) { const r = await readyEval(); if (r && r.ok) return true; await page.waitForTimeout(2000); } return false; };
    const clickPrint = () => page.evaluate(() => {
      const cands = document.querySelectorAll(".btn.print, li.print, [class*=' print'], .rightBtn li, .rightBtn a");
      let best = null;
      for (let i = 0; i < cands.length; i++) { const el = cands[i]; const tx = String(el.textContent || "").trim(); const cls = String(el.className || ""); if (/印刷/.test(tx) && /print/i.test(cls)) { best = el; break; } if (/印刷/.test(tx) && !best) best = el; }
      if (!best) { const all = document.querySelectorAll("li,a,button,span,div"); for (let i = 0; i < all.length; i++) { const el = all[i]; if (String(el.textContent || "").trim() === "印刷" && el.offsetParent) { best = el; break; } } }
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
      setByLabel(["备注"], "p0 relogin v3");
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

    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    report.phases.ready = await waitReady(150000);

    // 触发登录浮层（点印刷 → 填 → 确定）
    await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      for (let i = 0; i < vo.totalCanvasArray.length; i++) {
        const d = vo.totalCanvasArray[i];
        if (!(d && typeof d.drawText === "function" && d.canvas && d.canvasObjInfo)) continue;
        const base = d.canvasObjInfo.canvasToProductObjArr.length;
        const entry = { media: { mediaType: "text", text: "P0_LOGIN_PROBE", font: { pointSize: 24, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "556", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.3, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: 100, y: 100, width: 220, height: 40, factWidth: 220, factHeight: 40, rotation: 0 }, printLocation: { x: 100, y: 100, width: 220, height: 40, rotation: 0 }, layer: { alpha: 1 }, layerNum: base, isEdit: 1, isDisplay: 1, deleteState: 0, visitLevel: 1, multiUuid: "p0lg" + Date.now() % 10000, markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0, lowPixelFlag: 0, selectEnabled: 1, isDesign: 1, isComposite: 0, isPreview: 0, isDesignShape: 0 };
        d.drawText("P0_LOGIN_PROBE", null, null, null, entry, base);
        const o = d.canvas.getObjects().filter((ob) => String(ob.text || "") === "P0_LOGIN_PROBE")[0];
        if (o) { o.topEnable = 1; o.resourceType = 0; o.maskEnable = 0; o.lowPixelFlag = 0; o.selectEnabled = 1; o.isDesign = 1; o.isComposite = 0; o.isPreview = 0; o.isDesignShape = 0; }
        d.canvas.requestRenderAll && d.canvas.requestRenderAll();
      }
    }).catch(() => {});
    await clickPrint();
    await page.waitForTimeout(4000);
    await fillForm();
    await page.waitForTimeout(1200);
    await clickConfirm();
    // 等登录浮层
    let loginVisible = false;
    const d2s = Date.now() + 15000;
    while (Date.now() < d2s) { loginVisible = await page.evaluate(() => { const ua = document.querySelector("#userAccount"); return !!(ua && ua.offsetParent); }).catch(() => false); if (loginVisible) break; await page.waitForTimeout(1000); }
    report.phases.loginVisible = loginVisible;
    if (loginVisible) {
      report.phases.login = await page.evaluate((arg) => {
        const u = document.querySelector("#userAccount");
        const p = document.querySelector("#userPassword");
        if (!u || !p) return { ok: false, reason: "no inputs" };
        u.value = arg.u; p.value = arg.p;
        try { u.dispatchEvent(new Event("input", { bubbles: true })); u.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
        try { p.dispatchEvent(new Event("input", { bubbles: true })); p.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
        // 尝试点注册/确定按钮（RSA+可能验证码）
        const btn = document.querySelector(".btn-register") || Array.from(document.querySelectorAll("a, button")).find((el) => { const t = String(el.textContent || "").trim(); return t === "确定" && el.offsetParent && el.closest(".login-tab, .register-area"); });
        if (!btn) return { ok: false, reason: "no login btn" };
        btn.click();
        return { ok: true };
      }, { u: USER, p: PASS }).catch((e) => ({ err: String(e || "").slice(0, 300) }));
      await page.waitForTimeout(12000);
    }
    // 强制 reload 让新会话 cookie 生效
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    report.phases.ready2 = await waitReady(120000);

    // 重新完整印刷
    if (report.phases.ready2) {
      await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
        for (let i = 0; i < vo.totalCanvasArray.length; i++) {
          const d = vo.totalCanvasArray[i];
          if (!(d && typeof d.drawText === "function" && d.canvas && d.canvasObjInfo)) continue;
          const base = d.canvasObjInfo.canvasToProductObjArr.length;
          const entry = { media: { mediaType: "text", text: "P0_RELOGIN_AFTER", font: { pointSize: 24, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "556", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.3, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: 100, y: 100, width: 220, height: 40, factWidth: 220, factHeight: 40, rotation: 0 }, printLocation: { x: 100, y: 100, width: 220, height: 40, rotation: 0 }, layer: { alpha: 1 }, layerNum: base, isEdit: 1, isDisplay: 1, deleteState: 0, visitLevel: 1, multiUuid: "p0rv" + Date.now() % 10000, markuuid: "", topEnable: 1, resourceType: 0, maskEnable: 0, lowPixelFlag: 0, selectEnabled: 1, isDesign: 1, isComposite: 0, isPreview: 0, isDesignShape: 0 };
          d.drawText("P0_RELOGIN_AFTER", null, null, null, entry, base);
          const o = d.canvas.getObjects().filter((ob) => String(ob.text || "") === "P0_RELOGIN_AFTER")[0];
          if (o) { o.topEnable = 1; o.resourceType = 0; o.maskEnable = 0; o.lowPixelFlag = 0; o.selectEnabled = 1; o.isDesign = 1; o.isComposite = 0; o.isPreview = 0; o.isDesignShape = 0; }
          d.canvas.requestRenderAll && d.canvas.requestRenderAll();
        }
      }).catch(() => {});
      await clickPrint();
      await page.waitForTimeout(4000);
      await fillForm();
      await page.waitForTimeout(1500);
      report.phases.finalConfirm = await clickConfirm();
      const t0 = Date.now();
      let dialog = null;
      while (Date.now() - t0 < 45000) {
        dialog = await page.evaluate(() => {
          const layers = [];
          document.querySelectorAll(".layui-layer, [class*=hegao]").forEach((el) => {
            const rc = el.getBoundingClientRect(); if (rc.width === 0 && rc.height === 0) return;
            const t = String(el.innerText || el.textContent || "").trim();
            if (t && /自动核稿|核稿失败|生产文件与设计稿|标记正常|去检查|保存成功/.test(t)) layers.push(t.slice(0, 700));
          });
          return layers;
        }).catch(() => []);
        if (dialog && dialog.length) break;
        await page.waitForTimeout(1500);
      }
      report.phases.dialog = dialog;
      report.phases.saveResp = (report.resp || []).filter((x) => /save|submit/i.test(x.u)).map((x) => ({ u: x.u.slice(0, 120), b: String(x.body).slice(0, 260) }));
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