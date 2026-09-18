// runtime/p0-relogin-probe.js — 自动登录 + 印刷全链路（保存成功验证）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "p0-relogin.json");
const USER = process.env.P0_LOGIN_USER || "";
const PASS = process.env.P0_LOGIN_PASS || "";

(async () => {
  const report = { ts: new Date().toISOString(), stage: "P0-RELOGIN", url: EDITOR_URL, phases: {}, resp: [], dialogs: [], errors: [] };
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
    for (const kw of [/third\/.*login/i, /login/i, /check|save|submit|order/i]) {
      page.on("response", async (r) => { try { const u = r.url(); if (u.indexOf("zheliyin.com") < 0) return; const ct = r.headers()["content-type"] || ""; if (ct.indexOf("json") < 0 && ct.indexOf("text") < 0) return; let b = ""; try { b = await r.text().catch(() => ""); } catch (e) {} if (report.resp.length < 50) report.resp.push({ status: r.status(), u: u.slice(0, 200), body: String(b).slice(0, 2000) }); } catch (e) {} });
    }

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

    // 1) 找登录框（账户登录: userAccount/userPassword）
    const loginInfo = await page.evaluate(() => {
      const list = [];
      document.querySelectorAll("input").forEach((el) => {
        list.push({ id: el.id, cls: String(el.className).slice(0, 30), ph: el.placeholder, vis: !!el.offsetParent });
      });
      const ua = document.querySelector("#userAccount") || null;
      const up = document.querySelector("#userPassword") || null;
      return { count: list.length, userAccount: !!ua, userPassword: !!up, inputs: list.slice(0, 30) };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    report.phases.loginForm = loginInfo;

    // 2) 填入账号密码并提交（优先 #userAccount/#userPassword；否则 placeholder 含"手机/账号"）
    const loginRes = await page.evaluate((arg) => {
      const u = document.querySelector("#userAccount") || Array.from(document.querySelectorAll("input")).find((el) => /手机|账号|用户名/.test(String(el.placeholder || "") + String(el.id || "")));
      const p = document.querySelector("#userPassword") || Array.from(document.querySelectorAll("input")).find((el) => String(el.type || "") === "password");
      const log = [];
      if (!u || !p) return { ok: false, reason: "no login inputs", ua: !!u, pw: !!p };
      u.value = arg.u; p.value = arg.p;
      try { u.dispatchEvent(new Event("input", { bubbles: true })); u.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
      try { p.dispatchEvent(new Event("input", { bubbles: true })); p.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
      log.push("filled");
      // 找登录按钮：文本含 登录/立即登录/确定；或在登录弹层内 button
      let btn = null;
      const cands = document.querySelectorAll("button, a, input[type=button], input[type=submit], .layui-layer-btn0");
      for (let i = 0; i < cands.length; i++) {
        const el = cands[i];
        const tx = String(el.textContent || el.value || "").trim();
        if (/登录|立即登录/.test(tx)) { btn = el; break; }
      }
      if (!btn) {
        const host = u.closest(".layui-layer") || u.closest("div");
        if (host) { const bs = host.querySelectorAll("button, a"); for (let i = 0; i < bs.length; i++) { const tx = String(bs[i].textContent || "").trim(); if (/确\s*定|登\s*录|提交/.test(tx)) { btn = bs[i]; break; } } }
      }
      if (!btn) return { ok: false, reason: "no login button", log };
      btn.click(); log.push("clicked:" + String(btn.textContent || btn.value || "").trim().slice(0, 10));
      return { ok: true, log };
    }, { u: USER, p: PASS }).catch((e) => ({ err: String(e || "").slice(0, 300) }));
    report.phases.login = loginRes;
    await page.waitForTimeout(8000);
    report.phases.urlAfterLogin = page.url().slice(0, 200);

    // 3) 可能已跳转/刷新 → 重新 ready
    let ok2 = false;
    const d2 = Date.now() + 90000;
    while (Date.now() < d2) { ok2 = await readyEval(); if (ok2 && ok2.ok) break; await page.waitForTimeout(2000); }
    report.phases.ready2 = !!(ok2 && ok2.ok);

    // 4) 创建 1 个 OCR 样式对象 → 点击印刷 → 填 1/2 → 确定 → 抓响应（是否 still timeOut）
    if (ok2) {
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
          report_created = true;
        }
      }).catch(() => {});
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
        setByLabel(["备注"], "p0 relogin");
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
      const t0 = Date.now();
      while (Date.now() - t0 < 40000) { await page.waitForTimeout(1500); }
      report.phases.proofDialog = await page.evaluate(() => {
        const layers = [];
        document.querySelectorAll(".layui-layer, [class*=hegao]").forEach((el) => {
          const rc = el.getBoundingClientRect(); if (rc.width === 0 && rc.height === 0) return;
          const t = String(el.innerText || el.textContent || "").trim();
          if (t && /自动核稿|核稿失败|生产文件与设计稿|标记正常|去检查/.test(t)) layers.push(t.slice(0, 700));
        });
        return layers;
      }).catch(() => []);
      report.phases.remainingForms = await page.evaluate(() => {
        const r = {};
        document.querySelectorAll("input").forEach((el) => { r[el.id || el.name || el.placeholder] = String(el.value || "").slice(0, 40); });
        return r;
      }).catch(() => ({}));
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