// runtime/stage9/inspect-ocrhtml.js — 本地 HTML 取证（OCRTool.do / jsj index）
"use strict";
const fs = require("fs");
for (const f of ["runtime/stage9/ocrtool.html", "runtime/stage9/jsj-index.html"]) {
  if (!fs.existsSync(f)) { console.log("=== ", f, " MISSING"); continue; }
  const s = fs.readFileSync(f, "utf8");
  console.log("=== ", f, " len=" + s.length);
  const m = s.match(/(?:ocr|OCR|识别|提取)[A-Za-z_./?:=&\-"']{0,80}/g);
  console.log("ocr-hits:", (m || []).slice(0, 25).join(" | "));
  const scripts = s.match(/src="([^"]+\.js[^"]*)"/g);
  console.log("scripts:", (scripts || []).slice(0, 40).join(" | "));
  const forms = s.match(/<form[^>]*>/g);
  console.log("forms:", (forms || []).slice(0, 6).join(" | "));
  const action = s.match(/action="([^"]+)"/g);
  console.log("actions:", (action || []).slice(0, 10).join(" | "));
  const loc = s.match(/location(?:\.href)?\s*=\s*["'][^"']+["']/g);
  console.log("locationAssigns:", (loc || []).slice(0, 10).join(" | "));
}