// ==UserScript==
// @name         折立印名片套版助手
// @namespace    https://github.com/jingjiangze/zheliyin-scriptcat
// @version      0.2.3.8
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

  const VERSION = "0.2.3.8";
  const BRIDGE_SOURCE = "zy-card-assistant";
  const PAGE_SOURCE = "zy-card-assistant-page";
  const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
  const DEFAULT_MODEL = "doubao-seed-2-0-mini-260428";
  const UPDATE_URL = "https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/main/zheliyin-card-assistant.user.js";
  const DOWNLOAD_URL = "https://raw.githubusercontent.com/jingjiangze/zheliyin-scriptcat/main/zheliyin-card-assistant.user.js";

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

  function emptyFields() {
    return {
      company_cn: "",
      company_en: "",
      name: "",
      title: "",
      phones: [],
      wechats: [],
      emails: [],
      websites: [],
      addresses: [],
      business: [],
      back_extra: []
    };
  }

  function getConfig() {
    return {
      apiKey: GM_getValue("zyArkApiKey", ""),
      baseUrl: GM_getValue("zyArkBaseUrl", DEFAULT_BASE_URL),
      model: GM_getValue("zyArkModel", DEFAULT_MODEL)
    };
  }

  function saveConfig(config) {
    GM_setValue("zyArkApiKey", config.apiKey || "");
    GM_setValue("zyArkBaseUrl", config.baseUrl || DEFAULT_BASE_URL);
    GM_setValue("zyArkModel", config.model || DEFAULT_MODEL);
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
    const config = {
      apiKey: panel.querySelector("#zy-api-key").value.trim(),
      baseUrl: DEFAULT_BASE_URL,
      model: panel.querySelector("#zy-model").value.trim() || DEFAULT_MODEL
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
    const front = [];
    const back = [];
    let side = "front";

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

      if (side === "front" && shouldSwitchToBack(line, front, back)) side = "back";
      if (side === "back") back.push(line);
      else front.push(line);
    });

    if (!back.length) {
      const fallbackBack = [];
      const fallbackFront = [];
      lines.forEach((line) => {
        if (shouldBelongToBack(line)) fallbackBack.push(line);
        else fallbackFront.push(line);
      });
      if (fallbackBack.length) {
        return { front: fallbackFront.join("\n"), back: fallbackBack.join("\n") };
      }
    }

    return { front: front.join("\n"), back: back.join("\n") };
  }

  function shouldSwitchToBack(line, front, back) {
    if (back.length) return false;
    if (front.length < 2) return false;
    return shouldBelongToBack(line);
  }

  function shouldBelongToBack(line) {
    const text = clean(line);
    if (!text) return false;
    if (isAddressLine(text)) return false;
    if (isBusinessLine(text) || isBackExtraLine(text) || isLongBackText(text)) return true;
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

    result.phones = unique(Array.from(text.matchAll(/(?:\+?86[-\s]?)?(1[3-9]\d{9})/g)).map((match) => match[1]));
    result.emails = unique(Array.from(text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)).map((match) => match[0]));

    const websiteMatches = Array.from(text.matchAll(/(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+\S*/gi));
    result.websites = unique(websiteMatches.map((match) => {
      const value = match[0].replace(/[，。,;；]+$/, "");
      return result.emails.some((email) => email.includes(value)) ? "" : value;
    }).filter(Boolean));

    result.wechats = unique(frontLines.filter((line) => /微信|wechat|wx/i.test(line)).map((line) => {
      return clean(line.replace(/^(微信|wechat|wx|微信号)[:：]?\s*/i, ""));
    }).filter(Boolean));

    const businessLines = [];
    const backExtraLines = [];
    const titleWords = /(销售经理|客户经理|业务经理|总经理|经理|主管|总监|工程师|负责人|业务员|销售|Sales Manager|Manager|Director|Engineer)/i;
    frontLines.forEach((line) => {
      if (!result.company_cn && /公司|集团|科技|贸易|实业|有限公司|厂/.test(line) && /[\u4e00-\u9fa5]/.test(line)) result.company_cn = line;
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
      if (!result.name && /^[\u4e00-\u9fa5]{2,4}$/.test(line) && !titleWords.test(line)) result.name = line;
      const nameTitle = line.match(/^([\u4e00-\u9fa5]{2,4})\s+(.+)$/);
      if (!result.name && nameTitle && titleWords.test(nameTitle[2])) {
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

  function stripLabel(value) {
    return clean(String(value || "").replace(/^(地址|电话|手机|微信|邮箱|网址|网站|Tel|Phone|Mobile|Email|Web)[:：]?\s*/i, ""));
  }

  function stripBusinessLabel(value) {
    return clean(String(value || "").replace(/^(主营业务|主营范围|经营范围|业务范围|主营|经营|产品|服务)[:：]?\s*/i, ""));
  }

  function stripBackExtraLabel(value) {
    return clean(String(value || "").replace(/^(反面内容|反面|补充说明|说明|备注|简介|口号|标语|优势|承诺)[:：]?\s*/i, ""));
  }

  function isAddressLine(value) {
    const text = clean(value);
    if (!text || text.length < 6) return false;
    if (isBusinessLine(text)) return false;
    return /地址|(?:[\u4e00-\u9fa5]{2,}(省|市|区|县|镇|街道|路|大道|大街|巷|弄|村|号|大厦|广场|楼|室|座|工业园|园区|写字楼))/.test(text);
  }

  function isBusinessLine(value) {
    const text = clean(value);
    if (!text) return false;
    if (/主营业务|主营范围|经营范围|业务范围|主营|生产|销售|批发|零售|加工|定制|维修|回收|研发|服务|产品/.test(text)) return true;
    if (/服务器|内存|DDR|芯片|电子元器件|五金|塑胶|模具|包装|印刷|服装|鞋帽|建材|进出口/.test(text)) return true;
    return false;
  }

  function isBackExtraLine(value) {
    const text = clean(value);
    if (!text) return false;
    if (/反面内容|补充说明|公司简介|简介|优势|承诺|宗旨|理念|口号|标语|二维码|扫码|关注|欢迎咨询|诚信|品质|专业/.test(text)) return true;
    return false;
  }

  function isLongBackText(value) {
    const text = clean(value);
    if (!text || text.length < 18) return false;
    if (isAddressLine(text)) return false;
    if (/(?:\+?86[-\s]?)?(1[3-9]\d{9})/.test(text)) return false;
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
      "back 放主营范围、公司简介、优势、承诺、二维码提示、宣传语等适合反面的内容。",
      "如果无法确定，联系方式和地址优先放 front；主营范围和成段说明优先放 back。",
      "不要虚构内容，不要改写原文，只做粗分配。",
      "",
      "本地规则粗分结果：",
      JSON.stringify(fallback, null, 2),
      "",
      "客户全文：",
      rawText
    ].join("\n");

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: config.baseUrl.replace(/\/+$/, "") + "/chat/completions",
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
        onload: (response) => {
          try {
            if (response.status < 200 || response.status >= 300) {
              reject(new Error("API HTTP " + response.status + ": " + response.responseText.slice(0, 220)));
              return;
            }
            const body = JSON.parse(response.responseText);
            const content = body && body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
            const parsed = parseJsonFromText(content || "{}");
            resolve({
              front: cleanMultiline(parsed.front || fallback.front || ""),
              back: cleanMultiline(parsed.back || fallback.back || "")
            });
          } catch (error) {
            reject(error);
          }
        },
        onerror: () => reject(new Error("API 请求失败")),
        ontimeout: () => reject(new Error("API 请求超时"))
      });
    });
  }

  function parseByDoubao(frontText, backText, ruleResult, config) {
    const prompt = [
      "你是名片资料字段识别助手。请根据已经粗分好的正面文本和反面文本提取字段，只输出严格 JSON，不要 Markdown。",
      "JSON 字段固定为：company_cn, company_en, name, title, phones, wechats, emails, websites, addresses, business, back_extra。",
      "phones, wechats, emails, websites, addresses, business, back_extra 都必须是字符串数组。没有的信息填空字符串或空数组。",
      "frontText 是正面内容来源，backText 是反面内容来源。",
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

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: config.baseUrl.replace(/\/+$/, "") + "/chat/completions",
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
        onload: (response) => {
          try {
            if (response.status < 200 || response.status >= 300) {
              reject(new Error("API HTTP " + response.status + ": " + response.responseText.slice(0, 220)));
              return;
            }
            const body = JSON.parse(response.responseText);
            const content = body && body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
            resolve(parseJsonFromText(content || "{}"));
          } catch (error) {
            reject(error);
          }
        },
        onerror: () => reject(new Error("API 请求失败")),
        ontimeout: () => reject(new Error("API 请求超时"))
      });
    });
  }

  function parseJsonFromText(text) {
    const raw = String(text || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    try {
      return JSON.parse(raw);
    } catch (_error) {
      const match = raw.match(/\{[\s\S]*\}/);
      return match ? JSON.parse(match[0]) : {};
    }
  }

  function normalizeFields(input) {
    const source = input || {};
    const out = emptyFields();
    ["company_cn", "company_en", "name", "title"].forEach((key) => {
      out[key] = clean(source[key]);
    });
    ["phones", "wechats", "emails", "websites", "addresses", "business", "back_extra"].forEach((key) => {
      out[key] = normalizeArrayField(source[key] || source[key.replace(/s$/, "")]);
    });
    out.business = out.business.filter((item) => {
      return item && item !== out.company_cn && item !== out.company_en && item !== out.name &&
        !out.phones.includes(item) && !out.websites.includes(item) && !out.addresses.includes(item);
    });
    out.back_extra = out.back_extra.filter((item) => {
      return item && item !== out.company_cn && item !== out.company_en && !out.addresses.includes(item) && !out.business.includes(item);
    });
    return out;
  }

  function normalizeArrayField(value) {
    if (Array.isArray(value)) return unique(value.map(stripLabel).filter(Boolean));
    return splitList(value);
  }

  function splitList(value) {
    return unique(String(value || "")
      .split(/\n|；|;/)
      .map(stripLabel)
      .filter(Boolean));
  }

  function mergeFields(ruleResult, aiResult, rawText) {
    const rule = normalizeFields(ruleResult || {});
    const ai = normalizeFields(aiResult || {});
    const raw = String(rawText || "");
    const out = normalizeFields(rule);
    ["company_cn", "company_en", "name", "title"].forEach((key) => {
      if (!ai[key]) return;
      if (!out[key] || (rawIncludes(raw, ai[key]) && !rawIncludes(raw, out[key]))) out[key] = ai[key];
    });
    ["phones", "wechats", "emails", "websites"].forEach((key) => {
      out[key] = unique([].concat(out[key] || [], (ai[key] || []).filter((item) => rawIncludes(raw, item))));
    });
    out.addresses = unique([].concat(out.addresses || [], (ai.addresses || []).filter((item) => rawIncludes(raw, item) && isAddressLine(item))));
    const business = [].concat(out.business || []);
    (ai.business || []).forEach((item) => {
      if (rawIncludes(raw, item) && isBusinessLine(item) && !isAddressLine(item)) business.push(stripBusinessLabel(item));
    });
    out.business = unique(business);
    const extra = [].concat(out.back_extra || []);
    (ai.back_extra || []).forEach((item) => {
      if (rawIncludes(raw, item) && isBackExtraLine(item) && !isAddressLine(item) && !isBusinessLine(item)) extra.push(stripBackExtraLabel(item));
    });
    out.back_extra = unique(extra);
    return normalizeFields(out);
  }

  function mergeTwoFields(base, extra) {
    const out = normalizeFields(base || {});
    const next = normalizeFields(extra || {});
    ["company_cn", "company_en", "name", "title"].forEach((key) => {
      if (next[key] && !out[key]) out[key] = next[key];
    });
    ["phones", "wechats", "emails", "websites", "addresses", "business", "back_extra"].forEach((key) => {
      out[key] = unique([].concat(out[key] || [], next[key] || []));
    });
    return normalizeFields(out);
  }

  function rawIncludes(raw, value) {
    const needle = clean(value).replace(/\s+/g, "");
    const haystack = String(raw || "").replace(/\s+/g, "");
    return needle && haystack.includes(needle);
  }

  function cleanMultiline(value) {
    return String(value || "").replace(/\r/g, "\n").split(/\n+/).map(clean).filter(Boolean).join("\n");
  }

  function applyFieldsToPage(fields, side) {
    window.postMessage({ source: BRIDGE_SOURCE, type: "apply", fields: normalizeFields(fields), side: side || "front" }, location.origin);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.source !== PAGE_SOURCE) return;
    if (event.data.type === "applyResult") {
      if (event.data.ok) {
        setStatus("已处理 " + event.data.applied.length + " 个文字图层。\n" + event.data.applied.join("\n"));
      } else {
        setStatus(event.data.message || "没有拿到画布对象。请先打开模板，等待加载完成后再试。");
      }
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

  function pageBridge() {
    const BRIDGE_SOURCE_IN_PAGE = "zy-card-assistant";
    const PAGE_SOURCE_IN_PAGE = "zy-card-assistant-page";
    window.addEventListener("message", function (event) {
      if (event.source !== window || !event.data || event.data.source !== BRIDGE_SOURCE_IN_PAGE) return;
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
    });

    function post(type, payload) {
      window.postMessage(Object.assign({ source: PAGE_SOURCE_IN_PAGE, type: type }, payload), location.origin);
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
        if (fields.business && fields.business.length) addItem(items, "business", "主营范围", "主营范围：" + fields.business.join("；"));
        (fields.back_extra || []).forEach(function (value) { addItem(items, "back_extra", "反面补充", value); });
        return items;
      }
      addItem(items, "company_cn", "中文公司", fields.company_cn);
      addItem(items, "company_en", "英文公司", fields.company_en);
      addItem(items, "name", "姓名", fields.name);
      addItem(items, "title", "职位", fields.title);
      (fields.phones || []).forEach(function (value) { addItem(items, "phone", "电话", line("电话", value)); });
      (fields.wechats || []).forEach(function (value) { addItem(items, "wechat", "微信", line("微信", value)); });
      (fields.emails || []).forEach(function (value) { addItem(items, "email", "邮箱", line("邮箱", value)); });
      (fields.websites || []).forEach(function (value) { addItem(items, "website", "网址", line("网址", value)); });
      (fields.addresses || []).forEach(function (value) { addItem(items, "address", "地址", line("地址", value)); });
      return items;
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
      return firstPlainUnused(objects, used);
    }

    function firstPlainUnused(objects, used) {
      for (let i = 0; i < objects.length; i += 1) {
        if (used.indexOf(objects[i]) < 0) return objects[i];
      }
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
      if (!fabric) return null;
      const style = getReferenceStyle(reference);
      const Klass = fabric.Textbox || fabric.IText || fabric.Text;
      if (!Klass) return null;
      const obj = new Klass(text, {
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
      obj.zyCreatedByAssistant = true;
      canvas.add(obj);
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
      const options = {
        left: reference ? style.left : layout.left,
        top: reference ? Math.min(style.top + step, (layout && layout.height ? layout.height - step : style.top + step)) : layout.top + index * step,
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
      if (!reference) options.top = 32 + index * step;
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
  }

  function formatFields(fields) {
    const data = normalizeFields(fields);
    return Object.keys(FIELD_LABELS).map((key) => {
      const value = Array.isArray(data[key]) ? data[key].join("；") : (data[key] || "");
      return FIELD_LABELS[key] + "：" + value;
    }).join("\n");
  }

  function clean(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").replace(/^[：:，,；;\-\s]+|[：:，,；;\-\s]+$/g, "").trim();
  }

  function unique(items) {
    const seen = {};
    return (items || []).map(clean).filter((item) => {
      const key = item.toLowerCase();
      if (!item || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

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
          setStatus("发现脚本新版 " + latest + "，当前 " + VERSION + "。\n将打开新版安装地址。");
          if (confirm("发现脚本新版 " + latest + "，当前版本 " + VERSION + "。是否立即打开更新地址？")) {
            window.open(DOWNLOAD_URL + "?t=" + Date.now(), "_blank");
          }
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

  console.info("折立印名片套版助手已加载", VERSION);
})();
