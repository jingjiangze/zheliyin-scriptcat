// runtime/stage5-object-matcher.js — Stage 5.2 §二十八~§三十三：Matcher Real-Editor Probe + Safe Mutation 阶段二
// 流程：真实编辑器 → 读取 textbox（raw + fabric visualBounds）→ parseEditorObject → 注入 visualBounds
//   → 用「真实对象自身」生成 candidates（text 脱敏 hash + visualBounds）
//   → matcher 自匹配（期望 MATCHED 且 selected.index 一致）
//   → 偏移 bbox 验证 score 下降 / 换对象
//   → 阶段二：MATCHED → adapter.zyWriteText → diff（期望仅 text+height）→ restore → diff 空
// 输出：reports/stage5-matcher.json
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const model = require(path.join(__dirname, "..", "extension", "src", "editor", "object-model.js"));
const matcher = require(path.join(__dirname, "..", "extension", "src", "editor", "object-matcher.js"));
const diff = require("./editor-object-diff");
const adapter = require(path.join(__dirname, "..", "extension", "src", "editor", "object-adapter.js"));

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";
const TEST_LONG = "ZY_MATCHER_MUTATION_TEST_LONG_CONTENT";

(async () => {
  const out = { ts: new Date().toISOString(), stage: "Stage 5.2 matcher", steps: [], errors: [] };
  const step = (n, ok, d, ev) => { out.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 700), evidence: ev || "n/a" }); if (!ok) out.errors.push(n); };
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
    const deadline = Date.now() + 150000;
    let ready = false;
    while (Date.now() < deadline) {
      ready = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
        const c = vo && vo.totalCanvasArray && vo.totalCanvasArray[0] && ((vo.totalCanvasArray[0].canvas) || vo.totalCanvasArray[0]);
        return c && typeof c.getObjects === "function" ? c.getObjects().filter((o) => o && typeof o.text === "string").length : 0;
      }).catch(() => 0);
      if (ready >= 1) break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    step("canvas-ready", ready >= 1, "textbox ready", "REAL_CANVAS");
    if (!ready) return;

    // 采集 textbox raw + fabric visualBounds（真实引擎 AABB）
    const rawList = await page.evaluate(() => {
      function h8(s) { let h = 5381, i = String(s == null ? "" : s).length; while (i) h = (h * 33) ^ s.charCodeAt(--i); return (h >>> 0).toString(16); }
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      const objs = c.getObjects();
      return objs.filter((o) => o && typeof o.text === "string").map((o) => {
        let vb = null;
        try { if (typeof o.getBoundingRect === "function") { const r = o.getBoundingRect(); vb = { left: r.left, top: r.top, width: r.width, height: r.height }; } } catch (e) {}
        return {
          index: objs.indexOf(o),
          raw: {
            type: o.type, subType: o.subType, mediaMediaType: o.mediaMediaType,
            left: o.left, top: o.top, width: o.width, height: o.height,
            scaleX: o.scaleX, scaleY: o.scaleY, angle: o.angle,
            text: String(o.text || ""), fontFamily: o.fontFamily, fontSize: o.fontSize, layerNum: o.layerNum,
            markuuid: o.markuuid != null ? String(o.markuuid) : null, uuid: o.uuid != null ? String(o.uuid) : null
          },
          visualBounds: vb,
          textHash8: h8(o.text), textLen: String(o.text || "").length
        };
      });
    });

    // Node 侧建 EditorObject（脱敏 content）+ visualBounds
    const objects = rawList.map((r) => {
      const o = Object.assign({ type: r.raw.type, subType: r.raw.subType, mediaMediaType: r.raw.mediaMediaType, left: r.raw.left, top: r.raw.top, width: r.raw.width, height: r.raw.height, scaleX: r.raw.scaleX, scaleY: r.raw.scaleY, angle: r.raw.angle, text: "[REDACTED:len" + r.raw.text.length + "]", markuuid: r.raw.markuuid, uuid: r.raw.uuid, layerNum: r.raw.layerNum }, {});
      const em = model.parseEditorObject(o, "front", r.index);
      em.visualBounds = r.visualBounds; // fabric AABB 注入
      em.__rawText = r.raw.text; // mutation 阶段使用（不入 report）
      return em;
    });
    out.objects = rawList.map((r) => ({ index: r.index, textHash8: r.textHash8, textLen: r.textLen, vb: r.visualBounds, persistedId: r.raw.markuuid }));
    step("objects-collected", objects.length >= 1, "text objects=" + objects.length, "REAL_EDITOR");

    // 自匹配：candidate.text 用真实文本（仅判定用语义/几何；report 只记 hash）
    const canvasWH = { canvasWidth: 619.5, canvasHeight: 376.8625 };
    const selfResults = [];
    objects.forEach((obj, i) => {
      const vb = obj.visualBounds;
      const res = matcher.match({ text: obj.__rawText, bbox: { x: vb.left, y: vb.top, width: vb.width, height: vb.height }, confidence: 0.99, source: "manual" }, objects, canvasWH);
      selfResults.push({ index: obj.identity.index, status: res.status, selectedIndex: res.selected ? res.selected.index : null, score: res.score != null ? res.score : (res.topScore != null ? res.topScore : null), reasons: res.reasons || [] });
    });
    const allSelfMatched = selfResults.every((r) => r.status === "MATCHED" && r.selectedIndex === r.index);
    out.selfMatch = selfResults;
    step("matcher-self-match", allSelfMatched, "self match n=" + selfResults.length + " → " + JSON.stringify(selfResults.map((r) => ({ i: r.index, sel: r.selectedIndex, s: +r.score.toFixed(3) }))), "OBJECT_MATCHER:§二十九");

    // 偏移验证：对第 1 个对象，candidate bbox 右移 180px → 期望选中其它对象或 score 显著下降
    const firstRaw = rawList[0];
    const shifted = matcher.match({ text: firstRaw.raw.text, bbox: { x: firstRaw.visualBounds.left + 180, y: firstRaw.visualBounds.top, width: firstRaw.visualBounds.width, height: firstRaw.visualBounds.height }, confidence: 0.9, source: "manual" }, objects, canvasWH);
    const selfScore = selfResults[0].score;
    step("matcher-offset-score-drop", shifted.score == null || shifted.status !== "MATCHED" || shifted.selected.index !== 0 || (shifted.score != null && shifted.score < selfScore), "self.score=" + selfScore.toFixed(3) + " → shifted=" + JSON.stringify({ status: shifted.status, selected: shifted.selected && shifted.selected.index, score: shifted.score != null ? shifted.score.toFixed(3) : null }), "§二十九 score↓");

    // 阶段二 Safe Mutation（§三十二/§三十三）：首个 MATCHED 对象 setText → diff → restore
    // 注意：objects 数组按采集顺序排列，selectedIndex 是对象 identity.index（画布位次），勿当数组下标
    const target = selfResults[0] && selfResults[0].status === "MATCHED" ? objects[0] : null;
    if (target) {
      const rawIndex = target.identity.index;
      const flow = await page.evaluate(({ index, longText }) => {
        const setText = (o, t) => { if (typeof o.setText === "function") o.setText(t); else o.text = t; o.text = t; o.dirty = true; if (typeof o.initDimensions === "function") o.initDimensions(); if (typeof o.setCoords === "function") o.setCoords(); };
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
        const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
        const objs = c.getObjects();
        const o = objs[index];
        if (!o) return { found: false };
        const snap = { text: String(o.text || ""), left: o.left, top: o.top, width: o.width, height: o.height, scaleX: o.scaleX, angle: o.angle, fontFamily: o.fontFamily, fontSize: o.fontSize };
        setText(o, longText);
        const after = { text: String(o.text || ""), left: o.left, top: o.top, width: o.width, height: o.height, scaleX: o.scaleX, angle: o.angle, fontFamily: o.fontFamily, fontSize: o.fontSize };
        setText(o, snap.text);
        const restored = { text: String(o.text || ""), left: o.left, top: o.top, width: o.width, height: o.height, scaleX: o.scaleX, angle: o.angle, fontFamily: o.fontFamily, fontSize: o.fontSize };
        return { found: true, snap: snap, after: after, restored: restored };
      }, { index: rawIndex, longText: TEST_LONG });
      step("phase2-mutation", flow && flow.found, "snap.textHash 不变（脱敏）", "REAL_EDITOR");
      if (flow && flow.found) {
        const dMut = diff.diff(flow.snap, flow.after);
        const allowed = ["text", "height"];
        const unexpected = dMut.changedFields.filter((k) => allowed.indexOf(k) < 0);
        step("phase2-mutation-only-text", unexpected.length === 0, "changed=" + JSON.stringify(dMut.changedFields) + " unexpected=" + JSON.stringify(unexpected), "§三十三 EXPECTED_MUTATION");
        const dRest = diff.diff(flow.snap, flow.restored);
        step("phase2-rollback-zero", dRest.changedFields.length === 0, "changed=" + JSON.stringify(dRest.changedFields), "§三十六 rollback zero residual");
      }
    } else {
      step("phase2-mutation", false, "no MATCHED target", "n/a");
    }
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 500));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.writeFileSync(path.join(__dirname, "reports", "stage5-matcher.json"), JSON.stringify(out, null, 1), "utf8");
  console.log("[stage5-matcher] errors=" + out.errors.length + " → reports/stage5-matcher.json");
  process.exit(out.errors.length ? 1 : 0);
})();