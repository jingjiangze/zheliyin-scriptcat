// ============================================================================
// p0-print-console-probe.v2.js — P0 真机控制台探针 v2（粘贴到编辑器 Console 运行）
// ----------------------------------------------------------------------------
// 相比 v1 增强：
//   + getImgInfos.do / 全部 img 类接口响应捕获
//   + form submit 捕获（印刷可能走表单提交/页面跳转）
//   + location / 新窗口 / iframe 变化捕获
//   + 印刷后弹窗 DOM 快照（自动核稿失败提醒的完整文案与结构）
//   + 不在探针里动订单号（真机按真实 UI 流程操作即可）
// 用法：
//   1. 打开 https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do （已登录）
//   2. F12 → Console → 粘贴本段 → Enter
//   3. 正常操作：OCR 创建文字（或手动加一行字）→ 保存 → 点击「印刷」→ 进入自动核稿
//   4. 出现「自动核稿失败提醒」后：window.__p0Dump()
//   5. 复制 JSON 发回开发
// 安全：纯监听，不改任何请求/对象/UI。
// ============================================================================
(function () {
  "use strict";
  if (window.__zyP0V2) { console.log("[P0v2] 探针已装，直接 window.__p0Dump()"); return; }
  window.__zyP0V2 = true;
  const D = { reqs: [], resp: [], msgs: [], clicks: [], navs: [], forms: [], serialize: [], objSnaps: [], domSnaps: [], err: [] };
  const KEY_URL = /print|hegao|check|material|font|save|proof|submit|work|order|validate|product|preview|getImgInfos|生成|jiao|proofread/i;
  const logReq = (m, u, body) => {
    if (u.indexOf("zheliyin.com") < 0) return;
    if (!KEY_URL.test(u)) return;
    if (D.reqs.length >= 800) return;
    try { D.reqs.push({ t: new Date().toISOString().slice(11, 19), m, u: u.slice(0, 300), bodyHead: body !== undefined && body !== null ? String(body).slice(0, 3000) : undefined }); } catch (e) {}
  };
  const logResp = (status, u, txt) => {
    if (u.indexOf("zheliyin.com") < 0 || !KEY_URL.test(u)) return;
    if (D.resp.length >= 120) return;
    try { D.resp.push({ t: new Date().toISOString().slice(11, 19), status, u: u.slice(0, 300), body: String(txt).slice(0, 6000) }); } catch (e) {}
  };

  // ---------- 1. fetch ----------
  const of = window.fetch;
  if (of && !of.__zyV2) {
    window.fetch = function () {
      const url = String(arguments[0] && arguments[0].url || arguments[0] || "");
      logReq("FETCH", url, arguments[1] && arguments[1].body);
      const p = of.apply(this, arguments);
      p.then((r) => { try { const uu = r && r.url || ""; if (uu && KEY_URL.test(uu)) r.clone().text().then((t) => logResp(r.status, uu, t)).catch(() => {}); } catch (e) {} }).catch(() => {});
      return p;
    };
    window.fetch.__zyV2 = true;
  }
  // ---------- 2. XHR ----------
  const oop = XMLHttpRequest.prototype.open, osp = XMLHttpRequest.prototype.send;
  if (!oop.__zyV2) {
    XMLHttpRequest.prototype.open = function (m, u) { this.__zyU = String(u || ""); return oop.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function (b) {
      try { const u = this.__zyU || ""; logReq("XHR", u, b); if (u && KEY_URL.test(u)) this.addEventListener("load", () => { try { logResp(this.status, u, this.responseText || ""); } catch (e) {} }); } catch (e) {}
      return osp.apply(this, arguments);
    };
    XMLHttpRequest.prototype.open.__zyV2 = true;
  }
  // ---------- 3. layer ----------
  const hook = (o, fn) => { try { if (!o || !o[fn] || o[fn].__zyV2) return; const og = o[fn]; o[fn] = function () { try { const a = arguments[0]; const txt = typeof a === "string" ? a : (a && (a.title || a.content)) ? String(a.title || "") + " | " + String(a.content).slice(0, 400) : ""; if (txt && D.msgs.length < 150) D.msgs.push({ t: new Date().toISOString().slice(11, 19), fn, txt: String(txt).slice(0, 420) }); } catch (e) {} return og.apply(this, arguments); }; o[fn].__zyV2 = true; } catch (e) {} };
  hook(window.layer, "msg"); hook(window.layer, "open"); hook(window.l, "msg"); hook(window.l, "open");
  // ---------- 4. JSON.parse 序列化 ----------
  const op = JSON.parse;
  if (!op.__zyV2) {
    JSON.parse = function (s, rev) {
      try { if (typeof s === "string" && s.indexOf('"printLocation"') >= 0 && s.indexOf('"mediaType":"text"') >= 0 && D.serialize.length < 10) D.serialize.push({ t: new Date().toISOString().slice(11, 19), len: s.length, head: s.slice(0, 6000) }); } catch (e) {}
      return op.call(JSON, s, rev);
    };
    JSON.parse.__zyV2 = true;
  }
  // ---------- 5. form submit + 导航 ----------
  document.addEventListener("submit", (e) => { try { D.forms.push({ t: new Date().toISOString().slice(11, 19), action: String(e.target && e.target.action || "").slice(0, 300), method: String(e.target && e.target.method || "") }); } catch (x) {} }, true);
  const snapDom = () => {
    try {
      const out = [];
      document.querySelectorAll(".layui-layer, .design_check_wrap, .erweima_check_wrap, .hegao-preview, [class*=hegao], [class*=check_wrap], .printPreview").forEach((el) => {
        if (out.length >= 20) return;
        const rc = el.getBoundingClientRect();
        if (rc.width === 0 && rc.height === 0) return;
        out.push({ cls: String(el.className).slice(0, 60), txt: String(el.innerText || el.textContent || "").trim().slice(0, 500) });
      });
      return out;
    } catch (e) { return []; }
  };
  let lastLoc = location.href;
  setInterval(() => { try { if (location.href !== lastLoc) { D.navs.push({ t: new Date().toISOString().slice(11, 19), from: lastLoc.slice(0, 200), to: location.href.slice(0, 300) }); lastLoc = location.href; } } catch (e) {} }, 800);
  setInterval(() => { const s = snapDom(); if (s.length) { D.domSnaps.push({ t: new Date().toISOString().slice(11, 19), snap: s }); if (D.domSnaps.length > 40) D.domSnaps.shift(); } }, 1500);
  // ---------- 6. 关键按钮点击 + 印刷前后对象快照 ----------
  const snapObj = () => {
    try {
      const req = window.requirejs || window.require;
      const vo = (req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO;
      const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
      if (!d || !d.canvas) return null;
      const os = d.canvas.getObjects();
      const mine = os.filter((o) => o && o.text && typeof o.text === "string" && o.text.length < 30)[0];
      return { t: new Date().toISOString().slice(11, 19), canvasCount: os.length, listCount: d.canvasObjInfo ? d.canvasObjInfo.canvasToProductObjArr.length : -1, mine: mine ? { text: String(mine.text).slice(0, 24), uuid: mine.uuid, mediafontId: mine.mediafontId, fontFamily: mine.fontFamily, fontSize: mine.fontSize, fontColor: mine.mediafontColor || mine.fill, fontWeight: mine.fontWeight, media: mine.media && mine.media.font ? { id: mine.media.font.id, fontFamily2: mine.media.font.fontFamily || null, pointSize: mine.media.font.pointSize, fontColor: mine.media.font.fontColor } : null } : null };
    } catch (e) { return { err: String(e).slice(0, 120) }; }
  };
  D.objSnaps.push(snapObj());
  document.addEventListener("click", (ev) => {
    try {
      const el = ev.target && ev.target.closest ? ev.target.closest("li,a,button,span,div") : null;
      if (!el) return;
      const txt = String(el.textContent || "").trim();
      const cls = String(el.className || "");
      if (/印刷|打印|核稿|印前|导出|提交|保存|生成/.test(txt) || /btn print|hegao|submitProduct|qiangzhitijiao|design_check/.test(cls)) {
        D.clicks.push({ t: new Date().toISOString().slice(11, 19), tag: el.tagName, cls: cls.slice(0, 80), txt: txt.slice(0, 30) });
        D.objSnaps.push(snapObj());
      }
    } catch (e) {}
  }, true);
  // ---------- 7. 错误捕获 ----------
  window.addEventListener("error", (e) => { try { D.err.push(String(e.message || "").slice(0, 300)); } catch (x) {} });
  window.__p0Dump = () => JSON.stringify(D, null, 2);
  console.log("[P0v2] 探针已装：正常执行 OCR 创建 → 保存 → 点击「印刷」→ 等核稿失败提醒 → 运行 window.__p0Dump() 并复制结果。");
})(window);