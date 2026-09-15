// runtime/scriptcat.js — RUNTIME-2 ScriptCat Runtime 验证
// 职责：在真实页面检测「助手面板」与 userscript 注入迹象（版本/按钮/事件绑定）。
// 只读断言；证据等级 REAL_SCRIPT_CAT（真实登录编辑态下）或如实降级标注。
"use strict";

const PANEL_TITLE = "名片套版助手";
const PANEL_VERSION = "0.3.0.0";
const EXPECTED_BUTTONS = ["识别并填正反面", "填正面", "填反面", "追加信息"];

// 只读探针（页面主世界执行）：面板 DOM / 文案 / 关键元素。不改任何对象。
const PANEL_PROBE_SRC = `(() => {
  "use strict";
  const panel = document.getElementById("zy-card-assistant");
  if (!panel) return { panel: false, reason: "no #zy-card-assistant" };
  const text = function (sel) { const n = panel.querySelector(sel); return n ? String((n.textContent || "").trim()) : null; };
  const btn = function (sel) { const n = panel.querySelector(sel); return n ? { exists: true, text: String((n.textContent || "").trim()) } : { exists: false }; };
  const out = {
    panel: true,
    title: text(".zy-title"),
    versionLine: text(".zy-url"),
    hasBody: !!panel.querySelector(".zy-body"),
    hasTextarea: !!panel.querySelector("#zy-raw"),
    buttons: {
      parseApply: btn("#zy-parse-apply"),
      append: btn("#zy-append"),
      applyFront: btn("#zy-apply-front"),
      applyBack: btn("#zy-apply-back"),
      minBtn: !!panel.querySelector("#zy-min-btn"),
      closeBtn: !!panel.querySelector("#zy-close-btn"),
      probeBtn: !!panel.querySelector("#zy-probe")
    }
  };
  // 事件绑定抽查：绑定存在性（不能只看 DOM，还要看可点）
  out.visibility = { w: panel.offsetWidth > 0, h: panel.offsetHeight > 0, positioned: panel.style.position !== "" };
  return out;
})()`;

// 返回 Promise<{ok, detail}>：面板存在 + 标题版本 + 关键按钮齐全 + 可见
async function assertPanel(page, timeoutMs = 15000) {
  try {
    await page.waitForSelector("#zy-card-assistant", { timeout: 2000 }).catch(() => {});
  } catch (e) { /* 等待交给下面探针判断 */ }
  const r = await page.evaluate(PANEL_PROBE_SRC).catch((e) => ({ panel: false, reason: "eval:" + String(e && e.message || e) }));
  if (!r.panel) return { ok: false, detail: "panel missing: " + (r.reason || "") };
  const titleOk = r.title === PANEL_TITLE;
  const versionOk = r.versionLine && r.versionLine.indexOf(PANEL_VERSION) >= 0;
  const buttonsOk =
    r.buttons.parseApply.exists && r.buttons.parseApply.text.indexOf(EXPECTED_BUTTONS[0]) >= 0 &&
    r.buttons.applyFront.exists && r.buttons.applyBack.exists && r.buttons.append.exists;
  const bs = r.buttons;
  const eventOk = !!(bs.minBtn && bs.closeBtn); // 收起/关闭按钮存在（binding 在 bindPanel 内；click 行为由 Alone 测试观察）
  const visible = !!r.visibility && r.visibility.w && r.visibility.h;
  return {
    ok: titleOk && versionOk && buttonsOk && eventOk && visible,
    detail: JSON.stringify({
      titleOk, versionOk, buttonsOk, eventOk, visible,
      title: r.title, versionLine: r.versionLine ? r.versionLine.slice(0, 60) : null,
      parseApplyText: r.buttons.parseApply.text
    })
  };
}

module.exports = { assertPanel, PANEL_PROBE_SRC, PANEL_TITLE, PANEL_VERSION, EXPECTED_BUTTONS };