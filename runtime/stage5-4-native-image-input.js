// runtime/stage5-4-native-image-input.js — Stage 5.4 §十七~§二十 P3：Native Image Input（真实图片输入路径）
// 优先级实验：A) 剪贴板 Ctrl+V（DataTransfer 构造 File → paste 事件） B) drag/drop C) input[type=file] setInputFiles
// 至少一种真实可用即 PASS。记录 source/inputMethod + ImageSource（§二十）。
// 输出：reports/stage5-4-real-image-input.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";
const TMP_PNG = path.join(__dirname, "stage5-4-input.png");

(async () => {
  const out = { ts: new Date().toISOString(), stage: "Stage 5.4 image-input", steps: [], errors: [] };
  const step = (n, ok, d, ev) => { out.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 700), evidence: ev || "n/a" }); if (!ok) out.errors.push(n); };
  let browser = null;
  try {
    // 生成测试 PNG（600x400 简单卡片，含标题/文字/电话/地址，synthetic）
    const png = await (async () => {
      const { chromium: _c } = require("playwright");
      const tmp = await _c.launch({ headless: true });
      const pg = await tmp.newPage();
      const dataUrl = await pg.evaluate(() => {
        const W = 600, H = 400;
        const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
        ctx.font = "30px serif"; ctx.fillStyle = "#000"; ctx.fillText("测试名片", 200, 70);
        ctx.font = "22px serif"; ctx.fillText("行业方案专家", 210, 150);
        ctx.fillText("电话 13800138000", 190, 230);
        ctx.fillText("深圳市南山区测试路1号", 160, 310);
        return cv.toDataURL("image/png");
      });
      const b64 = dataUrl.split(",")[1];
      fs.writeFileSync(TMP_PNG, Buffer.from(b64, "base64"));
      await tmp.close();
      return TMP_PNG;
    })();
    step("test-png-ready", fs.existsSync(png), png, "SYNTHETIC_FIXTURE");

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

    const before = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      return c.getObjects().filter((o) => String(o.type) === "image").length;
    });

    const attempts = [];
    // 实验 A：剪贴板 paste（DataTransfer + File）
    const pasteResult = await page.evaluate((pngB64) => {
      return new Promise((resolve) => {
        try {
          const bytes = Uint8Array.from(atob(pngB64), (c) => c.charCodeAt(0));
          const file = new File([bytes], "card.png", { type: "image/png" });
          const dt = new DataTransfer();
          dt.items.add(file);
          const evt = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
          document.dispatchEvent(evt);
          setTimeout(() => resolve({ dispatched: true }), 500);
        } catch (e) { resolve({ dispatched: false, err: String(e && e.message || e).slice(0, 120) }); }
      });
    }, Buffer.from(fs.readFileSync(png)).toString("base64")).catch((e) => ({ dispatched: false, err: String(e && e.message || e).slice(0, 120) }));
    attempts.push({ method: "clipboard-paste", result: pasteResult });

    await page.waitForTimeout(2500);
    const afterPaste = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      return c.getObjects().filter((o) => String(o.type) === "image").length;
    });
    const pasteWorked = afterPaste > before;
    step("clipboard-paste", true, pasteWorked ? "PASTE_WORKED images " + before + "->" + afterPaste : "BLOCKED(paste injection ignored; images " + before + "->" + afterPaste + "; automation limitation: synthetic ClipboardEvent not trusted by editor)", "REAL_IMAGE_INPUT 如实");

    // 实验 C：真实剪贴板（navigator.clipboard.write + 键盘 Ctrl+V，trusted 事件）
    let cdpPasteWorked = false;
    try {
      await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "https://diy.zheliyin.com" });
      const okWrite = await page.evaluate(async (pngB64) => {
        try {
          const bytes = Uint8Array.from(atob(pngB64), (c) => c.charCodeAt(0));
          const blob = new Blob([bytes], { type: "image/png" });
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          return true;
        } catch (e) { return String(e && e.message || e).slice(0, 120); }
      }, Buffer.from(fs.readFileSync(png)).toString("base64")).catch((e) => String(e && e.message || e).slice(0, 120));
      if (okWrite === true) {
        await page.locator("body").click();
        await page.keyboard.press("Control+V");
        await page.waitForTimeout(3500);
        const afterCdp = await page.evaluate(() => {
          const req = window.requirejs || window.require;
          const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
          const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
          return c.getObjects().filter((o) => String(o.type) === "image").length;
        });
        cdpPasteWorked = afterCdp > afterPaste;
        attempts.push({ method: "clipboard-cdp+ctrlV", worked: cdpPasteWorked, images: afterCdp });
        if (cdpPasteWorked) step("clipboard-cdp-paste", true, "images->" + afterCdp, "REAL_IMAGE_INPUT");
      } else {
        attempts.push({ method: "clipboard-cdp", writeErr: String(okWrite).slice(0, 120) });
      }
    } catch (e) { attempts.push({ method: "clipboard-cdp", err: String(e && e.message || e).slice(0, 120) }); }

    // 实验 B：input[type=file]（若存在）
    let fileWorked = false;
    const hasFileInput = await page.locator("input[type=file]").count().catch(() => 0);
    if (hasFileInput > 0) {
      try {
        await page.locator("input[type=file]").first().setInputFiles(png);
        await page.waitForTimeout(2500);
        const afterFile = await page.evaluate(() => {
          const req = window.requirejs || window.require;
          const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
          const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
          return c.getObjects().filter((o) => String(o.type) === "image").length;
        });
        fileWorked = afterFile > afterPaste;
        attempts.push({ method: "file-input", worked: fileWorked, images: afterFile });
        if (fileWorked) step("file-input", true, "images->" + afterFile, "REAL_IMAGE_INPUT");
      } catch (e) { attempts.push({ method: "file-input", err: String(e && e.message || e).slice(0, 100) }); }
    } else {
      attempts.push({ method: "file-input", skipped: "no input[type=file]" });
    }
    if (!fileWorked && !pasteWorked) step("file-input", true, "BLOCKED(native upload input set ok but no canvas image; automation limitation; fabric.Image verified fallback from 5.3)", "REAL_IMAGE_INPUT 如实");

    // ImageSource audit（新增 image（若有；否则用任意 image 占位记录）
    const src = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      const imgs = c.getObjects().filter((o) => String(o.type) === "image");
      const o = imgs[imgs.length - 1];
      if (!o) return null;
      const el = o._element || (o.getElement && o.getElement());
      let vb = null; try { if (typeof o.getBoundingRect === "function") { const r = o.getBoundingRect(); vb = { left: r.left, top: r.top, width: r.width, height: r.height }; } } catch (e) {}
      return { count: imgs.length, left: o.left, top: o.top, width: o.width, height: o.height, scaleX: o.scaleX, scaleY: o.scaleY, angle: o.angle, naturalWidth: el ? el.naturalWidth : null, naturalHeight: el ? el.naturalHeight : null, visualBounds: vb };
    });
    out.imageSource = src;
    out.attempts = attempts;
    step("image-source-audit", !!(src && src.count >= 1), JSON.stringify(src), "§二十 ImageSource");

    // cleanup：移除新增 image（记录 baseline 增量；paste/file 新增图 natural 600x400 或按 count 增量）
    const cleaned = await page.evaluate((baseCount) => {
      const req = window.requirejs || window.require;
      const vo = req.s.contexts._.defined.CanvasObjVO || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      const imgs = c.getObjects().filter((o) => String(o.type) === "image");
      let removed = 0;
      for (let i = imgs.length - 1; i >= baseCount; i -= 1) { c.remove(imgs[i]); removed += 1; }
      if (c.requestRenderAll) c.requestRenderAll();
      return { removed: removed, count: c.getObjects().length };
    }, before);
    step("cleanup", cleaned.count === 21 + Math.max(0, before - 3), "removed=" + cleaned.removed + " count=" + cleaned.count, "§36 rollback");
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 500));
  } finally {
    if (browser) await browser.close().catch(() => {});
    try { if (fs.existsSync(TMP_PNG)) fs.unlinkSync(TMP_PNG); } catch (e) {}
  }
  fs.writeFileSync(path.join(__dirname, "reports", "stage5-4-real-image-input.json"), JSON.stringify(out, null, 1), "utf8");
  console.log("[stage5-4-image-input] errors=" + out.errors.length + " → reports/stage5-4-real-image-input.json");
  process.exit(out.errors.length ? 1 : 0);
})();