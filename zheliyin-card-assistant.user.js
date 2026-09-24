// ==UserScript==
// @name         折立印名片套版助手 (OCR Demo 版)
// @namespace    https://github.com/jingjiangze/zheliyin-scriptcat
// @version      0.3.11.74
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
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/fields/field-core.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/core/config-core.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/ai/ai-client.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/ai/template-match-plan.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/ai/template-match-validator.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/ai/rule-match.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/editor/page-bridge.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/editor/image-transform.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/editor/image-space.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/editor/image-containment.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/editor/multiline-typography.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/editor/text-fit.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/editor/text-fit-fusion.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/editor/ink-measure.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/editor/diy-font-registry.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/editor/template-apply.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/editor/template-apply-v2.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/ocr/content-similar-planner.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/fields/smart-plan.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/ocr/baidu-provider.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/ocr/native-ocr-provider.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/ocr/fallback-policy.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/ocr/candidate-normalizer.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/ocr/ocr-candidate-gate.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/ocr/font-source.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/ocr/native-completeness-gate.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/ocr/native-geometry-aligner.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/ocr/native-geometry-recovery.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/ocr/text-truth-gate.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/ocr/transaction-identity.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/ocr/recognition-mode.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/editor/image-ink-target.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/editor/visual-geometry-resolver.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/editor/native-color.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/editor/font-target-source.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/ocr/credential-crypto.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/ocr/ocr-quality.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/ocr/ocr-text-sanitizer.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/ocr/ocr-size-analyzer.js?v=0.3.11.74
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/test/extension/src/ocr/ocr-text-safety-gate.js?v=0.3.11.74
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
// ==/UserScript==

(function () {
  "use strict";

  const VERSION = "0.3.11.74";

  // ---- Stage 5.6（用户指令 2026-09-17）：OCR-only Demo ----
  // Demo 主 UI = 原生右栏 OCR 抽屉；旧套版浮窗停用挂载（renderPanel 函数体与全部套版代码保留）。
  // GM 开关 zyShowTemplatePanel（默认空/0/1=显示浮窗；存 "2"=OCR-only 仅原生抽屉；历史 "1" 兼容）。
  const OCR_ONLY_MODE = GM_getValue("zyShowTemplatePanel", "0") === "2"; // 默认显示套版浮窗（含一键智能填充）；显式存 "2" 才回到 OCR-only（仅原生抽屉）
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
  // Stage 10-D Commit F：最后一次套版目标侧（SLOT_STATE_CHANGED 回退 legacy 用）
  let lastApplySide = "front";

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
        width: 364px;
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
        max-height: 140px;
        overflow-y: auto;
        font-size: 12px;
        color: #667085;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .zy-divider {
        height: 1px;
        background: #e4e7ec;
        margin: 2px 0;
      }
      .zy-ver {
        font-size: 11px;
        font-weight: 400;
        color: rgba(255,255,255,.88);
        margin-left: 6px;
        vertical-align: 1px;
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
        <div class="zy-title">名片套版助手<span class="zy-ver">v${VERSION}</span></div>
        <div class="zy-head-actions">
          <button class="zy-icon-btn" id="zy-min-btn" title="收起/展开">${state.minimized ? "+" : "-"}</button>
          <button class="zy-icon-btn" id="zy-close-btn" title="关闭">×</button>
        </div>
      </div>
      <div class="zy-body">
        <details class="zy-settings">
          <summary>识别设置（智能接口）</summary>
          <div class="zy-settings-body">
            <div class="zy-row">
              <label class="zy-label" for="zy-provider">智能接口</label>
              <select class="zy-input" id="zy-provider">
                <option value="doubao" ${providerKeyFor(config) === "doubao" ? "selected" : ""}>豆包（火山方舟）</option>
                <option value="siliconflow" ${providerKeyFor(config) === "siliconflow" ? "selected" : ""}>硅基流动（有免费模型）</option>
                <option value="deepseek" ${providerKeyFor(config) === "deepseek" ? "selected" : ""}>DeepSeek 官方</option>
                <option value="custom" ${providerKeyFor(config) === "custom" ? "selected" : ""}>自定义</option>
              </select>
              <div class="zy-note">预设只自动填接口地址与模型，仍需填 API Key（仅存本机）。硅基流动新用户有赠金并可选免费模型。</div>
            </div>
            <div class="zy-row">
              <label class="zy-label" for="zy-api-key">API Key</label>
              <input class="zy-input" id="zy-api-key" type="password" value="${escapeHtml(config.apiKey)}" placeholder="接口 API Key。填写后「一键智能填充」用 AI 拆正反/提字段；不填则用本地规则。">
            </div>
            <div class="zy-row">
              <label class="zy-label" for="zy-base-url">接口地址</label>
              <input class="zy-input" id="zy-base-url" value="${escapeHtml(config.baseUrl)}" placeholder="https://api.xxx.cn/v1（OpenAI 兼容）">
            </div>
            <div class="zy-row">
              <label class="zy-label" for="zy-model">模型</label>
              <select class="zy-input" id="zy-model"><option value="${escapeHtml(config.model)}">${escapeHtml(config.model || "（未配置）")}</option></select>
              <div class="zy-actions two">
                <button class="zy-btn secondary" id="zy-load-models" type="button">加载可用模型</button>
              </div>
              <div class="zy-note" id="zy-model-status">点「加载可用模型」从接口 /models 读取；接口不支持 /models 时可手动回填模型名。</div>
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
          <label class="zy-label" for="zy-raw">客户文字（自动拆正反面）</label>
          <textarea class="zy-textarea" id="zy-raw" placeholder="把微信、表格或客户发来的名片资料粘贴到这里，点「一键智能填充」自动拆正反面并填入当前模板槽位（不填 AI Key 也能用本地规则）。"></textarea>
        </div>
        <div class="zy-actions two">
          <button class="zy-btn" id="zy-smart-fill">一键智能填充</button>
          <button class="zy-btn secondary" id="zy-append">追加信息</button>
        </div>
        
        <div class="zy-match-block" id="zy-match-block" style="display:none">
          <div class="zy-match-summary" id="zy-match-summary"></div>
          <div class="zy-match-rows" id="zy-match-rows"></div>
          <div class="zy-actions two">
            <button class="zy-btn" id="zy-apply-confirm">确认填充</button>
            <button class="zy-btn secondary" id="zy-apply-cancel">取消</button>
          </div>
        </div>
        <details class="zy-settings">
          <summary>正反面与字段（可编辑）</summary>
          <div class="zy-settings-body">
            <div class="zy-side-grid" id="zy-side-texts">${renderSideTextInputs()}</div>
            <div class="zy-grid" id="zy-fields">${renderFieldInputs(state.fields)}</div>
            <div class="zy-actions two">
              <button class="zy-btn" id="zy-apply-front">填正面</button>
              <button class="zy-btn secondary" id="zy-apply-back">填反面</button>
            </div>
          </div>
        </details>
        <div class="zy-actions">
          <button class="zy-btn zy-ocr" id="zy-ocr-btn">识别图片文字</button>
          <button class="zy-btn secondary" id="zy-probe" title="检测画布与桥接状态">诊断</button>
        </div>
        <div class="zy-actions three">
          <button class="zy-btn secondary" id="zy-copy-current" title="仅复制当前正/反面文字图层内容">复制当前面</button>
          <button class="zy-btn secondary" id="zy-copy-both" title="复制正反面全部文字图层内容">复制正反面</button>
          <button class="zy-btn secondary" id="zy-copy-template" title="复制模板套版结构（槽位/文本/几何/字号/颜色）">复制套版结构</button>
        </div>
        <div class="zy-divider"></div>
        <div class="zy-update" id="zy-update"></div>
        <div class="zy-status" id="zy-status">${escapeHtml(state.logs.join("\n"))}</div>
      </div>
    `;
    document.body.appendChild(panel);
    bindPanel(panel);
    makeDraggable(panel);
    refreshMatchBlock();
    checkForUpdateSoon();
    loadModels(panel);
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
    panel.querySelector("#zy-smart-fill").addEventListener("click", contentApplyFromPanel);
    panel.querySelector("#zy-append").addEventListener("click", () => parseFields({ append: true, apply: false }));
    const zyConfirmBtn = panel.querySelector("#zy-apply-confirm");
    if (zyConfirmBtn) zyConfirmBtn.addEventListener("click", confirmTemplateApply);
    const zyCancelBtn = panel.querySelector("#zy-apply-cancel");
    if (zyCancelBtn) zyCancelBtn.addEventListener("click", cancelTemplateApply);
    const zyLoadModelsBtn = panel.querySelector("#zy-load-models");
    if (zyLoadModelsBtn) zyLoadModelsBtn.addEventListener("click", () => loadModels(panel));
    const providerSel = panel.querySelector("#zy-provider");
    if (providerSel) providerSel.addEventListener("change", () => {
      const p = AI_PROVIDERS[providerSel.value];
      if (!p || providerSel.value === "custom") return;
      const bu = panel.querySelector("#zy-base-url");
      const md = panel.querySelector("#zy-model");
      const cur = getConfig();
      if (bu) bu.value = p.baseUrl || cur.baseUrl;
      if (md) md.value = p.defaultModel || cur.model;
        if (p.baseUrl && p.baseUrl !== cur.baseUrl) loadModels(panel);
      setStatus("已填入「" + (p.label || providerSel.value) + "」接口地址与默认模型，请填写 API Key。");
    });
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
    const copyCurBtn = panel.querySelector("#zy-copy-current");
    if (copyCurBtn) copyCurBtn.addEventListener("click", function () { copyLayerTexts("current"); });
    const copyBothBtn = panel.querySelector("#zy-copy-both");
    if (copyBothBtn) copyBothBtn.addEventListener("click", function () { copyLayerTexts("both"); });
    const copyTplBtn = panel.querySelector("#zy-copy-template");
    if (copyTplBtn) copyTplBtn.addEventListener("click", function () { copyLayerTexts("template"); });
    const probeBtn = panel.querySelector("#zy-probe");
    if (probeBtn) probeBtn.addEventListener("click", probeCanvas);
    // Stage 5.5B P4 / P2-B：识别方式 + 百度设置共用绑定（suffix 区分浮窗面板与原生抽屉，单一来源）
    bindOcrControls(panel, "", () => { renderPanel(); });
  }

  // 识别方式下拉 + 百度云 OCR（AK/SK 脱敏存取 + 保存 + 测试连接）统一绑定。
  // suffix: 浮窗 "" / 原生抽屉 "-native"；onSaved: 保存后回调（浮窗需重渲染刷新占位，原生抽屉不需要）。

  // Stage 10-G Commit J-2: 读取接口 /models 可用模型下拉（OpenAI 兼容；GET + Bearer）。
  let zyModelListCache = null; // { baseUrl, at, ids } 60s 缓存，面板重渲染不重复请求
  async function loadModels(panel) {
    const p = panel || document.getElementById("zy-card-assistant");
    if (!p) return;
    const sel = p.querySelector("#zy-model");
    const statusEl = p.querySelector("#zy-model-status");
    if (!sel) return;
    const cfg = getConfig();
    const baseUrl = (p.querySelector("#zy-base-url") ? p.querySelector("#zy-base-url").value.trim() : "") || cfg.baseUrl;
    const apiKey = (p.querySelector("#zy-api-key") ? p.querySelector("#zy-api-key").value.trim() : "") || cfg.apiKey;
    const cur = sel.value || cfg.model;
    const fill = (ids) => {
      const uniq = [...new Set(ids)].filter(Boolean);
      if (!uniq.length) { if (statusEl) statusEl.textContent = "接口未返回可用模型（data 为空）。"; return; }
      sel.innerHTML = uniq.map((id) => "<option value=\"" + escapeHtml(id) + "\">" + escapeHtml(id) + "</option>").join("");
      sel.value = uniq.indexOf(cur) >= 0 ? cur : uniq[0];
      if (statusEl) statusEl.textContent = "已加载 " + uniq.length + " 个可用模型。";
    };
    if (!String(baseUrl || "").trim()) { if (statusEl) statusEl.textContent = "请先填写接口地址。"; return; }
    if (!apiKey) { if (statusEl) statusEl.textContent = "填写 API Key 后可加载可用模型列表。"; return; }
    if (zyModelListCache && zyModelListCache.baseUrl === baseUrl && Date.now() - zyModelListCache.at < 60000) { fill(zyModelListCache.ids); return; }
    if (statusEl) statusEl.textContent = "正在加载可用模型…";
    try {
      const result = await aiRequest({
        url: String(baseUrl).replace(/\/+$/, "") + "/models",
        method: "GET",
        headers: apiKey ? { "Authorization": "Bearer " + apiKey } : {},
        timeout: 15000,
        operation: "loadModels"
      });
      if (!result.ok) throwAiError(result);
      const arr = (result.body && Array.isArray(result.body.data)) ? result.body.data : [];
      const ids = arr.map((m) => String(m && m.id != null ? m.id : "")).filter(Boolean);
      zyModelListCache = { baseUrl: baseUrl, at: Date.now(), ids: ids };
      fill(ids);
    } catch (e) {
      if (statusEl) statusEl.textContent = "加载模型失败：" + String(e && e.message ? e.message : e);
    }
  }
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
  const stage9TxByPage = {}; // Stage 9 V4 §26：每页最近事务（pageId → {imageFingerprint, ts}），供 RETRY 判定

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

  // Stage 9 Commit 1（OCR Pipeline Evidence Audit）：只记录计数/失败码，零行为影响；汇总写 window.__zyOcrPipelineEvidence（runner 取证）。禁止记录文字内容/凭据。
  function pipelineEvidence(rec) {
    try { const cur = window.__zyOcrPipelineEvidence || {}; return (window.__zyOcrPipelineEvidence = Object.assign({}, cur, rec, { updated: Date.now() })); }
    catch (e) { return null; }
  }

  // P1 根因（001-execution）：隔离世界读不到页面 world 的 requirejs 模块注册表（CanvasObjVO），
  // 因此画布/目标图一律改走 page-bridge（页面世界执行），禁止隔离世界直读画布。

  // 桥接只读调用：postMessage 请求 → 等页面 bridge 回传（Promise，支持超时）
  // 注：仅用于只读查询（probe/getCanvasInfo/ocrPrepare/getCurrentPage）；apply/ocrCreate 走既有专用 listener，避免双响应。
  // Stage 7.6：getCurrentPage —— 供 OCR Source Page 冻结（图片与页面同帧的权威来源）。
  function bridgeCall(type, timeoutMs, payload) {
    const replyMap = { probe: "probeResult", getCanvasInfo: "getCanvasInfoResult", ocrPrepare: "ocrPrepareResult", getCurrentPage: "getCurrentPageResult", getTextInventory: "getTextInventoryResult", inkMeasure: "inkMeasureResult" };
    const replyType = replyMap[type] || (type + "Result");
    return new Promise((resolve) => {
      const on = (e) => {
        if (e.data && e.data.source === PAGE_SOURCE && e.data.type === replyType) {
          window.removeEventListener("message", on);
          resolve(e.data);
        }
      };
      window.addEventListener("message", on);
      window.postMessage(Object.assign({ source: BRIDGE_SOURCE, type: type }, payload || {}), location.origin);
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
  // ---- OCR-P0.2 / P0.2-A：Native Truth 与 Baidu Geometry 解耦（并列主链）----
  // 旧控制关系（废弃）：Baidu → quality → candidate gate → Native OCR
  // 新控制关系：Image Prepare → Native OCR(textType=2, Text Truth) ∥ Baidu OCR(Geometry Evidence)
  // 硬规则（§3/§5/§22）：即使 Baidu=0 / Baidu Quality FAIL / Candidate Gate FAIL / Baidu exception，
  //   Native OCR 仍然独立执行（runNativeTruth）。Baidu 只提供 position/bbox/rotation，
  //   禁止把 Baidu text 当最终文字。
  async function runNativeTruth(img, diag) {
    try {
      if (!STAGE9_NATIVE_TRUTH || typeof recognizeWithFallback !== "function") {
        ocrLog("TRUTH", "native feature off");
        return { executed: true, statusCode: "FEATURE_OFF", native: null };
      }
      const native = await recognizeWithFallback(img.dataUrl, {
        textType: "2", // OCR-P1 Commit 1：生产 Truth 固定 textType=2（GM zyStage9NativeOcrMode 仅诊断；禁止非 2 进入生产请求）
        pageId: (img && img.pageId) || null,
        transactionId: (img && img.transactionId) || null,
        imageFingerprint: (img && img.imageFingerprint) || null
      });
      img._native = native;
      const ok = !!(native && native.ok);
      pipelineEvidence({ stage: "NATIVE", nativeLines: (native && native.texts) ? native.texts.length : 0, ok: ok, code: (native && native.error && native.error.errorCode) || null, httpStatus: (native && native.httpStatus != null) ? native.httpStatus : null });
      ocrLog("TRUTH", "runNativeTruth ok=" + ok + " lines=" + (((native && native.texts) || []).length) + " err=" + String((native && native.error && native.error.errorCode) || "none"));
      return { executed: true, statusCode: ok ? "NATIVE_OK" : ((native && native.error && native.error.errorCode) || "NATIVE_FAIL"), native: native };
    } catch (e) {
      ocrLog("TRUTH", "runNativeTruth exception " + String(e && (e.message || e) || "").slice(0, 160));
      return { executed: true, statusCode: "NATIVE_EXCEPTION", native: null };
    }
  }

  // Geometry Recognition：Baidu → quality gate → candidate gate → blocks（仅 Geometry Evidence）
  // 失败返回 false；不 throw。Native 已在 runBaiduOcr 编排层独立执行，Baidu 失败不阻断它（§P0.2）。
  async function runGeometryRecognition(img, diag) {
    // diag = {engine:"cloud", attempt:"cloud-primary"|"manual-baidu", fallback:false}
    const provider = makeBaiduProvider();
    if (!provider) { maybeLocalFallback(img, "CLOUD_MODULE_LOAD_FAILED", "exception", (diag && diag.attempt) || "cloud-primary"); return false; }
    setStatus("百度云端识别中…");
    let res = null;
    try {
      res = await provider.recognize(img.dataUrl, { imageWidth: img.width, imageHeight: img.height, mode: BAIDU_OCR_MODE });
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
      pipelineEvidence({ stage: "BAIDU", fail: cloudQa.reasonCode === "empty-result" ? "BAIDU_EMPTY" : "BAIDU_QUALITY_BLOCK", raw: cloudQa.total, qaKept: 0, qaCode: cloudQa.reasonCode || null });
      maybeLocalFallback(img, cloudQa.reasonCode === "empty-result" ? "CLOUD_EMPTY" : "CLOUD_QUALITY_FAIL", cloudQa.reasonCode || "invalid-result", (diag && diag.attempt) || "cloud-primary");
      return;
    }
    const cloudKept = (cloudQa.kept && cloudQa.kept.length) ? cloudQa.kept : res.candidates;
    ocrLog("BAIDU_RECOGNIZING", "lines=" + res.candidates.length + " kept=" + cloudKept.length + " elapsed=" + res.meta.elapsed + "ms" + (res.meta.mode ? " mode=" + res.meta.mode + " (" + (res.meta.profileName || "") + ")" : ""));
    pipelineEvidence({ stage: "BAIDU", raw: (res.candidates || []).length, mode: BAIDU_OCR_MODE, qaKept: cloudKept.length });
    // Stage 8D §十九取证：cloud raw candidates 证据（行级 bbox）
    ocrLog("RAW_CAND8D", (res.candidates.map((c) => String(c.text || "").slice(0, 10) + "@" + JSON.stringify({ x: Math.round((c.bbox && (c.bbox.x0 != null ? c.bbox.x0 : c.bbox.x)) || 0), y: Math.round((c.bbox && (c.bbox.y0 != null ? c.bbox.y0 : c.bbox.y)) || 0), w: Math.round((c.bbox && (c.bbox.x1 != null ? Math.abs(c.bbox.x1 - c.bbox.x0) : c.bbox.width)) || 0), h: Math.round((c.bbox && (c.bbox.y1 != null ? Math.abs(c.bbox.y1 - c.bbox.y0) : c.bbox.height)) || 0) })).join("|")).slice(0, 4000));
    // Stage 7.8 §三十二/§四十一：六维质量门分级诊断（仅记录，不改 fallback 决策 ——
    // §三十四 特殊符号不直接判 OCR 失败，由 sanitizer 清洗负责）
    const cloudBundle = (typeof bundleOcrQuality === "function")
      ? bundleOcrQuality(res.candidates, { provider: res.provider, imageSize: { width: img.width, height: img.height } })
      : null;
    if (cloudBundle) {
      emitOcrDiag(Object.assign({}, diag, { quality6: { overall: cloudBundle.overall, reasonCode: cloudBundle.reasonCode, total: cloudBundle.total, text: cloudBundle.textQuality && cloudBundle.textQuality.status, block: cloudBundle.blockQuality && cloudBundle.blockQuality.status, bbox: cloudBundle.bboxQuality && cloudBundle.bboxQuality.status, size: cloudBundle.sizeQuality && cloudBundle.sizeQuality.status, symbol: cloudBundle.symbolQuality && cloudBundle.symbolQuality.status, merge: cloudBundle.mergeQuality && cloudBundle.mergeQuality.status } }));
    }
    // P3 边界：Baidu Provider 已是统一候选（含 bbox{x,y,width,height}），直接交给统一 Mapper（§39 解耦）
    // Stage 6.1：行级候选 → TextBlock（1 block = 1 textbox，§8）→ 统一 Mapper
    // 锁不在此释放：由 buildItemsFromOcr（ocrCreate 回复/超时/空结果）决定事务终态
    const lineCandidates = unifyCandidates(cloudKept, { width: img.width, height: img.height });
    const gate8d = runCandidateGate(lineCandidates, { width: img.width, height: img.height });
    pipelineEvidence({ stage: "GATE", unified: lineCandidates.length, gateKept: (gate8d ? gate8d.validated : []).length, ok: !!(gate8d && gate8d.ok), reason: (gate8d && gate8d.reason) || null });
    pipelineEvidence({ stage: "GATE", fail: "CANDIDATE_GATE_EMPTY", unified: lineCandidates.length });
    if (!gate8d.ok) { ocrRunning = false; setStatus("OCR 候选质量门阻断（" + String(gate8d.reason || "invalid-result") + "），未生成文字"); ocrLog("GATE8D", "block-set suspect: " + (gate8d.setSuspectReasons || []).join("|")); return; }
    const blocks = (typeof buildTextBlocks === "function") ? buildTextBlocks(gate8d.validated) : (gate8d.validated || []).map(oneLineBlock);
    pipelineEvidence({ stage: "BLOCKS", blocks: blocks.length });
    const tb = await maybeApplyNativeTruth(blocks, img, diag); // OCR-P0.2/0.3：Native Text Truth（复用 runNativeTruth，多因素对齐）
    // OCR-P1 Commit 1：Native Truth Gate 统一防线 —— tb.blocked（unavailable/依赖缺失）
    // 或 Completeness Gate 失败（INCOMPLETE/UNRESOLVED）→ 本批不创建，禁止任何非
    // NATIVE_OCR text 进入 buildItemsFromOcr（绝对冻结 2/3）。
    if (!nativeTruthGatePassed(tb)) {
      const fg = nativeTruthGateFail(tb);
      ocrRunning = false;
      setStatus(fg.message);
      ocrLog("NATIVE_GATE", "code=" + fg.code + " matched=" + ((tb && tb.gate && tb.gate.matched) || 0) + " unresolved=" + ((tb && tb.gate && tb.gate.unmatchedNative) || 0) + " blocked=" + !!((tb && tb.blocked)));
      pipelineEvidence({ stage: "NATIVE_GATE", code: fg.code, matched: (tb && tb.gate && tb.gate.matched) || 0, unresolved: (tb && tb.gate && tb.gate.unmatchedNative) || 0, totalNative: (tb && tb.gate && tb.gate.totalNative) || 0, blockCreate: true });
      return false;
    }
    // OCR-P1 Commit 3a：部分创建的缺失文字告知（可靠行创建，缺失行不创建）
    const _fg1 = nativeTruthGateFail(tb);
    if (_fg1 && _fg1.code === "NATIVE_PARTIAL_OK") {
      ocrRunning = true; setStatus(_fg1.message);
      OCR_PARTIAL_LAST_MISSING = (_fg1.missingTexts || []).slice();
    } else {
      OCR_PARTIAL_LAST_MISSING = [];
    }
    await buildItemsFromOcr(tb.blocks, img, diag);
    return true;
  }

  // OCR-P0.2-A 编排器：二者并列。Baidu 失败不阻断 Native（Native 已独立执行并保存结果/证据）。
  async function runBaiduOcr(img, diag) {
    const nt = await runNativeTruth(img, diag); // Native 第一主链，任何 Baidu 状态都执行
    pipelineEvidence({ stage: "NATIVE_EXEC", statusCode: nt.statusCode, nativeLines: (nt.native && nt.native.texts) ? nt.native.texts.length : 0 });
    await runGeometryRecognition(img, diag);
  }

  // ---- Stage 9 V3：Native OCR = 绝对文字真值（§一/§九十 feature gate zyStage9NativeTruth）----
  // 规则：最终 textbox.text 必须来自 nativeOcr.texts[].rawText（原样，禁 trim/禁 sanitize）。
  // 本刀只做 Text Truth 接线（§五十九）：不及 Font/Position/Vertical/ImageInk；Geometry 沿用候选块。
  // mode：用户实测（2026-09-20）手写体(textType=2) 正确率明显更高 → 默认 "2" 优先；
  // 空结果/接口失败视为"错误明显"→ 自动回退印刷体(textType=1) 重试一次（recognizeWithFallback）。
  // Stage 9 V4 §十二：百度 OCR 实验模式（standard|accurate）—— 实验开关 zyBaiduOcrMode，不进长期配置系统
  const BAIDU_OCR_MODE = GM_getValue("zyBaiduOcrMode", "standard");
  let OCR_PARTIAL_LAST_MISSING = [];
  const STAGE9_LOCAL_SIDECAR = GM_getValue("zyStage9LocalSidecar", "0") === "1"; // OCR-P1 Commit 3b：LOCAL geometry sidecar（默认关；unmatched 剩余时同图跑 local 补位置） // OCR-P1 Commit 3a：最近一次部分创建的缺失文字清单（诊断/runner 抓取） // "accurate"=高精度含位置版 /general 之外
  const STAGE9_NATIVE_TRUTH = GM_getValue("zyStage9NativeTruth", "1") === "1"; // Stage 10-C：强制站点原生 OCRTool.do 手写体为文字真值（> Baidu；接口有则必须全到画布，无则禁止到画布）
  const STAGE9_NATIVE_OCR_MODE = GM_getValue("zyStage9NativeOcrMode", "2"); // "2" 手写体优先（用户实测），"1" 印刷体
  // Stage 9 P4-B §七/§二十一：ImageInk typography target 实验开关（默认 OFF = 保持 OCR bbox target）
  const STAGE9_FONT_INK_TARGET = GM_getValue("zyStage9FontInkTarget", "0") === "1";
  const STAGE9_INK_GEOMETRY = GM_getValue("zyStage9InkGeometry", "0") === "1"; // Commit A：墨迹位置接管默认关（Ink 仅 confidence/region/mask）
  // OCR-P0.3（commit 5）：Native/Geometry 多因素匹配（alignNativeGeometry）—— 禁止 index-only 配对。
  // Geometry Provider 只提供位置（bbox/rotation/line-grouping）；textbox.text 恒为 native.rawText。
  // 匹配产物 kept（含 geometry）作为 Final OCR Items 输入；unmatchedNative/unusedGeometry 记录审计。
  // OCR-P1 Commit 1：Native Truth Gate 统一防线（只读判定，不修改创建链路）。
  // 生产语义（STAGE9_NATIVE_TRUTH=true 恒开）：creation 的 blocks 必须来自 Native Truth
  // 且通过 Completeness Gate；tb.blocked（unavailable/依赖缺失/empty）→ 一律 STOP。
  function nativeTruthGatePassed(tb) {
    if (!STAGE9_NATIVE_TRUTH) return true; // feature off：保留历史降级
    if (typeof resolveGate === "function") { const _rg = resolveGate(tb, { allowPartial: true }); return !!(_rg && _rg.ok); } // OCR-P1 Commit 1+3a：纯模块统一判定（allowPartial=可靠行部分创建）
    if (!tb || tb.blocked) return false;   // 兜底：unavailable / 依赖缺失 / 显式拦截
    if (tb.gate && tb.gate.totalNative > 0) { // 兜底：Completeness 门禁（OCR-P1 3a 对齐 allowPartial）
      const cg = (typeof evaluateCompleteness === "function") ? evaluateCompleteness(tb.matched) : null;
      if (cg && cg.ok) return true;
      // NATIVE_GEOMETRY_INCOMPLETE 但已有可靠行（matched>0）→ 放行可靠行部分创建（与 resolveGate allowPartial 一致）
      if (cg && cg.code === "NATIVE_GEOMETRY_INCOMPLETE" && (cg.matched || 0) > 0) return true;
      return false;
    }
    return false;                          // 兜底：无 Native 真值 → 无创建
  }
  function nativeTruthGateFail(tb) {
    if (typeof resolveGate === "function") {
      const rg = resolveGate(tb, { allowPartial: true }); // OCR-P1 Commit 3c：与 passed 同一 allowPartial（PARTIAL_OK 携缺失文字)
      return { code: rg && rg.code, message: rg && rg.message, missingTexts: (rg && rg.missingTexts) || [] };
    }
    if (!tb) return { code: "NATIVE_TRUTH_BLOCKED", message: "Native Truth 门禁拦截（无结果），本批不创建", missingTexts: [] };
    if (tb.blocked) {
      if (tb.reason === "unavailable") return { code: "NATIVE_UNAVAILABLE", message: "Native OCR 不可用（" + String(tb.nativeFailCode || "?") + "），本批不创建（禁止用其它 OCR 文本进入画布）", missingTexts: [] };
      if (tb.reason === "dependency-missing") return { code: "NATIVE_DEPENDENCY_MISSING", message: "Native Truth 依赖缺失，本批不创建", missingTexts: [] };
      return { code: "NATIVE_TRUTH_BLOCKED", message: "Native Truth 门禁拦截，本批不创建", missingTexts: [] };
    }
    if (tb.gate && tb.gate.totalNative > 0) {
      const cg = (typeof evaluateCompleteness === "function") ? evaluateCompleteness(tb.matched) : null;
      // OCR-P1 Commit 4.5：兜底分支对齐 allowPartial —— INCOMPLETE 且可靠行 matched>0 时
      // 放行可靠行创建并明确告知缺失文字（与 resolveGate({allowPartial:true}) 语义一致）。
      if (cg && cg.code === "NATIVE_GEOMETRY_INCOMPLETE" && (cg.matched || 0) > 0) {
        const missFb = (tb.matched && Array.isArray(tb.matched.unmatchedNative)) ? tb.matched.unmatchedNative.map(function (n) { return n && n.rawText != null ? String(n.rawText) : ""; }).filter(Boolean) : [];
        return { code: "NATIVE_PARTIAL_OK", message: "Native 识别 " + (cg.totalNative || 0) + " 行，可定位 " + (cg.matched || 0) + " 行即将创建；缺失 " + (cg.unresolved || 0) + " 行文字不创建：" + (missFb.join("、") || "（无）"), missingTexts: missFb };
      }
      return { code: (cg && cg.code) || "NATIVE_GEOMETRY_INCOMPLETE", message: (cg && cg.message) || "几何不完整，本批不创建", missingTexts: [] };
    }
    return { code: "NATIVE_NO_TRUTH", message: "无 Native 文字真值，本批不创建", missingTexts: [] };
  }
  async function maybeApplyNativeTruth(blocks, img, diag) {
    if (!STAGE9_NATIVE_TRUTH) {
      return { blocks: blocks || [], mode: "OFF", skipped: true }; // feature off：保留历史降级（Completeness Gate 不适用）
    }
    if (typeof alignNativeGeometry !== "function" || typeof evaluateCompleteness !== "function" || typeof recognizeWithFallback !== "function") {
      ocrLog("TRUTH", "native dependencies missing (align/evaluate/recognize)");
      return { blocks: [], mode: "OFF", skipped: true, reason: "dependency-missing", blocked: true };
    }
    try {
      // OCR-P0.2：复用 runNativeTruth 已执行的第一主链结果；仅在直接进入（manual-local 等）时补执行
      let native = (img && img._native) || null;
      if (!native) {
        if (typeof recognizeWithFallback !== "function") return { blocks: blocks || [], mode: "OFF", skipped: true };
        try { native = await recognizeWithFallback(img.dataUrl, {
          textType: "2", // OCR-P1 Commit 1：生产 Truth 固定 textType=2
          pageId: (img && img.pageId) || null,
          transactionId: (img && img.transactionId) || null,
          imageFingerprint: (img && img.imageFingerprint) || null
        }); img._native = native; } catch (eN) { native = null; }
      }
      if (!(native && native.ok)) {
        const ncode = String((native && native.error && native.error.errorCode) || "?");
        ocrLog("TRUTH", "native unavailable " + ncode + " -> block create (禁止其它 OCR text 进入画布)");
        return { blocks: [], mode: "OFF", skipped: true, reason: "unavailable", blocked: true, nativeFailCode: ncode };
      }
      // OCR-P0.3-F（行级摊平）：aligner 按 Native 行配对行级几何；buildTextBlocks 合并块（多行）会
      // 让几何槽位 < nativeLines（如 6 块 vs 10 行）→ 误配 INCOMPLETE。此处优先摊平 block.lines，
      // 每行发布一个候选（仅几何 + 行文本匹配因子，不写 text truth）；无 lines 时回退整块。
      const geoBlocks = [];
      (blocks || []).forEach(function (b) {
        if (!b || !b.bbox) return;
        const lines = (Array.isArray(b.lines) && b.lines.length) ? b.lines : null;
        if (lines) {
          lines.forEach(function (ln, li) {
            if (!ln || !ln.bbox) return;
            geoBlocks.push({
              text: ln.text != null ? String(ln.text) : null,
              bbox: ln.bbox,
              words: (ln.wordBoxes || ln.words) ? (ln.wordBoxes || ln.words) : null,
              sourceProvider: b.sourceProvider || "BAIDU",
              kind: "line",
              lineIndex: li,
              blockIndex: b.blockIndex != null ? b.blockIndex : null,
              _raw: ln,
              _block: b
            });
          });
        } else {
          geoBlocks.push({ text: b.text != null ? String(b.text) : null, bbox: b.bbox || null, words: (b.wordBoxes || b.words) ? (b.wordBoxes || b.words) : null, sourceProvider: b.sourceProvider || "BAIDU", kind: "line", _raw: b, _block: b });
        }
      });
      const matched = alignNativeGeometry(native.texts || [], geoBlocks, {});
      // OCR-P1 Commit 3c.1：真机 runner 用初始 aligner 快照（recovery 前）
      try { window.__zyInitialGate = { matched: (matched.matchedNative || []).length, unmatched: (matched.unmatchedNative || []).length, totalNative: (matched.gate && matched.gate.totalNative) || 0 }; } catch (e) {}
      // OCR-P1 Commit 2：Native Geometry Recovery —— aligner 未匹配的 Native 行沿搜索链
      // 恢复 geometry（BAIDU LINE → BAIDU WORD；LOCAL/ANCHOR/INK 为后续 Commit）。
      // 恢复产物并入 matchedNative（text 恒为 native.rawText），再交由 Completeness Gate。
      // 硬规则：禁止固定间距/offset/居中/随机/multiplier 猜测；不可恢复 → 仍 INCOMPLETE/UNRESOLVED。
      // OCR-P1 Commit 4.4：Native Anchor 候选（只读 getTextInventory，page-bridge 零改动）。
      //   Anchor = 当前编辑页画布已有 textbox；identity=原生 uuid；几何 = canvas→源图逆投影
      //   （buildImageTransform 仿射 + mapCanvasPointToImage），供 recovery 阶段 0 NATIVE_ANCHOR
      //   与阶段 4 IMAGE_INK（region→ink，仅几何不产 text）使用。
      let anchorCandidates = null;
      let inkResolver39 = null;
      try {
        const geo4 = ocrTarget && ocrTarget.geo;
        const tG4 = (geo4 && geo4.aCoords && geo4.naturalWidth > 0 && geo4.naturalHeight > 0 && typeof buildImageTransform === "function" && typeof mapCanvasPointToImage === "function")
          ? buildImageTransform({ naturalWidth: geo4.naturalWidth, naturalHeight: geo4.naturalHeight, width: geo4.width, height: geo4.height, aCoords: geo4.aCoords }) : null;
        if (tG4) {
          const inv4 = await bridgeCall("getTextInventory", 2500);
          if (inv4 && inv4.ok && Array.isArray(inv4.items) && inv4.items.length) {
            anchorCandidates = inv4.items.map(function (it) {
              if (!it || !it.text || !it.center) return null;
              const crect = { x: (it.left != null ? it.left : 0), y: (it.top != null ? it.top : 0), width: (it.width || 0), height: (it.height || 0) };
              const cq = [{ x: crect.x, y: crect.y }, { x: crect.x + crect.width, y: crect.y }, { x: crect.x + crect.width, y: crect.y + crect.height }, { x: crect.x, y: crect.y + crect.height }];
              const iq = cq.map(function (pt) { try { return mapCanvasPointToImage(pt, tG4); } catch (e) { return null; } }).filter(Boolean);
              let imgRect = null;
              if (iq.length === 4) { var xs = iq.map(function (q) { return q.x; }), ys = iq.map(function (q) { return q.y; }); imgRect = { x: Math.min.apply(null, xs), y: Math.min.apply(null, ys), width: Math.max.apply(null, xs) - Math.min.apply(null, xs), height: Math.max.apply(null, ys) - Math.min.apply(null, ys) }; }
              return {
                text: String(it.text), normalizedText: null,
                center: it.center || null, yIndex: null,
                width: (it.width != null ? it.width : null), height: (it.height != null ? it.height : null),
                angle: (it.angle != null ? it.angle : null),
                identity: { uuid: it.objectUuid || null },
                geometry: imgRect ? { bbox: imgRect } : null,
                imageRegion: imgRect
              };
            }).filter(Boolean).filter(function (a) { return a.geometry; });
            if (!anchorCandidates.length) anchorCandidates = null;
          }
        }
      } catch (eA) { anchorCandidates = null; ocrLog("TRUTH", "anchor-collect exception " + String(eA && eA.message || eA).slice(0, 120)); }
      // ImageInk resolver（同步闭包）：deocded gray + anchor imageRegion → resolveInkGeometry；
      //   无区域 / 无 gray → 明确 NO_ANCHOR_REGION（不猜位置）。
      try {
        if (anchorCandidates && img && img.dataUrl) {
          const gray4 = await new Promise(function (resolve) {
            const im4 = new Image();
            im4.onload = function () { try { var cv4 = document.createElement("canvas"); cv4.width = im4.naturalWidth; cv4.height = im4.naturalHeight; var g4 = cv4.getContext("2d", { willReadFrequently: true }); g4.drawImage(im4, 0, 0); var d4 = g4.getImageData(0, 0, cv4.width, cv4.height); var out = new Uint8Array(cv4.width * cv4.height); for (var k = 0; k < out.length; k += 1) { var j4 = k * 4; out[k] = Math.round(0.299 * d4.data[j4] + 0.587 * d4.data[j4 + 1] + 0.114 * d4.data[j4 + 2]); } resolve({ gray: out, width: cv4.width, height: cv4.height }); } catch (e) { resolve(null); } };
            im4.onerror = function () { resolve(null); };
            im4.src = img.dataUrl;
          });
          if (gray4) {
            inkResolver39 = function (n) {
              if (typeof resolveInkGeometry !== "function") return { ok: false, reason: "NO_RESOLVER" };
              var keyText = (n && n.rawText != null) ? String(n.rawText) : "";
              var acSel = null;
              if (anchorCandidates) {
                var kn = function (s) { return String(s || "").toLowerCase().replace(/[\s\u3000\u00a0]+/g, "").replace(/[·•．。，，、；“”‘’（）【】［］：：-]/g, ""); };
                var nk5 = kn(keyText);
                if (nk5) acSel = anchorCandidates.find(function (a) { return a.text && kn(a.text) === nk5; }) || null;
              }
              if (!acSel || !acSel.imageRegion) return { ok: false, reason: "NO_ANCHOR_REGION" };
              return resolveInkGeometry({ native: n, region: acSel.imageRegion, gray: gray4.gray, imageWidth: gray4.width, imageHeight: gray4.height });
            };
          }
        }
      } catch (eInk) { inkResolver39 = null; }

      let recovery = null;
      if ((matched.unmatchedNative || []).length > 0 && typeof recoverNativeGeometry === "function") {
        const imgNW = (img && (img.naturalWidth || img.width)) || null;
        const imgNH = (img && (img.naturalHeight || img.height)) || null;
        recovery = recoverNativeGeometry(matched.unmatchedNative, {
          lineCandidates: matched.unusedGeometry || [],      // 剩余 line 级候选（含 wordBoxes 展开）
          occupiedGeometries: matched.matchedGeometry || [], // 已被 aligner 消费的几何
          anchorCandidates: anchorCandidates || [],       // Commit 4.4：NATIVE_ANCHOR（首选；canvas→源图逆投影几何）
          inkResolver: inkResolver39 || null,              // Commit 4.4：IMAGE_INK（末位；无区域不猜）
          imageBounds: (imgNW && imgNH) ? { x: 0, y: 0, width: imgNW, height: imgNH } : null,
          thresholds: { rowTol: 8 }
        });
        (recovery.recovered || []).forEach(function (rc) {
          matched.matchedNative.push({ native: rc.native, geometry: rc.geometry, match: { score: rc.score, method: rc.source, factors: rc.evidence, recovery: true } });
        });
        matched.unmatchedNative = recovery.unresolved || [];
        matched.gate = matched.gate || {};
        matched.gate.matched = matched.matchedNative.length;
        matched.gate.unmatchedNative = matched.unmatchedNative.length;
        matched.gate.geometryRecovered = (recovery.recovered || []).length;
        matched.gate.geometryRecoverySource = (recovery.recovered || []).map(function (rr) { return rr.source; });
        matched.gate.geometryRecoveryRejected = (recovery.rejected || []).map(function (rj) { return { reason: rj.reason, of: rj.native && rj.native.rawText }; });
        matched.recovery = recovery;
      }
      // OCR-P1 Commit 3b：LOCAL sidecar 第二段 —— 第一段(line/word)后仍 unresolved 且开关开启时
      // 对同图跑本地识别拿 line 级几何补位（只提供 geometry；text 恒来自 Native）。
      try { window.__zySidecarCond = { unmatched: (matched.unmatchedNative || []).length, flag: STAGE9_LOCAL_SIDECAR, fnSide: typeof runLocalGeometrySidecar === "function", fnRec: typeof recoverNativeGeometry === "function" }; } catch (e) {}
            if ((matched.unmatchedNative || []).length > 0 && STAGE9_LOCAL_SIDECAR && typeof runLocalGeometrySidecar === "function" && typeof recoverNativeGeometry === "function") {
      // entered 标记已迁移至 await 后
                const localCands = await runLocalGeometrySidecar(img);
        matched.gate = matched.gate || {};
        if (localCands && localCands.length) {
          const occ = (matched.matchedGeometry || []).map(function (og) { return { bbox: og.bbox }; });
          if (recovery && Array.isArray(recovery.recovered)) recovery.recovered.forEach(function (rr) { occ.push({ bbox: rr.geometry && rr.geometry.bbox }); });
          const rec2 = recoverNativeGeometry(matched.unmatchedNative, {
            lineCandidates: [],                       // 第一阶段已尽力，不重复 BAIDU
            localCandidates: localCands,              // LOCAL 级（第三优先）
            occupiedGeometries: occ.filter(function (x) { return x && x.bbox; }),
            imageBounds: ((img && (img.naturalWidth || img.width)) && (img.naturalHeight || img.height)) ? { x: 0, y: 0, width: img.naturalWidth || img.width, height: img.naturalHeight || img.height } : null,
            thresholds: { rowTol: 8 }
          });
          (rec2.recovered || []).forEach(function (rc) {
            matched.matchedNative.push({ native: rc.native, geometry: rc.geometry, match: { score: rc.score, method: rc.source, factors: rc.evidence, recovery: true } });
          });
          matched.unmatchedNative = rec2.unresolved || [];
          matched.gate.matched = matched.matchedNative.length;
          matched.gate.unmatchedNative = matched.unmatchedNative.length;
          matched.gate.geometryRecovered = (matched.gate.geometryRecovered || 0) + (rec2.recovered || []).length;
          matched.gate.geometryRecoverySource = [].concat(matched.gate.geometryRecoverySource || [], (rec2.recovered || []).map(function (rr) { return rr.source; }));
          matched.gate.localSidecar = { used: true, candidates: localCands.length, recovered: (rec2.recovered || []).length }; try { window.__zySidecarCond = Object.assign({}, window.__zySidecarCond || {}, { branch: "if", localTexts: (localCands || []).map(function (lc) { return String(lc.text || "").slice(0, 24); }) }); } catch (e) {} // IF
        } else {
          try { window.__zySidecarCond = Object.assign({}, window.__zySidecarCond || {}, { branch: "else" }); } catch (e) {}
          matched.gate.localSidecar = { used: true, candidates: (localCands || []).length, recovered: 0 };
        }
        ocrLog("TRUTH", "local-sidecar: candidates=" + ((localCands || []).length) + " recovered=" + ((matched.gate.localSidecar && matched.gate.localSidecar.recovered) || 0) + " unresolvedAfter=" + matched.unmatchedNative.length);
      }

      // 构造 kept block（text 恒 = native.rawText；geometry 取自匹配候选 —— P0.3-C Provider 不提供最终 text）
      const kept = (matched.matchedNative || []).map(function (m) {
        const g = m.geometry;
        const raw = (g && g._raw) || (g && g.synthetic ? null : null) || null;
        const bbox = (g && g.bbox) || (raw && raw.bbox) || null;
        return Object.assign({}, raw || {}, {
          text: m.native.rawText,
          rawText: m.native.rawText,
          textSource: "NATIVE_OCR",
          textTruth: { nativeId: m.native.id != null ? m.native.id : null, order: m.native.order != null ? m.native.order : null, nativeRawText: m.native.rawText, geometryStatus: (g && g.synthetic) ? "GEOMETRY_SYNTHETIC_UNION" : "GEOMETRY_FROM_CANDIDATE", matchMethod: m.match && m.match.method },
          bbox: bbox
        });
      });
      const gate = {
        totalNative: (native.texts || []).length,
        totalBlocks: geoBlocks.length,
        matched: (matched.matchedNative || []).length,
        unmatchedNative: (matched.unmatchedNative || []).length,
        matchedGeometry: (matched.matchedGeometry || []).length,
        unusedGeometry: (matched.unusedGeometry || []).length,
        oneToMany: matched.gate ? matched.gate.oneToMany : 0,
        manyToOne: matched.gate ? matched.gate.manyToOne : 0,
        allTextTruthValid: true,
        localSidecar: (matched.gate && matched.gate.localSidecar) || null, // OCR-P1 Commit 3c.5：sidecar 诊断透传（否则报表 sidecarUsed=false）
        geometryRecovered: (matched.gate && matched.gate.geometryRecovered) || 0,
        geometryRecoverySource: (matched.gate && matched.gate.geometryRecoverySource) || [],
        geometryRecoveryRejected: (matched.gate && matched.gate.geometryRecoveryRejected) || [],
        failureCode: null
      };
      // Text Truth Gate：kept.text 必须 === native.rawText（历史语义保留）
      if (typeof validateNativeText === "function") {
        for (let gi = 0; gi < kept.length; gi += 1) {
          const v = validateNativeText({ text: kept[gi].text, textSource: kept[gi].textSource }, { rawText: kept[gi].rawText });
          if (!v.ok) { gate.allTextTruthValid = false; gate.failureCode = v.code; break; }
        }
      }
      pipelineEvidence({ stage: "NATIVE", nativeLines: gate.totalNative, nativeMode: (native.meta && native.meta.modeUsed) || null, nativeFallback: !!(native.meta && native.meta.fallbackUsed), statusCode: (native.meta && native.meta.statusCode) || null, kept: gate.matched, nativeBlocks: gate.totalBlocks, unmatchedNative: gate.unmatchedNative, unusedGeometry: gate.unusedGeometry, oneToMany: gate.oneToMany, manyToOne: gate.manyToOne, fail: (!gate.matched) ? ((gate.allTextTruthValid) ? "NATIVE_UNMATCHED" : (gate.failureCode || "NATIVE_EMPTY")) : null });
      ocrLog("TRUTH", "align native=" + gate.totalNative + " geo=" + gate.totalBlocks + " matched=" + gate.matched + " unmatchedNative=" + gate.unmatchedNative + " unusedGeo=" + gate.unusedGeometry + " 1:N=" + gate.oneToMany + " N:1=" + gate.manyToOne + " valid=" + gate.allTextTruthValid);
      try { window.__zyNativeGateSummary = { totalNative: gate.totalNative, initialMatched: (window.__zyInitialGate && window.__zyInitialGate.matched) || 0, initialUnmatched: (window.__zyInitialGate && window.__zyInitialGate.unmatched) || 0, finalMatched: gate.matched, finalUnmatched: gate.unmatchedNative, missingTexts: ((matched.unmatchedNative || []).map(function (x) { return x && x.rawText != null ? String(x.rawText) : ""; }).filter(Boolean)), geometryRecovered: gate.geometryRecovered || 0, geometryRecoverySource: gate.geometryRecoverySource || [], localSidecar: gate.localSidecar || null }; } catch (e) {}
      return { blocks: kept, mode: "NATIVE_TRUTH", native: native, matched: matched, gate: gate };
    } catch (e) {
      ocrLog("TRUTH", "exception " + String(e && (e.message || e) || "").slice(0, 160));
      return { blocks: blocks || [], mode: "OFF", skipped: true };
    }
  }

  // 本地 Tesseract 执行器（manual local / auto 下 Cloud 失败后的 local-fallback 共用，§8.1）
  // executor 结构严格复刻 5.5A 已验证版本（node 复现：原 userscript 版尾部括号不平衡 → "Unexpected token ')'" → 脚本未执行 → 死等超时）
  // OCR-P1 Commit 3c：共享本地引擎 loader（runLocalOcr 与 runLocalGeometrySidecar 复用，
  // 不复制两套下载逻辑）。cache 存在直接返回；否则下载 OCR_CDN 并校验 HTTP/status/
  // responseText，成功缓存 ocrEngineCache；失败返回 SIDE_CAR_ENGINE_LOAD_FAILED。
  function ensureLocalOcrEngine() {
    return new Promise((resolve) => {
      if (typeof ocrEngineCache === "string" && ocrEngineCache.length > 1000 && ocrEngineCache.indexOf("createWorker") >= 0) { try { window.__zyLocalEngineState = { loaded: true, bytes: ocrEngineCache.length }; } catch (e) {}
            resolve({ ok: true, engine: ocrEngineCache }); return; }
      GM_xmlhttpRequest({
        method: "GET", url: OCR_CDN, timeout: 45000,
        onload: (x) => {
          if (x.status >= 200 && x.status < 300 && x.responseText && x.responseText.length > 1000 && x.responseText.indexOf("createWorker") >= 0) {
            ocrEngineCache = x.responseText;
            try { window.__zyLocalEngineState = { loaded: true, bytes: x.responseText.length }; } catch (e) {}
            ocrLog("LOCAL_LOADING", "engine downloaded " + x.responseText.length + " chars");
            resolve({ ok: true, engine: ocrEngineCache });
          } else {
            resolve({ ok: false, code: "SIDE_CAR_ENGINE_LOAD_FAILED", reason: "http " + x.status });
          }
        },
        onerror: () => { try { window.__zyLocalEngineState = { loaded: false, reason: "network" }; } catch (e) {} resolve({ ok: false, code: "SIDE_CAR_ENGINE_LOAD_FAILED", reason: "network" }); }
      });
    });
  }
  
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
      const timer = setInterval(async () => {
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
            // Stage 8D §十九取证：raw words 证据（含 bbox/置信度）—— 供 raw→normalized→accepted→blocked 统计与行聚类审计
            ocrLog("RAW_WORDS8D", ((r.words || []).map((wo) => String(wo.text || "").slice(0, 8) + "@" + JSON.stringify({ x: Math.round((wo.bbox && (wo.bbox.x0 != null ? wo.bbox.x0 : wo.bbox.x)) || 0), y: Math.round((wo.bbox && (wo.bbox.y0 != null ? wo.bbox.y0 : wo.bbox.y)) || 0), w: Math.round((wo.bbox && (wo.bbox.x1 != null ? Math.abs(wo.bbox.x1 - wo.bbox.x0) : wo.bbox.width)) || 0), h: Math.round((wo.bbox && (wo.bbox.y1 != null ? Math.abs(wo.bbox.y1 - wo.bbox.y0) : wo.bbox.height)) || 0) }) + (typeof wo.confidence === "number" ? ":" + Math.round(wo.confidence * 100) : "")).join("|")).slice(0, 4000));
            emitOcrDiag(Object.assign({}, diag, { reason: null }));
            const size = { width: r.w || img.width, height: r.h || img.height };
            // Stage 8D 取证：tesseract 原始输出字段化落盘（防循环引用；供 runner 抓取后在 node 完整复现聚合/合并）
            try { window.__zy8dRaw = JSON.stringify({ w: (r.words || []).map(function (x) { return { text: x.text, bbox: x.bbox, confidence: x.confidence }; }), l: (r.lines || []).map(function (x) { return { text: x.text, bbox: x.bbox }; }), size: size }); } catch (e) { try { window.__zy8dRaw = "__SE_ERR:" + String(e && e.message || e).slice(0, 120); } catch (e2) {} }
            let unified = null;
            if (r.words && r.words.length && typeof aggregateLineCandidates === "function") {
              try {
                unified = aggregateLineCandidates(r.words, size, r.lines);
                if (!unified.length) {
                  ocrLog("GROUP", "empty aggregated words=" + r.words.length + " sampleKeys=" + JSON.stringify(Object.keys(r.words[0] || {})) + " bboxKeys=" + JSON.stringify(Object.keys((r.words[0] || {}).bbox || {})));
                  unified = null;
                }
              } catch (e) {
                ocrLog("ERROR", "grouping8d: " + String(e && (e.stack || (e.message ? "msg:" + e.message : e)) || e).slice(0, 400));
                unified = null;
              }
            }
            if (!unified) unified = unifyCandidates((r && r.lines) || [], size, { sourceProvider: "LOCAL" }); // Stage 7.8 §五：Local 结果打标 LOCAL
            if (unified && unified.length && typeof aggregateLineCandidates === "function") {
              ocrLog("GROUP", "lines=" + unified.length + " y=" + unified.map((l) => Math.round(l.bbox.y || 0)).join(",") + " h=" + unified.map((l) => Math.round(l.bbox.height || 0)).join(","));
            }
            // Stage 8D 取证打点：unified 第一元素形态（定位 reading 'slice' 崩点）
            if (unified && unified[0]) {
              ocrLog("TRACE8D", "unified=" + unified.length + " k0=" + JSON.stringify(Object.keys(unified[0])) + " b0=" + JSON.stringify({ y: unified[0].bbox && unified[0].bbox.y, h: unified[0].bbox && unified[0].bbox.height, t: String(unified[0].text || "").slice(0, 6) }));
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
            // Stage 7.8 §三十二/§四十一：六维质量门分级诊断（local 末端同样记录，不改终态判定）
            const localBundle = (typeof bundleOcrQuality === "function")
              ? bundleOcrQuality(localKept, { provider: "LOCAL", imageSize: { width: size.width || img.width, height: size.height || img.height } })
              : null;
            if (localBundle) {
              emitOcrDiag(Object.assign({}, diag, { fallback: !!diag.fallback, quality6: { overall: localBundle.overall, reasonCode: localBundle.reasonCode, total: localBundle.total, text: localBundle.textQuality && localBundle.textQuality.status, block: localBundle.blockQuality && localBundle.blockQuality.status, bbox: localBundle.bboxQuality && localBundle.bboxQuality.status, size: localBundle.sizeQuality && localBundle.sizeQuality.status, symbol: localBundle.symbolQuality && localBundle.symbolQuality.status, merge: localBundle.mergeQuality && localBundle.mergeQuality.status } }));
            }
            const gate8d = runCandidateGate(localKept, { width: size.width || img.width, height: size.height || img.height });
            if (!gate8d.ok) { ocrRunning = false; setStatus("OCR 候选质量门阻断（" + String(gate8d.reason || "invalid-result") + "），未生成文字"); ocrLog("GATE8D", "block-set suspect: " + (gate8d.setSuspectReasons || []).join("|")); return; }
            ocrLog("TRACE8D", "gate-kept=" + (gate8d.validated || []).length + " score=" + (gate8d.score && gate8d.score.score));
            const blocks = (typeof buildTextBlocks === "function")
              ? buildTextBlocks(gate8d.validated)
              : (gate8d.validated || []).map(oneLineBlock);
            ocrLog("TRACE8D", "blocks=" + (blocks || []).length);
            const tb = await maybeApplyNativeTruth(blocks, img, diag); // Stage 9 V3：Native Text Truth（feature gate；OFF 时原样）
            // OCR-P1 Commit 1：Local path 同样必须通过 Native Truth Gate（审计 C 泄漏修复）
            if (!nativeTruthGatePassed(tb)) {
              const fgL = nativeTruthGateFail(tb);
              ocrRunning = false;
              setStatus(fgL.message);
              ocrLog("NATIVE_GATE", "local-path code=" + fgL.code + " blocked=" + !!((tb && tb.blocked)));
              pipelineEvidence({ stage: "NATIVE_GATE", path: "LOCAL", code: fgL.code, blocked: !!((tb && tb.blocked)), blockCreate: true });
              return;
            }
            const _fg2 = nativeTruthGateFail(tb);
            if (_fg2 && _fg2.code === "NATIVE_PARTIAL_OK") {
              ocrRunning = true; setStatus(_fg2.message);
              OCR_PARTIAL_LAST_MISSING = (_fg2.missingTexts || []).slice();
            }
            buildItemsFromOcr(tb.blocks, img, diag).catch((eBuild) => { ocrRunning = false; setStatus("识别异常：" + String(eBuild && eBuild.message || eBuild).slice(0, 100)); ocrLog("ERROR", "buildItemsFromOcr: " + String(eBuild && eBuild.stack || (eBuild && eBuild.message || eBuild)).slice(0, 300)); });
          } catch (e) {
            ocrRunning = false; setStatus("OCR 结果解析失败"); ocrLog("ERROR", "parse8d: " + String(e && (e.stack || (e.message ? "msg:" + e.message : e)) || e).slice(0, 600));
            emitOcrDiag(Object.assign({}, diag, { fallback: !!diag.fallback, reason: "exception" }));
          }
        } else if (tries > OCR_TIMEOUT_TRIES) {
          clearInterval(timer); ocrRunning = false; setStatus("OCR 超时（超过 120 秒），请稍后重试"); ocrLog("ERROR", "timeout");
          emitOcrDiag(Object.assign({}, diag, { fallback: !!diag.fallback, reason: "timeout" }));
        }
      }, 500);
    };
    const eng = await ensureLocalOcrEngine(); // OCR-P1 Commit 3c：复用共享 loader（下载逻辑收敛）
    if (eng.ok) { run(eng.engine); return; }
    ocrRunning = false;
    setStatus("OCR 引擎加载失败（" + String(eng.reason || eng.code || "?") + "）");
    ocrLog("ERROR", "engine: " + String(eng.code || "?") + " " + String(eng.reason || ""));
    emitOcrDiag(Object.assign({}, diag, { fallback: !!diag.fallback, reason: "http-error", error: "engine load " + String(eng.reason || eng.code) }));
    // OCR-P1 Commit 3c：旧下载逻辑已收敛至 ensureLocalOcrEngine()
  }
  // OCR-P1 Commit 3b：LOCAL geometry sidecar —— 仅供 geometry 补位使用。
  // 语义：仅当 unmatchedNative 仍 >0 且开关开启时，对同图跑本地识别，
  // 产出 line 级候选（[{text, bbox}]，sourceProvider=LOCAL）；绝不创建 textbox，
  // 不碰 ocrRunning 锁；引擎缺失/失败/超时返回 []（不阻断主链 Native Truth）。
  async function runLocalGeometrySidecar(img) {
    if ((typeof unifyCandidates !== "function") || (typeof GM_addElement !== "function")) return [];
    const eng = await ensureLocalOcrEngine(); // OCR-P1 Commit 3c：首次使用真正加载引擎
    if (!eng.ok) { ocrLog("SIDECAR", "engine not ready " + (eng.code || "?") + " " + (eng.reason || "")); return []; }
    return await new Promise((resolve) => {
      let settled = false;
      const done = (cands) => { if (settled) return; settled = true; resolve(Array.isArray(cands) ? cands : []); };
      try {
        const executor = "(function(){var module={exports:{}};var exports=module.exports;var define;var require;" +
          eng.engine + "\n" +
          "var T=module.exports;" +
          "if(!T||typeof T.createWorker!=='function'){document.documentElement.setAttribute('data-zy-sidecar-result',JSON.stringify({ok:false,err:'engine'}));return;}" +
          "window.addEventListener('message',function(ev){if(!ev.data||ev.data.source!=='zy-ocr-sidecar')return;" +
          "T.createWorker('chi_sim',1,{cacheMethod:'indexeddb'}).then(function(w){return w.recognize(ev.data.dataUrl).then(function(r){" +
          "var lines=(r.data.lines||[]).filter(function(l){return l&&l.text&&l.bbox;}).map(function(l){return {text:l.text,bbox:l.bbox};});" +
          "w.terminate();" +
          "document.documentElement.setAttribute('data-zy-sidecar-result',JSON.stringify({ok:true,lines:lines,w:r.data.imageWidth,h:r.data.imageHeight}));" +
          "});" +
          "}).catch(function(e){document.documentElement.setAttribute('data-zy-sidecar-result',JSON.stringify({ok:false,err:String(e&&e.message||e).slice(0,120)}));});" +
          "});"+
          "})();";
        GM_addElement("script", { textContent: executor });
        document.documentElement.setAttribute("data-zy-sidecar-result", "");
        window.postMessage({ source: "zy-ocr-sidecar", dataUrl: img.dataUrl }, location.origin);
        let tries = 0;
        const timer = setInterval(() => {
          tries += 1;
          const out = document.documentElement.getAttribute("data-zy-sidecar-result");
          if (out) {
            clearInterval(timer); settled = true;
            try {
              const r = JSON.parse(out);
              if (!(r && r.ok)) { resolve([]); return; }
              const size = { width: r.w || img.width, height: r.h || img.height };
              resolve(unifyCandidates((r.lines || []), size, { sourceProvider: "LOCAL" }));
            } catch (e) { resolve([]); }
            return;
          }
          if (tries > 120) { clearInterval(timer); done([]); } // ~60s 超时兜底
        }, 500);
      } catch (e) { done([]); }
    });
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
      pipelineEvidence({ stage: "PREP", ocrStart: new Date().toISOString(), kind: prep.kind, natural: prep.width + "x" + prep.height, sourceImage: prep.fingerprint ? prep.fingerprint : (prep.dataUrl ? "dataUrl:" + prep.dataUrl.length + "chars" : null) });
      ocrTarget = { kind: prep.kind, geo: prep.geometry };
      // Stage 8B STEP 5：真实模板字体（StyleCandidate 来源 1，禁止硬编码"思源黑体 Regular"）
      ocrTarget.fontStyle = prep.templateFont || null;
      // Stage 7.6（Page Ownership §13/§14/§15）：冻结 OCR Source Page —— 图片与页面同帧捕获（ocrPrepare.page），
      // 若缺省则回退 getCurrentPage；自此刻起用户如何切页，OCR 结果仍属于 sourcePageId。
      // 无法可靠识别页面 → 停止 OCR（CURRENT_PAGE_UNKNOWN），严禁静默默认 FRONT。
      let srcPage = (prep.page && prep.page.ok) ? prep.page : await bridgeCall("getCurrentPage", 2500);
      if (!srcPage || !srcPage.ok || !srcPage.pageId) {
        const pcode = (srcPage && srcPage.code) || "CURRENT_PAGE_UNKNOWN";
        setStatus("无法确定当前图片所属页面（" + pcode + "），已停止识别。请确认当前正处于正面/背面编辑页后重试。");
        ocrLog("ERROR", "source page unavailable srcPage=" + JSON.stringify(srcPage));
        ocrRunning = false; ocrTarget = null;
        return;
      }
      ocrTarget.pageId = srcPage.pageId;
      ocrTarget.side = (srcPage.side === "FRONT" || srcPage.side === "BACK") ? srcPage.side : "UNKNOWN";
      ocrTarget.pageSource = srcPage.sideSource || null;
      // Stage 9 V4 P1（§三）：冻结 OCR Transaction Identity —— pageId/side/canvasId/imageFingerprint 一次锁定，
      // 正反面各自独立 Session；图片指纹由 dataUrl 计算（同图同帧 → 同指纹）。
      // OCR-P0.5：统一 Transaction —— 同一 OCR Transaction = 同一图片 = 同一 pageId。
      // naturalWidth/naturalHeight 来自 IMAGE_PREP（原始自然尺寸）；payloadBytes 为解码后的真实字节数
      // （buildFormPayload 校验 File.size === payloadBytes，禁止 Baidu 图 A / Native 图 B）。
      const _prepIp = (prep && prep.imagePrep) || null;
      ocrTarget.transaction = (typeof createTransaction === "function")
        ? createTransaction({ pageId: srcPage.pageId, side: ocrTarget.side, canvasId: srcPage.canvasId || null, dataUrl: prep.dataUrl, imageWidth: prep.width, imageHeight: prep.height, naturalWidth: (_prepIp && _prepIp.naturalWidth) || prep.width, naturalHeight: (_prepIp && _prepIp.naturalHeight) || prep.height, payloadBytes: (_prepIp && typeof _prepIp.decodedBytes === "number") ? _prepIp.decodedBytes : null })
        : null;
      // §26：记录本页最近事务（同图重识别 → RECOGNITION_RETRY 判定）
      if (ocrTarget.transaction) stage9TxByPage[srcPage.pageId] = { pageId: srcPage.pageId, imageFingerprint: ocrTarget.transaction.imageFingerprint, ts: Date.now() };
      ocrLog("SOURCE_PAGE", "pageId=" + srcPage.pageId + " side=" + srcPage.side + " source=" + (srcPage.sideSource || "n/a") + " tx=" + (ocrTarget.transaction && ocrTarget.transaction.transactionId || "n/a") + " fp=" + (ocrTarget.transaction && ocrTarget.transaction.imageFingerprint || "n/a"));
      const img = { dataUrl: prep.dataUrl, width: prep.width, height: prep.height, naturalWidth: (ocrTarget.transaction && ocrTarget.transaction.naturalWidth) || prep.width, naturalHeight: (ocrTarget.transaction && ocrTarget.transaction.naturalHeight) || prep.height, payloadBytes: (ocrTarget.transaction && ocrTarget.transaction.payloadBytes) || null, pageId: srcPage.pageId, side: ocrTarget.side, canvasId: srcPage.canvasId || null, transactionId: (ocrTarget.transaction && ocrTarget.transaction.transactionId) || null, imageFingerprint: (ocrTarget.transaction && ocrTarget.transaction.imageFingerprint) || null };
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

  // Stage 8D §四~§八：OCR Candidate Quality Gate —— 逐块硬门剔除（TINY/GIANT/单字符噪点/越界/低置信）
  // + block-set 聚合怀疑（碎片占比/强重叠/超大覆盖）→ suspect 整体阻断 reconstruction。
  // 状态语义：OCR_DETECTED（原始）→ OCR_VALIDATED（gate 通过）→ RECONSTRUCTION_READY（buildItems）
  // → RECONSTRUCTION_CREATED（native 创建）→ RECONSTRUCTION_VERIFIED（ink/geometry 验证）。
  // 纯函数缺失（@require 未加载/旧版）时安全降级：全部放行（与原行为一致，不误伤）。
  let currentGateScore = 0.9; // 最近一次 gate 的 Readiness Score（供 buildItemsFromOcr 的字号融合使用）
  function runCandidateGate(candList, size) {
    if (typeof validateBlockSet !== "function") return { ok: true, validated: candList, blocked: [], suspect: false, setSuspectReasons: [], degraded: true };
    const g = validateBlockSet(candList, size, { imageSize: size });
    const bDetail = (g.blocked || []).map(function (b) { return b.index + ":" + ((b.reasons || []).join("|")) + ":" + String(b.text || ""); }).join(",");
    ocrLog("GATE8D", "total=" + g.total + " blocked=" + (g.blocked || []).length + " [" + bDetail + "] kept=" + (g.validated || []).length + " suspect=" + (g.setSuspectReasons || []).join("|") + " score=" + (g.score && g.score.score));
    currentGateScore = (g.score && typeof g.score.score === "number") ? g.score.score : 0.9;
    if (g.suspect || !g.ok) {
      ocrLog("GATE8D", "BLOCK_SET_SUSPECT " + (g.setSuspectReasons || []).join("|") + " aggregate-fragments=" + (g.aggregate && g.aggregate.fragments) + "/" + g.total + " heavyOverlap=" + (g.aggregate && g.aggregate.heavyOverlapPairs) + " maxCover=" + (g.aggregate && g.aggregate.maxCoverRatio));
      return { ok: false, reason: (g.setSuspectReasons && g.setSuspectReasons.join("|")) || g.reason || "OCR_BLOCK_SET_SUSPECT", validated: g.validated || [], blocked: g.blocked || [], suspect: true, setSuspectReasons: g.setSuspectReasons || [], aggregate: g.aggregate || null };
    }
    return { ok: true, validated: g.validated || [], blocked: g.blocked || [], suspect: false, setSuspectReasons: [], aggregate: g.aggregate || null, score: g.score || null };
  }

  async function buildItemsFromOcr(blocks, img, diag) {
    // Stage 6.1：消费 TextBlock（1 TextBlock = 1 textbox，§8 硬规则）。
    // block 结构：{text(含\n), bbox, center, confidence, wordBoxes, lineBoxes, lineCount, coordinateSpace}
    // 几何来自 ocrPrepare（页面世界已解析，隔离世界不直读画布）。P3：只消费统一候选边界。
    const geo = ocrTarget && ocrTarget.geo;
    if (!geo) { setStatus("OCR 目标已失效，请重新识别"); ocrLog("ERROR", "ocrTarget missing"); ocrRunning = false; return; }
    ocrLog("TRACE8D", "buildItems blocks=" + (blocks || []).length + " geoAC=" + !!(geo.aCoords) + " measurer=" + (typeof browserTextMeasurer === "function" ? "fn" : "no") + " fusion=" + (typeof solveFontSizeFusion === "function" ? "fn" : "no"));
    // Stage 7.6：source page 归属（ocrTarget 已在 handleOcrImage 冻结）—— 每个 item 携带 pageId/side，
    // 由 page-bridge 在创建前做 Ownership 硬门禁（Stage 7.7）。
    const srcPageId = (ocrTarget && ocrTarget.pageId) || null;
    const srcSide = (ocrTarget && ocrTarget.side) || null;
    // Stage 9 V4 P1（§三/§七）：本次事务身份（随 item 与 ocrCreate/ocrAdjust 消息逐级透传）
    const srcTxId = (ocrTarget && ocrTarget.transaction && ocrTarget.transaction.transactionId) || null;
    const srcTxFp = (ocrTarget && ocrTarget.transaction && ocrTarget.transaction.imageFingerprint) || null;
    const srcTxCanvas = (ocrTarget && ocrTarget.transaction && ocrTarget.transaction.canvasId) || null;
    // Stage 9 V4 §17~§28：Recognition Mode 路由（zyStage9Calibration=1 启用，默认开启——画布已有文字 → 校准而非复制）
    let recRoute = null;
    // Stage 10-D Commit C：模板槽位快照（getTextInventory 扩展字段）——TEMPLATE_MODE 传给 ocrCalibrate（slotsSnapshot）
    let templateSlotsSnapshot = [];
    const calFlag = (typeof GM_getValue === "function") ? GM_getValue("zyStage9Calibration", "1") : "1";
    if (calFlag === "1" && srcPageId && srcTxFp && typeof resolveRecognitionMode === "function") {
      try {
        const invRes = await bridgeCall("getTextInventory", 2500);
        const existingTextObjects = (invRes && invRes.ok && Array.isArray(invRes.items)) ? invRes.items : [];
        templateSlotsSnapshot = existingTextObjects.slice(); // Commit C：快照含 fontId/markuuid/layerNum/fill 等取证字段
        const prevTx = stage9TxByPage[srcPageId] ? [stage9TxByPage[srcPageId]] : [];
        recRoute = resolveRecognitionMode({ pageId: srcPageId, imageFingerprint: srcTxFp, existingTextObjects: existingTextObjects, previousTransactions: prevTx });
        if (recRoute) ocrLog("ROUTING", "mode=" + recRoute.mode + " existing=" + existingTextObjects.length + " sameImage=" + recRoute.sameImage + " reasons=" + ((recRoute.reasons || []).join("|") || "n/a"));
      } catch (eRoute) { ocrLog("ROUTING", "resolver exception " + String(eRoute && eRoute.message || eRoute).slice(0, 120)); recRoute = null; }
    }
    const w = geo.width, h = geo.height, sx = geo.scaleX || 1, sy = geo.scaleY || 1;
    // 背景图 left/top 可能缺失：ocrPrepare 已在页面世界用画布居中兜底（§13）
    const left = geo.left, top = geo.top;
    const angle = geo.angle || 0;
    const rad = (angle * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    const cx = left + (w * sx) / 2, cy = top + (h * sy) / 2;
    // Stage 8B STEP 5：一次性度量器 + StyleCandidate（模板真实字体优先，禁止硬编码"思源黑体 Regular"）
    const fontFamilyCandidate = (ocrTarget && ocrTarget.fontStyle && ocrTarget.fontStyle.fontFamily) || null;
    const fontMeas8b = (typeof browserTextMeasurer === "function") ? browserTextMeasurer() : null;
    const fontMeas8bAvailable = !!(fontMeas8b && fontMeas8b.available);
    const measureFamily = fontFamilyCandidate || "sans-serif";
    // Stage 8D P5-1（§四~§六）：字体来源 provenance 四层（纯诊断；不改变 measureFamily/创建行为）
    // 本轮无可靠站点默认/系统匹配证据 → siteDefault/systemMatch 传 null → 如实 FONT_FALLBACK。
    const fontProv = (typeof resolveFontSource === "function")
      ? resolveFontSource({ templateFamily: fontFamilyCandidate, siteDefaultFamily: null, systemMatchFamily: null })
      : { source: fontFamilyCandidate ? "FONT_REAL_TEMPLATE" : "FONT_FALLBACK", family: measureFamily, templateFamily: fontFamilyCandidate || null, siteDefaultFamily: null, systemMatchFamily: null, fallbackFamily: "sans-serif" };
    // 输出指标（§22）：forced wrapped 逻辑行数、多行 block 数
    let forcedWrapTotal = 0, multiLineTotal = 0;
    // Stage 8D §十八兜底：TextBlock 层（合并后）二次质量门 —— 合并可能产生 GIANT/TINY 异常块，
    // 必须在进入 Native 前拦截（禁止用 outer 尺寸失真块直接创建）。
    let workBlocks = (blocks || []).filter((b) => b && b.bbox && typeof b.bbox.x === "number" && b.bbox.width > 0);
    if (typeof validateBlockSet === "function" && workBlocks.length && geo.naturalWidth > 0) {
      const bg = validateBlockSet(workBlocks, { width: geo.naturalWidth, height: geo.naturalHeight }, { imageSize: { width: geo.naturalWidth, height: geo.naturalHeight } });
      if (bg.blocked && bg.blocked.length) ocrLog("GATE8D-BLOCK", "block-layer blocked=" + bg.blocked.map((b) => b.index + ":" + ((b.reasons || []).join("|")) + ":" + String(b.text || "")).join(","));
      if (bg.suspect) ocrLog("GATE8D-BLOCK", "block-layer set-suspect " + (bg.setSuspectReasons || []).join("|"));
      workBlocks = bg.validated || [];
      if (!workBlocks.length) { ocrRunning = false; setStatus("候选文字块经质量门后无有效块，未生成文字"); ocrLog("GATE8D-BLOCK", "all blocked, nothing to create"); return; }
    }
    // 8D §十六：状态链 —— gate 已过（candidate 层）标记 OCR_VALIDATED；进入 mapping 标记 RECONSTRUCTION_READY
    // Stage 9 P4-B §四/§五：ImageInk typography target 预取（只读；flag OFF 时零额外请求；失败显式 fallback）
    const inkByBlock = {};
    if (workBlocks.length && typeof bridgeCall === "function") {
      try {
        const inkRes = await bridgeCall("inkMeasure", 8000, { items: workBlocks.map(function (b, i) { return { blockIndex: i, bbox: { x: b.bbox.x, y: b.bbox.y, width: b.bbox.width, height: b.bbox.height } }; }) });
        if (inkRes && inkRes.ok && Array.isArray(inkRes.items)) inkRes.items.forEach(function (r) { if (r && r.blockIndex != null) inkByBlock[r.blockIndex] = r; });

      } catch (eInk) { ocrLog("FONT_TARGET", "inkMeasure exception " + String(eInk && eInk.message || eInk).slice(0, 120)); }
    }
    // Stage 9 Commit 8 A：per-line ImageInk（多行 block）—— 每行 line.bbox 独立测墨；
    // 字号证据 = median(逐行 ink 高) × effectiveScaleY（affine），禁止 whole-block 总高当单行字号。
    const lineInkByBlock = {};
    if (workBlocks.length && typeof bridgeCall === "function") {
      const lineReqs = [];
      workBlocks.forEach(function (b, i) { if (b.lines && b.lines.length > 1) b.lines.forEach(function (l, li) { if (l && l.bbox && l.bbox.width > 0) lineReqs.push({ blockIndex: i, lineIndex: li, bbox: { x: l.bbox.x, y: l.bbox.y, width: l.bbox.width, height: l.bbox.height } }); }); });
      if (lineReqs.length) {
        try {
          const lineRes = await bridgeCall("inkMeasure", 8000, { items: lineReqs });
          if (lineRes && lineRes.ok && Array.isArray(lineRes.items)) lineRes.items.forEach(function (r) { if (r && r.blockIndex != null) { if (!lineInkByBlock[r.blockIndex]) lineInkByBlock[r.blockIndex] = []; lineInkByBlock[r.blockIndex][r.lineIndex != null ? r.lineIndex : lineInkByBlock[r.blockIndex].length] = r; } });
        } catch (eLineInk) { ocrLog("FONT_TARGET", "per-line inkMeasure exception " + String(eLineInk && eLineInk.message || eLineInk).slice(0, 120)); }
      }
    }
    // Stage 10-A：Source Image foreground 主色提取（§九/§十/§十一/§十二/§二十）
    //   - 复用 ImageInk（inkByBlock.inkBox，缺失回落 bbox）作区域；纯模块对前景像素分桶求稳定主色
    //   - 禁止 OCR 决定颜色；禁止 bbox 平均 RGB；UNKNOWN → 不设 fill（保留 Native Anchor/default）
    const colorByBlock = {};
    if (workBlocks.length && typeof extractForegroundColor === "function") {
      try {
        const rgbaDec = await new Promise((resolve) => {
          const im = new Image();
          im.onload = () => { try { const cv = document.createElement("canvas"); cv.width = im.naturalWidth; cv.height = im.naturalHeight; const g = cv.getContext("2d", { willReadFrequently: true }); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, cv.width, cv.height); resolve({ ok: true, data: d.data, width: cv.width, height: cv.height }); } catch (e) { resolve({ ok: false }); } };
          im.onerror = () => resolve({ ok: false });
          im.src = img.dataUrl;
        });
        if (rgbaDec && rgbaDec.ok) {
          workBlocks.forEach(function (b, i) {
            const ink = inkByBlock[i] || null;
            const region = (ink && ink.inkBox) ? ink.inkBox : { x: b.bbox.x, y: b.bbox.y, width: b.bbox.width, height: b.bbox.height };
            const o = extractForegroundColor({ data: rgbaDec.data, width: rgbaDec.width, height: rgbaDec.height, bbox: region });
            // Commit 4.6-D（§12）：生产应用门禁 —— 前景可靠 + 主色集中 + 非多峰才设置 fill；否则保留 Native 默认色
            if (typeof shouldApplyFill === "function") {
              const fgGate = shouldApplyFill(o);
              // Commit A-ROLLBACK（test vs demo 对照）：gate 不再产生 skipped —— 无条件应用 ImageInk 主色（对齐 demo 语义），
              // gate.reason/gateApply 仅作为颜色证据记录（fillGate 诊断），避免"弱证据→整行默认黑/白"。
              colorByBlock[i] = { color: o.color, confidence: o.confidence, sampleCount: o.sampleCount, coverage: o.coverage, source: o.source, method: o.method, dominance: o.dominance, ambiguity: o.ambiguity, multiModal: !!o.multiModal, gate: (fgGate && fgGate.reason) || "APPLIED", gateApply: fgGate ? !!fgGate.apply : null };
            } else if (o && o.ok) colorByBlock[i] = { color: o.color, confidence: o.confidence, sampleCount: o.sampleCount, coverage: o.coverage, source: o.source, method: o.method };
          });
        }
      } catch (eColor) { ocrLog("COLOR", "extract exception " + String(eColor && eColor.message || eColor).slice(0, 120)); }
    }
    const items = workBlocks.map((b, bi) => {
      // Stage 7.8 §十三：safeText 真正送 DIY（rawText 仅证据/诊断/重处理）；
      // 仅含被 BLOCKED 移除字符的空块直接剔除，不创建空 textbox（§三十三 special-character 门）。
      // Stage 7.8R §八：Text Safety Gate BLOCK（残留异常字符/空 safeText）同样剔除，不创建。
      const safety = b.safety || null;
      if (safety && safety.status === "BLOCK") {
        ocrLog("SAFETY_GATE", "block " + bi + " status=BLOCK issues=" + (safety.issues || []).join("|"));
        return null;
      }
      // Stage 9 V3（§六/二十）：NATIVE_OCR 块的最终文字 = rawText 绝对原样（禁 trim/sanitize/归一）；
      // 其余块保持 Legacy（safeText→text）供回归对比（§五十八）。
      const srcText = (b.textSource === "NATIVE_OCR" && b.rawText != null)
        ? String(b.rawText)
        : ((b.safeText != null && String(b.safeText).trim() !== "") ? String(b.safeText) : String(b.text || ""));
      if (!srcText.trim()) return null;
      // Stage 8B STEP 4（Phase A）：唯一几何合同 —— 用 aCoords 真值建立 source→canvas 仿射，
      // 把 OCR 块四角映射为目标 quad（Phase B compare / Phase C 校正 / Phase E gate 唯一基准）。
      // 旧版页面桥（无 aCoords）或未加载 image-space/text-fit 时整体降级旧路径，行为不变。
      let targetQuad = null, imageRuntimeState = null, imgTShared = null, containRes = null, lineQuadsC7 = null;
      let visualGeomSource = "OCR_BBOX_FALLBACK", inkGeometryReason = null, visualSrcBoxUsed = null; // Commit A：诊断字段 hoist（geometry-source audit log 如实上报）
      if (geo.aCoords && typeof buildImageTransform === "function" && typeof mapRectToCanvas === "function" && typeof validateQuadInsideCanvas === "function") {
        try {
          const imgT = buildImageTransform({ naturalWidth: geo.naturalWidth, naturalHeight: geo.naturalHeight, width: w, height: h, aCoords: geo.aCoords });
          imgTShared = imgT;
          if (imgT) {
            // OCR-P1 Commit 4.6-A：视觉几何 —— OCR_BBOX 仅作识别/搜索区域，不直接当最终位置。
            // SOURCE_INK_BOX（ImageInk inkBox，防污染算法）可靠时优先作为 VISUAL_TARGET 映射源；
            // 可靠性门槛：ok + confidence ≥ VISUAL_INK_MIN_CONF + coverage 合理 + bbox 有效。
            const inkV = inkByBlock[bi] || null;
            // Commit A（Stage 9.9 Closure §7）：唯一几何权威裁定 —— Ink 不得直写位置（默认关）；
            // 仅经 visual-geometry-resolver 裁定：disabled→OCR_BBOX；enabled+一致性门禁→IMAGE_INK。
            const rvSrc = (typeof resolveVisualSource === "function")
              ? resolveVisualSource({ bbox: b.bbox, inkCandidate: (inkV && inkV.ok && inkV.inkBox) ? { ok: true, inkBox: inkV.inkBox, confidence: inkV.confidence } : null, enabled: STAGE9_INK_GEOMETRY, opts: { tolPx: 8 } })
              : { srcBox: { x: b.bbox.x, y: b.bbox.y, width: b.bbox.width, height: b.bbox.height }, authority: "OCR_BBOX", reason: "RESOLVER_UNAVAILABLE", candidate: null };
            visualGeomSource = rvSrc.authority;
            inkGeometryReason = rvSrc.reason || null;
            visualSrcBoxUsed = rvSrc.srcBox;
            const srcBox = rvSrc.srcBox;
            const mq = mapRectToCanvas(srcBox, imgT);
            if (mq && Array.isArray(mq.corners) && mq.corners.length === 4) {
              targetQuad = mq.corners;
              imageRuntimeState = { basis: "aCoords", naturalWidth: geo.naturalWidth, naturalHeight: geo.naturalHeight, objectWidth: w, objectHeight: h, sourceWidth: geo.naturalWidth, sourceHeight: geo.naturalHeight };

              // Stage 9 Commit 7：containment 硬门禁（map → containment → pass 创建 / NEEDS_REPAIR → repair → 再判 → still fail 禁创建）
              // 文字须留在图片内部；禁止「先创建再让文字跑出去」；旋转图片按 inverse(imageTransform) 在 IMAGE_PIXEL 系检查（非 Canvas AABB）。
              if (targetQuad && (geo.naturalWidth > 0) && (geo.naturalHeight > 0) && typeof isQuadInsideImage === "function" && typeof repairQuadCentered === "function") {
                const c0 = isQuadInsideImage(targetQuad, imgT, geo.naturalWidth, geo.naturalHeight, { marginPx: 0 });
                if (c0.verdict === "NEEDS_REPAIR") {
                  const rpC7 = repairQuadCentered(targetQuad, imgT, geo.naturalWidth, geo.naturalHeight, { marginPx: 0 });
                  if (!rpC7 || rpC7.evidence.afterVerdict !== "CONTAINED") {
                    ocrLog("GEOMETRY_GATE", "block " + bi + " containment repair failed，禁创建（文字须留在图片内）");
                    return null;
                  }
                  targetQuad = rpC7.quad; c0.repaired = true; c0.repairEvidence = rpC7.evidence; containRes = c0;
                } else if (c0.verdict === "CONTAINED") { containRes = c0; }
                else { ocrLog("GEOMETRY_GATE", "block " + bi + " containment=" + c0.verdict + "（禁创建，文字须在图片内）"); return null; }
              }
              // Commit 7 C：多行逐 line.bbox 独立映射为 line quad（逐行几何证据；仍组成唯一 textbox，不拆分创建）
              const lqC7 = (b.lines || []).map(function (l) {
                if (!l || !l.bbox) return null;
                const mqC7 = mapRectToCanvas({ x: l.bbox.x, y: l.bbox.y, width: l.bbox.width, height: l.bbox.height }, imgT);
                return (mqC7 && Array.isArray(mqC7.corners) && mqC7.corners.length === 4) ? mqC7.corners : null;
              }).filter(Boolean);
              if (lqC7.length) lineQuadsC7 = lqC7;
              // Phase E 前置门禁（坐标合同 §5 F6/§7）：中心出界或越界>20% → 该块禁创建（GEOMETRY_INVALID）
              if ((geo.canvasWidth > 0) && (geo.canvasHeight > 0)) {
                const gq = validateQuadInsideCanvas(targetQuad, geo.canvasWidth, geo.canvasHeight, { tolerance: 0.2 });
                if (!gq.valid) {
                  ocrLog("GEOMETRY_GATE", "block " + bi + " " + (gq.reason || "invalid") + "（禁创建，目标越界）");
                  return null;
                }
              }
            }
          }
        } catch (eGeo) { targetQuad = null; imageRuntimeState = null; }
      }
      const bw = b.bbox.width * sx, bh = b.bbox.height * sy;
      // Stage 9 P4-B §六/§八/§十/§十一：Typography target 统一解析（字号与 layoutWidth 同源，杜绝双重标准）
      const inkM = inkByBlock[bi] || null;
      const tRes = (typeof resolveTypographyTarget === "function")
        ? resolveTypographyTarget({ bboxWidth: b.bbox.width, imageInkWidth: (inkM && inkM.ok) ? inkM.inkWidth : null, inkValid: !!(inkM && inkM.ok), scale: sx, mode: STAGE9_FONT_INK_TARGET ? "image-ink" : "bbox", reason: (inkM && !inkM.ok) ? inkM.reason : null })
        : { width: bw, source: "OCR_BBOX", fallback: false, reason: "RESOLVER_UNAVAILABLE" };
      if (tRes && tRes.source === "IMAGE_INK") ocrLog("FONT_TARGET", "block=" + bi + " source=IMAGE_INK ocrBBox=" + Math.round(b.bbox.width) + " imageInk=" + Math.round((inkM && inkM.inkWidth) || 0) + " target=" + Math.round(tRes.width) + " fallback=0");
      else if (tRes && tRes.fallback && STAGE9_FONT_INK_TARGET) ocrLog("FONT_TARGET", "block=" + bi + " source=" + tRes.source + " ocrBBox=" + Math.round(b.bbox.width) + " imageInk=" + (inkM && inkM.ok ? Math.round(inkM.inkWidth) : "null") + " fallback=1 reason=" + String(tRes.reason || "UNKNOWN"));
      // Stage 9 P4-D：fontSize height-first —— 源图墨迹行高 ×sy → canvas 像素（Source Ink Height）；
		// 宽度不再决定字号；宽度只管 textbox width / 防换行（§2/§5）。
		      const effScaleC8 = (typeof effectiveScaleOf === "function" && imgTShared) ? effectiveScaleOf(imgTShared) : null;
      const effSX = (effScaleC8 && effScaleC8.effectiveScaleX > 0) ? effScaleC8.effectiveScaleX : sx;
      const effSY = (effScaleC8 && effScaleC8.effectiveScaleY > 0) ? effScaleC8.effectiveScaleY : sy;
      let lineInkEvidence = null;
      if (b.lines && b.lines.length > 1 && lineInkByBlock[bi] && lineInkByBlock[bi].length) {
        const lh = lineInkByBlock[bi].map(function (r) { return (r && r.ok && typeof r.inkHeight === "number" && r.inkHeight > 0) ? r.inkHeight : null; }).filter(function (v) { return v != null; });
        if (lh.length >= 1) {
          const sorted = lh.slice().sort(function (a, b) { return a - b; });
          const md = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
          lineInkEvidence = { source: "per-line-median", perLineInkHeights: lh, medianInkHeight: md, medianCanvasPx: Math.round((md * effSY) * 100) / 100, effectiveScaleY: Math.round(effSY * 1e6) / 1e6 };
        }
      }
      const sourceInkHeight = lineInkEvidence ? lineInkEvidence.medianCanvasPx
        : ((inkM && inkM.ok && typeof inkM.inkHeight === "number" && inkM.inkHeight > 0) ? Math.round((inkM.inkHeight * effSY) * 100) / 100 : null);
		      const sourceInkWidth = (inkM && inkM.ok && typeof inkM.inkWidth === 'number' && inkM.inkWidth > 0) ? Math.round((inkM.inkWidth * effSX) * 100) / 100 : null;
		      // §10（legacy 诊断保留）：avgLineH（行高均值）仅作诊断与 fallback。
      let lineHSum = 0;
      (b.lines || []).forEach((l) => { if (l && l.bbox && l.bbox.height > 0) lineHSum += l.bbox.height; });
      const avgLineH = (b.lines && b.lines.length && lineHSum > 0) ? lineHSum / b.lines.length : bh;
      // Stage 8D §十三~§十五（Typography Evidence Fusion）：不再让 width 单一指标独裁字号。
      // 融合 advance width（主）、ink height（有则交叉校验）、OCR bbox height（仅 sanity）；
      // 叠加 gate Readiness Score（quality<0.5 → 该块不创建）。8B 定案保持：advance 命中源字号。
      let fs = null, fsSource = "none", zy8bAdvance = null, fusion8d = null;
      if (fontMeas8bAvailable && typeof solveFontSizeFusion === "function") {
        fusion8d = solveFontSizeFusion({ text: srcText, targetVisualWidth: Math.max(8, tRes.width), inkHeight: sourceInkHeight, ocrHeight: bh, fontFamily: measureFamily, measurer: fontMeas8b.measurer, quality: currentGateScore != null ? currentGateScore : 0.9 });
        if (fusion8d && fusion8d.ok && fusion8d.fontSize > 0) {
          fs = Math.min(160, Math.max(8, fusion8d.fontSize));
          fsSource = fusion8d.reason || "fusion";
          zy8bAdvance = (fusion8d.sources && fusion8d.sources.advance && fusion8d.sources.advance.advanceWidth) || null;
        } else if (fusion8d && !fusion8d.ok) {
          ocrLog("FUSION8D", "block " + bi + " reject reason=" + String(fusion8d.reason || "") + " quality=" + (currentGateScore != null ? Math.round(currentGateScore * 100) / 100 : "n/a"));
        }
      }
      if (!fs) { fs = Math.max(8, Math.min(160, Math.round((avgLineH * sy) / FONT_HEIGHT_RATIO))); fsSource = "legacy-height-ratio"; }
      // 8D §十二：bbox 三层分离（ocrBBox / textVisualTarget / textLayoutTarget）—— 诊断与下游用
      const bboxSep = (typeof bboxSeparation === "function")
        ? bboxSeparation({ x: b.bbox.x, y: b.bbox.y, width: b.bbox.width, height: b.bbox.height }, sx)
        : null;
      // §11/§12：textbox layoutWidth —— 优先真实文本测量（字号标定+字符宽度估计+安全余量），
      // 宽度 = clamp(max(60, 视觉宽, 最长行估计宽+margin), ≤4000)，OCR 原始单行不得因宽度不足再换行
      const textLines = srcText.split("\n").filter((t) => t !== "");
      const tMinWidth = Math.max(60, tRes.width + 8, zy8bAdvance != null ? zy8bAdvance + Math.max(10, Math.round(fs * 0.35)) : 0);
      const layout = (typeof estimateTextLayout === "function")
        ? estimateTextLayout(textLines, fs, { minWidth: tMinWidth, maxWidth: 4000, margin: Math.max(10, Math.round(fs * 0.35)), visualWidth: tRes.width })
        : { layoutWidth: tMinWidth, perLine: textLines.map((t) => ({ text: t, estimatedWidth: 0, needsWrap: false })), forcedWrapDetected: false, estimatedFinalLineCount: textLines.length };
      if (layout.forcedWrapDetected) forcedWrapTotal += 1;
      if (textLines.length > 1) multiLineTotal += 1;
      // §18：换行诊断字段（sourceLineCount = OCR 原始逻辑行；forcedWrapDetected = 存在源单行放不下）
      // Stage 7.8 §十三/§四十一：rawText/sanitize/size 加入诊断（不进入生产 payload 主文本）
      const diagnostics = {
        sourceLineCount: textLines.length,
        estimatedFinalLineCount: layout.estimatedFinalLineCount,
        forcedWrapDetected: layout.forcedWrapDetected,
        layoutWidth: layout.layoutWidth,
        // Stage 9 P4-B §八/§十二：typography target 来源取证（同源字号/layoutWidth；fallback 记录）
        targetSource: (tRes && tRes.source) || "OCR_BBOX",
        targetWidth: tRes ? Math.round(tRes.width * 100) / 100 : null,
        ocrBBoxTargetWidth: Math.round(bw * 100) / 100,
        imageInkTargetWidth: (inkM && inkM.ok) ? (Math.round(inkM.inkWidth * sx * 100) / 100) : null,
			sourceInkHeight: sourceInkHeight, // P4-D：fontSize 高度证据（canvas px）
			sourceInkWidth: sourceInkWidth, // P4-D：宽度证据（canvas px）\n\t\tperLineInkEvidence: lineInkEvidence ? { source: lineInkEvidence.source, perLineInkHeights: lineInkEvidence.perLineInkHeights, medianInkHeight: lineInkEvidence.medianInkHeight, medianCanvasPx: lineInkEvidence.medianCanvasPx, effectiveScaleY: lineInkEvidence.effectiveScaleY } : null, // Commit 8 A：逐行 ink 证据
        inkFallback: !!(tRes && tRes.fallback),
        inkReason: (inkM && !inkM.ok) ? inkM.reason : null,
        perLineWidth: layout.perLine.map((p) => ({ text: String(p.text).slice(0, 12), width: p.estimatedWidth, needsWrap: !!(p.needsWrap) })),
        provider: b.provider || b.sourceProvider || null,
        rawText: b.rawText != null ? String(b.rawText) : String(b.text || ""),
        sanitized: !!(b.sanitize && b.sanitize.changed),
        sanitizeReason: (b.sanitize && b.sanitize.reason) || "",
        blockedCount: (b.sanitize && b.sanitize.blockedCount) || 0,
        sizeCluster: b.sizeCluster || null,
        sizeRatio: b.sizeRatio != null ? b.sizeRatio : null,
        estimatedTextHeight: b.estimatedTextHeight != null ? b.estimatedTextHeight : null,
        safetyGate: (b.safety && b.safety.status) ? b.safety.status : null, // Stage 7.8R §八：SAFE / BLOCK
        // Stage 8B STEP 5：字号求解来源 / 样式候选（真实模板字体优先）
        fsSource: fsSource,
        textSource: b.textSource || "LEGACY_OCR", // Stage 9 V3：NATIVE_OCR = 绝对文字真值
        textTruth: b.textTruth || null,
        fontFamilyUsed: measureFamily,
        fontFamilySource: fontFamilyCandidate ? "template" : "fallback",
        legacyAvgLineH: avgLineH,
        // Stage 8D P5-1（§六/§七/§九）：字体来源四层 + specialStyle + orientation（均纯诊断，零行为影响）
        fontFamilyResolved: fontProv.family,
        fontFamilySource8d: fontProv.source,
        fontProvision: { source: fontProv.source, templateFamily: fontProv.templateFamily, siteDefaultFamily: fontProv.siteDefaultFamily, systemMatchFamily: fontProv.systemMatchFamily, fallbackFamily: fontProv.fallbackFamily },
        specialStyle: (typeof assessSpecialStyle === "function")
          ? (function () { const sp = assessSpecialStyle({ noTemplateFont: !fontFamilyCandidate, singleLine: textLines.length === 1, largeFont: fs >= 40, textLength: srcText.length, fontWeight: (ocrTarget && ocrTarget.fontStyle && ocrTarget.fontStyle.fontWeight) || null }); return { specialStyle: sp.specialStyle, styleStatus: sp.styleStatus, evidence: sp.specialStyleEvidence }; })()
          : { specialStyle: false, styleStatus: "STYLE_READY", evidence: null },
        orientation: (typeof blockTextAngle === "function" && typeof buildOrientationDiagnostics === "function" && typeof classifyTextAngle === "function")
          ? buildOrientationDiagnostics(blockTextAngle(b.lines), angle, { classifyTextAngle: classifyTextAngle })
          : { source: "NONE", blockAngle: null, imageAngle: angle || 0, classification: "UNKNOWN", confidence: 0 },
        // Stage 8D：融合证据（§十四）与 bbox 三层分离（§十二）
        fusion8d: fusion8d ? { reason: fusion8d.reason, confidence: fusion8d.confidence, quality: currentGateScore != null ? Math.round(currentGateScore * 100) / 100 : null, warnings: (fusion8d.warnings || []).slice(0, 4), fontEvidence: fusion8d.fontEvidence ? { status: fusion8d.fontEvidence.status, fontEvidenceStatus: fusion8d.fontEvidence.fontEvidenceStatus, diagnosis: fusion8d.fontEvidence.diagnosis, inkToOcrRatio: fusion8d.fontEvidence.inkToOcrRatio, advanceFontSize: fusion8d.fontEvidence.advanceFontSize, inkFontSize: fusion8d.fontEvidence.inkFontSize, inkHeight: sourceInkHeight, ocrHeight: bh } : null } : null,
        // OCR-P1 Commit 4.6-A：视觉几何来源取证（IMAGE_INK 优先 / OCR_BBOX_FALLBACK）+ 源墨迹字段
        visualGeometrySource: (typeof visualGeomSource !== "undefined") ? visualGeomSource : "OCR_BBOX_FALLBACK",
        inkGeometryReason: (inkGeometryReason != null) ? inkGeometryReason : null,
        visualSrcBoxUsed: visualSrcBoxUsed ? { x: Math.round(visualSrcBoxUsed.x * 100) / 100, y: Math.round(visualSrcBoxUsed.y * 100) / 100, width: Math.round(visualSrcBoxUsed.width * 100) / 100, height: Math.round(visualSrcBoxUsed.height * 100) / 100 } : null,
        visualInkEvidence: (inkByBlock[bi] && inkByBlock[bi].ok) ? { inkBox: inkByBlock[bi].inkBox, inkWidth: inkByBlock[bi].inkWidth, inkHeight: inkByBlock[bi].inkHeight, coverage: inkByBlock[bi].coverage, confidence: inkByBlock[bi].confidence, method: inkByBlock[bi].method, componentCount: inkByBlock[bi].componentCount, dominantComponentRatio: inkByBlock[bi].dominantComponentRatio, rowBandConfidence: inkByBlock[bi].rowBandConfidence } : null,
        bboxSeparation8d: bboxSep ? { visualWidth: bboxSep.textVisualTarget.width, ocrBoxH: Math.round(bboxSep.ocrBBox.height * 100) / 100, layoutW: null } : null,
        // Stage 8D P6-1（§二十一）：Source = OCR bbox（canvas 像素）—— 与 Target(text-fit)/Actual(rendered ink) 三层对比用
        ocrBBox8d: { left: Math.round((b.bbox.x * sx) * 100) / 100, top: Math.round((b.bbox.y * sy) * 100) / 100, width: Math.round(bw * 100) / 100, height: Math.round(bh * 100) / 100 },
        blockLines: (b.lines || []).map(function (ln) { return ln && ln.bbox ? { x: Math.round(ln.bbox.x * 100) / 100, y: Math.round(ln.bbox.y * 100) / 100, width: Math.round(ln.bbox.width * 100) / 100, height: Math.round(ln.bbox.height * 100) / 100, text: (ln.text != null ? String(ln.text).slice(0, 24) : null) } : null; }).filter(Boolean),
        lineInkEvidence: lineInkEvidence || null,

        containment8d: containRes ? { verdict: containRes.verdict, repaired: !!containRes.repaired, outsideCount: (containRes.evidence && containRes.evidence.outsideCount) || 0, margin: (containRes.evidence && containRes.evidence.marginPx) || 0 } : null,
        targetQuad8d: (targetQuad && typeof quadTextGeometry === "function") ? (function () { const g = quadTextGeometry(targetQuad); return { width: Math.round(g.width * 100) / 100, height: Math.round(g.height * 100) / 100, angle: g.angle }; })() : null,
        // 8D §十六：状态链（gate 已过 → READY；创建后由 calibration/ink 推进 CREATED/VERIFIED）
        status8d: "RECONSTRUCTION_READY"
      };
      // §14：几何模型 —— 水平文本 left/top；θ≠0 旋转文本 center/angle（保留 P5 rotation 行为，零变化）
      const ux = b.bbox.x / w - 0.5, uy = b.bbox.y / h - 0.5;
      const dx = ux * w * sx, dy = uy * h * sy;
      const px = cx + dx * cos - dy * sin, py = cy + dx * sin + dy * cos;
      const base = { text: srcText, blockIndex: bi, fontFamily: fontFamilyCandidate || "sans-serif", diagnostics: diagnostics, pageId: srcPageId, side: srcSide, transactionId: srcTxId, imageFingerprint: srcTxFp, canvasId: srcTxCanvas, zy8bFontMismatch: !fontFamilyCandidate };
      // Stage 10-A：颜色证据附到 item（fill 仅在有可靠前景证据时设置；UNKNOWN 保留 Native default）
      const ce10 = colorByBlock[bi] || null;
      if (ce10 && ce10.skipped !== true) base.fill = ce10.color; // Commit 4.6-D：弱颜色证据（skipped）保留 Native 默认色，不强制设色
      base.zy8bFillEvidence = ce10 || { missing: true };
      if (lineQuadsC7 && lineQuadsC7.length) base.zy8bLineQuads = lineQuadsC7; // Commit 7 C：逐行 quad 证据
      if (containRes) base.zy8bContainment = containRes; // Commit 7：创建前 containment / repair 证据
      if (targetQuad) { base.zy8bTargetQuad = targetQuad; base.zy8bImageRuntime = imageRuntimeState; } // Stage 8B STEP 4：目标几何附到 item
      if (zy8bAdvance != null) base.zy8bAdvance = zy8bAdvance; // Stage 8B STEP 5：渲染 advance（typography 宽度比较基准）
      // §13：textbox height 须容纳 lineCount×lineHeight（禁止只用单行 OCR bbox.height）
            const lineRatioBox = (typeof lineBoxRatio === "function") ? lineBoxRatio(fontFamilyCandidate || "sans-serif") : FONT_LINE_HEIGHT;
      const boxHeight = Math.round(textLines.length * fs * lineRatioBox + 8);
      // Stage 9 Commit 7：targetQuad 正式接管文字位置（OCR bbox → imageTransform → canvas targetQuad → text target geometry → Native drawText）。
      // 有效缩放从 affine 列向量长度派生（effectiveScaleOf），禁止用 geo.scaleX/scaleY 充当 natural scaling truth；禁止恢复 ux/uy/px/py/-4 旧模型。
      if (targetQuad && typeof quadTextGeometry === "function") {
        const tqG = quadTextGeometry(targetQuad);
        let c8W = layout.layoutWidth, c8H = boxHeight, c8L = tqG.left, c8T = tqG.top, c8Synth = null;
        // Stage 9 Commit 8 C：多行 canvasLineQuad[] → 唯一 textbox（common rotation / max line width / 实际行距 / 总视觉高）
        if (textLines.length > 1 && lineQuadsC7 && lineQuadsC7.length >= 2 && typeof synthesizeTextLayout === "function") {
          const st8 = synthesizeTextLayout({ lineQuads: lineQuadsC7, lineCount: textLines.length, fontSize: fs, lineHeightRatio: lineRatioBox, layoutWidth: layout.layoutWidth, angle: tqG.angle, minWidth: Math.max(60, tMinWidth) });
          if (st8) { c8Synth = st8; c8W = st8.width; c8H = st8.height; c8L = st8.left; c8T = st8.top; }
        }
        return Object.assign({}, base, { left: c8L, top: c8T, angle: tqG.angle, origin: "left", width: c8W, fontSize: fs, height: c8H, zy8bContainment: containRes, zy8bEffectiveScale: (typeof effectiveScaleOf === "function") ? effectiveScaleOf(imgTShared) : null, zy8bTargetGeometry: { left: c8L, top: c8T, width: c8W, height: c8H, angle: tqG.angle, center: tqG.center }, zy8bMultiline: c8Synth ? c8Synth.evidence : null, zy8bLineInkEvidence: lineInkEvidence });
      }
      if (!angle) {
        return Object.assign({}, base, { left: px, top: py, width: layout.layoutWidth, fontSize: fs, height: boxHeight, zy8bContainment: containRes, zy8bGeometryPath: "LEGACY_NO_ACOORDS" });
      }
      // Stage 8A-1（WRONG_ORIGIN fix）：旋转文本不再用 center/origin 定位（left 语义错位，§二十九 四角→AABB）。
      // 源 bbox 四角（source px，绕图片中心 w/2,h/2 并乘 scale）→ AABB 左上，originX 恒为 'left'，
      // textbox 自带 angle 渲染旋转。矩阵 x'=cos*sx*x − sin*sy*y + tx；tx = cx − cos*sx*w/2 + sin*sy*h/2。
      // image-transform.js 缺省时回退原 center 计算（保持行为）。
      const corners = (typeof transformCorners === "function")
        ? transformCorners({ left: b.bbox.x, top: b.bbox.y, width: b.bbox.width, height: b.bbox.height },
          [cos * sx, sin * sx, -sin * sy, cos * sy, cx - cos * sx * (w / 2) + sin * sy * (h / 2), cy - sin * sx * (w / 2) - cos * sy * (h / 2)])
        : null;
      if (corners) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        corners.forEach((p) => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });
        return Object.assign({}, base, { left: minX, top: minY, angle: angle, origin: "left", width: layout.layoutWidth, fontSize: fs, height: boxHeight });
      }
      const ucx = (b.bbox.x + b.bbox.width / 2) / w - 0.5;
      const ucy = (b.bbox.y + b.bbox.height / 2) / h - 0.5;
      const dcx = ucx * w * sx, dcy = ucy * h * sy;
      const pcx = cx + dcx * cos - dcy * sin, pcy = cy + dcx * sin + dcy * cos;
      return Object.assign({}, base, { left: pcx, top: pcy, angle: angle, origin: "center", width: layout.layoutWidth, fontSize: fs, height: boxHeight });
    }).filter(Boolean); // Stage 7.8：剔除 safeText 为空的块（不创建空 textbox）
    pipelineEvidence({ stage: "BUILD", blocks: workBlocks.length, items: items.length, fail: items.length ? null : "BUILD_EMPTY" });
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
    // Stage 9 V4 §十九~§二十：路由 —— NEW_RECOGNITION 走创建；CALIBRATION/RETRY 走更新现有对象
    if (recRoute && recRoute.mode !== "NEW_RECOGNITION") {
      setStatus("画布已有 " + recRoute.existingCount + " 个文字，按「" + (recRoute.mode === "RECOGNITION_RETRY" ? "同图重识别" : "校准识别") + "」更新现有对象（不重复创建）…");
      sendCalibration(items, recRoute, srcPageId, srcSide, srcTxId, srcTxFp, templateSlotsSnapshot);
      // 事务结束：释放 ocrTarget，避免下次识别串用旧目标
      ocrTarget = null;
      return;
    }
    // P0（真机 BUILDING 卡死）：页面桥异常时兜底，10 秒内未收到 ocrCreateResult 即走出死等状态
    const on = (e) => {
      if (e.data && e.data.source === "zy-card-assistant-page" && e.data.type === "ocrCreateResult") {
        clearTimeout(fallbackTimer); window.removeEventListener("message", on); ocrRunning = false; // 事务终态 DONE/生成失败（含回滚）
        // Stage 6 P0（编辑器接入诊断 §18）：仅记录计数与原生 API 可用性，禁止输出对象/文本内容
        const integ = e.data.editorIntegration || {};
        if (e.data.ok) {
          setStatus("已生成 " + (e.data.created || []).length + " 个文字（可双击编辑）");
          pipelineEvidence({ stage: "CREATE", requested: e.data.detectedBlocks || 0, created: (e.data.created || []).length });
          ocrLog("SUCCESS", "created=" + (e.data.created || []).length + "/" + (e.data.detectedBlocks || 0) + " editorInteg=" + JSON.stringify({ undo: !!integ.nativeUndoFound, savePre: !!integ.undoSavePre, savePost: !!integ.undoSavePost, ident: integ.identityApplied, uv4: integ.uv4Total, layerMax: integ.layerMax }));
          // Stage 8B STEP 4（Phase B/C/E）：创建后几何闭环校正（不阻塞终态回复，异步进行）
          // Commit 4.6-0：anchor 回填（anchor 命中判定在 page-world 侧，创建回复后回填到只读诊断）
          try {
            const diagTail = window.__zyStage9VisualDiag && window.__zyStage9VisualDiag.length ? window.__zyStage9VisualDiag[window.__zyStage9VisualDiag.length - 1] : null;
            if (diagTail && diagTail.rows && diagTail.txId === srcTxId) {
              const createdIdx = {};
              (e.data.created || []).forEach(function (c) { if (c && c.blockIndex != null) createdIdx[c.blockIndex] = c; });
              diagTail.rows.forEach(function (r) {
                const c = createdIdx[r.blockIndex] || null;
                if (c) { r.anchorUsed = !!(c.anchorMatch && c.anchorMatch.verdict === "MATCH" && c.reused === true); if (c.uuid) r.anchorObjectUuid = String(c.uuid); }
              });
            }
          } catch (eDiagAnchor) {}
          runGeometryCalibration(items, e.data, srcSide);
        } else {
          pipelineEvidence({ stage: "CREATE", fail: "CREATE_FAILED", requested: e.data.detectedBlocks || 0, created: (e.data.created || []).length, failedIdx: e.data.failedBlockIndex != null ? e.data.failedBlockIndex : null });
          setStatus("生成失败：" + (e.data.message || "未创建文字") + (e.data.failedBlockIndex != null ? "（第 " + e.data.failedBlockIndex + " 个失败，已回滚）" : ""));
          ocrLog("ERROR", "ocrCreate failed created=" + (e.data.created || []).length + " detected=" + (e.data.detectedBlocks || 0) + " failedIdx=" + (e.data.failedBlockIndex != null ? e.data.failedBlockIndex : "n/a") + " msg=" + String(e.data.message || "").slice(0, 120));
        }
      }
    };
    const fallbackTimer = setTimeout(() => { pipelineEvidence({ stage: "CREATE", fail: "CREATE_TIMEOUT" }); window.removeEventListener("message", on); ocrRunning = false; setStatus("生成文字超时（页面桥未能确认结果）：请查看浏览器控制台报错并反馈开发者（错误码 ocrCreate-reply-timeout）。"); ocrLog("ERROR", "ocrCreate reply timeout"); }, 10000);
    window.addEventListener("message", on);
    // Commit 4.6-0（§1）：真机只读证据采集 —— 每 block 视觉字段（位置/字号/颜色/几何来源）。纯诊断，不改变行为。
    try {
      const diagRows = (items || []).filter(function (x) { return x && x.blockIndex != null; }).map(function (item) {
        const dd = item.diagnostics || {};
        const fillE = item.zy8bFillEvidence || null;
        const tq8 = item.zy8bTargetQuad;
        return {
          blockIndex: item.blockIndex,
          nativeText: String(item.text || ""),
          ocrBBox: dd.ocrBBox8d ? { left: (dd.ocrBBox8d.left != null ? dd.ocrBBox8d.left : null), width: dd.ocrBBox8d.width, height: dd.ocrBBox8d.height } : null,
          blockLines: (dd.blockLines || null),
          lineInk: (dd.lineInkEvidence || null),
          imageInkBox: dd.visualInkEvidence ? dd.visualInkEvidence.inkBox : null,
          imageInkWidth: dd.visualInkEvidence ? dd.visualInkEvidence.inkWidth : null,
          imageInkHeight: dd.visualInkEvidence ? dd.visualInkEvidence.inkHeight : null,
          imageInkCoverage: dd.visualInkEvidence ? dd.visualInkEvidence.coverage : null,
          inkConfidence: dd.visualInkEvidence ? dd.visualInkEvidence.confidence : null,
          inkComponentCount: dd.visualInkEvidence ? dd.visualInkEvidence.componentCount : null,
          inkDominantRatio: dd.visualInkEvidence ? dd.visualInkEvidence.dominantComponentRatio : null,
          inkRowBandConfidence: dd.visualInkEvidence ? dd.visualInkEvidence.rowBandConfidence : null,
          visualGeometrySource: dd.visualGeometrySource || "OCR_BBOX_FALLBACK",
          inkGeometryReason: dd.inkGeometryReason || null,
          visualSrcBoxUsed: dd.visualSrcBoxUsed || null,
          targetQuad: Array.isArray(tq8) ? tq8.map(function (c) { return { x: Math.round(c.x * 100) / 100, y: Math.round(c.y * 100) / 100 }; }) : null,
          targetGeometry: { left: item.left != null ? Math.round(item.left * 100) / 100 : null, top: item.top != null ? Math.round(item.top * 100) / 100 : null, width: item.width != null ? Math.round(item.width * 100) / 100 : null, height: item.height != null ? Math.round(item.height * 100) / 100 : null, angle: item.angle != null ? Math.round(item.angle * 100) / 100 : null },
          fontSize: item.fontSize != null ? Math.round(item.fontSize * 100) / 100 : null,
          fontSource: dd.fsSource || "unknown",
          matchMethod: (dd.textTruth && dd.textTruth.matchMethod) || (dd.textTruth && dd.textTruth.geometryStatus) || null,
          fontSizeEvidence: dd.fusion8d && dd.fusion8d.fontEvidence ? dd.fusion8d.fontEvidence : null,
          fill: item.fill != null ? item.fill : null,
          fillConfidence: fillE ? fillE.confidence : null,
          fillGate: fillE ? (fillE.gate || (fillE.skipped ? "SKIPPED" : "APPLIED")) : null,
          fontFamily: item.fontFamily || null,
          anchorUsed: null // 由创建回复后回填（anchor 命中在 page-world 侧判定）
        };
      });
      const prev = window.__zyStage9VisualDiag || [];
      window.__zyStage9VisualDiag = prev.concat({ ts: Date.now(), txId: srcTxId, side: srcSide, imageFingerprint: srcTxFp, rows: diagRows });
    } catch (eDiag0) { ocrLog("DIAG0", "visual diag collect err: " + String(eDiag0 && eDiag0.message || eDiag0).slice(0, 100)); }
    window.postMessage({ source: "zy-card-assistant", type: "ocrCreate", pageId: srcPageId, side: srcSide, transactionId: srcTxId, imageFingerprint: srcTxFp, items: items }, location.origin);
    // 事务结束：释放 ocrTarget，避免下次识别串用旧目标
    ocrTarget = null;
  }

  // Stage 9 V4 §二十/§二十六：校准识别/同图重识别 → 通知页面桥更新现有 textbox（不重复创建）
  // 只在该事务的 pageId 上生效；page-bridge 侧 ocrCalibrate 有同款 Page Ownership 硬门禁（PAGE_IDENTITY_CHANGED STOP）。
  function sendCalibration(itemsRes, route, pageId, side, txId, txFp, slotsSnapshot) {
    ocrLog("ROUTING", "calibrate mode=" + route.mode + " items=" + itemsRes.length + " pageId=" + pageId);
    const onCal = (e) => {
      if (e.data && e.data.source === PAGE_SOURCE && e.data.type === "ocrCalibrateResult") {
        clearTimeout(tCal); window.removeEventListener("message", onCal); ocrRunning = false;
        if (e.data.ok) {
          setStatus("已校准 " + (e.data.calibrated || []).length + " 个文字" + ((e.data.created || []).length ? "，新建 " + e.data.created.length + " 个" : "") + "（未重复创建）");
          ocrLog("SUCCESS", "calibrate ok calibrated=" + (e.data.calibrated || []).length + " created=" + (e.data.created || []).length + " pageId=" + e.data.pageId + " tx=" + e.data.transactionId);
        } else {
          setStatus("校准失败：" + (e.data.message || e.data.code || "未知"));
          ocrLog("ERROR", "calibrate failed code=" + (e.data.code || "?") + " msg=" + String(e.data.message || "").slice(0, 120));
        }
      }
    };
    const tCal = setTimeout(() => { window.removeEventListener("message", onCal); ocrRunning = false; setStatus("校准超时（页面桥未确认）：请查看浏览器控制台（错误码 ocrCalibrate-reply-timeout）。"); ocrLog("ERROR", "ocrCalibrate reply timeout"); }, 10000);
    window.addEventListener("message", onCal);
    window.postMessage({ source: BRIDGE_SOURCE, type: "ocrCalibrate", pageId: pageId, side: side, transactionId: txId, imageFingerprint: txFp, items: itemsRes, slotsSnapshot: (Array.isArray(slotsSnapshot) && slotsSnapshot.length) ? slotsSnapshot : null }, location.origin);
  }

  // Stage 8B STEP 4（Phase B/C/E）：创建后几何闭环校正 —— compare(targetQuad vs 实测 aCoords) →
  // 修正（高→fontSize、宽→textbox width、center→left/top、angle→双旋转核对）→ 重测，≤8 轮；
  // 最终仍超差 → CREATE_REJECTED_GEOMETRY_MISMATCH（Phase E 诊断，不删除对象；删除动作留真机取证）。
  async function runGeometryCalibration(itemsList, reply, side) {
    if (typeof compareTextGeometry !== "function" || typeof quadSize !== "function" || typeof quadCenter !== "function" || typeof quadAngle !== "function") return;
    // Stage 9 V4 P1（§四/§五）：校准消息携带事务身份（pageId/transactionId/imageFingerprint），
    // page-bridge 据此做 Adjust Page Ownership 门禁（PAGE_IDENTITY_CHANGED → 整批 STOP，防正反串页）。
    const txFirst = (itemsList && itemsList[0]) || null;
    const txCalPageId = (txFirst && txFirst.pageId) || null;
    const txCalId = (txFirst && txFirst.transactionId) || null;
    const txCalFp = (txFirst && txFirst.imageFingerprint) || null;
    // 宽度约束修正依赖真实文本测量（浏览器 2d context；无则整体跳过防换行优化）
    const textMeasurer = (typeof browserTextMeasurer === "function") ? browserTextMeasurer() : null;
    const withMeasurer = function (f) { return textMeasurer && textMeasurer.available ? textMeasurer.measurer : null; };
    if (typeof GM_getValue === "function" && GM_getValue("zyCalibrate8B", "1") === "0") { ocrLog("GEOMETRY", "calibration disabled by zyCalibrate8B=0"); return; }
    const pending = [];
    (itemsList || []).forEach(function (it) {
      const created = (reply && reply.created ? reply.created : []).find(function (c) { return c && c.blockIndex === it.blockIndex; });
      if (!it.zy8bTargetQuad || !created || !created.geometry || !created.geometry.quad) return;
      pending.push({ blockIndex: it.blockIndex, item: it, geom: created.geometry, round: 0, done: false, compare: null, large: 0, srcInkH: (it.diagnostics && typeof it.diagnostics.sourceInkHeight === "number") ? it.diagnostics.sourceInkHeight : null, ink: (created && created.ink) || null, cal: [] });
    });
    if (!pending.length) return;
    const ZY_OK = [], ZY_REJECT = [];
    const waitAdjOnce = function () {
      return new Promise(function (resolve) {
        let done = false;
        const to = setTimeout(function () { if (!done) { done = true; cleanup(); resolve(null); } }, 10000);
        const onAdj = function (e2) {
          if (!e2.data || e2.data.source !== "zy-card-assistant-page" || e2.data.type !== "ocrAdjustResult") return;
          if (done) return; done = true; clearTimeout(to); cleanup(); resolve(e2.data);
        };
        const cleanup = function () { window.removeEventListener("message", onAdj); };
        window.addEventListener("message", onAdj);
      });
    };
    const correctionsFor = function (p, geom, cmp) { const it = p.item;
      // Stage 8B STEP 5/6（§11/§12/§十四）：calibration 职责收敛 —— 只做小误差修正；
      // 换行（WRAP）只加宽不缩字号；字大小只 ±1 小步；需要大跳变 → 归类 CALIBRATION_MODEL_FAILURE。
      const corr = {}, tq = it.zy8bTargetQuad;
      let any = false, large = false;
      // P4-D §7/§8：Source Ink Height vs Editor Actual Ink Height —— ±1 小步（禁外框高/OCR bbox 高；§10 字号未收敛不修 position）
      if (p.ink && p.srcInkH > 0 && typeof geom.fontSize === "number" && it.text && !cmp.typography.wrapDetected) {
        const pGap = Math.round(((p.ink.inkHeight - p.srcInkH) * 100)) / 100;
        if (Math.abs(pGap) > 1.5) {
          const fsCur = geom.fontSize;
          const fsNew = Math.min(160, Math.max(10, fsCur + (pGap > 0 ? -1 : 1)));
          corr.fontSize = fsNew; any = true;
          p.cal.push({ round: (p.round || 0) + 1, sourceInkHeight: p.srcInkH, editorInkHeightBefore: p.ink.inkHeight, fontSizeBefore: fsCur, fontSizeAfter: fsNew, heightErrorBefore: pGap, heightRatio: Math.round((p.ink.inkHeight / p.srcInkH) * 1000) / 1000, annotation: pGap > 0 ? "editor-too-large" : "editor-too-small" });
          if (Math.abs(pGap) > 2) large = true;
          const measW2 = withMeasurer();
          if (typeof solveTextWidth === "function" && measW2) {
            const mw = solveTextWidth(it.text, fsNew, { margin: 0, measurer: measW2, fontFamily: it.fontFamily || "sans-serif" });
            if (mw) corr.width = Math.min(4000, Math.max(geom.textboxWidth || 20, Math.ceil(mw.advanceWidth + 4)));
          }
          corr.__large = large;
          return corr; // 只调字号（+防换行宽度），不动 center/angle
        }
      }
      const tSz = quadSize(tq), tCtr = quadCenter(tq), tAng = quadAngle(tq);
      const aCtr = (geom.center && typeof geom.center.x === "number") ? geom.center : quadCenter(geom.quad);
      const aAng = (typeof geom.angle === "number") ? geom.angle : quadAngle(geom.quad);
      if (cmp.failures.indexOf("center") >= 0) {
        const dx = tCtr.x - aCtr.x, dy = tCtr.y - aCtr.y;
        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
          const cl = Math.round((geom.left || 0) + dx), ct = Math.round((geom.top || 0) + dy);
          corr.left = cl; corr.top = ct; any = true;
          if (Math.abs(dx) > 2 || Math.abs(dy) > 2) large = true;
        }
      }
      if (cmp.typography.wrapDetected && typeof geom.textboxWidth === "number" && it.text) {
        // §12 硬规则：单行 OCR 渲染成多行 → 只加宽（用真实 advance），绝不缩字号
        const measW = withMeasurer();
        let needW = geom.textboxWidth + (tSz.width - geom.width) + 8;
        if (typeof solveTextWidth === "function" && measW) {
          const mw = solveTextWidth(it.text, geom.fontSize || 14, { margin: 0, measurer: measW, fontFamily: it.fontFamily || "sans-serif" });
          if (mw) needW = Math.max(needW, Math.ceil(mw.advanceWidth + 4));
        }
        corr.width = Math.min(4000, Math.max(20, Math.round(needW)));
        any = true;
      }
      if (cmp.failures.indexOf("height") >= 0 && typeof geom.fontSize === "number" && it.text && !cmp.typography.wrapDetected && !(p.ink && p.srcInkH > 0)) { // P4-D：ink 证据时 fontSize 由 Actual Ink 校准（§8）
        // 无换行的小高度差：字号 ±1 小步（STEP E：1~3 次小修正内收敛）
        const fsCur = geom.fontSize;
        const step = tSz.height > geom.height ? 1 : -1;
        const fsNew = Math.min(160, Math.max(8, fsCur + step));
        corr.fontSize = fsNew;
        if (Math.abs(fsNew - fsCur) > 1) large = true;
        // 同步用 advance 兜底宽度（防 fs 变化导致 wrap）
        const measW2 = withMeasurer();
        if (typeof solveTextWidth === "function" && measW2) {
          const mw = solveTextWidth(it.text, fsNew, { margin: 0, measurer: measW2, fontFamily: it.fontFamily || "sans-serif" });
          if (mw) corr.width = Math.min(4000, Math.max(geom.textboxWidth || 20, Math.ceil(mw.advanceWidth + 4)));
        }
        any = true;
      }
      if (cmp.failures.indexOf("width") >= 0 && typeof geom.textboxWidth === "number") {
        // 宽度只在仍小于内容时微增（目标宽度由 Phase 1 advance 决定；此处仅为 wrap/精度兜底）
        const needW = Math.max(geom.textboxWidth, Math.ceil(geom.width + (tSz.width - geom.width)));
        corr.width = Math.min(4000, Math.max(20, needW));
        any = true;
      }
      if (cmp.failures.indexOf("angle") >= 0) {
        const delta = ((tAng - aAng + 180) % 360 + 360) % 360 - 180;
        const next = ((geom.angle || 0) + delta + 180) % 360 - 180;
        if (Math.abs(delta) < 45 && Math.abs(delta) > 0.05) { corr.angle = Math.round(next * 1000) / 1000; any = true; if (Math.abs(delta) > 0.5) large = true; }
      }
      corr.__large = large;
      return any ? corr : null;
    };
    const CATEGORY = function (p) {
      if (p.compare && p.compare.typography.wrapDetected) return "WRAP";
      if (p.compare && p.compare.typography.fontMismatch) return "STYLE_MISMATCH";
      if (p.compare && !p.compare.geometry.pass) return (p.compare.failures || []).indexOf("center") >= 0 || (p.compare.failures || []).indexOf("angle") >= 0 ? "IMAGE_TRANSFORM" : "FONT_MODEL";
      return "FONT_MODEL";
    };
    // STEP E：只允许 ≤3 轮小修正；仅「几何失败 / 仍换行」才拒绝；typography 差异 → 保留对象并备注（§15/§19/§24）
    const ZY_NOTES = [];
    for (let round = 0; round < 4; round += 1) {
      const need = [];
      pending.forEach(function (p) {
        if (p.done) return;
        const cmp = compareTextGeometry(p.item.zy8bTargetQuad, p.geom.quad, { centerTol: 2, cornerTol: 3, widthTol: 3, angleTol: 0.5, renderedLineCount: p.geom.renderedLineCount != null ? p.geom.renderedLineCount : null, targetLineCount: (p.item.diagnostics && p.item.diagnostics.sourceLineCount) || 1, fontMismatch: !!p.item.zy8bFontMismatch, advanceOverride: p.item.zy8bAdvance != null ? p.item.zy8bAdvance : null, fontSize: p.geom.fontSize != null ? p.geom.fontSize : null });
        p.compare = cmp;
        // P4-D §7：ink gap 显著时先修字号（±1），不得被 cmp.pass/几何通过短路（§10 字号优先于 position）
        const pInkGapPre = (p.ink && p.srcInkH > 0 && typeof p.geom.fontSize === "number" && !cmp.typography.wrapDetected) ? Math.round(((p.ink.inkHeight - p.srcInkH) * 100)) / 100 : null;
        if (pInkGapPre != null && Math.abs(pInkGapPre) > 1.5) {
          // P4-D 二期：测量精度感知停止 —— fontSize ±1 后实测 ink 高度不再变化 → MEASUREMENT_PLATEAU（禁误判 CALIBRATION_MODEL_FAILURE）
          const lastStep = (p.cal && p.cal.length) ? p.cal[p.cal.length - 1] : null;
          if (lastStep && lastStep.editorInkHeightAfter != null && p.ink && typeof p.ink.inkHeight === "number" && Math.abs(p.ink.inkHeight - lastStep.editorInkHeightAfter) <= 0.5 && p.round >= 2) {
            p.done = true;
            p.cal[p.cal.length - 1].measurementPlateau = true;
            ZY_NOTES.push({ blockIndex: p.blockIndex, status: cmp.status, failures: "height-ink", category: "FONT_MODEL", code: "MEASUREMENT_PLATEAU", plateauInkHeight: p.ink.inkHeight });
            return;
          }
          if (p.round >= 3) { p.done = true; ZY_NOTES.push({ blockIndex: p.blockIndex, status: cmp.status, failures: "height-ink", category: "FONT_MODEL", code: "CALIBRATION_MODEL_FAILURE", cal: p.cal }); return; } // P4-D §14：4 轮不收敛 → 保留对象并备案（禁全局 multiplier）
          const corrPre = correctionsFor(p, p.geom, cmp);
          if (corrPre) { p.round += 1; if (corrPre.__large) { p.large += 1; delete corrPre.__large; } need.push({ blockIndex: p.blockIndex, corrections: corrPre }); }
          return;
        }
        if (cmp.pass) { p.done = true; ZY_OK.push(p.blockIndex); return; }
        if (cmp.geometry.pass && !cmp.typography.wrapDetected && !(p.ink && p.srcInkH > 0 && Math.abs(p.ink.inkHeight - p.srcInkH) > 1.5)) { // P4-D：ink gap 未收敛不得提前备注
          // 视觉几何正确、无换行 → 对象保留；typography 差异仅记录（字体不匹配属 StyleResolver 范畴）
          p.done = true; ZY_NOTES.push({ blockIndex: p.blockIndex, status: cmp.status, failures: (cmp.failures || []).join("|"), category: CATEGORY(p) });
          return;
        }
        if (p.round >= 3) { p.done = true; ZY_REJECT.push({ blockIndex: p.blockIndex, code: "CALIBRATION_MODEL_FAILURE", category: CATEGORY(p), failures: (cmp.failures || []).join("|"), status: cmp.status }); return; }
        const corr = correctionsFor(p, p.geom, cmp);
        if (!corr) { p.done = true; ZY_REJECT.push({ blockIndex: p.blockIndex, code: "CREATE_REJECTED_NO_CORRECTION", category: CATEGORY(p), failures: (cmp.failures || []).join("|") }); return; }
        p.round += 1;
        if (corr.__large) p.large += 1;
        delete corr.__large;
        need.push({ blockIndex: p.blockIndex, corrections: corr });
      });
      if (!need.length) break;
      window.postMessage({ source: "zy-card-assistant", type: "ocrAdjust", side: side || "front", pageId: txCalPageId, transactionId: txCalId, imageFingerprint: txCalFp, items: need }, location.origin);
      const rep = await waitAdjOnce();
      if (!rep || !rep.items) break;
      rep.items.forEach(function (r) {
        const p = pending.find(function (x) { return x.blockIndex === r.blockIndex; });
        if (p && r.ok && r.geometry && r.geometry.quad) p.geom = r.geometry;
        if (p && r.ok && r.ink) { p.ink = r.ink; if (p.cal.length) p.cal[p.cal.length - 1].editorInkHeightAfter = r.ink.inkHeight != null ? r.ink.inkHeight : null; } // P4-D：校准后 Actual Ink 回填
      });
    }
    // P4-D §9：校准证据导出（window 隔离变量，供 runner readNew 取证）
    try {
      const withCal = pending.filter(function (x) { return x.cal && x.cal.length; }).map(function (x) { return { blockIndex: x.blockIndex, sourceInkHeight: x.srcInkH, rounds: x.cal.length, steps: x.cal, finalFontSize: (x.geom && typeof x.geom.fontSize === "number") ? x.geom.fontSize : null, finalEditorInkHeight: (x.ink && typeof x.ink.inkHeight === "number") ? x.ink.inkHeight : null, heightErrorAfter: (x.ink && x.srcInkH > 0 && typeof x.ink.inkHeight === "number") ? Math.round((x.ink.inkHeight - x.srcInkH) * 100) / 100 : null }; });
      if (withCal.length) window.__zyStage9CalibrationEvidence = (window.__zyStage9CalibrationEvidence || []).concat(withCal);
    } catch (eCalEv) {}
    pending.forEach(function (p) { if (!p.done) { p.done = true; if (p.compare && p.compare.geometry.pass && !p.compare.typography.wrapDetected) { ZY_NOTES.push({ blockIndex: p.blockIndex, status: p.compare.status, failures: (p.compare.failures || []).join("|"), category: CATEGORY(p) }); } else { ZY_REJECT.push({ blockIndex: p.blockIndex, code: "CALIBRATION_MODEL_FAILURE", category: CATEGORY(p), failures: p.compare ? (p.compare.failures || []).join("|") : "no-compare", status: p.compare ? p.compare.status : null }); } } });
    if (ZY_OK.length || ZY_REJECT.length || ZY_NOTES.length) {
      const summary = { ok: ZY_OK.length, rejected: ZY_REJECT.length, noted: ZY_NOTES.length, rejectedBlocks: ZY_REJECT.map(function (r) { return { blockIndex: r.blockIndex, code: r.code, category: r.category, failures: r.failures, status: r.status }; }), notes: ZY_NOTES };
      setStatus("几何校验完成：通过 " + ZY_OK.length + " 个，保留 " + ZY_NOTES.length + " 个（保留=创建成功，仅备注：" + ZY_NOTES.map(function (n) { return n.category; }).join("|") + "），拒绝 " + ZY_REJECT.length + " 个" + (ZY_REJECT.length ? "（" + ZY_REJECT.map(function (r) { return r.category; }).join("|") + "）" : "") + "（细节见控制台 zy-ocr GEOMETRY）");
      ocrLog("GEOMETRY", JSON.stringify(summary));
    }
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
      baseUrl: (panel.querySelector("#zy-base-url") ? panel.querySelector("#zy-base-url").value.trim() : "") || persisted.baseUrl,
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

  // Stage 10-D Commit F：手动套版双路分派 —— 画布有文字槽位 → templateApply（只 setText，冻结全部样式/身份，绝不新建）；
  // 无槽位 → legacy apply（空白画布重建，保留原创建路径）。多电话/多微信不合并（超出 → 未匹配上报）。
  // Stage 10-E Commit G-3：智能接口预设（仅 UI 快捷填充，config 存储 schema 不变）。
  const AI_PROVIDERS = {
    doubao: { label: "豆包（火山方舟）", baseUrl: "", defaultModel: "" },
    siliconflow: { label: "硅基流动（有免费模型）", baseUrl: "https://api.siliconflow.cn/v1", defaultModel: "Qwen/Qwen2.5-7B-Instruct" },
    deepseek: { label: "DeepSeek 官方", baseUrl: "https://api.deepseek.com/v1", defaultModel: "deepseek-chat" },
    custom: { label: "自定义", baseUrl: "", defaultModel: "" }
  };
  function providerKeyFor(config) {
    const bu = String((config && config.baseUrl) || "");
    if (bu.indexOf("api.siliconflow.cn") >= 0) return "siliconflow";
    if (bu.indexOf("api.deepseek.com") >= 0) return "deepseek";
    if (bu && bu !== String((AI_PROVIDERS.doubao.baseUrl || ""))) return "custom";
    return "doubao";
  }
  // 一键智能填充：单次 AI 调用拆正反+提字段（AI 失败/无 key 自动回退本地规则），完成后 both 套版。
  async function smartFill(rawText) {
    if (!String(rawText || "").trim()) { setStatus("请先粘贴客户文字。"); return; }
    const config = getConfig();
    setBusy(true);
    try {
      let plan = null;
      if (config.apiKey) {
        try {
          const aiJson = await aiSmartParse(rawText, config);
          const ruleSide = splitFrontBackText(rawText);
          plan = normalizeSmartPlan(aiJson, rawText, { front: ruleSide.front, back: ruleSide.back, fields: parseByRulesFromSides(ruleSide.front, ruleSide.back) });
        } catch (eAi) {
          const ruleSide = splitFrontBackText(rawText);
          plan = { front: ruleSide.front, back: ruleSide.back, fields: normalizeFields(parseByRulesFromSides(ruleSide.front, ruleSide.back)), notes: [] };
          setStatus("AI 识别失败，已用本地规则。\n" + String(eAi && eAi.message ? eAi.message : eAi));
        }
      } else {
        const ruleSide = splitFrontBackText(rawText);
        plan = { front: ruleSide.front, back: ruleSide.back, fields: normalizeFields(parseByRulesFromSides(ruleSide.front, ruleSide.back)), notes: [] };
      }
      state.frontText = (plan && plan.front) || "";
      state.backText = (plan && plan.back) || "";
      state.fields = normalizeFields((plan && plan.fields) || {});
      renderSideTextArea();
      renderFieldArea();
      await applyFieldsToPage(state.fields, "both");
      if (!config.apiKey) setStatus("已用本地规则一键填充（未配置 AI Key）：待正反面槽位更新…");
    } catch (e) {
      setStatus("一键智能填充失败：" + String(e && e.message ? e.message : e));
    } finally {
      setBusy(false);
    }
  }
  function smartFillFromPanel() {
    const panel = document.getElementById("zy-card-assistant");
    const rawText = panel ? panel.querySelector("#zy-raw").value.trim() : "";
    if (panel) {
      const persisted = getConfig();
      const config = {
        apiKey: panel.querySelector("#zy-api-key").value.trim() || persisted.apiKey,
        baseUrl: (panel.querySelector("#zy-base-url") ? panel.querySelector("#zy-base-url").value.trim() : "") || persisted.baseUrl,
        model: panel.querySelector("#zy-model").value.trim() || persisted.model
      };
      saveConfig(config);
    }
    smartFill(rawText);
  }
  // 单次 AI 调用：返回 {front, back, fields, notes}（smart-plan.buildSmartPrompt 定义 schema）。
  async function aiSmartParse(rawText, config) {
    return aiRequest({
      url: buildChatUrl(config.baseUrl),
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + config.apiKey },
      data: JSON.stringify({
        model: config.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSmartPrompt() },
          { role: "user", content: String(rawText || "") }
        ]
      }),
      timeout: 30000,
      operation: "smartFill"
    }).then((result) => {
      if (!result.ok) throwAiError(result);
      const content = result.body && result.body.choices && result.body.choices[0] && result.body.choices[0].message && result.body.choices[0].message.content;
      return parseJsonFromText(content || "{}");
    });
  }

  // Stage 10-G L 阶 Commit 07：图层文字复制三模式（current/both/template），全部来自 TemplateSnapshot（只读不触画布）
  function zySideTextBlock(sd, items) {
    if (!Array.isArray(items) || !items.length) return null;
    const lines = items.map((it) => String(it && it.text != null ? it.text : "")).filter(Boolean);
    if (!lines.length) return null;
    return (sd === "back" ? "【反面】" : "【正面】") + "\n" + lines.join("\n");
  }
  function zyBuildCopyText(mode, invAll, currentSide) {
    const frontItems = invAll && invAll.front && invAll.front.items;
    const backItems = invAll && invAll.back && invAll.back.items;
    if (mode === "current") {
      const side = (currentSide === "BACK") ? "back" : "front"; // 判定失败默认正面
      return zySideTextBlock(side, side === "back" ? backItems : frontItems);
    }
    if (mode === "template") {
      const lines = [];
      const pageId = invAll && invAll.page && invAll.page.pageId ? String(invAll.page.pageId) : null;
      if (pageId) lines.push("页面：" + pageId);
      ["front", "back"].forEach((sd) => {
        const items = sd === "back" ? backItems : frontItems;
        if (!Array.isArray(items) || !items.length) return;
        lines.push(sd === "back" ? "【反面】" : "【正面】");
        items.forEach((it, i) => {
          const id = it && it.slotId ? String(it.slotId) : (sd + "-" + (i + 1));
          const t = String(it && it.text != null ? it.text : "").replace(/"/g, "「");
          const fsV = it && typeof it.fontSize === "number" ? it.fontSize : "-";
          const x = it && typeof it.left === "number" ? Number(it.left.toFixed(1)) : "-";
          const y = it && typeof it.top === "number" ? Number(it.top.toFixed(1)) : "-";
          const w = it && typeof it.width === "number" ? Number(it.width.toFixed(1)) : "-";
          const h = it && typeof it.height === "number" ? Number(it.height.toFixed(1)) : "-";
          const fill = it && it.fill != null ? String(it.fill) : "-";
          lines.push("[" + id + "] \"" + t + "\" 字号=" + fsV + " 位置=(" + x + "," + y + ") 尺寸=" + w + "x" + h + " 颜色=" + fill);
        });
      });
      return lines.join("\n");
    }
    const parts = [];
    const f = zySideTextBlock("front", frontItems);
    const b = zySideTextBlock("back", backItems);
    if (f) parts.push(f);
    if (b) parts.push(b);
    return parts.join("\n\n");
  }
  async function copyLayerTexts(mode) {
    setBusy(true);
    try {
      const invAll = await bridgeCall("getTextInventoryAll", 8000).catch(() => null);
      let currentSide = null;
      if (mode === "current") {
        const cp = await bridgeCall("getCurrentPage", 3000).catch(() => null);
        currentSide = cp && (cp.side === "BACK" ? "BACK" : cp.side === "FRONT" ? "FRONT" : null);
      }
      const text = zyBuildCopyText(mode, invAll, currentSide);
      if (!text) { setStatus("画布上暂无文字图层可复制。"); return; }
      let copied = false;
      try { if (typeof GM_setClipboard === "function") { GM_setClipboard(text); copied = true; } } catch (e1) { copied = false; }
      if (!copied) {
        try {
          await navigator.clipboard.writeText(text);
          copied = true;
        } catch (e2) {
          try {
            const tmp = document.createElement("textarea");
            tmp.value = text;
            tmp.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none;";
            (document.body || document.documentElement).appendChild(tmp);
            tmp.select();
            copied = document.execCommand("copy");
            tmp.remove();
          } catch (e3) { copied = false; }
        }
      }
      const label = mode === "current" ? "当前面" : mode === "template" ? "套版结构" : "正反面";
      const lineCount = text.split("\n").filter(Boolean).length;
      setStatus(copied ? "已复制" + label + " " + lineCount + " 行到剪贴板。" : "复制失败：浏览器阻止了剪贴板访问。");
    } catch (e) {
      setStatus("复制图层文字失败：" + String(e && e.message ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  // Stage 10-G Commit I-3：内容相似智能套版 —— 先读画布既有文字图层，把客户粘贴原文行按
  // 「内容相似」对应套入图层（planContentSimilar 纯模块），执行侧只 setText + fontSize 自适应；
  // 替换值=原文逐字（绝对禁止修改客户文字）；AI 仅做正反分类（可选取模型），不参与改写。
  function splitLinesByMarkers(lines) {
    const front = [], back = [];
    let side = "front";
    lines.forEach(function (ln) {
      const t = String(ln || "");
      if (/^正面[:：]?$/i.test(t)) { side = "front"; return; }
      if (/^(反面|背面)[:：]?$/i.test(t)) { side = "back"; return; }
      if (side === "back") back.push(t); else front.push(t);
    });
    return { front: front, back: back };
  }
  // AI 仅分类不改文本：返回行数组全集与原行逐字一致（仅分组），校验失败回退本地标记分类。
  async function aiClassifySides(rawText, config) {
    const data = await aiRequest({
      url: buildChatUrl(config.baseUrl),
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + config.apiKey },
      data: JSON.stringify({
        model: config.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "把客户名片资料按原文逐行分类为 front（正面）与 back（反面）两组 JSON 数组。绝对禁止修改、删除、改写、拼接、替换任何一行内容，只做分组。返回严格 JSON：{\"front\":[\"...\"],\"back\":[\"...\"]}" },
          { role: "user", content: String(rawText || "") }
        ]
      }),
      timeout: 30000,
      operation: "smartClassifySides"
    }).then((result) => {
      if (!result.ok) throwAiError(result);
      const content = result.body && result.body.choices && result.body.choices[0] && result.body.choices[0].message && result.body.choices[0].message.content;
      return parseJsonFromText(content || "{}");
    });
    const orig = String(rawText || "").split(/\r?\n/).map((x) => String(x)).filter((x) => String(x).trim() !== "");
    const f = Array.isArray(data && data.front) ? data.front.map((x) => String(x)) : [];
    const b = Array.isArray(data && data.back) ? data.back.map((x) => String(x)) : [];
    const all = f.concat(b);
    if (all.length !== orig.length) return null;
    const seen = {};
    for (let i = 0; i < orig.length; i += 1) seen[orig[i]] = (seen[orig[i]] || 0) + 1;
    for (let i = 0; i < all.length; i += 1) { if (!seen[all[i]]) return null; seen[all[i]] -= 1; }
    for (const k in seen) { if (seen[k]) return null; }
    return { front: f, back: b };
  }
  let smSmartTimeout = null; // Stage 10-G Commit J-1: 智能套版 postMessage 后回包超时兜底（8s 无回执 → 提示刷新/重装）
  async function applyContentSimilar(rawText) {
    if (!String(rawText || "").trim()) { setStatus("请先粘贴客户文字。"); return; }
    setBusy(true);
    try {
      const raw = String(rawText || "");
      const lines = raw.split(/\r?\n/).map((x) => String(x)).filter((x) => String(x).trim() !== "");
      const config = getConfig();
      let sides = null;
      if (config.apiKey) { try { sides = await aiClassifySides(raw, config); } catch (_e) { sides = null; } }
      if (!sides) sides = splitLinesByMarkers(lines);
      const invAll = await bridgeCall("getTextInventoryAll", 2500).catch(() => null);
      const plans = {};
      ["front", "back"].forEach(function (sd) {
        const inv = invAll && invAll[sd];
        const slots = (inv && Array.isArray(inv.items)) ? inv.items : [];
        const rows = sides[sd] || [];
        if (!rows.length || !slots.length) { plans[sd] = null; return; }
        plans[sd] = planContentSimilar({ slots: slots, rows: rows, side: sd });
      });
      window.postMessage({ source: BRIDGE_SOURCE, type: "templateApplySmart", plans: plans, side: "both" }, location.origin);
      if (smSmartTimeout) clearTimeout(smSmartTimeout);
      smSmartTimeout = setTimeout(function () {
        smSmartTimeout = null;
        setStatus("智能套版未见画布回执…若一直无响应：请刷新页面后重试；仍不行需重新安装本脚本（升级后桥接版本须与脚本一致）。");
      }, 8000);
      setStatus(config.apiKey ? "智能套版进行中（AI 已分类正反，仅分组不改文本）…" : "智能套版进行中（本地标记分类正反）…");
    } catch (e) {
      setStatus("智能套版失败：" + String(e && e.message ? e.message : e));
    } finally {
      setBusy(false);
    }
  }
  // Stage 10-G L 阶 Commit 03：AI 槽位匹配（preview，绝不改画布）
  // 读取 TemplateSnapshot → 全量提交识别接口（模板全部槽 + 客户原文）→ AI 返回 slotId→customerText 映射
  // → zyExtractPlanJson/zyNormalizePlanShape → zyValidateTemplateMatchPlan 本地硬校验（slotId 真实/唯一/逐字/不串面/低置信拒）
  // → 只展示匹配摘要与预览；执行（只 setText）交给 Commit 06 确认路径。旧 applyContentSimilar 保留。
  // Stage 10-G L 阶 Commit 06：确认填充前冻结的可执行计划（lastAiMatch；确认填充按钮消费）
  let lastAiMatch = null;
  function refreshMatchBlock() {
    const block = document.getElementById("zy-match-block");
    const summaryEl = document.getElementById("zy-match-summary");
    const rowsEl = document.getElementById("zy-match-rows");
    if (!block || !summaryEl || !rowsEl) return;
    if (!lastAiMatch) { block.style.display = "none"; return; }
    block.style.display = "block";
    const ref = lastAiMatch.ref || {};
    const f = lastAiMatch.sideCounts ? lastAiMatch.sideCounts.front : 0;
    const b = lastAiMatch.sideCounts ? lastAiMatch.sideCounts.back : 0;
    const fM = (ref.matches || []).filter(function (m) { return m.side === "front"; }).length;
    const bM = (ref.matches || []).filter(function (m) { return m.side === "back"; }).length;
    const sm = ref.summary || {};
    summaryEl.textContent = "匹配结果（预览，未修改画布）：正面 " + fM + "/" + f + (b > 0 ? " / 反面 " + bM + "/" + b : "") + "｜未匹配 " + (sm.unmatched != null ? sm.unmatched : 0) + " ｜不确定 " + (sm.uncertain != null ? sm.uncertain : 0);
    rowsEl.innerHTML = (ref.matches || []).slice(0, 12).map(function (m) { return "<div class=\"zy-note\">" + escapeHtml((m.side === "back" ? "[反] " : "") + m.slotId + " ← " + String(m.customerText).slice(0, 24)) + "</div>"; }).join("");
  }
  async function confirmTemplateApply() {
    if (!lastAiMatch) { setStatus("没有可确认的 AI 匹配结果，请先「一键智能填充」。"); return; }
    if (!lastAiMatch.ok || !lastAiMatch.commands || !lastAiMatch.commands.length) { setStatus("AI 匹配计划无效，无法填充。请重新「一键智能填充」。"); return; }
    setBusy(true);
    try {
      const r = await bridgeCall("templateApplyV2", 25000, { commands: lastAiMatch.commands, pageId: lastAiMatch.pageId, slotsCount: lastAiMatch.sideCounts || {}, planHash: lastAiMatch.planHash });
      if (r && r.ok) {
        setStatus("AI 填充完成：更新 " + (r.applied || []).length + " 槽（几何/字体/样式/身份/层序冻结，只改文字）。");
        lastAiMatch = null; refreshMatchBlock();
      } else {
        const errCode = (r && r.code) || "NO_REPLY";
        setStatus("AI 填充被拦截（" + errCode + "）：快照已变化或画面不一致，请重新「一键智能填充」后再确认。");
      }
    } catch (e) {
      setStatus("AI 填充执行失败：" + String(e && e.message ? e.message : e) + "（未修改画布）。");
    } finally {
      setBusy(false);
    }
  }
  function cancelTemplateApply() {
    lastAiMatch = null;
    refreshMatchBlock();
    setStatus("已取消 AI 填充预览。");
  }

  // Stage 10-G Commit 08：本地规则匹配库回退 —— AI 无 key / 失败时用 zyBuildLocalRuleMatch（类型规则+文本证据）
  // 生成可确认预览（不静默回退：状态明示「已改用本地规则」；仅当规则库也有匹配才固化计划）
  async function runLocalRulePreview(rawText, why) {
    setBusy(true);
    try {
      const invAll = await bridgeCall("getTextInventoryAll", 2500).catch(function () { return null; });
      const snapshot = { front: (invAll && invAll.front) || null, back: (invAll && invAll.back) || null };
      const frontItems = snapshot.front && Array.isArray(snapshot.front.items) ? snapshot.front.items : [];
      const backItems = snapshot.back && Array.isArray(snapshot.back.items) ? snapshot.back.items : [];
      if (!frontItems.length && !backItems.length) { setStatus("已读取：正面 0 / 反面 0（画布无文字图层），无需匹配。"); return; }
      const sides = splitLinesByMarkers(String(rawText || "").split(/\r?\n/));
      const localMatches = [];
      ["front", "back"].forEach(function (sd) {
        const items = sd === "front" ? frontItems : backItems;
        const rows = (sides[sd] || []).map(function (r) { return String(r); });
        if (!items.length || !rows.length) return;
        const lr = zyBuildLocalRuleMatch({ slotData: { side: sd, items: items }, rows: rows });
        (lr.matches || []).forEach(function (m) { localMatches.push(m); });
      });
      if (!localMatches.length) { setStatus("AI 槽位匹配不可用（" + why + "），本地规则也未找到匹配：未自动修改模板。"); return; }
      const cmdPlan = zyBuildApplyCommandPlan({ snapshot: snapshot, matches: localMatches });
      const snapHash = (invAll && invAll.snapshotHash) || null;
      const v2PageId = (invAll && invAll.page && invAll.page.pageId) || null;
      if (cmdPlan.ok && cmdPlan.commands.length && snapHash && v2PageId) {
        lastAiMatch = { ok: true, commands: cmdPlan.commands.slice(), planHash: snapHash, pageId: v2PageId, sideCounts: { front: frontItems.length, back: backItems.length }, total: frontItems.length + backItems.length, ref: { matches: localMatches, summary: { matched: localMatches.length, uncertain: 0, unmatched: 0 } }, localRule: true, ts: Date.now() };
        const lines = [
          "AI 槽位匹配不可用（" + why + "），已改用本地规则库匹配（预览，未修改画布）：",
          "本地规则匹配 " + localMatches.length + "/" + (frontItems.length + backItems.length) + " 槽；确认后仅改文字冻结其余。"
        ];
        localMatches.slice(0, 6).forEach(function (m) { lines.push((m.side === "back" ? "[反] " : "") + m.slotId + " ← " + String(m.customerText).slice(0, 30)); });
        setStatus(lines.join("\n"));
      } else {
        setStatus("AI 槽位匹配不可用（" + why + "），本地规则计划无效：未自动修改模板。");
      }
      refreshMatchBlock();
    } catch (e2) {
      setStatus("本地规则匹配失败：" + String(e2 && e2.message ? e2.message : e2) + "（未自动修改模板）");
    } finally {
      setBusy(false);
    }
  }
  async function aiTemplateSlotMatch(rawText) {
    if (!String(rawText || "").trim()) { setStatus("请先粘贴客户文字。"); return; }
    const config = getConfig();
    if (!config.apiKey) { runLocalRulePreview(rawText, "no-key"); return; }
    setBusy(true);
    try {
      setStatus("正在读取正反面图层…");
      const invAll = await bridgeCall("getTextInventoryAll", 2500).catch(() => null);
      const snapshot = { front: (invAll && invAll.front) || null, back: (invAll && invAll.back) || null };
      const frontItems = snapshot.front && Array.isArray(snapshot.front.items) ? snapshot.front.items : [];
      const backItems = snapshot.back && Array.isArray(snapshot.back.items) ? snapshot.back.items : [];
      const total = frontItems.length + backItems.length;
      if (!total) { setStatus("已读取：正面 0 / 反面 0（画布无文字图层），无需匹配。"); return; }
      setStatus("已读取：正面 " + frontItems.length + " 个文字层 / 反面 " + backItems.length + " 个 → AI 匹配中…");
      const result = await aiRequest({
        url: buildChatUrl(config.baseUrl),
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + config.apiKey },
        data: JSON.stringify({
          model: config.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: zyBuildTemplateMatchMessages({ front: snapshot.front, back: snapshot.back, customerRawText: String(rawText || "") })
        }),
        timeout: 45000,
        operation: "aiSlotMatch"
      });
      if (!result.ok) throwAiError(result);
      const content = result.body && result.body.choices && result.body.choices[0] && result.body.choices[0].message && result.body.choices[0].message.content;
      const ext = zyExtractPlanJson(content || "");
      if (!ext || !ext.ok) throw new Error(ext && ext.error ? ext.error : "AI 未返回有效 JSON");
      const norm = zyNormalizePlanShape(ext.plan);
      const ref = zyValidateTemplateMatchPlan({ plan: norm, snapshot: snapshot, rawText: rawText, minConfidence: 0.5 });
      const lines = [
        "AI 槽位匹配完成（预览，未修改画布）：",
        "匹配 " + ref.matches.length + "/" + total + " 槽" + (ref.summary.uncertain ? "；不确定 " + ref.summary.uncertain + " 项" : "") + "；未匹配 " + ref.summary.unmatched + " 项"
      ];
      ref.matches.slice(0, 6).forEach(function (m) { lines.push((m.side === "back" ? "[反] " : "") + m.slotId + " ← " + String(m.customerText).slice(0, 30)); });
      ref.uncertain.slice(0, 3).forEach(function (u) { lines.push("不确定 " + u.slotId + ": " + String((u.candidates || []).join("/")).slice(0, 24)); });
      ref.unmatchedCustomer.slice(0, 3).forEach(function (u) { lines.push("未匹配: " + String(u.text).slice(0, 24)); });
      if (ref.errors.length) lines.push("校验拦截 " + ref.errors.length + " 项（不执行）");
      setStatus(lines.join("\n"));
      // Commit 06：把匹配结果固化为可确认执行计划（planHash=读取时快照 hash，执行前由 bridge 二次比对）
      const cmdPlan = zyBuildApplyCommandPlan({ snapshot: snapshot, matches: ref.matches });
      const snapHash06 = (invAll && invAll.snapshotHash) || null;
      const v2PageId06 = (invAll && invAll.page && invAll.page.pageId) || null;
      if (cmdPlan.ok && cmdPlan.commands.length && snapHash06 && v2PageId06) {
        lastAiMatch = { ok: true, commands: cmdPlan.commands.slice(), planHash: snapHash06, pageId: v2PageId06, sideCounts: { front: frontItems.length, back: backItems.length }, total: total, ref: ref, ts: Date.now() };
      } else {
        lastAiMatch = null;
      }
      refreshMatchBlock();
    } catch (e) {
      try { runLocalRulePreview(rawText, "ai-fail-" + String(e && e.message ? e.message : e).slice(0, 40)); } catch (e2) { setStatus("AI 槽位匹配失败且本地规则回退异常：" + String(e2 && e2.message ? e2.message : e2) + "（未自动修改模板）"); }
    } finally {
      setBusy(false);
    }
  }
  function contentApplyFromPanel() {
    const panel = document.getElementById("zy-card-assistant");
    const rawText = panel ? panel.querySelector("#zy-raw").value : "";
    if (panel) {
      const persisted = getConfig();
      const config = {
        apiKey: panel.querySelector("#zy-api-key").value.trim() || persisted.apiKey,
        baseUrl: (panel.querySelector("#zy-base-url") ? panel.querySelector("#zy-base-url").value.trim() : "") || persisted.baseUrl,
        model: panel.querySelector("#zy-model").value.trim() || persisted.model
      };
      saveConfig(config);
    }
    aiTemplateSlotMatch(rawText);
  }

  async function applyFieldsToPage(fields, side) {
    const targetSide = side || "front";
    lastApplySide = targetSide;
    const norm = normalizeFields(fields);
    if (targetSide === "both") {
      // Stage 10-E G-3：正反同填 —— 一次性取两侧文字快照，非空侧各 planTemplateApply → templateApply both；
      // 两侧都无可填槽位时回退 legacy apply(both)（page-bridge 既有双画布分支）。
      const invAll = await bridgeCall("getTextInventoryAll", 2500).catch(() => null);
      const hasAny = !!(invAll && ((invAll.front && invAll.front.items && invAll.front.items.length) || (invAll.back && invAll.back.items && invAll.back.items.length)));
      if (!hasAny) {
        window.postMessage({ source: BRIDGE_SOURCE, type: "apply", fields: norm, side: "both" }, location.origin);
        return;
      }
      const plans = {};
      ["front", "back"].forEach(function (sd) {
        const sideInv = invAll[sd];
        const slots = (sideInv && sideInv.items) || [];
        if (!slots.length) { plans[sd] = null; return; }
        plans[sd] = planTemplateApply({ slots: slots, fields: norm, side: sd, opts: { canvas: (sideInv && sideInv.canvas) || {} } });
      });
      window.postMessage({ source: BRIDGE_SOURCE, type: "templateApply", plans: plans, side: "both" }, location.origin);
      return;
    }
    let inv = null;
    try { inv = await bridgeCall("getTextInventory", 2500); } catch (_e) { inv = null; }
    const slots = (inv && inv.ok && Array.isArray(inv.items)) ? inv.items : [];
    if (!slots.length) {
      window.postMessage({ source: BRIDGE_SOURCE, type: "apply", fields: norm, side: targetSide }, location.origin);
      return;
    }
    const plan = planTemplateApply({ slots: slots, fields: norm, side: targetSide, opts: { canvas: (inv && inv.canvas) || {} } });
    window.postMessage({ source: BRIDGE_SOURCE, type: "templateApply", plan: plan, side: targetSide, pageId: (inv && inv.pageId) || null }, location.origin);
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
    if (event.data.type === "templateApplyResult") {
      if (event.data.ok) {
        setStatus(event.data.message || "模板套版完成。");
      } else if (event.data.code === "SLOT_STATE_CHANGED") {
        setStatus(event.data.message || "画布状态已变化，回退旧套版方式…");
        window.postMessage({ source: BRIDGE_SOURCE, type: "apply", fields: normalizeFields(state.fields), side: (event.data.side === "both" ? "both" : lastApplySide) }, location.origin);
      } else {
        setStatus(event.data.message || "模板套版失败。");
      }
      return;
    }
    if (event.data.type === "templateApplySmartResult") {
      if (smSmartTimeout) { clearTimeout(smSmartTimeout); smSmartTimeout = null; }
      setStatus(event.data.message || "智能套版完成。");
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
    // Stage 10-F Commit H：套版浮窗与文字识别合并为单窗口（用户指定「只保留图中 UI」）。
    // 默认不挂原生 OCR 抽屉，识别入口 = 浮窗内「识别图片文字」按钮；显式 GM zyShowTemplatePanel="2" 才回到旧 OCR-only（原生抽屉）。
    if (OCR_ONLY_MODE) {
      const nativeOkH = mountNativeOcrPanel();
      observeNativeRemount();
    }
    // P4+：凭据加密配置预载（README 不落明文；解密后缓存）
    loadBaiduConfig().catch((e) => ocrLog && ocrLog("ERROR", "credential load: " + String(e && e.message || e)));
    // 套版浮窗为唯一主 UI（图中形态）：一键智能填充 + 识别图片文字 + 复制图层文字
    renderPanel();
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
