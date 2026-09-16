// runtime/extract-install-contract5.js — 定位 s() 内部：method 封装 key
"use strict";
const path = require("path");
const fs = require("fs");

const raw = fs.readFileSync(path.join(__dirname, "vendor", "scriptcat", "src", "chunk.js"), "utf8");

function ctx(sym, before = 90, after = 420, max = 6) {
  const res = [];
  let i = 0;
  while ((i = raw.indexOf(sym, i)) !== -1 && res.length < max) {
    const s = Math.max(0, i - before);
    res.push({ i, s: raw.substring(s, Math.min(raw.length, i + after)).replace(/\s+/g, " ") });
    i += sym.length;
  }
  return res;
}

const out = {};
// s() 定义：模式 s(e,t,n) 在 class n.Kj 外。搜 "function s(" 或 "let s="）
out["def"] = ctx("let s=", 40, 300, 5);
out["def2"] = ctx("function s(", 40, 300, 5);
out["def3"] = ctx("const s=", 40, 300, 5);
// sendMessage 内部对 key 的组装：搜 `${t}` 或 ":"+ 拼接（msgSender 模式的 key: payload）
out["keyJoin"] = ctx('key:', 60, 200, 4);
out["keyJoin2"] = ctx("payload", 60, 180, 4);
fs.writeFileSync(path.join(__dirname, "reports", "scriptcat-install-contract5.json"), JSON.stringify(out, null, 1), "utf8");
console.log(JSON.stringify(out, null, 1).slice(0, 5000));