// ============================================================================
// p0-print-console-probe.js — P0 真机控制台探针（粘贴到编辑器 Console 运行）
// ----------------------------------------------------------------------------
// 用途：在【已登录、保存正常】的真机编辑器里，复现「点击印刷后字体消失 +
// 自动核稿失败提醒」，捕获：
//   1. 所有 保存/核稿/印刷/提交 类请求的 URL + 关键 payload 片段
//   2. 关键请求的响应 body 摘要（尤其 findJianheWord/printCheck/核稿类接口）
//   3. layer.msg / layer.open 弹窗文案（抓「自动核稿失败提醒」及原因列表）
//   4. JSON.parse 走查：保存时 textbox 序列化片段（font.* / media.*）
//   5. 印刷点击前后 画布对象是否被删除（objExists）
// 用法：
//   1. 打开 https://diy.zheliyin.com/diyWeb/third/252438/2114747/999/thirdDiyAdd.do
//   2. F12 → Console → 粘贴本段 → Enter
//   3. 正常执行：OCR 创建文字 → 保存（填表确定）→ 点击「印刷」
//   4. 等「自动核稿失败提醒」弹出后，在 Console 输入：window.__p0Dump()
//   5. 复制返回的 JSON 发回给开发
// 安全：纯监听，不修改任何请求/对象/页面行为。
// ============================================================================
(function () {
  "use strict";
  if (window.__zyP0ConsoleProbe) { console.log("[P0] 探针已安装，直接 window.__p0Dump()"); return; }
  window.__zyP0ConsoleProbe = true;
  const $ = window.jQuery;
  const D = { reqs: [], resp: [], msgs: [], serialize: [], parseFails: [], objSnaps: [], clicks: [], err: [] };
  const KEY_URL = /print|hegao|check|material|font|save|proof|submit|work|order|validate|product|preview|核稿|yinshua/i;
  const P0_TEXT = "__P0_FONT_TEST__"; // 探针文字标记；如用真实 OCR 文字请忽略

  // ---- 1. 请求/响应监听（含 fetch + XHR）----
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function () {
      const url = String(arguments[0] && arguments[0].url || arguments[0] || "");
      if (url.indexOf("zheliyin.com") >= 0 && KEY_URL.test(url) && D.reqs.length < 600) {
        try { D.reqs.push({ m: "FETCH", u: url.slice(0, 260), bodyHead: arguments[1] && arguments[1].body ? String(arguments[1].body).slice(0, 2500) : undefined }); } catch (e) {}
      }
      return origFetch.apply(this, arguments).then((r) => {
        try {
          if (r && r.url && KEY_URL.test(r.url) && D.resp.length < 80) {
            r.clone().text().then((t) => { D.resp.push({ status: r.status, u: r.url.slice(0, 260), body: String(t).slice(0, 4000) }); }).catch(() => {});
          }
        } catch (e) {}
        return r;
      });
    };
  }
  const openXHR = XMLHttpRequest.prototype.open;
  const sendXHR = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__zyU = String(u || ""); return openXHR.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (body) {
    try {
      const u = String(this.__zyU || "");
      this.__zyBody = body;
      if (u.indexOf("zheliyin.com") >= 0 && KEY_URL.test(u) && D.reqs.length < 600) {
        D.reqs.push({ m: "XHR", u: u.slice(0, 260), bodyHead: body ? String(body).slice(0, 2500) : undefined });
      }
      if (u.indexOf("zheliyin.com") >= 0 && KEY_URL.test(u)) {
        this.addEventListener("load", () => {
          try {
            if (D.resp.length < 80) {
              let txt = "";
              try { txt = this.responseText || ""; } catch (e) {}
              D.resp.push({ status: this.status, u: u.slice(0, 260), body: String(txt).slice(0, 4000) });
            }
          } catch (e) {}
        });
      }
    } catch (e) {}
    return sendXHR.apply(this, arguments);
  };

  // ---- 2. layer 弹窗钩子（msg / open）----
  const hook = (o, fn) => {
    try {
      if (!o || !o[fn] || o[fn].__zyP0) return;
      const orig = o[fn];
      o[fn] = function () {
        try {
          const a0 = arguments[0];
          const txt = typeof a0 === "string" ? a0 : (a0 && (a0.title || a0.content)) ? String(a0.title || "") + " | " + String(a0.content).slice(0, 300) : "";
          if (txt && D.msgs.length < 120) D.msgs.push({ fn, txt: String(txt).slice(0, 320) });
        } catch (e) {}
        return orig.apply(this, arguments);
      };
      o[fn].__zyP0 = true;
    } catch (e) {}
  };
  hook(window.layer, "msg"); hook(window.layer, "open");
  hook(window.l, "msg"); hook(window.l, "open");

  // ---- 3. JSON.parse 钩子（序列化捕获：任何 textbox 产品 JSON，最多 8 条）----
  const op = JSON.parse;
  if (!op.__zyP0) {
    JSON.parse = function (s, rev) {
      try {
        if (typeof s === "string" && s.indexOf('"printLocation"') >= 0 && s.indexOf('"mediaType":"text"') >= 0 && D.serialize.length < 8) {
          D.serialize.push({ len: s.length, head: s.slice(0, 5000) });
        }
      } catch (e) {}
      return op.call(JSON, s, rev);
    };
    JSON.parse.__zyP0 = true;
  }

  // ---- 4. 对象快照（印刷点击前后）----
  const snapObj = () => {
    try {
      const req = window.requirejs || window.require;
      const vo = (req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined && req.s.contexts._.defined.CanvasObjVO) || window.CanvasObjVO;
      const d = vo && vo.totalCanvasArray && vo.totalCanvasArray[0];
      if (!d || !d.canvas) return null;
      const os = d.canvas.getObjects();
      const mine = os.filter((o) => String(o.text || "").indexOf("P0_FONT_TEST") >= 0 || String(o.text || "").indexOf("P0_FONT") >= 0 || (o.text && o.text.length < 24))[0];
      return {
        t: new Date().toISOString(),
        canvasCount: os.length,
        listCount: d.canvasObjInfo ? d.canvasObjInfo.canvasToProductObjArr.length : -1,
        mine: mine ? { text: mine.text, uuid: mine.uuid, mediafontId: mine.mediafontId, fontFamily: mine.fontFamily, fontSize: mine.fontSize, fontWeight: mine.fontWeight, fill: mine.fill } : null
      };
    } catch (e) { return { err: String(e).slice(0, 120) }; }
  };
  D.objSnaps.push(snapObj());

  // ---- 5. 印刷/保存/核稿按钮监听（记录被点击的按钮）----
  document.addEventListener("click", (ev) => {
    try {
      const el = ev.target && ev.target.closest ? ev.target.closest("li,a,button,span,div") : null;
      if (!el) return;
      const txt = String(el.textContent || "").trim();
      const cls = String(el.className || "");
      if (/印刷|打印|核稿|印前|导出|提交|保存/.test(txt) || /btn print|hegao|submitProduct|qiangzhitijiao/.test(cls)) {
        D.clicks.push({ t: new Date().toISOString(), tag: el.tagName, cls: cls.slice(0, 60), txt: txt.slice(0, 24) });
        D.objSnaps.push(snapObj());
      }
    } catch (e) {}
  }, true);

  // ---- 6. console error 捕获 ----
  window.addEventListener("error", (e) => { try { D.err.push(String(e.message || "").slice(0, 260)); } catch (x) {} });

  window.__p0Dump = () => JSON.stringify(D, null, 2);
  console.log("[P0] 探针已安装：请执行 OCR 创建 → 保存 → 印刷 → 等待核稿失败提醒 → 运行 window.__p0Dump() 并复制结果。");
})(window);