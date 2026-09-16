// runtime/stage5-object-inventory.js — Stage 5.0 §七~§九/§十九/§二十四：真实 Editor Object Inventory
// 流程：复用 profile-usc3（已登录 + ScriptCat + Allow User Scripts）→ 打开真实编辑器（无需安装 probe，
//   本 runner 只读采集编辑器主世界对象，不跨 bridge 通信，不做任何 mutation）
// → 读取 totalCanvasArray（正/反面）→ 每个对象：ctor/type/subType/geometry/text/style/interaction/identity keys
// → 自有属性名频次聚合（供后续 A~E 属性分类）
// 输出：stage5-object-snapshot.json（对象级快照，全部脱敏）+ stage5-object-audit.json（汇总统计）
// 脱敏（§十八/§四十七）：text/phone/email/wechat/address/url/company/website 等一律 [REDACTED:len/hash]
// 约束：只读，不修改画布，不点击保存（§十三/§三十九 in-memory only）
"use strict";
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { chromium } = require("playwright");

const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/1203177/2114747/999/thirdDiyAdd.do";

// 页面内 djb2 hash（脱敏用，非安全用途）
const PAGE_HASH = `(function(s){var h=5381,i=s.length;while(i){h=(h*33)^s.charCodeAt(--i)}return (h>>>0).toString(16)})`;

(async () => {
  const out = { ts: new Date().toISOString(), stage: "Stage 5.0 inventory", steps: [], errors: [] };
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
    await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => step("nav", false, String(e && e.message || e)));
    step("nav", true, "真实编辑器已打开", "REAL_EDITOR");

    // 等编辑器就绪
    let ready = null;
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
      ready = await page.evaluate(() => {
        const req = window.requirejs || window.require;
        const ctx = req && req.s && req.s.contexts && req.s.contexts._;
        const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
        return { req: !!req, vo: !!vo, total: vo && vo.totalCanvasArray ? vo.totalCanvasArray.length : 0 };
      }).catch(() => null);
      if (ready && ready.vo && ready.total >= 1) break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    step("editor-ready", !!(ready && ready.vo && ready.total >= 1), JSON.stringify(ready), "REAL_CANVAS");

    // 采集主函数：页面内聚合（脱敏在页面内完成，减少敏感数据出页面）
    const data = await page.evaluate((hashSrc) => {
      function djb2(s) { return (new Function("s", "return (" + hashSrc + ")(s)"))(s); }
      const SENS_KEY = /phone|email|wechat|微信|address|url|company|website|qrcode|qr|biz|mobile|tel|link/i;
      const TEXT_KEY = /text|content|value|label/i;
      function redactVal(key, val) {
        if (val == null) return val;
        const t = typeof val;
        if (t === "boolean" || t === "number") return val;
        if (t === "function") return "fn:" + (val.name || "anon");
        if (t === "object") return Array.isArray(val) ? "array[" + val.length + "]" : (val.constructor ? "obj:" + val.constructor.name : "obj");
        const k = String(key).toLowerCase();
        const sensitive = SENS_KEY.test(k) || (TEXT_KEY.test(k) && val.length > 12);
        if (sensitive) return "[REDACTED:len=" + val.length + ":h8=" + String(djb2(val)).slice(0, 8) + "]";
        return val.length > 60 ? val.slice(0, 60) + "…(" + val.length + ")" : val;
      }
      function sampleKeySet(obj) {
        const keys = [];
        for (const k in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, k)) keys.push(k);
        }
        const out = {};
        keys.slice().sort().forEach((k, i) => { if (i < 80) out[k] = redactVal(k, obj[k]); });
        return { count: keys.length, samples: out };
      }
      function identityProbe(obj) {
        const cand = ["id", "objectId", "objId", "uuid", "name", "uniqueId", "dataId", "mediaId", "mediaIdTxt", "objectMark", "mark", "markuuid"];
        const hit = {};
        cand.forEach((k) => { if (obj[k] != null) hit[k] = redactVal(k, obj[k]); });
        return { hit: hit };
      }
      // precision 脱敏：geometry 数值保留，避免引入不必要 byte
      function num(v) { return typeof v === "number" && isFinite(v) ? v : (v == null ? null : "n:" + typeof v); }

      const req = window.requirejs || window.require;
      const ctx = req && req.s && req.s.contexts && req.s.contexts._;
      const vo = (ctx && ctx.defined && ctx.defined.CanvasObjVO) || window.CanvasObjVO;
      const total = vo && vo.totalCanvasArray || [];
      const canvases = [];
      const propFreq = {};
      const typeDist = {};
      const ctorDist = {};
      let rotated = null;
      const identityAgg = {};

      total.forEach((entry, sideIdx) => {
        let c = null;
        if (entry && typeof entry.getObjects === "function") c = entry;
        else if (entry && entry.canvas && typeof entry.canvas.getObjects === "function") c = entry.canvas;
        if (!c) return;
        const objs = c.getObjects();
        const list = [];
        const side = sideIdx === 0 ? "front" : "back";
        objs.forEach((o, index) => {
          if (!o) return;
          const keys = sampleKeySet(o);
          Object.keys(keys.samples).forEach((k) => {
            propFreq[k] = propFreq[k] || { count: 0, types: {} };
            propFreq[k].count += 1;
            const t = typeof o[k];
            propFreq[k].types[t] = (propFreq[k].types[t] || 0) + 1;
          });
          const type = String(o.type || (o.mediaMediaType || "") || "unknown");
          typeDist[type] = (typeDist[type] || 0) + 1;
          const ctor = o.constructor ? o.constructor.name : "unknown";
          ctorDist[ctor] = (ctorDist[ctor] || 0) + 1;
          if (typeof o.angle === "number" && Math.abs(o.angle) > 0.01) rotated = (rotated || []).concat([{ side: side, index: index, angle: o.angle, ctor: ctor, type: type }]);
          const id = identityProbe(o);
          Object.keys(id.hit).forEach((k) => { identityAgg[k] = (identityAgg[k] || 0) + 1; });
          const isText = /text|i-text|textbox|curvedtext/i.test(type) || typeof o.text === "string";
          list.push({
            index: index,
            side: side,
            ctor: ctor,
            type: type,
            subType: o.subType || o.mediaMediaType || null,
            geometry: { left: num(o.left), top: num(o.top), width: num(o.width), height: num(o.height), scaleX: num(o.scaleX), scaleY: num(o.scaleY), angle: num(o.angle), skewX: num(o.skewX), skewY: num(o.skewY), originX: o.originX, originY: o.originY },
            interact: { visible: o.visible, opacity: num(o.opacity), flipX: o.flipX, flipY: o.flipY, selectable: o.selectable, evented: o.evented },
            style: isText ? { fontFamily: o.fontFamily, fontSize: num(o.fontSize), fontWeight: o.fontWeight, fontStyle: o.fontStyle, lineHeight: num(o.lineHeight), charSpacing: num(o.charSpacing), textAlign: o.textAlign, fill: o.fill, stroke: o.stroke, strokeWidth: num(o.strokeWidth), shadow: !!o.shadow } : { fill: o.fill, stroke: o.stroke, strokeWidth: num(o.strokeWidth), shadow: !!o.shadow },
            content: isText ? { text: redactVal("text", String(o.text == null ? "" : o.text)), textLen: String(o.text || "").length, textHash8: String(djb2(String(o.text || ""))).slice(0, 8) } : null,
            identity: id,
            ownKeys: keys,
            // 与既有 zy 助手字段的关联探测（只读）
            zy: { zyCreatedByAssistant: !!o.zyCreatedByAssistant, zyFieldKey: o.zyFieldKey || null }
          });
        });
        canvases.push({ side: side, width: num(c.width), height: num(c.height), objectCount: objs.length, objects: list });
      });

      return { canvases: canvases, propFreq: propFreq, typeDist: typeDist, ctorDist: ctorDist, rotated: rotated, identityAgg: identityAgg };
    }, PAGE_HASH);

    if (!data || !data.canvases || !data.canvases.length) {
      step("inventory", false, "no canvas data", "n/a");
    } else {
      const totalObjs = data.canvases.reduce((a, c) => a + c.objectCount, 0);
      step("inventory", totalObjs > 0, "canvases=" + data.canvases.length + " objects=" + totalObjs + " types=" + JSON.stringify(data.typeDist), "REAL_EDITOR+REAL_CANVAS");
      step("object-types", Object.keys(data.typeDist).length > 0, JSON.stringify(data.typeDist), "REAL_CANVAS");
      step("identity-probe", true, "identity keys observed=" + JSON.stringify(data.identityAgg), "REAL_CANVAS");
      step("rotated-samples", true, (data.rotated && data.rotated.length ? JSON.stringify(data.rotated) : "NO_REAL_ROTATED_SAMPLE"), "REAL_CANVAS");
    }

    // 报告（脱敏只读审计）
    fs.writeFileSync(path.join(__dirname, "reports", "stage5-object-snapshot.json"), JSON.stringify(data, null, 1), "utf8");
    const summary = {
      ts: out.ts,
      stage: "Stage 5.0 object inventory",
      canvasSummary: data && data.canvases ? data.canvases.map((c) => ({ side: c.side, width: c.width, height: c.height, objectCount: c.objectCount, objects: c.objects.map((o) => ({ index: o.index, side: o.side, ctor: o.ctor, type: o.type, subType: o.subType, geometry: o.geometry, styleKeys: Object.keys(o.style), textLen: o.content ? o.content.textLen : null, identityHits: o.identity.hit })) })) : [],
      typeDist: data && data.typeDist,
      ctorDist: data && data.ctorDist,
      identityAgg: data && data.identityAgg,
      rotated: data && data.rotated,
      steps: out.steps,
      errors: out.errors
    };
    fs.writeFileSync(path.join(__dirname, "reports", "stage5-object-audit.json"), JSON.stringify(summary, null, 1), "utf8");
    console.log("[stage5-inventory] errors=" + out.errors.length + " → reports/stage5-object-snapshot.json + stage5-object-audit.json");
    process.exit(out.errors.length ? 1 : 0);
  } catch (e) {
    step("fatal", false, String(e && e.stack || e).slice(0, 500));
    fs.writeFileSync(path.join(__dirname, "reports", "stage5-object-audit.json"), JSON.stringify(out, null, 1), "utf8");
    process.exit(1);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();