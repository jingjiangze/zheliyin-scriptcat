// runtime/editor-object-diff.js — Stage 5.0 §三十五：Object Diff（纯函数，node/浏览器双形态）
// 用途：OCR 自动重建前的对象变更审计；before/after 白名单字段对比输出 changedFields。
// 字段白名单来源：Stage 5.0 真实对象审计（reports/stage5-object-snapshot.json）+ refresh persistence 实测。
// 本模块无 DOM 依赖，测试可注入任意快照（tests/editor-object-model/）。
"use strict";

// 白名单字段（真实对象上已验证存在；非全部 141 自有属性，避免 Fabric runtime 噪音）
const FIELDS = {
  identity: ["markuuid", "uuid", "type", "subType"],
  geometry: ["left", "top", "width", "height", "scaleX", "scaleY", "angle", "skewX", "skewY", "originX", "originY"],
  transform: ["visible", "opacity", "flipX", "flipY"],
  interaction: ["selectable", "evented"],
  style: ["fill", "stroke", "strokeWidth", "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "charSpacing", "textAlign"],
  content: ["text"],
  editor: ["layerNum", "locationX", "locationY", "locationWidth", "locationHeight", "locationRotation"]
};

const NUM_EPS = 1e-9;
// 类型安全比较（§六.4）：类型不同 → 直接判 changed（防 1 === "1"、true === "true"）；
// 数字字段用 epsilon；字符串/布尔严格相等；同基对象深比较（白名单值均为可序列化标量）。
function same(a, b) {
  if (a == null || b == null) return a === b;
  const ta = typeof a;
  const tb = typeof b;
  if (ta !== tb) return false;
  switch (ta) {
    case "number": return Math.abs(a - b) < NUM_EPS;
    case "string":
    case "boolean": return a === b;
    case "object": return JSON.stringify(a) === JSON.stringify(b);
    default: return a === b;
  }
}

// 从 raw object 抽取白名单快照（浅层）
function snapshot(raw) {
  const out = {};
  Object.keys(FIELDS).forEach((group) => {
    FIELDS[group].forEach((key) => { if (raw[key] !== undefined) out[key] = raw[key]; });
  });
  return out;
}

// diff：返回 { changedFields, stableFields, before, after }
function diff(before, after) {
  const keys = [];
  Object.keys(FIELDS).forEach((group) => keys.push.apply(keys, FIELDS[group]));
  const changed = [];
  const stable = [];
  keys.forEach((key) => {
    if (same(before[key], after[key])) stable.push(key);
    else changed.push(key);
  });
  return { changedFields: changed, stableFields: stable, before: before, after: after };
}

// 分类查看：按组统计变更
function changesByGroup(before, after) {
  const res = diff(before, after);
  const groups = {};
  Object.keys(FIELDS).forEach((group) => {
    const g = res.changedFields.filter((k) => FIELDS[group].includes(k));
    if (g.length) groups[group] = g;
  });
  return groups;
}

if (typeof module !== "undefined" && module.exports) module.exports = { FIELDS, snapshot, diff, changesByGroup };
if (typeof window !== "undefined") window.zEditorObjectDiff = { FIELDS, snapshot, diff, changesByGroup };