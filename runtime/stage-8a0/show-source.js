// runtime/stage-8a0/show-source.js — 打印 ocr-source-image.json 结构（审计用）
"use strict";
const fs = require("fs");
const path = require("path");
const r = require(path.join(__dirname, "..", "reports", "stage-8a0", "ocr-source-image.json"));
r.fixtures.forEach((f) => {
  const p = f.pageAudit || {};
  console.log("===" + f.id, "ok=" + p.ok, "cc=" + p.currentCanvasNum);
  (p.pages || []).forEach((pg) => {
    const bg = pg.backgroundImage;
    console.log("  page[" + pg.canvasIndex + "] id=" + pg.pageId + " side=" + pg.side + " canvas=" + pg.canvasWidth + "x" + pg.canvasHeight + " objs=" + pg.objectCount + " images=" + (pg.images || []).length);
    (pg.images || []).forEach((im, i) => {
      console.log("    img[" + i + "] w=" + im.width + " h=" + im.height + " sx=" + im.scaleX + " sy=" + im.scaleY + " x=" + im.x + " y=" + im.y + " el=" + JSON.stringify(im.element));
    });
    if (bg) console.log("    bg w=" + bg.width + " h=" + bg.height + " sx=" + bg.scaleX + " sy=" + bg.scaleY + " l=" + bg.left + " t=" + bg.top + " cropX=" + bg.cropX + " cropY=" + bg.cropY + " el=" + JSON.stringify(bg.element));
    else console.log("    bg=none");
  });
});