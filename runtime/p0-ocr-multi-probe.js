// runtime/p0-ocr-multi-probe.js — 真实 ocrCreate 通道创建 3 对象（字体 556/248/默认），印刷观察核稿失败弹层
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "p0-ocr-multi.json");

(async () => {
  const report = { ts: new Date().toISOString(), stage: "P0-OCR-MULTI", url: EDITOR_URL, phases: {}, stringify: [], dialogs: [], errors: [] };
  let browser = null, page = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    browser.on("dialog", (d) => { report.dialogs.push(String(d.message() || "").slice(0, 200)); d.accept().catch(() => {}); });
    page = browser.pages()[0];
    const readyEval = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = (vo && Array.isArray(vo.totalCanvasArray) && vo.totalCanvasArray[0]) || null;
      return { ok: !!(d && d.canvas && typeof d.drawText === "function") };
    }).catch(() => ({ ok: false }));
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    let ok = false;
    const d1 = Date.now() + 150000;
    while (Date.now() < d1) { ok = await readyEval(); if (ok && ok.ok) break; await page.waitForTimeout(2000); }
    report.phases.ready = !!(ok && ok.ok);
    if (!ok) throw new Error("editor not ready");

    // stringify hook（捕获 print payload 片段）
    await page.evaluate(() => {
      if (window.__zyStrf) return { already: true };
      window.__zyStrf = { hits: [] };
      const os = JSON.stringify;
      JSON.stringify = function (v) {
        const r = os.apply(this, arguments);
        try { if (typeof r === "string" && r.indexOf('"printLocation"') >= 0 && r.indexOf("OCR_TEXT") >= 0 && window.__zyStrf.hits.length < 2) window.__zyStrf.hits.push({ len: r.length, s: r.slice(0, 80000) }); } catch (e) {}
        return r;
      };
      JSON.stringify.__zyStrf = true;
      return { ok: true };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // 通过 page-bridge 消息走真实 ocrCreate 通道（3 个不同字体 → 让 getEditorDefaultFontId 决定）
    report.phases.ocrCreate = await page.evaluate(() => {
      return new Promise((resolve) => {
        const handler = (ev) => { const d = ev.data; if (d && d.source === "zy-card-assistant-page" && d.type === "ocrCreateResult") { window.removeEventListener("message", handler); resolve({ ok: true, details: d }); } };
        window.addEventListener("message", handler);
        const items = [
          { blockIndex: 0, text: "OCR_TEXT_ONE", left: 60, top: 60, width: 200, height: 36, fontSize: 24, angle: 0 },
          { blockIndex: 1, text: "OCR_TEXT_TWO", left: 300, top: 60, width: 200, height: 36, fontSize: 24, angle: 0 },
          { blockIndex: 2, text: "OCR_TEXT_THREE", left: 60, top: 200, width: 200, height: 36, fontSize: 24, angle: 0 }
        ];
        window.postMessage({ source: "zy-card-assistant", type: "ocrCreate", side: "front", items: items }, "*");
        setTimeout(() => { window.removeEventListener("message", handler); resolve({ ok: false, reason: "timeout 12s" }); }, 12000);
      });
    }).catch((e) => ({ err: String(e || "").slice(0, 300) }));
    await page.waitForTimeout(2000);
    report.phases.created = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
      const os = d.canvas.getObjects().filter((o) => /^OCR_TEXT/.test(String(o.text || "")));
      return { count: os.length, objs: os.map((o) => ({ text: String(o.text).slice(0, 14), mediafontId: o.mediafontId, fontFamily: o.fontFamily, uuid: o.uuid, multiUuid: String(o.multiUuid || "").slice(0, 24), topEnable: o.topEnable, isComposite: o.isComposite, isPreview: o.isPreview, visitLevel: o.visitLevel })) };
    }).catch((e) => ({ err: String(e || "").slice(0, 300) }));

    // 点印刷
    await page.evaluate(() => {
      const cands = document.querySelectorAll(".btn.print, li.print, [class*=' print'], .rightBtn li, .rightBtn a");
      let best = null;
      for (let i = 0; i < cands.length; i++) { const el = cands[i]; const tx = String(el.textContent || "").trim(); const cls = String(el.className || ""); if (/印刷/.test(tx) && /print/i.test(cls)) { best = el; break; } if (/印刷/.test(tx) && !best) best = el; }
      if (!best) { const all = document.querySelectorAll("li,a,button,span,div"); for (let i = 0; i < all.length; i++) { const el = all[i]; if (String(el.textContent || "").trim() === "印刷" && el.offsetParent) { best = el; break; } } }
      if (best) { try { best.click(); } catch (e) {} }
    }).catch(() => {});
    await page.waitForTimeout(4000);
    await page.evaluate(() => {
      const layers = document.querySelectorAll(".layui-layer");
      let host = null;
      for (let i = 0; i < layers.length; i++) { if (layers[i].offsetParent || layers[i].style.display !== "none") { host = layers[i]; break; } }
      const scope = host || document;
      const inputs = scope.querySelectorAll("input[type=text], input:not([type]), textarea");
      const setByLabel = (keys, val) => {
        for (let i = 0; i < inputs.length; i++) {
          const el = inputs[i]; if (el.__p0) continue;
          const joined = (el.previousElementSibling ? String(el.previousElementSibling.textContent || "") : "") + String(el.placeholder || "") + String(el.title || "");
          for (let k = 0; k < keys.length; k++) { if (joined.indexOf(keys[k]) >= 0) { el.value = val; try { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {} el.__p0 = 1; break; } }
        }
      };
      setByLabel(["作品", "作品名", "workName", "名称"], "1");
      setByLabel(["用户", "用户名", "userName", "姓名"], "2");
      setByLabel(["备注"], "p0 ocr multi");
    }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const btns = document.querySelectorAll(".layui-layer button, .layui-layer a, .layui-layer-btn0");
      for (let i = 0; i < btns.length; i++) {
        const tx = String(btns[i].textContent || "").trim();
        if (/确定|保存/.test(tx) && !/取消|删除|印刷|提交|生产/.test(tx)) {
          const host = btns[i].closest(".layui-layer") || document;
          if (/确定进行印刷|提交生产|提交制作|确认提交|确定印刷|下单/i.test(String(host.textContent || ""))) continue;
          try { btns[i].click(); return; } catch (e) {}
          break;
        }
      }
    }).catch(() => {});
    // 观察 45s 弹层
    const t0 = Date.now();
    let found = null;
    while (Date.now() - t0 < 45000) {
      const res = await page.evaluate(() => {
        const layers = [];
        document.querySelectorAll(".layui-layer, [class*=hegao]").forEach((el) => {
          const rc = el.getBoundingClientRect(); if (rc.width === 0 && rc.height === 0) return;
          const t = String(el.innerText || el.textContent || "").trim();
          if (t && /自动核稿|核稿失败|生产文件与设计稿|标记正常|去检查/.test(t)) layers.push(t.slice(0, 700));
        });
        return layers;
      }).catch(() => []);
      if (res && res.length) { found = res; break; }
      await page.waitForTimeout(1500);
    }
    report.phases.proofDialog = found;
    report.phases.stringify = await page.evaluate(() => (window.__zyStrf || { hits: [] }).hits.map((h) => ({ len: h.len, s: h.s.slice(0, 50000) }))).catch(() => []);
  } catch (e) {
    report.errors.push(String(e && e.message || e).slice(0, 400));
  } finally {
    try { page && await page.close(); } catch (e) {}
    try { browser && await browser.close(); } catch (e) {}
  }
  const dir = path.dirname(REPORT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log("written: " + REPORT_PATH + " errors=" + report.errors.length);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });