// runtime/stage-7-4/ocr-source-ownership.js — Stage 7.6/7.7 真机探针（真实 252438 双面模板）
// 目的：验证 page-bridge 新增 PageIdentity 消息（getPages/getCurrentPage/resolvePage）与
// ocrCreate Ownership 硬门禁（跨页拒绝 / NOT_FOUND / UNKNOWN），以及 Source Page 冻结不漂移。
// 方法：不安装 userscript（避免旧桥双 listener），直接把 extension/src/editor/page-bridge.js
//       源码注入页面世界并安装唯一监听；消息往返全部在页面世界内完成。
// 安全性：正确页门禁（可创建）分支默认关闭（P0_GATE_CREATE=1 才执行），避免污染真实模板；
//        拒绝分支全程零创建；uuid 脱敏为前 8 位。
// 产物: runtime/reports/stage-7-page/ocr-source-ownership.json + cross-page-block.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const adapter = require("../scriptcat-adapter");
const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const EXT_ID = adapter.EXT_ID;
const BRIDGE_SRC = fs.readFileSync(path.join(ROOT, "extension", "src", "editor", "page-bridge.js"), "utf8");
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-7-page");
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const GATE_CREATE = process.env.P0_GATE_CREATE === "1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shortUuid = (u) => (typeof u === "string" ? u.slice(0, 8) : null);

(async () => {
  const out = { ts: new Date().toISOString(), stage: "STAGE-7.6/7.7-OCR-SOURCE-OWNERSHIP", gateCreate: GATE_CREATE, rounds: [], gates: [], errors: [] };
  let browser = null, page = null;
  const ev = (fn, arg) => (arg === undefined ? page.evaluate(fn) : page.evaluate(fn, arg)).catch((e) => ({ err: String(e || "").slice(0, 200) }));
  const waitUntil = async (fnEval, desc, timeoutMs, pollMs = 1500) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) { const r = await ev(fnEval); if (r && r.ok) return { ok: true, data: r, ms: Date.now() - t0 }; await sleep(pollMs); }
    return { ok: false, desc };
  };
  const readyExpr = () => () => {
    const req = window.requirejs || window.require;
    const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
    const d = (vo && Array.isArray(vo.totalCanvasArray) && vo.totalCanvasArray[0]) || null;
    return { ok: !!(d && d.canvas && typeof d.drawText === "function") };
  };
  // 页面世界内的消息往返（bridge listener + 一次性 reply 监听，4s 超时）
  const bridgeMsg = (type, payload) => ev(async (arg) => {
    const replyType = { getPages: "getPagesResult", getCurrentPage: "getCurrentPageResult", resolvePage: "resolvePageResult", ocrCreate: "ocrCreateResult" }[arg.type];
    return await new Promise((resolve) => {
      const t0 = Date.now();
      const on = (e) => {
        if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === replyType) {
          window.removeEventListener("message", on);
          resolve(Object.assign({ _ms: Date.now() - t0 }, e.data));
        }
      };
      window.addEventListener("message", on);
      window.postMessage(Object.assign({ source: "zy-card-assistant", type: arg.type }, arg.payload || {}), location.origin);
      setTimeout(() => { window.removeEventListener("message", on); resolve({ _timeout: true, type: arg.type }); }, 4000);
    });
  }, { type, payload });
  const clickPage = (txt) => ev((arg) => {
    const all = Array.from(document.querySelectorAll("li, a, span, div, i, em, button"));
    for (const el of all) { if (!el.offsetParent) continue; const t = String(el.textContent || "").trim(); if (t === arg.txt && t.length <= 4) { try { el.click(); return { clicked: true, txt: t }; } catch (e) { return { clicked: false }; } } }
    return { clicked: false };
  }, { txt: txt });
  const objectCount = () => ev(() => {
    const req = window.requirejs || window.require;
    const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
    const arr = vo && vo.totalCanvasArray;
    const cc = vo && vo.currentCanvasNum;
    // 读「激活页」画布（跨页拒绝测试必须验证激活页未被污染；禁止只读 index 0）
    const d = (typeof cc === "number" && cc >= 1 && arr && arr[cc - 1]) ? arr[cc - 1] : (arr && arr[0]);
    const c = d && (typeof d.getObjects === "function" ? d : (d.canvas || null));
    return c && typeof c.getObjects === "function" ? { n: c.getObjects().length, ok: true, cc: cc } : { ok: false };
  });
  try {
    if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
    if (!GATE_CREATE) out.errors.push("P0_GATE_CREATE 未开启：允许创建的 OK 分支不执行（避免写真实模板）；拒绝分支照常验证");
    browser = await chromium.launchPersistentContext(PROFILE, {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR],
      viewport: { width: 1440, height: 900 }
    });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    // 隔离：先移除持久 profile 里已安装的 userscript（旧版 demo-pinned bridge 会占 marker 且忽略 pageId，必须清除）
    const opts = browser.pages()[0];
    await opts.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await sleep(2000);
    try {
      const all = await adapter.getAllScripts(opts);
      for (const s of (all || []).filter((x) => /zheliyin|折立印/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(opts, s.uuid); out.removedScript = (out.removedScript || []).concat([s.uuid]); } catch (e) {} }
    } catch (e) { out.errors.push("scriptcat remove: " + String(e && e.message || e).slice(0, 160)); }
    await sleep(1200);
    page = opts;
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => out.errors.push(String(e).slice(0, 130)));
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    const w = await waitUntil(readyExpr(), "editor", 120000);
    out.ready = !!(w && w.ok);
    if (!out.ready) { out.errors.push("editor not ready"); throw new Error("editor_not_ready"); }
    await sleep(2500);
    // 注入最新 page-bridge 源码（唯一 listener；无 userscript -> 无旧桥双响应）。
    // 用 IIFE 包装后调用：function 声明在 eval 全局不会可靠落窗，包装器内函数作用域可见即确定。
    const installer = "(function(){\n" + BRIDGE_SRC + "\nwindow.__zyP7Bridge = (typeof pageBridge === 'function') ? pageBridge() : null;\n})();";
    const inj = await ev((src) => {
      try {
        try { delete window.__ZY_CARD_ASSISTANT_BRIDGE__; } catch (e) {}
        (0, eval)(src);
        const st = window.__ZY_CARD_ASSISTANT_BRIDGE__;
        return { ok: !!(st && st.installed), installedVal: window.__zyP7Bridge };
      } catch (e) { return { ok: false, err: String(e && e.message || e).slice(0, 160) }; }
    }, installer).catch((e) => ({ err: String(e).slice(0, 160) }));
    out.inject = inj;
    if (!(inj && inj.ok)) { out.errors.push("bridge inject failed"); throw new Error("bridge_inject_failed"); }

    const snap = async (label) => {
      const pages = await bridgeMsg("getPages");
      const cur = await bridgeMsg("getCurrentPage");
      const rec = { label, cur: { ok: cur.ok, code: cur.code, pageId: cur.pageId, side: cur.side, sideSource: cur.sideSource, cc: cur.currentCanvasNum, canvasId: cur.canvasId, width: cur.width, height: cur.height, pageCount: (cur.pages || []).length }, pages: (pages.pages || []).map((p) => ({ pageId: p.pageId, canvasId: p.canvasId, index: p.canvasIndex, objs: p.objectCount })) };
      out.rounds.push(rec);
      return rec;
    };

    // A 组：消息一致性 FRONT -> BACK -> FRONT -> BACK -> FRONT（identity 稳定）
    const r0 = await snap("R0_FRONT");
    await clickPage("背面"); await sleep(2200);
    const r1 = await snap("R1_BACK");
    await clickPage("正面"); await sleep(2200);
    const r2 = await snap("R2_FRONT");
    await clickPage("背面"); await sleep(2200);
    const r3 = await snap("R3_BACK");
    await clickPage("正面"); await sleep(2200);
    const r4 = await snap("R4_FRONT");

    out.assertions = {
      R0_FRONT_REPLIED: !!(r0.cur && r0.cur.ok),
      R0_FRONT: !!(r0.cur && r0.cur.ok && r0.cur.side === "FRONT" && r0.cur.pageId && r0.cur.pageId !== "UNKNOWN"),
      R1_BACK_REPLIED: !!(r1.cur && r1.cur.ok),
      R1_BACK: !!(r1.cur && r1.cur.ok && r1.cur.side === "BACK" && r1.cur.pageId && r1.cur.pageId !== r0.cur.pageId),
      R2_FRONT_IDENTITY_STABLE: !!(r0.cur && r2.cur && r0.cur.ok && r2.cur.ok && r2.cur.pageId && r2.cur.pageId === r0.cur.pageId),
      R4_FRONT_IDENTITY_STABLE: !!(r0.cur && r4.cur && r0.cur.ok && r4.cur.ok && r4.cur.pageId && r4.cur.pageId === r0.cur.pageId),
      pages_inventory: !!(r0.pages && r0.pages.length >= 1)
    };

    // B 组：Source Page 冻结不漂移（模拟 OCR 期切页；无真实 OCR，纯消息语义）
    const freezeAt = await bridgeMsg("getCurrentPage"); // FRONT
    await clickPage("背面"); await sleep(1800);
    const currentAfter = await bridgeMsg("getCurrentPage"); // BACK
    out.race = { frozenSource: { pageId: freezeAt.pageId || null, side: freezeAt.side || null, ok: !!freezeAt.ok }, laterCurrent: { pageId: currentAfter.pageId || null, side: currentAfter.side || null, ok: !!currentAfter.ok }, frozenStable: !!(freezeAt.ok && freezeAt.pageId && currentAfter.ok && currentAfter.pageId && freezeAt.pageId !== currentAfter.pageId) };
    await clickPage("正面"); await sleep(1800);

    // C 组：ocrCreate 门禁（拒绝分支全程零创建，逐次校验对象数不变）
    const frontId = freezeAt.pageId; // 正面 pageId（freezeAt 在 B 组结束时为 FRONT 快照）
    const backId = r1.cur.pageId;    // 背面 pageId（B 组已确认）
    const cnt0 = await objectCount();
    const gateNotFound = await bridgeMsg("ocrCreate", { pageId: "canvas:nonexistent", side: "FRONT", items: [{ text: "P7-GATE-NF", blockIndex: 0, left: 20, top: 20, width: 120, fontSize: 14 }] });
    const cntAfterNF = await objectCount();
    await clickPage("背面"); await sleep(1800);
    // 当前=BACK，source=FRONT -> 必须拒绝且零创建
    const gateWrong = await bridgeMsg("ocrCreate", { pageId: frontId, side: "FRONT", items: [{ text: "P7-GATE-WRONG", blockIndex: 0, left: 20, top: 20, width: 120, fontSize: 14 }] });
    const cntAfterWrong = await objectCount();
    await clickPage("正面"); await sleep(1800);
    // 当前=FRONT，source=BACK -> 对称拒绝且零创建
    const gateCross = await bridgeMsg("ocrCreate", { pageId: backId, side: "BACK", items: [{ text: "P7-GATE-CROSS", blockIndex: 0, left: 20, top: 20, width: 120, fontSize: 14 }] });
    const cntAfterCross = await objectCount();
    out.gates = {
      not_found: { code: gateNotFound.code, ok: gateNotFound.ok === false, createdCount: gateNotFound.createdCount, zeroCreate: cntAfterNF.n === cnt0.n },
      wrong_page_back_current: { code: gateWrong.code, ok: gateWrong.ok === false, createdCount: gateWrong.createdCount, zeroCreate: cntAfterWrong.n === cnt0.n },
      wrong_page_front_current: { code: gateCross.code, ok: gateCross.ok === false, createdCount: gateCross.createdCount, zeroCreate: cntAfterCross.n === cnt0.n }
    };

    // D 组：OK 分支（仅 P0_GATE_CREATE=1；允许在真实模板创建 1 个字后立即回滚，全程不保存）
    if (GATE_CREATE) {
      const before = await objectCount();
      const okResp = await bridgeMsg("ocrCreate", { pageId: frontId, side: "FRONT", items: [{ text: "P7-GATE-OK", blockIndex: 0, left: 20, top: 20, width: 120, fontSize: 14 }] });
      out.gates.ok_path = { ok: okResp.ok, code: okResp.code, createdCount: okResp.createdCount, pageId: okResp.pageId, side: okResp.side, created: (okResp.created || []).map((c) => ({ pageId: c.pageId, side: c.side, text: c.text, uuid: shortUuid(c.uuid) })) };
      // 立即回滚（canvas.remove + 图层数组同步 + 重绘；不点保存）
      const rollback = await ev((arg) => {
        const req = window.requirejs || window.require;
        const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
        const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[0]) || null;
        const c = d && d.canvas;
        if (!c) return { ok: false };
        const objs = c.getObjects();
        const target = objs.filter((o) => o && (String(o.text || "") === arg.text || (o.multiUuid && arg.uuid && String(o.multiUuid) === arg.uuid) || (o.uuid && arg.uuid && String(o.uuid) === arg.uuid)));
        target.forEach((o) => { try { const li = d.canvasObjInfo.canvasToProductObjArr.indexOf(o); if (li >= 0) d.canvasObjInfo.canvasToProductObjArr.splice(li, 1); c.remove(o); } catch (e) {} });
        try { if (c.requestRenderAll) c.requestRenderAll(); } catch (e) {}
        return { ok: true, removed: target.length, remaining: c.getObjects().length, before: arg.before };
      }, { text: "P7-GATE-OK", uuid: (okResp.created || [])[0] && (okResp.created[0].uuid || null), before: before.n });
      out.gates.ok_rollback = rollback;
    }

    fs.writeFileSync(path.join(REPORT_DIR, "ocr-source-ownership.json"), JSON.stringify(out, null, 2));
    fs.writeFileSync(path.join(REPORT_DIR, "cross-page-block.json"), JSON.stringify({ ts: out.ts, stage: "STAGE-7.7-CROSS-PAGE-BLOCK", gates: out.gates, assertions: out.assertions, errors: out.errors }, null, 2));
    console.log("OCR-SOURCE-OWNERSHIP done. report=" + path.join(REPORT_DIR, "ocr-source-ownership.json") + " assertions=" + JSON.stringify(out.assertions) + " gateCodes=" + JSON.stringify(Object.keys(out.gates).map((k) => k + "=" + (out.gates[k].code || (out.gates[k].ok ? "OK" : "?")))));
  } catch (e) {
    out.errors.push(String(e && e.message || e).slice(0, 300));
    try { fs.writeFileSync(path.join(REPORT_DIR, "ocr-source-ownership.json"), JSON.stringify(out, null, 2)); } catch (e2) {}
    console.error("FATAL", e && (e.message || e));
    process.exitCode = 1;
  } finally {
    try { page && await page.close(); } catch (e) {}
    try { browser && await browser.close(); } catch (e) {}
  }
})();