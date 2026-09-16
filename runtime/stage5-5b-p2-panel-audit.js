// runtime/stage5-5b-p2-panel-audit.js — Stage 5.5B P2：折立印网页右侧原生面板 DOM 审计（§14-§16）
// 目标：不做任何假设，记录编辑器右侧可嵌入区域（现有助手/属性/工具栏 panel）的真实选择器与层级。
// 只读审计：不注入任何 UI，仅枚举候选容器。
// 证据：runtime/reports/stage5-5b-p2-panel-audit-report.json + docs/evidence/stage-5.5b/
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EXT_ID = "ndcooeababalnlpkfedmmbbbgkljhpjf";
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";

(async () => {
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  const report = { ts: new Date().toISOString(), stage: "STAGE-5.5B-P2-AUDIT", steps: [], errors: [] };
  const step = (n, ok, d, ev) => { report.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 1500), evidence: ev || "n/a" }); if (!ok) report.errors.push(n); };
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${scDir}`, `--load-extension=${scDir}`],
      viewport: { width: 1440, height: 900 }
    });
    step("launch+scriptcat", true, "", "REAL_SCRIPT_CAT_EXTENSION");
    const page = browser.pages()[0];
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => step("nav-editor", false, String(e && e.message || e)));
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => step("reload-editor", false, String(e && e.message || e)));
    // 等编辑器基本就绪（requirejs CanvasObjVO 出现）
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
    step("editor-ready", ready === true, "CanvasObjVO defined", "EDITOR_READY");

    // ---- 右侧面板候选容器枚举 ----
    const audit = await page.evaluate(() => {
      const W = window.innerWidth;
      const out = [];
      const seen = new Set();
      function elPath(el) {
        const parts = [];
        let cur = el;
        let depth = 0;
        while (cur && cur.tagName && depth < 6) {
          let sel = cur.tagName.toLowerCase();
          if (cur.id) sel += "#" + cur.id;
          else {
            const cls = Array.prototype.slice.call(cur.classList || []).slice(0, 3).join(".");
            if (cls) sel += "." + cls;
          }
          parts.unshift(sel);
          cur = cur.parentElement;
          depth += 1;
        }
        return parts.join(" > ");
      }
      function collect(el, depth) {
        if (!el || depth > 3 || seen.has(el)) return;
        seen.add(el);
        const rect = el.getBoundingClientRect();
        const text = (el.textContent || "").trim().slice(0, 60);
        const looksPanel =
          rect.width > 200 && rect.height > 150 &&
          (rect.left > W - 700) && rect.bottom <= window.innerHeight && // 靠右且未超出可视高度
          /助手|页面|图层|模板|属性|素材|文本|背景|设置|样式/i.test(text);
        if (looksPanel) {
          out.push({
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            cls: Array.prototype.slice.call(el.classList || []).slice(0, 6).join(" ").slice(0, 120) || null,
            rect: { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
            text: text.slice(0, 60),
            path: elPath(el),
            visible: el.offsetParent !== null
          });
        }
        for (const child of el.children) collect(child, depth + 1);
      }
      collect(document.body, 0);
      // 额外：常见右栏 id/class 探测
      const probes = ["#rightPanel", ".rightBar", ".content_right", "#right-panel", ".right-panel", ".layui-layer", "#jsRight", ".diyRight", "#sidePanel", ".side-panel"];
      const foundProbes = probes.filter((s) => { try { return document.querySelector(s); } catch (e) { return false; } }).map((s) => {
        const el = document.querySelector(s);
        const r = el.getBoundingClientRect();
        return { sel: s, rect: { left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) }, text: (el.textContent || "").trim().slice(0, 40) };
      });
      // 当前我们浮窗是否还在（P2 对比基线）与原生面板数量
      return { innerWidth: W, candidates: out, foundProbes: foundProbes, ourFloatingPanel: !!document.getElementById("zy-card-assistant"), bodyChildren: document.body.children.length };
    });
    step("panel-audit", audit && audit.candidates.length > 0, JSON.stringify(audit && { innerWidth: audit.innerWidth, candidates: audit.candidates.slice(0, 8), foundProbes: audit.foundProbes, bodyChildren: audit.bodyChildren }), "NATIVE_PANEL_DOM");
    // SPA 稳定性：记录候选容器数量（刷新后重测交给后续阶段；本次仅在当前 route 取证）
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 600));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  const reportPath = path.join(__dirname, "reports", "stage5-5b-p2-panel-audit-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 1), "utf8");
  fs.copyFileSync(reportPath, path.join(__dirname, "..", "docs", "evidence", "stage-5.5b", "stage5-5b-p2-panel-audit-report.json"));
  console.log("[zy-p2-audit] errors=" + report.errors.length + " → " + reportPath);
  process.exit(report.errors.length ? 1 : 0);
})();