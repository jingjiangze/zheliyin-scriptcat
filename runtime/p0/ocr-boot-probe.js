// runtime/p0/ocr-boot-probe.js — 探测 profile-usc3 是否运行真实用户脚本(page-bridge/OCR抽屉)与版本诊断
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const OUT = path.join(__dirname, "..", "reports", "p0", "ocr-boot-probe.json");
(async () => {
  const out = { ts: new Date().toISOString(), consoleLines: [], errors: [] };
  const browser = await chromium.launchPersistentContext(path.join(__dirname, "..", "browser", "profile-usc3"), {
    channel: "chromium", headless: false,
    ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
    args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
    viewport: { width: 1440, height: 900 }
  });
  const page = browser.pages()[0];
  page.on("console", (m) => { const t = m.text(); if (/zs-card|zy-ocr|page-bridge|bridge|GM_|ocr/i.test(t)) out.consoleLines.push(t.slice(0, 300)); });
  page.on("pageerror", (e) => out.errors.push(String(e.message || e).slice(0, 300)));
  await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => out.errors.push("goto: " + String(e)));
  // 等编辑器就绪
  let ok = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    ok = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = (vo && Array.isArray(vo.totalCanvasArray) && vo.totalCanvasArray[0]) || null;
      return !!(d && d.canvas && typeof d.drawText === "function");
    }).catch(() => false);
    if (ok) break;
    await page.waitForTimeout(2000);
  }
  out.editorReady = ok;
  const diag = await page.evaluate(() => {
    const d = { toolBtn: !!document.getElementById("zy-native-ocr-tool-btn"), panel: !!document.getElementById("zy-native-ocr-panel"), btn: !!document.getElementById("zy-native-ocr-btn"), bridge: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed), zyDebugAlias: typeof window.__zyDebug, globals: Object.getOwnPropertyNames(window).filter((n) => /zy|ocr|bridge/i.test(n)).slice(0, 60) };
    const btn = document.getElementById("zy-native-ocr-tool-btn");
    if (btn) { try { btn.click(); } catch (e) {} }
    return d;
  }).catch((e) => ({ err: String(e).slice(0, 200) }));
  out.ui = diag;
  await page.waitForTimeout(2500);
  const panelInfo = await page.evaluate(() => {
    const p = document.getElementById("zy-native-ocr-panel");
    if (!p) return { present: false };
    const txt = String(p.innerText || "").slice(0, 1200);
    const imgs = Array.from(p.querySelectorAll("img")).map((im) => im.src.slice(0, 140)).slice(0, 6);
    const status = (p.querySelector(".zy-status, [class*=status]") || {}).innerText || null;
    return { present: true, txt, imgs, status: String(status || "").slice(0, 200) };
  }).catch((e) => ({ err: String(e).slice(0, 200) }));
  out.panel = panelInfo;
  try { out.screen = await page.screenshot({ path: path.join(__dirname, "..", "reports", "p0", "ocr-boot.png") }); } catch (e) {}
  if (!fs.existsSync(path.dirname(OUT))) fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log("probe done:", !!(out.ui && out.ui.toolBtn), "bridge:", !!(out.ui && out.ui.bridge));
  await browser.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });