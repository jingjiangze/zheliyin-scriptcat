// runtime/stage9/img-load-probe.js — 探针：playwright headless 中 dataUrl 图片加载失败原因
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("../../node_modules/playwright");
const ROOT = path.join(__dirname, "..", "..");
const CARD = path.join(ROOT, "runtime", "stage8b", "assets", "real-card-shengying.png");
(async () => {
  const dataUrl = "data:image/png;base64," + fs.readFileSync(CARD).toString("base64");
  console.log("dataUrl len=" + dataUrl.length + " head=" + dataUrl.slice(0, 40));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const r = await page.evaluate((arg) => new Promise((resolve) => {
    const out = { len: arg.length };
    const im = new Image();
    im.decoding = "async";
    im.onload = () => { out.loaded = true; out.w = im.naturalWidth; out.h = im.naturalHeight; resolve(out); };
    im.onerror = (e) => { out.loaded = false; out.errType = "onerror"; out.msg = String(typeof e === "object" && e ? (e.message || e.type) : e); resolve(out); };
    im.src = arg;
    setTimeout(() => { if (!out.loaded) { out.timedOut = true; resolve(out); } }, 8000);
  }), dataUrl);
  console.log(JSON.stringify(r));
  await browser.close();
})();