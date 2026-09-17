// runtime/stage5-5b-p4.js — Stage 5.5B P4：Local-first / Baidu fallback / Credential / Privacy 真机矩阵
// 矩阵（P4-M）：
//   R1: Local PASS + Baidu 未配置 → 本地成功，Baidu request=0
//   R2: Local PASS + Baidu 已配置(假key) → 本地成功，Baidu request=0（Local-first 不偷偷调百度）
//   R3: Local FAIL + Baidu 未配置 → 明确提示「百度云端未配置」
//   R4: Local FAIL + Baidu 可用 → 自动 fallback → 真实百度成功（需真实 AK/SK → PENDING / BLOCKED，不虚构）
//   R5: Local FAIL + Baidu 已配置(假key) → fallback 发起 → Baidu 失败有明确原因、状态结束不死锁、无 AK/SK 泄漏
// 机制：
//   - 辅助 userscript（先行安装，document-idle 清空 zyBaiduAk/Sk 并强制 mode=auto），保证每页加载前干净态
//   - 已配置态通过原生抽屉真实 UI 填写假 key + 保存（走产品路径 GM_setValue）
//   - Local 失败注入：等 executor 就绪（attr 置空）后写入 {ok:false,err:'engine'} → 走 LOCAL_OCR_FAILED fallback
//   - 网络计数：page.on('request') 过滤 aip.baidubce.com → Baidu request 计数
//   - 泄漏审计：console/status/pageErrors 中检索假 key 与 /AK|SK|token=/
// 证据：runtime/reports/stage5-5b-p4-report.json + docs/evidence/stage-5.5b/
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const adapter = require("./scriptcat-adapter");

const EXT_ID = adapter.EXT_ID;
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";
const MAIN_UUID = "rt5-5b-p4-main-" + Date.now().toString(36);
const CLEANER_UUID = "rt5-5b-p4-clean-" + Date.now().toString(36);
const USERSCRIPT_PATH = path.join(__dirname, "..", "zheliyin-card-assistant.user.js");
const FAKE_AK = "AK-FAKE-4P4-123456";
const FAKE_SK = "SK-FAKE-4P4-654321";

// 更干净态辅助脚本：清空百度凭据并固定 mode=auto（先于主脚本注册执行）
const CLEANER_CODE = [
  "// ==UserScript==",
  "// @name zy-p4-cleaner",
  "// @namespace https://github.com/jingjiangze/zheliyin-scriptcat",
  "// @match https://diy.zheliyin.com/*",
  "// @grant GM_setValue",
  "// @run-at document-idle",
  "// ==/UserScript==",
  "(function(){try{GM_setValue('zyBaiduAk','');GM_setValue('zyBaiduSk','');GM_setValue('zyOcrMode','auto');}catch(e){}})();"
].join("\n");

(async () => {
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  const report = { ts: new Date().toISOString(), stage: "STAGE-5.5B-P4", steps: [], errors: [], matrix: [] };
  const step = (n, ok, d, ev) => { report.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 700), evidence: ev || "n/a" }); if (!ok) report.errors.push(n); };
  const matrix = (row, local, baidu, expected, got, ok) => { report.matrix.push({ row, local, baidu, expected, got, ok: ok ? "PASS" : "FAIL" }); if (!ok) report.errors.push("matrix:" + row); };
  const cn = [];
  const pageErrors = [];
  const leakHits = [];
  let baiduReq = 0;
  const userScriptSrc = fs.readFileSync(USERSCRIPT_PATH, "utf8");
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${scDir}`, `--load-extension=${scDir}`],
      viewport: { width: 1440, height: 900 }
    });
    const optsPage = browser.pages()[0];
    await optsPage.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await optsPage.waitForTimeout(2500);
    // 清理历史本仓库脚本 → 装 cleaner（先于主脚本） → 装主脚本
    try {
      const all = (await adapter.getAllScripts(optsPage)) || [];
      for (const s of all.filter((x) => /折立印|zheliyin|zy-p4/i.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(optsPage, s.uuid); } catch (e) {} }
    } catch (e) {}
    const c1 = await adapter.installByCode(optsPage, { uuid: CLEANER_UUID, code: CLEANER_CODE, upsertBy: "user" }).catch((e) => ({ __err: String(e && e.message || e) }));
    step("install-cleaner", !c1.__err, c1.__err || "status=" + c1.status, "P4_CLEANER");
    const m1 = await adapter.installByCode(optsPage, { uuid: MAIN_UUID, code: userScriptSrc, upsertBy: "user" }).catch((e) => ({ __err: String(e && e.message || e) }));
    step("install-userscript", !m1.__err, m1.__err || "status=" + m1.status, "P4_MAIN");
    if (c1.__err || m1.__err) throw new Error("install failed");

    const page = await browser.newPage();
    page.on("request", (r) => { if (r.url().indexOf("aip.baidubce.com") >= 0) baiduReq += 1; });
    page.on("console", (msg) => { const t = String(msg.text()); if (t.indexOf("[zy-ocr]") >= 0) cn.push(t); });
    page.on("pageerror", (e) => pageErrors.push(String(e && e.message || e).slice(0, 300)));

    async function openEditor() {
      await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      const dl = Date.now() + 150000;
      while (Date.now() < dl) {
        const ok = await page.evaluate(() => {
          const req = window.requirejs || window.require;
          const ctx = req && req.s && req.s.contexts && req.s.contexts._;
          return !!(ctx && ctx.defined && ctx.defined.CanvasObjVO && document.getElementById("zy-native-ocr-panel"));
        }).catch(() => false);
        if (ok) return true;
        await new Promise((r) => setTimeout(r, 1500));
      }
      return false;
    }
    async function setBg() {
      return page.evaluate(() => new Promise((res) => {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
        const total = vo && vo.totalCanvasArray;
        const c = (Array.isArray(total) && total[0] && ((total[0].canvas) || total[0])) || null;
        if (!c) return res({ ok: false });
        const cv = document.createElement("canvas");
        cv.width = 900; cv.height = 1200;
        const g = cv.getContext("2d");
        g.fillStyle = "#ffffff"; g.fillRect(0, 0, 900, 1200);
        g.fillStyle = "#111111";
        g.font = "bold 64px 'Microsoft YaHei', sans-serif";
        g.fillText("测试公司", 100, 180);
        g.fillText("折立印设计", 100, 320);
        g.fillText("13800138000", 100, 520);
        const url = cv.toDataURL("image/png");
        const img = document.createElement("img");
        img.onload = () => {
          try {
            const F = window.fabric || c.fabric || (c.constructor && c.constructor.fabric);
            const fi = new F.Image(img, { width: 900, height: 1200 });
            c.setBackgroundImage(fi, c.requestRenderAll.bind(c), { left: 0, top: 0, originX: "left", originY: "top" });
            c.discardActiveObject();
            if (c.requestRenderAll) c.requestRenderAll();
            res({ ok: true });
          } catch (e) { res({ ok: false, err: String(e && e.message || e) }); }
        };
        img.onerror = () => res({ ok: false });
        img.src = url;
      }));
    }
    function readStatus() { return page.evaluate(() => { const n = document.getElementById("zy-native-status"); return n ? n.textContent : ""; }).catch(() => ""); }
    // 等待最终态：中间状态（正在等待/正在准备/正在切换…）不截断，直到命中终态或超时
    async function waitTerminal(maxMs, reTerminal) {
      const GENERIC = /已生成 \d+ 个文字|生成失败|识别异常|百度 OCR 配置无效|连接失败|引擎加载失败|引擎网络错误/;
      const t0 = Date.now();
      let last = "";
      while (Date.now() - t0 < maxMs) {
        await new Promise((r) => setTimeout(r, 700));
        last = await readStatus();
        if ((last && GENERIC.test(last)) || (last && reTerminal.test(last))) return last;
      }
      return last;
    }
    // 原生抽屉保存假 key（产品路径；id 为 bindOcrControls "-native" 后缀约定）
    async function saveFakeKeys() {
      return page.evaluate(({ ak, sk }) => {
        const akEl = document.getElementById("zy-baidu-ak-native");
        const skEl = document.getElementById("zy-baidu-sk-native");
        const saveEl = document.getElementById("zy-baidu-save-native");
        if (!akEl || !skEl || !saveEl) return false;
        akEl.value = ak; skEl.value = sk; saveEl.click();
        return true;
      }, { ak: FAKE_AK, sk: FAKE_SK });
    }
    // 点击「测试连接」并从其状态节点读回（用于验证凭据已落库 + token 请求真实发起 + 错误可读）
    async function clickTestConnection() {
      return page.evaluate(() => {
        const btn = document.getElementById("zy-baidu-test-native");
        if (!btn) return { ok: false };
        btn.click();
        return { ok: true };
      });
    }
    function readBaiduStatus() { return page.evaluate(() => { const n = document.getElementById("zy-baidu-status-native"); return n ? n.textContent : ""; }).catch(() => ""); }
    // 注入可控 Local 失败：等 executor 已就绪（attr 被重置为空）→ 立即写入失败结果
    async function clickWithLocalFailure() {
      return page.evaluate(() => {
        const btn = document.getElementById("zy-native-ocr-btn") || document.getElementById("zy-ocr-btn");
        if (!btn) return { ok: false };
        btn.click();
        return new Promise((resolve) => {
          const t0 = Date.now();
          const iv = setInterval(() => {
            const v = document.documentElement.getAttribute("data-zy-ocr-result");
            if (v === "") {
              document.documentElement.setAttribute("data-zy-ocr-result", JSON.stringify({ ok: false, err: "engine" }));
              clearInterval(iv);
              resolve({ ok: true, armed: true });
            } else if (Date.now() - t0 > 20000) { clearInterval(iv); resolve({ ok: true, armed: false, v: v }); }
          }, 100);
        });
      });
    }

    const leakCheck = () => {
      const hay = JSON.stringify({ console: cn, statuses: report.matrix, pageErrors: pageErrors });
      return ["AK-FAKE", "SK-FAKE"].concat(/(client_id|client_secret)=/.test(hay) ? ["client_secret="] : []).filter((k) => hay.indexOf(k) >= 0);
    };

    // ================= R1: Local PASS + 未配置；baidu=0 =================
    let baiduReq0 = baiduReq;
    if (await openEditor()) {
      await setBg();
      await page.evaluate(() => { const n = document.getElementById("zy-native-status"); if (n) n.textContent = ""; });
      const btn = await page.evaluate(() => { const b = document.getElementById("zy-native-ocr-btn"); if (b) b.click(); return !!b; });
      const term = await waitTerminal(60000, /已生成/);
      const r1ok = btn && /已生成 \d+ 个文字/.test(term) && (baiduReq - baiduReq0) === 0;
      matrix("R1", "PASS", "unconfigured", "Local 成功 且 Baidu request=0", term + " | baiduReq=" + baiduReq, r1ok);
      step("R1-local-pass-no-baidu", r1ok, "term=" + term + " baiduReqDelta=" + (baiduReq - baiduReq0), "LOCAL_FIRST");
    } else { step("R1-open-editor", false, "timeout"); }

    // ================= R2: Local PASS + 已配置(假key)；baidu=0 =================
    const savedKeys = await saveFakeKeys().catch(() => false);
    step("R2-save-fake-keys", savedKeys === true, "saved=" + savedKeys, "CREDENTIAL_UI_SAVE");
    await page.evaluate(() => { const n = document.getElementById("zy-native-status"); if (n) n.textContent = ""; });
    const clicked2 = await page.evaluate(() => { const b = document.getElementById("zy-native-ocr-btn"); if (b) b.click(); return !!b; });
    baiduReq0 = baiduReq;
    const term2 = await waitTerminal(60000, /已生成/);
    const r2ok = clicked2 && /已生成 \d+ 个文字/.test(term2) && (baiduReq - baiduReq0) === 0;
    matrix("R2", "PASS", "configured(fake)", "Local 成功（Baidu 已配置但不调用）→ Baidu request=0", term2 + " | baiduReqDelta=" + (baiduReq - baiduReq0), r2ok);
    step("R2-local-first-key-set", r2ok, "term2=" + term2 + " delta=" + (baiduReq - baiduReq0), "LOCAL_FIRST_NO_SNEAKY");

    // ================= R3: Local FAIL + 未配置 → 明确提示 =================
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {}); // cleaner 会清空假 key
    await openEditor();
    await setBg();
    await page.evaluate(() => { const n = document.getElementById("zy-native-status"); if (n) n.textContent = ""; });
    const inj3 = await clickWithLocalFailure();
    const term3 = await waitTerminal(60000, /百度云端未配置|已生成/);
    const r3ok = /百度云端未配置/.test(term3);
    matrix("R3", "FAIL", "unconfigured", "明确提示「百度云端未配置」", term3, r3ok);
    step("R3-fail-notconfigured-prompt", r3ok, "term3=" + term3 + " injected=" + JSON.stringify(inj3), "NOTIFY_CONFIG");

    // ================= R5: Local FAIL + 已配置(假key) → fallback → Baidu 失败终态 =================
    await saveFakeKeys();
    // 先验：测试连接 → token 请求真实发起（aip 请求 +1）且错误可读、无泄漏
    const t0s = baiduReq;
    await clickTestConnection();
    let tstat = await readBaiduStatus();
    const tw = Date.now();
    while (Date.now() - tw < 15000 && (!tstat || /正在测试/.test(tstat))) { await new Promise((r) => setTimeout(r, 500)); tstat = await readBaiduStatus(); }
    const tokenReqMade = (baiduReq - t0s) > 0;
    const tOk = tokenReqMade && /百度 OCR 配置无效|连接失败|invalid/.test(tstat);
    step("R5-key-saved-and-token-requested", tOk, "tstat=" + tstat + " tokenReqDelta=" + (baiduReq - t0s), "CREDENTIAL_SAVED_TOKEN_FLOW");
    baiduReq0 = baiduReq;
    await page.evaluate(() => { const n = document.getElementById("zy-native-status"); if (n) n.textContent = ""; });
    const inj5 = await clickWithLocalFailure();
    const term5 = await waitTerminal(60000, /百度 OCR|失败|异常|已生成/);
    const baiduAttempted = (baiduReq - baiduReq0) > 0;
    const r5ok = tOk && baiduAttempted && /百度 OCR 配置无效|连接失败/.test(term5) && !/正在识别|正在切换/.test(term5);
    matrix("R5", "FAIL", "configured(fake,will-fail)", "fallback 发起 → Baidu 明确失败原因 → 终态不死锁", term5 + " | baiduReqDelta=" + (baiduReq - baiduReq0), r5ok);
    step("R5-fallback-baidu-fail-terminal", r5ok, "term5=" + term5 + " attempted=" + baiduAttempted, "FALLBACK_TERMINAL");
    // 泄漏审计
    const leaks = leakCheck();
    step("P4-K-no-credential-leak", leaks.length === 0, "leaks=" + JSON.stringify(leaks), "CREDENTIAL_PRIVACY");

    // R4: Local FAIL + Baidu 可用（真实成功）——需要真实 AK/SK → PENDING（§18 不虚构）
    matrix("R4", "FAIL", "available(real-key)", "自动 fallback → 真实 Baidu 成功 → Textbox（需真实 AK/SK）", "需真实凭据，本轮 PENDING", false);
    step("R4-baidu-real-success", false, "PENDING: 需真实 AK/SK（API凭据/额度/网络），不虚构 PASS", "PENDING_DOCUMENTED");

    try { await adapter.removeScript(optsPage, MAIN_UUID); await adapter.removeScript(optsPage, CLEANER_UUID); step("cleanup-userscript", true, "removed"); } catch (e) { step("cleanup-userscript", false, String(e && e.message || e)); }
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 600));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  report.console = cn.slice(0, 80);
  report.pageErrors = pageErrors.slice(0, 30);
  const reportPath = path.join(__dirname, "reports", "stage5-5b-p4-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 1), "utf8");
  fs.copyFileSync(reportPath, path.join(__dirname, "..", "docs", "evidence", "stage-5.5b", "stage5-5b-p4-report.json"));
  console.log("[zy-p4] errors=" + report.errors.length + " → " + reportPath);
  console.log(JSON.stringify(report.matrix, null, 1));
  process.exit(report.errors.length ? 1 : 0);
})();