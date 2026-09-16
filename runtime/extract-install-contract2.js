// runtime/extract-install-contract2.js — 追踪 proxy.do() → runtime message router → install handler（只读）
"use strict";
const path = require("path");
const fs = require("fs");

function ctx(file, symbol, before = 90, after = 260, max = 12) {
  const raw = fs.readFileSync(path.join(__dirname, "vendor", "scriptcat", "src", file), "utf8");
  const res = [];
  let i = 0;
  while ((i = raw.indexOf(symbol, i)) !== -1 && res.length < max) {
    const s = Math.max(0, i - before);
    res.push({ i, s: raw.substring(s, Math.min(raw.length, i + after)).replace(/\s+/g, " ") });
    i += symbol.length;
  }
  return res;
}

const out = {};
// 1) proxy class 的 do()/doThrow() 实现（如何发消息）
out["chunk.proxy-do-impl"] = ctx("chunk.js", "doThrow(", 60, 300);
// 2) service worker 的 message router：收到 installByCode 后如何分发
//    找 "group.on(\"installByCode\"" 所在类 + 消息连接
out["sw.group-installByCode"] = ctx("service_worker.js", 'group.on("installByCode"', 120, 320);
// 3) installScript 实现
out["sw.installScript"] = ctx("service_worker.js", "installScript(", 60, 400, 8);
// 4) 元数据解析 n4（解析 userscript 头）
out["sw.n4-parser"] = ctx("service_worker.js", "n4(", 40, 120, 6);
// 5) 消息路由：可能用 port 或 onMessage（找 runtime.onMessage 附近）
out["sw.newMsgProxy"] = ctx("service_worker.js", "new sK(e)", 200, 200, 3);
// 6) ProxyBase 里 do 的实际发送（在 chunk 找 "do(" 定义 near 类）
out["chunk.do-impl"] = ctx("chunk.js", ".do(\"", 40, 160, 4);
fs.writeFileSync(path.join(__dirname, "reports", "scriptcat-install-contract2.json"), JSON.stringify(out, null, 1), "utf8");
console.log(JSON.stringify(out, null, 1));