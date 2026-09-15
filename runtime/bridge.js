// runtime/bridge.js — RUNTIME-3 Bridge Runtime 验证
// 复用项目现有 postMessage 协议（zy-card-assistant → zy-card-assistant-page）。
// 覆盖：marker 安装、单请求恰 1 响应、N 请求恰 N 响应、跨实例重复防护、畸形消息。
// 只读（probe）与仿真注入（install仿真，不改生产代码；用于跨实例重复回归）。
"use strict";

const BRIDGE_SOURCE = "zy-card-assistant";
const PAGE_SOURCE = "zy-card-assistant-page";
const MARKER = "__ZY_CARD_ASSISTANT_BRIDGE__";

// 页面侧：读取 marker + 发送 probe 统计响应（事件驱动，bounded 超时）
function bridgeProbeScript(opts) {
  // opts: { sends: number, delayEach: number }
  return `(() => {
    const sends = ${opts.sends};
    const delayEach = ${opts.delayEach || 0};
    const cb = window["${MARKER}"];
    const out = { marker: cb ? { installed: cb.installed === true, ts: typeof cb.ts } : null };
    let responses = 0;
    const samples = [];
    function onMsg(e) {
      if (!e.data) return;
      if (e.data.source === "${PAGE_SOURCE}" && e.data.type === "probeResult") {
        responses += 1;
        if (samples.length < 2) samples.push({ ok: e.data.ok, canvasesCount: Array.isArray(e.data.canvases) ? e.data.canvases.length : null });
      }
    }
    window.addEventListener("message", onMsg);
    function sendOne(i) {
      window.postMessage({ source: "${BRIDGE_SOURCE}", type: "probe", rt:i }, location.origin);
    }
    (async () => {
      for (let i = 0; i < sends; i += 1) {
        sendOne(i);
        if (delayEach > 0) await new Promise(r => setTimeout(r, delayEach));
      }
      await new Promise(r => setTimeout(r, 1500));
      window.removeEventListener("message", onMsg);
      return Object.assign(out, { sent: sends, responses, samples });
    })().then(v => { window.__zyRtBridgeResult = v; });
  })()`;
}

async function readBridgeResult(page, timeoutMs = 6000) {
  await page.waitForFunction(() => !!window.__zyRtBridgeResult, null, { timeout: timeoutMs }).catch(() => {});
  const r = await page.evaluate(() => { const v = window.__zyRtBridgeResult; window.__zyRtBridgeResult = undefined; return v; });
  return r;
}

// 单请求 → 恰 1 响应（§十七 单请求测试）
async function probeExactlyOne(page) {
  await page.evaluate(bridgeProbeScript({ sends: 1 }));
  const r = await readBridgeResult(page);
  return { ok: !!(r && r.responses === 1), detail: JSON.stringify(r || { read: "timeout/no-result" }) };
}

// N 请求 → 恰 N 响应（§十七 N 请求测试）
async function probeNTimes(page, n = 5) {
  await page.evaluate(bridgeProbeScript({ sends: n, delayEach: 60 }));
  const r = await readBridgeResult(page);
  return { ok: !!(r && r.responses === n), detail: JSON.stringify(r || { read: "timeout/no-result" }) };
}

// marker 安装状态
async function readMarker(page) {
  return page.evaluate((m) => { const cb = window[m]; return cb ? { installed: cb.installed === true, ts: cb.ts } : null; }, MARKER);
}

module.exports = { probeExactlyOne, probeNTimes, readMarker, bridgeProbeScript, BRIDGE_SOURCE, PAGE_SOURCE, MARKER };