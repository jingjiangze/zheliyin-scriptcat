// ============================================================================
// runtime/p0/session-adopt.js — Real Session Adoption
// ----------------------------------------------------------------------------
// 职责：
//   1. 探测本机可调试的 Chrome/Edge/Chromium（P0_CDP_URL 或默认端口 9222..9231）
//   2. connectOverCDP 接管（若找到真机已登录标签）
//   3. 未找到 → 返回 MANAGED_PERSISTENT_PROFILE 信号
//   4. 输出 SESSION_SOURCE 与会话快照（脱敏：仅 cookie name/domain/path/secure）
// 安全约束：
//   - 禁止记录 cookie value / token / password / session secret
//   - 报告只输出 AUTH_CONFIGURED / SESSION_SOURCE 等标志
// 用法（由 runner 调用）：
//   const adopt = require("./session-adopt");
//   await adopt.discover();  -> { source, cdpUrl, pages: [...] }
// ============================================================================
"use strict";
const { chromium } = require("playwright");

const CDP_URL = process.env.P0_CDP_URL || null;
const DEFAULT_PORTS = [9222, 9223, 9224, 9225, 9229, 9230, 9231];
const TARGET_HOST = "diy.zheliyin.com";

// 尝试 connectOverCDP；返回 { ok, browser } 或 { ok:false, err }
async function tryConnect(url) {
  try {
    const browser = await chromium.connectOverCDP(url, { timeout: 3000 });
    return { ok: true, browser };
  } catch (e) {
    return { ok: false, err: String(e && e.message || e).slice(0, 160) };
  }
}

// 从 context 收集页面清单（脱敏）
async function snapshotPages(browser) {
  const out = [];
  try {
    const contexts = browser.contexts() || [];
    for (const ctx of contexts) {
      for (const p of ctx.pages()) {
        let url = "", title = "";
        try { url = p.url(); } catch (e) {}
        try { title = await p.title().catch(() => ""); } catch (e) {}
        const isEditor = url.indexOf(TARGET_HOST) >= 0 && /thirdDiy(Add|Edit)|diyWeb/.test(url);
        let editorReady = false;
        if (isEditor) {
          try { editorReady = !!(await p.evaluate(() => {
            const req = window.requirejs || window.require;
            const vo = ((req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO);
            const d = (vo && vo.totalCanvasArray && vo.totalCanvasArray[0]);
            return !!(d && d.canvas && typeof d.drawText === "function");
          }).catch(() => false)); } catch (e) {}
        }
        out.push({ url: url.slice(0, 240), title: String(title || "").slice(0, 60), isEditor, editorReady });
      }
    }
  } catch (e) { out.push({ err: String(e).slice(0, 120) }); }
  return out;
}

// Cookie 名集合（脱敏）
async function cookieNames(browser) {
  const names = new Set();
  try {
    for (const ctx of browser.contexts()) {
      const cs = await ctx.cookies().catch(() => []);
      for (const c of cs) if (c.name) names.add(c.name);
    }
  } catch (e) {}
  return [...names].sort();
}

async function discover() {
  // 1) 显式 CDP URL
  if (CDP_URL) {
    const r = await tryConnect(CDP_URL);
    if (r.ok) {
      const pages = await snapshotPages(r.browser);
      return { source: "EXISTING_REAL_BROWSER", cdpUrl: CDP_URL, pages, cookieNames: await cookieNames(r.browser), browser: r.browser };
    }
  }
  // 2) 常见默认端口
  for (const port of DEFAULT_PORTS) {
    const r = await tryConnect("http://127.0.0.1:" + port);
    if (r.ok) {
      const pages = await snapshotPages(r.browser);
      return { source: "EXISTING_REAL_BROWSER", cdpUrl: "http://127.0.0.1:" + port, pages, cookieNames: await cookieNames(r.browser), browser: r.browser };
    }
  }
  return { source: "MANAGED_PERSISTENT_PROFILE", cdpUrl: null, pages: [], cookieNames: [] };
}

module.exports = { discover, tryConnect, snapshotPages, cookieNames };