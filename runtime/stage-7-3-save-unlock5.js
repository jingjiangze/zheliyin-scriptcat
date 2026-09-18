// runtime/stage-7-3-save-unlock5.js — t4 v9：完整保存链路决定性实验
// 链条：保存按钮 → 设计信息面板填表 → 确定提交(createProductJson) → 素材错误弹窗? → PNG 快照落盘
//       → 点「删除错误素材」→ 重提交 → saveThirdUserDesign.do?
// 回答：1) 被判错误素材对象的真实归属（PNG 直接看图：line/rect/textbox）
//       2) 删除错误素材后 textbox 是否保留、保存是否成功
// 依据：ProductDataModel.js 实证 —— TEXT 报文 media.font.id 取 a[b].mediafontId；
//       R() 校验 g.location/printLocation 宽高>0；否则 hc() toProductJsonErrorArray；Gc() 弹「素材错误提示」。
// 输出：runtime/reports/stage-7-3-save-unlock5.json + runtime/reports/err-png/NN.png
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-7-3-save-unlock5.json");
const PNG_DIR = path.join(__dirname, "reports", "err-png");

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-7.3-SAVE-UNLOCK5", url: EDITOR_URL, phases: {}, reqs: [], resp: [], layers: [], dialogs: [], errors: [] };
  let browser = null;
  let page = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    browser.on("dialog", (d) => { report.dialogs.push(String(d.message() || "").slice(0, 200)); d.accept().catch(() => {}); });
    page = browser.pages()[0];
    page.on("request", (r) => {
      const u = r.url();
      if (!/diy\.zheliyin\.com/.test(u)) return;
      const rec = { seq: report.reqs.length, m: r.method(), u: u };
      try { const pd = r.postData(); if (pd) rec.body = String(pd).slice(0, 3000); } catch (e) {}
      report.reqs.push(rec);
    });
    page.on("response", async (r) => {
      const u = r.url();
      if (!/IfDiyOrderidExit|saveThirdUserDesign|saveUserDesign|getShopAndWangWangInfo/i.test(u)) return;
      try {
        const b = await r.text();
        report.resp.push({ status: r.status(), u: u, body: String(b).slice(0, 3000) });
      } catch (e) {
        report.resp.push({ status: r.status(), u: u, body: "<unread>:" + String(e && e.message || e).slice(0, 120) });
      }
    });

    const readyEval = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      const d = (vo && Array.isArray(vo.totalCanvasArray) && vo.totalCanvasArray[0]) || null;
      const c = d && (d.canvas || d);
      return { ok: !!(d && c && c.getObjects && typeof d.drawText === "function") };
    }).catch(() => ({ ok: false }));
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    let ok = false;
    const d1 = Date.now() + 150000;
    while (Date.now() < d1) { ok = await readyEval(); if (ok && ok.ok) break; await page.waitForTimeout(2000); }
    report.phases.ready = !!(ok && ok.ok);
    if (!ok) throw new Error("editor not ready after 150s");

    // hook layer.open：完整抓 content 中 errorDiv 的 img src（base64 快照）
    await page.evaluate(() => {
      window.__zyLayers = [];
      const L = window.layer;
      if (L && !window.__zyLayerHooked) {
        const orig = L.open;
        window.__zyLayerHooked = true;
        L.open = function (opts) {
          try {
            const o = opts || {};
            const c = typeof o.content === "string" ? o.content : "";
            const imgs = [];
            (String(c).match(/<img src=\"?data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+\"?\s*\/?\s*>/g) || []).forEach((s) => {
              const m = s.match(/base64,([A-Za-z0-9+/=]+)/);
              if (m) imgs.push({ b64: m[1], len: m[1].length });
            });
            window.__zyLayers.push({ title: String(o.title || "").slice(0, 60), text: String(c.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 300), htmlLen: c.length, imgs: imgs });
          } catch (e) {}
          return orig.apply(this, arguments);
        };
      }
    }).catch(() => {});

    const snapshotObjects = `(function(){var req=window.requirejs||window.require;var vo=(req&&req.s&&req.s.contexts&&req.s.contexts._&&req.s.contexts._.defined&&req.s.contexts._.defined.CanvasObjVO)||window.CanvasObjVO;if(!vo||!Array.isArray(vo.totalCanvasArray))return{err:"no CanvasObjVO"};var out=[];for(var i=0;i<vo.totalCanvasArray.length;i++){var d=vo.totalCanvasArray[i];if(!d||!d.canvas||!d.canvas.getObjects)continue;var o=d.canvas.getObjects();var arr=[];for(var j=0;j<o.length;j++){var ob=o[j]||{};arr.push({i:j,t:ob.type&&(ob.type.name||ob.type)||"?",txt:String(ob.text||"").slice(0,16),w:ob.width,h:ob.height,lf:Math.round(ob.left||0),top:Math.round(ob.top||0),mid:String(ob.mediafontId||"").slice(0,12),uid:String(ob.multiUuid||ob.markuuid||ob.uuid||"").slice(0,20)});}out.push({ci:i,total:arr.length,objs:arr});}return{perCanvas:out};})()`;

    const clickSave = () => page.evaluate(() => {
      const btn = document.querySelector(".rightBtn .save") || document.querySelector("a.save") || null;
      if (!btn) return { clicked: false };
      try { btn.click(); return { clicked: true }; } catch (e) { return { err: String(e) }; }
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    const fillAndSubmit = () => page.evaluate((p) => {
      const log = [];
      // 在设计信息面板（layui 弹层）内找输入框填必填项
      const layers = document.querySelectorAll(".layui-layer");
      let host = null;
      for (let i = 0; i < layers.length; i++) { if (layers[i].offsetParent || layers[i].style.display !== "none") { host = layers[i]; break; } }
      const scope = host || document;
      const inputs = scope.querySelectorAll("input[type=text], input:not([type]), textarea");
      const setByLabel = (keys, val) => {
        for (let i = 0; i < inputs.length; i++) {
          const el = inputs[i];
          const label = el.previousElementSibling ? String(el.previousElementSibling.textContent || "") : "";
          const ph = String(el.placeholder || "");
          const title = String(el.title || "");
          const joined = label + ph + title;
          for (let k = 0; k < keys.length; k++) { if (joined.indexOf(keys[k]) >= 0 && !el.__filled) { el.value = val; try { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {} el.__filled = 1; log.push((el.id || el.className || "input").toString().slice(0, 24) + "=" + String(val).slice(0, 20) + "(label:" + label.slice(0, 8) + ")"); return; } }
        }
      };
      setByLabel(["作品", "作品名", "workName", "名称"], "样式还原OCR保存验证");
      setByLabel(["用户", "用户名", "userName", "姓名"], "样式还原测试");
      setByLabel(["备注"], "stage-7.3 unlock5");
      // 找「确定/保存/提交」按钮
      const btns = scope.querySelectorAll("button, a, .layui-layer-btn0, input[type=button]");
      let clicked = null;
      for (let i = 0; i < btns.length; i++) {
        const tx = String(btns[i].textContent || btns[i].value || "").trim();
        if (/确定|保存|提交|确认/.test(tx) && !/取消|关闭|删除/.test(tx)) {
          try { btns[i].click(); clicked = tx.slice(0, 20); break; } catch (e) {}
        }
      }
      return { log: log, clicked: clicked, layerCount: layers.length };
    }, {}).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    const clickDeleteError = () => page.evaluate(() => {
      const btns = document.querySelectorAll(".layui-layer-btn0, .layui-layer-btn a, button, a, [class*=btn]");
      let clicked = null;
      for (let i = 0; i < btns.length; i++) {
        const tx = String(btns[i].textContent || btns[i].value || "").trim();
        if (tx.indexOf("删除错误素材") >= 0) { try { btns[i].click(); clicked = tx.slice(0, 20); break; } catch (e) {} }
      }
      return { clicked: clicked };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    const drainLayers = () => page.evaluate(() => { const L = window.__zyLayers || []; window.__zyLayers = []; return L; }).catch(() => []);

    const saveSnapshots = (ls) => {
      fs.mkdirSync(PNG_DIR, { recursive: true });
      const saved = [];
      let n = 0;
      ls.forEach((l) => {
        (l.imgs || []).forEach((im) => {
          if (im.len > 700000) { saved.push({ skip: "too-big", len: im.len }); return; }
          try {
            const buf = Buffer.from(im.b64, "base64");
            const fp = path.join(PNG_DIR, "err-" + String(n).padStart(2, "0") + ".png");
            fs.writeFileSync(fp, buf);
            saved.push({ file: path.basename(fp), bytes: buf.length, inLayer: l.title });
            n++;
          } catch (e) { saved.push({ err: String(e), len: im.len }); }
        });
      });
      return saved;
    };

    // ---- 创建探针 textbox（mediafontId=556 思源黑体 Regular）----
    report.phases.probe = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      for (let i = 0; i < vo.totalCanvasArray.length; i++) {
        const d = vo.totalCanvasArray[i];
        if (!(d && typeof d.drawText === "function" && d.canvas && d.canvas.getObjects && d.canvasObjInfo)) continue;
        const baseLayer = d.canvasObjInfo.canvasToProductObjArr.length;
        const uid = "zlysave5-" + Date.now() % 1000000;
        const entry = { media: { mediaType: "text", text: uid, font: { pointSize: 24, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "556", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.3, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: 100, y: 100, width: 200, height: 40, factWidth: 200, factHeight: 40, rotation: 0 }, printLocation: { x: 100, y: 100, width: 200, height: 40, rotation: 0 }, layer: { alpha: 1 }, layerNum: baseLayer, isEdit: 1, isDisplay: 1, deleteState: 0, visitLevel: 1, multiUuid: uid, markuuid: "" };
        d.drawText(uid, null, null, null, entry, baseLayer);
        const o = d.canvas.getObjects().filter((ob) => String(ob.text || "") === uid)[0];
        const mine = {};
        if (o) { ["width", "height", "left", "top", "angle", "scaleX", "scaleY"].forEach((k) => { if (o[k] !== undefined) mine[k] = o[k]; }); mine.mediafontId = o.mediafontId; mine.type = o.type && (o.type.name || o.type); }
        return { uid: uid, obj: mine, canvasTotal: d.canvas.getObjects().length, ctpArrLen: d.canvasObjInfo.canvasToProductObjArr.length };
      }
      return { err: "no live CanvasDiy" };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // ---- 第一次保存：填表提交 → 抓错误素材弹窗 ----
    report.phases.save1 = {};
    report.phases.save1.before = await page.evaluate(snapshotObjects).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    report.phases.save1.click = await clickSave();
    await page.waitForTimeout(3500);
    report.phases.save1.fill = await fillAndSubmit();
    await page.waitForTimeout(4500);
    report.phases.save1.layers = await drainLayers();
    report.phases.save1.pn = saveSnapshots(report.phases.save1.layers);
    report.phases.save1.bodySnippet = await page.evaluate(() => String(document.body.innerText || "").replace(/\n+/g, " | ").slice(0, 700)).catch((e) => String(e || "").slice(0, 200));
    report.phases.save1.after = await page.evaluate(snapshotObjects).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    // ---- 若出现素材错误弹窗：点「删除错误素材」→ 重提交保存 ----
    const errLayers = (report.phases.save1.layers || []).filter((l) => (l.title || "").indexOf("素材错误") >= 0 || (l.text || "").indexOf("错误素材") >= 0);
    if (errLayers.length) {
      report.phases.save1.delClick = await clickDeleteError();
      await page.waitForTimeout(3000);
      report.phases.save1.afterDelete = await page.evaluate(snapshotObjects).catch((e) => ({ err: String(e || "").slice(0, 200) }));
      // 重试保存（此时错误素材已删）
      report.phases.save2 = {};
      report.phases.save2.click = await clickSave();
      await page.waitForTimeout(3500);
      report.phases.save2.fill = await fillAndSubmit();
      await page.waitForTimeout(4500);
      report.phases.save2.layers = await drainLayers();
      report.phases.save2.bodySnippet = await page.evaluate(() => String(document.body.innerText || "").replace(/\n+/g, " | ").slice(0, 700)).catch((e) => String(e || "").slice(0, 200));
      report.phases.save2.after = await page.evaluate(snapshotObjects).catch((e) => ({ err: String(e || "").slice(0, 200) }));
    }
    report.phases.netSnapshot = report.reqs.map((r) => ({ u: r.u, m: r.m, b: r.body ? r.body.slice(0, 200) : null })).filter((r) => /save|order|wangwang|shop|IfDiy/i.test(r.u));
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.message || e).slice(0, 400));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log("STAGE-7.3-SAVE-UNLOCK5 done -> " + REPORT_PATH);
  console.log("ready=" + report.phases.ready);
  const s1l = (report.phases.save1 && report.phases.save1.layers) || [];
  console.log("save1-layers=" + JSON.stringify(s1l.map((l) => ({ t: l.title, txt: (l.text || "").slice(0, 80), imgs: (l.imgs || []).length }))));
  console.log("save1-fill=" + JSON.stringify(report.phases.save1 && report.phases.save1.fill));
  console.log("errPng=" + JSON.stringify(report.phases.save1 && report.phases.save1.pn));
  if (report.phases.save1) console.log("save1-afterTotal=" + JSON.stringify((report.phases.save1.after && report.phases.save1.after.perCanvas || []).map((c) => c.total)));
  if (report.phases.save2) console.log("save2-layers=" + JSON.stringify((report.phases.save2.layers || []).map((l) => ({ t: l.title, txt: (l.text || "").slice(0, 80) }))));
  const writes = (report.reqs || []).filter((r) => /saveThirdUserDesign|saveUserDesign/.test(r.u));
  console.log("writeReqs=" + JSON.stringify(writes.map((r) => ({ m: r.m, u: r.u, b: r.body ? r.body.slice(0, 120) : null }))));
  console.log("dialogs=" + JSON.stringify(report.dialogs));
  console.log("resp=" + JSON.stringify(report.resp.map((r) => ({ s: r.status, u: r.u.slice(-60), b: String(r.body).slice(0, 100) }))));
})().catch((e) => { console.error("probe crashed: " + e); process.exit(1); });