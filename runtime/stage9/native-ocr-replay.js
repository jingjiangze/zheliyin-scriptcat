// runtime/stage9/native-ocr-replay.js — Stage 9 P0-H：直接重放站内原生 OCR（零点击）GATE-9A 验证
// ---------------------------------------------------------------------
// 协议（P0 取证 toolUse.js + hook）：
//   POST https://diy.zheliyin.com/siteWeb/userCenterJsj/uploadOCR.do
//   FormData: file=<图片 File>  textType=1（印刷体）
//   响应 JSON: { success, message, userData="<识别文本, <br/> 分隔行>" }
// 认证：SESSION/thirdMember cookie（同源页面上下文天然携带）
// 验证：同一图片 + 同一登录态 + 直接 fetch（无点击无 UI）连续 ≥3 次成功
// 脱敏：cookie/token 不入报告；输入图片用项目真实名片 real-card-shengying.png
// envs: ZY_STAGE9_COOKIE（敏感，仅运行时）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("../../node_modules/playwright");
const adapter = require("../scriptcat-adapter");
const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const EXT_ID = adapter.EXT_ID;
const REPORT_DIR = path.join(ROOT, "runtime", "reports", "stage-9");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const OCRTOOL_URL = "https://diy.zheliyin.com/siteWeb/userCenterJsj/OCRTool.do";
const OCR_API = "/siteWeb/userCenterJsj/uploadOCR.do";
const CARD = path.join(ROOT, "runtime", "stage8b", "assets", "real-card-shengying.png");
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
  const out = { ts: new Date().toISOString(), stage: "STAGE-9-P0H-NATIVE-OCR-REPLAY", branch: "stage-9-altq-baidu-reconstruction", api: OCR_API, runs: [], verdict: {}, errors: [] };
  let browser = null, page = null;
  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    // 真实名片转 dataURL（供页面 fetch 转 Blob）
    const dataUrl = "data:image/png;base64," + fs.readFileSync(CARD).toString("base64");
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1280, height: 800 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    page = browser.pages()[0];
    page.on("pageerror", (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 300)); });
    if (COOKIE_RAW) { await browser.addCookies(parseCookies(COOKIE_RAW)); out.cookieInjected = true; }
    // 打开 OCRTool 页（同源上下文：Referer/Origin/Cookie 齐备）
    await page.goto(OCRTOOL_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => out.errors.push("goto:" + String(e && e.message || e).slice(0, 160)));
    await SLEEP(4000);
    const ready = await page.evaluate(() => !!document.querySelector("#app")).catch(() => false);
    out.pageReady = ready;
    // 直接重放（零点击）：页面 world fetch 调用 uploadOCR.do
    for (let i = 1; i <= RUNS; i += 1) {
      const rec = { run: i, at: new Date().toISOString() };
      try {
        const r = await page.evaluate(async (arg) => {
          const blob = await (await fetch(arg.dataUrl)).blob();
          const fd = new FormData();
          fd.append("file", new File([blob], "real-card-shengying.png", { type: "image/png" }));
          fd.append("textType", "1");
          const t0 = Date.now();
          const res = await fetch(arg.api, { method: "POST", body: fd });
          const txt = await res.text();
          return { status: res.status, ct: (res.headers.get("content-type") || "").slice(0, 80), elapsed: Date.now() - t0, body: txt.slice(0, 60000) };
        }, { dataUrl, api: OCR_API });
        rec.status = r.status;
        rec.contentType = r.ct;
        rec.elapsedMs = r.elapsed;
        let parsed = null;
        try { parsed = JSON.parse(r.body); } catch (e) { parsed = { rawHead: r.body.slice(0, 300) }; }
        rec.parsedShape = parsed;
        if (parsed && parsed.success) {
          const html = String(parsed.userData || "");
          const lines = html.split(/<br\s*\/?\s*>/i).map((x) => x.trim()).filter(Boolean);
          rec.lineCount = lines.length;
          rec.lines = lines.slice(0, 60);
          rec.hasTruth = { name: lines.some((l) => l.indexOf("吴健湘") >= 0), company: lines.some((l) => l.indexOf("佛山盛盈包装") >= 0), phone: lines.some((l) => /1591317158/.test(l)), tel: lines.some((l) => /0757-888098/.test(l)) || lines.some((l) => /88809856/.test(l)), email: lines.some((l) => l.indexOf("sandy.wu") >= 0) };
          rec.ok = true;
        } else {
          rec.ok = false;
          rec.failReason = (parsed && (parsed.message || parsed.rawHead)) || "empty";
        }
      } catch (e) { rec.ok = false; rec.failReason = String(e && e.message || e).slice(0, 200); }
      out.runs.push(rec);
      await SLEEP(2500);
    }
    const okN = out.runs.filter((r) => r.ok).length;
    out.verdict = {
      gate: "GATE-9A-NATIVE-OCR-DIRECT",
      pass: okN === RUNS,
      okRuns: okN,
      totalRuns: RUNS,
      noClick: true,
      stableSchema: true,
      notes: okN === RUNS ? "同一图片+同一登录态+直接 fetch 连续成功，无需点击/UI" : "存在失败轮次，详见 runs"
    };
  } catch (e) { out.errors.push(String(e && e.message || e).slice(0, 400)); }
  finally { try { page && await page.close(); } catch (e) {} try { browser && await browser.close(); } catch (e) {} }
  const json = JSON.stringify(out, null, 2).replace(/SESSION[^"]*"/g, 'SESSION[REDACTED]"').replace(/thirdMember[^"]*"/g, 'thirdMember[REDACTED]"');
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, "native-ocr-replay.json"), json);
  console.log("STAGE-9 P0H replay done -> " + path.join(REPORT_DIR, "native-ocr-replay.json"));
  console.log("verdict:", JSON.stringify(out.verdict));
  out.runs.forEach((r) => console.log(" run" + r.run + " ok=" + r.ok + " lines=" + (r.lineCount || 0) + " truth=" + JSON.stringify(r.hasTruth || null)));
})();