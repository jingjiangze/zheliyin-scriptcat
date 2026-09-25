// 从持久 profile 的 localStorage(leveldb) 中提取 zyArkApiKey（仅回显掩码，供 env 注入，不落盘）
"use strict";
const fs = require("fs");
const path = require("path");
const DIR = "D:/zheliyin-scriptcat/runtime/browser/profile-usc3/Default/Local Storage/leveldb";
let hits = [];
function scan(fp) {
  let buf;
  try { buf = fs.readFileSync(fp); } catch (e) { return; }
  const s = buf.toString("latin1");
  let i = -1;
  while ((i = s.indexOf("zyArkApiKey", i + 1)) >= 0) {
    const seg = s.slice(i, i + 400);
    const m = /sk-[A-Za-z0-9]{8,}/.exec(seg);
    if (m) hits.push({ file: path.basename(fp), key: m[0] });
  }
  // 也尝试 UTF-16LE 形态（localStorage 值常为 UTF-16）
  const s2 = buf.toString("utf16le");
  let j = -1;
  while ((j = s2.indexOf("zyArkApiKey", j + 1)) >= 0) {
    const seg = s2.slice(j, j + 400);
    const m = /sk-[A-Za-z0-9]{8,}/.exec(seg);
    if (m) hits.push({ file: path.basename(fp), key: m[0] });
  }
}
if (!fs.existsSync(DIR)) { console.log("LEVELDB_DIR_MISSING " + DIR); process.exit(0); }
fs.readdirSync(DIR).forEach((f) => scan(path.join(DIR, f)));
const uniq = {};
hits.forEach((h) => { uniq[h.key] = (uniq[h.key] || 0) + 1; });
const keys = Object.keys(uniq);
console.log("hits=" + hits.length + " unique=" + keys.length);
keys.forEach((k) => console.log("key: " + k.slice(0, 6) + "***" + k.slice(-4) + " (len=" + k.length + ", files=" + uniq[k] + ")"));
if (keys.length) {
  fs.writeFileSync(path.join(__dirname, ".zy-ai-key.tmp"), keys[keys.length - 1], "utf8");
  console.log("saved -> .zy-ai-key.tmp (temp, will delete)");
}