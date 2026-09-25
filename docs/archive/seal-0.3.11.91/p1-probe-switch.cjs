// 第五轮探测：确定切版点击目标（.page-group[全局索引] vs li）+ 各版对象隔离读法
"use strict";
const path = require("path");
const { chromium } = require("D:/zheliyin-scriptcat/node_modules/playwright");
const ROOT = "D:/zheliyin-scriptcat";
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const probeMod = require(path.join(ROOT, "runtime", "stage9", "session-probe"));
const URL = process.env.ZY_URL || "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";

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
    return {
      curNum: CV ? CV.currentCanvasNum : null,
      totalLen: CV && CV.totalCanvasArray ? CV.totalCanvasArray.length : null,
      groupCurIdx: (function () { const g = document.querySelector(".pageWrapMulti .page-group.current"); return g ? Array.from(document.querySelectorAll(".pageWrapMulti .page-group")).indexOf(g) : null; })(),
      groupTexts: Array.from(document.querySelectorAll(".pageWrapMulti .page-group")).map((g) => ({ t: String(g.textContent || "").trim(), cur: g.classList.contains("current"), visible: !!g.offsetParent })),
      currentLiIdx: (function () { const x = document.querySelector(".pageWrapMulti li.currentLi"); return x ? Array.from(document.querySelectorAll(".pageWrapMulti li")).indexOf(x) : null; })(),
      liCls: Array.from(document.querySelectorAll(".pageWrapMulti li")).map((l) => String(l.className || "")),
      shownCanvas: Array.from(document.querySelectorAll(".canvas-container")).map((c, i) => ({ i, display: getComputedStyle(c).display, hasCurrent: !!c.querySelector(".diyCanvas") })),
      visibleCanvasIds: Array.from(document.querySelectorAll(".diyCanvas")).filter((c) => c.offsetParent).map((c) => c.id)
    };
  } catch (e) { return { error: String(e && e.message || e).slice(0, 160) }; }
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
  const out = { steps: [] };
  const snap = async (l) => { const s = await page.evaluate(ST).catch((e) => ({ error: String(e && e.message).slice(0, 160) })); out.steps.push({ label: l, state: s }); return s; };

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await SLEEP(7000);
  // 背面（materialize c1）
  for (let i = 0; i < 20; i += 1) { const r = await page.evaluate(() => { const h = Array.from(document.querySelectorAll(".page-group, .pageNum")).find((e) => String(e.textContent || "").trim() === "背面" && e.offsetParent); if (h) { h.click(); return true; } return false; }).catch(() => false); if (r) break; await SLEEP(700); }
  await SLEEP(3500);
  await snap("after-back");
  // 开多版：modleNum=1 + multiNum=1
  await page.evaluate(() => { const el = document.querySelector(".pageWrapMulti li .hover-tips a.copy-template"); if (el) el.click(); }).catch(() => {});
  await SLEEP(2500);
  await page.evaluate(() => {
    const set = (el, v) => { const p = HTMLInputElement.prototype; const s = Object.getOwnPropertyDescriptor(p, "value").set; try { s.call(el, String(v)); } catch (e) { el.value = String(v); } el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
    const mn = document.getElementById("modleNum"), un = document.getElementById("multiNum");
    if (mn) set(mn, 1); if (un) set(un, 1);
    const ok = Array.from(document.querySelectorAll(".layui-layer-btn a")).find((b) => /确定/.test(String(b.textContent || "").trim()));
    if (ok) ok.click();
  }).catch(() => {});
  await SLEEP(12000);
  await snap("multi-created");

  // A) 点 .page-group[2]（第2版正面）
  out.clickGroup2 = await page.evaluate(() => {
    const gs = Array.from(document.querySelectorAll(".pageWrapMulti .page-group"));
    if (gs.length < 3) return { ok: false, len: gs.length };
    try { gs[2].click(); return { ok: true, text: String(gs[2].textContent || "").trim() }; } catch (e) { return { ok: false, err: String(e && e.message).slice(0, 60) }; }
  }).catch(() => ({ ok: false }));
  await SLEEP(5000);
  await snap("after-click-group2");

  // B) 若 A 无效，试 jQuery trigger（源码走 jQuery 委托）
  out.jqGroup2 = await page.evaluate(() => {
    const jq = window.jQuery || window.$;
    const gs = Array.from(document.querySelectorAll(".pageWrapMulti .page-group"));
    if (!jq || gs.length < 3) return { ok: false, hasJq: !!jq, len: gs.length };
    try { jq(gs[2]).trigger("click"); return { ok: true }; } catch (e) { return { ok: false, err: String(e && e.message).slice(0, 60) }; }
  }).catch(() => ({ ok: false }));
  await SLEEP(5000);
  await snap("after-jq-group2");

  // C) 点第2版 li 内的 page-group（作用域内）
  out.clickInLi2 = await page.evaluate(() => {
    const lis = Array.from(document.querySelectorAll(".pageWrapMulti li"));
    if (lis.length < 2) return { ok: false };
    const g = lis[1].querySelector(".page-group");
    if (!g) return { ok: false, reason: "NO_GROUP" };
    try { g.click(); return { ok: true, text: String(g.textContent || "").trim() }; } catch (e) { return { ok: false, err: String(e && e.message).slice(0, 60) }; }
  }).catch(() => ({ ok: false }));
  await SLEEP(5000);
  await snap("after-click-in-li2");

  // D) 点第2版 .pageNum
  out.clickNum2 = await page.evaluate(() => {
    const nums = Array.from(document.querySelectorAll(".pageWrapMulti .pageNum"));
    const t = nums.find((n) => /第2版/.test(String(n.textContent || "")));
    if (!t) return { ok: false, nums: nums.map((n) => String(n.textContent || "").trim()) };
    try { t.click(); return { ok: true }; } catch (e) { return { ok: false, err: String(e && e.message).slice(0, 60) }; }
  }).catch(() => ({ ok: false }));
  await SLEEP(5000);
  await snap("after-click-num2");

  // E) 试试 canvas 容器点击（.canvasWrap 上第2版画布）
  out.clickCanvasWrap = await page.evaluate(() => {
    const conts = Array.from(document.querySelectorAll(".canvas-container"));
    const target = conts.find((c, i) => i === 1) || conts[1];
    if (!target) return { ok: false, count: conts.length };
    const cv = target.querySelector("canvas.upper-canvas") || target.querySelector("canvas");
    if (!cv) return { ok: false, reason: "NO_CANVAS" };
    try { cv.click(); return { ok: true, idx: 1 }; } catch (e) { return { ok: false, err: String(e && e.message).slice(0, 60) }; }
  }).catch(() => ({ ok: false }));
  await SLEEP(5000);
  await snap("after-click-canvas-container1");

  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error("FATAL " + String(e && e.message || e)); process.exit(1); });