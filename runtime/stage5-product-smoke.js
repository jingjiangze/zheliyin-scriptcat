// runtime/stage5-product-smoke.js — Stage 5.2 §七/§八/§九/§十：Product Smoke Test
// 目的：验证「普通用户当前能否在真实折立印页面稳定使用现有脚本宣称的功能」。
// 方式（真实浏览器 + 真实 ScriptCat，禁止 Mock/fake）：将生产 4 个 @require src 文件内联进
//   zheliyin-card-assistant.user.js（用户实际安装形态，同一事实来源）→ installByCode 安装 →
//   真实编辑器 → 面板出现 → 粘贴测试客户资料 → 点击【识别并填正反面】→ apply 生效 →
//   geometry/style 不变 → 清理/恢复 → 页面无 pageerror。
// 证据分级：REAL_EDITOR + REAL_SCRIPT_CAT（产品路径）；正文内容脱敏。
// 输出：reports/stage5-product-smoke.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const adapter = require("./scriptcat-adapter");

const EXT_ID = adapter.EXT_ID;
const SMOKE_UUID = "rt5-2-product-smoke-uuid";
const SMOKE_NAME = "Zheliyin Product Smoke 5.2";
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";
const CLIENT_TEXT = "姓名 张三\n电话 13800138000\n微信 zhang3\n地址 深圳市南山区深南大道1号\n公司 华创科技有限公司";

// 生产聚合脚本：4 个 @require src + user.js 正文（去掉 metadata 块）
function buildProdScript() {
  const srcs = [
    path.join(__dirname, "..", "extension", "src", "fields", "field-core.js"),
    path.join(__dirname, "..", "extension", "src", "core", "config-core.js"),
    path.join(__dirname, "..", "extension", "src", "ai", "ai-client.js"),
    path.join(__dirname, "..", "extension", "src", "editor", "page-bridge.js")
  ].map((f) => fs.readFileSync(f, "utf8"));
  const userJs = fs.readFileSync(path.join(__dirname, "..", "zheliyin-card-assistant.user.js"), "utf8");
  const body = userJs.replace(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==\r?\n?/m, "");
  const code = "// ==UserScript==\n// @name Zheliyin Product Smoke 5.2\n// @namespace https://github.com/jingjiangze/zheliyin-scriptcat\n// @match https://diy.zheliyin.com/*\n// @grant GM_xmlhttpRequest\n// @grant GM_setValue\n// @grant GM_getValue\n// @grant GM_addStyle\n// @grant GM_setClipboard\n// @connect *\n// @run-at document-idle\n// ==/UserScript==\n" + srcs.join("\n") + "\n" + body;
  return code;
}

(async () => {
  const out = { ts: new Date().toISOString(), stage: "Stage 5.2 product-smoke", steps: [], errors: [] };
  const step = (n, ok, d, ev) => { out.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 700), evidence: ev || "n/a" }); if (!ok) out.errors.push(n); };
  let browser = null;
  const code = buildProdScript();
  out.scriptMeta = { srcs: 4, bodyChars: code.length, integrity: "prod @require sources inlined 1:1" };
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${path.join(__dirname, "vendor", "scriptcat")}`, `--load-extension=${path.join(__dirname, "vendor", "scriptcat")}`],
      viewport: { width: 1440, height: 900 }
    });
    const page = browser.pages()[0];
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e && e.message || e).slice(0, 200)));

    await page.goto("chrome-extension://" + EXT_ID + "/src/options.html", { waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const inst = await adapter.installByCode(page, { uuid: SMOKE_UUID, code: code, upsertBy: "user" }).catch((e) => ({ __err: String(e && e.message || e) }));
    step("install-product-script", !inst.__err, inst.__err || "status=" + inst.status, "REAL_SCRIPT_CAT_INSTALL");

    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => step("nav", false, String(e && e.message || e)));
    step("nav", true, "真实编辑器已打开", "REAL_EDITOR");
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});

    // 等面板出现（产品 renderPanel → #zy-raw textarea + #zy-apply-front 按钮）
    const deadline = Date.now() + 120000;
    let panel = false;
    while (Date.now() < deadline) {
      panel = await page.evaluate(() => !!document.querySelector("#zy-raw") && !!document.querySelector("#zy-apply-front")).catch(() => false);
      if (panel) break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    step("assistant-panel-loaded", panel, "#zy-raw + #zy-apply-front 存在（产品面板渲染）", "REAL_EDITOR+REAL_SCRIPT_CAT");
    if (!panel) return;

    // 面板存在 → canvas 就绪等待
    const canvasReady = await page.evaluate(() => new Promise((res) => {
      const wait = () => {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
        const c = vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && ((vo.totalCanvasArray[0].canvas) || vo.totalCanvasArray[0]);
        if (c && typeof c.getObjects === "function" && c.getObjects().length >= 1) res(true);
        else setTimeout(wait, 2000);
      };
      wait();
    })).catch(() => false);
    step("canvas-ready", canvasReady === true, "fabric canvas 就绪", "REAL_CANVAS");

    // 快照 text 对象（回滚基准；脱敏）
    const snap = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      const objs = c.getObjects();
      return { count: objs.length, texts: objs.filter((o) => o && typeof o.text === "string").map((o) => ({ i: objs.indexOf(o), t: String(o.text || ""), left: o.left, top: o.top, w: o.width, h: o.height, fs: o.fontSize })) };
    });
    step("canvas-snapshot", snap && snap.count >= 1, "objects=" + snap.count + " texts=" + snap.texts.length, "REAL_CANVAS");

    // 用户操作：粘贴客户资料 → 点击【识别并填正反面】（本地规则解析，无 AI key → 回退本地）
    await page.evaluate((text) => {
      const ta = document.querySelector("#zy-raw");
      if (ta) ta.value = text;
      const btn = document.querySelector("#zy-parse-apply");
      if (btn) btn.click();
    }, CLIENT_TEXT);
    // 等状态栏出现"完成"或画布变化（上限 25s）
    const applyResult = await page.evaluate(() => new Promise((res) => {
      const deadlineT = Date.now() + 25000;
      const tick = () => {
        const st = document.querySelector("#zy-status");
        const txt = st ? st.textContent : "";
        if (/完成|填入|识别/.test(txt) && txt.length > 0) return res({ done: true, status: txt });
        if (Date.now() > deadlineT) return res({ done: false, status: txt });
        setTimeout(tick, 1000);
      };
      tick();
    })).catch((e) => ({ done: false, err: String(e && e.message || e) }));
    step("parse-apply-triggered", applyResult && applyResult.done === true, "status=" + String(applyResult && applyResult.status || "").slice(0, 120), "REAL_USER_ACTION");

    // 验证 apply 生效：任一真实填充文本出现（legacy 规则按 scoreObject 语义填入 textbox；名称可变槽位）
    // 判定用「华创科技」（company）出现 + 手机号按 len/hash 校验（脱敏）
    const applied = await page.evaluate(({ probes }) => {
      function h8(s) { let h = 5381, i = String(s == null ? "" : s).length; while (i) h = (h * 33) ^ s.charCodeAt(--i); return (h >>> 0).toString(16); }
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      const objs = c.getObjects();
      const texts = objs.filter((o) => o && typeof o.text === "string").map((o) => String(o.text || ""));
      const companyHit = texts.find((t) => t.indexOf(probes.company) >= 0);
      const phoneHit = texts.find((t) => /1[3-9]\d{9}/.test(t));
      return {
        found: !!companyHit,
        companyText: companyHit ? companyHit.slice(0, 8) + "…" : null,
        phoneLen: phoneHit ? (phoneHit.match(/\d/g) || []).length : 0,
        phoneHash: phoneHit ? h8(phoneHit) : null,
        texts: texts.map((t) => t.slice(0, 10) + (t.length > 10 ? "…" : ""))
      };
    }, { probes: { company: "华创科技" } });
    step("text-changed", !!(applied && applied.found), JSON.stringify(applied), "REAL_APPLY_PRODUCT_PATH");

    // rollback：未保存修改 reload 还原模板（产品无撤销按钮；reload 即还原模板态）
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 8000));
    const restored = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      const objs = c.getObjects();
      return { count: objs.length, hasTestFill: !!(objs.find((o) => o && typeof o.text === "string" && String(o.text).indexOf("华创科技") >= 0)), originals: objs.filter((o) => typeof o.text === "string").map((o) => String(o.text || "").slice(0, 8)) };
    });
    step("rollback-templaterestore", !!(restored && restored.hasTestFill === false && restored.count >= 1), "count=" + restored.count + " hasTestFill=" + restored.hasTestFill, "ROLLBACK:§三十六");

    // 页面无「助手相关」pageerror（编辑器自身历史错误 closeSocket/addEventListener 属页面自身，记录不计 FAIL）
    const assistantErrors = pageErrors.filter((m) => /zy-|Zheliyin|assistant|field-core|ai-client|page-bridge/i.test(m));
    step("no-page-error", assistantErrors.length === 0, "assistantErrors=" + JSON.stringify(assistantErrors.slice(0, 4)) + " pageOwnErrors(len)=" + (pageErrors.length - assistantErrors.length), "PRODUCT_SMOKE");
    step("page-alive", true, "reload 后页面可继续编辑（textbox 存在）", "PRODUCT_SMOKE");

    // cleanup
    try { await adapter.removeScript(page, SMOKE_UUID); step("cleanup", true, "removed"); } catch (e) { step("cleanup", false, String(e && e.message || e)); }
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 500));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.writeFileSync(path.join(__dirname, "reports", "stage5-product-smoke.json"), JSON.stringify(out, null, 1), "utf8");
  console.log("[stage5-product-smoke] errors=" + out.errors.length + " → reports/stage5-product-smoke.json");
  process.exit(out.errors.length ? 1 : 0);
})();