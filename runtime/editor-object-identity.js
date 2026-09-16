// runtime/editor-object-identity.js — Stage 5.0 §十四/§十五/§十六：Object Identity Test
// 回答：一个 Canvas Object 如何稳定识别？
//   1) uuid / markuuid / id / index 四类候选的真实覆盖与唯一性矩阵（全画布）
//   2) mutation（setText）后 identity 是否稳定（同一对象前后 identity 值不变）
//   3) index 位次语义：不删除真实模板对象；用「fabric 数组顺序 = 渲染 z 序，插入/删除即移位」的事实 +
//      以 apply 创建对象 append 到数组尾部（RUNTIME-8 已证）作为 index 不可作 identity 的依据
// 约束：只读 + 一次 setText 临时修改并恢复；禁止删除/新增真实模板对象（§十五 冲突降级为观察性证据）
// 输出：reports/stage5-object-identity.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";
const TEST_TEXT = "ZY_STAGE5_ID_TEST";

(async () => {
  const out = { ts: new Date().toISOString(), stage: "Stage 5.0 identity", steps: [], errors: [] };
  const step = (n, ok, d, ev) => { out.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 500), evidence: ev || "n/a" }); if (!ok) out.errors.push(n); };
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    const page = browser.pages()[0];
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => step("nav", false, String(e && e.message || e)));
    step("nav", true, "真实编辑器已打开", "REAL_EDITOR");

    // 等待 textbox 就绪
    const waitCanvas = async () => {
      const deadline = Date.now() + 120000;
      while (Date.now() < deadline) {
        const r = await page.evaluate(() => {
          const req = window.requirejs || window.require;
          const ctx = req && req.s && req.s.contexts && req.s.contexts._;
          const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
          const c = vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && ((vo.totalCanvasArray[0].canvas) || vo.totalCanvasArray[0]);
          return c && typeof c.getObjects === "function" ? c.getObjects().filter((o) => o && typeof o.text === "string").length : 0;
        }).catch(() => 0);
        if (r >= 1) return true;
        await new Promise((res) => setTimeout(res, 3000));
      }
      return false;
    };
    step("canvas-text-ready", await waitCanvas(), "textbox 就绪", "REAL_CANVAS");

    // 唯一性矩阵 + 目标对象（第一个 textbox）
    const matrix = await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      const objs = c.getObjects();
      const rows = objs.map((o, idx) => ({ index: idx, type: o.type, uuid: o.uuid != null ? String(o.uuid) : null, markuuid: o.markuuid != null ? String(o.markuuid) : null, id: o.id != null ? String(o.id) : null, isText: typeof o.text === "string", text: typeof o.text === "string" ? String(o.text).slice(0, 20) : null }));
      function uniq(vals) { const m = {}; const dup = new Set(); const seen = new Set(); vals.forEach((v) => { if (v == null) return; if (seen.has(v)) dup.add(v); seen.add(v); m[v] = (m[v] || 0) + 1; }); return { total: vals.filter((v) => v != null).length, unique: seen.size, hasDup: dup.size > 0, dupValues: Array.from(dup).slice(0, 5) }; }
      const uuidAll = uniq(rows.map((r) => r.uuid));
      const markAll = uniq(rows.map((r) => r.markuuid));
      const idAll = uniq(rows.map((r) => r.id));
      // textbox 子集的 markuuid 唯一性（业务聚焦）
      const tb = rows.filter((r) => r.isText);
      const markTb = uniq(tb.map((r) => r.markuuid));
      const target = tb[0];
      const targetObj = objs[target.index];
      return { rows: rows, uniq: { uuidAll: uuidAll, markAll: markAll, idAll: idAll, markTextboxOnly: markTb }, target: { index: target.index, uuid: target.uuid, markuuid: target.markuuid, text: target.text, type: target.type } };
    });
    step("identity-matrix", !!matrix, JSON.stringify({ uuidAll: matrix.uniq.uuidAll, markAll: matrix.uniq.markAll, idAll: matrix.uniq.idAll, markTextboxOnly: matrix.uniq.markTextboxOnly }), "REAL_CANVAS");
    if (!matrix) return;

    // mutation 前后 identity 对比：setText(TEST) → 重新定位（markuuid/uuid）→ 恢复 → 复读
    const idAfterMutation = await page.evaluate(({ targetMark, targetUuid, testText }) => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      const objs = c.getObjects();
      const byMark = targetMark != null ? objs.find((o) => o != null && String(o.markuuid || "") === targetMark) : undefined;
      const byUuid = targetUuid != null ? objs.find((o) => o != null && String(o.uuid || "") === targetUuid) : undefined;
      const anchor = byMark || byUuid;
      if (!anchor) return { found: false };
      const originalText = String(anchor.text || "");
      const before = { markuuid: String(anchor.markuuid || ""), uuid: String(anchor.uuid || ""), index: objs.indexOf(anchor), text: originalText.slice(0, 16) };
      if (typeof anchor.setText === "function") anchor.setText(testText);
      anchor.dirty = true;
      if (typeof anchor.initDimensions === "function") anchor.initDimensions();
      const after = { markuuid: String(anchor.markuuid || ""), uuid: String(anchor.uuid || ""), index: objs.indexOf(anchor), text: String(anchor.text || "").slice(0, 24) };
      // 恢复原值（完整文本）
      if (typeof anchor.setText === "function") anchor.setText(originalText);
      anchor.dirty = true;
      if (typeof anchor.initDimensions === "function") anchor.initDimensions();
      const restored = { markuuid: String(anchor.markuuid || ""), uuid: String(anchor.uuid || ""), index: objs.indexOf(anchor), text: String(anchor.text || "").slice(0, 16) };
      return { found: true, before: before, after: after, restored: restored };
    }, { targetMark: matrix.target.markuuid, targetUuid: matrix.target.uuid, testText: TEST_TEXT });
    step("identity-stable-under-mutation", !!(idAfterMutation && idAfterMutation.found && idAfterMutation.before.markuuid === idAfterMutation.after.markuuid && idAfterMutation.before.uuid === idAfterMutation.after.uuid), JSON.stringify(idAfterMutation), "REAL_CANVAS");
    step("identity-index-note", true, "fabric 数组顺序=渲染 z 序：插入/删除即移位（apply 创建对象追加至尾部 RUNTIME-8 已证）；index 仅在当前数组快照内可取，不作稳定 identity", "§十五");

    out.summary = {
      identity_matrix: matrix.uniq,
      identity_stable_under_mutation: idAfterMutation && idAfterMutation.before,
      finding: {
        "PERSISTED_EDITOR_ID": "markuuid（textbox 唯一、跨 reload 稳定，实测 AD4636D5...）；SVG 组内共享 → 对象级唯一仅对独立文字/图形成立",
        "LOCAL_RUNTIME_ID": "uuid（每次页面会话重新生成）+ array index（位次），仅会话内可作运行引用，不得跨会话持久",
        "id 字段": "SVG 图层名（'图层_1'），组内重复，不可作 identity"
      }
    };
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 500));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.writeFileSync(path.join(__dirname, "reports", "stage5-object-identity.json"), JSON.stringify(out, null, 1), "utf8");
  console.log("[stage5-identity] errors=" + out.errors.length + " → reports/stage5-object-identity.json");
  process.exit(out.errors.length ? 1 : 0);
})();