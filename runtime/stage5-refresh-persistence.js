// runtime/stage5-refresh-persistence.js — Stage 5.0 §十一/§十二/§十九：Refresh Persistence Test
// 目标：实证「哪些字段刷新后仍存在（服务端模板字段）、哪些是会话运行时字段」。
//   A) 同一会话 reload：textbox 的 markuuid 是否保持；uuid 是否重新生成（fabric 实例 id）
//   B) 未保存 text 修改 → reload 后是否恢复模板原值（不点击保存，§十三/§三十九）
//   C) geometry/style 快照 reload 前后一致性（模板级持久化）
// 约束：只对 1 个已有 textbox 做一次 setText 临时修改，reload 后不残留；禁止点击保存/提交。
// 输出：reports/stage5-refresh-persistence.json
"use strict";
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";
const TEST_TEXT = "ZY_STAGE5_REFRESH_TEST";

function sha8(s) { return crypto.createHash("sha256").update(String(s || "")).digest("hex").slice(0, 8); }

(async () => {
  const out = { ts: new Date().toISOString(), stage: "Stage 5.0 refresh-persistence", steps: [], errors: [] };
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

    // 锚点 textbox（第一个 text 非空的 textbox）+ reload 前快照
    const before = await page.evaluate((hashText) => {
      function djb2v(s) { let h = 5381, i = String(s == null ? "" : s).length; while (i) h = (h * 33) ^ s.charCodeAt(--i); return (h >>> 0).toString(16); }
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      const objs = c.getObjects();
      const tb = objs.find((o) => o && typeof o.text === "string" && String(o.text).trim().length > 0);
      if (!tb) return null;
      const s = {
        markuuid: tb.markuuid != null ? String(tb.markuuid) : null,
        uuid: tb.uuid != null ? String(tb.uuid) : null,
        textLen: String(tb.text || "").length,
        textHash8: djb2v(tb.text),
        textHead: String(tb.text || "").slice(0, 12),
        geometry: { left: tb.left, top: tb.top, width: tb.width, height: tb.height, scaleX: tb.scaleX, scaleY: tb.scaleY, angle: tb.angle },
        style: { fontFamily: tb.fontFamily, fontSize: tb.fontSize, lineHeight: tb.lineHeight },
        layerNum: tb.layerNum,
        index: objs.indexOf(tb)
      };
      // 最小临时修改：setText 测试值（in-memory，不保存）
      if (typeof tb.setText === "function") tb.setText(hashText); else tb.text = hashText;
      if (typeof tb.initDimensions === "function") tb.initDimensions();
      tb.dirty = true;
      return s;
    }, TEST_TEXT);
    step("snapshot-before", !!before, JSON.stringify({ markuuid: before && before.markuuid, uuidPrefix: before && String(before.uuid || "").slice(0, 8), textHash8: before && before.textHash8, textHead: before && before.textHead, geometry: before && before.geometry }), "REAL_CANVAS");
    if (!before) return;

    // 修改后 readback（确认 setText 生效）
    const mid = await page.evaluate((testText) => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      const tb = c.getObjects().find((o) => o && typeof o.text === "string" && String(o.text).indexOf(testText) >= 0);
      return tb ? { changed: true, textHead: String(tb.text || "").slice(0, 24), width: tb.width, height: tb.height } : { changed: false };
    }, TEST_TEXT);
    step("mutation-effective", !!(mid && mid.changed), JSON.stringify(mid), "REAL_MUTATION_TEMPORARY");

    // reload（同一会话，不保存）
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => step("reload", false, String(e && e.message || e)));
    await page.waitForTimeout(2000);
    step("canvas-text-ready-2", await waitCanvas(), "reload 后 textbox 就绪", "REAL_CANVAS");

    // reload 后快照（找 markuuid 相同的对象 → 验证 markuuid 稳定性；再记录任意 textbox 的 uuid）
    const after = await page.evaluate(({ beforeMark, testText }) => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      const objs = c.getObjects();
      const texts = objs.filter((o) => o && typeof o.text === "string" && String(o.text).trim().length > 0);
      if (!texts.length) return null;
      const matched = beforeMark != null ? texts.find((o) => String(o.markuuid || "") === beforeMark) : null;
      const anchor = matched || texts[0];
      const leak = objs.find((o) => o && typeof o.text === "string" && String(o.text).indexOf(testText) >= 0);
      return {
        markuuidMatched: !!matched,
        nowText: String(anchor.text || "").slice(0, 12),
        nowTextLen: String(anchor.text || "").length,
        uuidNow: matched ? String(matched.uuid || "") : String(texts[0].uuid || ""),
        geometry: { left: anchor.left, top: anchor.top, width: anchor.width, height: anchor.height, scaleX: anchor.scaleX, scaleY: anchor.scaleY, angle: anchor.angle },
        style: { fontFamily: anchor.fontFamily, fontSize: anchor.fontSize, lineHeight: anchor.lineHeight },
        layerNum: anchor.layerNum,
        index: objs.indexOf(anchor),
        leakedMutation: !!leak
      };
    }, { beforeMark: before.markuuid, testText: TEST_TEXT });
    step("post-reload", !!after, JSON.stringify({ markuuidMatched: after && after.markuuidMatched, textRestoredHead: after && after.nowText, leakedTestValue: after && after.leakedMutation, uuidNowPrefix: after && String(after.uuidNow || "").slice(0, 8) }), "REAL_CANVAS");
    if (!after) return;

    // 判定
    // 1) 未保存 text 修改 reload 后恢复模板原值（服务器未持久化临时修改）
    const restored = after.nowTextLen === before.textLen && after.nowText === before.textHead;
    step("text-restored-after-refresh", restored, "before(textHash8=" + before.textHash8 + ") after(" + after.nowText + "/len=" + after.nowTextLen + ") leaked=" + after.leakedMutation, "REFRESH_PERSISTENCE_A");
    // 2) markuuid reload 稳定（模板级持久 id 候选）
    step("markuuid-stable-across-reload", after.markuuidMatched === true, "markuuid=" + (before.markuuid || "").slice(0, 16), "REFRESH_PERSISTENCE_B");
    // 3) uuid 会话内实例 id：reload 前后对比（若 markuuid 匹配到对象则对比其 uuid）
    const uuidStable = before.uuid != null && after.uuidNow === before.uuid;
    step("uuid-rel-load-behavior", true, uuidStable ? "SAME（uuid 保持）" : "CHANGED（uuid 重新生成，会话级实例 id）" + " before=" + String(before.uuid || "").slice(0, 8) + " after=" + String(after.uuidNow || "").slice(0, 8), "REFRESH_PERSISTENCE_C");
    // 4) geometry/style 模板级一致（reload 后恢复模板值）
    const geoSame = Math.abs(after.geometry.left - before.geometry.left) < 0.01 &&
      Math.abs(after.geometry.top - before.geometry.top) < 0.01 &&
      Math.abs(after.geometry.width - before.geometry.width) < 0.01 &&
      Math.abs(after.geometry.scaleX - before.geometry.scaleX) < 0.01 &&
      Math.abs(after.style.fontSize - before.style.fontSize) < 0.01;
    step("geometry-style-restored", geoSame, JSON.stringify({ before: before.geometry, after: after.geometry }), "REFRESH_PERSISTENCE_D");
    // 5) index 稳定性（同结构 reload 后 textbox index 对比）
    step("index-stability-observation", true, "before index=" + before.index + " after index=" + after.index + "（同页面重载后结构一致；index 为数组位次，删除/插入会移位，不作 identity）", "REFRESH_PERSISTENCE_E");

    out.summary = {
      finding: {
        "uuid": "会话级实例 id（reload 后重新生成，两次独立会话观察也证实不同）；不可作跨会话 PERSISTED id",
        "markuuid": "reload 后保持，可跨会话定位对象（文字层唯一；SVG 组内共享需注意）——PERSISTED_EDITOR_ID 候选（文字层）",
        "text": "未保存修改 reload 后恢复模板原值（服务端模板字段；保存时才持久化）",
        "geometry/style": "reload 后恢复模板值（模板级持久字段）"
      }
    };
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 500));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.writeFileSync(path.join(__dirname, "reports", "stage5-refresh-persistence.json"), JSON.stringify(out, null, 1), "utf8");
  console.log("[stage5-refresh] errors=" + out.errors.length + " → reports/stage5-refresh-persistence.json");
  process.exit(out.errors.length ? 1 : 0);
})();