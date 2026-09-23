// extension/src/editor/diy-font-registry.js — Stage 10-D Commit A：DIY 字体目录解析/检索纯模块
// ---------------------------------------------------------------------
// 数据源：diy.zheliyin.com/diyWeb/diy/findAllFont.do（真实 287 字体，已由 runtime/stage-7-3-font-inventory.js 取证）。
//   entry 形状：{ id, fontname, searchword, fontclassify, fontpath, fontpathwoff, defaultimage }
//   min 目录形状：{ id, fontname, fontclassify, defaultimage }
// 职责（纯函数，node 可测；页面 world 以 toString 内联镜像惯例）：
//   buildRegistry(all)  —— 建全量/最小索引（byId / byName exact / byNameLoose / token 检索）
//   resolve(fontName)   —— 按 名称精确→去括号宽松→token 检索 解析出 {source,score,id,entry}
//   toMinDict()         —— 去除文件字段的目录压缩
// 本模块不访问 DOM，不触发网络；缺 id/name 的条目跳过。
"use strict";

function normName(s) {
  return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").trim();
}
function stripParen(s) {
  return String(s == null ? "" : s).replace(/[（(][^（）()]*[）)]/g, " ").replace(/\s+/g, " ").trim();
}
function bracketNorm(s) {
  // 括号与体名同侧归一：()（）-> 空格的"松散名"；'思源黑体（Regular）' 与 '思源黑体 Regular' 归一一致
  return normName(String(s == null ? "" : s).replace(/[（(]/g, " ").replace(/[）)]/g, " "));
}
function tokenize(s) {
  return String(s == null ? "" : s).toLowerCase().split(/[\s\-·,，、/]+/).filter(Boolean);
}

function buildRegistry(all) {
  var list = Array.isArray(all) ? all : [];
  var byId = new Map();
  var byName = new Map();
  var byNameLoose = new Map();
  list.forEach(function (e) {
    if (!e || e.id == null) return;
    var id = String(e.id);
    var name = String(e.fontname || e.searchword || "").trim();
    if (!name) return;
    var rec = {
      id: id,
      fontname: name,
      searchword: String(e.searchword || ""),
      fontclassify: String(e.fontclassify || ""),
      fontpath: e.fontpath != null ? String(e.fontpath) : null,
      fontpathwoff: e.fontpathwoff != null ? String(e.fontpathwoff) : null,
      defaultimage: e.defaultimage != null ? String(e.defaultimage) : null
    };
    byId.set(id, rec);
    byName.set(normName(name), rec);
    byNameLoose.set(bracketNorm(name), rec);
  });

  function byId_(id) {
    if (id == null) return null;
    return byId.get(String(id)) || null;
  }
  function byName_(n) {
    if (n == null) return null;
    return byName.get(normName(n)) || null;
  }
  // 检索：精确名 → 去括号名 → 字符重叠（同族/字重变体，≥0.6 才认）
  function charOverlap(a, b) {
    var sa = String(a == null ? "" : a).replace(/\s+/g, "").toLowerCase();
    var sb = String(b == null ? "" : b).replace(/\s+/g, "").toLowerCase();
    if (!sa || !sb) return 0;
    var set = {};
    for (var i = 0; i < sa.length; i += 1) set[sa[i]] = 1;
    var common = 0;
    for (var j = 0; j < sb.length; j += 1) if (set[sb[j]]) common += 1;
    return common / Math.max(sa.length, sb.length, 1);
  }
  function resolve(fontName) {
    if (fontName == null || !String(fontName).trim()) return { source: null, score: 0, id: null, entry: null };
    var n = normName(fontName);
    if (byName.has(n)) { var e0 = byName.get(n); return { source: "name", score: 1, id: e0.id, entry: e0 }; }
    var nl = bracketNorm(fontName);
    if (byNameLoose.has(nl)) { var e1 = byNameLoose.get(nl); return { source: "name", score: 0.92, id: e1.id, entry: e1 }; }
    var best = null, bestScore = 0;
    byName.forEach(function (rec, key) {
      var score = charOverlap(fontName, rec.fontname);
      if (score > bestScore) { bestScore = score; best = rec; }
    });
    if (best && bestScore >= 0.6) return { source: "word", score: Math.round(bestScore * 1000) / 1000, id: best.id, entry: best };
    return { source: null, score: 0, id: null, entry: null };
  }
  function toMinDict() {
    var out = [];
    list.forEach(function (e) {
      if (e == null || e.id == null) return;
      out.push({ id: String(e.id), fontname: String(e.fontname || ""), fontclassify: String(e.fontclassify || ""), defaultimage: e.defaultimage != null ? String(e.defaultimage) : null });
    });
    return out;
  }
  return { byId: byId_, byName: byName_, resolve: resolve, toMinDict: toMinDict, size: list.length };
}

if (typeof module !== "undefined" && module.exports) module.exports= { buildRegistry: buildRegistry, normName: normName, stripParen: stripParen, tokenize: tokenize };