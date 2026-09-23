// =====================================================================
// 折立印名片套版助手 - Native Capability Gate（Stage 9 方案 Commit 2，Native-First 全局原则 §三/§七~§十）
// ---------------------------------------------------------------------
// 职责：纯数据/纯逻辑 —— 把五层证据（L1 UI / L2 Event / L3 Network / L4 Module-API / L5 Object State）
// 归一化成能力清单与结论（NATIVE_READY / NATIVE_PARTIAL / NATIVE_UNKNOWN / NATIVE_UNAVAILABLE）。
// 铁律（§二/§三）：NATIVE_UNKNOWN ≠ NATIVE_UNAVAILABLE —— 只有完成五层审计且有反证才能给 UNAVAILABLE。
// 本模块：禁止 DOM / 禁止 Fabric 运行时 / 禁止网络 / 禁止业务写操作；node 可单测。
// 页面世界只负责采集原始证据（模块名/请求样本/UI 条目/对象普查），交给本模块分类并收敛结论。
// =====================================================================
"use strict";

// §一 能力域（覆盖 Native-First 政策适用清单；每条只聚合证据类别，不声称「不存在」）
var AREAS = [
  { area: "text-create", kws: ["drawText", "addText", "createText", "newText", "InsertText", "insertText", "textbox", "新增", "添加文字"] },
  { area: "text-edit", kws: ["setText", "editText", "updateText", "textfield", "contenteditable", "textAlign", "编辑"] },
  { area: "ocr", kws: ["ocr", "recognize", "texttype", "baidu", "结构化", "识别"] },
  { area: "font", kws: ["font", "fontSize", "fontFamily", "fontId", "typeface", "字体"] },
  { area: "size", kws: ["dimension", "physicalWidth", "physicalHeight", "pageSize", "sizeSet", "毫米", "mm", "templateSize"] },
  { area: "position", kws: ["position", "moveTo", "setPosition", "moveObject", "location"] },
  { area: "scale", kws: ["scale", "zoom", "resize"] },
  { area: "rotate", kws: ["rotate", "rotation", "angle"] },
  { area: "side", kws: ["front", "back", "正面", "背面", "revers", "sideSwitch", "dual"] },
  { area: "page", kws: ["currentCanvas", "canvasNum", "pageId", "pageInfo", "switchPage", "canvasToProductObjArr", "totalCanvasArray"] },
  { area: "save", kws: ["save", "保存", "saveData", "persist"] },
  { area: "undo", kws: ["undo", "redo", "history", "Undo"] },
  { area: "copy-delete", kws: ["remove", "deleteObject", "cloneObj", "duplicate", "copyObj", "removeObject"] },
  { area: "layer", kws: ["layer", "layerNum", "zIndex", "图层"] },
  { area: "export", kws: ["export", "导出", "download", "toImage", "toCanvas", "saveImage"] },
  { area: "shortcut", kws: ["hotkey", "shortcut", "keydown", "Keymap", "快捷键", "keyboard"] },
  { area: "align", kws: ["align", "对齐", "centerAlign"] },
  { area: "material", kws: ["material", "素材", "asset"] },
  { area: "qrcode", kws: ["qrcode", "qrCode", "二维码", "barCode"] },
  { area: "color", kws: ["color", "fill", "palette", "调色", "colors"] },
  { area: "canvas-size", kws: ["canvasWidth", "canvasHeight", "setWidth", "setHeight", "canvasW", "canvasH"] },
  { area: "background", kws: ["background", "bgImage", "backgroundImage", "setBackground"] }
];

function hasKw(name, kws) {
  var s = String(name || "").toLowerCase();
  for (var i = 0; i < kws.length; i += 1) { if (s.indexOf(kws[i].toLowerCase()) >= 0) return kws[i]; }
  return null;
}

// §八 模块名匹配 → 每条返回 [{kw, matches:[moduleName,...]}]
function matchNames(names, kws) {
  var out = [];
  var arr = Array.isArray(names) ? names : [];
  kws.forEach(function (kw) {
    var matches = arr.filter(function (n) { return hasKw(n, [kw]); });
    if (matches.length) out.push({ kw: kw, matches: matches.slice(0, 40) });
  });
  return out;
}

// §八 模块名 → 能力域命中表（L4 证据）
function classifyModuleNames(names, areas) {
  var list = Array.isArray(areas) ? areas : AREAS;
  var arr = Array.isArray(names) ? names : [];
  return list.map(function (a) {
    var hits = [];
    arr.forEach(function (n) { if (hasKw(n, a.kws)) hits.push(n); });
    return { area: a.area, hits: hits.slice(0, 60), count: hits.length };
  });
}

// §七 网络证据收敛（只保留 metadata；禁止 cookie/token/AK/SK 值，调用方负责脱敏）
function networkSummary(entries) {
  var arr = Array.isArray(entries) ? entries : [];
  var byStatus = {};
  var kwHits = {};
  var payloadKeys = {};
  var responseKeys = {};
  arr.forEach(function (e) {
    var status = e.status != null ? String(e.status) : "";
    byStatus[status] = (byStatus[status] || 0) + 1;
    if (e.method && e.url) { var key = e.method + " " + e.url; kwHits[key] = (kwHits[key] || 0) + 1; }
    (e.payloadKeys || []).forEach(function (k) { payloadKeys[k] = (payloadKeys[k] || 0) + 1; });
    (e.responseKeys || []).forEach(function (k) { responseKeys[k] = (responseKeys[k] || 0) + 1; });
  });
  return {
    total: arr.length,
    byStatus: byStatus,
    urlMethodCount: Object.keys(kwHits).length,
    payloadKeyUnion: Object.keys(payloadKeys).sort(),
    responseKeyCount: Object.keys(responseKeys).length,
    topResponseKeys: Object.keys(responseKeys).sort(function (a, b) { return responseKeys[b] - responseKeys[a]; }).slice(0, 40)
  };
}

// §九 UI 证据收敛：条目 {tag,text,keyword} → 按 tag 与能力域聚合
function uiSummary(entries, areas) {
  var arr = Array.isArray(entries) ? entries : [];
  var list = Array.isArray(areas) ? areas : AREAS;
  var byTag = {};
  var areaHits = {};
  arr.forEach(function (e) {
    var tag = e.tag || "?";
    byTag[tag] = (byTag[tag] || 0) + 1;
    list.forEach(function (a) { if (hasKw((e.text || "") + " " + (e.block || ""), a.kws)) { areaHits[a.area] = (areaHits[a.area] || 0) + 1; } });
  });
  return { total: arr.length, byTag: byTag, areaHits: areaHits };
}

// §三/§十 能力域结论：证据层计数 {l1,l2,l3,l4,l5}
function verdictFor(area, ev) {
  var e = ev || {};
  var n = function (k) { return Number(e[k]) > 0 ? Number(e[k]) : 0; };
  var l1 = n("l1"), l2 = n("l2"), l3 = n("l3"), l4 = n("l4"), l5 = n("l5");
  var reason = [];
  if (l4 > 0) reason.push("L4-module=" + l4);
  if (l5 > 0) reason.push("L5-object=" + l5);
  if (l3 > 0) reason.push("L3-network=" + l3);
  if (l1 > 0) reason.push("L1-ui=" + l1);
  if (l2 > 0) reason.push("L2-event=" + l2);
  var status;
  if (l4 > 0 && l5 > 0) status = "NATIVE_READY";
  else if (l4 > 0 || l1 > 0 || l3 > 0) status = "NATIVE_PARTIAL";
  else if (l2 > 0) status = "NATIVE_UNKNOWN";
  else status = "NATIVE_UNKNOWN"; // 找不到 ≠ 不存在（§三）
  return { area: area, status: status, evidence: { l1: l1, l2: l2, l3: l3, l4: l4, l5: l5 }, reason: reason.join(" | ") || "no-evidence(UNKNOWN requires full 5-layer audit)" };
}

// ---- 汇总报告（纯函数）：把各层证据收敛成能力清单 + 整体 Gate ----
function buildCapabilityReport(collected) {
  var c = collected || {};
  var moduleNames = (c.moduleNames || []).slice(0, 2000);
  var moduleHits = classifyModuleNames(moduleNames);
  // L4：每个能力域命中数（模块名）；L5：对象普查里 textbox/i-text/text 计数；L3：网络路径命中数；L1：UI 命中数；L2：事件证据数
  var byArea = {};
  moduleHits.forEach(function (m) { byArea[m.area] = { l4: m.count }; });
  var objCounts = c.objectCountsByType || {};
  var textObjCount = (objCounts["textbox"] || 0) + (objCounts["i-text"] || 0) + (objCounts["text"] || 0);
  // 对象普查整体作为所有域的 L5 基础证据（有真实对象层 → 编辑类能力可用）；textbox 特别作为 text-create/edit 的 L5
  var uiHits = uiSummary(c.uiEntries || []).areaHits;
  var netHits = c.netPathHits || {}; // area -> count
  var eventHits = c.eventHits || {}; // area -> count
  var capabilities = AREAS.map(function (a) {
    var ev = {
      l1: uiHits[a.area] || 0,
      l2: eventHits[a.area] || 0,
      l3: netHits[a.area] || 0,
      l4: byArea[a.area] ? byArea[a.area].l4 : 0,
      l5: (a.area === "text-create" || a.area === "text-edit" || a.area === "position" || a.area === "rotate" || a.area === "scale") ? textObjCount : (c.pagesWithObjects || 0)
    };
    return verdictFor(a.area, ev);
  });
  var statusRank = { NATIVE_READY: 3, NATIVE_PARTIAL: 2, NATIVE_UNKNOWN: 1, NATIVE_UNAVAILABLE: 0 };
  var max = capabilities.reduce(function (m, x) { return Math.max(m, statusRank[x.status] || 0); }, 1);
  var gate = "NATIVE_UNKNOWN";
  if (max === 3) gate = "NATIVE_READY";
  else if (max === 2) gate = "NATIVE_PARTIAL";
  var ready = capabilities.filter(function (x) { return x.status === "NATIVE_READY"; }).length;
  var partial = capabilities.filter(function (x) { return x.status === "NATIVE_PARTIAL"; }).length;
  return {
    gate: gate,
    capabilities: capabilities,
    summary: { ready: ready, partial: partial, unknown: capabilities.length - ready - partial, areas: capabilities.length },
    moduleNamesCount: moduleNames.length,
    layerEvidence: {
      l1_ui: (c.uiEntries || []).length,
      l2_event: (c.eventEntries || 0),
      l3_network: (c.netEntries || 0),
      l4_modules: moduleNames.length,
      l5_objectTypes: objCounts, l5_textObjects: textObjCount, l5_pagesWithObjects: c.pagesWithObjects || 0
    }
  };
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  AREAS, matchNames, classifyModuleNames, networkSummary, uiSummary, verdictFor, buildCapabilityReport
};