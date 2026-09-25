// 第四轮探测（正确操作）：#modleNum=1(依据第1版) + #multiNum=新增版数 → 确定 → 读多版结构 + 切版
"use strict";
const path = require("path");
const { chromium } = require("D:/zheliyin-scriptcat/node_modules/playwright");
const ROOT = "D:/zheliyin-scriptcat";
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const probeMod = require(path.join(ROOT, "runtime", "stage9", "session-probe"));
const URL = process.env.ZY_URL || "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const ADD = Number(process.env.ZY_MV_ADD || 1); // 新增版数

function parseCookies(raw) {
  const out = [];
  String(raw || "").split(";").forEach((part) => {
    const eq = part.indexOf("=");
    if (eq <= 0) return;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!name || !value) return;
    out.push({ name, value: value.replace(/^"|"$/g, ""), domain: ".diy.zheliyin.com", path: "/", expires: -1 });
  });
  return out;
}
const ST = () => {
  try {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const CV = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO || null;
    const total = CV && Array.isArray(CV.totalCanvasArray) ? CV.totalCanvasArray : [];
    const unwrap = (e) => { try { return (e && e.canvas) || e; } catch (x) { return null; } };
    return {
      currentCanvasNum: CV ? CV.currentCanvasNum : null,
      totalLen: total.length,
      pages: total.map((e, i) => {
        const c = unwrap(e);
        let objs = null;
        try { if (c && c.getObjects) objs = c.getObjects().length; } catch (x) {}
        return { i, idName: (e && e.idName) || null, objCount: objs };
      }),
      liCount: document.querySelectorAll(".pageWrapMulti li").length,
      li: Array.from(document.querySelectorAll(".pageWrapMulti li")).map((l, i) => ({
        i, id: l.id, cls: String(l.className || ""),
        pageNum: (l.querySelector(".pageNum") ? String(l.querySelector(".pageNum").textContent || "").trim() : null),
        groups: Array.from(l.querySelectorAll(".page-group")).map((g) => ({ t: String(g.textContent || "").trim(), cur: g.classList.contains("current") })),
        delKind: (l.querySelector("a.del-first") ? "del-first" : (l.querySelector("i.icon-del") ? "icon-del" : null))
      })),
      groupsGlobal: Array.from(document.querySelectorAll(".pageWrapMulti .page-group")).map((g, i) => ({ i, t: String(g.textContent || "").trim(), cur: g.classList.contains("current") })),
      currentLiIdx: (function () { const x = document.querySelector(".pageWrapMulti li.currentLi"); return x ? Array.from(document.querySelectorAll(".pageWrapMulti li")).indexOf(x) : null; })(),
      layerMsg: Array.from(document.querySelectorAll(".layui-layer-msg")).map((e) => String(e.textContent || "").trim()).slice(0, 4),
      dlgOpen: !!document.querySelector(".layui-layer")
    };
  } catch (e) { return { error: String(e && e.message || e).slice(0, 200) }; }
};

(async () => {
  const sess = await probeMod.resolveStage9Cookie();
  if (!sess.raw) { console.error("NO_COOKIE"); process.exit(2); }
  const browser = await chromium.launchPersistentContext(PROFILE, {
    channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
    args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR],
    viewport: { width: 1280, height: 900 }
  });
  browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
  const page = browser.pages()[0];
  for (const c of parseCookies(sess.raw)) { try { await browser.addCookies([c]); } catch (e) {} }
  const out = { add: ADD, steps: [] };
  const snap = async (l) => { const s = await page.evaluate(ST).catch((e) => ({ error: String(e && e.message).slice(0, 160) })); out.steps.push({ label: l, state: s }); return s; };
  const clickSide = async (w) => { for (let i = 0; i < 20; i += 1) { const r = await page.evaluate((x) => { const els = Array.from(document.querySelectorAll(".page-group, .pageNum")); const h = els.find((el) => String(el.textContent || "").trim() === x && el.offsetParent); if (h) { try { h.click(); return true; } catch (e) {} } return false; }, w).catch(() => false); if (r) return true; await SLEEP(700); } return false; };

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await SLEEP(7000);
  await snap("initial");
  out.clickBack = await clickSide("背面");
  await SLEEP(3500);
  await snap("after-back");

  // 打开「多版设计」弹窗
  out.openDlg = await page.evaluate(() => {
    const el = document.querySelector(".pageWrapMulti li .hover-tips a.copy-template");
    if (!el) return { ok: false };
    try { el.click(); return { ok: true }; } catch (e) { return { ok: false, err: String(e && e.message).slice(0, 60) }; }
  }).catch(() => ({ ok: false }));
  await SLEEP(2500);
  out.dlgFields = await page.evaluate(() => {
    const g = (id) => { const e = document.getElementById(id); return e ? { v: e.value, vis: !!e.offsetParent, parentDisplay: e.parentElement ? getComputedStyle(e.parentElement).display : null } : null; };
    const lay = document.querySelector(".layui-layer");
    return { title: (function () { const t = document.querySelector(".layui-layer-title"); return t ? String(t.textContent || "").trim() : null; })(), modleNum: g("modleNum"), multiNum: g("multiNum"), copyMulti: (function () { const e = document.getElementById("copyMulti"); return e ? e.value : null; })(), layerContentVisible: lay ? String(lay.querySelector(".layui-layer-content") ? lay.querySelector(".layui-layer-content").textContent : "").replace(/\s+/g, " ").trim().slice(0, 200) : null };
  }).catch(() => ({}));

  // 正确填写：#modleNum=1（依据第1版）+ #multiNum=ADD（新增版数）→ 确定
  out.apply = await page.evaluate((add) => {
    const set = (el, v) => { const proto = HTMLInputElement.prototype; const s = Object.getOwnPropertyDescriptor(proto, "value").set; try { s.call(el, String(v)); } catch (e) { el.value = String(v); } el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
    const mn = document.getElementById("modleNum"), un = document.getElementById("multiNum");
    if (!mn || !un) return { ok: false, reason: "NO_INPUT" };
    set(mn, 1); set(un, add);
    const btns = Array.from(document.querySelectorAll(".layui-layer-btn a"));
    const ok = btns.find((b) => /确定/.test(String(b.textContent || "").trim()));
    if (!ok) return { ok: false, reason: "NO_OK", btns: btns.map((x) => String(x.textContent || "").trim()) };
    ok.click();
    return { ok: true, modleNum: 1, multiNum: add };
  }, ADD).catch((e) => ({ ok: false, err: String(e && e.message).slice(0, 100) }));
  await SLEEP(12000);
  await snap("after-multi-created");

  // 切到第 2 版
  out.switchV2 = await page.evaluate(() => {
    const lis = Array.from(document.querySelectorAll(".pageWrapMulti li"));
    if (lis.length < 2) return { ok: false, liCount: lis.length };
    try { lis[1].click(); return { ok: true }; } catch (e) { return { ok: false, err: String(e && e.message).slice(0, 60) }; }
  }).catch(() => ({ ok: false }));
  await SLEEP(5000);
  await snap("after-switch-v2");

  // 第 2 版内切背面
  out.v2Back = await clickSide("背面");
  await SLEEP(4000);
  await snap("v2-after-back");

  // 切回第 1 版
  out.switchV1 = await page.evaluate(() => {
    const lis = Array.from(document.querySelectorAll(".pageWrapMulti li"));
    if (!lis.length) return { ok: false };
    try { lis[0].click(); return { ok: true }; } catch (e) { return { ok: false }; }
  }).catch(() => ({ ok: false }));
  await SLEEP(4000);
  await snap("after-switch-v1");

  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error("FATAL " + String(e && e.message || e)); process.exit(1); });