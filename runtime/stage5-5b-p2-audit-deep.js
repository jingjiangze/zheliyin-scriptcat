// runtime/stage5-5b-p2-audit-deep.js — Stage 5.5B P2-A 第二轮：右侧原生 UI 深度审计
// 第一轮发现：.diyMain > div.rightPageBar.rightBar（右工具条 190px）+ .bg-material 抽屉（常用素材，隐藏时 x=1550）。
// 本轮（不猜 selector）：枚举 rightBar 子节点（工具按钮 title/class/rect）、全部右滑面板、
// 刷新稳定性对比、挂载候选取证（display/position/z-index/onclick 可观察属性）。
// 证据：runtime/reports/stage5-5b-p2-audit-deep-report.json + docs/evidence/stage-5.5b/
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EXT_ID = "ndcooeababalnlpkfedmmbbbgkljhpjf";
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";

(async () => {
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  const report = { ts: new Date().toISOString(), stage: "STAGE-5.5B-P2-A-AUDIT-DEEP", steps: [], errors: [] };
  const step = (n, ok, d, ev) => { report.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 2200), evidence: ev || "n/a" }); if (!ok) report.errors.push(n); };
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${scDir}`, `--load-extension=${scDir}`],
      viewport: { width: 1440, height: 900 }
    });
    const page = browser.pages()[0];
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const deadline = Date.now() + 150000;
    let ready = false;
    while (Date.now() < deadline) {
      ready = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        return !!(ctx && ctx.defined && ctx.defined.CanvasObjVO);
      }).catch(() => false);
      if (ready) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    step("editor-ready", ready === true, "", "EDITOR_READY");

    async function collect() {
      return page.evaluate(() => {
        const out = { rail: null, railChildren: [], drawers: [], mountCandidates: [], ourPanel: !!document.getElementById("zy-card-assistant") };
        const rightBar = document.querySelector(".rightPageBar.rightBar") || document.querySelector(".rightBar");
        if (rightBar) {
          const rr = rightBar.getBoundingClientRect();
          out.rail = { tag: rightBar.tagName.toLowerCase(), cls: String(rightBar.className || "").slice(0, 80), id: rightBar.id || null, rect: { l: Math.round(rr.left), w: Math.round(rr.width), h: Math.round(rr.height) } };
          rightBar.children && Array.prototype.forEach.call(rightBar.children, (el) => {
            const r = el.getBoundingClientRect();
            out.railChildren.push({
              tag: el.tagName.toLowerCase(),
              cls: String(el.className || "").slice(0, 60),
              id: el.id || null,
              title: (el.getAttribute("title") || "").slice(0, 40),
              text: (el.textContent || "").trim().slice(0, 24),
              rect: { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
            });
          });
        }
        // 右滑面板：视口右侧隐藏/可见的较大容器
        document.querySelectorAll("div").forEach((el) => {
          const r = el.getBoundingClientRect();
          const text = (el.textContent || "").trim().slice(0, 30);
          const isDrawer = r.width > 200 && r.height > 150 && r.left > 1200 && /素材|图层|属性|模板|文本|样式|设置|识别|背景|工具/.test(text + " " + String(el.className || ""));
          if (isDrawer) {
            out.drawers.push({
              cls: String(el.className || "").slice(0, 80),
              id: el.id || null,
              text: text,
              rect: { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
              visible: el.offsetParent !== null,
              display: getComputedStyle(el).display,
              position: getComputedStyle(el).position,
              z: getComputedStyle(el).zIndex
            });
          }
        });
        // 深度 3 内的稳定右上侧容器（可作为我们挂载的锚点候选）
        function walk(el, depth) {
          if (!el || depth > 3) return;
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          if (r.width > 150 && r.height > 200 && r.left > 1000 && cs.position !== "static" && cs.display !== "none" && r.right <= window.innerWidth + 5 && r.right >= 0) {
            out.mountCandidates.push({ cls: String(el.className || "").slice(0, 80), id: el.id || null, rect: { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }, position: cs.position, z: cs.zIndex });
          }
          Array.prototype.forEach.call(el.children, (c) => walk(c, depth + 1));
        }
        walk(document.body.children[0] || document.body, 0);
        // 去重
        const seen = new Set();
        out.drawers = out.drawers.filter((d) => { const k = d.cls + "|" + d.rect.l; if (seen.has(k)) return false; seen.add(k); return true; });
        return out;
      }).catch((e) => ({ __err: String(e && e.message || e) }));
    }

    const c1 = await collect();
    step("audit-round1", c1 && !c1.__err, JSON.stringify(c1), "NATIVE_RIGHT_UI");

    // 刷新稳定性：reload 后再收一次，对比 rightBar 存在性 + drawers 数量
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const d2 = Date.now() + 90000;
    let c2 = null;
    while (Date.now() < d2) {
      const ready2 = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        return !!(ctx && ctx.defined && ctx.defined.CanvasObjVO);
      }).catch(() => false);
      if (ready2) { c2 = await collect(); break; }
      await new Promise((r) => setTimeout(r, 2000));
    }
    const stable = !!(c2 && c2.rail) && !!(c1 && c1.rail) && String(c2.rail.cls) === String(c1.rail.cls);
    step("audit-round2-stable", stable === true, "round1.rail=" + JSON.stringify(c1 && c1.rail) + " round2.rail=" + JSON.stringify(c2 && c2.rail) + " drawers1=" + (c1 ? c1.drawers.length : -1) + " drawers2=" + (c2 ? c2.drawers.length : -1), "REFRESH_STABILITY");
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 600));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  const reportPath = path.join(__dirname, "reports", "stage5-5b-p2-audit-deep-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 1), "utf8");
  fs.copyFileSync(reportPath, path.join(__dirname, "..", "docs", "evidence", "stage-5.5b", "stage5-5b-p2-audit-deep-report.json"));
  console.log("[zy-p2-deep] errors=" + report.errors.length + " → " + reportPath);
  process.exit(report.errors.length ? 1 : 0);
})();