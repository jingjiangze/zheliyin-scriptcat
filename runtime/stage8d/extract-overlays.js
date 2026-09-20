// runtime/stage8d/extract-overlays.js — Stage 8D P7：从真机报告提取三视图 overlay PNG
// 用法：node runtime/stage8d/extract-overlays.js <reportJson> <outDir>
// 输出：{outDir}/real-card-ocr-raw.png / real-card-ocr-filtered.png / real-card-ocr-reconstructed.png
// 纯工具（evidence），不升版、不改生产。
"use strict";
const fs = require("fs");
const path = require("path");

const reportPath = process.argv[2];
const outDir = process.argv[3];
if (!reportPath || !outDir) { console.error("usage: node extract-overlays.js <reportJson> <outDir>"); process.exit(2); }
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const caseRec = (report.cases || [])[0];
if (!caseRec || !caseRec.overlay || !caseRec.overlay.views) { console.error("report has no overlay views"); process.exit(3); }
fs.mkdirSync(outDir, { recursive: true });
const mapping = { raw: "real-card-ocr-raw.png", filtered: "real-card-ocr-filtered.png", reconstructed: "real-card-ocr-reconstructed.png" };
for (const [key, fname] of Object.entries(mapping)) {
  const dataUrl = caseRec.overlay.views[key];
  if (!dataUrl) { console.log("skip (no view):", key); continue; }
  const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!m) { console.log("skip (bad dataurl):", key); continue; }
  const fp = path.join(outDir, fname);
  fs.writeFileSync(fp, Buffer.from(m[1], "base64"));
  console.log("wrote " + fp + " (" + fs.statSync(fp).size + " bytes)");
}
console.log("meta: rawWords=" + caseRec.overlay.rawWords + " filteredLines=" + caseRec.overlay.filteredLines + " w=" + caseRec.overlay.w + " h=" + caseRec.overlay.h);