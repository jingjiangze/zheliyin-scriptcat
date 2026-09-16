// runtime/extract-install-contract3.js — 确认 message envelope + options 页访问路径（只读）
"use strict";
const path = require("path");
const fs = require("fs");

function ctx(file, symbol, before = 80, after = 300, max = 10) {
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
// msgSender 如何打包消息（找 s= 的定义，即 do 里用的 send 封装）
out["chunk.msg-send-envelope"] = ctx("chunk.js", "function s(e,t,n){", 120, 360, 3);
out["chunk.msg-send-envelope-b"] = ctx("chunk.js", "s(", 20, 120, 5).filter(x => /sendMessage|postMessage|method|action|channel/i.test(x.s));
// 前缀如何组 key：msgSender 里是否 `${prefix}/${action}` 拼接
out["chunk.msgSenderReceiver"] = ctx("chunk.js", "this.prefix", 60, 180, 6);
// script proxy 前缀确认（serviceWorker/script）
out["chunk.scriptProxyPrefix"] = ctx("chunk.js", 'super(e,"serviceWorker/script")', 40, 60, 2);
// options 页 import 的 proxy：options.js 里是否 import/实例化 (找 serviceWorker/script 或 install 调用）
out["options.proxyUsage"] = ctx("options.js", "install(", 60, 140, 6);
out["options.importScriptProxy"] = ctx("options.js", "serviceWorker/script", 80, 120, 4);
fs.writeFileSync(path.join(__dirname, "reports", "scriptcat-install-contract3.json"), JSON.stringify(out, null, 1), "utf8");
console.log(JSON.stringify(out, null, 1));