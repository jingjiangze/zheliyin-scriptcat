// 归档本地脚本到仓库 docs/archive/seal-0.3.11.91/（含密钥扫描；排除凭据文件与派生副本）
"use strict";
const fs = require("fs");
const path = require("path");
const SRC = __dirname;
const DST = "D:/zheliyin-scriptcat/docs/archive/seal-0.3.11.91";
fs.mkdirSync(DST, { recursive: true });

const EXCLUDE_EXACT = new Set([".zy-ai-key.tmp"]);
const files = fs.readdirSync(SRC)
  .filter((f) => fs.statSync(path.join(SRC, f)).isFile())
  .filter((f) => !EXCLUDE_EXACT.has(f))
  .filter((f) => !/\.nobom\.txt$/i.test(f))            // 机械化派生（去 BOM 副本）
  .filter((f) => !/^(demo-us|test-us)\.js$/i.test(f))  // 脚本全量副本（git 历史已有真源）
  .filter((f) => /\.(cjs|txt|js|json|log)$/i.test(f));

const suspicious = [];
let copied = 0, bytes = 0;
for (const f of files) {
  const buf = fs.readFileSync(path.join(SRC, f));
  const txt = buf.toString("utf8");
  [
    /sk-[A-Za-z0-9_\-]{16,}/g,
    /(api[_-]?key\s*[:=]\s*)[A-Za-z0-9_\-]{24,}/gi,
    /ZY_AI_KEY\s*[:=]\s*["']?[A-Za-z0-9_\-]{24,}/g,
    /Bearer\s+[A-Za-z0-9_\-.]{24,}/g
  ].forEach((p) => { const m = txt.match(p); if (m) suspicious.push(f + " :: " + String(m[0]).slice(0, 70)); });
  fs.writeFileSync(path.join(DST, f), buf);
  copied += 1; bytes += buf.length;
}
console.log("archived files=" + copied + " bytes=" + bytes);
console.log("dst=" + DST);
console.log("suspicious(" + suspicious.length + ")=" + JSON.stringify(suspicious.slice(0, 10)));
