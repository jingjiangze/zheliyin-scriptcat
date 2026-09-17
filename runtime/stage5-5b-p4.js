// runtime/stage5-5b-p4.js — Stage 5.5B P4：Local-first / Baidu fallback / Credential / Privacy 真机矩阵
// 矩阵（P4-M）：
//   R1: Local PASS + Baidu 未配置 → 本地成功，Baidu=0（console 无 FALLBACK/BAIDU 日志）
//   R3: Local FAIL + Baidu 未配置 → 明确提示「百度云端未配置」
//   R2: Local PASS + Baidu 已配置(假key) → 本地成功，Baidu=0（Local-first 不偷偷调百度）
//   R5: Local FAIL + Baidu 已配置(假key) → 自动 fallback（fallbackReason=LOCAL_OCR_FAILED）→ Baidu token 明确失败 → 终态不死锁
//   R4: Local FAIL + Baidu 真实可用 → 真实百度成功 → Textbox（需真实 AK/SK → PENDING，不虚构）
// 机制：GM 存储按脚本隔离（不可用他脚本清除）→ 场景顺序保证未配置态（R1/R3 在保存假 key 前执行）。
// Baidu 请求通过 GM_xmlhttpRequest（扩展上下文）发起，页面 network 监听不可见 → 证据以 [zy-ocr] console 为准。
// Local 失败注入：等 executor 就绪（data-zy-ocr-result 置空）时写入 {ok:false,err:'engine'} → LOCAL_OCR_FAILED fallback。
// 泄漏审计：console/status/matrix/pageErrors 检索假 key 与 /AK|SK|token=/。
// 证据：runtime/reports/stage5-5b-p4-report.json + docs/evidence/stage-5.5b/
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const adapter = require("./scriptcat-adapter");

const EXT_ID = adapter.EXT_ID;
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";
const MAIN_UUID = "rt5-5b-p4-main-" + Date.now().toString(36);
const USERSCRIPT_PATH = path.join(__dirname, "..", "zheliyin-card-assistant.user.js");
const FAKE_AK = "AK-FAKE-4P4-123456";
const FAKE_SK = "SK-FAKE-4P4-654321";

(async () => {
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  const report = { ts: new Date().toISOString(), stage: "STAGE-5.5B-P4", steps: [], errors: [], matrix: [] };
  const step = (n, ok, d, ev) => { report.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 700), evidence: ev || "n/a" }); if (!ok) report.errors.push(n); };
  const matrix = (row, local, baidu, expected, got, ok) => { report.matrix.push({ row, local, baidu, expected, got, ok: ok ? "PASS" : "FAIL" }); if (!ok) report.errors.push("matrix:" + row); };
  const cn = [];
  const pageErrors = [];
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
    try {
      const all = (await adapter.getAllScripts(optsPage)) || [];
      for (const s of all.filter((x) => /折立印|zheliyin|zy-p4/i.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(optsPage, s.uuid); } catch (e) {} }
    } catch (e) {}
    const m1 = await adapter.installByCode(optsPage, { uuid: MAIN_UUID, code: userScriptSrc, upsertBy: "user" }).catch((e) => ({ __err: String(e && e.message || e) }));
    step("install-userscript", !m1.__err, m1.__err || "status=" + m1.status, "P4_MAIN");
    if (m1.__err) throw new Error("install failed: " + m1.__err);

    const page = await browser.newPage();
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
    function statusReset() { return page.evaluate(() => { const n = document.getElementById("zy-native-status"); if (n) n.textContent = ""; }).catch(() => {}); }
    function clickOcr() { return page.evaluate(() => { const b = document.getElementById("zy-native-ocr-btn"); if (b) b.click(); return !!b; }).catch(() => false); }
    async function clickWithLocalFailure() {
      return page.evaluate(() => new Promise((resolve) => {
        const btn = document.getElementById("zy-native-ocr-btn") || document.getElementById("zy-ocr-btn");
        if (!btn) return resolve({ ok: false });
        btn.click();
        let done = false;
        const t0 = Date.now();
        const iv = setInterval(() => {
          const v = document.documentElement.getAttribute("data-zy-ocr-result");
          if (v === "" && !done) {
            // 持续覆盖失败结果 2.5s：确保 500ms 轮询一定读到失败（避免与 executor 真实结果竞态）
            done = true;
            const write = () => document.documentElement.setAttribute("data-zy-ocr-result", JSON.stringify({ ok: false, err: "engine" }));
            write();
            const keep = setInterval(write, 50);
            setTimeout(() => { clearInterval(keep); resolve({ ok: true, armed: true }); }, 2500);
          } else if (Date.now() - t0 > 20000 && !done) { clearInterval(iv); resolve({ ok: true, armed: false, v: v }); }
        }, 100);
      }));
    }
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
    function readBaiduStatus() { return page.evaluate(() => { const n = document.getElementById("zy-baidu-status-native"); return n ? n.textContent : ""; }).catch(() => ""); }
    const cnSlice = (from) => cn.slice(from).join("\n");
    // 主脚本 GM 存储清理（扩展上下文直接删 chrome.storage.local 中本脚本的键；仅供测试工具使用）
    async function resetMainStorage() {
      return optsPage.evaluate(async () => {
        const all = await chrome.storage.local.get(null);
        const hits = Object.keys(all).filter((k) => /zyBaidu|zyOcrMode/i.test(k));
        for (const k of hits) { try { await chrome.storage.local.remove(k); } catch (e) {} }
        return hits;
      });
    }
    const resetKeys = await resetMainStorage().catch((e) => ["err:" + String(e && e.message || e)]);
    step("reset-main-gm-storage", !(Array.isArray(resetKeys) && resetKeys.join(",").indexOf("err:") === 0), "removedKeys=" + JSON.stringify(resetKeys), "R3_UNCONFIGURED_PRECONDITION");
    const leakCheck = () => {
      const hay = JSON.stringify({ console: cn, matrix: report.matrix, pageErrors: pageErrors });
      const hits = [];
      if (hay.indexOf(FAKE_AK) >= 0) hits.push("FAKE_AK");
      if (hay.indexOf(FAKE_SK) >= 0) hits.push("FAKE_SK");
      if (/(client_id|client_secret)=/.test(hay)) hits.push("client_secret=");
      return hits;
    };

    // ================= R1: Local PASS + 未配置；console 无 Baidu 日志 =================
    let ev0 = cn.length;
    if (await openEditor()) {
      await setBg();
      await statusReset();
      const btn = await clickOcr();
      const term = await waitTerminal(60000, /已生成/);
      const r1cn = cnSlice(ev0);
      const r1ok = btn && /已生成 \d+ 个文字/.test(term) && !/FALLBACK|BAIDU|baidu/.test(r1cn);
      matrix("R1", "PASS", "unconfigured", "Local 成功 且 Baidu request=0", term + " | consoleNoBaidu=" + !/FALLBACK|BAIDU|baidu/.test(r1cn), r1ok);
      step("R1-local-pass-no-baidu", r1ok, "term=" + term, "LOCAL_FIRST");
    } else { step("R1-open-editor", false, "timeout"); }

    // ================= R3: Local FAIL + 未配置 → 明确提示（在保存假 key 之前） =================
    ev0 = cn.length;
    await statusReset();
    const inj3 = await clickWithLocalFailure();
    const term3 = await waitTerminal(60000, /百度云端未配置|百度 OCR|已生成/);
    const r3cn = cnSlice(ev0);
    const r3ok = /百度云端未配置/.test(term3) && /not configured for fallback/.test(r3cn);
    matrix("R3", "FAIL", "unconfigured", "明确提示「百度云端未配置」", term3, r3ok);
    step("R3-fail-notconfigured-prompt", r3ok, "term3=" + term3 + " injected=" + JSON.stringify(inj3), "NOTIFY_CONFIG");

    // ================= R2: 保存假 key（原生抽屉真实 UI）→ Local PASS + Baidu=0 =================
    const savedKeys = await saveFakeKeys().catch(() => false);
    step("R2-save-fake-keys", savedKeys === true, "saved=" + savedKeys, "CREDENTIAL_UI_SAVE");
    ev0 = cn.length;
    await statusReset();
    const clicked2 = await clickOcr();
    const term2 = await waitTerminal(60000, /已生成/);
    const r2cn = cnSlice(ev0);
    const r2ok = savedKeys && clicked2 && /已生成 \d+ 个文字/.test(term2) && !/FALLBACK|BAIDU|baidu/.test(r2cn);
    matrix("R2", "PASS", "configured(fake)", "Local 成功（Baidu 已配置但不调用）→ Baidu=0", term2 + " | consoleNoBaidu=" + !/FALLBACK|BAIDU|baidu/.test(r2cn), r2ok);
    step("R2-local-first-key-set", r2ok, "term2=" + term2, "LOCAL_FIRST_NO_SNEAKY");

    // ================= R5: 已配置(假key) + Local FAIL → fallback → Baidu token 明确失败终态 =================
    const bs0 = await readBaiduStatus();
    ev0 = cn.length;
    await statusReset();
    const inj5 = await clickWithLocalFailure();
    const term5 = await waitTerminal(60000, /百度 OCR|失败|异常|已生成/);
    const r5cn = cnSlice(ev0);
    const fallbackReasonShown = /FALLBACK\] local LOCAL_OCR_FAILED/.test(r5cn) || /LOCAL_OCR_FAILED/.test(term5);
    const baiduAttemptedShown = /FALLBACK\] local LOCAL_OCR_FAILED:engine → baidu/.test(r5cn) && /BAIDU_TOKEN_FAILED/.test(r5cn);
    const notStuck = !/正在识别|正在切换|正在等待|正在准备/.test(term5);
    const r5ok = fallbackReasonShown && baiduAttemptedShown && /百度 OCR 配置无效|连接失败：百度/.test(term5) && notStuck;
    matrix("R5", "FAIL", "configured(fake,will-fail)", "fallback 发起(fallbackReason) → Baidu 明确失败 → 终态不死锁", term5 + " | console=" + r5cn.replace(/\n/g, ";"), r5ok);
    step("R5-fallback-baidu-fail-terminal", r5ok, "term5=" + term5 + " console=" + r5cn.replace(/\n/g, ";"), "FALLBACK_TERMINAL");

    // 泄漏审计（含测试连接/状态回显）
    const leaked = leakCheck();
    step("P4-K-no-credential-leak", leaked.length === 0, "leaks=" + JSON.stringify(leaked) + " baiduStatusInput=" + bs0, "CREDENTIAL_PRIVACY");

    // R4: 真实百度成功 → PENDING（§18 不虚构）
    matrix("R4", "FAIL", "available(real-key)", "自动 fallback → 真实 Baidu 成功 → Textbox（需真实 AK/SK）", "需真实凭据，本轮 PENDING", false);
    step("R4-baidu-real-success", false, "PENDING: 需真实 AK/SK（API凭据/额度/网络），不虚构 PASS", "PENDING_DOCUMENTED");

    try { await adapter.removeScript(optsPage, MAIN_UUID); step("cleanup-userscript", true, "removed"); } catch (e) { step("cleanup-userscript", false, String(e && e.message || e)); }
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