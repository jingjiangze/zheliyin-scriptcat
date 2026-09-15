// ==UserScript==
// @name         折立印名片套版助手
// @namespace    https://github.com/jingjiangze/zheliyin-scriptcat
// @version      0.3.0.0
// @description  在 diy.zheliyin.com 设计器里识别客户名片资料，优先填入当前模板已有文字图层，缺少图层时再按原样式补充。
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
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/main/extension/src/fields/field-core.js
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/main/extension/src/core/config-core.js
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/main/extension/src/ai/ai-client.js
// @require      https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/main/extension/src/editor/page-bridge.js
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @connect      ark.cn-beijing.volces.com
// @connect      raw.githubusercontent.com
// @connect      github.com
// @connect      *
// @updateURL    https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/main/zheliyin-card-assistant.user.js
// @downloadURL  https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/main/zheliyin-card-assistant.user.js
// ==/UserScript==

(function () {
  "use strict";

  const VERSION = "0.3.0.0";
  const BRIDGE_SOURCE = "zy-card-assistant";
  const PAGE_SOURCE = "zy-card-assistant-page";
  // DEFAULT_BASE_URL / DEFAULT_MODEL 已迁移至 config-core（@require 加载，作用域共享，单一来源）
  const UPDATE_URL = "https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/main/zheliyin-card-assistant.user.js";
  const DOWNLOAD_URL = "https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/main/zheliyin-card-assistant.user.js";

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
    panel.querySelector("#zy-probe").addEventListener("click", probeCanvas);
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
    const node = document.getElementById("zy-status");
    if (node) node.textContent = state.logs.join("\n");
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
    if (document.getElementById("zy-card-assistant-page-bridge")) return;
    const script = document.createElement("script");
    script.id = "zy-card-assistant-page-bridge";
    script.textContent = "(" + pageBridge.toString() + ")();";
    (document.head || document.documentElement).appendChild(script);
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderPanel);
  } else {
    renderPanel();
  }

  // 测试/诊断出口（默认不启用）：URL 带 zydebug（hash 或 query）时暴露内部引用，便于无头/浏览器回归
  const zyDebugOn = (window.location && (window.location.hash || "") + "|" + (window.location.search || "")).indexOf("zydebug") >= 0;
  if (zyDebugOn) {
    window.__ZY_DEBUG__ = {
      state: state,
      getConfig: getConfig,
      saveConfig: saveConfig,
      parseFields: parseFields,
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