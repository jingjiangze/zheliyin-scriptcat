// ==UserScript==
// @name         折立印名片套版助手 (OCR Demo 版)
// @namespace    https://github.com/jingjiangze/zheliyin-scriptcat
// @version      0.3.10.2
// @description  【Demo/实验版】在 diy.zheliyin.com 设计器里识别客户名片资料，优先填入当前模板已有文字图层；支持「识别图片文字」(本地 Tesseract.js，或自动模式本地失败时切换到百度云端 OCR)。持续更新试装版，非正式稳定版。
// @author       jingjiangze
// @match        https://diy.zheliyin.com/diyWeb/third/*
// @match        https://diy.zheliyin.com/diyWeb/third/*/*/thirdLoginDiyEdit.do*
// @match        https://diy.zheliyin.com/diyWeb/third/*/*/*/thirdDiyAdd.do*
// @match        https://diy.zheliyin.com/diyWeb/*thirdDiyAdd.do*
// @match        https://diy.zheliyin.com/diyWeb/*thirdLoginDiyEdit.do*
// @match        http://diy.zheliyin.com/diyWeb/third/*
// @match        http://diy.zheliyin.com/diyWeb/third/*/*/thirdLoginDiyEdit.do*
// @match        http://diy.zheliyin.com/diyWeb/third/*/*/*/thirdDiyAdd.do*
// @match        http://diy.zheliyin.com/diyWeb/*thirdDiyAdd.do*
// @match        http://diy.zheliyin.com/diyWeb/*thirdLoginDiyEdit.do*
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/extension/src/fields/field-core.js?v=0.3.10.2
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/extension/src/core/config-core.js?v=0.3.10.2
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/extension/src/ai/ai-client.js?v=0.3.10.2
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/extension/src/editor/page-bridge.js?v=0.3.10.2
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/extension/src/ocr/baidu-provider.js?v=0.3.10.2
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/extension/src/ocr/fallback-policy.js?v=0.3.10.2
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/extension/src/ocr/candidate-normalizer.js?v=0.3.10.2
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/extension/src/ocr/credential-crypto.js?v=0.3.10.2
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/extension/src/ocr/ocr-quality.js?v=0.3.10.2
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM_addElement
// @connect      ark.cn-beijing.volces.com
// @connect      raw.githubusercontent.com
// @connect      github.com
// @connect      cdn.jsdelivr.net
// @connect      aip.baidubce.com
// @connect      *
// @updateURL    https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/zheliyin-card-assistant.user.js
// @downloadURL  https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/zheliyin-card-assistant.user.js
// ==/UserScript==

(function () {
  "use strict";

  const VERSION = "0.3.10.2";

  // ---- Stage 5.6（用户指令 2026-09-17）：OCR-only Demo ----
  // Demo 主 UI = 原生右栏 OCR 抽屉；旧套版浮窗停用挂载（renderPanel 函数体与全部套版代码保留）。
  // GM 开关 zyShowTemplatePanel="1" 可恢复旧套版浮窗（豆包 AI 设置/字段/正反面/诊断/更新提示）。
  const OCR_ONLY_MODE = GM_getValue("zyShowTemplatePanel", "0") !== "1";
  const BRIDGE_SOURCE = "zy-card-assistant";
  const PAGE_SOURCE = "zy-card-assistant-page";
  // DEFAULT_BASE_URL / DEFAULT_MODEL 已迁移至 config-core（@require 加载，作用域共享，单一来源）
  const UPDATE_URL = "https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/zheliyin-card-assistant.user.js";
  const DOWNLOAD_URL = "https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/demo/zheliyin-card-assistant.user.js";

  // 带边界断言的电话正则：前面不能紧跟数字，避免从 QQ 号/订单号等长数字串里误截 11 位。
  const PHONE_BOUND_RE = /(?<!\d)(?:\+?86[-\s]?)?(1[3-9]\d{9})(?!\d)/;
  const PHONE_BOUND_RE_G = /(?<!\d)(?:\+?86[-\s]?)?(1[3-9]\d{9})(?!\d)/g;

  const FIELD_LABELS = {
    company_cn: "中文公司",
    company_en: "英文公司",
    name: "姓名",
    title: "职位",
    phones: "电话",
    wechats: "微信",
    emails: "邮箱",
    websites: "网址",
    addresses: "地址",
    business: "主营业务",
    back_extra: "反面补充"
  };

  const state = {
    fields: emptyFields(),
    frontText: "",
    backText: "",
    logs: [],
    busy: false,
    minimized: false
  };

  // Stage 3.2（AUDIT-BRIDGE-001）：Bridge 安装生命周期稳定标记（同一运行内只注入一次）
  let pageBridgeInstalled = false;

  // emptyFields() 已迁移至 field-core（@require 首行加载）

  function getConfig() {
    // Stage 2：单一事实来源 —— 经 config-core 解析，历史 key zyBaseUrl 仅作兼容只读来源并迁移一次
    const resolved = resolveConfig({
      zyArkApiKey: GM_getValue("zyArkApiKey", ""),
      zyArkBaseUrl: GM_getValue("zyArkBaseUrl", ""),
      zyBaseUrl: GM_getValue("zyBaseUrl", ""),
      zyArkModel: GM_getValue("zyArkModel", "")
    });
    if (resolved.usedLegacy) {
      // 一次性迁移：历史 zyBaseUrl → 同步写回标准 key（两 key 对齐）
      GM_setValue("zyArkBaseUrl", resolved.baseUrl);
      GM_setValue("zyBaseUrl", resolved.baseUrl);
    }
    return { apiKey: resolved.apiKey, baseUrl: resolved.baseUrl, model: resolved.model };
  }

  function saveConfig(config) {
    const snap = configToStorage(config);
    GM_setValue("zyArkApiKey", snap.zyArkApiKey);
    GM_setValue("zyArkBaseUrl", snap.zyArkBaseUrl);
    GM_setValue("zyBaseUrl", snap.zyBaseUrl);
    GM_setValue("zyArkModel", snap.zyArkModel);
  }

  function addStyles() {
    GM_addStyle(`
      #zy-card-assistant {
        position: fixed;
        top: 80px;
        right: 14px;
        width: 390px;
        max-height: calc(100vh - 96px);
        z-index: 2147483647;
        background: #ffffff;
        color: #172033;
        border: 1px solid #d7dce5;
        border-radius: 8px;
        box-shadow: 0 14px 36px rgba(16, 24, 40, .20);
        font-family: "Microsoft YaHei", "Segoe UI", Arial, sans-serif;
        overflow: hidden;
      }
      #zy-card-assistant * { box-sizing: border-box; letter-spacing: 0; }
      #zy-card-assistant.zy-min { width: 226px; }
      #zy-card-assistant.zy-min .zy-body { display: none; }
      .zy-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px;
        background: #1f6feb;
        color: #fff;
        cursor: move;
        user-select: none;
      }
      .zy-title { font-weight: 700; font-size: 14px; }
      .zy-head-actions { display: flex; gap: 6px; }
      .zy-icon-btn {
        border: 0;
        background: rgba(255,255,255,.18);
        color: #fff;
        border-radius: 5px;
        height: 26px;
        min-width: 28px;
        cursor: pointer;
      }
      .zy-body {
        padding: 12px;
        display: grid;
        gap: 10px;
        max-height: calc(100vh - 146px);
        overflow: auto;
      }
      .zy-row { display: grid; gap: 5px; }
      .zy-label {
        font-size: 12px;
        color: #475467;
        font-weight: 700;
      }
      .zy-input, .zy-textarea {
        width: 100%;
        border: 1px solid #d7dce5;
        border-radius: 6px;
        padding: 8px;
        color: #172033;
        background: #fff;
        font: 12px/1.45 "Microsoft YaHei", "Segoe UI", Arial, sans-serif;
      }
      .zy-textarea { min-height: 112px; resize: vertical; }
      .zy-actions {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
      }
      .zy-actions.two { grid-template-columns: 1.25fr 1fr; }
      .zy-settings {
        border: 1px solid #e4e7ec;
        border-radius: 6px;
        padding: 7px;
        background: #fbfcfe;
      }
      .zy-settings summary {
        cursor: pointer;
        color: #475467;
        font-size: 12px;
        font-weight: 700;
      }
      .zy-settings-body {
        display: grid;
        gap: 8px;
        margin-top: 8px;
      }
      .zy-btn {
        border: 0;
        border-radius: 6px;
        min-height: 34px;
        background: #1f6feb;
        color: white;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }
      .zy-btn.secondary { background: #eef2f7; color: #1f2937; }
      .zy-btn:disabled { opacity: .55; cursor: wait; }
      .zy-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
      }
      .zy-section-title {
        grid-column: 1 / -1;
        margin-top: 2px;
        padding-top: 4px;
        border-top: 1px solid #eef2f7;
        color: #344054;
        font-size: 12px;
        font-weight: 700;
      }
      .zy-field { display: grid; gap: 4px; }
      .zy-field span {
        font-size: 11px;
        color: #667085;
      }
      .zy-field input, .zy-field textarea {
        width: 100%;
        border: 1px solid #d7dce5;
        border-radius: 5px;
        padding: 6px;
        font-size: 12px;
        font-family: "Microsoft YaHei", "Segoe UI", Arial, sans-serif;
      }
      .zy-field textarea { min-height: 54px; resize: vertical; }
      .zy-side-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
      }
      .zy-side-grid textarea {
        min-height: 82px;
        resize: vertical;
      }
      .zy-status {
        min-height: 20px;
        font-size: 12px;
        color: #667085;
        white-space: pre-wrap;
      }
      .zy-divider {
        height: 1px;
        background: #e4e7ec;
        margin: 2px 0;
      }
      .zy-url {
        display: grid;
        gap: 3px;
        padding: 7px;
        border: 1px solid #e4e7ec;
        border-radius: 6px;
        background: #fbfcfe;
        color: #667085;
        font-size: 11px;
        line-height: 1.35;
        word-break: break-all;
      }
      .zy-note {
        font-size: 11px;
        color: #98a2b3;
        line-height: 1.45;
        word-break: break-all;
      }
      /* Stage 5.5B P2-B：原生右栏邻接抽屉（复用 zy-* 样式体系） */
      #zy-native-ocr-panel {
        position: fixed;
        top: 0;
        right: 190px; /* 紧贴 .rightPageBar.rightBar 左缘 */
        width: 245px;
        height: 100vh;
        z-index: 2147483000;
        background: #ffffff;
        color: #172033;
        border-left: 1px solid #d7dce5;
        box-shadow: -8px 0 24px rgba(16, 24, 40, .12);
        font-family: "Microsoft YaHei", "Segoe UI", Arial, sans-serif;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      #zy-native-ocr-panel .zy-body {
        flex: 1;
        display: grid;
        gap: 10px;
        padding: 12px;
        overflow: auto;
      }
      #zy-native-ocr-panel .zy-head { flex: none; }
      #zy-native-ocr-tool-btn {
        display: block;
        width: 100%;
        height: 52px;
        border: 0;
        background: #2e7ff0;
        color: #fff;
        font-size: 18px;
        font-weight: 700;
        cursor: pointer;
      }
      #zy-native-ocr-tool-btn:hover { background: #1f6feb; }
    `);
  }

  function renderPanel() {
    addStyles();
    installPageBridge();

    const old = document.getElementById("zy-card-assistant");
    if (old) old.remove();

    const config = getConfig();
    const panel = document.createElement("section");
    panel.id = "zy-card-assistant";
    if (state.minimized) panel.classList.add("zy-min");
    applySavedPanelPosition(panel);
    panel.innerHTML = `
      <div class="zy-head">
        <div class="zy-title">名片套版助手</div>
        <div class="zy-head-actions">
          <button class="zy-icon-btn" id="zy-min-btn" title="收起/展开">${state.minimized ? "+" : "-"}</button>
          <button class="zy-icon-btn" id="zy-close-btn" title="关闭">×</button>
        </div>
      </div>
      <div class="zy-body">
        <div class="zy-url">
          <div>当前网址：${escapeHtml(location.href)}</div>
          <div>版本：${VERSION}</div>
        </div>
        <details class="zy-settings">
          <summary>识别设置</summary>
          <div class="zy-settings-body">
            <div class="zy-row">
              <label class="zy-label" for="zy-api-key">豆包 API Key</label>
              <input class="zy-input" id="zy-api-key" type="password" value="${escapeHtml(config.apiKey)}" placeholder="可选。填写后 AI 只辅助补空字段。">
            </div>
            <div class="zy-row">
              <label class="zy-label" for="zy-model">模型</label>
              <input class="zy-input" id="zy-model" value="${escapeHtml(config.model)}">
            </div>
            <div class="zy-row">
              <label class="zy-label" for="zy-ocr-mode">图片识别方式</label>
              <select class="zy-input" id="zy-ocr-mode">
                <option value="auto" ${getOcrMode() === "auto" ? "selected" : ""}>自动（本地优先，失败时用百度云端）</option>
                <option value="local" ${getOcrMode() === "local" ? "selected" : ""}>仅本地（不联网）</option>
                <option value="baidu" ${getOcrMode() === "baidu" ? "selected" : ""}>百度云端</option>
              </select>
              <div class="zy-note">自动模式：本地引擎加载失败/识别为空/超时时，会把图片发送到百度识别。</div>
            </div>
          </div>
        </details>
        <details class="zy-settings">
          <summary>百度云 OCR（云端备用）</summary>
          <div class="zy-settings-body">
            <div class="zy-row">
              <label class="zy-label" for="zy-baidu-ak">API Key</label>
              <input class="zy-input" id="zy-baidu-ak" type="password" placeholder="百度智能云应用的 API Key（已配置 ${baiduConfigured() ? baiduAkMasked() : "未配置"}）">
            </div>
            <div class="zy-row">
              <label class="zy-label" for="zy-baidu-sk">Secret Key</label>
              <input class="zy-input" id="zy-baidu-sk" type="password" placeholder="百度智能云应用的 Secret Key（留空保持原样）">
            </div>
            <div class="zy-actions two">
              <button class="zy-btn" id="zy-baidu-save">保存配置</button>
              <button class="zy-btn secondary" id="zy-baidu-test">测试连接</button>
            </div>
            <div class="zy-note" id="zy-baidu-status">Key 只保存在本机脚本配置中，不写入画布、不上传第三方。</div>
          </div>
        </details>
        <div class="zy-row">
          <label class="zy-label" for="zy-raw">客户文字</label>
          <textarea class="zy-textarea" id="zy-raw" placeholder="把微信、表格或客户发来的名片资料粘贴到这里。追加信息会合并到现有字段。"></textarea>
        </div>
        <div class="zy-side-grid" id="zy-side-texts">${renderSideTextInputs()}</div>
        <div class="zy-actions two">
          <button class="zy-btn" id="zy-parse-apply">识别并填正反面</button>
          <button class="zy-btn secondary" id="zy-append">追加信息</button>
        </div>
        <div class="zy-grid" id="zy-fields">${renderFieldInputs(state.fields)}</div>
        <div class="zy-actions two">
          <button class="zy-btn" id="zy-apply-front">填正面</button>
          <button class="zy-btn secondary" id="zy-apply-back">填反面</button>
        </div>
        <div class="zy-actions">
          <button class="zy-btn zy-ocr" id="zy-ocr-btn">识别图片文字</button>
          <button class="zy-btn secondary" id="zy-probe" title="检测画布与桥接状态">诊断</button>
        </div>
        <div class="zy-divider"></div>
        <div class="zy-update" id="zy-update"></div>
        <div class="zy-status" id="zy-status">${escapeHtml(state.logs.join("\n"))}</div>
      </div>
    `;
    document.body.appendChild(panel);
    bindPanel(panel);
    makeDraggable(panel);
    checkForUpdateSoon();
  }

  function renderFieldInputs(fields) {
    const data = normalizeFields(fields);
    const groups = [
      ["正面内容", ["company_cn", "company_en", "name", "title", "phones", "wechats", "emails", "websites", "addresses"]],
      ["反面内容", ["business", "back_extra"]]
    ];
    return groups.map((group) => {
      const title = `<div class="zy-section-title">${group[0]}</div>`;
      const fieldsHtml = group[1].map((key) => {
      const multiline = ["phones", "wechats", "emails", "websites", "addresses", "business", "back_extra"].includes(key);
      const value = multiline ? (data[key] || []).join("\n") : (data[key] || "");
      if (multiline) {
        return `<label class="zy-field"><span>${FIELD_LABELS[key]}</span><textarea data-field="${key}">${escapeHtml(value)}</textarea></label>`;
      }
      return `<label class="zy-field"><span>${FIELD_LABELS[key]}</span><input data-field="${key}" value="${escapeHtml(value)}"></label>`;
      }).join("");
      return title + fieldsHtml;
    }).join("");
  }

  function renderSideTextInputs() {
    return `
      <label class="zy-field">
        <span>正面文本</span>
        <textarea data-side-text="front" placeholder="AI 或本地规则会先把正面内容放到这里">${escapeHtml(state.frontText)}</textarea>
      </label>
      <label class="zy-field">
        <span>反面文本</span>
        <textarea data-side-text="back" placeholder="主营范围、简介、优势、二维码提示等反面内容">${escapeHtml(state.backText)}</textarea>
      </label>
    `;
  }

  function bindPanel(panel) {
    panel.querySelector("#zy-min-btn").addEventListener("click", () => {
      state.minimized = !state.minimized;
      renderPanel();
    });
    panel.querySelector("#zy-close-btn").addEventListener("click", () => panel.remove());
    panel.querySelector("#zy-parse-apply").addEventListener("click", () => parseFields({ append: false, apply: "both" }));
    panel.querySelector("#zy-append").addEventListener("click", () => parseFields({ append: true, apply: false }));
    panel.querySelector("#zy-apply-front").addEventListener("click", () => {
      rebuildFieldsFromSideText();
      applyFieldsToPage(state.fields, "front");
    });
    panel.querySelector("#zy-apply-back").addEventListener("click", () => {
      rebuildFieldsFromSideText();
      applyFieldsToPage(state.fields, "back");
    });
    // P1 根因修复：模板曾移除 #zy-probe 按钮但绑定仍在 → querySelector null → TypeError → 后续绑定全部失效。
    // 防御性绑定：单按钮缺失不再拖垮整块面板（优先绑定 OCR，诊断其次）。
    const ocrBtn = panel.querySelector("#zy-ocr-btn");
    if (ocrBtn) ocrBtn.addEventListener("click", handleOcrImage);
    const probeBtn = panel.querySelector("#zy-probe");
    if (probeBtn) probeBtn.addEventListener("click", probeCanvas);
    // Stage 5.5B P4 / P2-B：识别方式 + 百度设置共用绑定（suffix 区分浮窗面板与原生抽屉，单一来源）
    bindOcrControls(panel, "", () => { renderPanel(); });
  }

  // 识别方式下拉 + 百度云 OCR（AK/SK 脱敏存取 + 保存 + 测试连接）统一绑定。
  // suffix: 浮窗 "" / 原生抽屉 "-native"；onSaved: 保存后回调（浮窗需重渲染刷新占位，原生抽屉不需要）。
  function bindOcrControls(scope, suffix, onSaved) {
    const q = (id) => scope.querySelector("#" + id + suffix);
    const modeSel = q("zy-ocr-mode");
    if (modeSel) modeSel.addEventListener("change", () => { GM_setValue("zyOcrMode", modeSel.value); setStatus("识别方式已切换为：" + (modeSel.value === "auto" ? "自动（本地优先）" : modeSel.value === "local" ? "仅本地" : "百度云端")); });
    const akInput = q("zy-baidu-ak");
    const skInput = q("zy-baidu-sk");
    const bs = q("zy-baidu-status");
    const saveBtn = q("zy-baidu-save");
    if (saveBtn) saveBtn.addEventListener("click", async () => {
      const ak = akInput ? akInput.value.trim() : "";
      const sk = skInput ? skInput.value.trim() : "";
      if (!ak && !sk) { setBaiduStatus(bs, "未输入新 Key，保持原样。"); return; }
      const res = await saveBaiduConfigPlain(ak, sk);
      if (!res.ok) { setBaiduStatus(bs, res.message); return; }
      if (akInput) akInput.value = "";
      if (skInput) skInput.value = "";
      setBaiduStatus(bs, "已保存（AES-256-GCM 加密存储，仅本机；Key 不显示完整）。");
      if (typeof onSaved === "function") onSaved();
    });
    const testBtn = q("zy-baidu-test");
    if (testBtn) testBtn.addEventListener("click", async () => {
      setBaiduStatus(bs, "正在测试连接…");
      const provider = makeBaiduProvider();
      if (!provider) { setBaiduStatus(bs, "百度 OCR 模块未加载"); return; }
      try {
        const tok = await provider.getToken();
        setBaiduStatus(bs, tok.ok ? "连接成功（有效 30 天，已缓存令牌）" : "连接失败：" + (tok.error ? tok.error.errorMessage : "未知错误"));
      } catch (e) {
        setBaiduStatus(bs, "连接异常：" + String(e && e.message || e).slice(0, 80));
      }
    });
  }

  function setBaiduStatus(node, text) {
    const n = node || document.getElementById("zy-baidu-status");
    if (n) n.textContent = text;
  }

  // ---- P4+（用户要求「百度 api 需要加密」）：凭据 AES-GCM 加密落库，明文不进 GM/日志/DOM/Git ----
  const CRED_CRYPTO = (typeof encryptSecret === "function") ? { encryptSecret: encryptSecret, decryptSecret: decryptSecret, isCiphertext: isCiphertext } : null;
  let baiduCfgCache = null; // 解密后的内存缓存 {ak, sk}
  const cryptoAvailable = () => typeof window !== "undefined" && window.crypto && window.crypto.subtle && CRED_CRYPTO;
  function credStorage() { return { get: (k) => GM_getValue(k, ""), set: (k, v) => GM_setValue(k, v) }; }
  async function loadBaiduConfig() {
    if (!cryptoAvailable()) { baiduCfgCache = null; return null; }
    const cryptoObj = window.crypto;
    const storage = credStorage();
    let ak = null, sk = null;
    const akC = GM_getValue("zyBaiduAkEnc", "");
    const skC = GM_getValue("zyBaiduSkEnc", "");
    if (CRED_CRYPTO.isCiphertext(akC)) ak = await CRED_CRYPTO.decryptSecret(cryptoObj, storage, akC);
    if (CRED_CRYPTO.isCiphertext(skC)) sk = await CRED_CRYPTO.decryptSecret(cryptoObj, storage, skC);
    // 旧明文兼容迁移：zyBaiduAk/zyBaiduSk → 加密后清明文
    if (!ak && GM_getValue("zyBaiduAk", "")) {
      ak = GM_getValue("zyBaiduAk", "");
      GM_setValue("zyBaiduAkEnc", await CRED_CRYPTO.encryptSecret(cryptoObj, storage, ak));
      GM_setValue("zyBaiduAk", "");
    }
    if (!sk && GM_getValue("zyBaiduSk", "")) {
      sk = GM_getValue("zyBaiduSk", "");
      GM_setValue("zyBaiduSkEnc", await CRED_CRYPTO.encryptSecret(cryptoObj, storage, sk));
      GM_setValue("zyBaiduSk", "");
    }
    baiduCfgCache = { ak: ak || "", sk: sk || "" };
    // 刷新输入框占位（掩码），保持同步
    const akLabel = "百度智能云 API Key（" + (baiduCfgCache.ak ? "已配置 " + maskKey(baiduCfgCache.ak) : "未配置") + "）";
    document.querySelectorAll("#zy-baidu-ak-native, #zy-baidu-ak").forEach((n) => { n.placeholder = akLabel; });
    return baiduCfgCache;
  }
  async function saveBaiduConfigPlain(ak, sk) {
    if (!cryptoAvailable()) return { ok: false, message: "当前环境不支持加密存储（WebCrypto 不可用），为保护凭据未保存" };
    const cryptoObj = window.crypto;
    const storage = credStorage();
    if (ak) GM_setValue("zyBaiduAkEnc", await CRED_CRYPTO.encryptSecret(cryptoObj, storage, ak));
    if (sk) GM_setValue("zyBaiduSkEnc", await CRED_CRYPTO.encryptSecret(cryptoObj, storage, sk));
    if (ak) GM_setValue("zyBaiduAk", "");
    if (sk) GM_setValue("zyBaiduSk", "");
    await loadBaiduConfig();
    return { ok: true, message: "" };
  }

  // ---- Stage 5.5B P2-B：原生右栏 OCR 面板（§14-§17，P2-A 审计结论：.rightPageBar.rightBar 稳定）----
  // 主 UI = 原生右栏邻接抽屉 + 右栏工具按钮；旧浮窗保留为 fallback（§16）。
  let nativeOcrMounted = false;
  let nativeObs = null;
  function renderNativeOcrDrawer() {
    const existing = document.getElementById("zy-native-ocr-panel");
    if (existing) return existing;
    const drawer = document.createElement("aside");
    drawer.id = "zy-native-ocr-panel";
    const akPlaceholder = "百度智能云 API Key（" + (baiduConfigured() ? "已配置 " + baiduAkMasked() : "未配置") + "）";
    drawer.innerHTML = `
      <div class="zy-head">
        <div class="zy-title">图片文字识别</div>
        <div class="zy-head-actions">
          <button class="zy-icon-btn" id="zy-native-close" title="收起">−</button>
        </div>
      </div>
      <div class="zy-body">
        <div class="zy-row">
          <label class="zy-label" for="zy-ocr-mode-native">识别方式</label>
          <select class="zy-input" id="zy-ocr-mode-native">
            <option value="auto" ${getOcrMode() === "auto" ? "selected" : ""}>自动（本地优先，失败时用百度云端）</option>
            <option value="local" ${getOcrMode() === "local" ? "selected" : ""}>仅本地（不联网）</option>
            <option value="baidu" ${getOcrMode() === "baidu" ? "selected" : ""}>百度云端</option>
          </select>
          <div class="zy-note">本地 OCR：图片不上传第三方。<br>百度 OCR：图片会发送到百度 OCR 服务识别。</div>
        </div>
        <button class="zy-btn" id="zy-native-ocr-btn">识别当前图片</button>
        <div class="zy-status" id="zy-native-status">就绪</div>
        <div class="zy-divider"></div>
        <details class="zy-settings">
          <summary>百度 OCR（云端备用）</summary>
          <div class="zy-settings-body">
            <div class="zy-row">
              <label class="zy-label" for="zy-baidu-ak-native">API Key</label>
              <input class="zy-input" id="zy-baidu-ak-native" type="password" placeholder="百度智能云 API Key（${akPlaceholder}）">
            </div>
            <div class="zy-row">
              <label class="zy-label" for="zy-baidu-sk-native">Secret Key</label>
              <input class="zy-input" id="zy-baidu-sk-native" type="password" placeholder="留空保持原样">
            </div>
            <div class="zy-actions two">
              <button class="zy-btn" id="zy-baidu-save-native">保存</button>
              <button class="zy-btn secondary" id="zy-baidu-test-native">测试连接</button>
            </div>
            <div class="zy-note" id="zy-baidu-status-native">凭据为客户端可访问凭据，仅存本机脚本配置；请勿使用高权限/长期/不可撤销的 Key。</div>
          </div>
        </details>
      </div>`;
    document.body.appendChild(drawer);
    // 绑定（suffix=-native，与浮窗共用 bindOcrControls 单一来源）
    const closeBtn = drawer.querySelector("#zy-native-close");
    if (closeBtn) closeBtn.addEventListener("click", () => { drawer.style.display = "none"; });
    const ocrBtn = drawer.querySelector("#zy-native-ocr-btn");
    if (ocrBtn) ocrBtn.addEventListener("click", handleOcrImage);
    bindOcrControls(drawer, "-native", null);
    return drawer;
  }

  function mountNativeOcrPanel() {
    const rightBar = document.querySelector(".rightPageBar.rightBar") || document.querySelector(".rightBar");
    // 无原生右栏（页面变体）→ 返回 false，由旧浮窗承担主 UI
    if (!rightBar) return false;
    const drawer = renderNativeOcrDrawer();
    if (!document.getElementById("zy-native-ocr-tool-btn")) {
      const tool = document.createElement("button");
      tool.id = "zy-native-ocr-tool-btn";
      tool.title = "图片文字识别";
      tool.textContent = "识";
      rightBar.appendChild(tool);
      tool.addEventListener("click", () => { drawer.style.display = drawer.style.display === "none" ? "flex" : "none"; });
    }
    nativeOcrMounted = true;
    return true;
  }

  // SPA 重渲染防护：rightBar 可能晚于 init 创建或被页面框架重建/移除，
  // observer 启动时先 ensure 一次，后续 mutation 再补挂（抽屉/按钮均幂等）。
  function observeNativeRemount() {
    if (nativeObs) return;
    const ensure = () => {
      const rightBar = document.querySelector(".rightPageBar.rightBar") || document.querySelector(".rightBar");
      if (rightBar && !document.getElementById("zy-native-ocr-panel")) renderNativeOcrDrawer();
      if (rightBar && !document.getElementById("zy-native-ocr-tool-btn")) mountNativeOcrPanel();
    };
    ensure();
    nativeObs = new MutationObserver(ensure);
    nativeObs.observe(document.body, { childList: true, subtree: true });
  }

  // ---- Stage 5.5B P1：识别图片文字（本地 Tesseract.js，经 page-world executor + DOM attr 桥接） ----
  // §52 状态机：IDLE → PREPARING → LOCAL_LOADING → LOCAL_RECOGNIZING → BUILDING → SUCCESS / ERROR
  const OCR_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
  const OCR_TIMEOUT_TRIES = 240; // 500ms × 240 ≈ 120s（§27 超时）
  let ocrRunning = false;
  let ocrEngineCache = null;
  let ocrTarget = null; // 本次 OCR 事务的目标图片 {obj, kind}，供重建时复用同一几何

  // §55 错误分类：给用户可操作的中文提示，而不是静默失败
  const OCR_ERR = {
    IMAGE_UNAVAILABLE: "未找到可识别的图片：请先在画布选中一张图片，或填充一张背景图",
    BACKGROUND_IMAGE_UNAVAILABLE: "背景图缺少图像数据，无法识别",
    CROSS_ORIGIN_IMAGE: "图片来自跨域，浏览器禁止读取像素；请使用画布内上传的图片",
    IMAGE_EXPORT_FAILED: "图片导出失败"
  };

  function ocrLog(stage, msg) {
    console.log("[zy-ocr][" + stage + "] " + msg);
  }

  // P1 根因（001-execution）：隔离世界读不到页面 world 的 requirejs 模块注册表（CanvasObjVO），
  // 因此画布/目标图一律改走 page-bridge（页面世界执行），禁止隔离世界直读画布。

  // 桥接只读调用：postMessage 请求 → 等页面 bridge 回传（Promise，支持超时）
  // 注：仅用于只读查询（probe/getCanvasInfo/ocrPrepare）；apply/ocrCreate 走既有专用 listener，避免双响应。
  function bridgeCall(type, timeoutMs) {
    const replyMap = { probe: "probeResult", getCanvasInfo: "getCanvasInfoResult", ocrPrepare: "ocrPrepareResult" };
    const replyType = replyMap[type] || (type + "Result");
    return new Promise((resolve) => {
      const on = (e) => {
        if (e.data && e.data.source === PAGE_SOURCE && e.data.type === replyType) {
          window.removeEventListener("message", on);
          resolve(e.data);
        }
      };
      window.addEventListener("message", on);
      window.postMessage({ source: BRIDGE_SOURCE, type: type }, location.origin);
      if (timeoutMs) setTimeout(() => { window.removeEventListener("message", on); resolve(null); }, timeoutMs);
    });
  }

  // waitForOcrTarget：canvas ready 后等待目标图可用（早期点击时模板图片可能尚未加载完成，§9/§12-§13）
  // 确定性失败（CROSS_ORIGIN/EXPORT_FAILED/背景缺数据）→ 立即返回；IMAGE_UNAVAILABLE → 轮询直到出现图片。
  async function waitForOcrTarget(maxMs) {
    const limit = maxMs || 12000;
    const t0 = Date.now();
    for (;;) {
      const prep = await bridgeCall("ocrPrepare", 2500);
      if (prep && prep.ok) return prep;
      if (prep && prep.code && prep.code !== "IMAGE_UNAVAILABLE" && prep.code !== "CANVAS_NOT_READY") return prep;
      if (Date.now() - t0 >= limit) return prep;
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  function waitForCanvasReady(maxMs) {
    // P0（真机反馈 2026-09-17）：30s 超时对慢加载的编辑器/多标签页不够，且无法区分
    // 「桥未注入/跨框架」与「画布对象确实未就绪」。改为 60s + 分级失败码，便于用户自救与日志诊断。
    const limit = maxMs || 60000;
    let sawNoReply = false; // 桥一次都没回 → 大概率未注入或画布在别的 frame
    return new Promise((resolve) => {
      const t0 = Date.now();
      const tick = async () => {
        const info = await bridgeCall("getCanvasInfo", 2500);
        if (info && info.ok) { resolve(info); return; }
        if (!info) sawNoReply = true; // 无任何响应（bridgeCall 超时返回 null）
        if (Date.now() - t0 >= limit) {
          // 分级失败码：无响应 → BRIDGE_NO_REPLY；有响应但非就绪 → CANVAS_NOT_FOUND
          resolve({ ok: false, code: sawNoReply ? "BRIDGE_NO_REPLY" : "CANVAS_NOT_FOUND" });
          return;
        }
        setTimeout(tick, 400);
      };
      tick();
    });
  }

  // ---- Stage 5.5B P4：百度云 OCR 逻辑（§40-§47，模式 LOCAL-FIRST + 云端 fallback）----
  const BAIDU_PROVIDER_GLOBAL = (typeof createBaiduProvider === "function") ? createBaiduProvider : null; // @require 注入
  function baiduStorage() {
    return { get: (k) => GM_getValue(k, ""), set: (k, v) => GM_setValue(k, v) };
  }
  // GM_xmlhttpRequest 封装成 provider 需要的 {request(method,url,opts)}
  function baiduTransport(method, url, opts) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: method, url: url,
        headers: (opts && opts.headers) || {},
        data: (opts && opts.body) || undefined,
        timeout: (opts && opts.timeout) || 30000,
        onload: (x) => resolve({ status: x.status, responseText: x.responseText }),
        onerror: () => reject(new Error("network error")),
        ontimeout: () => reject(new Error("timeout"))
      });
    });
  }
  // 图片压缩（§P4：>4096px 或 base64 >4M 时等比缩放 + JPEG 降质）
  function baiduResizeImage(dataUrl, spec) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (w > spec.maxSide || h > spec.maxSide) { const s = Math.min(spec.maxSide / w, spec.maxSide / h); w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s)); }
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        const g = cv.getContext("2d");
        g.drawImage(img, 0, 0, w, h);
        let out = cv.toDataURL("image/jpeg", 0.85);
        let q = 0.8;
        while (out.length > spec.maxBytes && q > 0.2) { out = cv.toDataURL("image/jpeg", q); q -= 0.15; }
        resolve(out);
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }
  function maskKey(v) { return v ? v.slice(0, 4) + "•".repeat(3) + "(" + v.length + "位)" : ""; }
  function baiduAkMasked() { return (baiduCfgCache && baiduCfgCache.ak) ? maskKey(baiduCfgCache.ak) : ""; }
  function baiduConfigured() {
    return !!((baiduCfgCache && baiduCfgCache.ak) && (baiduCfgCache && baiduCfgCache.sk));
  }
  function getOcrMode() {
    const m = GM_getValue("zyOcrMode", "auto");
    return m === "local" || m === "baidu" ? m : "auto";
  }
  function makeBaiduProvider() {
    if (!BAIDU_PROVIDER_GLOBAL) return null;
    return BAIDU_PROVIDER_GLOBAL({
      getConfig: () => ({ apiKey: (baiduCfgCache && baiduCfgCache.ak) || "", secretKey: (baiduCfgCache && baiduCfgCache.sk) || "" }),
      http: { request: baiduTransport },
      storage: baiduStorage(),
      resizeImage: baiduResizeImage
    });
  }
  // Stage 7.2：自动模式 fallback = Cloud PRIMARY → cloud 失败分类 → Local FALLBACK（§8.1）。
  // 决策复用 fallback-policy（@require 注入，与单测同源）；每次 OCR 输出诊断 {engine, attempt, fallback, reason}。
  const FALLBACK_POLICY = (typeof decideFallback === "function") ? decideFallback : null;
  function classifyBaiduError(code) {
    const s = String(code || "").toUpperCase();
    if (s.indexOf("TIMEOUT") >= 0) return "timeout";
    if (s.indexOf("TOKEN") >= 0 || s.indexOf("AUTH") >= 0 || s.indexOf("NOT_CONFIGURED") >= 0) return "auth-error";
    if (s.indexOf("NETWORK") >= 0 || s.indexOf("HTTP") >= 0 || s.indexOf("REMOTE") >= 0) return "http-error";
    if (s.indexOf("IMAGE") >= 0 || s.indexOf("INVALID") >= 0 || s.indexOf("LARGE") >= 0) return "invalid-result";
    if (s.indexOf("EMPTY") >= 0) return "empty-result";
    return "exception";
  }
  function emitOcrDiag(d) {
    try { ocrLog("DIAG", JSON.stringify(d)); } catch (e) {}
  }
  // 云端（Cloud Primary）失败 → Local FALLBACK：仅 auto 模式换路（manual local/baidu 一律 stop，§8.1）
  function maybeLocalFallback(img, failCode, failReason, attempt) {
    const att = attempt || "cloud-primary";
    const canonical = String(failCode).split(":")[0];
    const decision = FALLBACK_POLICY
      ? FALLBACK_POLICY({ mode: getOcrMode(), baiduEnabled: baiduConfigured(), failCode: canonical, failReason: failReason })
      : { action: getOcrMode() === "auto" ? "local" : "stop" };
    emitOcrDiag({ engine: "cloud", attempt: att, fallback: decision.action === "local", reason: failReason || null, failCode: canonical });
    if (decision.action !== "local") {
      ocrRunning = false; // manual 模式：不换路，明确报错
      setStatus("云端识别失败（" + (failReason || canonical) + "）：" + String(failCode || "").slice(0, 60));
      ocrLog("ERROR", "cloud failed mode=" + getOcrMode() + " reason=" + (failReason || "unknown") + " code=" + canonical);
      return;
    }
    setStatus("云端识别失败（" + (failReason || canonical) + "），已切换到本地识别…");
    ocrLog("FALLBACK", "cloud " + canonical + " (" + (failReason || "unknown") + ") → local");
    runLocalOcr(img, { engine: "local", attempt: "local-fallback", fallback: true, reason: null });
  }
  async function runBaiduOcr(img, diag) {
    // diag = {engine:"cloud", attempt:"cloud-primary"|"manual-baidu", fallback:false}
    const provider = makeBaiduProvider();
    if (!provider) { maybeLocalFallback(img, "CLOUD_MODULE_LOAD_FAILED", "exception", (diag && diag.attempt) || "cloud-primary"); return; }
    setStatus("百度云端识别中…");
    let res = null;
    try {
      res = await provider.recognize(img.dataUrl, { imageWidth: img.width, imageHeight: img.height });
    } catch (e) {
      maybeLocalFallback(img, "CLOUD_EXCEPTION", "exception", (diag && diag.attempt) || "cloud-primary");
      return;
    }
    if (res.error) {
      maybeLocalFallback(img, String(res.error.errorCode || "CLOUD_ERROR"), classifyBaiduError(res.error.errorCode), (diag && diag.attempt) || "cloud-primary");
      return;
    }
    // Stage 7.3（OCR 稳定化 §一/§二）：Cloud 结果在进入 pipeline 前必须通过质量门。
    // timeout/http-error/auth-error 已在上面处理；这里覆盖 empty / invalid-bbox /
    // low-confidence / abnormal。FAIL（含部分失败有效占比不足）→ Local FALLBACK，
    // 不让低质候选进入 TextBlock 与画布；PASS 时保留 dropped 作为诊断。
    const cloudQa = (typeof assessOcrCandidates === "function")
      ? assessOcrCandidates(res.candidates, { width: img.width, height: img.height })
      : { ok: true, reasonCode: null, total: (res.candidates || []).length, kept: res.candidates || [], dropped: [] };
    emitOcrDiag(Object.assign({}, diag, { reason: null, fallback: false, quality: { ok: cloudQa.ok, code: cloudQa.reasonCode || null, total: cloudQa.total, kept: (cloudQa.kept || []).length, dropped: (cloudQa.dropped || []).length } }));
    if (!cloudQa.ok) {
      ocrLog("QUALITY", "cloud quality fail code=" + (cloudQa.reasonCode || "invalid-result") + " total=" + cloudQa.total + " kept=0 reason=" + String(cloudQa.reason || "").slice(0, 120));
      maybeLocalFallback(img, cloudQa.reasonCode === "empty-result" ? "CLOUD_EMPTY" : "CLOUD_QUALITY_FAIL", cloudQa.reasonCode || "invalid-result", (diag && diag.attempt) || "cloud-primary");
      return;
    }
    const cloudKept = (cloudQa.kept && cloudQa.kept.length) ? cloudQa.kept : res.candidates;
    ocrLog("BAIDU_RECOGNIZING", "lines=" + res.candidates.length + " kept=" + cloudKept.length + " elapsed=" + res.meta.elapsed + "ms");
    // P3 边界：Baidu Provider 已是统一候选（含 bbox{x,y,width,height}），直接交给统一 Mapper（§39 解耦）
    // Stage 6.1：行级候选 → TextBlock（1 block = 1 textbox，§8）→ 统一 Mapper
    // 锁不在此释放：由 buildItemsFromOcr（ocrCreate 回复/超时/空结果）决定事务终态
    const lineCandidates = unifyCandidates(cloudKept, { width: img.width, height: img.height });
    const blocks = (typeof buildTextBlocks === "function") ? buildTextBlocks(lineCandidates) : (lineCandidates || []).map(oneLineBlock);
    buildItemsFromOcr(blocks, img, diag);
  }

  // 本地 Tesseract 执行器（manual local / auto 下 Cloud 失败后的 local-fallback 共用，§8.1）
  // executor 结构严格复刻 5.5A 已验证版本（node 复现：原 userscript 版尾部括号不平衡 → "Unexpected token ')'" → 脚本未执行 → 死等超时）
  async function runLocalOcr(img, diag) {
    setStatus("正在加载 OCR（首次约需下载 20MB 中文识别库，请耐心等待）…");
    const run = (engineText) => {
      const executor = "(function(){" +
        "var module={exports:{}};var exports=module.exports;var define;var require;" +
        engineText + "\n" +
        "var T=module.exports;" +
        "if(!T||typeof T.createWorker!=='function'){document.documentElement.setAttribute('data-zy-ocr-result',JSON.stringify({ok:false,err:'engine'}));return;}" +
        "window.addEventListener('message',function(ev){if(!ev.data||ev.data.source!=='zy-ocr-req')return;" +
        "T.createWorker('chi_sim',1,{cacheMethod:'indexeddb'}).then(function(w){return w.recognize(ev.data.dataUrl).then(function(r){" +
        "var lines=(r.data.lines||[]).map(function(l){return {text:l.text.trim(),bbox:l.bbox};});" +
        "var words=(r.data.words||[]).map(function(wo){return {text:(wo.text||'').trim(),bbox:wo.bbox,confidence:typeof wo.confidence==='number'?wo.confidence:null};}).filter(function(wo){return wo.text&&wo.bbox;});" +
        "w.terminate();" +
        "document.documentElement.setAttribute('data-zy-ocr-result',JSON.stringify({ok:true,lines:lines,words:words,w:r.data.imageWidth,h:r.data.imageHeight}));" +
        "});" +
        "}).catch(function(e){document.documentElement.setAttribute('data-zy-ocr-result',JSON.stringify({ok:false,err:String(e&&e.message||e).slice(0,120)}));});" +
        "});" +
        "})();";
      GM_addElement("script", { textContent: executor });
      document.documentElement.setAttribute("data-zy-ocr-result", "");
      window.postMessage({ source: "zy-ocr-req", dataUrl: img.dataUrl }, location.origin);
      setStatus("OCR 加载完成，正在识别（LOCAL_RECOGNIZING）…");
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
        const out = document.documentElement.getAttribute("data-zy-ocr-result");
        if (out) {
          clearInterval(timer);
          // 锁保持到 BUILDING/CREATING：释放收敛到 buildItemsFromOcr（回复/超时/空结果）及各错误终态
          try {
            const r = JSON.parse(out);
            if (!r.ok) {
              // 本地已是 manual/fallback 路径末端，无再上层 fallback → 终态报错
              ocrRunning = false; setStatus("OCR 失败：" + r.err); ocrLog("ERROR", "local ocr failed: " + r.err);
              emitOcrDiag(Object.assign({}, diag, { fallback: !!diag.fallback, reason: "exception", error: String(r.err).slice(0, 80) }));
              return;
            }
            ocrLog("LOCAL_RECOGNIZING", "lines=" + (r.lines || []).length + " words=" + (r.words || []).length + " image=" + r.w + "x" + r.h);
            emitOcrDiag(Object.assign({}, diag, { reason: null }));
            const size = { width: r.w || img.width, height: r.h || img.height };
            let unified = null;
            if (r.words && r.words.length && typeof aggregateLineCandidates === "function") {
              try {
                unified = aggregateLineCandidates(r.words, size, r.lines);
                if (!unified.length) {
                  ocrLog("GROUP", "empty aggregated words=" + r.words.length + " sampleKeys=" + JSON.stringify(Object.keys(r.words[0] || {})) + " bboxKeys=" + JSON.stringify(Object.keys((r.words[0] || {}).bbox || {})));
                  unified = null;
                }
              } catch (e) {
                ocrLog("ERROR", "grouping failed: " + String(e && e.message || e).slice(0, 120));
                unified = null;
              }
            }
            if (!unified) unified = unifyCandidates((r && r.lines) || [], size);
            if (unified && unified.length && typeof aggregateLineCandidates === "function") {
              ocrLog("GROUP", "lines=" + unified.length + " y=" + unified.map((l) => Math.round(l.bbox.y || 0)).join(",") + " h=" + unified.map((l) => Math.round(l.bbox.height || 0)).join(","));
            }
            // Stage 7.3（OCR 稳定化 §二）：本地结果同样过质量门（本地为 fallback 末端，
            // FAIL → 终态报错，不再换路；避免垃圾候选进入画布）
            const localQa = (typeof assessOcrCandidates === "function")
              ? assessOcrCandidates(unified, size)
              : { ok: true, reasonCode: null, total: (unified || []).length, kept: unified || [], dropped: [] };
            emitOcrDiag(Object.assign({}, diag, { fallback: !!diag.fallback, reason: localQa.ok ? null : (localQa.reasonCode || "invalid-result"), quality: { ok: localQa.ok, code: localQa.reasonCode || null, total: localQa.total, kept: (localQa.kept || []).length, dropped: (localQa.dropped || []).length } }));
            if (!localQa.ok) {
              ocrRunning = false;
              setStatus("本地识别结果未通过质量检查（" + String(localQa.reason || "invalid-result").slice(0, 80) + "），未生成文字");
              ocrLog("ERROR", "local quality fail code=" + (localQa.reasonCode || "invalid-result") + " total=" + localQa.total + " reason=" + String(localQa.reason || "").slice(0, 120));
              return;
            }
            const localKept = (localQa.kept && localQa.kept.length) ? localQa.kept : (unified || []);
            const blocks = (typeof buildTextBlocks === "function")
              ? buildTextBlocks(localKept)
              : (localKept || []).map(oneLineBlock);
            buildItemsFromOcr(blocks, img, diag);
          } catch (e) {
            ocrRunning = false; setStatus("OCR 结果解析失败"); ocrLog("ERROR", "parse: " + e);
            emitOcrDiag(Object.assign({}, diag, { fallback: !!diag.fallback, reason: "exception" }));
          }
        } else if (tries > OCR_TIMEOUT_TRIES) {
          clearInterval(timer); ocrRunning = false; setStatus("OCR 超时（超过 120 秒），请稍后重试"); ocrLog("ERROR", "timeout");
          emitOcrDiag(Object.assign({}, diag, { fallback: !!diag.fallback, reason: "timeout" }));
        }
      }, 500);
    };
    if (ocrEngineCache) { run(ocrEngineCache); return; }
    GM_xmlhttpRequest({ method: "GET", url: OCR_CDN, timeout: 45000, onload: (x) => { if (x.status >= 200 && x.status < 300 && x.responseText && x.responseText.length > 1000) { ocrEngineCache = x.responseText; ocrLog("LOCAL_LOADING", "engine downloaded " + x.responseText.length + " chars"); run(ocrEngineCache); } else { ocrRunning = false; setStatus("OCR 引擎加载失败（HTTP " + x.status + "）"); emitOcrDiag(Object.assign({}, diag, { fallback: !!diag.fallback, reason: "http-error", error: "engine load http " + x.status })); } }, onerror: () => { ocrRunning = false; setStatus("OCR 引擎网络错误"); ocrLog("ERROR", "network error"); emitOcrDiag(Object.assign({}, diag, { fallback: !!diag.fallback, reason: "http-error", error: "engine load network" })); } });
  }
  async function handleOcrImage() {
    if (state.ocrPanelClosed) return;
    if (ocrRunning) { setStatus("OCR 正在运行，请稍候…"); return; }
    ocrRunning = true;
    try {
      // §9 情况 B：用户过早点击 → 明确 UI 状态「正在等待编辑器加载…」→ canvas ready 后自动继续
      setStatus("正在等待编辑器加载…");
      const info = await waitForCanvasReady(60000);
      if (!info || !info.ok) {
        // P0（真机反馈）：失败时再尝试注入一次桥，并区分「依赖模块未加载」vs「桥无响应/跨框架」
        if (!info || info.code === "BRIDGE_NO_REPLY") {
          if (typeof pageBridge !== "function") {
            setStatus("脚本依赖加载失败：核心模块 page-bridge.js 未加载（@require 下载失败，常见于网络代理/拦截）。请在脚本管理器中删除本脚本后，重新从固定安装地址安装；仍失败请改用 Chrome 扩展版。");
            ocrLog("ERROR", "bridge module missing (pageBridge typeof=" + typeof pageBridge + ")");
          } else {
            // P0（真机第 3 轮）：模块在但无 getCanvasInfo 回复 → 分类必须在重试注入【之前】做：
            //   probe 有回复 → 本窗口桥活着但缺画布能力 = @require 缓存旧 page-bridge → 删除重装；
            //   probe 无回复 → 本窗口无桥监听 = 画布在 iframe / 未注入 → 跨框架 / 重装。
            const probe = await bridgeCall("probe", 2500);
            const marker = window.__ZY_CARD_ASSISTANT_BRIDGE__;
            if (probe && probe.ok) {
              setStatus("检测到旧版桥接缓存：脚本内的核心桥（page-bridge）版本过旧，缺少画布读取能力。解决方法：在脚本管理器中【删除本脚本】，然后重新从固定安装地址安装（仅点“更新”可能仍用旧缓存）；安装后刷新页面再试。");
            } else {
              setStatus("页面桥接无响应（画布可能在独立 iframe 中，当前版本暂不支持跨框架定位）：请刷新页面；仍不行请在脚本管理器中删除本脚本后重新安装，并确认脚本处于启用状态。");
              installPageBridge(); // 幂等：无桥场景补一次注入（仅作辅助，不改变判定）
            }
            ocrLog("ERROR", "bridge no reply probe=" + String(!!(probe && probe.ok)) + " marker=" + String(!!(marker && marker.installed)));
          }
        } else {
          setStatus("设计编辑器尚未加载出画布（等待 60 秒超时）。请确认当前是设计编辑页（不是模板/列表页）且页面已加载完，再点一次「识别当前图片」；仍不行请刷新页面。");
          ocrLog("ERROR", "canvas not found after 60s");
        }
        ocrRunning = false;
        return;
      }
      ocrLog("CANVAS_READY", "w=" + info.width + "x" + info.height + " objs=" + info.objs + " bg=" + info.bgImage + " active=" + info.activeType);
      // §52 PREPARING：页面世界解析目标图（active → 背景图 → 首图）并提取 dataUrl + 几何
      setStatus("正在准备图片…");
      const prep = await waitForOcrTarget(12000);
      if (!prep || !prep.ok) {
        const code = (prep && prep.code) || "CANVAS_NOT_READY";
        const msg = (prep && prep.message) || "图片准备失败";
        if (code === "IMAGE_UNAVAILABLE") setStatus(OCR_ERR.IMAGE_UNAVAILABLE);
        else setStatus(msg);
        ocrLog("ERROR", "ocrPrepare: " + code + " - " + msg);
        ocrRunning = false;
        return;
      }
      ocrLog("PREPARING", "kind=" + prep.kind + " " + prep.width + "x" + prep.height + " dataUrl=" + prep.dataUrl.length + " chars");
      ocrTarget = { kind: prep.kind, geo: prep.geometry };
      const img = { dataUrl: prep.dataUrl, width: prep.width, height: prep.height };
      const mode = getOcrMode();
      if (mode === "baidu") {
        // Stage 7.2：manual baidu → 仅 Cloud（无本地 fallback，§8.1）
        setStatus("百度云端识别中…");
        runBaiduOcr(img, { engine: "cloud", attempt: "manual-baidu", fallback: false })
          .catch((e) => { ocrRunning = false; setStatus("百度识别异常：" + String(e && e.message || e).slice(0, 80)); ocrLog("ERROR", "baidu unexpected: " + e); });
        return;
      }
      if (mode === "local") {
        // Stage 7.2：manual local → 仅 Local（无云端 fallback，§8.1）
        runLocalOcr(img, { engine: "local", attempt: "manual-local", fallback: false });
        return;
      }
      // Stage 7.2：auto → Cloud PRIMARY（失败 → Local FALLBACK，见 maybeLocalFallback）
      setStatus("百度云端识别中…");
      runBaiduOcr(img, { engine: "cloud", attempt: "cloud-primary", fallback: false })
        .catch((e) => { maybeLocalFallback(img, "CLOUD_EXCEPTION", "exception", "cloud-primary"); });
      return;
    } catch (e) {
      ocrRunning = false;
      setStatus("识别异常：" + String(e && e.message || e).slice(0, 100));
      ocrLog("ERROR", "handleOcrImage unexpected: " + e);
    }
  }
  // Stage 6.1：行级候选 → 单行 TextBlock 的兜底包装（buildTextBlocks 模块缺失/异常时使用，行为等同旧版逐行）
  function oneLineBlock(c) {
    return {
      lines: [{ text: c.text, bbox: c.bbox, confidence: c.confidence, wordBoxes: c.wordBoxes || [] }],
      text: c.text,
      bbox: c.bbox,
      center: { x: c.bbox.x + c.bbox.width / 2, y: c.bbox.y + c.bbox.height / 2 },
      confidence: c.confidence,
      wordBoxes: c.wordBoxes || [],
      lineBoxes: [c.bbox],
      lineCount: 1,
      coordinateSpace: "image-pixel",
      imageSize: c.imageSize || null
    };
  }

  // Stage 6.1 §10：fontSize 标定 —— 真机标定（stage-5-6-font-calibration）：视觉字高 / fontSize ≈ 0.937~0.99（mean 0.969）
  // → fontSize = 视觉字高 ÷ 0.969（禁止直接 fontSize = bbox.height 作为最终公式）
  const FONT_HEIGHT_RATIO = 0.969;
  // Stage 6.1 §13：多行 textbox 高度须容纳 lineCount×lineHeight（无参考样式的默认行高系数）
  const FONT_LINE_HEIGHT = 1.3;

  function buildItemsFromOcr(blocks, img, diag) {
    // Stage 6.1：消费 TextBlock（1 TextBlock = 1 textbox，§8 硬规则）。
    // block 结构：{text(含\n), bbox, center, confidence, wordBoxes, lineBoxes, lineCount, coordinateSpace}
    // 几何来自 ocrPrepare（页面世界已解析，隔离世界不直读画布）。P3：只消费统一候选边界。
    const geo = ocrTarget && ocrTarget.geo;
    if (!geo) { setStatus("OCR 目标已失效，请重新识别"); ocrLog("ERROR", "ocrTarget missing"); ocrRunning = false; return; }
    const w = geo.width, h = geo.height, sx = geo.scaleX || 1, sy = geo.scaleY || 1;
    // 背景图 left/top 可能缺失：ocrPrepare 已在页面世界用画布居中兜底（§13）
    const left = geo.left, top = geo.top;
    const angle = geo.angle || 0;
    const rad = (angle * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    const cx = left + (w * sx) / 2, cy = top + (h * sy) / 2;
    // 输出指标（§22）：forced wrapped 逻辑行数、多行 block 数
    let forcedWrapTotal = 0, multiLineTotal = 0;
    const items = (blocks || []).filter((b) => b && b.bbox && typeof b.bbox.x === "number" && b.bbox.width > 0).map((b, bi) => {
      const bw = b.bbox.width * sx, bh = b.bbox.height * sy;
      // §10：视觉字高 → fontSize 标定（取 block 内行高均值；多行 block 以行高为基准而非整块高度）
      let lineHSum = 0;
      (b.lines || []).forEach((l) => { if (l && l.bbox && l.bbox.height > 0) lineHSum += l.bbox.height; });
      const avgLineH = (b.lines && b.lines.length && lineHSum > 0) ? lineHSum / b.lines.length : bh;
      const fs = Math.max(10, Math.min(160, Math.round((avgLineH * sy) / FONT_HEIGHT_RATIO)));
      // §11/§12：textbox layoutWidth —— 优先真实文本测量（字号标定+字符宽度估计+安全余量），
      // 宽度 = clamp(max(60, 视觉宽, 最长行估计宽+margin), ≤4000)，OCR 原始单行不得因宽度不足再换行
      const textLines = String(b.text || "").split("\n").filter((t) => t !== "");
      const layout = (typeof estimateTextLayout === "function")
        ? estimateTextLayout(textLines, fs, { minWidth: Math.max(60, bw + 8), maxWidth: 4000, margin: Math.max(10, Math.round(fs * 0.35)) })
        : { layoutWidth: Math.max(60, bw + 8), perLine: textLines.map((t) => ({ text: t, estimatedWidth: 0, needsWrap: false })), forcedWrapDetected: false, estimatedFinalLineCount: textLines.length };
      if (layout.forcedWrapDetected) forcedWrapTotal += 1;
      if (textLines.length > 1) multiLineTotal += 1;
      // §18：换行诊断字段（sourceLineCount = OCR 原始逻辑行；forcedWrapDetected = 存在源单行放不下）
      const diagnostics = {
        sourceLineCount: textLines.length,
        estimatedFinalLineCount: layout.estimatedFinalLineCount,
        forcedWrapDetected: layout.forcedWrapDetected,
        layoutWidth: layout.layoutWidth,
        perLineWidth: layout.perLine.map((p) => ({ text: String(p.text).slice(0, 12), width: p.estimatedWidth, needsWrap: !!(p.needsWrap) }))
      };
      // §14：几何模型 —— 水平文本 left/top；θ≠0 旋转文本 center/angle（保留 P5 rotation 行为，零变化）
      const ux = b.bbox.x / w - 0.5, uy = b.bbox.y / h - 0.5;
      const dx = ux * w * sx, dy = uy * h * sy;
      const px = cx + dx * cos - dy * sin, py = cy + dx * sin + dy * cos;
      const base = { text: b.text, blockIndex: bi, fontFamily: "思源黑体 Regular", diagnostics: diagnostics };
      // §13：textbox height 须容纳 lineCount×lineHeight（禁止只用单行 OCR bbox.height）
      const boxHeight = Math.round(textLines.length * fs * FONT_LINE_HEIGHT + 8);
      if (!angle) {
        return Object.assign({}, base, { left: px - 4, top: py - 4, width: layout.layoutWidth, fontSize: fs, height: boxHeight });
      }
      const ucx = (b.bbox.x + b.bbox.width / 2) / w - 0.5;
      const ucy = (b.bbox.y + b.bbox.height / 2) / h - 0.5;
      const dcx = ucx * w * sx, dcy = ucy * h * sy;
      const pcx = cx + dcx * cos - dcy * sin, pcy = cy + dcx * sin + dcy * cos;
      return Object.assign({}, base, { left: pcx, top: pcy, angle: angle, origin: "center", width: layout.layoutWidth, fontSize: fs, height: boxHeight });
    });
    if (!items.length) {
      // 空结果：Cloud Primary 阶段空 → 转 Local FALLBACK；本地（manual/fallback）空 → 终态报错
      if (img && !img._cloudFallbackDone && diag && diag.engine === "cloud" && diag.attempt === "cloud-primary") {
        img._cloudFallbackDone = true;
        maybeLocalFallback(img, "CLOUD_EMPTY", "empty-result", "cloud-primary");
        return;
      }
      setStatus("未识别到文字");
      ocrLog("ERROR", "no lines recognized");
      ocrRunning = false; // 空结果终态
      emitOcrDiag(Object.assign({}, diag || { engine: "unknown", attempt: "unknown", fallback: false }, { fallback: !!(diag && diag.fallback), reason: "empty-result" }));
      return;
    }
    setStatus("识别到 " + items.length + " 个文字区域，正在生成（BUILDING）…");
    ocrLog("BUILDING", "blocks=" + items.length + " forcedWrap=" + forcedWrapTotal + " multiLine=" + multiLineTotal);
    // P0（真机 BUILDING 卡死）：页面桥异常时兜底，10 秒内未收到 ocrCreateResult 即走出死等状态
    const on = (e) => {
      if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === "ocrCreateResult") {
        clearTimeout(fallbackTimer); window.removeEventListener("message", on); ocrRunning = false; // 事务终态 DONE/生成失败（含回滚）
        // Stage 6 P0（编辑器接入诊断 §18）：仅记录计数与原生 API 可用性，禁止输出对象/文本内容
        const integ = e.data.editorIntegration || {};
        if (e.data.ok) {
          setStatus("已生成 " + (e.data.created || []).length + " 个文字（可双击编辑）");
          ocrLog("SUCCESS", "created=" + (e.data.created || []).length + "/" + (e.data.detectedBlocks || 0) + " editorInteg=" + JSON.stringify({ undo: !!integ.nativeUndoFound, savePre: !!integ.undoSavePre, savePost: !!integ.undoSavePost, ident: integ.identityApplied, uv4: integ.uv4Total, layerMax: integ.layerMax }));
        } else {
          setStatus("生成失败：" + (e.data.message || "未创建文字") + (e.data.failedBlockIndex != null ? "（第 " + e.data.failedBlockIndex + " 个失败，已回滚）" : ""));
          ocrLog("ERROR", "ocrCreate failed created=" + (e.data.created || []).length + " detected=" + (e.data.detectedBlocks || 0) + " failedIdx=" + (e.data.failedBlockIndex != null ? e.data.failedBlockIndex : "n/a") + " msg=" + String(e.data.message || "").slice(0, 120));
        }
      }
    };
    const fallbackTimer = setTimeout(() => { window.removeEventListener("message", on); ocrRunning = false; setStatus("生成文字超时（页面桥未能确认结果）：请查看浏览器控制台报错并反馈开发者（错误码 ocrCreate-reply-timeout）。"); ocrLog("ERROR", "ocrCreate reply timeout"); }, 10000);
    window.addEventListener("message", on);
    window.postMessage({ source: "zy-card-assistant", type: "ocrCreate", items: items }, location.origin);
    // 事务结束：释放 ocrTarget，避免下次识别串用旧目标
    ocrTarget = null;
  }

  function readSideTextFromPanel() {
    const frontNode = document.querySelector('#zy-side-texts [data-side-text="front"]');
    const backNode = document.querySelector('#zy-side-texts [data-side-text="back"]');
    state.frontText = frontNode ? frontNode.value.trim() : state.frontText;
    state.backText = backNode ? backNode.value.trim() : state.backText;
  }

  function renderSideTextArea() {
    const box = document.getElementById("zy-side-texts");
    if (box) box.innerHTML = renderSideTextInputs();
  }

  function rebuildFieldsFromSideText() {
    readSideTextFromPanel();
    state.fields = parseByRulesFromSides(state.frontText, state.backText);
    renderFieldArea();
  }

  function applySavedPanelPosition(panel) {
    const left = GM_getValue("zyPanelLeft", null);
    const top = GM_getValue("zyPanelTop", null);
    if (left == null || top == null) return;
    panel.style.left = clamp(Number(left), 8, window.innerWidth - 80) + "px";
    panel.style.top = clamp(Number(top), 8, window.innerHeight - 44) + "px";
    panel.style.right = "auto";
  }

  function makeDraggable(panel) {
    const head = panel.querySelector(".zy-head");
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    head.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      dragging = true;
      const rect = panel.getBoundingClientRect();
      startX = event.clientX;
      startY = event.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      head.setPointerCapture(event.pointerId);
    });

    head.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const left = clamp(startLeft + event.clientX - startX, 8, window.innerWidth - 80);
      const top = clamp(startTop + event.clientY - startY, 8, window.innerHeight - 44);
      panel.style.left = left + "px";
      panel.style.top = top + "px";
      panel.style.right = "auto";
    });

    head.addEventListener("pointerup", (event) => {
      if (!dragging) return;
      dragging = false;
      const rect = panel.getBoundingClientRect();
      GM_setValue("zyPanelLeft", Math.round(rect.left));
      GM_setValue("zyPanelTop", Math.round(rect.top));
      try { head.releasePointerCapture(event.pointerId); } catch (_error) {}
    });
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  async function parseFields(options) {
    const panel = document.getElementById("zy-card-assistant");
    const rawText = panel.querySelector("#zy-raw").value.trim();
    const persisted = getConfig();
    const config = {
      apiKey: panel.querySelector("#zy-api-key").value.trim() || persisted.apiKey,
      baseUrl: persisted.baseUrl,
      model: panel.querySelector("#zy-model").value.trim() || persisted.model
    };
    saveConfig(config);

    if (!rawText) {
      setStatus("请先粘贴客户文字。");
      return;
    }

    setBusy(true);
    try {
      const sideText = config.apiKey ? await splitSidesByDoubao(rawText, config) : splitFrontBackText(rawText);
      state.frontText = sideText.front || "";
      state.backText = sideText.back || "";
      renderSideTextArea();
      const ruleResult = parseByRulesFromSides(state.frontText, state.backText);
      const aiResult = config.apiKey ? await parseByDoubao(state.frontText, state.backText, ruleResult, config) : {};
      const parsed = mergeFields(ruleResult, aiResult, rawText);
      state.fields = options.append ? mergeTwoFields(state.fields, parsed) : parsed;
      renderFieldArea();
      setStatus(options.append ? "追加完成。" : "识别完成。");
      if (options.apply) applyFieldsToPage(state.fields, options.apply);
    } catch (error) {
      const sideText = splitFrontBackText(rawText);
      state.frontText = sideText.front || "";
      state.backText = sideText.back || "";
      renderSideTextArea();
      const parsed = normalizeFields(parseByRulesFromSides(state.frontText, state.backText));
      state.fields = options.append ? mergeTwoFields(state.fields, parsed) : parsed;
      renderFieldArea();
      setStatus("AI 识别失败，已使用本地规则识别。\n" + String(error && error.message ? error.message : error));
      if (options.apply) applyFieldsToPage(state.fields, options.apply);
    } finally {
      setBusy(false);
    }
  }

  function renderFieldArea() {
    const box = document.getElementById("zy-fields");
    if (box) box.innerHTML = renderFieldInputs(state.fields);
  }

  function setBusy(busy) {
    state.busy = busy;
    document.querySelectorAll("#zy-card-assistant button").forEach((btn) => {
      if (!btn.classList.contains("zy-icon-btn")) btn.disabled = busy;
    });
  }

  function setStatus(text) {
    state.logs = String(text || "").split("\n").filter(Boolean).slice(-8);
    const value = state.logs.join("\n");
    // 双显示目标：浮窗 #zy-status 与原生抽屉 #zy-native-status（均带 .zy-status 类）
    document.querySelectorAll(".zy-status").forEach((node) => { node.textContent = value; });
  }

  function readFieldsFromPanel() {
    const fields = emptyFields();
    document.querySelectorAll("#zy-fields [data-field]").forEach((node) => {
      const key = node.getAttribute("data-field");
      if (Array.isArray(fields[key])) fields[key] = splitList(node.value);
      else fields[key] = clean(node.value);
    });
    state.fields = normalizeFields(fields);
  }

  function parseByRules(raw) {
    const text = String(raw || "").replace(/\r/g, "\n");
    const split = splitFrontBackText(text);
    return parseByRulesFromSides(split.front, split.back);
  }

  function splitFrontBackText(raw) {
    const lines = String(raw || "").replace(/\r/g, "\n").split(/\n+/).map(clean).filter(Boolean);
    const explicit = splitByExplicitMarkers(lines);
    const pool = explicit.remaining;
    const front = explicit.front.slice();
    const back = explicit.back.slice();
    const used = {};

    pool.forEach((line) => {
      if (isStrongFrontLine(line)) {
        front.push(line);
        used[line] = true;
      }
    });

    pool.forEach((line) => {
      if (used[line]) return;
      if (isStrongBackLine(line)) {
        back.push(line);
        used[line] = true;
      }
    });

    pool.forEach((line) => {
      if (used[line]) return;
      if (isLikelyBackLine(line, front, back)) back.push(line);
      else front.push(line);
    });

    return {
      front: unique(front).join("\n"),
      back: unique(back).join("\n")
    };
  }

  function splitByExplicitMarkers(lines) {
    const front = [];
    const back = [];
    const remaining = [];
    let side = "";

    lines.forEach((line) => {
      if (/^(正面|正面内容)[:：]?$/i.test(line)) {
        side = "front";
        return;
      }
      if (/^(反面|背面|反面内容|背面内容)[:：]?$/i.test(line)) {
        side = "back";
        return;
      }
      if (/^(正面|正面内容)[:：]/i.test(line)) {
        side = "front";
        const text = clean(line.replace(/^(正面|正面内容)[:：]/i, ""));
        if (text) front.push(text);
        return;
      }
      if (/^(反面|背面|反面内容|背面内容)[:：]/i.test(line)) {
        side = "back";
        const text = clean(line.replace(/^(反面|背面|反面内容|背面内容)[:：]/i, ""));
        if (text) back.push(text);
        return;
      }

      if (side === "front") front.push(line);
      else if (side === "back") back.push(line);
      else remaining.push(line);
    });

    return { front: front, back: back, remaining: remaining };
  }

  function isStrongFrontLine(value) {
    const text = clean(value);
    if (!text) return false;
    // 主营范围/公司简介/产品中心这类行语义上属于反面，绝不强判为正面。
    if (isBusinessLine(text) || isBackExtraLine(text)) return false;
    if (isCompanyLine(text)) return true;
    if (isAddressLine(text)) return true;
    if (PHONE_BOUND_RE.test(text)) return true;
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) return true;
    if (/(微信|wechat|wx|微信号|网址|网站|web|www\.|https?:\/\/)/i.test(text)) return true;
    if (/(销售经理|客户经理|业务经理|总经理|经理|主管|总监|工程师|负责人|业务员|销售|Sales Manager|Manager|Director|Engineer)/i.test(text)) return true;
    if (/^[\u4e00-\u9fa5]{2,4}$/.test(text)) {
      return !isNameExcluded(text);
    }
    return false;
  }

  function isStrongBackLine(value) {
    const text = clean(value);
    if (!text) return false;
    if (isStrongFrontLine(text)) return false;
    if (isBusinessLine(text)) return true;
    if (isBackExtraLine(text)) return true;
    return false;
  }

  function isLikelyBackLine(value, front, back) {
    const text = clean(value);
    if (!text) return false;
    if (isStrongFrontLine(text)) return false;
    if (isStrongBackLine(text)) return true;
    if (isLongBackText(text)) return true;
    if (!back.length && front.length < 2) return false;
    return false;
  }

  function isFrontPriorityLine(value) {
    return isStrongFrontLine(value);
  }

  function isCompanyLine(value) {
    const text = clean(value);
    if (!text) return false;
    if (isAddressLine(text) || isBusinessLine(text)) return false;
    if (/公司|集团|科技|贸易|实业|有限公司|有限责任公司|厂/.test(text) && /[\u4e00-\u9fa5]/.test(text)) return true;
    if (/\b(CO\.?|COMPANY|LTD\.?|LIMITED|TRADING|TECH|TECHNOLOGY|GROUP|INDUSTRY|INDUSTRIAL|HOLDINGS?)\b/i.test(text) && /[A-Z]/i.test(text)) return true;
    return false;
  }

  function parseByRulesFromSides(frontText, backText) {
    const frontRaw = String(frontText || "").replace(/\r/g, "\n");
    const backRaw = String(backText || "").replace(/\r/g, "\n");
    const text = [frontRaw, backRaw].filter(Boolean).join("\n");
    const frontLines = frontRaw.split(/\n+/).map(clean).filter(Boolean);
    const backLines = backRaw.split(/\n+/).map(clean).filter(Boolean);
    const lines = frontLines.concat(backLines);
    const result = emptyFields();

    result.phones = unique(Array.from(text.matchAll(PHONE_BOUND_RE_G)).map((match) => match[1]));
    result.emails = unique(Array.from(text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)).map((match) => match[0]));

    const websiteMatches = Array.from(text.matchAll(/(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+\S*/gi));
    result.websites = unique(websiteMatches.map((match) => {
      const value = match[0].replace(/[，。,;；]+$/, "");
      return result.emails.some((email) => email.includes(value)) ? "" : value;
    }).filter(Boolean));

    result.wechats = unique([].concat(frontLines, backLines).filter((line) => /微信|wechat|wx/i.test(line)).map((line) => {
      return clean(line.replace(/^(微信|wechat|wx|微信号)[:：]?\s*/i, ""));
    }).filter(Boolean));

    const businessLines = [];
    const backExtraLines = [];
    const titleWords = /(销售经理|客户经理|业务经理|总经理|经理|主管|总监|工程师|负责人|业务员|销售|Sales Manager|Manager|Director|Engineer)/i;
    // B5：中文公司名从候选中择优：优先“有限公司/集团”结尾、行文完整且不带部门杂质的行。
    const companyCandidates = frontLines.filter((line) => isCompanyLine(line) && /[\u4e00-\u9fa5]/.test(line));
    if (companyCandidates.length) {
      const rankCompany = (line) => (/有限公司/.test(line) ? 4 : 0) + (/集团$/.test(line) ? 3 : 0) + (/公司$/.test(line) ? 2 : 0) + (line.length <= 24 ? 2 : 0) + (/(部|中心|办事处)$/.test(line) ? -2 : 0);
      companyCandidates.sort((a, b) => rankCompany(b) - rankCompany(a));
      result.company_cn = stripTrailingDept(companyCandidates[0]);
    }
    frontLines.forEach((line) => {
      if (!result.company_en && /\b(CO\.?|COMPANY|LTD\.?|LIMITED|TRADING|TECH|TECHNOLOGY|GROUP)\b/i.test(line) && /[A-Z]/i.test(line)) result.company_en = line;
      if (!result.title && titleWords.test(line)) result.title = line.match(titleWords)[0];
      if (isAddressLine(line)) result.addresses.push(stripLabel(line));
    });

    backLines.forEach((line) => {
      if (isBusinessLine(line)) businessLines.push(stripBusinessLabel(line));
      else if (isBackExtraLine(line) || isLongBackText(line)) backExtraLines.push(stripBackExtraLabel(line));
    });

    const ignored = [].concat(result.phones, result.emails, result.websites, result.wechats, result.addresses, [result.company_cn, result.company_en]);
    for (const line of frontLines) {
      if (ignored.some((item) => item && line.includes(item))) continue;
      const isPureChineseName = /^[\u4e00-\u9fa5]{2,4}$/.test(line) && !titleWords.test(line) && !isBusinessLine(line) && !isBackExtraLine(line) && !isNameExcluded(line);
      if (!result.name && isPureChineseName) result.name = line;
      const nameTitle = line.match(/^([\u4e00-\u9fa5]{2,4})\s+(.+)$/);
      if (!result.name && nameTitle && titleWords.test(nameTitle[2]) && !isNameExcluded(nameTitle[1])) {
        result.name = nameTitle[1];
        result.title = result.title || nameTitle[2];
      }
    }

    const businessStart = backLines.findIndex((line) => isBusinessLine(line));
    if (businessStart >= 0) {
      result.business = backLines.slice(businessStart)
        .join("；")
        .split(/；|;|、|，|,/)
        .map(stripBusinessLabel)
        .filter((item) => item && !isAddressLine(item));
    }
    result.business = unique([].concat(businessLines, result.business).filter((item) => !isAddressLine(item)));
    result.back_extra = unique(backExtraLines.filter((item) => !isAddressLine(item) && !isBusinessLine(item)));

    result.addresses = unique(result.addresses.filter((item) => isAddressLine(item) && !isBusinessLine(item)));
    return normalizeFields(result);
  }

  // 以下纯函数已迁移至 field-core（@require 首行加载），行为与本模块 scope 内同名单函数完全一致：
  // stripLabel / stripTrailingDept / stripBusinessLabel / stripBackExtraLabel /
  // NAME_EXCLUDED_RE / isNameExcluded / isAddressLine / isBusinessLine / isBackExtraLine

  function isLongBackText(value) {
    const text = clean(value);
    if (!text || text.length < 18) return false;
    if (isAddressLine(text)) return false;
    if (PHONE_BOUND_RE.test(text)) return false;
    if (/@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) return false;
    return /[，。；、,.]/.test(text) || /我们|本公司|专业|提供|承接|多年|欢迎|诚信|品质|服务/.test(text);
  }

  function splitSidesByDoubao(rawText, config) {
    const fallback = splitFrontBackText(rawText);
    const prompt = [
      "你要先把客户整段名片文字粗分成正面文本和反面文本。",
      "只返回严格 JSON，不要 Markdown。",
      "JSON 格式固定为：{\"front\":\"...\",\"back\":\"...\"}",
      "front 放姓名、职位、公司、电话、微信、邮箱、网址、地址等适合正面的内容。",
      "中文公司名和英文公司名都必须放在 front，绝对不要放到 back，即使它们出现在全文靠后位置。",
      "back 放主营范围、公司简介、优势、承诺、二维码提示、宣传语等适合反面的内容。",
      "如果无法确定，联系方式和地址优先放 front；主营范围和成段说明优先放 back。",
      "不要因为某一行紧跟在主营范围后面，就把公司名误放到 back。",
      "不要虚构内容，不要改写原文，只做粗分配。",
      "",
      "本地规则粗分结果：",
      JSON.stringify(fallback, null, 2),
      "",
      "客户全文：",
      rawText
    ].join("\n");

    // Stage 2：走统一 AI Transport（ai-client），Prompt/响应语义/fallback 不变
    return aiRequest({
      url: buildChatUrl(config.baseUrl),
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + config.apiKey
      },
      data: JSON.stringify({
        model: config.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "你是文本分面程序。必须只返回可被 JSON.parse 解析的 JSON 对象，禁止解释、Markdown、示例和虚构内容。" },
          { role: "user", content: prompt }
        ]
      }),
      timeout: 30000,
      operation: "splitSides"
    }).then((result) => {
      if (!result.ok) throwAiError(result);
      const content = result.body && result.body.choices && result.body.choices[0] && result.body.choices[0].message && result.body.choices[0].message.content;
      const parsed = parseJsonFromText(content || "{}");
      return {
        front: cleanMultiline(parsed.front || fallback.front || ""),
        back: cleanMultiline(parsed.back || fallback.back || "")
      };
    });
  }

  function parseByDoubao(frontText, backText, ruleResult, config) {
    const prompt = [
      "你是名片资料字段识别助手。请根据已经粗分好的正面文本和反面文本提取字段，只输出严格 JSON，不要 Markdown。",
      "JSON 字段固定为：company_cn, company_en, name, title, phones, wechats, emails, websites, addresses, business, back_extra。",
      "phones, wechats, emails, websites, addresses, business, back_extra 都必须是字符串数组。没有的信息填空字符串或空数组。",
      "frontText 是正面内容来源，backText 是反面内容来源。",
      "company_cn 和 company_en 优先从 frontText 提取，不要从 backText 误提。",
      "不要把 backText 里的主营范围塞到 addresses，也不要把 frontText 里的地址塞到 business。",
      "addresses 只允许放真实地址，例如包含省、市、区、街道、路、号、楼、室、工业园、园区等地点信息。",
      "business 只允许放主营范围、经营范围、业务范围、产品、服务、生产销售内容。",
      "back_extra 放适合名片反面的补充内容，例如公司简介、优势、承诺、二维码提示、宣传语。",
      "主营范围绝对不要放进 addresses；地址绝对不要放进 business。",
      "不要虚构信息；不要把公司名、姓名、电话、地址、网址重复放进 business。",
      "",
      "本地规则初步结果：",
      JSON.stringify(ruleResult, null, 2),
      "",
      "正面文本：",
      frontText || "",
      "",
      "反面文本：",
      backText || ""
    ].join("\n");

    // Stage 2：走统一 AI Transport（ai-client），Prompt/响应语义/fallback 不变
    return aiRequest({
      url: buildChatUrl(config.baseUrl),
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + config.apiKey
      },
      data: JSON.stringify({
        model: config.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "你是字段抽取程序。必须只返回可被 JSON.parse 解析的 JSON 对象，禁止解释、Markdown、示例和虚构信息。" },
          { role: "user", content: prompt }
        ]
      }),
      timeout: 30000,
      operation: "parseFields"
    }).then((result) => {
      if (!result.ok) throwAiError(result);
      const content = result.body && result.body.choices && result.body.choices[0] && result.body.choices[0].message && result.body.choices[0].message.content;
      return parseJsonFromText(content || "{}");
    });
  }

  // 已迁移至 field-core（@require 首行加载）：parseJsonFromText / normalizeFields /
  // normalizeArrayField / splitList / mergeFields / mergeTwoFields / rawIncludes / cleanMultiline

  function applyFieldsToPage(fields, side) {
    window.postMessage({ source: BRIDGE_SOURCE, type: "apply", fields: normalizeFields(fields), side: side || "front" }, location.origin);
  }

  // 画布自检：让页面内的桥接脚本报告当前页面的画布状态，用于定位“本地填不进去”的根因。
  function probeCanvas() {
    window.postMessage({ source: BRIDGE_SOURCE, type: "probe" }, location.origin);
    setStatus("已发送画布自检请求。若一直不返回结果，说明桥接脚本被页面环境拦截，把这一行提示发给我即可。");
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.source !== PAGE_SOURCE) return;
    if (event.data.type === "applyResult") {
      if (event.data.ok) {
        setStatus("已处理 " + event.data.applied.length + " 个文字图层。\n" + event.data.applied.join("\n"));
      } else {
        setStatus(event.data.message || "没有拿到画布对象。请先打开模板，等待加载完成后再试。");
      }
      return;
    }
    if (event.data.type === "probeResult") {
      const probe = event.data || {};
      const rows = (probe.canvases || []).map((item) => {
        return "  " + item.side + (item.found
          ? " 找到：" + item.ctor + " 宽" + item.width + " 高" + item.height + " 文字图层" + item.textObjects + "个"
          : " 未找到画布对象");
      });
      setStatus("画布自检" + (probe.ok ? " ✓" : "") + "\n页面URL：" + (probe.href || "") + "\n" + rows.join("\n"));
    }
  });

  function installPageBridge() {
    // Stage 3.2 修复（AUDIT-BRIDGE-001, P1）：安装状态与 script DOM 生命周期解耦。
    // 旧实现依赖“zy-card-assistant-page-bridge”DOM id 判重，但 script 注入后立即 remove()，
    // id 永远不存在 → guard 失效 → 每次 renderPanel()（含 minimize 重建）重复注入 →
    // 多个 message listener → 一次 apply/probe 被处理 N 次。
    // 现改为稳定的闭包标志：同一次脚本运行内只注入一次；注入失败时允许下次重试。
    if (pageBridgeInstalled) return;
    const script = document.createElement("script");
    script.id = "zy-card-assistant-page-bridge";
    script.textContent = "(" + pageBridge.toString() + ")();";
    try {
      (document.head || document.documentElement).appendChild(script);
      pageBridgeInstalled = true;
    } catch (_error) {
      pageBridgeInstalled = false; // 注入异常时允许重试
    }
    script.remove();
  }

  // pageBridge() 已迁移至 extension/src/editor/page-bridge.js（@require 加载，注入方式不变）
  function formatFields(fields) {
    const data = normalizeFields(fields);
    return Object.keys(FIELD_LABELS).map((key) => {
      const value = Array.isArray(data[key]) ? data[key].join("；") : (data[key] || "");
      return FIELD_LABELS[key] + "：" + value;
    }).join("\n");
  }

  // clean / unique 已迁移至 field-core（@require 首行加载）

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function checkForUpdateSoon() {
    const today = new Date().toISOString().slice(0, 10);
    if (GM_getValue("zyUpdateCheckedDate", "") === today) return;
    GM_setValue("zyUpdateCheckedDate", today);
    setTimeout(checkForUpdate, 1500);
  }

  // D2：更新提示用面板内链接展示，兼容脚本猫/扩展里 alert+window.open 被拦截的情况。
  function showUpdateLink(url, latest) {
    const node = document.getElementById("zy-update");
    if (!node) return;
    node.style.display = "block";
    node.innerHTML = "发现新版 <b>" + escapeHtml(latest) + "</b>（当前 " + escapeHtml(VERSION) + "）。<br><a href=\"" + escapeHtml(url) + "\" target=\"_blank\" rel=\"noreferrer\">点此打开新版安装地址</a>";
  }

  function checkForUpdate() {
    GM_xmlhttpRequest({
      method: "GET",
      url: UPDATE_URL + "?t=" + Date.now(),
      timeout: 15000,
      onload: (response) => {
        if (response.status < 200 || response.status >= 300) return;
        const match = String(response.responseText || "").match(/@version\s+([^\s]+)/);
        if (!match) return;
        const latest = match[1];
        if (compareVersion(latest, VERSION) > 0) {
          setStatus("发现脚本新版 " + latest + "（当前 " + VERSION + "），请点下方链接安装。");
          showUpdateLink(DOWNLOAD_URL + "?t=" + Date.now(), latest);
        }
      }
    });
  }

  function compareVersion(a, b) {
    const pa = String(a || "").split(".").map((item) => parseInt(item, 10) || 0);
    const pb = String(b || "").split(".").map((item) => parseInt(item, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i += 1) {
      if ((pa[i] || 0) > (pb[i] || 0)) return 1;
      if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    }
    return 0;
  }

  function initZheliyin() {
    // Stage 5.6（OCR-only Demo）：样式/页桥/更新检查前置到 init，OCR 抽屉不再依赖套版浮窗。
    // addStyles/installPageBridge/checkForUpdateSoon 三者均幂等（renderPanel 内保留原调用，双保险）。
    addStyles();
    installPageBridge();
    // P0 诊断：init 时打印 @require 依赖加载状态（无敏感信息），故障时便于远程定位
    console.info("[zy-ocr][INIT] pageBridge=" + (typeof pageBridge) + " unifyCandidates=" + (typeof unifyCandidates) + " baiduProvider=" + (typeof createBaiduProvider) + " credCrypto=" + (typeof encryptSecret));
    // P2-B：原生右栏存在则优先原生化（Demo 主 UI）；rightBar 晚到时由 observer 补挂
    const nativeOk = mountNativeOcrPanel();
    observeNativeRemount();
    // P4+：凭据加密配置预载（README 不落明文；解密后缓存）
    loadBaiduConfig().catch((e) => ocrLog && ocrLog("ERROR", "credential load: " + String(e && e.message || e)));
    // 旧浮窗（套版等全部功能，代码保留）：非 OCR-only 模式，或原生右栏缺失（页面变体）时挂载
    if (!OCR_ONLY_MODE || !nativeOk) renderPanel();
    checkForUpdateSoon();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initZheliyin);
  } else {
    initZheliyin();
  }

  // 测试/诊断出口（默认不启用）：URL 带 zydebug（hash 或 query）时暴露内部引用，便于无头/浏览器回归
  const zyDebugOn = (window.location && (window.location.hash || "") + "|" + (window.location.search || "")).indexOf("zydebug") >= 0;
  if (zyDebugOn) {
    window.__ZY_DEBUG__ = {
      state: state,
      getConfig: getConfig,
      saveConfig: saveConfig,
      parseFields: parseFields,
      installPageBridge: installPageBridge,
      splitFrontBackText: splitFrontBackText,
      parseByRulesFromSides: parseByRulesFromSides,
      emptyFields: emptyFields,
      normalizeFields: normalizeFields,
      mergeFields: mergeFields,
      mergeTwoFields: mergeTwoFields,
      setStatus: setStatus
    };
  }

  console.info("折立印名片套版助手已加载", VERSION);
})();
