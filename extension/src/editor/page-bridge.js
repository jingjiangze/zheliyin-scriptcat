// =====================================================================
// 折立印名片套版助手 - Editor 边界（页面侧 Bridge，Stage 3）
// ---------------------------------------------------------------------
// 单一事实来源：与 field-core/config-core/ai-client 同模式（userscript
// @require / 扩展 manifest 按序加载 / exe 内嵌 extension/ 目录）。
// 职责：页面侧编辑器能力的唯一实现（canvas 定位 / 文字层读取与匹配 /
// 文字层创建与样式克隆 / 助手层清理 / probe 只读自检）。
// 本模块页面码保持与 Golden Master（main 6c19b46，v0.3.0.0）逐字一致，
// 注入方式不变（内容侧 installPageBridge 以 pageBridge.toString() 注入页面）。
// 约束：只读自检（probe）不得修改画布；不得包含字段业务/分面/merge。
// =====================================================================
"use strict";

// 页面注入入口：消息协议与主脚本 BRIDGE_SOURCE/PAGE_SOURCE 保持兼容，
// 未引入 requestId（当前调用严格串行，见 STAGE_3_REPORT §20/§21）。
function pageBridge() {
    // Stage 4.0（AUDIT-BRIDGE-002, P1）：跨 userscript 实例幂等 —— 页面主世界稳定 marker。
    // 同窗口内任何实例/热更新/重复执行的注入只会安装一次 listener；页面刷新后 window 重置自动重建。
    // （升级兼容：旧版本注入的 bridge 未设置 marker，热升级瞬间可能共存双 listener——见 STAGE_4.0_AUDIT 记录，属一次性的低概率窗口。）
    if (window.__ZY_CARD_ASSISTANT_BRIDGE__ && window.__ZY_CARD_ASSISTANT_BRIDGE__.installed) return;
    const BRIDGE_SOURCE_IN_PAGE = "zy-card-assistant";
    const PAGE_SOURCE_IN_PAGE = "zy-card-assistant-page";
    window.addEventListener("message", function (event) {
      if (event.source !== window || !event.data || event.data.source !== BRIDGE_SOURCE_IN_PAGE) return;
      if (event.data.type === "probe") {
        post("probeResult", buildProbeResult());
        return;
      }
      if (event.data.type === "apply") {
        const side = event.data.side || "front";
        if (side === "both") {
          const frontCanvas = findCanvasForSide("front");
          const backCanvas = findCanvasForSide("back");
          const results = [];
          if (frontCanvas) results.push(applyFields(frontCanvas, event.data.fields || {}, "front"));
          if (backCanvas) results.push(applyFields(backCanvas, event.data.fields || {}, "back"));
          const applied = [];
          results.forEach(function (result) { applied.push.apply(applied, result.applied || []); });
          if (applied.length) post("applyResult", { ok: true, applied: applied });
          else post("applyResult", { ok: false, message: "未找到正反面可填入的文字图层。", applied: [] });
          return;
        }
        const canvas = findCanvasForSide(side);
        if (!canvas) {
          post("applyResult", { ok: false, message: "未找到" + (side === "back" ? "反面" : "正面") + "画布，请等待模板加载完成。", applied: [] });
          return;
        }
        post("applyResult", applyFields(canvas, event.data.fields || {}, side));
      }
      if (event.data.type === "ocrCreate") {
        // Stage 5.5A-R2（Demo）：OCR 重建入口 —— 按 OCR 行级结果在正面画布创建真实 textbox。
        // 仅创建（NOT_FOUND 路径等价物）；identity 清洁（skipBox 已隔离 markuuid，5.1）。
        // Stage 5.6 P0（真机 BUILDING 卡死）：任何创建异常都必须兜底回复，禁止让调用方死等。
        const canvas = findCanvasForSide("front");
        if (!canvas) { post("ocrCreateResult", { ok: false, message: "未找到正面画布。" }); return; }
        const items = Array.isArray(event.data.items) ? event.data.items : [];
        const created = [];
        let failMsg = "";
        try {
          const ref = getTextObjects(canvas)[0] || canvas.getObjects().find(function (o) { return typeof o.text === "string"; }) || null;
          items.forEach(function (it, idx) {
            const obj = createTextObject(canvas, String(it.text || ""), ref, idx, null);
            if (!obj) return;
            const conf = { left: it.left != null ? it.left : 20, top: it.top != null ? it.top : 20 + idx * 24, width: Math.max(60, it.width || 120), fontSize: it.fontSize || 14, fontFamily: it.fontFamily || "思源黑体 Regular", textAlign: "left", fill: "#000000" };
            // Stage 5.6 P5-D：旋转场景（Mapper 输出 angle + origin:"center"）——中心即 left/top，绕中心旋转
            if (it.angle) { conf.angle = it.angle; conf.originX = "center"; conf.originY = "center"; }
            obj.set(conf);
            setObjectText(obj, String(it.text || ""));
            obj.zyFieldKey = "ocr_demo_" + String(it.text || "").slice(0, 4);
            created.push({ index: canvas.getObjects().indexOf(obj), type: obj.type, text: String(it.text || "").slice(0, 16) });
          });
        } catch (e) {
          failMsg = String(e && e.message || e).slice(0, 160);
          console.warn("[zy-ocr][ocrCreate] partial error: " + failMsg + " created=" + created.length);
        }
        if (canvas.requestRenderAll) canvas.requestRenderAll();
        post("ocrCreateResult", { ok: created.length > 0, created: created, message: failMsg || undefined });
        return;
      }
      if (event.data.type === "getCanvasInfo") {
        // Stage 5.5B P1：只读画布自检 —— 隔离世界读不到页面 world 的 requirejs 注册表，
        // 由页面世界回传画布状态（供 waitForCanvasReady / 诊断）。
        post("getCanvasInfoResult", buildCanvasInfo());
        return;
      }
      if (event.data.type === "ocrPrepare") {
        // Stage 5.5B P1：OCR 目标准备 —— 页面世界解析目标图（active→背景图→首图）、
        // 提取 element→toDataURL、返回显示几何。只读，不修改画布。
        post("ocrPrepareResult", buildOcrPrepare());
        return;
      }
    });

    function post(type, payload) {
      window.postMessage(Object.assign({ source: PAGE_SOURCE_IN_PAGE, type: type }, payload), location.origin);
    }

    // ---- Stage 5.5B P1：只读画布信息 / OCR 目标准备（页面世界执行，隔离世界不可见）----
    function buildCanvasInfo() {
      const canvas = findCanvasForSide("front");
      if (!canvas) return { ok: false, message: "未找到正面画布" };
      const objs = canvas.getObjects();
      const texts = objs.filter(isTextObject);
      const images = objs.filter(function (o) { return o && String(o.type) === "image"; });
      const active = canvas.getActiveObject ? canvas.getActiveObject() : null;
      return {
        ok: true,
        width: canvas.width,
        height: canvas.height,
        objs: objs.length,
        textTotal: texts.length,
        imageTotal: images.length,
        bgImage: !!canvas.backgroundImage,
        bgImageType: canvas.backgroundImage ? String(canvas.backgroundImage.type || "") : null,
        activeType: active ? String(active.type || "") : null,
        activeIsImage: !!(active && String(active.type) === "image")
      };
    }

    // 目标图解析（优先级 active→背景图→首图，§11/§12/§52）→ 提取 element→toDataURL → 显示几何
    function extractImagePayload(target, kind, canvas) {
      const el = target._element || (target.getElement && target.getElement());
      if (!el) return { ok: false, code: kind === "background-image" ? "BACKGROUND_IMAGE_UNAVAILABLE" : "IMAGE_UNAVAILABLE", message: "图片对象缺少图像数据，无法识别" };
      let w = el.naturalWidth || el.width || target.width;
      let h = el.naturalHeight || el.height || target.height;
      if (!w || !h) return { ok: false, code: "IMAGE_UNAVAILABLE", message: "图片尺寸无效，无法识别" };
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const c2 = cv.getContext && cv.getContext("2d");
      if (!c2) return { ok: false, code: "IMAGE_EXPORT_FAILED", message: "图片导出失败" };
      let dataUrl = null;
      try { c2.drawImage(el, 0, 0); dataUrl = cv.toDataURL("image/png"); } catch (e) { dataUrl = null; }
      if (!dataUrl) return { ok: false, code: "CROSS_ORIGIN_IMAGE", message: "图片来自跨域，浏览器禁止读取像素；请使用画布内上传的图片" };
      // 显示几何：背景图（fabric.backgroundImage）可能不携带 left/top，用画布居中兜底（§13 不建复杂定位系统）
      let left = target.left, top = target.top;
      if (!isFinite(left)) left = (canvas.width - w * (target.scaleX || 1)) / 2;
      if (!isFinite(top)) top = (canvas.height - h * (target.scaleY || 1)) / 2;
      return {
        ok: true,
        kind: kind,
        dataUrl: dataUrl,
        width: w,
        height: h,
        geometry: {
          left: left, top: top,
          width: target.width, height: target.height,
          scaleX: target.scaleX || 1, scaleY: target.scaleY || 1,
          angle: target.angle || 0
        }
      };
    }

    function buildOcrPrepare() {
      const canvas = findCanvasForSide("front");
      if (!canvas) return { ok: false, code: "CANVAS_NOT_READY", message: "画布未就绪，请等待模板加载完成" };
      const active = canvas.getActiveObject ? canvas.getActiveObject() : null;
      if (active && String(active.type) === "image") return extractImagePayload(active, "active-image", canvas);
      if (canvas.backgroundImage && String(canvas.backgroundImage.type) === "image") return extractImagePayload(canvas.backgroundImage, "background-image", canvas);
      const first = canvas.getObjects().find(function (o) { return o && String(o.type) === "image"; });
      if (first) return extractImagePayload(first, "first-image", canvas);
      return { ok: false, code: "IMAGE_UNAVAILABLE", message: "未找到可识别的图片：请先在画布选中一张图片，或填充一张背景图" };
    }

    function findCanvasForSide(side) {
      const CanvasObjVO = getLoadedModule("CanvasObjVO") || window.CanvasObjVO;
      const total = CanvasObjVO && CanvasObjVO.totalCanvasArray;
      const index = side === "back" ? 1 : 0;
      if (Array.isArray(total) && total[index]) {
        const selected = unwrapCanvas(total[index]) || findCanvasIn(total[index]);
        if (selected) return selected;
      }
      const CurrentCanvas = getLoadedModule("CurrentCanvas") || window.CurrentCanvas;
      if (side !== "back" && CurrentCanvas && CurrentCanvas.getCurrentCanvas) {
        const current = CurrentCanvas.getCurrentCanvas();
        const currentCanvas = unwrapCanvas(current) || findCanvasIn(current);
        if (currentCanvas) return currentCanvas;
      }
      if (Array.isArray(total) && total.length) {
        for (let i = 0; i < total.length; i += 1) {
          const found = unwrapCanvas(total[i]) || findCanvasIn(total[i]);
          if (found) return found;
        }
      }
      return findCanvasFromGlobals();
    }

    function getLoadedModule(name) {
      const req = window.requirejs || window.require;
      const context = req && req.s && req.s.contexts && req.s.contexts._;
      if (context && context.defined && context.defined[name]) return context.defined[name];
      return null;
    }

    function findCanvasFromGlobals() {
      const candidates = [];
      ["canvas", "currentCanvas", "canvasDiy", "diyCanvas", "CanvasDiy", "CanvasObjVO"].forEach(function (key) {
        if (window[key]) candidates.push(window[key]);
      });
      const loaded = getLoadedModule("CanvasObjVO");
      if (loaded) candidates.push(loaded);
      for (let i = 0; i < candidates.length; i += 1) {
        const found = findCanvasIn(candidates[i]);
        if (found) return found;
      }
      return null;
    }

    function findCanvasIn(root) {
      const seen = [];
      function walk(value, depth) {
        if (!value || depth > 4) return null;
        if (seen.indexOf(value) >= 0) return null;
        seen.push(value);
        const unwrapped = unwrapCanvas(value);
        if (unwrapped) return unwrapped;
        if (Array.isArray(value)) {
          for (let i = 0; i < value.length; i += 1) {
            const found = walk(value[i], depth + 1);
            if (found) return found;
          }
          return null;
        }
        if (typeof value === "object") {
          const keys = ["canvas", "_canvas", "fabricCanvas", "lowerCanvas", "currentCanvas", "stage", "totalCanvasArray"];
          for (let i = 0; i < keys.length; i += 1) {
            const found = walk(value[keys[i]], depth + 1);
            if (found) return found;
          }
        }
        return null;
      }
      return walk(root, 0);
    }

    function unwrapCanvas(value) {
      if (!value) return null;
      if (typeof value.getObjects === "function" && (typeof value.renderAll === "function" || typeof value.requestRenderAll === "function")) return value;
      if (value.canvas && typeof value.canvas.getObjects === "function") return value.canvas;
      return null;
    }

    function getTextObjects(canvas) {
      return canvas.getObjects().filter(isTextObject);
    }

    function isTextObject(obj) {
      if (!obj) return false;
      const type = String(obj.type || "").toLowerCase();
      if (["text", "textbox", "i-text", "curvedtext"].indexOf(type) >= 0) return true;
      if (obj.text != null && typeof obj.set === "function") return true;
      const mediaType = String(obj.mediaMediaType || (obj.media && obj.media.mediaType) || "").toLowerCase();
      return mediaType.indexOf("text") >= 0;
    }

    function applyFields(canvas, fields, side) {
      const items = buildItems(fields || {}, side || "front");
      if (!items.length) return { ok: false, message: "没有可填入的字段。", applied: [] };

      const objects = getTextObjects(canvas).sort(function (a, b) {
        return Number(a.top || 0) - Number(b.top || 0) || Number(a.left || 0) - Number(b.left || 0);
      });
      removeAssistantExtras(canvas, objects, items);
      const used = [];
      const applied = [];
      const layout = analyzeLayout(canvas, objects);

      items.forEach(function (item, index) {
        let obj = pickObject(objects, used, item);
        let created = false;
        const reference = obj || findReferenceObject(objects, used, index);
        if (!obj) {
          obj = createTextObject(canvas, item.text, reference, index, layout);
          if (obj) {
            objects.push(obj);
            created = true;
          }
        }
        if (!obj) return;
        used.push(obj);
        setObjectText(obj, item.text);
        if (created) placeCreatedObject(obj, reference, index, layout);
        obj.zyFieldKey = item.key;
        applied.push((side === "back" ? "反面 " : "正面 ") + item.label + " -> " + item.text);
      });

      if (canvas.requestRenderAll) canvas.requestRenderAll();
      else if (canvas.renderAll) canvas.renderAll();
      return applied.length ? { ok: true, applied: applied } : { ok: false, message: "识别到了字段，但没有匹配到合适的文字图层。", applied: [] };
    }

    function buildItems(fields, side) {
      const items = [];
      if (side === "back") {
        // C3：多个主营项拆成多个图层面板，第一个带“主营范围：”前缀，其余直接放内容。
        const biz = (fields.business || []).filter(Boolean);
        if (biz.length === 1) addItem(items, "business", "主营范围", "主营范围：" + biz[0]);
        else biz.forEach(function (value, i) { addItem(items, "business", "主营范围", i === 0 ? "主营范围：" + value : value); });
        (fields.back_extra || []).forEach(function (value) { addItem(items, "back_extra", "反面补充", value); });
        return items;
      }
      addItem(items, "company_cn", "中文公司", fields.company_cn);
      addItem(items, "company_en", "英文公司", fields.company_en);
      addItem(items, "name", "姓名", fields.name);
      addItem(items, "title", "职位", fields.title);
      addMultiItems(items, "phone", "电话", fields.phones);
      addMultiItems(items, "wechat", "微信", fields.wechats);
      addMultiItems(items, "email", "邮箱", fields.emails);
      addMultiItems(items, "website", "网址", fields.websites);
      addMultiItems(items, "address", "地址", fields.addresses);
      return items;
    }

    // C2：每个多值字段最多生成 3 个图层项，超出部分并入最后一项，避免图层数量过多导致溢出/重叠。
    function addMultiItems(items, key, label, values) {
      const list = (values || []).filter(Boolean);
      const cap = 3;
      list.slice(0, cap).forEach(function (value) { addItem(items, key, label, line(label, value)); });
      const rest = list.slice(cap);
      if (rest.length && items.length) {
        const last = items[items.length - 1];
        last.text = last.text + "；" + rest.join("；");
      }
    }

    function addItem(items, key, label, text) {
      const value = String(text || "").trim();
      if (value) items.push({ key: key, label: label, text: value });
    }

    function line(label, value) {
      const text = String(value || "").trim();
      return text ? label + "：" + text : "";
    }

    function pickObject(objects, used, item) {
      let best = null;
      let bestScore = -9999;
      objects.forEach(function (obj, index) {
        if (used.indexOf(obj) >= 0) return;
        const text = String(obj.text || obj._text || "").trim();
        const score = scoreObject(obj, text, item, index, objects.length);
        if (score > bestScore) {
          best = obj;
          bestScore = score;
        }
      });
      if (bestScore >= 35) return best;
      // C1：分数不足时只接受“轻度不匹配”（还有位置/排版依据）的对象；
      // 明显错位（分数过低）宁可返回 null 由上层新建图层，也不乱填已有图层。
      if (best && bestScore >= -20) return best;
      return null;
    }

    function removeAssistantExtras(canvas, objects, items) {
      const wanted = {};
      items.forEach(function (item) { wanted[item.key] = (wanted[item.key] || 0) + 1; });
      const kept = {};
      objects.slice().forEach(function (obj) {
        if (!obj || !obj.zyCreatedByAssistant) return;
        const key = obj.zyFieldKey || "";
        kept[key] = (kept[key] || 0) + 1;
        if (!wanted[key] || kept[key] > wanted[key]) {
          canvas.remove(obj);
          const index = objects.indexOf(obj);
          if (index >= 0) objects.splice(index, 1);
        }
      });
    }

    function scoreObject(obj, text, item, index, total) {
      const key = item.key;
      const lower = text.toLowerCase();
      const size = Number(obj.fontSize || obj.size || 12);
      const topRank = total ? (total - index) / total : 0;
      let score = topRank * 8;
      if (text === item.text) score += 100;
      if (/示例|样稿|请输入|点击|双击/.test(text)) score += 8;
      if (key === "company_cn") score += /公司|集团|科技|贸易|有限公司|厂/.test(text) ? 90 : topRank * 18 + size / 2;
      if (key === "company_en") score += /\b(co|ltd|limited|company|trading|technology|group)\b/i.test(text) ? 90 : /[a-z]/i.test(text) ? 12 : -8;
      if (key === "name") score += /^[\u4e00-\u9fa5]{2,4}$/.test(text) ? 90 : size > 16 ? 15 : 0;
      if (key === "title") score += /经理|总监|工程师|销售|主管|负责人|manager|director|engineer/i.test(text) ? 90 : 0;
      if (key === "phone") score += /1[3-9]\d{9}|电话|手机|tel|phone|mobile/i.test(text) ? 95 : -5;
      if (key === "wechat") score += /微信|wechat|wx/i.test(text) ? 95 : -5;
      if (key === "email") score += /@|邮箱|mail|email/i.test(lower) ? 95 : -8;
      if (key === "website") score += /网址|网站|web|www\.|https?:\/\//i.test(text) ? 95 : -8;
      if (key === "address") score += /地址|address|省|市|区|街道|路|大厦|楼|室|工业园/i.test(text) ? 95 : index > total * .55 ? 12 : -4;
      if (key === "business") score += /主营|业务|产品|芯片|服务器|DDR|贸易|进出口/i.test(text) ? 90 : index > total * .55 ? 8 : -4;
      return score;
    }

    function findReferenceObject(objects, used, index) {
      if (used.length) return used[used.length - 1];
      if (objects[index]) return objects[index];
      return objects.length ? objects[objects.length - 1] : null;
    }

    function analyzeLayout(canvas, objects) {
      const width = Number(canvas.width || (canvas.getWidth && canvas.getWidth()) || 360);
      const height = Number(canvas.height || (canvas.getHeight && canvas.getHeight()) || 216);
      const gaps = [];
      for (let i = 1; i < objects.length; i += 1) {
        const gap = Number(objects[i].top || 0) - Number(objects[i - 1].top || 0);
        if (gap > 4 && gap < height * 0.5) gaps.push(gap);
      }
      gaps.sort(function (a, b) { return a - b; });
      const medianGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 24;
      return {
        width: width,
        height: height,
        left: width * 0.1,
        top: height * 0.12,
        contentWidth: width * 0.8,
        step: Math.max(18, medianGap)
      };
    }

    function createTextObject(canvas, text, reference, index, layout) {
      const fabric = window.fabric || (canvas.constructor && canvas.constructor.fabric);
      const style = getReferenceStyle(reference);
      let obj = null;
      // A1：优先“克隆”参考文字图层——复用设计器自己的文字类并继承其自定义属性
      // （字体标识、可编辑标记、数据模型等），这样新图层可双击编辑、字体与周边一致、不会与画布割裂。
      if (reference && reference.constructor) {
        try {
          const Klass = reference.constructor;
          if (typeof Klass === "function") {
            obj = new Klass("", {
              left: style.left,
              top: style.top,
              width: style.width,
              fontSize: style.fontSize,
              fill: style.fill,
              fontFamily: style.fontFamily,
              fontWeight: style.fontWeight,
              fontStyle: style.fontStyle,
              lineHeight: style.lineHeight,
              textAlign: style.textAlign,
              charSpacing: style.charSpacing,
              editable: true
            });
            inheritReferenceProps(obj, reference);
          }
        } catch (_error) {
          obj = null;
        }
      }
      if (!obj) {
        if (!fabric) return null;
        const Klass = fabric.Textbox || fabric.IText || fabric.Text;
        if (!Klass) return null;
        obj = new Klass(text, {
          left: reference ? style.left : layout.left,
          top: reference ? style.top + Math.max(style.height, style.fontSize * 1.55) : layout.top + index * layout.step,
          width: reference ? style.width : layout.contentWidth,
          fontSize: style.fontSize,
          fill: style.fill,
          fontFamily: style.fontFamily,
          fontWeight: style.fontWeight,
          fontStyle: style.fontStyle,
          lineHeight: style.lineHeight,
          textAlign: style.textAlign,
          charSpacing: style.charSpacing,
          editable: true
        });
      }
      obj.zyCreatedByAssistant = true;
      obj.zyFieldKey = null;
      canvas.add(obj);
      return obj;
    }

    // A1：把参考对象（含其原型链）上的自有属性拷到新对象上，只跳过内部/画布引用类字段。
    // Stage 5.1（STAGE5.1-CRE-01, P1）修复：追加跳过 identity / 度量缓存 / 事件 / 编辑回退字段，
    // 防止新对象继承 reference 的 markuuid（破坏 textbox markuuid 唯一性）与陈旧缓存/监听器/回退文本。
    function inheritReferenceProps(obj, reference) {
      const skipBox = new Set(["canvas", "_canvas", "group", "_group", "ctx", "_ctx", "scene", "_scene", "_cacheCanvas", "_cacheContext", "_cacheCanvasDimensions", "clipPath", "text", "_text", "textLines", "_textLines", "lineWidths", "_lineWidths", "dirty", "zyCreatedByAssistant", "zyFieldKey", "markuuid", "uuid", "__charBounds", "__lineHeights", "__lineWidths", "_styleMap", "__eventListeners", "aCoords", "oCoords", "lastSafeText"]);
      const collected = {};
      let current = reference;
      while (current && current !== Object.prototype) {
        Object.getOwnPropertyNames(current).forEach(function (name) {
          if (skipBox.has(name) || name in collected) return;
          try { collected[name] = reference[name]; } catch (_error) {}
        });
        current = Object.getPrototypeOf(current);
      }
      Object.keys(collected).forEach(function (name) {
        if (skipBox.has(name)) return;
        try { obj[name] = collected[name]; } catch (_error) {}
      });
      return obj;
    }

    function getReferenceStyle(reference) {
      return {
        left: Number(reference && reference.left != null ? reference.left : 32),
        top: Number(reference && reference.top != null ? reference.top : 32),
        width: Number(reference && reference.width || 240),
        height: Number(reference && reference.height || 20),
        fontSize: Number(reference && reference.fontSize || 16),
        fill: reference && reference.fill || "#1f2937",
        fontFamily: reference && reference.fontFamily || "Microsoft YaHei, Arial",
        fontWeight: reference && reference.fontWeight || "normal",
        fontStyle: reference && reference.fontStyle || "normal",
        lineHeight: Number(reference && reference.lineHeight || 1.25),
        textAlign: reference && reference.textAlign || "left",
        charSpacing: Number(reference && reference.charSpacing || 0)
      };
    }

    function placeCreatedObject(obj, reference, index, layout) {
      const style = getReferenceStyle(reference);
      const step = Math.max(style.height, style.fontSize * 1.55, layout && layout.step || 0);
      let top = layout ? layout.top + index * step : style.top + index * step;
      if (reference) top = Math.min(style.top + step, top);
      // A2/C2：新图层 top 统一钳制在画布内，避免溢出/重叠；去掉原先覆盖计算值的旧逻辑。
      const maxTop = layout && layout.height ? Math.max(4, layout.height - step) : top;
      top = Math.max(4, Math.min(top, maxTop));
      const options = {
        left: reference ? style.left : layout.left,
        top: top,
        width: reference ? style.width : layout.contentWidth,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fill: style.fill,
        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight,
        fontStyle: style.fontStyle,
        textAlign: style.textAlign,
        charSpacing: style.charSpacing
      };
      if (typeof obj.set === "function") obj.set(options);
      else Object.assign(obj, options);
      if (typeof obj.setCoords === "function") obj.setCoords();
    }

    function setObjectText(obj, value) {
      const text = String(value || "");
      if (typeof obj.setText === "function") obj.setText(text);
      else if (typeof obj.set === "function") obj.set("text", text);
      else obj.text = text;
      obj.text = text;
      obj.dirty = true;
      if (typeof obj.initDimensions === "function") obj.initDimensions();
      if (typeof obj.setCoords === "function") obj.setCoords();
    }

    // 自检：报告当前页面/画布状态，帮助定位“本地填不进去”的根因。只读，不修改画布。
    function buildProbeResult() {
      const canvases = ["front", "back"].map(function (side) {
        try {
          const canvas = findCanvasForSide(side);
          return {
            side: side,
            found: !!canvas,
            ctor: canvas && canvas.constructor ? canvas.constructor.name : null,
            width: canvas && (canvas.width || (canvas.getWidth && canvas.getWidth())) || 0,
            height: canvas && (canvas.height || (canvas.getHeight && canvas.getHeight())) || 0,
            textObjects: canvas ? getTextObjects(canvas).length : 0
          };
        } catch (error) {
          return { side: side, found: false, ctor: null, error: String(error && error.message || error) };
        }
      });
      return { ok: true, href: location.href, canvases: canvases };
    }

    // 安装成功后才落 marker，保证 listener 注册异常时不留下“已安装”假象（可重试）。
    window.__ZY_CARD_ASSISTANT_BRIDGE__ = { installed: true, ts: Date.now() };
  }