// runtime/stage9/session-probe.js — Stage 9 Commit 4.6-SESSION：Session Cookie Auto-Refresh
// ---------------------------------------------------------------------
// 目的：Native OCR 会话（SESSION cookie）过期时，自动从 OCRTool.do 抓取最新 cookie 串。
// 方法：playwright 持久 profile → 访问 OCRTool.do → browser.cookies() 全域抓取 zheliyin 域
//       cookie（含 httpOnly）→ 拼 cookie 串；若缺身份 cookie（diy-User-third 等）：
//       a) 注入了 P0_LOGIN_USER/P0_LOGIN_PASS → 自动填表登录 login.do 重建会话；
//       b) 未注入 → 以「上次已知可用全量 cookie」为身份基底保守合并（保留已验证 SESSION）。
//       结果写回 %TEMP%\zy_stage9_cookie.txt。
// 已验证事实（真机 2026-09-22）：
//       * 持久 profile 未登录时（缺 diy-User-third），OCR 上传返回 SESSION_EXPIRED；
//       * addCookies 注入的 cookie 不跨重启持久，probe 每次需重新抓取/合并；
//       * 匿名新 SESSION 会破坏已验证 cookie → 保守合并保留 base（已验证）SESSION。
// 导出：probe() / resolveStage9Cookie() / tryAutoLogin() / cookieToRaw() / parseCookieRaw() /
//       cookieParts() / mergeCookies() / hasIdentityCookies() / isLoginRedirect() / OUT_FILE
// 用途：内嵌于 commit-46-real.js 等真机 runner（主循环前 resolveStage9Cookie() 自动续期；
//       设 ZY_SESSION_REFRESH=1 可强制跳过 env 直接重新抓取）。
// 凭据：不落库；cookie 串仅写 %TEMP%\zy_stage9_cookie.txt，报告只记名（SESSION=xxx…）。
"use strict";
const path = require("path");
const fs = require("fs");
const os = require("os");
const { chromium } = require("../../node_modules/playwright");
const ROOT = path.join(__dirname, "..", "..");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const INDEX_URL = "https://diy.zheliyin.com/siteWeb/jsj/index.do";
const OCR_URL = "https://diy.zheliyin.com/siteWeb/userCenterJsj/OCRTool.do";
const LOGIN_URL = "https://diy.zheliyin.com/siteWeb/login.do";
// 门店设计页：登录后的重定向目标（签发 diy-User-third 身份 cookie；与 commit-46-real 同门店）
const STORE_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const OUT_FILE = path.join(os.tmpdir(), "zy_stage9_cookie.txt");
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

function cookieToRaw(cookies) {
  return (cookies || []).map((c) => c.name + "=" + c.value).join("; ");
}
function parseCookieRaw(raw) {
  const out = [];
  String(raw || "").split(";").forEach((part) => {
    const eq = part.indexOf("=");
    if (eq <= 0) return;
    const name = part.slice(0, eq).trim();
    let value = part.slice(eq + 1).trim();
    if (!name || !value) return;
    value = value.replace(/^"|"$/g, "");
    out.push({ name, value, domain: ".diy.zheliyin.com", path: "/", expires: -1, source: "raw" });
  });
  return out;
}
function cookieParts(raw) {
  const m = {};
  parseCookieRaw(raw).forEach((c) => { if (!(c.name in m)) m[c.name] = c.value; });
  return m;
}
function toRaw(parts) {
  return Object.keys(parts).map((k) => k + "=" + parts[k]).join("; ");
}
function hasIdentityCookies(cookies) {
  const names = new Set((cookies || []).map((c) => c.name));
  return names.has("diy-User-third") && names.has("thirdMember");
}
function mergeCookies(baseParts, freshParts, freshHasIdentity) {
  // fresh 自带完整身份（profile 已登录 / 自动登录成功）：SESSION 与身份同源且最新 → 整体采用 fresh
  if (freshHasIdentity) {
    const merged = Object.assign({}, baseParts || {});
    Object.keys(freshParts || {}).forEach((k) => { merged[k] = freshParts[k]; });
    return merged;
  }
  // fresh 缺身份（匿名会话，SESSION 不可信任）：保留 base 全部（含已验证 SESSION），仅补充 fresh 新增字段
  const merged = Object.assign({}, baseParts || {});
  Object.keys(freshParts || {}).forEach((k) => { if (!(k in merged)) merged[k] = freshParts[k]; });
  return merged;
}
function isLoginRedirect(html) {
  const h = String(html || "");
  if (/window\.open\s*\(\s*['"]http[^'"]*(index|login|auth)/i.test(h)) return true;
  if (/login|登录|扫码|请先登录/i.test(h) && h.length < 12000) return true;
  return false;
}
function readOutFile() {
  try { return String(fs.readFileSync(OUT_FILE, "utf8") || "").trim(); } catch (e) { return ""; }
}

// 自动登录：依赖 P0_LOGIN_USER / P0_LOGIN_PASS
// 登录弹窗结构（login.do / diyWeb 门户）：.mask-bg.zLoginOut（display:none）包裹 .zLoginTan 面板，
// 面板未展开时 #userAccount/#userPassword 存在但 0×0 不可交互 → 先翻转 mask 层级再填表；
// 填表走原生 setter + input/change（React 受控输入），提交优先 #accountLogin 否则匹配可见「登录/确定」文本。
async function tryAutoLogin(page, out) {
  const user = (process.env && process.env.P0_LOGIN_USER) || "";
  const pass = (process.env && process.env.P0_LOGIN_PASS) || "";
  if (!user || !pass) { out.errors.push("AUTO_LOGIN_SKIP: 缺身份 cookie，且未注入 P0_LOGIN_USER/P0_LOGIN_PASS（需手动注入 ZY_STAGE9_COOKIE 或登录 profile）"); return false; }
  try {
    const r = await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 40000 }).catch((e) => ({ status: 0 }));
    out.steps.push({ step: "login-do", status: r && r.status ? r.status() : 0 });
    await SLEEP(3000);
    // 1) 展开登录面板：翻转 mask 层级（autologin3.js 成熟做法）
    await page.evaluate(() => {
      const open = (el) => { try { el.style.display = "block"; } catch (e) {} };
      document.querySelectorAll(".mask-bg.zLoginOut, .zLoginOut").forEach(open);
      const tan = document.querySelector(".zLoginTan");
      if (tan) open(tan);
      const opener = document.querySelector("[class*='zLoginIn']");
      if (opener && opener.offsetParent !== null) { try { opener.click(); } catch (e) {} }
      const tab = Array.from(document.querySelectorAll("a,span,div,li,em,b")).find((el) => /账户登录|密码登录|账号登录/.test(String(el.textContent || "").trim()) && el.offsetParent);
      if (tab) { try { tab.click(); } catch (e) {} }
      return true;
    }).catch(() => {});
    await SLEEP(1200);
    // 2) 填表：优先 page.fill，失败走原生 setter（React 值受控输入必须走 setter + input/change）
    let filled = false;
    try { await page.fill("#userAccount", user); await page.fill("#userPassword", pass); filled = true; } catch (e) {}
    if (!filled) {
      const fr = await page.evaluate((arg) => {
        const el = (id) => document.getElementById(id);
        const setVal = (node, v) => {
          const proto = (node instanceof HTMLTextAreaElement) ? HTMLTextAreaElement.prototype : (node instanceof HTMLInputElement ? HTMLInputElement.prototype : null);
          if (!proto) return false;
          const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
          try { setter.call(node, v); } catch (e) { node.value = v; }
          node.dispatchEvent(new Event("input", { bubbles: true }));
          node.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        };
        const u = el("userAccount"); const p = el("userPassword");
        if (!u || !p) return { ok: false, reason: "inputs-missing" };
        try { u.focus(); if (u.select) u.select(); } catch (e) {}
        setVal(u, arg.u);
        try { p.focus(); if (p.select) p.select(); } catch (e) {}
        setVal(p, arg.p);
        return { ok: true };
      }, { u: user, p: pass }).catch(() => ({ ok: false, reason: "eval-fail" }));
      if (!fr.ok) out.errors.push("LOGIN_FILL_FAIL: " + (fr.reason || ""));
    }
    // 3) 提交：优先 #accountLogin；否则选可见的 登录/确定 文本元素（p0/runner.js 成熟做法）
    const clicked = await page.evaluate(() => {
      const cands = [];
      const el = document.getElementById("accountLogin");
      if (el) cands.push(el);
      document.querySelectorAll("a, button, span, div").forEach((x) => {
        const t = String(x.textContent || "").trim();
        if (/^登录$|^登\s*录$|^确定$/.test(t) && x.offsetParent) cands.push(x);
      });
      for (const c of cands) { try { c.click(); return { ok: true, sel: (c.id || c.tagName) }; } catch (e) {} }
      return { ok: false, reason: "no-submit-btn" };
    }).catch(() => ({ ok: false, reason: "eval-fail" }));
    if (!clicked.ok) out.errors.push("LOGIN_CLICK_FAIL: " + (clicked.reason || ""));
    // 4) 先等 SESSION 建立（登录成功判定）→ 再跳门店页签发 diy-User-third 身份 cookie
    //    真机经验：login.do 登录成功仅发 SESSION；diy-User-third 需请求门店设计页才 Set-Cookie
    let sessionSeen = false;
    for (let i = 0; i < 10; i += 1) {
      await SLEEP(1200);
      const ck = await page.context().cookies().catch(() => []);
      const sess = (ck || []).find((c) => c.name === "SESSION");
      if (sess && String(sess.value).length >= 30) { sessionSeen = true; break; }
    }
    if (sessionSeen) {
      await page.goto(STORE_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => out.errors.push("LOGIN_STORE_HOP_FAIL"));
      await SLEEP(4000);
    }
    for (let i = 0; i < 12; i += 1) {
      await SLEEP(1200);
      const ck = await page.context().cookies().catch(() => []);
      const sess = (ck || []).find((c) => c.name === "SESSION");
      if (hasIdentityCookies(ck) && sess && String(sess.value).length >= 30) {
        out.loginOk = true;
        out.steps.push({ step: "login-ok", session: String(sess.value).slice(0, 8) + "…" });
        return true;
      }
    }
    out.errors.push(sessionSeen ? "AUTO_LOGIN_FAILED: SESSION 已建立但门店页未签发 diy-User-third" : "AUTO_LOGIN_FAILED: SESSION 未建立（账号或密码错误？）");
    return false;
  } catch (e) { out.errors.push("AUTO_LOGIN_ERR: " + String(e && e.message || e).slice(0, 200)); return false; }
}

async function probe() {
  const out = { ts: new Date().toISOString(), url: OCR_URL, steps: [], ok: false, cookieChars: 0, session: null, identity: false, source: null, loginOk: false, errors: [] };
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(PROFILE, { channel: "chromium", headless: true, viewport: { width: 1280, height: 900 } });
    const page = browser.pages()[0] || (await browser.newPage());
    page.on("pageerror", (e) => out.errors.push("PAGEERROR: " + String(e && e.message || e).slice(0, 160)));
    // 1) 打开设计器首页（IPC / 会话初始化）
    const r1 = await page.goto(INDEX_URL, { waitUntil: "domcontentloaded", timeout: 40000 }).catch((e) => ({ status: 0, error: String(e && e.message || e).slice(0, 120) }));
    out.steps.push({ step: "index-do", status: r1 && r1.status ? r1.status() : 0 });
    await SLEEP(2500);
    // 2) 打开 OCRTool.do
    const r2 = await page.goto(OCR_URL, { waitUntil: "domcontentloaded", timeout: 40000 }).catch((e) => ({ status: 0, error: String(e && e.message || e).slice(0, 120) }));
    out.steps.push({ step: "ocr-tool", status: r2 && r2.status ? r2.status() : 0 });
    await SLEEP(3000);
    out.finalUrl = page.url();
    const html = await page.content().catch(() => "");
    out.htmlLen = String(html).length;
    out.loginRedirect = isLoginRedirect(html);
    // 3) 全域抓取并过滤 zheliyin 域 cookie（含 httpOnly）
    let cookies = (await browser.cookies().catch(() => [])).filter((c) => /zheliyin\.com$/i.test(String(c.domain || "")));
    // 4) 身份缺失 → 尝试自动登录（P0_LOGIN_USER/P0_LOGIN_PASS）；成功后重新抓取
    if (!hasIdentityCookies(cookies)) {
      const didLogin = await tryAutoLogin(page, out);
      if (didLogin) {
        await page.goto(INDEX_URL, { waitUntil: "domcontentloaded", timeout: 40000 }).catch(() => {});
        await SLEEP(2500);
        cookies = (await browser.cookies().catch(() => [])).filter((c) => /zheliyin\.com$/i.test(String(c.domain || "")));
      }
    }
    const raw = cookieToRaw(cookies);
    out.cookieChars = String(raw).length;
    out.hostCount = cookies.length;
    out.domains = Array.from(new Set((cookies || []).map((c) => c.domain || "")));
    out.names = (cookies || []).map((c) => c.name + (c.httpOnly ? "*" : ""));
    const sess = (cookies || []).find((c) => c.name === "SESSION");
    out.session = sess ? (String(sess.value).slice(0, 8) + "…") : null;
    out.identity = hasIdentityCookies(cookies);
    const fp = cookieParts(raw);
    if (!out.loginRedirect && sess && String(sess.value).length >= 30 && out.identity) {
      fs.writeFileSync(OUT_FILE, raw, "utf8");
      out.ok = true; out.source = "probe"; out.wrote = OUT_FILE; out.wroteChars = raw.length;
    } else if (!out.loginRedirect && sess && String(sess.value).length >= 30 && !out.identity) {
      // 缺身份 cookie → 保守合并：保留「上次已知可用全量」（含已验证 SESSION），补齐 fresh 新字段
      const known = readOutFile();
      const kp = cookieParts(known);
      if (known && kp["diy-User-third"]) {
        const merged = toRaw(mergeCookies(kp, fp, false));
        fs.writeFileSync(OUT_FILE, merged, "utf8");
        out.ok = true; out.source = "merged"; out.wrote = OUT_FILE; out.wroteChars = merged.length;
        out.errors.push("MERGED_CONSERVATIVE: probe 无身份 cookie（profile 未登录），保留上次已验证全量 SESSION");
      } else {
        out.errors.push("MISSING_IDENTITY: 无 diy-User-third 且无上次可用全量可合并，需要人工注入 ZY_STAGE9_COOKIE 或登录持久 profile");
      }
    } else {
      out.errors.push(out.loginRedirect ? "LOGIN_REDIRECT: 需要人工登录持久 profile" : (sess ? "SESSION_TOO_SHORT" : "NO_SESSION_COOKIE"));
    }
  } catch (e) { out.errors.push("FATAL: " + String(e && e.message || e).slice(0, 300)); }
  finally { try { await browser.close(); } catch (e) {} }
  return out;
}

// 解析本次运行使用的会话 cookie：
// 1) env ZY_STAGE9_COOKIE 显式注入（优先；缺身份则尝试与上次已知全量保守合并）
// 2) probe 自动抓取 OCRTool.do 最新 cookie（ZY_SESSION_REFRESH=1 或未注入 env 时执行；
//    缺身份时尝试 P0_LOGIN_USER/P0_LOGIN_PASS 自动登录）
// 3) 全部失败时回退「上次已知可用全量」（标记可能过期）
async function resolveStage9Cookie() {
  const envRaw = (process.env && process.env.ZY_STAGE9_COOKIE) || "";
  const known = readOutFile();
  const knownParts = cookieParts(known);
  const tryMerge = (freshRaw) => {
    const fp = cookieParts(freshRaw);
    if (!known || !knownParts["diy-User-third"]) return null;
    return { ok: true, raw: toRaw(mergeCookies(knownParts, fp, false)), source: "merged", sessionOk: true };
  };
  const forceProbe = !!(process.env && process.env.ZY_SESSION_REFRESH === "1");
  if (!forceProbe && envRaw) {
    const p = cookieParts(envRaw);
    if (p["SESSION"] && p["diy-User-third"]) return { ok: true, raw: envRaw, source: "env" };
    const m = tryMerge(envRaw);
    if (m) return Object.assign(m, { note: "env-missing-identity-merged" });
    return { ok: true, raw: envRaw, source: "env", warning: "IDENTITY_MISSING" };
  }
  const r = await probe();
  if (r.ok) {
    return { ok: true, raw: readOutFile(), source: r.source || (r.loginOk ? "probe-login" : "probe") };
  }
  if (!forceProbe && knownParts["SESSION"] && knownParts["diy-User-third"]) {
    return { ok: true, raw: known, source: "file-stale-fallback", warning: "PROBE_FAILED_STALE" };
  }
  return { ok: false, error: (r.errors || []).join(" | ") || "NO_COOKIE", probe: r };
}

if (require.main === module) {
  (async () => {
    const r = await probe();
    console.log("[session-probe] ok=" + r.ok + " source=" + (r.source || "-") + " session=" + r.session + " identity=" + r.identity + " loginOk=" + r.loginOk + " cookieChars=" + r.cookieChars + " loginRedirect=" + r.loginRedirect + " steps=" + JSON.stringify(r.steps) + " names=" + JSON.stringify(r.names || []));
    if (r.wrote) console.log("[session-probe] wrote -> " + r.wrote + " (" + r.wroteChars + " chars)");
    (r.errors || []).slice(0, 6).forEach((e) => console.error("[session-probe] " + e));
    process.exit(r.ok ? 0 : 3);
  })();
}
module.exports = { probe: probe, resolveStage9Cookie: resolveStage9Cookie, tryAutoLogin: tryAutoLogin, cookieToRaw: cookieToRaw, parseCookieRaw: parseCookieRaw, cookieParts: cookieParts, mergeCookies: mergeCookies, hasIdentityCookies: hasIdentityCookies, isLoginRedirect: isLoginRedirect, OUT_FILE: OUT_FILE };
