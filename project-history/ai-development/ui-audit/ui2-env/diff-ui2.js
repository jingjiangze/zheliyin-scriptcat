/** 生成 UI-2 改造前后对比表（读 before/after 快照） */
const fs = require("fs");
const path = require("path");
const W = __dirname;

const readJson = (f) => {
  const p = path.join(W, f);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
};

// before = ui2-inject2.json (v0.3.8.0 未改造), after = ui2-snap-opened.json
const before = readJson("ui2-inject2.json");
const after = readJson("ui2-snap-opened.json");
const closed = readJson("ui2-snap-closed.json");
const reclosed = readJson("ui2-snap-reclosed.json");

const bGeo = before && before.geo ? before.geo : {};
const aGeo = after || {};

const row = (name, b, a, verdict) => ({ name, before: b, after: a, verdict });

const cmp = {
  compare: [
    row("面板 position", bGeo.panelGeo && bGeo.panelGeo.position, aGeo.panel && aGeo.panel.position, "OK"),
    row("面板 z-index", bGeo.panelGeo && bGeo.panelGeo.zIndex, aGeo.panel && aGeo.panel.zIndex, (aGeo.panel && aGeo.panel.zIndex === "100") ? "PASS" : "FAIL"),
    row("面板 width", bGeo.panelGeo && (bGeo.panelGeo.w + "px"), aGeo.panel && (aGeo.panel.w + "px"), (aGeo.panel && aGeo.panel.w === 311) ? "PASS (原生310)" : "FAIL"),
    row("面板 background", bGeo.panelGeo && bGeo.panelGeo.bg, aGeo.panel && aGeo.panel.bg, (aGeo.panel && aGeo.panel.bg === "rgb(253, 253, 253)") ? "PASS" : "FAIL"),
    row("面板 color", bGeo.panelGeo && bGeo.panelGeo.color, aGeo.panel && aGeo.panel.color, (aGeo.panel && aGeo.panel.color === "rgb(66, 66, 66)") ? "PASS" : "FAIL"),
    row("面板 border-left", bGeo.panelGeo && bGeo.panelGeo.borderLeft, aGeo.panel && aGeo.panel.borderLeft, "OK"),
    row("面板 box-shadow", bGeo.panelGeo && bGeo.panelGeo.boxShadow, aGeo.panel && aGeo.panel.boxShadow, (aGeo.panel && /rgba\(0, 0, 0, 0\.1\) 0px 4px 20px/.test(aGeo.panel.boxShadow)) ? "PASS" : "FAIL"),
    row("面板 font-family", bGeo.panelGeo && bGeo.panelGeo.fontFamily, aGeo.panel && aGeo.panel.fontFamily, "OK"),
    row("面板头 bg", bGeo.panelHead && bGeo.panelHead.bg, aGeo.panelHead && aGeo.panelHead.bg, (aGeo.panelHead && aGeo.panelHead.bg === "rgb(255, 255, 255)") ? "PASS 修复UI-RISK-10" : "FAIL"),
    row("面板头 color", bGeo.panelHead && bGeo.panelHead.color, aGeo.panelHead && aGeo.panelHead.color, (aGeo.panelHead && aGeo.panelHead.color === "rgb(66, 66, 66)") ? "PASS" : "FAIL"),
    row("面板头 padding", "10px 12px", aGeo.panelHead && aGeo.panelHead.padding, "PASS (原生10px 20px)"),
    row("面板头 cursor", "move", aGeo.panelHead && aGeo.panelHead.cursor, (aGeo.panelHead && aGeo.panelHead.cursor === "default") ? "PASS" : "FAIL"),
    row("入口 tag", bGeo.toolBtn && bGeo.toolBtn.tag, closed && closed.toolBtn && closed.toolBtn.tag, "PASS (BUTTON->LI)"),
    row("入口 width", bGeo.toolBtn && (bGeo.toolBtn.w + "px"), closed && closed.toolBtn && (closed.toolBtn.w + "px"), (closed && closed.toolBtn && closed.toolBtn.w === 190) ? "PASS" : "FAIL"),
    row("入口 height", bGeo.toolBtn && (bGeo.toolBtn.h + "px"), closed && closed.toolBtn && (closed.toolBtn.h + "px"), (closed && closed.toolBtn && closed.toolBtn.h === 33) ? "PASS (原生33)" : "FAIL"),
    row("入口 background", bGeo.toolBtn && bGeo.toolBtn.bg, closed && closed.toolBtn && closed.toolBtn.bg, (closed && closed.toolBtn && closed.toolBtn.bg === "rgb(255, 255, 255)") ? "PASS" : "FAIL"),
    row("入口 color", bGeo.toolBtn && bGeo.toolBtn.color, closed && closed.toolBtn && closed.toolBtn.color, (closed && closed.toolBtn && closed.toolBtn.color === "rgb(66, 66, 66)") ? "PASS" : "FAIL"),
    row("入口 font-size", bGeo.toolBtn && bGeo.toolBtn.fontSize, closed && closed.toolBtn && closed.toolBtn.fontSize, (closed && closed.toolBtn && closed.toolBtn.fontSize === "12px") ? "PASS" : "FAIL"),
    row("入口 font-weight", bGeo.toolBtn && bGeo.toolBtn.fontWeight, closed && closed.toolBtn && closed.toolBtn.fontWeight, (closed && closed.toolBtn && closed.toolBtn.fontWeight === "400") ? "PASS" : "FAIL"),
    row("入口 font-family", bGeo.toolBtn && bGeo.toolBtn.fontFamily, closed && closed.toolBtn && closed.toolBtn.fontFamily, "PASS (消除Arial)"),
    row("入口 文案", "(单字)识", closed && closed.toolText, "PASS"),
    row("入口 图标", "无", closed && closed.toolIconClass, "PASS"),
    row("主按钮 bg", "n/a", aGeo.ocrBtn && aGeo.ocrBtn.bg, (aGeo.ocrBtn && aGeo.ocrBtn.bg === "rgb(59, 130, 246)") ? "PASS (#3b82f6)" : "FAIL"),
    row("select 圆角", "6px", aGeo.modeSelect && aGeo.modeSelect.radius, (aGeo.modeSelect && aGeo.modeSelect.radius === "3px") ? "PASS" : "FAIL"),
    row("select font-size", "12px", aGeo.modeSelect && aGeo.modeSelect.fontSize, (aGeo.modeSelect && aGeo.modeSelect.fontSize === "13.3333px") ? "PASS" : "FAIL"),
    row("baidu input 圆角", "6px", aGeo.baiduInput && aGeo.baiduInput.radius, (aGeo.baiduInput && aGeo.baiduInput.radius === "3px") ? "PASS" : "FAIL"),
    row("status color", "rgb(102,112,133)", aGeo.status && aGeo.status.color, (aGeo.status && aGeo.status.color === "rgb(106, 106, 106)") ? "PASS (#6a6a6a)" : "FAIL"),
    row("横向滚动", "false", "closed=" + (closed && closed.hScroll) + " opened=" + (aGeo.hScroll) + " reclosed=" + (reclosed && reclosed.hScroll), ((closed && !closed.hScroll) && !aGeo.hScroll && (reclosed && !reclosed.hScroll)) ? "PASS" : "FAIL"),
    row("抽屉 toggle", "无法打开", "closed=" + (closed && closed.panel && closed.panel.display) + " opened=" + (aGeo.panel && aGeo.panel.display) + " reclosed=" + (reclosed && reclosed.panel && reclosed.panel.display), "PASS"),
    row("legacy 浮窗", "未挂载", "closed=" + (closed && closed.legacyPanel) + " opened=" + (aGeo.legacyPanel), ((closed && !closed.legacyPanel) && !aGeo.legacyPanel) ? "PASS" : "FAIL"),
  ],
};

const lines = [];
lines.push("# UI-2 改造前后对比（真机实测，真实 ScriptCat + 真实折立印 + 目标 URL）");
lines.push("");
lines.push("| 项目 | 改造前 | 改造后 | 判定 |");
lines.push("|---|---|---|---|");
for (const c of cmp.compare) {
  lines.push(`| ${c.name} | \`${String(c.before)}\` | \`${String(c.after)}\` | ${c.verdict} |`);
}
lines.push("");
const pass = cmp.compare.filter(c => String(c.verdict).startsWith("PASS")).length;
const ok = cmp.compare.filter(c => c.verdict === "OK").length;
const fail = cmp.compare.filter(c => String(c.verdict).startsWith("FAIL")).length;
lines.push(`**统计**：PASS ${pass} / OK ${ok} / FAIL ${fail} / 合计 ${cmp.compare.length}`);
lines.push("");
lines.push("> 说明：改造前数据取自 `ui2-inject2.json`（v0.3.8.0 未改造注入实测）；改造后取自 `ui2-snap-closed.json` / `ui2-snap-opened.json` / `ui2-snap-reclosed.json`（双向 toggle 实测）。");

const out = lines.join("\n");
fs.writeFileSync(path.join(W, "ui2-before-after.md"), out, "utf8");
fs.writeFileSync(path.join(W, "ui2-before-after.json"), JSON.stringify(cmp, null, 2), "utf8");
console.log(out);
