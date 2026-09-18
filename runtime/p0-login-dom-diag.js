// 诊断登录框 DOM：打印 #userAccount 周边结构与可点按钮
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";

(async () => {
  const out = {};
  let browser = null, page = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    page = browser.pages()[0];
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const readyEval = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[0]);
      return { ok: !!(d && d.canvas && typeof d.drawText === "function") };
    }).catch(() => ({ ok: false }));
    let ok = false;
    const d1 = Date.now() + 150000;
    while (Date.now() < d1) { ok = await readyEval(); if (ok && ok.ok) break; await page.waitForTimeout(2000); }
    out.ready = !!(ok && ok.ok);

    out.dom = await page.evaluate(() => {
      const ua = document.querySelector("#userAccount");
      const boxes = [];
      if (ua) {
        let el = ua;
        for (let hop = 0; hop < 6 && el; hop++) {
          el = el.parentElement;
          if (!el) break;
          boxes.push({ hop, tag: el.tagName, id: el.id, cls: String(el.className).slice(0, 80), html: el.outerHTML.slice(0, 900) });
          if (/login|Login|zLogin|account|user/i.test(String(el.id) + String(el.className))) break;
        }
      }
      // 可点元素清单（可见）
      const clickables = [];
      document.querySelectorAll("button, a, input[type=button], input[type=submit], .layui-layer-btn0, span, div, i").forEach((el) => {
        if (clickables.length >= 60) return;
        if (!el.offsetParent) return;
        const tx = String(el.textContent || el.value || el.title || "").trim().slice(0, 20);
        const cls = String(el.className || "").slice(0, 50);
        if (tx || cls) clickables.push({ tag: el.tagName, id: el.id, cls, tx, t: Date.now() % 7 });
      });
      // 从 login 相关容器内找
      const loginHost = ua && (ua.closest(".layui-layer") || ua.closest("[class*=Login]") || ua.closest("[class*=login]") || ua.parentElement.parentElement);
      const hostBtns = [];
      if (loginHost) loginHost.querySelectorAll("button, a, input[type=button], input[type=submit], span, i").forEach((el) => {
        const tx = String(el.textContent || el.value || "").trim().slice(0, 20);
        if (tx || el.className) hostBtns.push({ tag: el.tagName, cls: String(el.className).slice(0, 60), tx, html: el.outerHTML.slice(0, 200) });
      });
      return { boxes, clickables: clickables.slice(0, 60), hostBtns: hostBtns.slice(0, 40) };
    }).catch((e) => ({ err: String(e || "").slice(0, 300) }));
  } catch (e) {
    out.fatal = String(e && e.message || e).slice(0, 300);
  } finally {
    try { page && await page.close(); } catch (e) {}
    try { browser && await browser.close(); } catch (e) {}
  }
  fs.writeFileSync(path.join(__dirname, "reports", "p0-login-dom.json"), JSON.stringify(out, null, 2));
  const rep = JSON.stringify(out.dom || {});
  console.log(rep.slice(0, 4200));
})().catch((e) => { console.error("FATAL", e); process.exit(1); });