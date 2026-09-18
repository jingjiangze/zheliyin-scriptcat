// runtime/stage-7-3-save-source3.js — t4 v6：本地批量下载编辑器 JS → grep 保存关键字
// 输入：runtime/reports/stage-7-3-save-unlock2.json（reqSeq 里的全量 JS URL）
// 输出：runtime/downloads/save-scan/*.js（本地） + runtime/reports/stage-7-3-save-source3.json（命中索引）
"use strict";
const path = require("path");
const fs = require("fs");
const https = require("https");

const REPORT_PATH = path.join(__dirname, "reports", "stage-7-3-save-source3.json");
const LIST_SRC = path.join(__dirname, "reports", "stage-7-3-save-unlock2.json");
const DOWN_DIR = path.join(__dirname, "downloads", "save-scan");
const KEYWORDS = ["IfDiyOrderidExit", "saveThirdUserDesign", "getShopAndWangWangInfo", "saveThirdUser", "saveProduct", "autosave", "autoSaveIntervalMillisecond", "workOrderNum", "designId", "tbOrderNo", "saveDesign", "saveUserDesign"];

const get = (url, timeoutMs) => new Promise((resolve) => {
  const u = new URL(url);
  const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: "GET", headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://diy.zheliyin.com/" } }, (res) => {
    const chunks = [];
    res.on("data", (c) => chunks.push(c));
    res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
  });
  req.setTimeout(timeoutMs || 15000, () => { try { req.destroy(); } catch (e) {} resolve({ status: 0, body: "" }); });
  req.on("error", () => resolve({ status: 0, body: "" }));
  req.end();
});

(async () => {
  const list = JSON.parse(fs.readFileSync(LIST_SRC, "utf8"));
  const urls = new Set();
  (list.reqSeq || []).forEach((r) => { const m = /(https:\/\/diy\.zheliyin\.com\/diyWeb\/.*?\.js(\?v=[0-9]+)?)/.exec(r.u); if (m) urls.add(m[1]); });
  const arr = Array.from(urls);
  fs.mkdirSync(DOWN_DIR, { recursive: true });

  const re = new RegExp(KEYWORDS.join("|"), "g");
  const report = { ts: new Date().toISOString(), stage: "STAGE-7.3-SAVE-SOURCE3", totalUrls: arr.length, hits: [] };
  for (let i = 0; i < arr.length; i++) {
    const u = arr[i];
    const name = u.split("/").pop().replace(/\?v=/i, "-v");
    const fpath = path.join(DOWN_DIR, name);
    const r = await get(u);
    if (r.status === 200) { try { fs.writeFileSync(fpath, r.body); } catch (e) {} }
    else continue;
    // 命中检查（本地读）
    const txt = r.body;
    re.lastIndex = 0;
    const localHit = [];
    let m;
    while ((m = re.exec(txt)) !== null && localHit.length < 6) localHit.push({ kw: m[0], idx: m.index });
    if (localHit.length) {
      const byKw = {};
      localHit.forEach((h) => { if (!byKw[h.kw]) byKw[h.kw] = h; });
      report.hits.push({ file: name, url: u, len: txt.length, kws: Object.keys(byKw).slice(0, 6), sample: byKw[localHit[0].kw] ? null : null });
    }
    process.stdout.write((i + 1) + "/" + arr.length + " " + name + " " + r.status + " hits=" + localHit.length + "\n");
  }
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log("STAGE-7.3-SAVE-SOURCE3 done -> " + REPORT_PATH + " hitFiles=" + report.hits.length);
})().catch((e) => { console.error("crashed: " + e); process.exit(1); });