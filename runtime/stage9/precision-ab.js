// runtime/stage9/precision-ab.js — Stage 9 V3：Native OCR Default(textType=1) vs 手写体(textType=2) A/B 直调
// 同图同页同登录态，仅 textType 不同；每模式 2 轮验证稳定；rawText 不 trim 对比。
// 纯取证；cookie 仅注入；输出 reports/stage-9/native-ab.json
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
const URL = "https://diy.zheliyin.com/siteWeb/userCenterJsj/OCRTool.do";
const API = "/siteWeb/userCenterJsj/uploadOCR.do";
const COOKIE_RAW = process.env.ZY_STAGE9_COOKIE || "";
const CARD = path.join(ROOT, "runtime", "stage8b", "assets", "real-card-shengying.png");

function parseCookies(raw) {
  const out = [];
  String(raw || "").split(";").forEach((part) => {
    const eq = part.indexOf("=");
    if (eq <= 0) return;
    const name = part.slice(0, eq).trim();
    let value = part.slice(eq + 1).trim();
    if (!name || !value) return;
    value = value.replace(/^"|"$/g, "");
    out.push({ name, value, domain: ".diy.zheliyin.com", path: "/", expires: -1 });
  });
  return out;
}

(async () => {
  const out = { ts: new Date().toISOString(), stage: "STAGE-9-PRECISION-AB", branch: "stage-9-altq-baidu-reconstruction", runs: [], errors: [] };
  let browser = null, page = null;
  try {
    const dataUrl = "data:image/png;base64," + fs.readFileSync(CARD).toString("base64");
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1280, height: 800 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    page = browser.pages()[0];
    page.on("pageerror", (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 240)); });
    if (COOKIE_RAW) { await browser.addCookies(parseCookies(COOKIE_RAW)); out.cookiePresent = true; out.cookieNames = parseCookies(COOKIE_RAW).map((c) => c.name); }
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => out.errors.push("goto:" + String(e && e.message || e).slice(0, 160)));
    await SLEEP(4000);
    const modes = [["1", "PRINTED(印刷体)"], ["2", "HANDWRITTEN(手写体)"]];
    for (const [textType, label] of modes) {
      for (let i = 1; i <= (textType === "2" ? 2 : 1); i += 1) {
        const rec = { mode: label, textType, run: i };
        try {
          const r = await page.evaluate(async (arg) => {
            const blob = await (await fetch(arg.dataUrl)).blob();
            const fd = new FormData();
            fd.append("file", new File([blob], "real-card-shengying.png", { type: "image/png" }));
            fd.append("textType", arg.textType);
            const t0 = Date.now();
            const res = await fetch(arg.api, { method: "POST", body: fd });
            const txt = await res.text();
            return { status: res.status, ct: (res.headers.get("content-type") || "").slice(0, 60), elapsed: Date.now() - t0, body: txt.slice(0, 80000) };
          }, { dataUrl, api: API, textType });
          rec.status = r.status; rec.ct = r.ct; rec.elapsedMs = r.elapsed;
          let parsed = null;
          try { parsed = JSON.parse(r.body); } catch (e) { parsed = { raw: r.body.slice(0, 200) }; }
          rec.responseShape = parsed;
          if (parsed && parsed.success) {
            const html = String(parsed.userData || "");
            // rawText 不 trim：按 <br/> 拆分但保留原样（与 provider.parseNativeText 一致）
            const lines = html.split(/<br\s*\/?\s*>/i).filter((x) => x !== "");
            rec.lineCount = lines.length;
            rec.lines = lines.map((ln, idx) => ({ order: idx, rawText: ln, matchText: String(ln).toLowerCase().replace(/[\s\u3000\u00a0]+/g, "").replace(/[·•．。，,、；;'"“”‘’（）()【】\[\]《》<>:：-]/g, "") }));
            rec.ok = true;
            rec.hasTruth = {
              name: lines.some((l) => String(l).indexOf("吴健湘") >= 0),
              company: lines.some((l) => String(l).indexOf("佛山盛盈包装制品有限公司") >= 0),
              phone: lines.some((l) => /1591317158/.test(String(l))),
              tel: lines.some((l) => /88809856/.test(String(l))),
              email: lines.some((l) => String(l).indexOf("sandy.wu") >= 0)
            };
          } else { rec.ok = false; rec.failReason = (parsed && parsed.message) || "not success"; }
        } catch (e) { rec.ok = false; rec.failReason = String(e && e.message || e).slice(0, 200); }
        out.runs.push(rec);
        await SLEEP(2500);
      }
    }
  } catch (e) { out.errors.push(String(e && e.message || e).slice(0, 400)); }
  finally { try { page && await page.close(); } catch (e) {} try { browser && await browser.close(); } catch (e) {} }
  const json = JSON.stringify(out, null, 2).replace(/SESSION[^"]*"/g, 'SESSION[REDACTED]"').replace(/thirdMember[^"]*"/g, 'thirdMember[REDACTED]"');
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, "native-ab.json"), json);
  console.log("STAGE-9 PRECISION-AB done -> " + path.join(REPORT_DIR, "native-ab.json"));
  out.runs.forEach((r) => console.log(" " + r.mode + " run" + r.run + " ok=" + r.ok + " lines=" + (r.lineCount || 0) + " truth=" + JSON.stringify(r.hasTruth)));
})();