// runtime/stage9/precision-discovery.js — Stage 9 V3：网页"精准/高精度"识别选项真实取证
// ---------------------------------------------------------------------
// 目标：确认"更精准"识别选项的真实 HTTP 参数（不许猜）。流程：
//   1. cookie 注入打开 OCRTool.do（文字识别工具页）
//   2. 枚举 UI 全部可选控件（tab/radio/label/button + Vue data textType）
//   3. 全链路 hook（XHR/fetch）捕获 uploadOCR.do 的 FormData 真实字段
//   4. 提示用户在窗口中：观察 UI → 若有"精准/高精度"类选项则选中并粘贴真实名片触发一次识别
//   5. 输出：UI 枚举 + 捕获到的请求参数（textType 及任何额外字段）+ 响应头 20 行
// 敏感：cookie 仅注入，报告只记录 cookie 名。
// 纯取证，不改生产；envs ZY_STAGE9_COOKIE
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

const HOOK = [
  "(function(){",
  "try{ if(window.__s9pDone) return; window.__s9pDone=true;",
  " var P={reqs:[],start:Date.now()}; window.__s9p=P;",
  " var scr=function(v){return String(v==null?'':v).slice(0,300);};",
  " var xo=XMLHttpRequest.prototype.open,xs=XMLHttpRequest.prototype.send;",
  " XMLHttpRequest.prototype.open=function(m,u){try{this.__m=m;this.__u=String(u);}catch(e){} return xo.apply(this,arguments);};",
  " XMLHttpRequest.prototype.send=function(b){var self=this;try{var info={method:self.__m,url:scr(self.__u)};",
  "   if(b&&b.entries){info.formData=Array.from(b.entries()).map(function(e){return e[0]+'='+scr(e[1]);});}",
  "   this.addEventListener('loadend',function(){try{info.status=self.status; var rt=self.responseText||''; if(rt.length<6000) info.body=scr(rt); else info.body='[len:'+rt.length+']'; P.reqs.push(info);}catch(e){}});",
  " }catch(e){} return xs.apply(this,arguments);};",
  " var of=window.fetch; if(of){window.fetch=function(u,opt){var p=of.apply(this,arguments);try{var info={fetch:scr(typeof u==='string'?u:(u&&u.url||'')),method:((opt&&opt.method)||'GET'),formData:(opt&&opt.body&&opt.body.entries?Array.from(opt.body.entries()).map(function(e){return e[0]+'='+scr(e[1]);}):(opt&&opt.body?scr(String(opt.body)):null))}; p.then(function(res){info.status=res.status;return res.text().then(function(t){info.body=t.length<6000?scr(t):'[len:'+t.length+']';P.reqs.push(info);});}).catch(function(){});}catch(e){} return p;};}",
  "}catch(e){window.__s9pErr=String(e&&e.message||e);}",
  "})();"
].join("\n");

(async () => {
  const out = { ts: new Date().toISOString(), stage: "STAGE-9-PRECISION-DISCOVERY", branch: "stage-9-altq-baidu-reconstruction", url: URL, errors: [] };
  let browser = null, page = null;
  const ev = (fn, arg) => (arg === undefined ? page.evaluate(fn) : page.evaluate(fn, arg)).catch((e) => ({ err: String(e || "").slice(0, 200) }));
  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1440, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    page = browser.pages()[0];
    page.on("pageerror", (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 240)); });
    if (COOKIE_RAW) { await browser.addCookies(parseCookies(COOKIE_RAW)); out.cookieNames = parseCookies(COOKIE_RAW).map((c) => c.name); out.cookiePresent = true; }
    await page.addInitScript(HOOK);
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => out.errors.push("goto:" + String(e && e.message || e).slice(0, 160)));
    await SLEEP(5000);
    out.title = await ev(() => document.title).then((v) => (v && v.err ? "[err]" : v));
    // UI 枚举：全部可选控件 + Vue textType
    out.ui = await ev(() => {
      const els = Array.from(document.querySelectorAll("button, a, span, div, label, input, li"));
      const seen = [];
      const push = (x) => { const k = x.text + "|" + x.cls + "|" + (x.val != null ? x.val : ""); if (!seen.includes(k) && seen.length < 80) seen.push(k); };
      els.forEach((el) => {
        const t = String(el.textContent || "").trim();
        if (!t || t.length > 24) return;
        if (!/识别|印刷|手写|精准|高精|准确|标准|清晰|OCR|文字|转换|上传|粘贴|选择图片/i.test(t)) return;
        push({ text: t, cls: String(el.className || "").slice(0, 60), tag: el.tagName });
      });
      const radio = Array.from(document.querySelectorAll("input[type=radio],input[type=checkbox]")).map((el) => ({ name: el.name || el.id || "", value: el.value || "", checked: !!el.checked, cls: String(el.className || "").slice(0, 40) }));
      let vueTextType = null, vueData = null;
      try {
        const app = document.querySelector("#app");
        const v = app && app.__vue__;
        if (v && v.$data) { vueTextType = v.$data.textType; vueData = v.$data; }
      } catch (e) {}
      return { found: seen, radio, vueTextType, vueDataKeys: vueData ? Object.keys(vueData).filter((k) => /text|ocr|type|mode|acc/i.test(k)).slice(0, 20) : null, bodyHead: (document.body ? document.body.innerText.replace(/\n{2,}/g, "\n").slice(0, 700) : "") };
    });
    // 等待用户操作（选择精准选项 + 粘贴/上传触发识别），最长 150s 捕获请求
    out.note = "请在窗口中观察『文字识别』工具的选项；若有 精准/高精度 类选项请选中，然后粘贴真实名片图片触发一次识别（脚本只观察，不做任何自动点击）";
    const t0 = Date.now();
    let nBefore = 0;
    while (Date.now() - t0 < 150000) {
      const snap = await ev(() => { const p = window.__s9p; return p ? { n: p.reqs.length, last: p.reqs[p.reqs.length - 1] || null } : null; }).catch(() => null);
      if (snap && snap.n > nBefore) { nBefore = snap.n; out.lastReq = snap.last; }
      const done = await ev(() => { const p = window.__s9p; return p ? p.reqs.some((r) => /uploadOCR/.test(String(r.url || r.fetch || "")) && r.status === 200) : false; }).catch(() => false);
      if (done) break;
      await SLEEP(4000);
    }
    await SLEEP(2000);
    out.caughtReqs = await ev(() => { const p = window.__s9p; return p ? p.reqs.filter((r) => /uploadOCR/.test(String(r.url || r.fetch || ""))).map((r) => ({ method: r.method, url: String(r.url || r.fetch || "").slice(0, 120), formData: r.formData || null, status: r.status, body: r.body || null })) : []; });
  } catch (e) { out.errors.push(String(e && e.message || e).slice(0, 400)); }
  finally { try { page && await page.close(); } catch (e) {} try { browser && await browser.close(); } catch (e) {} }
  const json = JSON.stringify(out, null, 2).replace(/SESSION[^"]*"/g, 'SESSION[REDACTED]"').replace(/thirdMember[^"]*"/g, 'thirdMember[REDACTED]"');
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, "precision-discovery.json"), json);
  console.log("STAGE-9 PRECISION discovery done -> " + path.join(REPORT_DIR, "precision-discovery.json"));
  console.log("caught uploadOCR reqs:", (out.caughtReqs || []).length);
})();