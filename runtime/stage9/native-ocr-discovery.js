// runtime/stage9/native-ocr-discovery.js — Stage 9 P0-A~G：站内原生 OCR 真实调用协议发现
// ---------------------------------------------------------------------
// 目标（Stage 9-P0 规格）：定位 OCRTool.do 页面执行 OCR 的底层接口/内部函数，证明可脱离点击直调。
// 方法：
//   A. 使用有效登录 Cookie（env ZY_STAGE9_COOKIE）打开 OCRTool.do → 若跳转记录真实链
//   B. addInitScript 全链路网络 hook（XHR/fetch/WebSocket/sendBeacon/form/script/JSONP）
//      + paste/FileReader/Blob/canvas/toDataURL/toBlob/createObjectURL 观察
//   C. 页面可达后：提示用户在窗口中手动粘贴/选择一次图片（仅取证；人不点，不做坐标自动化）
//   D. 静态扫描页面全部 script src 与 iframe 脚本内容（关键词 .do/upload/ocr/fetch...）
//   E. 脱敏输出（cookie/token/Authorization 绝不写入报告）
// envs: ZY_STAGE9_COOKIE（敏感，仅运行时）；P0_PROFILE
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
const COOKIE_RAW = process.env.ZY_STAGE9_COOKIE || "";

// 解析 cookie 串（k=v; k2=v2），脱去引号；忽略 expires
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

// 全链路 hook（页面 world，addInitScript，标志防重）
const HOOK_SRC = [
  "(function(){",
  "try{",
  " if(window.__s9netDone) return; window.__s9netDone=true;",
  " var N={xhr:[],fetch:[],ws:[],beacon:[],paste:[],file:[],canvas:[],startTs:Date.now()}; window.__s9net=N;",
  " var scrub=function(v){return String(v==null?'':v).replace(/(authorization|token|cookie|access_token)[^,;&]{0,40}/ig,'$1=[REDACTED]').slice(0,400);};",
  " var push=function(grp,obj){obj.ts=Date.now()-N.startTs; (N[grp]||(N[grp]=[])).push(obj); var a=N[grp]; if(a.length>200)a.splice(0,a.length-200);};",
  " /* XHR */",
  " var xo=XMLHttpRequest.prototype.open, xs=XMLHttpRequest.prototype.send;",
  " XMLHttpRequest.prototype.open=function(m,u){ try{this.__s9m=m;this.__s9u=String(u||'').slice(0,300);}catch(e){} return xo.apply(this,arguments); };",
  " XMLHttpRequest.prototype.send=function(b){ var self=this; try{",
  "   var info={method:self.__s9m,url:scrub(self.__s9u),bodyType:(b&&b.constructor&&b.constructor.name)||'string',bodyLen:(b&&b.byteLength!=null?b.byteLength:(b&&b.length!=null?b.length:null)),formKeys:(b&&b.entries?Array.from(b.entries()).map(function(e){return e[0];}):null)};",
  "   this.addEventListener('loadend',function(){ try{ info.status=self.status; info.respType=self.responseType||'';",
  "     var rt=self.responseText||self.response||''; if(typeof rt==='string'&&rt.length<8000) info.body=scrub(rt); else if(rt) info.body='[len:'+String(rt.length||'?')+']';",
  "     push('xhr',info); }catch(e){} });",
  " }catch(e){} return xs.apply(this,arguments); };",
  " /* fetch */",
  " var of=window.fetch; window.fetch=function(u,opt){ var p=of.apply(this,arguments); try{",
  "   var info={url:scrub(typeof u==='string'?u:(u&&u.url||'').slice(0,300)),method:((opt&&opt.method)||(u&&u.method)||'GET'),body:(opt&&opt.body?scrub(String(opt.body).slice(0,300)):null)};",
  "   p.then(function(res){ try{ info.status=res.status; info.ct=(res.headers.get('content-type')||'').slice(0,60);",
  "     var cl=res.headers.get('content-length'); if(cl)info.body='[content-length:'+cl+']';",
  "     push('fetch',info); }catch(e){} },function(err){ info.err='FETCH_ERR'; push('fetch',info); });",
  " }catch(e){} return p; };",
  " /* WebSocket */",
  " var OWS=window.WebSocket; if(OWS){ var wsSend=OWS.prototype.send;",
  "  OWS.prototype.send=function(d){ try{push('ws',{dir:'send',data:scrub(String(d).slice(0,200))});}catch(e){} return wsSend.apply(this,arguments); }; }",
  " /* sendBeacon */",
  " try{ var ob=navigator.sendBeacon?navigator.sendBeacon.bind(navigator):null; if(ob){ navigator.sendBeacon=function(u,d){ try{push('beacon',{url:scrub(u),data:scrub(String(d).slice(0,200))});}catch(e){} return ob(u,d); }; } }catch(e){}",
  " /* paste / file / canvas 观察 */",
  " window.addEventListener('paste',function(ev){ try{ var cd=ev.clipboardData||{}; var items=[]; for(var i=0;i<(cd.items||[]).length;i++){var it=cd.items[i]; items.push({kind:it.kind,type:it.type});} push('paste',{types:(cd.types||[]),items:items}); }catch(e){} },true);",
  " document.addEventListener('drop',function(ev){ try{ var fd=(ev.dataTransfer&&ev.dataTransfer.files)||[]; push('paste',{dropFiles:Array.from(fd).map(function(f){return {name:f.name,size:f.size,type:f.type};})}); }catch(e){} },true);",
  " var ofr=FileReader.prototype.readAsDataURL; if(ofr){ FileReader.prototype.readAsDataURL=function(b){ try{push('file',{op:'readAsDataURL',file:(b&&{name:b.name,size:b.size,type:b.type})||null});}catch(e){} return ofr.apply(this,arguments); }; }",
  " try{ var td=HTMLCanvasElement.prototype.toDataURL; if(td){ HTMLCanvasElement.prototype.toDataURL=function(){ push('canvas',{op:'toDataURL',w:this.width,h:this.height}); return td.apply(this,arguments); }; } }catch(e){}",
  "}catch(e){ try{window.__s9netErr=String(e&&e.message||e).slice(0,200);}catch(e2){} }",
  "})();"
].join("\n");

(async () => {
  const out = { ts: new Date().toISOString(), stage: "STAGE-9-P0-NATIVE-OCR", branch: "stage-9-altq-baidu-reconstruction", url: OCRTOOL_URL, cookieNames: [], cookieInjected: false, navs: [], pages: [], scripts: [], inlineScan: [], staticHits: [], hooks: null, errors: [] };
  let browser = null, page = null;
  const ev = (fn, arg) => (arg === undefined ? page.evaluate(fn) : page.evaluate(fn, arg)).catch((e) => ({ err: String(e || "").slice(0, 200) }));
  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: false, ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"], args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", "--disable-extensions-except=" + SC_DIR, "--load-extension=" + SC_DIR], viewport: { width: 1440, height: 900 } });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });
    page = browser.pages()[0];
    page.on("console", (m) => { const t = m.text(); if (/ERROR|识别|OCR|识别失败|识别成功/i.test(t)) { out.consoleDiag = (out.consoleDiag || []).concat([t.slice(0, 300)]); } });
    page.on("pageerror", (e) => { out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 300)); });
    page.on("response", (r) => { out.navs.push({ status: r.status(), url: r.url().slice(0, 240), ct: (r.headers()["content-type"] || "").slice(0, 50) }); if (out.navs.length > 120) out.navs = out.navs.slice(-120); });
    // 注入 Cookie（敏感，仅内存/浏览器）
    if (COOKIE_RAW) {
      const cks = parseCookies(COOKIE_RAW);
      out.cookieNames = cks.map((c) => c.name);
      await browser.addCookies(cks);
      out.cookieInjected = true;
    }
    await page.addInitScript(HOOK_SRC);
    await page.goto(OCRTOOL_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => out.errors.push("goto:" + String(e && e.message || e).slice(0, 160)));
    await SLEEP(5000);
    out.finalUrl = page.url().slice(0, 240);
    out.title = await ev(() => document.title).then((v) => (v && v.err ? "[err]" : v));
    out.bodyHead = await ev(() => (document.body ? document.body.innerText.replace(/\n{2,}/g, "\n").slice(0, 800) : "")).then((v) => (v && v.err ? "[err]" : v));
    out.iframes = await ev(() => Array.from(document.querySelectorAll("iframe")).map((f) => ({ src: (f.src || "").slice(0, 240), id: f.id || null }))).then((v) => (v && v.err ? [] : v));
    out.scripts = await ev(() => Array.from(document.scripts).map((s) => s.src).filter((s) => s)).then((v) => (v && v.err ? [] : v));
    out.inlineScriptCount = await ev(() => { let n = 0; Array.from(document.scripts).forEach((s) => { if (s.textContent && s.textContent.trim().length > 30) n += 1; }); return n; }).then((v) => (typeof v === "number" ? v : -1));
    // 若 OCRTool 跳转/异常 → 尝试 jsj 登录态找 OCR 链接
    const looksBad = /400|error|NotFound|index\.do/i.test(String(out.title || "") + String(out.bodyHead || ""));
    if (looksBad) {
      out.ocrToolUnusable = true;
      await page.goto("https://diy.zheliyin.com/siteWeb/jsj/index.do", { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      await SLEEP(7000);
      out.jsj = { url: page.url().slice(0, 240), title: await ev(() => document.title).then((v) => (v && v.err ? "[err]" : v)), bodyHead: await ev(() => (document.body ? document.body.innerText.replace(/\n{2,}/g, "\n").slice(0, 900) : "")).then((v) => (v && v.err ? "[err]" : v)) };
      out.ocrLinks = await ev(() => Array.from(document.querySelectorAll("a[href]")).filter((a) => { const t = String(a.textContent || "").trim(); const h = a.getAttribute("href") || ""; return /ocr|识别|文字|extract/i.test(t + h); }).map((a) => ({ text: String(a.textContent || "").trim().slice(0, 30), href: (a.getAttribute("href") || "").slice(0, 200) }))).then((v) => (v && v.err ? [] : v));
    }
    // 不管哪个页面停留，给用户 100s 手动粘贴/选取图片做一次 OCR（仅取证）
    out.collectNote = "窗口内请手动粘贴/选取测试图片触发一次识别（脚本仅观察网络，不做点击/坐标自动化）";
    const t0 = Date.now();
    let nBefore = 0;
    while (Date.now() - t0 < 100000) {
      const snap = await ev(() => { const n = window.__s9net || null; return n ? { xhr: n.xhr.length, fetch: n.fetch.length, ws: n.ws.length, paste: n.paste.length, file: n.file.length, canvas: n.canvas.length, beacon: n.beacon.length } : null; }).catch(() => null);
      if (snap) { const total = snap.xhr + snap.fetch + snap.ws + snap.paste; if (total > nBefore) { nBefore = total; } }
      const done = await ev(() => { const n = window.__s9net || null; if (!n) return false; return (n.xhr.length + n.fetch.length + n.ws.length) > 0 && (n.xhr.some((x) => x.status === 200 && /json|text/.test(x.respType || "")) || n.fetch.length > 3 || n.ws.length > 0) && (n.paste.length > 0 || n.file.length > 0); }).catch(() => false);
      if (done) break;
      await SLEEP(4000);
    }
    out.hooks = await ev(() => { const n = window.__s9net || null; return n ? { xhr: n.xhr, fetch: n.fetch, ws: n.ws, beacon: n.beacon, paste: n.paste, file: n.file, canvas: n.canvas, err: window.__s9netErr || null } : { err: "hook-not-installed" }; });
    // P0-C：静态扫描页面脚本内容（findings 关键词）
    const srcs = (out.scripts || []).concat((out.iframes || []).map((f) => f.src));
    const hits = [];
    for (const s of srcs.slice(0, 40)) {
      let txt = "";
      try { txt = await (await fetch(s)).text(); } catch (e) { continue; }
      if (txt.length > 600000) txt = txt.slice(0, 600000);
      if (!txt) continue;
      const keys = [/(?:\.do)(\?|"|'|<|$)/g, /upload|recogn|identify|extractText|doOcr|OCR/ig, /fetch\(|XMLHttpRequest|\.ajax|\.post\(|\.get\(/ig, /FormData|FileReader|createObjectURL|toBlob/ig];
      const found = [];
      keys.forEach((k, ki) => { const m = txt.match(k); if (m) found.push("k" + ki); });
      if (found.length) {
        const sample = txt.match(/([A-Za-z_\/\.]{0,40}(?:ocr|recogn|upload|extract|doOcr)[A-Za-z_\/\.]{0,60})/gi) || [];
        hits.push({ src: s.slice(0, 200), keys: found, samples: sample.slice(0, 8).map((x) => x.slice(0, 120)) });
      }
    }
    out.staticHits = hits.slice(0, 30);
  } catch (e) { out.errors.push(String(e && e.message || e).slice(0, 400)); }
  finally { try { page && await page.close(); } catch (e) {} try { browser && await browser.close(); } catch (e) {} }
  // 脱敏兜底：确保任何 cookie 值不入报告
  const json = JSON.stringify(out, null, 2)
    .replace(/SESSION[^"]*"/g, 'SESSION[REDACTED]"')
    .replace(/thirdMember[^"]*"/g, 'thirdMember[REDACTED]"');
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, "native-ocr-discovery.json"), json);
  console.log("STAGE-9 P0 native-ocr-discovery done -> " + path.join(REPORT_DIR, "native-ocr-discovery.json"));
  console.log("cookieNames:" + (out.cookieNames || []).join(",") + " finalUrl=" + out.finalUrl);
})();