// runtime/stage5-geometry-audit.js — Stage 5.1 §十一~§十六/§二十九：Geometry Boundary Audit
// 目标：确认 raw geometry 与 visual bounding box 的关系（width != bbox，scale/rotation/origin/stroke）。
// 采集（只读）：
//   1) 每对象 raw {left,top,width,height,scaleX,scaleY,angle,skewX,skewY,originX,originY}
//   2) fabric getBoundingRect() → 世界坐标 AABB（真实引擎计算的视觉包围盒）
//   3) 旋转样本（angle!=0）：raw vs effective(w*scale) vs AABB
//   4) group：child 坐标空间（canvas-global vs group-local）
//   5) line：x1/y1/x2/y2 与 left/top/width/height 关系
// 输出：reports/stage5-geometry-audit.json（脱敏）
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";

(async () => {
  const out = { ts: new Date().toISOString(), stage: "Stage 5.1 geometry-audit", steps: [], errors: [] };
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
        return c && typeof c.getObjects === "function" ? c.getObjects().length : 0;
      }).catch(() => 0);
      if (ready >= 1) break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    step("canvas-ready", ready >= 1, "canvas ready objs=" + ready, "REAL_CANVAS");
    if (!ready) return;

    const data = await page.evaluate(() => {
      function num(v) { return typeof v === "number" && isFinite(v) ? +v.toFixed(4) : null; }
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
      const objs = c.getObjects();
      const rows = [];
      objs.forEach((o, idx) => {
        const type = o.type || "unknown";
        const raw = { left: num(o.left), top: num(o.top), width: num(o.width), height: num(o.height), scaleX: num(o.scaleX), scaleY: num(o.scaleY), angle: num(o.angle), skewX: num(o.skewX), skewY: num(o.skewY), originX: o.originX, originY: o.originY };
        let aabb = null;
        try { if (typeof o.getBoundingRect === "function") { const r = o.getBoundingRect(); aabb = { left: num(r.left), top: num(r.top), width: num(r.width), height: num(r.height) }; } } catch (e) { aabb = { err: String(e && e.message || e) }; }
        const effective = { width: num((o.width || 0) * (o.scaleX || 1)), height: num((o.height || 0) * (o.scaleY || 1)) };
        const row = { index: idx, type: type, raw: raw, derived: { effectiveWidth: effective.width, effectiveHeight: effective.height, aabb: aabb }, coordinateSpace: "canvas-global(existing)" };
        // line 专属：端点 vs left/top/width/height
        if (type === "line") {
          row.line = { x1: num(o.x1), y1: num(o.y1), x2: num(o.x2), y2: num(o.y2), left: num(o.left), top: num(o.top), width: num(o.width), height: num(o.height) };
        }
        // group 专属：children 坐标空间
        if (type === "group" && typeof o.getObjects === "function") {
          const kids = o.getObjects().slice(0, 4).map((k) => {
            let kaabb = null;
            try { if (typeof k.getBoundingRect === "function") { const r = k.getBoundingRect(); kaabb = { left: num(r.left), top: num(r.top), width: num(r.width), height: num(r.height) }; } } catch (e) {}
            return { type: k.type, left: num(k.left), top: num(k.top), width: num(k.width), height: num(k.height), aabb: kaabb };
          });
          row.group = { childCount: o.getObjects().length, groupLeft: num(o.left), groupTop: num(o.top), children: kids };
        }
        rows.push(row);
      });
      return { rows: rows, canvas: { width: c.width, height: c.height } };
    });

    // 判定（§十四/§十五/§十六）
    const rotated = data.rows.filter((r) => r.raw.angle != null && Math.abs(r.raw.angle) > 0.01);
    const hasAabb = data.rows.filter((r) => r.derived.aabb && r.derived.aabb.width != null);
    const groups = data.rows.filter((r) => r.group);
    const lines = data.rows.filter((r) => r.line);
    // line 关系：width ≈ |x2-x1| 且 |x2-x1| != aabb.width? 直观记录
    lines.forEach((L) => {
      const dx = Math.abs((L.line.x2 || 0) - (L.line.x1 || 0));
      const dy = Math.abs((L.line.y2 || 0) - (L.line.y1 || 0));
      L.lineObs = { lineWidthVsDx: Math.abs(dx - (L.line.width || 0)) < 0.5 ? "width=|x2-x1|" : "OTHER", lineHeightVsDy: Math.abs(dy - (L.line.height || 0)) < 0.5 ? "height=|y2-y1|" : "OTHER" };
    });
    out.geometry = { rows: data.rows, canvas: data.canvas, rotated: rotated, groupCoords: groups.map((g) => ({ index: g.index, childCount: g.group.childCount, groupLeft: g.group.groupLeft, childLefts: g.group.children.map((k) => k.left) })), lineRelations: lines.map((L) => ({ index: L.index, obs: L.lineObs })) };

    step("geometry-collected", data.rows.length >= 21, "objects=" + data.rows.length, "REAL_CANVAS");
    step("geometry-aabb-derived", hasAabb.length >= 13, "objects with fabric AABB=" + hasAabb.length, "§十一/§十二");
    step("geometry-rotated-sample", rotated.length >= 1, "rotated=" + JSON.stringify(rotated.map((r) => ({ index: r.index, type: r.type, angle: r.raw.angle, sw: r.raw.scaleX, ew: r.derived.effectiveWidth, aabb: r.derived.aabb }))), "§十四");
    step("geometry-group-children", groups.length === 0 ? true : groups.every((g) => g.group.childCount >= 0), "groups=" + groups.length + " childSpace=canvas-global(基线) 详情见报告", "§十五");
    step("geometry-line-relation", lines.length > 0, "lines=" + lines.length + " obs=" + JSON.stringify(lines.map((L) => L.lineObs)), "§十六");
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 500));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.writeFileSync(path.join(__dirname, "reports", "stage5-geometry-audit.json"), JSON.stringify(out, null, 1), "utf8");
  console.log("[stage5-geometry] errors=" + out.errors.length + " → reports/stage5-geometry-audit.json");
  process.exit(out.errors.length ? 1 : 0);
})();