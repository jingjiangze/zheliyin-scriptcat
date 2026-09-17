/** 导出 demo 分支的 @require 依赖模块到本地，供真机注入使用 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const REPO = "C:\\Users\\Administrator\\WorkBuddy\\2026-09-16-12-13-35\\zheliyin-scriptcat";
const GIT = "C:\\Program Files\\Git\\cmd\\git.exe";
const REV = process.argv[2] || "e941e6d";
const OUT = path.join(REPO, "ui-audit", "ui2-env", "modules");

const FILES = [
  "fields/field-core.js",
  "core/config-core.js",
  "ai/ai-client.js",
  "editor/page-bridge.js",
  "editor/object-model.js",
  "editor/object-adapter.js",
  "editor/object-matcher.js",
  "ocr/baidu-provider.js",
  "ocr/fallback-policy.js",
  "ocr/candidate-normalizer.js",
  "ocr/credential-crypto.js",
  "ocr/ocr-model.js",
  "ocr/image-mapper.js",
  "ocr/ocr-provider.js",
  "ocr/tesseract-loader.js",
];

fs.mkdirSync(OUT, { recursive: true });
const report = [];
for (const f of FILES) {
  const rel = "extension/src/" + f;
  try {
    const buf = execFileSync(GIT, ["-C", REPO, "cat-file", "blob", `${REV}:${rel}`], { maxBuffer: 32 * 1024 * 1024 });
    const flat = f.replace(/\//g, "__");
    fs.writeFileSync(path.join(OUT, flat), buf);
    report.push(`${f} -> ${flat} (${buf.length} B) OK`);
  } catch (e) {
    report.push(`${f} -> FAIL ${e.message.slice(0, 80)}`);
  }
}
fs.writeFileSync(path.join(OUT, "_index.txt"), report.join("\n"), "utf8");
console.log(report.join("\n"));
