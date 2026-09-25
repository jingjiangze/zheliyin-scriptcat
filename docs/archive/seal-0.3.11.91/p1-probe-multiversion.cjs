// P1 前置：真机探测多版结构（只读探测 + 按站点要求序列开启多版）
// 序列（用户指定 + 站点源码硬约束）：先点「背面」materialize c1 → 再点「多版设计」→ 输入版数 → 确定
// 探测：CanvasObjVO.multiCanvas / totalCanvasArray 布局（每版是否占 2 个条目）/ currentCanvasNum /
//       DOM .pageWrapMulti li × .page-group 结构 / 切版后 currentCanvasNum 变化
// 说明：开启多版会新增版（每次 goto 重载即丢弃，不保存）；不做任何对象删除/改动。
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("D:/zheliyin-scriptcat/node_modules/playwright");
const ROOT = "D:/zheliyin-scriptcat";
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const probeMod = require(path.join(ROOT, "runtime", "stage9", "session-probe"));
const URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const VERSIONS = Number(process.env.ZY_MV_COUNT || 2);

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

const READ_STATE = () => {
  try {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const CV = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO || null;
    const unwrap = (e) => { try { return (e && e.canvas) || e; } catch (x) { return null; } };
    const total = CV && Array.isArray(CV.totalCanvasArray) ? CV.totalCanvasArray : [];
    const pages = total.map((e, i) => {
      const c = unwrap(e);
      let objs = null, texts = [];
      try { if (c && c.getObjects) { const os = c.getObjects(); objs = os.length; texts = os.filter((o) => o && /text|i-text|textbox/.test(String(o.type))).map((o) => String(o.text || "").slice(0, 14)).slice(0, 4); } } catch (x) {}
      return { i, idName: e && e.idName ? String(e.idName) : null, isMultiCanvasDiy: !!(e && e.canvas && typeof e.drawText === "function"), drawText: !!(e && typeof e.drawText === "function"), objCount: objs, texts, w: c ? (c.width || (c.getWidth && c.getWidth())) : null, h: c ? (c.height || (c.getHeight && c.getHeight())) : null };
    });
    const domLi = Array.from(document.querySelectorAll(".pageWrapMulti li")).map((li, i) => ({
      i, id: li.id || null, cls: String(li.className || ""),
      pageNumText: (li.querySelector(".pageNum") ? String(li.querySelector(".pageNum").textContent || "").trim() : null),
      groups: Array.from(li.querySelectorAll(".page-group")).map((g) => String(g.textContent || "").trim()),
      hasCopyTemplate: !!li.querySelector("a.copy-template"),
      hasDel: !!li.querySelector("a.del-first")
    }));
    return {
      CanvasObjVO: CV ? { multiCanvas: CV.multiCanvas === true, currentCanvasNum: CV.currentCanvasNum, canvasPagesNum: CV.canvasPagesNum, totalLen: total.length } : null,
      pages,
      dom: {
        pageWrapLen: document.querySelectorAll(".pageWrap").length,
        pageWrapMultiLen: document.querySelectorAll(".pageWrapMulti").length,
        pageWrapMultiLi: domLi,
        currentLiIdx: (function () { const li = document.querySelector(".pageWrapMulti li.currentLi"); return li ? Array.from(document.querySelectorAll(".pageWrapMulti li")).indexOf(li) : null; })(),
        currentGroupIdxGlobal: (function () { const g = document.querySelector(".pageWrapMulti .page-group.current"); return g ? Array.from(document.querySelectorAll(".pageWrapMulti .page-group")).indexOf(g) : null; })(),
        groupsGlobal: Array.from(document.querySelectorAll(".pageWrapMulti .page-group")).map((g, i) => ({ i, text: String(g.textContent || "").trim(), current: g.classList.contains("current") })),
        dialogOpen: !!document.querySelector(".layui-layer"),
        dialogTitle: (function () { const t = document.querySelector(".layui-layer-title"); return t ? String(t.textContent || "").trim() : null; })()
      }
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
  const msgs = [];
  browser.on("dialog", (d) => { msgs.push("DIALOG " + String(d.message()).slice(0, 120)); try { d.accept().catch(() => {}); } catch (e) {} });
  const page = browser.pages()[0];
  page.on("pageerror", (e) => msgs.push("PAGEERR " + String(e && e.message || e).slice(0, 160)));
  for (const c of parseCookies(sess.raw)) { try { await browser.addCookies([c]); } catch (e) {} }
  const out = { cookieSource: sess.source, versions: VERSIONS, steps: [], layerMsgs: msgs };
  const snap = async (label) => { const s = await page.evaluate(READ_STATE).catch((e) => ({ error: String(e && e.message).slice(0, 160) })); out.steps.push({ label, state: s }); return s; };

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await SLEEP(7000);
  await snap("initial");

  // 1) 先打开背面（materialize c1）—— 站点硬约束
  const clickSide = async (w) => {
    for (let i = 0; i < 20; i += 1) {
      const r = await page.evaluate((x) => {
        const els = Array.from(document.querySelectorAll(".page-group, .pageNum"));
        const h = els.find((el) => String(el.textContent || "").trim() === x && el.offsetParent);
        if (h) { try { h.click(); return true; } catch (e) {} }
        return false;
      }, w).catch(() => false);
      if (r) return true;
      await SLEEP(700);
    }
    return false;
  };
  out.clickBack = await clickSide("背面");
  await SLEEP(3500);
  await snap("after-click-back");

  // 2) 点「多版设计」
  const openMulti = await page.evaluate(() => {
    const cands = Array.from(document.querySelectorAll("a.copy-template, .hover-tips a, .operate-lists a"));
    const hit = cands.find((el) => /多版设计|增加设计/.test(String(el.textContent || "").trim()));
    if (!hit) return { clicked: false, cands: cands.map((e) => String(e.textContent || "").trim()).slice(0, 12) };
    try { hit.click(); } catch (e) { return { clicked: false, err: String(e && e.message).slice(0, 80) }; }
    return { clicked: true, text: String(hit.textContent || "").trim(), cls: String(hit.className || "") };
  }).catch((e) => ({ clicked: false, err: String(e && e.message).slice(0, 100) }));
  out.step2_openMulti = openMulti;
  await SLEEP(2500);
  await snap("after-open-multi-dialog");

  // 3) 检查弹窗内输入框并填版数
  const dlg = await page.evaluate(() => {
    const lay = document.querySelector(".layui-layer");
    const inputs = Array.from(document.querySelectorAll("#copyTemplate input, .layui-layer input"));
    const btn = Array.from(document.querySelectorAll(".layui-layer .layui-layer-btn a, .layui-layer-btn a"));
    return {
      hasLayer: !!lay,
      title: (function () { const t = document.querySelector(".layui-layer-title"); return t ? String(t.textContent || "").trim() : null; })(),
      inputs: inputs.map((i) => ({ id: i.id || null, name: i.name || null, type: i.type, value: i.value, visible: i.offsetParent !== null })),
      btns: btn.map((b) => String(b.textContent || "").trim()),
      copyMultiVal: (function () { const c = document.getElementById("copyMulti"); return c ? c.value : null; })()
    };
  }).catch((e) => ({ err: String(e && e.message).slice(0, 150) }));
  out.step3_dialog = dlg;

  // 4) 填版数 + 确定
  const apply = await page.evaluate((v) => {
    const cand = ["#modleNum", "#multiNum"].map((s) => document.querySelector(s)).filter(Boolean);
    const el = cand.find((e) => e.offsetParent !== null) || cand[0];
    if (!el) return { ok: false, reason: "NO_INPUT" };
    const proto = window.HTMLInputElement && HTMLInputElement.prototype;
    const setter = proto && Object.getOwnPropertyDescriptor(proto, "value").set;
    try { setter.call(el, String(v)); } catch (e) { el.value = String(v); }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    const btns = Array.from(document.querySelectorAll(".layui-layer .layui-layer-btn a, .layui-layer-btn a"));
    const ok = btns.find((b) => /确定|确认/.test(String(b.textContent || "").trim()));
    if (!ok) return { ok: false, reason: "NO_OK_BTN", btns: btns.map((b) => String(b.textContent || "").trim()) };
    try { ok.click(); } catch (e) { return { ok: false, err: String(e && e.message).slice(0, 80) }; }
    return { ok: true, inputId: el.id || null, setTo: String(v) };
  }, VERSIONS).catch((e) => ({ ok: false, err: String(e && e.message).slice(0, 120) }));
  out.step4_apply = apply;
  await SLEEP(9000);
  await snap("after-multi-created");

  // 5) 切到第 2 版（点击 .pageWrapMulti li[1]）
  const switchV = await page.evaluate(() => {
    const lis = Array.from(document.querySelectorAll(".pageWrapMulti li"));
    if (lis.length < 2) return { ok: false, liCount: lis.length };
    try { lis[1].click(); return { ok: true, clickedIdx: 1 }; } catch (e) { return { ok: false, err: String(e && e.message).slice(0, 80) }; }
  }).catch((e) => ({ ok: false, err: String(e && e.message).slice(0, 100) }));
  out.step5_switchV2 = switchV;
  await SLEEP(4500);
  await snap("after-switch-to-v2");

  // 6) 切回第 1 版
  const switchV1 = await page.evaluate(() => {
    const lis = Array.from(document.querySelectorAll(".pageWrapMulti li"));
    if (!lis.length) return { ok: false };
    try { lis[0].click(); return { ok: true }; } catch (e) { return { ok: false, err: String(e && e.message).slice(0, 80) }; }
  }).catch(() => ({ ok: false }));
  out.step6_switchV1 = switchV1;
  await SLEEP(4000);
  await snap("after-switch-back-v1");

  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error("FATAL " + String(e && e.message || e)); process.exit(1); });