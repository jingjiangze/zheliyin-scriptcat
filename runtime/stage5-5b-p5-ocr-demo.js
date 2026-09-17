// runtime/stage5-5b-p5-ocr-demo.js — Stage 5.6 OCR-only Demo 真机回归（交付B）
// 前提：userscript 默认 OCR_ONLY_MODE=true（旧套版浮窗不挂载，代码保留）。
// 断言：
//   [ ] 安装成功后：原生抽屉 #zy-native-ocr-panel 存在且唯一
//   [ ] 右栏工具按钮 #zy-native-ocr-tool-btn 存在且唯一
//   [ ] 旧浮窗 #zy-card-assistant 默认【不存在】（OCR-only 主 UI）
//   [ ] .zy-status 节点仅原生抽屉（1 个）
//   [ ] 场景 A：backgroundImage + activeObject=null → 点 #zy-native-ocr-btn → 已生成文字 → 可编辑 textbox（created>0）
//   [ ] 场景 B：active image 对象 → OCR 正常推进（无错误终态）
//   [ ] 场景 C：早点击 —— 刷新后抽屉一出现立即点击 → 「正在等待编辑器加载…」→ 自动继续
//   [ ] 刷新防重：抽屉/按钮仍唯一；浮窗仍不存在
//   [ ] 恢复开关：zyShowTemplatePanel="1" 写入 → 刷新 → #zy-card-assistant 出现且套版按钮齐全（套版代码保留证明）；移除后恢复 OCR-only
//   [ ] 回滚清理：ocr_demo_* 对象删除
// 证据：runtime/reports/stage5-5b-p5-ocr-demo-report.json + docs/evidence/stage-5.6/
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const adapter = require("./scriptcat-adapter");

const EXT_ID = adapter.EXT_ID;
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";
const UUID = "rt5-6-p5-" + Date.now().toString(36);
const USERSCRIPT_PATH = path.join(__dirname, "..", "zheliyin-card-assistant.user.js");

(async () => {
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  const report = { ts: new Date().toISOString(), stage: "STAGE-5.6-P5-OCR-DEMO", steps: [], errors: [] };
  const step = (n, ok, d, ev) => { report.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 800), evidence: ev || "n/a" }); if (!ok) report.errors.push(n); };
  const userScriptSrc = fs.readFileSync(USERSCRIPT_PATH, "utf8");
  const cn = [];
  let browser = null;

  // 页面状态快照：编辑器就绪/抽屉/工具按钮/浮窗/状态节点
  const snap = async (page) => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    return {
      ready: !!(ctx && ctx.defined && ctx.defined.CanvasObjVO),
      drawer: !!document.getElementById("zy-native-ocr-panel"),
      toolBtn: !!document.getElementById("zy-native-ocr-tool-btn"),
      legacy: !!document.getElementById("zy-card-assistant"),
      drawerCount: document.querySelectorAll("#zy-native-ocr-panel").length,
      toolCount: document.querySelectorAll("#zy-native-ocr-tool-btn").length,
      legacyCount: document.querySelectorAll("#zy-card-assistant").length,
      statusNodes: document.querySelectorAll(".zy-status").length,
      statusText: (() => { const n = document.getElementById("zy-native-status"); return n ? n.textContent : null; })()
    };
  }).catch(() => null);
  const readStatus = (page) => page.evaluate(() => { const n = document.getElementById("zy-native-status"); return n ? n.textContent : ""; }).catch(() => "");
  const statusReset = (page) => page.evaluate(() => { const n = document.getElementById("zy-native-status"); if (n) n.textContent = ""; }).catch(() => {});
  const clickOcr = (page) => page.evaluate(() => { const b = document.getElementById("zy-native-ocr-btn"); if (!b) return false; b.click(); return true; }).catch(() => false);
  const TERMINAL = /已生成 \d+ 个文字|生成失败|识别异常|未识别到文字|引擎加载失败|引擎网络错误|OCR 失败|超时|未找到|跨域|导出失败|无效/;
  const waitTerminal = async (page, maxMs) => {
    const t0 = Date.now();
    let last = "";
    while (Date.now() - t0 < maxMs) {
      await new Promise((r) => setTimeout(r, 700));
      last = await readStatus(page);
      if (last && TERMINAL.test(last)) return last;
    }
    return last;
  };
  const removeOcrObjects = (page) => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && ((total[0].canvas) || total[0])) || null;
    if (!c) return { ok: false, err: "no canvas" };
    let removed = 0;
    c.getObjects().slice().forEach((o) => { if (o && String(o.zyFieldKey || "").indexOf("ocr_demo_") === 0) { c.remove(o); removed += 1; } });
    try { if (c.backgroundImage) c.setBackgroundImage(null, c.requestRenderAll.bind(c)); } catch (e) {}
    if (c.discardActiveObject) c.discardActiveObject();
    if (c.requestRenderAll) c.requestRenderAll();
    return { ok: true, removed: removed, totalAfter: c.getObjects().length, bgAfter: !!c.backgroundImage };
  });
  const readbackOcr = (page) => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && ((total[0].canvas) || total[0])) || null;
    if (!c) return null;
    const objs = c.getObjects();
    const ocr = objs.filter((o) => o && String(o.zyFieldKey || "").indexOf("ocr_demo_") === 0);
    return { ocrCount: ocr.length, samples: ocr.slice(0, 6).map((o) => ({ text: String(o.text || "").slice(0, 20), type: o.type, editable: typeof o.enterEditing === "function" })), total: objs.length };
  });

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
    try {
      const all = (await adapter.getAllScripts(optsPage)) || [];
      for (const s of all.filter((x) => /折立印|zheliyin/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(optsPage, s.uuid); } catch (e) {} }
    } catch (e) {}
    const inst = await adapter.installByCode(optsPage, { uuid: UUID, code: userScriptSrc, upsertBy: "user" }).catch((e) => ({ __err: String(e && e.message || e) }));
    step("install-userscript", !inst.__err, inst.__err || "status=" + inst.status, "REAL_SCRIPT_CAT_INSTALL");
    if (inst.__err) throw new Error("install failed: " + inst.__err);

    const page = await browser.newPage();
    page.on("console", (msg) => { const t = String(msg.text()); if (t.indexOf("[zy-ocr]") >= 0) cn.push(t); });
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});

    // 等编辑器就绪 + 原生抽屉
    const deadline = Date.now() + 150000;
    let st = null;
    while (Date.now() < deadline) {
      st = await snap(page);
      if (st && st.ready && st.drawer) break;
      await new Promise((r) => setTimeout(r, 1500));
    }

    // ---- OCR-only UI 断言 ----
    step("ocr-drawer-mounted", !!(st && st.ready && st.drawer), JSON.stringify(st), "P5_NATIVE_DRAWER");
    step("drawer-unique", st && st.drawerCount === 1, "drawerCount=" + (st && st.drawerCount), "P5_NO_DUP");
    step("tool-btn-unique", st && st.toolCount === 1, "toolCount=" + (st && st.toolCount), "P5_RAIL_BUTTON");
    step("legacy-panel-hidden", st && !st.legacy && st.legacyCount === 0, JSON.stringify(st && { legacy: st.legacy, legacyCount: st.legacyCount }), "P5_OCR_ONLY_DEFAULT");
    step("status-node-single", st && st.statusNodes === 1, "statusNodes=" + (st && st.statusNodes), "P5_NATIVE_STATUS_ONLY");

    // ---- 场景 A：backgroundImage + activeObject=null ----
    const setBg = await page.evaluate(() => new Promise((res) => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const total = vo && vo.totalCanvasArray;
      const c = (Array.isArray(total) && total[0] && ((total[0].canvas) || total[0])) || null;
      if (!c) return res({ ok: false, err: "no canvas" });
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
          res({ ok: true, bgType: c.backgroundImage.type, active: c.getActiveObject() });
        } catch (e) { res({ ok: false, err: String(e && e.message || e) }); }
      };
      img.onerror = () => res({ ok: false });
      img.src = url;
    }));
    step("scenario-A-bg-set", !!(setBg && setBg.ok && setBg.bgType === "image" && !setBg.active), JSON.stringify(setBg), "P5_BG_NO_ACTIVE");
    await statusReset(page);
    const aC = await clickOcr(page);
    const aTerm = await waitTerminal(page, 120000);
    const aCreated = /已生成 (\d+) 个文字/.exec(aTerm);
    step("scenario-A-ocr-flow", !!(aC && aCreated && Number(aCreated[1]) > 0), "clicked=" + aC + " status=" + aTerm.slice(0, 120), "P5_BG_LOCAL_OCR_TEXTCREATE");
    const readA = await readbackOcr(page);
    step("scenario-A-readable-textbox", !!(readA && readA.ocrCount > 0 && readA.samples.every((s) => s.editable)), JSON.stringify(readA), "P5_REAL_EDITABLE_TEXTBOX");
    const rbA = await removeOcrObjects(page);
    step("scenario-A-rollback", !!(rbA && rbA.ok && rbA.bgAfter === false), JSON.stringify(rbA), "P5_ROLLBACK_CLEAN");

    // ---- 场景 B：active image 对象 ----
    const addImg = await page.evaluate(() => new Promise((res) => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const total = vo && vo.totalCanvasArray;
      const c = (Array.isArray(total) && total[0] && ((total[0].canvas) || total[0])) || null;
      if (!c) return res({ ok: false, err: "no canvas" });
      const cv = document.createElement("canvas");
      cv.width = 700; cv.height = 500;
      const g = cv.getContext("2d");
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, 700, 500);
      g.fillStyle = "#222222";
      g.font = "bold 56px 'Microsoft YaHei', sans-serif";
      g.fillText("客户名片", 80, 160);
      g.fillText("李经理", 80, 300);
      const url = cv.toDataURL("image/png");
      const img = document.createElement("img");
      img.onload = () => {
        try {
          const F = window.fabric || c.fabric || (c.constructor && c.constructor.fabric);
          const fi = new F.Image(img, { width: 700, height: 500, left: 60, top: 60, zyFieldKey: "p5-active-image" });
          c.add(fi);
          c.setActiveObject(fi);
          if (c.requestRenderAll) c.requestRenderAll();
          const act = c.getActiveObject();
          res({ ok: true, activeType: act && act.type, hasElement: !!(act._element || (act.getElement && act.getElement())) });
        } catch (e) { res({ ok: false, err: String(e && e.message || e) }); }
      };
      img.onerror = () => res({ ok: false });
      img.src = url;
    }));
    step("scenario-B-active-set", !!(addImg && addImg.ok && addImg.activeType === "image" && addImg.hasElement), JSON.stringify(addImg), "P5_ACTIVE_IMAGE");
    await statusReset(page);
    const bC = await clickOcr(page);
    const bTerm = await waitTerminal(page, 120000);
    const bCreated = /已生成 (\d+) 个文字/.exec(bTerm);
    const bErr = /失败|超时|未识别|异常|无效/.test(bTerm);
    step("scenario-B-ocr-flow", !!(bC && bCreated && Number(bCreated[1]) > 0 && !bErr), "clicked=" + bC + " status=" + bTerm.slice(0, 120), "P5_ACTIVE_IMAGE_OCR_TEXTCREATE");
    const rbB = await removeOcrObjects(page);
    // 移除场景 B 添加的 image 对象（保留模板原状）
    await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const total = vo && vo.totalCanvasArray;
      const c = (Array.isArray(total) && total[0] && ((total[0].canvas) || total[0])) || null;
      if (!c) return;
      c.getObjects().slice().forEach((o) => { if (String(o.zyFieldKey || "") === "p5-active-image") c.remove(o); });
      if (c.requestRenderAll) c.requestRenderAll();
    });
    step("scenario-B-rollback", !!(rbB && rbB.ok), JSON.stringify(rbB), "P5_ROLLBACK_B");

    // ---- 场景 C：早点击（刷新后抽屉一出现立即点）----
    const tC0 = Date.now();
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    while (Date.now() - tC0 < 90000) {
      const s = await snap(page);
      if (s && s.drawer) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    const c1 = await page.evaluate(() => { const n = document.getElementById("zy-native-status"); if (n) n.textContent = ""; return !!document.getElementById("zy-native-ocr-panel"); }).catch(() => false);
    step("scenario-C-drawer-then-click", !!c1, "drawer=" + c1, "P5_EARLY_CLICK_START");
    const cClicked = await clickOcr(page);
    const cTerm = await waitTerminal(page, 100000);
    const earlySeen = cn.some((x) => /等待编辑器加载|CANVAS_READY/.test(x));
    const cStates = [];
    const cPoll = await readStatus(page);
    cStates.push(cPoll.slice(0, 80));
    const cCreated = /已生成 (\d+) 个文字/.exec(cTerm);
    step("scenario-C-early-click", !!(cClicked && cCreated && Number(cCreated[1]) > 0), "clicked=" + cClicked + " terminal=" + cTerm.slice(0, 160) + " early=" + earlySeen, "P5_CANVAS_EARLY_CLICK");
    const rbC = await removeOcrObjects(page);
    step("scenario-C-rollback", !!(rbC && rbC.ok), JSON.stringify(rbC), "P5_ROLLBACK_C");

    // ---- 刷新防重 + 默认仍 OCR-only ----
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const d2 = Date.now() + 90000;
    let st2 = null;
    while (Date.now() < d2) {
      st2 = await snap(page);
      if (st2 && st2.drawer && st2.ready) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    step("refresh-no-dup-ocr-only", !!(st2 && st2.drawerCount === 1 && st2.toolCount === 1 && !st2.legacy), JSON.stringify(st2 && { drawerCount: st2.drawerCount, toolCount: st2.toolCount, legacy: st2.legacy }), "P5_SPA_NO_DUP");

    // ---- 恢复开关：写入 zyShowTemplatePanel=1 → 浮窗恢复（套版代码保留证明）；清除后恢复 OCR-only ----
    // 先触发一次模式切换让 GM 存储出现可发现键（zyOcrMode），据此推断存储前缀
    await page.evaluate(() => { const sel = document.getElementById("zy-ocr-mode-native"); if (sel) { sel.value = "local"; sel.dispatchEvent(new Event("change")); } }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1200));
    const storageKey = await optsPage.evaluate(async () => {
      const all = await chrome.storage.local.get(null);
      const hit = Object.keys(all).find((k) => /zyOcrMode/.test(k));
      if (!hit) return { found: false };
      const prefix = hit.replace(/zyOcrMode.*$/, "");
      return { found: true, prefix: prefix, modeKey: hit };
    });
    step("storage-key-discovered", !!(storageKey && storageKey.found), JSON.stringify(storageKey), "P5_GM_STORAGE_DISCOVERY");
    if (storageKey && storageKey.found) {
      const restoreKey = storageKey.prefix + "zyShowTemplatePanel";
      await optsPage.evaluate(async ({ k, v }) => { await chrome.storage.local.set({ [k]: v }); }, { k: restoreKey, v: "1" });
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      const d3 = Date.now() + 90000;
      let st3 = null;
      while (Date.now() < d3) {
        st3 = await snap(page);
        if (st3 && st3.ready && st3.legacy) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      const tmplButtons = st3 && st3.legacy ? await page.evaluate(() => ({
        parse: !!document.getElementById("zy-parse-apply"),
        append: !!document.getElementById("zy-append"),
        front: !!document.getElementById("zy-apply-front"),
        back: !!document.getElementById("zy-apply-back"),
        fields: !!document.getElementById("zy-fields"),
        raw: !!document.getElementById("zy-raw"),
        ocrInPanel: !!document.getElementById("zy-ocr-btn"),
        probe: !!document.getElementById("zy-probe")
      })).catch(() => null) : null;
      step("restore-panel-appears", !!(st3 && st3.legacy && st3.legacyCount === 1), JSON.stringify(st3 && { legacy: st3.legacy, legacyCount: st3.legacyCount }), "P5_RESTORE_TEMPLATE_PANEL");
      step("template-buttons-present", !!(tmplButtons && tmplButtons.parse && tmplButtons.append && tmplButtons.front && tmplButtons.back && tmplButtons.fields && tmplButtons.raw && tmplButtons.ocrInPanel && tmplButtons.probe), JSON.stringify(tmplButtons), "P5_TEMPLATE_CODE_RETAINED");
      await optsPage.evaluate(async ({ k }) => { await chrome.storage.local.remove(k); }, { k: restoreKey });
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      const d4 = Date.now() + 90000;
      let st4 = null;
      while (Date.now() < d4) {
        st4 = await snap(page);
        if (st4 && st4.ready && st4.drawer) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      step("restore-cleared-ocr-only-back", !!(st4 && st4.drawer && !st4.legacy), JSON.stringify(st4 && { drawer: st4.drawer, legacy: st4.legacy }), "P5_RESTORE_CLEARED");
    } else {
      step("restore-panel-appears", false, "GM 存储前缀未发现（ScriptCat 存储 key 格式未命中），restore 动态验证无法完成", "P5_RESTORE_PENDING");
      report.errors = report.errors.filter((e) => e !== "restore-panel-appears");
      report.errors.push("restore-panel-appears(PENDING)");
    }

    try { await adapter.removeScript(optsPage, UUID); step("cleanup-userscript", true, "removed " + UUID); } catch (e) { step("cleanup-userscript", false, String(e && e.message || e)); }
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 600));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  report.console = cn.slice(0, 80);
  report.pending = report.steps.filter((s) => String(s.detail || "").indexOf("PENDING") >= 0 || String(s.name).indexOf("PENDING") >= 0).map((s) => s.name);
  const reportPath = path.join(__dirname, "reports", "stage5-5b-p5-ocr-demo-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 1), "utf8");
  fs.mkdirSync(path.join(__dirname, "..", "docs", "evidence", "stage-5.6"), { recursive: true });
  fs.copyFileSync(reportPath, path.join(__dirname, "..", "docs", "evidence", "stage-5.6", "stage5-5b-p5-ocr-demo-report.json"));
  console.log("[zy-p5] errors=" + report.errors.length + " → " + reportPath);
  console.log(JSON.stringify(report.steps.filter((s) => s.ok === "FAIL" || s.ok === false).map((s) => s.name), null, 0));
  process.exit(report.errors.length ? 1 : 0);
})();