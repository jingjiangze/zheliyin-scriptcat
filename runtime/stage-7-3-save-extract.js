// runtime/stage-7-3-save-extract.js — 提取保存主函数（CustomerHeadMenuBarThird.js）关键上下文
"use strict";
const path = require("path");
const fs = require("fs");

const FILE = path.join(__dirname, "downloads", "save-scan", "CustomerHeadMenuBarThird.js-v20260707017");
const OUT = path.join(__dirname, "reports", "stage-7-3-save-extract.json");
const KEYWORDS = ["IfDiyOrderidExit", "saveThirdUserDesign", "getShopAndWangWangInfo", "tbOrderNo", "thirdOrderNo", "workOrderNum", "designId", "function save", "save=", "Orderid", "orderid", "queryThirdOrder", "getOrderInfo"];

const txt = fs.readFileSync(FILE, "utf8");
const re = new RegExp(KEYWORDS.join("|"), "g");
const hits = [];
let m;
while ((m = re.exec(txt)) !== null) {
  const s = Math.max(0, m.index - 300);
  const e = Math.min(txt.length, m.index + m[0].length + 700);
  hits.push({ kw: m[0], idx: m.index, seg: txt.slice(s, e) });
}
const byKw = {};
hits.forEach((h) => { if (!byKw[h.kw]) byKw[h.kw] = []; if (byKw[h.kw].length < 3) byKw[h.kw].push(h); });
fs.writeFileSync(OUT, JSON.stringify({ file: FILE, len: txt.length, totalHits: hits.length, groups: byKw }, null, 2));
console.log("totalHits=" + hits.length + " groups=" + Object.keys(byKw).join(","));
Object.keys(byKw).forEach((k) => { console.log("== " + k + " (" + byKw[k].length + ") =="); byKw[k].forEach((h) => console.log("  @" + h.idx + "\n  " + h.seg.replace(/[\n\r]+/g, " ").slice(0, 500))); });