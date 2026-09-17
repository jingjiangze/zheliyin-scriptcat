// 折立印 Editor / Bridge 边界测试（Stage 3）
// 依赖：extension/src/editor/page-bridge.js（编辑器唯一事实来源，独立于主脚本）
// 覆盖：消息协议形状、Probe/Read/Find/Match/Create/Update/Cleanup 能力、
//       模板对象保护、助手层清理、宁可新建不误填、样式克隆与钳制。
"use strict";
(function () {
  var results = [];
  var failures = 0;
  function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function case_(name, cond) { results.push(name + (cond ? " PASS" : " FAIL")); if (!cond) failures += 1; }

  // ---------- Mock 环境 ----------
  var handlers = {};
  var posts = [];
  window.addEventListener = function (type, fn) { handlers[type] = fn; };
  window.postMessage = function (evt) { posts.push(evt); };
  // 注：window.location 浏览器只读，不覆盖；pageBridge 读取原生 location（file:// 亦可用）

  function MockText(text, opts) {
    var self = this;
    Object.keys(opts || {}).forEach(function (k) { self[k] = opts[k]; });
    this.text = text || "";
    this.type = "text";
    this.dirty = false;
  }
  MockText.prototype.set = function (o) { var self = this; Object.keys(o).forEach(function (k) { self[k] = o[k]; }); };
  MockText.prototype.setText = function (t) { this.text = t; };
  MockText.prototype.initDimensions = function () {};
  MockText.prototype.setCoords = function () {};
  MockText.prototype.valueOf = function () { return this; };
  Object.defineProperty(MockText, "name", { value: "Textbox" });
  window.fabric = { Textbox: MockText, IText: MockText, Text: MockText };

  function makeText(over) {
    var o = Object.assign({
      text: "", top: 10, left: 10, width: 200, height: 20,
      fontSize: 16, fill: "#333", fontFamily: "Arial", fontWeight: "normal",
      fontStyle: "normal", lineHeight: 1.2, textAlign: "left", charSpacing: 0, type: "text"
    }, over || {});
    o.constructor = MockText;
    return o;
  }

  function MockCanvas(objects) {
    this._objs = objects || [];
    this.width = 400;
    this.height = 240;
    this._renders = 0;
  }
  MockCanvas.prototype.getObjects = function () { return this._objs; }; // 与 fabric 一致：活数组
  MockCanvas.prototype.add = function (o) { this._objs.push(o); };
  MockCanvas.prototype.remove = function (o) { var i = this._objs.indexOf(o); if (i >= 0) this._objs.splice(i, 1); };
  MockCanvas.prototype.requestRenderAll = function () { this._renders += 1; };
  MockCanvas.prototype.renderAll = function () { this._renders += 1; };

  var frontCanvas = new MockCanvas([]);
  var backCanvas = new MockCanvas([]);
  window.CanvasObjVO = { totalCanvasArray: [frontCanvas, backCanvas] };
  delete window.CurrentCanvas;

  // 启动桥接（注入行为同 installPageBridge：直接调用模块级 pageBridge）
  pageBridge();

  function dispatch(type, payload) {
    handlers.message({ source: window, data: Object.assign({ source: "zy-card-assistant", type: type }, payload || {}) });
  }
  function lastPost() { return posts[posts.length - 1]; }

  // ---------- e2) probe（只读自检）----------
  posts.length = 0;
  dispatch("probe");
  var pr = lastPost();
  case_("e2 probe -> source/type", pr && pr.source === "zy-card-assistant-page" && pr.type === "probeResult");
  case_("e2 probe -> front found + ctor", pr && pr.canvases && pr.canvases[0].found === true && pr.canvases[0].ctor === "MockCanvas");
  case_("e2 probe -> href safe", pr && pr.href === window.location.href);
  case_("e2 probe 只读（未改变画布对象数）", frontCanvas._objs.length === 0 && backCanvas._objs.length === 0);

  // ---------- e3) apply：已有图层只改文本，样式不变 ----------
  var companyLayer = makeText({ text: "请输入公司名称", top: 30, fontSize: 18, fill: "#0a0a0a", fontFamily: "Microsoft YaHei" });
  var nameLayer = makeText({ text: "姓名", top: 60 });
  frontCanvas._objs.push(companyLayer, nameLayer);
  posts.length = 0;
  dispatch("apply", { side: "front", fields: { company_cn: "深圳市华创科技有限公司", name: "张三", phones: ["13800138000"], addresses: ["广东省深圳市南山区深南大道9988号华创大厦20楼"] } });
  var ar = lastPost();
  case_("e3 applyResult ok", ar && ar.type === "applyResult" && ar.ok === true);
  case_("e3 applied 标签含正确项目", ar && Array.isArray(ar.applied) && ar.applied.some(function (a) { return a.indexOf("中文公司 -> 深圳市华创科技有限公司") >= 0; }));
  case_("e3 已有层只改文本", companyLayer.text === "深圳市华创科技有限公司" && nameLayer.text === "张三");
  case_("e3 已有层样式不动", companyLayer.top === 30 && companyLayer.fontSize === 18 && companyLayer.fill === "#0a0a0a" && companyLayer.fontFamily === "Microsoft YaHei");
  case_("e3 缺层则新建（电话）", frontCanvas._objs.some(function (o) { return o.zyCreatedByAssistant === true && o.text === "电话：13800138000"; }));
  case_("e3 新建层继承参考样式（最近已用层 nameLayer: Arial/#333）", (function () {
    var o = frontCanvas._objs.filter(function (x) { return x.zyCreatedByAssistant === true; })[0];
    return o && o.fontFamily === "Arial" && o.fill === "#333";
  })());
  case_("e3 新建层 top 钳制在画布内", (function () { return frontCanvas._objs.filter(function (x) { return x.zyCreatedByAssistant === true; }).every(function (o) { return o.top >= 0 && o.top < frontCanvas.height; }); })());

  // ---------- e6) 助手层清理：只删富余助手层，模板层不删 ----------
  var extraPhone = makeText({ text: "电话：旧1", top: 200 });
  var templateFooter = makeText({ text: "款式：简约商务", top: 210, fontSize: 9 });
  extraPhone.zyCreatedByAssistant = true; extraPhone.zyFieldKey = "phone";
  frontCanvas._objs.push(extraPhone, templateFooter);
  posts.length = 0;
  dispatch("apply", { side: "front", fields: { company_cn: "深圳市华创科技有限公司", phones: ["13800138000"] } });
  case_("e6 富余助手层被清理", frontCanvas._objs.indexOf(extraPhone) < 0);
  case_("e6 模板层不被删", frontCanvas._objs.indexOf(templateFooter) >= 0);

  // ---------- e7) C1 选层规则（真实行为记录）：-20 为宽松下限 ----------
  // 单对象场景得分(位置加成)≥-20 → 被接受补填；真正“宁可新建”发生在分数更低/无可用层时。
  var unrelated = makeText({ text: "LOGO设计私享", top: 220, fontSize: 30 });
  var emptyCanvas2 = new MockCanvas([unrelated]);
  window.CanvasObjVO.totalCanvasArray = [emptyCanvas2, backCanvas];
  posts.length = 0;
  dispatch("apply", { side: "front", fields: { addresses: ["广东省深圳市福田区深南大道1号"] } });
  case_("e7 单无关对象被宽松补填（C1 阈值行为）", unrelated.text.indexOf("地址：广东省深圳市福田区深南大道1号") === 0);
  // e7b）没有任何文字层时，字段走新建（“不足时才创建”契约）
  var emptyCanvas3 = new MockCanvas([]);
  window.CanvasObjVO.totalCanvasArray = [emptyCanvas3, backCanvas];
  posts.length = 0;
  dispatch("apply", { side: "front", fields: { addresses: ["广东省深圳市福田区深南大道1号"] } });
  case_("e7b 空文字层 → 新建地址层且打标签", emptyCanvas3._objs.some(function (o) { return o.zyCreatedByAssistant === true && o.text.indexOf("地址：") === 0; }));

  // ---------- e8) both 双面填充 ----------
  window.CanvasObjVO.totalCanvasArray = [frontCanvas, backCanvas];
  backCanvas._objs.push(makeText({ text: "请输入主营范围", top: 10 }));
  posts.length = 0;
  dispatch("apply", { side: "both", fields: { business: ["电子元器件"], back_extra: ["诚信经营"] } });
  var br = lastPost();
  case_("e8 both applyResult ok", br && br.type === "applyResult" && br.ok === true);
  case_("e8 反面主营入反面画布", backCanvas._objs.some(function (o) { return o.text.indexOf("主营范围：电子元器件") === 0; }));

  // ---------- e9) 画布缺失：友好失败不崩溃 ----------
  window.CanvasObjVO = null;
  posts.length = 0;
  dispatch("apply", { side: "front", fields: { name: "张三" } });
  var err = lastPost();
  case_("e9 无画布 -> ok:false 提示", err && err.type === "applyResult" && err.ok === false && String(err.message).indexOf("未找到") >= 0);

  // ---------- v1) Stage 7.1 Resolver：无 CanvasObjVO → CURRENT_PAGE_UNKNOWN → ocrCreate STOP ----------
  window.CanvasObjVO = null;
  posts.length = 0;
  dispatch("ocrCreate", { items: [{ text: "测试", blockIndex: 0 }] });
  var v1 = lastPost();
  case_("v1 无 CanvasObjVO -> CURRENT_PAGE_UNKNOWN 停止创建", v1 && v1.type === "ocrCreateResult" && v1.ok === false && v1.code === "CURRENT_PAGE_UNKNOWN");

  // Stage 7.1：MockDiy —— 原生新增文字入口（drawText）最小桩，验证 resolver 选定「当前实际编辑页」
  function MockDiy(idName, objs) {
    this.idName = idName || "c0";
    this.canvas = new MockCanvas(objs || []);
    this.canvasObjInfo = { canvasToProductObjArr: [] };
    this.drawCalled = 0;
    this.drawLast = null;
  }
  MockDiy.prototype.drawText = function (text, fs, l, t, media, layerNum) {
    this.drawCalled += 1;
    this.drawLast = { text: String(text || ""), layerNum: layerNum };
    var o = makeText({ text: String(text || ""), layerNum: layerNum, uuid: "u-" + layerNum, multiUuid: "12345678-abcd-abcd-abcd-1234567890ab" });
    this.canvas._objs.push(o);
    return o;
  };

  // ---------- v2) 身份匹配：CurrentCanvas.getCurrentCanvas() === 条目.canvas → 创建命中当前页（反面），不默认 front ----------
  var diyFront = new MockDiy("c0", []);
  var diyBack = new MockDiy("c1", []);
  window.CurrentCanvas = { getCurrentCanvas: function () { return diyBack.canvas; } };
  window.CanvasObjVO = { totalCanvasArray: [diyFront, diyBack], frontImgPathStr: "/front.png", backImgPathStr: "/back.png" };
  posts.length = 0;
  dispatch("ocrCreate", { items: [{ text: "当前页文字", blockIndex: 0 }] });
  var v2 = lastPost();
  case_("v2 身份匹配 -> 创建命中当前编辑页（diyBack 而非 front）", v2 && v2.type === "ocrCreateResult" && v2.ok === true && diyBack.drawCalled === 1 && diyFront.drawCalled === 0);
  case_("v2 ocrCreateResult 走 native path", v2 && v2.editorIntegration && v2.editorIntegration.mode === "native");
  case_("v2 每 block 创建 1 对象（createdCount==1）", v2 && v2.createdCount === 1);

  // ---------- v3) 序号匹配：无 CurrentCanvas，currentCanvasNum=2 → 命中第 2 条（非 front hardcode） ----------
  delete window.CurrentCanvas;
  window.CanvasObjVO.currentCanvasNum = 2;
  posts.length = 0;
  dispatch("ocrCreate", { items: [{ text: "第二页文字", blockIndex: 0 }] });
  var v3 = lastPost();
  case_("v3 currentCanvasNum=2 -> 命中第二条", v3 && v3.type === "ocrCreateResult" && v3.ok === true && diyBack.drawCalled >= 2 && diyFront.drawCalled === 0);

  // ---------- v4) 单条正面兜底：单条目 + frontImgPathStr → 命中唯一页 ----------
  var diySole = new MockDiy("c0", []);
  delete window.CurrentCanvas;
  window.CanvasObjVO = { totalCanvasArray: [diySole], frontImgPathStr: "/front.png" };
  posts.length = 0;
  dispatch("ocrCreate", { items: [{ text: "唯一页文字", blockIndex: 0 }] });
  var v4 = lastPost();
  case_("v4 单条目+frontImgPathStr -> 命中唯一页", v4 && v4.type === "ocrCreateResult" && v4.ok === true && diySole.drawCalled === 1);

  // ---------- v5) 无证据不猜索引：双画布、无 CurrentCanvas、无 currentCanvasNum → UNKNOWN STOP（不得默认 front） ----------
  var diyA = new MockDiy("c0", []);
  var diyB = new MockDiy("c1", []);
  delete window.CurrentCanvas;
  window.CanvasObjVO = { totalCanvasArray: [diyA, diyB], frontImgPathStr: "/front.png", backImgPathStr: "/back.png" };
  posts.length = 0;
  dispatch("ocrCreate", { items: [{ text: "不该创建", blockIndex: 0 }] });
  var v5 = lastPost();
  case_("v5 多重歧义无证据 -> CURRENT_PAGE_UNKNOWN 且不创建", v5 && v5.type === "ocrCreateResult" && v5.ok === false && v5.code === "CURRENT_PAGE_UNKNOWN" && diyA.drawCalled === 0 && diyB.drawCalled === 0);

  // ---------- v6) ocrPrepare：resolver 已解析当前页但无目标图 -> IMAGE_UNAVAILABLE（非 CURRENT_PAGE_UNKNOWN） ----------
  window.CanvasObjVO = { totalCanvasArray: [diyA, diyB], currentCanvasNum: 1 };
  posts.length = 0;
  dispatch("ocrPrepare", {});
  var v6 = lastPost();
  case_("v6 ocrPrepare 已解析当前页但无图片 -> IMAGE_UNAVAILABLE", v6 && v6.type === "ocrPrepareResult" && v6.ok === false && v6.code === "IMAGE_UNAVAILABLE");

  // ---------- 汇总 ----------
  var summary = failures === 0 ? "ALL-PASS (" + results.length + ")" : "FAIL " + failures + "/" + results.length;
  document.title = "zy-editor: " + summary;
  var out = document.getElementById("zy_editor_result");
  if (out) out.textContent = summary + "\n" + results.join("\n");
  if (typeof console !== "undefined") console.info("[editor-bridge tests]", summary);
})();
