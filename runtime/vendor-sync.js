// runtime/vendor-sync.js — 从本机真实 ScriptCat 安装目录复制到 runtime/vendor/scriptcat（§4）
// 说明：vendor 已 gitignore（第三方扩展副本不入库）；调试/验证前运行本脚本同步。
// 用法：node runtime/vendor-sync.js
"use strict";
const path = require("path");
const fs = require("fs");

const DEST = path.join(__dirname, "vendor", "scriptcat");

// 探测本机 ScriptCat 安装目录（Chrome/Edge 默认 profile + 常见扩展 id）
const CANDIDATES = [
  process.env.ZY_SCRIPTCAT_DIR,
  "C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Extensions\\ndcooeababalnlpkfedmmbbbgkljhpjf",
  "C:\\Users\\Administrator\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Extensions\\ndcooeababalnlpkfedmmbbbgkljhpjf"
];
// 展平版本目录（manifest.json 所在的子目录）
function resolveSource() {
  for (const c of CANDIDATES) {
    if (!c || !fs.existsSync(c)) continue;
    // 直接有 manifest → 即源；否则找 version_0 子目录
    if (fs.existsSync(path.join(c, "manifest.json"))) return c;
    const subs = fs.existsSync(c) ? fs.readdirSync(c) : [];
    for (const s of subs) {
      const p = path.join(c, s);
      if (fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, "manifest.json"))) return p;
    }
  }
  return null;
}

const src = resolveSource();
if (!src) {
  console.log("SCRIPT_CAT_PACKAGE_NOT_FOUND: 未找到本机 ScriptCat 扩展目录。可用环境变量 ZY_SCRIPTCAT_DIR 指定。");
  process.exit(2);
}
fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
fs.cpSync(src, DEST, { recursive: true });
const files = fs.readdirSync(DEST);
const ok = ["manifest.json", "src"].every((x) => fs.existsSync(path.join(DEST, x)));
console.log(JSON.stringify({ src, dest: DEST, files: files.length, integrity: ok ? "PASS" : "FAIL" }, null, 1));
process.exit(ok ? 0 : 1);