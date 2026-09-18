// runtime/stage-7-3-save-unlock7.js — t4 v11：保存「确定」→写库断点诊断（console/异常监听）
// 背景：v9(未修 location) 确定后弹素材错误；v10(修 location) 确定后无弹窗但 saveThirdUserDesign.do 未发出。
// 假设：保存主函数 na()（createProductJson 序列化）在 v10 路径下抛异常被吞，或确定 handler 在更早 gate 返回。
// v11：监听 console/exception；干净探针复现 v9；点确定后抓异常与请求；对比提示弹层。
// 输出：runtime/reports/stage-7-3-save-unlock7.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const REPORT_PATH = path.join(__dirname, "reports", "stage-7-3-save-unlock7.json");

(async () => {
  const report = { ts: new Date().toISOString(), stage: "STAGE-7.3-SAVE-UNLOCK7", url: EDITOR_URL, phases: {}, reqs: [], console: [], dialogs: [], errors: [] };
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
    page.on("console", (msg) => { const t = msg.type(); if (t === "error" || t === "warning") report.console.push({ type: t, text: String(msg.text() || "").slice(0, 300) }); });
    page.on("pageerror", (e) => report.console.push({ type: "pageerror", text: String(e && e.message || e).slice(0, 300) }));
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
      try { report.resp = report.resp || []; report.resp.push({ status: r.status(), u: u, body: String(await r.text()).slice(0, 2000) }); } catch (e) {}
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

    // hook layer.open（提示层捕获）
    await page.evaluate(() => {
      window.__zyLayers = [];
      const L = window.layer;
      if (L && !window.__zyLayerHooked) {
        const orig = L.open;
        window.__zyLayerHooked = true;
        L.open = function (opts) {
          try { const o = opts || {}; window.__zyLayers.push({ title: String(o.title || "").slice(0, 60), text: String((typeof o.content === "string" ? o.content : "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 280) }); } catch (e) {}
          return orig.apply(this, arguments);
        };
      }
    }).catch(() => {});

    // 创建干净探针（v9 同参数）
    report.phases.probe = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      for (let i = 0; i < vo.totalCanvasArray.length; i++) {
        const d = vo.totalCanvasArray[i];
        if (!(d && typeof d.drawText === "function" && d.canvas && d.canvas.getObjects && d.canvasObjInfo)) continue;
        const baseLayer = d.canvasObjInfo.canvasToProductObjArr.length;
        const uid = "zlyunlock7-" + Date.now() % 1000000;
        const entry = { media: { mediaType: "text", text: uid, font: { pointSize: 24, fontColor: "#000000", isHorizontal: 1, gravity: "left", id: "556", isItalic: 0, textDecoration: "", linethrough: 0, overline: 0, isBold: 0, overprintStroke: 0 }, charSpace: 0, lineSpace: 1.3, lineIdType: 0, isBG: 0, imgPath: "" }, location: { x: 100, y: 100, width: 200, height: 40, factWidth: 200, factHeight: 40, rotation: 0 }, printLocation: { x: 100, y: 100, width: 200, height: 40, rotation: 0 }, layer: { alpha: 1 }, layerNum: baseLayer, isEdit: 1, isDisplay: 1, deleteState: 0, visitLevel: 1, multiUuid: uid, markuuid: "" };
        d.drawText(uid, null, null, null, entry, baseLayer);
        const o = d.canvas.getObjects().filter((ob) => String(ob.text || "") === uid)[0];
        return { uid: uid, w: o && o.width, h: o && o.height, locW: o && o.locationWidth, locH: o && o.locationHeight };
      }
      return { err: "no live CanvasDiy" };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    const clickSave = () => page.evaluate(() => {
      const btn = document.querySelector(".rightBtn .save") || document.querySelector("a.save") || null;
      if (!btn) return { clicked: false };
      try { btn.click(); return { clicked: true }; } catch (e) { return { err: String(e) }; }
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    const fillAndSubmit = () => page.evaluate(() => {
      const log = [];
      const layers = document.querySelectorAll(".layui-layer");
      let host = null;
      for (let i = 0; i < layers.length; i++) { if (layers[i].offsetParent || layers[i].style.display !== "none") { host = layers[i]; break; } }
      const scope = host || document;
      const inputs = scope.querySelectorAll("input[type=text], input:not([type]), textarea");
      const setByLabel = (keys, val) => {
        for (let i = 0; i < inputs.length; i++) {
          const el = inputs[i];
          const label = el.previousElementSibling ? String(el.previousElementSibling.textContent || "") : "";
          const joined = label + String(el.placeholder || "") + String(el.title || "");
          for (let k = 0; k < keys.length; k++) { if (joined.indexOf(keys[k]) >= 0 && !el.__filled) { el.value = val; try { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {} el.__filled = 1; log.push((el.id || "input").toString().slice(0, 24)); return; } }
        }
      };
      setByLabel(["作品", "作品名", "workName", "名称"], "样式还原OCR保存验证");
      setByLabel(["用户", "用户名", "userName", "姓名"], "样式还原测试");
      setByLabel(["备注"], "stage-7.3 unlock7");
      const btns = scope.querySelectorAll("button, a, .layui-layer-btn0, input[type=button]");
      let clicked = null;
      for (let i = 0; i < btns.length; i++) {
        const tx = String(btns[i].textContent || btns[i].value || "").trim();
        if (/确定|保存|提交|确认/.test(tx) && !/取消|关闭|删除/.test(tx)) {
          // 记录该按钮的外层事件绑定摘要（切面：把提交后 6s 的状态变化交给外部轮询）
          try { btns[i].click(); clicked = tx.slice(0, 20); } catch (e) {}
          break;
        }
      }
      return { log: log, clicked: clicked };
    }).catch((e) => ({ err: String(e || "").slice(0, 200) }));

    report.phases.save1 = {};
    report.phases.save1.click = await clickSave();
    await page.waitForTimeout(3500);
    report.phases.save1.fill = await fillAndSubmit();
    // 事件后拉长观察：5s 后再快照
    await page.waitForTimeout(6000);
    report.phases.save1.layers = await page.evaluate(() => { const L = window.__zyLayers || []; window.__zyLayers = []; return L; }).catch(() => []);
    report.phases.save1.bodySnippet = await page.evaluate(() => String(document.body.innerText || "").replace(/\n+/g, " | ").slice(0, 450)).catch((e) => String(e || "").slice(0, 200));
    report.phases.save1.objCount = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
      return vo.totalCanvasArray.map((d) => (d.canvas && d.canvas.getObjects ? d.canvas.getObjects().length : -1));
    }).catch(() => null);
    report.phases.netSnapshot = report.reqs.map((r) => ({ u: r.u, m: r.m, b: r.body ? r.body.slice(0, 200) : null })).filter((r) => /save|order|wangwang|shop|IfDiy/i.test(r.u));
  } catch (e) {
    report.errors.push("fatal: " + String(e && e.message || e).slice(0, 400));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log("STAGE-7.3-SAVE-UNLOCK7 done -> " + REPORT_PATH);
  console.log("ready=" + report.phases.ready);
  console.log("probe=" + JSON.stringify(report.phases.probe));
  console.log("save1-fill=" + JSON.stringify(report.phases.save1 && report.phases.save1.fill));
  console.log("save1-layers=" + JSON.stringify((report.phases.save1 && report.phases.save1.layers || []).map((l) => ({ t: l.title, txt: (l.text || "").slice(0, 70) }))));
  console.log("console(err/warn)=" + JSON.stringify(report.console.slice(0, 25)));
  console.log("writeReqs=" + JSON.stringify((report.reqs || []).filter((r) => /saveThirdUserDesign|saveUserDesign/.test(r.u)).map((r) => ({ m: r.m, u: r.u }))));
  console.log("dialogs=" + JSON.stringify(report.dialogs));
})().catch((e) => { console.error("probe crashed: " + e); process.exit(1); });