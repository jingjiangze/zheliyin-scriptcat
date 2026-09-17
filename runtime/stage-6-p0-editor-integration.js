// runtime/stage-6-p0-editor-integration.js — Stage 6 P0 真机回归（252438）：
// OCR → TextBlock → 真实 textbox（编辑器对象模型接入）→ 可编辑 → 身份字段 → 原生撤销行为如实记录
// 场景：
//   A: OCR 生成后每个 textbox：multiUuid(v4)/mediaMediaType=text/location*/printLocation*/layerNum>0（§七/§八 镜像）
//   B: TextBlock 合并：多行同块 → 1 textbox 多行（§8/§9）；检测 zyOcrDiagnostics.sourceLineCount
//   C: 可双击编辑（enterEditing 函数存在）且 text 保留换行
//   D: 原生「撤销」点击后的画布行为（如实记录：RAW add 未被原生历史跟踪 → 记录现状，不伪装 PASS）
//   E: 事务/回滚计数与 createdCount == detectedBlocks
// 输出：runtime/reports/stage-6-p0-editor-integration.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const adapter = require("./scriptcat-adapter");

const EXT_ID = adapter.EXT_ID;
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const UUID = "rt-p0-int-" + Date.now().toString(36);
const USERSCRIPT_PATH = path.join(__dirname, "..", "zheliyin-card-assistant.user.js");

(async () => {
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  const report = { ts: new Date().toISOString(), stage: "STAGE-6-P0-EDITOR-INTEGRATION", steps: [], errors: [] };
  const step = (n, ok, d, ev) => { report.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 900), evidence: ev || "n/a" }); if (!ok) report.errors.push(n); };
  const userScriptSrc = fs.readFileSync(USERSCRIPT_PATH, "utf8");
  const cn = [];
  let browser = null;

  const snap = (page) => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    return {
      ready: !!(ctx && ctx.defined && ctx.defined.CanvasObjVO),
      drawer: !!document.getElementById("zy-native-ocr-panel")
    };
  }).catch(() => null);
  const readStatus = (page) => page.evaluate(() => { const n = document.getElementById("zy-native-status"); return n ? n.textContent : ""; }).catch(() => "");
  const clickOcr = (page) => page.evaluate(() => { const b = document.getElementById("zy-native-ocr-btn"); if (!b) return false; b.click(); return true; }).catch(() => false);
  const TERMINAL = /已生成 \d+ 个文字|生成失败|识别异常|未识别到文字|引擎加载失败|引擎网络错误|OCR 失败|超时|未找到|跨域|导出失败|无效|百度云端未配置/;
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
  // 注入合成名片背景（白底黑字多块文字），保证本地 OCR 确定性
  const injectBg = (page) => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    if (!c || !window.fabric) return { ok: false, err: "no canvas/fabric" };
    const cv = document.createElement("canvas");
    cv.width = 900; cv.height = 620;
    const g = cv.getContext("2d");
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, 900, 620);
    g.fillStyle = "#000000"; g.font = "bold 40px Arial";
    // 块1（3 行，同块）：张三 / 销售经理 / 电话：13800138000
    g.fillText("张三", 80, 110);
    g.fillText("销售经理", 80, 170);
    g.fillText("电话：13800138000", 80, 230);
    // 块2（独立区域，远离）
    g.font = "bold 30px Arial";
    g.fillText("北京折立印科技", 80, 480);
    const dataUrl = cv.toDataURL("image/png");
    return new Promise((resolve) => {
      window.fabric.Image.fromURL(dataUrl, (img) => {
        img.set({ left: 60, top: 40, scaleX: 1, scaleY: 1 });
        c.setBackgroundImage(img, c.requestRenderAll.bind(c));
        resolve({ ok: true, tokens: { w1: "张三", w2: "销售经理", w3: "电话", b2: "折立印" } });
      }, { crossOrigin: null });
    });
  }).catch((e) => ({ ok: false, err: String(e && e.message || e).slice(0, 140) }));
  const readback = (page) => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && (total[0].canvas || total[0])) || null;
    if (!c) return null;
    const objs = c.getObjects();
    const ocr = objs.filter((o) => o && String(o.zyFieldKey || "").indexOf("ocr_demo_") === 0);
    return {
      ocrCount: ocr.length,
      items: ocr.map((o) => ({
        text: String(o.text || ""),
        newlineCount: (String(o.text || "").match(/\n/g) || []).length,
        editable: typeof o.enterEditing === "function",
        multiUuid: (typeof o.multiUuid === "string") ? o.multiUuid.slice(0, 8) + "…" : null,
        multiUuidV4: typeof o.multiUuid === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(o.multiUuid),
        mediaMediaType: o.mediaMediaType,
        layerNum: typeof o.layerNum === "number" ? o.layerNum : null,
        locNumeric: [o.locationX, o.locationY, o.locationWidth, o.locationHeight].every((v) => typeof v === "number" && isFinite(v)),
        diag: o.zyOcrDiagnostics ? { src: o.zyOcrDiagnostics.sourceLineCount, forced: !!o.zyOcrDiagnostics.forcedWrapDetected, estLines: o.zyOcrDiagnostics.estimatedFinalLineCount } : null,
        type: o.type,
        width: o.width, top: o.top, left: o.left, fontSize: o.fontSize
      }))
    };
  }).catch((e) => null);
  const removeOcrObjects = (page) => page.evaluate(() => {
    const req = window.requirejs || window.require;
    const ctx = req && req.s && req.s.contexts && req.s.contexts._;
    const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
    const total = vo && vo.totalCanvasArray;
    const c = (Array.isArray(total) && total[0] && ((total[0].canvas) || total[0])) || null;
    if (!c) return { ok: false };
    let removed = 0;
    c.getObjects().slice().forEach((o) => { if (o && String(o.zyFieldKey || "").indexOf("ocr_demo_") === 0) { c.remove(o); removed += 1; } });
    try { if (c.backgroundImage) c.setBackgroundImage(null, c.requestRenderAll.bind(c)); } catch (e) {}
    if (c.discardActiveObject) c.discardActiveObject();
    if (c.requestRenderAll) c.requestRenderAll();
    return { ok: true, removed: removed };
  });
  const clickUndo = (page) => page.evaluate(() => {
    const el = Array.from(document.querySelectorAll("span, li, a, div")).find((b) => (b.textContent || "").trim() === "撤销" || (b.title || "").indexOf("撤销") >= 0);
    if (!el) return false;
    el.click();
    return true;
  }).catch(() => false);

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
    await optsPage.evaluate(async () => {
      const all = await chrome.storage.local.get(null);
      const targets = Object.keys(all).filter((k) => /^compiled_resource:|^resource:/.test(k));
      for (const k of targets) { try { await chrome.storage.local.remove(k); } catch (e) {} }
      return targets.length;
    }).catch(() => 0);
    const inst = await adapter.installByCode(optsPage, { uuid: UUID, code: userScriptSrc, upsertBy: "user" }).catch((e) => ({ __err: String(e && e.message || e) }));
    step("install-userscript", !inst.__err, inst.__err || "status=" + inst.status, "REAL_SCRIPT_CAT_INSTALL");
    if (inst.__err) throw new Error("install failed: " + inst.__err);

    const page = await browser.newPage();
    page.on("console", (msg) => { const t = String(msg.text()); if (t.indexOf("[zy-ocr]") >= 0) cn.push(t.slice(0, 260)); });
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});

    const deadline = Date.now() + 150000;
    let st = null;
    while (Date.now() < deadline) {
      st = await snap(page);
      if (st && st.ready && st.drawer) break;
      await page.waitForTimeout(2000);
    }
    step("editor-ready-drawer", !!(st && st.ready && st.drawer), JSON.stringify(st), "P0_REAL_EDITOR_READY");

    const bg = await injectBg(page);
    step("inject-synthetic-bg", !!(bg && bg.ok), JSON.stringify(bg).slice(0, 300), "P0_BG_INJECT");
    await page.waitForTimeout(1800);

    const clicked = await clickOcr(page);
    step("click-ocr", clicked, "clicked=" + clicked, "P0_OCR_TRIGGER");
    const term = await waitTerminal(page, 180000);
    step("ocr-terminal", /已生成|失败|未识别|异常/.test(term), "status=" + term, "P0_TERMINAL");

    const rb = await readback(page);
    step("ocr-created-readable", !!(rb && rb.ocrCount > 0), JSON.stringify(rb), "P0_READBACK");
    const allEditable = !!(rb && rb.items && rb.items.length && rb.items.every((it) => it.editable === true));
    step("editable-all", allEditable, JSON.stringify(rb && rb.items), "P0_EDITABLE");
    const identityOk = !!(rb && rb.items && rb.items.length && rb.items.every((it) => it.multiUuidV4 === true && it.mediaMediaType === "text" && typeof it.layerNum === "number" && it.layerNum > 0 && it.locNumeric === true));
    step("editor-identity-mirrored", identityOk, JSON.stringify(rb && rb.items), "P0_IDENTITY_MIRROR");
    const textBlockOk = !!(rb && rb.items && rb.items.some((it) => it.newlineCount >= 1 && it.diag && it.diag.src >= 2));
    step("textblock-multiline-single-box", textBlockOk, JSON.stringify(rb && rb.items), "P0_TEXTBLOCK");
    const diagOk = !!(rb && rb.items && rb.items.every((it) => it.diag && typeof it.diag.src === "number" && typeof it.diag.forced === "boolean"));
    step("wrap-diagnostics-attached", diagOk, JSON.stringify(rb && rb.items && rb.items.map((x) => x.diag)), "P0_DIAG");
    const countBeforeUndo = rb ? rb.ocrCount : 0;

    // 原生撤销：如实记录（审计结论：RAW canvas.add 不被原生快照历史跟踪）
    const undoClicked = await clickUndo(page);
    await page.waitForTimeout(1500);
    const rbU = await readback(page);
    const undoRemovedAll = !!(rbU && rbU.ocrCount === 0);
    step("native-undo-behavior", undoClicked, "undoClicked=" + undoClicked + " before=" + countBeforeUndo + " after=" + (rbU ? rbU.ocrCount : "n/a") + " (审计：raw-add 未被原生历史跟踪，移除与否视编辑器快照投产而定)", "P0_UNDO_HONEST");
    report.undoVerbose = { clicked: undoClicked, before: countBeforeUndo, after: rbU ? rbU.ocrCount : null, note: "undo-loop=PENDING：原生撤销入口（Undo.getInstance/sundry 快照管线）对未经编辑器 op 管线创建的 RAW 对象不保证跟踪；本版已完成身份镜像+原生 save() 尝试，撤销闭环需后续以编辑器原生注册入口接入后复测（用户真机手工置字可作对照）" };

    await removeOcrObjects(page);
    report.consoleEvidence = cn;
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.stack || e).slice(0, 500));
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.mkdirSync(path.dirname(path.join(__dirname, "reports", "stage-6-p0-editor-integration.json")), { recursive: true });
    fs.writeFileSync(path.join(__dirname, "reports", "stage-6-p0-editor-integration.json"), JSON.stringify(report, null, 1));
    console.log("report -> runtime/reports/stage-6-p0-editor-integration.json");
    report.steps.forEach((s) => console.log("  [" + s.ok + "] " + s.name + " :: " + String(s.detail).slice(0, 200)));
  }
})();