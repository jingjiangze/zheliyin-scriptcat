// runtime/extract-install-contract4.js — 定位 msgSender (80413) 实现与 envelope（只读）
"use strict";
const path = require("path");
const fs = require("fs");

function ctxOfRaw(raw, symbol, before = 80, after = 340, max = 8) {
  const res = [];
  let i = 0;
  while ((i = raw.indexOf(symbol, i)) !== -1 && res.length < max) {
    const s = Math.max(0, i - before);
    res.push({ i, s: raw.substring(s, Math.min(raw.length, i + after)).replace(/\s+/g, " ") });
    i += symbol.length;
  }
  return res;
}

const raw = fs.readFileSync(path.join(__dirname, "vendor", "scriptcat", "src", "chunk.js"), "utf8");

const out = {};
// module 80413 定义（class A/msgSender）。定位 "80413" module 分割点
out["chunk.80413"] = ctxOfRaw(raw, "80413(", 40, 500, 4);
// A 的 sendMessage 封装：找 class A / postMessage / sendMessage to runtime
out["chunk.extMsg"] = ctxOfRaw(raw, "runtime.sendMessage(", 60, 260, 6);
out["chunk.extMsg2"] = ctxOfRaw(raw, "chrome.runtime.sendMessage", 60, 260, 6);
out["chunk.methodKey"] = ctxOfRaw(raw, '"method"', 40, 180, 6);
out["chunk.actionKey"] = ctxOfRaw(raw, '"action"', 40, 180, 6);
out["chunk.portKey"] = ctxOfRaw(raw, '"port"', 40, 180, 4);
fs.writeFileSync(path.join(__dirname, "reports", "scriptcat-install-contract4.json"), JSON.stringify(out, null, 1), "utf8");
console.log(JSON.stringify(out, null, 1).slice(0, 6000));