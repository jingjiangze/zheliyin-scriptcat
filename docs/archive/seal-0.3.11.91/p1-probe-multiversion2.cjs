// 第二轮探测：找真正"开启多版"的入口 + 读隐藏输入(typeid/copyMulti/isMaster/maxPage 等) + li 操作按钮全清单
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
    const total = CV && Array.isArray(CV.totalCanvasArray) ? CV.totalCanvasArray : [];
    return {
      multiCanvas: CV ? CV.multiCanvas === true : null,
      currentCanvasNum: CV ? CV.currentCanvasNum : null,
      totalLen: total.length,
      idNames: total.map((e) => (e && e.idName) || null),
      liCount: document.querySelectorAll(".pageWrapMulti li").length,
      liInfo: Array.from(document.querySelectorAll(".pageWrapMulti li")).map((li, i) => ({
        i, cls: String(li.className || ""),
        pageNum: (li.querySelector(".pageNum") ? String(li.querySelector(".pageNum").textContent || "").trim() : null),
        groups: Array.from(li.querySelectorAll(".page-group")).map((g) => String(g.textContent || "").trim()),
        ops: Array.from(li.querySelectorAll(".hover-tips a, .operate-lists a")).map((a2) => ({ cls: String(a2.className || ""), text: String(a2.textContent || "").trim() }))
      })),
      groupsGlobal: Array.from(document.querySelectorAll(".pageWrapMulti .page-group")).map((g, i) => ({ i, text: String(g.textContent || "").trim(), cur: g.classList.contains("current") })),
      currentLiIdx: (function () { const li = document.querySelector(".pageWrapMulti li.currentLi"); return li ? Array.from(document.querySelectorAll(".pageWrapMulti li")).indexOf(li) : null; })(),
      hidden: (function () {
        const ids = ["typeid", "diyTypeNum", "pageCount", "copyMulti", "multiNum", "modleNum", "isMaster", "maxPage", "renderFlag", "afterFileName", "pageNum", "isNoSave", "isYingYongBtn", "designerGoodsId", "isMoreCanvasMode"];
        const o = {};
        ids.forEach((k) => { const el = document.getElementById(k); o[k] = el ? { tag: el.tagName, type: el.type || null, value: String(el.value == null ? "" : el.value).slice(0, 40), hidden: el.type === "hidden" || el.offsetParent === null } : null; });
        return o;
      })(),
      wrapHtml: (function () { const w = document.querySelector(".pageWrapMulti"); return w ? String(w.outerHTML).replace(/\s+/g, " ").slice(0, 1400) : null; })()
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
  const out = { steps: [] };
  const snap = async (l) => { const s = await page.evaluate(ST).catch((e) => ({ error: String(e && e.message).slice(0, 160) })); out.steps.push({ label: l, state: s }); return s; };
  const clickSide = async (w) => { for (let i = 0; i < 20; i += 1) { const r = await page.evaluate((x) => { const els = Array.from(document.querySelectorAll(".page-group, .pageNum")); const h = els.find((el) => String(el.textContent || "").trim() === x && el.offsetParent); if (h) { try { h.click(); return true; } catch (e) {} } return false; }, w).catch(() => false); if (r) return true; await SLEEP(700); } return false; };
  const clickLiOp = async (idx, cls) => page.evaluate((a) => {
    const lis = Array.from(document.querySelectorAll(".pageWrapMulti li"));
    const li = lis[a.idx];
    if (!li) return { ok: false, liCount: lis.length };
    const el = li.querySelector("a." + a.cls);
    if (!el) return { ok: false, reason: "NO_BTN", ops: Array.from(li.querySelectorAll(".hover-tips a")).map((x) => String(x.className)) };
    try { el.click(); return { ok: true, text: String(el.textContent || "").trim() }; } catch (e) { return { ok: false, err: String(e && e.message).slice(0, 80) }; }
  }, { idx, cls }).catch((e) => ({ ok: false, err: String(e && e.message).slice(0, 100) }));

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await SLEEP(7000);
  await snap("initial");
  out.clickBack = await clickSide("背面");
  await SLEEP(3500);
  const s2 = await snap("after-back");

  // 尝试 1：点「复制」(copy-bg)
  out.try_copyBg = await clickLiOp(0, "copy-bg");
  await SLEEP(9000);
  await snap("after-copyBg");

  // 尝试 2：若上面有确认弹窗（layer.confirm），点确定
  out.copyConfirm = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll(".layui-layer-btn a"));
    const ok = btns.find((b) => /确定|确认/.test(String(b.textContent || "").trim()));
    if (ok && ok.offsetParent) { ok.click(); return { clicked: true, btns: btns.map((x) => String(x.textContent || "").trim()) }; }
    return { clicked: false, btns: btns.map((x) => String(x.textContent || "").trim()) };
  }).catch(() => ({ clicked: false }));
  await SLEEP(9000);
  await snap("after-copyConfirm");

  // 尝试 3：多版设计弹窗，输入 2
  out.try_multi = await clickLiOp(0, "copy-template");
  await SLEEP(2500);
  out.multiDialog = await page.evaluate(() => {
    const t = document.querySelector(".layui-layer-title");
    return { title: t ? String(t.textContent || "").trim() : null, modleNum: (function () { const e = document.getElementById("modleNum"); return e ? { v: e.value, vis: e.offsetParent !== null } : null; })(), multiNum: (function () { const e = document.getElementById("multiNum"); return e ? { v: e.value, vis: e.offsetParent !== null } : null; })() };
  }).catch(() => ({}));
  out.multiApply = await page.evaluate(() => {
    const el = document.getElementById("modleNum");
    if (!el) return { ok: false };
    const proto = HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    try { setter.call(el, "2"); } catch (e) { el.value = "2"; }
    el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
    const btns = Array.from(document.querySelectorAll(".layui-layer-btn a"));
    const ok = btns.find((b) => /确定/.test(String(b.textContent || "").trim()));
    if (!ok) return { ok: false, reason: "NO_OK" };
    ok.click(); return { ok: true };
  }).catch(() => ({ ok: false }));
  await SLEEP(4000);
  out.afterMultiLayerMsg = await page.evaluate(() => {
    const m = Array.from(document.querySelectorAll(".layui-layer-msg, .layui-layer-content")).map((e) => String(e.textContent || "").trim()).filter(Boolean).slice(0, 5);
    const dlgOpen = !!document.querySelector(".layui-layer");
    const title = (function () { const t = document.querySelector(".layui-layer-title"); return t ? String(t.textContent || "").trim() : null; })();
    return { msgs: m, dlgOpen, title };
  }).catch(() => ({}));
  await SLEEP(7000);
  await snap("after-multi-apply2");

  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error("FATAL " + String(e && e.message || e)); process.exit(1); });