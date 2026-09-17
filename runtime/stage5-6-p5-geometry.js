// runtime/stage5-6-p5-geometry.js — Stage 5.6 P5-2 Geometry 真机矩阵（审计证据）
// 独立验证：'OCR bbox → Textbox' 的几何变换（scale/position/rotation/multi-size/source）。
// 方法：harness 在页面自绘已知文字（measureText 得精确宽度）→ 注入 fabric 图（active/background）
//       → 点原生 OCR → 读回 textbox（getCenterPoint）→ 与独立仿射变换公式 C(P) 比较逐行误差。
// 变换公式（与 Mapper 同构但独立于生产实现）：
//   cx = left + w*sx/2 ; cy = top + h*sy/2
//   C(P) = (cx + dx*cosθ - dy*sinθ, cy + dx*sinθ + dy*cosθ),  dx=(Px - w/2)*sx, dy=(Py - h/2)*sy
// 判定：行中心误差 <= tol = max(12, 30*sx) 且（θ≠0 时 textbox.angle≈θ）→ PASS
// 预期：A/B/C/E/F 全 PASS；D（旋转，θ=15/45/90）FAIL —— 供 P5-3 最小修复证据。
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const adapter = require("./scriptcat-adapter");

const EXT_ID = adapter.EXT_ID;
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const UUID = "rt-p5g-" + Date.now().toString(36);
const USERSCRIPT_PATH = path.join(__dirname, "..", "zheliyin-card-assistant.user.js");
const DEBUG_CELL = process.env.ZY_P5G_DEBUG || ""; // "A-base" 等单格调试

// 单元格定义
const CELLS = [
  { id: "A-base", size: [900, 1200], scale: 1, pos: "center", angle: 0, kind: "active" },
  { id: "B-s05", size: [900, 1200], scale: 0.5, pos: "center", angle: 0, kind: "active" },
  { id: "B-s2", size: [900, 1200], scale: 2, pos: "center", angle: 0, kind: "active" },
  { id: "C-lt", size: [900, 1200], scale: 1, pos: "left-top", angle: 0, kind: "active" },
  { id: "C-rb", size: [900, 1200], scale: 1, pos: "right-bottom", angle: 0, kind: "active" },
  { id: "D-r15", size: [900, 1200], scale: 1, pos: "center", angle: 15, kind: "active" },
  { id: "D-r45", size: [900, 1200], scale: 1, pos: "center", angle: 45, kind: "active" },
  { id: "D-r90", size: [900, 1200], scale: 1, pos: "center", angle: 90, kind: "active" },
  { id: "E-s500", size: [500, 500], scale: 1, pos: "center", angle: 0, kind: "active" },
  { id: "E-l2000", size: [2000, 3000], scale: 1, pos: "center", angle: 0, kind: "active" },
  { id: "F-bg", size: [900, 1200], scale: 0.7, pos: "left-top", angle: 0, kind: "background" }
];

const posToLeftTop = (cell, canvas) => {
  const [w, h] = cell.size;
  const sx = cell.scale, sy = cell.scale;
  if (cell.pos === "left-top") return { left: 40, top: 40 };
  if (cell.pos === "right-bottom") return { left: canvas.width - w * sx - 60, top: canvas.height - h * sy - 60 };
  return { left: (canvas.width - w * sx) / 2, top: (canvas.height - h * sy) / 2 };
};

(async () => {
  const scDir = path.join(__dirname, "vendor", "scriptcat");
  const report = { ts: new Date().toISOString(), stage: "STAGE-5.6-P5-GEOMETRY", matrix: [], infra: [] };
  const cn = [];
  let browser = null;
  const inf = (n, ok, d) => { report.infra.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 400) }); };
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
      for (const s of all.filter((x) => /折立印|zheliyin/.test(String(JSON.stringify(x) || "")))) { try { await adapter.removeScript(optsPage, s.uuid); } catch (e) {} }
    } catch (e) {}
    // @require 资源按 URL 缓存（compiled_resource/resource）：安装前清空，强制重拉最新 page-bridge.js 等模块
    await optsPage.evaluate(async () => {
      const all = await chrome.storage.local.get(null);
      const targets = Object.keys(all).filter((k) => /^compiled_resource:|^resource:/.test(k));
      for (const k of targets) { try { await chrome.storage.local.remove(k); } catch (e) {} }
      return targets.length;
    }).catch(() => 0);
    const inst = await adapter.installByCode(optsPage, { uuid: UUID, code: fs.readFileSync(USERSCRIPT_PATH, "utf8"), upsertBy: "user" }).catch((e) => ({ __err: String(e && e.message || e) }));
    inf("install-userscript", !inst.__err, inst.__err || "status=" + inst.status);
    if (inst.__err) throw new Error("install failed: " + inst.__err);

    const page = await browser.newPage();
    page.on("console", (msg) => { const t = String(msg.text()); if (t.indexOf("[zy-ocr]") >= 0) cn.push(t); });
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});

    // 等编辑器 + 原生抽屉
    const d0 = Date.now() + 150000;
    let ready = false;
    while (Date.now() < d0) {
      ready = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        return !!(ctx && ctx.defined && ctx.defined.CanvasObjVO) && !!document.getElementById("zy-native-ocr-panel");
      }).catch(() => false);
      if (ready) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    inf("editor-ready", ready, "ready=" + ready);
    if (!ready) throw new Error("editor not ready");

    // 页桥新鲜度探针：直连 ocrCreate 带 angle item，验证当前桥实现了 0.3.8.0 旋转语义
    const bridgeProbe = await page.evaluate(() => new Promise((resolve) => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const total = vo && vo.totalCanvasArray;
      const c = (Array.isArray(total) && total[0] && ((total[0].canvas) || total[0])) || null;
      if (!c) return resolve({ ok: false, err: "no canvas" });
      const on = (e) => {
        if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === "ocrCreateResult") {
          window.removeEventListener("message", on);
          const arr = e.data.created || [];
          const obj = arr.length ? c.getObjects()[arr[0].index] : null;
          resolve({ ok: e.data.ok, created: arr.length, angle: obj ? obj.angle : null, origin: obj ? (obj.originX + "/" + obj.originY) : null });
        }
      };
      window.addEventListener("message", on);
      window.postMessage({ source: "zy-card-assistant", type: "ocrCreate", items: [{ text: "probe", left: 300, top: 300, width: 100, fontSize: 20, angle: 45, origin: "center" }] }, location.origin);
      setTimeout(() => { window.removeEventListener("message", on); resolve({ ok: false, err: "timeout" }); }, 3000);
    }));
    await page.evaluate(() => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const total = vo && vo.totalCanvasArray;
      const c = (Array.isArray(total) && total[0] && ((total[0].canvas) || total[0])) || null;
      if (!c) return;
      c.getObjects().slice().forEach((o) => { if (String(o.text || "") === "probe") c.remove(o); });
      if (c.requestRenderAll) c.requestRenderAll();
    }).catch(() => {});
    inf("bridge-rotation-probe", !!(bridgeProbe && bridgeProbe.ok && bridgeProbe.angle === 45 && bridgeProbe.origin === "center/center"), JSON.stringify(bridgeProbe));

    // 画布尺寸（同一 evaluate 内解析，fabric 对象不可序列化）
    const canvasSize = () => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const total = vo && vo.totalCanvasArray;
      const c = (Array.isArray(total) && total[0] && ((total[0].canvas) || total[0])) || null;
      return c ? { width: c.width, height: c.height } : { width: 900, height: 1200 };
    });

    // 页面内：清场 + 自绘目标图（返回 drawing 中心坐标）→ 注入 fabric（active/background）
    const setupCell = async (cell) => {
      const lt = posToLeftTop(cell, await canvasSize());
      const res = await page.evaluate(({ cell, lt }) => new Promise((resolve) => {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
        const total = vo && vo.totalCanvasArray;
        const c = (Array.isArray(total) && total[0] && ((total[0].canvas) || total[0])) || null;
        if (!c) return resolve({ ok: false, err: "no canvas" });
        const [w, h] = cell.size;
        const fs = 48;
        const draw = (g) => {
          g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
          g.font = "bold " + fs + "px 'Microsoft YaHei', sans-serif";
          g.fillStyle = "#111111";
          const defs = [
            { text: "测试公司", y: 150 },
            { text: "折立印设计", y: 330 },
            { text: "13800138000", y: 560 }
          ].map((d) => ({ text: d.text, y: d.y, x: 100, w: g.measureText(d.text).width }));
          defs.forEach((d) => { g.fillText(d.text, d.x, d.y); });
          return defs.map((d) => ({ text: d.text, cx: d.x + d.w / 2, cy: d.y - fs * 0.5, w: d.w, h: fs }));
        };
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        const lines = draw(cv.getContext("2d"));
        const url = cv.toDataURL("image/png");
        const img = document.createElement("img");
        img.onload = () => {
          try {
            const F = window.fabric || c.fabric || (c.constructor && c.constructor.fabric);
            // 清场：删除上次注入的目标图 + OCR 产物 + 恢复背景
            c.getObjects().slice().forEach((o) => {
              const k = String(o.zyFieldKey || "");
              if (k.indexOf("ocr_demo_") === 0 || k === "p5-geo-target") c.remove(o);
            });
            try { if (c.backgroundImage) c.setBackgroundImage(null, c.requestRenderAll.bind(c)); } catch (e) {}
            const opts = { width: w, height: h, left: lt.left, top: lt.top, scaleX: cell.scale, scaleY: cell.scale, originX: "left", originY: "top", zyFieldKey: "p5-geo-target" };
            if (cell.angle) opts.angle = cell.angle;
            if (cell.kind === "background") {
              const fi = new F.Image(img, opts);
              c.setBackgroundImage(fi, c.requestRenderAll.bind(c), { left: lt.left, top: lt.top, scaleX: cell.scale, scaleY: cell.scale, angle: cell.angle || 0 });
              c.discardActiveObject();
            } else {
              const fi = new F.Image(img, opts);
              c.add(fi);
              c.setActiveObject(fi);
            }
            if (c.requestRenderAll) c.requestRenderAll();
            const bg = c.backgroundImage;
            resolve({ ok: true, lines: lines, w: w, h: h, lt: lt, bgType: bg ? bg.type : null });
          } catch (e) { resolve({ ok: false, err: String(e && e.message || e) }); }
        };
        img.onerror = () => resolve({ ok: false, err: "img load fail" });
        img.src = url;
      }), { cell: cell, lt: lt });
      return res;
    };

    const readback = (page) => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const total = vo && vo.totalCanvasArray;
      const c = (Array.isArray(total) && total[0] && ((total[0].canvas) || total[0])) || null;
      if (!c) return [];
      return c.getObjects().filter((o) => o && String(o.zyFieldKey || "").indexOf("ocr_demo_") === 0).map((o) => {
        const cp = typeof o.getCenterPoint === "function" ? o.getCenterPoint() : null;
        return { text: String(o.text || ""), left: o.left, top: o.top, width: o.width, height: o.height, fontSize: o.fontSize, angle: o.angle || 0, cx: cp ? cp.x : o.left + o.width / 2, cy: cp ? cp.y : o.top + o.height / 2 };
      });
    });
    const clearCell = (page) => page.evaluate(() => {
      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const total = vo && vo.totalCanvasArray;
      const c = (Array.isArray(total) && total[0] && ((total[0].canvas) || total[0])) || null;
      if (!c) return 0;
      let n = 0;
      c.getObjects().slice().forEach((o) => { const k = String(o.zyFieldKey || ""); if (k.indexOf("ocr_demo_") === 0 || k === "p5-geo-target") { c.remove(o); n += 1; } });
      try { if (c.backgroundImage) c.setBackgroundImage(null, c.requestRenderAll.bind(c)); } catch (e) {}
      if (c.discardActiveObject) c.discardActiveObject();
      if (c.requestRenderAll) c.requestRenderAll();
      return n;
    });

    const clearStatus = (page) => page.evaluate(() => { const n = document.getElementById("zy-native-status"); if (n) n.textContent = ""; });
    const clickOcr = (page) => page.evaluate(() => { const b = document.getElementById("zy-native-ocr-btn"); if (!b) return false; b.click(); return true; });
    const waitTerminal = async (page, maxMs) => {
      const TERM = /已生成 \d+ 个文字|生成失败|识别异常|未识别到文字|引擎加载失败|引擎网络错误|OCR 失败|超时|未找到|跨域|导出失败|无效/;
      const t0 = Date.now();
      let last = "";
      while (Date.now() - t0 < maxMs) {
        await new Promise((r) => setTimeout(r, 700));
        last = await page.evaluate(() => { const n = document.getElementById("zy-native-status"); return n ? n.textContent : ""; }).catch(() => "");
        if (last && TERM.test(last)) return last;
      }
      return last;
    };

    // 期望变换（node 侧独立公式，与生产 Mapper 同构）：返回角点与中心两个映射
    const expectTransform = (cell, lt, w, h, line) => {
      const sx = cell.scale, sy = cell.scale;
      const cx = lt.left + (w * sx) / 2, cy = lt.top + (h * sy) / 2;
      const rad = (cell.angle * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
      const map = (px, py) => {
        const dx = (px - w / 2) * sx, dy = (py - h / 2) * sy;
        return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
      };
      const extW = line.w * sx, extH = line.h * sy;
      let corner = map(line.cx - line.w / 2, line.cy - line.h / 2);
      // 旋转展开：角点在旋转后的位置是「旋转前后不变的参照点」——对 θ≠0，角点需绕图像中心旋转
      // （公式同中心），即 corner 已含旋转；θ=0 时即普通 AABB 角点。
      return { corner: corner, center: map(line.cx, line.cy), extW: extW, extH: extH };
    };

    // 执行矩阵（DEBUG_CELL 时只跑单格，便于诊断）
    const runCells = DEBUG_CELL ? CELLS.filter((c) => c.id === DEBUG_CELL) : CELLS;
    for (const cell of runCells) {
      let entry = { id: cell.id, kind: cell.kind, size: cell.size, scale: cell.scale, pos: cell.pos, angle: cell.angle, result: "PENDING", rows: [] };
      try {
        await clearCell(page);
        const setup = await setupCell(cell);
        if (!setup.ok) { entry.result = "FAIL"; entry.note = "setup: " + setup.err; report.matrix.push(entry); continue; }
        entry.lt = setup.lt;
        await clearStatus(page);
        const clicked = await clickOcr(page);
        const term = await waitTerminal(page, 90000);
        const m = /已生成 (\d+) 个文字/.exec(term);
        if (!(clicked && m && Number(m[1]) > 0)) { entry.result = "FAIL"; entry.note = "no create: " + term.slice(0, 120); report.matrix.push(entry); continue; }
        const boxes = await readback(page);
        const tol = Math.max(12, 30 * cell.scale);
        const expected = setup.lines.map((l) => expectTransform(cell, setup.lt, setup.w, setup.h, l));
        // 匹配：按索引（读取顺序=绘制顺序）；数量不符时标记。
        // 判定契约：θ=0 → 角点匹配（左/上 ≈ 映射角点 - 4px，textbox left/top 即角点；
        //   OCR 空格导致 textbox 自动换行、高度翻倍时中心失真，属 P5-I 文字质量域，仅警告）；
        //   θ≠0 → textbox.angle≈θ 且中心 ≈ 映射中心（闭合旋转语义，fabric 绕中心旋转）。
        const n = Math.min(boxes.length, expected.length);
        let maxPosErr = 0, angleOk = true, allOk = true, wrapWarn = 0;
        for (let i = 0; i < n; i++) {
          const b = boxes[i], e = expected[i];
          const isRotated = cell.angle !== 0;
          let err = 0, posErr = 0;
          if (isRotated) {
            // 生产当前：角度未生效、left/top=旋转角点（轴对齐盒）→ 中心/角度必然失准
            err = Math.hypot(b.cx - e.center.x, b.cy - e.center.y);
            posErr = err;
          } else {
            // 角点匹配（含 Mapper 的 -4px 视觉留白）
            const dx = b.left - (e.corner.x - 4), dy = b.top - (e.corner.y - 4);
            posErr = Math.max(Math.abs(dx), Math.abs(dy));
            err = posErr;
          }
          maxPosErr = Math.max(maxPosErr, posErr);
          const angleBad = isRotated && Math.abs(((b.angle - cell.angle + 540) % 360) - 180) > 1;
          if (angleBad) angleOk = false;
          const wrapped = b.height > 1.8 * b.fontSize; // OCR 空格换行 → 高度≈2 行
          if (wrapped) wrapWarn += 1;
          const ok = !((posErr > tol) || angleBad);
          if (!ok) allOk = false;
          entry.rows.push({ line: b.text.slice(0, 12), mode: isRotated ? "rot-center" : "corner", posErrPx: +posErr.toFixed(1), centerErrPx: +Math.hypot(b.cx - e.center.x, b.cy - e.center.y).toFixed(1), tbAngle: b.angle, expAngle: cell.angle, wrapTwoLines: wrapped, obj: { left: +b.left.toFixed(1), top: +b.top.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), fs: b.fontSize }, ok: ok });
        }
        if (boxes.length !== expected.length) entry.note = "countMismatch boxes=" + boxes.length + " expected=" + expected.length;
        entry.maxPosErrPx = +maxPosErr.toFixed(1);
        entry.angleOk = angleOk;
        entry.wrapWarn = wrapWarn;
        entry.result = (allOk && n === expected.length) ? "PASS" : "FAIL";
        if (entry.note) entry.result = entry.result === "PASS" ? "PASS(partial)" : entry.result;
      } catch (e) {
        entry.result = "FAIL"; entry.note = String(e && e.message || e).slice(0, 200);
      }
      report.matrix.push(entry);
      clearCell(page).catch(() => {});
    }

    await clearCell(page);
    try { await adapter.removeScript(optsPage, UUID); inf("cleanup-userscript", true, "removed " + UUID); } catch (e) { inf("cleanup-userscript", false, String(e.message || e)); }
  } catch (e) {
    inf("fatal", false, String(e && e.stack || e).slice(0, 500));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  report.console = cn.slice(0, 60);
  const reportPath = path.join(__dirname, "reports", "stage5-6-p5-geometry-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 1), "utf8");
  fs.mkdirSync(path.join(__dirname, "..", "docs", "evidence", "stage-5.6"), { recursive: true });
  fs.copyFileSync(reportPath, path.join(__dirname, "..", "docs", "evidence", "stage-5.6", "stage5-6-p5-geometry-report.json"));
  const cells = report.matrix.map((m) => m.id + "=" + m.result).join(" ");
  console.log("[zy-p5g] " + cells);
  console.log("[zy-p5g] infraErrors=" + report.infra.filter((s) => s.ok !== "PASS").length);
  process.exit(0); // 矩阵本身供证据；即使旋转格 FAIL 也正常产出（由后续 P5-3 修复后复跑判定收敛）
})();