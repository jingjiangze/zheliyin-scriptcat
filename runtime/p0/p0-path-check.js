// ============================================================================
// runtime/p0/p0-path-check.js — P0 真实路径 / 会话 / 依赖 只读验证探针
// ----------------------------------------------------------------------------
// 目的（对应 P0 专项 §二/§三/§四）：
//   1. 确认真机 P0 到底跑哪条链：ScriptCat userscript vs MV3 extension
//   2. 确认 ScriptCat 内已安装的脚本（名称/版本/enabled）
//   3. 确认 profile-usc3 的登录态是否有效（#userAccount 是否可见）
//   4. 确认 @require 9 模块是否真的加载（typeof pageBridge 等）
//   5. 确认 userscript 是否注入成功（#zy-native-ocr-btn / bridge marker）
// 约束：
//   - 只读：不修改画布、不点击核稿/印刷/提交、不写任何站点数据
//   - 不打印/不落盘任何凭据、cookie value、token
// 用法：
//   node runtime/p0/p0-path-check.js
// 输出：
//   runtime/reports/p0/p0-path-check.json
// ============================================================================
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const adapter = require("../scriptcat-adapter");

const ROOT = path.join(__dirname, "..", "..");
const SC_DIR = path.join(ROOT, "runtime", "vendor", "scriptcat");
const PROFILE = process.env.P0_PROFILE || path.join(ROOT, "runtime", "browser", "profile-usc3");
const EDITOR_URL = "https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do";
const OUT = path.join(ROOT, "runtime", "reports", "p0", "p0-path-check.json");
const EXT_ID = adapter.EXT_ID;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {
  ts: new Date().toISOString(),
  profile: PROFILE,
  editorUrl: EDITOR_URL,
  scriptCatVendor: SC_DIR,
  scriptCatManifest: null,
  extensionLoaded: false,
  realPath: null,
  installedScripts: [],
  userscriptInstalled: null,
  authConfigured: !!(process.env.P0_LOGIN_USER && process.env.P0_LOGIN_PASS),
  page: {},
  requirements: {},
  console: [],
  errors: [],
};

(async () => {
  try {
    out.scriptCatVendor = fs.existsSync(path.join(SC_DIR, "manifest.json"));
    if (out.scriptCatVendor) {
      const mf = JSON.parse(fs.readFileSync(path.join(SC_DIR, "manifest.json"), "utf8"));
      out.scriptCatManifest = { version: mf.version, mv: mf.manifest_version };
    }

    const browser = await chromium.launchPersistentContext(PROFILE, {
      channel: "chromium",
      headless: false,
      ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
      args: [
        "--disable-features=DisableLoadExtensionCommandLineSwitch",
        "--enable-unsafe-extension-debugging",
        "--disable-extensions-except=" + SC_DIR,
        "--load-extension=" + SC_DIR,
      ],
      viewport: { width: 1440, height: 900 },
    });
    browser.on("dialog", (d) => { try { d.accept().catch(() => {}); } catch (e) {} });

    const extPage = browser.pages()[0];

    // ---- 1) 扩展是否真的加载 ----
    try {
      await extPage.goto("chrome-extension://" + EXT_ID + "/src/options.html#/script/list", { waitUntil: "domcontentloaded", timeout: 30000 });
      await sleep(3000);
      out.extensionLoaded = true;
    } catch (e) {
      out.errors.push("ext-options-goto: " + String(e && e.message || e).slice(0, 200));
    }

    // ---- 2) ScriptCat 内已安装脚本 ----
    if (out.extensionLoaded) {
      try {
        const all = await adapter.call(extPage, "getAllScripts", {});
        const list = Array.isArray(all) ? all : (all && all.list) || [];
        out.installedScripts = list.map((s) => ({
          uuid: s && s.uuid ? String(s.uuid).slice(0, 40) : null,
          name: s && (s.name || (s.metadata && s.metadata.name)) || null,
          version: s && (s.version || (s.metadata && s.metadata.version)) || null,
          enabled: s && s.enabled != null ? s.enabled : (s && s.status != null ? s.status : null),
          requiresCount: s && Array.isArray(s.requires) ? s.requires.length : null,
        }));
        out.userscriptInstalled = out.installedScripts.find(
          (s) => s.name && /折立印|名片套版助手/.test(String(s.name))
        ) || null;
      } catch (e) {
        out.errors.push("getAllScripts: " + String(e && e.message || e).slice(0, 240));
      }
    }

    // ---- 3) 打开真实编辑器（只读观察）----
    const edPage = await browser.newPage();
    edPage.on("console", (m) => {
      const t = String(m.text() || "");
      if (/zy-ocr|折立印|INIT|BUILDING|SUCCESS|ERROR|FALLBACK|CANVAS_READY|PREPARING|OCR|bridge|pageBridge/.test(t) && out.console.length < 60) {
        out.console.push(t.slice(0, 300));
      }
    });
    await edPage.goto(EDITOR_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
    await sleep(12000);

    // 编辑器就绪 + 登录态 + userscript 注入状态（纯读）
    const probe = await edPage.evaluate(() => {
      const req = window.requirejs || window.require;
      const defs = (req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined) || {};
      const vo = defs.CanvasObjVO || window.CanvasObjVO || null;
      const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
      const ua = document.querySelector("#userAccount");
      const loginCand = ["#userAccount", ".login-box", "[class*=login]", "[class*=Login]"];
      const hits = [];
      loginCand.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => {
          const rc = el.getBoundingClientRect();
          const st = window.getComputedStyle(el);
          if (rc.width > 0 && rc.height > 0) {
            hits.push({ sel: sel, cls: String(el.className || "").slice(0, 60), w: Math.round(rc.width), h: Math.round(rc.height), display: st.display, visibility: st.visibility });
          }
        });
      });
      return {
        href: location.href.slice(0, 200),
        title: String(document.title || "").slice(0, 80),
        editorReady: !!(d && d.canvas && typeof d.drawText === "function"),
        canvasCount: vo && vo.totalCanvasArray ? vo.totalCanvasArray.length : 0,
        currentCanvasNum: vo ? vo.currentCanvasNum : null,
        userAccountVisible: !!(ua && ua.offsetParent),
        loginLayerCandidates: hits.slice(0, 8),
        marker: !!(window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed),
        ocrToolBtn: !!document.getElementById("zy-native-ocr-tool-btn"),
        ocrDrawer: !!document.getElementById("zy-native-ocr-panel"),
        ocrBtn: !!document.getElementById("zy-native-ocr-btn"),
        templatePanel: !!document.getElementById("zy-card-assistant"),
        rightBar: !!document.querySelector(".rightPageBar.rightBar"),
        windowCanvasObjVOType: typeof window.CanvasObjVO,
        requirejsCanvasObjVO: !!defs.CanvasObjVO,
        requirejsCurrentCanvas: !!defs.CurrentCanvas,
        requirejsUndo: !!defs.Undo,
        globalFabric: typeof window.fabric,
        // CSP 能力探测（§十五：为「快照 eval 被 CSP 拒」提供直接证据）
        indirectEval: (function () { try { return (0, eval)("1+1") === 2 ? "OK" : "WRONG"; } catch (e) { return "BLOCKED: " + String(e && e.message || e).slice(0, 90); } })(),
        newFunction: (function () { try { return (new Function("return 1+1"))() === 2 ? "OK" : "WRONG"; } catch (e) { return "BLOCKED: " + String(e && e.message || e).slice(0, 90); } })(),
        canvasCtorFabric: !!(window.CanvasObjVO && window.CanvasObjVO.totalCanvasArray && window.CanvasObjVO.totalCanvasArray[0] && window.CanvasObjVO.totalCanvasArray[0].canvas && window.CanvasObjVO.totalCanvasArray[0].canvas.constructor && window.CanvasObjVO.totalCanvasArray[0].canvas.constructor.fabric),
        pageBridgeType: typeof window.pageBridge,
        gmAvailable: typeof GM_getValue,
        ocrObjectsOnCanvas: (function () {
          try {
            const objs = d && d.canvas ? d.canvas.getObjects() : [];
            return objs.filter((o) => o && o.zyOcrDiagnostics).length;
          } catch (e) { return -1; }
        })(),
      };
    });
    out.page = probe || { err: "evaluate failed" };

    // ---- 4) @require 依赖是否真的加载（隔离世界不可见，改用桥能力推断）----
    out.requirements = {
      bridgeMarker: !!(probe && probe.marker),
      ocrUiRendered: !!(probe && probe.ocrBtn),
      inferredNote: "隔离世界的 @require 变量无法从页面世界直读；以 bridge marker + OCR UI 渲染 + console INIT 行三者交叉判断",
    };

    // ---- 4b) 画布清单：OCR 目标图是否存在 + 站点原生 addImage 路径是否可用（纯读，不改画布）----
    out.canvasInventory = await edPage.evaluate(() => {
      const req = window.requirejs || window.require;
      const defs = (req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined) || {};
      const vo = defs.CanvasObjVO || window.CanvasObjVO || null;
      const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
      if (!d || !d.canvas) return { ok: false, err: "no canvas" };
      const c = d.canvas;
      const objs = c.getObjects() || [];
      const imgObjs = objs.filter((o) => String(o.type) === "image");
      const bg = c.backgroundImage || null;
      const describe = (o) => {
        let exportOk = null;
        try {
          const el = o._element || (o.getElement && o.getElement());
          if (!el) exportOk = "NO_ELEMENT";
          else {
            const cv = document.createElement("canvas");
            cv.width = el.naturalWidth || el.width || 1;
            cv.height = el.naturalHeight || el.height || 1;
            const g2 = cv.getContext("2d");
            g2.drawImage(el, 0, 0);
            exportOk = cv.toDataURL("image/png") ? "EXPORT_OK" : "EXPORT_EMPTY";
          }
        } catch (e) { exportOk = "CROSS_ORIGIN_OR_TAINTED"; }
        return {
          type: String(o.type), left: o.left, top: o.top,
          width: o.width, height: o.height, scaleX: o.scaleX, scaleY: o.scaleY, angle: o.angle,
          visible: o.visible !== false, exportState: exportOk,
        };
      };
      const protoNames = (function () {
        const set = new Set();
        let cur = d;
        while (cur && cur !== Object.prototype) {
          Object.getOwnPropertyNames(cur).forEach((n) => set.add(n));
          cur = Object.getPrototypeOf(cur);
        }
        return [...set].filter((n) => /img|image|photo|pic|upload|add/i.test(n)).sort();
      })();
      return {
        ok: true,
        totalObjects: objs.length,
        objectTypes: [...new Set(objs.map((o) => String(o.type)))],
        textObjects: objs.filter((o) => typeof o.text === "string").map((o) => ({ text: String(o.text).slice(0, 20), isDisplay: o.isDisplay, type: String(o.type) })),
        imageObjects: imgObjs.map(describe),
        backgroundImage: bg ? describe(bg) : null,
        backgroundImageType: bg ? String(bg.type) : null,
        frontImgPathStr: vo ? String(vo.frontImgPathStr || "").slice(0, 120) : null,
        addImageLikeMethods: protoNames.slice(0, 30),
        canvasWidth: c.width, canvasHeight: c.height,
      };
    }).catch((e) => ({ ok: false, err: String(e && e.message || e).slice(0, 200) }));

    // ---- 5) 真实路径判定 ----
    const hasSysCat = out.extensionLoaded;
    const hasUserscript = !!(out.userscriptInstalled);
    if (hasSysCat && hasUserscript) out.realPath = "ScriptCat (+userscript)";
    else if (hasSysCat) out.realPath = "ScriptCat (no userscript found)";
    else out.realPath = "UNKNOWN/Extension";

    await edPage.close().catch(() => {});
    await browser.close().catch(() => {});
  } catch (e) {
    out.errors.push("FATAL: " + String(e && e.message || e).slice(0, 400));
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log("path-check done -> " + OUT);
  console.log("realPath=" + out.realPath
    + " extLoaded=" + out.extensionLoaded
    + " scripts=" + out.installedScripts.length
    + " editorReady=" + (out.page && out.page.editorReady)
    + " authVisible=" + (out.page && out.page.userAccountVisible)
    + " ocrBtn=" + (out.page && out.page.ocrBtn)
    + " marker=" + (out.page && out.page.marker)
    + " errs=" + out.errors.length);
})();
