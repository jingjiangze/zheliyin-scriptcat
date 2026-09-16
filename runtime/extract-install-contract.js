// runtime/extract-install-contract.js — 从 ScriptCat bundle 提取安装链路符号证据（只读，输出经过裁剪的上下文）
"use strict";
const path = require("path");
const fs = require("fs");

function extract(file, symbol, ctx = 220, max = 15) {
  const raw = fs.readFileSync(file, "utf8");
  const res = [];
  let i = 0;
  while ((i = raw.indexOf(symbol, i)) !== -1 && res.length < max) {
    const s = Math.max(0, i - 120);
    res.push(raw.substring(s, Math.min(raw.length, i + ctx)).replace(/\s+/g, " "));
    i += symbol.length;
  }
  return res;
}

const dir = path.join(__dirname, "vendor", "scriptcat", "src");
const targets = {
  "service_worker.onMessage": ["service_worker.js", "onMessage"],
  "service_worker.installByCode": ["service_worker.js", "installByCode"],
  "service_worker.userScripts.register": ["service_worker.js", "userScripts.register"],
  "service_worker.temp_install_codes": ["service_worker.js", "temp_install_codes"],
  "service_worker.installByUrl": ["service_worker.js", "installByUrl"],
  "chunk.installByCode": ["chunk.js", "installByCode"],
  "chunk.installByUrl": ["chunk.js", "installByUrl"],
  "chunk.userScripts.register": ["chunk.js", "userScripts.register"],
  "chunk.proxies": ["chunk.js", "installByCode"],
  "options.proxies": ["options.js", "installByCode"],
  "install.installByCode": ["install.js", "installByCode"],
  "inject.installByCode": ["inject.js", "installByCode"],
  "import.installByCode": ["import.js", "installByCode"]
};
const out = {};
for (const [k, [f, sym]] of Object.entries(targets)) {
  const fp = path.join(dir, f);
  if (!fs.existsSync(fp)) { out[k] = { file: f, symbol: sym, hits: "FILE_MISSING" }; continue; }
  const hits = extract(fp, sym);
  out[k] = { file: f, symbol: sym, hitCount: hits.length, samples: hits.slice(0, 4) };
}
fs.writeFileSync(path.join(__dirname, "reports", "scriptcat-install-symbols.json"), JSON.stringify(out, null, 1), "utf8");
console.log(JSON.stringify(out, null, 1));