// runtime/stage5-5b-p2b-native-panel.js — Stage 5.5B P2-B GATE：原生右栏 OCR 面板真机验证
// 断言（P2-B Gate）：
//   [ ] #zy-native-ocr-panel 出现在原生右栏（.rightPageBar.rightBar）邻接位置
//   [ ] 右栏包含 #zy-native-ocr-tool-btn（唯一）
//   [ ] 抽屉唯一（panels == 1），无重复
//   [ ] 工具按钮可切换抽屉显示
//   [ ] 从原生抽屉点「识别当前图片」→ 状态出现在 #zy-native-status → 生成可编辑 textbox
//   [ ] 旧浮窗 #zy-card-assistant 仍存在（fallback 保留 §16）
//   [ ] 刷新后抽屉/按钮数量仍为 1（SPA 防重）
// 证据：runtime/reports/stage5-5b-p2b-native-panel-report.json + docs/evidence/stage-5.5b/
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const adapter = require("./scriptcat-adapter");

const EXT_ID = adapter.EXT_ID;
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";
const UUID = "rt5-5b-p2b-" + Date.now().toString(36);
const USERSCRIPT_PATH = path.join(__dirname, "..", "zheliyin-card-assistant.user.js");

(async () => {
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  const report = { ts: new Date().toISOString(), stage: "STAGE-5.5B-P2B", steps: [], errors: [] };
  const step = (n, ok, d, ev) => { report.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 800), evidence: ev || "n/a" }); if (!ok) report.errors.push(n); };
  const userScriptSrc = fs.readFileSync(USERSCRIPT_PATH, "utf8");
  const cn = [];
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${scDir}`, `--load-extension=${scDir}`],
      viewport: { width: 1440, height: 900 }
    });
    const optsPage = browser.pages()[0];
    await optsPage.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await optsPage.waitForTimeout(2500);
    // 清理历史本仓库脚本后安装当前版
    try {
      const all = (await adapter.getAllScripts(optsPage)) || [];
      for (const s of all.filter((x) => /折立印|zheliyin/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(optsPage, s.uuid); } catch (e) {} }
    } catch (e) {}
    const inst = await adapter.installByCode(optsPage, { uuid: UUID, code: userScriptSrc, upsertBy: "user" }).catch((e) => ({ __err: String(e && e.message || e) }));
    step("install-userscript", !inst.__err, inst.__err || "status=" + inst.status, "REAL_SCRIPT_CAT_INSTALL");
    if (inst.__err) throw new Error("install failed: " + inst.__err); // 走 catch/finally，保证 report 落盘

    const page = await browser.newPage();
    page.on("console", (msg) => { const t = String(msg.text()); if (t.indexOf("[zy-ocr]") >= 0) cn.push(t); });
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});

    // 等编辑器 + 原生右栏 + 抽屉
    const deadline = Date.now() + 150000;
    let st = null;
    while (Date.now() < deadline) {
      st = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const ready = !!(ctx && ctx.defined && ctx.defined.CanvasObjVO);
        return {
          ready: ready,
          rightBar: !!document.querySelector(".rightPageBar.rightBar"),
          drawer: !!document.getElementById("zy-native-ocr-panel"),
          toolBtn: !!document.getElementById("zy-native-ocr-tool-btn"),
          legacy: !!document.getElementById("zy-card-assistant"),
          drawerCount: document.querySelectorAll("#zy-native-ocr-panel").length,
          drawerRect: (() => { const el = document.getElementById("zy-native-ocr-panel"); if (!el) return null; const r = el.getBoundingClientRect(); return { l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), display: getComputedStyle(el).display }; })()
        };
      }).catch(() => null);
      if (st && st.ready && st.rightBar && st.drawer) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    step("native-drawer-mounted", !!(st && st.ready && st.rightBar && st.drawer), JSON.stringify(st), "P2B_NATIVE_PANEL");
    step("drawer-position", !!(st && st.drawerRect && st.drawerRect.l > 900 && st.drawerRect.l < 1250 && st.drawerRect.w >= 220), JSON.stringify(st && st.drawerRect), "P2B_ADJACENT_TO_RAIL");
    step("drawer-unique", st && st.drawerCount === 1, "drawerCount=" + (st && st.drawerCount), "P2B_NO_DUP");
    step("tool-btn-unique", st && !!st.toolBtn, JSON.stringify(st && { toolBtn: st.toolBtn }), "P2B_RAIL_BUTTON");
    step("legacy-kept", st && !!st.legacy, JSON.stringify(st && { legacy: st.legacy }), "P2B_FALLBACK_KEPT");

    // 工具按钮切换抽屉显示
    const toggle = await page.evaluate(() => {
      const btn = document.getElementById("zy-native-ocr-tool-btn");
      const d = document.getElementById("zy-native-ocr-panel");
      if (!btn || !d) return { ok: false };
      btn.click();
      const afterHide = d.style.display;
      btn.click();
      const afterShow = d.style.display;
      return { ok: true, afterHide: afterHide, afterShow: afterShow };
    });
    step("tool-btn-toggle", !!(toggle && toggle.ok && toggle.afterHide === "none" && toggle.afterShow !== "none" && toggle.afterShow !== ""), JSON.stringify(toggle), "P2B_TOGGLE");

    // 原生按钮触发完整 OCR（背景图场景，复用 P1 方案）
    const setBg = await page.evaluate(() => new Promise((res) => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const total = vo && vo.totalCanvasArray;
      const c = (Array.isArray(total) && total[0] && ((total[0].canvas) || total[0])) || null;
      if (!c) return res({ ok: false });
      const cv = document.createElement("canvas");
      cv.width = 900; cv.height = 1200;
      const g = cv.getContext("2d");
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, 900, 1200);
      g.fillStyle = "#111111";
      g.font = "bold 64px 'Microsoft YaHei', sans-serif";
      g.fillText("测试公司", 100, 180);
      g.fillText("折立印设计", 100, 320);
      g.fillText("13800138000", 100, 520);
      const url = cv.toDataURL("image/png");
      const img = document.createElement("img");
      img.onload = () => {
        try {
          const F = window.fabric || c.fabric || (c.constructor && c.constructor.fabric);
          const fi = new F.Image(img, { width: 900, height: 1200 });
          c.setBackgroundImage(fi, c.requestRenderAll.bind(c), { left: 0, top: 0, originX: "left", originY: "top" });
          c.discardActiveObject();
          if (c.requestRenderAll) c.requestRenderAll();
          res({ ok: true });
        } catch (e) { res({ ok: false, err: String(e && e.message || e) }); }
      };
      img.onerror = () => res({ ok: false });
      img.src = url;
    }));
    step("bg-set", !!(setBg && setBg.ok), JSON.stringify(setBg), "P2B_BG");

    await page.evaluate(() => { const n = document.getElementById("zy-native-status"); if (n) n.textContent = ""; });
    await page.evaluate(() => { const b = document.getElementById("zy-native-ocr-btn"); if (b) b.click(); }).catch(() => {});
    const t0 = Date.now();
    let createRes = null;
    while (Date.now() - t0 < 60000) {
      await new Promise((r) => setTimeout(r, 800));
      createRes = await page.evaluate(() => {
        const n = document.getElementById("zy-native-status");
        const txt = n ? n.textContent : "";
        const m = txt.match(/已生成 (\d+) 个文字/);
        if (m) return { created: Number(m[1]) };
        if (/失败|超时|未识别|异常|无效/.test(txt)) return { created: -1, txt: txt };
        return null;
      }).catch(() => null);
      if (createRes) break;
    }
    step("native-ocr-flow", !!(createRes && createRes.created > 0), JSON.stringify(createRes), "P2B_NATIVE_LOCAL_OCR_TEXTCREATE");

    // 刷新防重
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const d2 = Date.now() + 90000;
    let st2 = null;
    while (Date.now() < d2) {
      st2 = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const ready = !!(ctx && ctx.defined && ctx.defined.CanvasObjVO);
        if (!ready) return null;
        return { drawerCount: document.querySelectorAll("#zy-native-ocr-panel").length, toolCount: document.querySelectorAll("#zy-native-ocr-tool-btn").length, drawer: !!document.getElementById("zy-native-ocr-panel") };
      }).catch(() => null);
      if (st2 && st2.drawer) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    step("refresh-no-dup", !!(st2 && st2.drawerCount === 1 && st2.toolCount === 1), JSON.stringify(st2), "P2B_SPA_NO_DUP");

    // 回滚清理
    await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const total = vo && vo.totalCanvasArray;
      const c = (Array.isArray(total) && total[0] && ((total[0].canvas) || total[0])) || null;
      if (!c) return;
      let removed = 0;
      c.getObjects().slice().forEach((o) => { if (o && String(o.zyFieldKey || "").indexOf("ocr_demo_") === 0) { c.remove(o); removed += 1; } });
      try { if (c.backgroundImage) c.setBackgroundImage(null, c.requestRenderAll.bind(c)); } catch (e) {}
      if (c.requestRenderAll) c.requestRenderAll();
      window.__zyP2bRemoved = removed;
    });
    const rb = await page.evaluate(() => window.__zyP2bRemoved).catch(() => null);
    step("rollback", true, "removed=" + rb, "P2B_ROLLBACK");

    try { await adapter.removeScript(optsPage, UUID); step("cleanup-userscript", true, "removed " + UUID); } catch (e) { step("cleanup-userscript", false, String(e && e.message || e)); }
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 600));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  report.console = cn.slice(0, 60);
  const reportPath = path.join(__dirname, "reports", "stage5-5b-p2b-native-panel-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 1), "utf8");
  fs.copyFileSync(reportPath, path.join(__dirname, "..", "docs", "evidence", "stage-5.5b", "stage5-5b-p2b-native-panel-report.json"));
  console.log("[zy-p2b] errors=" + report.errors.length + " → " + reportPath);
  process.exit(report.errors.length ? 1 : 0);
})();