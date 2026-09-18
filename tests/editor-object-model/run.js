// tests/editor-object-model/run.js — Stage 5.0 §四十二：无浏览器单测聚合运行器
// 用法：node tests/editor-object-model/run.js
"use strict";
const path = require("path");
const { spawnSync } = require("child_process");

const files = ["object-model.test.js", "object-adapter.test.js", "object-diff.test.js", "object-matcher.test.js", "ocr-model.test.js", "image-mapper.test.js", "ocr-provider.test.js", "baidu-provider.test.js", "fallback-policy.test.js", "candidate-normalizer.test.js", "credential-crypto.test.js", "tesseract-loader.test.js", "ocr-quality.test.js", "common-schema.test.js", "ocr-text-sanitizer.test.js", "ocr-size-analyzer.test.js"];
let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: "utf8" });
  process.stdout.write("== " + f + " ==\n" + r.stdout);
  if (r.status !== 0) { process.stderr.write(r.stderr); failed += 1; }
}
console.log(failed ? "editor-object-model: " + failed + " FAILED" : "editor-object-model: ALL " + files.length + " SUITES PASS");
process.exit(failed ? 1 : 0);