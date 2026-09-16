// runtime/stage5-3-image-upload.js — Stage 5.3 §十三/§十四/§五十：真实图片进入 Editor + ImageSource Audit
// 1) 页面内 canvas 绘制脱敏测试图（标题 + 一行普通文字 + 电话 + 地址；synthetic 非真实客户数据）
// 2) 优先原生图片上传（input[type=file] setInputFiles）；无则 fabric.Image 创建真实 image object（记录方式）
// 3) ImageSource：naturalWidth/Height（若有）+ canvas object width/height/scale/left/top/angle
// 输出：reports/stage5-3-image-transform.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";

(async () => {
  const out = { ts: new Date().toISOString(), stage: "Stage 5.3 image-upload", steps: [], errors: [] };
  const step = (n, ok, d, ev) => { out.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 700), evidence: ev || "n/a" }); if (!ok) out.errors.push(n); };
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    const page = browser.pages()[0];
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => step("nav", false, String(e && e.message || e)));
    step("nav", true, "真实编辑器已打开", "REAL_EDITOR");
    const deadline = Date.now() + 150000;
    let ready = false;
    while (Date.now() < deadline) {
      ready = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const vo = req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO;
        return !!vo;
      }).catch(() => false);
      if (ready) break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    step("editor-ready", ready, "CanvasObjVO 就绪", "REAL_EDITOR");
    if (!ready) return;

    // 页面内：绘制脱敏测试图 → dataURL + 各行文字 bbox（绘制坐标 = OCR ground-truth）
    const drawn = await page.evaluate(() => {
      const W = 600, H = 400;
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
      // synthetic 测试文本（非真实客户数据）
      const lines = [
        { text: "测试名片", y: 70, size: 30, color: "#000000" },
        { text: "行业方案专家", y: 150, size: 22, color: "#333333" },
        { text: "电话 13800138000", y: 230, size: 22, color: "#000000" },
        { text: "深圳市南山区测试路1号", y: 310, size: 22, color: "#444444" }
      ];
      const rows = lines.map((l) => {
        ctx.font = l.size + "px 微软雅黑, sans-serif";
        ctx.fillStyle = l.color;
        const m = ctx.measureText(l.text);
        const x = (W - m.width) / 2;
        ctx.fillText(l.text, x, l.y);
        return { text: l.text, x: x, y: l.y - l.size * 0.8, width: m.width, height: l.size * 1.1 };
      });
      return { width: W, height: H, dataUrl: c.toDataURL("image/png"), rows: rows };
    });
    step("test-image-drawn", !!(drawn && drawn.dataUrl && drawn.dataUrl.length > 100), "img dataUrl len=" + (drawn && drawn.dataUrl.length) + " rows=" + (drawn && drawn.rows && drawn.rows.length), "SYNTHETIC_FIXTURE");

    // 写临时 PNG（native file input 用）
    const b64 = drawn.dataUrl.split(",")[1];
    const tmpPng = path.join(__dirname, "tmp-test-card.png");
    fs.writeFileSync(tmpPng, Buffer.from(b64, "base64"));
    step("tmp-png-written", fs.existsSync(tmpPng), "tmp=" + tmpPng, "n/a");

    // 探测原生 file input
    const fileInput = await page.evaluate(() => {
      const inps = Array.prototype.slice.call(document.querySelectorAll("input[type=file]"));
      return inps.map((i) => ({ accept: i.accept || "", multiple: !!i.multiple, visible: !!(i.offsetParent) })).slice(0, 6);
    }).catch(() => []);
    out.nativeFileInputs = fileInput;

    let imageAdded = false;
    let method = null;
    const realInput = fileInput.find((i) => i.visible !== false && i.accept && /image|png|jpg/i.test(i.accept));
    if (realInput) {
      try {
        // 选择 file input（第一个接受的）
        const handle = await page.locator("input[type=file][accept*=image], input[type=file][accept*=png], input[type=file][accept*=jpg]").first();
        if (await handle.count()) {
          await handle.setInputFiles(tmpPng);
          method = "NATIVE_FILE_INPUT";
          await page.waitForTimeout(3000);
          imageAdded = true;
        }
      } catch (e) { method = "NATIVE_FILE_INPUT_FAILED:" + String(e && e.message || e).slice(0, 80); }
    }
    if (!imageAdded) {
      // fabric.Image 原生创建（真实 image object）
      const r = await page.evaluate((dataUrl) => new Promise((res) => {
        const img = new Image();
        img.onload = () => {
          const req = window.requirejs || window.require;
          const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
          const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
          const f = window.fabric;
          try {
            const fi = new f.Image(img, { left: 60, top: 40, scaleX: 0.5, scaleY: 0.5, selectable: true });
            c.add(fi);
            if (c.requestRenderAll) c.requestRenderAll();
            c.setActiveObject(fi);
            res({ ok: true, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, count: c.getObjects().length });
          } catch (e) { res({ ok: false, err: String(e && e.message || e).slice(0, 200) }); }
        };
        img.onerror = () => res({ ok: false, err: "image load error" });
        img.src = dataUrl;
      }), drawn.dataUrl).catch((e) => ({ ok: false, err: String(e && e.message || e).slice(0, 200) }));
      imageAdded = r && r.ok === true;
      method = "FABRIC_IMAGE_NATIVE";
      out.fabricAdd = r;
    }
    step("image-added-to-canvas", imageAdded === true, "method=" + method + " count=" + (out.fabricAdd && out.fabricAdd.count), "REAL_IMAGE");
    if (!imageAdded) return;

    // ImageSource audit：最后添加的 image object（fabricAdd 或 file input 生成的）
    const src = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      const objs = c.getObjects();
      const imgs = objs.filter((o) => o && String(o.type) === "image");
      const o = imgs[imgs.length - 1];
      const el = o && (o._element || (o.getElement && o.getElement()) || null);
      return o ? {
        left: o.left, top: o.top, width: o.width, height: o.height, scaleX: o.scaleX, scaleY: o.scaleY, angle: o.angle,
        naturalWidth: el ? el.naturalWidth : null,
        naturalHeight: el ? el.naturalHeight : null,
        imageCount: imgs.length
      } : null;
    });
    out.imageSource = src;
    step("image-source-audit", !!(src && src.width > 0 && src.naturalWidth > 0), JSON.stringify(src), "§十四 ImageSource");

    // 清理：删除我们添加的图片对象（保持模板 21 对象）
    const cleaned = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      // 仅移除自然尺寸 = 测试图尺寸的 image（临时）
      const imgs = c.getObjects().filter((o) => o && String(o.type) === "image");
      const el = imgs[imgs.length - 1] && (imgs[imgs.length - 1]._element || (imgs[imgs.length - 1].getElement && imgs[imgs.length - 1].getElement()));
      if (el && el.naturalWidth === 600 && el.naturalHeight === 400) { c.remove(imgs[imgs.length - 1]); if (c.requestRenderAll) c.requestRenderAll(); return { removed: true, count: c.getObjects().length }; }
      return { removed: false, count: c.getObjects().length };
    });
    step("cleanup-image", cleaned.removed === true && cleaned.count === 21, "count=" + cleaned.count, "§三十六 rollback");
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 500));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.writeFileSync(path.join(__dirname, "reports", "stage5-3-image-transform.json"), JSON.stringify(out, null, 1), "utf8");
  console.log("[stage5-3-image-upload] errors=" + out.errors.length + " → reports/stage5-3-image-transform.json");
  process.exit(out.errors.length ? 1 : 0);
})();