// runtime/stage5-identity-audit.js — Stage 5.1 §九/§十/§二十八：Identity Boundary Audit
// 实验1：同一 textbox 跨 3 次完整页面加载（session A/B/C）采集 text signature/markuuid/uuid/geometry/layerNum
//        判定：markuuid 是否全程一致（stable candidate）、uuid 是否每次都变（session runtime）
// 实验2：4 个真实 textbox 的 markuuid 唯一性（duplicateCount）
// 实验3：非 textbox（image/path/rect/group/line）的 uuid/markuuid/id 存在性与策略
// 输出：reports/stage5-identity-matrix.json（§二十八 字段格式）
// 约束：只读采集（每次进入不产生 mutation）；文本脱敏（len/hash）。
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";
const SESSIONS = ["A", "B", "C"];

(async () => {
  const out = { ts: new Date().toISOString(), stage: "Stage 5.1 identity-audit", sessions: {}, steps: [], errors: [] };
  const step = (n, ok, d, ev) => { out.steps.push({ name: n, ok: ok ? "PASS" : "FAIL", detail: String(d || "").slice(0, 600), evidence: ev || "n/a" }); if (!ok) out.errors.push(n); };
  let browser = null;
  try {
    browser = await chromium.launchPersistentContext(path.join(__dirname, "browser", "profile-usc3"), {
      channel: "chromium", headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", "--enable-unsafe-extension-debugging"],
      viewport: { width: 1440, height: 900 }
    });
    const page = browser.pages()[0];

    for (const s of SESSIONS) {
      await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => step("nav-" + s, false, String(e && e.message || e)));
      const deadline = Date.now() + 120000;
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
      step("ready-" + s, ready >= 1, "session " + s + " editor ready (textboxes=" + ready + ")", "REAL_EDITOR");
      if (!ready) continue;

      const snap = await page.evaluate(() => {
        function djb2s(s) { let h = 5381, i = String(s == null ? "" : s).length; while (i) h = (h * 33) ^ s.charCodeAt(--i); return (h >>> 0).toString(16); }
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
        const c = vo.totalCanvasArray[0].canvas || vo.totalCanvasArray[0];
        const objs = c.getObjects();
        const texts = objs.filter((o) => o && typeof o.text === "string").map((o) => ({
          markuuid: o.markuuid != null ? String(o.markuuid) : null,
          uuid: o.uuid != null ? String(o.uuid) : null,
          textLen: String(o.text || "").length,
          textHash8: djb2s(o.text),
          geometry: { left: o.left, top: o.top, width: o.width, height: o.height, scaleX: o.scaleX, scaleY: o.scaleY, angle: o.angle },
          layerNum: o.layerNum,
          index: objs.indexOf(o)
        })).sort((a, b) => String(a.markuuid).localeCompare(String(b.markuuid)));
        const typeRows = {};
        objs.forEach((o) => {
          const t = o.type || "unknown";
          typeRows[t] = typeRows[t] || { count: 0, uuidPresent: 0, markuuidPresent: 0, idPresent: 0, others: {} };
          typeRows[t].count += 1;
          if (o.uuid != null) typeRows[t].uuidPresent += 1;
          if (o.markuuid != null) typeRows[t].markuuidPresent += 1;
          if (o.id != null) typeRows[t].idPresent += 1;
        });
        return { texts: texts, typeRows: typeRows, canvas: { width: c.width, height: c.height, count: objs.length } };
      });
      out.sessions[s] = snap;
    }

    // ---- 判定（§九）----
    const sA = out.sessions.A && out.sessions.A.texts || [];
    const sB = out.sessions.B && out.sessions.B.texts || [];
    const sC = out.sessions.C && out.sessions.C.texts || [];
    step("textbox-count-each-session", sA.length >= 1 && sB.length === sA.length && sC.length === sA.length, "textbox counts A/B/C=" + [sA.length, sB.length, sC.length].join("/"), "REAL_EDITOR");

    // 实验1：按 markuuid 锚定同一 textbox，比较跨 session 的 markuuid/uuid/text/geometry
    const anchors = (sA.length ? sA.map((t) => t.markuuid) : []).filter(Boolean);
    const agg = anchors.map((mk) => {
      const find = (arr) => arr.find((t) => t.markuuid === mk) || null;
      const a = find(sA), b = find(sB), c = find(sC);
      const rows = [a, b, c].filter(Boolean);
      return {
        markuuid: mk,
        foundSessions: rows.length,
        markuuidStable: rows.every((r) => r && r.markuuid === mk),
        textStable: rows.every((r) => r && r.textLen === a.textLen && r.textHash8 === a.textHash8),
        geometryStable: rows.every((r) => r && Math.abs(r.geometry.left - a.geometry.left) < 0.01 && Math.abs(r.geometry.top - a.geometry.top) < 0.01 && Math.abs(r.geometry.width - a.geometry.width) < 0.01),
        uuidSet: rows.map((r) => r.uuid).filter(Boolean),
        layerNums: rows.map((r) => r.layerNum).filter((v) => v != null)
      };
    });
    out.identity = { aggregatedTextboxes: agg };

    const allStable = agg.length > 0 && agg.every((g) => g.markuuidStable && g.textStable && g.geometryStable && g.foundSessions === SESSIONS.length);
    const uuidAlwaysChanges = agg.length > 0 && agg.every((g) => new Set(g.uuidSet).size === g.uuidSet.length && g.uuidSet.length >= 2);
    step("identity-experiment1-markuuid", allStable, "markuuid stable across A/B/C: " + agg.map((g) => g.markuuid.slice(0, 8)).join(","), "REAL_EDITOR");
    step("identity-experiment1-uuid", uuidAlwaysChanges, "uuid changes every session: " + agg.map((g) => g.uuidSet.map((u) => u.slice(0, 6)).join(">")).join(" | "), "REAL_EDITOR");

    // 实验2：markuuid 唯一性（单会话内 textbox 子集 + 全对象；跨会话同 markuuid 属同一对象，不判重复）
    const oneSessionTexts = sA;
    const mkCount = {};
    oneSessionTexts.forEach((t) => { if (t.markuuid) mkCount[t.markuuid] = (mkCount[t.markuuid] || 0) + 1; });
    const dupMk = Object.keys(mkCount).filter((k) => mkCount[k] > 1);
    out.identity.duplicateCount = { perUniqueMark: mkCount, duplicates: dupMk };
    step("identity-experiment2-mark-unique", dupMk.length === 0, "textbox markuuid duplicates=" + JSON.stringify(dupMk) + " (unique=" + Object.keys(mkCount).length + ")", "REAL_EDITOR");

    // 实验3：非 textbox 类型身份策略
    const tyA = out.sessions.A && out.sessions.A.typeRows || {};
    out.identity.typeStrategy = Object.keys(tyA).map((t) => ({ objectType: t, count: tyA[t].count, uuidPresent: tyA[t].uuidPresent, markuuidPresent: tyA[t].markuuidPresent, idPresent: tyA[t].idPresent }));
    step("identity-experiment3-types", Object.keys(tyA).length > 0, JSON.stringify(out.identity.typeStrategy), "REAL_EDITOR");
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 500));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  fs.writeFileSync(path.join(__dirname, "reports", "stage5-identity-matrix.json"), JSON.stringify(out, null, 1), "utf8");
  console.log("[stage5-identity-audit] errors=" + out.errors.length + " → reports/stage5-identity-matrix.json");
  process.exit(out.errors.length ? 1 : 0);
})();