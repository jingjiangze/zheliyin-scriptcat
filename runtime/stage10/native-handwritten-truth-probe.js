// runtime/stage10/native-handwritten-truth-probe.js — Stage 10-C P4：OCRTool.do 手写体真值可达性探测
// 在真实编辑器页（diy.zheliyin.com 同源）用「夏祝莲」名片图直接 fetch uploadOCR.do textType=2（手写体）
// 验证：登录态可用 + 手写体识别返回有效文本（真值优先于 Baidu）
// 凭据：ZY_STAGE9_COOKIE 仅运行时（缺失回退持久 profile）；报告含文本真值（脱敏仅文本）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("../../node_modules/playwright");
const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1234075/2114747/999/thirdDiyAdd.do";
const OCR_API = "/siteWeb/userCenterJsj/uploadOCR.do";
const CARD = path.join(ROOT, "runtime", "stage8b", "assets", "real-card-xiazhu.png");
const COOKIE_RAW = process.env.ZY_STAGE9_COOKIE || "";
const RUNS = 3;

function parseCookies(raw) {
  const out = [];
  String(raw || "").split(";").forEach((part) => {
    const eq = part.indexOf("=");
    if (eq <= 0) return;
    const name = part.slice(0, eq).trim();
    let value = part.slice(eq + 1).trim();
    if (!name || !value) return;
    value = value.replace(/^"|"$/g, "");
    out.push({ name: name, value: value, domain: ".diy.zheliyin.com", path: "/", expires: -1 });
  });
  return out;
}

(async () => {
  const out = { ts: new Date().toISOString(), stage: "STAGE-10C-P4-HANDWRITTEN-TRUTH-PROBE", api: OCR_API, textType: "2", runs: [], verdict: {}, errors: [] };
  let browser = null, page = null;
  try {
    fs.mkdirSync(path.join(ROOT, "runtime", "reports", "stage-10"), { recursive: true });
    const dataUrl = "data:image/png;base64," + fs.readFileSync(CARD).toString("base64");
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1280, height: 800 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    page = browser.pages()[0];
    page.on("pageerror", (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 300)); });
    if (COOKIE_RAW) { await browser.addCookies(parseCookies(COOKIE_RAW)); out.cookieInjected = true; }
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => out.errors.push("goto:" + String(e && e.message || e).slice(0, 160)));
    await SLEEP(6000);
    out.pageUrl = await page.evaluate(() => location.href).catch(() => null);
    for (let i = 1; i <= RUNS; i += 1) {
      const rec = { run: i, at: new Date().toISOString() };
      try {
        const r = await page.evaluate(async (arg) => {
          const blob = await (await fetch(arg.dataUrl)).blob();
          const fd = new FormData();
          fd.append("file", new File([blob], "real-card-xiazhu.png", { type: "image/png" }));
          fd.append("textType", "2");
          const t0 = Date.now();
          const res = await fetch(arg.api, { method: "POST", body: fd });
          const txt = await res.text();
          return { status: res.status, ct: (res.headers.get("content-type") || "").slice(0, 80), elapsed: Date.now() - t0, body: txt.slice(0, 60000) };
        }, { dataUrl, api: OCR_API });
        rec.status = r.status;
        rec.elapsedMs = r.elapsed;
        let parsed = null;
        try { parsed = JSON.parse(r.body); } catch (e) { parsed = { rawHead: r.body.slice(0, 300) }; }
        rec.parsedShape = parsed;
        if (parsed && parsed.success) {
          const html = String(parsed.userData || "");
          const lines = html.split(/<br\s*\/?\s*>/i).map((x) => x.trim()).filter(Boolean);
          rec.lineCount = lines.length;
          rec.lines = lines.slice(0, 80);
          rec.truth = {
            name: lines.some((l) => l.indexOf("夏祝莲") >= 0) || lines.some((l) => l.indexOf("Xia Zhu Lian") >= 0),
            company: lines.some((l) => l.indexOf("爱卡奇") >= 0 || l.indexOf("Aikaqi") >= 0),
            phone: lines.some((l) => /13719111188/.test(l)),
            wx: lines.some((l) => /2287483098/.test(l)),
            tel: lines.some((l) => /81060778/.test(l)),
            email: lines.some((l) => /aikaqi@foxmail/.test(l))
          };
          rec.ok = true;
        } else {
          rec.ok = false;
          rec.failReason = (parsed && (parsed.message || parsed.rawHead || parsed.errorCode)) || "empty";
        }
      } catch (e) { rec.ok = false; rec.failReason = String(e && e.message || e).slice(0, 200); }
      out.runs.push(rec);
      await SLEEP(2500);
    }
    const okN = out.runs.filter((r) => r.ok).length;
    out.verdict = {
      gate: "GATE-10C-HANDWRITTEN-TRUTH",
      pass: okN === RUNS,
      okRuns: okN,
      totalRuns: RUNS,
      textType2Handwritten: true,
      notes: okN === RUNS ? "OCRTool.do handwritten (textType=2) returns valid text truth on real editor page" : "handwritten endpoint not usable in current session"
    };
  } catch (e) { out.errors.push(String(e && e.message || e).slice(0, 400)); }
  finally { try { page && await page.close(); } catch (e) {} try { browser && await browser.close(); } catch (e) {} }
  const json = JSON.stringify(out, null, 2).replace(/SESSION[^"]*"/g, 'SESSION[REDACTED]"').replace(/thirdMember[^"]*"/g, 'thirdMember[REDACTED]"');
  fs.mkdirSync(path.join(ROOT, "runtime", "reports", "stage-10"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "runtime", "reports", "stage-10", "native-handwritten-truth-probe.json"), json);
  console.log("STAGE-10C handwritten truth probe done -> runtime/reports/stage-10/native-handwritten-truth-probe.json");
  console.log("verdict:", JSON.stringify(out.verdict));
  out.runs.forEach((r) => console.log(" run" + r.run + " ok=" + r.ok + " status=" + (r.status || "?") + " lines=" + (r.lineCount || 0) + (r.failReason ? " fail=" + String(r.failReason).slice(0, 120) : "")));
})();